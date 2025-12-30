/**
 * 视频通话功能
 */

import { getSettings, splitAIMessages } from './config.js';
import { currentChatIndex } from './chat.js';
import { requestSave } from './save-manager.js';
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
  aiHangupTimeout: null, // AI主动挂断计时器
  contactIndex: -1,
  contactName: '',
  contactAvatar: '',
  messages: [],
  contact: null,
  initiator: 'user',
  rejectedByUser: false,
  rejectedByAI: false, // 是否被AI主动拒绝
  hungUpByAI: false // 是否被AI主动挂断
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
  videoCallState.rejectedByAI = false;
  videoCallState.hungUpByAI = false;

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
  document.getElementById('wechat-video-call-center')?.classList.add('hidden');
  document.getElementById('wechat-video-call-chat')?.classList.add('hidden');
  document.getElementById('wechat-video-call-input-area')?.classList.add('hidden');
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

  // 设置角色头像（中间圆形）
  const avatarEl = document.getElementById('wechat-video-call-avatar');
  const firstChar = videoCallState.contactName ? videoCallState.contactName.charAt(0) : '?';

  setAvatarSafe(avatarEl, videoCallState.contactAvatar, firstChar);

  // 设置用户头像（右上角长方形小窗）
  const localAvatarEl = document.getElementById('wechat-video-call-local-avatar');
  if (localAvatarEl) {
    try {
      const settings = getSettings();
      setAvatarSafe(localAvatarEl, settings.userAvatar, '我');
    } catch (e) {
      localAvatarEl.textContent = '我';
    }
  }

  // 设置状态
  const statusEl = document.getElementById('wechat-video-call-status');
  if (statusEl) {
    statusEl.textContent = '等待对方接受邀请';
  }

  // 显示中间区域
  document.getElementById('wechat-video-call-center')?.classList.remove('hidden');
  document.getElementById('wechat-video-call-actions')?.classList.remove('hidden');

  // 重置时间显示
  const timeEl = document.getElementById('wechat-video-call-time');
  if (timeEl) {
    timeEl.textContent = '00:00';
    timeEl.classList.add('hidden'); // 拨打中不显示计时
  }

  // 隐藏对话框和输入框
  document.getElementById('wechat-video-call-chat')?.classList.add('hidden');
  document.getElementById('wechat-video-call-input-area')?.classList.add('hidden');
  document.getElementById('wechat-video-call-messages')?.innerHTML &&
    (document.getElementById('wechat-video-call-messages').innerHTML = '');

  // 更新按钮状态
  updateCameraButton();
  updateMuteButtonVideo();

  page.classList.remove('hidden');
  bindVideoCallEvents();
}

// 开始连接动画
async function startConnecting() {
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

  // 用户发起：调用AI决策是否接听
  const shouldAnswer = await askAIToAnswerVideoCall(videoCallState.contact);

  if (!videoCallState.isActive) return; // 用户可能已经取消

  if (shouldAnswer) {
    // AI决定接听
    if (videoCallState.isActive && !videoCallState.isConnected) {
      onVideoCallConnected();
    }
  } else {
    // AI决定拒接
    videoCallState.rejectedByAI = true;
    hangupVideoCall();
  }
}

// AI决定是否接听用户的视频来电
async function askAIToAnswerVideoCall(contact) {
  if (!contact) return true;

  try {
    const { callAI } = await import('./ai.js');

    const prompt = `[用户正在给你打视频电话，你需要决定是否接听]

根据你的性格和当前心情决定：
- 如果你想接听，只回复：[接听]
- 如果你不想接听（比如在忙、生气、故意不接、想让用户着急等），只回复：[拒接]

【绝对禁止】
- 只能回复 [接听] 或 [拒接]，不能有任何其他文字！
- [接听] 或 [拒接] 必须独立成行，前后不能有任何内容！
× 错误：好吧[接听] ← 有其他文字，错误！
× 错误：[拒接]哼 ← 有其他文字，错误！
√ 正确：[接听]
√ 正确：[拒接]

注意：大多数情况下你应该接听，只有特殊情况才拒接。`;

    const response = await callAI(contact, prompt);
    const trimmed = (response || '').trim();

    console.log('[可乐] AI视频接听决策:', trimmed);

    // 检查是否拒接
    if (trimmed.includes('[拒接]') || trimmed.includes('拒接')) {
      return false;
    }

    // 默认接听
    return true;
  } catch (err) {
    console.error('[可乐] AI视频接听决策失败:', err);
    // 出错时默认接听
    return true;
  }
}

// 通话接通
function onVideoCallConnected() {
  videoCallState.isConnected = true;
  videoCallState.startTime = Date.now();

  clearInterval(videoCallState.dotsInterval);
  clearTimeout(videoCallState.connectTimeout);

  // 隐藏中间区域的状态文字，保留头像
  const statusEl = document.getElementById('wechat-video-call-status');
  if (statusEl) statusEl.classList.add('hidden');
  document.getElementById('wechat-video-call-incoming')?.classList.add('hidden');
  document.getElementById('wechat-video-call-actions')?.classList.remove('hidden');

  // 显示对话框和输入框
  document.getElementById('wechat-video-call-chat')?.classList.remove('hidden');
  document.getElementById('wechat-video-call-input-area')?.classList.remove('hidden');

  // 接通后才显示计时
  const timeEl = document.getElementById('wechat-video-call-time');
  timeEl?.classList.remove('hidden');

  // 开始计时
  startVideoCallTimer();

  // 如果是AI发起的通话，接通后AI自动发送第一条消息
  if (videoCallState.initiator === 'ai') {
    triggerAIVideoGreeting();
  }

  // 启动AI主动挂断检查（通话30秒后开始随机检查）
  scheduleVideoAIHangupCheck();
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

// 调度AI主动挂断检查
// 通话接通后30秒开始，每次用户发消息后AI回复时有5%概率挂断
// 同时设置一个180秒（3分钟）的保底挂断时间
function scheduleVideoAIHangupCheck() {
  // 清除已有的计时器
  clearTimeout(videoCallState.aiHangupTimeout);

  // 设置保底挂断时间：通话3分钟后有50%概率挂断，超过5分钟必定挂断
  const checkTime = 180000 + Math.random() * 120000; // 3-5分钟
  videoCallState.aiHangupTimeout = setTimeout(() => {
    if (videoCallState.isConnected) {
      // 50%概率挂断，否则再等1-2分钟
      if (Math.random() < 0.5) {
        videoAIHangup();
      } else {
        // 再设置一个60-120秒后的必定挂断
        videoCallState.aiHangupTimeout = setTimeout(() => {
          if (videoCallState.isConnected) {
            videoAIHangup();
          }
        }, 60000 + Math.random() * 60000);
      }
    }
  }, checkTime);
}

// 每次AI回复后检查是否要挂断（5%概率，通话30秒后生效）
export function checkVideoAIHangupAfterReply() {
  if (!videoCallState.isConnected || !videoCallState.startTime) return false;

  // 通话至少30秒后才开始随机挂断检查
  const elapsed = Date.now() - videoCallState.startTime;
  if (elapsed < 30000) return false;

  // 5%概率挂断
  if (Math.random() < 0.05) {
    // 延迟1-3秒后挂断，更自然
    setTimeout(() => {
      if (videoCallState.isConnected) {
        videoAIHangup();
      }
    }, 1000 + Math.random() * 2000);
    return true;
  }

  return false;
}

// 检测AI是否有挂断意图
function detectVideoHangupIntent(text) {
  if (!text) return false;
  const hangupPatterns = [
    /我(先)?挂了/,
    /那我挂了/,
    /先挂(了)?啊?/,
    /挂了(啊|哈|呀|哦)?$/,
    /我(要)?挂(电话|断)了/,
    /拜拜.*挂/,
    /挂.*拜拜/,
    /再见.*挂/,
    /不聊了.*挂/,
    /不说了.*挂/,
    /那就这样.*挂/,
    /就这样吧.*挂/
  ];
  return hangupPatterns.some(pattern => pattern.test(text));
}

// AI主动挂断视频电话
function videoAIHangup() {
  if (!videoCallState.isConnected) return;

  console.log('[可乐] AI主动挂断视频电话');
  videoCallState.hungUpByAI = true;
  hangupVideoCall();
}

// 挂断视频通话
export function hangupVideoCall() {
  // 清除AI挂断计时器
  clearTimeout(videoCallState.aiHangupTimeout);

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
        if (videoCallState.rejectedByAI) {
          // 用户发起，AI拒接
          callContent = '[视频通话:对方已拒绝]';
          lastMessage = '对方已拒绝';
        } else {
          // 用户发起，用户取消
          callContent = '[视频通话:已取消]';
          lastMessage = '已取消';
        }
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

    // 通话内容只进"通话历史"，不在主聊天界面展示（避免污染主界面/列表预览）
    if (videoCallState.messages && videoCallState.messages.length > 0) {
      const callStatusForHistory = videoCallState.isConnected
        ? 'connected'
        : (videoCallState.initiator === 'user'
          ? (videoCallState.rejectedByAI ? 'rejectedByAI' : 'cancelled')
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
        callStatus = videoCallState.rejectedByAI ? 'rejectedByAI' : 'cancelled';
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
    triggerVideoCallEndReaction(contact, callStatus, videoCallState.initiator, videoCallState.messages, videoCallState.hungUpByAI);

    requestSave();
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
  const cameraIconSVG = `<svg class="wechat-call-record-icon wechat-video-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="13" height="12" rx="2"/>
    <path d="M22 8l-7 4 7 4V8z"/>
  </svg>`;

  let callRecordHTML;
  if (status === 'connected') {
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record">
        ${cameraIconSVG}
        <span class="wechat-call-record-text">视频通话 ${duration}</span>
      </div>
    `;
  } else if (status === 'cancelled') {
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record">
        <span class="wechat-call-record-text">已取消</span>
        ${cameraIconSVG}
      </div>
    `;
  } else if (status === 'rejectedByAI') {
    // 用户发起，AI拒接：对方已拒绝（绿色，和视频通话时长样式一致）
    callRecordHTML = `
      <div class="wechat-call-record wechat-video-call-record">
        ${cameraIconSVG}
        <span class="wechat-call-record-text">对方已拒绝</span>
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

  // 移动端键盘收起后重置滚动位置
  document.getElementById('wechat-video-call-input')?.addEventListener('blur', () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
      const page = document.getElementById('wechat-video-call-page');
      if (page) {
        page.style.transform = '';
        page.style.top = '0';
      }
    }, 100);
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

      // 过滤掉泄露的提示词或内部指令
      reply = reply.replace(/^-\d+\s*.*/gm, '').trim();
      if (/我需要.*(回复|做出|扮演|以.*身份)/.test(reply)) {
        const dashMatch = reply.match(/---+\s*(.+)$/);
        if (dashMatch) {
          reply = dashMatch[1].trim();
        } else {
          continue;
        }
      }
      if (reply.includes('---')) {
        const parts2 = reply.split(/---+/);
        reply = parts2[parts2.length - 1].trim();
      }

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

      // 过滤掉泄露的提示词或内部指令
      reply = reply.replace(/^-\d+\s*.*/gm, '').trim();
      if (/我需要.*(回复|做出|扮演|以.*身份)/.test(reply)) {
        const dashMatch = reply.match(/---+\s*(.+)$/);
        if (dashMatch) {
          reply = dashMatch[1].trim();
        } else {
          continue;
        }
      }
      if (reply.includes('---')) {
        const parts2 = reply.split(/---+/);
        reply = parts2[parts2.length - 1].trim();
      }

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
async function triggerVideoCallEndReaction(contact, callStatus, initiator, callMessages = [], hungUpByAI = false) {
  if (!contact) return;

  let reactionPrompt;
  if (callStatus === 'cancelled') {
    reactionPrompt = '[用户刚才给你打了视频通话，但还没等你接就取消了。请对此做出自然的反应，可以表示疑惑或好奇。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'rejectedByAI') {
    // AI主动拒绝了用户的视频来电
    reactionPrompt = '[你刚才拒绝了用户的视频通话。请对此做出自然的反应，解释为什么不接（比如在忙、不方便、想让对方着急一下、生气中等）。回复1-2句话即可，简短自然，符合你的性格。]';
  } else if (callStatus === 'rejected') {
    reactionPrompt = '[你刚才给用户打视频通话，但用户直接挂断拒接了。请对此做出自然的反应，可以表示失落或委屈。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'timeout') {
    reactionPrompt = '[你刚才给用户打视频通话，但用户没有接听。请对此做出自然的反应，可以表示担心或疑惑。回复1-2句话即可，简短自然。]';
  } else if (callStatus === 'connected') {
    // 已接通的视频通话正常结束
    if (callMessages && callMessages.length > 0) {
      const lastMessages = callMessages.slice(-5).map(m => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`).join('\n');

      if (hungUpByAI) {
        // AI主动挂断的情况
        reactionPrompt = `[视频通话刚刚挂断了（是你主动挂的），现在回到微信文字聊天。通话最后几句是：
${lastMessages}

【重要】是你主动挂断的视频通话，你现在是发微信消息。请根据通话内容自然收尾：
- 可能是聊完了正常告别
- 可能是有事要忙、来不及了
- 可能是情绪原因（害羞、生气、不想聊了等）
回复1句话，符合你的人设性格。]`;
      } else {
        // 用户挂断的情况
        reactionPrompt = `[视频通话刚刚挂断了，现在回到微信文字聊天。通话最后几句是：
${lastMessages}

【重要】通话已结束，你现在是发微信消息，不是继续视频通话。你应该对"挂断"这件事本身做反应：
- 如果是正常告别后挂的：简单告别或表达心情
- 如果是突然/意外挂断（聊到一半、正在做某事时断了）：表示疑惑，问问怎么回事
绝对不要继续或延续通话里正在进行的内容或动作。回复1句话，符合你的性格。]`;
      }
    } else {
      if (hungUpByAI) {
        reactionPrompt = '[视频通话刚刚挂断了（是你主动挂的），现在回到微信文字聊天。请对此做出简单反应，符合你的人设性格。回复1句话。]';
      } else {
        reactionPrompt = '[视频通话刚刚挂断了，现在回到微信文字聊天。请对"挂断"做出简单反应，不要假设通话中发生了什么。回复1句话，符合你的性格。]';
      }
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

      // 过滤掉泄露的提示词或内部指令
      reply = reply.replace(/^-\d+\s*.*/gm, '').trim();
      if (/我需要.*(回复|做出|扮演|以.*身份)/.test(reply)) {
        const dashMatch = reply.match(/---+\s*(.+)$/);
        if (dashMatch) {
          reply = dashMatch[1].trim();
        } else {
          continue;
        }
      }
      if (reply.includes('---')) {
        const parts2 = reply.split(/---+/);
        reply = parts2[parts2.length - 1].trim();
      }

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

    requestSave();
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
      // 过滤掉 <meme> 标签（视频通话只输出纯文字）
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
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

    // AI回复完成后，检查是否要主动挂断
    // 1. 检测AI的挂断意图（如"我挂了"、"先挂了"等）
    const fullReply = parts.join(' ');
    if (detectVideoHangupIntent(fullReply)) {
      console.log('[可乐] 检测到视频通话AI挂断意图:', fullReply);
      setTimeout(() => {
        if (videoCallState.isConnected) {
          videoAIHangup();
        }
      }, 1500 + Math.random() * 1000);
      return;
    }
    // 2. 随机5%概率挂断（通话30秒后生效）
    checkVideoAIHangupAfterReply();
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
  typingDiv.className = 'wechat-video-call-msg ai';
  typingDiv.id = 'wechat-video-call-typing';
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

// 初始化
export function initVideoCall() {
  // 事件绑定将在显示页面时进行
}
