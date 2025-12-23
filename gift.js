/**
 * 礼物功能模块
 * 支持发送普通礼物和情趣玩具
 * 情趣玩具支持配送流程和控制界面
 */

import { getSettings } from './config.js';
import { requestSave } from './save-manager.js';
import { showToast, showNotificationBanner } from './toast.js';
import { escapeHtml } from './utils.js';
import { refreshChatList } from './ui.js';
import { currentChatIndex, appendMessage, showTypingIndicator, hideTypingIndicator } from './chat.js';
import { callAI } from './ai.js';
import { splitAIMessages } from './config.js';

// SVG图标定义
const ICON_GIFT_CHARACTER = `<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 20v-2a8 8 0 0116 0v2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M20 6l-3 3m0-3l3 3" stroke="#ff6b8a" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const ICON_GIFT_USER = `<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 20v-2a8 8 0 0116 0v2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 6l3 3m0-3l-3 3" stroke="#ff6b8a" stroke-width="1.5" stroke-linecap="round"/></svg>`;

// 礼物分类数据
const GIFT_CATEGORIES = {
  normal: {
    name: '普通礼物',
    icon: `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8v13M3 12h18" stroke="currentColor" stroke-width="1.5"/><path d="M12 8c-2-4-6-4-6 0s4 0 6 0c2-4 6-4 6 0s-4 0-6 0" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    items: [
      { id: 'flower', name: '鲜花', emoji: '💐', desc: '一束美丽的鲜花', hasControl: false },
      { id: 'chocolate', name: '巧克力', emoji: '🍫', desc: '精美的巧克力礼盒', hasControl: false },
      { id: 'ring', name: '戒指', emoji: '💍', desc: '闪耀的戒指', hasControl: false },
      { id: 'necklace', name: '项链', emoji: '📿', desc: '精致的项链', hasControl: false },
      { id: 'perfume', name: '香水', emoji: '🧴', desc: '迷人的香水', hasControl: false },
      { id: 'teddy', name: '玩偶', emoji: '🧸', desc: '可爱的毛绒玩偶', hasControl: false },
      { id: 'cake', name: '蛋糕', emoji: '🎂', desc: '美味的蛋糕', hasControl: false },
      { id: 'wine', name: '红酒', emoji: '🍷', desc: '醇香的红酒', hasControl: false }
    ]
  },
  toy: {
    name: '情趣玩具',
    icon: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    items: [
      { id: 'vibrator', name: '跳蛋', emoji: '🥚', desc: '遥控跳蛋', hasControl: true, hasShock: false },
      { id: 'massager', name: '按摩棒', emoji: '🌡️', desc: '震动按摩棒', hasControl: true, hasShock: false },
      { id: 'breastChain', name: '微电流乳链', emoji: '⚡', desc: '微电流乳链', hasControl: true, hasShock: true },
      { id: 'analPlug', name: '肛塞', emoji: '🔌', desc: '震动肛塞', hasControl: true, hasShock: false },
      { id: 'cockRing', name: '锁精环', emoji: '💍', desc: '震动锁精环', hasControl: true, hasShock: false },
      { id: 'handcuffs', name: '手铐', emoji: '⛓️', desc: '情趣手铐', hasControl: false },
      { id: 'blindfold', name: '眼罩', emoji: '🎭', desc: '丝绸眼罩', hasControl: false },
      { id: 'whip', name: '皮鞭', emoji: '🏇', desc: '轻柔的皮鞭', hasControl: false },
      { id: 'collar', name: '项圈', emoji: '⭕', desc: '精致的项圈', hasControl: false },
      { id: 'candle', name: '低温蜡烛', emoji: '🕯️', desc: '安全的低温蜡烛', hasControl: false },
      { id: 'lingerie', name: '情趣内衣', emoji: '👙', desc: '性感的情趣内衣', hasControl: false }
    ]
  }
};

// 当前选中的分类、礼物和目标
let currentCategory = 'normal';
let selectedGift = null;
let selectedTarget = 'character'; // 'character' 送角色 | 'user' 送用户

// 显示礼物页面
export function showGiftPage() {
  currentCategory = 'normal';
  selectedGift = null;
  selectedTarget = 'character';

  const page = document.getElementById('wechat-gift-page');
  if (page) {
    page.classList.remove('hidden');
    renderGiftContent();
  }
}

// 隐藏礼物页面
export function hideGiftPage() {
  const page = document.getElementById('wechat-gift-page');
  if (page) {
    page.classList.add('hidden');
  }
}

// 渲染礼物内容
function renderGiftContent() {
  const tabsContainer = document.getElementById('wechat-gift-tabs');
  const gridContainer = document.getElementById('wechat-gift-grid');
  const sendBtn = document.getElementById('wechat-gift-send');
  const targetContainer = document.getElementById('wechat-gift-target');

  if (!tabsContainer || !gridContainer) return;

  // 渲染送礼目标选择（仅情趣玩具显示）
  if (targetContainer) {
    if (currentCategory === 'toy') {
      targetContainer.classList.remove('hidden');
      targetContainer.innerHTML = `
        <div class="wechat-gift-target-label">送给谁？</div>
        <div class="wechat-gift-target-options">
          <button class="wechat-gift-target-btn ${selectedTarget === 'character' ? 'active' : ''}" data-target="character">
            ${ICON_GIFT_CHARACTER}
            <span>送角色</span>
          </button>
          <button class="wechat-gift-target-btn ${selectedTarget === 'user' ? 'active' : ''}" data-target="user">
            ${ICON_GIFT_USER}
            <span>送用户</span>
          </button>
        </div>
      `;

      // 绑定目标选择事件
      targetContainer.querySelectorAll('.wechat-gift-target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedTarget = btn.dataset.target;
          renderGiftContent();
        });
      });
    } else {
      targetContainer.classList.add('hidden');
      targetContainer.innerHTML = '';
    }
  }

  // 渲染分类标签
  let tabsHtml = '';
  for (const [key, category] of Object.entries(GIFT_CATEGORIES)) {
    const activeClass = key === currentCategory ? 'active' : '';
    tabsHtml += `<button class="wechat-gift-tab ${activeClass}" data-category="${key}">${category.icon} ${category.name}</button>`;
  }
  tabsContainer.innerHTML = tabsHtml;

  // 绑定标签点击事件
  tabsContainer.querySelectorAll('.wechat-gift-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentCategory = tab.dataset.category;
      selectedGift = null;
      renderGiftContent();
    });
  });

  // 渲染礼物网格
  const category = GIFT_CATEGORIES[currentCategory];
  let gridHtml = '';
  category.items.forEach(item => {
    const selectedClass = selectedGift?.id === item.id ? 'selected' : '';
    const controlBadge = item.hasControl ? '<span class="wechat-gift-control-badge">可控</span>' : '';
    gridHtml += `
      <div class="wechat-gift-item ${selectedClass}" data-gift-id="${item.id}">
        <span class="wechat-gift-emoji">${item.emoji}</span>
        <span class="wechat-gift-name">${item.name}</span>
        ${controlBadge}
      </div>
    `;
  });
  gridContainer.innerHTML = gridHtml;

  // 绑定礼物点击事件
  gridContainer.querySelectorAll('.wechat-gift-item').forEach(item => {
    item.addEventListener('click', () => {
      const giftId = item.dataset.giftId;
      selectedGift = category.items.find(g => g.id === giftId);
      renderGiftContent();
    });
  });

  // 更新发送按钮状态
  if (sendBtn) {
    if (selectedGift) {
      sendBtn.disabled = false;
      sendBtn.textContent = `送出 ${selectedGift.name}`;
    } else {
      sendBtn.disabled = true;
      sendBtn.textContent = '请选择礼物';
    }
  }
}

// 发送礼物
export async function sendGift() {
  if (!selectedGift) {
    showToast('请选择礼物');
    return;
  }

  if (currentChatIndex < 0) {
    showToast('请先打开聊天');
    return;
  }

  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  const gift = selectedGift;
  const isToy = currentCategory === 'toy';
  const target = isToy ? selectedTarget : null;

  // 关闭礼物页面
  hideGiftPage();

  // 获取描述（如果有输入的话）
  const descInput = document.getElementById('wechat-gift-desc');
  const customDesc = descInput?.value?.trim() || '';
  if (descInput) descInput.value = '';

  // 构建礼物消息
  let giftMessage;
  if (isToy) {
    const targetText = target === 'character' ? '送TA' : '送自己';
    giftMessage = `[情趣礼物] ${gift.emoji} ${gift.name}（${targetText}）${customDesc ? ` - ${customDesc}` : ''}`;
  } else {
    giftMessage = `[礼物] ${gift.emoji} ${gift.name}${customDesc ? ` - ${customDesc}` : ''}`;
  }

  // 保存到聊天历史
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const giftRecord = {
    role: 'user',
    content: giftMessage,
    time: timeStr,
    timestamp: Date.now(),
    isGift: true,
    giftInfo: {
      id: gift.id,
      name: gift.name,
      emoji: gift.emoji,
      desc: gift.desc,
      isToy: isToy,
      hasControl: gift.hasControl,
      hasShock: gift.hasShock,
      target: target,
      customDesc: customDesc
    }
  };

  contact.chatHistory.push(giftRecord);

  // 显示礼物消息
  appendGiftMessage('user', gift, isToy, customDesc, contact, target);

  contact.lastMessage = giftMessage;

  // 如果是可控制的情趣玩具，添加到待配送列表
  if (isToy && gift.hasControl) {
    if (!contact.pendingGifts) {
      contact.pendingGifts = [];
    }

    const pendingGift = {
      giftId: gift.id,
      giftName: gift.name,
      giftEmoji: gift.emoji,
      giftDesc: gift.desc,
      target: target,
      hasControl: gift.hasControl,
      hasShock: gift.hasShock || false,
      startMessageCount: contact.chatHistory.length,
      deliveredAt: null,
      isDelivered: false,
      isUsing: false,
      timestamp: Date.now()
    };

    contact.pendingGifts.push(pendingGift);

    // 显示配送中弹窗
    setTimeout(() => {
      showNotificationBanner('快递', '您选择的商品正在配送中~', 4000);
    }, 500);
  }

  requestSave();
  refreshChatList();

  // 显示打字指示器
  showTypingIndicator(contact);

  // 构建给AI的提示
  let aiPrompt;
  if (isToy && gift.hasControl) {
    // 可控制的情趣玩具 - 配送中提示词
    const targetText = target === 'character' ? '你' : '用户';
    aiPrompt = `[系统提示：用户刚刚购买了一个${gift.name}（${gift.desc}），准备送给${targetText}使用。商品正在配送中，预计很快就会送达。${customDesc ? `用户附言：${customDesc}` : ''}

请根据你的角色性格，对这个即将到来的礼物做出反应：
- 如果是送给你的：可以表现出期待、害羞、紧张、好奇等情绪
- 如果是送给用户的：可以表现出好奇、调侃、期待看到用户反应等
- 根据你的人设和与用户的关系，反应可以是含蓄的、热情的、或者假装矜持的
- 可以询问用户打算怎么用、什么时候用等
- 回复不要太短，请展现角色的内心活动和情绪变化

【重要】只能输出纯文字消息，禁止输出任何特殊格式标签]`;
  } else if (isToy) {
    // 不可控制的情趣玩具
    aiPrompt = `[用户送给你一个情趣礼物：${gift.name}（${gift.desc}）${customDesc ? `，附言：${customDesc}` : ''}。请根据你的人设性格对这个礼物做出反应。【重要】只能输出纯文字消息，禁止输出任何特殊格式标签]`;
  } else {
    // 普通礼物
    aiPrompt = `[用户送给你一个礼物：${gift.name}（${gift.desc}）${customDesc ? `，附言：${customDesc}` : ''}。请对这个礼物做出自然的反应。【重要】只能输出纯文字消息，禁止输出任何特殊格式标签]`;
  }

  try {
    const aiResponse = await callAI(contact, aiPrompt);
    hideTypingIndicator();

    if (aiResponse) {
      const aiMessages = splitAIMessages(aiResponse);

      for (const msg of aiMessages) {
        let reply = msg.trim();
        // 过滤掉特殊标签
        reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
        reply = reply.replace(/\[.*?\]/g, '').trim();
        // 过滤括号动作描写
        reply = reply.replace(/（[^）]*）/g, '').trim();
        reply = reply.replace(/\([^)]*\)/g, '').trim();

        if (reply) {
          contact.chatHistory.push({
            role: 'assistant',
            content: reply,
            time: timeStr,
            timestamp: Date.now()
          });
          appendMessage('assistant', reply, contact);
        }
      }

      const lastMsg = aiMessages[aiMessages.length - 1]?.trim()?.replace(/\[.*?\]/g, '').trim();
      if (lastMsg) {
        contact.lastMessage = lastMsg.length > 20 ? lastMsg.substring(0, 20) + '...' : lastMsg;
      }
      requestSave();
      refreshChatList();
    }
  } catch (err) {
    hideTypingIndicator();
    console.error('[可乐] 礼物AI回复失败:', err);
  }
}

// 检查礼物是否送达（在chat.js的消息发送后调用）
export function checkGiftDelivery(contact) {
  if (!contact || !contact.pendingGifts || contact.pendingGifts.length === 0) return;

  const currentCount = contact.chatHistory?.length || 0;

  for (const gift of contact.pendingGifts) {
    // 如果正在使用中，跳过
    if (gift.isUsing) continue;

    // 首次送达检测
    if (!gift.isDelivered && currentCount >= gift.startMessageCount + 25) {
      // 标记送达
      gift.isDelivered = true;
      gift.deliveredAt = Date.now();
      gift.lastAskMessageCount = currentCount; // 记录询问时的消息数

      // 显示送达弹窗
      showNotificationBanner('快递', '您的商品已送达~', 4000);

      // 2秒后弹出询问框
      setTimeout(() => {
        showGiftArrivalModal(gift, contact);
      }, 2000);

      requestSave();
      break; // 一次只处理一个
    }

    // 已送达但点了"稍后"，每隔25条消息再次询问
    if (gift.isDelivered && !gift.isUsing && gift.lastAskMessageCount) {
      if (currentCount >= gift.lastAskMessageCount + 25) {
        gift.lastAskMessageCount = currentCount; // 更新询问时的消息数

        // 显示提醒弹窗
        showNotificationBanner('快递', '您的商品还在等待使用~', 3000);

        // 2秒后再次询问
        setTimeout(() => {
          showGiftArrivalModal(gift, contact);
        }, 2000);

        requestSave();
        break; // 一次只处理一个
      }
    }
  }
}

// 显示礼物送达询问弹窗
export function showGiftArrivalModal(gift, contact) {
  const modal = document.getElementById('wechat-gift-arrival-modal');
  const bodyEl = document.getElementById('wechat-gift-arrival-body');

  if (!modal || !bodyEl) return;

  bodyEl.innerHTML = `您的 <strong>${gift.giftName}</strong> 已送达，您要现在开始玩吗？`;

  // 存储当前礼物信息
  modal.dataset.giftId = gift.giftId;
  modal.dataset.giftTimestamp = gift.timestamp;

  modal.classList.remove('hidden');

  // 绑定按钮事件
  const yesBtn = document.getElementById('wechat-gift-arrival-yes');
  const noBtn = document.getElementById('wechat-gift-arrival-no');

  const handleYes = async () => {
    modal.classList.add('hidden');
    yesBtn.removeEventListener('click', handleYes);
    noBtn.removeEventListener('click', handleNo);

    // 打开玩具控制界面
    const { showToyControlPage } = await import('./toy-control.js');
    showToyControlPage(gift, contact, currentChatIndex);
  };

  const handleNo = () => {
    modal.classList.add('hidden');
    yesBtn.removeEventListener('click', handleYes);
    noBtn.removeEventListener('click', handleNo);

    // 更新消息计数基准，25条后再次询问
    const currentCount = contact.chatHistory?.length || 0;
    gift.lastAskMessageCount = currentCount;
    requestSave();
  };

  yesBtn.addEventListener('click', handleYes);
  noBtn.addEventListener('click', handleNo);
}

// 手动打开已送达礼物的控制界面（从心动瞬间历史记录进入）
export async function openToyControl(gift, contact, contactIndex) {
  const { showToyControlPage } = await import('./toy-control.js');
  showToyControlPage(gift, contact, contactIndex);
}

// 添加礼物消息到界面
export function appendGiftMessage(role, gift, isToy, customDesc, contact, target = null) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';

  // 获取用户头像
  let avatarContent;
  if (role === 'user') {
    const settings = getSettings();
    if (settings.userAvatar) {
      avatarContent = `<img src="${settings.userAvatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='我'">`;
    } else {
      avatarContent = '我';
    }
  } else {
    avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar;
  }

  const giftTypeClass = isToy ? 'wechat-gift-bubble-toy' : '';
  let giftTypeLabel = isToy ? '情趣礼物' : '礼物';
  if (isToy && target) {
    giftTypeLabel = target === 'character' ? '情趣礼物·送TA' : '情趣礼物·送自己';
  }

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-gift-bubble ${giftTypeClass}">
        <div class="wechat-gift-bubble-emoji">${gift.emoji}</div>
        <div class="wechat-gift-bubble-info">
          <div class="wechat-gift-bubble-name">${escapeHtml(gift.name)}</div>
          ${customDesc ? `<div class="wechat-gift-bubble-desc">${escapeHtml(customDesc)}</div>` : ''}
        </div>
        <div class="wechat-gift-bubble-label">${giftTypeLabel}</div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 获取礼物分类数据（供其他模块使用）
export function getGiftCategories() {
  return GIFT_CATEGORIES;
}

// 初始化礼物事件
export function initGiftEvents() {
  // 返回按钮
  document.getElementById('wechat-gift-back')?.addEventListener('click', hideGiftPage);

  // 发送按钮
  document.getElementById('wechat-gift-send')?.addEventListener('click', sendGift);
}