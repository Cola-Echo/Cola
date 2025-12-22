/**
 * 手机界面 HTML 生成
 * 这是最长的函数，单独提取以便维护
 */

import { getSettings, defaultSettings, MEME_PROMPT_TEMPLATE, MEME_STICKERS } from './config.js';
import { getCurrentTime, escapeHtml } from './utils.js';
import { getUserAvatarHTML, generateChatList, generateContactsList } from './ui.js';
import { ICON_RED_PACKET, ICON_RED_PACKET_LARGE, ICON_USER } from './icons.js';

// 生成手机界面 HTML
export function generatePhoneHTML() {
  const settings = getSettings();
  const darkClass = settings.darkMode ? 'wechat-dark' : '';
  const hiddenClass = settings.phoneVisible ? '' : 'hidden';

  return `
    <div id="wechat-phone" class="wechat-phone ${darkClass} ${hiddenClass}">
      <!-- 状态栏 -->
      <div class="wechat-statusbar">
        <span class="wechat-statusbar-time">${getCurrentTime()}</span>
        <div class="wechat-statusbar-icons">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" fill="currentColor"/></svg>
          <svg viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="6" width="18" height="12" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="20" y="10" width="2" height="4" fill="currentColor"/><rect x="4" y="8" width="12" height="8" rx="1" fill="currentColor"/></svg>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div id="wechat-main-content">
        <!-- 微信聊天列表页面 -->
        <div id="wechat-chat-tab-content">
          <div class="wechat-navbar">
            <span></span>
            <span class="wechat-navbar-title">微信</span>
            <button class="wechat-navbar-btn" id="wechat-add-btn" title="添加">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="wechat-search-box">
            <div class="wechat-search-inner">
              <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
              <span>搜索</span>
            </div>
          </div>
          <div class="wechat-chat-list" id="wechat-chat-list">
            ${generateChatList()}
          </div>
        </div>

        <!-- 通讯录页面 -->
        <div id="wechat-contacts-tab-content" class="hidden">
          <div class="wechat-navbar">
            <span></span>
            <span class="wechat-navbar-title">通讯录</span>
            <button class="wechat-navbar-btn" id="wechat-contacts-add-btn" title="添加">
              <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12.5 7a4 4 0 11-8 0 4 4 0 018 0zM20 8v6M23 11h-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
            </button>
          </div>
          <div class="wechat-search-box">
            <div class="wechat-search-inner">
              <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
              <span>搜索</span>
            </div>
          </div>
          <div class="wechat-contacts" id="wechat-contacts">
            ${generateContactsList()}
          </div>
        </div>

        <!-- 底部标签栏 -->
        <div class="wechat-tabbar">
          <button class="wechat-tab active" data-tab="chat">
            <span class="wechat-tab-icon">
              <svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </span>
            <span>微信</span>
          </button>
          <button class="wechat-tab" data-tab="contacts">
            <span class="wechat-tab-icon">
              <svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </span>
            <span>通讯录</span>
          </button>
          <button class="wechat-tab" data-tab="discover">
            <span class="wechat-tab-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </span>
            <span>发现</span>
          </button>
          <button class="wechat-tab" data-tab="me">
            <span class="wechat-tab-icon">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </span>
            <span>我</span>
          </button>
        </div>
      </div>

      <!-- 加号下拉菜单 -->
      <div id="wechat-dropdown-menu" class="wechat-dropdown-menu hidden">
        <div class="wechat-dropdown-item" id="wechat-menu-group">
          <svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          <span>发起群聊</span>
        </div>
        <div class="wechat-dropdown-item" id="wechat-menu-add-friend">
          <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12.5 7a4 4 0 11-8 0 4 4 0 018 0zM20 8v6M23 11h-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          <span>添加朋友</span>
        </div>
        <div class="wechat-dropdown-item" id="wechat-menu-scan">
          <svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          <span>扫一扫</span>
        </div>
        <div class="wechat-dropdown-item" id="wechat-menu-pay">
          <svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          <span>收付款</span>
        </div>
      </div>

      <!-- 添加朋友页面 -->
      <div id="wechat-add-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-back-btn">‹</button>
          <span class="wechat-navbar-title">添加朋友</span>
          <span></span>
        </div>
        <div class="wechat-add-friend">
          <div class="wechat-add-search-wrapper">
            <div class="wechat-add-search-box">
              <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
              <span>微信号/手机号</span>
            </div>
          </div>
          <div class="wechat-add-desc">我的微信号：SillyTavern</div>
          <div class="wechat-add-options">
            <div class="wechat-add-option" id="wechat-import-png">
              <div class="wechat-add-option-icon">
                <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <div class="wechat-add-option-text">导入角色卡 (PNG)</div>
              <span class="wechat-add-option-arrow">›</span>
            </div>
            <div class="wechat-add-option" id="wechat-import-json">
              <div class="wechat-add-option-icon">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
              </div>
              <div class="wechat-add-option-text">导入角色卡 (JSON)</div>
              <span class="wechat-add-option-arrow">›</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 聊天页面 -->
      <div id="wechat-chat-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-chat-back-btn">‹</button>
          <span class="wechat-navbar-title" id="wechat-chat-title">聊天</span>
          <button class="wechat-navbar-btn" id="wechat-chat-more-btn">⋯</button>
        </div>
        <!-- 聊天菜单下拉框 -->
        <div id="wechat-chat-menu" class="wechat-dropdown-menu hidden" style="position: absolute; top: 45px; right: 10px; z-index: 100;">
          <div class="wechat-dropdown-item" id="wechat-menu-recalled">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 3v5h5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
            <span>撤回消息</span>
          </div>
          <div class="wechat-dropdown-item" id="wechat-menu-chat-bg">
            <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            <span>聊天背景</span>
          </div>
          <div class="wechat-dropdown-item" id="wechat-menu-moments">
            <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>
            <span>TA的朋友圈</span>
          </div>
          <div class="wechat-dropdown-item wechat-dropdown-item-danger" id="wechat-menu-clear-moments">
            <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span>清空朋友圈</span>
          </div>
          <div class="wechat-dropdown-item wechat-dropdown-item-danger" id="wechat-menu-clear-chat">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            <span>清空聊天</span>
          </div>
        </div>
        <!-- 撤回消息区面板 -->
        <div id="wechat-recalled-panel" class="wechat-slide-panel hidden" style="position: absolute; top: 50px; left: 10px; right: 10px; max-height: 60%; z-index: 99; overflow: hidden; border-radius: 12px;">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">撤回消息</span>
            <button class="wechat-expand-close" id="wechat-recalled-close">✕</button>
          </div>
          <div id="wechat-recalled-list" style="max-height: 300px; overflow-y: auto; padding: 10px;"></div>
        </div>
        <!-- 聊天背景设置面板 -->
        <div id="wechat-chat-bg-panel" class="wechat-slide-panel hidden" style="position: absolute; top: 50px; left: 10px; right: 10px; max-height: 80%; z-index: 99; overflow: hidden; border-radius: 12px;">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">聊天背景</span>
            <button class="wechat-expand-close" id="wechat-chat-bg-close">✕</button>
          </div>
          <div class="wechat-chat-bg-content" style="padding: 12px;">
            <div id="wechat-chat-bg-preview" class="wechat-chat-bg-preview">
              <span class="wechat-chat-bg-placeholder">暂无背景</span>
            </div>
            <div class="wechat-chat-bg-actions" style="display: flex; gap: 8px; margin-top: 12px;">
              <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-chat-bg-upload" style="flex: 1;">选择图片</button>
              <button class="wechat-btn wechat-btn-small" id="wechat-chat-bg-clear" style="flex: 1;">清除背景</button>
            </div>
            <input type="file" id="wechat-chat-bg-file" accept="image/*" style="display: none;">
          </div>
        </div>
        <!-- 图片裁剪弹窗 -->
        <div id="wechat-cropper-modal" class="wechat-modal hidden">
          <div class="wechat-modal-content wechat-modal-cropper" style="position: relative; max-width: 350px; max-height: 90vh; overflow: hidden;">
            <button class="wechat-modal-close-x" id="wechat-cropper-cancel">×</button>
            <div class="wechat-modal-title">裁剪图片</div>
            <div class="wechat-cropper-container" id="wechat-cropper-container">
              <canvas id="wechat-cropper-canvas"></canvas>
              <div class="wechat-cropper-overlay" id="wechat-cropper-overlay">
                <div class="wechat-cropper-box" id="wechat-cropper-box">
                  <div class="wechat-cropper-handle nw"></div>
                  <div class="wechat-cropper-handle ne"></div>
                  <div class="wechat-cropper-handle sw"></div>
                  <div class="wechat-cropper-handle se"></div>
                </div>
              </div>
            </div>
            <div class="wechat-cropper-hint" style="font-size: 11px; color: var(--wechat-text-secondary); text-align: center; margin: 8px 0;">拖动选择区域，拖动角落调整大小</div>
            <div class="wechat-modal-actions">
              <button class="wechat-btn wechat-btn-primary" id="wechat-cropper-confirm">确认裁剪</button>
            </div>
          </div>
        </div>
        <div class="wechat-chat">
          <div class="wechat-chat-messages" id="wechat-chat-messages"></div>
        </div>
        <!-- 功能面板 -->
        <div class="wechat-func-panel hidden" id="wechat-func-panel">
          <div class="wechat-func-pages" id="wechat-func-pages">
            <div class="wechat-func-page" data-page="0">
              <div class="wechat-func-grid">
                <div class="wechat-func-item" data-func="photo"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div><span>照片</span></div>
                <div class="wechat-func-item" data-func="voicecall"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><span>语音通话</span></div>
                <div class="wechat-func-item" data-func="videocall"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="2" y="6" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M22 8l-7 4 7 4V8z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div><span>视频通话</span></div>
                <div class="wechat-func-item" data-func="location"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg></div><span>位置</span></div>
                <div class="wechat-func-item" data-func="redpacket"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 8h16" stroke="currentColor" stroke-width="1.5"/></svg></div><span>红包</span></div>
                <div class="wechat-func-item" data-func="gift"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8v13M3 12h18" stroke="currentColor" stroke-width="1.5"/><path d="M12 8c-2-4-6-4-6 0s4 0 6 0c2 0 6-4 6 0s-4 4-6 0" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div><span>礼物</span></div>
                <div class="wechat-func-item" data-func="transfer"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 10h20" stroke="currentColor" stroke-width="1.5"/><path d="M6 15h4M14 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div><span>转账</span></div>
                <div class="wechat-func-item" data-func="multi"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div><span>多条消息</span></div>
              </div>
            </div>
            <div class="wechat-func-page" data-page="1">
              <div class="wechat-func-grid">
                <div class="wechat-func-item" data-func="voice"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></div><span>语音输入</span></div>
                <div class="wechat-func-item" data-func="time"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div><span>时间</span></div>
                <div class="wechat-func-item" data-func="listen"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0118 0v6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div><span>一起听</span></div>
                <div class="wechat-func-item" data-func="music"><div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div><span>音乐</span></div>
              </div>
            </div>
          </div>
          <div class="wechat-func-dots">
            <span class="wechat-func-dot active" data-page="0"></span>
            <span class="wechat-func-dot" data-page="1"></span>
          </div>
        </div>
        <!-- 展开输入面板 -->
        <div class="wechat-expand-input hidden" id="wechat-expand-input">
          <div class="wechat-expand-header">
            <span class="wechat-expand-title" id="wechat-expand-title">语音消息</span>
            <button class="wechat-expand-close" id="wechat-expand-close">✕</button>
          </div>
          <div class="wechat-expand-body" id="wechat-expand-body"></div>
          <div class="wechat-expand-footer">
            <button class="wechat-btn wechat-expand-send" id="wechat-expand-send">发送</button>
          </div>
        </div>
        <!-- 时间选择器面板 -->
        <div class="wechat-time-picker hidden" id="wechat-time-picker">
          <div class="wechat-time-picker-header">
            <span class="wechat-time-picker-title">发送时间</span>
          </div>
          <div class="wechat-time-picker-display" id="wechat-time-picker-display">2025-12-22 21:33:19</div>
          <div class="wechat-time-picker-columns">
            <div class="wechat-time-picker-column" data-type="year">
              <div class="wechat-time-picker-items" id="wechat-time-picker-year"></div>
            </div>
            <div class="wechat-time-picker-column" data-type="month">
              <div class="wechat-time-picker-items" id="wechat-time-picker-month"></div>
            </div>
            <div class="wechat-time-picker-column" data-type="day">
              <div class="wechat-time-picker-items" id="wechat-time-picker-day"></div>
            </div>
            <div class="wechat-time-picker-column" data-type="hour">
              <div class="wechat-time-picker-items" id="wechat-time-picker-hour"></div>
            </div>
            <div class="wechat-time-picker-column" data-type="minute">
              <div class="wechat-time-picker-items" id="wechat-time-picker-minute"></div>
            </div>
            <div class="wechat-time-picker-column" data-type="second">
              <div class="wechat-time-picker-items" id="wechat-time-picker-second"></div>
            </div>
          </div>
          <div class="wechat-time-picker-footer">
            <button class="wechat-time-picker-confirm" id="wechat-time-picker-confirm">完成</button>
          </div>
        </div>
        <!-- 表情面板 -->
        <div class="wechat-emoji-panel hidden" id="wechat-emoji-panel">
          <div class="wechat-emoji-tabs">
            <button class="wechat-emoji-tab" data-tab="search">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
            </button>
            <button class="wechat-emoji-tab active" data-tab="stickers">
              <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M8 15c1 2 3 3 4 3s3-1 4-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
            </button>
          </div>
          <div class="wechat-emoji-content" id="wechat-emoji-content">
            <!-- 表情内容由 JS 动态填充 -->
          </div>
        </div>
        <div class="wechat-chat-input">
          <button class="wechat-chat-input-voice"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 10v1a7 7 0 01-14 0v-1M12 18v3M8 21h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
          <input type="text" class="wechat-chat-input-text" placeholder="发送消息..." id="wechat-input">
          <button class="wechat-chat-input-emoji"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="9" cy="10" r="1.5" stroke="currentColor" stroke-width="1" fill="none"/><circle cx="15" cy="10" r="1.5" stroke="currentColor" stroke-width="1" fill="none"/><path d="M8 15c1 2 3 3 4 3s3-1 4-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
          <button class="wechat-chat-input-more">
            <span class="wechat-input-send-text" style="display:none;background:#07c160;color:#fff;padding:4px 10px;border-radius:4px;font-size:13px;font-weight:500;white-space:nowrap;">发送</span>
            <span class="wechat-input-more-icon"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
          </button>
        </div>
      </div>

      ${generateMePageHTML(settings)}
      ${generateDiscoverPageHTML()}
      ${generateFavoritesPageHTML()}
      ${generateSettingsPageHTML(settings)}
      ${generateServicePageHTML(settings)}
      ${generateModalsHTML(settings)}
      ${generateVoiceCallPageHTML()}
      ${generateVideoCallPageHTML()}
      ${generateMusicPanelHTML()}
      ${generateListenTogetherHTML()}
      ${generateMomentsPageHTML()}
      ${generateRedPacketPageHTML(settings)}
      ${generateOpenRedPacketHTML()}
      ${generateRedPacketDetailHTML(settings)}
      ${generateTransferPageHTML()}
      ${generateReceiveTransferPageHTML()}
      ${generateTransferRefundConfirmHTML()}
    </div>

    <!-- 隐藏的文件输入 -->
    <input type="file" id="wechat-file-png" class="wechat-file-input" accept=".png">
    <input type="file" id="wechat-file-json" class="wechat-file-input" accept=".json">
  `;
}

// "我"页面 HTML
function generateMePageHTML(settings) {
  return `
    <div id="wechat-me-page" class="hidden">
      <div class="wechat-navbar">
        <span></span>
        <span class="wechat-navbar-title">我</span>
        <span></span>
      </div>
      <div class="wechat-me-content">
        <div class="wechat-me-profile" id="wechat-me-profile">
          <div class="wechat-me-avatar" id="wechat-me-avatar" title="点击更换头像">${getUserAvatarHTML()}</div>
          <input type="file" id="wechat-user-avatar-input" accept="image/*" style="display:none">
          <div class="wechat-me-info">
            <div class="wechat-me-name" id="wechat-me-name">User</div>
            <div class="wechat-me-id">微信号：<span id="wechat-me-wxid">${settings.wechatId || 'SillyTavern'}</span></div>
            <div class="wechat-me-status">+ 状态</div>
          </div>
          <div class="wechat-me-qr">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm8-2h6v6h-6V3zm2 2v2h2V5h-2zM3 13h6v6H3v-6zm2 2v2h2v-2H5z" fill="currentColor"/></svg>
            <span class="wechat-me-arrow">›</span>
          </div>
        </div>
        <div class="wechat-me-menu">
          <div class="wechat-me-menu-item" id="wechat-menu-service">
            <div class="wechat-me-menu-icon green"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
            <span class="wechat-me-menu-text">服务</span>
            <span class="wechat-me-menu-arrow">›</span>
          </div>
        </div>
        <div class="wechat-me-menu">
          <div class="wechat-me-menu-item" id="wechat-menu-favorites">
            <div class="wechat-me-menu-icon orange"><svg viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
            <span class="wechat-me-menu-text">收藏</span>
            <span class="wechat-me-menu-arrow">›</span>
          </div>
          <div class="wechat-me-menu-item" id="wechat-menu-moments">
            <div class="wechat-me-menu-icon blue"><svg viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
            <span class="wechat-me-menu-text">朋友圈</span>
            <span class="wechat-me-menu-arrow">›</span>
          </div>
        </div>
        <div class="wechat-me-menu">
          <div class="wechat-me-menu-item" id="wechat-menu-settings">
            <div class="wechat-me-menu-icon gray"><svg viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
            <span class="wechat-me-menu-text">设置</span>
            <span class="wechat-me-menu-arrow">›</span>
          </div>
        </div>
      </div>
      <div class="wechat-tabbar">
        <button class="wechat-tab" data-tab="chat"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span class="wechat-tab-badge"></span></span><span>微信</span></button>
        <button class="wechat-tab" data-tab="contacts"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span><span>通讯录</span></button>
        <button class="wechat-tab" data-tab="discover"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span><span>发现</span></button>
        <button class="wechat-tab active" data-tab="me"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span><span>我</span></button>
      </div>
    </div>
  `;
}

// 发现页面 HTML
function generateDiscoverPageHTML() {
  return `
    <div id="wechat-discover-page" class="hidden">
      <div class="wechat-navbar">
        <span></span>
        <span class="wechat-navbar-title">发现</span>
        <span></span>
      </div>
      <div class="wechat-discover-content">
        <!-- 朋友圈 -->
        <div class="wechat-discover-group">
          <div class="wechat-discover-item" id="wechat-discover-moments">
            <div class="wechat-discover-item-icon" style="background: transparent;">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle cx="12" cy="12" r="11" fill="#1a1a1a"/>
                <path d="M12 3 L14.5 7.5 L12 12 Z" fill="#ff0000"/>
                <path d="M14.5 7.5 L19.5 6.5 L12 12 Z" fill="#ff8800"/>
                <path d="M19.5 6.5 L21 12 L12 12 Z" fill="#ffff00"/>
                <path d="M21 12 L19.5 17.5 L12 12 Z" fill="#00ff00"/>
                <path d="M19.5 17.5 L14.5 16.5 L12 12 Z" fill="#00ffff"/>
                <path d="M14.5 16.5 L12 21 L12 12 Z" fill="#0088ff"/>
                <path d="M12 21 L9.5 16.5 L12 12 Z" fill="#0000ff"/>
                <path d="M9.5 16.5 L4.5 17.5 L12 12 Z" fill="#8800ff"/>
                <path d="M4.5 17.5 L3 12 L12 12 Z" fill="#ff00ff"/>
                <path d="M3 12 L4.5 6.5 L12 12 Z" fill="#ff0088"/>
                <path d="M4.5 6.5 L9.5 7.5 L12 12 Z" fill="#ff0044"/>
                <path d="M9.5 7.5 L12 3 L12 12 Z" fill="#ff0000"/>
              </svg>
            </div>
            <span class="wechat-discover-item-text">朋友圈</span>
            <div class="wechat-discover-item-right">
              <div class="wechat-discover-item-preview" id="wechat-discover-moments-preview"></div>
              <span class="wechat-discover-item-arrow">›</span>
            </div>
          </div>
        </div>

      </div>

      <!-- 底部标签栏 -->
      <div class="wechat-tabbar">
        <button class="wechat-tab" data-tab="chat"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span class="wechat-tab-badge"></span></span><span>微信</span></button>
        <button class="wechat-tab" data-tab="contacts"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span><span>通讯录</span></button>
        <button class="wechat-tab active" data-tab="discover"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span><span>发现</span></button>
        <button class="wechat-tab" data-tab="me"><span class="wechat-tab-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span><span>我</span></button>
      </div>
    </div>
  `;
}

// 收藏页面 HTML
function generateFavoritesPageHTML() {
  return `
    <div id="wechat-favorites-page" class="hidden">
      <div class="wechat-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-favorites-back-btn">‹</button>
        <span class="wechat-navbar-title">收藏</span>
        <button class="wechat-navbar-btn" id="wechat-favorites-add-btn">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="wechat-favorites-content">
        <div class="wechat-search-box">
          <div class="wechat-search-inner">
            <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
            <span>搜索</span>
          </div>
        </div>
        <div class="wechat-favorites-tabs">
          <div class="wechat-favorites-tab active" data-tab="all">全部</div>
          <div class="wechat-favorites-tab" data-tab="user">用户</div>
          <div class="wechat-favorites-tab" data-tab="character">角色卡</div>
          <div class="wechat-favorites-tab" data-tab="global">全局</div>
        </div>
        <div class="wechat-favorites-list" id="wechat-favorites-list"></div>
      </div>
    </div>
  `;
}

// 设置页面 HTML
function generateSettingsPageHTML(settings) {
  return `
    <div id="wechat-settings-page" class="hidden">
      <div class="wechat-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-settings-back-btn">‹</button>
        <span class="wechat-navbar-title">设置</span>
        <span></span>
      </div>
      <div class="wechat-settings">
        <div class="wechat-settings-section-title">单聊 API 配置</div>
        <div class="wechat-settings-group">
          <div class="wechat-settings-item wechat-settings-item-vertical">
            <span class="wechat-settings-label">API 地址</span>
            <input type="text" class="wechat-settings-input" id="wechat-api-url" placeholder="https://api.example.com/v1" value="${settings.apiUrl || ''}">
          </div>
          <div class="wechat-settings-item wechat-settings-item-vertical">
            <span class="wechat-settings-label">API 密钥</span>
            <div class="wechat-settings-input-wrapper">
              <input type="password" class="wechat-settings-input" id="wechat-api-key" placeholder="sk-xxxxxxxxxxxxxxxx" value="${settings.apiKey || ''}">
              <button class="wechat-settings-eye-btn" id="wechat-toggle-key-visibility">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </button>
            </div>
          </div>
          <div class="wechat-settings-item wechat-settings-item-vertical">
            <span class="wechat-settings-label">模型选择</span>
            <select class="wechat-settings-input wechat-settings-select" id="wechat-model-select">
              <option value="">请选择模型</option>
              ${(settings.modelList || []).map(m => `<option value="${m}" ${m === settings.selectedModel ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <div class="wechat-settings-input-wrapper" style="margin-top: 8px;">
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-refresh-models" style="flex: 1;">获取模型</button>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-manual-model" style="flex: 1;">自己填模型</button>
            </div>
          </div>
          <div class="wechat-settings-item">
            <button class="wechat-btn wechat-btn-blue wechat-btn-small" id="wechat-test-api">测试连接</button>
            <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-save-api">保存</button>
          </div>
        </div>
        <div class="wechat-settings-section-title" style="color: #52c41a;">群聊 API 配置</div>
        <div class="wechat-settings-group">
          <div class="wechat-settings-hint" style="font-size: 11px; color: var(--wechat-text-secondary); margin-bottom: 10px; padding: 0 4px;">不配置则使用单聊API</div>
          <div class="wechat-settings-item wechat-settings-item-vertical">
            <span class="wechat-settings-label">API 地址</span>
            <input type="text" class="wechat-settings-input" id="wechat-group-api-url" placeholder="https://api.example.com/v1" value="${settings.groupApiUrl || ''}">
          </div>
          <div class="wechat-settings-item wechat-settings-item-vertical">
            <span class="wechat-settings-label">API 密钥</span>
            <div class="wechat-settings-input-wrapper">
              <input type="password" class="wechat-settings-input" id="wechat-group-api-key" placeholder="sk-xxxxxxxxxxxxxxxx" value="${settings.groupApiKey || ''}">
              <button class="wechat-settings-eye-btn" id="wechat-toggle-group-key-visibility">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </button>
            </div>
          </div>
          <div class="wechat-settings-item wechat-settings-item-vertical">
            <span class="wechat-settings-label">模型选择</span>
            <select class="wechat-settings-input wechat-settings-select" id="wechat-group-model-select">
              <option value="">请选择模型</option>
              ${(settings.groupModelList || []).map(m => `<option value="${m}" ${m === settings.groupSelectedModel ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <div class="wechat-settings-input-wrapper" style="margin-top: 8px;">
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-group-refresh-models" style="flex: 1;">获取模型</button>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-group-manual-model" style="flex: 1;">自己填模型</button>
            </div>
          </div>
          <div class="wechat-settings-item">
            <button class="wechat-btn wechat-btn-blue wechat-btn-small" id="wechat-group-test-api">测试连接</button>
            <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-group-save-api">保存</button>
          </div>
        </div>
        <div class="wechat-settings-section-title">通用</div>
        <div class="wechat-settings-group">
          <div class="wechat-settings-item">
            <span class="wechat-settings-label">深色模式</span>
            <div class="wechat-switch ${settings.darkMode ? 'on' : ''}" id="wechat-dark-toggle"></div>
          </div>
          <div class="wechat-settings-item">
            <span class="wechat-settings-label">自动注入提示</span>
            <div class="wechat-switch ${settings.autoInjectPrompt ? 'on' : ''}" id="wechat-auto-inject-toggle"></div>
          </div>
          <div id="wechat-auto-inject-content" class="${settings.autoInjectPrompt ? '' : 'hidden'}" style="flex-direction: column; align-items: flex-start; padding: 0 4px;">
            <span class="wechat-settings-label" style="margin-bottom: 8px; font-size: 12px;">作者注释模板</span>
            <textarea class="wechat-settings-input" id="wechat-author-note-content" rows="8" style="width: 100%; box-sizing: border-box; resize: vertical; font-size: 12px;" placeholder="微信消息格式提示词...">${escapeHtml(settings.authorNoteCustom || '')}</textarea>
            <div style="font-size: 11px; color: var(--wechat-text-secondary); margin-top: 4px;">留空则使用默认模板</div>
            <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-save-author-note" style="margin-top: 8px;">保存</button>
          </div>
        </div>
        <div class="wechat-settings-section-title" style="color: #1e90ff;">高级功能</div>
        <div class="wechat-settings-group">
          <div class="wechat-settings-item">
            <div style="flex: 1;">
              <span class="wechat-settings-label">哈基米破限</span>
              <div style="font-size: 11px; color: var(--wechat-text-secondary); margin-top: 2px;">针对 Gemini 2.5 Pro 截断问题</div>
            </div>
            <div class="wechat-switch ${settings.hakimiBreakLimit ? 'on' : ''}" id="wechat-hakimi-toggle"></div>
          </div>
          <div id="wechat-hakimi-content" class="${settings.hakimiBreakLimit ? '' : 'hidden'}" style="flex-direction: column; align-items: flex-start; padding: 0 4px;">
            <span class="wechat-settings-label" style="margin-bottom: 8px; font-size: 12px;">破限提示词</span>
            <textarea class="wechat-settings-input" id="wechat-hakimi-prompt" rows="8" style="width: 100%; box-sizing: border-box; resize: vertical; font-size: 12px;" placeholder="自定义破限词...">${escapeHtml(settings.hakimiCustomPrompt || '')}</textarea>
            <div style="font-size: 11px; color: var(--wechat-text-secondary); margin-top: 4px;">留空则使用默认破限词</div>
            <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-save-hakimi" style="margin-top: 8px;">保存</button>
          </div>
        </div>
        <div class="wechat-settings-section-title" style="color: #52c41a;">群聊设置</div>
        <div class="wechat-settings-group">
          <div class="wechat-settings-item">
            <span class="wechat-settings-label">群聊提示词注入</span>
            <div class="wechat-switch ${settings.groupAutoInjectPrompt ? 'on' : ''}" id="wechat-group-inject-toggle"></div>
          </div>
          <div id="wechat-group-inject-content" class="${settings.groupAutoInjectPrompt ? '' : 'hidden'}" style="flex-direction: column; align-items: flex-start; padding: 0 4px;">
            <span class="wechat-settings-label" style="margin-bottom: 8px; font-size: 12px;">群聊作者注释</span>
            <textarea class="wechat-settings-input" id="wechat-group-author-note" rows="5" style="width: 100%; box-sizing: border-box; resize: vertical; font-size: 12px;" placeholder="自定义群聊提示词，留空使用内置模板...">${escapeHtml(settings.userGroupAuthorNote || '')}</textarea>
            <div style="font-size: 11px; color: var(--wechat-text-secondary); margin-top: 4px;">留空则使用默认模板</div>
            <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-save-group-note" style="margin-top: 8px;">保存</button>
          </div>
        </div>
        <div class="wechat-settings-section-title" style="color: #ff4d4f;">危险操作</div>
        <div class="wechat-settings-group" style="padding: 15px;">
          <button class="wechat-btn wechat-btn-danger wechat-btn-block" id="wechat-clear-contacts">清空所有联系人</button>
        </div>
      </div>
    </div>
  `;
}

// 服务页面 HTML
function generateServicePageHTML(settings) {
  return `
    <div id="wechat-service-page" class="hidden">
      <div class="wechat-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-service-back-btn">‹</button>
        <span class="wechat-navbar-title">服务</span>
        <button class="wechat-navbar-btn">⋯</button>
      </div>
      <div class="wechat-service-content">
        <div class="wechat-service-card">
          <div class="wechat-service-card-item" id="wechat-service-context">
            <div class="wechat-service-card-icon"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
            <span class="wechat-service-card-text">上下文</span>
            <span class="wechat-service-card-amount" id="wechat-context-level-display">${settings.contextEnabled ? '已开启' : '已关闭'}</span>
          </div>
          <div class="wechat-service-card-divider"></div>
          <div class="wechat-service-card-item" id="wechat-service-wallet">
            <div class="wechat-service-card-icon"><svg viewBox="0 0 24 24" width="28" height="28"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 10h20" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="14" r="2" fill="currentColor"/></svg></div>
            <span class="wechat-service-card-text">钱包</span>
            <span class="wechat-service-card-amount" id="wechat-wallet-amount">¥${settings.walletAmount || '5773.89'}</span>
          </div>
        </div>
        <!-- 滑出面板 -->
        <div class="wechat-slide-panel hidden" id="wechat-context-panel">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">启用上下文</span>
            <label class="wechat-toggle wechat-toggle-small">
              <input type="checkbox" id="wechat-context-enabled" ${settings.contextEnabled ? 'checked' : ''}>
              <span class="wechat-toggle-slider"></span>
            </label>
          </div>
          <div class="wechat-slide-panel-section" id="wechat-context-settings" style="${settings.contextEnabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
            <div class="wechat-slide-panel-row-label"><span>层数</span><span class="wechat-slide-panel-value" id="wechat-context-value">${settings.contextLevel ?? 5}</span></div>
            <div class="wechat-slide-panel-body">
              <input type="range" class="wechat-slider" id="wechat-context-slider" min="0" max="5" value="${settings.contextLevel ?? 5}">
              <div class="wechat-slider-labels"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            </div>
            <div class="wechat-slide-panel-row-label" style="margin-top: 12px;"><span>提取标签</span></div>
            <div class="wechat-context-tags" id="wechat-context-tags">
              ${(settings.contextTags || []).map((tag, i) => `<div class="wechat-context-tag-item" data-index="${i}"><span>&lt;${tag}&gt;</span><button class="wechat-tag-del-btn" data-index="${i}">×</button></div>`).join('')}
              <button class="wechat-tag-add-btn" id="wechat-context-add-tag">+</button>
            </div>
            <div class="wechat-slide-panel-hint">从主界面聊天消息中提取指定标签内容</div>
          </div>
        </div>
        <div class="wechat-slide-panel hidden" id="wechat-wallet-panel">
          <div class="wechat-slide-panel-header"><span class="wechat-slide-panel-title">钱包金额</span></div>
          <div class="wechat-slide-panel-body wechat-slide-panel-row">
            <input type="text" class="wechat-slide-input" id="wechat-wallet-input-slide" placeholder="输入金额" value="${settings.walletAmount || '5773.89'}">
            <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-wallet-save-slide">保存</button>
          </div>
        </div>
        <div class="wechat-slide-panel hidden" id="wechat-summary-panel">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">总结 API 配置</span>
            <button class="wechat-expand-close" id="wechat-summary-close">✕</button>
          </div>
          <div class="wechat-slide-panel-row-label"><span>API URL</span></div>
          <div class="wechat-slide-panel-body">
            <input type="text" class="wechat-settings-input" id="wechat-summary-url" placeholder="https://api.openai.com/v1" value="${settings.summaryApiUrl || ''}">
          </div>
          <div class="wechat-slide-panel-row-label"><span>API Key</span></div>
          <div class="wechat-slide-panel-body">
            <div class="wechat-settings-input-wrapper">
              <input type="password" class="wechat-settings-input" id="wechat-summary-key" placeholder="sk-..." value="${settings.summaryApiKey || ''}">
              <button class="wechat-settings-eye-btn" id="wechat-summary-key-toggle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg></button>
            </div>
          </div>
          <div class="wechat-slide-panel-row-label"><span>模型</span></div>
          <div class="wechat-slide-panel-body">
            <select class="wechat-settings-input wechat-settings-select" id="wechat-summary-model">
              <option value="">请选择模型</option>
              ${(settings.summaryModelList || []).map(m => `<option value="${m}" ${m === settings.summarySelectedModel ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="wechat-slide-panel-body" style="margin-top: 8px;">
            <div class="wechat-slide-panel-row">
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-summary-fetch-models" style="flex: 1;">获取模型</button>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-summary-manual-model" style="flex: 1;">自己填模型</button>
            </div>
          </div>
          <div class="wechat-slide-panel-body" style="margin-top: 10px;">
            <div class="wechat-slide-panel-row">
              <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-summary-test" style="flex: 1;">🔗 测试连接</button>
              <button class="wechat-btn wechat-btn-small" id="wechat-summary-save" style="flex: 1; background: var(--wechat-green); color: white;">💾 保存配置</button>
            </div>
          </div>
          <div id="wechat-summary-status" class="wechat-slide-panel-hint" style="margin-top: 8px; text-align: center;"></div>
          <div style="border-top: 1px solid var(--wechat-border); margin: 15px 0;"></div>
          <div class="wechat-slide-panel-header"><span class="wechat-slide-panel-title">生成世界书</span></div>
          <div class="wechat-slide-panel-hint" style="margin-bottom: 10px;">选择要总结的聊天，生成世界书并同步到酒馆</div>
          <div class="wechat-slide-panel-body">
            <div class="wechat-slide-panel-row" style="margin-bottom: 8px;">
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-summary-refresh" style="flex: 1;">刷新</button>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-summary-select-all" style="flex: 1;">全选</button>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-summary-deselect-all" style="flex: 1;">取消全选</button>
            </div>
            <div id="wechat-summary-chat-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--wechat-border); border-radius: 6px; padding: 8px; margin-bottom: 10px;"></div>
          </div>
          <div class="wechat-slide-panel-body">
            <button class="wechat-btn wechat-btn-primary wechat-btn-block" id="wechat-summary-execute">执行总结</button>
          </div>
          <div class="wechat-slide-panel-body" style="margin-top: 8px;">
            <button class="wechat-btn wechat-btn-block" id="wechat-summary-rollback" style="background: var(--wechat-bg-secondary); color: var(--wechat-text-secondary);">回退总结</button>
          </div>
          <div id="wechat-summary-progress" class="wechat-slide-panel-hint" style="margin-top: 8px; text-align: center;"></div>
        </div>
        <div class="wechat-slide-panel hidden" id="wechat-history-panel">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">历史回顾</span>
            <button class="wechat-expand-close" id="wechat-history-close">✕</button>
          </div>
          <div class="wechat-slide-panel-hint" style="margin-bottom: 10px;">查看已生成的总结世界书，按人物/群聊分类</div>
          <div class="wechat-history-tabs" style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button class="wechat-btn wechat-btn-small wechat-btn-primary wechat-history-tab active" data-tab="all">全部</button>
            <button class="wechat-btn wechat-btn-small wechat-history-tab" data-tab="contact">单聊</button>
            <button class="wechat-btn wechat-btn-small wechat-history-tab" data-tab="group">群聊</button>
          </div>
          <div id="wechat-history-list" style="max-height: 400px; overflow-y: auto;"></div>
        </div>
        <div class="wechat-slide-panel hidden" id="wechat-logs-panel">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">运行日志</span>
            <button class="wechat-expand-close" id="wechat-logs-close">✕</button>
          </div>
          <div class="wechat-slide-panel-hint" style="margin-bottom: 10px;">最近 20 条报错记录</div>
          <div id="wechat-logs-list" style="max-height: 400px; overflow-y: auto; font-size: 12px;"></div>
          <div class="wechat-slide-panel-body" style="margin-top: 10px;">
            <button class="wechat-btn wechat-btn-small wechat-btn-block" id="wechat-logs-clear">清空日志</button>
          </div>
        </div>
        <div class="wechat-slide-panel hidden" id="wechat-meme-stickers-panel">
          <div class="wechat-slide-panel-header">
            <span class="wechat-slide-panel-title">Meme表情包</span>
            <button class="wechat-expand-close" id="wechat-meme-stickers-close">✕</button>
          </div>
          <div class="wechat-settings-item" style="padding: 12px; background: var(--wechat-bg-secondary); border-radius: 8px; margin-bottom: 12px;">
            <div style="flex: 1;">
              <span class="wechat-settings-label" style="font-weight: 500;">启用Meme表情包</span>
              <div style="font-size: 11px; color: var(--wechat-text-secondary); margin-top: 4px;">开启后自动注入提示词</div>
            </div>
            <div class="wechat-switch ${settings?.memeStickersEnabled ? 'on' : ''}" id="wechat-meme-stickers-toggle"></div>
          </div>
          <div style="background: #fff !important; border-radius: 8px; padding: 10px; margin-bottom: 12px; border: 1px solid #e0e0e0;">
            <div style="font-size: 12px; font-weight: 500; margin-bottom: 6px; color: #000 !important;">表情包列表 (${MEME_STICKERS.length}个)</div>
            <textarea id="wechat-meme-stickers-list" style="width: 100%; height: 150px; box-sizing: border-box; font-size: 11px; color: #000 !important; background: #fff !important; padding: 8px; border-radius: 4px; border: 1px solid #ddd; font-family: monospace; resize: vertical;">${MEME_STICKERS.join('\n')}</textarea>
            <div style="font-size: 10px; color: #666 !important; margin-top: 4px;">每行一个表情包文件名</div>
          </div>
          <button class="wechat-btn wechat-btn-primary wechat-btn-block wechat-btn-small" id="wechat-add-meme-sticker">添加表情包</button>
        </div>
        <div class="wechat-service-section">
          <div class="wechat-service-section-title">总结功能</div>
          <div class="wechat-service-grid">
            <div class="wechat-service-item" data-service="summary"><div class="wechat-service-icon blue"><svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><span>总结</span></div>
            <div class="wechat-service-item" data-service="history"><div class="wechat-service-icon blue"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div><span>历史回顾</span></div>
            <div class="wechat-service-item" data-service="logs"><div class="wechat-service-icon green"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></div><span>日志</span></div>
            <div class="wechat-service-item" data-service="summary-template"><div class="wechat-service-icon" style="background: linear-gradient(135deg, #607d8b, #455a64);"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><span>总结模板</span></div>
          </div>
        </div>
        <div class="wechat-service-section">
          <div class="wechat-service-section-title">AI功能</div>
          <div class="wechat-service-grid">
            <div class="wechat-service-item" data-service="meme-stickers"><div class="wechat-service-icon purple" style="background: linear-gradient(135deg, #9c27b0, #e91e63);"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M7 14c1.5 3 4 4 5 4s3.5-1 5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></div><span>Meme表情</span></div>
          </div>
        </div>
        <div class="wechat-service-section">
          <div class="wechat-service-section-title">用户功能</div>
          <div class="wechat-service-grid">
            <div class="wechat-service-item" data-service="change-password"><div class="wechat-service-icon" style="background: linear-gradient(135deg, #ff9800, #f57c00);"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg></div><span>修改密码</span></div>
          </div>
        </div>
        <!-- 修改密码面板 -->
        <div class="wechat-service-panel hidden" id="wechat-change-password-panel">
          <div class="wechat-panel-header" style="justify-content: center;">
            <span class="wechat-panel-title">修改支付密码</span>
          </div>
          <div style="padding: 16px;">
            <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 12px; text-align: center;">设置6位数字支付密码，用于转账和红包</div>
            <input type="password" id="wechat-new-password-input" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="请输入6位数字密码" style="width: 100%; box-sizing: border-box; padding: 12px; font-size: 18px; text-align: center; letter-spacing: 8px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #000;">
            <div style="font-size: 11px; color: var(--wechat-text-secondary); margin-top: 8px; text-align: center;">只能输入6位数字</div>
            <button class="wechat-btn wechat-btn-primary wechat-btn-block" id="wechat-save-password-btn" style="margin-top: 16px;">保存密码</button>
          </div>
        </div>
        <!-- 总结模板面板 -->
        <div class="wechat-service-panel hidden" id="wechat-summary-template-panel">
          <div class="wechat-panel-header">
            <span class="wechat-panel-title">自定义总结模板</span>
            <button class="wechat-panel-close" data-panel="wechat-summary-template-panel">×</button>
          </div>
          <div style="padding: 16px;">
            <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 12px;">自定义总结提示词，留空则使用默认模板</div>
            <textarea id="wechat-summary-template-input" placeholder="输入自定义总结提示词..." style="width: 100%; height: 200px; box-sizing: border-box; padding: 10px; font-size: 13px; color: #000; background: #fff; border: 1px solid #ddd; border-radius: 8px; resize: vertical; line-height: 1.5;">${settings.customSummaryTemplate || ''}</textarea>
            <div style="display: flex; gap: 10px; margin-top: 12px;">
              <button class="wechat-btn wechat-btn-block" id="wechat-summary-template-reset" style="flex: 1;">恢复默认</button>
              <button class="wechat-btn wechat-btn-primary wechat-btn-block" id="wechat-summary-template-save" style="flex: 1;">保存模板</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 弹窗 HTML
function generateModalsHTML(settings) {
  return `
    <div id="wechat-lorebook-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content wechat-modal-large" style="position: relative;">
        <button class="wechat-modal-close-x" id="wechat-lorebook-cancel" title="关闭">×</button>
        <div class="wechat-modal-title">选择世界书</div>
        <div class="wechat-lorebook-list" id="wechat-lorebook-list"></div>
      </div>
    </div>
    <div id="wechat-import-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content" style="position: relative;">
        <button class="wechat-modal-close-x" id="wechat-import-cancel" title="关闭">×</button>
        <div class="wechat-modal-title">添加好友</div>
        <div class="wechat-card-preview" id="wechat-card-preview"></div>
        <div class="wechat-modal-actions">
          <button class="wechat-btn wechat-btn-primary" id="wechat-import-confirm">添加</button>
        </div>
      </div>
    </div>
    <div id="wechat-multi-msg-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content wechat-modal-multi-msg" style="position: relative;">
        <button class="wechat-modal-close-x" id="wechat-multi-msg-cancel" title="关闭">×</button>
        <div class="wechat-modal-title">编辑多条消息</div>
        <div class="wechat-multi-msg-list" id="wechat-multi-msg-list"></div>
        <button class="wechat-btn wechat-btn-add-msg" id="wechat-add-msg-btn"><span>+</span> 添加一条消息</button>
        <div class="wechat-modal-actions">
          <button class="wechat-btn wechat-btn-primary" id="wechat-multi-msg-send">发送</button>
        </div>
      </div>
    </div>
    <div id="wechat-voice-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content wechat-modal-voice" style="position: relative;">
        <button class="wechat-modal-close-x" id="wechat-voice-cancel" title="关闭">×</button>
        <div class="wechat-modal-title">发送语音消息</div>
        <div class="wechat-voice-input-hint">输入语音内容（将显示为语音条）</div>
        <textarea class="wechat-voice-input-text" id="wechat-voice-input-text" placeholder="输入你想说的话..."></textarea>
        <div class="wechat-voice-preview" id="wechat-voice-preview">
          <span class="wechat-voice-preview-label">预计时长：</span>
          <span class="wechat-voice-preview-duration" id="wechat-voice-preview-duration">0"</span>
        </div>
        <div class="wechat-modal-actions">
          <button class="wechat-btn wechat-btn-primary" id="wechat-voice-send">发送语音</button>
        </div>
      </div>
    </div>

    <!-- 角色设置弹窗 -->
    <div id="wechat-contact-settings-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content" style="position: relative; max-width: 380px; max-height: 85vh; overflow-y: auto;">
        <button class="wechat-modal-close-x" id="wechat-contact-settings-close">×</button>
        <div class="wechat-modal-title">角色设置</div>

        <div class="wechat-contact-settings-avatar-section" style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div class="wechat-contact-settings-avatar" id="wechat-contact-avatar-preview" style="width: 60px; height: 60px; border-radius: 8px; overflow: hidden; background: var(--wechat-bg-secondary); display: flex; align-items: center; justify-content: center; font-size: 24px;"></div>
          <div style="flex: 1;">
            <div id="wechat-contact-settings-name" style="font-weight: 500; margin-bottom: 4px;"></div>
            <button class="wechat-btn wechat-btn-small" id="wechat-change-avatar-btn">更换头像</button>
            <input type="file" id="wechat-contact-avatar-file" accept="image/*" style="display: none;">
          </div>
        </div>

        <div class="wechat-settings-section-title" style="font-size: 13px; margin-bottom: 8px;">API 配置</div>
        <div class="wechat-settings-group" style="padding: 12px; background: var(--wechat-bg-secondary); border-radius: 8px; margin-bottom: 12px;">
          <div class="wechat-settings-item" style="margin-bottom: 12px;">
            <span class="wechat-settings-label">使用独立API</span>
            <div class="wechat-switch" id="wechat-contact-custom-api-toggle"></div>
          </div>

          <div id="wechat-contact-api-settings" class="hidden" style="display: flex; flex-direction: column; gap: 10px;">
            <div>
              <span class="wechat-settings-label" style="font-size: 12px; margin-bottom: 4px; display: block;">API 地址</span>
              <input type="text" class="wechat-settings-input" id="wechat-contact-api-url" placeholder="https://api.example.com/v1" style="width: 100%; box-sizing: border-box;">
            </div>
            <div>
              <span class="wechat-settings-label" style="font-size: 12px; margin-bottom: 4px; display: block;">API 密钥</span>
              <input type="password" class="wechat-settings-input" id="wechat-contact-api-key" placeholder="sk-xxx" style="width: 100%; box-sizing: border-box;">
            </div>
            <div>
              <span class="wechat-settings-label" style="font-size: 12px; margin-bottom: 4px; display: block;">模型</span>
              <div style="display: flex; gap: 8px;">
                <input type="text" class="wechat-settings-input" id="wechat-contact-model" placeholder="模型名称" list="wechat-contact-model-list" style="flex: 1; box-sizing: border-box;">
                <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-contact-fetch-model" style="white-space: nowrap;">获取</button>
              </div>
              <datalist id="wechat-contact-model-list"></datalist>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <button class="wechat-btn wechat-btn-small" id="wechat-contact-test-api" style="flex: 1;">测试连接</button>
            </div>
          </div>
        </div>

        <div class="wechat-settings-section-title" style="font-size: 13px; margin-bottom: 8px;">高级功能</div>
        <div class="wechat-settings-group" style="padding: 12px; background: var(--wechat-bg-secondary); border-radius: 8px; margin-bottom: 16px;">
          <div class="wechat-settings-item">
            <div style="flex: 1;">
              <span class="wechat-settings-label">哈基米破限</span>
              <div style="font-size: 11px; color: var(--wechat-text-secondary);">独立于全局设置</div>
            </div>
            <div class="wechat-switch" id="wechat-contact-hakimi-toggle"></div>
          </div>
        </div>

        <div class="wechat-modal-actions">
          <button class="wechat-btn wechat-btn-primary" id="wechat-contact-settings-save">保存</button>
        </div>
      </div>
    </div>

    <!-- 群聊创建弹窗 -->
    <div id="wechat-group-create-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content wechat-modal-large" style="position: relative; max-height: 85vh; overflow-y: auto;">
        <button class="wechat-modal-close-x" id="wechat-group-create-close">×</button>
        <div class="wechat-modal-title">发起群聊</div>

        <div style="margin-bottom: 12px;">
          <input type="text" class="wechat-settings-input" id="wechat-group-name" placeholder="群聊名称（可选，默认使用成员名称）" style="width: 100%; box-sizing: border-box;">
        </div>

        <div class="wechat-settings-section-title" style="font-size: 13px; margin-bottom: 8px;">选择群成员</div>
        <div id="wechat-group-contacts-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--wechat-border); border-radius: 8px; padding: 8px;"></div>

        <div style="margin-top: 12px; text-align: center; color: var(--wechat-text-secondary); font-size: 13px;">
          已选择 <span id="wechat-group-selected-count" style="color: var(--wechat-primary); font-weight: 500;">0</span> 人
        </div>

        <div class="wechat-modal-actions" style="margin-top: 16px;">
          <button class="wechat-btn wechat-btn-primary" id="wechat-group-create-confirm" disabled>创建群聊</button>
        </div>
      </div>
    </div>
  `;
}

// 语音通话页面 HTML
function generateVoiceCallPageHTML() {
  return `
    <!-- 语音通话页面 -->
    <div id="wechat-voice-call-page" class="wechat-voice-call-page hidden">
      <div class="wechat-voice-call-header">
        <button class="wechat-voice-call-minimize" id="wechat-voice-call-minimize">
          <svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 3v18M3 9h6" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <span class="wechat-voice-call-time" id="wechat-voice-call-time">00:00</span>
        <span style="width: 24px;"></span>
      </div>

      <div class="wechat-voice-call-content">
        <div class="wechat-voice-call-avatar" id="wechat-voice-call-avatar"></div>
        <div class="wechat-voice-call-name" id="wechat-voice-call-name"></div>
        <div class="wechat-voice-call-status" id="wechat-voice-call-status">等待对方接受邀请</div>
      </div>

      <!-- 通话中对话框 -->
      <div class="wechat-voice-call-chat hidden" id="wechat-voice-call-chat">
        <div class="wechat-voice-call-messages" id="wechat-voice-call-messages"></div>
        <div class="wechat-voice-call-input-area">
          <input type="text" class="wechat-voice-call-input" id="wechat-voice-call-input" placeholder="输入文字...">
          <button class="wechat-voice-call-send" id="wechat-voice-call-send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>

      <!-- 来电接听按钮（AI发起时显示） -->
      <div class="wechat-voice-call-incoming-actions hidden" id="wechat-voice-call-incoming-actions">
        <div class="wechat-voice-call-action" id="wechat-voice-call-reject">
          <div class="wechat-voice-call-action-btn reject">
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor"/></svg>
          </div>
          <span class="wechat-voice-call-action-label">拒绝</span>
        </div>
        <div class="wechat-voice-call-action" id="wechat-voice-call-accept">
          <div class="wechat-voice-call-action-btn accept">
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor"/></svg>
          </div>
          <span class="wechat-voice-call-action-label">接听</span>
        </div>
      </div>

      <!-- 通话中操作按钮（接通后显示） -->
      <div class="wechat-voice-call-actions hidden" id="wechat-voice-call-actions">
        <div class="wechat-voice-call-action" id="wechat-voice-call-mute">
          <div class="wechat-voice-call-action-btn">
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          </div>
          <span class="wechat-voice-call-action-label">麦克风已开</span>
        </div>
        <div class="wechat-voice-call-action" id="wechat-voice-call-hangup">
          <div class="wechat-voice-call-action-btn hangup">
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor"/></svg>
          </div>
          <span class="wechat-voice-call-action-label">挂断</span>
        </div>
        <div class="wechat-voice-call-action" id="wechat-voice-call-speaker">
          <div class="wechat-voice-call-action-btn">
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          </div>
          <span class="wechat-voice-call-action-label">扬声器已关</span>
        </div>
      </div>
    </div>
  `;
}

// 视频通话页面 HTML
function generateVideoCallPageHTML() {
  return `
    <!-- 视频通话页面 -->
    <div id="wechat-video-call-page" class="wechat-video-call-page hidden">
      <!-- 顶部状态栏 -->
      <div class="wechat-video-call-header">
        <button class="wechat-video-call-minimize" id="wechat-video-call-minimize">
          <svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 3v18M3 9h6" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <div class="wechat-video-call-info">
          <span class="wechat-video-call-time" id="wechat-video-call-time">00:00</span>
        </div>
        <button class="wechat-video-call-switch" id="wechat-video-call-switch" title="切换摄像头">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M16 3h5v5M8 21H3v-5M21 3l-7.5 7.5M3 21l7.5-7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
      </div>

      <!-- 中间角色头像区域（圆形） -->
      <div class="wechat-video-call-center">
        <div class="wechat-video-call-avatar" id="wechat-video-call-avatar"></div>
        <div class="wechat-video-call-status" id="wechat-video-call-status">等待对方接受邀请</div>
      </div>

      <!-- 右上角用户头像小窗（长方形） -->
      <div class="wechat-video-call-local" id="wechat-video-call-local">
        <div class="wechat-video-call-local-avatar" id="wechat-video-call-local-avatar"></div>
      </div>

      <!-- 通话中对话框 -->
      <div class="wechat-video-call-chat hidden" id="wechat-video-call-chat">
        <div class="wechat-video-call-messages" id="wechat-video-call-messages"></div>
        <div class="wechat-video-call-input-area">
          <input type="text" class="wechat-video-call-input" id="wechat-video-call-input" placeholder="输入文字...">
          <button class="wechat-video-call-send" id="wechat-video-call-send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="wechat-video-call-actions">
        <div class="wechat-video-call-action" id="wechat-video-call-mute">
          <div class="wechat-video-call-action-btn">
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          </div>
          <span class="wechat-video-call-action-label">静音</span>
        </div>
        <div class="wechat-video-call-action" id="wechat-video-call-hangup">
          <div class="wechat-video-call-action-btn hangup">
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor"/></svg>
          </div>
          <span class="wechat-video-call-action-label">挂断</span>
        </div>
        <div class="wechat-video-call-action" id="wechat-video-call-camera">
          <div class="wechat-video-call-action-btn">
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          </div>
          <span class="wechat-video-call-action-label">摄像头</span>
        </div>
      </div>

      <!-- AI来电界面（AI发起视频通话时显示） -->
      <div class="wechat-video-call-incoming hidden" id="wechat-video-call-incoming">
        <div class="wechat-video-call-incoming-bg"></div>
        <div class="wechat-video-call-incoming-content">
          <div class="wechat-video-call-incoming-avatar" id="wechat-video-call-incoming-avatar"></div>
          <div class="wechat-video-call-incoming-name" id="wechat-video-call-incoming-name"></div>
          <div class="wechat-video-call-incoming-hint">邀请你视频通话...</div>
        </div>
        <div class="wechat-video-call-incoming-actions">
          <div class="wechat-video-call-incoming-action" id="wechat-video-call-incoming-decline">
            <div class="wechat-video-call-incoming-btn decline">
              <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.90-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor"/></svg>
            </div>
            <span>挂断</span>
          </div>
          <div class="wechat-video-call-incoming-action" id="wechat-video-call-incoming-camera">
            <div class="wechat-video-call-incoming-btn camera">
              <svg viewBox="0 0 24 24" width="28" height="28"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
            </div>
            <span>关闭摄像头</span>
          </div>
          <div class="wechat-video-call-incoming-action" id="wechat-video-call-incoming-accept">
            <div class="wechat-video-call-incoming-btn accept">
              <svg viewBox="0 0 24 24" width="28" height="28"><rect x="2" y="6" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M22 8l-7 4 7 4V8z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
            </div>
            <span>接听</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 朋友圈页面 HTML
function generateMomentsPageHTML() {
  return `
    <!-- 朋友圈页面 -->
    <div id="wechat-moments-page" class="wechat-moments-page hidden">
      <!-- 固定导航栏 -->
      <div class="wechat-moments-navbar" id="wechat-moments-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-moments-back-btn">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="wechat-navbar-title">朋友圈</span>
        <button class="wechat-navbar-btn" id="wechat-moments-camera-btn">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        </button>
      </div>
      <!-- 朋友圈滚动区域 -->
      <div class="wechat-moments-scroll">
        <!-- 朋友圈头部区域（封面+头像） -->
        <div class="wechat-moments-header">
          <div class="wechat-moments-cover" id="wechat-moments-cover">
            <div class="wechat-moments-cover-placeholder">
              <span>点击更换封面</span>
            </div>
          </div>
          <div class="wechat-moments-profile">
            <span class="wechat-moments-username" id="wechat-moments-username">User</span>
            <div class="wechat-moments-avatar" id="wechat-moments-avatar"></div>
          </div>
        </div>

        <!-- 朋友圈内容列表 -->
        <div class="wechat-moments-list" id="wechat-moments-list">
          <!-- 朋友圈内容由 JS 动态填充 -->
        </div>
      </div>

      <!-- 点赞评论弹窗 -->
      <div class="wechat-moments-action-popup hidden" id="wechat-moments-action-popup">
        <div class="wechat-moments-action-btn" data-action="like">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          <span>赞</span>
        </div>
        <div class="wechat-moments-action-divider"></div>
        <div class="wechat-moments-action-btn" data-action="comment">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          <span>评论</span>
        </div>
      </div>

      <!-- 评论输入框 -->
      <div class="wechat-moments-comment-input hidden" id="wechat-moments-comment-input">
        <input type="text" placeholder="评论" id="wechat-moments-comment-text">
        <button class="wechat-moments-comment-send" id="wechat-moments-comment-send">发送</button>
      </div>
    </div>
  `;
}

// 音乐搜索面板 HTML
export function generateMusicPanelHTML() {
  return `
    <!-- 音乐搜索面板 -->
    <div id="wechat-music-panel" class="wechat-music-panel hidden">
      <div class="wechat-music-header">
        <button class="wechat-music-back" id="wechat-music-back">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
        <span class="wechat-music-title">搜索音乐</span>
        <span></span>
      </div>
      <div class="wechat-music-search">
        <div class="wechat-music-search-box">
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input type="text" id="wechat-music-search-input" placeholder="搜索歌名、歌手或歌词">
        </div>
      </div>
      <div class="wechat-music-results" id="wechat-music-results">
        <div class="wechat-music-empty">输入关键词搜索音乐</div>
      </div>
      <div class="wechat-music-player hidden" id="wechat-music-player">
        <audio id="wechat-music-audio"></audio>
        <div class="wechat-music-player-info">
          <img id="wechat-music-player-cover" src="" alt="封面">
          <div class="wechat-music-player-text">
            <div class="wechat-music-player-name" id="wechat-music-player-name">歌曲名</div>
            <div class="wechat-music-player-artist" id="wechat-music-player-artist">歌手</div>
          </div>
        </div>
        <div class="wechat-music-player-controls">
          <button class="wechat-music-player-btn" id="wechat-music-player-play">
            <svg viewBox="0 0 24 24" width="24" height="24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
          </button>
          <button class="wechat-music-player-btn wechat-music-share-btn" id="wechat-music-player-share">分享</button>
        </div>
      </div>
    </div>
  `;
}

// 发红包页面 HTML
function generateRedPacketPageHTML(settings) {
  return `
    <!-- 发红包页面 -->
    <div id="wechat-red-packet-page" class="wechat-red-packet-page hidden">
      <div class="wechat-navbar wechat-rp-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-red-packet-back">‹</button>
        <span class="wechat-navbar-title">发红包</span>
        <button class="wechat-navbar-btn">⋯</button>
      </div>
      <div class="wechat-rp-content">
        <div class="wechat-rp-form">
          <div class="wechat-rp-row">
            <span class="wechat-rp-label">金额</span>
            <input type="number" step="0.01" min="0.01" max="200" class="wechat-rp-amount-input" id="wechat-red-packet-amount-input" placeholder="0.00">
          </div>
          <div class="wechat-rp-row">
            <input type="text" class="wechat-rp-message-input" id="wechat-red-packet-message" placeholder="恭喜发财，大吉大利" maxlength="20">
            <span class="wechat-rp-emoji-btn"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="2" stroke-linecap="round"/><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="2" stroke-linecap="round"/></svg></span>
          </div>
          <div class="wechat-rp-row wechat-rp-cover-row">
            <span class="wechat-rp-label">红包封面</span>
            <span class="wechat-rp-arrow">›</span>
          </div>
        </div>
        <div class="wechat-rp-amount-display">
          <span id="wechat-red-packet-amount-display">¥ 0.00</span>
        </div>
        <button class="wechat-rp-submit-btn" id="wechat-red-packet-submit">塞钱进红包</button>
        <div class="wechat-rp-hint">未领取的红包，将于24小时后发起退款</div>
      </div>
      <!-- 密码输入弹窗 -->
      <div class="wechat-rp-password-modal hidden" id="wechat-red-packet-password-modal">
        <div class="wechat-rp-password-content">
          <button class="wechat-rp-password-close" id="wechat-password-modal-close">×</button>
          <div class="wechat-rp-password-title">请输入支付密码</div>
          <input type="password" maxlength="6" pattern="[0-9]*" inputmode="numeric" class="wechat-rp-password-input" id="wechat-red-packet-password-input" placeholder="请输入6位密码">
          <button class="wechat-rp-password-confirm-btn" id="wechat-red-packet-password-confirm">确定</button>
        </div>
      </div>
    </div>
  `;
}

// 开红包弹窗 HTML
function generateOpenRedPacketHTML() {
  return `
    <!-- 开红包弹窗 -->
    <div id="wechat-open-red-packet-modal" class="wechat-open-rp-modal hidden">
      <div class="wechat-open-rp-wrapper">
        <!-- 上半部分（动画时向上滑出） -->
        <div class="wechat-open-rp-top" id="wechat-open-rp-top">
          <button class="wechat-open-rp-close" id="wechat-open-rp-close">×</button>
          <div class="wechat-open-rp-header">
            <div class="wechat-open-rp-icon">${ICON_RED_PACKET_LARGE}</div>
            <div class="wechat-open-rp-sender" id="wechat-open-rp-sender">xxx发出的红包</div>
          </div>
          <div class="wechat-open-rp-message" id="wechat-open-rp-message">恭喜发财，大吉大利</div>
        </div>
        <!-- 開按钮 -->
        <div class="wechat-open-rp-btn-wrapper">
          <button class="wechat-open-rp-btn" id="wechat-open-rp-btn">開</button>
        </div>
        <!-- 下半部分（动画时向下滑出） -->
        <div class="wechat-open-rp-bottom" id="wechat-open-rp-bottom"></div>
      </div>
      <!-- 底部红包预览条 -->
      <div class="wechat-open-rp-preview">
        <span class="wechat-open-rp-preview-icon">${ICON_RED_PACKET}</span>
        <span class="wechat-open-rp-preview-msg" id="wechat-open-rp-preview-msg">恭喜发财，大吉大利</span>
        <button class="wechat-open-rp-preview-close" id="wechat-open-rp-preview-close">×</button>
      </div>
    </div>
  `;
}

// 发转账页面 HTML
function generateTransferPageHTML() {
  return `
    <!-- 发转账页面 -->
    <div id="wechat-transfer-page" class="wechat-transfer-page hidden">
      <div class="wechat-navbar wechat-tf-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-transfer-back">‹</button>
        <span class="wechat-navbar-title">转账</span>
        <button class="wechat-navbar-btn">⋯</button>
      </div>
      <div class="wechat-tf-content">
        <div class="wechat-tf-form">
          <div class="wechat-tf-row">
            <span class="wechat-tf-label">金额</span>
            <input type="number" step="0.01" min="0.01" class="wechat-tf-amount-input" id="wechat-transfer-amount-input" placeholder="0.00">
          </div>
          <div class="wechat-tf-row">
            <input type="text" class="wechat-tf-desc-input" id="wechat-transfer-description" placeholder="添加转账说明" maxlength="30">
          </div>
        </div>
        <div class="wechat-tf-amount-display">
          <span id="wechat-transfer-amount-display">¥ 0.00</span>
        </div>
      </div>
      <div class="wechat-tf-footer">
        <button class="wechat-tf-submit-btn" id="wechat-transfer-submit">转账</button>
        <div class="wechat-tf-hint">转账给好友后对方需确认收款</div>
      </div>
      <!-- 密码输入弹窗 -->
      <div class="wechat-tf-password-modal hidden" id="wechat-transfer-password-modal">
        <div class="wechat-tf-password-content">
          <button class="wechat-tf-password-close" id="wechat-transfer-password-close">×</button>
          <div class="wechat-tf-password-title">请输入支付密码</div>
          <input type="password" maxlength="6" pattern="[0-9]*" inputmode="numeric" class="wechat-tf-password-input" id="wechat-transfer-password-input" placeholder="请输入6位密码">
          <button class="wechat-tf-password-confirm-btn" id="wechat-transfer-password-confirm">确定</button>
        </div>
      </div>
    </div>
  `;
}

// 收款页面 HTML
function generateReceiveTransferPageHTML() {
  return `
    <!-- 收款页面 -->
    <div id="wechat-receive-transfer-page" class="wechat-receive-tf-page hidden">
      <div class="wechat-navbar wechat-tf-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-transfer-receive-back">‹</button>
        <span class="wechat-navbar-title">转账</span>
        <span></span>
      </div>
      <div class="wechat-receive-tf-content">
        <div class="wechat-receive-tf-card">
          <div class="wechat-receive-tf-sender">
            <div class="wechat-receive-tf-avatar" id="wechat-transfer-receive-avatar"></div>
            <div class="wechat-receive-tf-name" id="wechat-transfer-receive-name">对方</div>
          </div>
          <div class="wechat-receive-tf-amount" id="wechat-transfer-receive-amount">¥0.00</div>
          <div class="wechat-receive-tf-desc" id="wechat-transfer-receive-desc">转账给你</div>
          <div class="wechat-receive-tf-actions">
            <button class="wechat-receive-tf-btn refund" id="wechat-transfer-refund-btn">退还</button>
            <button class="wechat-receive-tf-btn receive" id="wechat-transfer-receive-btn">收款</button>
          </div>
        </div>
        <div class="wechat-receive-tf-tip">24小时内未确认，将退回给对方</div>
      </div>
    </div>
  `;
}

// 退还确认框 HTML
function generateTransferRefundConfirmHTML() {
  return `
    <!-- 退还确认框 -->
    <div id="wechat-transfer-refund-confirm" class="wechat-transfer-confirm-modal hidden">
      <div class="wechat-transfer-confirm-content">
        <div class="wechat-transfer-confirm-title">退还转账?</div>
        <div class="wechat-transfer-confirm-actions">
          <button class="wechat-transfer-confirm-btn cancel" id="wechat-transfer-refund-cancel">暂不退还</button>
          <button class="wechat-transfer-confirm-btn confirm" id="wechat-transfer-refund-confirm">退还</button>
        </div>
      </div>
    </div>
  `;
}

// 红包详情页 HTML
function generateRedPacketDetailHTML(settings) {
  return `
    <!-- 红包详情页 -->
    <div id="wechat-red-packet-detail-page" class="wechat-rp-detail-page hidden">
      <div class="wechat-rp-detail-header">
        <button class="wechat-navbar-btn wechat-navbar-back wechat-rp-detail-back" id="wechat-rp-detail-back">‹</button>
        <span></span>
        <button class="wechat-navbar-btn">⋯</button>
      </div>
      <div class="wechat-rp-detail-top">
        <div class="wechat-rp-detail-icon">${ICON_RED_PACKET_LARGE}</div>
        <div class="wechat-rp-detail-sender" id="wechat-rp-detail-sender">xxx发出的红包</div>
        <div class="wechat-rp-detail-message" id="wechat-rp-detail-message">恭喜发财，大吉大利</div>
      </div>
      <div class="wechat-rp-detail-body">
        <div class="wechat-rp-detail-amount">
          <span id="wechat-rp-detail-amount">0.00</span>
          <span class="wechat-rp-detail-unit">元</span>
        </div>
        <div class="wechat-rp-detail-tip">已存入零钱，可直接提现 ›</div>
      </div>
      <div class="wechat-rp-detail-record">
        <div class="wechat-rp-detail-record-item">
          <div class="wechat-rp-detail-claimer-avatar" id="wechat-rp-detail-claimer-avatar">${ICON_USER}</div>
          <div class="wechat-rp-detail-claimer-info">
            <div class="wechat-rp-detail-claimer-name" id="wechat-rp-detail-claimer-name">User</div>
            <div class="wechat-rp-detail-claimer-time" id="wechat-rp-detail-claimer-time">00:00</div>
          </div>
          <div class="wechat-rp-detail-claimer-amount" id="wechat-rp-detail-claimer-amount">0.00元</div>
        </div>
      </div>
    </div>
  `;
}

// 一起听功能 HTML
function generateListenTogetherHTML() {
  return `
    <!-- 一起听搜索页面 -->
    <div id="wechat-listen-search-page" class="wechat-listen-search-page hidden">
      <div class="wechat-navbar">
        <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-listen-search-back">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="wechat-navbar-title">一起听</span>
        <span></span>
      </div>
      <div class="wechat-listen-search-content">
        <div class="wechat-listen-search-box">
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input type="text" id="wechat-listen-search-input" placeholder="搜索歌曲">
        </div>
        <div class="wechat-listen-search-results" id="wechat-listen-search-results">
          <div class="wechat-listen-search-empty">输入关键词搜索歌曲</div>
        </div>
      </div>
    </div>

    <!-- 一起听等待页面 -->
    <div id="wechat-listen-waiting-page" class="wechat-listen-waiting-page hidden">
      <div class="wechat-listen-waiting-bg">
        <div class="wechat-listen-waiting-content">
          <!-- 用户头像 -->
          <div class="wechat-listen-waiting-avatar" id="wechat-listen-waiting-avatar"></div>
          <!-- 歌曲封面 -->
          <div class="wechat-listen-waiting-cover-wrapper">
            <img class="wechat-listen-waiting-cover" id="wechat-listen-waiting-cover" src="" alt="封面">
            <!-- 雷达动画 -->
            <div class="wechat-listen-radar">
              <div class="wechat-listen-radar-ring"></div>
              <div class="wechat-listen-radar-ring"></div>
              <div class="wechat-listen-radar-ring"></div>
            </div>
          </div>
          <div class="wechat-listen-waiting-text">正在等待<span id="wechat-listen-waiting-name">TA</span><span id="wechat-listen-waiting-dots">...</span></div>
          <button class="wechat-listen-waiting-cancel" id="wechat-listen-cancel">取消</button>
        </div>
      </div>
    </div>

    <!-- 一起听主页面 -->
    <div id="wechat-listen-together-page" class="wechat-listen-together-page hidden">
      <!-- 顶部栏 -->
      <div class="wechat-listen-header">
        <button class="wechat-listen-back-btn" id="wechat-listen-back-btn">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="wechat-listen-header-title">一起听</span>
        <button class="wechat-listen-color-btn" id="wechat-listen-color-btn">
          <svg viewBox="0 0 24 24" width="22" height="22"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <!-- 背景颜色选择器 -->
      <div class="wechat-listen-color-picker hidden" id="wechat-listen-color-picker">
        <div class="wechat-listen-color-option" data-bg="starry" title="星空蓝"></div>
        <div class="wechat-listen-color-option" data-bg="orange" title="活力橙"></div>
        <div class="wechat-listen-color-option" data-bg="pink" title="可爱粉"></div>
        <div class="wechat-listen-color-option" data-bg="white" title="纯白"></div>
      </div>

      <!-- 双头像区域（AI在左，用户在右） -->
      <div class="wechat-listen-avatars">
        <div class="wechat-listen-avatar-item" id="wechat-listen-ai-avatar"></div>
        <div class="wechat-listen-avatar-connector">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 18v-6a9 9 0 0118 0v6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        </div>
        <div class="wechat-listen-avatar-item" id="wechat-listen-user-avatar"></div>
      </div>

      <!-- 歌曲信息（头像下方） -->
      <div class="wechat-listen-song-info">
        <div class="wechat-listen-song-name" id="wechat-listen-song-name">歌曲名</div>
        <div class="wechat-listen-song-artist" id="wechat-listen-song-artist">歌手</div>
      </div>

      <!-- 唱片区域 -->
      <div class="wechat-listen-disc-wrapper">
        <div class="wechat-listen-disc" id="wechat-listen-disc">
          <img class="wechat-listen-cover" id="wechat-listen-cover" src="" alt="封面">
        </div>
      </div>

      <!-- 进度条 -->
      <div class="wechat-listen-progress">
        <span class="wechat-listen-time" id="wechat-listen-current-time">0:00</span>
        <div class="wechat-listen-progress-bar">
          <div class="wechat-listen-progress-fill" id="wechat-listen-progress-fill"></div>
          <input type="range" class="wechat-listen-slider" id="wechat-listen-slider" min="0" max="100" value="0">
        </div>
        <span class="wechat-listen-time" id="wechat-listen-duration">0:00</span>
      </div>

      <!-- 聊天消息区域 -->
      <div class="wechat-listen-messages" id="wechat-listen-messages"></div>

      <!-- 聊天输入框 -->
      <div class="wechat-listen-chat-input" id="wechat-listen-chat-input">
        <input type="text" class="wechat-listen-input-text" id="wechat-listen-input-text" placeholder="输入文字...">
        <button class="wechat-listen-send-btn" id="wechat-listen-send-btn">
          <svg viewBox="0 0 24 24" width="20" height="20"><line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polygon points="22,2 15,22 11,13 2,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <!-- 控制按钮（底部） -->
      <div class="wechat-listen-controls">
        <button class="wechat-listen-ctrl-btn" id="wechat-listen-star-btn" title="更换背景">
          <svg viewBox="0 0 24 24" width="20" height="20"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="wechat-listen-ctrl-btn wechat-listen-play-btn" id="wechat-listen-play-btn">
          <svg viewBox="0 0 24 24" width="24" height="24"><polygon points="5,3 19,12 5,21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="wechat-listen-ctrl-btn" id="wechat-listen-end-btn" title="结束">
          <svg viewBox="0 0 24 24" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <!-- 换歌面板 -->
      <div class="wechat-listen-change-panel hidden" id="wechat-listen-change-panel">
        <div class="wechat-listen-change-header">
          <span class="wechat-listen-change-title">换一首</span>
          <button class="wechat-listen-change-close" id="wechat-listen-change-close">
            <svg viewBox="0 0 24 24" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="wechat-listen-change-search">
          <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input type="text" id="wechat-listen-change-input" placeholder="搜索歌曲">
        </div>
        <div class="wechat-listen-change-results" id="wechat-listen-change-results"></div>
      </div>
    </div>
  `;
}
