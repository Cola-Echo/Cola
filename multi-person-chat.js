/**
 * 多人群聊模块
 * 特点：无头像，名字+气泡，左对齐，世界观注入
 */

import { requestSave, saveNow } from './save-manager.js';
import { getSettings } from './config.js';
import { showToast } from './toast.js';
import { escapeHtml, sleep, formatMessageTime } from './utils.js';
import { refreshChatList } from './ui.js';

// 当前多人群聊索引
export let currentMultiPersonChatIndex = -1;

// 设置当前多人群聊索引
export function setCurrentMultiPersonChatIndex(index) {
  currentMultiPersonChatIndex = index;
}

// 打开多人群聊
export function openMultiPersonChat(chatIndex) {
  console.log('[可乐] openMultiPersonChat 被调用, chatIndex:', chatIndex);
  const settings = getSettings();
  const chat = settings.multiPersonChats?.[chatIndex];
  if (!chat) return;

  currentMultiPersonChatIndex = chatIndex;

  // 确保 chatHistory 存在
  if (!chat.chatHistory) chat.chatHistory = [];

  // 隐藏主页，显示聊天页
  document.getElementById('wechat-main-content')?.classList.add('hidden');
  document.getElementById('wechat-chat-page')?.classList.remove('hidden');
  document.getElementById('wechat-chat-title').textContent = `${chat.name}(${chat.members.length})`;

  const messagesContainer = document.getElementById('wechat-chat-messages');
  const chatHistory = chat.chatHistory;

  if (chatHistory.length === 0) {
    messagesContainer.innerHTML = '';
  } else {
    messagesContainer.innerHTML = renderMultiPersonChatHistory(chat, chatHistory);
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 标记当前是多人群聊模式
  messagesContainer.dataset.isMultiPerson = 'true';
  messagesContainer.dataset.multiPersonIndex = chatIndex;
  messagesContainer.dataset.isGroup = 'false';  // 区别于普通群聊
}

// 渲染多人群聊历史记录
function renderMultiPersonChatHistory(chat, chatHistory) {
  let html = '';
  let lastTimestamp = 0;
  const TIME_GAP_THRESHOLD = 5 * 60 * 1000;

  chatHistory.forEach((msg, index) => {
    const msgTimestamp = msg.timestamp || 0;

    // 时间戳显示
    if (index === 0 || (msgTimestamp - lastTimestamp > TIME_GAP_THRESHOLD)) {
      const timeLabel = formatMessageTime(msgTimestamp);
      if (timeLabel) {
        html += `<div class="wechat-msg-time">${timeLabel}</div>`;
      }
    }
    lastTimestamp = msgTimestamp;

    if (msg.role === 'user') {
      // 用户消息：右对齐，有气泡
      html += `
        <div class="wechat-message self">
          <div class="wechat-message-content">
            <div class="wechat-message-bubble">${escapeHtml(msg.content)}</div>
          </div>
        </div>
      `;
    } else {
      // 角色消息：无头像，名字+气泡，左对齐
      const charName = msg.characterName || '未知';
      html += `
        <div class="wechat-message wechat-mp-message">
          <div class="wechat-message-content">
            <div class="wechat-mp-sender">${escapeHtml(charName)}</div>
            <div class="wechat-message-bubble">${escapeHtml(msg.content)}</div>
          </div>
        </div>
      `;
    }
  });

  return html;
}

// 追加多人群聊消息到界面
export function appendMultiPersonMessage(role, content, characterName = null) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');

  if (role === 'user') {
    messageDiv.className = 'wechat-message self';
    messageDiv.innerHTML = `
      <div class="wechat-message-content">
        <div class="wechat-message-bubble">${escapeHtml(content)}</div>
      </div>
    `;
  } else {
    messageDiv.className = 'wechat-message wechat-mp-message';
    messageDiv.innerHTML = `
      <div class="wechat-message-content">
        <div class="wechat-mp-sender">${escapeHtml(characterName || '未知')}</div>
        <div class="wechat-message-bubble">${escapeHtml(content)}</div>
      </div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 显示多人群聊打字指示器
export function showMultiPersonTypingIndicator(characterName) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  hideMultiPersonTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-message wechat-mp-message wechat-typing-wrapper';
  typingDiv.id = 'wechat-mp-typing-indicator';

  typingDiv.innerHTML = `
    <div class="wechat-message-content">
      <div class="wechat-mp-sender">${escapeHtml(characterName || '...')}</div>
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

// 隐藏多人群聊打字指示器
export function hideMultiPersonTypingIndicator() {
  const indicator = document.getElementById('wechat-mp-typing-indicator');
  if (indicator) indicator.remove();
}

// 构建多人群聊系统提示词
function buildMultiPersonSystemPrompt(chat, respondingMembers) {
  const settings = getSettings();
  let systemPrompt = '';

  // 世界观（必读）
  if (chat.worldView) {
    systemPrompt += `【世界观设定】\n${chat.worldView}\n\n`;
  }

  // 参与角色信息
  systemPrompt += `【参与角色】\n`;
  systemPrompt += `这是一个包含 ${chat.members.length} 位角色的多人对话场景。\n\n`;

  chat.members.forEach((member, idx) => {
    systemPrompt += `角色 ${idx + 1}: ${member.name}\n`;
    if (member.gender) systemPrompt += `  性别: ${member.gender}\n`;
    if (member.age) systemPrompt += `  年龄: ${member.age}\n`;
    if (member.description) systemPrompt += `  描述: ${member.description}\n`;
    systemPrompt += '\n';
  });

  // 本轮回复的角色
  if (respondingMembers && respondingMembers.length > 0) {
    systemPrompt += `【本轮发言角色】\n`;
    systemPrompt += `本轮需要以下角色发言：${respondingMembers.map(m => m.name).join('、')}\n\n`;
  }

  // 回复格式说明
  systemPrompt += `【回复格式】
你需要模拟多位角色的对话。请按以下格式回复：

[角色名]: 对话内容

如果有多个角色发言，请用 ||| 分隔每条消息。

示例：
[${chat.members[0]?.name || '角色A'}]: 你好啊 ||| [${chat.members[1]?.name || '角色B'}]: 嗨，好久不见

规则：
1. 每个角色保持自己的性格特点
2. 对话要自然流畅，像真实聊天
3. 每条消息简短自然（1-3句话）
4. 可以使用表情符号
5. 角色之间可以互相回应、互动
`;

  return systemPrompt;
}

// 选择本轮回复的角色（3-5人）
function selectRespondingMembers(chat, userMessage) {
  const members = chat.members || [];
  const totalMembers = members.length;

  // 根据群成员数量决定每轮回复人数
  let respondCount;
  if (totalMembers <= 5) {
    // 5人及以下，全部回复
    respondCount = totalMembers;
  } else if (totalMembers <= 10) {
    // 6-10人，每轮3-5人
    respondCount = Math.min(5, Math.max(3, Math.floor(totalMembers * 0.5)));
  } else {
    // 10人以上，每轮5人
    respondCount = 5;
  }

  // 随机打乱成员顺序
  const shuffled = [...members].sort(() => Math.random() - 0.5);

  // 取前 respondCount 个
  return shuffled.slice(0, respondCount);
}

// 调用多人群聊 AI
async function callMultiPersonAI(chat, userMessage, respondingMembers) {
  const settings = getSettings();

  // 使用全局 API 配置
  const apiUrl = settings.apiUrl;
  const apiKey = settings.apiKey;
  const apiModel = settings.selectedModel;

  if (!apiUrl || !apiModel) {
    throw new Error('请先配置 AI 接口');
  }

  const systemPrompt = buildMultiPersonSystemPrompt(chat, respondingMembers);

  const messages = [{ role: 'system', content: systemPrompt }];

  // 添加历史消息
  const chatHistory = chat.chatHistory || [];
  const recentHistory = chatHistory.slice(-50);
  recentHistory.forEach(msg => {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else {
      const formattedContent = msg.characterName
        ? `[${msg.characterName}]: ${msg.content}`
        : msg.content;
      messages.push({ role: 'assistant', content: formattedContent });
    }
  });

  messages.push({ role: 'user', content: userMessage });

  const chatUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: apiModel,
      messages,
      temperature: 1,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errorText.substring(0, 100)}`);
  }

  const data = await response.json();
  const rawResponse = data.choices?.[0]?.message?.content || '';

  return parseMultiPersonResponse(rawResponse, chat.members);
}

// 解析多人群聊 AI 回复
function parseMultiPersonResponse(response, members) {
  const results = [];

  // 按 ||| 分隔多条消息
  const parts = response.split('|||').map(p => p.trim()).filter(p => p);

  parts.forEach(part => {
    // 匹配 [角色名]: 内容 格式
    const match = part.match(/^\[(.+?)\][:：]\s*(.+)$/s);

    if (match) {
      const charName = match[1].trim();
      const content = match[2].trim();

      // 查找对应的成员
      const member = members.find(m => m.name === charName);

      results.push({
        characterName: member?.name || charName,
        content: content
      });
    } else {
      // 无法解析格式时，作为第一个角色的消息
      if (members.length > 0 && part.trim()) {
        results.push({
          characterName: members[0].name,
          content: part.trim()
        });
      }
    }
  });

  return results;
}

// 发送多人群聊消息
export async function sendMultiPersonMessage(messageText) {
  console.log('[可乐] sendMultiPersonMessage 被调用', { messageText, currentMultiPersonChatIndex });

  if (currentMultiPersonChatIndex < 0) return;

  const settings = getSettings();
  const chat = settings.multiPersonChats?.[currentMultiPersonChatIndex];
  if (!chat) return;

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const msgTimestamp = Date.now();

  // 清空输入框
  const input = document.getElementById('wechat-input');
  if (input) input.value = '';
  window.updateSendButtonState?.();

  // 显示用户消息
  appendMultiPersonMessage('user', messageText);

  // 确保 chatHistory 存在
  if (!chat.chatHistory) chat.chatHistory = [];

  // 添加到历史
  chat.chatHistory.push({
    role: 'user',
    content: messageText,
    time: timeStr,
    timestamp: msgTimestamp
  });

  // 立即保存
  saveNow();

  // 选择本轮回复的角色
  const respondingMembers = selectRespondingMembers(chat, messageText);

  // 显示第一个角色的打字指示器
  showMultiPersonTypingIndicator(respondingMembers[0]?.name);

  try {
    // 调用 AI
    const responses = await callMultiPersonAI(chat, messageText, respondingMembers);

    hideMultiPersonTypingIndicator();

    // 逐条显示 AI 回复，带 typing 效果
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];

      // 显示 typing 指示器
      showMultiPersonTypingIndicator(resp.characterName);
      await sleep(600 + Math.random() * 400); // 0.6-1秒
      hideMultiPersonTypingIndicator();

      // 添加到历史
      chat.chatHistory.push({
        role: 'assistant',
        content: resp.content,
        characterName: resp.characterName,
        time: timeStr,
        timestamp: Date.now()
      });

      // 显示消息
      appendMultiPersonMessage('assistant', resp.content, resp.characterName);
    }

    // 更新最后消息
    if (responses.length > 0) {
      const lastResp = responses[responses.length - 1];
      chat.lastMessage = `[${lastResp.characterName}]: ${lastResp.content}`;
    }
    chat.lastMessageTime = Date.now();

    requestSave();
    refreshChatList();

  } catch (err) {
    hideMultiPersonTypingIndicator();
    console.error('[可乐] 多人群聊 AI 调用失败:', err);

    appendMultiPersonMessage('assistant', `⚠️ ${err.message}`, '系统');
    requestSave();
  }
}

// 判断当前是否在多人群聊
export function isInMultiPersonChat() {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  return messagesContainer?.dataset.isMultiPerson === 'true';
}

// 获取当前多人群聊索引
export function getCurrentMultiPersonIndex() {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (messagesContainer?.dataset.isMultiPerson === 'true') {
    const index = parseInt(messagesContainer.dataset.multiPersonIndex);
    return isNaN(index) ? -1 : index;
  }
  return -1;
}
