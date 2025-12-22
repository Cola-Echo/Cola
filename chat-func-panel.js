/**
 * 聊天页功能面板 + 展开输入（语音/多条消息/混合消息）
 */

import { calculateVoiceDuration, escapeHtml, sleep } from './utils.js';
import { showToast } from './toast.js';
import { sendMessage, sendPhotoMessage, sendBatchMessages, appendMusicCardMessage, currentChatIndex, appendMessage, showTypingIndicator, hideTypingIndicator, parseAiQuoteMessage, detectAiCallRequest } from './chat.js';
import { isInGroupChat, sendGroupMessage, sendGroupPhotoMessage, sendGroupBatchMessages, getCurrentGroupIndex, appendGroupMessage, showGroupTypingIndicator, hideGroupTypingIndicator, callGroupAI, enforceGroupChatMemberLimit, appendGroupMusicCardMessage } from './group-chat.js';
import { startVoiceCall } from './voice-call.js';
import { startVideoCall } from './video-call.js';
import { showMusicPanel, initMusicEvents } from './music.js';
import { showRedPacketPage } from './red-packet.js';
import { showTransferPage } from './transfer.js';
import { getSettings, splitAIMessages } from './config.js';
import { refreshChatList } from './ui.js';
import { requestSave } from './save-manager.js';
import { callAI } from './ai.js';
import { showListenSearchPage, initListenTogether } from './listen-together.js';

let expandMode = null; // 'voice' | 'multi' | null
// 混合消息项: { type: 'text' | 'voice' | 'sticker' | 'photo', content: string }
let expandMsgItems = [{ type: 'text', content: '' }];
let funcPanelPage = 0;
let funcPanelInited = false;

// 临时存储待插入的表情URL
let pendingStickerIndex = -1;

let musicShareListenerInited = false;

function safeText(value) {
  return value == null ? '' : String(value).trim();
}

function clipText(text, maxChars) {
  const raw = safeText(text);
  if (!raw) return '';
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars - 1) + '…';
}

function clipLyrics(lyrics) {
  const raw = safeText(lyrics);
  if (!raw) return '';
  // 移除时间标签，只保留歌词文本
  const lines = raw.split(/\r?\n/)
    .map(line => line.replace(/^\[\d{2}:\d{2}[.\d]*\]/g, '').trim())
    .filter(line => line);
  const limitedLines = lines.slice(0, 30).join('\n');
  return clipText(limitedLines, 800);
}

function formatMusicShareMessage(song) {
  const name = safeText(song?.name) || '未知歌曲';
  const artist = safeText(song?.artist);
  const lyrics = clipLyrics(song?.lyrics);

  let message = `[分享音乐] ${name}`;
  if (artist) message += ` - ${artist}`;
  if (lyrics) message += `\n\n${lyrics}`;

  return message;
}

function initMusicShareListener() {
  if (musicShareListenerInited) return;
  musicShareListenerInited = true;

  document.addEventListener('music-share', async (e) => {
    const song = e?.detail;
    if (!song) return;

    const settings = getSettings();
    const groupIndex = getCurrentGroupIndex();

    // 构建给AI的消息（包含歌名歌手和歌词）
    const name = safeText(song?.name) || '未知歌曲';
    const artist = safeText(song?.artist);
    const lyrics = clipLyrics(song?.lyrics);

    let aiMessage = `[分享音乐] ${name}`;
    if (artist) aiMessage += ` - ${artist}`;
    if (lyrics) aiMessage += `\n歌词:\n${lyrics}`;

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    // 群聊分享音乐
    if (groupIndex >= 0) {
      const groupChat = settings.groupChats?.[groupIndex];
      if (!groupChat) return;

      if (!Array.isArray(groupChat.chatHistory)) {
        groupChat.chatHistory = [];
      }

      // 显示音乐卡片
      appendGroupMusicCardMessage('user', song);

      // 保存到聊天历史
      groupChat.chatHistory.push({
        role: 'user',
        content: aiMessage,
        time: timeStr,
        timestamp: Date.now(),
        isMusic: true,
        musicInfo: { name: song.name, artist: song.artist, platform: song.platform, cover: song.cover, id: song.id }
      });

      groupChat.lastMessage = `[音乐] ${name}`;
      groupChat.lastMessageTime = Date.now();
      requestSave();
      refreshChatList();

      // 获取成员信息
      const { memberIds } = enforceGroupChatMemberLimit(groupChat);
      const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

      if (members.length === 0) {
        showToast('群聊成员不存在', '⚠️');
        return;
      }

      // 显示打字指示器
      showGroupTypingIndicator(members[0]?.name, members[0]?.id);

      try {
        // 调用群聊AI
        const responses = await callGroupAI(groupChat, members, aiMessage, []);
        hideGroupTypingIndicator();

        // 逐条显示AI回复
        for (let i = 0; i < responses.length; i++) {
          const resp = responses[i];

          // 显示typing指示器并等待
          showGroupTypingIndicator(resp.characterName, resp.characterId);
          await sleep(800 + Math.random() * 400);
          hideGroupTypingIndicator();

          // 保存并显示消息
          groupChat.chatHistory.push({
            role: 'assistant',
            content: resp.content,
            time: timeStr,
            timestamp: Date.now(),
            characterName: resp.characterName,
            characterId: resp.characterId
          });

          appendGroupMessage('assistant', resp.content, resp.characterName, resp.characterId);
        }

        if (responses.length > 0) {
          const lastResp = responses[responses.length - 1];
          groupChat.lastMessage = lastResp.content.length > 20 ? lastResp.content.substring(0, 20) + '...' : lastResp.content;
          groupChat.lastMessageTime = Date.now();
        }

        requestSave();
        refreshChatList();
      } catch (err) {
        hideGroupTypingIndicator();
        console.error('[可乐] 群聊音乐分享AI回复失败:', err);
      }

      return;
    }

    // 单聊分享音乐
    if (currentChatIndex < 0) return;

    const contactIndex = currentChatIndex;
    const contact = settings.contacts[contactIndex];
    if (!contact) return;

    if (!contact.chatHistory) {
      contact.chatHistory = [];
    }

    // 显示音乐卡片
    appendMusicCardMessage('user', song, contact);

    // 保存到聊天历史
    contact.chatHistory.push({
      role: 'user',
      content: aiMessage,
      time: timeStr,
      timestamp: Date.now(),
      isMusic: true,
      musicInfo: { name: song.name, artist: song.artist, platform: song.platform, cover: song.cover, id: song.id }
    });

    contact.lastMessage = `[音乐] ${name}`;
    requestSave();
    refreshChatList();

    // 调用AI回复
    showTypingIndicator(contact);
    try {
      const aiReply = await callAI(contact, aiMessage);
      hideTypingIndicator();
      if (aiReply) {
        // 使用 splitAIMessages 分割AI回复
        const aiMessages = splitAIMessages(aiReply);
        let lastShownMessage = null;
        for (let i = 0; i < aiMessages.length; i++) {
          const rawMsg = aiMessages[i];

          // 兼容 AI 发起通话请求（如：[通话请求] / [语音通话请求] / [视频通话请求]），不显示为文本
          const callRequestType = detectAiCallRequest(rawMsg);
          if (callRequestType === 'voice') {
            startVoiceCall('ai', contactIndex);
            break; // 通话请求必须单独一条
          }
          if (callRequestType === 'video') {
            startVideoCall('ai', contactIndex);
            break; // 通话请求必须单独一条
          }

          // 解析 [回复:xxx] 引用格式，避免把标记直接显示出来
          const parsed = parseAiQuoteMessage(rawMsg, contact);
          const msg = (parsed?.content || '').toString().trim();
          const quote = parsed?.quote || null;
          if (!msg) continue;

          contact.chatHistory.push({
            role: 'assistant',
            content: msg,
            time: timeStr,
            timestamp: Date.now(),
            quote: quote || undefined
          });
          appendMessage('assistant', msg, contact, false, quote);
          lastShownMessage = msg;
        }

        if (lastShownMessage) {
          contact.lastMessage = lastShownMessage.length > 20 ? lastShownMessage.substring(0, 20) + '...' : lastShownMessage;
        }
        requestSave();
        refreshChatList();
      }
    } catch (err) {
      hideTypingIndicator();
      console.error('[可乐] 音乐分享AI回复失败:', err);
    }
  });
}

export function showExpandVoice() {
  expandMode = 'voice';
  const panel = document.getElementById('wechat-expand-input');
  const title = document.getElementById('wechat-expand-title');
  const body = document.getElementById('wechat-expand-body');
  if (!panel || !title || !body) return;

  title.textContent = '语音消息';
  body.innerHTML = `
    <div class="wechat-expand-hint">输入语音内容，系统会根据字数计算时长</div>
    <textarea class="wechat-expand-textarea" id="wechat-expand-voice-text" placeholder="输入语音内容..."></textarea>
    <div class="wechat-expand-preview">
      <span class="wechat-expand-preview-label">预计时长:</span>
      <span class="wechat-expand-preview-value" id="wechat-expand-voice-duration">0"</span>
    </div>
  `;

  panel.classList.remove('hidden');

  const textarea = document.getElementById('wechat-expand-voice-text');
  textarea?.addEventListener('input', updateExpandVoiceDuration);
  setTimeout(() => textarea?.focus(), 50);
}

// 显示照片描述输入面板
export function showExpandPhoto() {
  expandMode = 'photo';
  const panel = document.getElementById('wechat-expand-input');
  const title = document.getElementById('wechat-expand-title');
  const body = document.getElementById('wechat-expand-body');
  if (!panel || !title || !body) return;

  title.textContent = '发送照片';
  body.innerHTML = `
    <textarea class="wechat-expand-textarea" id="wechat-expand-photo-text" placeholder="描述照片内容..."></textarea>
  `;

  panel.classList.remove('hidden');

  const textarea = document.getElementById('wechat-expand-photo-text');
  setTimeout(() => textarea?.focus(), 50);
}

function updateExpandVoiceDuration() {
  const textarea = document.getElementById('wechat-expand-voice-text');
  const durationEl = document.getElementById('wechat-expand-voice-duration');
  if (!textarea || !durationEl) return;

  const content = textarea.value.trim();
  const duration = content ? calculateVoiceDuration(content) : 0;
  durationEl.textContent = duration + '"';
}

export function showExpandMulti() {
  expandMode = 'multi';
  expandMsgItems = [{ type: 'text', content: '' }];

  const panel = document.getElementById('wechat-expand-input');
  const title = document.getElementById('wechat-expand-title');
  if (!panel || !title) return;

  title.textContent = '混合消息';
  renderExpandMsgList();
  panel.classList.remove('hidden');

  setTimeout(() => {
    const firstInput = document.querySelector('.wechat-expand-msg-input');
    firstInput?.focus();
  }, 50);
}

// 获取消息类型的线条图标
function getTypeIcon(type) {
  switch (type) {
    case 'voice':
      return `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 10v1a7 7 0 01-14 0v-1M12 18v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
    case 'sticker':
      return `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
    case 'photo':
      return `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
    default: // text
      return `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
  }
}

// 获取消息类型标签
function getTypeLabel(type) {
  switch (type) {
    case 'voice': return '语音';
    case 'sticker': return '表情';
    case 'photo': return '照片';
    default: return '文字';
  }
}

function renderExpandMsgList() {
  const body = document.getElementById('wechat-expand-body');
  if (!body) return;

  let html = '<div class=\"wechat-expand-msg-list\" id=\"wechat-expand-msg-list\">';
  expandMsgItems.forEach((item, index) => {
    const typeIcon = getTypeIcon(item.type);
    const typeLabel = getTypeLabel(item.type);

    html += `
      <div class=\"wechat-expand-msg-item\" data-index=\"${index}\">
        <span class=\"wechat-expand-msg-num\">${index + 1}</span>
        <div class=\"wechat-expand-msg-type\" data-index=\"${index}\" title=\"点击切换类型\">
          <span class=\"wechat-expand-type-icon\">${typeIcon}</span>
          <span class=\"wechat-expand-type-label\">${typeLabel}</span>
        </div>
    `;

    if (item.type === 'sticker') {
      // 表情类型：显示选择按钮或已选的表情预览
      if (item.content) {
        html += `
          <div class=\"wechat-expand-sticker-preview\" data-index=\"${index}\">
            <img src=\"${escapeHtml(item.content)}\" alt=\"表情\" style=\"max-width: 50px; max-height: 50px; border-radius: 4px;\">
            <button class=\"wechat-expand-sticker-change\" data-index=\"${index}\" title=\"更换表情\">换</button>
          </div>
        `;
      } else {
        html += `
          <button class=\"wechat-expand-sticker-select\" data-index=\"${index}\">选择表情</button>
        `;
      }
    } else if (item.type === 'photo') {
      // 照片类型：输入图片描述
      html += `
        <input type=\"text\" class=\"wechat-expand-msg-input wechat-expand-photo-input\" data-index=\"${index}\" value=\"${escapeHtml(item.content)}\" placeholder=\"输入图片描述...\">
        <span class=\"wechat-expand-photo-hint\"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\"/><path d=\"M21 15l-5-5L5 21\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/></svg></span>
      `;
    } else if (item.type === 'voice') {
      // 语音类型：输入框 + 时长显示
      html += `
        <input type=\"text\" class=\"wechat-expand-msg-input wechat-expand-voice-input\" data-index=\"${index}\" value=\"${escapeHtml(item.content)}\" placeholder=\"输入语音内容...\">
        <span class=\"wechat-expand-voice-dur\">${item.content ? calculateVoiceDuration(item.content) + '\"' : '0\"'}</span>
      `;
    } else {
      // 文字类型：普通输入框
      html += `
        <input type=\"text\" class=\"wechat-expand-msg-input\" data-index=\"${index}\" value=\"${escapeHtml(item.content)}\" placeholder=\"消息 ${index + 1}\">
      `;
    }

    if (expandMsgItems.length > 1) {
      html += `<button class=\"wechat-expand-msg-del\" data-index=\"${index}\">✕</button>`;
    }

    html += `</div>`;
  });
  html += '</div>';
  html += '<button class=\"wechat-expand-add-btn\" id=\"wechat-expand-add-msg\">+ 添加消息</button>';

  body.innerHTML = html;

  // 绑定输入事件
  document.querySelectorAll('.wechat-expand-msg-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      expandMsgItems[index].content = e.target.value;

      // 更新语音时长显示
      if (expandMsgItems[index].type === 'voice') {
        const durEl = e.target.parentElement.querySelector('.wechat-expand-voice-dur');
        if (durEl) {
          const duration = e.target.value.trim() ? calculateVoiceDuration(e.target.value) : 0;
          durEl.textContent = duration + '\"';
        }
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addExpandMsgItem();
      }
    });
  });

  // 绑定类型切换事件
  document.querySelectorAll('.wechat-expand-msg-type').forEach(typeBtn => {
    typeBtn.addEventListener('click', (e) => {
      const index = parseInt(typeBtn.dataset.index);
      cycleMessageType(index);
    });
  });

  // 绑定删除事件
  document.querySelectorAll('.wechat-expand-msg-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      expandMsgItems.splice(index, 1);
      renderExpandMsgList();
    });
  });

  // 绑定表情选择事件
  document.querySelectorAll('.wechat-expand-sticker-select, .wechat-expand-sticker-change').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(btn.dataset.index);
      openStickerPickerForMultiMsg(index);
    });
  });

  document.getElementById('wechat-expand-add-msg')?.addEventListener('click', addExpandMsgItem);
}

// 循环切换消息类型
function cycleMessageType(index) {
  const currentType = expandMsgItems[index].type;
  let newType;
  if (currentType === 'text') {
    newType = 'voice';
  } else if (currentType === 'voice') {
    newType = 'sticker';
  } else if (currentType === 'sticker') {
    newType = 'photo';
  } else {
    newType = 'text';
  }
  expandMsgItems[index] = { type: newType, content: '' };
  renderExpandMsgList();
}

function addExpandMsgItem() {
  expandMsgItems.push({ type: 'text', content: '' });
  renderExpandMsgList();

  setTimeout(() => {
    const inputs = document.querySelectorAll('.wechat-expand-msg-input');
    const lastInput = inputs[inputs.length - 1];
    lastInput?.focus();
  }, 50);
}

// 打开表情选择器用于混合消息
function openStickerPickerForMultiMsg(index) {
  pendingStickerIndex = index;
  // 关闭展开面板，打开表情面板
  const expandPanel = document.getElementById('wechat-expand-input');
  const emojiPanel = document.getElementById('wechat-emoji-panel');

  expandPanel?.classList.add('hidden');
  emojiPanel?.classList.remove('hidden');

  // 切换到贴纸标签
  const stickerTab = document.querySelector('.wechat-emoji-tab[data-tab="sticker"]');
  stickerTab?.click();

  showToast('请选择表情', '😊');
}

// 为混合消息设置表情（由emoji-panel调用）
export function setStickerForMultiMsg(stickerUrl) {
  if (pendingStickerIndex < 0 || pendingStickerIndex >= expandMsgItems.length) {
    return false;
  }

  expandMsgItems[pendingStickerIndex].content = stickerUrl;
  const savedIndex = pendingStickerIndex;
  pendingStickerIndex = -1;

  // 关闭表情面板，重新打开展开面板
  const emojiPanel = document.getElementById('wechat-emoji-panel');
  emojiPanel?.classList.add('hidden');

  // 重新显示混合消息面板
  expandMode = 'multi';
  const panel = document.getElementById('wechat-expand-input');
  const title = document.getElementById('wechat-expand-title');
  if (panel && title) {
    title.textContent = '混合消息';
    renderExpandMsgList();
    panel.classList.remove('hidden');
  }

  return true;
}

// 检查是否有待选表情
export function hasPendingStickerSelection() {
  return pendingStickerIndex >= 0;
}

export function closeExpandPanel() {
  const panel = document.getElementById('wechat-expand-input');
  panel?.classList.add('hidden');
  expandMode = null;
}

export async function sendExpandContent() {
  const inGroup = isInGroupChat();

  if (expandMode === 'voice') {
    const textarea = document.getElementById('wechat-expand-voice-text');
    const content = textarea?.value.trim();

    if (!content) {
      showToast('请输入语音内容', 'info');
      return;
    }

    closeExpandPanel();
    if (inGroup) {
      sendGroupMessage(content, false, true);
    } else {
      sendMessage(content, false, true);
    }
    return;
  }

  if (expandMode === 'photo') {
    const textarea = document.getElementById('wechat-expand-photo-text');
    const content = textarea?.value.trim();

    if (!content) {
      showToast('请输入照片描述', 'info');
      return;
    }

    closeExpandPanel();
    if (inGroup) {
      await sendGroupPhotoMessage(content);
    } else {
      await sendPhotoMessage(content);
    }
    return;
  }

  if (expandMode === 'multi') {
    // 过滤有效消息（文字/语音需要有内容，表情需要有URL）
    const validMessages = expandMsgItems.filter(m => {
      if (m.type === 'sticker') {
        return m.content && m.content.trim();
      }
      return m.content && m.content.trim();
    });

    if (validMessages.length === 0) {
      showToast('请至少输入一条消息', 'info');
      return;
    }

    closeExpandPanel();

    // 使用批量发送函数（一次性发完再调用AI）
    if (inGroup) {
      await sendGroupBatchMessages(validMessages);
    } else {
      await sendBatchMessages(validMessages);
    }
  }
}

export function toggleFuncPanel() {
  const panel = document.getElementById('wechat-func-panel');
  const expandPanel = document.getElementById('wechat-expand-input');
  const emojiPanel = document.getElementById('wechat-emoji-panel');
  if (!panel || !expandPanel) return;

  if (!expandPanel.classList.contains('hidden')) {
    expandPanel.classList.add('hidden');
    expandMode = null;
  }

  // 关闭表情面板
  emojiPanel?.classList.add('hidden');

  panel.classList.toggle('hidden');
}

export function hideFuncPanel() {
  document.getElementById('wechat-func-panel')?.classList.add('hidden');
}

function setFuncPanelPage(pageIndex) {
  funcPanelPage = pageIndex;
  const pages = document.getElementById('wechat-func-pages');
  const dots = document.querySelectorAll('.wechat-func-dot');

  if (pages) pages.style.transform = `translateX(-${pageIndex * 100}%)`;
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === pageIndex));
}

function handleFuncItemClick(func) {
  switch (func) {
    case 'voice':
      hideFuncPanel();
      showExpandVoice();
      return;
    case 'multi':
      hideFuncPanel();
      showExpandMulti();
      return;
    case 'photo':
      hideFuncPanel();
      showExpandPhoto();
      return;
    case 'voicecall':
      hideFuncPanel();
      startVoiceCall();
      return;
    case 'videocall':
      hideFuncPanel();
      startVideoCall();
      return;
    case 'music':
      hideFuncPanel();
      showMusicPanel();
      return;
    case 'redpacket':
      hideFuncPanel();
      if (isInGroupChat()) {
        // 群聊红包 - 动态导入
        import('./group-red-packet.js').then(m => m.showGroupRedPacketTypePage());
      } else {
        showRedPacketPage();
      }
      return;
    case 'transfer':
      hideFuncPanel();
      if (isInGroupChat()) {
        // 群聊转账 - 先选择成员
        import('./group-red-packet.js').then(m => m.showGroupTransferSelectPage());
      } else {
        showTransferPage();
      }
      return;
    case 'time':
      hideFuncPanel();
      showTimePicker();
      return;
    case 'listen':
      hideFuncPanel();
      // 群聊不支持一起听
      if (isInGroupChat()) {
        showToast('群聊暂不支持一起听', 'info');
        return;
      }
      showListenSearchPage();
      return;
    default:
      showToast('该功能开发中...', 'info');
  }
}

export function initFuncPanel() {
  if (funcPanelInited) return;

  const pages = document.getElementById('wechat-func-pages');
  if (!pages) return;
  funcPanelInited = true;

  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  const handleStart = (e) => {
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    currentX = startX;
    isDragging = true;
    pages.style.transition = 'none';
  };

  const handleMove = (e) => {
    if (!isDragging) return;
    currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
  };

  const handleEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    pages.style.transition = 'transform 0.3s ease';

    const diff = startX - currentX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && funcPanelPage < 1) setFuncPanelPage(1);
      else if (diff < 0 && funcPanelPage > 0) setFuncPanelPage(0);
    }
  };

  pages.addEventListener('touchstart', handleStart, { passive: true });
  pages.addEventListener('touchmove', handleMove, { passive: true });
  pages.addEventListener('touchend', handleEnd);

  pages.addEventListener('mousedown', (e) => {
    handleStart(e);
    e.preventDefault();
  });
  pages.addEventListener('mousemove', handleMove);
  pages.addEventListener('mouseup', handleEnd);
  pages.addEventListener('mouseleave', handleEnd);

  document.querySelectorAll('.wechat-func-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const page = parseInt(dot.dataset.page);
      setFuncPanelPage(page);
    });
  });

  document.querySelectorAll('.wechat-func-item').forEach(item => {
    item.addEventListener('click', () => {
      handleFuncItemClick(item.dataset.func);
    });
  });

  // 初始化音乐面板事件
  initMusicEvents();
  initMusicShareListener();
  initTimePickerEvents();
  initListenTogether();
}

// ============ 时间选择器相关 ============

// 存储选择的时间（null 表示使用当前时间）
let selectedTime = null;
let timePickerInited = false;

// 时间选择器当前选中的值
let pickerValues = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  day: new Date().getDate(),
  hour: new Date().getHours(),
  minute: new Date().getMinutes(),
  second: new Date().getSeconds()
};

// 获取选择的时间（供 chat.js 使用）
export function getSelectedTime() {
  return selectedTime;
}

// 清除选择的时间
export function clearSelectedTime() {
  selectedTime = null;
  updateTimeIndicator();
}

// 显示时间选择器
function showTimePicker() {
  const picker = document.getElementById('wechat-time-picker');
  if (!picker) return;

  // 初始化为当前时间
  const now = new Date();
  pickerValues = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds()
  };

  renderTimePickerColumns();
  updateTimePickerDisplay();
  picker.classList.remove('hidden');
}

// 隐藏时间选择器
function hideTimePicker() {
  const picker = document.getElementById('wechat-time-picker');
  picker?.classList.add('hidden');
}

// 渲染时间选择器列
function renderTimePickerColumns() {
  const currentYear = new Date().getFullYear();

  // 年份：前后5年
  renderPickerColumn('year', currentYear - 5, currentYear + 5, pickerValues.year, '年');
  // 月份：1-12
  renderPickerColumn('month', 1, 12, pickerValues.month, '月');
  // 日期：根据年月动态计算
  const daysInMonth = new Date(pickerValues.year, pickerValues.month, 0).getDate();
  renderPickerColumn('day', 1, daysInMonth, pickerValues.day, '日');
  // 小时：0-23
  renderPickerColumn('hour', 0, 23, pickerValues.hour, '时');
  // 分钟：0-59
  renderPickerColumn('minute', 0, 59, pickerValues.minute, '分');
  // 秒：0-59
  renderPickerColumn('second', 0, 59, pickerValues.second, '秒');
}

// 渲染单个列
function renderPickerColumn(type, min, max, selected, suffix) {
  const container = document.getElementById(`wechat-time-picker-${type}`);
  if (!container) return;

  let html = '';
  for (let i = min; i <= max; i++) {
    const value = type === 'year' ? i : i.toString().padStart(2, '0');
    const isSelected = i === selected;
    html += `<div class="wechat-time-picker-item${isSelected ? ' selected' : ''}" data-value="${i}">${value}${suffix}</div>`;
  }
  container.innerHTML = html;

  // 滚动到选中项
  setTimeout(() => {
    const selectedItem = container.querySelector('.selected');
    if (selectedItem) {
      container.scrollTop = selectedItem.offsetTop - container.offsetHeight / 2 + selectedItem.offsetHeight / 2;
    }
  }, 0);
}

// 更新显示的时间
function updateTimePickerDisplay() {
  const display = document.getElementById('wechat-time-picker-display');
  if (!display) return;

  const { year, month, day, hour, minute, second } = pickerValues;
  display.textContent = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
}

// 更新输入框旁的时间指示器
function updateTimeIndicator() {
  let indicator = document.getElementById('wechat-time-indicator');

  if (!selectedTime) {
    indicator?.remove();
    return;
  }

  if (!indicator) {
    const inputArea = document.querySelector('.wechat-chat-input-area');
    if (!inputArea) return;

    indicator = document.createElement('div');
    indicator.id = 'wechat-time-indicator';
    indicator.className = 'wechat-time-indicator';
    inputArea.insertBefore(indicator, inputArea.firstChild);
  }

  const date = new Date(selectedTime);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');

  indicator.innerHTML = `
    <span class="wechat-time-indicator-text">${month}月${day}日 ${hour}:${minute}</span>
    <button class="wechat-time-indicator-clear" id="wechat-time-indicator-clear">✕</button>
  `;

  // 绑定清除按钮
  document.getElementById('wechat-time-indicator-clear')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedTime();
  });
}

// 初始化时间选择器事件
function initTimePickerEvents() {
  if (timePickerInited) return;
  timePickerInited = true;

  // 监听列项点击
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.wechat-time-picker-item');
    if (!item) return;

    const column = item.closest('.wechat-time-picker-column');
    if (!column) return;

    const type = column.dataset.type;
    const value = parseInt(item.dataset.value);

    // 更新选中值
    pickerValues[type] = value;

    // 更新选中样式
    column.querySelectorAll('.wechat-time-picker-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.value) === value);
    });

    // 如果改变了年或月，需要重新渲染日期列
    if (type === 'year' || type === 'month') {
      const daysInMonth = new Date(pickerValues.year, pickerValues.month, 0).getDate();
      if (pickerValues.day > daysInMonth) {
        pickerValues.day = daysInMonth;
      }
      renderPickerColumn('day', 1, daysInMonth, pickerValues.day, '日');
    }

    updateTimePickerDisplay();
  });

  // 确认按钮
  document.getElementById('wechat-time-picker-confirm')?.addEventListener('click', () => {
    const { year, month, day, hour, minute, second } = pickerValues;
    selectedTime = new Date(year, month - 1, day, hour, minute, second).getTime();

    hideTimePicker();
    updateTimeIndicator();
    showToast('已设置发送时间', '⏰');
  });
}
