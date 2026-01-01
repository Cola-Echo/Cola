/**
 * 消息操作菜单
 */

import { getSettings, SUMMARY_MARKER_PREFIX, splitAIMessages } from './config.js';
import { requestSave } from './save-manager.js';
import { currentChatIndex, openChat, showTypingIndicator, hideTypingIndicator, appendMessage } from './chat.js';
import { showToast } from './toast.js';
import { getContext } from '../../../extensions.js';
import { formatQuoteDate } from './utils.js';
import { isInGroupChat, getCurrentGroupIndex, openGroupChat } from './group-chat.js';

// 当前显示菜单的消息索引
let currentMenuMsgIndex = -1;
// 长按计时器
let longPressTimer = null;
// 是否正在长按
let isLongPress = false;

// 待引用的消息
let pendingQuote = null;

// 菜单项配置
const menuItems = [
  { id: 'copy', icon: 'copy', text: '复制' },
  { id: 'transcribe', icon: 'transcribe', text: '转文字', voiceOnly: true },
  { id: 'quote', icon: 'quote', text: '引用' },
  { id: 'recall', icon: 'recall', text: '撤回', userOnly: true },
  { id: 'regenerate', icon: 'regenerate', text: '重新生成', userOnly: true },
  { id: 'multiselect', icon: 'multiselect', text: '多选' }
];

// 图标SVG
const icons = {
  copy: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>`,
  transcribe: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>`,
  quote: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v4z"/>
  </svg>`,
  recall: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>`,
  regenerate: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M23 4v6h-6"/>
    <path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>`,
  multiselect: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
  </svg>`
};

// 创建菜单DOM
function createMenuElement(isUserMessage = false, isVoiceMessage = false, voiceTextVisible = false) {
  const menu = document.createElement('div');
  menu.className = 'wechat-msg-menu hidden';
  menu.id = 'wechat-msg-menu';

  const menuContent = document.createElement('div');
  menuContent.className = 'wechat-msg-menu-content';

  menuItems.forEach(item => {
    // 跳过仅用户可用的菜单项（如果当前不是用户消息）
    if (item.userOnly && !isUserMessage) return;
    // 跳过仅语音消息可用的菜单项（如果当前不是语音消息）
    if (item.voiceOnly && !isVoiceMessage) return;

    const menuItem = document.createElement('div');
    menuItem.className = 'wechat-msg-menu-item';
    menuItem.dataset.action = item.id;

    // 转文字按钮根据状态显示不同文本
    let text = item.text;
    if (item.id === 'transcribe' && voiceTextVisible) {
      text = '收起文字';
    }

    menuItem.innerHTML = `
      <div class="wechat-msg-menu-icon">${icons[item.id]}</div>
      <div class="wechat-msg-menu-text">${text}</div>
    `;
    menuContent.appendChild(menuItem);
  });

  menu.appendChild(menuContent);
  return menu;
}

// 显示菜单
export function showMessageMenu(msgElement, msgIndex, event) {
  hideMessageMenu();

  currentMenuMsgIndex = msgIndex;

  // 检查是否为用户消息
  const settings = getSettings();
  const groupIndex = getCurrentGroupIndex();
  let msg;

  if (groupIndex >= 0) {
    // 群聊模式
    const groupChat = settings.groupChats?.[groupIndex];
    msg = groupChat?.chatHistory?.[msgIndex];
  } else {
    // 单聊模式
    const contact = settings.contacts[currentChatIndex];
    msg = contact?.chatHistory?.[msgIndex];
  }

  // 从元素或其父元素获取 role 属性
  let roleAttr = msgElement?.dataset?.msgRole;
  if (!roleAttr) {
    // 尝试从父元素获取（气泡元素在 .wechat-message 内部）
    const parentMsg = msgElement?.closest?.('.wechat-message') || msgElement?.parentElement?.closest?.('.wechat-message');
    roleAttr = parentMsg?.dataset?.msgRole;
  }
  let isUserMessage = roleAttr === 'user';

  // 如果元素属性不存在，回退到历史记录判断
  if (!roleAttr && msg) {
    isUserMessage = msg.role === 'user';
  }

  // 最后检查：通过元素类名判断（self 类表示用户消息）
  if (!roleAttr && !msg) {
    const parentMsg = msgElement?.closest?.('.wechat-message');
    isUserMessage = parentMsg?.classList?.contains('self') || false;
  }

  // 检测是否是语音消息
  const voiceBubble = msgElement.classList?.contains('wechat-voice-bubble')
    ? msgElement
    : msgElement.querySelector?.('.wechat-voice-bubble');
  const isVoiceMessage = !!voiceBubble || msg?.isVoice === true;

  // 检测语音转文字是否已显示
  let voiceTextVisible = false;
  if (voiceBubble) {
    const voiceId = voiceBubble.dataset?.voiceId;
    if (voiceId) {
      const textEl = document.getElementById(voiceId);
      voiceTextVisible = textEl?.classList.contains('visible') || false;
    }
  }

  // 移除旧菜单并创建新菜单（根据消息类型动态生成）
  let menu = document.getElementById('wechat-msg-menu');
  if (menu) {
    menu.remove();
  }
  menu = createMenuElement(isUserMessage, isVoiceMessage, voiceTextVisible);
  // 存储语音相关数据
  if (voiceBubble) {
    menu.dataset.voiceId = voiceBubble.dataset?.voiceId || '';
    menu.dataset.voiceContent = voiceBubble.dataset?.voiceContent || '';
  }
  document.querySelector('.wechat-phone').appendChild(menu);
  bindMenuEvents(menu);

  // 计算位置
  const msgRect = msgElement.getBoundingClientRect();
  const phoneEl = document.querySelector('.wechat-phone');
  const phoneRect = phoneEl.getBoundingClientRect();

  // 相对于手机容器的位置
  const relativeTop = msgRect.top - phoneRect.top;
  const relativeLeft = msgRect.left - phoneRect.left;

  menu.classList.remove('hidden');

  // 获取菜单尺寸
  const menuRect = menu.getBoundingClientRect();

  // 默认显示在消息上方
  let top = relativeTop - menuRect.height - 8;
  let left = relativeLeft + (msgRect.width / 2) - (menuRect.width / 2);

  // 如果上方空间不够，显示在下方
  if (top < 50) {
    top = relativeTop + msgRect.height + 8;
  }

  // 左右边界检查
  if (left < 10) left = 10;
  if (left + menuRect.width > phoneRect.width - 10) {
    left = phoneRect.width - menuRect.width - 10;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  // 点击其他地方关闭菜单
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
  }, 10);
}

// 隐藏菜单
export function hideMessageMenu() {
  const menu = document.getElementById('wechat-msg-menu');
  if (menu) {
    menu.classList.add('hidden');
  }
  currentMenuMsgIndex = -1;
  document.removeEventListener('click', handleOutsideClick);
  document.removeEventListener('touchstart', handleOutsideClick);
}

// 点击外部关闭
function handleOutsideClick(e) {
  const menu = document.getElementById('wechat-msg-menu');
  if (menu && !menu.contains(e.target)) {
    hideMessageMenu();
  }
}

// 绑定菜单事件
function bindMenuEvents(menu) {
  menu.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.wechat-msg-menu-item');
    if (!menuItem) return;

    const action = menuItem.dataset.action;
    // 传递菜单上存储的语音数据
    const voiceId = menu.dataset.voiceId;
    const voiceContent = menu.dataset.voiceContent;
    handleMenuAction(action, currentMenuMsgIndex, voiceId, voiceContent);
    hideMessageMenu();
  });
}

// 处理菜单操作
function handleMenuAction(action, msgIndex, voiceId = '', voiceContent = '') {
  const settings = getSettings();
  const groupIndex = getCurrentGroupIndex();
  let chatHistory, contact, groupChat;

  if (groupIndex >= 0) {
    // 群聊模式
    groupChat = settings.groupChats?.[groupIndex];
    if (!groupChat || !groupChat.chatHistory || msgIndex < 0) return;
    chatHistory = groupChat.chatHistory;
  } else {
    // 单聊模式
    contact = settings.contacts[currentChatIndex];
    if (!contact || !contact.chatHistory || msgIndex < 0) return;
    chatHistory = contact.chatHistory;
  }

  const msg = chatHistory[msgIndex];
  if (!msg) return;

  switch (action) {
    case 'copy':
      copyMessage(msg.content);
      break;
    case 'transcribe':
      // 切换语音转文字显示
      if (voiceId) {
        const textEl = document.getElementById(voiceId);
        if (textEl) {
          const isVisible = textEl.classList.contains('visible');
          if (isVisible) {
            textEl.classList.remove('visible');
            textEl.classList.add('hidden');
          } else {
            textEl.classList.remove('hidden');
            textEl.classList.add('visible');
          }
        }
      }
      break;
    case 'quote':
      quoteMessage(msg, groupIndex >= 0, groupChat);
      break;
    case 'recall':
      if (groupIndex >= 0) {
        recallGroupMessage(msgIndex, groupChat);
      } else {
        recallMessage(msgIndex, contact);
      }
      break;
    case 'regenerate':
      if (groupIndex >= 0) {
        regenerateGroupMessage(msgIndex, groupChat);
      } else {
        regenerateMessage(msgIndex, contact);
      }
      break;
    case 'multiselect':
      showToast('多选功能开发中');
      break;
  }
}

// 复制消息
function copyMessage(content) {
  navigator.clipboard.writeText(content).then(() => {
    showToast('已复制');
  }).catch(() => {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制');
  });
}

// 引用消息 - 设置待引用状态
function quoteMessage(msg, isGroupChat = false, groupChat = null) {
  // 不允许引用撤回的消息
  if (msg.isRecalled) {
    showToast('无法引用已撤回的消息');
    return;
  }

  const settings = getSettings();
  const context = getContext();

  // 确定发送者名称
  let senderName;
  if (msg.role === 'user') {
    senderName = context?.name1 || '我';
  } else if (isGroupChat) {
    // 群聊模式：使用消息中存储的角色名
    senderName = msg.characterName || '群成员';
  } else {
    // 单聊模式：使用联系人名称
    const contact = settings.contacts[currentChatIndex];
    senderName = contact?.name || '对方';
  }

  // 格式化日期
  const date = formatQuoteDate(msg.timestamp);

  // 设置待引用消息
  const isMusic = msg.isMusic === true;
  let quoteContent = msg.content;
  if (isMusic && msg.musicInfo) {
    const artist = (msg.musicInfo.artist || '').toString().trim();
    const name = (msg.musicInfo.name || '').toString().trim();
    quoteContent = artist && name ? `${artist}-${name}` : (name || artist || msg.content);
  }
  pendingQuote = {
    content: quoteContent,
    sender: senderName,
    date: date,
    isVoice: msg.isVoice === true,
    isPhoto: msg.isPhoto === true,
    isSticker: msg.isSticker === true,
    isMusic: isMusic
  };

  // 显示引用预览条
  showQuotePreview();

  // 聚焦输入框
  const input = document.getElementById('wechat-input');
  if (input) {
    input.focus();
  }
}

// 显示引用预览条
function showQuotePreview() {
  if (!pendingQuote) return;

  // 移除已有的预览条
  hideQuotePreview();

  const inputArea = document.querySelector('.wechat-chat-input');
  if (!inputArea) return;

  const previewBar = document.createElement('div');
  previewBar.className = 'wechat-quote-preview';
  previewBar.id = 'wechat-quote-preview';

  // 根据消息类型生成显示文本
  let contentText;
  if (pendingQuote.isVoice) {
    const seconds = Math.max(2, Math.min(60, Math.ceil(pendingQuote.content.length / 3)));
    contentText = `[语音] ${seconds}"`;
  } else if (pendingQuote.isPhoto) {
    contentText = '[照片]';
  } else if (pendingQuote.isSticker) {
    contentText = '[表情]';
  } else {
    contentText = pendingQuote.content.length > 25
      ? pendingQuote.content.substring(0, 25) + '...'
      : pendingQuote.content;
  }

  previewBar.innerHTML = `
    <div class="wechat-quote-preview-content">
      <span class="wechat-quote-preview-sender">${pendingQuote.sender}:</span>
      <span class="wechat-quote-preview-text">${contentText}</span>
    </div>
    <button class="wechat-quote-preview-close" id="wechat-quote-close">×</button>
  `;

  // 插入到输入框下方
  inputArea.parentNode.insertBefore(previewBar, inputArea.nextSibling);

  // 绑定关闭按钮事件
  document.getElementById('wechat-quote-close').addEventListener('click', clearQuote);
}

// 隐藏引用预览条
function hideQuotePreview() {
  const preview = document.getElementById('wechat-quote-preview');
  if (preview) {
    preview.remove();
  }
}

// 获取待引用消息
export function getPendingQuote() {
  return pendingQuote;
}

// 清除引用
export function clearQuote() {
  pendingQuote = null;
  hideQuotePreview();
}

// 设置引用（供外部调用）
export function setQuote(quote) {
  if (!quote || !quote.content) return;
  pendingQuote = {
    content: quote.content,
    sender: quote.sender || '用户',
    date: quote.date || '',
    isVoice: quote.isVoice === true,
    isPhoto: quote.isPhoto === true,
    isSticker: quote.isSticker === true,
    isMusic: quote.isMusic === true
  };
  showQuotePreview();
  // 聚焦输入框
  const input = document.getElementById('wechat-input');
  if (input) {
    input.focus();
  }
}

// 重新生成回复（保留用户消息，删除后面的AI消息并重新生成）
async function regenerateMessage(msgIndex, contact) {
  const msg = contact.chatHistory[msgIndex];
  if (!msg || msg.role !== 'user') {
    showToast('只能对用户消息重新生成');
    return;
  }

  // 删除该用户消息之后的所有消息
  const removedCount = contact.chatHistory.length - msgIndex - 1;
  if (removedCount > 0) {
    contact.chatHistory.splice(msgIndex + 1);
  }

  requestSave();
  // 刷新聊天界面
  openChat(currentChatIndex);
  showToast('正在重新生成...');

  // 触发AI重新回复
  try {
    // 等待 DOM 更新后再显示 typing 指示器
    await new Promise(resolve => setTimeout(resolve, 50));
    showTypingIndicator(contact);

    const { callAI } = await import('./ai.js');
    // 使用用户原始消息重新调用AI
    const userContent = msg.content || '';
    const aiResponse = await callAI(contact, userContent);

    hideTypingIndicator();

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    // 解析AI回复（可能有多条消息）
    const aiMessages = splitAIMessages(aiResponse);

    for (const aiMsg of aiMessages) {
      let finalMsg = aiMsg.trim();
      if (!finalMsg) continue;

      let isVoice = false;
      const voiceMatch = finalMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        finalMsg = voiceMatch[1];
        isVoice = true;
      }

      contact.chatHistory.push({
        role: 'assistant',
        content: finalMsg,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: isVoice
      });

      appendMessage('assistant', finalMsg, contact, isVoice);
    }

    requestSave();
  } catch (err) {
    hideTypingIndicator();
    console.error('[可乐] 重新生成失败:', err);
    showToast('重新生成失败');
  }
}

// 群聊重新生成回复
async function regenerateGroupMessage(msgIndex, groupChat) {
  showToast('群聊暂不支持重新生成');
}

// 撤回消息
async function recallMessage(msgIndex, contact) {
  const msg = contact.chatHistory[msgIndex];
  if (!msg) return;

  // 只能撤回自己的消息
  if (msg.role !== 'user') {
    showToast('只能撤回自己的消息');
    return;
  }

  // 标记为撤回
  msg.isRecalled = true;
  msg.originalContent = msg.content;
  msg.content = '';

  requestSave();
  // 刷新聊天界面
  openChat(currentChatIndex);
  showToast('已撤回');

  // 触发AI回复
  try {
    showTypingIndicator(contact);

    const { callAI } = await import('./ai.js');
    // 随机决定是否"看到"了撤回的消息（50%几率）
    const sawMessage = Math.random() < 0.5;
    const originalContent = msg.originalContent || '一条消息';
    // 截取前30个字符作为提示
    const contentHint = originalContent.length > 30 ? originalContent.substring(0, 30) + '...' : originalContent;

    let aiPrompt;
    if (sawMessage) {
      // 看到了：可以追问内容，也可以假装没看到
      aiPrompt = `[用户撤回了一条消息，你刚好看到了内容是：「${contentHint}」。你可以选择：1.假装没看到 2.好奇追问"刚才说什么？" 3.直接回应看到的内容 4.调侃用户撤回。根据你的性格和内容选择合适的反应，不要每次都一样]`;
    } else {
      // 没看到：只能好奇或者忽略
      aiPrompt = `[用户撤回了一条消息，你没来得及看到内容。你可以选择：1.好奇追问"撤什么？" 2.调侃"撤回也没用我看到了"(即使没看到) 3.无视继续聊别的 4.发表情包。根据你的性格选择合适的反应，不要每次都一样]`;
    }

    const aiResponse = await callAI(contact, aiPrompt);

    hideTypingIndicator();

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    // 解析AI回复（可能有多条消息）
    const aiMessages = splitAIMessages(aiResponse);

    for (const aiMsg of aiMessages) {
      let finalMsg = aiMsg;
      let isVoice = false;

      const voiceMatch = aiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        finalMsg = voiceMatch[1];
        isVoice = true;
      }

      contact.chatHistory.push({
        role: 'assistant',
        content: finalMsg,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: isVoice
      });

      appendMessage('assistant', finalMsg, contact, isVoice);
    }

    contact.lastMessage = aiMessages[aiMessages.length - 1];
    requestSave();

  } catch (err) {
    hideTypingIndicator();
    console.error('[可乐] 撤回后AI回复失败:', err);
  }
}

// 删除群聊消息
function deleteGroupMessage(msgIndex, groupChat) {
  const groupIndex = getCurrentGroupIndex();
  if (groupIndex < 0) return;

  groupChat.chatHistory.splice(msgIndex, 1);
  requestSave();
  // 刷新群聊界面
  openGroupChat(groupIndex);
  showToast('已删除');
}

// 撤回群聊消息
async function recallGroupMessage(msgIndex, groupChat) {
  const groupIndex = getCurrentGroupIndex();
  if (groupIndex < 0) return;

  const msg = groupChat.chatHistory[msgIndex];
  if (!msg) return;

  // 只能撤回自己的消息
  if (msg.role !== 'user') {
    showToast('只能撤回自己的消息');
    return;
  }

  // 标记为撤回
  msg.isRecalled = true;
  msg.originalContent = msg.content;
  msg.content = '';

  requestSave();
  // 刷新群聊界面
  openGroupChat(groupIndex);
  showToast('已撤回');
}

// 绑定消息气泡事件
export function bindMessageBubbleEvents(container) {
  // 只绑定普通消息气泡，语音气泡由 bindVoiceBubbleEvents 单独处理
  const bubbles = container.querySelectorAll('.wechat-message-bubble');

  bubbles.forEach((bubble, index) => {
    if (bubble.dataset.menuBound) return;
    bubble.dataset.menuBound = 'true';

    // 获取真实的消息索引
    const msgElement = bubble.closest('.wechat-message');
    if (!msgElement) return;

    // 计算消息索引（跳过时间标签）
    const allMessages = Array.from(container.querySelectorAll('.wechat-message'));
    const msgIndex = allMessages.indexOf(msgElement);

    // PC端：单击
    bubble.addEventListener('click', (e) => {
      if (isLongPress) {
        isLongPress = false;
        return;
      }

      e.stopPropagation();
      showMessageMenu(bubble, getRealMsgIndex(container, msgElement), e);
    });

    // 移动端：长按
    bubble.addEventListener('touchstart', (e) => {
      isLongPress = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        e.preventDefault();
        showMessageMenu(bubble, getRealMsgIndex(container, msgElement), e);
      }, 500);
    });

    bubble.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
    });

    bubble.addEventListener('touchmove', () => {
      clearTimeout(longPressTimer);
    });
  });
}

// 获取真实的消息索引（排除时间标签等）
function getRealMsgIndex(container, msgElement) {
  // 优先从元素属性获取（新消息会有这个属性）
  if (msgElement?.dataset?.msgIndex !== undefined) {
    const idx = parseInt(msgElement.dataset.msgIndex);
    if (!isNaN(idx) && idx >= 0) {
      return idx;
    }
  }

  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact || !contact.chatHistory) return -1;

  // 获取所有消息元素（不含时间标签）
  const allMsgElements = Array.from(container.querySelectorAll('.wechat-message:not(.wechat-typing-wrapper)'));
  const visualIndex = allMsgElements.indexOf(msgElement);

  if (visualIndex < 0) return -1;

  // 需要计算真实索引（chatHistory中可能包含marker消息和撤回消息）
  // 注意：包含 ||| 或 <meme> 的消息在渲染时会被拆分成多条可视消息，需要正确计算
  let realIndex = -1;
  let visualCount = 0;

  for (let i = 0; i < contact.chatHistory.length; i++) {
    const msg = contact.chatHistory[i];
    // 跳过marker消息和撤回消息
    if (msg.isMarker || msg.content?.startsWith(SUMMARY_MARKER_PREFIX) || msg.isRecalled) continue;

    // 计算这条消息渲染成几个可视消息
    let visualMsgCount = 1;
    const content = msg.content || '';
    const isSpecial = msg.isVoice || msg.isSticker || msg.isPhoto || msg.isMusic;
    // 检查是否包含 ||| 或 <meme> 标签（这些会导致消息被分割显示）
    if (!isSpecial && (content.indexOf('|||') >= 0 || /<\s*meme\s*>/i.test(content))) {
      // 使用 splitAIMessages 计算实际分割数量
      const parts = splitAIMessages(content).filter(p => p && p.trim());
      visualMsgCount = parts.length || 1;
    }

    // 检查 visualIndex 是否落在这条消息的范围内
    if (visualIndex >= visualCount && visualIndex < visualCount + visualMsgCount) {
      realIndex = i;
      break;
    }

    visualCount += visualMsgCount;
  }

  return realIndex;
}
