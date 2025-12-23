/**
 * UI 生成函数
 */

import { getContext } from '../../../extensions.js';
import { extensionName, getSettings } from './config.js';
import { getCurrentTime, formatChatTime, escapeHtml } from './utils.js';

const GROUP_CHAT_MAX_AI_MEMBERS = 3;

function getLastRenderableMessage(chatHistory) {
  const history = Array.isArray(chatHistory) ? chatHistory : [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (!msg) continue;
    if (msg.isVoiceCallMessage === true || msg.isVideoCallMessage === true) continue;
    if (msg.isMarker === true) continue;
    if (msg.isRecalled === true && (!msg.content || !msg.content.toString().trim())) continue;
    return msg;
  }
  return null;
}

// 获取用户头像HTML
export function getUserAvatarHTML() {
  const settings = getSettings();
  const context = getContext();
  const userName = context?.name1 || 'User';
  const firstChar = userName.charAt(0);

  if (settings.userAvatar) {
    return `<img src="${settings.userAvatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
  }

  const userAvatar = context?.user_avatar;
  if (userAvatar) {
    const avatarPaths = [
      `/User Avatars/${userAvatar}`,
      `/characters/${userAvatar}`,
      userAvatar
    ];
    return `<img src="${avatarPaths[0]}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
  }

  const stPersona = getUserPersonaFromST();
  if (stPersona?.avatar) {
    return `<img src="/User Avatars/${stPersona.avatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
  }

  return firstChar;
}

// 从酒馆获取用户设定
export function getUserPersonaFromST() {
  try {
    let name = '';
    let description = '';
    let avatar = '';

    const context = getContext();
    if (context) {
      name = context.name1 || '';
      avatar = context.user_avatar || '';
    }

    if (!name && typeof name1 !== 'undefined') {
      name = name1;
    }

    if (typeof power_user !== 'undefined') {
      if (power_user.persona_description) {
        description = power_user.persona_description;
      }
      if (power_user.personas && power_user.default_persona) {
        const currentPersona = power_user.default_persona;
        if (power_user.personas[currentPersona]) {
          description = power_user.personas[currentPersona];
          if (!name) name = currentPersona;
        }
      }
    }

    if (!name && typeof user_avatar !== 'undefined') {
      name = user_avatar.replace(/\.[^/.]+$/, '');
    }

    if (!description) {
      const personaDescEl = document.querySelector('#persona_description');
      if (personaDescEl && personaDescEl.value) {
        description = personaDescEl.value;
      }
    }

    if (name || description) {
      return { name, description, avatar };
    }
  } catch (err) {
    console.error('[可乐] 获取用户设定失败:', err);
  }
  return null;
}

// 生成聊天列表 HTML（包含单聊和群聊）
export function generateChatList() {
  const settings = getSettings();
  const contacts = settings.contacts || [];
  const groupChats = settings.groupChats || [];

  // 处理单聊
  const contactsWithChat = contacts.map((contact, index) => {
    const chatHistory = contact.chatHistory || [];
    const lastMsg = getLastRenderableMessage(chatHistory);
    const lastMsgTime = lastMsg ? (lastMsg.timestamp || new Date(lastMsg.time).getTime() || 0) : 0;
    const contactId = contact.id || `idx_${index}`;
    return {
      type: 'contact',
      ...contact,
      id: contactId,
      originalIndex: index,
      lastMsg,
      lastMsgTime
    };
  }).filter(c => c.lastMsg);

  // 处理群聊
  const groupsWithChat = groupChats.map((group, index) => {
    const chatHistory = group.chatHistory || [];
    const lastMsg = getLastRenderableMessage(chatHistory);
    const lastMsgTime = lastMsg ? (lastMsg.timestamp || group.lastMessageTime || 0) : (group.lastMessageTime || 0);
    return {
      type: 'group',
      ...group,
      originalIndex: index,
      lastMsg,
      lastMsgTime: lastMsgTime || Date.now()
    };
  });

  // 合并并排序
  const allChats = [...contactsWithChat, ...groupsWithChat].sort((a, b) => b.lastMsgTime - a.lastMsgTime);

  if (allChats.length === 0) {
    return `
      <div class="wechat-empty">
        <div class="wechat-empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.4;">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </div>
        <div class="wechat-empty-text">暂无聊天记录<br>点击通讯录选择好友开始聊天</div>
      </div>
    `;
  }

  return allChats.map(chat => {
    if (chat.type === 'group') {
      return generateGroupChatItem(chat, settings);
    } else {
      return generateContactChatItem(chat);
    }
  }).join('');
}

// 生成单聊列表项
function generateContactChatItem(contact) {
  const lastMsg = contact.lastMsg;
  let preview = '';
  if (lastMsg.type === 'voice' || lastMsg.isVoice) {
    preview = '[语音]';
  } else if (lastMsg.type === 'image' || lastMsg.isImage) {
    preview = '[图片]';
  } else if (lastMsg.type === 'sticker' || lastMsg.isSticker) {
    preview = '[表情]';
  } else {
    preview = lastMsg.content || '';
    // 处理内容中的特殊标签
    if (preview.includes('<meme>')) {
      preview = '[表情]';
    } else if (preview.includes('<photo>') || preview.includes('<image>')) {
      preview = '[图片]';
    } else if (/\[表情[：:].+?\]/.test(preview)) {
      preview = '[表情]';
    } else if (/\[语音[：:].+?\]/.test(preview)) {
      preview = '[语音]';
    } else if (/\[照片[：:].+?\]/.test(preview)) {
      preview = '[图片]';
    } else if (/\[图片[：:].+?\]/.test(preview)) {
      preview = '[图片]';
    } else {
      if (preview.length > 20) preview = preview.substring(0, 20) + '...';
    }
  }

  const msgTime = contact.lastMsgTime ? formatChatTime(contact.lastMsgTime) : '';

  const avatarContent = contact.avatar
    ? `<img src="${contact.avatar}" alt="${contact.name}">`
    : `<span>${contact.name?.charAt(0) || '?'}</span>`;

  // 未读消息红点
  const unreadCount = contact.unreadCount || 0;
  const badgeHtml = unreadCount > 0
    ? `<span class="wechat-chat-item-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
    : '';

  // 拉黑标识
  const blockedBadge = contact.isBlocked === true
    ? '<span class="wechat-blocked-badge">🚫</span>'
    : '';

  return `
    <div class="wechat-chat-item${contact.isBlocked ? ' wechat-chat-item-blocked' : ''}" data-contact-id="${contact.id}" data-index="${contact.originalIndex}">
      <div class="wechat-chat-item-avatar">
        ${avatarContent}
      </div>
      <div class="wechat-chat-item-info">
        <div class="wechat-chat-item-name">${contact.name || '未知'}${blockedBadge}</div>
        <div class="wechat-chat-item-preview">${escapeHtml(preview)}</div>
      </div>
      <div class="wechat-chat-item-meta">
        ${badgeHtml}
        <span class="wechat-chat-item-time">${msgTime}</span>
      </div>
    </div>
  `;
}

// 生成群聊列表项
function generateGroupChatItem(group, settings) {
  const lastMsg = group.lastMsg;
  let preview = '';

  if (lastMsg) {
    const sender = lastMsg.characterName ? `[${lastMsg.characterName}]: ` : '';
    if (lastMsg.isVoice) {
      preview = `${sender}[语音]`;
    } else if (lastMsg.isImage) {
      preview = `${sender}[图片]`;
    } else if (lastMsg.isSticker) {
      preview = `${sender}[表情]`;
    } else {
      let content = lastMsg.content || '';
      // 处理内容中的特殊标签
      if (content.includes('<meme>')) {
        content = '[表情]';
      } else if (content.includes('<photo>') || content.includes('<image>')) {
        content = '[图片]';
      } else if (/\[表情[：:].+?\]/.test(content)) {
        content = '[表情]';
      } else if (/\[语音[：:].+?\]/.test(content)) {
        content = '[语音]';
      } else if (/\[照片[：:].+?\]/.test(content)) {
        content = '[图片]';
      } else if (/\[图片[：:].+?\]/.test(content)) {
        content = '[图片]';
      } else {
        if (content.length > 15) content = content.substring(0, 15) + '...';
      }
      preview = `${sender}${content}`;
    }
  } else {
    preview = '群聊已创建';
  }

  const msgTime = group.lastMsgTime ? formatChatTime(group.lastMsgTime) : '';

  // 生成群头像（九宫格）
  const memberIds = group.memberIds || [];
  const groupMemberCount = Math.min(memberIds.length, GROUP_CHAT_MAX_AI_MEMBERS) + 1; // +1：包含用户自己
  const contactMembers = memberIds.map(id => settings.contacts?.find(c => c.id === id)).filter(Boolean);
  const members = [{ __isUser: true }, ...contactMembers].slice(0, 4);

  let avatarHtml = '';
  if (members.length === 1 && members[0].__isUser) {
    avatarHtml = getUserAvatarHTML();
  } else if (members.length === 0) {
    avatarHtml = `<span style="font-size: 18px;">👥</span>`;
  } else if (members.length === 1) {
    const m = members[0];
    avatarHtml = m.avatar
      ? `<img src="${m.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
      : `<span>${m.name?.charAt(0) || '?'}</span>`;
  } else {
    // 九宫格布局
    const gridSize = members.length <= 4 ? 2 : 3;
    const itemSize = Math.floor(44 / gridSize) - 2;
    avatarHtml = `<div style="display: grid; grid-template-columns: repeat(${gridSize}, 1fr); gap: 2px; width: 100%; height: 100%;">`;
    members.forEach(m => {
      if (m.__isUser) {
        const userAvatar = getUserAvatarHTML();
        const isImg = typeof userAvatar === 'string' && userAvatar.trim().startsWith('<img');
        if (isImg) {
          avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; overflow: hidden; border-radius: 2px;">${userAvatar}</div>`;
        } else {
          avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; background: var(--wechat-bg); border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 10px;">${escapeHtml((userAvatar || '我').toString().trim().charAt(0) || '我')}</div>`;
        }
        return;
      }
      if (m.avatar) {
        avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; overflow: hidden; border-radius: 2px;"><img src="${m.avatar}" style="width: 100%; height: 100%; object-fit: cover;"></div>`;
      } else {
        avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; background: var(--wechat-bg); border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 10px;">${m.name?.charAt(0) || '?'}</div>`;
      }
    });
    avatarHtml += `</div>`;
  }

  return `
    <div class="wechat-chat-item wechat-chat-item-group" data-group-id="${group.id}" data-group-index="${group.originalIndex}">
      <div class="wechat-chat-item-avatar" style="display: flex; align-items: center; justify-content: center;">${avatarHtml}</div>
      <div class="wechat-chat-item-info">
        <div class="wechat-chat-item-name">群聊(${groupMemberCount})</div>
        <div class="wechat-chat-item-preview">${escapeHtml(preview)}</div>
      </div>
      <div class="wechat-chat-item-meta">
        <span class="wechat-chat-item-time">${msgTime}</span>
      </div>
    </div>
  `;
}

// 生成联系人列表 HTML
export function generateContactsList() {
  const settings = getSettings();
  const contacts = settings.contacts || [];
  const groupChats = settings.groupChats || [];

  if (contacts.length === 0 && groupChats.length === 0) {
    return `
      <div class="wechat-empty">
        <div class="wechat-empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.4;">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </div>
        <div class="wechat-empty-text">暂无聊天<br>点击右上角 + 导入角色卡</div>
      </div>
    `;
  }

  let html = '<div class="wechat-contacts-grid">';

  // 生成群聊卡片
  groupChats.forEach((group, index) => {
    const memberIds = group.memberIds || [];
    const groupMemberCount = Math.min(memberIds.length, GROUP_CHAT_MAX_AI_MEMBERS) + 1; // +1：包含用户自己
    const contactMembers = memberIds.map(id => settings.contacts?.find(c => c.id === id)).filter(Boolean);
    const members = [{ __isUser: true }, ...contactMembers].slice(0, 4);

    let avatarHtml = '';
    if (members.length === 1 && members[0].__isUser) {
      const userAvatar = getUserAvatarHTML();
      const isImg = typeof userAvatar === 'string' && userAvatar.trim().startsWith('<img');
      avatarHtml = isImg ? userAvatar : '';
      avatarHtml += `<div class="wechat-card-fallback" style="${isImg ? 'display:none' : 'display:flex'}">${escapeHtml((userAvatar || '我').toString().trim().charAt(0) || '我')}</div>`;
    } else if (members.length === 0) {
      avatarHtml = `<div class="wechat-card-fallback" style="display:flex">👥</div>`;
    } else if (members.length === 1) {
      const m = members[0];
      avatarHtml = m.avatar
        ? `<img src="${m.avatar}" alt="" onerror="this.style.display='none';this.parentElement.querySelector('.wechat-card-fallback').style.display='flex'">`
        : '';
      avatarHtml += `<div class="wechat-card-fallback" style="${m.avatar ? 'display:none' : 'display:flex'}">${m.name?.charAt(0) || '?'}</div>`;
    } else {
      // 九宫格头像
      const gridSize = members.length <= 4 ? 2 : 3;
      const itemSize = Math.floor(50 / gridSize) - 2;
      avatarHtml = `<div style="display: grid; grid-template-columns: repeat(${gridSize}, 1fr); gap: 2px; width: 100%; height: 100%; padding: 4px; box-sizing: border-box;">`;
      members.forEach(m => {
        if (m.__isUser) {
          const userAvatar = getUserAvatarHTML();
          const isImg = typeof userAvatar === 'string' && userAvatar.trim().startsWith('<img');
          if (isImg) {
            avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; overflow: hidden; border-radius: 2px;">${userAvatar}</div>`;
          } else {
            avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; background: var(--wechat-bg); border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 10px;">${escapeHtml((userAvatar || '我').toString().trim().charAt(0) || '我')}</div>`;
          }
          return;
        }
        if (m.avatar) {
          avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; overflow: hidden; border-radius: 2px;"><img src="${m.avatar}" style="width: 100%; height: 100%; object-fit: cover;"></div>`;
        } else {
          avatarHtml += `<div style="width: ${itemSize}px; height: ${itemSize}px; background: var(--wechat-bg); border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 10px;">${m.name?.charAt(0) || '?'}</div>`;
        }
      });
      avatarHtml += `</div>`;
    }

    html += `
    <div class="wechat-contact-card wechat-group-card" data-group-index="${index}">
      <div class="wechat-card-swipe-wrapper">
        <div class="wechat-card-content">
          <div class="wechat-card-avatar wechat-group-avatar" data-group-index="${index}" title="点击进入群聊">
            ${avatarHtml}
          </div>
          <div class="wechat-card-name">群聊(${groupMemberCount})</div>
        </div>
        <div class="wechat-card-delete wechat-group-delete" data-group-index="${index}">
          <span>删除</span>
        </div>
      </div>
    </div>
  `;
  });

  // 生成联系人卡片
  contacts.forEach((contact, index) => {
    const firstChar = contact.name ? contact.name.charAt(0) : '?';
    const avatarContent = contact.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.querySelector('.wechat-card-fallback').style.display='flex'">`
      : '';
    html += `
    <div class="wechat-contact-card" data-index="${index}">
      <div class="wechat-card-swipe-wrapper">
        <div class="wechat-card-content">
          <div class="wechat-card-avatar" data-index="${index}" title="点击更换头像">
            ${avatarContent}
            <div class="wechat-card-fallback" style="${contact.avatar ? 'display:none' : 'display:flex'}">${firstChar}</div>
          </div>
          <div class="wechat-card-name">${contact.name}</div>
        </div>
        <div class="wechat-card-delete" data-index="${index}">
          <span>删除</span>
        </div>
      </div>
    </div>
  `;
  });

  html += '</div>';
  return html;
}

// 刷新聊天列表
export function refreshChatList() {
  const chatListEl = document.getElementById('wechat-chat-list');
  if (chatListEl) {
    chatListEl.innerHTML = generateChatList();
  }
  // 更新底部导航栏红点
  updateTabBadge();
}

// 更新底部导航栏微信tab的红点
export function updateTabBadge() {
  const settings = getSettings();
  const contacts = settings.contacts || [];

  // 计算总未读数
  let totalUnread = 0;
  contacts.forEach(contact => {
    totalUnread += contact.unreadCount || 0;
  });

  // 更新所有页面的微信tab badge
  const badges = document.querySelectorAll('.wechat-tab[data-tab="chat"] .wechat-tab-badge');
  badges.forEach(badge => {
    if (totalUnread > 0) {
      badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    } else {
      badge.textContent = '';
    }
  });
}

// 导出到 window 供跨模块调用
window.wechatRefreshChatList = refreshChatList;
window.wechatUpdateTabBadge = updateTabBadge;

// 更新"我"页面用户信息
export function updateMePageInfo() {
  try {
    const context = getContext();
    if (context) {
      const userName = context.name1 || 'User';
      const nameEl = document.getElementById('wechat-me-name');
      const avatarEl = document.getElementById('wechat-me-avatar');

      if (nameEl) nameEl.textContent = userName;
      if (avatarEl) {
        avatarEl.innerHTML = getUserAvatarHTML();
      }
    }
  } catch (err) {
    console.error('[可乐] 更新用户信息失败:', err);
  }
}

// 切换页面显示
export function showPage(pageId) {
  ['wechat-main-content', 'wechat-add-page', 'wechat-chat-page', 'wechat-settings-page', 'wechat-me-page', 'wechat-favorites-page', 'wechat-service-page', 'wechat-discover-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle('hidden', id !== pageId);
    }
  });

  if (pageId === 'wechat-me-page') {
    updateMePageInfo();
  }

  if (pageId === 'wechat-favorites-page') {
    // refreshFavoritesList 会在 favorites.js 中导出
    import('./favorites.js').then(m => m.refreshFavoritesList());
  }

  if (pageId === 'wechat-service-page') {
    const settings = getSettings();
    const amountEl = document.getElementById('wechat-wallet-amount');
    if (amountEl) {
      const amount = settings.walletAmount || '5773.89';
      amountEl.textContent = amount.startsWith('¥') ? amount : `¥${amount}`;
    }
  }
}
