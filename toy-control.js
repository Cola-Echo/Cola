/**
 * 玩具控制界面
 * 类似语音通话的交互模式，支持按钮控制和聊天
 */

import { getSettings, splitAIMessages } from './config.js';
import { requestSave } from './save-manager.js';
import { escapeHtml } from './utils.js';
import { refreshChatList } from './ui.js';
import { callAI } from './ai.js';
import { appendMessage, showTypingIndicator, hideTypingIndicator } from './chat.js';

// SVG图标定义
const TOY_ICONS = {
  classic: `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  start: `<svg viewBox="0 0 24 24" width="28" height="28"><polygon points="5 3 19 12 5 21 5 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  rampage: `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  wave: `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M2 12c2-3 4-6 6-6s4 6 6 6 4-6 6-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 18c2-3 4-6 6-6s4 6 6 6 4-6 6-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="28" height="28"><rect x="6" y="4" width="4" height="16" stroke="currentColor" stroke-width="1.5" fill="none" rx="1"/><rect x="14" y="4" width="4" height="16" stroke="currentColor" stroke-width="1.5" fill="none" rx="1"/></svg>`,
  shock: `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="1.5" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

// 控制模式定义
const TOY_CONTROL_MODES = {
  classic: {
    id: 'classic',
    name: '经典模式',
    icon: TOY_ICONS.classic,
    desc: '稳定持续的震动'
  },
  start: {
    id: 'start',
    name: '开始享受',
    icon: TOY_ICONS.start,
    desc: '开始/继续震动'
  },
  rampage: {
    id: 'rampage',
    name: '一键暴走',
    icon: TOY_ICONS.rampage,
    desc: '最大强度震动'
  },
  wave: {
    id: 'wave',
    name: '波浪模式',
    icon: TOY_ICONS.wave,
    desc: '由弱到强循环'
  },
  pause: {
    id: 'pause',
    name: '暂停',
    icon: TOY_ICONS.pause,
    desc: '暂停震动'
  }
};

// 电击按钮（仅微电流乳链）
const SHOCK_BUTTON = {
  id: 'shock',
  name: '电击',
  icon: TOY_ICONS.shock,
  desc: '触发微电流刺激'
};

// 控制状态
let toyControlState = {
  isActive: false,
  gift: null,
  target: null,
  contact: null,
  contactIndex: -1,
  currentMode: null,
  messages: [],
  activeModes: new Set(),
  sessionStartTime: null
};

// 显示控制界面
export function showToyControlPage(gift, contact, contactIndex) {
  toyControlState = {
    isActive: true,
    gift: gift,
    target: gift.target,
    contact: contact,
    contactIndex: contactIndex,
    currentMode: null,
    messages: [],
    activeModes: new Set(),
    sessionStartTime: Date.now()
  };

  // 标记正在使用
  if (contact.pendingGifts) {
    const pendingGift = contact.pendingGifts.find(g => g.timestamp === gift.timestamp);
    if (pendingGift) {
      pendingGift.isUsing = true;
      requestSave();
    }
  }

  renderToyControlPage();
  bindToyControlEvents();

  const page = document.getElementById('wechat-toy-control-page');
  if (page) {
    page.classList.remove('hidden');
  }

  // AI发起开场白
  setTimeout(() => {
    triggerToyAIGreeting();
  }, 500);
}

// 隐藏控制界面
export function hideToyControlPage() {
  const page = document.getElementById('wechat-toy-control-page');
  if (page) {
    page.classList.add('hidden');
  }

  // 保存心动瞬间记录
  saveToySession();

  // 触发结束后的AI消息（在主聊天中）
  triggerToyEndMessage();

  toyControlState.isActive = false;
}

// 渲染控制界面
function renderToyControlPage() {
  const titleEl = document.getElementById('wechat-toy-control-title');
  const buttonsEl = document.getElementById('wechat-toy-control-buttons');
  const shockRowEl = document.getElementById('wechat-toy-shock-row');
  const messagesEl = document.getElementById('wechat-toy-control-messages');

  if (titleEl) {
    const targetText = toyControlState.target === 'character' ? 'TA在用' : '你在用';
    titleEl.textContent = `${toyControlState.gift.giftName} · ${targetText}`;
  }

  // 渲染按钮
  if (buttonsEl) {
    let buttonsHtml = `
      <div class="wechat-toy-btn-row">
        <button class="wechat-toy-btn" data-mode="classic">
          ${TOY_CONTROL_MODES.classic.icon}
          <span class="wechat-toy-btn-label">${TOY_CONTROL_MODES.classic.name}</span>
        </button>
        <button class="wechat-toy-btn" data-mode="start">
          ${TOY_CONTROL_MODES.start.icon}
          <span class="wechat-toy-btn-label">${TOY_CONTROL_MODES.start.name}</span>
        </button>
        <button class="wechat-toy-btn" data-mode="rampage">
          ${TOY_CONTROL_MODES.rampage.icon}
          <span class="wechat-toy-btn-label">${TOY_CONTROL_MODES.rampage.name}</span>
        </button>
      </div>
      <div class="wechat-toy-btn-row">
        <button class="wechat-toy-btn" data-mode="wave">
          ${TOY_CONTROL_MODES.wave.icon}
          <span class="wechat-toy-btn-label">${TOY_CONTROL_MODES.wave.name}</span>
        </button>
        <button class="wechat-toy-btn" data-mode="pause">
          ${TOY_CONTROL_MODES.pause.icon}
          <span class="wechat-toy-btn-label">${TOY_CONTROL_MODES.pause.name}</span>
        </button>
      </div>
    `;
    buttonsEl.innerHTML = buttonsHtml;
  }

  // 电击按钮（仅微电流乳链显示）
  if (shockRowEl) {
    if (toyControlState.gift.hasShock) {
      shockRowEl.classList.remove('hidden');
      shockRowEl.innerHTML = `
        <button class="wechat-toy-btn wechat-toy-btn-shock" data-mode="shock">
          ${SHOCK_BUTTON.icon}
          <span class="wechat-toy-btn-label">${SHOCK_BUTTON.name}</span>
        </button>
      `;
    } else {
      shockRowEl.classList.add('hidden');
    }
  }

  // 清空消息
  if (messagesEl) {
    messagesEl.innerHTML = '';
  }
}

// 绑定事件
let toyEventsBound = false;
function bindToyControlEvents() {
  if (toyEventsBound) return;
  toyEventsBound = true;

  // 返回按钮
  document.getElementById('wechat-toy-control-back')?.addEventListener('click', hideToyControlPage);

  // 发送消息
  document.getElementById('wechat-toy-control-send')?.addEventListener('click', sendToyMessage);

  // 输入框回车发送
  document.getElementById('wechat-toy-control-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendToyMessage();
    }
  });

  // 按钮点击事件（使用事件委托）
  document.getElementById('wechat-toy-control-buttons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.wechat-toy-btn');
    if (btn) {
      const mode = btn.dataset.mode;
      if (mode) {
        onButtonPress(mode, 'user');
      }
    }
  });

  document.getElementById('wechat-toy-shock-row')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.wechat-toy-btn');
    if (btn) {
      const mode = btn.dataset.mode;
      if (mode) {
        onButtonPress(mode, 'user');
      }
    }
  });
}

// 按钮点击处理
async function onButtonPress(buttonId, pressedBy = 'user') {
  if (!toyControlState.isActive) return;

  const button = TOY_CONTROL_MODES[buttonId] || (buttonId === 'shock' ? SHOCK_BUTTON : null);
  if (!button) return;

  // 更新按钮状态（变深色）
  updateButtonState(buttonId);

  // 显示typing
  showToyTypingIndicator();

  // 构建提示词
  const prompt = buildButtonPressPrompt(buttonId, button.name, pressedBy);

  try {
    const response = await callToyAI(prompt);
    hideToyTypingIndicator();

    if (response) {
      await processAIResponse(response);
    }
  } catch (err) {
    hideToyTypingIndicator();
    console.error('[可乐] 玩具控制AI回复失败:', err);
  }
}

// 更新按钮状态
function updateButtonState(buttonId) {
  // 暂停按钮清除所有激活状态
  if (buttonId === 'pause') {
    toyControlState.activeModes.clear();
  } else if (buttonId !== 'shock') {
    // 电击是一次性的，不保持激活状态
    // 其他模式切换
    toyControlState.activeModes.clear();
    toyControlState.activeModes.add(buttonId);
  }
  toyControlState.currentMode = buttonId;

  // 更新UI
  document.querySelectorAll('.wechat-toy-btn').forEach(btn => {
    const mode = btn.dataset.mode;
    if (toyControlState.activeModes.has(mode)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 构建按钮按下提示词
function buildButtonPressPrompt(buttonId, buttonName, pressedBy) {
  const isCharacterUsing = toyControlState.target === 'character';
  const isAIPress = pressedBy === 'ai';

  const modeEffects = {
    classic: '稳定持续的震动开始了',
    start: '震动开始/继续了',
    rampage: '震动突然变到最大强度，非常强烈的刺激袭来',
    wave: '震动开始由弱到强循环变化，一波一波的刺激',
    pause: '震动停止了，可以喘息一下',
    shock: '一阵微电流刺激瞬间传来，让人猛地一颤'
  };

  let prompt;

  if (isAIPress) {
    // AI主动按按钮的情况
    prompt = `[你主动按下了"${buttonName}"按钮]

效果：${modeEffects[buttonId]}

`;
    if (isCharacterUsing) {
      prompt += `你主动切换了${toyControlState.gift.giftName}的模式，请描述你主动调整后的反应：
- 为什么要主动切换这个模式（想要更多刺激/受不了想暂停/想换个感觉等）
- 切换后的身体感受和情绪变化
- 回复要有情感细节，符合你的角色性格`;
    } else {
      prompt += `你主动控制了用户正在使用的${toyControlState.gift.giftName}，请描述你主动操作后的感受：
- 为什么要主动给用户切换这个模式（想折磨对方/想看对方的反应/调侃等）
- 可以调侃、挑逗用户
- 回复要有趣，符合你的角色性格`;
    }
  } else {
    // 用户按按钮的情况
    prompt = `[用户按下了"${buttonName}"按钮]

效果：${modeEffects[buttonId]}

`;
    if (isCharacterUsing) {
      prompt += `你正在使用${toyControlState.gift.giftName}，请根据这个刺激变化做出反应。
描述你的身体感受、情绪变化。回复要有情感细节，符合你的角色性格。`;
    } else {
      prompt += `用户正在使用${toyControlState.gift.giftName}，你在观察。
请描述你观察到的用户可能的反应，可以调侃、鼓励或挑逗。回复要有趣，符合你的角色性格。`;
    }
  }

  prompt += `

【重要规则】
1. 只能输出纯文字，禁止使用任何特殊格式标签
2. 禁止使用小括号描述动作如（xxx）
3. 禁止使用[语音:xxx]、[照片:xxx]、[表情:xxx]等格式
4. 直接输出角色说的话和感受`;

  return prompt;
}

// 发送聊天消息
async function sendToyMessage() {
  const input = document.getElementById('wechat-toy-control-input');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;
  if (!toyControlState.isActive) return;

  input.value = '';

  // 添加用户消息
  addToyMessage('user', message);

  // 显示typing
  showToyTypingIndicator();

  // 构建聊天提示词
  const prompt = buildChatPrompt(message);

  try {
    const response = await callToyAI(prompt);
    hideToyTypingIndicator();

    if (response) {
      await processAIResponse(response);
    }
  } catch (err) {
    hideToyTypingIndicator();
    console.error('[可乐] 玩具控制聊天AI回复失败:', err);
  }
}

// 构建聊天提示词
function buildChatPrompt(userMessage) {
  const isCharacterUsing = toyControlState.target === 'character';
  const currentModeText = toyControlState.currentMode
    ? (TOY_CONTROL_MODES[toyControlState.currentMode]?.name || '已暂停')
    : '未开始';

  let prompt = `[玩具控制场景聊天]
当前状态：${isCharacterUsing ? '你' : '用户'}正在使用${toyControlState.gift.giftName}
当前模式：${currentModeText}

用户说：${userMessage}

请根据当前场景和你的角色性格回复。`;

  if (isCharacterUsing) {
    prompt += `
你是使用者，可能正在承受刺激，回复时要体现身体状态和情绪。`;
  } else {
    prompt += `
你是观察者，用户正在使用玩具，你可以调侃、鼓励或挑逗。`;
  }

  prompt += `

【AI可以主动按按钮】
如果你想主动控制玩具，可以在回复末尾加上 [按下:按钮名]
可用按钮：经典模式、开始享受、一键暴走、波浪模式、暂停${toyControlState.gift.hasShock ? '、电击' : ''}
例如：[按下:暴走] 或 [按下:暂停]

什么时候AI应该按按钮：
${isCharacterUsing
  ? '- 如果你受不了了，可以偷偷按暂停\n- 如果你想要更多刺激，可以自己切换模式'
  : '- 如果你想折磨用户，可以突然按暴走\n- 如果用户表现太淡定，你可以加大力度'}

【重要规则】
1. 只能输出纯文字，禁止使用任何特殊格式标签
2. 禁止使用小括号描述动作如（xxx）
3. 禁止使用[语音:xxx]、[照片:xxx]、[表情:xxx]等格式
4. 按按钮指令[按下:xxx]必须放在回复末尾，且是可选的`;

  return prompt;
}

// 调用AI（玩具控制专用）
async function callToyAI(prompt) {
  if (!toyControlState.contact) return null;

  // 构建历史消息
  const historyMessages = toyControlState.messages.slice(-10).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  return await callAI(toyControlState.contact, prompt, historyMessages);
}

// 辅助函数：延迟
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 处理AI回复（检测是否有按按钮指令）
async function processAIResponse(response) {
  if (!response) return;

  // 分割多条消息
  const parts = splitAIMessages(response);

  for (let i = 0; i < parts.length; i++) {
    let reply = parts[i].trim();

    // 过滤特殊标签
    reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();

    // 检测 [按下:xxx] 格式
    const buttonMatch = reply.match(/\[按下[：:](.+?)\]/);
    if (buttonMatch) {
      const buttonName = buttonMatch[1].trim();
      // 移除指令文本
      reply = reply.replace(/\[按下[：:].+?\]/g, '').trim();

      // 过滤其他标签和括号
      reply = reply.replace(/\[.*?\]/g, '').trim();
      reply = reply.replace(/（[^）]*）/g, '').trim();
      reply = reply.replace(/\([^)]*\)/g, '').trim();

      // 如果不是第一条消息，显示typing并延迟
      if (i > 0 && reply) {
        showToyTypingIndicator();
        await sleep(1500 + Math.random() * 1000); // 1.5-2.5秒延迟
        hideToyTypingIndicator();
      }

      // 添加AI消息
      if (reply) {
        addToyMessage('ai', reply);
      }

      // AI按下按钮
      setTimeout(() => {
        const buttonId = findButtonIdByName(buttonName);
        if (buttonId) {
          onButtonPress(buttonId, 'ai');
        }
      }, 800);
    } else {
      // 过滤标签和括号
      reply = reply.replace(/\[.*?\]/g, '').trim();
      reply = reply.replace(/（[^）]*）/g, '').trim();
      reply = reply.replace(/\([^)]*\)/g, '').trim();

      // 如果不是第一条消息，显示typing并延迟
      if (i > 0 && reply) {
        showToyTypingIndicator();
        await sleep(1500 + Math.random() * 1000); // 1.5-2.5秒延迟
        hideToyTypingIndicator();
      }

      if (reply) {
        addToyMessage('ai', reply);
      }
    }
  }
}

// 根据按钮名称查找ID
function findButtonIdByName(name) {
  const nameMap = {
    '经典模式': 'classic',
    '经典': 'classic',
    '开始享受': 'start',
    '开始': 'start',
    '一键暴走': 'rampage',
    '暴走': 'rampage',
    '波浪模式': 'wave',
    '波浪': 'wave',
    '暂停': 'pause',
    '电击': 'shock'
  };
  return nameMap[name] || null;
}

// AI开场白
async function triggerToyAIGreeting() {
  if (!toyControlState.isActive) return;

  showToyTypingIndicator();

  const isCharacterUsing = toyControlState.target === 'character';

  let prompt;
  if (isCharacterUsing) {
    prompt = `[玩具控制场景开始]
用户刚刚打开了${toyControlState.gift.giftName}的控制界面，这个玩具是给你用的。
玩具还没有开始运作，用户正准备控制它。

请根据你的角色性格，对即将开始的事情做出反应：
- 可以表现出期待、紧张、害羞、兴奋等情绪
- 可以说一些挑逗或撒娇的话
- 让用户知道你准备好了

【重要规则】
1. 只能输出纯文字，禁止使用任何特殊格式标签
2. 禁止使用小括号描述动作如（xxx）
3. 禁止使用[语音:xxx]、[照片:xxx]、[表情:xxx]等格式`;
  } else {
    prompt = `[玩具控制场景开始]
用户刚刚打开了${toyControlState.gift.giftName}的控制界面，这个玩具是用户自己用的。
玩具还没有开始运作，用户正准备使用它。

请根据你的角色性格，对这个场景做出反应：
- 可以表现出好奇、期待、调侃等情绪
- 可以挑逗用户或表示想要控制
- 让对话变得有趣

【重要规则】
1. 只能输出纯文字，禁止使用任何特殊格式标签
2. 禁止使用小括号描述动作如（xxx）
3. 禁止使用[语音:xxx]、[照片:xxx]、[表情:xxx]等格式`;
  }

  try {
    const response = await callToyAI(prompt);
    hideToyTypingIndicator();

    if (response) {
      await processAIResponse(response);
    }
  } catch (err) {
    hideToyTypingIndicator();
    console.error('[可乐] 玩具控制开场白失败:', err);
  }
}

// 显示typing指示器
function showToyTypingIndicator() {
  const messagesEl = document.getElementById('wechat-toy-control-messages');
  if (!messagesEl) return;

  hideToyTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-toy-control-msg ai';
  typingDiv.id = 'wechat-toy-control-typing';
  typingDiv.innerHTML = `
    <div class="wechat-message-bubble wechat-typing">
      <span class="wechat-typing-dot"></span>
      <span class="wechat-typing-dot"></span>
      <span class="wechat-typing-dot"></span>
    </div>
  `;

  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 隐藏typing指示器
function hideToyTypingIndicator() {
  const typingEl = document.getElementById('wechat-toy-control-typing');
  if (typingEl) {
    typingEl.remove();
  }
}

// 添加消息
function addToyMessage(role, content) {
  const messagesEl = document.getElementById('wechat-toy-control-messages');
  if (!messagesEl) return;

  // 添加到状态
  toyControlState.messages.push({ role, content, timestamp: Date.now() });

  // 创建消息元素
  const msgDiv = document.createElement('div');
  msgDiv.className = `wechat-toy-control-msg ${role} fade-in`;
  msgDiv.textContent = content;

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 保存心动瞬间记录
function saveToySession() {
  if (!toyControlState.contact || toyControlState.messages.length === 0) return;

  const contact = toyControlState.contact;

  // 初始化心动瞬间历史
  if (!contact.toyHistory) {
    contact.toyHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // 计算时长
  const durationMs = Date.now() - (toyControlState.sessionStartTime || Date.now());
  const durationSec = Math.floor(durationMs / 1000);
  const minutes = Math.floor(durationSec / 60).toString().padStart(2, '0');
  const seconds = (durationSec % 60).toString().padStart(2, '0');
  const durationStr = `${minutes}:${seconds}`;

  const session = {
    gift: {
      id: toyControlState.gift.giftId,
      name: toyControlState.gift.giftName,
      emoji: toyControlState.gift.giftEmoji
    },
    target: toyControlState.target,
    time: timeStr,
    timestamp: toyControlState.sessionStartTime || Date.now(),
    duration: durationStr,
    messages: toyControlState.messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  };

  contact.toyHistory.push(session);

  // 标记不再使用
  if (contact.pendingGifts) {
    const pendingGift = contact.pendingGifts.find(g => g.timestamp === toyControlState.gift.timestamp);
    if (pendingGift) {
      pendingGift.isUsing = false;
    }
  }

  requestSave();
  refreshChatList();
}

// 获取控制状态（供外部使用）
export function getToyControlState() {
  return toyControlState;
}

// 检查是否在玩具控制界面
export function isInToyControl() {
  return toyControlState.isActive;
}

// 触发结束后的AI消息（发到主聊天）
async function triggerToyEndMessage() {
  const contact = toyControlState.contact;
  if (!contact || toyControlState.messages.length === 0) return;

  const isCharacterUsing = toyControlState.target === 'character';
  const giftName = toyControlState.gift?.giftName || '玩具';

  // 计算时长
  const durationMs = Date.now() - (toyControlState.sessionStartTime || Date.now());
  const durationSec = Math.floor(durationMs / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

  // 构建结束提示词
  let prompt;
  if (isCharacterUsing) {
    prompt = `[玩具控制已结束]
刚才你使用${giftName}，持续了${durationText}，现在结束了。

请在主聊天中发送一条消息，表达结束后的感受：
- 可以表现出意犹未尽、满足、疲惫、害羞等情绪
- 可以撒娇、调侃用户、或说一些亲密的话
- 回复要自然，符合你的角色性格

【重要规则】
1. 只能输出纯文字，禁止使用任何特殊格式标签
2. 禁止使用小括号描述动作如（xxx）
3. 禁止使用[语音:xxx]、[照片:xxx]、[表情:xxx]等格式
4. 可以用 ||| 分隔多条消息`;
  } else {
    prompt = `[玩具控制已结束]
刚才用户使用${giftName}，你在旁边观看/控制，持续了${durationText}，现在结束了。

请在主聊天中发送一条消息，对这次体验发表评论：
- 可以调侃用户的反应
- 可以表达满意或期待下次
- 回复要有趣，符合你的角色性格

【重要规则】
1. 只能输出纯文字，禁止使用任何特殊格式标签
2. 禁止使用小括号描述动作如（xxx）
3. 禁止使用[语音:xxx]、[照片:xxx]、[表情:xxx]等格式
4. 可以用 ||| 分隔多条消息`;
  }

  // 显示打字指示器
  showTypingIndicator(contact);

  try {
    const response = await callAI(contact, prompt);
    hideTypingIndicator();

    if (response) {
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

      const aiMessages = splitAIMessages(response);

      for (const msg of aiMessages) {
        let reply = msg.trim();
        // 过滤特殊标签
        reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
        reply = reply.replace(/\[.*?\]/g, '').trim();
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
    console.error('[可乐] 玩具结束消息失败:', err);
  }
}
