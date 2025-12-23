/**
 * 朋友圈模块
 * 处理朋友圈页面的显示和交互逻辑
 * - 每个联系人有独立的朋友圈
 * - 评论来自角色世界书中的人物
 * - 用户评论后角色会回复
 */

import { requestSave } from './save-manager.js';
import { getContext } from '../../../extensions.js';
import { getSettings } from './config.js';
import { showToast, showNotificationBanner } from './toast.js';
import { sleep } from './utils.js';
import { selectAndCrop } from './cropper.js';

// 当前正在查看的联系人索引
let currentContactIndex = null;
let currentMomentId = null;
let currentReplyTo = null; // 当前回复的评论者名称

// 消息计数器（用于保底机制）- 持久化存储在 settings 中
function getMessageCounter(contactId) {
  const settings = getSettings();
  if (!settings.momentMessageCounters) settings.momentMessageCounters = {};
  return settings.momentMessageCounters[contactId] || 0;
}

function setMessageCounter(contactId, value) {
  const settings = getSettings();
  if (!settings.momentMessageCounters) settings.momentMessageCounters = {};
  settings.momentMessageCounters[contactId] = value;
  requestSave();
}

/**
 * 初始化朋友圈模块
 */
export function initMoments() {
  const settings = getSettings();

  // 初始化朋友圈数据结构
  if (!settings.momentsData) {
    settings.momentsData = {};
  }

  // 绑定事件
  bindMomentsEvents();

  console.log('[可乐] 朋友圈模块初始化完成');
}

/**
 * 绑定朋友圈相关事件
 */
function bindMomentsEvents() {
  // 返回按钮
  const backBtn = document.getElementById('wechat-moments-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', closeMomentsPage);
  }

  // 相机按钮 - 用户发自己的朋友圈
  const cameraBtn = document.getElementById('wechat-moments-camera-btn');
  if (cameraBtn) {
    cameraBtn.addEventListener('click', () => {
      showUserPostMomentModal();
    });
  }

  // 封面点击更换
  const cover = document.getElementById('wechat-moments-cover');
  if (cover) {
    cover.addEventListener('click', changeMomentsCover);
  }

  // 评论发送按钮
  const commentSend = document.getElementById('wechat-moments-comment-send');
  if (commentSend) {
    commentSend.addEventListener('click', sendUserComment);
  }

  // 评论输入框回车发送
  const commentInput = document.getElementById('wechat-moments-comment-text');
  if (commentInput) {
    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendUserComment();
      }
    });
  }

  // 点击页面其他地方关闭弹窗
  const momentsPage = document.getElementById('wechat-moments-page');
  if (momentsPage) {
    momentsPage.addEventListener('click', (e) => {
      if (!e.target.closest('.wechat-moment-action-btn') &&
          !e.target.closest('.wechat-moments-action-popup')) {
        hideActionPopup();
      }
    });
  }
}

/**
 * 打开朋友圈页面（查看指定联系人的朋友圈）
 * @param {number} contactIndex - 联系人索引，null 表示查看所有
 */
export function openMomentsPage(contactIndex = null) {
  currentContactIndex = contactIndex;

  const page = document.getElementById('wechat-moments-page');
  if (page) {
    page.classList.remove('hidden');
    updateMomentsProfile(contactIndex);
    renderMomentsList(contactIndex);
  }
}

/**
 * 关闭朋友圈页面
 */
export function closeMomentsPage() {
  const page = document.getElementById('wechat-moments-page');
  if (page) {
    page.classList.add('hidden');
  }
  hideActionPopup();
  hideCommentInput();
  currentContactIndex = null;
}

/**
 * 更新朋友圈用户资料显示
 */
function updateMomentsProfile(contactIndex) {
  const settings = getSettings();

  let userName, userAvatar, coverImage;

  if (contactIndex !== null && settings.contacts[contactIndex]) {
    // 显示特定联系人的信息
    const contact = settings.contacts[contactIndex];
    userName = contact.name || '未知';
    userAvatar = contact.avatar;
    coverImage = contact.momentsCover;
  } else {
    // 显示用户自己的信息
    const context = getContext();
    userName = context?.name1 || settings.wechatId || 'User';
    userAvatar = settings.userAvatar;
    coverImage = settings.momentsCover;
  }

  // 更新用户名
  const usernameEl = document.getElementById('wechat-moments-username');
  if (usernameEl) {
    usernameEl.textContent = userName;
  }

  // 更新头像
  const avatarEl = document.getElementById('wechat-moments-avatar');
  if (avatarEl) {
    if (userAvatar) {
      avatarEl.innerHTML = `<img src="${userAvatar}" alt="头像">`;
    } else {
      const firstChar = userName.charAt(0) || '?';
      avatarEl.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#ccc;color:#fff;font-size:24px;">${firstChar}</div>`;
    }
  }

  // 更新封面
  const coverEl = document.getElementById('wechat-moments-cover');
  if (coverEl) {
    if (coverImage) {
      coverEl.style.backgroundImage = `url(${coverImage})`;
      const placeholder = coverEl.querySelector('.wechat-moments-cover-placeholder');
      if (placeholder) placeholder.style.display = 'none';
    } else {
      coverEl.style.backgroundImage = '';
      const placeholder = coverEl.querySelector('.wechat-moments-cover-placeholder');
      if (placeholder) placeholder.style.display = '';
    }
  }
}

/**
 * 更换朋友圈封面
 */
function changeMomentsCover() {
  // 使用裁剪器选择并裁剪封面（16:9比例）
  selectAndCrop(16 / 9, (croppedImage) => {
    const settings = getSettings();

    if (currentContactIndex !== null && settings.contacts[currentContactIndex]) {
      settings.contacts[currentContactIndex].momentsCover = croppedImage;
    } else {
      settings.momentsCover = croppedImage;
    }
    requestSave();

    const coverEl = document.getElementById('wechat-moments-cover');
    if (coverEl) {
      coverEl.style.backgroundImage = `url(${croppedImage})`;
      const placeholder = coverEl.querySelector('.wechat-moments-cover-placeholder');
      if (placeholder) placeholder.style.display = 'none';
    }

    showToast('封面已更换');
  });
}

/**
 * 渲染朋友圈列表
 */
function renderMomentsList(contactIndex) {
  const listEl = document.getElementById('wechat-moments-list');
  if (!listEl) return;

  const settings = getSettings();
  let moments = [];

  if (contactIndex !== null) {
    // 显示特定联系人的朋友圈
    const contact = settings.contacts[contactIndex];
    if (contact && settings.momentsData) {
      moments = settings.momentsData[contact.id] || [];
    }
  } else {
    // 显示所有联系人的朋友圈（按时间排序）
    if (settings.momentsData) {
      Object.keys(settings.momentsData).forEach(contactId => {
        const contactMoments = settings.momentsData[contactId] || [];
        moments = moments.concat(contactMoments.map(m => ({
          ...m,
          contactId
        })));
      });
      // 按时间戳排序（新的在前）
      moments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
  }

  if (moments.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--wechat-text-secondary);">
        <div style="margin-bottom: 16px;">
          <svg viewBox="0 0 24 24" width="48" height="48" style="color: #ccc;">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </div>
        <div>暂无朋友圈动态</div>
        <div style="font-size: 12px; margin-top: 8px;">点击右上角相机图标生成新动态</div>
      </div>
    `;
    return;
  }

  let html = '';
  moments.forEach((moment, index) => {
    html += renderMomentItem(moment, index, contactIndex);
  });

  listEl.innerHTML = html;
  bindMomentItemEvents();
}

/**
 * 渲染单条朋友圈
 */
function renderMomentItem(moment, index, contactIndex) {
  const settings = getSettings();
  const context = getContext();

  // 获取发布者信息
  let posterName = moment.name || '未知';
  let posterAvatar = moment.avatar || '';

  // 如果是用户自己发的朋友圈
  if (moment.isUserMoment || moment.contactId === 'user') {
    posterName = context?.name1 || settings.wechatId || '我';
    posterAvatar = settings.userAvatar || '';
  } else if (contactIndex !== null) {
    // 查看特定联系人的朋友圈，使用该联系人信息
    const contact = settings.contacts[contactIndex];
    if (contact) {
      posterName = contact.name;
      posterAvatar = contact.avatar || '';
    }
  } else if (moment.contactId) {
    // 从 contactId 查找联系人
    const contact = settings.contacts.find(c => c.id === moment.contactId);
    if (contact) {
      posterName = contact.name;
      posterAvatar = contact.avatar || '';
    }
  }

  const imageCount = moment.images ? moment.images.length : 0;
  const gridClass = imageCount > 0 ? `grid-${Math.min(imageCount, 9)}` : '';

  // 渲染图片网格
  let imagesHtml = '';
  if (imageCount > 0) {
    imagesHtml = `<div class="wechat-moment-images ${gridClass}">`;
    moment.images.slice(0, 9).forEach((img, imgIndex) => {
      // 判断图片格式：可能是字符串URL、带描述的对象、或纯描述文本
      let imgUrl = '';
      let imgDesc = '';

      if (typeof img === 'object' && img !== null) {
        // 新格式：{ url, desc }
        imgUrl = img.url || '';
        imgDesc = img.desc || '';
      } else if (typeof img === 'string') {
        // 旧格式：直接是字符串
        if (img.startsWith('http') || img.startsWith('data:')) {
          imgUrl = img;
        } else {
          // AI生成的描述文本
          imgDesc = img;
        }
      }

      if (imgUrl) {
        // 真实图片URL
        if (imgDesc) {
          // 有图片有描述
          imagesHtml += `
            <div class="wechat-moment-img-wrapper">
              <img class="wechat-moment-img" src="${imgUrl}" alt="${imgDesc}">
              <div class="wechat-moment-img-caption">${imgDesc}</div>
            </div>
          `;
        } else {
          // 只有图片
          imagesHtml += `<img class="wechat-moment-img" src="${imgUrl}" alt="图片${imgIndex + 1}">`;
        }
      } else if (imgDesc) {
        // AI生成的图片描述 - 显示为"点击查看"卡片（与聊天照片一致）
        const photoId = 'moment_photo_' + Math.random().toString(36).substring(2, 9);
        imagesHtml += `
          <div class="wechat-photo-bubble wechat-moment-photo-card" data-photo-id="${photoId}">
            <div class="wechat-photo-content" id="${photoId}-content">${imgDesc}</div>
            <div class="wechat-photo-blur" id="${photoId}-blur">
              <div class="wechat-photo-icon">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1.5 16H7.5L6 4z"/><path d="M6 4c0-1 1-2 6-2s6 1 6 2"/><path d="M9 8h6"/><circle cx="15" cy="6" r="0.5" fill="currentColor"/><circle cx="11" cy="7" r="0.5" fill="currentColor"/></svg>
              </div>
              <span class="wechat-photo-hint">点击查看</span>
            </div>
          </div>
        `;
      }
    });
    imagesHtml += '</div>';
  }

  // 渲染点赞区域
  let likesHtml = '';
  if (moment.likes && moment.likes.length > 0) {
    likesHtml = `
      <div class="wechat-moment-likes">
        <span class="wechat-moment-like-icon">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="currentColor"/></svg>
        </span>
        ${moment.likes.map((name, i) => `<span class="wechat-moment-like-name">${name}</span>${i < moment.likes.length - 1 ? '<span class="wechat-moment-like-separator">,</span>' : ''}`).join('')}
      </div>
    `;
  }

  // 渲染评论区域
  let commentsHtml = '';
  if (moment.comments && moment.comments.length > 0) {
    commentsHtml = '<div class="wechat-moment-comments">';
    moment.comments.forEach((comment, commentIndex) => {
      // 只有非用户的评论才能点击回复
      const canReply = !comment.isUser;
      const replyAttr = canReply ? `data-reply-to="${comment.name}" data-moment-index="${index}"` : '';
      const replyClass = canReply ? 'wechat-moment-comment-clickable' : '';

      if (comment.replyTo) {
        commentsHtml += `
          <div class="wechat-moment-comment ${replyClass}" ${replyAttr}>
            <span class="wechat-moment-comment-name">${comment.name}</span>
            <span class="wechat-moment-comment-reply">回复</span>
            <span class="wechat-moment-comment-name">${comment.replyTo}</span>
            <span class="wechat-moment-comment-text">: ${comment.text}</span>
          </div>
        `;
      } else {
        commentsHtml += `
          <div class="wechat-moment-comment ${replyClass}" ${replyAttr}>
            <span class="wechat-moment-comment-name">${comment.name}</span>
            <span class="wechat-moment-comment-text">: ${comment.text}</span>
          </div>
        `;
      }
    });
    commentsHtml += '</div>';
  }

  // 互动区域
  let interactionsHtml = '';
  if (likesHtml || commentsHtml) {
    interactionsHtml = `
      <div class="wechat-moment-interactions">
        ${likesHtml}
        ${commentsHtml}
      </div>
    `;
  }

  // 头像显示
  const avatarHtml = posterAvatar
    ? `<img src="${posterAvatar}" alt="${posterName}">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#ddd;color:#999;font-size:18px;">${posterName.charAt(0) || '?'}</div>`;

  // 时间显示
  const timeStr = formatMomentTime(moment.timestamp);

  // 判断是否是用户自己的朋友圈
  const isUserMoment = moment.isUserMoment || moment.contactId === 'user';

  // 删除按钮（所有朋友圈都显示）
  const deleteBtn = `<button class="wechat-moment-delete-btn" data-moment-index="${index}" title="删除">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;

  return `
    <div class="wechat-moment-item" data-moment-id="${moment.id || index}" data-moment-index="${index}" data-is-user="${isUserMoment}">
      <div class="wechat-moment-avatar">
        ${avatarHtml}
      </div>
      <div class="wechat-moment-content">
        <div class="wechat-moment-name">${posterName}</div>
        <div class="wechat-moment-text">${(moment.text || '').replace(/\n/g, '<br>')}</div>
        ${imagesHtml}
        <div class="wechat-moment-footer">
          <span class="wechat-moment-time">${timeStr}</span>
          <div class="wechat-moment-actions">
            ${deleteBtn}
            <button class="wechat-moment-action-btn" data-moment-index="${index}"></button>
          </div>
        </div>
        ${interactionsHtml}
      </div>
    </div>
  `;
}

/**
 * 格式化朋友圈时间
 */
function formatMomentTime(timestamp) {
  if (!timestamp) return '刚刚';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 绑定朋友圈条目事件
 */
function bindMomentItemEvents() {
  // 绑定操作按钮（点赞/评论）
  const actionBtns = document.querySelectorAll('.wechat-moment-action-btn');
  actionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.momentIndex);
      showActionPopup(btn, index);
    });
  });

  // 绑定删除按钮（仅用户朋友圈）
  const deleteBtns = document.querySelectorAll('.wechat-moment-delete-btn');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.momentIndex);
      deleteUserMoment(index);
    });
  });

  // 绑定照片卡片点击事件（展开/收起描述）
  const photoBubbles = document.querySelectorAll('.wechat-moment-photo-card');
  photoBubbles.forEach(bubble => {
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      const photoId = bubble.dataset.photoId;
      if (photoId) {
        const blurEl = document.getElementById(`${photoId}-blur`);
        if (blurEl) {
          blurEl.classList.toggle('hidden');
        }
      }
    });
  });

  // 绑定评论点击事件（回复评论）
  const clickableComments = document.querySelectorAll('.wechat-moment-comment-clickable');
  clickableComments.forEach(comment => {
    comment.addEventListener('click', (e) => {
      e.stopPropagation();
      const replyTo = comment.dataset.replyTo;
      const momentIndex = parseInt(comment.dataset.momentIndex);
      if (replyTo && !isNaN(momentIndex)) {
        showCommentInput(momentIndex, replyTo);
      }
    });
  });
}

/**
 * 显示点赞评论弹窗
 */
function showActionPopup(targetBtn, momentIndex) {
  const popup = document.getElementById('wechat-moments-action-popup');
  if (!popup) return;

  currentMomentId = momentIndex;

  const btnRect = targetBtn.getBoundingClientRect();
  const pageRect = document.getElementById('wechat-moments-page').getBoundingClientRect();

  popup.style.right = (pageRect.right - btnRect.right + 35) + 'px';
  popup.style.top = (btnRect.top - pageRect.top + targetBtn.offsetHeight / 2 - 20) + 'px';
  popup.classList.remove('hidden');

  const likeBtn = popup.querySelector('[data-action="like"]');
  const commentBtn = popup.querySelector('[data-action="comment"]');

  if (likeBtn) {
    likeBtn.onclick = () => {
      toggleLike(momentIndex);
      hideActionPopup();
    };
  }

  if (commentBtn) {
    commentBtn.onclick = () => {
      hideActionPopup();
      showCommentInput(momentIndex);
    };
  }
}

/**
 * 隐藏点赞评论弹窗
 */
function hideActionPopup() {
  const popup = document.getElementById('wechat-moments-action-popup');
  if (popup) {
    popup.classList.add('hidden');
  }
}

/**
 * 切换点赞状态
 */
function toggleLike(momentIndex) {
  const settings = getSettings();
  const context = getContext();
  const userName = context?.name1 || settings.wechatId || '我';

  if (!settings.momentsData) return;

  let targetMoment = null;

  if (currentContactIndex !== null) {
    // 查看特定联系人的朋友圈
    const contact = settings.contacts[currentContactIndex];
    if (!contact) return;

    const moments = settings.momentsData[contact.id];
    if (!moments || !moments[momentIndex]) return;

    targetMoment = moments[momentIndex];
  } else {
    // 查看所有朋友圈（合并视图）
    const allMoments = [];
    Object.keys(settings.momentsData).forEach(contactId => {
      const contactMoments = settings.momentsData[contactId] || [];
      contactMoments.forEach((m, originalIndex) => {
        allMoments.push({
          ...m,
          contactId,
          originalIndex
        });
      });
    });
    allMoments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (momentIndex >= allMoments.length) return;

    const targetInfo = allMoments[momentIndex];
    targetMoment = settings.momentsData[targetInfo.contactId]?.[targetInfo.originalIndex];
    if (!targetMoment) return;
  }

  if (!targetMoment.likes) targetMoment.likes = [];

  const likeIndex = targetMoment.likes.indexOf(userName);
  if (likeIndex > -1) {
    targetMoment.likes.splice(likeIndex, 1);
  } else {
    targetMoment.likes.push(userName);
  }

  requestSave();
  renderMomentsList(currentContactIndex);
}

/**
 * 显示评论输入框
 * @param {number} momentIndex - 朋友圈索引
 * @param {string} replyTo - 回复目标（可选，为空表示直接评论）
 */
function showCommentInput(momentIndex, replyTo = null) {
  currentMomentId = momentIndex;
  currentReplyTo = replyTo;

  const inputContainer = document.getElementById('wechat-moments-comment-input');
  const input = document.getElementById('wechat-moments-comment-text');

  if (inputContainer && input) {
    inputContainer.classList.remove('hidden');

    // 更新占位符文本
    if (replyTo) {
      input.placeholder = `回复 ${replyTo}：`;
    } else {
      input.placeholder = '评论';
    }

    input.focus();
  }
}

/**
 * 隐藏评论输入框
 */
function hideCommentInput() {
  const inputContainer = document.getElementById('wechat-moments-comment-input');
  const input = document.getElementById('wechat-moments-comment-text');

  if (inputContainer) {
    inputContainer.classList.add('hidden');
  }
  if (input) {
    input.value = '';
    input.placeholder = '评论';
  }
  currentMomentId = null;
  currentReplyTo = null;
}

/**
 * 发送用户评论
 */
async function sendUserComment() {
  const input = document.getElementById('wechat-moments-comment-text');
  if (!input || !input.value.trim() || currentMomentId === null) return;

  const settings = getSettings();
  const context = getContext();
  const userName = context?.name1 || settings.wechatId || '我';
  const commentText = input.value.trim();

  if (!settings.momentsData) {
    hideCommentInput();
    return;
  }

  let targetMoment = null;
  let targetContactId = null;
  let targetMomentIndex = null;
  let contactIndexForReply = null;

  if (currentContactIndex !== null) {
    // 查看特定联系人的朋友圈
    const contact = settings.contacts[currentContactIndex];
    if (!contact) {
      hideCommentInput();
      return;
    }
    const moments = settings.momentsData[contact.id];
    if (!moments || !moments[currentMomentId]) {
      hideCommentInput();
      return;
    }
    targetMoment = moments[currentMomentId];
    targetContactId = contact.id;
    targetMomentIndex = currentMomentId;
    contactIndexForReply = currentContactIndex;
  } else {
    // 查看所有朋友圈（合并视图）- 需要找到对应的原始朋友圈
    const allMoments = [];
    Object.keys(settings.momentsData).forEach(contactId => {
      const contactMoments = settings.momentsData[contactId] || [];
      contactMoments.forEach((m, originalIndex) => {
        allMoments.push({
          ...m,
          contactId,
          originalIndex
        });
      });
    });
    // 按时间戳排序（新的在前）
    allMoments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (currentMomentId >= allMoments.length) {
      hideCommentInput();
      return;
    }

    const targetInfo = allMoments[currentMomentId];
    targetContactId = targetInfo.contactId;
    targetMomentIndex = targetInfo.originalIndex;

    // 找到原始朋友圈对象
    targetMoment = settings.momentsData[targetContactId]?.[targetMomentIndex];
    if (!targetMoment) {
      hideCommentInput();
      return;
    }

    // 找到联系人索引（用于触发回复）
    if (targetContactId !== 'user') {
      contactIndexForReply = settings.contacts?.findIndex(c => c.id === targetContactId);
      if (contactIndexForReply < 0) contactIndexForReply = null;
    }
  }

  if (!targetMoment.comments) targetMoment.comments = [];

  // 添加用户评论（支持回复特定评论）
  const newComment = {
    name: userName,
    text: commentText,
    isUser: true,
    timestamp: Date.now()
  };

  // 如果是回复某人的评论
  if (currentReplyTo) {
    newComment.replyTo = currentReplyTo;
  }

  targetMoment.comments.push(newComment);

  requestSave();
  hideCommentInput();
  renderMomentsList(currentContactIndex);

  // 触发角色回复（异步）
  if (contactIndexForReply !== null && targetContactId !== 'user') {
    // 情况1：联系人的朋友圈 - 联系人回复用户
    setTimeout(() => {
      generateContactReplyToComment(contactIndexForReply, targetMomentIndex, userName, commentText);
    }, 1000 + Math.random() * 2000);
  } else if (targetContactId === 'user' && currentReplyTo) {
    // 情况2：用户自己的朋友圈 - 用户回复了某个联系人的评论
    // 找到被回复的联系人并触发他们的回复
    const repliedContactIndex = settings.contacts?.findIndex(c => c.name === currentReplyTo);
    if (repliedContactIndex >= 0) {
      setTimeout(() => {
        generateContactReplyToUserMomentComment(repliedContactIndex, targetMomentIndex, userName, commentText, currentReplyTo);
      }, 1000 + Math.random() * 2000);
    }
  }
}

/**
 * 【通用辅助函数】获取联系人的世界书条目
 * 支持多种匹配方式，确保能读取到世界书
 * @param {Object} contact - 联系人对象
 * @param {Object} settings - 设置对象
 * @returns {Array} - 世界书条目内容数组
 */
function getLorebookEntriesForContact(contact, settings) {
  const entries = [];
  const rawData = contact.rawData || {};
  const charData = rawData.data || rawData;
  const charName = charData.name || contact.name || '';
  const contactId = contact.id || '';

  const selectedLorebooks = settings.selectedLorebooks || [];

  // 调试信息
  const characterBooks = selectedLorebooks.filter(lb => lb.fromCharacter);
  console.log(`[可乐] 世界书匹配 - 联系人: ${contact.name}, charName="${charName}", contactId="${contactId}"`);
  console.log(`[可乐] 世界书匹配 - 可用世界书:`, characterBooks.map(lb => ({
    name: lb.characterName,
    id: lb.characterId,
    entries: (lb.entries || []).length
  })));

  // 方法1: 从 selectedLorebooks 匹配（支持多种匹配方式）
  let foundInSelected = false;
  selectedLorebooks.forEach(lb => {
    if (!lb.fromCharacter) return;
    if (lb.enabled === false || lb.enabled === 'false') return;

    // 多种匹配方式（宽松匹配）
    const matchById = contactId && lb.characterId && lb.characterId === contactId;
    const matchByName = charName && lb.characterName && lb.characterName === charName;
    // 新增：部分匹配（名称包含关系）
    const partialMatchName = charName && lb.characterName && (
      lb.characterName.includes(charName) || charName.includes(lb.characterName)
    );
    // 新增：联系人名称匹配
    const matchByContactName = contact.name && lb.characterName && (
      lb.characterName === contact.name ||
      lb.characterName.includes(contact.name) ||
      contact.name.includes(lb.characterName)
    );

    if (!matchById && !matchByName && !partialMatchName && !matchByContactName) return;

    console.log(`[可乐] 世界书匹配 - ${contact.name} 匹配到世界书: ${lb.characterName || lb.characterId}`);
    foundInSelected = true;

    (lb.entries || []).forEach(entry => {
      if (entry.enabled !== false && entry.enabled !== 'false' && entry.disable !== true && entry.content) {
        entries.push(entry.content);
      }
    });
  });

  // 方法2: 从角色卡自带的世界书读取
  if (entries.length === 0 && charData.character_book?.entries?.length > 0) {
    console.log(`[可乐] 世界书匹配 - ${contact.name} 使用角色卡自带世界书`);
    charData.character_book.entries.forEach(entry => {
      if (entry.enabled !== false && entry.disable !== true && entry.content) {
        entries.push(entry.content);
      }
    });
  }

  // 方法3: 使用角色描述作为最后的回退
  if (entries.length === 0) {
    if (charData.description) {
      console.log(`[可乐] 世界书匹配 - ${contact.name} 回退到角色描述`);
      entries.push(charData.description);
    }
    if (charData.personality) {
      entries.push(`性格: ${charData.personality}`);
    }
    if (charData.scenario) {
      entries.push(`场景: ${charData.scenario}`);
    }
  }

  console.log(`[可乐] 世界书匹配 - ${contact.name} 最终获取 ${entries.length} 条内容`);
  return entries;
}

/**
 * 清理评论内容，移除AI可能生成的格式标签
 * @param {string} text - 原始评论内容
 * @returns {string} - 清理后的评论内容
 */
function cleanCommentText(text) {
  if (!text) return '';

  let cleaned = text.trim();

  // 移除 [评论 xxx] 或 [评论	xxx] 格式（tab或空格分隔）
  cleaned = cleaned.replace(/^\[评论[\s\t]+[^\]]+\]\s*/i, '');

  // 移除 [评论:xxx] 或 [评论：xxx] 格式
  cleaned = cleaned.replace(/^\[评论[：:][^\]]*\]\s*/i, '');

  // 移除开头的引号
  cleaned = cleaned.replace(/^["「『]/, '').replace(/["」』]$/, '');

  return cleaned.trim();
}

/**
 * 从联系人的世界书中提取可用于评论的人物
 */
function extractCharactersFromLorebook(contact) {
  const settings = getSettings();
  const context = getContext();
  const characters = [];

  // 获取联系人的角色数据
  const rawData = contact.rawData || {};
  const charData = rawData.data || rawData;
  const charName = charData.name || contact.name || '';

  // 获取用户名，用于排除用户
  const userName = context?.name1 || settings.wechatId || '';

  // 方法1: 从 selectedLorebooks 中查找与当前角色匹配的世界书
  const selectedLorebooks = settings.selectedLorebooks || [];

  // 调试：显示匹配信息
  const characterBooks = selectedLorebooks.filter(lb => lb.fromCharacter);
  console.log(`[可乐] 提取NPC - 正在为 ${contact.name} 匹配世界书, charName="${charName}", contactId="${contact.id}", 可用角色世界书:`, characterBooks.map(lb => ({ name: lb.characterName, id: lb.characterId })));

  selectedLorebooks.forEach(lb => {
    // 检查是否是当前角色的世界书 - 同时支持 characterId 和 characterName 匹配
    if (!lb.fromCharacter) return;
    const matchById = contact.id && lb.characterId && lb.characterId === contact.id;
    const matchByName = charName && lb.characterName && lb.characterName === charName;
    if (!matchById && !matchByName) return;

    // 检查世界书是否启用
    if (lb.enabled === false || lb.enabled === 'false') return;

    (lb.entries || []).forEach(entry => {
      // 跳过禁用的条目
      if (entry.enabled === false || entry.enabled === 'false' || entry.disable === true) return;

      // 提取所有有内容的条目，不再限制名称长度和关键词过滤
      if (entry.keys && entry.keys.length > 0) {
        const name = entry.keys[0];
        // 排除角色本人和用户
        if (name && name !== charName && name !== userName) {
          characters.push({
            name: name,
            content: entry.content || ''
          });
        }
      }
    });
  });

  // 方法2: 如果没有找到，从角色卡自带的世界书读取
  if (characters.length === 0 && charData.character_book?.entries?.length > 0) {
    charData.character_book.entries.forEach(entry => {
      // 跳过禁用的条目
      if (entry.enabled === false || entry.disable === true) return;

      // 提取所有有内容的条目
      if (entry.keys && entry.keys.length > 0) {
        const name = entry.keys[0];
        // 排除角色本人和用户
        if (name && name !== charName && name !== userName) {
          characters.push({
            name: name,
            content: entry.content || ''
          });
        }
      }
    });
  }

  // 去重
  const uniqueNames = new Set();
  const result = characters.filter(c => {
    if (uniqueNames.has(c.name)) return false;
    uniqueNames.add(c.name);
    return true;
  });

  const totalChars = result.reduce((sum, c) => sum + (c.content?.length || 0), 0);
  console.log(`[可乐] 从世界书提取到 ${result.length} 个条目, 总计 ${totalChars} 字符:`, result.map(c => c.name));
  return result;
}

/**
 * 为联系人生成新的朋友圈动态
 */
export async function generateNewMomentForContact(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) {
    showToast('找不到联系人', '❌');
    return;
  }

  try {
    // 调用 AI 生成朋友圈内容
    const momentContent = await generateMomentContent(contact);

    if (!momentContent) {
      showToast('生成失败，请重试', '❌');
      return;
    }

    // 初始化该联系人的朋友圈数据
    if (!settings.momentsData) settings.momentsData = {};
    if (!settings.momentsData[contact.id]) settings.momentsData[contact.id] = [];

    // 创建新动态（不自动生成评论，等用户主动评论后AI再回复）
    const newMoment = {
      id: Date.now().toString(),
      text: momentContent.text,
      images: momentContent.images || [],
      timestamp: Date.now(),
      likes: [],
      comments: []
    };

    // 添加到列表开头
    settings.momentsData[contact.id].unshift(newMoment);
    requestSave();

    showNotificationBanner('微信', `${contact.name}发布了一条朋友圈`);
    renderMomentsList(currentContactIndex);

  } catch (err) {
    console.error('[可乐] 生成朋友圈失败:', err);
    showToast('生成失败: ' + err.message, '❌');
  }
}

/**
 * 调用 AI 生成朋友圈内容
 */
async function generateMomentContent(contact) {
  const settings = getSettings();
  const context = getContext();

  // 获取 API 配置
  let apiUrl, apiKey, apiModel;

  if (contact.useCustomApi) {
    apiUrl = contact.customApiUrl || settings.apiUrl || '';
    apiKey = contact.customApiKey || settings.apiKey || '';
    apiModel = contact.customModel || settings.selectedModel || '';
  } else {
    apiUrl = settings.apiUrl || '';
    apiKey = settings.apiKey || '';
    apiModel = settings.selectedModel || '';
  }

  if (!apiUrl) {
    throw new Error('未配置 API 地址');
  }

  // 处理 API URL，确保正确拼接
  let chatUrl = apiUrl.replace(/\/+$/, '');
  if (!chatUrl.includes('/chat/completions')) {
    if (!chatUrl.endsWith('/v1')) {
      chatUrl += '/v1';
    }
    chatUrl += '/chat/completions';
  }

  // 获取角色世界书设定
  const lorebookEntries = getLorebookEntriesForContact(contact, settings);
  let characterInfo = '';
  if (lorebookEntries.length > 0) {
    characterInfo = `\n【关于「${contact.name}」的设定】\n${lorebookEntries.join('\n')}\n`;
    console.log(`[可乐] 朋友圈生成 - ${contact.name} 获取到 ${lorebookEntries.length} 条设定`);
  }

  // 获取用户设定
  let userPersonaInfo = '';
  const userName = context?.name1 || settings.wechatId || '用户';
  const userPersonas = settings.userPersonas || [];
  const enabledPersonas = userPersonas.filter(p => p.enabled !== false);
  if (enabledPersonas.length > 0) {
    userPersonaInfo = `\n【关于「${userName}」的设定（你认识的人）】\n`;
    enabledPersonas.forEach(persona => {
      if (persona.name) userPersonaInfo += `[${persona.name}]\n`;
      if (persona.content) userPersonaInfo += `${persona.content}\n`;
    });
    console.log(`[可乐] 朋友圈生成 - 读取到 ${enabledPersonas.length} 条用户设定`);
  }

  // 获取聊天历史上下文（读取最近30条消息，确保朋友圈内容与聊天相关）
  let chatContextInfo = '';
  if (contact.chatHistory && contact.chatHistory.length > 0) {
    const recentChat = contact.chatHistory
      .filter(msg => msg.content && !msg.isRecalled && msg.content.length < 200)
      .slice(-30);
    if (recentChat.length > 0) {
      const chatSummary = recentChat.map(msg => {
        const speaker = msg.role === 'user' ? userName : contact.name;
        let c = msg.content;
        if (c.startsWith('[表情:') || c.startsWith('[语音:') || c.startsWith('[照片:')) c = c.split(']')[0] + ']';
        return `${speaker}: ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`;
      }).join('\n');
      chatContextInfo = `\n【你和${userName}最近的聊天记录（重要！朋友圈内容要与此相关）】\n${chatSummary}\n`;
      console.log(`[可乐] 朋友圈生成 - ${contact.name} 加入了 ${recentChat.length} 条聊天历史`);
    }
  }

  // 随机决定是纯文字还是带图片（60%带图，40%纯文字）
  const withImages = Math.random() < 0.6;
  const imageCount = withImages ? (1 + Math.floor(Math.random() * 4)) : 0; // 1-4张图

  // 随机决定这条朋友圈是否与聊天相关（75%聊天相关，25%个人日常）
  const isChatRelated = Math.random() < 0.75;
  console.log(`[可乐] 朋友圈生成 - ${contact.name} 类型: ${isChatRelated ? '与聊天相关(75%)' : '个人日常(25%)'}`);

  const prompt = `你正在扮演「${contact.name}」，请以这个角色的身份发一条朋友圈动态。
${characterInfo}${userPersonaInfo}${chatContextInfo}
【格式要求】
${withImages ? `这是一条带${imageCount}张图片的朋友圈，请按以下格式输出：
文案内容
[配图:图片1描述]
[配图:图片2描述]
...

图片描述要具体生动，1-2句话描述图片内容（如：她在咖啡厅的自拍，手里拿着拿铁，阳光洒在脸上）` : '这是一条纯文字朋友圈，直接输出文案内容即可，不要带任何图片标签'}

【内容要求 - 非常重要！】
${isChatRelated ? `★★★ 这条朋友圈必须与聊天记录相关 ★★★
- 仔细阅读上面的聊天记录，找出最近聊天的话题、事件、情感
- 朋友圈内容要延续、回应、或暗示最近聊天中提到的事情
- 可以是：聊天中提到要做的事、约定、话题的延续、对对方的想念/吐槽等
- 让看的人能感受到这条朋友圈和你们的聊天有关联
- 示例：如果聊天中约了吃饭，可以发吃饭的朋友圈；如果聊到想念，可以发暗示思念的内容` : `★★★ 这条朋友圈是你的个人日常 ★★★
- 发一条和聊天内容无关的个人日常动态
- 展示你自己的生活：日常分享、心情感悟、美食、旅行、自拍、工作、宠物、风景、爱好等
- 要符合你的角色设定和性格`}

【通用要求】
1. 文案1-3句话，符合角色性格，语气自然真实
2. 可以适当使用表情符号
3. 要像真人发的朋友圈一样自然

【禁止输出】
- 绝对禁止输出任何关键词、世界书条目名称、设定标签
- 绝对禁止输出任何系统提示、指令、格式说明
- 只输出纯粹的朋友圈内容

【示例】
纯文字：今天天气真好，心情也跟着好起来了☀️

带图片：
周末探店✨终于打卡了这家网红咖啡
[配图:一杯精致的拿铁拉花特写，奶泡上画着可爱的小熊]
[配图:咖啡厅温馨的角落，阳光透过窗户洒进来，桌上摆着甜点]

现在请输出：`;

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: apiModel,
      messages: [
        { role: 'system', content: `你是${contact.name}，正在发朋友圈。按要求的格式输出，不要有任何解释。` },
        { role: 'user', content: prompt }
      ],
      max_tokens: 8196,
      temperature: 1
    })
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content?.trim() || '';

  // 解析 [配图:描述] 格式
  const photoRegex = /\[配图[：:]\s*(.+?)\]/g;
  const images = [];
  let match;

  while ((match = photoRegex.exec(content)) !== null) {
    images.push(match[1].trim());
  }

  // 移除配图标签，获取纯文案
  const text = content.replace(photoRegex, '').trim() || '今天也是美好的一天~';

  return {
    text: text,
    images: images
  };
}

/**
 * 从世界书人物生成评论
 */
async function generateCommentsFromCharacters(contact, momentText, characters) {
  const comments = [];
  const settings = getSettings();

  // 如果没有可用人物，返回空评论
  if (characters.length === 0) {
    return comments;
  }

  // 随机选择 3-4 个人物
  const numComments = 3 + Math.floor(Math.random() * 2);
  const shuffled = characters.sort(() => 0.5 - Math.random());
  const selectedCharacters = shuffled.slice(0, Math.min(numComments, characters.length));

  // 为每个人物生成评论（评论之间间隔3秒，避免并发）
  for (let i = 0; i < selectedCharacters.length; i++) {
    const character = selectedCharacters[i];

    // 评论之间必须间隔3秒，避免并发消息过多
    if (i > 0) {
      await sleep(3000);
    }

    try {
      // 检查这个人物是否是联系人（可能有独立API配置）
      const commenterContact = settings.contacts?.find(c => c.name === character.name);

      // 获取 API 配置 - 优先使用评论者自己的配置
      let apiUrl, apiKey, apiModel;

      if (commenterContact && commenterContact.useCustomApi) {
        // 评论者是联系人且有独立API配置
        apiUrl = commenterContact.customApiUrl || settings.apiUrl || '';
        apiKey = commenterContact.customApiKey || settings.apiKey || '';
        apiModel = commenterContact.customModel || settings.selectedModel || '';
        console.log(`[可乐] 朋友圈评论 - ${character.name} 使用独立API配置`);
      } else if (contact.useCustomApi) {
        // 回退到朋友圈所有者的配置
        apiUrl = contact.customApiUrl || settings.apiUrl || '';
        apiKey = contact.customApiKey || settings.apiKey || '';
        apiModel = contact.customModel || settings.selectedModel || '';
      } else {
        // 使用全局配置
        apiUrl = settings.apiUrl || '';
        apiKey = settings.apiKey || '';
        apiModel = settings.selectedModel || '';
      }

      if (!apiUrl) {
        continue;
      }

      // 处理 API URL，确保正确拼接
      let chatUrl = apiUrl.replace(/\/+$/, '');
      if (!chatUrl.includes('/chat/completions')) {
        if (!chatUrl.endsWith('/v1')) {
          chatUrl += '/v1';
        }
        chatUrl += '/chat/completions';
      }

      // 构建包含人物详细信息的提示 - 优先读取评论者自己的世界书
      let characterInfo = '';

      if (commenterContact) {
        // 评论者是联系人，使用通用辅助函数获取世界书
        const commenterLorebookEntries = getLorebookEntriesForContact(commenterContact, settings);

        if (commenterLorebookEntries.length > 0) {
          characterInfo = `\n\n【关于「${character.name}」的设定】\n${commenterLorebookEntries.join('\n')}`;
          console.log(`[可乐] 朋友圈评论 - ${character.name} 获取到 ${commenterLorebookEntries.length} 条设定`);
        } else if (character.content) {
          // 回退到从发布者世界书提取的内容
          characterInfo = `\n\n【关于「${character.name}」的设定】\n${character.content}`;
          console.log(`[可乐] 朋友圈评论 - ${character.name} 回退使用发布者世界书`);
        }
      } else if (character.content) {
        // 非联系人，使用从发布者世界书提取的内容
        characterInfo = `\n\n【关于「${character.name}」的设定】\n${character.content}`;
      }

      // 已有评论列表，避免重复
      const existingComments = comments.map(c => `${c.name}: ${c.text}`).join('\n');
      const avoidText = existingComments ? `\n\n【已有评论，请避免相似内容】\n${existingComments}` : '';

      // 获取用户设定（评论者可能认识用户）
      let userPersonaInfo = '';
      const userPersonas = settings.userPersonas || [];
      const enabledPersonas = userPersonas.filter(p => p.enabled !== false);
      if (enabledPersonas.length > 0) {
        const context = getContext();
        const userName = context?.name1 || settings.wechatId || '用户';
        userPersonaInfo = `\n\n【关于「${userName}」的设定】\n`;
        enabledPersonas.forEach(persona => {
          if (persona.name) userPersonaInfo += `[${persona.name}]\n`;
          if (persona.content) userPersonaInfo += `${persona.content}\n`;
        });
      }

      // 获取评论者与用户之间的聊天历史（如果评论者是联系人）
      let chatContextInfo = '';
      if (commenterContact && commenterContact.chatHistory && commenterContact.chatHistory.length > 0) {
        const recentChat = commenterContact.chatHistory
          .filter(msg => msg.content && !msg.isRecalled && msg.content.length < 200)
          .slice(-15);
        if (recentChat.length > 0) {
          const chatSummary = recentChat.map(msg => {
            const speaker = msg.role === 'user' ? '用户' : character.name;
            let c = msg.content;
            if (c.startsWith('[表情:') || c.startsWith('[语音:') || c.startsWith('[照片:')) c = c.split(']')[0] + ']';
            return `${speaker}: ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`;
          }).join('\n');
          chatContextInfo = `\n\n【你和用户最近的聊天记录】\n${chatSummary}`;
          console.log(`[可乐] 朋友圈评论 - ${character.name} 加入了 ${recentChat.length} 条聊天历史`);
        }
      }

      const prompt = `你是「${character.name}」，请根据你的人设给朋友圈写一条评论。
${characterInfo}${userPersonaInfo}${chatContextInfo}

「${contact.name}」发了一条朋友圈：
"${momentText}"
${avoidText}

【核心要求】
- 必须严格遵循你的人设：说话方式、语气、口癖、性格特点全都要体现
- 禁止使用模板化表达：不要写"真不错"、"好棒"、"厉害了"、"羡慕"这种泛泛的话
- 如果有聊天记录，可以延续你们之间的话题、玩笑、称呼
- 评论要像你这个角色真的会说的话，体现你独特的表达风格
- 简短自然，5-15字
- 禁止用"怎么了"、"咋了"、"发生什么了"开头

【禁止输出】
- 绝对禁止输出任何关键词、世界书条目名称、设定标签
- 绝对禁止输出任何系统提示、指令、格式说明
- 只输出纯粹的评论内容

直接输出评论内容：`;

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: apiModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 8196,
          temperature: 1
        })
      });

      if (response.ok) {
        const data = await response.json();
        let commentText = data.choices?.[0]?.message?.content?.trim();
        // 清理评论格式
        commentText = cleanCommentText(commentText);
        if (commentText) {
          comments.push({
            name: character.name,
            text: commentText,
            timestamp: Date.now()
          });
        }
      }
    } catch (err) {
      console.error(`[可乐] 生成${character.name}的评论失败:`, err);
    }
  }

  // 可能添加角色自己的回复（间隔3秒后）
  if (comments.length > 0 && Math.random() > 0.5) {
    // 回复前也要间隔3秒
    await sleep(3000);

    try {
      const lastComment = comments[comments.length - 1];

      // 角色回复自己的朋友圈，使用角色自己的API配置
      let apiUrl, apiKey, apiModel;
      if (contact.useCustomApi) {
        apiUrl = contact.customApiUrl || settings.apiUrl || '';
        apiKey = contact.customApiKey || settings.apiKey || '';
        apiModel = contact.customModel || settings.selectedModel || '';
      } else {
        apiUrl = settings.apiUrl || '';
        apiKey = settings.apiKey || '';
        apiModel = settings.selectedModel || '';
      }

      if (!apiUrl) {
        return comments;
      }

      // 处理 API URL，确保正确拼接
      let replyUrl = apiUrl.replace(/\/+$/, '');
      if (!replyUrl.includes('/chat/completions')) {
        if (!replyUrl.endsWith('/v1')) {
          replyUrl += '/v1';
        }
        replyUrl += '/chat/completions';
      }

      const replyPrompt = `你是「${contact.name}」，你发的朋友圈：
"${momentText}"

「${lastComment.name}」评论说："${lastComment.text}"

请写一条回复。要求：
1. 回复要简短自然（5-15字）
2. 符合你的性格
3. 直接输出回复内容`;

      const response = await fetch(replyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: apiModel,
          messages: [
            { role: 'user', content: replyPrompt }
          ],
          max_tokens: 8196,
          temperature: 1
        })
      });

      if (response.ok) {
        const data = await response.json();
        const replyText = data.choices?.[0]?.message?.content?.trim();
        if (replyText) {
          comments.push({
            name: contact.name,
            text: replyText,
            replyTo: lastComment.name,
            timestamp: Date.now()
          });
        }
      }
    } catch (err) {
      console.error('[可乐] 生成角色回复失败:', err);
    }
  }

  return comments;
}

/**
 * 角色回复用户的评论
 */
async function generateContactReplyToComment(contactIndex, momentIndex, userName, userComment) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact || !settings.momentsData) return;

  const moments = settings.momentsData[contact.id];
  if (!moments || !moments[momentIndex]) return;

  const moment = moments[momentIndex];

  // 获取 API 配置
  let apiUrl, apiKey, apiModel;

  if (contact.useCustomApi) {
    apiUrl = contact.customApiUrl || settings.apiUrl || '';
    apiKey = contact.customApiKey || settings.apiKey || '';
    apiModel = contact.customModel || settings.selectedModel || '';
  } else {
    apiUrl = settings.apiUrl || '';
    apiKey = settings.apiKey || '';
    apiModel = settings.selectedModel || '';
  }

  if (!apiUrl) return;

  // 处理 API URL，确保正确拼接
  let chatUrl = apiUrl.replace(/\/+$/, ''); // 去除末尾斜杠
  if (!chatUrl.includes('/chat/completions')) {
    if (!chatUrl.endsWith('/v1')) {
      chatUrl += '/v1';
    }
    chatUrl += '/chat/completions';
  }

  try {
    // 获取角色世界书设定
    const lorebookEntries = getLorebookEntriesForContact(contact, settings);
    let characterInfo = '';
    if (lorebookEntries.length > 0) {
      characterInfo = `\n\n【关于「${contact.name}」的设定】\n${lorebookEntries.join('\n')}`;
      console.log(`[可乐] 朋友圈回复评论 - ${contact.name} 获取到 ${lorebookEntries.length} 条设定`);
    }

    // 获取用户设定
    let userPersonaInfo = '';
    const userPersonas = settings.userPersonas || [];
    const enabledPersonas = userPersonas.filter(p => p.enabled !== false);
    if (enabledPersonas.length > 0) {
      userPersonaInfo = `\n\n【关于「${userName}」的设定】\n`;
      enabledPersonas.forEach(persona => {
        if (persona.name) userPersonaInfo += `[${persona.name}]\n`;
        if (persona.content) userPersonaInfo += `${persona.content}\n`;
      });
    }

    // 获取聊天历史上下文（读取所有聊天记录）
    let chatContextInfo = '';
    if (contact.chatHistory && contact.chatHistory.length > 0) {
      const allChat = contact.chatHistory
        .filter(msg => msg.content && !msg.isRecalled && msg.content.length < 200);
      if (allChat.length > 0) {
        const chatSummary = allChat.map(msg => {
          const speaker = msg.role === 'user' ? userName : contact.name;
          let c = msg.content;
          if (c.startsWith('[表情:') || c.startsWith('[语音:') || c.startsWith('[照片:')) c = c.split(']')[0] + ']';
          return `${speaker}: ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`;
        }).join('\n');
        chatContextInfo = `\n\n【你和${userName}的聊天记录】\n${chatSummary}`;
        console.log(`[可乐] 朋友圈回复评论 - ${contact.name} 加入了 ${allChat.length} 条聊天历史`);
      }
    }

    // 已有评论列表
    const existingComments = (moment.comments || []).map(c => {
      const replyPart = c.replyTo ? `回复${c.replyTo}` : '';
      return `${c.name}${replyPart}: ${c.text}`;
    }).join('\n');
    const commentsContext = existingComments ? `\n\n【已有评论】\n${existingComments}` : '';

    const prompt = `你是「${contact.name}」，${userName}在你的朋友圈下评论了，你必须回复他。
${characterInfo}${userPersonaInfo}${chatContextInfo}

你发的朋友圈：
"${moment.text}"
${commentsContext}

「${userName}」刚刚评论说："${userComment}"

【核心要求】
- 必须回复！你必须选择以下两种方式之一进行回复，不能忽略
- 严格遵循你的人设：说话方式、语气、口癖、性格特点
- 回复简短自然（5-20字）
- 可以用表情符号

【回复方式二选一】
1. 评论区回复（公开）：直接输出回复内容
2. 私聊回复（私密的话）：输出格式 [私聊] 消息内容

直接输出回复：`;

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 8196,
        temperature: 1
      })
    });

    if (!response.ok) {
      console.error(`[可乐] 朋友圈回复评论 API 请求失败: ${response.status}`);
      return;
    }

    const data = await response.json();
    const replyText = data.choices?.[0]?.message?.content?.trim();

    if (!replyText) {
      console.error('[可乐] 朋友圈回复评论 - AI返回空内容');
      return;
    }

    console.log(`[可乐] ${contact.name} 回复用户评论: ${replyText}`);

    // 判断是私聊还是评论区回复
    if (replyText.startsWith('[私聊]')) {
      // 通过私聊回复 - 触发聊天消息
      const chatMessage = replyText.replace('[私聊]', '').trim();

      // 添加到聊天记录
      addPrivateMessageFromContact(contactIndex, chatMessage, `关于你的朋友圈评论：「${userComment}」`);

      showNotificationBanner(contact.name, chatMessage);
    } else {
      // 在评论区回复
      let commentReply = replyText.replace(/^\[.*?\]\s*/, '').trim(); // 移除可能的前缀标签

      // 清理AI可能自动添加的重复"xx回复xx:"格式
      // 匹配格式：名字回复名字: 或 名字 回复 名字:（支持冒号为中英文）
      const replyPattern = new RegExp(`^${contact.name}\\s*回复\\s*${userName}\\s*[：:]\\s*`, 'i');
      commentReply = commentReply.replace(replyPattern, '').trim();
      // 也清理可能的其他回复格式
      commentReply = commentReply.replace(/^回复\s*[^：:]+[：:]\s*/, '').trim();

      if (!moment.comments) moment.comments = [];
      moment.comments.push({
        name: contact.name,
        text: commentReply,
        replyTo: userName,
        timestamp: Date.now()
      });
      requestSave();
      renderMomentsList(currentContactIndex);
    }

  } catch (err) {
    console.error('[可乐] 生成角色回复失败:', err);
  }
}

/**
 * 添加朋友圈动态（外部调用接口）
 */
export function addMomentToContact(contactId, momentData) {
  const settings = getSettings();

  if (!settings.momentsData) settings.momentsData = {};
  if (!settings.momentsData[contactId]) settings.momentsData[contactId] = [];

  const newMoment = {
    id: Date.now().toString(),
    text: momentData.text || '',
    images: momentData.images || [],
    timestamp: Date.now(),
    likes: [],
    comments: momentData.comments || []
  };

  settings.momentsData[contactId].unshift(newMoment);
  requestSave();
}

/**
 * 清空指定联系人的所有朋友圈
 * @param {number} contactIndex - 联系人索引
 */
export function clearContactMoments(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts?.[contactIndex];

  if (!contact) {
    showToast('找不到联系人', '❌');
    return;
  }

  if (!confirm(`确定要清空「${contact.name}」的所有朋友圈吗？此操作不可恢复。`)) {
    return;
  }

  if (!settings.momentsData) {
    showToast('没有朋友圈数据', '❌');
    return;
  }

  const momentCount = (settings.momentsData[contact.id] || []).length;
  if (momentCount === 0) {
    showToast('该联系人没有朋友圈', '⚠️');
    return;
  }

  // 清空该联系人的朋友圈
  settings.momentsData[contact.id] = [];
  requestSave();

  showToast(`已清空 ${momentCount} 条朋友圈`, 'success');
  console.log(`[可乐] 已清空 ${contact.name} 的 ${momentCount} 条朋友圈`);
}

// 用户发朋友圈时选择的图片
let userMomentImages = [];

/**
 * 显示用户发布朋友圈的弹窗
 */
function showUserPostMomentModal() {
  // 移除已有弹窗
  document.getElementById('wechat-post-moment-modal')?.remove();
  userMomentImages = []; // 重置图片列表

  const modal = document.createElement('div');
  modal.className = 'wechat-modal';
  modal.id = 'wechat-post-moment-modal';
  modal.innerHTML = `
    <div class="wechat-modal-content" style="max-width: 320px; margin: auto; background: #fff !important; color: #000 !important;">
      <div class="wechat-modal-title" style="color: #000 !important;">发朋友圈</div>
      <textarea id="wechat-moment-text-input" placeholder="这一刻的想法..." style="width: 100%; height: 100px; padding: 10px; border: 1px solid #e0e0e0; border-radius: 8px; resize: none; background: #fff !important; color: #000 !important; font-size: 14px; margin-bottom: 12px; box-sizing: border-box;"></textarea>

      <!-- 图片预览区域 -->
      <div id="wechat-moment-images-preview" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;"></div>

      <!-- 添加图片按钮 -->
      <div id="wechat-moment-add-image" style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #f8f8f8; border-radius: 8px; cursor: pointer; margin-bottom: 12px; border: 1px dashed #ccc;">
        <svg viewBox="0 0 24 24" width="24" height="24" style="color: #666;">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
          <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        <span style="color: #666; font-size: 14px;">添加图片</span>
      </div>
      <input type="file" id="wechat-moment-image-input" accept="image/*" multiple style="display: none;">

      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button class="wechat-btn wechat-btn-secondary" id="wechat-moment-cancel" style="background: #f0f0f0; color: #333;">取消</button>
        <button class="wechat-btn wechat-btn-primary" id="wechat-moment-publish">发表</button>
      </div>
    </div>
  `;

  // 添加到手机容器内，而不是 document.body
  const phoneContainer = document.getElementById('wechat-phone');
  if (phoneContainer) {
    phoneContainer.appendChild(modal);
  } else {
    document.body.appendChild(modal);
  }

  // 聚焦输入框
  document.getElementById('wechat-moment-text-input')?.focus();

  // 添加图片按钮点击
  document.getElementById('wechat-moment-add-image')?.addEventListener('click', () => {
    document.getElementById('wechat-moment-image-input')?.click();
  });

  // 图片选择处理
  document.getElementById('wechat-moment-image-input')?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (userMomentImages.length >= 9) {
        showToast('最多添加9张图片', '⚠️');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        userMomentImages.push({
          url: event.target.result,
          desc: ''
        });
        renderMomentImagesPreview();
      };
      reader.readAsDataURL(file);
    });

    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  });

  // 取消按钮
  document.getElementById('wechat-moment-cancel')?.addEventListener('click', () => {
    modal.remove();
  });

  // 发表按钮
  document.getElementById('wechat-moment-publish')?.addEventListener('click', () => {
    const text = document.getElementById('wechat-moment-text-input')?.value?.trim();
    if (!text && userMomentImages.length === 0) {
      showToast('请输入内容或添加图片', '⚠️');
      return;
    }
    publishUserMomentWithImages(text, userMomentImages);
    modal.remove();
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * 渲染图片预览
 */
function renderMomentImagesPreview() {
  const container = document.getElementById('wechat-moment-images-preview');
  if (!container) return;

  if (userMomentImages.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = userMomentImages.map((img, index) => `
    <div style="position: relative; width: 80px;">
      <img src="${img.url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid #e0e0e0;">
      <button onclick="window.removeMomentImage(${index})" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ff4d4f; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <input type="text" placeholder="图片描述" value="${img.desc || ''}" onchange="window.updateMomentImageDesc(${index}, this.value)" style="width: 100%; margin-top: 4px; padding: 4px; font-size: 10px; border: 1px solid #e0e0e0; border-radius: 4px; box-sizing: border-box; background: #fff; color: #000;">
    </div>
  `).join('');
}

// 暴露给全局以便onclick使用
window.removeMomentImage = function(index) {
  userMomentImages.splice(index, 1);
  renderMomentImagesPreview();
};

window.updateMomentImageDesc = function(index, desc) {
  if (userMomentImages[index]) {
    userMomentImages[index].desc = desc;
  }
};

/**
 * 发布用户的朋友圈（带图片）
 */
function publishUserMomentWithImages(text, images) {
  const settings = getSettings();
  const userId = 'user';

  if (!settings.momentsData) settings.momentsData = {};
  if (!settings.momentsData[userId]) settings.momentsData[userId] = [];

  // 处理图片：保存URL，描述作为备用文本
  const processedImages = (images || []).map(img => {
    // 如果有描述，用特殊格式存储
    if (img.desc) {
      return { url: img.url, desc: img.desc };
    }
    return img.url;
  });

  const newMoment = {
    id: Date.now().toString(),
    text: text || '',
    images: processedImages,
    timestamp: Date.now(),
    likes: [],
    comments: [],
    isUserMoment: true
  };

  settings.momentsData[userId].unshift(newMoment);
  requestSave();

  showToast('朋友圈已发布', 'success');
  renderMomentsList(null);

  // 通知所有联系人（可能触发他们的评论/点赞）
  triggerContactsReactToUserMoment(newMoment);
}

/**
 * 发布用户的朋友圈（纯文字，保留兼容性）
 */
function publishUserMoment(text) {
  publishUserMomentWithImages(text, []);
}

/**
 * 删除朋友圈（支持删除任何朋友圈）
 */
function deleteUserMoment(index) {
  if (!confirm('确定要删除这条朋友圈吗？')) return;

  const settings = getSettings();

  if (!settings.momentsData) {
    showToast('删除失败', '❌');
    return;
  }

  // 根据当前视图确定要删除的朋友圈
  if (currentContactIndex !== null) {
    // 查看特定联系人的朋友圈
    const contact = settings.contacts[currentContactIndex];
    if (!contact || !settings.momentsData[contact.id]) {
      showToast('删除失败', '❌');
      return;
    }
    const moments = settings.momentsData[contact.id];
    if (!moments || !moments[index]) {
      showToast('删除失败', '❌');
      return;
    }
    // 删除该联系人的指定朋友圈
    settings.momentsData[contact.id].splice(index, 1);
    requestSave();
    showToast('已删除', 'success');
    renderMomentsList(currentContactIndex);
  } else {
    // 查看所有朋友圈（合并视图）
    const allMoments = [];
    Object.keys(settings.momentsData).forEach(contactId => {
      const contactMoments = settings.momentsData[contactId] || [];
      contactMoments.forEach((m, i) => {
        allMoments.push({
          ...m,
          contactId,
          originalIndex: i
        });
      });
    });
    allMoments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const targetMoment = allMoments[index];
    if (!targetMoment) {
      showToast('删除失败', '❌');
      return;
    }

    // 从对应联系人的朋友圈数组中删除
    settings.momentsData[targetMoment.contactId].splice(targetMoment.originalIndex, 1);
    requestSave();
    showToast('已删除', 'success');
    renderMomentsList(null);
  }
}

/**
 * 触发联系人对用户朋友圈的反应
 */
async function triggerContactsReactToUserMoment(moment) {
  const settings = getSettings();
  if (!settings.contacts || settings.contacts.length === 0) return;

  // 随机选择 2-5 个联系人来点赞或评论
  const numReactors = 2 + Math.floor(Math.random() * 4);
  const shuffled = [...settings.contacts].sort(() => 0.5 - Math.random());
  const reactors = shuffled.slice(0, Math.min(numReactors, settings.contacts.length));

  for (const contact of reactors) {
    // 评论之间必须间隔3秒，避免并发消息过多导致AI误读
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 随机决定是点赞还是评论（70%评论，30%只点赞）
    const action = Math.random() > 0.3 ? 'comment' : 'like';

    if (action === 'like') {
      // 点赞
      if (!moment.likes.includes(contact.name)) {
        moment.likes.push(contact.name);
        requestSave();
        // 用户朋友圈使用 null 作为 contactIndex
        renderMomentsList(null);
      }
    } else {
      // 评论
      try {
        const comment = await generateContactCommentOnUserMoment(contact, moment);
        if (comment) {
          moment.comments.push({
            name: contact.name,
            text: comment,
            timestamp: Date.now()
          });
          // 同时点赞
          if (!moment.likes.includes(contact.name)) {
            moment.likes.push(contact.name);
          }
          requestSave();
          // 用户朋友圈使用 null 作为 contactIndex
          renderMomentsList(null);

          // 30%概率会发起私聊
          if (Math.random() < 0.3) {
            triggerPrivateChatFromMoment(contact, moment.text);
          }
        }
      } catch (err) {
        console.error(`[可乐] ${contact.name}评论失败:`, err);
      }
    }
  }
}

/**
 * 生成联系人对用户朋友圈的评论
 */
async function generateContactCommentOnUserMoment(contact, moment) {
  const settings = getSettings();
  const context = getContext();
  const momentText = moment.text || '';

  let apiUrl, apiKey, apiModel;
  if (contact.useCustomApi) {
    apiUrl = contact.customApiUrl || settings.apiUrl || '';
    apiKey = contact.customApiKey || settings.apiKey || '';
    apiModel = contact.customModel || settings.selectedModel || '';
  } else {
    apiUrl = settings.apiUrl || '';
    apiKey = settings.apiKey || '';
    apiModel = settings.selectedModel || '';
  }

  if (!apiUrl) {
    console.log('[可乐] 无API配置，跳过评论生成');
    return null;
  }

  // 处理 API URL，确保正确拼接
  let chatUrl = apiUrl.replace(/\/+$/, ''); // 去除末尾斜杠
  if (!chatUrl.includes('/chat/completions')) {
    if (!chatUrl.endsWith('/v1')) {
      chatUrl += '/v1';
    }
    chatUrl += '/chat/completions';
  }

  const userName = context?.name1 || settings.wechatId || '用户';

  // 获取用户设定
  let userPersonaInfo = '';
  const userPersonas = settings.userPersonas || [];
  const enabledPersonas = userPersonas.filter(p => p.enabled !== false);
  if (enabledPersonas.length > 0) {
    userPersonaInfo = `\n\n【关于「${userName}」的设定】\n`;
    enabledPersonas.forEach(persona => {
      if (persona.name) userPersonaInfo += `[${persona.name}]\n`;
      if (persona.content) userPersonaInfo += `${persona.content}\n`;
    });
    console.log(`[可乐] 用户朋友圈评论 - 读取到 ${enabledPersonas.length} 条用户设定`);
  }

  // 使用通用辅助函数获取世界书条目
  const lorebookEntries = getLorebookEntriesForContact(contact, settings);

  // 构建角色设定信息
  let characterInfo = '';
  if (lorebookEntries.length > 0) {
    characterInfo = `\n\n【关于「${contact.name}」的设定】\n${lorebookEntries.join('\n')}`;
    console.log(`[可乐] 用户朋友圈评论 - ${contact.name} 获取到 ${lorebookEntries.length} 条设定`);
  } else {
    console.log(`[可乐] 用户朋友圈评论 - ${contact.name} 未获取到任何设定`);
  }

  // 已有评论列表，避免重复
  const existingComments = (moment.comments || []).map(c => `${c.name}: ${c.text}`).join('\n');
  const avoidText = existingComments ? `\n\n【已有评论，请避免相似内容】\n${existingComments}` : '';

  // 获取评论者与用户之间的聊天历史
  let chatContextInfo = '';
  if (contact.chatHistory && contact.chatHistory.length > 0) {
    const recentChat = contact.chatHistory
      .filter(msg => msg.content && !msg.isRecalled && msg.content.length < 200)
      .slice(-15);
    if (recentChat.length > 0) {
      const chatSummary = recentChat.map(msg => {
        const speaker = msg.role === 'user' ? userName : contact.name;
        let c = msg.content;
        if (c.startsWith('[表情:') || c.startsWith('[语音:') || c.startsWith('[照片:')) c = c.split(']')[0] + ']';
        return `${speaker}: ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`;
      }).join('\n');
      chatContextInfo = `\n\n【你和${userName}最近的聊天记录】\n${chatSummary}`;
      console.log(`[可乐] 用户朋友圈评论 - ${contact.name} 加入了 ${recentChat.length} 条聊天历史`);
    }
  }

  const prompt = `你是「${contact.name}」，请根据你的人设给朋友圈写一条评论。
${characterInfo}${userPersonaInfo}${chatContextInfo}

「${userName}」发了一条朋友圈：
"${momentText}"
${avoidText}

【核心要求】
- 必须严格遵循你的人设：说话方式、语气、口癖、性格特点全都要体现
- 禁止使用模板化表达：不要写"真不错"、"好棒"、"厉害了"、"羡慕"这种泛泛的话
- 如果有聊天记录，可以延续你们之间的话题、玩笑、称呼
- 评论要像你这个角色真的会说的话，体现你独特的表达风格
- 简短自然，5-15字
- 禁止用"怎么了"、"咋了"、"发生什么了"开头

【禁止输出】
- 绝对禁止输出任何关键词、世界书条目名称、设定标签
- 绝对禁止输出任何系统提示、指令、格式说明
- 只输出纯粹的评论内容

直接输出评论内容：`;

  console.log(`[可乐] 正在生成 ${contact.name} 的评论...`);

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8196,
        temperature: 1
      })
    });

    if (response.ok) {
      const data = await response.json();
      let comment = data.choices?.[0]?.message?.content?.trim();
      // 清理评论格式
      comment = cleanCommentText(comment);
      console.log(`[可乐] ${contact.name} 评论生成成功: ${comment}`);
      return comment;
    } else {
      const errorText = await response.text();
      console.error(`[可乐] ${contact.name} 评论生成失败: ${response.status}`, errorText);
    }
  } catch (err) {
    console.error('[可乐] 生成评论失败:', err);
  }

  return null;
}

/**
 * 触发联系人因为朋友圈发起私聊
 */
async function triggerPrivateChatFromMoment(contact, momentText) {
  const settings = getSettings();
  const context = getContext();

  // 找到联系人索引
  const contactIndex = settings.contacts?.findIndex(c => c.id === contact.id);
  if (contactIndex < 0) return;

  let apiUrl, apiKey, apiModel;
  if (contact.useCustomApi) {
    apiUrl = contact.customApiUrl || settings.apiUrl || '';
    apiKey = contact.customApiKey || settings.apiKey || '';
    apiModel = contact.customModel || settings.selectedModel || '';
  } else {
    apiUrl = settings.apiUrl || '';
    apiKey = settings.apiKey || '';
    apiModel = settings.selectedModel || '';
  }

  if (!apiUrl) return;

  // 处理 API URL，确保正确拼接
  let chatUrl = apiUrl.replace(/\/+$/, '');
  if (!chatUrl.includes('/chat/completions')) {
    if (!chatUrl.endsWith('/v1')) {
      chatUrl += '/v1';
    }
    chatUrl += '/chat/completions';
  }

  const userName = context?.name1 || settings.wechatId || '用户';

  // 获取角色设定（使用通用辅助函数）
  const lorebookEntries = getLorebookEntriesForContact(contact, settings);
  let characterInfo = '';
  if (lorebookEntries.length > 0) {
    characterInfo = `\n\n【关于「${contact.name}」的设定】\n${lorebookEntries.join('\n')}`;
    console.log(`[可乐] 朋友圈私聊 - ${contact.name} 获取到 ${lorebookEntries.length} 条设定`);
  }

  // 获取用户设定
  let userPersonaInfo = '';
  const userPersonas = settings.userPersonas || [];
  const enabledPersonas = userPersonas.filter(p => p.enabled !== false);
  if (enabledPersonas.length > 0) {
    userPersonaInfo = `\n\n【关于「${userName}」的设定】\n`;
    enabledPersonas.forEach(persona => {
      if (persona.name) userPersonaInfo += `[${persona.name}]\n`;
      if (persona.content) userPersonaInfo += `${persona.content}\n`;
    });
  }

  // 获取聊天历史
  let chatContextInfo = '';
  if (contact.chatHistory && contact.chatHistory.length > 0) {
    const recentChat = contact.chatHistory
      .filter(msg => msg.content && !msg.isRecalled && msg.content.length < 200)
      .slice(-15);
    if (recentChat.length > 0) {
      const chatSummary = recentChat.map(msg => {
        const speaker = msg.role === 'user' ? userName : contact.name;
        let c = msg.content;
        if (c.startsWith('[表情:') || c.startsWith('[语音:') || c.startsWith('[照片:')) c = c.split(']')[0] + ']';
        return `${speaker}: ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`;
      }).join('\n');
      chatContextInfo = `\n\n【你和${userName}最近的聊天记录】\n${chatSummary}`;
      console.log(`[可乐] 朋友圈私聊 - ${contact.name} 加入了 ${recentChat.length} 条聊天历史`);
    }
  }

  const prompt = `你是「${contact.name}」，请根据你的人设给${userName}发一条私聊消息。
${characterInfo}${userPersonaInfo}${chatContextInfo}

「${userName}」发了一条朋友圈："${momentText}"

你看到这条朋友圈后，想主动私聊${userName}。

【核心要求】
- 必须严格遵循你的人设：说话方式、语气、口癖、性格特点全都要体现
- 禁止使用模板化表达：不要写"看到你的朋友圈"、"你发的朋友圈"这种直白的话
- 如果有聊天记录，可以延续你们之间的话题、玩笑、称呼
- 消息要像你这个角色真的会说的话，体现你独特的表达风格
- 简短自然，10-30字
- 可以是：好奇追问、撒娇吐槽、关心问候、调侃玩笑等，要符合你的性格

直接输出消息内容：`;

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8196,
        temperature: 1
      })
    });

    if (response.ok) {
      const data = await response.json();
      const message = data.choices?.[0]?.message?.content?.trim();
      if (message) {
        // 延迟一段时间后发送私聊
        setTimeout(() => {
          addPrivateChatMessage(contactIndex, contact, message);
        }, 5000 + Math.random() * 10000);
      }
    }
  } catch (err) {
    console.error('[可乐] 生成私聊消息失败:', err);
  }
}

/**
 * 添加私聊消息到聊天记录
 */
function addPrivateChatMessage(contactIndex, contact, message) {
  const settings = getSettings();
  const targetContact = settings.contacts?.[contactIndex];
  if (!targetContact) return;

  // 初始化聊天记录
  if (!targetContact.chatHistory) {
    targetContact.chatHistory = [];
  }

  // 添加消息
  const chatMessage = {
    role: 'assistant',
    content: message,
    timestamp: Date.now()
  };
  targetContact.chatHistory.push(chatMessage);
  targetContact.lastMessage = message;

  // 增加未读数
  targetContact.unreadCount = (targetContact.unreadCount || 0) + 1;

  requestSave();

  // 刷新聊天列表
  import('./ui.js').then(({ refreshChatList }) => {
    if (typeof refreshChatList === 'function') {
      refreshChatList();
    }
  }).catch(err => console.error('[可乐] 导入ui模块失败:', err));

  showNotificationBanner(contact.name, message);
  console.log(`[可乐] ${contact.name} 因朋友圈发起私聊: ${message}`);
}

/**
 * 记录消息并检查是否需要触发朋友圈
 * 每收到一条消息调用此函数
 * @param {string} contactId - 联系人ID
 * @returns {boolean} - 是否需要触发朋友圈生成
 */
export function recordMessageAndCheckTrigger(contactId) {
  if (!contactId) return false;

  // 计数器 +1（持久化存储）
  const count = getMessageCounter(contactId) + 1;
  setMessageCounter(contactId, count);

  console.log(`[可乐] 朋友圈触发检查: ${contactId} 已累计 ${count} 条消息`);

  // 保底机制：每100条消息必触发
  if (count >= 100) {
    console.log(`[可乐] 触发保底机制: ${contactId} 达到100条消息`);
    setMessageCounter(contactId, 0);
    return true;
  }

  // 随机触发：每条消息有 10% 概率触发（平均10条触发一次）
  // 但至少要有5条消息后才开始随机
  if (count >= 5 && Math.random() < 0.10) {
    console.log(`[可乐] 随机触发: ${contactId} 在第 ${count} 条消息触发`);
    setMessageCounter(contactId, 0);
    return true;
  }

  return false;
}

/**
 * 聊天结束后尝试触发朋友圈生成
 * @param {number} contactIndex - 联系人索引
 */
export async function tryTriggerMomentAfterChat(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts?.[contactIndex];

  if (!contact) {
    console.log('[可乐] tryTriggerMomentAfterChat: 找不到联系人');
    return;
  }

  // 检查是否应该触发
  const shouldTrigger = recordMessageAndCheckTrigger(contact.id);

  if (!shouldTrigger) {
    return;
  }

  // 延迟执行，模拟真实发朋友圈的时间差（30秒到5分钟）
  const delay = 30000 + Math.random() * 270000;
  console.log(`[可乐] 将在 ${Math.round(delay / 1000)} 秒后为 ${contact.name} 生成朋友圈`);

  setTimeout(async () => {
    try {
      await generateNewMomentForContact(contactIndex);
      console.log(`[可乐] ${contact.name} 的朋友圈已自动生成`);
    } catch (err) {
      console.error(`[可乐] 自动生成朋友圈失败:`, err);
    }
  }, delay);
}

/**
 * 重置消息计数器
 * @param {string} contactId - 联系人ID，不传则重置所有
 */
export function resetMessageCounter(contactId = null) {
  const settings = getSettings();
  if (!settings.momentMessageCounters) settings.momentMessageCounters = {};

  if (contactId) {
    settings.momentMessageCounters[contactId] = 0;
  } else {
    settings.momentMessageCounters = {};
  }
  requestSave();
}

/**
 * 从联系人发送私聊消息（用于朋友圈回复等场景）
 * @param {number} contactIndex - 联系人索引
 * @param {string} message - 消息内容
 * @param {string} context - 上下文说明（可选，用于显示引用）
 */
function addPrivateMessageFromContact(contactIndex, message, context = '') {
  const settings = getSettings();
  const contact = settings.contacts?.[contactIndex];

  if (!contact) return;

  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // 添加角色消息到聊天记录
  contact.chatHistory.push({
    role: 'assistant',
    content: message,
    time: timeStr,
    timestamp: Date.now(),
    fromMoments: true, // 标记来自朋友圈
    momentsContext: context
  });

  // 更新最后消息
  contact.lastMessage = message.length > 20 ? message.substring(0, 20) + '...' : message;
  contact.lastMsgTime = timeStr;

  // 增加未读消息计数
  contact.unreadCount = (contact.unreadCount || 0) + 1;

  requestSave();

  // 尝试刷新聊天列表
  try {
    const refreshChatList = window.wechatRefreshChatList;
    if (typeof refreshChatList === 'function') {
      refreshChatList();
    }
  } catch (e) {
    console.log('[可乐] 刷新聊天列表失败:', e);
  }

  console.log(`[可乐] ${contact.name} 通过私聊回复:`, message);
}

/**
 * 联系人回复用户朋友圈下的评论
 * 当用户在自己的朋友圈中回复联系人的评论时调用
 * @param {number} contactIndex - 被回复的联系人索引
 * @param {number} momentIndex - 朋友圈索引
 * @param {string} userName - 用户名
 * @param {string} userComment - 用户的回复内容
 * @param {string} contactName - 被回复的联系人名称
 */
async function generateContactReplyToUserMomentComment(contactIndex, momentIndex, userName, userComment, contactName) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact || !settings.momentsData) return;

  // 用户的朋友圈存储在 'user' 键下
  const moments = settings.momentsData['user'];
  if (!moments || !moments[momentIndex]) return;

  const moment = moments[momentIndex];

  // 获取 API 配置
  let apiUrl, apiKey, apiModel;

  if (contact.useCustomApi) {
    apiUrl = contact.customApiUrl || settings.apiUrl || '';
    apiKey = contact.customApiKey || settings.apiKey || '';
    apiModel = contact.customModel || settings.selectedModel || '';
  } else {
    apiUrl = settings.apiUrl || '';
    apiKey = settings.apiKey || '';
    apiModel = settings.selectedModel || '';
  }

  if (!apiUrl) return;

  // 处理 API URL，确保正确拼接
  let chatUrl = apiUrl.replace(/\/+$/, '');
  if (!chatUrl.includes('/chat/completions')) {
    if (!chatUrl.endsWith('/v1')) {
      chatUrl += '/v1';
    }
    chatUrl += '/chat/completions';
  }

  try {
    // 获取角色世界书设定
    const lorebookEntries = getLorebookEntriesForContact(contact, settings);
    let characterInfo = '';
    if (lorebookEntries.length > 0) {
      characterInfo = `\n\n【关于「${contact.name}」的设定】\n${lorebookEntries.join('\n')}`;
      console.log(`[可乐] 用户朋友圈回复 - ${contact.name} 获取到 ${lorebookEntries.length} 条设定`);
    }

    // 获取用户设定
    let userPersonaInfo = '';
    const userPersonas = settings.userPersonas || [];
    const enabledPersonas = userPersonas.filter(p => p.enabled !== false);
    if (enabledPersonas.length > 0) {
      userPersonaInfo = `\n\n【关于「${userName}」的设定】\n`;
      enabledPersonas.forEach(persona => {
        if (persona.name) userPersonaInfo += `[${persona.name}]\n`;
        if (persona.content) userPersonaInfo += `${persona.content}\n`;
      });
    }

    // 获取聊天历史上下文
    let chatContextInfo = '';
    if (contact.chatHistory && contact.chatHistory.length > 0) {
      const allChat = contact.chatHistory
        .filter(msg => msg.content && !msg.isRecalled && msg.content.length < 200);
      if (allChat.length > 0) {
        const chatSummary = allChat.map(msg => {
          const speaker = msg.role === 'user' ? userName : contact.name;
          let c = msg.content;
          if (c.startsWith('[表情:') || c.startsWith('[语音:') || c.startsWith('[照片:')) c = c.split(']')[0] + ']';
          return `${speaker}: ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`;
        }).join('\n');
        chatContextInfo = `\n\n【你和${userName}的聊天记录】\n${chatSummary}`;
        console.log(`[可乐] 用户朋友圈回复 - ${contact.name} 加入了 ${allChat.length} 条聊天历史`);
      }
    }

    // 已有评论列表
    const existingComments = (moment.comments || []).map(c => {
      const replyPart = c.replyTo ? `回复${c.replyTo}` : '';
      return `${c.name}${replyPart}: ${c.text}`;
    }).join('\n');
    const commentsContext = existingComments ? `\n\n【已有评论】\n${existingComments}` : '';

    const prompt = `你是「${contact.name}」，${userName}在他/她自己的朋友圈下回复了你的评论，你必须回复他/她。
${characterInfo}${userPersonaInfo}${chatContextInfo}

${userName}发的朋友圈：
"${moment.text}"
${commentsContext}

「${userName}」刚刚回复你说："${userComment}"

【核心要求】
- 必须回复！你必须选择以下两种方式之一进行回复，不能忽略
- 严格遵循你的人设：说话方式、语气、口癖、性格特点
- 回复简短自然（5-20字）
- 可以用表情符号

【回复方式二选一】
1. 评论区回复（公开）：直接输出回复内容
2. 私聊回复（私密的话）：输出格式 [私聊] 消息内容

直接输出回复：`;

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 8196,
        temperature: 1
      })
    });

    if (!response.ok) {
      console.error(`[可乐] 用户朋友圈回复 API 请求失败: ${response.status}`);
      return;
    }

    const data = await response.json();
    const replyText = data.choices?.[0]?.message?.content?.trim();

    if (!replyText) {
      console.error('[可乐] 用户朋友圈回复 - AI返回空内容');
      return;
    }

    console.log(`[可乐] ${contact.name} 回复用户朋友圈评论: ${replyText}`);

    // 判断是私聊还是评论区回复
    if (replyText.startsWith('[私聊]')) {
      // 通过私聊回复 - 触发聊天消息
      const chatMessage = replyText.replace('[私聊]', '').trim();

      // 添加到聊天记录
      addPrivateMessageFromContact(contactIndex, chatMessage, `关于你的朋友圈评论：「${userComment}」`);

      showNotificationBanner(contact.name, chatMessage);
    } else {
      // 在评论区回复
      let commentReply = replyText.replace(/^\[.*?\]\s*/, '').trim();

      // 清理AI可能自动添加的重复"xx回复xx:"格式
      const replyPattern = new RegExp(`^${contact.name}\\s*回复\\s*${userName}\\s*[：:]\\s*`, 'i');
      commentReply = commentReply.replace(replyPattern, '').trim();
      commentReply = commentReply.replace(/^回复\s*[^：:]+[：:]\s*/, '').trim();

      if (!moment.comments) moment.comments = [];
      moment.comments.push({
        name: contact.name,
        text: commentReply,
        replyTo: userName,
        timestamp: Date.now()
      });
      requestSave();
      renderMomentsList(currentContactIndex);
    }

  } catch (err) {
    console.error('[可乐] 用户朋友圈回复生成失败:', err);
  }
}
