/**
 * 工具函数
 */

// 获取当前时间字符串
export function getCurrentTime() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// HTML 转义
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 睡眠函数
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 根据内容长度计算语音秒数
export function calculateVoiceDuration(content) {
  const seconds = Math.max(2, Math.min(60, Math.ceil(content.length / 3)));
  return seconds;
}

// 格式化聊天时间
export function formatChatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const oneDay = 24 * 60 * 60 * 1000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (diff < 2 * oneDay && date.getDate() === now.getDate() - 1) {
    return '昨天';
  } else if (diff < 7 * oneDay) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  } else {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

// 格式化消息时间标签（微信风格）
export function formatMessageTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const oneDay = 24 * 60 * 60 * 1000;

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    return timeStr;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()) {
    return `昨天 ${timeStr}`;
  }

  if (diff < 7 * oneDay) {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${days[date.getDay()]} ${timeStr}`;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
}

// 解析时间字符串为时间戳
export function parseTimeString(timeStr) {
  if (!timeStr) return null;

  // 格式1: HH:MM 或 H:MM
  const timeOnlyMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnlyMatch) {
    const now = new Date();
    const hours = parseInt(timeOnlyMatch[1]);
    const minutes = parseInt(timeOnlyMatch[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      now.setHours(hours, minutes, 0, 0);
      return now.getTime();
    }
  }

  // 格式2: YYYY-MM-DD HH:MM:SS
  const fullDateMatch = timeStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (fullDateMatch) {
    const date = new Date(
      parseInt(fullDateMatch[1]),
      parseInt(fullDateMatch[2]) - 1,
      parseInt(fullDateMatch[3]),
      parseInt(fullDateMatch[4]),
      parseInt(fullDateMatch[5]),
      parseInt(fullDateMatch[6] || '0')
    );
    return date.getTime();
  }

  // 格式3: MM-DD HH:MM
  const dateTimeMatch = timeStr.match(/(\d{1,2})[-月](\d{1,2})[日]?\s+(\d{1,2}):(\d{2})/);
  if (dateTimeMatch) {
    const now = new Date();
    const date = new Date(
      now.getFullYear(),
      parseInt(dateTimeMatch[1]) - 1,
      parseInt(dateTimeMatch[2]),
      parseInt(dateTimeMatch[3]),
      parseInt(dateTimeMatch[4])
    );
    return date.getTime();
  }

  // 格式4: 中文描述
  const chineseTimeMatch = timeStr.match(/(上午|下午|凌晨|中午|晚上|早上)?(\d{1,2}):(\d{2})/);
  if (chineseTimeMatch) {
    const now = new Date();
    let hours = parseInt(chineseTimeMatch[2]);
    const minutes = parseInt(chineseTimeMatch[3]);
    const period = chineseTimeMatch[1];

    if (period === '下午' || period === '晚上') {
      if (hours < 12) hours += 12;
    } else if ((period === '上午' || period === '凌晨' || period === '早上') && hours === 12) {
      hours = 0;
    }

    now.setHours(hours, minutes, 0, 0);
    return now.getTime();
  }

  // 格式5: 纯数字时间戳
  if (/^\d{10,13}$/.test(timeStr)) {
    const ts = parseInt(timeStr);
    return ts < 10000000000 ? ts * 1000 : ts;
  }

  // 格式6: Date.parse
  const parsed = Date.parse(timeStr);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return null;
}

// 解析聊天消息中的微信格式
export function parseWeChatMessage(text) {
  const patterns = [
    { regex: /\[微信:\s*(.+?)\]/g, type: 'text' },
    { regex: /\[语音:\s*(\d+)秒?\]/g, type: 'voice' },
    { regex: /\[图片:\s*(.+?)\]/g, type: 'image' },
    { regex: /\[表情:\s*(.+?)\]/g, type: 'emoji' },
    { regex: /\[红包:\s*(.+?)\]/g, type: 'redpacket' },
    { regex: /\[转账:\s*(.+?)\]/g, type: 'transfer' },
    { regex: /\[撤回\]/g, type: 'recall' },
  ];

  const allMatches = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      allMatches.push({
        index: match.index,
        length: match[0].length,
        type: pattern.type,
        content: match[1] || ''
      });
    }
  }

  allMatches.sort((a, b) => a.index - b.index);
  return allMatches;
}

// 格式化引用日期（M.DD 格式）
export function formatQuoteDate(timestamp) {
  if (!timestamp) {
    const now = new Date();
    return `${now.getMonth() + 1}.${now.getDate().toString().padStart(2, '0')}`;
  }
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}.${date.getDate().toString().padStart(2, '0')}`;
}

// 文件转Base64
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isCatboxFileUrl(url) {
  return typeof url === 'string' && /^https?:\/\/files\.catbox\.moe\/[a-z0-9]{6}\.[a-z0-9]+/i.test(url);
}

function withCacheBust(url) {
  if (!url || typeof url !== 'string' || url.startsWith('data:')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Date.now()}`;
}

function getWeservProxyUrl(url) {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
}

function toggleReferrerPolicy(imgEl) {
  const current = (imgEl?.referrerPolicy || '').toLowerCase();
  imgEl.referrerPolicy = current === 'no-referrer' ? '' : 'no-referrer';
}

/**
 * 为 <img> 绑定更稳的加载回退：重试 +（仅 catbox）代理回退。
 * 说明：会在加载失败时自动尝试 cache-bust、切换 referrerPolicy、以及使用 weserv 代理。
 */
export function bindImageLoadFallback(imgEl, options = {}) {
  if (!imgEl) return;

  const baseSrc = (options.baseSrc ?? imgEl.getAttribute('src') ?? '').toString();
  imgEl.dataset.baseSrc = baseSrc;
  imgEl.dataset.directRetry = '0';
  imgEl.dataset.proxyRetry = '0';
  imgEl.dataset.referrerToggled = '0';
  imgEl.dataset.proxyUsed = '0';

  const maxDirectRetries = Number.isFinite(options.maxDirectRetries) ? options.maxDirectRetries : 2;
  const maxProxyRetries = Number.isFinite(options.maxProxyRetries) ? options.maxProxyRetries : 2;
  const enableCatboxProxy = options.enableCatboxProxy !== false;

  const errorAlt = (options.errorAlt || '加载失败').toString();
  const errorStyle = options.errorStyle || { border: '2px solid #ff4d4f' };
  const onFail = typeof options.onFail === 'function' ? options.onFail : null;

  const markFailed = () => {
    imgEl.alt = errorAlt;
    if (errorStyle && typeof errorStyle === 'object') {
      Object.assign(imgEl.style, errorStyle);
    }
    onFail?.(baseSrc);
  };

  imgEl.addEventListener('load', () => {
    imgEl.style.border = '';
    imgEl.style.padding = '';
    imgEl.style.background = '';
  });

  imgEl.addEventListener('error', () => {
    const src = imgEl.dataset.baseSrc || '';
    if (!src) return markFailed();
    if (src.startsWith('data:')) return markFailed();

    const directRetry = parseInt(imgEl.dataset.directRetry || '0', 10) || 0;
    const proxyRetry = parseInt(imgEl.dataset.proxyRetry || '0', 10) || 0;
    const proxyUsed = imgEl.dataset.proxyUsed === '1';
    const referrerToggled = imgEl.dataset.referrerToggled === '1';

    if (!proxyUsed) {
      if (directRetry < maxDirectRetries) {
        imgEl.dataset.directRetry = String(directRetry + 1);
        const delay = 400 * (directRetry + 1);
        setTimeout(() => {
          imgEl.src = withCacheBust(src);
        }, delay);
        return;
      }

      if (!referrerToggled) {
        imgEl.dataset.referrerToggled = '1';
        imgEl.dataset.directRetry = '0';
        toggleReferrerPolicy(imgEl);
        setTimeout(() => {
          imgEl.src = withCacheBust(src);
        }, 600);
        return;
      }

      if (enableCatboxProxy && isCatboxFileUrl(src)) {
        imgEl.dataset.proxyUsed = '1';
        imgEl.dataset.proxyRetry = '0';
        imgEl.referrerPolicy = 'no-referrer';

        setTimeout(() => {
          imgEl.src = withCacheBust(getWeservProxyUrl(src));
        }, 700);
        return;
      }
    } else {
      if (proxyRetry < maxProxyRetries) {
        imgEl.dataset.proxyRetry = String(proxyRetry + 1);
        const delay = 600 * (proxyRetry + 1);
        setTimeout(() => {
          imgEl.src = withCacheBust(getWeservProxyUrl(src));
        }, delay);
        return;
      }
    }

    markFailed();
  });
}
