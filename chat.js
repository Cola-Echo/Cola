/**
 * 聊天功能
 */

import { requestSave, saveNow } from './save-manager.js';
import { getContext } from '../../../extensions.js';
import { getSettings, SUMMARY_MARKER_PREFIX, getUserStickers, parseMemeTag, splitAIMessages } from './config.js';
import { escapeHtml, sleep, formatMessageTime, calculateVoiceDuration, formatQuoteDate, bindImageLoadFallback, extractEmbeddedPhotos } from './utils.js';
import { getUserAvatarHTML, refreshChatList } from './ui.js';
import { bindMessageBubbleEvents, getPendingQuote, clearQuote, setQuote, showMessageMenu, hideMessageMenu } from './message-menu.js';
import { showToast, showNotificationBanner } from './toast.js';
import { ICON_RED_PACKET } from './icons.js';
import { aiShareMusic, playMusic as kugouPlayMusic } from './music.js';
import { loadContactBackground } from './chat-background.js';
import { tryTriggerMomentAfterChat, addMomentToContact } from './moments.js';
import { startVoiceCall } from './voice-call.js';
import { startVideoCall } from './video-call.js';
import { showOpenRedPacket, generateRedPacketId } from './red-packet.js';
import { showReceiveTransferPage, generateTransferId } from './transfer.js';

// 当前聊天的联系人索引
export let currentChatIndex = -1;

// 聊天记录上限（达到此数量时提醒总结）
const CHAT_HISTORY_LIMIT = 300;

// 分页渲染配置
const MESSAGES_PER_PAGE = 80;
let currentRenderedStartIndex = 0; // 当前渲染的起始索引
let isLoadingMoreMessages = false; // 是否正在加载更多消息

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

  // 查找最后一个总结标记的位置
  let lastMarkerIndex = -1;
  for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
    if (contact.chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX) || contact.chatHistory[i].isMarker) {
      lastMarkerIndex = i;
      break;
    }
  }

  // 计算标记之后的消息数量（不含标记本身）
  const newMsgCount = contact.chatHistory.slice(lastMarkerIndex + 1).filter(
    m => !m.content?.startsWith(SUMMARY_MARKER_PREFIX) && !m.isMarker
  ).length;

  // 只在刚好达到阈值时提醒一次（通过标记位避免重复提醒）
  if (newMsgCount >= CHAT_HISTORY_LIMIT && !contact._summaryReminderShown) {
    contact._summaryReminderShown = true;
    showToast(`聊天记录已达${newMsgCount}条，建议总结`, '⚠️', 2500);
  } else if (newMsgCount < CHAT_HISTORY_LIMIT) {
    // 如果消息数低于阈值（可能是总结后），重置标记
    contact._summaryReminderShown = false;
  }
}

// 检查群聊记录是否需要总结
export function checkGroupSummaryReminder(groupChat) {
  if (!groupChat || !groupChat.chatHistory) return;

  // 查找最后一个总结标记的位置
  let lastMarkerIndex = -1;
  for (let i = groupChat.chatHistory.length - 1; i >= 0; i--) {
    if (groupChat.chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX) || groupChat.chatHistory[i].isMarker) {
      lastMarkerIndex = i;
      break;
    }
  }

  // 计算标记之后的消息数量（不含标记本身）
  const newMsgCount = groupChat.chatHistory.slice(lastMarkerIndex + 1).filter(
    m => !m.content?.startsWith(SUMMARY_MARKER_PREFIX) && !m.isMarker
  ).length;

  // 只在刚好达到阈值时提醒一次（通过标记位避免重复提醒）
  if (newMsgCount >= CHAT_HISTORY_LIMIT && !groupChat._summaryReminderShown) {
    groupChat._summaryReminderShown = true;
    showToast(`群聊记录已达${newMsgCount}条，建议总结`, '⚠️', 2500);
  } else if (newMsgCount < CHAT_HISTORY_LIMIT) {
    // 如果消息数低于阈值（可能是总结后），重置标记
    groupChat._summaryReminderShown = false;
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
    requestSave();
    refreshChatList();
  }

  document.getElementById('wechat-main-content').classList.add('hidden');
  document.getElementById('wechat-chat-page').classList.remove('hidden');
  document.getElementById('wechat-chat-title').textContent = contact.name;

  const messagesContainer = document.getElementById('wechat-chat-messages');
  const chatHistory = contact.chatHistory || [];

  if (chatHistory.length === 0) {
    messagesContainer.innerHTML = '';
    currentRenderedStartIndex = 0;
  } else {
    // 分页渲染：只渲染最后 MESSAGES_PER_PAGE 条消息
    const totalMessages = chatHistory.length;
    currentRenderedStartIndex = Math.max(0, totalMessages - MESSAGES_PER_PAGE);
    const messagesToRender = chatHistory.slice(currentRenderedStartIndex);

    // 如果有更多历史消息，显示"加载更多"提示
    let loadMoreHtml = '';
    if (currentRenderedStartIndex > 0) {
      loadMoreHtml = `<div class="wechat-load-more" id="wechat-load-more">上滑加载更多消息 (${currentRenderedStartIndex} 条)</div>`;
    }

    messagesContainer.innerHTML = loadMoreHtml + renderChatHistory(contact, messagesToRender, currentRenderedStartIndex);
    bindVoiceBubbleEvents(messagesContainer);
    bindPhotoBubbleEvents(messagesContainer);
    bindMusicCardEvents(messagesContainer);
    bindMessageBubbleEvents(messagesContainer);
    bindRedPacketBubbleEvents(messagesContainer);
    bindTransferBubbleEvents(messagesContainer);

    // 绑定滚动加载更多事件
    bindScrollLoadMore(messagesContainer, contact);
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

// 绑定滚动加载更多事件
function bindScrollLoadMore(container, contact) {
  // 移除旧的事件监听器（如果有）
  container.removeEventListener('scroll', container._scrollHandler);

  container._scrollHandler = function() {
    // 如果正在加载或已经加载完所有消息，不处理
    if (isLoadingMoreMessages || currentRenderedStartIndex <= 0) return;

    // 当滚动到顶部附近时（距离顶部小于100px）加载更多
    if (container.scrollTop < 100) {
      loadMoreMessages(container, contact);
    }
  };

  container.addEventListener('scroll', container._scrollHandler);
}

// 加载更多历史消息
function loadMoreMessages(container, contact) {
  if (isLoadingMoreMessages || currentRenderedStartIndex <= 0) return;

  isLoadingMoreMessages = true;

  const chatHistory = contact.chatHistory || [];

  // 计算要加载的消息范围
  const newEndIndex = currentRenderedStartIndex;
  const newStartIndex = Math.max(0, currentRenderedStartIndex - MESSAGES_PER_PAGE);
  const messagesToLoad = chatHistory.slice(newStartIndex, newEndIndex);

  if (messagesToLoad.length === 0) {
    isLoadingMoreMessages = false;
    return;
  }

  // 保存当前滚动位置
  const oldScrollHeight = container.scrollHeight;

  // 渲染新消息
  const newHtml = renderChatHistory(contact, messagesToLoad, newStartIndex);

  // 更新"加载更多"提示
  const loadMoreEl = document.getElementById('wechat-load-more');
  if (loadMoreEl) {
    if (newStartIndex > 0) {
      loadMoreEl.textContent = `上滑加载更多消息 (${newStartIndex} 条)`;
      loadMoreEl.insertAdjacentHTML('afterend', newHtml);
    } else {
      // 已加载所有消息，移除提示
      loadMoreEl.insertAdjacentHTML('afterend', newHtml);
      loadMoreEl.remove();
    }
  }

  // 更新当前渲染的起始索引
  currentRenderedStartIndex = newStartIndex;

  // 绑定新消息的事件
  bindVoiceBubbleEvents(container);
  bindPhotoBubbleEvents(container);
  bindMusicCardEvents(container);
  bindMessageBubbleEvents(container);

  // 恢复滚动位置，使用户看到的内容不变
  const newScrollHeight = container.scrollHeight;
  container.scrollTop = newScrollHeight - oldScrollHeight;

  isLoadingMoreMessages = false;

  console.log('[可乐] 加载更多消息:', {
    已加载: messagesToLoad.length,
    剩余: newStartIndex,
    总数: chatHistory.length
  });
}

// 渲染聊天历史
// indexOffset: 消息在原始 chatHistory 中的起始索引偏移量
export function renderChatHistory(contact, chatHistory, indexOffset = 0) {
  const contactName = (contact?.name || '?').toString();
  const firstChar = escapeHtml(contactName.charAt(0) || '?');
  const avatarContent = contact?.avatar
    ? `<img src="${escapeHtml(contact.avatar)}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`
    : firstChar;

  let html = '';
  let lastTimestamp = 0;
  const TIME_GAP_THRESHOLD = 5 * 60 * 1000;

  chatHistory.forEach((msg, localIndex) => {
    // 计算在原始 chatHistory 中的真实索引
    const index = indexOffset + localIndex;
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
            ${cameraIconSVG}
            <span class="wechat-call-record-text">视频通话 ${callInfo}</span>
          </div>
        `;
      } else if (isCancelled) {
        // 用户发起未接通：已取消
        videoCallRecordHTML = `
          <div class="wechat-call-record wechat-video-call-record">
            ${cameraIconSVG}
            <span class="wechat-call-record-text">已取消</span>
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
            ${cameraIconSVG}
            <span class="wechat-call-record-text">${escapeHtml(callInfo)}</span>
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

    // 检查是否是红包消息
    if (msg.isRedPacket && msg.redPacketInfo) {
      const rpInfo = msg.redPacketInfo;
      const isClaimed = rpInfo.status === 'claimed';
      // 检查是否过期（未领取且超过24小时）
      const isExpired = !isClaimed && rpInfo.expireAt && Date.now() > rpInfo.expireAt;
      const claimedClass = isClaimed ? 'claimed' : (isExpired ? 'expired' : '');
      const statusText = isClaimed
        ? '<span class="wechat-rp-bubble-status">已领取</span>'
        : (isExpired
          ? '<span class="wechat-rp-bubble-status">已过期</span>'
          : '<span class="wechat-rp-bubble-status hidden"></span>');

      const rpBubbleHTML = `
        <div class="wechat-red-packet-bubble ${claimedClass}" data-rp-id="${rpInfo.id}" data-role="${msg.role}" data-msg-index="${index}">
          <div class="wechat-rp-bubble-icon">${ICON_RED_PACKET}</div>
          <div class="wechat-rp-bubble-content">
            <div class="wechat-rp-bubble-message">${escapeHtml(rpInfo.message || '恭喜发财，大吉大利')}</div>
            ${statusText}
          </div>
          <div class="wechat-rp-bubble-footer">
            <span class="wechat-rp-bubble-label">微信红包</span>
          </div>
        </div>
      `;

      if (msg.role === 'user') {
        html += `<div class="wechat-message self" data-msg-index="${index}" data-msg-role="user"><div class="wechat-message-avatar">${getUserAvatarHTML()}</div><div class="wechat-message-content">${rpBubbleHTML}</div></div>`;
      } else {
        html += `<div class="wechat-message" data-msg-index="${index}" data-msg-role="assistant"><div class="wechat-message-avatar">${avatarContent}</div><div class="wechat-message-content">${rpBubbleHTML}</div></div>`;
      }
      lastTimestamp = msgTimestamp;
      return;
    }

    // 检查是否是转账消息
    if (msg.isTransfer && msg.transferInfo) {
      const tfInfo = msg.transferInfo;
      let status = tfInfo.status || 'pending';

      // 检查是否过期（待收款且超过24小时）
      const isExpired = status === 'pending' && tfInfo.expireAt && Date.now() > tfInfo.expireAt;
      if (isExpired) {
        status = 'expired';
      }

      // 状态图标和文字
      let statusIcon, statusText;
      if (status === 'received') {
        statusIcon = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
        statusText = '已收款';
      } else if (status === 'refunded' || status === 'expired') {
        // 已退还 或 已过期（使用相同图标和文字）
        statusIcon = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 3v5h5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
        statusText = msg.role === 'user' ? '已被退还' : '已退还';
      } else {
        statusIcon = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        statusText = msg.role === 'user' ? '你发起了一笔转账' : '请收款';
      }

      const tfBubbleHTML = `
        <div class="wechat-transfer-bubble ${status}" data-tf-id="${tfInfo.id}" data-role="${msg.role}" data-msg-index="${index}">
          <div class="wechat-tf-bubble-amount">¥${tfInfo.amount.toFixed(2)}</div>
          <div class="wechat-tf-bubble-status">
            <span class="wechat-tf-bubble-status-icon">${statusIcon}</span>
            <span class="wechat-tf-bubble-status-text">${statusText}</span>
          </div>
          <div class="wechat-tf-bubble-footer">
            <span class="wechat-tf-bubble-label">微信转账</span>
          </div>
        </div>
      `;

      if (msg.role === 'user') {
        html += `<div class="wechat-message self" data-msg-index="${index}" data-msg-role="user"><div class="wechat-message-avatar">${getUserAvatarHTML()}</div><div class="wechat-message-content">${tfBubbleHTML}</div></div>`;
      } else {
        html += `<div class="wechat-message" data-msg-index="${index}" data-msg-role="assistant"><div class="wechat-message-avatar">${avatarContent}</div><div class="wechat-message-content">${tfBubbleHTML}</div></div>`;
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
    const msgContent = (msg.content || '').toString();
    if (!isVoice && !isSticker && !isPhoto && !isMusic && (msgContent.indexOf('|||') >= 0 || /<\s*meme\s*>/i.test(msgContent))) {
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
          var quoteContent = (msg.quote.content || '').toString();
          if (msg.quote.isVoice) {
            var seconds = Math.max(2, Math.min(60, Math.ceil(quoteContent.length / 3)));
            quoteText = '[语音] ' + seconds + '"';
          } else if (msg.quote.isPhoto) {
            quoteText = '[照片]';
          } else if (msg.quote.isSticker) {
            quoteText = '[表情]';
          } else {
            quoteText = quoteContent.length > 30
              ? quoteContent.substring(0, 30) + '...'
              : quoteContent;
          }
          partQuoteHtml = '<div class="wechat-msg-quote"><span class="wechat-msg-quote-sender">' + escapeHtml(msg.quote.sender || '') + ':</span><span class="wechat-msg-quote-text">' + escapeHtml(quoteText) + '</span></div>';
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

    // 确保 bubbleContent 不为空
    if (!bubbleContent) {
      bubbleContent = `<div class="wechat-message-bubble">${escapeHtml(msg.content || '')}</div>`;
    }

    // 添加引用条（如果有）
    let quoteHtml = '';
    if (msg.quote) {
      let quoteText;
      const quoteContent = (msg.quote.content || '').toString();
      if (msg.quote.isVoice) {
        const seconds = Math.max(2, Math.min(60, Math.ceil(quoteContent.length / 3)));
        quoteText = `[语音] ${seconds}"`;
      } else if (msg.quote.isPhoto) {
        quoteText = '[照片]';
      } else if (msg.quote.isSticker) {
        quoteText = '[表情]';
      } else {
        quoteText = quoteContent.length > 30
          ? quoteContent.substring(0, 30) + '...'
          : quoteContent;
      }
      quoteHtml = `
        <div class="wechat-msg-quote">
          <span class="wechat-msg-quote-sender">${escapeHtml(msg.quote.sender || '')}:</span>
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
  const safeContent = (content || '').toString();
  const seconds = calculateVoiceDuration(safeContent);
  const width = Math.min(60 + seconds * 4, 200);
  const voiceId = 'voice_' + Math.random().toString(36).substring(2, 9);

  // WiFi信号样式的三条弧线图标（水平朝右，通过CSS控制翻转方向）
  const wavesSvg = `<svg class="wechat-voice-waves-icon" viewBox="0 0 24 24" width="18" height="18">
      <circle class="wechat-voice-arc arc1" cx="5" cy="12" r="2" fill="currentColor"/>
      <path class="wechat-voice-arc arc2" d="M10 8 A 5 5 0 0 1 10 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="wechat-voice-arc arc3" d="M15 4 A 10 10 0 0 1 15 20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;

  // 用户消息：时长在左，波形在右
  // 角色消息：波形在左，时长在右
  const bubbleInner = isSelf
    ? `<span class="wechat-voice-duration">${seconds}"</span><span class="wechat-voice-waves">${wavesSvg}</span>`
    : `<span class="wechat-voice-waves">${wavesSvg}</span><span class="wechat-voice-duration">${seconds}"</span>`;

  return `
    <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" style="width: ${width}px" data-voice-id="${voiceId}" data-voice-content="${escapeHtml(safeContent)}">
      ${bubbleInner}
    </div>
    <div class="wechat-voice-text hidden" id="${voiceId}">${escapeHtml(safeContent)}</div>
  `;
}

// 生成动态语音气泡
export function generateVoiceBubble(content, isSelf) {
  const safeContent = (content || '').toString();
  const seconds = calculateVoiceDuration(safeContent);
  const width = Math.min(60 + seconds * 4, 200);
  const uniqueId = 'voice_' + Math.random().toString(36).substring(2, 9);

  // WiFi信号样式的三条弧线图标（水平朝右，通过CSS控制翻转方向）
  const wavesSvg = `<svg class="wechat-voice-waves-icon" viewBox="0 0 24 24" width="18" height="18">
      <circle class="wechat-voice-arc arc1" cx="5" cy="12" r="2" fill="currentColor"/>
      <path class="wechat-voice-arc arc2" d="M10 8 A 5 5 0 0 1 10 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="wechat-voice-arc arc3" d="M15 4 A 10 10 0 0 1 15 20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;

  // 用户消息：时长在左，波形在右
  // 角色消息：波形在左，时长在右
  const bubbleInner = isSelf
    ? `<span class="wechat-voice-duration">${seconds}"</span><span class="wechat-voice-waves">${wavesSvg}</span>`
    : `<span class="wechat-voice-waves">${wavesSvg}</span><span class="wechat-voice-duration">${seconds}"</span>`;

  return {
    html: `
      <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" style="width: ${width}px" data-voice-id="${uniqueId}" data-voice-content="${escapeHtml(safeContent)}">
        ${bubbleInner}
      </div>
      <div class="wechat-voice-text hidden" id="${uniqueId}">${escapeHtml(safeContent)}</div>
    `,
    id: uniqueId
  };
}

// 绑定语音气泡点击事件（播放动画 + 显示上方菜单）
export function bindVoiceBubbleEvents(container) {
  const voiceBubbles = container.querySelectorAll('.wechat-voice-bubble:not([data-bound])');
  voiceBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');

    // 获取父消息元素
    const messageEl = bubble.closest('.wechat-message');

    // 计算消息索引
    const allMessages = Array.from(container.querySelectorAll('.wechat-message'));
    const msgIndex = allMessages.indexOf(messageEl);

    // 点击事件：播放动画 + 显示上方菜单
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();

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

      // 显示上方菜单（使用getRealMsgIndex获取真实索引）
      const realIndex = getRealMsgIndexForVoice(container, messageEl);
      showMessageMenu(bubble, realIndex, e);
    });
  });
}

// 获取语音消息的真实索引
function getRealMsgIndexForVoice(container, msgElement) {
  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact || !contact.chatHistory) return -1;

  // 获取所有消息元素（不含时间标签）
  const allMsgElements = Array.from(container.querySelectorAll('.wechat-message:not(.wechat-typing-wrapper)'));
  const visualIndex = allMsgElements.indexOf(msgElement);

  if (visualIndex < 0) return -1;

  // 计算真实索引
  let realIndex = -1;
  let visualCount = 0;

  for (let i = 0; i < contact.chatHistory.length; i++) {
    const msg = contact.chatHistory[i];
    if (msg.isMarker || msg.content?.startsWith(SUMMARY_MARKER_PREFIX) || msg.isRecalled) continue;

    let visualMsgCount = 1;
    const content = msg.content || '';
    const isSpecial = msg.isVoice || msg.isSticker || msg.isPhoto || msg.isMusic;
    if (!isSpecial && content.indexOf('|||') >= 0) {
      const parts = content.split('|||').map(p => p.trim()).filter(p => p);
      visualMsgCount = parts.length || 1;
    }

    if (visualIndex >= visualCount && visualIndex < visualCount + visualMsgCount) {
      realIndex = i;
      break;
    }

    visualCount += visualMsgCount;
  }

  return realIndex;
}

// 绑定红包气泡点击事件（AI红包可点击打开）
function bindRedPacketBubbleEvents(container) {
  const rpBubbles = container.querySelectorAll('.wechat-red-packet-bubble:not([data-bound])');
  rpBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');

    const role = bubble.dataset.role;
    const isClaimed = bubble.classList.contains('claimed');
    const isExpired = bubble.classList.contains('expired');

    // AI发的未领取且未过期红包可以点击
    if (role === 'assistant' && !isClaimed && !isExpired) {
      bubble.style.cursor = 'pointer';
      bubble.addEventListener('click', () => {
        const rpId = bubble.dataset.rpId;
        const settings = getSettings();
        const currentContact = settings.contacts[currentChatIndex];
        if (!currentContact || !currentContact.chatHistory) return;

        // 从聊天记录中找到对应的红包信息
        const rpMsg = currentContact.chatHistory.find(m => m.isRedPacket && m.redPacketInfo?.id === rpId);
        if (rpMsg && rpMsg.redPacketInfo) {
          // 二次检查是否过期（防止数据更新后状态不同步）
          if (rpMsg.redPacketInfo.expireAt && Date.now() > rpMsg.redPacketInfo.expireAt) {
            showToast('红包已过期', 'red-packet');
            return;
          }
          if (rpMsg.redPacketInfo.status !== 'claimed') {
            showOpenRedPacket(rpMsg.redPacketInfo, currentContact);
          }
        }
      });
    }
  });
}

// 绑定转账气泡点击事件（AI转账可点击收款）
function bindTransferBubbleEvents(container) {
  const tfBubbles = container.querySelectorAll('.wechat-transfer-bubble:not([data-bound])');
  tfBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');

    const role = bubble.dataset.role;
    // 检查状态（包括 expired）
    const status = bubble.classList.contains('pending') ? 'pending' :
                   bubble.classList.contains('received') ? 'received' :
                   bubble.classList.contains('expired') ? 'expired' : 'refunded';

    // AI发的待收款转账可以点击（过期的不可点击）
    if (role === 'assistant' && status === 'pending') {
      bubble.style.cursor = 'pointer';
      bubble.addEventListener('click', () => {
        const tfId = bubble.dataset.tfId;
        const settings = getSettings();
        const currentContact = settings.contacts[currentChatIndex];
        if (!currentContact || !currentContact.chatHistory) return;

        // 从聊天记录中找到对应的转账信息
        const tfMsg = currentContact.chatHistory.find(m => m.isTransfer && m.transferInfo?.id === tfId);
        if (tfMsg && tfMsg.transferInfo && tfMsg.transferInfo.status === 'pending') {
          // 检查是否过期
          if (tfMsg.transferInfo.expireAt && Date.now() > tfMsg.transferInfo.expireAt) {
            // 已过期，不做任何操作
            return;
          }
          showReceiveTransferPage(tfMsg.transferInfo, currentContact);
        }
      });
    }
  });
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

// 追加红包消息到聊天界面
export function appendRedPacketMessage(role, redPacketInfo, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  let avatarContent;
  if (role === 'user') {
    avatarContent = getUserAvatarHTML();
  } else {
    avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar;
  }

  const isClaimed = redPacketInfo.status === 'claimed';
  // 检查是否过期
  const isExpired = !isClaimed && redPacketInfo.expireAt && Date.now() > redPacketInfo.expireAt;
  const claimedClass = isClaimed ? 'claimed' : (isExpired ? 'expired' : '');
  const statusText = isClaimed
    ? '<span class="wechat-rp-bubble-status">已领取</span>'
    : (isExpired
      ? '<span class="wechat-rp-bubble-status">已过期</span>'
      : '<span class="wechat-rp-bubble-status hidden"></span>');

  const bubbleContent = `
    <div class="wechat-red-packet-bubble ${claimedClass}" data-rp-id="${redPacketInfo.id}" data-role="${role}">
      <div class="wechat-rp-bubble-icon">${ICON_RED_PACKET}</div>
      <div class="wechat-rp-bubble-content">
        <div class="wechat-rp-bubble-message">${escapeHtml(redPacketInfo.message || '恭喜发财，大吉大利')}</div>
        ${statusText}
      </div>
      <div class="wechat-rp-bubble-footer">
        <span class="wechat-rp-bubble-label">微信红包</span>
      </div>
    </div>
  `;

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">${bubbleContent}</div>
  `;

  // AI发的未领取且未过期红包可以点击
  if (role === 'assistant' && !isClaimed && !isExpired) {
    const bubble = messageDiv.querySelector('.wechat-red-packet-bubble');
    bubble.style.cursor = 'pointer';
    bubble.addEventListener('click', () => {
      // 二次检查是否过期（防止数据更新后状态不同步）
      if (redPacketInfo.expireAt && Date.now() > redPacketInfo.expireAt) {
        showToast('红包已过期', 'red-packet');
        return;
      }
      showOpenRedPacket(redPacketInfo, contact);
    });
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 追加红包领取提示到聊天界面（中间的系统消息）
export function appendRedPacketClaimNotice(claimerName, senderName, isUserClaiming) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const noticeDiv = document.createElement('div');
  noticeDiv.className = 'wechat-message-notice wechat-rp-claim-notice';

  const text = isUserClaiming
    ? `你领取了${senderName}的红包`
    : `${claimerName}领取了你的红包`;

  noticeDiv.innerHTML = `<span>${escapeHtml(text)}</span>`;

  messagesContainer.appendChild(noticeDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 追加转账消息到聊天界面
export function appendTransferMessage(role, transferInfo, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  let avatarContent;
  if (role === 'user') {
    avatarContent = getUserAvatarHTML();
  } else {
    avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar;
  }

  let status = transferInfo.status || 'pending';

  // 检查是否过期（待收款且超过24小时）
  const isExpired = status === 'pending' && transferInfo.expireAt && Date.now() > transferInfo.expireAt;
  if (isExpired) {
    status = 'expired';
  }

  // 状态图标和文字
  let statusIcon, statusText;
  if (status === 'received') {
    statusIcon = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
    statusText = '已收款';
  } else if (status === 'refunded' || status === 'expired') {
    // 已退还 或 已过期（使用相同图标和文字）
    statusIcon = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 3v5h5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
    statusText = role === 'user' ? '已被退还' : '已退还';
  } else {
    statusIcon = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    statusText = role === 'user' ? '你发起了一笔转账' : '请收款';
  }

  const bubbleContent = `
    <div class="wechat-transfer-bubble ${status}" data-tf-id="${transferInfo.id}" data-role="${role}">
      <div class="wechat-tf-bubble-amount">¥${transferInfo.amount.toFixed(2)}</div>
      <div class="wechat-tf-bubble-status">
        <span class="wechat-tf-bubble-status-icon">${statusIcon}</span>
        <span class="wechat-tf-bubble-status-text">${statusText}</span>
      </div>
      <div class="wechat-tf-bubble-footer">
        <span class="wechat-tf-bubble-label">微信转账</span>
      </div>
    </div>
  `;

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">${bubbleContent}</div>
  `;

  // AI发的待收款转账可以点击（过期的不可点击）
  if (role === 'assistant' && status === 'pending' && !isExpired) {
    const bubble = messageDiv.querySelector('.wechat-transfer-bubble');
    bubble.style.cursor = 'pointer';
    bubble.addEventListener('click', () => {
      // 二次检查是否过期
      if (transferInfo.expireAt && Date.now() > transferInfo.expireAt) {
        return; // 静默不处理
      }
      showReceiveTransferPage(transferInfo, contact);
    });
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
  const msgTimestamp = Date.now();

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
  saveNow();
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
      let quoteDesc;
      if (quote.isSticker) {
        quoteDesc = `${quote.sender}:[表情]`;
      } else if (quote.isPhoto) {
        quoteDesc = `${quote.sender}:[照片]`;
      } else if (quote.isVoice) {
        quoteDesc = `${quote.sender}:[语音]`;
      } else if (quote.isMusic) {
        quoteDesc = `${quote.sender}:[音乐]${quote.content}`;
      } else {
        quoteDesc = `${quote.sender}:「${quote.content}」`;
      }
      combinedMessage = `[用户引用了 ${quoteDesc} 进行回复]\n${combinedMessage}`;
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

        // 提取内嵌的图片描述 [配图:xxx]
        const { images, cleanText } = extractEmbeddedPhotos(momentText);
        momentText = cleanText;

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
        requestSave();
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
        requestSave();
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
            requestSave();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          requestSave();
        }

        console.log(`[可乐] AI发起${callExtract.type === 'voice' ? '语音' : '视频'}通话`);
        if (callExtract.type === 'voice') {
          startVoiceCall('ai', contactIndex);
        } else {
          startVideoCall('ai', contactIndex);
        }
        break; // 通话请求后忽略同一轮中的其它输出
      }

      // 解析AI红包格式 [红包:金额:祝福语] 或 [红包:金额]
      const redPacketMatch = aiMsg.match(/^\[红包[：:](\d+(?:\.\d{1,2})?)[：:]?(.*?)?\]$/);
      if (redPacketMatch) {
        const amount = Math.min(parseFloat(redPacketMatch[1]) || 0, 200);
        const message = (redPacketMatch[2] || '').trim() || '恭喜发财，大吉大利';

        if (amount > 0) {
          const rpInfo = {
            id: generateRedPacketId(),
            amount: amount,
            message: message,
            senderName: contact.name,
            status: 'pending',
            claimedBy: null,
            claimedAt: null,
            expireAt: Date.now() + 24 * 60 * 60 * 1000
          };

          const inChat = currentChatIndex === contactIndex;

          // 显示typing效果
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1500);
            hideTypingIndicator();
          }

          // 保存红包消息到聊天记录
          contact.chatHistory.push({
            role: 'assistant',
            content: `[红包] ${message}`,
            time: timeStr,
            timestamp: Date.now(),
            isRedPacket: true,
            redPacketInfo: rpInfo
          });

          if (inChat) {
            appendRedPacketMessage('assistant', rpInfo, contact);
          } else {
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            refreshChatList();
          }

          requestSave();
          console.log('[可乐] AI发送红包:', { amount, message });
          continue;
        }
      }

      // 解析AI转账格式 [转账:金额:说明] 或 [转账:金额]
      const transferMatch = aiMsg.match(/^\[转账[：:](\d+(?:\.\d{1,2})?)[：:]?(.*?)?\]$/);
      if (transferMatch) {
        const amount = parseFloat(transferMatch[1]) || 0; // 转账无上限
        const description = (transferMatch[2] || '').trim() || '';

        if (amount > 0) {
          const tfInfo = {
            id: generateTransferId(),
            amount: amount,
            description: description,
            senderName: contact.name,
            status: 'pending',
            receivedAt: null,
            refundedAt: null,
            expireAt: Date.now() + 24 * 60 * 60 * 1000
          };

          const inChat = currentChatIndex === contactIndex;

          // 显示typing效果
          if (inChat) {
            showTypingIndicator(contact);
            await sleep(1500);
            hideTypingIndicator();
          }

          // 保存转账消息到聊天记录
          contact.chatHistory.push({
            role: 'assistant',
            content: `[转账] ¥${amount.toFixed(2)}`,
            time: timeStr,
            timestamp: Date.now(),
            isTransfer: true,
            transferInfo: tfInfo
          });

          if (inChat) {
            appendTransferMessage('assistant', tfInfo, contact);
          } else {
            contact.unreadCount = (contact.unreadCount || 0) + 1;
            refreshChatList();
          }

          requestSave();
          console.log('[可乐] AI发送转账:', { amount, description });
          continue;
        }
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
        requestSave();
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
        // 每条消息都要标记待保存，防止用户切换页面时数据丢失
        requestSave();
        if (inChat) {
          appendStickerMessage('assistant', stickerUrl, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
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
        // 每条消息都要标记待保存，防止用户切换页面时数据丢失
        requestSave();
        if (inChat) {
          appendMusicCardMessage('assistant', aiMusicInfo, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
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
        // 每条消息都要标记待保存，防止用户切换页面时数据丢失
        requestSave();
        if (inChat) {
          appendPhotoMessage('assistant', aiMsg, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
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
        // 每条消息都要标记待保存，防止用户切换页面时数据丢失
        requestSave();
        if (inChat) {
          appendMessage('assistant', aiMsg, contact, aiIsVoice, aiQuote);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
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
    requestSave();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(currentChatIndex);

    // 尝试触发语音/视频通话（随机触发+保底机制）
    tryTriggerCallAfterChat(contactIndex);

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
  saveNow();

  // 显示消息
  appendStickerMessage('user', stickerUrl, contact);

  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    // 调用 AI - 传递表情描述让 AI 理解
    const { callAI } = await import('./ai.js');
    let aiPrompt = description
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

        // 提取内嵌的图片描述 [配图:xxx]
        const { images, cleanText } = extractEmbeddedPhotos(momentText);
        momentText = cleanText;

        addMomentToContact(contact.id, { text: momentText, images: images });
        showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
        requestSave();
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
        requestSave();
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
            requestSave();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          requestSave();
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
          requestSave();
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
          requestSave();
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
          requestSave();
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
          requestSave();
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
    requestSave();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(contactIndex);

  } catch (err) {
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }
    console.error('[可乐] AI 调用失败:', err);
    requestSave();
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
  saveNow();

  // 显示消息
  appendPhotoMessage('user', polishedDescription, contact);

  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    // 调用 AI
    const { callAI } = await import('./ai.js');
    let aiPrompt = `[用户发送了一张照片，图片描述：${polishedDescription}]`;

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
      const momentMatchPhoto = aiMsg.match(/^\[朋友圈[：:]\s*(.+)\]$/s);
      if (momentMatchPhoto) {
        let momentText = momentMatchPhoto[1].trim();
        console.log('[可乐] AI发布朋友圈 (sendPhotoMessage):', momentText);

        // 提取内嵌的图片描述 [配图:xxx]
        const { images, cleanText } = extractEmbeddedPhotos(momentText);
        momentText = cleanText;

        addMomentToContact(contact.id, { text: momentText, images: images });
        showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
        requestSave();
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
        requestSave();
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
            requestSave();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          requestSave();
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
          requestSave();
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
          requestSave();
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
          requestSave();
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
          requestSave();
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
    requestSave();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(contactIndex);

    // 尝试触发语音/视频通话（随机触发+保底机制）
    tryTriggerCallAfterChat(contactIndex);

  } catch (err) {
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }
    console.error('[可乐] AI 调用失败:', err);
    requestSave();
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
  saveNow();
  refreshChatList();

  // 第二步：调用AI（一次性）
  // 只有用户还在当前聊天时才显示打字指示器
  if (currentChatIndex === contactIndex) {
    showTypingIndicator(contact);
  }

  try {
    const { callAI } = await import('./ai.js');
    let combinedPrompt = promptParts.join('\n');

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
        requestSave();
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
            requestSave();
            refreshChatList(); // 立即刷新让红点逐个增加
          }
          requestSave();
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

        // 提取内嵌的图片描述 [配图:xxx]
        const { images, cleanText } = extractEmbeddedPhotos(momentText);
        momentText = cleanText;

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
        requestSave();
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
        requestSave();
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
          requestSave();
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
          requestSave();
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
          requestSave();
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
    requestSave();
    refreshChatList();
    checkSummaryReminder(contact);

    // 尝试触发朋友圈生成（随机触发+30条保底）
    tryTriggerMomentAfterChat(contactIndex);

    // 尝试触发语音/视频通话（随机触发+保底机制）
    tryTriggerCallAfterChat(contactIndex);

  } catch (err) {
    if (currentChatIndex === contactIndex) {
      hideTypingIndicator();
    }
    console.error('[可乐] AI 调用失败:', err);
    requestSave();
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

// 尝试触发语音/视频通话（随机触发+保底机制）
// 语音通话：8%几率，保底120条
// 视频通话：5%几率，保底200条
function tryTriggerCallAfterChat(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts?.[contactIndex];
  if (!contact) return;

  // 初始化计数器
  if (typeof contact.voiceCallCounter !== 'number') {
    contact.voiceCallCounter = 0;
  }
  if (typeof contact.videoCallCounter !== 'number') {
    contact.videoCallCounter = 0;
  }

  // 递增计数器
  contact.voiceCallCounter++;
  contact.videoCallCounter++;

  // 检查是否正在通话中（避免重复触发）
  const voicePanel = document.getElementById('wechat-voice-call-panel');
  const videoPanel = document.getElementById('wechat-video-call-panel');
  if ((voicePanel && !voicePanel.classList.contains('hidden')) ||
      (videoPanel && !videoPanel.classList.contains('hidden'))) {
    return; // 正在通话中，不触发新通话
  }

  // 先检查视频通话（5%几率，保底200条）
  const videoChance = Math.random();
  const videoGuarantee = contact.videoCallCounter >= 200;
  if (videoGuarantee || videoChance < 0.05) {
    console.log(`[可乐] ${contact.name} 触发视频通话保底（计数: ${contact.videoCallCounter}, 随机: ${videoChance.toFixed(3)}）`);
    contact.voiceCallCounter = 0;
    contact.videoCallCounter = 0;
    requestSave();
    // 延迟1-3秒后发起通话，更自然
    setTimeout(() => {
      startVideoCall('ai', contactIndex);
    }, 1000 + Math.random() * 2000);
    return;
  }

  // 再检查语音通话（8%几率，保底120条）
  const voiceChance = Math.random();
  const voiceGuarantee = contact.voiceCallCounter >= 120;
  if (voiceGuarantee || voiceChance < 0.08) {
    console.log(`[可乐] ${contact.name} 触发语音通话保底（计数: ${contact.voiceCallCounter}, 随机: ${voiceChance.toFixed(3)}）`);
    contact.voiceCallCounter = 0;
    contact.videoCallCounter = 0;
    requestSave();
    // 延迟1-3秒后发起通话，更自然
    setTimeout(() => {
      startVoiceCall('ai', contactIndex);
    }, 1000 + Math.random() * 2000);
    return;
  }

  // 保存计数器
  requestSave();
}

// 暴露必要的变量到 window 对象（供 music.js 随机推歌使用）
Object.defineProperty(window, 'wechatCurrentChatIndex', {
  get: function() { return currentChatIndex; }
});
window.wechatGetSettings = getSettings;
