/**
 * 一起听功能模块
 * 与AI角色一起听歌聊天
 */

import { getSettings, splitAIMessages } from './config.js';
import { currentChatIndex } from './chat.js';
import { requestSave } from './save-manager.js';
import { refreshChatList } from './ui.js';
import { searchMusic, playMusic, togglePlay, getCurrentSong, formatDuration } from './music.js';
import { showToast } from './toast.js';
import { escapeHtml, sleep } from './utils.js';

// ========== SVG 图标 ==========
const LISTEN_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z"/><path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const PREV_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="19" x2="5" y2="5"/></svg>';
const NEXT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/></svg>';
const CHAT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
const PLAYLIST_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const HEART_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
const LOOP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H3"/></svg>';

// ========== 状态管理 ==========
let listenState = {
  isActive: false,
  isConnected: false,
  currentSong: null,
  messages: [],
  contact: null,
  contactIndex: -1,
  startTime: null,
  isPlaying: false,
  connectTimeout: null,
  dotsInterval: null,
  chatVisible: false,
  audioElement: null,
  progressInterval: null,
  pauseTimeout: null,  // 暂停后自动播放下一首的计时器
  playMode: 'normal',  // 播放模式: 'normal' | 'loop' | 'shuffle'
  songsSinceAIChange: 0,  // AI换歌保底计数器
};

// 导出图标供其他模块使用
export { LISTEN_ICON };

// ========== 页面显示/隐藏 ==========

/**
 * 显示一起听搜索页面
 */
export function showListenSearchPage() {
  const page = document.getElementById('wechat-listen-search-page');
  if (page) {
    page.classList.remove('hidden');
    // 聚焦输入框
    setTimeout(() => {
      const input = document.getElementById('wechat-listen-search-input');
      if (input) input.focus();
    }, 100);
  }
}

/**
 * 隐藏一起听搜索页面
 */
export function hideListenSearchPage() {
  const page = document.getElementById('wechat-listen-search-page');
  if (page) page.classList.add('hidden');
}

/**
 * 显示等待页面
 */
function showWaitingPage(song, contact) {
  const page = document.getElementById('wechat-listen-waiting-page');
  if (!page) return;

  const settings = getSettings();

  // 调试日志
  console.log('[一起听等待页面] 数据检查:', {
    userAvatar: settings.userAvatar,
    contactAvatar: contact.avatar,
    songCover: song.cover,
    contactName: contact.name
  });

  // 小图显示用户头像
  const avatarEl = document.getElementById('wechat-listen-waiting-avatar');
  if (avatarEl) {
    // 先清除旧内容
    avatarEl.innerHTML = '';
    if (settings.userAvatar) {
      avatarEl.innerHTML = `<img src="${settings.userAvatar}" alt="">`;
    } else {
      avatarEl.textContent = (settings.userName || 'User').charAt(0);
    }
  }

  // 大图显示角色头像（带雷达动画的）
  const coverEl = document.getElementById('wechat-listen-waiting-cover');
  if (coverEl) {
    // 先清除旧值
    coverEl.src = '';
    coverEl.style.background = '';

    if (contact.avatar) {
      coverEl.src = contact.avatar;
    } else {
      // 如果没有头像，用纯色背景
      coverEl.style.background = '#333';
    }
  }

  // 设置角色名
  const nameEl = document.getElementById('wechat-listen-waiting-name');
  if (nameEl) {
    nameEl.textContent = contact.name || 'TA';
  }

  page.classList.remove('hidden');
}

/**
 * 隐藏等待页面
 */
function hideWaitingPage() {
  const page = document.getElementById('wechat-listen-waiting-page');
  if (page) page.classList.add('hidden');
  clearInterval(listenState.dotsInterval);
}

/**
 * 显示一起听主页面
 */
function showListenTogetherPage() {
  const page = document.getElementById('wechat-listen-together-page');
  if (!page) return;

  // 清空上次的聊天消息 DOM
  const messagesEl = document.getElementById('wechat-listen-messages');
  if (messagesEl) {
    messagesEl.innerHTML = '';
    messagesEl.classList.add('hidden');
  }

  const settings = getSettings();
  const contact = listenState.contact;
  const song = listenState.currentSong;

  // 设置用户头像
  const userAvatarEl = document.getElementById('wechat-listen-user-avatar');
  if (userAvatarEl) {
    if (settings.userAvatar) {
      userAvatarEl.innerHTML = `<img src="${settings.userAvatar}" alt="">`;
    } else {
      userAvatarEl.textContent = (settings.userName || 'User').charAt(0);
    }
  }

  // 设置AI头像
  const aiAvatarEl = document.getElementById('wechat-listen-ai-avatar');
  if (aiAvatarEl) {
    const firstChar = contact.name ? contact.name.charAt(0) : '?';
    if (contact.avatar) {
      aiAvatarEl.innerHTML = `<img src="${contact.avatar}" alt="">`;
    } else {
      aiAvatarEl.textContent = firstChar;
    }
  }

  // 设置歌曲信息
  const coverEl = document.getElementById('wechat-listen-cover');
  const nameEl = document.getElementById('wechat-listen-song-name');
  const artistEl = document.getElementById('wechat-listen-song-artist');

  if (coverEl && song.cover) coverEl.src = song.cover;
  if (nameEl) nameEl.textContent = song.name || '未知歌曲';
  if (artistEl) artistEl.textContent = song.artist || '未知歌手';

  // 初始化播放按钮状态
  updatePlayButton();

  page.classList.remove('hidden');
  bindListenEvents();
}

/**
 * 隐藏一起听主页面
 */
function hideListenTogetherPage() {
  const page = document.getElementById('wechat-listen-together-page');
  if (page) page.classList.add('hidden');
}

// ========== 核心逻辑 ==========

/**
 * 开始一起听
 * @param {Object} song - 歌曲信息
 * @param {number} contactIndex - 联系人索引
 */
export async function startListenTogether(song, contactIndex = currentChatIndex) {
  if (listenState.isActive) return;
  if (contactIndex < 0) {
    showToast('请先选择聊天对象');
    return;
  }

  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) {
    showToast('联系人不存在');
    return;
  }

  // 初始化状态
  listenState = {
    isActive: true,
    isConnected: false,
    currentSong: song,
    messages: [],
    contact: contact,
    contactIndex: contactIndex,
    startTime: null,
    isPlaying: false,
    connectTimeout: null,
    dotsInterval: null,
    chatVisible: false,
    audioElement: null,
    progressInterval: null,
    pauseTimeout: null,
    playMode: 'normal',
    songsSinceAIChange: 0,
  };

  // 隐藏搜索页，显示等待页面
  hideListenSearchPage();
  showWaitingPage(song, contact);

  // 开始等待动画
  startWaitingAnimation();

  // 2-4秒后AI"加入"
  const joinDelay = 2000 + Math.random() * 2000;
  listenState.connectTimeout = setTimeout(() => {
    if (listenState.isActive && !listenState.isConnected) {
      onAIJoined();
    }
  }, joinDelay);
}

/**
 * 开始等待动画
 */
function startWaitingAnimation() {
  const dotsEl = document.getElementById('wechat-listen-waiting-dots');
  if (!dotsEl) return;

  let dotCount = 0;
  clearInterval(listenState.dotsInterval);

  listenState.dotsInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dotsEl.textContent = '.'.repeat(dotCount || 1);
  }, 500);
}

/**
 * AI加入后
 */
async function onAIJoined() {
  listenState.isConnected = true;
  listenState.startTime = Date.now();

  clearInterval(listenState.dotsInterval);
  clearTimeout(listenState.connectTimeout);

  // 隐藏等待页面，显示主页面
  hideWaitingPage();
  showListenTogetherPage();

  // 开始播放音乐
  await playListenSong();

  // AI主动发送第一条消息
  await triggerAIGreeting();
}

/**
 * 播放当前歌曲
 */
async function playListenSong() {
  const song = listenState.currentSong;
  if (!song) return;

  try {
    // 使用music.js的playMusic函数
    await playMusic(song.id, song.platform, song.name, song.artist);
    listenState.isPlaying = true;
    updatePlayButton();
    startProgressUpdate();

    // 监听歌曲结束事件
    const audio = document.getElementById('wechat-music-audio');
    if (audio) {
      listenState.audioElement = audio;
      audio.addEventListener('ended', onSongEnded);
    }
  } catch (e) {
    console.error('[可乐] 一起听播放失败:', e);
    showToast('播放失败');
  }
}

/**
 * 歌曲结束时的处理
 */
async function onSongEnded() {
  if (!listenState.isActive) return;

  listenState.isPlaying = false;
  updatePlayButton();

  // 计数器+1
  listenState.songsSinceAIChange++;

  // 20%几率AI换歌，或保底5首必换（所有模式下都有效）
  if (Math.random() < 0.2 || listenState.songsSinceAIChange >= 5) {
    listenState.songsSinceAIChange = 0;  // 重置计数器
    await aiSelectSong();
    return;
  }

  // 根据播放模式处理
  if (listenState.playMode === 'loop') {
    // 单曲循环：重新播放当前歌曲
    await playListenSong();
  } else if (listenState.playMode === 'shuffle') {
    // 随机播放：播放随机歌曲
    await playRandomSong();
  }
  // 正常模式不做处理，等待用户操作
}

/**
 * 切换单曲循环模式
 */
function toggleLoopMode() {
  const loopBtn = document.getElementById('wechat-listen-loop-btn');
  const shuffleBtn = document.getElementById('wechat-listen-shuffle-btn');

  if (listenState.playMode === 'loop') {
    // 取消单曲循环
    listenState.playMode = 'normal';
    loopBtn?.classList.remove('active');
    showToast('已关闭单曲循环');
  } else {
    // 开启单曲循环
    listenState.playMode = 'loop';
    loopBtn?.classList.add('active');
    shuffleBtn?.classList.remove('active');
    showToast('单曲循环');
  }
}

/**
 * 切换随机播放模式
 */
function toggleShuffleMode() {
  const loopBtn = document.getElementById('wechat-listen-loop-btn');
  const shuffleBtn = document.getElementById('wechat-listen-shuffle-btn');

  if (listenState.playMode === 'shuffle') {
    // 取消随机播放
    listenState.playMode = 'normal';
    shuffleBtn?.classList.remove('active');
    showToast('已关闭随机播放');
  } else {
    // 开启随机播放
    listenState.playMode = 'shuffle';
    shuffleBtn?.classList.add('active');
    loopBtn?.classList.remove('active');
    showToast('随机播放');
  }
}

/**
 * 随机播放歌曲
 */
async function playRandomSong() {
  try {
    // 随机关键词列表
    const keywords = [
      '热门', '流行', '经典', '抖音', '网红',
      '伤感', '甜蜜', '治愈', '怀旧', '浪漫',
      '周杰伦', '林俊杰', '邓紫棋', '薛之谦', '陈奕迅',
      'Taylor Swift', 'Ed Sheeran', 'Bruno Mars',
      '说唱', '民谣', '摇滚', '电子', 'R&B'
    ];
    const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];

    // 搜索歌曲
    const results = await searchMusic(randomKeyword);
    if (results && results.length > 0) {
      // 随机选择一首
      const randomIndex = Math.floor(Math.random() * Math.min(results.length, 10));
      const newSong = results[randomIndex];

      listenState.currentSong = newSong;

      // 更新界面
      const coverEl = document.getElementById('wechat-listen-cover');
      const nameEl = document.getElementById('wechat-listen-song-name');
      const artistEl = document.getElementById('wechat-listen-song-artist');

      if (coverEl && newSong.cover) coverEl.src = newSong.cover;
      if (nameEl) nameEl.textContent = newSong.name || '未知歌曲';
      if (artistEl) artistEl.textContent = newSong.artist || '未知歌手';

      // 播放
      await playMusic(newSong.id, newSong.platform, newSong.name, newSong.artist);
      listenState.isPlaying = true;
      updatePlayButton();

      // AI对新歌的反应
      await triggerAIAutoNextReaction(newSong);
    }
  } catch (e) {
    console.error('[可乐] 随机播放失败:', e);
  }
}

/**
 * AI选择歌曲（20%几率触发）
 */
async function aiSelectSong() {
  if (!listenState.isConnected || !listenState.contact) return;

  try {
    const { callListenTogetherAI } = await import('./ai.js');

    // 获取最近5条消息
    const recentMessages = listenState.messages.slice(-5);
    const messagesContext = recentMessages.map(m =>
      `${m.role === 'user' ? '用户' : '你'}: ${m.content}`
    ).join('\n');

    // 构建AI选歌的prompt
    const prompt = `[这首歌播放完了，请你选择下一首想听的歌，根据你们刚才的聊天氛围和你的喜好来选。

最近的对话：
${messagesContext || '（刚开始听歌）'}

请回复格式：
1. 先说一句为什么想听这首歌（简短自然，1-2句话）
2. 然后用 [换歌:歌名] 格式选择歌曲

示例：突然想听点轻快的|||[换歌:晴天]]`;

    showListenTypingIndicator();
    const aiResponse = await callListenTogetherAI(listenState.contact, prompt, recentMessages, listenState.currentSong);
    hideListenTypingIndicator();

    if (aiResponse) {
      // 处理回复
      const parts = splitAIMessages(aiResponse);
      for (const part of parts) {
        const text = filterListenMessage(part);

        // 检查是否包含换歌标签
        const changeSongMatch = text.match(/\[换歌[：:]\s*(.+?)\]/);
        if (changeSongMatch) {
          const songKeyword = changeSongMatch[1].trim();
          // 显示AI的说明文字（去掉换歌标签）
          const displayText = text.replace(/\[换歌[：:][^\]]*\]/g, '').trim();
          if (displayText) {
            addListenMessage('ai', displayText);
          }
          // 搜索并播放新歌
          await changeSongByKeyword(songKeyword, true);
          break;
        } else if (text) {
          addListenMessage('ai', text);
        }
      }
    }
  } catch (err) {
    console.error('[可乐] AI选歌失败:', err);
    hideListenTypingIndicator();
  }
}

/**
 * 根据关键词换歌
 */
async function changeSongByKeyword(keyword, isAIChange = false) {
  try {
    const results = await searchMusic(keyword);
    if (results && results.length > 0) {
      const newSong = results[0];
      listenState.currentSong = newSong;

      // 更新界面
      const coverEl = document.getElementById('wechat-listen-cover');
      const nameEl = document.getElementById('wechat-listen-song-name');
      const artistEl = document.getElementById('wechat-listen-song-artist');

      if (coverEl) coverEl.src = newSong.cover || '';
      if (nameEl) nameEl.textContent = newSong.name || '未知歌曲';
      if (artistEl) artistEl.textContent = newSong.artist || '未知歌手';

      // 播放新歌
      await playListenSong();

      // 如果不是AI换的歌，通知AI对换歌做出反应
      if (!isAIChange) {
        await triggerAISongChangeReaction(newSong);
      }
    } else {
      showToast('未找到歌曲');
    }
  } catch (e) {
    console.error('[可乐] 换歌失败:', e);
    showToast('换歌失败');
  }
}

/**
 * AI对用户换歌的反应
 */
async function triggerAISongChangeReaction(newSong) {
  if (!listenState.isConnected || !listenState.contact) return;

  try {
    const { callListenTogetherAI } = await import('./ai.js');

    const prompt = `[用户换了一首歌，新歌是《${newSong.name}》- ${newSong.artist}。请对换歌做出反应，表达你对这首歌的看法或感受。记得发送2-4条消息，每条换行分隔]`;

    showListenTypingIndicator();
    const aiResponse = await callListenTogetherAI(
      listenState.contact,
      prompt,
      listenState.messages.slice(-5),
      newSong
    );
    hideListenTypingIndicator();

    await processAIResponse(aiResponse);
  } catch (err) {
    hideListenTypingIndicator();
    console.error('[可乐] AI换歌反应失败:', err);
  }
}

/**
 * AI主动发送开场消息
 */
async function triggerAIGreeting() {
  if (!listenState.isConnected || !listenState.contact) return;

  showListenTypingIndicator();

  try {
    const { callListenTogetherAI } = await import('./ai.js');
    const song = listenState.currentSong;

    const prompt = `[用户邀请你一起听歌，歌曲是《${song.name}》- ${song.artist}，你刚刚加入了一起听。请用你的方式自然地打个招呼，并对这首歌发表一些看法。记得发送2-4条消息，每条换行分隔，像真实聊天一样有层次感]`;

    const aiResponse = await callListenTogetherAI(
      listenState.contact,
      prompt,
      [],
      song
    );

    hideListenTypingIndicator();
    await processAIResponse(aiResponse);

  } catch (err) {
    hideListenTypingIndicator();
    console.error('[可乐] 一起听AI开场白失败:', err);
  }
}

/**
 * 过滤消息 - 只允许纯文字，过滤所有特殊格式
 */
function filterListenMessage(text) {
  if (!text) return '';

  let reply = text.trim();

  // 过滤 meme 表情包
  reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();
  // 过滤 [表情:xxx]
  reply = reply.replace(/\[表情\s*[：:∶][^\]]*\]/g, '').trim();
  // 过滤 [照片:xxx]
  reply = reply.replace(/\[照片[：:][^\]]*\]/g, '').trim();
  // 过滤 [语音:xxx]
  reply = reply.replace(/\[语音[：:][^\]]*\]/g, '').trim();
  // 过滤 [音乐:xxx]（但保留[换歌:xxx]）
  reply = reply.replace(/\[(?:分享)?音乐[：:][^\]]*\]/g, '').trim();
  // 过滤 [回复:xxx] 引用格式
  reply = reply.replace(/\[回复[：:][^\]]*\]/g, '').trim();
  // 过滤中文小括号内容（动作/语气描述）
  reply = reply.replace(/（[^）]*）/g, '').trim();
  // 过滤英文小括号内容
  reply = reply.replace(/\([^)]*\)/g, '').trim();

  return reply;
}

/**
 * 处理AI回复 - 纯文字消息，按换行分条发送
 */
async function processAIResponse(aiResponse) {
  if (!aiResponse) return;

  // 先用 ||| 分割，再按换行分割
  let parts = splitAIMessages(aiResponse);

  // 对每个部分再按换行分割
  const allParts = [];
  for (const part of parts) {
    // 按换行符分割成多条消息
    const lines = part.split(/\n+/).map(l => l.trim()).filter(l => l);
    allParts.push(...lines);
  }

  for (const part of allParts) {
    if (!listenState.isConnected) break;

    let reply = filterListenMessage(part);
    if (!reply) continue;

    // 检查是否包含换歌标签
    const changeSongMatch = reply.match(/\[换歌[：:]\s*(.+?)\]/);
    if (changeSongMatch) {
      const songKeyword = changeSongMatch[1].trim();
      // 显示AI的说明文字（去掉换歌标签）
      const displayText = reply.replace(/\[换歌[：:][^\]]*\]/g, '').trim();
      if (displayText) {
        showListenTypingIndicator();
        await sleep(400 + Math.random() * 600);
        hideListenTypingIndicator();
        addListenMessage('ai', displayText);
      }
      // 搜索并播放新歌
      await changeSongByKeyword(songKeyword, true);
      continue;
    }

    // 直接发送纯文字消息
    showListenTypingIndicator();
    await sleep(400 + Math.random() * 600);
    hideListenTypingIndicator();
    if (listenState.isConnected) {
      addListenMessage('ai', reply);
    }
  }
}

/**
 * 用户发送消息
 */
async function sendListenMessage() {
  const input = document.getElementById('wechat-listen-input-text');
  if (!input) return;

  const message = input.value.trim();
  if (!message || !listenState.isConnected) return;

  input.value = '';

  // 显示用户消息
  addListenMessage('user', message);

  // 显示typing
  showListenTypingIndicator();

  try {
    const { callListenTogetherAI } = await import('./ai.js');
    const song = listenState.currentSong;

    const aiResponse = await callListenTogetherAI(
      listenState.contact,
      message,
      listenState.messages.slice(0, -1),
      song
    );

    hideListenTypingIndicator();
    await processAIResponse(aiResponse);

  } catch (err) {
    hideListenTypingIndicator();
    console.error('[可乐] 一起听消息回复失败:', err);
  }
}

// ========== UI 更新 ==========

/**
 * 显示typing指示器
 */
function showListenTypingIndicator() {
  const messagesEl = document.getElementById('wechat-listen-messages');
  if (!messagesEl) return;

  messagesEl.classList.remove('hidden');
  hideListenTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-listen-msg ai';
  typingDiv.id = 'wechat-listen-typing';
  typingDiv.innerHTML = `
    <div class="wechat-listen-typing">
      <span class="wechat-typing-dot"></span>
      <span class="wechat-typing-dot"></span>
      <span class="wechat-typing-dot"></span>
    </div>
  `;

  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * 隐藏typing指示器
 */
function hideListenTypingIndicator() {
  const typingEl = document.getElementById('wechat-listen-typing');
  if (typingEl) typingEl.remove();
}

/**
 * 添加聊天消息
 */
function addListenMessage(role, content) {
  const messagesEl = document.getElementById('wechat-listen-messages');
  if (!messagesEl) return;

  messagesEl.classList.remove('hidden');

  // 添加到状态
  listenState.messages.push({ role, content, timestamp: Date.now() });

  // 创建消息元素
  const msgDiv = document.createElement('div');
  msgDiv.className = `wechat-listen-msg ${role} fade-in`;
  msgDiv.textContent = content;

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // 限制显示的消息数量
  const msgs = messagesEl.querySelectorAll('.wechat-listen-msg:not(#wechat-listen-typing)');
  if (msgs.length > 15) {
    msgs[0].remove();
  }
}

/**
 * 更新播放按钮状态
 */
function updatePlayButton() {
  const playBtn = document.getElementById('wechat-listen-play-btn');
  if (playBtn) {
    playBtn.innerHTML = listenState.isPlaying ? PAUSE_ICON : PLAY_ICON;
  }

  // 更新唱片旋转
  const disc = document.getElementById('wechat-listen-disc');
  if (disc) {
    if (listenState.isPlaying) {
      disc.classList.add('rotating');
      disc.classList.remove('paused');
    } else {
      disc.classList.add('paused');
    }
  }
}

/**
 * 处理播放/暂停点击
 * 暂停3秒后自动播放下一首
 */
function handlePlayPauseClick() {
  togglePlay();
  listenState.isPlaying = !listenState.isPlaying;
  updatePlayButton();

  // 清除之前的暂停计时器
  if (listenState.pauseTimeout) {
    clearTimeout(listenState.pauseTimeout);
    listenState.pauseTimeout = null;
  }

  // 如果暂停了，启动3秒后自动播放下一首的计时器
  if (!listenState.isPlaying && listenState.isActive) {
    listenState.pauseTimeout = setTimeout(async () => {
      if (!listenState.isPlaying && listenState.isActive) {
        await autoPlayNextSong();
      }
    }, 3000);
  }
}

/**
 * 自动播放下一首歌（暂停3秒后触发）
 */
async function autoPlayNextSong() {
  if (!listenState.isActive || !listenState.currentSong) return;

  try {
    // 搜索相似歌曲或随机歌曲
    const currentSong = listenState.currentSong;
    const keyword = currentSong.artist || currentSong.name;

    const results = await searchMusic(keyword);
    if (results && results.length > 1) {
      // 找一首不同的歌
      const newSong = results.find(s => s.id !== currentSong.id) || results[1];

      listenState.currentSong = newSong;

      // 更新界面
      const coverEl = document.getElementById('wechat-listen-cover');
      const nameEl = document.getElementById('wechat-listen-song-name');
      const artistEl = document.getElementById('wechat-listen-song-artist');

      if (coverEl) coverEl.src = newSong.cover || '';
      if (nameEl) nameEl.textContent = newSong.name || '未知歌曲';
      if (artistEl) artistEl.textContent = newSong.artist || '未知歌手';

      // 播放新歌
      await playListenSong();

      // AI 对自动换歌做出反应
      await triggerAIAutoNextReaction(newSong);
    }
  } catch (e) {
    console.error('[可乐] 自动播放下一首失败:', e);
  }
}

/**
 * AI 对自动换歌的反应
 */
async function triggerAIAutoNextReaction(newSong) {
  if (!listenState.isConnected || !listenState.contact) return;

  try {
    const { callListenTogetherAI } = await import('./ai.js');

    const prompt = `[歌曲自动切换到了《${newSong.name}》- ${newSong.artist}，请对新歌做出反应，发送2-3条消息，每条换行分隔]`;

    showListenTypingIndicator();
    const aiResponse = await callListenTogetherAI(
      listenState.contact,
      prompt,
      listenState.messages.slice(-3),
      newSong
    );
    hideListenTypingIndicator();

    await processAIResponse(aiResponse);
  } catch (err) {
    hideListenTypingIndicator();
    console.error('[可乐] AI自动换歌反应失败:', err);
  }
}

/**
 * 开始进度条更新
 */
function startProgressUpdate() {
  clearInterval(listenState.progressInterval);

  listenState.progressInterval = setInterval(() => {
    const audio = listenState.audioElement || document.getElementById('wechat-music-audio');
    if (!audio) return;

    const currentTime = audio.currentTime || 0;
    const duration = audio.duration || 0;
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const currentEl = document.getElementById('wechat-listen-current-time');
    const durationEl = document.getElementById('wechat-listen-duration');
    const fillEl = document.getElementById('wechat-listen-progress-fill');
    const sliderEl = document.getElementById('wechat-listen-slider');

    if (currentEl) currentEl.textContent = formatDuration(currentTime);
    if (durationEl) durationEl.textContent = formatDuration(duration);
    if (fillEl) fillEl.style.width = progress + '%';
    if (sliderEl) sliderEl.value = progress;
  }, 500);
}

// ========== 事件绑定 ==========

let listenEventsBound = false;
let searchEventsBound = false;

/**
 * 绑定搜索页面事件
 */
export function bindListenSearchEvents() {
  if (searchEventsBound) return;
  searchEventsBound = true;

  // 返回按钮
  document.getElementById('wechat-listen-search-back')?.addEventListener('click', () => {
    hideListenSearchPage();
  });

  // 搜索输入
  const searchInput = document.getElementById('wechat-listen-search-input');
  let searchTimeout = null;

  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      doListenSearch(e.target.value.trim());
    }, 500);
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      doListenSearch(e.target.value.trim());
    }
  });

  // 搜索结果点击
  document.getElementById('wechat-listen-search-results')?.addEventListener('click', (e) => {
    const item = e.target.closest('.wechat-listen-search-item');
    if (!item) return;

    const song = {
      id: item.dataset.id,
      platform: item.dataset.platform,
      name: item.dataset.name,
      artist: item.dataset.artist,
      cover: item.dataset.cover,
    };

    startListenTogether(song);
  });
}

/**
 * 执行搜索
 */
async function doListenSearch(keyword) {
  const resultsEl = document.getElementById('wechat-listen-search-results');
  if (!resultsEl) return;

  if (!keyword) {
    resultsEl.innerHTML = '<div class="wechat-listen-search-empty">输入关键词搜索歌曲</div>';
    return;
  }

  resultsEl.innerHTML = '<div class="wechat-listen-search-loading">搜索中...</div>';

  try {
    const results = await searchMusic(keyword);

    if (!results || results.length === 0) {
      resultsEl.innerHTML = '<div class="wechat-listen-search-empty">未找到结果</div>';
      return;
    }

    let html = '';
    for (const song of results) {
      html += `
        <div class="wechat-listen-search-item"
             data-id="${escapeHtml(song.id)}"
             data-platform="${escapeHtml(song.platform)}"
             data-name="${escapeHtml(song.name)}"
             data-artist="${escapeHtml(song.artist)}"
             data-cover="${escapeHtml(song.cover || '')}">
          <div class="wechat-listen-search-cover">
            <img src="${escapeHtml(song.cover || '')}" alt="" onerror="this.style.display='none'">
          </div>
          <div class="wechat-listen-search-info">
            <div class="wechat-listen-search-name">${escapeHtml(song.name)}</div>
            <div class="wechat-listen-search-artist">${escapeHtml(song.artist)} - ${escapeHtml(song.platform)}</div>
          </div>
        </div>
      `;
    }
    resultsEl.innerHTML = html;

  } catch (err) {
    console.error('[可乐] 一起听搜索失败:', err);
    resultsEl.innerHTML = '<div class="wechat-listen-search-empty">搜索失败</div>';
  }
}

/**
 * 绑定一起听主页面事件
 */
function bindListenEvents() {
  if (listenEventsBound) return;
  listenEventsBound = true;

  // 发送消息
  document.getElementById('wechat-listen-send-btn')?.addEventListener('click', sendListenMessage);

  // 输入框回车发送
  document.getElementById('wechat-listen-input-text')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendListenMessage();
    }
  });

  // 播放/暂停
  document.getElementById('wechat-listen-play-btn')?.addEventListener('click', handlePlayPauseClick);

  // 搜索按钮 - 打开换歌面板
  document.getElementById('wechat-listen-search-btn')?.addEventListener('click', showChangeSongPanel);

  // 单曲循环按钮
  document.getElementById('wechat-listen-loop-btn')?.addEventListener('click', toggleLoopMode);

  // 随机播放按钮
  document.getElementById('wechat-listen-shuffle-btn')?.addEventListener('click', toggleShuffleMode);

  // 结束按钮
  document.getElementById('wechat-listen-end-btn')?.addEventListener('click', exitListenTogether);

  // 颜色按钮 - 打开颜色选择器
  document.getElementById('wechat-listen-color-btn')?.addEventListener('click', toggleColorPicker);

  // 颜色选择器选项点击
  document.getElementById('wechat-listen-color-picker')?.addEventListener('click', handleColorOptionClick);

  // 换歌面板关闭
  document.getElementById('wechat-listen-change-close')?.addEventListener('click', hideChangeSongPanel);

  // 换歌搜索
  const changeInput = document.getElementById('wechat-listen-change-input');
  let changeSearchTimeout = null;

  changeInput?.addEventListener('input', (e) => {
    clearTimeout(changeSearchTimeout);
    changeSearchTimeout = setTimeout(() => {
      doChangeSongSearch(e.target.value.trim());
    }, 500);
  });

  // 换歌搜索结果点击
  document.getElementById('wechat-listen-change-results')?.addEventListener('click', (e) => {
    const item = e.target.closest('.wechat-listen-change-item');
    if (!item) return;

    const song = {
      id: item.dataset.id,
      platform: item.dataset.platform,
      name: item.dataset.name,
      artist: item.dataset.artist,
      cover: item.dataset.cover,
    };

    changeSong(song);
    hideChangeSongPanel();
  });

  // 取消一起听
  document.getElementById('wechat-listen-cancel')?.addEventListener('click', cancelListenTogether);

  // 返回按钮（主页面的返回）
  document.getElementById('wechat-listen-back-btn')?.addEventListener('click', exitListenTogether);

  // 进度条拖动
  const slider = document.getElementById('wechat-listen-slider');
  slider?.addEventListener('change', (e) => {
    const audio = listenState.audioElement || document.getElementById('wechat-music-audio');
    if (audio && audio.duration) {
      audio.currentTime = (e.target.value / 100) * audio.duration;
    }
  });
}

/**
 * 背景颜色映射
 */
const LISTEN_BACKGROUNDS = {
  'starry': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 60%, #533483 100%)',
  'orange': 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
  'pink': 'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #f9a8d4 100%)',
  'white': '#fff'
};
let currentBg = 'starry';

/**
 * 切换颜色选择器显示
 */
function toggleColorPicker() {
  const picker = document.getElementById('wechat-listen-color-picker');
  if (picker) {
    picker.classList.toggle('hidden');
  }
}

/**
 * 隐藏颜色选择器
 */
function hideColorPicker() {
  const picker = document.getElementById('wechat-listen-color-picker');
  if (picker) {
    picker.classList.add('hidden');
  }
}

/**
 * 处理颜色选项点击
 */
function handleColorOptionClick(e) {
  const option = e.target.closest('.wechat-listen-color-option');
  if (!option) return;

  const bgType = option.dataset.bg;
  if (!bgType || !LISTEN_BACKGROUNDS[bgType]) return;

  // 更新页面背景
  const page = document.getElementById('wechat-listen-together-page');
  if (page) {
    page.style.background = LISTEN_BACKGROUNDS[bgType];

    // 如果是白色背景，需要调整文字颜色
    if (bgType === 'white') {
      page.classList.add('light-bg');
    } else {
      page.classList.remove('light-bg');
    }
  }

  // 更新选中状态
  document.querySelectorAll('.wechat-listen-color-option').forEach(opt => {
    opt.classList.remove('active');
  });
  option.classList.add('active');

  currentBg = bgType;
  hideColorPicker();
}

/**
 * 显示换歌面板
 */
function showChangeSongPanel() {
  const panel = document.getElementById('wechat-listen-change-panel');
  if (panel) {
    panel.classList.remove('hidden');
    document.getElementById('wechat-listen-change-input')?.focus();
  }
}

/**
 * 隐藏换歌面板
 */
function hideChangeSongPanel() {
  const panel = document.getElementById('wechat-listen-change-panel');
  if (panel) panel.classList.add('hidden');
}

/**
 * 换歌搜索
 */
async function doChangeSongSearch(keyword) {
  const resultsEl = document.getElementById('wechat-listen-change-results');
  if (!resultsEl) return;

  if (!keyword) {
    resultsEl.innerHTML = '';
    return;
  }

  resultsEl.innerHTML = '<div class="wechat-listen-change-loading">搜索中...</div>';

  try {
    const results = await searchMusic(keyword);

    if (!results || results.length === 0) {
      resultsEl.innerHTML = '<div class="wechat-listen-change-empty">未找到结果</div>';
      return;
    }

    let html = '';
    for (const song of results.slice(0, 10)) {
      html += `
        <div class="wechat-listen-change-item"
             data-id="${escapeHtml(song.id)}"
             data-platform="${escapeHtml(song.platform)}"
             data-name="${escapeHtml(song.name)}"
             data-artist="${escapeHtml(song.artist)}"
             data-cover="${escapeHtml(song.cover || '')}">
          <div class="wechat-listen-change-name">${escapeHtml(song.name)}</div>
          <div class="wechat-listen-change-artist">${escapeHtml(song.artist)}</div>
        </div>
      `;
    }
    resultsEl.innerHTML = html;

  } catch (err) {
    resultsEl.innerHTML = '<div class="wechat-listen-change-empty">搜索失败</div>';
  }
}

/**
 * 换歌
 */
async function changeSong(song) {
  listenState.currentSong = song;

  // 更新界面
  const coverEl = document.getElementById('wechat-listen-cover');
  const nameEl = document.getElementById('wechat-listen-song-name');
  const artistEl = document.getElementById('wechat-listen-song-artist');

  if (coverEl) coverEl.src = song.cover || '';
  if (nameEl) nameEl.textContent = song.name || '未知歌曲';
  if (artistEl) artistEl.textContent = song.artist || '未知歌手';

  // 播放新歌
  await playListenSong();

  // 通知AI对换歌做出反应
  await triggerAISongChangeReaction(song);
}

/**
 * 取消一起听（等待页面）
 */
function cancelListenTogether() {
  clearInterval(listenState.dotsInterval);
  clearTimeout(listenState.connectTimeout);
  clearInterval(listenState.progressInterval);
  clearTimeout(listenState.pauseTimeout);

  hideWaitingPage();

  listenState = {
    isActive: false,
    isConnected: false,
    currentSong: null,
    messages: [],
    contact: null,
    contactIndex: -1,
    startTime: null,
    isPlaying: false,
    connectTimeout: null,
    dotsInterval: null,
    chatVisible: false,
    audioElement: null,
    progressInterval: null,
    pauseTimeout: null,
    playMode: 'normal',
    songsSinceAIChange: 0,
  };
}

/**
 * 退出一起听
 */
export async function exitListenTogether() {
  if (!listenState.isActive) return;

  clearInterval(listenState.dotsInterval);
  clearTimeout(listenState.connectTimeout);
  clearInterval(listenState.progressInterval);
  clearTimeout(listenState.pauseTimeout);

  // 移除音频结束监听
  if (listenState.audioElement) {
    listenState.audioElement.removeEventListener('ended', onSongEnded);
  }

  // 保存一起听记录（不显示在聊天里）
  const contact = listenState.contact;
  const song = listenState.currentSong;
  const messages = [...listenState.messages];

  if (contact && messages.length > 0) {
    saveListenHistory();
  }

  // 隐藏所有页面
  hideWaitingPage();
  hideListenTogetherPage();
  hideListenSearchPage();
  hideChangeSongPanel();

  // 重置状态
  listenState = {
    isActive: false,
    isConnected: false,
    currentSong: null,
    messages: [],
    contact: null,
    contactIndex: -1,
    startTime: null,
    isPlaying: false,
    connectTimeout: null,
    dotsInterval: null,
    chatVisible: false,
    audioElement: null,
    progressInterval: null,
    pauseTimeout: null,
    playMode: 'normal',
    songsSinceAIChange: 0,
  };

  // AI 结束一起听后的回复
  if (contact && song) {
    await triggerAIListenEndReply(contact, song, messages);
  }
}

/**
 * AI 结束一起听后的回复
 */
async function triggerAIListenEndReply(contact, song, messages) {
  try {
    const { callAI } = await import('./ai.js');
    const { appendMessage, showTypingIndicator, hideTypingIndicator } = await import('./chat.js');

    // 显示打字指示器
    showTypingIndicator(contact);

    // 构建提示
    const recentMsgs = messages.slice(-5).map(m =>
      `${m.role === 'user' ? '用户' : '你'}: ${m.content}`
    ).join('\n');

    const prompt = `[刚才和用户一起听了《${song.name}》- ${song.artist}，一起听已经结束了。请根据刚才的聊天氛围，说一句告别或感想，简短自然，不要使用任何特殊格式标签。

刚才的聊天：
${recentMsgs || '（没有聊天）'}]`;

    const aiResponse = await callAI(contact, prompt);
    hideTypingIndicator();

    if (aiResponse && aiResponse.trim()) {
      let reply = aiResponse.split('|||')[0].trim();
      reply = reply.replace(/^\[.*?\]\s*/, '');
      reply = reply.replace(/<\s*meme\s*>[\s\S]*?<\s*\/\s*meme\s*>/gi, '').trim();

      if (reply) {
        const settings = getSettings();
        const now = new Date();
        const timeStr = now.toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).replace(/\//g, '-');

        // 添加到聊天历史
        if (!contact.chatHistory) contact.chatHistory = [];
        contact.chatHistory.push({
          role: 'assistant',
          content: reply,
          time: timeStr,
          timestamp: Date.now()
        });

        appendMessage('assistant', reply, contact);
        contact.lastMessage = reply;
        requestSave();
        refreshChatList();
      }
    }
  } catch (err) {
    console.error('[可乐] AI一起听结束回复失败:', err);
    // 隐藏typing
    import('./chat.js').then(m => m.hideTypingIndicator());
  }
}

/**
 * 保存一起听历史记录（不显示在聊天中）
 */
function saveListenHistory() {
  const settings = getSettings();
  const contact = listenState.contact;

  if (!contact) return;

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 计算时长
  let durationStr = '00:00';
  if (listenState.startTime) {
    const elapsed = Math.floor((Date.now() - listenState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    durationStr = `${minutes}:${seconds}`;
  }

  // 保存到联系人的一起听历史（仅保存记录，不显示在聊天中）
  if (!Array.isArray(contact.listenHistory)) {
    contact.listenHistory = [];
  }

  contact.listenHistory.push({
    song: listenState.currentSong,
    duration: durationStr,
    time: timeStr,
    timestamp: Date.now(),
    messages: listenState.messages.map(m => ({ role: m.role, content: m.content }))
  });

  // 限制历史记录数量
  if (contact.listenHistory.length > 50) {
    contact.listenHistory = contact.listenHistory.slice(-50);
  }

  requestSave();
}

/**
 * 初始化一起听功能
 */
export function initListenTogether() {
  bindListenSearchEvents();
}