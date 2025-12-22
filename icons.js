/**
 * SVG 图标定义
 * 用于替换 emoji，保持视觉一致性
 */

// 红包图标 (替换 🧧)
export const ICON_RED_PACKET = `<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align: -0.125em;"><rect x="4" y="2" width="16" height="20" rx="2" fill="#e53935"/><rect x="4" y="6" width="16" height="4" fill="#c62828"/><circle cx="12" cy="8" r="3" fill="#ffca28"/><path d="M12 11v4M10 13h4" stroke="#c62828" stroke-width="1.5" stroke-linecap="round"/></svg>`;

// 成功/勾选图标 (替换 ✅)
export const ICON_SUCCESS = `<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align: -0.125em;"><circle cx="12" cy="12" r="10" fill="#4caf50"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

// 退还箭头图标 (替换 ↩️)
export const ICON_REFUND = `<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align: -0.125em;"><path d="M9 11l-4 4 4 4" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5 15h10a4 4 0 000-8h-2" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

// 提示/警告图标 (替换 🧊 - 改为感叹号)
export const ICON_INFO = `<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align: -0.125em;"><circle cx="12" cy="12" r="10" fill="#2196f3"/><path d="M12 8v4M12 16h.01" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;

// 用户头像图标 (替换 👤)
export const ICON_USER = `<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align: -0.125em;"><circle cx="12" cy="12" r="10" fill="#9e9e9e"/><circle cx="12" cy="10" r="3" fill="#fff"/><path d="M6 21v-1a6 6 0 0112 0v1" fill="#fff"/></svg>`;

// HTML 版本 (用于直接插入 HTML)
export const ICON_RED_PACKET_HTML = `<span class="wechat-svg-icon wechat-icon-red-packet">${ICON_RED_PACKET}</span>`;
export const ICON_SUCCESS_HTML = `<span class="wechat-svg-icon wechat-icon-success">${ICON_SUCCESS}</span>`;
export const ICON_REFUND_HTML = `<span class="wechat-svg-icon wechat-icon-refund">${ICON_REFUND}</span>`;
export const ICON_INFO_HTML = `<span class="wechat-svg-icon wechat-icon-info">${ICON_INFO}</span>`;
export const ICON_USER_HTML = `<span class="wechat-svg-icon wechat-icon-user">${ICON_USER}</span>`;

// 大尺寸版本 (用于红包弹窗等需要大图标的地方)
export const ICON_RED_PACKET_LARGE = `<svg viewBox="0 0 24 24" width="48" height="48"><rect x="4" y="2" width="16" height="20" rx="2" fill="#e53935"/><rect x="4" y="6" width="16" height="4" fill="#c62828"/><circle cx="12" cy="8" r="3" fill="#ffca28"/><path d="M12 11v4M10 13h4" stroke="#c62828" stroke-width="1.5" stroke-linecap="round"/></svg>`;

// 获取图标函数
export function getIcon(type, size = 'normal') {
  const icons = {
    'red-packet': size === 'large' ? ICON_RED_PACKET_LARGE : ICON_RED_PACKET,
    'success': ICON_SUCCESS,
    'refund': ICON_REFUND,
    'info': ICON_INFO,
    'user': ICON_USER
  };
  return icons[type] || '';
}

// 获取 HTML 包装的图标
export function getIconHTML(type, size = 'normal') {
  const icon = getIcon(type, size);
  if (!icon) return '';
  const sizeClass = size === 'large' ? 'wechat-icon-large' : '';
  return `<span class="wechat-svg-icon wechat-icon-${type} ${sizeClass}">${icon}</span>`;
}
