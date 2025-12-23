/**
 * 群聊红包/转账功能模块
 * 支持拼手气红包、指定成员红包、群聊转账
 */

import { getSettings } from './config.js';
import { requestSave } from './save-manager.js';
import { showToast } from './toast.js';
import { escapeHtml, sleep } from './utils.js';
import { refreshChatList, getUserAvatarHTML } from './ui.js';
import { deductFromWallet, addToWallet, getWalletBalance, generateRedPacketId } from './red-packet.js';
import { generateTransferId } from './transfer.js';
import { getCurrentGroupIndex, enforceGroupChatMemberLimit, appendGroupMessage, showGroupTypingIndicator, hideGroupTypingIndicator } from './group-chat.js';
import { buildSystemPrompt } from './ai.js';

// ============ 状态变量 ============

// 群红包状态
let groupRedPacketType = 'random'; // 'random' | 'designated'
let groupRedPacketAmount = '';
let groupRedPacketCount = '';
let groupRedPacketMessage = '恭喜发财，大吉大利';
let groupRedPacketSelectedMembers = []; // 指定成员红包的目标成员ID列表

// 群转账状态
let groupTransferAmount = '';
let groupTransferDescription = '';
let groupTransferTargetMemberId = null;

// 待领取的群红包
let pendingGroupRedPacket = null;
let pendingGroupRedPacketIndex = -1;

// ============ 工具函数 ============

function getTimeStr() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
}

/**
 * 随机分配红包金额（拼手气）
 * @param {number} totalAmount 总金额
 * @param {number} count 红包个数
 * @returns {number[]} 每个红包的金额数组
 */
function distributeRandomAmounts(totalAmount, count) {
  if (count <= 0 || totalAmount <= 0) return [];
  if (count === 1) return [totalAmount];

  const amounts = [];
  let remaining = Math.round(totalAmount * 100); // 转为分，避免浮点数精度问题
  const minAmount = 1; // 最小1分

  for (let i = 0; i < count - 1; i++) {
    const maxForThis = remaining - (count - i - 1) * minAmount;
    if (maxForThis <= minAmount) {
      amounts.push(minAmount);
      remaining -= minAmount;
      continue;
    }

    // 20% 概率只给 0.01 元（1分）
    if (Math.random() < 0.2) {
      amounts.push(minAmount);
      remaining -= minAmount;
      continue;
    }

    // 正常随机分配（使用二倍均值法变体）
    const avgRemaining = remaining / (count - i);
    const maxRandom = Math.min(maxForThis, Math.floor(avgRemaining * 2));
    const randomAmount = Math.max(minAmount, Math.floor(Math.random() * maxRandom));
    amounts.push(randomAmount);
    remaining -= randomAmount;
  }

  // 最后一个红包拿走剩余金额
  amounts.push(remaining);

  // 打乱顺序
  for (let i = amounts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
  }

  // 转回元
  return amounts.map(a => a / 100);
}

// ============ 群红包类型选择页面 ============

/**
 * 显示群红包类型选择页面
 */
export function showGroupRedPacketTypePage() {
  const page = document.getElementById('wechat-group-rp-type-page');
  if (!page) {
    createGroupRedPacketPages();
  }

  // 重置状态
  groupRedPacketType = 'random';
  groupRedPacketAmount = '';
  groupRedPacketCount = '';
  groupRedPacketMessage = '恭喜发财，大吉大利';
  groupRedPacketSelectedMembers = [];

  document.getElementById('wechat-group-rp-type-page')?.classList.remove('hidden');
}

/**
 * 隐藏群红包类型选择页面
 */
export function hideGroupRedPacketTypePage() {
  document.getElementById('wechat-group-rp-type-page')?.classList.add('hidden');
}

// ============ 拼手气红包页面 ============

/**
 * 显示拼手气红包页面
 */
export function showGroupRandomRedPacketPage() {
  hideGroupRedPacketTypePage();
  groupRedPacketType = 'random';
  groupRedPacketAmount = '';
  groupRedPacketCount = '';

  const page = document.getElementById('wechat-group-random-rp-page');
  if (page) {
    page.classList.remove('hidden');
    updateGroupRandomRedPacketDisplay();
  }
}

/**
 * 隐藏拼手气红包页面
 */
export function hideGroupRandomRedPacketPage() {
  document.getElementById('wechat-group-random-rp-page')?.classList.add('hidden');
  document.getElementById('wechat-group-rp-keyboard')?.classList.add('hidden');
}

/**
 * 更新拼手气红包显示
 */
function updateGroupRandomRedPacketDisplay() {
  const amountEl = document.getElementById('wechat-group-rp-amount-value');
  const countEl = document.getElementById('wechat-group-rp-count-value');
  const totalEl = document.getElementById('wechat-group-rp-total-display');

  if (amountEl) {
    amountEl.textContent = groupRedPacketAmount || '0.00';
  }
  if (countEl) {
    countEl.textContent = groupRedPacketCount || '0';
  }
  if (totalEl) {
    const amount = parseFloat(groupRedPacketAmount) || 0;
    totalEl.textContent = '¥' + amount.toFixed(2);
  }
}

// ============ 指定成员红包页面 ============

/**
 * 显示指定成员红包页面
 */
export function showGroupDesignatedRedPacketPage() {
  hideGroupRedPacketTypePage();
  groupRedPacketType = 'designated';
  groupRedPacketAmount = '';
  groupRedPacketSelectedMembers = [];

  const settings = getSettings();
  const groupIndex = getCurrentGroupIndex();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  // 渲染成员列表
  const listContainer = document.getElementById('wechat-group-designated-member-list');
  if (listContainer) {
    listContainer.innerHTML = members.map(member => {
      const firstChar = member.name?.charAt(0) || '?';
      const avatarHtml = member.avatar
        ? `<img src="${member.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
        : firstChar;

      return `
        <div class="wechat-group-designated-member-item" data-member-id="${member.id}">
          <div class="wechat-group-designated-member-check">
            <input type="checkbox" data-member-id="${member.id}">
          </div>
          <div class="wechat-group-designated-member-avatar">${avatarHtml}</div>
          <div class="wechat-group-designated-member-name">${escapeHtml(member.name)}</div>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    listContainer.querySelectorAll('.wechat-group-designated-member-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        updateGroupDesignatedSelection();
      });
    });
  }

  document.getElementById('wechat-group-designated-rp-page')?.classList.remove('hidden');
  updateGroupDesignatedRedPacketDisplay();
}

/**
 * 更新指定成员选择
 */
function updateGroupDesignatedSelection() {
  const checkboxes = document.querySelectorAll('#wechat-group-designated-member-list input[type="checkbox"]:checked');
  groupRedPacketSelectedMembers = Array.from(checkboxes).map(cb => cb.dataset.memberId);

  const countEl = document.getElementById('wechat-group-designated-count');
  if (countEl) {
    countEl.textContent = groupRedPacketSelectedMembers.length;
  }
}

/**
 * 隐藏指定成员红包页面
 */
export function hideGroupDesignatedRedPacketPage() {
  document.getElementById('wechat-group-designated-rp-page')?.classList.add('hidden');
  document.getElementById('wechat-group-designated-keyboard')?.classList.add('hidden');
}

/**
 * 更新指定成员红包显示
 */
function updateGroupDesignatedRedPacketDisplay() {
  const amountEl = document.getElementById('wechat-group-designated-amount-value');
  const countEl = document.getElementById('wechat-group-designated-count');
  const totalEl = document.getElementById('wechat-group-designated-total-display');

  const amount = parseFloat(groupRedPacketAmount) || 0;
  const count = groupRedPacketSelectedMembers.length;

  if (amountEl) {
    amountEl.textContent = groupRedPacketAmount || '0.00';
  }
  if (countEl) {
    countEl.textContent = count;
  }
  if (totalEl) {
    totalEl.textContent = '¥' + (amount * count).toFixed(2);
  }
}

// ============ 群转账成员选择页面 ============

/**
 * 显示群转账成员选择页面
 */
export function showGroupTransferSelectPage() {
  groupTransferAmount = '';
  groupTransferDescription = '';
  groupTransferTargetMemberId = null;

  const settings = getSettings();
  const groupIndex = getCurrentGroupIndex();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  // 渲染成员列表
  const listContainer = document.getElementById('wechat-group-transfer-member-list');
  if (listContainer) {
    listContainer.innerHTML = members.map(member => {
      const firstChar = member.name?.charAt(0) || '?';
      const avatarHtml = member.avatar
        ? `<img src="${member.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
        : firstChar;

      return `
        <div class="wechat-group-transfer-member-item" data-member-id="${member.id}">
          <div class="wechat-group-transfer-member-avatar">${avatarHtml}</div>
          <div class="wechat-group-transfer-member-name">${escapeHtml(member.name)}</div>
          <div class="wechat-group-transfer-member-arrow">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    listContainer.querySelectorAll('.wechat-group-transfer-member-item').forEach(item => {
      item.addEventListener('click', () => {
        groupTransferTargetMemberId = item.dataset.memberId;
        hideGroupTransferSelectPage();
        showGroupTransferAmountPage();
      });
    });
  }

  document.getElementById('wechat-group-transfer-select-page')?.classList.remove('hidden');
}

/**
 * 隐藏群转账成员选择页面
 */
export function hideGroupTransferSelectPage() {
  document.getElementById('wechat-group-transfer-select-page')?.classList.add('hidden');
}

// ============ 群转账金额输入页面 ============

/**
 * 显示群转账金额输入页面
 */
export function showGroupTransferAmountPage() {
  const settings = getSettings();
  const targetMember = settings.contacts?.find(c => c.id === groupTransferTargetMemberId);
  if (!targetMember) {
    showToast('请先选择转账对象', 'info');
    return;
  }

  // 更新页面标题显示目标成员
  const titleEl = document.getElementById('wechat-group-transfer-target-name');
  if (titleEl) {
    titleEl.textContent = `向 ${targetMember.name} 转账`;
  }

  groupTransferAmount = '';
  groupTransferDescription = '';

  document.getElementById('wechat-group-transfer-amount-page')?.classList.remove('hidden');
  updateGroupTransferAmountDisplay();
}

/**
 * 隐藏群转账金额输入页面
 */
export function hideGroupTransferAmountPage() {
  document.getElementById('wechat-group-transfer-amount-page')?.classList.add('hidden');
  document.getElementById('wechat-group-transfer-keyboard')?.classList.add('hidden');
}

/**
 * 更新群转账金额显示
 */
function updateGroupTransferAmountDisplay() {
  const amountEl = document.getElementById('wechat-group-transfer-amount-value');
  const displayEl = document.getElementById('wechat-group-transfer-amount-display');

  const amount = parseFloat(groupTransferAmount) || 0;

  if (amountEl) {
    amountEl.textContent = groupTransferAmount || '0.00';
  }
  if (displayEl) {
    displayEl.textContent = '¥' + amount.toFixed(2);
  }
}

// ============ 键盘处理 ============

let currentKeyboardTarget = null; // 'random-amount' | 'random-count' | 'designated-amount' | 'transfer-amount'

/**
 * 显示数字键盘
 */
export function showGroupKeyboard(target) {
  currentKeyboardTarget = target;

  let keyboardId;
  if (target === 'random-amount' || target === 'random-count') {
    keyboardId = 'wechat-group-rp-keyboard';
  } else if (target === 'designated-amount') {
    keyboardId = 'wechat-group-designated-keyboard';
  } else if (target === 'transfer-amount') {
    keyboardId = 'wechat-group-transfer-keyboard';
  }

  const keyboard = document.getElementById(keyboardId);
  if (keyboard) {
    keyboard.classList.remove('hidden');
  }
}

/**
 * 隐藏数字键盘
 */
export function hideGroupKeyboard() {
  document.getElementById('wechat-group-rp-keyboard')?.classList.add('hidden');
  document.getElementById('wechat-group-designated-keyboard')?.classList.add('hidden');
  document.getElementById('wechat-group-transfer-keyboard')?.classList.add('hidden');
  currentKeyboardTarget = null;
}

/**
 * 处理键盘输入
 */
export function handleGroupKeyboardInput(key) {
  if (!currentKeyboardTarget) return;

  let currentValue;
  let isCount = currentKeyboardTarget === 'random-count';

  if (currentKeyboardTarget === 'random-amount') {
    currentValue = groupRedPacketAmount;
  } else if (currentKeyboardTarget === 'random-count') {
    currentValue = groupRedPacketCount;
  } else if (currentKeyboardTarget === 'designated-amount') {
    currentValue = groupRedPacketAmount;
  } else if (currentKeyboardTarget === 'transfer-amount') {
    currentValue = groupTransferAmount;
  }

  if (key === 'backspace') {
    currentValue = currentValue.slice(0, -1);
  } else if (key === 'confirm') {
    hideGroupKeyboard();
    return;
  } else if (key === '.') {
    if (isCount) return; // 红包个数不允许小数点
    if (!currentValue.includes('.') && currentValue.length > 0) {
      currentValue += '.';
    }
  } else {
    if (isCount) {
      // 红包个数：整数，最多2位
      if (currentValue.length < 2) {
        currentValue += key;
      }
    } else {
      // 金额
      const dotIndex = currentValue.indexOf('.');
      if (dotIndex !== -1) {
        if (currentValue.length - dotIndex <= 2) {
          currentValue += key;
        }
      } else {
        if (currentValue.length < 6) {
          currentValue += key;
        }
      }
    }
  }

  // 更新状态
  if (currentKeyboardTarget === 'random-amount') {
    groupRedPacketAmount = currentValue;
    updateGroupRandomRedPacketDisplay();
  } else if (currentKeyboardTarget === 'random-count') {
    groupRedPacketCount = currentValue;
    updateGroupRandomRedPacketDisplay();
  } else if (currentKeyboardTarget === 'designated-amount') {
    groupRedPacketAmount = currentValue;
    updateGroupDesignatedRedPacketDisplay();
  } else if (currentKeyboardTarget === 'transfer-amount') {
    groupTransferAmount = currentValue;
    updateGroupTransferAmountDisplay();
  }
}

// ============ 密码验证 ============

let pendingGroupAction = null; // { type: 'random-rp' | 'designated-rp' | 'transfer', ... }

/**
 * 显示群聊密码输入弹窗
 */
export function showGroupPasswordModal(actionType, extraData = {}) {
  pendingGroupAction = { type: actionType, ...extraData };

  const modal = document.getElementById('wechat-group-password-modal');
  if (modal) {
    modal.classList.remove('hidden');
    // 清空密码
    const dots = modal.querySelectorAll('.wechat-password-dot');
    dots.forEach(dot => dot.classList.remove('filled'));
    modal.dataset.password = '';
  }
}

/**
 * 隐藏群聊密码输入弹窗
 */
export function hideGroupPasswordModal() {
  const modal = document.getElementById('wechat-group-password-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  pendingGroupAction = null;
}

/**
 * 处理密码输入
 */
export function handleGroupPasswordInput(key) {
  const modal = document.getElementById('wechat-group-password-modal');
  if (!modal) return;

  let password = modal.dataset.password || '';

  if (key === 'backspace') {
    password = password.slice(0, -1);
  } else if (password.length < 6) {
    password += key;
  }

  modal.dataset.password = password;

  // 更新密码点显示
  const dots = modal.querySelectorAll('.wechat-password-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < password.length);
  });

  // 6位密码输入完成，验证
  if (password.length === 6) {
    const settings = getSettings();
    const correctPassword = settings.paymentPassword || '666666';
    if (password === correctPassword) {
      // 先执行操作，再隐藏弹窗（hideGroupPasswordModal 会清空 pendingGroupAction）
      const action = pendingGroupAction;
      hideGroupPasswordModal();
      if (action) {
        executeGroupActionWithData(action);
      }
    } else {
      showToast('密码错误', 'info');
      modal.dataset.password = '';
      dots.forEach(dot => dot.classList.remove('filled'));
    }
  }
}

/**
 * 执行群聊操作（带参数版本）
 */
async function executeGroupActionWithData(action) {
  if (!action) return;

  const actionType = action.type;

  if (actionType === 'random-rp') {
    await sendGroupRandomRedPacket();
  } else if (actionType === 'designated-rp') {
    await sendGroupDesignatedRedPacket();
  } else if (actionType === 'transfer') {
    await sendGroupTransfer();
  }
}

/**
 * 执行群聊操作（保留原函数兼容性）
 */
async function executeGroupAction() {
  await executeGroupActionWithData(pendingGroupAction);
  pendingGroupAction = null;
}

// ============ 发送群红包 ============

/**
 * 更新拼手气红包总金额显示
 */
function updateGroupRandomRedPacketTotal() {
  const amountInput = document.getElementById('wechat-group-rp-amount-input');
  const amount = parseFloat(amountInput?.value) || 0;
  const totalEl = document.getElementById('wechat-group-rp-total-display');
  if (totalEl) {
    totalEl.textContent = '¥' + amount.toFixed(2);
  }
}

/**
 * 更新指定成员红包总金额显示
 */
function updateGroupDesignatedRedPacketTotal() {
  const amountInput = document.getElementById('wechat-group-designated-amount-input');
  const amount = parseFloat(amountInput?.value) || 0;
  const count = groupRedPacketSelectedMembers.length;
  const totalEl = document.getElementById('wechat-group-designated-total-display');
  if (totalEl) {
    totalEl.textContent = '¥' + (amount * count).toFixed(2);
  }
}

/**
 * 更新群转账总金额显示
 */
function updateGroupTransferAmountTotal() {
  const amountInput = document.getElementById('wechat-group-transfer-amount-input');
  const amount = parseFloat(amountInput?.value) || 0;
  const displayEl = document.getElementById('wechat-group-transfer-amount-display');
  if (displayEl) {
    displayEl.textContent = '¥' + amount.toFixed(2);
  }
}

/**
 * 提交拼手气红包（显示密码输入）
 */
export function submitGroupRandomRedPacket() {
  const amountInput = document.getElementById('wechat-group-rp-amount-input');
  const countInput = document.getElementById('wechat-group-rp-count-input');
  const amount = parseFloat(amountInput?.value) || 0;
  const count = parseInt(countInput?.value) || 0;

  if (amount <= 0) {
    showToast('请输入红包金额', 'info');
    return;
  }
  if (count <= 0) {
    showToast('请输入红包个数', 'info');
    return;
  }
  if (amount > 200) {
    showToast('单个红包最多200元', 'info');
    return;
  }
  if (amount > getWalletBalance()) {
    showToast('余额不足', 'info');
    return;
  }

  // 保存到状态变量供后续使用
  groupRedPacketAmount = amount.toString();
  groupRedPacketCount = count.toString();

  // 获取祝福语
  const messageInput = document.getElementById('wechat-group-rp-message');
  if (messageInput && messageInput.value.trim()) {
    groupRedPacketMessage = messageInput.value.trim();
  }

  showGroupPasswordModal('random-rp');
}

/**
 * 发送拼手气红包
 */
async function sendGroupRandomRedPacket() {
  const amount = parseFloat(groupRedPacketAmount) || 0;
  const count = parseInt(groupRedPacketCount) || 0;

  // 扣款
  const result = deductFromWallet(amount);
  if (!result.success) {
    showToast(result.message, 'info');
    return;
  }

  hideGroupRandomRedPacketPage();

  const settings = getSettings();
  const groupIndex = getCurrentGroupIndex();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  // 分配金额
  const distributedAmounts = distributeRandomAmounts(amount, count);

  // 创建红包信息
  const rpInfo = {
    id: generateRedPacketId(),
    type: 'random',
    totalAmount: amount,
    count: count,
    message: groupRedPacketMessage,
    senderName: settings.userName || 'User',
    distributedAmounts: distributedAmounts,
    claimedBy: [], // { memberId, memberName, amount, claimedAt }
    status: 'pending',
    expireAt: Date.now() + 24 * 60 * 60 * 1000
  };

  // 保存到聊天记录
  if (!groupChat.chatHistory) groupChat.chatHistory = [];
  groupChat.chatHistory.push({
    role: 'user',
    content: `[群红包] ${groupRedPacketMessage}`,
    time: getTimeStr(),
    timestamp: Date.now(),
    isGroupRedPacket: true,
    groupRedPacketInfo: rpInfo
  });

  // 显示红包消息
  appendGroupRedPacketMessage('user', rpInfo);
  requestSave();
  refreshChatList();

  // AI 领取红包（随机延迟）
  await processAIClaimGroupRedPacket(rpInfo, groupChat, members);
}

/**
 * 提交指定成员红包（显示密码输入）
 */
export function submitGroupDesignatedRedPacket() {
  const amountInput = document.getElementById('wechat-group-designated-amount-input');
  const amount = parseFloat(amountInput?.value) || 0;
  const count = groupRedPacketSelectedMembers.length;

  if (amount <= 0) {
    showToast('请输入红包金额', 'info');
    return;
  }
  if (count <= 0) {
    showToast('请选择接收成员', 'info');
    return;
  }
  if (amount > 200) {
    showToast('单个红包最多200元', 'info');
    return;
  }

  const totalAmount = amount * count;
  if (totalAmount > getWalletBalance()) {
    showToast('余额不足', 'info');
    return;
  }

  // 保存到状态变量供后续使用
  groupRedPacketAmount = amount.toString();

  // 获取祝福语
  const messageInput = document.getElementById('wechat-group-designated-message');
  if (messageInput && messageInput.value.trim()) {
    groupRedPacketMessage = messageInput.value.trim();
  }

  showGroupPasswordModal('designated-rp');
}

/**
 * 发送指定成员红包
 */
async function sendGroupDesignatedRedPacket() {
  const amount = parseFloat(groupRedPacketAmount) || 0;
  const count = groupRedPacketSelectedMembers.length;
  const totalAmount = amount * count;

  // 扣款
  const settings = getSettings();
  const current = getWalletBalance();
  if (totalAmount > current) {
    showToast('余额不足', 'info');
    return;
  }

  settings.walletAmount = (current - totalAmount).toFixed(2);
  requestSave();

  hideGroupDesignatedRedPacketPage();

  const groupIndex = getCurrentGroupIndex();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  // 获取指定成员名称
  const targetMembers = groupRedPacketSelectedMembers.map(id => {
    const member = settings.contacts.find(c => c.id === id);
    return member?.name || '未知';
  });

  // 创建红包信息
  const rpInfo = {
    id: generateRedPacketId(),
    type: 'designated',
    totalAmount: totalAmount,
    amountPerPerson: amount,
    count: count,
    message: groupRedPacketMessage,
    senderName: settings.userName || 'User',
    targetMemberIds: [...groupRedPacketSelectedMembers],
    targetMemberNames: targetMembers,
    claimedBy: [],
    status: 'pending',
    expireAt: Date.now() + 24 * 60 * 60 * 1000
  };

  // 保存到聊天记录
  if (!groupChat.chatHistory) groupChat.chatHistory = [];
  groupChat.chatHistory.push({
    role: 'user',
    content: `[专属红包] 给${targetMembers.join('、')}的红包`,
    time: getTimeStr(),
    timestamp: Date.now(),
    isGroupRedPacket: true,
    groupRedPacketInfo: rpInfo
  });

  // 显示红包消息
  appendGroupRedPacketMessage('user', rpInfo);
  requestSave();
  refreshChatList();

  // AI 领取红包
  await processAIClaimGroupRedPacket(rpInfo, groupChat, members);
}

// ============ 发送群转账 ============

/**
 * 提交群转账（显示密码输入）
 */
export function submitGroupTransfer() {
  const amountInput = document.getElementById('wechat-group-transfer-amount-input');
  const amount = parseFloat(amountInput?.value) || 0;

  if (amount <= 0) {
    showToast('请输入转账金额', 'info');
    return;
  }
  if (amount > getWalletBalance()) {
    showToast('余额不足', 'info');
    return;
  }

  // 保存到状态变量供后续使用
  groupTransferAmount = amount.toString();

  // 获取转账说明
  const descInput = document.getElementById('wechat-group-transfer-description');
  if (descInput && descInput.value.trim()) {
    groupTransferDescription = descInput.value.trim();
  }

  showGroupPasswordModal('transfer');
}

/**
 * 发送群转账
 */
async function sendGroupTransfer() {
  const amount = parseFloat(groupTransferAmount) || 0;

  // 扣款
  const settings = getSettings();
  const current = getWalletBalance();
  if (amount > current) {
    showToast('余额不足', 'info');
    return;
  }

  settings.walletAmount = (current - amount).toFixed(2);
  requestSave();

  hideGroupTransferAmountPage();

  const groupIndex = getCurrentGroupIndex();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  const targetMember = settings.contacts?.find(c => c.id === groupTransferTargetMemberId);
  if (!targetMember) return;

  // 创建转账信息
  const tfInfo = {
    id: generateTransferId(),
    amount: amount,
    description: groupTransferDescription || '',
    senderName: settings.userName || 'User',
    targetMemberId: groupTransferTargetMemberId,
    targetMemberName: targetMember.name,
    status: 'pending',
    receivedAt: null,
    refundedAt: null,
    expireAt: Date.now() + 24 * 60 * 60 * 1000
  };

  // 保存到聊天记录
  if (!groupChat.chatHistory) groupChat.chatHistory = [];
  groupChat.chatHistory.push({
    role: 'user',
    content: `[转账] 向${targetMember.name}发起了一笔转账`,
    time: getTimeStr(),
    timestamp: Date.now(),
    isGroupTransfer: true,
    groupTransferInfo: tfInfo
  });

  // 显示转账消息
  appendGroupTransferMessage('user', tfInfo);
  requestSave();
  refreshChatList();

  // AI 收款
  await processAIReceiveGroupTransfer(tfInfo, groupChat, targetMember);
}

// ============ AI 领取红包 ============

/**
 * AI 领取群红包
 */
async function processAIClaimGroupRedPacket(rpInfo, groupChat, members) {
  // 随机延迟 2-5 秒
  const claimDelay = 2000 + Math.random() * 3000;
  await sleep(claimDelay);

  const settings = getSettings();
  const timeStr = getTimeStr();

  if (rpInfo.type === 'random') {
    // 拼手气红包：按顺序领取
    const availableMembers = members.filter(m => !rpInfo.claimedBy.some(c => c.memberId === m.id));
    const claimCount = Math.min(availableMembers.length, rpInfo.distributedAmounts.length - rpInfo.claimedBy.length);

    for (let i = 0; i < claimCount; i++) {
      const member = availableMembers[i];
      const amountIndex = rpInfo.claimedBy.length;
      const claimAmount = rpInfo.distributedAmounts[amountIndex];

      rpInfo.claimedBy.push({
        memberId: member.id,
        memberName: member.name,
        amount: claimAmount,
        claimedAt: Date.now()
      });

      // 更新界面
      updateGroupRedPacketBubbleStatus(rpInfo.id);

      // AI 感谢消息
      await sleep(800 + Math.random() * 500);
      showGroupTypingIndicator(member.name, member.id);
      await sleep(600 + Math.random() * 400);
      hideGroupTypingIndicator();

      try {
        const thankMsg = await generateAIThankMessage(member, rpInfo, claimAmount);
        if (thankMsg) {
          groupChat.chatHistory.push({
            role: 'assistant',
            content: thankMsg,
            characterName: member.name,
            characterId: member.id,
            time: timeStr,
            timestamp: Date.now()
          });
          appendGroupMessage('assistant', thankMsg, member.name, member.id);
        }
      } catch (e) {
        console.error('[可乐] AI感谢红包失败:', e);
      }

      if (i < claimCount - 1) {
        await sleep(1000 + Math.random() * 1000);
      }
    }

    // 检查是否全部领完
    if (rpInfo.claimedBy.length >= rpInfo.count) {
      rpInfo.status = 'claimed';
    }
  } else if (rpInfo.type === 'designated') {
    // 指定成员红包：只有指定成员可以领取
    for (const memberId of rpInfo.targetMemberIds) {
      const member = members.find(m => m.id === memberId);
      if (!member) continue;
      if (rpInfo.claimedBy.some(c => c.memberId === memberId)) continue;

      rpInfo.claimedBy.push({
        memberId: member.id,
        memberName: member.name,
        amount: rpInfo.amountPerPerson,
        claimedAt: Date.now()
      });

      // 更新界面
      updateGroupRedPacketBubbleStatus(rpInfo.id);

      // AI 感谢消息
      await sleep(800 + Math.random() * 500);
      showGroupTypingIndicator(member.name, member.id);
      await sleep(600 + Math.random() * 400);
      hideGroupTypingIndicator();

      try {
        const thankMsg = await generateAIThankMessage(member, rpInfo, rpInfo.amountPerPerson);
        if (thankMsg) {
          groupChat.chatHistory.push({
            role: 'assistant',
            content: thankMsg,
            characterName: member.name,
            characterId: member.id,
            time: timeStr,
            timestamp: Date.now()
          });
          appendGroupMessage('assistant', thankMsg, member.name, member.id);
        }
      } catch (e) {
        console.error('[可乐] AI感谢红包失败:', e);
      }

      await sleep(1000 + Math.random() * 1000);
    }

    // 检查是否全部领完
    if (rpInfo.claimedBy.length >= rpInfo.count) {
      rpInfo.status = 'claimed';
    }
  }

  requestSave();
  refreshChatList();
}

/**
 * AI 收取群转账
 */
async function processAIReceiveGroupTransfer(tfInfo, groupChat, targetMember) {
  // 随机延迟 2-5 秒
  const receiveDelay = 2000 + Math.random() * 3000;
  await sleep(receiveDelay);

  const settings = getSettings();
  const timeStr = getTimeStr();

  // 更新转账状态
  tfInfo.status = 'received';
  tfInfo.receivedAt = Date.now();

  // 更新界面
  updateGroupTransferBubbleStatus(tfInfo.id, 'received');

  // AI 感谢消息
  await sleep(500);
  showGroupTypingIndicator(targetMember.name, targetMember.id);
  await sleep(600 + Math.random() * 400);
  hideGroupTypingIndicator();

  try {
    const thankMsg = await generateAITransferThankMessage(targetMember, tfInfo);
    if (thankMsg) {
      groupChat.chatHistory.push({
        role: 'assistant',
        content: thankMsg,
        characterName: targetMember.name,
        characterId: targetMember.id,
        time: timeStr,
        timestamp: Date.now()
      });
      appendGroupMessage('assistant', thankMsg, targetMember.name, targetMember.id);
    }
  } catch (e) {
    console.error('[可乐] AI感谢转账失败:', e);
  }

  requestSave();
  refreshChatList();
}

// ============ AI 消息生成 ============

/**
 * 生成 AI 红包感谢消息
 */
async function generateAIThankMessage(member, rpInfo, claimAmount) {
  if (!member.useCustomApi || !member.customApiUrl || !member.customModel) {
    // 没有配置独立API，返回简单消息
    return `谢谢红包！抢到了${claimAmount.toFixed(2)}元~`;
  }

  try {
    const systemPrompt = buildSystemPrompt(member, { allowStickers: false, allowMusicShare: false, allowCallRequests: false });
    const userPrompt = `用户给群里发了一个${rpInfo.totalAmount}元的红包，祝福语是"${rpInfo.message}"。你抢到了${claimAmount.toFixed(2)}元。请根据你的性格自然地回应这件事，不要使用任何特殊格式标签，直接输出对话内容。`;

    const chatUrl = member.customApiUrl.replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (member.customApiKey) {
      headers['Authorization'] = `Bearer ${member.customApiKey}`;
    }

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: member.customModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1,
        max_tokens: 256
      })
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || '';
    // 取第一条消息
    reply = reply.split('|||')[0].trim();
    // 移除可能的格式标签
    reply = reply.replace(/^\[.*?\]\s*/, '').trim();

    return reply || `谢谢红包！${claimAmount.toFixed(2)}元~`;
  } catch (e) {
    console.error('[可乐] AI红包感谢消息生成失败:', e);
    return `谢谢红包！抢到了${claimAmount.toFixed(2)}元~`;
  }
}

/**
 * 生成 AI 转账感谢消息
 */
async function generateAITransferThankMessage(member, tfInfo) {
  if (!member.useCustomApi || !member.customApiUrl || !member.customModel) {
    return `收到转账${tfInfo.amount.toFixed(2)}元，谢谢~`;
  }

  try {
    const systemPrompt = buildSystemPrompt(member, { allowStickers: false, allowMusicShare: false, allowCallRequests: false });
    const userPrompt = tfInfo.description
      ? `用户给你转账了${tfInfo.amount}元，备注是"${tfInfo.description}"。请根据你的性格自然地回应这件事，不要使用任何特殊格式标签，直接输出对话内容。`
      : `用户给你转账了${tfInfo.amount}元。请根据你的性格自然地回应这件事，不要使用任何特殊格式标签，直接输出对话内容。`;

    const chatUrl = member.customApiUrl.replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (member.customApiKey) {
      headers['Authorization'] = `Bearer ${member.customApiKey}`;
    }

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: member.customModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1,
        max_tokens: 256
      })
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || '';
    reply = reply.split('|||')[0].trim();
    reply = reply.replace(/^\[.*?\]\s*/, '').trim();

    return reply || `收到啦，谢谢~`;
  } catch (e) {
    console.error('[可乐] AI转账感谢消息生成失败:', e);
    return `收到转账${tfInfo.amount.toFixed(2)}元，谢谢~`;
  }
}

// ============ UI 渲染 ============

/**
 * 追加群红包消息到界面
 */
export function appendGroupRedPacketMessage(role, rpInfo) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const isDesignated = rpInfo.type === 'designated';
  const isClaimed = rpInfo.status === 'claimed' || (rpInfo.claimedBy && rpInfo.claimedBy.length >= rpInfo.count);
  const statusClass = isClaimed ? 'claimed' : '';

  // 指定成员红包显示特殊样式
  const designatedLabel = isDesignated ? `<div class="wechat-group-rp-designated-label">给${rpInfo.targetMemberNames?.join('、') || '指定成员'}的红包</div>` : '';

  const bubbleHTML = `
    <div class="wechat-group-red-packet-bubble ${statusClass}" data-rp-id="${rpInfo.id}">
      <div class="wechat-group-rp-icon">
        <svg viewBox="0 0 24 24" width="40" height="40"><rect x="4" y="2" width="16" height="20" rx="2" fill="#e74c3c"/><rect x="4" y="8" width="16" height="4" fill="#c0392b"/><circle cx="12" cy="10" r="3" fill="#f1c40f"/></svg>
      </div>
      <div class="wechat-group-rp-info">
        <div class="wechat-group-rp-message">${escapeHtml(rpInfo.message || '恭喜发财，大吉大利')}</div>
        ${designatedLabel}
        <div class="wechat-group-rp-status ${statusClass ? '' : 'hidden'}">${isClaimed ? '已领完' : ''}</div>
      </div>
    </div>
    <div class="wechat-group-rp-footer">群红包</div>
  `;

  if (role === 'user') {
    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
      <div class="wechat-message-content">${bubbleHTML}</div>
    `;
  } else {
    const settings = getSettings();
    const contact = settings.contacts?.find(c => c.name === rpInfo.senderName);
    const firstChar = rpInfo.senderName?.charAt(0) || '?';
    const avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="">`
      : firstChar;

    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${avatarContent}</div>
      <div class="wechat-message-content">
        <div class="wechat-message-sender" style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 2px;">${escapeHtml(rpInfo.senderName)}</div>
        ${bubbleHTML}
      </div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定点击事件（查看详情）
  const bubble = messageDiv.querySelector('.wechat-group-red-packet-bubble');
  bubble?.addEventListener('click', () => {
    showGroupRedPacketDetail(rpInfo);
  });
}

/**
 * 追加群转账消息到界面
 */
export function appendGroupTransferMessage(role, tfInfo) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const statusText = tfInfo.status === 'received' ? '已收款' :
                     tfInfo.status === 'refunded' ? '已退还' : '待收款';
  const statusClass = tfInfo.status || 'pending';

  const bubbleHTML = `
    <div class="wechat-group-transfer-bubble ${statusClass}" data-tf-id="${tfInfo.id}">
      <div class="wechat-group-tf-icon">
        <svg viewBox="0 0 24 24" width="36" height="36"><rect x="2" y="4" width="20" height="16" rx="2" fill="#f39c12"/><text x="12" y="14" font-size="8" fill="#fff" text-anchor="middle">¥</text></svg>
      </div>
      <div class="wechat-group-tf-info">
        <div class="wechat-group-tf-amount">¥${tfInfo.amount.toFixed(2)}</div>
        <div class="wechat-group-tf-target">向${escapeHtml(tfInfo.targetMemberName)}转账</div>
        <div class="wechat-group-tf-desc">${escapeHtml(tfInfo.description) || '转账'}</div>
      </div>
      <div class="wechat-group-tf-status">${statusText}</div>
    </div>
  `;

  if (role === 'user') {
    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
      <div class="wechat-message-content">${bubbleHTML}</div>
    `;
  } else {
    const settings = getSettings();
    const contact = settings.contacts?.find(c => c.name === tfInfo.senderName);
    const firstChar = tfInfo.senderName?.charAt(0) || '?';
    const avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="">`
      : firstChar;

    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${avatarContent}</div>
      <div class="wechat-message-content">
        <div class="wechat-message-sender" style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 2px;">${escapeHtml(tfInfo.senderName)}</div>
        ${bubbleHTML}
      </div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * 追加群红包领取提示
 */
function appendGroupRedPacketClaimNotice(claimerName, senderName) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const noticeDiv = document.createElement('div');
  noticeDiv.className = 'wechat-msg-notice';
  noticeDiv.innerHTML = `<span>${escapeHtml(claimerName)}领取了${escapeHtml(senderName)}的红包</span>`;

  messagesContainer.appendChild(noticeDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * 更新群红包气泡状态
 */
function updateGroupRedPacketBubbleStatus(rpId) {
  const bubble = document.querySelector(`.wechat-group-red-packet-bubble[data-rp-id="${rpId}"]`);
  if (!bubble) return;

  // 从聊天记录中找到红包信息
  const settings = getSettings();
  const groupIndex = getCurrentGroupIndex();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  const rpMsg = groupChat.chatHistory?.find(m => m.groupRedPacketInfo?.id === rpId);
  const rpInfo = rpMsg?.groupRedPacketInfo;
  if (!rpInfo) return;

  const isClaimed = rpInfo.status === 'claimed' || (rpInfo.claimedBy && rpInfo.claimedBy.length >= rpInfo.count);

  if (isClaimed) {
    bubble.classList.add('claimed');
    const statusEl = bubble.querySelector('.wechat-group-rp-status');
    if (statusEl) {
      statusEl.textContent = '已领完';
      statusEl.classList.remove('hidden');
    }
  }
}

/**
 * 更新群转账气泡状态
 */
function updateGroupTransferBubbleStatus(tfId, status) {
  const bubble = document.querySelector(`.wechat-group-transfer-bubble[data-tf-id="${tfId}"]`);
  if (!bubble) return;

  bubble.classList.remove('pending', 'received', 'refunded');
  bubble.classList.add(status);

  const statusEl = bubble.querySelector('.wechat-group-tf-status');
  if (statusEl) {
    statusEl.textContent = status === 'received' ? '已收款' :
                           status === 'refunded' ? '已退还' : '待收款';
  }
}

// ============ 群红包详情页面 ============

/**
 * 显示群红包详情
 */
export function showGroupRedPacketDetail(rpInfo) {
  const page = document.getElementById('wechat-group-rp-detail-page');
  if (!page) return;

  const settings = getSettings();

  // 更新详情页内容
  const senderEl = document.getElementById('wechat-group-rp-detail-sender');
  const messageEl = document.getElementById('wechat-group-rp-detail-message');
  const totalEl = document.getElementById('wechat-group-rp-detail-total');
  const countEl = document.getElementById('wechat-group-rp-detail-count');
  const listEl = document.getElementById('wechat-group-rp-detail-list');

  if (senderEl) {
    senderEl.textContent = `${rpInfo.senderName}的红包`;
  }
  if (messageEl) {
    messageEl.textContent = rpInfo.message || '恭喜发财，大吉大利';
  }
  if (totalEl) {
    totalEl.textContent = '¥' + rpInfo.totalAmount.toFixed(2);
  }
  if (countEl) {
    const claimed = rpInfo.claimedBy?.length || 0;
    countEl.textContent = `${claimed}/${rpInfo.count}个红包`;
  }

  // 渲染领取列表
  if (listEl) {
    if (rpInfo.claimedBy && rpInfo.claimedBy.length > 0) {
      // 找出最佳手气（金额最高的）
      let maxAmount = 0;
      let maxIndex = -1;
      rpInfo.claimedBy.forEach((claim, idx) => {
        if (claim.amount > maxAmount) {
          maxAmount = claim.amount;
          maxIndex = idx;
        }
      });

      listEl.innerHTML = rpInfo.claimedBy.map((claim, idx) => {
        const member = settings.contacts?.find(c => c.id === claim.memberId);
        const firstChar = claim.memberName?.charAt(0) || '?';
        const avatarHtml = member?.avatar
          ? `<img src="${member.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
          : firstChar;

        const isBest = rpInfo.type === 'random' && idx === maxIndex && rpInfo.claimedBy.length > 1;
        const bestLabel = isBest ? '<span class="wechat-group-rp-best">手气最佳</span>' : '';

        const claimTime = new Date(claim.claimedAt);
        const timeStr = `${claimTime.getHours().toString().padStart(2, '0')}:${claimTime.getMinutes().toString().padStart(2, '0')}`;

        return `
          <div class="wechat-group-rp-detail-item">
            <div class="wechat-group-rp-detail-avatar">${avatarHtml}</div>
            <div class="wechat-group-rp-detail-info">
              <div class="wechat-group-rp-detail-name">${escapeHtml(claim.memberName)} ${bestLabel}</div>
              <div class="wechat-group-rp-detail-time">${timeStr}</div>
            </div>
            <div class="wechat-group-rp-detail-amount">${claim.amount.toFixed(2)}元</div>
          </div>
        `;
      }).join('');
    } else {
      listEl.innerHTML = '<div class="wechat-group-rp-detail-empty">暂无人领取</div>';
    }
  }

  page.classList.remove('hidden');
}

/**
 * 隐藏群红包详情
 */
export function hideGroupRedPacketDetail() {
  document.getElementById('wechat-group-rp-detail-page')?.classList.add('hidden');
}

// ============ 创建页面HTML ============

/**
 * 创建群红包/转账相关页面（动态注入）
 */
export function createGroupRedPacketPages() {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  // 检查是否已存在
  if (document.getElementById('wechat-group-rp-type-page')) return;

  const pagesHTML = `
    <!-- 群红包类型选择页面 -->
    <div class="wechat-page wechat-group-rp-type-page hidden" id="wechat-group-rp-type-page">
      <div class="wechat-page-header">
        <button class="wechat-back-btn" id="wechat-group-rp-type-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
        <span class="wechat-page-title">发红包</span>
      </div>
      <div class="wechat-group-rp-type-content">
        <div class="wechat-group-rp-type-item" id="wechat-group-rp-type-random">
          <div class="wechat-group-rp-type-icon" style="background: linear-gradient(135deg, #e74c3c, #c0392b);">
            <svg viewBox="0 0 24 24" width="32" height="32"><rect x="4" y="2" width="16" height="20" rx="2" fill="#fff"/><circle cx="12" cy="10" r="3" fill="#e74c3c"/></svg>
          </div>
          <div class="wechat-group-rp-type-info">
            <div class="wechat-group-rp-type-title">拼手气红包</div>
            <div class="wechat-group-rp-type-desc">分享给群成员，金额随机</div>
          </div>
          <div class="wechat-group-rp-type-arrow">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          </div>
        </div>
        <div class="wechat-group-rp-type-item" id="wechat-group-rp-type-designated">
          <div class="wechat-group-rp-type-icon" style="background: linear-gradient(135deg, #f39c12, #d68910);">
            <svg viewBox="0 0 24 24" width="32" height="32"><rect x="4" y="2" width="16" height="20" rx="2" fill="#fff"/><path d="M8 10h8M8 14h4" stroke="#f39c12" stroke-width="2"/></svg>
          </div>
          <div class="wechat-group-rp-type-info">
            <div class="wechat-group-rp-type-title">专属红包</div>
            <div class="wechat-group-rp-type-desc">指定成员领取，金额固定</div>
          </div>
          <div class="wechat-group-rp-type-arrow">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          </div>
        </div>
      </div>
    </div>

    <!-- 拼手气红包页面 -->
    <div class="wechat-page wechat-group-random-rp-page hidden" id="wechat-group-random-rp-page">
      <div class="wechat-page-header">
        <button class="wechat-back-btn" id="wechat-group-random-rp-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
        <span class="wechat-page-title">发拼手气红包</span>
      </div>
      <div class="wechat-group-rp-form">
        <div class="wechat-group-rp-row">
          <span class="wechat-group-rp-label">总金额</span>
          <span class="wechat-group-rp-value">¥<input type="number" id="wechat-group-rp-amount-input" class="wechat-group-rp-number-input" placeholder="0.00" step="0.01" min="0.01" max="200"></span>
        </div>
        <div class="wechat-group-rp-row">
          <span class="wechat-group-rp-label">红包个数</span>
          <span class="wechat-group-rp-value"><input type="number" id="wechat-group-rp-count-input" class="wechat-group-rp-number-input" placeholder="0" step="1" min="1" max="99">个</span>
        </div>
        <div class="wechat-group-rp-row">
          <input type="text" class="wechat-group-rp-message-input" id="wechat-group-rp-message" placeholder="恭喜发财，大吉大利" maxlength="20">
        </div>
        <div class="wechat-group-rp-total">
          <span id="wechat-group-rp-total-display">¥0.00</span>
        </div>
        <button class="wechat-btn wechat-btn-primary wechat-group-rp-submit" id="wechat-group-random-rp-submit">塞钱进红包</button>
      </div>
    </div>

    <!-- 指定成员红包页面 -->
    <div class="wechat-page wechat-group-designated-rp-page hidden" id="wechat-group-designated-rp-page">
      <div class="wechat-page-header">
        <button class="wechat-back-btn" id="wechat-group-designated-rp-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
        <span class="wechat-page-title">发专属红包</span>
      </div>
      <div class="wechat-group-designated-content">
        <div class="wechat-group-designated-section">
          <div class="wechat-group-designated-section-title">选择成员（已选<span id="wechat-group-designated-count">0</span>人）</div>
          <div class="wechat-group-designated-member-list" id="wechat-group-designated-member-list"></div>
        </div>
        <div class="wechat-group-rp-form">
          <div class="wechat-group-rp-row">
            <span class="wechat-group-rp-label">每人金额</span>
            <span class="wechat-group-rp-value">¥<input type="number" id="wechat-group-designated-amount-input" class="wechat-group-rp-number-input" placeholder="0.00" step="0.01" min="0.01" max="200"></span>
          </div>
          <div class="wechat-group-rp-row">
            <input type="text" class="wechat-group-rp-message-input" id="wechat-group-designated-message" placeholder="恭喜发财，大吉大利" maxlength="20">
          </div>
          <div class="wechat-group-rp-total">
            <span id="wechat-group-designated-total-display">¥0.00</span>
          </div>
          <button class="wechat-btn wechat-btn-primary wechat-group-rp-submit" id="wechat-group-designated-rp-submit">塞钱进红包</button>
        </div>
      </div>
    </div>

    <!-- 群转账成员选择页面 -->
    <div class="wechat-page wechat-group-transfer-select-page hidden" id="wechat-group-transfer-select-page">
      <div class="wechat-page-header">
        <button class="wechat-back-btn" id="wechat-group-transfer-select-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
        <span class="wechat-page-title">选择转账对象</span>
      </div>
      <div class="wechat-group-transfer-member-list" id="wechat-group-transfer-member-list"></div>
    </div>

    <!-- 群转账金额输入页面 -->
    <div class="wechat-page wechat-group-transfer-amount-page hidden" id="wechat-group-transfer-amount-page">
      <div class="wechat-page-header">
        <button class="wechat-back-btn" id="wechat-group-transfer-amount-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
        <span class="wechat-page-title" id="wechat-group-transfer-target-name">转账</span>
      </div>
      <div class="wechat-group-rp-form">
        <div class="wechat-group-rp-row">
          <span class="wechat-group-rp-label">转账金额</span>
          <span class="wechat-group-rp-value">¥<input type="number" id="wechat-group-transfer-amount-input" class="wechat-group-rp-number-input" placeholder="0.00" step="0.01" min="0.01"></span>
        </div>
        <div class="wechat-group-rp-row">
          <input type="text" class="wechat-group-rp-message-input" id="wechat-group-transfer-description" placeholder="添加转账说明（可选）" maxlength="20">
        </div>
        <div class="wechat-group-rp-total">
          <span id="wechat-group-transfer-amount-display">¥0.00</span>
        </div>
        <button class="wechat-btn wechat-group-transfer-submit-btn" id="wechat-group-transfer-submit">转账</button>
      </div>
    </div>

    <!-- 群红包详情页面 -->
    <div class="wechat-page wechat-group-rp-detail-page hidden" id="wechat-group-rp-detail-page">
      <div class="wechat-page-header">
        <button class="wechat-back-btn" id="wechat-group-rp-detail-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
        <span class="wechat-page-title">红包详情</span>
      </div>
      <div class="wechat-group-rp-detail-content">
        <div class="wechat-group-rp-detail-header">
          <div class="wechat-group-rp-detail-sender" id="wechat-group-rp-detail-sender">用户的红包</div>
          <div class="wechat-group-rp-detail-message" id="wechat-group-rp-detail-message">恭喜发财，大吉大利</div>
          <div class="wechat-group-rp-detail-total" id="wechat-group-rp-detail-total">¥0.00</div>
          <div class="wechat-group-rp-detail-count" id="wechat-group-rp-detail-count">0/0个红包</div>
        </div>
        <div class="wechat-group-rp-detail-list" id="wechat-group-rp-detail-list"></div>
      </div>
    </div>

    <!-- 群聊密码输入弹窗 -->
    <div class="wechat-modal hidden" id="wechat-group-password-modal">
      <div class="wechat-modal-content wechat-password-modal-content">
        <button class="wechat-modal-close" id="wechat-group-password-close">×</button>
        <div class="wechat-password-title">请输入支付密码</div>
        <div class="wechat-password-dots">
          <span class="wechat-password-dot"></span>
          <span class="wechat-password-dot"></span>
          <span class="wechat-password-dot"></span>
          <span class="wechat-password-dot"></span>
          <span class="wechat-password-dot"></span>
          <span class="wechat-password-dot"></span>
        </div>
        <div class="wechat-password-keyboard">
          <div class="wechat-password-row">
            <button class="wechat-password-key" data-key="1">1</button>
            <button class="wechat-password-key" data-key="2">2</button>
            <button class="wechat-password-key" data-key="3">3</button>
          </div>
          <div class="wechat-password-row">
            <button class="wechat-password-key" data-key="4">4</button>
            <button class="wechat-password-key" data-key="5">5</button>
            <button class="wechat-password-key" data-key="6">6</button>
          </div>
          <div class="wechat-password-row">
            <button class="wechat-password-key" data-key="7">7</button>
            <button class="wechat-password-key" data-key="8">8</button>
            <button class="wechat-password-key" data-key="9">9</button>
          </div>
          <div class="wechat-password-row">
            <button class="wechat-password-key" data-key=""></button>
            <button class="wechat-password-key" data-key="0">0</button>
            <button class="wechat-password-key" data-key="backspace">⌫</button>
          </div>
        </div>
      </div>
    </div>
  `;

  phone.insertAdjacentHTML('beforeend', pagesHTML);

  // 绑定事件
  bindGroupRedPacketEvents();
}

/**
 * 绑定群红包相关事件
 */
function bindGroupRedPacketEvents() {
  // 类型选择页面
  document.getElementById('wechat-group-rp-type-back')?.addEventListener('click', hideGroupRedPacketTypePage);
  document.getElementById('wechat-group-rp-type-random')?.addEventListener('click', showGroupRandomRedPacketPage);
  document.getElementById('wechat-group-rp-type-designated')?.addEventListener('click', showGroupDesignatedRedPacketPage);

  // 拼手气红包页面
  document.getElementById('wechat-group-random-rp-back')?.addEventListener('click', hideGroupRandomRedPacketPage);
  document.getElementById('wechat-group-random-rp-submit')?.addEventListener('click', submitGroupRandomRedPacket);

  // 拼手气红包金额输入监听
  document.getElementById('wechat-group-rp-amount-input')?.addEventListener('input', updateGroupRandomRedPacketTotal);
  document.getElementById('wechat-group-rp-count-input')?.addEventListener('input', updateGroupRandomRedPacketTotal);

  // 指定成员红包页面
  document.getElementById('wechat-group-designated-rp-back')?.addEventListener('click', hideGroupDesignatedRedPacketPage);
  document.getElementById('wechat-group-designated-rp-submit')?.addEventListener('click', submitGroupDesignatedRedPacket);

  // 指定成员红包金额输入监听
  document.getElementById('wechat-group-designated-amount-input')?.addEventListener('input', updateGroupDesignatedRedPacketTotal);

  // 群转账成员选择页面
  document.getElementById('wechat-group-transfer-select-back')?.addEventListener('click', hideGroupTransferSelectPage);

  // 群转账金额输入页面
  document.getElementById('wechat-group-transfer-amount-back')?.addEventListener('click', hideGroupTransferAmountPage);
  document.getElementById('wechat-group-transfer-submit')?.addEventListener('click', submitGroupTransfer);

  // 群转账金额输入监听
  document.getElementById('wechat-group-transfer-amount-input')?.addEventListener('input', updateGroupTransferAmountTotal);

  // 群红包详情页面
  document.getElementById('wechat-group-rp-detail-back')?.addEventListener('click', hideGroupRedPacketDetail);

  // 密码弹窗
  document.getElementById('wechat-group-password-close')?.addEventListener('click', hideGroupPasswordModal);
  document.querySelectorAll('#wechat-group-password-modal .wechat-password-key').forEach(key => {
    key.addEventListener('click', () => {
      const value = key.dataset.key;
      if (value) {
        handleGroupPasswordInput(value);
      }
    });
  });
}

// ============ 初始化 ============

/**
 * 初始化群红包功能
 */
export function initGroupRedPacket() {
  createGroupRedPacketPages();
}
