/**
 * Toast 提示（显示在手机面板内）
 */

export function showToast(message, icon = '✅', durationMs = 2000) {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  const existingToast = phone.querySelector('.wechat-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'wechat-toast';

  const iconEl = document.createElement('span');
  iconEl.className = 'wechat-toast-icon';
  iconEl.textContent = icon;

  const textEl = document.createElement('span');
  textEl.textContent = message;

  toast.append(iconEl, textEl);
  phone.appendChild(toast);

  setTimeout(() => toast.remove(), durationMs);
}

/**
 * 手机顶部通知横幅（像真实手机通知一样从顶部滑下）
 * @param {string} title - 通知标题（如"微信"）
 * @param {string} message - 通知内容
 * @param {number} durationMs - 显示时长（默认3秒）
 */
export function showNotificationBanner(title, message, durationMs = 3000) {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  // 移除已有的通知横幅
  const existingBanner = phone.querySelector('.wechat-notification-banner');
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement('div');
  banner.className = 'wechat-notification-banner';

  // 设置动画时长
  banner.style.animationDuration = `${durationMs}ms`;

  // 获取当前时间
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  banner.innerHTML = `
    <div class="wechat-notification-banner-content">
      <div class="wechat-notification-banner-title">${title}</div>
      <div class="wechat-notification-banner-text">${message}</div>
    </div>
    <div class="wechat-notification-banner-time">${timeStr}</div>
  `;

  phone.appendChild(banner);

  // 动画结束后移除
  setTimeout(() => banner.remove(), durationMs);
}
