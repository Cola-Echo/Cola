/**
 * 视频通话功能
 */

import { getSettings, splitAIMessages } from './config.js';
import { currentChatIndex } from './chat.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { refreshChatList } from './ui.js';

// 通话状态
let videoCallState = {
  isActive: false,
  isConnected: false,
  isMuted: false,
  isCameraOn: true,
  startTime: null,
  timerInterval: null,
  dotsInterval: null,
  connectTimeout: null,
  contactIndex: -1,
  contactName: '',
  contactAvatar: '',
  messages: [],
  contact: null,
  initiator: 'user',
  rejectedByUser: false
};

// 辅助函数：安全设置头像（避免 onerror 内联处理器问题）
function setAvatarSafe(el, avatarUrl, fallbackChar) {
  if (!el) return;
  el.innerHTML = '';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.onerror = () => {
      img.remove();
      el.textContent = fallbackChar;
    };
    el.appendChild(img);
  } else {
    el.textContent = fallbackChar;
  }
}

// 开始视频通话
export function startVideoCall(initiator = 'user', contactIndex = currentChatIndex) {
  if (videoCallState.isActive) return;
  if (contactIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  videoCallState.contactName = contact.name;
  videoCallState.contactAvatar = contact.avatar;
  videoCallState.contact = contact;
  videoCallState.contactIndex = contactIndex;
  videoCallState.isActive = true;
  videoCallState.isConnected = false;
  videoCallState.isMuted = false;
  videoCallState.isCameraOn = true;
  videoCallState.messages = [];
  videoCallState.initiator = initiator;
  videoCallState.rejectedByUser = false;

  if (initiator === 'ai') {
    showIncomingCallPage();
  } else {
    showCallPage();
    startConnecting();
  }
}

// 显示AI来电界面
function showIncomingCallPage() {
  const page = document.getElementById('wechat-video-call-page');
  const incomingEl = document.getElementById('wechat-video-call-incoming');
  if (!page || !incomingEl) return;

  // 设置头像和名称
  const avatarEl = document.getElementById('wechat-video-call-incoming-avatar');
  const nameEl = document.getElementById('wechat-video-call-incoming-name');
  const firstChar = videoCallState.contactName ? videoCallState.contactName.charAt(0) : '?';

  setAvatarSafe(avatarEl, videoCallState.contactAvatar, firstChar);

  if (nameEl) {
    nameEl.textContent = videoCallState.contactName;
  }

  // 隐藏主界面元素，显示来电界面
  document.getElementById('wechat-video-call-waiting')?.classList.add('hidden');
  document.getElementById('wechat-video-call-chat')?.classList.add('hidden');
  document.getElementById('wechat-video-call-actions')?.classList.add('hidden');
  incomingEl.classList.remove('hidden');

  // 来电阶段不显示计时
  const timeEl = document.getElementById('wechat-video-call-time');
  if (timeEl) {
    timeEl.textContent = '00:00';
    timeEl.classList.add('hidden');
  }

  page.classList.remove('hidden');
  bindVideoCallEvents();

  // 5秒后如果用户没接就超时
  videoCallState.connectTimeout = setTimeout(() => {
    if (videoCallState.isActive && !videoCallState.isConnected) {
      videoCallState.rejectedByUser = false;
      hangupVideoCall();
    }
  }, 5000);
}

// 显示通话页面
function showCallPage() {
  const page = document.getElementById('wechat-video-call-page');
  if (!page) return;

  // 隐藏来电界面
  document.getElementById('wechat-video-call-incoming')?.classList.add('hidden');

  // 设置头像 - 使用更安全的方式避免 onerror 内联处理器问题
  const avatarEl = document.getElementById('wechat-video-call-avatar');
  const remoteAvatarEl = document.getElementById('wechat-video-call-remote-avatar');
  const firstChar = videoCallState.contactName ? videoCallState.contactName.charAt(0) : '?';

  setAvatarSafe(avatarEl, videoCallState.contactAvatar, firstChar);
  setAvatarSafe(remoteAvatarEl, videoCallState.contactAvatar, firstChar);

  // 设置本地头像
  const localAvatarEl = document.getElementById('wechat-video-call-local-avatar');
  if (localAvatarEl) {
    try {
      const settings = getSettings();
      setAvatarSafe(localAvatarEl, settings.userAvatar, '我');
    } catch (e) {
      localAvatarEl.textContent = '我';
    }
  }

  // 设置名称
  const nameEl = document.getElementById('wechat-video-call-name');
  if (nameEl) {
    nameEl.textContent = videoCallState.contactName;
  }

  // 设置状态
  const statusEl = document.getElementById('wechat-video-call-status');
  if (statusEl) {
    statusEl.textContent = '等待对方接受邀请';
  }

  // 显示等待状态
  document.getElementById('wechat-video-call-waiting')?.classList.remove('hidden');
  document.getElementById('wechat-video-call-actions')?.classList.remove('hidden');

  // 重置时间显示
  const timeEl = document.getElementById('wechat-video-call-time');
  if (timeEl) {
    timeEl.textContent = '00:00';
    timeEl.classList.add('hidden'); // 拨打中不显示计时
  }

  // 隐藏对话框
  document.getElementById('wechat-video-call-chat')?.classList.add('hidden');
  document.getElementById('wechat-video-call-messages')?.innerHTML &&
    (document.getElementById('wechat-video-call-messages').innerHTML = '');

  // 更新按钮状态
  updateCameraButton();
  updateMuteButtonVideo();

  page.classList.remove('hidden');
  bindVideoCallEvents();
}

// 开始连接动画
function startConnecting() {
  const statusEl = document.getElementById('wechat-video-call-status');
  if (!statusEl) return;

  let dotCount = 0;
  clearInterval(videoCallState.dotsInterval);
  clearTimeout(videoCallState.connectTimeout);

  videoCallState.dotsInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    const dots = '.'.repeat(dotCount);
    statusEl.textContent = '等待对方接受邀请' + dots;
  }, 500);

  // 用户发起：2-4秒后自动接通
  const connectDelay = 2000 + Math.random() * 2000;
  videoCallState.connectTimeout = setTimeout(() => {
    if (videoCallState.isActive && !videoCallState.isConnected) {
      onVideoCallConnected();
    }
  }, connectDelay);
}

// 通话接通
function onVideoCallConnected() {
  videoCallState.isConnected = true;
  videoCallState.startTime = Date.now();

  clearInterval(videoCallState.dotsInterval);
  clearTimeout(videoCallState.connectTimeout);

  // 隐藏等待状态，显示通话状态
  document.getElementById('wechat-video-call-waiting')?.classList.add('hidden');
  document.getElementById('wechat-video-call-incoming')?.classList.add('hidden');
  document.getElementById('wechat-video-call-actions')?.classList.remove('hidden');

  // 显示对话框
  document.getElementById('wechat-video-call-chat')?.classList.remove('hidden');

  // 接通后才显示计时
  const timeEl = document.getElementById('wechat-video-call-time');
  timeEl?.classList.remove('hidden');

  // 开始计时
  startVideoCallTimer();

  // 如果是AI发起的通话，接通后AI自动发送第一条消息
  if (videoCallState.initiator === 'ai') {
    triggerAIVideoGreeting();
  }
}

// 开始通话计时
function startVideoCallTimer() {
  clearInterval(videoCallState.timerInterval);

  videoCallState.timerInterval = setInterval(() => {
    if (!videoCallState.isConnected || !videoCallState.startTime) return;

    const elapsed = Math.floor((Date.now() - videoCallState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');

    const timeEl = document.getElementById('wechat-video-call-time');
    if (timeEl) {
      timeEl.textContent = `${minutes}:${seconds}`;
    }
  }, 1000);
}

// 挂断视频通话
export function hangupVideoCall() {
  // 计算通话时长
  let durationStr = '00:00';
  if (videoCallState.isConnected && videoCallState.startTime) {
    const elapsed = Math.floor((Date.now() - videoCallState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    durationStr = `${minutes}:${seconds}`;
  }

  // 添加通话记录到聊天历史
  if (videoCallState.contact) {
    const settings = getSettings();
    const contact = videoCallState.contact;

    if (!contact.chatHistory) {
      contact.chatHistory = [];
    }

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    let callContent;
    let lastMessage;

    if (videoCallState.isConnected) {
      callContent = `[视频通话:${durationStr}]`;
      lastMessage = `视频通话 ${durationStr}`;
    } else {
      if (videoCallState.initiator === 'user') {
        callContent = '[视频通话:已取消]';
        lastMessage = '已取消';
      } else if (videoCallState.rejectedByUser) {
        callContent = '[视频通话:已拒绝]';
        lastMessage = '已拒绝';
      } else {
        callContent = '[视频通话:对方已取消]';
        lastMessage = '对方已取消';
      }
    }

    const callRecord = {
      role: videoCallState.initiator === 'user' ? 'user' : 'assistant',
      content: callContent,
      time: timeStr,
      timestamp: Date.now(),
      isVideoCallRecord: true
    };

    contact.chatHistory.push(callRecord);

    // 通话内容只进“通话历史”，不在主聊天界面展示（避免污染主界面/列表预览）
    if (videoCallState.messages && videoCallState.messages.length > 0) {
      const callStatusForHistory = videoCallState.isConnected
        ? 'connected'
        : (videoCallState.initiator === 'user'
          ? 'cancelled'
          : (videoCallState.rejectedByUser ? 'rejected' : 'timeout'));
      contact.callHistory = Array.isArray(contact.callHistory) ? contact.callHistory : [];
      contact.callHistory.push({
        type: 'video',
        initiator: videoCallState.initiator,
        status: callStatusForHistory,
        duration: durationStr,
        time: timeStr,
        timestamp: Date.now(),
        messages: videoCallState.messages.map(m => ({ role: m.role, content: m.content }))
      });
    }

    contact.lastMessage = lastMessage;

    // 确定状态类型
    let callStatus = 'connected';
    if (!videoCallState.isConnected) {
      if (videoCallState.initiator === 'user') {
        callStatus = 'cancelled';
      } else if (videoCallState.rejectedByUser) {
        callStatus = 'rejected';
      } else {
        callStatus = 'timeout';
      }
    }

    if (currentChatIndex === videoCallState.contactIndex) {
      appendVideoCallRecordMessage(videoCallState.initiator === 'user' ? 'user' : 'assistant', callStatus, durationStr, contact);
    }

    // AI 对通话结束做出反应（所有情况都触发）
    triggerVideoCallEndReaction(contact, callStatus, videoCallState.initiator, videoCallState.messages);

    saveSettingsDebounced();
    refreshChatList();
  }

  videoCallState.isActive = false;
  videoCallState.isConnected = false;
  videoCallState.startTime = null;

  clearInterval(videoCallState.timerInterval);
  clearInterval(videoCallState.dotsInterval);
  clearTimeout(videoCallState.connectTimeout);

  const page = document.getElementById('wechat-video-call-page');
  if (page) {
    page.classList.add('hidden');
  }
}

// 在聊天界面显示视频通话记录消息
function appendVideoCallRecordMessage(role, status, duration, contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';

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

  // 摄像机图标
  const cameraIconSVG = `<svg class="wechat-call-record-icon wechat-video-call-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="13" height="12" rx="2"/>
    <path d="M22 8l-7 4 7 4V8z"/>
  </svg>`;

  let callRecordHTML;
  if (status === 'connected') {
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record">
        <span class="wechat-call-record-text">视频通话 ${duration}</span>
        ${cameraIconSVG}
      </div>
    `;
  } else if (status === 'cancelled') {
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record">
        <span class="wechat-call-record-text">已取消</span>
        ${cameraIconSVG}
      </div>
    `;
  } else if (status === 'rejected') {
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record wechat-call-rejected">
        ${cameraIconSVG}
        <span class="wechat-call-record-text">已拒绝</span>
      </div>
    `;
  } else {
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record">
        ${cameraIconSVG}
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

// 切换摄像头
function toggleCamera() {
  videoCallState.isCameraOn = !videoCallState.isCameraOn;
  updateCameraButton();

  // 摄像头切换时触发AI反应
  if (videoCallState.isConnected) {
    triggerCameraToggleReaction();
  }
}

// 更新摄像头按钮状态
function updateCameraButton() {
  const cameraAction = document.getElementById('wechat-video-call-camera');
  if (!cameraAction) return;

  const btn = cameraAction.querySelector('.wechat-video-call-action-btn');
  const label = cameraAction.querySelector('.wechat-video-call-action-label');

  if (btn) {
    if (videoCallState.isCameraOn) {
      btn.classList.remove('off');
    } else {
      btn.classList.add('off');
    }
  }

  if (label) {
    label.textContent = videoCallState.isCameraOn ? '摄像头' : '摄像头已关';
  }

  // 更新本地小窗显示
  const localEl = document.getElementById('wechat-video-call-local');
  if (localEl) {
    if (videoCallState.isCameraOn) {
      localEl.classList.remove('camera-off');
    } else {
      localEl.classList.add('camera-off');
    }
  }
}

// 切换静音
function toggleMuteVideo() {
  videoCallState.isMuted = !videoCallState.isMuted;
  updateMuteButtonVideo();
}

// 更新静音按钮状态
function updateMuteButtonVideo() {
  const muteAction = document.getElementById('wechat-video-call-mute');
  if (!muteAction) return;

  const btn = muteAction.querySelector('.wechat-video-call-action-btn');
  const label = muteAction.querySelector('.wechat-video-call-action-label');

  if (btn) {
    if (videoCallState.isMuted) {
      btn.classList.add('muted');
    } else {
      btn.classList.remove('muted');
    }
  }

  if (label) {
    label.textContent = videoCallState.isMuted ? '静音中' : '静音';
  }
}

// 绑定事件
let videoEventsBound = false;
function bindVideoCallEvents() {
  if (videoEventsBound) return;
  videoEventsBound = true;

  // 挂断
  document.getElementById('wechat-video-call-hangup')?.addEventListener('click', userHangupVideo);

  // 静音
  document.getElementById('wechat-video-call-mute')?.addEventListener('click', toggleMuteVideo);

  // 摄像头
  document.getElementById('wechat-video-call-camera')?.addEventListener('click', toggleCamera);

  // 最小化
  document.getElementById('wechat-video-call-minimize')?.addEventListener('click', userHangupVideo);

  // 发送消息
  document.getElementById('wechat-video-call-send')?.addEventListener('click', sendVideoCallMessage);

  // 输入框回车发送
  document.getElementById('wechat-video-call-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendVideoCallMessage();
    }
  });

  // AI来电界面事件
  document.getElementById('wechat-video-call-incoming-accept')?.addEventListener('click', acceptIncomingCall);
  document.getElementById('wechat-video-call-incoming-decline')?.addEventListener('click', declineIncomingCall);
  document.getElementById('wechat-video-call-incoming-camera')?.addEventListener('click', toggleIncomingCamera);
}

// 用户主动挂断
function userHangupVideo() {
  if (videoCallState.initiator === 'ai' && !videoCallState.isConnected) {
    videoCallState.rejectedByUser = true;
  }
  hangupVideoCall();
}

// 接听来电
function acceptIncomingCall() {
  clearTimeout(videoCallState.connectTimeout);
  showCallPage();
  onVideoCallConnected();
}

// 拒绝来电
function declineIncomingCall() {
  videoCallState.rejectedByUser = true;
  hangupVideoCall();
}

// 来电界面切换摄像头
let incomingCameraOn = true;
function toggleIncomingCamera() {
  incomingCameraOn = !incomingCameraOn;
  const btn = document.querySelector('#wechat-video-call-incoming-camera span');
  if (btn) {
    btn.textContent = incomingCameraOn ? '关闭摄像头' : '打开摄像头';
  }
  videoCallState.isCameraOn = incomingCameraOn;
}

// AI视频通话开场白
async function triggerAIVideoGreeting() {
  if (!videoCallState.isConnected || !videoCallState.contact) return;

  // 显示typing指示器
  showVideoCallTypingIndicator();

  try {
    const { callVideoAI } = await import('./ai.js');
    const aiResponse = await callVideoAI(
      videoCallState.contact,
      '[用户接听了视频通话]',
      [],
      'ai'
    );

    // 隐藏typing指示器
    hideVideoCallTypingIndicator();

    const parts = splitAIMessages(aiResponse);

    for (const part of parts) {
      if (!videoCallState.isConnected) break;

      let reply = part.trim();
      // 通话中禁用表情包/图片/音乐等富媒体（兜底过滤）
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
      if (!reply) continue;
      if (/^\[(?:表情|照片|分享音乐|音乐)[：:]/.test(reply)) continue;
      reply = reply.replace(/\[.*?\]/g, '').trim();

      if (reply) {
        // 分离场景描述和说话内容
        // 提取所有括号内的场景描述
        const sceneMatches = reply.match(/（[^）]+）/g);
        // 移除所有括号内容得到说话部分
        const speech = reply.replace(/（[^）]+）/g, '').trim();

        // 先发送说话内容
        if (speech) {
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', speech);
        }
        // 再发送场景描述（合并所有场景）
        if (sceneMatches && sceneMatches.length > 0) {
          const combinedScene = sceneMatches.join('').replace(/）（/g, '，');
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', combinedScene);
        }
        // 如果没有括号，直接发送
        if (!sceneMatches && !speech) {
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', reply);
        }
      }
    }
  } catch (err) {
    hideVideoCallTypingIndicator();
    console.error('[可乐] AI视频通话开场白失败:', err);
  }
}

// 摄像头切换时AI反应
async function triggerCameraToggleReaction() {
  if (!videoCallState.isConnected || !videoCallState.contact) return;

  // 显示typing指示器
  showVideoCallTypingIndicator();

  try {
    const { callVideoAI } = await import('./ai.js');

    const prompt = videoCallState.isCameraOn
      ? '[用户重新打开了摄像头，你又可以看到对方了。请对此做出自然的反应，可以观察用户的状态或表情。]'
      : '[用户关闭了摄像头，你现在看不到对方了。请对此做出自然的反应，可以表示好奇、调侃或撒娇。]';

    const historyMessages = videoCallState.messages.slice(-10);
    const aiResponse = await callVideoAI(
      videoCallState.contact,
      prompt,
      historyMessages,
      videoCallState.initiator
    );

    // 隐藏typing指示器
    hideVideoCallTypingIndicator();

    const parts = splitAIMessages(aiResponse);

    for (const part of parts) {
      if (!videoCallState.isConnected) break;

      let reply = part.trim();
      // 通话中禁用表情包/图片/音乐等富媒体（兜底过滤）
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
      if (!reply) continue;
      if (/^\[(?:表情|照片|分享音乐|音乐)[：:]/.test(reply)) continue;
      reply = reply.replace(/\[.*?\]/g, '').trim();

      if (reply) {
        // 分离场景描述和说话内容
        const sceneMatches = reply.match(/（[^）]+）/g);
        const speech = reply.replace(/（[^）]+）/g, '').trim();

        if (speech) {
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', speech);
        }
        if (sceneMatches && sceneMatches.length > 0) {
          const combinedScene = sceneMatches.join('').replace(/）（/g, '，');
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', combinedScene);
        }
        if (!sceneMatches && !speech) {
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', reply);
        }
      }
    }
  } catch (err) {
    hideVideoCallTypingIndicator();
    console.error('[可乐] 摄像头切换AI反应失败:', err);
  }
}

// AI 对视频通话结束做出反应
async function triggerVideoCallEndReaction(contact, callStatus, initiator, callMessages = []) {
  if (!contact) return;

  let reactionPrompt;
  if (callStatus === 'cancelled') {
    reactionPrompt = '[用户刚才给你打了视频通话，但还没等你接就取消了。请对此做出自然的反应，可以表示疑惑或好奇。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'rejected') {
    reactionPrompt = '[你刚才给用户打视频通话，但用户直接挂断拒接了。请对此做出自然的反应，可以表示失落或委屈。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'timeout') {
    reactionPrompt = '[你刚才给用户打视频通话，但用户没有接听。请对此做出自然的反应，可以表示担心或疑惑。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'connected') {
    // 已接通的视频通话正常结束
    if (callMessages && callMessages.length > 0) {
      const lastMessages = callMessages.slice(-5).map(m => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`).join('\n');
      reactionPrompt = `[你们刚才视频通话结束了。通话最后几句话是：\n${lastMessages}\n\n请对视频通话结束做出自然的反应，可以是：对通话内容的总结、表达挂断后的心情、期待下次视频等。回复1-2句话即可，简短自然，不要复述通话内容。]`;
    } else {
      reactionPrompt = '[你们刚才视频通话结束了。请对通话结束做出自然的反应，可以表达挂断后的心情或期待下次视频。回复1-2句话即可，简短自然。]';
    }
  } else {
    return;
  }

  try {
    const { callAI } = await import('./ai.js');
    const { appendMessage, showTypingIndicator, hideTypingIndicator } = await import('./chat.js');

    const shouldRenderInChat = currentChatIndex === videoCallState.contactIndex;
    // 只在当前聊天界面显示 typing/气泡，避免串到别的聊天
    if (shouldRenderInChat) {
      showTypingIndicator(contact);
    }

    const aiResponse = await callAI(contact, reactionPrompt);

    if (shouldRenderInChat) {
      hideTypingIndicator();
    }

    const parts = splitAIMessages(aiResponse);

    for (const part of parts) {
      let reply = part.trim();
      // 通话中禁用表情包/图片/音乐等富媒体（兜底过滤）
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
      if (!reply) continue;
      if (/^\[(?:表情|照片|分享音乐|音乐)[：:]/.test(reply)) continue;
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
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      }
    }

    saveSettingsDebounced();
    refreshChatList();
  } catch (err) {
    console.error('[可乐] AI视频通话结束反应失败:', err);
  }
}

// 发送视频通话中消息
async function sendVideoCallMessage() {
  const input = document.getElementById('wechat-video-call-input');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;
  if (!videoCallState.isConnected) return;

  input.value = '';
  addVideoCallMessage('user', message);

  // 显示typing指示器
  showVideoCallTypingIndicator();

  try {
    const { callVideoAI } = await import('./ai.js');
    const historyMessages = videoCallState.messages.slice(0, -1);
    const aiResponse = await callVideoAI(videoCallState.contact, message, historyMessages, videoCallState.initiator);

    // 隐藏typing指示器
    hideVideoCallTypingIndicator();

    const parts = aiResponse.split(/\s*\|\|\|\s*/).filter(Boolean);

    for (const part of parts) {
      if (!videoCallState.isConnected) break;

      let reply = part.trim();
      reply = reply.replace(/\[.*?\]/g, '').trim();

      if (reply) {
        // 分离场景描述和说话内容
        const sceneMatches = reply.match(/（[^）]+）/g);
        const speech = reply.replace(/（[^）]+）/g, '').trim();

        if (speech) {
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', speech);
        }
        if (sceneMatches && sceneMatches.length > 0) {
          const combinedScene = sceneMatches.join('').replace(/）（/g, '，');
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', combinedScene);
        }
        if (!sceneMatches && !speech) {
          showVideoCallTypingIndicator();
          await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
          hideVideoCallTypingIndicator();
          if (videoCallState.isConnected) addVideoCallMessage('ai', reply);
        }
      }
    }
  } catch (err) {
    hideVideoCallTypingIndicator();
    console.error('[可乐] 视频通话消息AI回复失败:', err);
  }
}

// 显示视频通话中的typing指示器
function showVideoCallTypingIndicator() {
  const messagesEl = document.getElementById('wechat-video-call-messages');
  if (!messagesEl) return;

  // 移除已有的typing指示器
  hideVideoCallTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-video-call-msg ai typing-indicator fade-in';
  typingDiv.id = 'wechat-video-call-typing';
  typingDiv.innerHTML = `
    <span class="wechat-typing-dot"></span>
    <span class="wechat-typing-dot"></span>
    <span class="wechat-typing-dot"></span>
  `;

  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 隐藏视频通话中的typing指示器
function hideVideoCallTypingIndicator() {
  const typingEl = document.getElementById('wechat-video-call-typing');
  if (typingEl) {
    typingEl.remove();
  }
}

// 添加视频通话消息
function addVideoCallMessage(role, content) {
  const messagesEl = document.getElementById('wechat-video-call-messages');
  if (!messagesEl) return;

  videoCallState.messages.push({ role, content });

  const msgDiv = document.createElement('div');
  msgDiv.className = `wechat-video-call-msg ${role} fade-in`;
  msgDiv.textContent = content;

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初始化
export function initVideoCall() {
  // 事件绑定将在显示页面时进行
}
