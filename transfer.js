/**
 * 转账功能模块
 * 支持用户发转账、AI发转账、收款/退还、钱包余额管理
 */

import { getSettings } from './config.js';
import { requestSave } from './save-manager.js';
import { showToast } from './toast.js';
import { escapeHtml, sleep } from './utils.js';
import { refreshChatList } from './ui.js';
import { callAI } from './ai.js';
import { deductFromWallet, addToWallet, getWalletBalance, updateWalletDisplay } from './red-packet.js';

// 当前转账相关状态
let currentTransferAmount = '';
let currentTransferDescription = '';
let pendingReceiveTransfer = null; // 待收款的转账信息
let pendingReceiveContact = null;  // 待收款转账的联系人

// ===== 发转账页面 =====

/**
 * 显示发转账页面
 */
export function showTransferPage() {
  currentTransferAmount = '';
  currentTransferDescription = '';

  const page = document.getElementById('wechat-transfer-page');
  if (page) {
    page.classList.remove('hidden');
    updateTransferAmountDisplay();

    const descInput = document.getElementById('wechat-transfer-description');
    if (descInput) {
      descInput.value = '';
    }

    const amountInput = document.getElementById('wechat-transfer-amount-input');
    if (amountInput) {
      amountInput.value = '';
    }
  }
}

/**
 * 隐藏发转账页面
 */
export function hideTransferPage() {
  const page = document.getElementById('wechat-transfer-page');
  if (page) {
    page.classList.add('hidden');
  }
}

/**
 * 更新金额显示
 */
function updateTransferAmountDisplay() {
  const amountDisplay = document.getElementById('wechat-transfer-amount-display');
  const amountInput = document.getElementById('wechat-transfer-amount-input');

  const amount = amountInput ? parseFloat(amountInput.value) || 0 : parseFloat(currentTransferAmount) || 0;

  if (amountDisplay) {
    amountDisplay.textContent = '¥ ' + (amount > 0 ? amount.toFixed(2) : '0.00');
  }
}

/**
 * 显示密码输入弹窗
 */
export function showTransferPasswordModal() {
  const amountInput = document.getElementById('wechat-transfer-amount-input');
  const amount = amountInput ? parseFloat(amountInput.value) || 0 : 0;

  if (amount <= 0) {
    showToast('请输入金额');
    return;
  }
  if (amount > getWalletBalance()) {
    showToast('余额不足');
    return;
  }

  currentTransferAmount = amount.toString();

  // 获取转账说明
  const descInput = document.getElementById('wechat-transfer-description');
  if (descInput && descInput.value.trim()) {
    currentTransferDescription = descInput.value.trim();
  }

  const modal = document.getElementById('wechat-transfer-password-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const passwordInput = document.getElementById('wechat-transfer-password-input');
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  }
}

/**
 * 隐藏密码输入弹窗
 */
export function hideTransferPasswordModal() {
  const modal = document.getElementById('wechat-transfer-password-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * 验证密码并发送转账
 */
function verifyTransferPasswordAndSend() {
  const passwordInput = document.getElementById('wechat-transfer-password-input');
  const password = passwordInput?.value || '';

  if (password.length !== 6) {
    showToast('请输入6位密码');
    return;
  }

  const settings = getSettings();
  const correctPassword = settings.paymentPassword || '666666';
  if (password === correctPassword) {
    hideTransferPasswordModal();
    sendTransfer();
  } else {
    showToast('密码错误');
    if (passwordInput) passwordInput.value = '';
  }
}

/**
 * 发送转账
 */
async function sendTransfer() {
  const amount = parseFloat(currentTransferAmount) || 0;
  const description = currentTransferDescription;

  // 扣款（转账无上限，但需要检查余额）
  const current = getWalletBalance();
  if (amount > current) {
    showToast('余额不足', 'info');
    return;
  }

  // 扣款
  const settings = getSettings();
  settings.walletAmount = (current - amount).toFixed(2);
  requestSave();
  updateWalletDisplay();

  // 关闭发转账页面
  hideTransferPage();

  // 触发发送转账事件
  const event = new CustomEvent('transfer-send', {
    detail: {
      amount: amount,
      description: description
    }
  });
  document.dispatchEvent(event);
}

// ===== 收款页面 =====

/**
 * 显示收款页面（AI发的转账）
 */
export function showReceiveTransferPage(transferInfo, contact) {
  pendingReceiveTransfer = transferInfo;
  pendingReceiveContact = contact;

  const page = document.getElementById('wechat-receive-transfer-page');
  if (!page) return;

  // 更新显示内容
  const senderAvatar = document.getElementById('wechat-transfer-receive-avatar');
  const senderName = document.getElementById('wechat-transfer-receive-name');
  const amountEl = document.getElementById('wechat-transfer-receive-amount');
  const descEl = document.getElementById('wechat-transfer-receive-desc');

  if (senderAvatar) {
    if (contact?.avatar) {
      senderAvatar.innerHTML = `<img src="${contact.avatar}" alt="">`;
    } else {
      senderAvatar.innerHTML = contact?.name?.charAt(0) || '?';
    }
  }
  if (senderName) {
    senderName.textContent = contact?.name || 'AI';
  }
  if (amountEl) {
    amountEl.textContent = '¥' + transferInfo.amount.toFixed(2);
  }
  if (descEl) {
    descEl.textContent = transferInfo.description || '转账给你';
  }

  page.classList.remove('hidden');
}

/**
 * 隐藏收款页面
 */
export function hideReceiveTransferPage() {
  const page = document.getElementById('wechat-receive-transfer-page');
  if (page) {
    page.classList.add('hidden');
  }
  pendingReceiveTransfer = null;
  pendingReceiveContact = null;
}

/**
 * 确认收款
 */
export async function confirmReceiveTransfer() {
  if (!pendingReceiveTransfer || !pendingReceiveContact) return;

  const transferInfo = pendingReceiveTransfer;
  const contact = pendingReceiveContact;

  // 存入钱包
  addToWallet(transferInfo.amount);

  // 更新转账状态
  transferInfo.status = 'received';
  transferInfo.receivedAt = Date.now();

  // 保存
  requestSave();

  // 隐藏收款页面
  hideReceiveTransferPage();

  // 更新聊天中的转账气泡状态
  updateTransferBubbleStatus(transferInfo.id, 'received');

  // 显示收款成功提示
  showToast('已收款 ¥' + transferInfo.amount.toFixed(2), 'success');

  pendingReceiveTransfer = null;
  pendingReceiveContact = null;
}

/**
 * 显示退还确认框
 */
export function showRefundConfirmModal() {
  if (!pendingReceiveContact) return;

  const modal = document.getElementById('wechat-transfer-refund-confirm');
  if (!modal) return;

  const titleEl = modal.querySelector('.wechat-transfer-confirm-title');
  if (titleEl) {
    titleEl.textContent = `退还 ${pendingReceiveContact.name} 的转账?`;
  }

  modal.classList.remove('hidden');
}

/**
 * 隐藏退还确认框
 */
export function hideRefundConfirmModal() {
  const modal = document.getElementById('wechat-transfer-refund-confirm');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * 确认退还转账
 */
export async function confirmRefundTransfer() {
  if (!pendingReceiveTransfer || !pendingReceiveContact) return;

  const transferInfo = pendingReceiveTransfer;

  // 更新转账状态
  transferInfo.status = 'refunded';
  transferInfo.refundedAt = Date.now();

  // 保存
  requestSave();

  // 隐藏弹窗和收款页面
  hideRefundConfirmModal();
  hideReceiveTransferPage();

  // 更新聊天中的转账气泡状态
  updateTransferBubbleStatus(transferInfo.id, 'refunded');

  // 显示退还提示
  showToast('已退还转账', 'refund');

  pendingReceiveTransfer = null;
  pendingReceiveContact = null;
}

/**
 * 更新转账气泡状态
 */
function updateTransferBubbleStatus(transferId, status) {
  const bubble = document.querySelector(`.wechat-transfer-bubble[data-tf-id="${transferId}"]`);
  if (!bubble) return;

  bubble.classList.remove('pending', 'received', 'refunded');
  bubble.classList.add(status);

  const statusIcon = bubble.querySelector('.wechat-tf-bubble-status-icon');
  const statusText = bubble.querySelector('.wechat-tf-bubble-status-text');

  if (statusIcon && statusText) {
    if (status === 'received') {
      statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
      statusText.textContent = '已收款';
    } else if (status === 'refunded') {
      statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 3v5h5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
      // 判断是发送方还是接收方
      const role = bubble.dataset.role;
      statusText.textContent = role === 'user' ? '已被退还' : '已退还';
    }
  }
}

// ===== 生成转账ID =====

export function generateTransferId() {
  return 'tf_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
}

// ===== 初始化事件监听 =====

export function initTransferEvents() {
  // 发转账页面返回按钮
  document.getElementById('wechat-transfer-back')?.addEventListener('click', hideTransferPage);

  // 金额输入框变化时更新显示
  document.getElementById('wechat-transfer-amount-input')?.addEventListener('input', updateTransferAmountDisplay);

  // 转账按钮
  document.getElementById('wechat-transfer-submit')?.addEventListener('click', showTransferPasswordModal);

  // 密码弹窗关闭
  document.getElementById('wechat-transfer-password-close')?.addEventListener('click', hideTransferPasswordModal);

  // 密码确认按钮
  document.getElementById('wechat-transfer-password-confirm')?.addEventListener('click', verifyTransferPasswordAndSend);

  // 收款页面返回按钮
  document.getElementById('wechat-transfer-receive-back')?.addEventListener('click', hideReceiveTransferPage);

  // 收款按钮
  document.getElementById('wechat-transfer-receive-btn')?.addEventListener('click', confirmReceiveTransfer);

  // 退还按钮（显示确认框）
  document.getElementById('wechat-transfer-refund-btn')?.addEventListener('click', showRefundConfirmModal);

  // 退还确认框按钮
  document.getElementById('wechat-transfer-refund-cancel')?.addEventListener('click', hideRefundConfirmModal);
  document.getElementById('wechat-transfer-refund-confirm')?.addEventListener('click', confirmRefundTransfer);

  // 监听转账发送事件（用户发转账后，AI 收款）
  document.addEventListener('transfer-send', handleUserSendTransfer);
}

/**
 * 处理用户发送转账
 */
async function handleUserSendTransfer(event) {
  const { amount, description } = event.detail;
  const settings = getSettings();

  // 动态导入 chat.js 中的函数，避免循环依赖
  const chatModule = await import('./chat.js');
  const { currentChatIndex, appendTransferMessage, showTypingIndicator, hideTypingIndicator, appendMessage } = chatModule;

  if (currentChatIndex < 0) return;

  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).replace(/\//g, '-');

  // 创建转账信息
  const tfInfo = {
    id: generateTransferId(),
    amount: amount,
    description: description || '',
    senderName: settings.userName || 'User',
    status: 'pending',
    receivedAt: null,
    refundedAt: null,
    expireAt: Date.now() + 24 * 60 * 60 * 1000
  };

  // 保存转账消息到聊天记录
  if (!contact.chatHistory) contact.chatHistory = [];
  contact.chatHistory.push({
    role: 'user',
    content: `[转账] ¥${amount.toFixed(2)}`,
    time: timeStr,
    timestamp: Date.now(),
    isTransfer: true,
    transferInfo: tfInfo
  });

  // 显示转账消息
  appendTransferMessage('user', tfInfo, contact);
  requestSave();
  refreshChatList();

  // AI 收款（延迟 2-5 秒）
  const receiveDelay = 2000 + Math.random() * 3000;
  await sleep(receiveDelay);

  // 更新转账状态
  tfInfo.status = 'received';
  tfInfo.receivedAt = Date.now();

  // 更新聊天中的转账气泡状态
  updateTransferBubbleStatus(tfInfo.id, 'received');

  requestSave();

  // AI 发送感谢消息（带上下文）
  await sleep(1000);

  // 显示打字指示器
  showTypingIndicator(contact);

  try {
    // 构建提示，让 AI 根据上下文自然回复
    const thankPrompt = description
      ? `用户给你转账了${amount}元，备注是"${description}"，请自然地表示感谢，不要使用任何特殊格式标签。`
      : `用户给你转账了${amount}元，请自然地表示感谢，不要使用任何特殊格式标签。`;

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
    console.error('[可乐] AI感谢转账失败:', e);
    hideTypingIndicator();
  }
}
