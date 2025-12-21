import { showToast } from './toast.js';

const BASE_URL = 'https://music-dl.sayqz.com';

let currentSong = null;
let isPlaying = false;
let musicEventsInited = false;
let miniPlayerInited = false;
let miniPlayerExpanded = false;
let floatingLyricsVisible = false;
let parsedLyrics = [];
let singleLineLyricsVisible = false;
let singleLineLyricsLocked = false;
let playMode = 'list'; // 'single' | 'random' | 'list'
let playlist = []; // 播放列表
let currentPlayIndex = -1;

const PLAY_ICON = '<svg viewBox="0 0 24 24" width="24" height="24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>';
const PLAY_ICON_SMALL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6,4 20,12 6,20"/></svg>';
const PAUSE_ICON_SMALL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/></svg>';
const LYRICS_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h12M4 18h8"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
const UNLOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';

// 歌词颜色
let lyricsColor = 'green';
const LYRICS_COLORS = ['blue', 'yellow', 'pink', 'green', 'black'];

// 播放模式图标
const MODE_SINGLE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H3"/><path d="M11 10v4h2" stroke-width="2"/></svg>';
const MODE_RANDOM_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>';
const MODE_LIST_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H3"/></svg>';
const PLAYLIST_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h8"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>';

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ':' + secs.toString().padStart(2, '0');
}

// 解析LRC歌词
function parseLRC(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\[(\d{2}):(\d{2})([.\:]\d+)?\](.*)$/);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const ms = match[3] ? parseFloat('0' + match[3].replace(':', '.')) : 0;
      const time = mins * 60 + secs + ms;
      const text = match[4].trim();
      if (text) {
        result.push({ time: time, text: text });
      }
    }
  }

  result.sort(function(a, b) { return a.time - b.time; });
  return result;
}

// 聚合搜索
export async function searchMusic(keyword) {
  if (!keyword || !keyword.trim()) return [];

  const url = BASE_URL + '/api/?type=aggregateSearch&keyword=' + encodeURIComponent(keyword);
  const res = await fetch(url);
  const json = await res.json();

  if (json.code !== 200 || !json.data || !json.data.results) return [];

  return json.data.results.map(function(item) {
    return {
      id: item.id,
      name: item.name,
      artist: item.artist,
      album: item.album || '',
      platform: item.platform,
      cover: BASE_URL + '/api/?source=' + item.platform + '&id=' + item.id + '&type=pic',
      url: BASE_URL + '/api/?source=' + item.platform + '&id=' + item.id + '&type=url',
      lrcUrl: BASE_URL + '/api/?source=' + item.platform + '&id=' + item.id + '&type=lrc',
    };
  });
}

// 获取歌词
export async function fetchLyrics(song) {
  if (!song || !song.lrcUrl) return null;
  try {
    const res = await fetch(song.lrcUrl);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

// ========== 单行歌词条 ==========
function createSingleLineLyrics() {
  if (document.getElementById('wechat-single-lyrics')) return;

  var phoneContainer = document.getElementById('wechat-phone');
  if (!phoneContainer) return;

  // 生成颜色按钮HTML
  var colorBtnsHtml = '';
  for (var i = 0; i < LYRICS_COLORS.length; i++) {
    var c = LYRICS_COLORS[i];
    var activeClass = (c === lyricsColor) ? ' active' : '';
    colorBtnsHtml += '<button class="wechat-lyrics-color-btn color-' + c + activeClass + '" data-color="' + c + '"></button>';
  }

  var html = '<div id="wechat-single-lyrics" class="wechat-single-lyrics hidden">' +
    '<div class="wechat-single-lyrics-text color-' + lyricsColor + '">暂无歌词</div>' +
    '<div class="wechat-single-lyrics-colors">' + colorBtnsHtml + '</div>' +
    '<button class="wechat-single-lyrics-lock">' + UNLOCK_ICON + '</button>' +
  '</div>';

  phoneContainer.insertAdjacentHTML('beforeend', html);
  initSingleLineLyricsEvents();
}

function initSingleLineLyricsEvents() {
  var panel = document.getElementById('wechat-single-lyrics');
  if (!panel) return;

  var lockBtn = panel.querySelector('.wechat-single-lyrics-lock');
  var colorsContainer = panel.querySelector('.wechat-single-lyrics-colors');

  if (lockBtn) {
    lockBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      singleLineLyricsLocked = !singleLineLyricsLocked;
      lockBtn.innerHTML = singleLineLyricsLocked ? LOCK_ICON : UNLOCK_ICON;
      panel.classList.toggle('locked', singleLineLyricsLocked);
    });
  }

  // 颜色按钮点击事件
  if (colorsContainer) {
    colorsContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.wechat-lyrics-color-btn');
      if (!btn) return;
      e.stopPropagation();

      var newColor = btn.dataset.color;
      if (newColor && LYRICS_COLORS.indexOf(newColor) >= 0) {
        lyricsColor = newColor;

        // 更新文字颜色
        var textEl = panel.querySelector('.wechat-single-lyrics-text');
        if (textEl) {
          // 移除所有颜色类
          for (var i = 0; i < LYRICS_COLORS.length; i++) {
            textEl.classList.remove('color-' + LYRICS_COLORS[i]);
          }
          textEl.classList.add('color-' + newColor);
        }

        // 更新按钮激活状态
        var allBtns = colorsContainer.querySelectorAll('.wechat-lyrics-color-btn');
        for (var j = 0; j < allBtns.length; j++) {
          allBtns[j].classList.remove('active');
        }
        btn.classList.add('active');
      }
    });
  }

  // 点击歌词条显示/隐藏锁按钮
  panel.addEventListener('click', function(e) {
    if (e.target.closest('.wechat-single-lyrics-lock')) return;
    if (e.target.closest('.wechat-lyrics-color-btn')) return;
    lockBtn.classList.toggle('visible');
    panel.classList.toggle('show-colors');
  });

  // 拖拽功能（仅在未锁定时）- 支持上下左右移动
  var isDragging = false;
  var startX, startY, initialX, initialY;

  panel.addEventListener('mousedown', startDrag);
  panel.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    if (singleLineLyricsLocked) return;
    if (e.target.closest('.wechat-single-lyrics-lock')) return;
    if (e.target.closest('.wechat-lyrics-color-btn')) return;
    isDragging = true;
    var rect = panel.getBoundingClientRect();
    var phoneRect = document.getElementById('wechat-phone').getBoundingClientRect();
    initialX = rect.left - phoneRect.left;
    initialY = rect.top - phoneRect.top;
    if (e.type === 'touchstart') {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      startX = e.clientX;
      startY = e.clientY;
    }
    panel.style.transition = 'none';
  }

  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag, { passive: false });

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    var clientX, clientY;
    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    var dx = clientX - startX;
    var dy = clientY - startY;
    var phoneEl = document.getElementById('wechat-phone');
    var phoneRect = phoneEl.getBoundingClientRect();
    var panelWidth = panel.offsetWidth || 200;
    var newX = Math.max(0, Math.min(phoneRect.width - panelWidth, initialX + dx));
    var newY = Math.max(0, Math.min(phoneRect.height - 40, initialY + dy));
    panel.style.left = newX + 'px';
    panel.style.top = newY + 'px';
    panel.style.transform = 'none';
  }

  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);

  function endDrag() {
    if (isDragging) {
      isDragging = false;
      panel.style.transition = '';
    }
  }
}

function showSingleLineLyrics() {
  createSingleLineLyrics();
  var panel = document.getElementById('wechat-single-lyrics');
  if (panel) {
    panel.classList.remove('hidden');
    singleLineLyricsVisible = true;
    updateSingleLineLyricsText();
  }
}

function hideSingleLineLyrics() {
  var panel = document.getElementById('wechat-single-lyrics');
  if (panel) {
    panel.classList.add('hidden');
    singleLineLyricsVisible = false;
  }
}

function toggleSingleLineLyrics() {
  if (singleLineLyricsVisible) {
    hideSingleLineLyrics();
  } else {
    showSingleLineLyrics();
  }
  // 更新迷你播放器按钮状态
  var lyricsBtn = document.querySelector('.wechat-music-mini-lyrics-btn');
  if (lyricsBtn) {
    lyricsBtn.classList.toggle('active', singleLineLyricsVisible);
  }
}

function updateSingleLineLyricsText() {
  var textEl = document.querySelector('.wechat-single-lyrics-text');
  if (!textEl) return;

  if (!currentSong || !currentSong.lyrics) {
    textEl.textContent = '暂无歌词';
    parsedLyrics = [];
    return;
  }

  if (parsedLyrics.length === 0) {
    parsedLyrics = parseLRC(currentSong.lyrics);
  }

  if (parsedLyrics.length === 0) {
    textEl.textContent = '暂无歌词';
  }
}

function updateSingleLineLyricsHighlight(currentTime) {
  if (!singleLineLyricsVisible || parsedLyrics.length === 0) return;

  var textEl = document.querySelector('.wechat-single-lyrics-text');
  if (!textEl) return;

  var activeIndex = -1;
  for (var i = parsedLyrics.length - 1; i >= 0; i--) {
    if (currentTime >= parsedLyrics[i].time) {
      activeIndex = i;
      break;
    }
  }

  if (activeIndex >= 0) {
    textEl.textContent = parsedLyrics[activeIndex].text;
  } else if (parsedLyrics.length > 0) {
    textEl.textContent = parsedLyrics[0].text;
  }
}

// ========== 浮动歌词面板（保留但不使用） ==========
function createFloatingLyrics() {
  if (document.getElementById('wechat-floating-lyrics')) return;

  var phoneContainer = document.getElementById('wechat-phone');
  if (!phoneContainer) return;

  var html = '<div id="wechat-floating-lyrics" class="wechat-floating-lyrics hidden">' +
    '<div class="wechat-floating-lyrics-header">' +
      '<span class="wechat-floating-lyrics-title">歌词</span>' +
      '<button class="wechat-floating-lyrics-close">' + CLOSE_ICON + '</button>' +
    '</div>' +
    '<div class="wechat-floating-lyrics-content"></div>' +
  '</div>';

  phoneContainer.insertAdjacentHTML('beforeend', html);
  initFloatingLyricsEvents();
}

function initFloatingLyricsEvents() {
  var panel = document.getElementById('wechat-floating-lyrics');
  if (!panel) return;

  var header = panel.querySelector('.wechat-floating-lyrics-header');
  var closeBtn = panel.querySelector('.wechat-floating-lyrics-close');

  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    hideFloatingLyrics();
  });

  // 拖拽（在手机容器内）
  var isDragging = false;
  var startX, startY, initialX, initialY;

  header.addEventListener('mousedown', startDrag);
  header.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    if (e.target.closest('.wechat-floating-lyrics-close')) return;
    isDragging = true;
    var rect = panel.getBoundingClientRect();
    var phoneRect = document.getElementById('wechat-phone').getBoundingClientRect();
    initialX = rect.left - phoneRect.left;
    initialY = rect.top - phoneRect.top;
    if (e.type === 'touchstart') {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      startX = e.clientX;
      startY = e.clientY;
    }
    panel.style.transition = 'none';
    panel.style.transform = 'none';
  }

  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag, { passive: false });

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    var clientX, clientY;
    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    var dx = clientX - startX;
    var dy = clientY - startY;
    var phoneEl = document.getElementById('wechat-phone');
    var phoneRect = phoneEl.getBoundingClientRect();
    var newX = Math.max(0, Math.min(phoneRect.width - 280, initialX + dx));
    var newY = Math.max(0, Math.min(phoneRect.height - 100, initialY + dy));
    panel.style.left = newX + 'px';
    panel.style.top = newY + 'px';
  }

  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);

  function endDrag() {
    if (isDragging) {
      isDragging = false;
      panel.style.transition = '';
    }
  }
}

function showFloatingLyrics() {
  createFloatingLyrics();
  const panel = document.getElementById('wechat-floating-lyrics');
  if (panel) {
    panel.classList.remove('hidden');
    floatingLyricsVisible = true;
    updateFloatingLyricsContent();
  }
}

function hideFloatingLyrics() {
  const panel = document.getElementById('wechat-floating-lyrics');
  if (panel) {
    panel.classList.add('hidden');
    floatingLyricsVisible = false;
  }
  // 更新按钮状态
  const lyricsBtn = document.querySelector('.wechat-music-mini-lyrics-btn');
  if (lyricsBtn) lyricsBtn.classList.remove('active');
}

function toggleFloatingLyrics() {
  if (floatingLyricsVisible) {
    hideFloatingLyrics();
  } else {
    showFloatingLyrics();
  }
}

function updateFloatingLyricsContent() {
  const content = document.querySelector('.wechat-floating-lyrics-content');
  if (!content) return;

  if (!currentSong || !currentSong.lyrics) {
    content.innerHTML = '<div class="wechat-lyrics-line">暂无歌词</div>';
    parsedLyrics = [];
    return;
  }

  parsedLyrics = parseLRC(currentSong.lyrics);
  if (parsedLyrics.length === 0) {
    content.innerHTML = '<div class="wechat-lyrics-line">暂无歌词</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < parsedLyrics.length; i++) {
    html += '<div class="wechat-lyrics-line" data-time="' + parsedLyrics[i].time + '">' + escapeHtml(parsedLyrics[i].text) + '</div>';
  }
  content.innerHTML = html;
}

function updateLyricsHighlight(currentTime) {
  if (!floatingLyricsVisible || parsedLyrics.length === 0) return;

  const content = document.querySelector('.wechat-floating-lyrics-content');
  if (!content) return;

  const lines = content.querySelectorAll('.wechat-lyrics-line');
  let activeIndex = -1;

  for (let i = parsedLyrics.length - 1; i >= 0; i--) {
    if (currentTime >= parsedLyrics[i].time) {
      activeIndex = i;
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (i === activeIndex) {
      lines[i].classList.add('active');
      // 滚动到当前行
      lines[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      lines[i].classList.remove('active');
    }
  }
}

// ========== 迷你播放器 ==========
function createMiniPlayer() {
  if (document.getElementById('wechat-music-mini')) return;

  var phoneContainer = document.getElementById('wechat-phone');
  if (!phoneContainer) return;

  var html = '<div id="wechat-music-mini" class="wechat-music-mini hidden">' +
    '<div class="wechat-music-mini-btn">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/><path d="M8 17.5V6.5a1 1 0 011-1h10a1 1 0 011 1v9"/><path d="M8 10h12"/></svg>' +
    '</div>' +
    '<div class="wechat-music-mini-panel hidden">' +
      '<div class="wechat-music-mini-header">' +
        '<img class="wechat-music-mini-cover" src="" alt="">' +
        '<div class="wechat-music-mini-info">' +
          '<div class="wechat-music-mini-name">未播放</div>' +
          '<div class="wechat-music-mini-artist"></div>' +
        '</div>' +
      '</div>' +
      '<div class="wechat-music-mini-progress">' +
        '<span class="wechat-music-mini-time wechat-music-mini-current">0:00</span>' +
        '<div class="wechat-music-mini-slider-container">' +
          '<input type="range" class="wechat-music-mini-slider" min="0" max="100" value="0">' +
        '</div>' +
        '<span class="wechat-music-mini-time wechat-music-mini-duration">0:00</span>' +
      '</div>' +
      '<div class="wechat-music-mini-controls">' +
        '<button class="wechat-music-mini-play">' + PLAY_ICON_SMALL + '</button>' +
        '<button class="wechat-music-mini-mode" title="播放模式">' + MODE_LIST_ICON + '</button>' +
        '<button class="wechat-music-mini-lyrics-btn" title="歌词">' + LYRICS_ICON + '</button>' +
        '<button class="wechat-music-mini-playlist" title="播放列表">' + PLAYLIST_ICON + '</button>' +
        '<button class="wechat-music-mini-close">' + CLOSE_ICON + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  phoneContainer.insertAdjacentHTML('beforeend', html);
  initMiniPlayerEvents();
}

function initMiniPlayerEvents() {
  if (miniPlayerInited) return;
  miniPlayerInited = true;

  var mini = document.getElementById('wechat-music-mini');
  var btn = mini.querySelector('.wechat-music-mini-btn');
  var panel = mini.querySelector('.wechat-music-mini-panel');
  var playBtn = mini.querySelector('.wechat-music-mini-play');
  var modeBtn = mini.querySelector('.wechat-music-mini-mode');
  var lyricsBtn = mini.querySelector('.wechat-music-mini-lyrics-btn');
  var playlistBtn = mini.querySelector('.wechat-music-mini-playlist');
  var closeBtn = mini.querySelector('.wechat-music-mini-close');

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    miniPlayerExpanded = !miniPlayerExpanded;
    panel.classList.toggle('hidden', !miniPlayerExpanded);
  });

  playBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePlay();
  });

  // 播放模式切换
  modeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    cyclePlayMode();
    updateModeButtonIcon();
  });

  // 歌词按钮点击显示歌词
  lyricsBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleSingleLineLyrics();
  });

  // 播放列表按钮
  playlistBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePlaylistPanel();
  });

  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    stopMusic();
    hideMiniPlayer();
  });

  // 进度条拖动
  var slider = mini.querySelector('.wechat-music-mini-slider');
  var currentTimeEl = mini.querySelector('.wechat-music-mini-current');
  var durationEl = mini.querySelector('.wechat-music-mini-duration');
  var isSeeking = false;

  if (slider) {
    slider.addEventListener('input', function(e) {
      e.stopPropagation();
      isSeeking = true;
      var audio = document.getElementById('wechat-music-audio');
      if (audio && audio.duration) {
        var seekTime = (slider.value / 100) * audio.duration;
        if (currentTimeEl) {
          currentTimeEl.textContent = formatDuration(seekTime);
        }
      }
    });

    slider.addEventListener('change', function(e) {
      e.stopPropagation();
      var audio = document.getElementById('wechat-music-audio');
      if (audio && audio.duration) {
        audio.currentTime = (slider.value / 100) * audio.duration;
      }
      isSeeking = false;
    });

    // 阻止滑动时触发其他事件
    slider.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    slider.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
  }

  // 监听音频进度更新
  document.addEventListener('wechat-music-timeupdate', function(e) {
    if (isSeeking) return;
    var detail = e.detail || {};
    if (slider && typeof detail.progress === 'number') {
      slider.value = detail.progress;
    }
    if (currentTimeEl && typeof detail.currentTime === 'number') {
      currentTimeEl.textContent = formatDuration(detail.currentTime);
    }
    if (durationEl && typeof detail.duration === 'number') {
      durationEl.textContent = formatDuration(detail.duration);
    }
  });

  document.addEventListener('click', function(e) {
    if (miniPlayerExpanded && mini && !mini.contains(e.target)) {
      miniPlayerExpanded = false;
      panel.classList.add('hidden');
    }
  });

  // 拖拽（在手机容器内）
  var isDragging = false;
  var startX, startY, initialX, initialY;

  btn.addEventListener('mousedown', startDrag);
  btn.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    if (e.target.closest('.wechat-music-mini-panel')) return;
    isDragging = true;
    var rect = mini.getBoundingClientRect();
    var phoneRect = document.getElementById('wechat-phone').getBoundingClientRect();
    initialX = rect.left - phoneRect.left;
    initialY = rect.top - phoneRect.top;
    if (e.type === 'touchstart') {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      startX = e.clientX;
      startY = e.clientY;
    }
    mini.style.transition = 'none';
  }

  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag, { passive: false });

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    var clientX, clientY;
    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    var dx = clientX - startX;
    var dy = clientY - startY;
    var phoneEl = document.getElementById('wechat-phone');
    var phoneRect = phoneEl.getBoundingClientRect();
    var newX = Math.max(0, Math.min(phoneRect.width - 50, initialX + dx));
    var newY = Math.max(0, Math.min(phoneRect.height - 50, initialY + dy));
    mini.style.left = newX + 'px';
    mini.style.top = newY + 'px';
    mini.style.right = 'auto';
    mini.style.bottom = 'auto';
  }

  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);

  function endDrag() {
    if (isDragging) {
      isDragging = false;
      mini.style.transition = '';
    }
  }
}

// 循环切换播放模式
function cyclePlayMode() {
  if (playMode === 'list') {
    playMode = 'single';
    showToast('单曲循环');
  } else if (playMode === 'single') {
    playMode = 'random';
    showToast('随机播放');
  } else {
    playMode = 'list';
    showToast('列表循环');
  }
}

// 更新模式按钮图标
function updateModeButtonIcon() {
  var modeBtn = document.querySelector('.wechat-music-mini-mode');
  if (!modeBtn) return;

  if (playMode === 'single') {
    modeBtn.innerHTML = MODE_SINGLE_ICON;
  } else if (playMode === 'random') {
    modeBtn.innerHTML = MODE_RANDOM_ICON;
  } else {
    modeBtn.innerHTML = MODE_LIST_ICON;
  }
}

// 播放下一首
function playNext() {
  if (playlist.length === 0) return;

  var nextIndex;
  if (playMode === 'single') {
    nextIndex = currentPlayIndex;
  } else if (playMode === 'random') {
    nextIndex = Math.floor(Math.random() * playlist.length);
  } else {
    nextIndex = (currentPlayIndex + 1) % playlist.length;
  }

  if (nextIndex >= 0 && nextIndex < playlist.length) {
    var song = playlist[nextIndex];
    currentPlayIndex = nextIndex;
    playMusic(song.id, song.platform, song.name, song.artist);
  }
}

// ========== 播放列表面板 ==========
function createPlaylistPanel() {
  if (document.getElementById('wechat-music-playlist-panel')) return;

  var phoneContainer = document.getElementById('wechat-phone');
  if (!phoneContainer) return;

  var html = '<div id="wechat-music-playlist-panel" class="wechat-music-playlist-panel hidden">' +
    '<div class="wechat-playlist-header">' +
      '<span class="wechat-playlist-title">播放列表</span>' +
      '<button class="wechat-playlist-clear">清空</button>' +
      '<button class="wechat-playlist-close">' + CLOSE_ICON + '</button>' +
    '</div>' +
    '<div class="wechat-playlist-content"></div>' +
  '</div>';

  phoneContainer.insertAdjacentHTML('beforeend', html);
  initPlaylistPanelEvents();
}

function initPlaylistPanelEvents() {
  var panel = document.getElementById('wechat-music-playlist-panel');
  if (!panel) return;

  var closeBtn = panel.querySelector('.wechat-playlist-close');
  var clearBtn = panel.querySelector('.wechat-playlist-clear');
  var content = panel.querySelector('.wechat-playlist-content');

  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    hidePlaylistPanel();
  });

  clearBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    playlist = [];
    currentPlayIndex = -1;
    renderPlaylist();
    showToast('播放列表已清空');
  });

  content.addEventListener('click', function(e) {
    var item = e.target.closest('.wechat-playlist-item');
    if (!item) return;

    var index = parseInt(item.dataset.index);
    if (isNaN(index)) return;

    if (e.target.closest('.wechat-playlist-item-del')) {
      // 删除单曲
      playlist.splice(index, 1);
      if (currentPlayIndex === index) {
        currentPlayIndex = -1;
      } else if (currentPlayIndex > index) {
        currentPlayIndex--;
      }
      renderPlaylist();
    } else {
      // 播放选中歌曲
      currentPlayIndex = index;
      var song = playlist[index];
      playMusic(song.id, song.platform, song.name, song.artist);
      renderPlaylist();
    }
  });
}

function showPlaylistPanel() {
  createPlaylistPanel();
  var panel = document.getElementById('wechat-music-playlist-panel');
  if (panel) {
    panel.classList.remove('hidden');
    renderPlaylist();
  }
}

function hidePlaylistPanel() {
  var panel = document.getElementById('wechat-music-playlist-panel');
  if (panel) {
    panel.classList.add('hidden');
  }
}

function togglePlaylistPanel() {
  var panel = document.getElementById('wechat-music-playlist-panel');
  if (panel && !panel.classList.contains('hidden')) {
    hidePlaylistPanel();
  } else {
    showPlaylistPanel();
  }
}

function renderPlaylist() {
  var content = document.querySelector('.wechat-playlist-content');
  if (!content) return;

  if (playlist.length === 0) {
    content.innerHTML = '<div class="wechat-playlist-empty">播放列表为空</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < playlist.length; i++) {
    var song = playlist[i];
    var isActive = i === currentPlayIndex;
    html += '<div class="wechat-playlist-item' + (isActive ? ' active' : '') + '" data-index="' + i + '">' +
      '<div class="wechat-playlist-item-info">' +
        '<span class="wechat-playlist-item-name">' + escapeHtml(song.name) + '</span>' +
        '<span class="wechat-playlist-item-artist">' + escapeHtml(song.artist) + '</span>' +
      '</div>' +
      '<button class="wechat-playlist-item-del">' + CLOSE_ICON + '</button>' +
    '</div>';
  }
  content.innerHTML = html;
}

// 添加到播放列表
function addToPlaylist(song) {
  // 检查是否已存在
  var exists = playlist.some(function(s) {
    return s.id === song.id && s.platform === song.platform;
  });
  if (!exists) {
    playlist.push(song);
  }
}

function showMiniPlayer() {
  createMiniPlayer();
  const mini = document.getElementById('wechat-music-mini');
  if (mini) {
    mini.classList.remove('hidden');
    updateMiniPlayerState();
  }
}

function hideMiniPlayer() {
  var mini = document.getElementById('wechat-music-mini');
  if (mini) {
    mini.classList.add('hidden');
    miniPlayerExpanded = false;
    var panel = mini.querySelector('.wechat-music-mini-panel');
    if (panel) panel.classList.add('hidden');
  }
  hideSingleLineLyrics();
  hideFloatingLyrics();
  hidePlaylistPanel();
}

function updateMiniPlayerState() {
  const mini = document.getElementById('wechat-music-mini');
  if (!mini) return;

  const cover = mini.querySelector('.wechat-music-mini-cover');
  const name = mini.querySelector('.wechat-music-mini-name');
  const artist = mini.querySelector('.wechat-music-mini-artist');
  const playBtn = mini.querySelector('.wechat-music-mini-play');

  if (currentSong) {
    if (cover) cover.src = currentSong.cover || '';
    if (name) name.textContent = currentSong.name || '未知歌曲';
    if (artist) artist.textContent = currentSong.artist || '';
  }

  if (playBtn) {
    playBtn.innerHTML = isPlaying ? PAUSE_ICON_SMALL : PLAY_ICON_SMALL;
  }
}

// ========== 主面板 ==========
export function showMusicPanel() {
  const panel = document.getElementById('wechat-music-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  hideMiniPlayer();
  setTimeout(function() {
    const input = document.getElementById('wechat-music-search-input');
    if (input) input.focus();
  }, 100);
}

export function hideMusicPanel() {
  const panel = document.getElementById('wechat-music-panel');
  if (panel) panel.classList.add('hidden');

  if (currentSong && isPlaying) {
    showMiniPlayer();
  }
}

export function renderSearchResults(songs) {
  const container = document.getElementById('wechat-music-results');
  if (!container) return;

  if (!songs || !songs.length) {
    container.innerHTML = '<div class="wechat-music-empty">未找到结果</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    html += '<div class="wechat-music-item" data-id="' + escapeHtml(song.id) + '" data-platform="' + escapeHtml(song.platform) + '" data-name="' + escapeHtml(song.name) + '" data-artist="' + escapeHtml(song.artist) + '">' +
      '<div class="wechat-music-item-cover">' +
        '<img src="' + escapeHtml(song.cover) + '" alt="" onerror="this.style.display=\'none\'">' +
      '</div>' +
      '<div class="wechat-music-item-info">' +
        '<div class="wechat-music-item-name">' + escapeHtml(song.name) + '</div>' +
        '<div class="wechat-music-item-artist">' + escapeHtml(song.artist) + ' · ' + escapeHtml(song.platform) + '</div>' +
      '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

export function showLoading() {
  const container = document.getElementById('wechat-music-results');
  if (container) container.innerHTML = '<div class="wechat-music-loading">搜索中...</div>';
}

export async function playMusic(id, platform, name, artist) {
  const song = {
    id: id,
    platform: platform,
    name: name,
    artist: artist,
    cover: BASE_URL + '/api/?source=' + platform + '&id=' + id + '&type=pic',
    url: BASE_URL + '/api/?source=' + platform + '&id=' + id + '&type=url&br=320k',
    lrcUrl: BASE_URL + '/api/?source=' + platform + '&id=' + id + '&type=lrc',
  };

  // 添加到播放列表
  addToPlaylist(song);
  // 更新当前播放索引
  for (var i = 0; i < playlist.length; i++) {
    if (playlist[i].id === song.id && playlist[i].platform === song.platform) {
      currentPlayIndex = i;
      break;
    }
  }

  const player = document.getElementById('wechat-music-player');
  var audio = document.getElementById('wechat-music-audio');
  var playBtn = document.getElementById('wechat-music-player-play');

  // 如果 audio 元素不存在，动态创建一个
  if (!audio) {
    var phoneContainer = document.getElementById('wechat-phone');
    if (phoneContainer) {
      audio = document.createElement('audio');
      audio.id = 'wechat-music-audio';
      phoneContainer.appendChild(audio);

      // 添加事件监听器
      audio.addEventListener('ended', function() {
        isPlaying = false;
        var btn = document.getElementById('wechat-music-player-play');
        if (btn) btn.innerHTML = PLAY_ICON;
        updateMiniPlayerState();
        if (playlist.length > 0) {
          playNext();
        }
      });

      audio.addEventListener('timeupdate', function() {
        updateLyricsHighlight(audio.currentTime);
        updateSingleLineLyricsHighlight(audio.currentTime);
        // 派发进度更新事件给迷你播放器
        var progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        document.dispatchEvent(new CustomEvent('wechat-music-timeupdate', {
          detail: {
            currentTime: audio.currentTime,
            duration: audio.duration || 0,
            progress: progress
          }
        }));
      });
    }
  }

  if (!audio) {
    showToast('音乐播放器初始化失败');
    return;
  }

  if (player) player.classList.remove('hidden');

  const nameEl = document.getElementById('wechat-music-player-name');
  const artistEl = document.getElementById('wechat-music-player-artist');
  if (nameEl) nameEl.textContent = song.name || '歌曲';
  if (artistEl) artistEl.textContent = song.artist || '';

  const coverEl = document.getElementById('wechat-music-player-cover');
  if (coverEl) {
    coverEl.src = song.cover;
    coverEl.style.display = '';
  }

  audio.pause();
  audio.src = song.url;
  audio.currentTime = 0;

  if (playBtn) playBtn.innerHTML = PAUSE_ICON;
  isPlaying = true;
  currentSong = { id: song.id, platform: song.platform, name: song.name, artist: song.artist, cover: song.cover, url: song.url, lrcUrl: song.lrcUrl, lyrics: null };

  // 加载歌词
  fetchLyrics(song).then(function(lyrics) {
    if (!currentSong || currentSong.id !== song.id) return;
    currentSong.lyrics = lyrics;
    parsedLyrics = lyrics ? parseLRC(lyrics) : [];
    updateMiniPlayerState();
    if (floatingLyricsVisible) {
      updateFloatingLyricsContent();
    }
    if (singleLineLyricsVisible) {
      updateSingleLineLyricsText();
    }
  });

  try {
    await audio.play();
    // 显示迷你播放器
    showMiniPlayer();
    updateMiniPlayerState();
  } catch (e) {
    isPlaying = false;
    if (playBtn) playBtn.innerHTML = PLAY_ICON;
    showToast('播放失败，请重试');
  }
}

export function togglePlay() {
  const audio = document.getElementById('wechat-music-audio');
  const playBtn = document.getElementById('wechat-music-player-play');
  if (!audio) return;

  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    if (playBtn) playBtn.innerHTML = PLAY_ICON;
    updateMiniPlayerState();
  } else {
    audio.play().then(function() {
      isPlaying = true;
      if (playBtn) playBtn.innerHTML = PAUSE_ICON;
      updateMiniPlayerState();
    }).catch(function() {
      isPlaying = false;
      if (playBtn) playBtn.innerHTML = PLAY_ICON;
      updateMiniPlayerState();
      showToast('播放失败');
    });
  }
}

export function stopMusic() {
  const audio = document.getElementById('wechat-music-audio');
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  isPlaying = false;
  currentSong = null;
  parsedLyrics = [];

  const playBtn = document.getElementById('wechat-music-player-play');
  if (playBtn) playBtn.innerHTML = PLAY_ICON;

  const player = document.getElementById('wechat-music-player');
  if (player) player.classList.add('hidden');

  hideMiniPlayer();
}

export function getCurrentSong() {
  return currentSong;
}

export function initMusicEvents() {
  if (musicEventsInited) return;
  musicEventsInited = true;

  document.getElementById('wechat-music-back')?.addEventListener('click', hideMusicPanel);

  const searchInput = document.getElementById('wechat-music-search-input');
  let searchTimeout = null;

  var doSearch = async function(keyword) {
    if (!keyword) return;
    showLoading();
    try {
      const results = await searchMusic(keyword);
      renderSearchResults(results);
    } catch (err) {
      showToast(err.message || '搜索失败');
    }
  };

  searchInput?.addEventListener('input', function(e) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() { doSearch(e.target.value.trim()); }, 500);
  });

  searchInput?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      doSearch(e.target.value.trim());
    }
  });

  document.getElementById('wechat-music-results')?.addEventListener('click', function(e) {
    const item = e.target.closest('.wechat-music-item');
    if (!item) return;
    playMusic(item.dataset.id, item.dataset.platform, item.dataset.name, item.dataset.artist);
  });

  document.getElementById('wechat-music-player-play')?.addEventListener('click', togglePlay);

  document.getElementById('wechat-music-player-share')?.addEventListener('click', async function() {
    const song = getCurrentSong();
    if (!song) return;

    document.dispatchEvent(new CustomEvent('music-share', { detail: song }));
    hideMusicPanel();
    showToast('音乐已分享到聊天');
  });

  const audio = document.getElementById('wechat-music-audio');

  audio?.addEventListener('ended', function() {
    isPlaying = false;
    const playBtn = document.getElementById('wechat-music-player-play');
    if (playBtn) playBtn.innerHTML = PLAY_ICON;
    updateMiniPlayerState();
    // 根据播放模式自动播放下一首
    if (playlist.length > 0) {
      playNext();
    }
  });

  // 歌词进度更新
  audio?.addEventListener('timeupdate', function() {
    updateLyricsHighlight(audio.currentTime);
    updateSingleLineLyricsHighlight(audio.currentTime);
    // 派发进度更新事件给迷你播放器
    var progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    document.dispatchEvent(new CustomEvent('wechat-music-timeupdate', {
      detail: {
        currentTime: audio.currentTime,
        duration: audio.duration || 0,
        progress: progress
      }
    }));
  });

  // 预创建
  createMiniPlayer();
  createSingleLineLyrics();
  createFloatingLyrics();
  createPlaylistPanel();
}

// AI分享音乐的函数
export async function aiShareMusic(keyword) {
  if (!keyword || !keyword.trim()) return null;

  try {
    var results = await searchMusic(keyword);
    if (results && results.length > 0) {
      // 返回第一个搜索结果
      return results[0];
    }
  } catch (e) {
    console.error('[可乐] AI搜索音乐失败:', e);
  }
  return null;
}
