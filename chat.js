/**
 * 聊天功能
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { getSettings, SUMMARY_MARKER_PREFIX, getUserStickers, parseMemeTag, splitAIMessages } from './config.js';
import { escapeHtml, sleep, formatMessageTime, calculateVoiceDuration, formatQuoteDate, bindImageLoadFallback } from './utils.js';
import { getUserAvatarHTML, refreshChatList } from './ui.js';
import { bindMessageBubbleEvents, getPendingQuote, clearQuote, setQuote } from './message-menu.js';
import { showToast, showNotificationBanner } from './toast.js';
import { aiShareMusic, playMusic as kugouPlayMusic } from './music.js';
import { loadContactBackground } from './chat-background.js';
import { tryTriggerMomentAfterChat, addMomentToContact } from './moments.js';
import { startVoiceCall } from './voice-call.js';
import { startVideoCall } from './video-call.js';

// 当前聊天的联系人索引
export let currentChatIndex = -1;

// 聊天记录上限（达到此数量时提醒总结）
const CHAT_HISTORY_LIMIT = 300;

// 检测AI发起通话请求的类型
// 返回 'voice' | 'video' | null（仅用于精确匹配）
export function detectAiCallRequest(message) {
  if (!message || typeof message !== 'string') return null;
  const trimmed = message.trim();
  // 匹配 [语音通话] 或 [语音通话请求] 或 [通话请求]
  if (/^\[(?:语音通话|语音通话请求|通话请求)\]$/.test(trimmed)) {
    return 'voice';
  }
  // 匹配 [视频通话] 或 [视频通话请求]
  if (/^\[(?:视频通话|视频通话请求)\]$/.test(trimmed)) {
    return 'video';
  }
  return null;
}

// 检测并提取通话请求（支持标签混在文字中的情况）
// 返回 { type: 'voice'|'video'|null, textBefore: string }
function extractCallRequest(message) {
  if (!message || typeof message !== 'string') return { type: null, textBefore: '' };

  // 先检查是否是纯通话标签
  const pureType = detectAiCallRequest(message);
  if (pureType) {
    return { type: pureType, textBefore: '' };
  }

  // 检查是否包含语音通话标签
  const voiceMatch = message.match(/\[(?:语音通话|语音通话请求|通话请求)\]/);
  if (voiceMatch) {
    const textBefore = message.replace(voiceMatch[0], '').trim();
    return { type: 'voice', textBefore };
  }

  // 检查是否包含视频通话标签
  const videoMatch = message.match(/\[(?:视频通话|视频通话请求)\]/);
  if (videoMatch) {
    const textBefore = message.replace(videoMatch[0], '').trim();
    return { type: 'video', textBefore };
  }

  return { type: null, textBefore: '' };
}

// 内部使用的别名
const detectAiCallRequestType = detectAiCallRequest;

// 检查聊天记录是否需要总结（单聊）
export function checkSummaryReminder(contact) {
  if (!contact || !contact.chatHistory) return;
  const count = contact.chatHistory.length;
  if (count >= CHAT_HISTORY_LIMIT) {
    showToast(`聊天记录已达${count}条，建议总结`, '⚠️', 4000);
  }
}

// 检查群聊记录是否需要总结
export function checkGroupSummaryReminder(groupChat) {
  if (!groupChat || !groupChat.chatHistory) return;
  const count = groupChat.chatHistory.length;
  if (count >= CHAT_HISTORY_LIMIT) {
    showToast(`群聊记录已达${count}条，建议总结`, '⚠️', 4000);
  }
}

// 解析用户表情包 token -> URL
function resolveUserStickerUrl(token, settings) {
  if (settings.userStickersEnabled === false) return null;
  const stickers = getUserStickers(settings);
  if (stickers.length === 0) return null;

  const raw = (token || '').toString().trim();
  if (!raw) return null;

  // 序号匹配
  if (/^\d+$/.test(raw)) {
    const index = parseInt(raw, 10) - 1;
    return stickers[index]?.url || null;
  }

  // 名称匹配
  const key = raw.toLowerCase();
  const byName = stickers.find(s => (s?.name || '').toLowerCase() === key);
  if (byName?.url) return byName.url;

  // 模糊匹配
  const fuzzy = stickers.find(s => {
    const name = (s?.name || '').toLowerCase();
    return name && (name.includes(key) || key.includes(name));
  });
  return fuzzy?.url || null;
}

// 去除引用内容中的简单重复模式
// 例如："不要不要" -> "不要", "好的好的" -> "好的", "哈哈哈哈" -> "哈哈"
function deduplicateQuoteContent(content) {
  if (!content || content.length < 2) return content;

  // 尝试检测重复模式：检查前半部分是否等于后半部分
  const len = content.length;
  if (len % 2 === 0) {
    const half = len / 2;
    const firstHalf = content.substring(0, half);
    const secondHalf = content.substring(half);
    if (firstHalf === secondHalf) {
      // 递归检查是否还有更短的重复
      return deduplicateQuoteContent(firstHalf);
    }
  }

  // 检测更复杂的重复模式（如"哈哈哈"由"哈"重复3次）
  for (let unitLen = 1; unitLen <= len / 2; unitLen++) {
    if (len % unitLen === 0) {
      const unit = content.substring(0, unitLen);
      const repeatCount = len / unitLen;
      let isRepeating = true;
      for (let i = 1; i < repeatCount; i++) {
        if (content.substring(i * unitLen, (i + 1) * unitLen) !== unit) {
          isRepeating = false;
          break;
        }
      }
      if (isRepeating && repeatCount > 1) {
        // 保留2次重复（如"哈哈"），超过2次的截断到2次
        const keepCount = Math.min(2, repeatCount);
        return unit.repeat(keepCount);
      }
    }
  }

  return content;
}

// 解析AI回复中的引用格式
// 格式: [回复:引用内容] 可以在消息任意位置
export function parseAIQuote(message, contact) {
  // 匹配 [回复:xxx] 格式，可以在任意位置
  const quoteMatch = message.match(/\[回复[：:]\s*(.+?)\]/);
  if (quoteMatch) {
    let quoteContent = quoteMatch[1].trim();

    // 修复AI重复引用内容的问题（如"不要不要"应该是"不要"）
    // 检测并去除简单的重复模式
    quoteContent = deduplicateQuoteContent(quoteContent);

    // 如果引用内容是"撤回"，表示AI混淆了格式，应该返回特殊标记让调用方处理为撤回
    if (quoteContent === '撤回') {
      const actualMessage = message.replace(quoteMatch[0], '').trim();
      return { content: actualMessage, quote: null, isRecallIntent: true };
    }

    // 移除引用标记，获取实际消息内容
    const actualMessage = message.replace(quoteMatch[0], '').trim();

    // 如果移除引用后没有实际内容，则不处理为引用
    if (!actualMessage) {
      return { content: message, quote: null };
    }

    const context = getContext();

    // 尝试在历史消息中找到被引用的消息
    const chatHistory = contact?.chatHistory || [];
    let sender = context?.name1 || '用户'; // 默认引用用户的消息
    let date = formatQuoteDate(Date.now());
    let isVoice = false;
    let isPhoto = false;
    let isSticker = false;
    let isMusic = false;
    let musicInfo = null;

    // 遍历历史消息，尝试匹配引用内容
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const historyMsg = chatHistory[i];
      // 对于表情消息，也检查 stickerDescription 字段
      const contentMatch = historyMsg.content && historyMsg.content.includes(quoteContent);
      const stickerDescMatch = historyMsg.isSticker && historyMsg.stickerDescription &&
        historyMsg.stickerDescription.includes(quoteContent);
      // 对于音乐消息：支持“歌名 / 歌手 / 歌手-歌名”等多种引用关键词
      const musicArtist = (historyMsg.musicInfo?.artist || '').toString();
      const musicName = (historyMsg.musicInfo?.name || '').toString();
      const musicArtistName = (musicArtist && musicName) ? `${musicArtist}-${musicName}` : '';
      const musicArtistNameSpaced = (musicArtist && musicName) ? `${musicArtist} - ${musicName}` : '';
      const musicMatch = historyMsg.isMusic && historyMsg.musicInfo && (
        (musicName && (musicName.includes(quoteContent) || quoteContent.includes(musicName))) ||
        (musicArtist && (musicArtist.includes(quoteContent) || quoteContent.includes(musicArtist))) ||
        (musicArtistName && (musicArtistName.includes(quoteContent) || quoteContent.includes(musicArtistName))) ||
        (musicArtistNameSpaced && (musicArtistNameSpaced.includes(quoteContent) || quoteContent.includes(musicArtistNameSpaced)))
      );

      if (contentMatch || stickerDescMatch || musicMatch) {
        if (historyMsg.role === 'user') {
          sender = context?.name1 || '用户';
        } else {
          sender = contact?.name || '对方';
        }
        date = formatQuoteDate(historyMsg.timestamp);
        isVoice = historyMsg.isVoice === true;
        isPhoto = historyMsg.isPhoto === true;
        isSticker = historyMsg.isSticker === true;
        isMusic = historyMsg.isMusic === true;
        if (isMusic && historyMsg.musicInfo) {
          musicInfo = historyMsg.musicInfo;
          // 修正引用内容为“歌手-歌名”格式（不加空格）
          const artist = (historyMsg.musicInfo.artist || '未知歌手').toString().trim();
          const name = (historyMsg.musicInfo.name || '').toString().trim();
          quoteContent = artist && name ? `${artist}-${name}` : (name || artist || quoteContent);
        }
        break;
      }
    }

    return {
      content: actualMessage,
      quote: {
        content: quoteContent,
        sender: sender,
        date: date,
        isVoice: isVoice,
        isPhoto: isPhoto,
        isSticker: isSticker,
        isMusic: isMusic,
        musicInfo: musicInfo
      }
    };
  }
  return { content: message, quote: null };
}

// 导出别名供 chat-func-panel.js 使用
export const parseAiQuoteMessage = parseAIQuote;

// 替换消息中的占位符
function replaceMessagePlaceholders(content) {
  if (!content) return content;
  const context = getContext();
  const userName = context?.name1 || 'User';
  // 替换 {{user}} 占位符（不区分大小写）
  return content.replace(/\{\{user\}\}/gi, userName);
}

// 设置当前聊天索引
export function setCurrentChatIndex(index) {
  currentChatIndex = index;
}

// 打开聊天界面
export function openChat(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  currentChatIndex = contactIndex;

  // 清除未读消息计数
  if (contact.unreadCount && contact.unreadCount > 0) {
    contact.unreadCount = 0;
    saveSettingsDebounced();
    refreshChatList();
  }

  document.getElementById('wechat-main-content').classList.add('hidden');
  document.getElementById('wechat-chat-page').classList.remove('hidden');
  document.getElementById('wechat-chat-title').textContent = contact.name;

  const messagesContainer = document.getElementById('wechat-chat-messages');
  const chatHistory = contact.chatHistory || [];

  if (chatHistory.length === 0) {
    messagesContainer.innerHTML = '';
  } else {
    messagesContainer.innerHTML = renderChatHistory(contact, chatHistory);
    bindVoiceBubbleEvents(messagesContainer);
    bindPhotoBubbleEvents(messagesContainer);
    bindMusicCardEvents(messagesContainer);
    bindMessageBubbleEvents(messagesContainer);
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 加载联系人的聊天背景
  loadContactBackground(contactIndex);
}

// 通过联系人ID打开聊天
export function openChatByContactId(contactId, index) {
  const settings = getSettings();
  let contactIndex = index;

  if (contactId && contactId.startsWith('contact_')) {
    const idx = settings.contacts.findIndex(c => c.id === contactId);
    if (idx >= 0) contactIndex = idx;
  }

  if (contactIndex >= 0 && contactIndex < settings.contacts.length) {
    openChat(contactIndex);
  }
}

// 渲染聊天历史
export function renderChatHistory(contact, chatHistory) {
  const firstChar = contact.name ? contact.name.charAt(0) : '?';
  const avatarContent = contact.avatar
    ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
    : firstChar;

  let html = '';
  let lastTimestamp = 0;
  const TIME_GAP_THRESHOLD = 5 * 60 * 1000;

  chatHistory.forEach((msg, index) => {
    const msgTimestamp = msg.timestamp || new Date(msg.time).getTime() || 0;

    // 跳过通话中的消息（只保存到历史记录，不显示为聊天气泡）
    if (msg.isVoiceCallMessage || msg.isVideoCallMessage) {
      return;
    }

    // 检查是否是总结标记消息
    if (msg.isMarker || msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
      const markerText = msg.content || '可乐已加冰';
      html += `<div class="wechat-msg-time">${escapeHtml(markerText)}</div>`;
      lastTimestamp = msgTimestamp;
      return;
    }

    // 检查是否是撤回的消息
    if (msg.isRecalled) {
      const recallText = msg.role === 'user' ? '你撤回了一条消息' : '对方撤回了一条消息';
      html += `<div class="wechat-msg-recalled">${escapeHtml(recallText)}</div>`;
      lastTimestamp = msgTimestamp;
      return;
    }

    // 检查是否是通话记录消息
    const callRecordMatch = (msg.content || '').match(/^\[通话记录[：:](.+?)\]$/);
    if (msg.isCallRecord || callRecordMatch) {
      const callInfo = callRecordMatch ? callRecordMatch[1] : '00:00';
      const isDuration = /^\d{2}:\d{2}$/.test(callInfo);
      const isCancelled = callInfo === '已取消';
      const isRejected = callInfo === '已拒绝';
      const isTimeout = callInfo === '对方已取消';

      // 线条电话图标
      const phoneIconSVG = `<svg class="wechat-call-record-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>`;

      let callRecordHTML;
      if (isDuration) {
        // 已接通：显示通话时长
        callRecordHTML = `
          <div class="wechat-call-record">
            <span class="wechat-call-record-text">通话时长 ${callInfo}</span>
            ${phoneIconSVG}
          </div>
        `;
      } else if (isCancelled) {
        // 用户发起未接通：已取消
        callRecordHTML = `
          <div class="wechat-call-record">
            <span class="wechat-call-record-text">已取消</span>
            ${phoneIconSVG}
          </div>
        `;
      } else if (isRejected) {
        // AI发起，用户主动拒绝（深灰色）
        callRecordHTML = `
          <div class="wechat-call-record wechat-call-rejected">
            ${phoneIconSVG}
            <span class="wechat-call-record-text">已拒绝</span>
          </div>
        `;
      } else if (isTimeout) {
        // AI发起，超时未接：对方已取消（绿色，图标在前）
        callRecordHTML = `
          <div class="wechat-call-record">
            ${phoneIconSVG}
            <span class="wechat-call-record-text">对方已取消</span>
          </div>
        `;
      } else {
        // 兜底：显示原始内容
        callRecordHTML = `
          <div class="wechat-call-record">
            <span class="wechat-call-record-text">${escapeHtml(callInfo)}</span>
            ${phoneIconSVG}
          </div>
        `;
      }

      if (msg.role === 'user') {
        html += `<div class="wechat-message self" data-msg-index="${index}" data-msg-role="user"><div class="wechat-message-avatar">${getUserAvatarHTML()}</div><div class="wechat-message-content"><div class="wechat-bubble wechat-call-record-bubble">${callRecordHTML}</div></div></div>`;
      } else {
        html += `<div class="wechat-message" data-msg-index="${index}" data-msg-role="assistant"><div class="wechat-message-avatar">${avatarContent}</div><div class="wechat-message-content"><div class="wechat-bubble wechat-call-record-bubble">${callRecordHTML}</div></div></div>`;
      }
      lastTimestamp = msgTimestamp;
      return;
    }

    // 检查是否是视频通话记录消息
    const videoCallRecordMatch = (msg.content || '').match(/^\[视频通话[：:](.+?)\]$/);
    if (msg.isVideoCallRecord || videoCallRecordMatch) {
      const callInfo = videoCallRecordMatch ? videoCallRecordMatch[1] : '00:00';
      const isDuration = /^\d{2}:\d{2}$/.test(callInfo);
      const isCancelled = callInfo === '已取消';
      const isRejected = callInfo === '已拒绝';
      const isTimeout = callInfo === '对方已取消';

      // 摄像机图标
      const cameraIconSVG = `<svg class="wechat-call-record-icon wechat-video-call-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="13" height="12" rx="2"/>
        <path d="M22 8l-7 4 7 4V8z"/>
      </svg>`;

      let videoCallRecordHTML;
      if (isDuration) {
        // 已接通：显示视频通话时长
        videoCallRecordHTML = `
          <div class="wechat-call-record wechat-video-call-record">
            <span class="wechat-call-record-text">视频通话 ${callInfo}</span>
            ${cameraIconSVG}
          </div>
        `;
      } else if (isCancelled) {
        // 用户发起未接通：已取消
        videoCallRecordHTML = `
          <div class="wechat-call-record wechat-video-call-record">
            <span class="wechat-call-record-text">已取消</span>
            ${cameraIconSVG}
          </div>
        `;
      } else if (isRejected) {
        // AI发起，用户主动拒绝（深灰色）
        videoCallRecordHTML = `
          <div class="wechat-call-record wechat-video-call-record wechat-call-rejected">
            ${cameraIconSVG}
            <span class="wechat-call-record-text">已拒绝</span>
          </div>
        `;
      } else if (isTimeout) {
        // AI发起，超时未接：对方已取消
        videoCallRecordHTML = `
          <div class="wechat-call-record wechat-video-call-record">
            ${cameraIconSVG}
            <span class="wechat-call-record-text">对方已取消</span>
          </div>
        `;
      } else {
        // 兜底：显示原始内容
        videoCallRecordHTML = `
          <div class="wechat-call-record wechat-video-call-record">
            <span class="wechat-call-record-text">${escapeHtml(callInfo)}</span>
            ${cameraIconSVG}
          </div>
        `;
      }

      if (msg.role === 'user') {
        html += `<div class="wechat-message self" data-msg-index="${index}" data-msg-role="user"><div class="wechat-message-avatar">${getUserAvatarHTML()}</div><div class="wechat-message-content"><div class="wechat-bubble wechat-call-record-bubble">${videoCallRecordHTML}</div></div></div>`;
      } else {
        html += `<div class="wechat-message" data-msg-index="${index}" data-msg-role="assistant"><div class="wechat-message-avatar">${avatarContent}</div><div class="wechat-message-content"><div class="wechat-bubble wechat-call-record-bubble">${videoCallRecordHTML}</div></div></div>`;
      }
      lastTimestamp = msgTimestamp;
      return;
    }

    if (index === 0 || (msgTimestamp - lastTimestamp > TIME_GAP_THRESHOLD)) {
      const timeLabel = formatMessageTime(msgTimestamp);
      if (timeLabel) {
        html += `<div class="wechat-msg-time">${timeLabel}</div>`;
      }
    }
    lastTimestamp = msgTimestamp;

    const isVoice = msg.isVoice === true;
    const isSticker = msg.isSticker === true;
    const isPhoto = msg.isPhoto === true;
    const isMusic = msg.isMusic === true;

    // 检查是否包含 ||| 分隔符（历史消息可能未正确分割）
    // 如果包含，则拆分成多个独立消息，每个都有自己的头像
    const msgContent = msg.content || '';
    if (!isVoice && !isSticker && !isPhoto && !isMusic && (msgContent.indexOf('|||') >= 0 || /<\\s*meme\\s*>/i.test(msgContent))) {
      const parts = (msgContent.indexOf('|||') >= 0
        ? msgContent.split('|||').map(function(p) { return p.trim(); }).filter(function(p) { return p; })
        : splitAIMessages(msgContent).map(function(p) { return (p || '').toString().trim(); }).filter(function(p) { return p; })
      );
      for (var pi = 0; pi < parts.length; pi++) {
        var partContent = parts[pi];
        // 解析 meme 标签
        var processedPart = parseMemeTag(partContent);
        var partHasMeme = processedPart !== partContent;
        var partBubble = '<div class="wechat-message-bubble">' + (partHasMeme ? processedPart : escapeHtml(partContent)) + '</div>';

        // 只有第一条消息带引用
        var partQuoteHtml = '';
        if (pi === 0 && msg.quote) {
          var quoteText;
          if (msg.quote.isVoice) {
            var seconds = Math.max(2, Math.min(60, Math.ceil((msg.quote.content || '').length / 3)));
            quoteText = '[语音] ' + seconds + '"';
          } else if (msg.quote.isPhoto) {
            quoteText = '[照片]';
          } else if (msg.quote.isSticker) {
            quoteText = '[表情]';
          } else {
            quoteText = msg.quote.content.length > 30
              ? msg.quote.content.substring(0, 30) + '...'
              : msg.quote.content;
          }
          partQuoteHtml = '<div class="wechat-msg-quote"><span class="wechat-msg-quote-sender">' + escapeHtml(msg.quote.sender) + ':</span><span class="wechat-msg-quote-text">' + escapeHtml(quoteText) + '</span></div>';
        }

        if (msg.role === 'user') {
          html += '<div class="wechat-message self" data-msg-index="' + index + '" data-msg-role="user"><div class="wechat-message-avatar">' + getUserAvatarHTML() + '</div><div class="wechat-message-content">' + partBubble + partQuoteHtml + '</div></div>';
        } else {
          html += '<div class="wechat-message" data-msg-index="' + index + '" data-msg-role="assistant"><div class="wechat-message-avatar">' + avatarContent + '</div><div class="wechat-message-content">' + partBubble + partQuoteHtml + '</div></div>';
        }
      }
      return; // 已处理完毕，跳过后续
    }

    let bubbleContent;

    if (isMusic && msg.musicInfo) {
      const musicInfo = msg.musicInfo;
      const platform = musicInfo.platform || '';
      const platformName = platform === 'netease' ? '网易云音乐' :
                           platform === 'qq' ? 'QQ音乐' :
                           platform === 'kuwo' ? '酷我音乐' : '音乐';
      const histMusicId = 'hist_music_' + Math.random().toString(36).substring(2, 9);
      bubbleContent = `
        <div class="wechat-music-card" id="${histMusicId}" data-song-id="${escapeHtml(musicInfo.id || '')}" data-platform="${escapeHtml(platform)}" data-name="${escapeHtml(musicInfo.name || '')}" data-artist="${escapeHtml(musicInfo.artist || '')}" data-cover="${escapeHtml(musicInfo.cover || '')}">
          <div class="wechat-music-card-cover">
            <img src="${musicInfo.cover || ''}" alt="" onerror="this.style.display='none'">
          </div>
          <div class="wechat-music-card-info">
            <div class="wechat-music-card-name">${escapeHtml(musicInfo.name || '未知歌曲')}</div>
            <div class="wechat-music-card-artist">${escapeHtml(musicInfo.artist || '')}</div>
          </div>
          <div class="wechat-music-card-play">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="6,4 20,12 6,20"/></svg>
          </div>
        </div>
        <div class="wechat-music-card-footer">${escapeHtml(platformName)}</div>
      `;
    } else if (isSticker) {
      const stickerId = 'hist_sticker_' + Math.random().toString(36).substring(2, 9);
      bubbleContent = `<div class="wechat-sticker-bubble"><img id="${stickerId}" src="${msg.content}" alt="表情" class="wechat-sticker-img" onerror="console.error('[可乐] 历史表情加载失败:', this.src?.substring(0,50)); this.alt='图片加载失败'; this.style.border='2px dashed #ff4d4f'; this.style.padding='10px';"></div>`;
    } else if (isPhoto) {
      const photoId = 'photo_' + Math.random().toString(36).substring(2, 9);
      bubbleContent = `
        <div class="wechat-photo-bubble" data-photo-id="${photoId}">
          <div class="wechat-photo-content" id="${photoId}-content">${escapeHtml(msg.content)}</div>
          <div class="wechat-photo-blur" id="${photoId}-blur">
            <div class="wechat-photo-icon">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1.5 16H7.5L6 4z"/><path d="M6 4c0-1 1-2 6-2s6 1 6 2"/><path d="M9 8h6"/><circle cx="15" cy="6" r="0.5" fill="currentColor"/><circle cx="11" cy="7" r="0.5" fill="currentColor"/></svg>
            </div>
            <span class="wechat-photo-hint">点击查看</span>
          </div>
        </div>
      `;
    } else if (isVoice) {
      bubbleContent = generateVoiceBubbleStatic(msg.content, msg.role === 'user');
    } else {
      // 普通文本消息（没有 ||| 分隔符）
      const processedContent = parseMemeTag(msgContent);
      const hasMeme = processedContent !== msgContent;
      bubbleContent = `<div class="wechat-message-bubble">${hasMeme ? processedContent : escapeHtml(msgContent)}</div>`;
    }

    // 添加引用条（如果有）
    let quoteHtml = '';
    if (msg.quote) {
      let quoteText;
      if (msg.quote.isVoice) {
        const seconds = Math.max(2, Math.min(60, Math.ceil((msg.quote.content || '').length / 3)));
        quoteText = `[语音] ${seconds}"`;
      } else if (msg.quote.isPhoto) {
        quoteText = '[照片]';
      } else if (msg.quote.isSticker) {
        quoteText = '[表情]';
      } else {
        quoteText = msg.quote.content.length > 30
          ? msg.quote.content.substring(0, 30) + '...'
          : msg.quote.content;
      }
      quoteHtml = `
        <div class="wechat-msg-quote">
          <span class="wechat-msg-quote-sender">${escapeHtml(msg.quote.sender)}:</span>
          <span class="wechat-msg-quote-text">${escapeHtml(quoteText)}</span>
        </div>
      `;
    }

    if (msg.role === 'user') {
      html += `
        <div class="wechat-message self" data-msg-index="${index}" data-msg-role="user">
          <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
          <div class="wechat-message-content">${bubbleContent}${quoteHtml}</div>
        </div>
      `;
    } else {
      html += `
        <div class="wechat-message" data-msg-index="${index}" data-msg-role="assistant">
          <div class="wechat-message-avatar">${avatarContent}</div>
          <div class="wechat-message-content">${bubbleContent}${quoteHtml}</div>
        </div>
      `;
    }
  });

  return html;
}

// 生成静态语音气泡
export function generateVoiceBubbleStatic(content, isSelf) {
  const seconds = calculateVoiceDuration(content);
  const width = Math.min(60 + seconds * 4, 200);
  const voiceId = 'voice_' + Math.random().toString(36).substring(2, 9);

  // WiFi信号样式的三条弧线图标（统一使用相同的SVG，通过CSS控制方向）
  const wavesSvg = `<svg class="wechat-voice-waves-icon" viewBox="0 0 24 24" width="18" height="18">
      <circle class="wechat-voice-arc arc1" cx="6" cy="12" r="2" fill="currentColor"/>
      <path class="wechat-voice-arc arc2" d="M10 12a4 4 0 00-4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="wechat-voice-arc arc3" d="M14 12a8 8 0 00-8-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;

  // 用户消息：时长在左，波形在右
  // 角色消息：波形在左，时长在右
  const bubbleInner = isSelf
    ? `<span class="wechat-voice-duration">${seconds}"</span><span class="wechat-voice-waves">${wavesSvg}</span>`
    : `<span class="wechat-voice-waves">${wavesSvg}</span><span class="wechat-voice-duration">${seconds}"</span>`;

  return `
    <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" style="width: ${width}px" data-voice-id="${voiceId}" data-voice-content="${escapeHtml(content)}">
      ${bubbleInner}
    </div>
    <div class="wechat-voice-text hidden" id="${voiceId}">${escapeHtml(content)}</div>
  `;
}

// 生成动态语音气泡
export function generateVoiceBubble(content, isSelf) {
  const seconds = calculateVoiceDuration(content);
  const width = Math.min(60 + seconds * 4, 200);
  const uniqueId = 'voice_' + Math.random().toString(36).substring(2, 9);

  // WiFi信号样式的三条弧线图标（统一使用相同的SVG，通过CSS控制方向）
  const wavesSvg = `<svg class="wechat-voice-waves-icon" viewBox="0 0 24 24" width="18" height="18">
      <circle class="wechat-voice-arc arc1" cx="6" cy="12" r="2" fill="currentColor"/>
      <path class="wechat-voice-arc arc2" d="M10 12a4 4 0 00-4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="wechat-voice-arc arc3" d="M14 12a8 8 0 00-8-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;

  // 用户消息：时长在左，波形在右
  // 角色消息：波形在左，时长在右
  const bubbleInner = isSelf
    ? `<span class="wechat-voice-duration">${seconds}"</span><span class="wechat-voice-waves">${wavesSvg}</span>`
    : `<span class="wechat-voice-waves">${wavesSvg}</span><span class="wechat-voice-duration">${seconds}"</span>`;

  return {
    html: `
      <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" style="width: ${width}px" data-voice-id="${uniqueId}" data-voice-content="${escapeHtml(content)}">
        ${bubbleInner}
      </div>
      <div class="wechat-voice-text hidden" id="${uniqueId}">${escapeHtml(content)}</div>
    `,
    id: uniqueId
  };
}

// 隐藏所有语音菜单
function hideAllVoiceMenus() {
  document.querySelectorAll('.wechat-voice-menu.visible').forEach(menu => {
    menu.classList.remove('visible');
  });
  document.querySelectorAll('.wechat-voice-bubble[data-menu-open="true"]').forEach(bubble => {
    bubble.dataset.menuOpen = 'false';
  });
}

// 绑定语音气泡点击事件（播放动画）和长按菜单
export function bindVoiceBubbleEvents(container) {
  const voiceBubbles = container.querySelectorAll('.wechat-voice-bubble:not([data-bound])');
  voiceBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');

    let longPressTimer = null;
    let isLongPress = false;

    // 获取父消息元素判断是否是用户消息
    const messageEl = bubble.closest('.wechat-message');
    const isUserMessage = messageEl?.classList.contains('self');
    const voiceId = bubble.dataset.voiceId;

    // 长按开始
    const startLongPress = (e) => {
      isLongPress = false;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        if (isUserMessage) {
          showVoiceMenu(bubble, messageEl, voiceId);
        }
      }, 500);
    };

    // 长按取消
    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    // 触摸事件
    bubble.addEventListener('touchstart', startLongPress, { passive: true });
    bubble.addEventListener('touchend', (e) => {
      cancelLongPress();
      if (isLongPress) {
        e.preventDefault();
      }
    });
    bubble.addEventListener('touchmove', cancelLongPress, { passive: true });

    // 鼠标事件（PC端）
    bubble.addEventListener('mousedown', startLongPress);
    bubble.addEventListener('mouseup', cancelLongPress);
    bubble.addEventListener('mouseleave', cancelLongPress);

    // 点击播放动画
    bubble.addEventListener('click', (e) => {
      // 如果是长按或正在显示菜单，不处理点击
      if (isLongPress) {
        isLongPress = false;
        return;
      }
      if (bubble.dataset.menuOpen === 'true') {
        hideAllVoiceMenus();
        return;
      }

      // 切换播放状态
      const isPlaying = bubble.classList.contains('playing');
      if (isPlaying) {
        bubble.classList.remove('playing');
      } else {
        // 停止其他正在播放的语音
        document.querySelectorAll('.wechat-voice-bubble.playing').forEach(b => {
          b.classList.remove('playing');
        });
        bubble.classList.add('playing');

        // 模拟播放时间后停止
        const duration = parseInt(bubble.querySelector('.wechat-voice-duration')?.textContent) || 3;
        setTimeout(() => {
          bubble.classList.remove('playing');
        }, duration * 1000);
      }
    });
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.wechat-voice-menu') && !e.target.closest('.wechat-voice-bubble')) {
      hideAllVoiceMenus();
    }
  }, { once: false });
}

// 显示语音消息长按菜单
function showVoiceMenu(bubble, messageEl, voiceId) {
  hideAllVoiceMenus();

  // 检查是否已有菜单
  let menu = messageEl.querySelector('.wechat-voice-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'wechat-voice-menu';

    // 检查转文字状态
    const textEl = document.getElementById(voiceId);
    const isTextVisible = textEl?.classList.contains('visible');

    menu.innerHTML = `
      <div class="wechat-voice-menu-item" data-action="transcribe">${isTextVisible ? '收起文字' : '转文字'}</div>
      <div class="wechat-voice-menu-item" data-action="quote">引用</div>
      <div class="wechat-voice-menu-item" data-action="recall">撤回</div>
      <div class="wechat-voice-menu-item" data-action="delete">删除</div>
    `;

    // 将菜单添加到消息内容区域
    const contentEl = messageEl.querySelector('.wechat-message-content');
    if (contentEl) {
      contentEl.style.position = 'relative';
      contentEl.appendChild(menu);
    }

    // 绑定菜单项点击事件
    menu.querySelectorAll('.wechat-voice-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        handleVoiceMenuAction(action, bubble, messageEl, voiceId, menu);
      });
    });
  }

  menu.classList.add('visible');
  bubble.dataset.menuOpen = 'true';
}

// 处理语音菜单操作
function handleVoiceMenuAction(action, bubble, messageEl, voiceId, menu) {
  hideAllVoiceMenus();

  const textEl = document.getElementById(voiceId);
  const msgIndex = parseInt(messageEl.dataset.msgIndex);
  const voiceContent = bubble.dataset.voiceContent || '';

  switch (action) {
    case 'transcribe':
      // 切换转文字显示
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
      break;

    case 'quote':
      // 引用语音消息
      const context = getContext();
      const sender = context?.name1 || '用户';
      setQuote({
        content: voiceContent,
        sender: sender,
        isVoice: true
      });
      showToast('已引用语音', '✅');
      break;

    case 'recall':
      // 撤回消息
      if (!isNaN(msgIndex) && currentChatIndex >= 0) {
        const settings = getSettings();
        const contact = settings.contacts[currentChatIndex];
        if (contact?.chatHistory?.[msgIndex]) {
          contact.chatHistory[msgIndex].isRecalled = true;
          contact.chatHistory[msgIndex].originalContent = contact.chatHistory[msgIndex].content;
          contact.chatHistory[msgIndex].content = '';
          saveSettingsDebounced();
          openChat(currentChatIndex);
          showToast('已撤回', '✅');
        }
      }
      break;

    case 'delete':
      // 删除消息
      if (!isNaN(msgIndex) && currentChatIndex >= 0) {
        const settings = getSettings();
        const contact = settings.contacts[currentChatIndex];
        if (contact?.chatHistory) {
          contact.chatHistory.splice(msgIndex, 1);
          saveSettingsDebounced();
          openChat(currentChatIndex);
          showToast('已删除', '✅');
        }
      }
      break;
  }
}

// 绑定照片气泡点击事件（toggle切换蒙层）
export function bindPhotoBubbleEvents(container) {
  const photoBubbles = container.querySelectorAll('.wechat-photo-bubble:not([data-bound])');
  photoBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');
    bubble.addEventListener('click', () => {
      const photoId = bubble.dataset.photoId;
      const blurEl = document.getElementById(`${photoId}-blur`);
      if (blurEl) {
        blurEl.classList.toggle('hidden');
      }
    });
  });
}

// 绑定音乐卡片点击事件
export function bindMusicCardEvents(container) {
  const musicCards = container.querySelectorAll('.wechat-music-card:not([data-bound])');
  musicCards.forEach(card => {
    card.setAttribute('data-bound', 'true');
    card.addEventListener('click', function() {
      const id = this.dataset.songId;
      const platform = this.dataset.platform;
      const name = this.dataset.name;
      const artist = this.dataset.artist;
      if (id && platform) {
        kugouPlayMusic(id, platform, name, artist);
      }
    });
  });
}

// 追加消息到聊天界面
export function appendMessage(role, content, contact, isVoice = false, quote = null) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = role === 'user'
    ? getUserAvatarHTML()
    : (contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar);

  let bubbleContent;
  if (isVoice) {
    const voiceResult = generateVoiceBubble(content, role === 'user');
    bubbleContent = voiceResult.html;
  } else {
    // 解析 meme 标签，如果有则渲染图片，否则转义 HTML
    const processedContent = parseMemeTag(content);
    const hasMeme = processedContent !== content;
    bubbleContent = `<div class="wechat-message-bubble">${hasMeme ? processedContent : escapeHtml(content)}</div>`;
  }

  // 添加引用条（如果有）
  let quoteHtml = '';
  if (quote) {
    let quoteText;
    if (quote.isVoice) {
      const seconds = Math.max(2, Math.min(60, Math.ceil((quote.content || '').length / 3)));
      quoteText = `[语音] ${seconds}"`;
    } else if (quote.isPhoto) {
      quoteText = '[照片]';
    } else if (quote.isSticker) {
      quoteText = '[表情]';
    } else {
      quoteText = quote.content.length > 30
        ? quote.content.substring(0, 30) + '...'
        : quote.content;
    }
    quoteHtml = `
      <div class="wechat-msg-quote">
        <span class="wechat-msg-quote-sender">${escapeHtml(quote.sender)}:</span>
        <span class="wechat-msg-quote-text">${escapeHtml(quoteText)}</span>
      </div>
    `;
  }

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">${bubbleContent}${quoteHtml}</div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定事件
  bindMessageBubbleEvents(messagesContainer);
  if (isVoice) {
    bindVoiceBubbleEvents(messagesContainer);
  }
}

// 显示打字中指示器
export function showTypingIndicator(contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  hideTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-message wechat-typing-wrapper';
  typingDiv.id = 'wechat-typing-indicator';

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = contact?.avatar
    ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
    : firstChar;

  typingDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-message-bubble wechat-typing">
        <span class="wechat-typing-dot"></span>
        <span class="wechat-typing-dot"></span>
        <span class="wechat-typing-dot"></span>
      </div>
    </div>
  `;

  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 隐藏打字中指示器
export function hideTypingIndicator() {
  const indicator = document.getElementById('wechat-typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// 发送消息
export async function sendMessage(messageText, isMultipleMessages = false, isVoice = false) {
  if (currentChatIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  // 保存当前聊天的联系人索引，用于后续检查用户是否还在此聊天
  const contactIndex = currentChatIndex;

  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  let messagesToSend = [];
  if (isMultipleMessages && Array.isArray(messageText)) {
    messagesToSend = messageText.filter(m => m.trim());
  } else if (typeof messageText === 'string' && messageText.trim()) {
    messagesToSend = [messageText.trim()];
  }

  if (messagesToSend.length === 0) return;

  // 获取待引用消息
  const quote = getPendingQuote();

  const input = document.getElementById('wechat-input');
  if (input) input.value = '';
  // 更新发送按钮状态
  window.updateSendButtonState?.();
  // 清除引用
  clearQuote();

  const msgTimestamp = Date.now();

  for (let i = 0; i < messagesToSend.length; i++) {
    const msg = messagesToSend[i];
    // 只有第一条消息带引用
    const msgQuote = (i === 0) ? quote : null;
    appendMessage('user', msg, contact, isVoice, msgQuote);
    // 立即保存用户消息到历史记录（防止用户离开后消息丢失）
    contact.chatHistory.push({
      role: 'user',
      content: msg,
      time: timeStr,
      timestamp: msgTimestamp,
      isVoice: isVoice,
      quote: msgQuote || undefined
    });
    if (i < messagesToSend.length - 1) {
      await sleep(300);
    }
  }

  contact.lastMessage = isVoice ? '[语音消息]' : messagesToSend[messagesToSend.length - 1];
  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();
  refreshChatList();

  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    // 动态导入 ai.js 以调用 AI
    const { callAI } = await import('./ai.js');

    // 构建消息内容（包含引用上下文）
    let combinedMessage = isVoice
      ? `[用户发送了语音消息，内容是：${messagesToSend.join('\n')}]`
      : messagesToSend.join('\n');

    // 如果有引用，添加引用上下文
    if (quote) {
      combinedMessage = `[用户引用了「${quote.sender}」的消息:「${quote.content}」进行回复]\n${combinedMessage}`;
    }

    const aiResponse = await callAI(contact, combinedMessage);

    // 只有用户还在当前聊天时才隐藏打字指示器
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }

    const aiMessages = splitAIMessages(aiResponse);

    // 逐条显示 AI 回复，每条消息之间间隔约1秒
    for (let i = 0; i < aiMessages.length; i++) {
      let aiMsg = aiMessages[i];
      let aiIsVoice = false;
      let aiIsSticker = false;
      let aiIsPhoto = false;
      let aiIsMusic = false;
      let aiMusicInfo = null;
      let stickerUrl = null;
      let aiQuote = null;

      const voiceMatch = aiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        aiMsg = voiceMatch[1];
        aiIsVoice = true;
      }

      // 解析AI照片格式 [照片:描述]
      const photoMatch = aiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
      if (photoMatch) {
        aiMsg = photoMatch[1];
        aiIsPhoto = true;
      }

      // 解析AI分享音乐格式：
      // 1. [分享音乐:歌名] 或 [音乐:歌名] 或 [音乐分享:歌名] - 带冒号格式
      // 2. [分享音乐] 歌名 - 歌手 - 无冒号格式（支持markdown格式）
      // 3. [音乐分享: 《歌名》 - 歌手] - 带书名号格式
      let musicKeyword = null;
      // 匹配各种音乐分享格式
      const musicMatchColon = aiMsg.match(/^\[(?:分享音乐|音乐分享|音乐)[：:]\s*(?:《)?(.+?)(?:》)?\]$/);
      // 支持 [分享音乐] **歌名 - 歌手** 这种带markdown的格式
      const musicMatchNoColon = aiMsg.match(/^\[(?:分享音乐|音乐分享)\]\s*\*{0,2}([^*\n]+?)(?:\*{0,2}.*)?$/);
      if (musicMatchColon && !aiIsVoice && !aiIsPhoto) {
        musicKeyword = musicMatchColon[1].trim();
      } else if (musicMatchNoColon && !aiIsVoice && !aiIsPhoto) {
        musicKeyword = musicMatchNoColon[1].trim();
      }
      if (musicKeyword) {
        try {
          aiMusicInfo = await aiShareMusic(musicKeyword);
          if (aiMusicInfo) {
            aiIsMusic = true;
          }
        } catch (e) {
          console.error('[可乐] AI音乐分享失败:', e);
        }
      }

      // 解析AI朋友圈格式 [朋友圈:文案内容]
      // 支持多行内容，可能包含 [照片:描述] 和位置信息
      const momentMatch = aiMsg.match(/^\[朋友圈[：:]\s*(.+)\]$/s);
      if (momentMatch) {
        let momentText = momentMatch[1].trim();
        console.log('[可乐] AI发布朋友圈:', momentText);

        // 提取内嵌的图片描述 [配图:xxx]（朋友圈专用格式，避免与聊天照片冲突）
        const images = [];
        const embeddedPhotoRegex = /\[配图[：:]\s*(.+?)\]/g;
        let embeddedMatch;
        while ((embeddedMatch = embeddedPhotoRegex.exec(momentText)) !== null) {
          images.push(embeddedMatch[1].trim());
        }
        // 移除内嵌的配图标签，保留纯文案
        momentText = momentText.replace(embeddedPhotoRegex, '').trim();

        // 检查后续消息是否有配图（兼容旧格式[照片:]）
        for (let j = i + 1; j < aiMessages.length && j < i + 5; j++) {
          const nextMsg = aiMessages[j];
          const imgMatch = nextMsg.match(/^\[(?:配图|照片)[：:]\s*(.+?)\]$/);
          if (imgMatch) {
            images.push(imgMatch[1].trim());
          }
        }

        // 添加到联系人的朋友圈
        addMomentToContact(contact.id, {
          text: momentText,
          images: images
        });

        // 显示顶部通知横幅
        showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
        saveSettingsDebounced();
        refreshChatList();
        continue; // 跳过后续处理，继续下一条消息
      }

      // 解析AI撤回格式 [撤回] 或 [撤回了一条消息]
      const recallMatch = aiMsg.match(/^\[撤回(?:了一条消息)?\]$/);
      if (recallMatch) {
        // 找到AI的上一条消息并标记为撤回
        // 等待5秒让用户看到消息内容后再撤回
        await sleep(5000);
        for (let j = contact.chatHistory.length - 1; j >= 0; j--) {
          const histMsg = contact.chatHistory[j];
          if (histMsg.role === 'assistant' && !histMsg.isRecalled && !histMsg.isMarker) {
            histMsg.isRecalled = true;
            histMsg.originalContent = histMsg.content;
            histMsg.content = '';
            console.log('[可乐] AI撤回了消息:', histMsg.originalContent?.substring(0, 30));
            break;
          }
        }
        // 立即保存撤回状态
        saveSettingsDebounced();
        // 只有用户还在当前聊天时才刷新界面
        if (currentChatIndex === contactIndex) {
          openChat(currentChatIndex);
        }
        continue; // 跳过后续处理，继续下一条消息
      }

      // 解析 AI 发起通话请求标签（支持标签混在文字中的情况）
      const callExtract = extractCallRequest(aiMsg);
      if (callExtract.type) {
        // 如果有文字在标签前面，先发送文字消息
        if (callExtract.textBefore) {
          const inChat = currentChatIndex === contactIndex;
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1000);
            hideTypingIndicator();
          }
          // 解析引用格式
          const parsedText = parseAIQuote(callExtract.textBefore, contact);
          const textContent = replaceMessagePlaceholders(parsedText.content);
          contact.chatHistory.push({
            role: 'assistant',
            content: textContent,
            time: timeStr,
            timestamp: Date.now(),
            quote: parsedText.quote
          });
          if (inChat) {
            appendMessage('assistant', textContent, contact, false, parsedText.quote);
          } else {
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            saveSettingsDebounced();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          saveSettingsDebounced();
        }

        console.log(`[可乐] AI发起${callExtract.type === 'voice' ? '语音' : '视频'}通话`);
        if (callExtract.type === 'voice') {
          startVoiceCall('ai', contactIndex);
        } else {
          startVideoCall('ai', contactIndex);
        }
        break; // 通话请求后忽略同一轮中的其它输出
      }

      // 解析AI表情包格式 [表情:序号] / [表情:名称]
      const stickerMatch = aiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
      console.log('[可乐] AI表情包解析:', {
        原始消息: aiMsg,
        正则匹配结果: stickerMatch,
        消息长度: aiMsg.length
      });
      if (stickerMatch) {
        const settings = getSettings();
        const token = (stickerMatch[1] || '').trim();
        stickerUrl = resolveUserStickerUrl(token, settings);
        if (stickerUrl) {
          aiIsSticker = true;
          console.log('[可乐] AI表情包匹配成功:', {
            token,
            stickerUrl: stickerUrl?.substring(0, 60),
            aiIsSticker
          });
        } else {
          console.log('[可乐] AI表情包未找到对应表情:', { token });
        }
      }

      // 解析AI引用格式
      let isRecallIntent = false;
      if (!aiIsSticker && !aiIsPhoto) {
        const parsedMsg = parseAIQuote(aiMsg, contact);
        aiMsg = parsedMsg.content;
        aiQuote = parsedMsg.quote;
        isRecallIntent = parsedMsg.isRecallIntent === true;
      }

      // 替换占位符
      aiMsg = replaceMessagePlaceholders(aiMsg);

      // 如果是撤回意图（AI错误使用了[回复:撤回]格式）
      // 先发送消息，然后等待后撤回
      if (isRecallIntent && aiMsg) {
        // 检查用户是否还在当前聊天
        const inChat = currentChatIndex === contactIndex;

        // 每条消息都要有typing效果和2-2.5秒延迟
      showTypingIndicator(contact);
      await sleep(2000 + Math.random() * 500); // 2-2.5秒延迟
      hideTypingIndicator();

        // 先发送这条消息
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isVoice: aiIsVoice
        });

        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice);
        }

        // 等待5秒后撤回刚发的消息
        await sleep(5000);
        const lastHistMsg = contact.chatHistory[contact.chatHistory.length - 1];
        if (lastHistMsg && lastHistMsg.role === 'assistant' && !lastHistMsg.isRecalled) {
          lastHistMsg.isRecalled = true;
          lastHistMsg.originalContent = lastHistMsg.content;
          lastHistMsg.content = '';
          console.log('[可乐] AI撤回了消息(通过[回复:撤回]格式):', lastHistMsg.originalContent?.substring(0, 30));
        }

        // 立即保存撤回状态
        saveSettingsDebounced();
        if (currentChatIndex === contactIndex) {
          openChat(currentChatIndex);
        }
        continue;
      }

      // 检查用户是否还在当前聊天界面
      const inChat = currentChatIndex === contactIndex;

      // 每条消息都要有typing效果和2-2.5秒延迟
      showTypingIndicator(contact);
      await sleep(2000 + Math.random() * 500); // 2-2.5秒延迟
      hideTypingIndicator();

      if (aiIsSticker && stickerUrl) {
        contact.chatHistory.push({
          role: 'assistant',
          content: stickerUrl,
          time: timeStr,
          timestamp: Date.now(),
          isSticker: true
        });
        if (inChat) {
          appendStickerMessage('assistant', stickerUrl, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else if (aiIsMusic && aiMusicInfo) {
        // AI分享音乐
        contact.chatHistory.push({
          role: 'assistant',
          content: `[分享音乐] ${aiMusicInfo.name}`,
          time: timeStr,
          timestamp: Date.now(),
          isMusic: true,
          musicInfo: {
            name: aiMusicInfo.name,
            artist: aiMusicInfo.artist,
            platform: aiMusicInfo.platform,
            cover: aiMusicInfo.cover,
            id: aiMusicInfo.id
          }
        });
        if (inChat) {
          appendMusicCardMessage('assistant', aiMusicInfo, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else if (aiIsPhoto) {
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isPhoto: true
        });
        if (inChat) {
          appendPhotoMessage('assistant', aiMsg, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else {
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isVoice: aiIsVoice,
          quote: aiQuote
        });
        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice, aiQuote);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      }
    }

    let lastAiMsg = aiMessages[aiMessages.length - 1];
    const lastVoiceMatch = lastAiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
    const lastPhotoMatch = lastAiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
    const lastMusicMatch = lastAiMsg.match(/^\[(?:分享)?音乐[：:]\s*(.+?)\]$/) ||
                           lastAiMsg.match(/^\[分享音乐\]\s*\*{0,2}[^*\n]+/);
    const lastStickerMatch = lastAiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
    const lastStickerUrl = lastStickerMatch ? resolveUserStickerUrl(lastStickerMatch[1], getSettings()) : null;
    if (lastVoiceMatch) {
      lastAiMsg = lastVoiceMatch[1];
    }
    // 解析引用格式获取实际消息
    const lastParsed = parseAIQuote(lastAiMsg, contact);
    lastAiMsg = lastParsed.content;
    // 替换占位符
    lastAiMsg = replaceMessagePlaceholders(lastAiMsg);
    contact.lastMessage = lastStickerUrl ? '[表情]' : (lastMusicMatch ? '[音乐]' : (lastPhotoMatch ? '[照片]' : (lastVoiceMatch ? '[语音消息]' : lastAiMsg)));
    saveSettingsDebounced();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(currentChatIndex);

  } catch (err) {
    hideTypingIndicator();
    console.error('[可乐] AI 调用失败:', err);

    appendMessage('assistant', `⚠️ ${err.message}`, contact);
  }
}

// 发送表情贴纸消息
export async function sendStickerMessage(stickerUrl, description = '') {
  if (currentChatIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  // 保存当前聊天的联系人索引
  const contactIndex = currentChatIndex;

  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // 保存到聊天历史
  contact.chatHistory.push({
    role: 'user',
    content: stickerUrl,
    time: timeStr,
    timestamp: msgTimestamp,
    isSticker: true,
    stickerDescription: description || ''
  });

  // 更新最后消息
  contact.lastMessage = '[表情]';
  contact.lastMsgTime = timeStr;

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();

  // 显示消息
  appendStickerMessage('user', stickerUrl, contact);

  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    // 调用 AI - 传递表情描述让 AI 理解
    const { callAI } = await import('./ai.js');
    const aiPrompt = description
      ? `[用户发送了一个表情包：${description}]`
      : '[用户发送了一个表情包]';
    const aiResponse = await callAI(contact, aiPrompt);

    // 只有用户还在当前聊天时才隐藏打字指示器
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }

    const aiMessages = splitAIMessages(aiResponse);

    // 逐条显示 AI 回复
    for (let i = 0; i < aiMessages.length; i++) {
      let aiMsg = aiMessages[i];
      let aiIsVoice = false;
      let aiIsSticker = false;
      let aiIsPhoto = false;
      let stickerUrl = null;

      const voiceMatch = aiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        aiMsg = voiceMatch[1];
        aiIsVoice = true;
      }

      // 解析AI照片格式 [照片:描述]
      const photoMatch = aiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
      if (photoMatch) {
        aiMsg = photoMatch[1];
        aiIsPhoto = true;
      }

      // 解析AI朋友圈格式 [朋友圈:文案内容]
      const momentMatchSticker = aiMsg.match(/^\[朋友圈[：:]\s*(.+)\]$/s);
      if (momentMatchSticker) {
        let momentText = momentMatchSticker[1].trim();
        console.log('[可乐] AI发布朋友圈 (sendStickerMessage):', momentText);

        // 提取内嵌的图片描述 [配图:xxx]（朋友圈专用格式）
        const images = [];
        const embeddedPhotoRegex = /\[配图[：:]\s*(.+?)\]/g;
        let embeddedMatch;
        while ((embeddedMatch = embeddedPhotoRegex.exec(momentText)) !== null) {
          images.push(embeddedMatch[1].trim());
        }
        // 移除内嵌的配图标签，保留纯文案
        momentText = momentText.replace(embeddedPhotoRegex, '').trim();

        addMomentToContact(contact.id, { text: momentText, images: images });
        showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
        saveSettingsDebounced();
        continue;
      }

      // 解析AI撤回格式 [撤回] 或 [撤回了一条消息]
      const recallMatch = aiMsg.match(/^\[撤回(?:了一条消息)?\]$/);
      if (recallMatch) {
        // 等待5秒让用户看到消息内容后再撤回
        await sleep(5000);
        for (let j = contact.chatHistory.length - 1; j >= 0; j--) {
          const histMsg = contact.chatHistory[j];
          if (histMsg.role === 'assistant' && !histMsg.isRecalled && !histMsg.isMarker) {
            histMsg.isRecalled = true;
            histMsg.originalContent = histMsg.content;
            histMsg.content = '';
            break;
          }
        }
        // 立即保存撤回状态
        saveSettingsDebounced();
        if (currentChatIndex === contactIndex) {
          openChat(currentChatIndex);
        }
        continue;
      }

      // 解析 AI 发起通话请求标签（支持标签混在文字中的情况）
      const callExtractSticker = extractCallRequest(aiMsg);
      if (callExtractSticker.type) {
        if (callExtractSticker.textBefore) {
          const inChat = currentChatIndex === contactIndex;
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1000);
            hideTypingIndicator();
          }
          const parsedText = parseAIQuote(callExtractSticker.textBefore, contact);
          const textContent = replaceMessagePlaceholders(parsedText.content);
          contact.chatHistory.push({
            role: 'assistant',
            content: textContent,
            time: timeStr,
            timestamp: Date.now(),
            quote: parsedText.quote
          });
          if (inChat) {
            appendMessage('assistant', textContent, contact, false, parsedText.quote);
          } else {
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            saveSettingsDebounced();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          saveSettingsDebounced();
        }
        console.log(`[可乐] AI发起${callExtractSticker.type === 'voice' ? '语音' : '视频'}通话 (sendStickerMessage)`);
        if (callExtractSticker.type === 'voice') {
          startVoiceCall('ai', contactIndex);
        } else {
          startVideoCall('ai', contactIndex);
        }
        break;
      }

      // 解析AI表情包格式 [表情:序号] / [表情:名称]
      const stickerMatch = aiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
      console.log('[可乐] sendStickerMessage AI表情包解析:', {
        原始消息: aiMsg,
        正则匹配结果: stickerMatch
      });
      if (stickerMatch) {
        const token = (stickerMatch[1] || '').trim();
        stickerUrl = resolveUserStickerUrl(token, settings);
        console.log('[可乐] sendStickerMessage AI表情包匹配结果:', {
          token,
          resolved: !!stickerUrl
        });
        if (stickerUrl) aiIsSticker = true;
      }

      // 检查用户是否还在当前聊天界面
      const inChat = currentChatIndex === contactIndex;

      // 每条消息都要有typing效果和2-2.5秒延迟
      showTypingIndicator(contact);
      await sleep(2000 + Math.random() * 500); // 2-2.5秒延迟
      hideTypingIndicator();

      if (aiIsSticker && stickerUrl) {
        contact.chatHistory.push({
          role: 'assistant',
          content: stickerUrl,
          time: timeStr,
          timestamp: Date.now(),
          isSticker: true
        });
        if (inChat) {
          appendStickerMessage('assistant', stickerUrl, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else if (aiIsPhoto) {
        // 替换占位符
        aiMsg = replaceMessagePlaceholders(aiMsg);
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isPhoto: true
        });
        if (inChat) {
          appendPhotoMessage('assistant', aiMsg, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else {
        // 解析AI引用格式
        let isRecallIntent = false;
        const parsedMsg = parseAIQuote(aiMsg, contact);
        aiMsg = parsedMsg.content;
        const aiQuote = parsedMsg.quote;
        isRecallIntent = parsedMsg.isRecallIntent === true;

        // 替换占位符
        aiMsg = replaceMessagePlaceholders(aiMsg);

        // 如果是撤回意图（AI错误使用了[回复:撤回]格式）
        if (isRecallIntent && aiMsg) {
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1000);
            hideTypingIndicator();
          }

          contact.chatHistory.push({
            role: 'assistant',
            content: aiMsg,
            time: timeStr,
            timestamp: Date.now(),
            isVoice: aiIsVoice
          });
          if (inChat) {
            appendMessage('assistant', aiMsg, contact, aiIsVoice);
          }

          await sleep(5000);
          const lastHistMsg = contact.chatHistory[contact.chatHistory.length - 1];
          if (lastHistMsg && lastHistMsg.role === 'assistant' && !lastHistMsg.isRecalled) {
            lastHistMsg.isRecalled = true;
            lastHistMsg.originalContent = lastHistMsg.content;
            lastHistMsg.content = '';
          }
          // 立即保存撤回状态
          saveSettingsDebounced();
          if (currentChatIndex === contactIndex) {
            openChat(currentChatIndex);
          }
          continue;
        }

        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isVoice: aiIsVoice,
          quote: aiQuote
        });

        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice, aiQuote);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      }
    }

    let lastAiMsg = aiMessages[aiMessages.length - 1];
    const lastVoiceMatch = lastAiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
    const lastPhotoMatch = lastAiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
    const lastStickerMatch = lastAiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
    const lastStickerUrl = lastStickerMatch ? resolveUserStickerUrl(lastStickerMatch[1], getSettings()) : null;
    if (lastVoiceMatch) {
      lastAiMsg = lastVoiceMatch[1];
    }
    const lastParsed = parseAIQuote(lastAiMsg, contact);
    lastAiMsg = lastParsed.content;
    lastAiMsg = replaceMessagePlaceholders(lastAiMsg);
    contact.lastMessage = lastStickerUrl ? '[表情]' : (lastPhotoMatch ? '[照片]' : (lastVoiceMatch ? '[语音消息]' : lastAiMsg));
    saveSettingsDebounced();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(contactIndex);

  } catch (err) {
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }
    console.error('[可乐] AI 调用失败:', err);
    saveSettingsDebounced();
    refreshChatList();
    if (currentChatIndex === contactIndex) {
      appendMessage('assistant', `⚠️ ${err.message}`, contact);
    }
  }
}

// 添加表情消息到界面
export function appendStickerMessage(role, stickerUrl, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  // 调试：检查传入的 stickerUrl
  console.log('[可乐] appendStickerMessage 被调用:', {
    role,
    stickerUrl: stickerUrl?.substring(0, 80),
    stickerUrlType: typeof stickerUrl,
    stickerUrlLength: stickerUrl?.length
  });

  // 验证 stickerUrl
  if (!stickerUrl || typeof stickerUrl !== 'string') {
    console.error('[可乐] appendStickerMessage: stickerUrl 无效!', stickerUrl);
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = role === 'user'
    ? getUserAvatarHTML()
    : (contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar);

  const stickerId = 'sticker_' + Math.random().toString(36).substring(2, 9);

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-sticker-bubble">
        <img id="${stickerId}" src="${stickerUrl}" alt="表情" class="wechat-sticker-img">
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定图片加载错误处理
  const imgEl = document.getElementById(stickerId);
  if (imgEl) {
    bindImageLoadFallback(imgEl, {
      errorAlt: '图片加载失败',
      errorStyle: {
        border: '2px dashed #ff4d4f',
        padding: '10px',
        background: 'rgba(255,77,79,0.1)'
      },
      onFail: (baseSrc) => {
        console.error('[可乐] AI表情包图片加载失败:', {
          src: imgEl.src?.substring(0, 80),
          原始URL: (baseSrc || '').substring(0, 120),
          完整URL: stickerUrl
        });
      }
    });

    imgEl.addEventListener('load', () => {
      console.log('[可乐] AI表情包图片加载成功:', stickerUrl?.substring(0, 50));
    });
  }
}

// 处理照片描述（直接返回用户输入）
function preprocessPhotoDescription(description) {
  return description;
}

// 发送照片消息
export async function sendPhotoMessage(description) {
  if (currentChatIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  // 保存当前聊天的联系人索引
  const contactIndex = currentChatIndex;

  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // AI预处理照片描述
  const polishedDescription = await preprocessPhotoDescription(description);

  // 保存到聊天历史
  contact.chatHistory.push({
    role: 'user',
    content: polishedDescription,
    time: timeStr,
    timestamp: msgTimestamp,
    isPhoto: true
  });

  // 更新最后消息
  contact.lastMessage = '[照片]';
  contact.lastMsgTime = timeStr;

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();

  // 显示消息
  appendPhotoMessage('user', polishedDescription, contact);

  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    // 调用 AI
    const { callAI } = await import('./ai.js');
    const aiResponse = await callAI(contact, `[用户发送了一张照片，图片描述：${polishedDescription}]`);

    // 只有用户还在当前聊天时才隐藏打字指示器
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }

    const aiMessages = splitAIMessages(aiResponse);

    // 逐条显示 AI 回复
    for (let i = 0; i < aiMessages.length; i++) {
      let aiMsg = aiMessages[i];
      let aiIsVoice = false;
      let aiIsSticker = false;
      let aiIsPhoto = false;
      let stickerUrl = null;

      const voiceMatch = aiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        aiMsg = voiceMatch[1];
        aiIsVoice = true;
      }

      // 解析AI照片格式 [照片:描述]
      const photoMatch = aiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
      if (photoMatch) {
        aiMsg = photoMatch[1];
        aiIsPhoto = true;
      }

      // 解析AI朋友圈格式 [朋友圈:文案内容]
      const momentMatchPhoto = aiMsg.match(/^\[朋友圈[：:]\s*(.+)\]$/s);
      if (momentMatchPhoto) {
        let momentText = momentMatchPhoto[1].trim();
        console.log('[可乐] AI发布朋友圈 (sendPhotoMessage):', momentText);

        // 提取内嵌的图片描述 [配图:xxx]（朋友圈专用格式）
        const images = [];
        const embeddedPhotoRegex = /\[配图[：:]\s*(.+?)\]/g;
        let embeddedMatch;
        while ((embeddedMatch = embeddedPhotoRegex.exec(momentText)) !== null) {
          images.push(embeddedMatch[1].trim());
        }
        // 移除内嵌的配图标签，保留纯文案
        momentText = momentText.replace(embeddedPhotoRegex, '').trim();

        addMomentToContact(contact.id, { text: momentText, images: images });
        showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
        saveSettingsDebounced();
        continue;
      }

      // 解析AI撤回格式 [撤回] 或 [撤回了一条消息]
      const recallMatch = aiMsg.match(/^\[撤回(?:了一条消息)?\]$/);
      if (recallMatch) {
        // 等待5秒让用户看到消息内容后再撤回
        await sleep(5000);
        for (let j = contact.chatHistory.length - 1; j >= 0; j--) {
          const histMsg = contact.chatHistory[j];
          if (histMsg.role === 'assistant' && !histMsg.isRecalled && !histMsg.isMarker) {
            histMsg.isRecalled = true;
            histMsg.originalContent = histMsg.content;
            histMsg.content = '';
            break;
          }
        }
        // 立即保存撤回状态
        saveSettingsDebounced();
        if (currentChatIndex === contactIndex) {
          openChat(currentChatIndex);
        }
        continue;
      }

      // 解析 AI 发起通话请求标签（支持标签混在文字中的情况）
      const callExtractPhoto = extractCallRequest(aiMsg);
      if (callExtractPhoto.type) {
        if (callExtractPhoto.textBefore) {
          const inChat = currentChatIndex === contactIndex;
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1000);
            hideTypingIndicator();
          }
          const parsedText = parseAIQuote(callExtractPhoto.textBefore, contact);
          const textContent = replaceMessagePlaceholders(parsedText.content);
          contact.chatHistory.push({
            role: 'assistant',
            content: textContent,
            time: timeStr,
            timestamp: Date.now(),
            quote: parsedText.quote
          });
          if (inChat) {
            appendMessage('assistant', textContent, contact, false, parsedText.quote);
          } else {
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            saveSettingsDebounced();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          saveSettingsDebounced();
        }
        console.log(`[可乐] AI发起${callExtractPhoto.type === 'voice' ? '语音' : '视频'}通话 (sendPhotoMessage)`);
        if (callExtractPhoto.type === 'voice') {
          startVoiceCall('ai', contactIndex);
        } else {
          startVideoCall('ai', contactIndex);
        }
        break;
      }

      // 解析AI表情包格式 [表情:序号] / [表情:名称]
      const stickerMatch = aiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
      console.log('[可乐] sendPhotoMessage AI表情包解析:', {
        原始消息: aiMsg,
        正则匹配结果: stickerMatch
      });
      if (stickerMatch) {
        const token = (stickerMatch[1] || '').trim();
        stickerUrl = resolveUserStickerUrl(token, settings);
        console.log('[可乐] sendPhotoMessage AI表情包匹配结果:', {
          token,
          resolved: !!stickerUrl
        });
        if (stickerUrl) aiIsSticker = true;
      }

      // 检查用户是否还在当前聊天界面
      const inChat = currentChatIndex === contactIndex;

      // 每条消息都要有typing效果和2-2.5秒延迟
      showTypingIndicator(contact);
      await sleep(2000 + Math.random() * 500); // 2-2.5秒延迟
      hideTypingIndicator();

      if (aiIsSticker && stickerUrl) {
        contact.chatHistory.push({
          role: 'assistant',
          content: stickerUrl,
          time: timeStr,
          timestamp: Date.now(),
          isSticker: true
        });
        if (inChat) {
          appendStickerMessage('assistant', stickerUrl, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else if (aiIsPhoto) {
        // 替换占位符
        aiMsg = replaceMessagePlaceholders(aiMsg);
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isPhoto: true
        });
        if (inChat) {
          appendPhotoMessage('assistant', aiMsg, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else {
        // 解析AI引用格式
        let isRecallIntent = false;
        const parsedMsg = parseAIQuote(aiMsg, contact);
        aiMsg = parsedMsg.content;
        const aiQuote = parsedMsg.quote;
        isRecallIntent = parsedMsg.isRecallIntent === true;

        // 替换占位符
        aiMsg = replaceMessagePlaceholders(aiMsg);

        // 如果是撤回意图（AI错误使用了[回复:撤回]格式）
        if (isRecallIntent && aiMsg) {
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1000);
            hideTypingIndicator();
          }

          contact.chatHistory.push({
            role: 'assistant',
            content: aiMsg,
            time: timeStr,
            timestamp: Date.now(),
            isVoice: aiIsVoice
          });
          if (inChat) {
            appendMessage('assistant', aiMsg, contact, aiIsVoice);
          }

          await sleep(5000);
          const lastHistMsg = contact.chatHistory[contact.chatHistory.length - 1];
          if (lastHistMsg && lastHistMsg.role === 'assistant' && !lastHistMsg.isRecalled) {
            lastHistMsg.isRecalled = true;
            lastHistMsg.originalContent = lastHistMsg.content;
            lastHistMsg.content = '';
          }
          // 立即保存撤回状态
          saveSettingsDebounced();
          if (currentChatIndex === contactIndex) {
            openChat(currentChatIndex);
          }
          continue;
        }

        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isVoice: aiIsVoice,
          quote: aiQuote
        });

        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice, aiQuote);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      }
    }

    let lastAiMsg = aiMessages[aiMessages.length - 1];
    const lastVoiceMatch = lastAiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
    const lastPhotoMatch = lastAiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
    const lastStickerMatch = lastAiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
    const lastStickerUrl = lastStickerMatch ? resolveUserStickerUrl(lastStickerMatch[1], getSettings()) : null;
    if (lastVoiceMatch) {
      lastAiMsg = lastVoiceMatch[1];
    }
    const lastParsed = parseAIQuote(lastAiMsg, contact);
    lastAiMsg = lastParsed.content;
    lastAiMsg = replaceMessagePlaceholders(lastAiMsg);
    contact.lastMessage = lastStickerUrl ? '[表情]' : (lastPhotoMatch ? '[照片]' : (lastVoiceMatch ? '[语音消息]' : lastAiMsg));
    saveSettingsDebounced();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(contactIndex);

  } catch (err) {
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }
    console.error('[可乐] AI 调用失败:', err);
    saveSettingsDebounced();
    refreshChatList();
    if (currentChatIndex === contactIndex) {
      appendMessage('assistant', `⚠️ ${err.message}`, contact);
    }
  }
}

// 添加照片消息到界面
export function appendPhotoMessage(role, description, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;
  const photoId = 'photo_' + Math.random().toString(36).substring(2, 9);

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = role === 'user'
    ? getUserAvatarHTML()
    : (contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar);

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-photo-bubble" data-photo-id="${photoId}">
        <div class="wechat-photo-content" id="${photoId}-content">${escapeHtml(description)}</div>
        <div class="wechat-photo-blur" id="${photoId}-blur">
          <div class="wechat-photo-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1.5 16H7.5L6 4z"/><path d="M6 4c0-1 1-2 6-2s6 1 6 2"/><path d="M9 8h6"/><circle cx="15" cy="6" r="0.5" fill="currentColor"/><circle cx="11" cy="7" r="0.5" fill="currentColor"/></svg>
          </div>
          <span class="wechat-photo-hint">点击查看</span>
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定点击事件（toggle切换蒙层）
  const photoBubble = messageDiv.querySelector('.wechat-photo-bubble');
  photoBubble?.addEventListener('click', () => {
    const blurEl = document.getElementById(`${photoId}-blur`);
    if (blurEl) {
      blurEl.classList.toggle('hidden');
    }
  });
}

// 添加音乐卡片消息到界面
export function appendMusicCardMessage(role, song, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = role === 'user'
    ? getUserAvatarHTML()
    : (contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar);

  const name = song?.name || '未知歌曲';
  const artist = song?.artist || '未知歌手';
  const cover = song?.cover || '';
  const platform = song?.platform || '';
  const songId = song?.id || '';

  const platformName = platform === 'netease' ? '网易云音乐' :
                       platform === 'qq' ? 'QQ音乐' :
                       platform === 'kuwo' ? '酷我音乐' : '音乐';

  const cardId = 'music_card_' + Math.random().toString(36).substring(2, 9);

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-music-card" id="${cardId}" data-song-id="${escapeHtml(songId)}" data-platform="${escapeHtml(platform)}" data-name="${escapeHtml(name)}" data-artist="${escapeHtml(artist)}" data-cover="${escapeHtml(cover)}">
        <div class="wechat-music-card-cover">
          <img src="${cover}" alt="" onerror="this.style.display='none'">
        </div>
        <div class="wechat-music-card-info">
          <div class="wechat-music-card-name">${escapeHtml(name)}</div>
          <div class="wechat-music-card-artist">${escapeHtml(artist)}</div>
        </div>
        <div class="wechat-music-card-play">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="6,4 20,12 6,20"/></svg>
        </div>
      </div>
      <div class="wechat-music-card-footer">${escapeHtml(platformName)}</div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定音乐卡片点击事件
  const card = document.getElementById(cardId);
  if (card) {
    card.addEventListener('click', function() {
      const id = this.dataset.songId;
      const plat = this.dataset.platform;
      const n = this.dataset.name;
      const a = this.dataset.artist;
      if (id && plat) {
        kugouPlayMusic(id, plat, n, a);
      }
    });
  }
}

// 批量发送混合消息（一次性发完再调用AI）
// messages: [{ type: 'text'|'voice'|'sticker'|'photo', content: string }]
export async function sendBatchMessages(messages) {
  if (currentChatIndex < 0) return;
  if (!messages || messages.length === 0) return;

  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  // 保存当前聊天的联系人索引
  const contactIndex = currentChatIndex;

  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // 清除输入框
  const input = document.getElementById('wechat-input');
  if (input) input.value = '';
  window.updateSendButtonState?.();
  clearQuote();

  // 构建AI提示词的描述
  const promptParts = [];

  // 第一步：显示所有用户消息（不调用AI）
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content?.trim();
    if (!content) continue;

    if (msg.type === 'sticker') {
      // 表情消息
      contact.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp,
        isSticker: true
      });
      appendStickerMessage('user', content, contact);
      promptParts.push('[用户发送了一个表情包]');
    } else if (msg.type === 'photo') {
      // 照片消息
      contact.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp,
        isPhoto: true
      });
      appendPhotoMessage('user', content, contact);
      promptParts.push(`[用户发送了一张照片，描述：${content}]`);
    } else if (msg.type === 'voice') {
      // 语音消息
      contact.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp,
        isVoice: true
      });
      appendMessage('user', content, contact, true);
      promptParts.push(`[用户发送了语音消息：${content}]`);
    } else {
      // 文字消息
      contact.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp
      });
      appendMessage('user', content, contact, false);
      promptParts.push(content);
    }

    // 消息之间的间隔
    if (i < messages.length - 1) {
      await sleep(200);
    }
  }

  // 更新最后消息
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.type === 'sticker') {
    contact.lastMessage = '[表情]';
  } else if (lastMsg.type === 'photo') {
    contact.lastMessage = '[照片]';
  } else if (lastMsg.type === 'voice') {
    contact.lastMessage = '[语音消息]';
  } else {
    contact.lastMessage = lastMsg.content;
  }

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();
  refreshChatList();

  // 第二步：调用AI（一次性）
  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    const { callAI } = await import('./ai.js');
    const combinedPrompt = promptParts.join('\n');
    const aiResponse = await callAI(contact, combinedPrompt);

    // 只有用户还在当前聊天时才隐藏打字指示器
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }

    // 分割AI回复
    const aiMessages = splitAIMessages(aiResponse);

    // 逐条显示 AI 回复
    for (let i = 0; i < aiMessages.length; i++) {
      let aiMsg = aiMessages[i];
      let aiIsVoice = false;
      let aiIsSticker = false;
      let aiIsPhoto = false;
      let stickerUrl = null;
      let aiQuote = null;

      // 解析语音格式
      const voiceMatch = aiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        aiMsg = voiceMatch[1];
        aiIsVoice = true;
      }

      // 解析照片格式
      const photoMatch = aiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
      if (photoMatch) {
        aiMsg = photoMatch[1];
        aiIsPhoto = true;
      }

      // 解析撤回格式 [撤回] 或 [撤回了一条消息]
      const recallMatch = aiMsg.match(/^\[撤回(?:了一条消息)?\]$/);
      if (recallMatch) {
        // 等待5秒让用户看到消息内容后再撤回
        await sleep(5000);
        for (let j = contact.chatHistory.length - 1; j >= 0; j--) {
          const histMsg = contact.chatHistory[j];
          if (histMsg.role === 'assistant' && !histMsg.isRecalled && !histMsg.isMarker) {
            histMsg.isRecalled = true;
            histMsg.originalContent = histMsg.content;
            histMsg.content = '';
            break;
          }
        }
        // 立即保存撤回状态
        saveSettingsDebounced();
        if (currentChatIndex === contactIndex) {
          openChat(currentChatIndex);
        }
        continue;
      }

      // 解析 AI 发起通话请求标签（支持标签混在文字中的情况）
      const callExtractBatch = extractCallRequest(aiMsg);
      if (callExtractBatch.type) {
        if (callExtractBatch.textBefore) {
          const inChat = currentChatIndex === contactIndex;
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1000);
            hideTypingIndicator();
          }
          const parsedText = parseAIQuote(callExtractBatch.textBefore, contact);
          const textContent = replaceMessagePlaceholders(parsedText.content);
          contact.chatHistory.push({
            role: 'assistant',
            content: textContent,
            time: timeStr,
            timestamp: Date.now(),
            quote: parsedText.quote
          });
          if (inChat) {
            appendMessage('assistant', textContent, contact, false, parsedText.quote);
          } else {
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            saveSettingsDebounced();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          saveSettingsDebounced();
        }
        console.log(`[可乐] AI发起${callExtractBatch.type === 'voice' ? '语音' : '视频'}通话 (sendBatchMessages)`);
        if (callExtractBatch.type === 'voice') {
          startVoiceCall('ai', contactIndex);
        } else {
          startVideoCall('ai', contactIndex);
        }
        break;
      }

      // 解析AI朋友圈格式 [朋友圈:文案内容]
      const momentMatchBatch = aiMsg.match(/^\[朋友圈[：:]\s*(.+)\]$/s);
      if (momentMatchBatch) {
        let momentText = momentMatchBatch[1].trim();
        console.log('[可乐] AI发布朋友圈 (sendBatchMessages):', momentText);

        // 提取内嵌的图片描述 [配图:xxx]（朋友圈专用格式）
        const images = [];
        const embeddedPhotoRegex = /\[配图[：:]\s*(.+?)\]/g;
        let embeddedMatch;
        while ((embeddedMatch = embeddedPhotoRegex.exec(momentText)) !== null) {
          images.push(embeddedMatch[1].trim());
        }
        // 移除内嵌的配图标签，保留纯文案
        momentText = momentText.replace(embeddedPhotoRegex, '').trim();

        // 检查后续消息是否有配图（兼容旧格式[照片:]）
        for (let j = i + 1; j < aiMessages.length && j < i + 5; j++) {
          const nextMsg = aiMessages[j];
          const imgMatch = nextMsg.match(/^\[(?:配图|照片)[：:]\s*(.+?)\]$/);
          if (imgMatch) {
            images.push(imgMatch[1].trim());
          }
        }

        // 添加到联系人的朋友圈
        addMomentToContact(contact.id, {
          text: momentText,
          images: images
        });

        // 显示顶部通知横幅
        showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
        saveSettingsDebounced();
        refreshChatList();
        continue; // 跳过后续处理，继续下一条消息
      }

      // 解析表情包格式
      const stickerMatch = aiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
      if (stickerMatch) {
        const token = (stickerMatch[1] || '').trim();
        stickerUrl = resolveUserStickerUrl(token, settings);
        if (stickerUrl) aiIsSticker = true;
      }

      // 解析引用格式
      let isRecallIntent = false;
      if (!aiIsSticker && !aiIsPhoto) {
        const parsedMsg = parseAIQuote(aiMsg, contact);
        aiMsg = parsedMsg.content;
        aiQuote = parsedMsg.quote;
        isRecallIntent = parsedMsg.isRecallIntent === true;
      }

      // 替换占位符
      aiMsg = replaceMessagePlaceholders(aiMsg);

      // 检查用户是否还在当前聊天界面
      const inChat = currentChatIndex === contactIndex;

      // 如果是撤回意图（AI错误使用了[回复:撤回]格式）
      if (isRecallIntent && aiMsg) {
        if (inChat) {
          showTypingIndicator(contact);
          await sleep(1000);
          hideTypingIndicator();
        }

        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isVoice: aiIsVoice
        });
        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice);
        }

        await sleep(5000);
        const lastHistMsg = contact.chatHistory[contact.chatHistory.length - 1];
        if (lastHistMsg && lastHistMsg.role === 'assistant' && !lastHistMsg.isRecalled) {
          lastHistMsg.isRecalled = true;
          lastHistMsg.originalContent = lastHistMsg.content;
          lastHistMsg.content = '';
        }
        // 立即保存撤回状态
        saveSettingsDebounced();
        if (currentChatIndex === contactIndex) {
          openChat(currentChatIndex);
        }
        continue;
      }

      // 每条消息都要有typing效果和2-2.5秒延迟
      showTypingIndicator(contact);
      await sleep(2000 + Math.random() * 500); // 2-2.5秒延迟
      hideTypingIndicator();

      if (aiIsSticker && stickerUrl) {
        contact.chatHistory.push({
          role: 'assistant',
          content: stickerUrl,
          time: timeStr,
          timestamp: Date.now(),
          isSticker: true
        });
        if (inChat) {
          appendStickerMessage('assistant', stickerUrl, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else if (aiIsPhoto) {
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isPhoto: true
        });
        if (inChat) {
          appendPhotoMessage('assistant', aiMsg, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      } else {
        contact.chatHistory.push({
          role: 'assistant',
          content: aiMsg,
          time: timeStr,
          timestamp: Date.now(),
          isVoice: aiIsVoice,
          quote: aiQuote
        });
        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice, aiQuote);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          saveSettingsDebounced();
          refreshChatList(); // 立即刷新让红点逐个增加
        }
      }
    }

    // 更新最后消息
    let lastAiMsg = aiMessages[aiMessages.length - 1];
    const lastVoiceMatch = lastAiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
    const lastPhotoMatch = lastAiMsg.match(/^\[照片[：:]\s*(.+?)\]$/);
    const lastStickerMatch = lastAiMsg.match(/^\[表情[：:]\s*(.+?)\]$/);
    const lastStickerUrl = lastStickerMatch ? resolveUserStickerUrl(lastStickerMatch[1], settings) : null;
    if (lastVoiceMatch) {
      lastAiMsg = lastVoiceMatch[1];
    }
    const lastParsed = parseAIQuote(lastAiMsg, contact);
    lastAiMsg = lastParsed.content;
    lastAiMsg = replaceMessagePlaceholders(lastAiMsg);
    contact.lastMessage = lastStickerUrl ? '[表情]' : (lastPhotoMatch ? '[照片]' : (lastVoiceMatch ? '[语音消息]' : lastAiMsg));
    saveSettingsDebounced();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(contactIndex);

  } catch (err) {
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }
    console.error('[可乐] AI 调用失败:', err);
    saveSettingsDebounced();
    refreshChatList();
    if (currentChatIndex === contactIndex) {
      appendMessage('assistant', `⚠️ ${err.message}`, contact);
    }
  }
}

// 显示撤回消息区
export function showRecalledMessages() {
  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  const panel = document.getElementById('wechat-recalled-panel');
  const list = document.getElementById('wechat-recalled-list');

  if (!panel || !list) return;

  // 获取AI撤回的消息（role === 'assistant' && isRecalled === true）
  const recalledMessages = contact?.chatHistory?.filter(msg =>
    msg.role === 'assistant' && msg.isRecalled === true && msg.originalContent
  ) || [];

  if (recalledMessages.length === 0) {
    list.innerHTML = '<div class="wechat-recalled-empty">暂无撤回消息</div>';
  } else {
    let html = '';
    recalledMessages.forEach((msg) => {
      const time = msg.time || '';
      const content = escapeHtml(msg.originalContent);
      html += `
        <div class="wechat-recalled-item">
          <div class="wechat-recalled-item-header">
            <span class="wechat-recalled-item-sender">${escapeHtml(contact?.name || '对方')}</span>
            <span class="wechat-recalled-item-time">${time}</span>
          </div>
          <div class="wechat-recalled-item-content">${content}</div>
        </div>
      `;
    });
    list.innerHTML = html;
  }

  panel.classList.remove('hidden');
}
