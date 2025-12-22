/**
 * 红包功能模块
 * 支持用户发红包、AI发红包、开红包动画、钱包余额管理
 */

import { getSettings } from './config.js';
import { requestSave } from './save-manager.js';
import { showToast } from './toast.js';
import { escapeHtml, sleep } from './utils.js';
import { refreshChatList } from './ui.js';
import { callAI } from './ai.js';
import { ICON_USER } from './icons.js';

// 当前红包相关状态
let currentRedPacketAmount = '';
let currentRedPacketMessage = '恭喜发财，大吉大利';
let pendingOpenRedPacket = null; // 待打开的红包信息
let pendingOpenContact = null;   // 待打开红包的联系人

// ===== 钱包操作函数 =====

/**
 * 获取钱包余额
 */
export function getWalletBalance() {
  const settings = getSettings();
  return parseFloat(settings.walletAmount) || 0;
}

/**
 * 从钱包扣款（发红包）
 */
export function deductFromWallet(amount) {
  const settings = getSettings();
  const current = parseFloat(settings.walletAmount) || 0;

  if (amount <= 0) {
    return { success: false, message: '金额必须大于0' };
  }
  if (amount > 200) {
    return { success: false, message: '单个红包最多200元' };
  }
  if (amount > current) {
    return { success: false, message: '余额不足' };
  }

  settings.walletAmount = (current - amount).toFixed(2);
  requestSave();
  updateWalletDisplay();
  return { success: true, balance: settings.walletAmount };
}

/**
 * 存入钱包（收红包）
 */
export function addToWallet(amount) {
  const settings = getSettings();
  const current = parseFloat(settings.walletAmount) || 0;
  settings.walletAmount = (current + amount).toFixed(2);
  requestSave();
  updateWalletDisplay();
  return { success: true, balance: settings.walletAmount };
}

/**
 * 更新钱包显示
 */
export function updateWalletDisplay() {
  const el = document.getElementById('wechat-wallet-amount');
  if (el) {
    el.textContent = '¥' + getWalletBalance().toFixed(2);
  }
}

// ===== 发红包页面 =====

/**
 * 显示发红包页面
 */
export function showRedPacketPage() {
  currentRedPacketAmount = '';
  currentRedPacketMessage = '恭喜发财，大吉大利';

  const page = document.getElementById('wechat-red-packet-page');
  if (page) {
    page.classList.remove('hidden');
    updateRedPacketAmountDisplay();

    const messageInput = document.getElementById('wechat-red-packet-message');
    if (messageInput) {
      messageInput.value = currentRedPacketMessage;
    }

    const amountInput = document.getElementById('wechat-red-packet-amount-input');
    if (amountInput) {
      amountInput.value = '';
    }
  }
}

/**
 * 隐藏发红包页面
 */
export function hideRedPacketPage() {
  const page = document.getElementById('wechat-red-packet-page');
  if (page) {
    page.classList.add('hidden');
  }
}

/**
 * 更新金额显示
 */
function updateRedPacketAmountDisplay() {
  const amountDisplay = document.getElementById('wechat-red-packet-amount-display');
  const amountInput = document.getElementById('wechat-red-packet-amount-input');

  const amount = amountInput ? parseFloat(amountInput.value) || 0 : parseFloat(currentRedPacketAmount) || 0;

  if (amountDisplay) {
    amountDisplay.textContent = '¥ ' + (amount > 0 ? amount.toFixed(2) : '0.00');
  }
}

/**
 * 显示密码输入弹窗
 */
export function showPasswordModal() {
  const amountInput = document.getElementById('wechat-red-packet-amount-input');
  const amount = amountInput ? parseFloat(amountInput.value) || 0 : 0;

  if (amount <= 0) {
    showToast('请输入金额');
    return;
  }
  if (amount > 200) {
    showToast('单个红包最多200元');
    return;
  }
  if (amount > getWalletBalance()) {
    showToast('余额不足');
    return;
  }

  currentRedPacketAmount = amount.toString();

  // 获取祝福语
  const messageInput = document.getElementById('wechat-red-packet-message');
  if (messageInput && messageInput.value.trim()) {
    currentRedPacketMessage = messageInput.value.trim();
  }

  const modal = document.getElementById('wechat-red-packet-password-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const passwordInput = document.getElementById('wechat-red-packet-password-input');
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  }
}

/**
 * 隐藏密码输入弹窗
 */
export function hidePasswordModal() {
  const modal = document.getElementById('wechat-red-packet-password-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * 验证密码并发送红包
 */
function verifyPasswordAndSend() {
  const passwordInput = document.getElementById('wechat-red-packet-password-input');
  const password = passwordInput?.value || '';

  if (password.length !== 6) {
    showToast('请输入6位密码');
    return;
  }

  const settings = getSettings();
  const correctPassword = settings.paymentPassword || '666666';
  if (password === correctPassword) {
    hidePasswordModal();
    sendRedPacket();
  } else {
    showToast('密码错误');
    if (passwordInput) passwordInput.value = '';
  }
}

/**
 * 发送红包
 */
async function sendRedPacket() {
  const amount = parseFloat(currentRedPacketAmount) || 0;
  const message = currentRedPacketMessage;

  // 扣款
  const result = deductFromWallet(amount);
  if (!result.success) {
    showToast(result.message, 'info');
    return;
  }

  // 关闭发红包页面
  hideRedPacketPage();

  // 触发发送红包事件
  const event = new CustomEvent('red-packet-send', {
    detail: {
      amount: amount,
      message: message
    }
  });
  document.dispatchEvent(event);
}

// ===== 开红包弹窗 =====

/**
 * 显示开红包弹窗（AI发的红包）
 */
export function showOpenRedPacket(redPacketInfo, contact) {
  pendingOpenRedPacket = redPacketInfo;
  pendingOpenContact = contact;

  const modal = document.getElementById('wechat-open-red-packet-modal');
  if (!modal) return;

  // 更新显示内容
  const senderName = document.getElementById('wechat-open-rp-sender');
  const messageEl = document.getElementById('wechat-open-rp-message');
  const previewMsg = document.getElementById('wechat-open-rp-preview-msg');

  if (senderName) {
    senderName.textContent = `${contact?.name || 'AI'}发出的红包`;
  }
  if (messageEl) {
    messageEl.textContent = redPacketInfo.message || '恭喜发财，大吉大利';
  }
  if (previewMsg) {
    previewMsg.textContent = redPacketInfo.message || '恭喜发财，大吉大利';
  }

  modal.classList.remove('hidden');
}

/**
 * 隐藏开红包弹窗
 */
export function hideOpenRedPacket() {
  const modal = document.getElementById('wechat-open-red-packet-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  pendingOpenRedPacket = null;
  pendingOpenContact = null;
}

/**
 * 点击"開"按钮，播放开红包动画
 */
export async function openRedPacketAnimation() {
  if (!pendingOpenRedPacket) return;

  const modal = document.getElementById('wechat-open-red-packet-modal');
  const topHalf = document.getElementById('wechat-open-rp-top');
  const bottomHalf = document.getElementById('wechat-open-rp-bottom');

  if (topHalf && bottomHalf) {
    // 添加动画类
    topHalf.classList.add('slide-up');
    bottomHalf.classList.add('slide-down');

    // 等待动画完成
    await sleep(500);
  }

  // 隐藏开红包弹窗
  if (modal) {
    modal.classList.add('hidden');
    // 重置动画类
    if (topHalf) topHalf.classList.remove('slide-up');
    if (bottomHalf) bottomHalf.classList.remove('slide-down');
  }

  // 领取红包
  await claimAIRedPacket();
}

/**
 * 领取AI红包
 */
async function claimAIRedPacket() {
  if (!pendingOpenRedPacket || !pendingOpenContact) return;

  const redPacketInfo = pendingOpenRedPacket;
  const contact = pendingOpenContact;
  const settings = getSettings();

  // 存入钱包
  addToWallet(redPacketInfo.amount);

  // 更新红包状态
  redPacketInfo.status = 'claimed';
  redPacketInfo.claimedBy = settings.userName || 'User';
  redPacketInfo.claimedAt = Date.now();

  // 保存
  requestSave();

  // 显示红包详情页
  showRedPacketDetail(redPacketInfo, contact);

  // 更新聊天中的红包气泡状态
  updateRedPacketBubbleStatus(redPacketInfo.id, 'claimed');

  // 在聊天中显示领取提示
  const event = new CustomEvent('red-packet-claimed-notice', {
    detail: {
      claimerName: settings.userName || 'User',
      senderName: contact.name
    }
  });
  document.dispatchEvent(event);

  pendingOpenRedPacket = null;
  pendingOpenContact = null;
}

/**
 * 显示红包详情页
 */
export function showRedPacketDetail(redPacketInfo, contact) {
  const page = document.getElementById('wechat-red-packet-detail-page');
  if (!page) return;

  const settings = getSettings();

  // 更新详情页内容
  const senderName = document.getElementById('wechat-rp-detail-sender');
  const messageEl = document.getElementById('wechat-rp-detail-message');
  const amountEl = document.getElementById('wechat-rp-detail-amount');
  const claimerAvatar = document.getElementById('wechat-rp-detail-claimer-avatar');
  const claimerName = document.getElementById('wechat-rp-detail-claimer-name');
  const claimerTime = document.getElementById('wechat-rp-detail-claimer-time');
  const claimerAmount = document.getElementById('wechat-rp-detail-claimer-amount');

  if (senderName) {
    senderName.textContent = `${contact?.name || 'AI'}发出的红包`;
  }
  if (messageEl) {
    messageEl.textContent = redPacketInfo.message || '恭喜发财，大吉大利';
  }
  if (amountEl) {
    amountEl.textContent = redPacketInfo.amount.toFixed(2);
  }
  if (claimerAvatar) {
    // 使用用户头像
    if (settings.userAvatar) {
      claimerAvatar.innerHTML = `<img src="${settings.userAvatar}" alt="avatar">`;
    } else {
      claimerAvatar.innerHTML = `<span>${ICON_USER}</span>`;
    }
  }
  if (claimerName) {
    claimerName.textContent = settings.userName || 'User';
  }
  if (claimerTime) {
    const now = new Date();
    claimerTime.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }
  if (claimerAmount) {
    claimerAmount.textContent = redPacketInfo.amount.toFixed(2) + '元';
  }

  page.classList.remove('hidden');
}

/**
 * 隐藏红包详情页
 */
export function hideRedPacketDetail() {
  const page = document.getElementById('wechat-red-packet-detail-page');
  if (page) {
    page.classList.add('hidden');
  }
}

/**
 * 更新红包气泡状态
 */
function updateRedPacketBubbleStatus(redPacketId, status) {
  const bubble = document.querySelector(`.wechat-red-packet-bubble[data-rp-id="${redPacketId}"]`);
  if (bubble && status === 'claimed') {
    bubble.classList.add('claimed');
    const statusEl = bubble.querySelector('.wechat-rp-bubble-status');
    if (statusEl) {
      statusEl.textContent = '已领取';
      statusEl.classList.remove('hidden');
    }
  }
}

// ===== 生成红包ID =====

export function generateRedPacketId() {
  return 'rp_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
}

// ===== 初始化事件监听 =====

export function initRedPacketEvents() {
  // 发红包页面返回按钮
  document.getElementById('wechat-red-packet-back')?.addEventListener('click', hideRedPacketPage);

  // 金额输入框变化时更新显示
  document.getElementById('wechat-red-packet-amount-input')?.addEventListener('input', updateRedPacketAmountDisplay);

  // 塞钱进红包按钮
  document.getElementById('wechat-red-packet-submit')?.addEventListener('click', showPasswordModal);

  // 密码弹窗关闭
  document.getElementById('wechat-password-modal-close')?.addEventListener('click', hidePasswordModal);

  // 密码确认按钮
  document.getElementById('wechat-red-packet-password-confirm')?.addEventListener('click', verifyPasswordAndSend);

  // 开红包弹窗关闭
  document.getElementById('wechat-open-rp-close')?.addEventListener('click', hideOpenRedPacket);
  document.getElementById('wechat-open-rp-preview-close')?.addEventListener('click', hideOpenRedPacket);

  // 开红包按钮
  document.getElementById('wechat-open-rp-btn')?.addEventListener('click', openRedPacketAnimation);

  // 红包详情页返回
  document.getElementById('wechat-rp-detail-back')?.addEventListener('click', hideRedPacketDetail);

  // 监听红包发送事件（用户发红包后，AI 领取）
  document.addEventListener('red-packet-send', handleUserSendRedPacket);

  // 监听红包领取提示事件
  document.addEventListener('red-packet-claimed-notice', handleRedPacketClaimNotice);
}

/**
 * 处理用户发送红包
 */
async function handleUserSendRedPacket(event) {
  const { amount, message } = event.detail;
  const settings = getSettings();

  // 动态导入 chat.js 中的函数，避免循环依赖
  const chatModule = await import('./chat.js');
  const { currentChatIndex, appendRedPacketMessage, appendRedPacketClaimNotice, showTypingIndicator, hideTypingIndicator, appendMessage, openChat } = chatModule;

  if (currentChatIndex < 0) return;

  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).replace(/\//g, '-');

  // 创建红包信息
  const rpInfo = {
    id: generateRedPacketId(),
    amount: amount,
    message: message,
    senderName: settings.userName || 'User',
    status: 'pending',
    claimedBy: null,
    claimedAt: null,
    expireAt: Date.now() + 24 * 60 * 60 * 1000
  };

  // 保存红包消息到聊天记录
  if (!contact.chatHistory) contact.chatHistory = [];
  contact.chatHistory.push({
    role: 'user',
    content: `[红包] ${message}`,
    time: timeStr,
    timestamp: Date.now(),
    isRedPacket: true,
    redPacketInfo: rpInfo
  });

  // 显示红包消息
  appendRedPacketMessage('user', rpInfo, contact);
  requestSave();
  refreshChatList();

  // AI 领取红包（延迟 2-5 秒）
  const claimDelay = 2000 + Math.random() * 3000;
  await sleep(claimDelay);

  // 更新红包状态
  rpInfo.status = 'claimed';
  rpInfo.claimedBy = contact.name;
  rpInfo.claimedAt = Date.now();

  // 更新聊天中的红包气泡状态
  updateRedPacketBubbleStatus(rpInfo.id, 'claimed');

  // 显示领取提示
  appendRedPacketClaimNotice(contact.name, settings.userName || 'User', false);

  requestSave();

  // AI 发送感谢消息（带上下文）
  await sleep(1000);

  // 显示打字指示器
  showTypingIndicator(contact);

  try {
    // 构建提示，让 AI 根据上下文自然回复
    const thankPrompt = `用户给你发了一个${amount}元的红包，祝福语是"${message}"，请自然地表示感谢，不要使用任何特殊格式标签。`;

    const aiResponse = await callAI(contact, thankPrompt);

    hideTypingIndicator();

    if (aiResponse && aiResponse.trim()) {
      // 取第一条回复
      let thankMsg = aiResponse.split('|||')[0].trim();
      // 移除可能的格式标签
      thankMsg = thankMsg.replace(/^\[.*?\]\s*/, '');

      if (thankMsg) {
        contact.chatHistory.push({
          role: 'assistant',
          content: thankMsg,
          time: new Date().toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
          }).replace(/\//g, '-'),
          timestamp: Date.now()
        });

        appendMessage('assistant', thankMsg, contact);
        requestSave();
        refreshChatList();
      }
    }
  } catch (e) {
    console.error('[可乐] AI感谢红包失败:', e);
    hideTypingIndicator();
  }
}

/**
 * 处理红包领取提示（用户领取AI红包）
 */
function handleRedPacketClaimNotice(event) {
  const { claimerName, senderName } = event.detail;

  // 动态导入，避免循环依赖
  import('./chat.js').then(chatModule => {
    const { appendRedPacketClaimNotice } = chatModule;
    appendRedPacketClaimNotice(claimerName, senderName, true);
  });
}
