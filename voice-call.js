/**
 * 语音通话功能
 */

import { getSettings, splitAIMessages } from './config.js';
import { currentChatIndex } from './chat.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { refreshChatList } from './ui.js';

// 通话状态
let callState = {
  isActive: false,
  isConnected: false,
  isMuted: false,
  isSpeakerOn: false,
  startTime: null,
  timerInterval: null,
  dotsInterval: null,
  connectTimeout: null, // 连接超时计时器
  contactIndex: -1,
  contactName: '',
  contactAvatar: '',
  messages: [], // 通话中的消息
  contact: null,
  initiator: 'user', // 谁发起的通话: 'user' 或 'ai'
  rejectedByUser: false // 是否被用户主动拒绝
};

// 开始语音通话
export function startVoiceCall(initiator = 'user', contactIndex = currentChatIndex) {
  if (callState.isActive) return;
  if (contactIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  callState.contactName = contact.name;
  callState.contactAvatar = contact.avatar;
  callState.contact = contact;
  callState.contactIndex = contactIndex;
  callState.isActive = true;
  callState.isConnected = false;
  callState.isMuted = false;
  callState.isSpeakerOn = false;
  callState.messages = []; // 重置消息
  callState.initiator = initiator; // 记录谁发起的通话
  callState.rejectedByUser = false; // 重置拒绝状态

  showCallPage();
  startConnecting();
}

// 显示通话页面
function showCallPage() {
  const page = document.getElementById('wechat-voice-call-page');
  if (!page) return;

  // 设置头像
  const avatarEl = document.getElementById('wechat-voice-call-avatar');
  if (avatarEl) {
    const firstChar = callState.contactName ? callState.contactName.charAt(0) : '?';
    if (callState.contactAvatar) {
      avatarEl.innerHTML = `<img src="${callState.contactAvatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
    } else {
      avatarEl.textContent = firstChar;
    }
  }

  // 设置名称
  const nameEl = document.getElementById('wechat-voice-call-name');
  if (nameEl) {
    nameEl.textContent = callState.contactName;
  }

  // 设置状态 - 根据发起者显示不同文案
  const statusEl = document.getElementById('wechat-voice-call-status');
  if (statusEl) {
    if (callState.initiator === 'ai') {
      statusEl.textContent = '邀请你语音通话...';
    } else {
      statusEl.textContent = '等待对方接受邀请';
    }
    statusEl.classList.add('connecting');
  }

  // 重置时间显示 - 等待时隐藏
  const timeEl = document.getElementById('wechat-voice-call-time');
  if (timeEl) {
    timeEl.textContent = '00:00';
    timeEl.classList.add('hidden');
  }

  // 重置按钮状态
  updateMuteButton();
  updateSpeakerButton();

  // 隐藏对话框并清空消息
  const chatEl = document.getElementById('wechat-voice-call-chat');
  if (chatEl) {
    chatEl.classList.add('hidden');
  }
  const messagesEl = document.getElementById('wechat-voice-call-messages');
  if (messagesEl) {
    messagesEl.innerHTML = '';
  }

  // 根据发起者显示不同的操作按钮
  const incomingActionsEl = document.getElementById('wechat-voice-call-incoming-actions');
  const callActionsEl = document.getElementById('wechat-voice-call-actions');

  if (callState.initiator === 'ai') {
    // AI发起的来电：显示接听/拒绝按钮
    if (incomingActionsEl) incomingActionsEl.classList.remove('hidden');
    if (callActionsEl) callActionsEl.classList.add('hidden');
  } else {
    // 用户发起的呼叫：显示静音/挂断/扬声器按钮
    if (incomingActionsEl) incomingActionsEl.classList.add('hidden');
    if (callActionsEl) callActionsEl.classList.remove('hidden');
  }

  page.classList.remove('hidden');
  bindCallEvents();
}

// 开始连接动画
function startConnecting() {
  const statusEl = document.getElementById('wechat-voice-call-status');
  if (!statusEl) return;

  let dotCount = 0;
  clearInterval(callState.dotsInterval);
  clearTimeout(callState.connectTimeout);

  // 根据发起者显示不同的等待文案
  const waitingText = callState.initiator === 'ai' ? '邀请你语音通话' : '等待对方接受邀请';

  callState.dotsInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    const dots = '.'.repeat(dotCount);
    statusEl.textContent = waitingText + dots;
  }, 500);

  if (callState.initiator === 'user') {
    // 用户发起：2-4秒后自动接通
    const connectDelay = 2000 + Math.random() * 2000;
    callState.connectTimeout = setTimeout(() => {
      if (callState.isActive && !callState.isConnected) {
        onCallConnected();
      }
    }, connectDelay);
  } else {
    // AI发起：15秒后如果用户没接就超时取消
    callState.connectTimeout = setTimeout(() => {
      if (callState.isActive && !callState.isConnected) {
        // 超时，对方已取消（不是用户主动拒绝）
        callState.rejectedByUser = false;
        hangupCall();
      }
    }, 15000);
  }
}

// 通话接通
function onCallConnected() {
  callState.isConnected = true;
  callState.startTime = Date.now();

  clearInterval(callState.dotsInterval);
  clearTimeout(callState.connectTimeout);

  const statusEl = document.getElementById('wechat-voice-call-status');
  if (statusEl) {
    statusEl.textContent = '通话中';
    statusEl.classList.remove('connecting');
  }

  // 显示计时器
  const timeEl = document.getElementById('wechat-voice-call-time');
  if (timeEl) {
    timeEl.classList.remove('hidden');
  }

  // 显示对话框
  const chatEl = document.getElementById('wechat-voice-call-chat');
  if (chatEl) {
    chatEl.classList.remove('hidden');
  }

  // 切换到通话中按钮（隐藏来电按钮，显示通话控制按钮）
  const incomingActionsEl = document.getElementById('wechat-voice-call-incoming-actions');
  const callActionsEl = document.getElementById('wechat-voice-call-actions');
  if (incomingActionsEl) incomingActionsEl.classList.add('hidden');
  if (callActionsEl) callActionsEl.classList.remove('hidden');

  // 开始计时
  startCallTimer();

  // 如果是AI发起的通话，接通后AI自动发送第一条消息
  if (callState.initiator === 'ai') {
    triggerAIGreeting();
  }
}

// 开始通话计时
function startCallTimer() {
  clearInterval(callState.timerInterval);

  callState.timerInterval = setInterval(() => {
    if (!callState.isConnected || !callState.startTime) return;

    const elapsed = Math.floor((Date.now() - callState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');

    const timeEl = document.getElementById('wechat-voice-call-time');
    if (timeEl) {
      timeEl.textContent = `${minutes}:${seconds}`;
    }
  }, 1000);
}

// 挂断电话
export function hangupCall() {
  // 计算通话时长
  let durationStr = '00:00';
  if (callState.isConnected && callState.startTime) {
    const elapsed = Math.floor((Date.now() - callState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    durationStr = `${minutes}:${seconds}`;
  }

  // 添加通话记录到聊天历史
  if (callState.contact) {
    const settings = getSettings();
    const contact = callState.contact;

    if (!contact.chatHistory) {
      contact.chatHistory = [];
    }

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    let callContent;
    let lastMessage;

    if (callState.isConnected) {
      // 已接通的通话
      callContent = `[通话记录:${durationStr}]`;
      lastMessage = `通话时长 ${durationStr}`;
    } else {
      // 未接通的通话
      if (callState.initiator === 'user') {
        // 用户发起，用户取消
        callContent = '[通话记录:已取消]';
        lastMessage = '已取消';
      } else if (callState.rejectedByUser) {
        // AI发起，用户主动拒绝
        callContent = '[通话记录:已拒绝]';
        lastMessage = '已拒绝';
      } else {
        // AI发起，超时未接（对方取消）
        callContent = '[通话记录:对方已取消]';
        lastMessage = '对方已取消';
      }
    }

    // 通话记录消息
    const callRecord = {
      role: callState.initiator === 'user' ? 'user' : 'assistant',
      content: callContent,
      time: timeStr,
      timestamp: Date.now(),
      isCallRecord: true
    };

    contact.chatHistory.push(callRecord);

    // 通话内容只进“通话历史”，不在主聊天界面展示（避免污染主界面/列表预览）
    if (callState.messages && callState.messages.length > 0) {
      const callStatusForHistory = callState.isConnected
        ? 'connected'
        : (callState.initiator === 'user'
          ? 'cancelled'
          : (callState.rejectedByUser ? 'rejected' : 'timeout'));
      contact.callHistory = Array.isArray(contact.callHistory) ? contact.callHistory : [];
      contact.callHistory.push({
        type: 'voice',
        initiator: callState.initiator,
        status: callStatusForHistory,
        duration: durationStr,
        time: timeStr,
        timestamp: Date.now(),
        messages: callState.messages.map(m => ({ role: m.role, content: m.content }))
      });
    }

    contact.lastMessage = lastMessage;

    // 在聊天界面显示通话记录
    // 传递状态类型: 'connected' | 'cancelled' | 'rejected' | 'timeout'
    let callStatus = 'connected';
    if (!callState.isConnected) {
      if (callState.initiator === 'user') {
        callStatus = 'cancelled';
      } else if (callState.rejectedByUser) {
        callStatus = 'rejected';
      } else {
        callStatus = 'timeout';
      }
    }
    if (currentChatIndex === callState.contactIndex) {
      appendCallRecordMessage(callState.initiator === 'user' ? 'user' : 'assistant', callStatus, durationStr, contact);
    }

    // AI 对通话结束做出反应（所有情况都触发）
    triggerCallEndReaction(contact, callStatus, callState.initiator, callState.messages);

    saveSettingsDebounced();
    refreshChatList();
  }

  callState.isActive = false;
  callState.isConnected = false;
  callState.startTime = null;

  clearInterval(callState.timerInterval);
  clearInterval(callState.dotsInterval);

  const page = document.getElementById('wechat-voice-call-page');
  if (page) {
    page.classList.add('hidden');
  }
}

// 在聊天界面显示通话记录消息
// status: 'connected' | 'cancelled' | 'rejected' | 'timeout'
function appendCallRecordMessage(role, status, duration, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';

  // 获取用户头像
  let userAvatarContent = '我';
  try {
    const settings = getSettings();
    if (settings.userAvatar) {
      userAvatarContent = `<img src="${settings.userAvatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='我'">`;
    }
  } catch (e) {}

  const avatarContent = role === 'user'
    ? userAvatarContent
    : (contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar);

  // 通话记录卡片内容
  // 线条电话图标
  const phoneIconSVG = `<svg class="wechat-call-record-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>`;

  let callRecordHTML;
  if (status === 'connected') {
    // 已接通：显示通话时长
    callRecordHTML = `
      <div class="wechat-call-record">
        <span class="wechat-call-record-text">通话时长 ${duration}</span>
        ${phoneIconSVG}
      </div>
    `;
  } else if (status === 'cancelled') {
    // 用户发起未接通：已取消（绿色）
    callRecordHTML = `
      <div class="wechat-call-record">
        <span class="wechat-call-record-text">已取消</span>
        ${phoneIconSVG}
      </div>
    `;
  } else if (status === 'rejected') {
    // AI发起，用户主动拒绝（深灰色）
    callRecordHTML = `
      <div class="wechat-call-record wechat-call-rejected">
        ${phoneIconSVG}
        <span class="wechat-call-record-text">已拒绝</span>
      </div>
    `;
  } else {
    // AI发起，超时未接：对方已取消（绿色）
    callRecordHTML = `
      <div class="wechat-call-record">
        ${phoneIconSVG}
        <span class="wechat-call-record-text">对方已取消</span>
      </div>
    `;
  }

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content"><div class="wechat-bubble wechat-call-record-bubble">${callRecordHTML}</div></div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 切换静音
function toggleMute() {
  callState.isMuted = !callState.isMuted;
  updateMuteButton();
}

// 更新静音按钮状态
function updateMuteButton() {
  const muteAction = document.getElementById('wechat-voice-call-mute');
  if (!muteAction) return;

  const btn = muteAction.querySelector('.wechat-voice-call-action-btn');
  const label = muteAction.querySelector('.wechat-voice-call-action-label');

  if (btn) {
    if (callState.isMuted) {
      btn.classList.add('muted');
    } else {
      btn.classList.remove('muted');
    }
  }

  if (label) {
    label.textContent = callState.isMuted ? '麦克风已关' : '麦克风已开';
  }
}

// 切换扬声器
function toggleSpeaker() {
  callState.isSpeakerOn = !callState.isSpeakerOn;
  updateSpeakerButton();
}

// 更新扬声器按钮状态
function updateSpeakerButton() {
  const speakerAction = document.getElementById('wechat-voice-call-speaker');
  if (!speakerAction) return;

  const btn = speakerAction.querySelector('.wechat-voice-call-action-btn');
  const label = speakerAction.querySelector('.wechat-voice-call-action-label');

  if (btn) {
    if (callState.isSpeakerOn) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  if (label) {
    label.textContent = callState.isSpeakerOn ? '扬声器已开' : '扬声器已关';
  }
}

// 绑定事件
let eventsBound = false;
function bindCallEvents() {
  if (eventsBound) return;
  eventsBound = true;

  // 挂断（用户主动点击）
  document.getElementById('wechat-voice-call-hangup')?.addEventListener('click', userHangup);

  // 静音
  document.getElementById('wechat-voice-call-mute')?.addEventListener('click', toggleMute);

  // 扬声器
  document.getElementById('wechat-voice-call-speaker')?.addEventListener('click', toggleSpeaker);

  // 最小化（暂时也是挂断）
  document.getElementById('wechat-voice-call-minimize')?.addEventListener('click', userHangup);

  // 来电接听按钮
  document.getElementById('wechat-voice-call-accept')?.addEventListener('click', acceptIncomingCall);

  // 来电拒绝按钮
  document.getElementById('wechat-voice-call-reject')?.addEventListener('click', rejectIncomingCall);

  // 发送消息
  document.getElementById('wechat-voice-call-send')?.addEventListener('click', sendCallMessage);

  // 输入框回车发送
  document.getElementById('wechat-voice-call-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendCallMessage();
    }
  });
}

// 接听来电
function acceptIncomingCall() {
  if (!callState.isActive || callState.isConnected) return;
  onCallConnected();
}

// 拒绝来电
function rejectIncomingCall() {
  if (!callState.isActive || callState.isConnected) return;
  callState.rejectedByUser = true;
  hangupCall();
}

// 用户主动挂断
function userHangup() {
  // 如果是AI发起且未接通，标记为用户主动拒绝
  if (callState.initiator === 'ai' && !callState.isConnected) {
    callState.rejectedByUser = true;
  }
  hangupCall();
}

// AI发起通话时的开场白
async function triggerAIGreeting() {
  if (!callState.isConnected || !callState.contact) return;

  // 显示typing指示器
  showCallTypingIndicator();

  try {
    const { callVoiceAI } = await import('./ai.js');
    // AI主动打电话，发送一个触发消息让AI开场
    const aiResponse = await callVoiceAI(
      callState.contact,
      '[用户接听了电话]',
      [],
      'ai'
    );

    // 隐藏typing指示器
    hideCallTypingIndicator();

    // 按 ||| 分割，并将特殊标签与文本分离，避免"文字+表情包"混在同一条
    const parts = splitAIMessages(aiResponse);

    for (const part of parts) {
      if (!callState.isConnected) break;

      let reply = part.trim();
      // 通话中禁用表情包/图片/音乐等富媒体（兜底过滤）
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
      if (!reply) continue;
      if (/^\[(?:表情|照片|分享音乐|音乐)[：:]/.test(reply)) continue;
      // 移除语音标记
      const voiceMatch = reply.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        reply = voiceMatch[1];
      }
      // 移除其他特殊标记
      reply = reply.replace(/\[.*?\]/g, '').trim();

      if (reply) {
        // 分离小括号内容和说话内容
        // 提取所有括号内的语气描述
        const moodMatches = reply.match(/（[^）]+）/g);
        // 移除所有括号内容得到说话部分
        const speech = reply.replace(/（[^）]+）/g, '').trim();

        // 先发送说话内容
        if (speech) {
          showCallTypingIndicator();
          await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
          hideCallTypingIndicator();
          if (callState.isConnected) addCallMessage('ai', speech);
        }
        // 再发送语气描述（合并所有语气）
        if (moodMatches && moodMatches.length > 0) {
          const combinedMood = moodMatches.join('').replace(/）（/g, '，');
          showCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
          hideCallTypingIndicator();
          if (callState.isConnected) addCallMessage('ai', combinedMood);
        }
        // 如果没有括号，直接发送
        if (!moodMatches && !speech) {
          showCallTypingIndicator();
          await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
          hideCallTypingIndicator();
          if (callState.isConnected) addCallMessage('ai', reply);
        }
      }
    }
  } catch (err) {
    hideCallTypingIndicator();
    console.error('[可乐] AI通话开场白失败:', err);
  }
}

// AI 对通话结束做出反应
async function triggerCallEndReaction(contact, callStatus, initiator, callMessages = []) {
  if (!contact) return;

  // 构建反应提示
  let reactionPrompt;
  if (callStatus === 'cancelled') {
    // 用户取消了自己发起的通话
    reactionPrompt = '[用户刚才给你打了电话，但还没等你接就取消了。请对此做出自然的反应，可以表示疑惑、好奇或关心，问问用户怎么了。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'rejected') {
    // AI发起的通话被用户拒绝
    reactionPrompt = '[你刚才给用户打电话，但用户直接挂断拒接了。请对此做出自然的反应，可以表示失落、委屈或疑惑。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'timeout') {
    // AI发起的通话超时未接
    reactionPrompt = '[你刚才给用户打电话，但用户没有接听。请对此做出自然的反应，可以表示担心、疑惑或轻微失落。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'connected') {
    // 已接通的通话正常结束
    // 根据通话内容生成回复
    if (callMessages && callMessages.length > 0) {
      const lastMessages = callMessages.slice(-5).map(m => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`).join('\n');
      reactionPrompt = `[你们刚才通完电话挂断了。通话最后几句话是：\n${lastMessages}\n\n请对通话结束做出自然的反应，可以是：对通话内容的总结、表达挂断后的心情、期待下次通话等。回复1-2句话即可，简短自然，不要复述通话内容。]`;
    } else {
      reactionPrompt = '[你们刚才通完电话挂断了。请对通话结束做出自然的反应，可以表达挂断后的心情或期待下次通话。回复1-2句话即可，简短自然。]';
    }
  } else {
    return; // 未知状态不处理
  }

  try {
    const { callAI } = await import('./ai.js');
    const { appendMessage, showTypingIndicator, hideTypingIndicator } = await import('./chat.js');

    const shouldRenderInChat = currentChatIndex === callState.contactIndex;
    // 只在当前聊天界面显示 typing/气泡，避免串到别的聊天
    if (shouldRenderInChat) {
      showTypingIndicator(contact);
    }

    const aiResponse = await callAI(contact, reactionPrompt);

    if (shouldRenderInChat) {
      hideTypingIndicator();
    }

    // 按 ||| 分割，并将特殊标签与文本分离，避免“文字+表情包”混在同一条
    const parts = splitAIMessages(aiResponse);

    for (const part of parts) {
      let reply = part.trim();
      // 通话中禁用表情包/图片/音乐等富媒体（兜底过滤）
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
      if (!reply) continue;
      if (/^\[(?:表情|照片|分享音乐|音乐)[：:]/.test(reply)) continue;
      // 移除可能的特殊标记
      reply = reply.replace(/\[.*?\]/g, '').trim();

      if (reply) {
        // 保存到聊天历史
        const now = new Date();
        const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        if (!contact.chatHistory) contact.chatHistory = [];
        contact.chatHistory.push({
          role: 'assistant',
          content: reply,
          time: timeStr,
          timestamp: Date.now()
        });
        contact.lastMessage = reply;

        if (shouldRenderInChat) {
          // 显示到UI
          appendMessage('assistant', reply, contact);
        } else {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
        }
        // 每条消息之间稍微延迟
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      }
    }

    saveSettingsDebounced();
    refreshChatList();
  } catch (err) {
    console.error('[可乐] AI通话结束反应失败:', err);
  }
}

// 发送通话中消息
async function sendCallMessage() {
  const input = document.getElementById('wechat-voice-call-input');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;
  if (!callState.isConnected) return;

  input.value = '';

  // 添加用户消息
  addCallMessage('user', message);

  // 显示typing指示器
  showCallTypingIndicator();

  // 调用通话专用AI
  try {
    const { callVoiceAI } = await import('./ai.js');
    // 传入通话中的历史消息（不包含刚添加的用户消息）
    const historyMessages = callState.messages.slice(0, -1);
    // 传递通话发起者信息
    const aiResponse = await callVoiceAI(callState.contact, message, historyMessages, callState.initiator);

    // 隐藏typing指示器
    hideCallTypingIndicator();

    // 按 ||| 分割成多条消息
    const parts = aiResponse.split(/\s*\|\|\|\s*/).filter(Boolean);

    for (const part of parts) {
      if (!callState.isConnected) break;

      // 提取回复
      let reply = part.trim();
      // 移除语音标记
      const voiceMatch = reply.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        reply = voiceMatch[1];
      }
      // 移除其他特殊标记
      reply = reply.replace(/\[.*?\]/g, '').trim();

      if (reply) {
        // 分离小括号内容和说话内容
        // 提取所有括号内的语气描述
        const moodMatches = reply.match(/（[^）]+）/g);
        // 移除所有括号内容得到说话部分
        const speech = reply.replace(/（[^）]+）/g, '').trim();

        // 先发送说话内容
        if (speech) {
          // 显示typing，模拟打字延迟
          showCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
          hideCallTypingIndicator();
          if (callState.isConnected) addCallMessage('ai', speech);
        }
        // 再发送语气描述（合并所有语气）
        if (moodMatches && moodMatches.length > 0) {
          const combinedMood = moodMatches.join('').replace(/）（/g, '，');
          showCallTypingIndicator();
          await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
          hideCallTypingIndicator();
          if (callState.isConnected) addCallMessage('ai', combinedMood);
        }
        // 如果没有括号，直接发送
        if (!moodMatches && !speech) {
          showCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
          hideCallTypingIndicator();
          if (callState.isConnected) addCallMessage('ai', reply);
        }
      }
    }
  } catch (err) {
    hideCallTypingIndicator();
    console.error('[可乐] 通话消息AI回复失败:', err);
  }
}

// 显示通话中的typing指示器
function showCallTypingIndicator() {
  const messagesEl = document.getElementById('wechat-voice-call-messages');
  if (!messagesEl) return;

  // 移除已有的typing指示器
  hideCallTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-voice-call-msg ai typing-indicator fade-in';
  typingDiv.id = 'wechat-voice-call-typing';
  typingDiv.innerHTML = `
    <span class="wechat-typing-dot"></span>
    <span class="wechat-typing-dot"></span>
    <span class="wechat-typing-dot"></span>
  `;

  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 隐藏通话中的typing指示器
function hideCallTypingIndicator() {
  const typingEl = document.getElementById('wechat-voice-call-typing');
  if (typingEl) {
    typingEl.remove();
  }
}

// 添加通话消息（带渐入动画，可滚动查看所有记录）
function addCallMessage(role, content) {
  const messagesEl = document.getElementById('wechat-voice-call-messages');
  if (!messagesEl) return;

  // 添加到状态
  callState.messages.push({ role, content });

  // 创建新消息元素
  const msgDiv = document.createElement('div');
  msgDiv.className = `wechat-voice-call-msg ${role} fade-in`;
  msgDiv.textContent = content;

  // 添加新消息
  messagesEl.appendChild(msgDiv);

  // 滚动到底部
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 渲染通话消息（初始化用）
function renderCallMessages() {
  const messagesEl = document.getElementById('wechat-voice-call-messages');
  if (!messagesEl) return;

  messagesEl.innerHTML = callState.messages.map(msg => `
    <div class="wechat-voice-call-msg ${msg.role}">${escapeHtml(msg.content)}</div>
  `).join('');

  // 滚动到底部
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初始化
export function initVoiceCall() {
  // 事件绑定将在显示页面时进行
}
