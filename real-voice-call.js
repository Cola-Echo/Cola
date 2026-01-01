/**
 * 实时语音通话功能
 * 真正的语音交互：用户说话 → STT → AI → TTS → 播放
 */

import { getSettings } from './config.js';
import { currentChatIndex } from './chat.js';
import { requestSave } from './save-manager.js';
import { refreshChatList } from './ui.js';
import { AudioRecorder, speechToText, textToSpeech, playAudio } from './voice-api.js';
import { showToast } from './toast.js';
import { saveVoiceRecordings } from './audio-storage.js';

// 通话状态
let callState = {
  isActive: false,
  isConnected: false,
  isMuted: false,
  isHangingUp: false, // 是否正在挂断
  startTime: null,
  timerInterval: null,
  dotsInterval: null,
  connectTimeout: null,
  contactIndex: -1,
  contactName: '',
  contactAvatar: '',
  messages: [],       // 通话消息记录
  contact: null,
  initiator: 'user',
  rejectedByUser: false,
  rejectedByAI: false,
  isRecording: false, // 是否正在录音
  isProcessing: false, // 是否正在处理（STT/AI/TTS）
  isPlaying: false,   // 是否正在播放语音
  recorder: null,     // 录音器实例
  currentAudio: null, // 当前播放的音频
  voiceCache: []      // 缓存的 AI 语音 [{text, audioBlob, duration}]
};

/**
 * 开始实时语音通话
 */
export function startRealVoiceCall(initiator = 'user', contactIndex = currentChatIndex) {
  if (callState.isActive) return;
  if (contactIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  // 检查语音 API 是否配置
  if (!settings.sttApiUrl || !settings.sttApiKey) {
    alert('请先在设置中配置语音识别 (STT) API');
    return;
  }
  if (!settings.ttsApiUrl || !settings.ttsApiKey) {
    alert('请先在设置中配置语音合成 (TTS) API');
    return;
  }

  // 检查浏览器是否支持录音（不阻止进入，可以用文字输入）
  const supportsRecording = AudioRecorder.isSupported();
  if (!supportsRecording) {
    console.log('[可乐] 浏览器不支持录音，将使用文字输入模式');
  }

  callState.contactName = contact.name;
  callState.contactAvatar = contact.avatar;
  callState.contact = contact;
  callState.contactIndex = contactIndex;
  callState.isActive = true;
  callState.isConnected = false;
  callState.isMuted = false;
  callState.messages = [];
  callState.initiator = initiator;
  callState.rejectedByUser = false;
  callState.rejectedByAI = false;
  callState.isRecording = false;
  callState.isProcessing = false;
  callState.isPlaying = false;
  callState.recorder = new AudioRecorder();
  callState.voiceCache = []; // 重置语音缓存
  callState.isHangingUp = false; // 重置挂断标志

  showCallPage();
  startConnecting();
}

/**
 * 显示通话页面
 */
function showCallPage() {
  const page = document.getElementById('wechat-real-voice-call-page');
  if (!page) return;

  // 设置头像
  const avatarEl = document.getElementById('wechat-real-voice-call-avatar');
  if (avatarEl) {
    const firstChar = callState.contactName ? callState.contactName.charAt(0) : '?';
    if (callState.contactAvatar) {
      avatarEl.innerHTML = `<img src="${callState.contactAvatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
    } else {
      avatarEl.textContent = firstChar;
    }
  }

  // 设置名称
  const nameEl = document.getElementById('wechat-real-voice-call-name');
  if (nameEl) {
    nameEl.textContent = callState.contactName;
  }

  // 设置状态
  const statusEl = document.getElementById('wechat-real-voice-call-status');
  if (statusEl) {
    if (callState.initiator === 'ai') {
      statusEl.textContent = '邀请你实时语音...';
    } else {
      statusEl.textContent = '等待对方接受邀请';
    }
    statusEl.classList.add('connecting');
  }

  // 重置时间显示
  const timeEl = document.getElementById('wechat-real-voice-call-time');
  if (timeEl) {
    timeEl.textContent = '00:00';
    timeEl.classList.add('hidden');
  }

  // 隐藏对话区域
  const chatEl = document.getElementById('wechat-real-voice-call-chat');
  if (chatEl) {
    chatEl.classList.add('hidden');
  }
  const messagesEl = document.getElementById('wechat-real-voice-call-messages');
  if (messagesEl) {
    messagesEl.innerHTML = '';
  }

  // 隐藏按住说话按钮
  const talkBtnArea = document.getElementById('wechat-real-voice-call-talk-area');
  if (talkBtnArea) {
    talkBtnArea.classList.add('hidden');
  }

  // 检测是否支持录音
  const supportsRecording = AudioRecorder.isSupported();
  const talkBtn = document.getElementById('wechat-real-voice-call-talk-btn');
  const talkHint = document.querySelector('.wechat-real-voice-call-talk-hint');
  const textInputArea = document.getElementById('wechat-real-voice-call-text-input-area');

  // 语音按钮：只有支持录音时显示
  if (talkBtn) talkBtn.style.display = supportsRecording ? 'flex' : 'none';
  if (talkHint) {
    if (supportsRecording) {
      talkHint.style.display = 'block';
      talkHint.textContent = '点击开始说话，再次点击发送';
    } else {
      // 显示不支持的原因
      talkHint.style.display = 'block';
      talkHint.textContent = '💡 ' + AudioRecorder.getUnsupportedReason();
      talkHint.style.color = '#ff9800';
    }
  }
  // 文字输入：始终显示，方便用户选择打字或语音
  if (textInputArea) textInputArea.style.display = 'flex';

  // 根据发起者显示不同的操作按钮
  const incomingActionsEl = document.getElementById('wechat-real-voice-call-incoming-actions');
  const callActionsEl = document.getElementById('wechat-real-voice-call-actions');

  if (callState.initiator === 'ai') {
    if (incomingActionsEl) incomingActionsEl.classList.remove('hidden');
    if (callActionsEl) callActionsEl.classList.add('hidden');
  } else {
    if (incomingActionsEl) incomingActionsEl.classList.add('hidden');
    if (callActionsEl) callActionsEl.classList.remove('hidden');
  }

  page.classList.remove('hidden');
  bindCallEvents();
}

/**
 * 开始连接动画
 */
async function startConnecting() {
  const statusEl = document.getElementById('wechat-real-voice-call-status');
  if (!statusEl) return;

  let dotCount = 0;
  clearInterval(callState.dotsInterval);
  clearTimeout(callState.connectTimeout);

  const waitingText = callState.initiator === 'ai' ? '邀请你实时语音' : '等待对方接受邀请';

  callState.dotsInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    const dots = '.'.repeat(dotCount);
    statusEl.textContent = waitingText + dots;
  }, 500);

  if (callState.initiator === 'user') {
    // 用户发起：调用AI决策是否接听
    const shouldAnswer = await askAIToAnswerCall(callState.contact);

    if (!callState.isActive) return;

    if (shouldAnswer) {
      if (callState.isActive && !callState.isConnected) {
        onCallConnected();
      }
    } else {
      callState.rejectedByAI = true;
      hangupCall();
    }
  } else {
    // AI发起：15秒后超时
    callState.connectTimeout = setTimeout(() => {
      if (callState.isActive && !callState.isConnected) {
        callState.rejectedByUser = false;
        hangupCall();
      }
    }, 15000);
  }
}

/**
 * AI决定是否接听
 */
async function askAIToAnswerCall(contact) {
  if (!contact) return true;

  try {
    const { callAI } = await import('./ai.js');

    const prompt = `[用户正在给你打实时语音电话，你需要决定是否接听]

根据你的性格和当前心情决定：
- 如果你想接听，只回复：[接听]
- 如果你不想接听，只回复：[拒接]

注意：大多数情况下你应该接听，只有特殊情况才拒接。`;

    const response = await callAI(contact, prompt);
    const trimmed = (response || '').trim();

    console.log('[可乐] 实时语音 AI接听决策:', trimmed);

    if (trimmed.includes('[拒接]') || trimmed.includes('拒接')) {
      return false;
    }

    return true;
  } catch (err) {
    console.error('[可乐] AI接听决策失败:', err);
    return true;
  }
}

/**
 * 通话接通
 */
function onCallConnected() {
  callState.isConnected = true;
  callState.startTime = Date.now();

  clearInterval(callState.dotsInterval);
  clearTimeout(callState.connectTimeout);

  const statusEl = document.getElementById('wechat-real-voice-call-status');
  if (statusEl) {
    statusEl.textContent = '通话中';
    statusEl.classList.remove('connecting');
  }

  // 显示计时器
  const timeEl = document.getElementById('wechat-real-voice-call-time');
  if (timeEl) {
    timeEl.classList.remove('hidden');
  }

  // 显示对话区域
  const chatEl = document.getElementById('wechat-real-voice-call-chat');
  if (chatEl) {
    chatEl.classList.remove('hidden');
  }

  // 显示按住说话按钮
  const talkBtnArea = document.getElementById('wechat-real-voice-call-talk-area');
  if (talkBtnArea) {
    talkBtnArea.classList.remove('hidden');
  }

  // 切换到通话中按钮
  const incomingActionsEl = document.getElementById('wechat-real-voice-call-incoming-actions');
  const callActionsEl = document.getElementById('wechat-real-voice-call-actions');
  if (incomingActionsEl) incomingActionsEl.classList.add('hidden');
  if (callActionsEl) callActionsEl.classList.remove('hidden');

  startCallTimer();

  // AI发起的通话，接通后AI先打招呼
  if (callState.initiator === 'ai') {
    triggerAIGreeting();
  }
}

/**
 * 开始通话计时
 */
function startCallTimer() {
  clearInterval(callState.timerInterval);

  callState.timerInterval = setInterval(() => {
    if (!callState.isConnected || !callState.startTime) return;

    const elapsed = Math.floor((Date.now() - callState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');

    const timeEl = document.getElementById('wechat-real-voice-call-time');
    if (timeEl) {
      timeEl.textContent = `${minutes}:${seconds}`;
    }
  }, 1000);
}

/**
 * AI主动打招呼（AI发起通话时）
 */
async function triggerAIGreeting() {
  if (!callState.isConnected || !callState.contact) return;

  updateStatus('AI思考中...');

  try {
    const { callRealVoiceAI } = await import('./ai.js');
    const aiResponse = await callRealVoiceAI(
      callState.contact,
      '[用户接听了实时语音电话]',
      [],
      'ai'
    );

    // 清理回复
    let reply = cleanAIReply(aiResponse);
    if (!reply) return;

    // 添加消息记录
    addCallMessage('ai', reply);

    // TTS 合成并播放
    await speakText(reply);

    updateStatus('通话中');
  } catch (err) {
    console.error('[可乐] AI打招呼失败:', err);
    updateStatus('通话中');
  }
}

/**
 * 清理 AI 回复（移除特殊标签，保留完整内容）
 */
function cleanAIReply(text) {
  if (!text) return '';

  console.log('[可乐] AI原始回复:', text);

  let reply = text.trim();

  // 移除语音标记
  const voiceMatch = reply.match(/^\[语音[：:]\s*(.+?)\]$/);
  if (voiceMatch) {
    reply = voiceMatch[1];
  }

  // 移除特殊标记
  reply = reply.replace(/\[.*?\]/g, '').trim();

  // 移除 meme 表情包标签（多种可能的格式）
  reply = reply.replace(/<\s*meme\s*>[^<]*<\s*\/\s*meme\s*>/gi, '').trim();
  reply = reply.replace(/<meme>[^<]*<\/meme>/gi, '').trim();

  // 移除可能残留的单独标签
  reply = reply.replace(/<\/?meme>/gi, '').trim();

  // 移除括号描述（中文和英文括号）
  reply = reply.replace(/（[^）]+）/g, '').trim();
  reply = reply.replace(/\([^)]+\)/g, '').trim();

  // 如果清理后为空，用原始内容去掉标记
  if (!reply && text.trim()) {
    reply = text.trim().replace(/[\[\]（）()【】<>]/g, '').trim();
    console.log('[可乐] 清理后为空，恢复内容:', reply);
  }

  console.log('[可乐] 最终回复:', reply || '(空)');

  return reply;
}

/**
 * TTS 合成并播放
 */
async function speakText(text) {
  if (!text || callState.isPlaying) return;

  callState.isPlaying = true;
  updateStatus('语音合成中...');

  try {
    console.log('[可乐] 开始TTS合成:', text.substring(0, 50));
    const audioBlob = await textToSpeech(text, callState.contact);

    // 检查音频数据
    console.log('[可乐] TTS返回音频:', {
      size: audioBlob?.size,
      type: audioBlob?.type
    });

    if (!audioBlob || audioBlob.size < 100) {
      console.error('[可乐] TTS返回的音频数据无效');
      updateStatus('语音合成失败');
      return;
    }

    updateStatus('对方正在说话...');

    // 播放音频
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    // 设置音量
    audio.volume = 1.0;

    let audioDuration = 0;

    await new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        console.error('[可乐] 音频播放错误:', e);
        reject(new Error('音频播放失败'));
      };
      audio.oncanplaythrough = () => {
        audioDuration = audio.duration;
        console.log('[可乐] 音频可以播放，时长:', audioDuration);
      };

      audio.play().then(() => {
        console.log('[可乐] 音频开始播放');
      }).catch(err => {
        console.error('[可乐] 音频播放被阻止:', err);
        reject(err);
      });
    });

    // 播放成功后缓存音频（用于通话结束后选择保存）
    callState.voiceCache.push({
      text: text,
      audioBlob: audioBlob,
      duration: audioDuration || (audioBlob.size / 16000) // 估算时长
    });
    console.log('[可乐] 语音已缓存，当前缓存数量:', callState.voiceCache.length);

  } catch (err) {
    console.error('[可乐] TTS 播放失败:', err);
    // 显示错误提示
    const errorMsg = err.message || '语音播放失败';
    updateStatus('语音失败');
    showToast('语音合成失败: ' + errorMsg.substring(0, 30), '⚠️');
    await new Promise(r => setTimeout(r, 1500));
  } finally {
    callState.isPlaying = false;
    if (callState.isConnected) {
      updateStatus('通话中');
    }
  }
}

/**
 * 开始录音（按住说话）
 */
async function startRecording() {
  if (!callState.isConnected || callState.isRecording || callState.isProcessing || callState.isPlaying) {
    return;
  }

  try {
    await callState.recorder.start();
    callState.isRecording = true;
    updateTalkButton(true);
    updateStatus('正在录音...');
  } catch (err) {
    console.error('[可乐] 开始录音失败:', err);
    alert(err.message);
  }
}

/**
 * 停止录音并处理
 */
async function stopRecording() {
  if (!callState.isRecording) return;

  callState.isRecording = false;
  updateTalkButton(false);

  try {
    const audioBlob = await callState.recorder.stop();

    if (audioBlob.size < 1000) {
      console.log('[可乐] 录音太短，忽略');
      updateStatus('通话中');
      return;
    }

    callState.isProcessing = true;
    updateStatus('识别中...');

    // STT 语音转文字
    const userText = await speechToText(audioBlob);

    if (!userText || !userText.trim()) {
      console.log('[可乐] 未识别到语音');
      showToast('未识别到语音内容', 'info');
      updateStatus('通话中');
      callState.isProcessing = false;
      return;
    }

    console.log('[可乐] 用户说:', userText);

    // 添加用户消息
    addCallMessage('user', userText);

    // 调用 AI（带超时保护，使用实时语音专用函数）
    updateStatus('AI思考中...');
    const { callRealVoiceAI } = await import('./ai.js');

    // 30秒超时
    const aiPromise = callRealVoiceAI(
      callState.contact,
      userText,
      callState.messages.slice(0, -1),
      callState.initiator
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI响应超时')), 30000)
    );
    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);

    // 清理回复
    let reply = cleanAIReply(aiResponse);

    callState.isProcessing = false;

    if (!reply) {
      updateStatus('通话中');
      return;
    }

    // 添加 AI 消息
    addCallMessage('ai', reply);

    // TTS 并播放
    await speakText(reply);

    // 检查是否要挂断
    if (detectHangupIntent(reply)) {
      setTimeout(() => {
        if (callState.isConnected) {
          hangupCall();
        }
      }, 1500);
    }

  } catch (err) {
    console.error('[可乐] 语音处理失败:', err);
    callState.isProcessing = false;
    updateStatus('通话中');
    // 显示具体错误
    const errorMsg = err.message || '处理失败';
    showToast('语音处理失败: ' + errorMsg.substring(0, 30), '⚠️');
  }
}

/**
 * 取消录音
 */
function cancelRecording() {
  if (callState.recorder) {
    callState.recorder.cancel();
  }
  callState.isRecording = false;
  updateTalkButton(false);
  updateStatus('通话中');
}

/**
 * 处理文字输入（不支持录音时的替代方案）
 */
async function processUserTextInput(userText) {
  if (!callState.isConnected || callState.isProcessing || callState.isPlaying) {
    return;
  }

  try {
    console.log('[可乐] 用户输入:', userText);

    // 添加用户消息
    addCallMessage('user', userText);

    callState.isProcessing = true;

    // 调用 AI（带超时保护）
    updateStatus('AI思考中...');
    const { callRealVoiceAI } = await import('./ai.js');

    // 30秒超时
    const aiPromise = callRealVoiceAI(
      callState.contact,
      userText,
      callState.messages.slice(0, -1),
      callState.initiator
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI响应超时')), 30000)
    );
    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);

    // 清理回复
    let reply = cleanAIReply(aiResponse);

    callState.isProcessing = false;

    if (!reply) {
      updateStatus('通话中');
      return;
    }

    // 添加 AI 消息
    addCallMessage('ai', reply);

    // TTS 并播放
    await speakText(reply);

    // 检查是否要挂断
    if (detectHangupIntent(reply)) {
      setTimeout(() => {
        if (callState.isConnected) {
          hangupCall();
        }
      }, 1500);
    }

  } catch (err) {
    console.error('[可乐] 文字处理失败:', err);
    callState.isProcessing = false;
    updateStatus('通话中');
    const errorMsg = err.message || '处理失败';
    showToast('处理失败: ' + errorMsg.substring(0, 30), '⚠️');
  }
}

/**
 * 检测挂断意图
 */
function detectHangupIntent(text) {
  if (!text) return false;
  const hangupPatterns = [
    /我(先)?挂了/,
    /那我挂了/,
    /先挂(了)?啊?/,
    /挂了(啊|哈|呀|哦)?$/,
    /拜拜.*挂/,
    /再见.*挂/
  ];
  return hangupPatterns.some(pattern => pattern.test(text));
}

/**
 * 更新状态显示
 */
function updateStatus(text) {
  const statusEl = document.getElementById('wechat-real-voice-call-status');
  if (statusEl) {
    statusEl.textContent = text;
  }
}

/**
 * 更新说话按钮状态
 */
function updateTalkButton(isRecording) {
  const btn = document.getElementById('wechat-real-voice-call-talk-btn');
  if (btn) {
    if (isRecording) {
      btn.classList.add('recording');
      btn.textContent = '点击 发送';
    } else {
      btn.classList.remove('recording');
      btn.textContent = '点击 说话';
    }
  }
}

/**
 * 添加通话消息
 */
function addCallMessage(role, content) {
  const messagesEl = document.getElementById('wechat-real-voice-call-messages');
  if (!messagesEl) return;

  callState.messages.push({ role, content });

  const msgDiv = document.createElement('div');
  msgDiv.className = `wechat-real-voice-call-msg ${role} fade-in`;

  // 显示文字内容
  const textSpan = document.createElement('span');
  textSpan.className = 'msg-text';
  textSpan.textContent = content;
  msgDiv.appendChild(textSpan);

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * 挂断电话（用户主动挂断）
 */
export async function hangupCall() {
  // 如果已经在挂断中，忽略
  if (callState.isHangingUp) return;
  callState.isHangingUp = true;

  // 先保存需要的值（后面状态会变）
  const wasConnected = callState.isConnected;
  const cachedVoices = callState.voiceCache ? [...callState.voiceCache] : [];
  const contactIdx = callState.contactIndex;
  const callTimestamp = callState.startTime || Date.now();

  console.log('[可乐] 挂断时状态:', { wasConnected, voiceCacheLength: cachedVoices.length });

  // 停止录音
  if (callState.recorder) {
    callState.recorder.cancel();
  }

  // 停止当前播放
  if (callState.currentAudio) {
    callState.currentAudio.pause();
    callState.currentAudio = null;
  }

  // 如果通话已接通，让 AI 说再见
  if (callState.isConnected && !callState.isProcessing) {
    try {
      updateStatus('对方正在说话...');

      // 调用 AI 生成告别语
      const { callRealVoiceAI } = await import('./ai.js');
      const goodbyePrompt = '[用户正在挂断电话，请简短地说再见，一句话即可]';

      const aiResponse = await Promise.race([
        callRealVoiceAI(
          callState.contact,
          goodbyePrompt,
          callState.messages,
          callState.initiator
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 5000))
      ]);

      const reply = cleanAIReply(aiResponse);
      if (reply) {
        addCallMessage('ai', reply);
        // TTS 播放告别语
        await speakText(reply);
      }
    } catch (err) {
      console.log('[可乐] AI告别语生成失败:', err.message);
    }
  }

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
    const contact = callState.contact;

    if (!contact.chatHistory) {
      contact.chatHistory = [];
    }

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    let callContent;
    let lastMessage;

    if (callState.isConnected) {
      callContent = `[实时语音:${durationStr}]`;
      lastMessage = `实时语音 ${durationStr}`;
    } else {
      if (callState.initiator === 'user') {
        if (callState.rejectedByAI) {
          callContent = '[实时语音:对方已拒绝]';
          lastMessage = '对方已拒绝';
        } else {
          callContent = '[实时语音:已取消]';
          lastMessage = '已取消';
        }
      } else if (callState.rejectedByUser) {
        callContent = '[实时语音:已拒绝]';
        lastMessage = '已拒绝';
      } else {
        callContent = '[实时语音:对方已取消]';
        lastMessage = '对方已取消';
      }
    }

    // 保存通话历史和对话内容
    if (callState.messages && callState.messages.length > 0) {
      // 有对话内容时，直接将对话内容保存到 chatHistory（不显示通话记录标记）
      contact.realVoiceCallHistory = Array.isArray(contact.realVoiceCallHistory) ? contact.realVoiceCallHistory : [];
      contact.realVoiceCallHistory.push({
        type: 'real-voice',
        initiator: callState.initiator,
        duration: durationStr,
        time: timeStr,
        timestamp: Date.now(),
        messages: callState.messages.map(m => ({ role: m.role, content: m.content }))
      });

      // 将通话对话内容保存到 chatHistory，让 AI 后续对话能识别
      callState.messages.forEach(msg => {
        contact.chatHistory.push({
          role: msg.role,
          content: msg.content,
          time: timeStr,
          timestamp: Date.now(),
          isRealVoiceContent: true  // 标记为实时通话内容
        });
      });

      // 刷新聊天界面显示对话内容
      if (currentChatIndex === callState.contactIndex) {
        openChat(currentChatIndex);
      }
    } else {
      // 没有对话内容时（取消/拒绝），显示通话记录标记
      const callRecord = {
        role: callState.initiator === 'user' ? 'user' : 'assistant',
        content: callContent,
        time: timeStr,
        timestamp: Date.now(),
        isCallRecord: true,
        isRealVoice: true
      };
      contact.chatHistory.push(callRecord);

      // 在聊天界面显示通话记录
      if (currentChatIndex === callState.contactIndex) {
        appendCallRecordMessage(callState.initiator === 'user' ? 'user' : 'assistant', durationStr, contact);
      }
    }

    contact.lastMessage = lastMessage;

    requestSave();
    refreshChatList();
  }

  // 隐藏通话页面
  const page = document.getElementById('wechat-real-voice-call-page');
  if (page) {
    page.classList.add('hidden');
  }

  clearInterval(callState.timerInterval);
  clearInterval(callState.dotsInterval);

  // 如果有缓存的语音，显示保存弹窗（使用之前保存的变量，因为 callState 可能已被修改）
  console.log('[可乐] 检查是否显示语音保存弹窗:', { wasConnected, cachedVoicesLength: cachedVoices.length });

  if (cachedVoices.length > 0 && wasConnected) {
    // 重置状态
    resetCallState();

    // 显示语音保存弹窗
    showVoiceSaveModal(cachedVoices, contactIdx, callTimestamp);
  } else {
    // 重置状态
    resetCallState();
  }
}

/**
 * 重置通话状态
 */
function resetCallState() {
  callState.isActive = false;
  callState.isConnected = false;
  callState.isHangingUp = false;
  callState.startTime = null;
  callState.isRecording = false;
  callState.isProcessing = false;
  callState.isPlaying = false;
  callState.voiceCache = [];
}

/**
 * 在聊天界面显示通话记录
 */
function appendCallRecordMessage(role, duration, contact) {
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

  // 麦克风图标
  const micIconSVG = `<svg class="wechat-call-record-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>`;

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-bubble wechat-call-record-bubble">
        <div class="wechat-call-record wechat-real-voice-record">
          ${micIconSVG}
          <span class="wechat-call-record-text">实时语音 ${duration}</span>
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * 接听来电
 */
function acceptIncomingCall() {
  if (!callState.isActive || callState.isConnected) return;
  onCallConnected();
}

/**
 * 拒绝来电
 */
function rejectIncomingCall() {
  if (!callState.isActive || callState.isConnected) return;
  callState.rejectedByUser = true;
  hangupCall();
}

/**
 * 切换静音
 */
function toggleMute() {
  callState.isMuted = !callState.isMuted;
  const muteBtn = document.getElementById('wechat-real-voice-call-mute');
  if (muteBtn) {
    const btn = muteBtn.querySelector('.wechat-real-voice-call-action-btn');
    const label = muteBtn.querySelector('.wechat-real-voice-call-action-label');
    if (btn) btn.classList.toggle('muted', callState.isMuted);
    if (label) label.textContent = callState.isMuted ? '已静音' : '静音';
  }
}

/**
 * 绑定事件
 */
let eventsBound = false;
function bindCallEvents() {
  if (eventsBound) return;
  eventsBound = true;

  // 挂断
  document.getElementById('wechat-real-voice-call-hangup')?.addEventListener('click', hangupCall);

  // 静音
  document.getElementById('wechat-real-voice-call-mute')?.addEventListener('click', toggleMute);

  // 最小化
  document.getElementById('wechat-real-voice-call-minimize')?.addEventListener('click', hangupCall);

  // 接听
  document.getElementById('wechat-real-voice-call-accept')?.addEventListener('click', acceptIncomingCall);

  // 拒绝
  document.getElementById('wechat-real-voice-call-reject')?.addEventListener('click', rejectIncomingCall);

  // 说话按钮（点击切换模式：点一次开始录音，再点一次停止录音）
  const talkBtn = document.getElementById('wechat-real-voice-call-talk-btn');
  if (talkBtn) {
    const toggleRecording = (e) => {
      e.preventDefault();
      if (callState.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };

    // PC 端点击事件
    talkBtn.addEventListener('click', toggleRecording);

    // 移动端触摸事件
    talkBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      toggleRecording(e);
    });
  }

  // 文字输入发送按钮（不支持录音时使用）
  const textSendBtn = document.getElementById('wechat-real-voice-call-text-send');
  const textInput = document.getElementById('wechat-real-voice-call-text-input');

  if (textSendBtn && textInput) {
    const sendTextMessage = async () => {
      const text = textInput.value.trim();
      if (!text || callState.isProcessing || callState.isPlaying) return;

      textInput.value = '';
      await processUserTextInput(text);
    };

    textSendBtn.addEventListener('click', sendTextMessage);

    // 回车发送
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendTextMessage();
      }
    });
  }
}

/**
 * 显示语音保存弹窗
 */
function showVoiceSaveModal(voiceList, contactIndex, callTimestamp) {
  const modal = document.getElementById('wechat-voice-save-modal');
  const listEl = document.getElementById('wechat-voice-save-list');

  if (!modal || !listEl) {
    console.log('[可乐] 语音保存弹窗元素不存在');
    return;
  }

  // 清空并填充列表
  listEl.innerHTML = '';

  voiceList.forEach((voice, index) => {
    const item = document.createElement('div');
    item.className = 'wechat-voice-save-item';
    item.dataset.index = index;

    const durationSec = Math.round(voice.duration || 0);
    const durationStr = durationSec > 0 ? `${durationSec}"` : '?秒';

    item.innerHTML = `
      <div class="wechat-voice-save-checkbox">
        <input type="checkbox" id="voice-save-${index}" checked>
        <label for="voice-save-${index}"></label>
      </div>
      <div class="wechat-voice-save-info">
        <div class="wechat-voice-save-text">${escapeHtml(voice.text.substring(0, 50))}${voice.text.length > 50 ? '...' : ''}</div>
        <div class="wechat-voice-save-duration">${durationStr}</div>
      </div>
      <button class="wechat-voice-save-play" data-index="${index}" title="试听">
        <svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
      </button>
    `;

    listEl.appendChild(item);
  });

  // 绑定试听按钮
  listEl.querySelectorAll('.wechat-voice-save-play').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const voice = voiceList[idx];
      if (voice && voice.audioBlob) {
        try {
          btn.disabled = true;
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>';

          const audioUrl = URL.createObjectURL(voice.audioBlob);
          const audio = new Audio(audioUrl);
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
          };
          await audio.play();
        } catch (err) {
          console.error('[可乐] 试听失败:', err);
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
        }
      }
    });
  });

  // 绑定保存按钮
  const confirmBtn = document.getElementById('wechat-voice-save-confirm');
  const skipBtn = document.getElementById('wechat-voice-save-skip');
  const cancelBtn = document.getElementById('wechat-voice-save-cancel');

  const closeModal = () => {
    modal.classList.add('hidden');
  };

  const handleSave = async () => {
    // 获取选中的语音
    const selectedVoices = [];
    listEl.querySelectorAll('.wechat-voice-save-item').forEach((item, idx) => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) {
        selectedVoices.push({
          contactIndex: contactIndex,
          callTimestamp: callTimestamp,
          text: voiceList[idx].text,
          audioBlob: voiceList[idx].audioBlob,
          duration: voiceList[idx].duration
        });
      }
    });

    if (selectedVoices.length > 0) {
      try {
        await saveVoiceRecordings(selectedVoices);
        showToast(`已保存 ${selectedVoices.length} 条语音`, '✓');
      } catch (err) {
        console.error('[可乐] 保存语音失败:', err);
        showToast('保存失败', '⚠️');
      }
    }

    closeModal();
  };

  // 移除旧的事件监听器
  const newConfirmBtn = confirmBtn.cloneNode(true);
  const newSkipBtn = skipBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);

  newConfirmBtn.addEventListener('click', handleSave);
  newSkipBtn.addEventListener('click', closeModal);

  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', closeModal);
  }

  // 显示弹窗
  modal.classList.remove('hidden');
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 初始化
 */
export function initRealVoiceCall() {
  // 事件绑定将在显示页面时进行
}

/**
 * 获取通话状态
 */
export function getRealVoiceCallState() {
  return {
    isActive: callState.isActive,
    isConnected: callState.isConnected,
    contactIndex: callState.contactIndex
  };
}
