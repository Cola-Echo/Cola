/**
 * 角色主动发消息系统
 * 规则：每2-3轮随机触发，保底4轮必触发
 */

import { requestSave } from './save-manager.js';
import { getSettings, splitAIMessages } from './config.js';
import { refreshChatList } from './ui.js';
import { showNotificationBanner } from './toast.js';
import { buildSystemPrompt } from './ai.js';

// 配置
const CONFIG = {
  minRounds: 2,           // 最少2轮后可触发
  maxRounds: 3,           // 随机2-3轮
  guaranteeRounds: 4,     // 保底4轮必触发
  cooldownMs: 30 * 1000,  // 30秒冷却防止刷屏
  groupEmotionChance: 0.3 // 群聊情绪触发概率30%
};

/**
 * 生成随机阈值 (2-3)
 */
function randomThreshold() {
  return CONFIG.minRounds + Math.floor(Math.random() * (CONFIG.maxRounds - CONFIG.minRounds + 1));
}

/**
 * 格式化时间字符串
 */
function formatTimeStr(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * 发送主动消息
 * @param {object} contact - 联系人对象
 * @param {string} type - 消息类型：'daily' | 'angry_private' | 'want_private'
 * @param {Array} groupContext - 群聊上下文（可选，用于群聊触发的私聊）
 */
async function sendProactiveMessage(contact, type = 'daily', groupContext = []) {
  const prompts = {
    // 日常主动消息
    daily: `[你现在要主动给用户发一条消息。可以是：
1. 分享你正在做的事情
2. 想起用户了，打个招呼
3. 看到什么有趣的东西想分享
4. 撒娇或关心用户
根据你的性格和当前心情，发1-2条简短消息，像真实聊天一样自然。]`,

    // 群聊生气后私下发
    angry_private: `[你刚才在群聊里和用户有些不愉快，现在想私下和用户说点什么。
可以是：生气、委屈、想解释、想和好，或者继续吵。
根据你的性格决定态度，发1-2条消息。]`,

    // 群聊中想私聊
    want_private: `[你在群聊里聊到一些话题，想私下单独和用户聊点事情。
发一条消息说明原因，像"有件事想单独跟你说"这样自然的开场。]`,
  };

  try {
    // 如果是群聊触发的私聊，需要特殊处理
    if ((type === 'angry_private' || type === 'want_private') && groupContext.length > 0) {
      // 使用带群聊上下文的 AI 调用
      const response = await callAIWithGroupContext(contact, prompts[type], groupContext);
      await processProactiveResponse(contact, response, type);
    } else {
      // 普通主动消息，使用标准 callAI
      const { callAI } = await import('./ai.js');
      const response = await callAI(contact, prompts[type] || prompts.daily);
      await processProactiveResponse(contact, response, type);
    }
  } catch (err) {
    console.error('[可乐] 主动消息发送失败:', err);
  }
}

/**
 * 处理主动消息的响应
 */
async function processProactiveResponse(contact, response, type) {
  const messages = splitAIMessages(response);
  const now = new Date();
  const timeStr = formatTimeStr(now);

  if (!contact.chatHistory) contact.chatHistory = [];

  for (const msg of messages) {
    const content = msg.trim();
    if (!content) continue;

    contact.chatHistory.push({
      role: 'assistant',
      content: content,
      time: timeStr,
      timestamp: Date.now(),
      isProactive: true  // 标记为主动消息
    });

    contact.unreadCount = (contact.unreadCount || 0) + 1;
    contact.lastMessage = content;
  }

  requestSave();
  refreshChatList();

  // 显示通知横幅
  const previewText = messages[0]?.substring(0, 15) || '';
  showNotificationBanner('微信', `${contact.name}: ${previewText}${previewText.length >= 15 ? '...' : ''}`);

  console.log(`[可乐] ${contact.name} 主动发消息 (${type})`);
}

/**
 * 带群聊上下文的 AI 调用
 * 用于群聊触发的私聊，确保AI知道群里发生了什么
 * @param {object} contact - 联系人对象
 * @param {string} userMessage - 用户消息（提示词）
 * @param {Array} groupContext - 群聊上下文
 */
async function callAIWithGroupContext(contact, userMessage, groupContext) {
  const { getApiConfig, fetchWithRetry, formatApiError } = await import('./ai.js');
  const settings = getSettings();

  // 获取 API 配置
  let apiUrl, apiKey, apiModel;
  if (contact.useCustomApi) {
    apiUrl = contact.customApiUrl || '';
    apiKey = contact.customApiKey || '';
    apiModel = contact.customModel || '';
    const globalConfig = getApiConfig();
    if (!apiUrl) apiUrl = globalConfig.url;
    if (!apiKey) apiKey = globalConfig.key;
    if (!apiModel) apiModel = globalConfig.model;
  } else {
    const globalConfig = getApiConfig();
    apiUrl = globalConfig.url;
    apiKey = globalConfig.key;
    apiModel = globalConfig.model;
  }

  if (!apiUrl) throw new Error('请先配置 API 地址');
  if (!apiModel) throw new Error('请先选择模型');

  // 构建系统提示词（包含用户设定和世界书）
  const systemPrompt = buildSystemPrompt(contact);

  // 构建消息数组
  const messages = [{ role: 'system', content: systemPrompt }];

  // 添加群聊上下文（作为背景信息）
  if (groupContext.length > 0) {
    // 将群聊上下文格式化为一条系统消息
    const groupContextText = groupContext.map(msg => {
      const sender = msg.characterName || (msg.role === 'user' ? '用户' : '未知');
      return `${sender}: ${msg.content}`;
    }).join('\n');

    messages.push({
      role: 'user',
      content: `[以下是刚才群聊中的对话记录，你需要根据这些内容来决定私聊时说什么]\n\n${groupContextText}\n\n[群聊记录结束]`
    });
    messages.push({
      role: 'assistant',
      content: '好的，我已经了解了群聊中发生的事情。'
    });
  }

  // 添加私聊历史记录（最近10条，让AI知道私聊的上下文）
  const chatHistory = contact.chatHistory || [];
  const recentPrivateHistory = chatHistory.slice(-10);
  recentPrivateHistory.forEach(msg => {
    if (msg.isMarker) return;
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  });

  // 添加当前提示词
  messages.push({ role: 'user', content: userMessage });

  // 调用 API
  const chatUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetchWithRetry(
    chatUrl,
    {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: apiModel,
        messages: messages,
        temperature: 1,
        max_tokens: 8196
      })
    },
    { maxRetries: 3 }
  );

  if (!response.ok) {
    throw new Error(await formatApiError(response, { retries: 0 }));
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '...';
}

/**
 * 用户发消息后调用，检查其他联系人是否要主动发消息
 * @param {string} currentContactId - 当前聊天的联系人ID
 */
export async function checkOtherContactsProactive(currentContactId) {
  const settings = getSettings();

  for (const contact of settings.contacts) {
    // 跳过当前聊天的联系人
    if (contact.id === currentContactId) continue;
    // 跳过被拉黑的
    if (contact.isBlocked) continue;
    // 跳过没有聊过天的（避免陌生人突然发消息）
    if (!contact.chatHistory || contact.chatHistory.length === 0) continue;

    // 初始化计数器
    if (typeof contact.proactiveCounter !== 'number') {
      contact.proactiveCounter = 0;
      contact.proactiveThreshold = randomThreshold();
    }

    // 递增计数
    contact.proactiveCounter++;

    // 检查是否触发
    const shouldTrigger =
      contact.proactiveCounter >= CONFIG.guaranteeRounds ||  // 保底4轮
      contact.proactiveCounter >= contact.proactiveThreshold; // 随机阈值

    if (!shouldTrigger) continue;

    // 检查冷却时间
    if (Date.now() - (contact.lastProactiveAt || 0) < CONFIG.cooldownMs) {
      continue;
    }

    // 重置计数器和阈值
    contact.proactiveCounter = 0;
    contact.proactiveThreshold = randomThreshold();
    contact.lastProactiveAt = Date.now();

    // 触发主动消息
    await sendProactiveMessage(contact, 'daily');
  }

  requestSave();
}

/**
 * 群聊中检测到情绪后调用
 * @param {string} contactId - 联系人ID
 * @param {string} emotionType - 情绪类型：'negative' | 'want_private'
 * @param {Array} groupContext - 群聊上下文（最近40条消息）
 */
export async function triggerProactiveFromGroup(contactId, emotionType, groupContext = []) {
  const settings = getSettings();
  const contact = settings.contacts.find(c => c.id === contactId);

  if (!contact || contact.isBlocked) return;

  // 检查冷却
  if (Date.now() - (contact.lastProactiveAt || 0) < CONFIG.cooldownMs) {
    return;
  }

  // 群聊情绪触发有独立的概率
  if (Math.random() > CONFIG.groupEmotionChance) {
    console.log(`[可乐] ${contact.name} 群聊情绪触发未命中概率 (${CONFIG.groupEmotionChance * 100}%)`);
    return;
  }

  contact.lastProactiveAt = Date.now();
  requestSave();

  // 立即发送，传递群聊上下文
  const messageType = emotionType === 'negative' ? 'angry_private' : 'want_private';
  console.log(`[可乐] ${contact.name} 群聊情绪触发私聊 (${messageType})，群聊上下文 ${groupContext.length} 条`);
  await sendProactiveMessage(contact, messageType, groupContext);
}

/**
 * 重置某个联系人的主动消息计数器
 * @param {string} contactId - 联系人ID
 */
export function resetProactiveCounter(contactId) {
  const settings = getSettings();
  const contact = settings.contacts.find(c => c.id === contactId);

  if (contact) {
    contact.proactiveCounter = 0;
    contact.proactiveThreshold = randomThreshold();
    requestSave();
  }
}

export { sendProactiveMessage };
