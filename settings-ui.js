/**
 * 设置页/服务页相关的 UI 逻辑（不包含业务模块）
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { getSettings } from './config.js';

export function toggleDarkMode() {
  const phone = document.getElementById('wechat-phone');
  const toggle = document.getElementById('wechat-dark-toggle');
  if (!phone || !toggle) return;

  const settings = getSettings();
  settings.darkMode = !settings.darkMode;
  phone.classList.toggle('wechat-dark', settings.darkMode);
  toggle.classList.toggle('on', settings.darkMode);
  saveSettingsDebounced();
}

export function refreshContextTags() {
  const settings = getSettings();
  const tagsContainer = document.getElementById('wechat-context-tags');
  if (!tagsContainer) return;

  const tags = settings.contextTags || [];
  tagsContainer.innerHTML = tags.map((tag, i) => `
    <div class="wechat-context-tag-item" data-index="${i}">
      <span>&lt;${tag}&gt;</span>
      <button class="wechat-tag-del-btn" data-index="${i}">×</button>
    </div>
  `).join('') + '<button class="wechat-tag-add-btn" id="wechat-context-add-tag">+</button>';
}
