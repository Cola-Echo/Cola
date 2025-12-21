/**
 * （Legacy）可乐不加冰 v1.0.0 - SillyTavern 插件
 * 模拟微信界面，支持导入角色卡
 */

import { saveSettingsDebounced, getRequestHeaders } from '../../../../script.js';
import { getContext, extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { world_names, loadWorldInfo, saveWorldInfo, createNewWorldInfo } from '../../../world-info.js';

// 插件名称
const extensionName = 'wechat-simulator';

// 默认设置
const defaultSettings = {
  darkMode: true, // 默认开启深色模式
  autoInjectPrompt: true,
  contacts: [], // 存储导入的角色卡
  phoneVisible: false,
  userAvatar: '', // 用户自定义头像
  // API 配置
  apiUrl: '',
  apiKey: '',
  selectedModel: '', // 选中的模型
  modelList: [], // 缓存的模型列表
  // 总结功能 API 配置
  summaryApiUrl: '',
  summaryApiKey: '',
  summarySelectedModel: '',
  summaryModelList: [],
  // 上下文设置
  contextEnabled: false, // 上下文开关（需要主界面有聊天时才启用）
  contextLevel: 5, // 0-5层，参考酒馆主聊天
  contextTags: [], // 自定义提取标签，如 ['content', 'scene', 'action']
  walletAmount: '5773.89', // 钱包金额
};

// 作者注释模板
const authorNoteTemplate = `[微信消息格式指南]
当角色想要通过手机微信发送消息时，请使用以下格式：
- 普通消息：[微信: 消息内容]
- 语音消息：[语音: 秒数] 例如 [语音: 5秒]
- 图片消息：[图片: 图片描述]
- 朋友圈：[朋友圈: 内容 | 图片描述]
- 表情：[表情: 表情描述]
- 撤回消息：[撤回]
- 红包：[红包: 祝福语]
- 转账：[转账: 金额]

示例：
[微信: 你在干嘛呢？]
[语音: 10秒]
[微信: 刚录了条语音给你听~]`;

// 初始化设置
function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }
}

// 获取当前时间字符串
function getCurrentTime() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// 获取用户头像HTML
function getUserAvatarHTML() {
  const settings = extension_settings[extensionName];
  const context = getContext();
  const userName = context?.name1 || 'User';
  const firstChar = userName.charAt(0);

  // 优先使用自定义头像
  if (settings.userAvatar) {
    return `<img src="${settings.userAvatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
  }

  // 其次尝试从 SillyTavern 获取
  const userAvatar = context?.user_avatar;
  if (userAvatar) {
    // 尝试多种路径格式
    const avatarPaths = [
      `/User Avatars/${userAvatar}`,
      `/characters/${userAvatar}`,
      userAvatar
    ];
    // 使用第一个路径，onerror 时会显示首字母
    return `<img src="${avatarPaths[0]}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
  }

  // 尝试从 getUserPersonaFromST 获取
  const stPersona = getUserPersonaFromST();
  if (stPersona?.avatar) {
    return `<img src="/User Avatars/${stPersona.avatar}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${firstChar}'">`;
  }

  // 默认显示首字母
  return firstChar;
}

// 生成手机界面 HTML
function generatePhoneHTML() {
  const settings = extension_settings[extensionName];
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
          <!-- 聊天列表（列表样式） -->
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
          <!-- 联系人网格 -->
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

      <!-- 添加朋友页面 (隐藏) -->
      <div id="wechat-add-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-back-btn">‹</button>
          <span class="wechat-navbar-title">添加朋友</span>
          <span></span>
        </div>
        <div class="wechat-add-friend">
          <!-- 搜索框 -->
          <div class="wechat-add-search-wrapper">
            <div class="wechat-add-search-box">
              <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
              <span>微信号/手机号</span>
            </div>
          </div>
          <div class="wechat-add-desc">我的微信号：SillyTavern</div>

          <!-- 导入选项 -->
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

      <!-- 聊天页面 (隐藏) -->
      <div id="wechat-chat-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-chat-back-btn">‹</button>
          <span class="wechat-navbar-title" id="wechat-chat-title">聊天</span>
          <button class="wechat-navbar-btn">⋯</button>
        </div>
        <div class="wechat-chat">
          <div class="wechat-chat-messages" id="wechat-chat-messages">
            <!-- 消息会动态添加到这里 -->
          </div>
        </div>
        <!-- 功能面板 -->
        <div class="wechat-func-panel hidden" id="wechat-func-panel">
          <div class="wechat-func-pages" id="wechat-func-pages">
            <!-- 第一页 -->
            <div class="wechat-func-page" data-page="0">
              <div class="wechat-func-grid">
                <div class="wechat-func-item" data-func="photo">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
                  <span>照片</span>
                </div>
                <div class="wechat-func-item" data-func="camera">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
                  <span>拍摄</span>
                </div>
                <div class="wechat-func-item" data-func="videocall">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="2" y="6" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M22 8l-7 4 7 4V8z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
                  <span>视频通话</span>
                </div>
                <div class="wechat-func-item" data-func="location">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg></div>
                  <span>位置</span>
                </div>
                <div class="wechat-func-item" data-func="redpacket">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 8h16" stroke="currentColor" stroke-width="1.5"/></svg></div>
                  <span>红包</span>
                </div>
                <div class="wechat-func-item" data-func="gift">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8v13M3 12h18" stroke="currentColor" stroke-width="1.5"/><path d="M12 8c-2-4-6-4-6 0s4 0 6 0c2 0 6-4 6 0s-4 4-6 0" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
                  <span>礼物</span>
                </div>
                <div class="wechat-func-item" data-func="transfer">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 10h20" stroke="currentColor" stroke-width="1.5"/><path d="M6 15h4M14 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                  <span>转账</span>
                </div>
                <div class="wechat-func-item" data-func="multi">
                  <div class="wechat-func-icon green"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                  <span>多条消息</span>
                </div>
              </div>
            </div>
            <!-- 第二页 -->
            <div class="wechat-func-page" data-page="1">
              <div class="wechat-func-grid">
                <div class="wechat-func-item" data-func="voice">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                  <span>语音输入</span>
                </div>
                <div class="wechat-func-item" data-func="favorites">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                  <span>收藏</span>
                </div>
                <div class="wechat-func-item" data-func="contact">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
                  <span>个人名片</span>
                </div>
                <div class="wechat-func-item" data-func="file">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M14 2v6h6M10 12h4M10 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                  <span>文件</span>
                </div>
                <div class="wechat-func-item" data-func="card">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 9h20" stroke="currentColor" stroke-width="1.5"/></svg></div>
                  <span>卡券</span>
                </div>
                <div class="wechat-func-item" data-func="music">
                  <div class="wechat-func-icon"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></div>
                  <span>音乐</span>
                </div>
              </div>
            </div>
          </div>
          <div class="wechat-func-dots">
            <span class="wechat-func-dot active" data-page="0"></span>
            <span class="wechat-func-dot" data-page="1"></span>
          </div>
        </div>
        <!-- 语音/多条消息输入面板 -->
        <div class="wechat-expand-input hidden" id="wechat-expand-input">
          <div class="wechat-expand-header">
            <span class="wechat-expand-title" id="wechat-expand-title">语音消息</span>
            <button class="wechat-expand-close" id="wechat-expand-close">✕</button>
          </div>
          <div class="wechat-expand-body" id="wechat-expand-body">
            <!-- 内容会根据模式动态变化 -->
          </div>
          <div class="wechat-expand-footer">
            <button class="wechat-btn wechat-expand-send" id="wechat-expand-send">发送</button>
          </div>
        </div>
        <div class="wechat-chat-input">
          <button class="wechat-chat-input-voice">🎤</button>
          <input type="text" class="wechat-chat-input-text" placeholder="发送消息..." id="wechat-input">
          <button class="wechat-chat-input-emoji">😊</button>
          <button class="wechat-chat-input-more">+</button>
        </div>
      </div>

      <!-- "我"页面 (隐藏) -->
      <div id="wechat-me-page" class="hidden">
        <div class="wechat-navbar">
          <span></span>
          <span class="wechat-navbar-title">我</span>
          <span></span>
        </div>
        <div class="wechat-me-content">
          <!-- 用户信息卡片 -->
          <div class="wechat-me-profile" id="wechat-me-profile">
            <div class="wechat-me-avatar" id="wechat-me-avatar" title="点击更换头像">${getUserAvatarHTML()}</div>
            <input type="file" id="wechat-user-avatar-input" accept="image/*" style="display:none">
            <div class="wechat-me-info">
              <div class="wechat-me-name" id="wechat-me-name">User</div>
              <div class="wechat-me-id">微信号：<span id="wechat-me-wxid">${settings.wechatId || 'SillyTavern'}</span></div>
              <div class="wechat-me-status">+ 状态</div>
            </div>
            <div class="wechat-me-qr">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm8-2h6v6h-6V3zm2 2v2h2V5h-2zM3 13h6v6H3v-6zm2 2v2h2v-2H5zm13-2h1v1h-1v-1zm-3 0h1v1h-1v-1zm1 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm1 1h1v1h-1v-1zm1-1h1v1h-1v-1zm1 1h1v1h-1v-1zm0-2h1v1h-1v-1zm1 3h1v1h-1v-1z" fill="currentColor"/></svg>
              <span class="wechat-me-arrow">›</span>
            </div>
          </div>

          <!-- 菜单列表 -->
          <div class="wechat-me-menu">
            <div class="wechat-me-menu-item" id="wechat-menu-service">
              <div class="wechat-me-menu-icon green">
                <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-me-menu-text">服务</span>
              <span class="wechat-me-menu-arrow">›</span>
            </div>
          </div>

          <div class="wechat-me-menu">
            <div class="wechat-me-menu-item" id="wechat-menu-favorites">
              <div class="wechat-me-menu-icon orange">
                <svg viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-me-menu-text">收藏</span>
              <span class="wechat-me-menu-arrow">›</span>
            </div>
            <div class="wechat-me-menu-item" id="wechat-menu-moments">
              <div class="wechat-me-menu-icon blue">
                <svg viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-me-menu-text">朋友圈</span>
              <span class="wechat-me-menu-arrow">›</span>
            </div>
            <div class="wechat-me-menu-item" id="wechat-menu-cards">
              <div class="wechat-me-menu-icon blue">
                <svg viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-me-menu-text">卡包</span>
              <span class="wechat-me-menu-arrow">›</span>
            </div>
            <div class="wechat-me-menu-item" id="wechat-menu-emoji">
              <div class="wechat-me-menu-icon yellow">
                <svg viewBox="0 0 24 24"><path d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-me-menu-text">表情</span>
              <span class="wechat-me-menu-arrow">›</span>
            </div>
          </div>

          <div class="wechat-me-menu">
            <div class="wechat-me-menu-item" id="wechat-menu-settings">
              <div class="wechat-me-menu-icon gray">
                <svg viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-me-menu-text">设置</span>
              <span class="wechat-me-menu-arrow">›</span>
            </div>
          </div>
        </div>

        <!-- 底部标签栏 -->
        <div class="wechat-tabbar">
          <button class="wechat-tab" data-tab="chat">
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
          <button class="wechat-tab active" data-tab="me">
            <span class="wechat-tab-icon">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </span>
            <span>我</span>
          </button>
        </div>
      </div>

      <!-- 收藏/世界书页面 (隐藏) -->
      <div id="wechat-favorites-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-favorites-back-btn">‹</button>
          <span class="wechat-navbar-title">收藏</span>
          <button class="wechat-navbar-btn" id="wechat-favorites-add-btn">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="wechat-favorites-content">
          <!-- 搜索框 -->
          <div class="wechat-search-box">
            <div class="wechat-search-inner">
              <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
              <span>搜索</span>
            </div>
          </div>

          <!-- 分类标签 -->
          <div class="wechat-favorites-tabs">
            <div class="wechat-favorites-tab active" data-tab="all">全部</div>
            <div class="wechat-favorites-tab" data-tab="user">用户</div>
            <div class="wechat-favorites-tab" data-tab="character">角色卡</div>
            <div class="wechat-favorites-tab" data-tab="global">全局</div>
          </div>

          <!-- 世界书列表 -->
          <div class="wechat-favorites-list" id="wechat-favorites-list">
            <!-- 动态生成 -->
          </div>
        </div>
      </div>

      <!-- 设置页面 (隐藏) -->
      <div id="wechat-settings-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-settings-back-btn">‹</button>
          <span class="wechat-navbar-title">设置</span>
          <span></span>
        </div>
        <div class="wechat-settings">
          <!-- API 配置 -->
          <div class="wechat-settings-section-title">API 配置</div>
          <div class="wechat-settings-group">
            <div class="wechat-settings-item wechat-settings-item-vertical">
              <span class="wechat-settings-label">API 地址</span>
              <input type="text" class="wechat-settings-input" id="wechat-api-url"
                placeholder="https://api.example.com/v1"
                value="${settings.apiUrl || ''}">
            </div>
            <div class="wechat-settings-item wechat-settings-item-vertical">
              <span class="wechat-settings-label">API 密钥</span>
              <div class="wechat-settings-input-wrapper">
                <input type="password" class="wechat-settings-input" id="wechat-api-key"
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  value="${settings.apiKey || ''}">
                <button class="wechat-settings-eye-btn" id="wechat-toggle-key-visibility">
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </button>
              </div>
            </div>
            <div class="wechat-settings-item wechat-settings-item-vertical">
              <span class="wechat-settings-label">模型选择</span>
              <div class="wechat-settings-input-wrapper">
                <select class="wechat-settings-input wechat-settings-select" id="wechat-model-select">
                  <option value="">-- 请先获取模型列表 --</option>
                </select>
                <button class="wechat-btn wechat-btn-small" id="wechat-refresh-models" style="margin-left: 8px; flex-shrink: 0;">
                  刷新
                </button>
              </div>
            </div>
            <div class="wechat-settings-item">
              <button class="wechat-btn wechat-btn-blue wechat-btn-small" id="wechat-test-api">测试连接</button>
              <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-save-api">保存</button>
            </div>
          </div>

          <!-- 通用设置 -->
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
          </div>

          <!-- 危险操作 -->
          <div class="wechat-settings-section-title" style="color: #ff4d4f;">危险操作</div>
          <div class="wechat-settings-group" style="padding: 15px;">
            <button class="wechat-btn wechat-btn-danger wechat-btn-block" id="wechat-clear-contacts">
              清空所有联系人
            </button>
          </div>
        </div>
      </div>

      <!-- 服务页面 (隐藏) -->
      <div id="wechat-service-page" class="hidden">
        <div class="wechat-navbar">
          <button class="wechat-navbar-btn wechat-navbar-back" id="wechat-service-back-btn">‹</button>
          <span class="wechat-navbar-title">服务</span>
          <button class="wechat-navbar-btn">⋯</button>
        </div>
        <div class="wechat-service-content">
          <!-- 顶部绿色卡片 -->
          <div class="wechat-service-card">
            <div class="wechat-service-card-item" id="wechat-service-context">
              <div class="wechat-service-card-icon">
                <svg viewBox="0 0 24 24" width="28" height="28"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
              </div>
              <span class="wechat-service-card-text">上下文</span>
              <span class="wechat-service-card-amount" id="wechat-context-level-display">${settings.contextEnabled ? '已开启' : '已关闭'}</span>
            </div>
            <div class="wechat-service-card-divider"></div>
            <div class="wechat-service-card-item" id="wechat-service-wallet">
              <div class="wechat-service-card-icon">
                <svg viewBox="0 0 24 24" width="28" height="28"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 10h20" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="14" r="2" fill="currentColor"/></svg>
              </div>
              <span class="wechat-service-card-text">钱包</span>
              <span class="wechat-service-card-amount" id="wechat-wallet-amount">¥${settings.walletAmount || '5773.89'}</span>
            </div>
          </div>

          <!-- 上下文设置滑出面板 -->
          <div class="wechat-slide-panel hidden" id="wechat-context-panel">
            <!-- 开关 -->
            <div class="wechat-slide-panel-header">
              <span class="wechat-slide-panel-title">启用上下文</span>
              <label class="wechat-toggle wechat-toggle-small">
                <input type="checkbox" id="wechat-context-enabled" ${settings.contextEnabled ? 'checked' : ''}>
                <span class="wechat-toggle-slider"></span>
              </label>
            </div>
            <!-- 层数 -->
            <div class="wechat-slide-panel-section" id="wechat-context-settings" style="${settings.contextEnabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
              <div class="wechat-slide-panel-row-label">
                <span>层数</span>
                <span class="wechat-slide-panel-value" id="wechat-context-value">${settings.contextLevel ?? 5}</span>
              </div>
              <div class="wechat-slide-panel-body">
                <input type="range" class="wechat-slider" id="wechat-context-slider" min="0" max="5" value="${settings.contextLevel ?? 5}">
                <div class="wechat-slider-labels">
                  <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                </div>
              </div>
              <!-- 标签设置 -->
              <div class="wechat-slide-panel-row-label" style="margin-top: 12px;">
                <span>提取标签</span>
              </div>
              <div class="wechat-context-tags" id="wechat-context-tags">
                ${(settings.contextTags || []).map((tag, i) => `
                  <div class="wechat-context-tag-item" data-index="${i}">
                    <span>&lt;${tag}&gt;</span>
                    <button class="wechat-tag-del-btn" data-index="${i}">×</button>
                  </div>
                `).join('')}
                <button class="wechat-tag-add-btn" id="wechat-context-add-tag">+</button>
              </div>
              <div class="wechat-slide-panel-hint">从主界面聊天消息中提取指定标签内容</div>
            </div>
          </div>

          <!-- 钱包金额滑出面板 -->
          <div class="wechat-slide-panel hidden" id="wechat-wallet-panel">
            <div class="wechat-slide-panel-header">
              <span class="wechat-slide-panel-title">钱包金额</span>
            </div>
            <div class="wechat-slide-panel-body wechat-slide-panel-row">
              <input type="text" class="wechat-slide-input" id="wechat-wallet-input-slide" placeholder="输入金额" value="${settings.walletAmount || '5773.89'}">
              <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-wallet-save-slide">保存</button>
            </div>
          </div>

          <!-- 总结API配置滑出面板 -->
          <div class="wechat-slide-panel hidden" id="wechat-summary-panel">
            <div class="wechat-slide-panel-header">
              <span class="wechat-slide-panel-title">总结 API 配置</span>
              <button class="wechat-expand-close" id="wechat-summary-close">✕</button>
            </div>
            <!-- API URL -->
            <div class="wechat-slide-panel-row-label">
              <span>API URL</span>
            </div>
            <div class="wechat-slide-panel-body">
              <input type="text" class="wechat-settings-input" id="wechat-summary-url"
                placeholder="https://api.openai.com/v1"
                value="${settings.summaryApiUrl || ''}">
            </div>
            <!-- API Key -->
            <div class="wechat-slide-panel-row-label">
              <span>API Key</span>
            </div>
            <div class="wechat-slide-panel-body">
              <div class="wechat-settings-input-wrapper">
                <input type="password" class="wechat-settings-input" id="wechat-summary-key"
                  placeholder="sk-..."
                  value="${settings.summaryApiKey || ''}">
                <button class="wechat-settings-eye-btn" id="wechat-summary-key-toggle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke-width="2"/>
                  </svg>
                </button>
              </div>
            </div>
            <!-- 模型选择 -->
            <div class="wechat-slide-panel-row-label">
              <span>模型</span>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-summary-fetch-models" style="padding: 4px 10px; font-size: 12px;">
                获取列表
              </button>
            </div>
            <div class="wechat-slide-panel-body">
              <select class="wechat-settings-input wechat-settings-select" id="wechat-summary-model">
                <option value="">-- 选择模型 --</option>
                ${(settings.summaryModelList || []).map(m => `<option value="${m}" ${m === settings.summarySelectedModel ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <!-- 测试连接 -->
            <div class="wechat-slide-panel-body" style="margin-top: 10px;">
              <div class="wechat-slide-panel-row">
                <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-summary-test" style="flex: 1;">
                  🔗 测试连接
                </button>
                <button class="wechat-btn wechat-btn-small" id="wechat-summary-save" style="flex: 1; background: var(--wechat-green); color: white;">
                  💾 保存配置
                </button>
              </div>
            </div>
            <div id="wechat-summary-status" class="wechat-slide-panel-hint" style="margin-top: 8px; text-align: center;"></div>
            <!-- 分隔线 -->
            <div style="border-top: 1px solid var(--wechat-border); margin: 15px 0;"></div>
            <!-- 执行总结 -->
            <div class="wechat-slide-panel-header">
              <span class="wechat-slide-panel-title">生成世界书</span>
            </div>
            <div class="wechat-slide-panel-hint" style="margin-bottom: 10px;">
              收集所有聊天记录，生成世界书并同步到酒馆
            </div>
            <div class="wechat-slide-panel-body">
              <button class="wechat-btn wechat-btn-primary wechat-btn-block" id="wechat-summary-execute">
                执行总结
              </button>
            </div>
            <div class="wechat-slide-panel-body" style="margin-top: 8px;">
              <button class="wechat-btn wechat-btn-block" id="wechat-summary-rollback" style="background: var(--wechat-bg-secondary); color: var(--wechat-text-secondary);">
                回退总结
              </button>
            </div>
            <div id="wechat-summary-progress" class="wechat-slide-panel-hint" style="margin-top: 8px; text-align: center;"></div>
          </div>

          <!-- 总结功能 -->
          <div class="wechat-service-section">
            <div class="wechat-service-section-title">总结功能</div>
            <div class="wechat-service-grid">
              <div class="wechat-service-item" data-service="summary">
                <div class="wechat-service-icon blue">
                  <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <span>总结</span>
              </div>
              <div class="wechat-service-item" data-service="history">
                <div class="wechat-service-icon blue">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <span>历史回顾</span>
              </div>
              <div class="wechat-service-item" data-service="backup">
                <div class="wechat-service-icon green">
                  <svg viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <span>备份</span>
              </div>
            </div>
          </div>

          <!-- 生活服务 -->
          <div class="wechat-service-section">
            <div class="wechat-service-section-title">生活服务</div>
            <div class="wechat-service-grid">
              <div class="wechat-service-item" data-service="phone">
                <div class="wechat-service-icon green">
                  <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
                <span>手机充值</span>
              </div>
              <div class="wechat-service-item" data-service="utility">
                <div class="wechat-service-icon green">
                  <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </div>
                <span>生活缴费</span>
              </div>
              <div class="wechat-service-item" data-service="qcoin">
                <div class="wechat-service-icon orange">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><text x="12" y="16" text-anchor="middle" font-size="10" fill="currentColor">Q</text></svg>
                </div>
                <span>Q币充值</span>
              </div>
              <div class="wechat-service-item" data-service="city">
                <div class="wechat-service-icon blue">
                  <svg viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </div>
                <span>城市服务</span>
              </div>
              <div class="wechat-service-item" data-service="charity">
                <div class="wechat-service-icon red">
                  <svg viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </div>
                <span>腾讯公益</span>
              </div>
              <div class="wechat-service-item" data-service="medical">
                <div class="wechat-service-icon green">
                  <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                </div>
                <span>医疗健康</span>
              </div>
            </div>
          </div>

          <!-- 交通出行 -->
          <div class="wechat-service-section">
            <div class="wechat-service-section-title">交通出行</div>
            <div class="wechat-service-grid">
              <div class="wechat-service-item" data-service="travel">
                <div class="wechat-service-icon blue">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor" stroke-width="1.5"/></svg>
                </div>
                <span>出行服务</span>
              </div>
              <div class="wechat-service-item" data-service="train">
                <div class="wechat-service-icon blue">
                  <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 11h16M9 19l-2 3m8-3l2 3M9 7h.01M15 7h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <span>火车票机票</span>
              </div>
              <div class="wechat-service-item" data-service="didi">
                <div class="wechat-service-icon orange">
                  <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>
                </div>
                <span>滴滴出行</span>
              </div>
              <div class="wechat-service-item" data-service="hotel">
                <div class="wechat-service-icon orange">
                  <svg viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
                </div>
                <span>酒店民宿</span>
              </div>
            </div>
          </div>

          <!-- 购物消费 -->
          <div class="wechat-service-section">
            <div class="wechat-service-section-title">购物消费</div>
            <div class="wechat-service-grid">
              <div class="wechat-service-item" data-service="brand">
                <div class="wechat-service-icon red">
                  <svg viewBox="0 0 24 24"><path d="M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 4h4v3h-4V4z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </div>
                <span>品牌发现</span>
              </div>
              <div class="wechat-service-item" data-service="jd">
                <div class="wechat-service-icon red">
                  <svg viewBox="0 0 24 24"><path d="M9 22c.55 0 1-.45 1-1v-3H6v3c0 .55.45 1 1 1h2zM15 22c.55 0 1-.45 1-1v-3h-4v3c0 .55.45 1 1 1h2z" fill="currentColor"/><path d="M20 4H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </div>
                <span>京东购物</span>
              </div>
              <div class="wechat-service-item" data-service="meituan">
                <div class="wechat-service-icon orange">
                  <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z" fill="currentColor"/><path d="M15 8h-2v4H9V8H7v8h2v-2h4v2h2V8z" fill="currentColor"/></svg>
                </div>
                <span>美团外卖</span>
              </div>
              <div class="wechat-service-item" data-service="movie">
                <div class="wechat-service-icon red">
                  <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 8h20M6 4v4M10 4v4M14 4v4M18 4v4M6 16v4M10 16v4M14 16v4M18 16v4" stroke="currentColor" stroke-width="1.5"/></svg>
                </div>
                <span>电影演出</span>
              </div>
              <div class="wechat-service-item" data-service="groupbuy">
                <div class="wechat-service-icon orange">
                  <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
                </div>
                <span>美团团购</span>
              </div>
              <div class="wechat-service-item" data-service="pdd">
                <div class="wechat-service-icon red">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                </div>
                <span>拼多多</span>
              </div>
              <div class="wechat-service-item" data-service="vip">
                <div class="wechat-service-icon red">
                  <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
                </div>
                <span>唯品会特卖</span>
              </div>
              <div class="wechat-service-item" data-service="zhuanzhuan">
                <div class="wechat-service-icon green">
                  <svg viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <span>转转二手</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 世界书选择弹窗 -->
      <div id="wechat-lorebook-modal" class="wechat-modal hidden">
        <div class="wechat-modal-content wechat-modal-large" style="position: relative;">
          <button class="wechat-modal-close-x" id="wechat-lorebook-cancel" title="关闭">×</button>
          <div class="wechat-modal-title">选择世界书</div>
          <div class="wechat-lorebook-list" id="wechat-lorebook-list">
            <!-- 动态生成 -->
          </div>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input type="file" id="wechat-file-png" class="wechat-file-input" accept=".png">
    <input type="file" id="wechat-file-json" class="wechat-file-input" accept=".json">

    <!-- 导入确认弹窗 -->
    <div id="wechat-import-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content" style="position: relative;">
        <button class="wechat-modal-close-x" id="wechat-import-cancel" title="关闭">×</button>
        <div class="wechat-modal-title">添加好友</div>
        <div class="wechat-card-preview" id="wechat-card-preview">
          <!-- 预览内容会动态生成 -->
        </div>
        <div class="wechat-modal-actions">
          <button class="wechat-btn wechat-btn-primary" id="wechat-import-confirm">添加</button>
        </div>
      </div>
    </div>

    <!-- 多条消息编辑弹窗 -->
    <div id="wechat-multi-msg-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content wechat-modal-multi-msg" style="position: relative;">
        <button class="wechat-modal-close-x" id="wechat-multi-msg-cancel" title="关闭">×</button>
        <div class="wechat-modal-title">编辑多条消息</div>
        <div class="wechat-multi-msg-list" id="wechat-multi-msg-list">
          <!-- 消息条目会动态生成 -->
        </div>
        <button class="wechat-btn wechat-btn-add-msg" id="wechat-add-msg-btn">
          <span>+</span> 添加一条消息
        </button>
        <div class="wechat-modal-actions">
          <button class="wechat-btn wechat-btn-primary" id="wechat-multi-msg-send">发送</button>
        </div>
      </div>
    </div>

    <!-- 语音输入弹窗 -->
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
  `;
}

// 生成聊天列表 HTML（微信主页列表样式）
function generateChatList() {
  const settings = extension_settings[extensionName];
  const contacts = settings.contacts || [];

  if (contacts.length === 0) {
    return `
      <div class="wechat-empty">
        <div class="wechat-empty-icon">💬</div>
        <div class="wechat-empty-text">暂无聊天记录<br>添加好友开始聊天吧</div>
      </div>
    `;
  }

  // 获取有聊天记录的联系人，按最后消息时间排序
  const contactsWithChat = contacts.map((contact, index) => {
    const chatHistory = contact.chatHistory || [];
    const lastMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
    // 使用 timestamp 或从 time 字符串解析时间
    const lastMsgTime = lastMsg ? (lastMsg.timestamp || new Date(lastMsg.time).getTime() || 0) : 0;
    // 确保有 ID，没有则使用索引
    const contactId = contact.id || `idx_${index}`;
    return { ...contact, id: contactId, originalIndex: index, lastMsg, lastMsgTime };
  }).filter(c => c.lastMsg).sort((a, b) => b.lastMsgTime - a.lastMsgTime);

  if (contactsWithChat.length === 0) {
    return `
      <div class="wechat-empty">
        <div class="wechat-empty-icon">💬</div>
        <div class="wechat-empty-text">暂无聊天记录<br>点击通讯录选择好友开始聊天</div>
      </div>
    `;
  }

  return contactsWithChat.map(contact => {
    const lastMsg = contact.lastMsg;
    let preview = '';
    if (lastMsg.type === 'voice' || lastMsg.isVoice) {
      preview = '[语音消息]';
    } else if (lastMsg.type === 'image') {
      preview = '[图片]';
    } else {
      preview = lastMsg.content || '';
      if (preview.length > 20) preview = preview.substring(0, 20) + '...';
    }

    // 格式化时间
    const msgTime = contact.lastMsgTime ? formatChatTime(contact.lastMsgTime) : '';

    const avatarContent = contact.avatar
      ? `<img src="${contact.avatar}" alt="${contact.name}">`
      : `<span>${contact.name?.charAt(0) || '?'}</span>`;

    return `
      <div class="wechat-chat-item" data-contact-id="${contact.id}" data-index="${contact.originalIndex}">
        <div class="wechat-chat-item-avatar">${avatarContent}</div>
        <div class="wechat-chat-item-info">
          <div class="wechat-chat-item-name">${contact.name || '未知'}</div>
          <div class="wechat-chat-item-preview">${preview}</div>
        </div>
        <div class="wechat-chat-item-meta">
          <span class="wechat-chat-item-time">${msgTime}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 格式化聊天时间
function formatChatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const oneDay = 24 * 60 * 60 * 1000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    // 今天，显示时:分
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

// 刷新聊天列表
function refreshChatList() {
  const chatListEl = document.getElementById('wechat-chat-list');
  if (chatListEl) {
    chatListEl.innerHTML = generateChatList();
  }
}

// 通过联系人ID打开聊天
function openChatByContactId(contactId, index) {
  const settings = extension_settings[extensionName];
  const contacts = settings.contacts || [];

  // 先尝试通过 ID 查找
  let contactIndex = contacts.findIndex(c => c.id === contactId);

  // 如果找不到，尝试使用索引（兼容 idx_N 格式）
  if (contactIndex === -1 && contactId.startsWith('idx_')) {
    contactIndex = parseInt(contactId.replace('idx_', ''));
  }

  // 如果还是找不到，使用传入的 index
  if (contactIndex === -1 && typeof index === 'number') {
    contactIndex = index;
  }

  if (contactIndex >= 0 && contactIndex < contacts.length) {
    openChat(contactIndex);
  }
}

// 生成联系人列表 HTML（图片网格样式）
function generateContactsList() {
  const settings = extension_settings[extensionName];
  const contacts = settings.contacts || [];

  if (contacts.length === 0) {
    return `
      <div class="wechat-empty">
        <div class="wechat-empty-icon">💬</div>
        <div class="wechat-empty-text">暂无聊天<br>点击右上角 + 导入角色卡</div>
      </div>
    `;
  }

  return `<div class="wechat-contacts-grid">` + contacts.map((contact, index) => {
    const firstChar = contact.name ? contact.name.charAt(0) : '?';
    const avatarContent = contact.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.querySelector('.wechat-card-fallback').style.display='flex'">`
      : '';
    return `
    <div class="wechat-contact-card" data-index="${index}">
      <div class="wechat-card-swipe-wrapper">
        <div class="wechat-card-content">
          <div class="wechat-card-avatar" data-index="${index}" title="点击更换头像">
            ${avatarContent}
            <div class="wechat-card-fallback" style="${contact.avatar ? 'display:none' : 'display:flex'}">${firstChar}</div>
          </div>
          <div class="wechat-card-name">${contact.name}</div>
        </div>
        <div class="wechat-card-delete" data-index="${index}">
          <span>删除</span>
        </div>
      </div>
    </div>
  `}).join('') + `</div>`;
}

// 从 PNG 提取角色卡数据 (V2 格式)
async function extractCharacterFromPNG(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        const dataView = new DataView(arrayBuffer);

        // 检查 PNG 签名
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
          if (dataView.getUint8(i) !== pngSignature[i]) {
            throw new Error('不是有效的 PNG 文件');
          }
        }

        // 遍历 PNG chunks 寻找 tEXt 或 iTXt chunk
        let offset = 8;
        while (offset < arrayBuffer.byteLength) {
          const length = dataView.getUint32(offset);
          const type = String.fromCharCode(
            dataView.getUint8(offset + 4),
            dataView.getUint8(offset + 5),
            dataView.getUint8(offset + 6),
            dataView.getUint8(offset + 7)
          );

          if (type === 'tEXt' || type === 'iTXt') {
            const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
            const text = new TextDecoder('utf-8').decode(chunkData);

            // 检查是否是角色卡数据
            if (text.startsWith('chara\0')) {
              const base64Data = text.substring(6);
              // 正确处理 UTF-8 编码的 Base64 解码
              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              const jsonStr = new TextDecoder('utf-8').decode(bytes);
              const charData = JSON.parse(jsonStr);

              // 获取图片作为头像 (转为base64以便持久化存储)
              const uint8Array = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i]);
              }
              const avatarBase64 = 'data:image/png;base64,' + btoa(binary);

              resolve({
                name: charData.name || charData.data?.name || '未知角色',
                description: charData.description || charData.data?.description || '',
                avatar: avatarBase64,
                rawData: charData
              });
              return;
            }
          }

          offset += 12 + length; // 4 (length) + 4 (type) + length + 4 (CRC)
        }

        throw new Error('PNG 文件中未找到角色卡数据');
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

// 从 JSON 导入角色卡
async function extractCharacterFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const charData = JSON.parse(e.target.result);
        resolve({
          name: charData.name || charData.data?.name || '未知角色',
          description: charData.description || charData.data?.description || charData.personality || '',
          avatar: charData.avatar || null,
          rawData: charData
        });
      } catch (err) {
        reject(new Error('JSON 解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// 导入角色卡到 SillyTavern
async function importCharacterToST(characterData) {
  try {
    const context = getContext();

    // 创建一个格式化的角色卡对象
    const formData = new FormData();

    // 如果有原始文件数据，使用它
    if (characterData.file) {
      formData.append('avatar', characterData.file);
    }

    // 调用 SillyTavern 的角色导入 API
    const response = await fetch('/api/characters/import', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: formData
    });

    if (!response.ok) {
      throw new Error('导入失败');
    }

    return await response.json();
  } catch (err) {
    console.error('导入角色卡失败:', err);
    throw err;
  }
}

// 添加联系人
function addContact(characterData) {
  const settings = extension_settings[extensionName];
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 检查是否已存在
  const exists = settings.contacts.some(c => c.name === characterData.name);
  if (exists) {
    showToast('该角色已在联系人列表中', '⚠️');
    return false;
  }

  settings.contacts.push({
    id: 'contact_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    name: characterData.name,
    description: characterData.description?.substring(0, 50) + '...' || '',
    avatar: characterData.avatar,
    importTime: timeStr,
    rawData: characterData.rawData
  });

  saveSettingsDebounced();
  refreshContactsList();
  return true;
}

// 刷新联系人列表
function refreshContactsList() {
  const contactsContainer = document.getElementById('wechat-contacts');
  if (contactsContainer) {
    contactsContainer.innerHTML = generateContactsList();
    bindContactsEvents();
  }
}

// 绑定联系人点击事件
function bindContactsEvents() {
  // 单击卡片进入聊天（点击头像除外）
  document.querySelectorAll('.wechat-card-content').forEach(card => {
    card.addEventListener('click', function(e) {
      // 如果点击的是头像，不进入聊天（用于换头像）
      if (e.target.closest('.wechat-card-avatar')) return;
      const cardEl = this.closest('.wechat-contact-card');
      const index = parseInt(cardEl.dataset.index);
      openChat(index);
    });
  });

  // 单击头像更换角色头像
  document.querySelectorAll('.wechat-card-avatar').forEach(avatar => {
    avatar.addEventListener('click', function(e) {
      e.stopPropagation();
      const index = parseInt(this.dataset.index);
      changeContactAvatar(index);
    });
  });

  // 删除按钮点击
  document.querySelectorAll('.wechat-card-delete').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const index = parseInt(this.dataset.index);
      deleteContact(index);
    });
  });

  // 初始化滑动删除功能（支持触摸和鼠标）
  initSwipeToDelete();
}

// 删除联系人
function deleteContact(index) {
  const settings = extension_settings[extensionName];
  const contact = settings.contacts[index];
  if (!contact) return;

  if (confirm(`确定要删除 ${contact.name} 吗？`)) {
    settings.contacts.splice(index, 1);
    saveSettingsDebounced();
    refreshContactsList();
  }
}

// 初始化滑动删除功能
function initSwipeToDelete() {
  const cards = document.querySelectorAll('.wechat-contact-card');

  cards.forEach(card => {
    const wrapper = card.querySelector('.wechat-card-swipe-wrapper');
    if (!wrapper || wrapper.dataset.swipeInit) return;
    wrapper.dataset.swipeInit = 'true';

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let isOpen = false;
    const deleteWidth = 70; // 删除按钮宽度

    // 触摸开始 / 鼠标按下
    const handleStart = (e) => {
      // 如果点击的是头像，不触发滑动
      if (e.target.closest('.wechat-card-avatar')) return;

      isDragging = true;
      startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      wrapper.style.transition = 'none';
    };

    // 触摸移动 / 鼠标移动
    const handleMove = (e) => {
      if (!isDragging) return;

      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const diff = clientX - startX;

      // 计算新位置
      let newX;
      if (isOpen) {
        newX = -deleteWidth + diff;
      } else {
        newX = diff;
      }

      // 限制滑动范围
      newX = Math.max(-deleteWidth, Math.min(0, newX));
      currentX = newX;

      wrapper.style.transform = `translateX(${newX}px)`;
    };

    // 触摸结束 / 鼠标松开
    const handleEnd = () => {
      if (!isDragging) return;
      isDragging = false;

      wrapper.style.transition = 'transform 0.3s ease';

      // 判断是否打开或关闭
      if (currentX < -deleteWidth / 2) {
        // 打开删除按钮
        wrapper.style.transform = `translateX(-${deleteWidth}px)`;
        isOpen = true;
      } else {
        // 关闭删除按钮
        wrapper.style.transform = 'translateX(0)';
        isOpen = false;
      }
    };

    // 关闭其他卡片的删除按钮
    const closeOthers = () => {
      cards.forEach(otherCard => {
        if (otherCard !== card) {
          const otherWrapper = otherCard.querySelector('.wechat-card-swipe-wrapper');
          if (otherWrapper) {
            otherWrapper.style.transition = 'transform 0.3s ease';
            otherWrapper.style.transform = 'translateX(0)';
          }
        }
      });
    };

    // 触摸事件
    wrapper.addEventListener('touchstart', (e) => {
      closeOthers();
      handleStart(e);
    }, { passive: true });
    wrapper.addEventListener('touchmove', handleMove, { passive: true });
    wrapper.addEventListener('touchend', handleEnd);

    // 鼠标事件（电脑端支持）
    const onMouseMove = (e) => handleMove(e);
    const onMouseUp = () => {
      handleEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    wrapper.addEventListener('mousedown', (e) => {
      // 如果点击的是头像，不触发滑动
      if (e.target.closest('.wechat-card-avatar')) return;
      closeOthers();
      handleStart(e);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  });
}

// 更换角色头像
let pendingAvatarContactIndex = -1;

function changeContactAvatar(contactIndex) {
  pendingAvatarContactIndex = contactIndex;
  // 使用动态创建的 input
  let input = document.getElementById('wechat-contact-avatar-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'wechat-contact-avatar-input';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || pendingAvatarContactIndex < 0) return;

      try {
        const reader = new FileReader();
        reader.onload = function(event) {
          const settings = extension_settings[extensionName];
          if (settings.contacts[pendingAvatarContactIndex]) {
            settings.contacts[pendingAvatarContactIndex].avatar = event.target.result;
            saveSettingsDebounced();
            refreshContactsList();
            showToast('角色头像已更换');
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('更换角色头像失败:', err);
        showToast('更换头像失败: ' + err.message, '❌');
      }
      e.target.value = '';
      pendingAvatarContactIndex = -1;
    });
  }
  input.click();
}

// 当前聊天的联系人索引
let currentChatIndex = -1;

// 打开聊天界面
function openChat(contactIndex) {
  const settings = extension_settings[extensionName];
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  currentChatIndex = contactIndex;

  // 隐藏主页面，显示聊天页面
  document.getElementById('wechat-main-content').classList.add('hidden');
  document.getElementById('wechat-chat-page').classList.remove('hidden');

  // 设置标题
  document.getElementById('wechat-chat-title').textContent = contact.name;

  // 显示聊天历史或空白
  const messagesContainer = document.getElementById('wechat-chat-messages');
  const chatHistory = contact.chatHistory || [];

  if (chatHistory.length === 0) {
    // 空白聊天界面
    messagesContainer.innerHTML = '';
  } else {
    // 渲染聊天历史
    messagesContainer.innerHTML = renderChatHistory(contact, chatHistory);

    // 绑定历史语音消息的点击事件
    bindVoiceBubbleEvents(messagesContainer);
  }

  // 滚动到底部
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 绑定语音消息点击事件
function bindVoiceBubbleEvents(container) {
  const voiceBubbles = container.querySelectorAll('.wechat-voice-bubble:not([data-bound])');
  voiceBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');
    bubble.addEventListener('click', () => {
      const voiceId = bubble.dataset.voiceId;
      const textEl = document.getElementById(voiceId);
      if (textEl) {
        textEl.classList.toggle('hidden');
        bubble.classList.toggle('expanded');
      }
    });
  });
}

// 切换页面显示
function showPage(pageId) {
  ['wechat-main-content', 'wechat-add-page', 'wechat-chat-page', 'wechat-settings-page', 'wechat-me-page', 'wechat-favorites-page', 'wechat-service-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle('hidden', id !== pageId);
    }
  });

  // 如果进入"我"页面，更新用户信息
  if (pageId === 'wechat-me-page') {
    updateMePageInfo();
  }

  // 如果进入收藏页面，刷新列表
  if (pageId === 'wechat-favorites-page') {
    refreshFavoritesList();
  }

  // 如果进入服务页面，更新钱包金额显示
  if (pageId === 'wechat-service-page') {
    const settings = extension_settings[extensionName];
    const amountEl = document.getElementById('wechat-wallet-amount');
    if (amountEl) {
      const amount = settings.walletAmount || '5773.89';
      amountEl.textContent = amount.startsWith('¥') ? amount : `¥${amount}`;
    }
  }
}

// 更新"我"页面用户信息
function updateMePageInfo() {
  try {
    const context = getContext();
    if (context) {
      const userName = context.name1 || 'User';

      const nameEl = document.getElementById('wechat-me-name');
      const avatarEl = document.getElementById('wechat-me-avatar');

      if (nameEl) nameEl.textContent = userName;
      if (avatarEl) {
        avatarEl.innerHTML = getUserAvatarHTML();
      }
    }
  } catch (err) {
    console.error('更新用户信息失败:', err);
  }
}

// 刷新收藏/世界书列表
function refreshFavoritesList(filter = 'all') {
  const settings = extension_settings[extensionName];
  const listEl = document.getElementById('wechat-favorites-list');
  if (!listEl) return;

  // 关闭所有展开的面板
  closeUserPersonaPanel();
  closeEntryPanel();

  const items = [];

  // 收集用户设定 - 支持多条目
  if (filter === 'all' || filter === 'user') {
    // 初始化用户设定数组
    if (!settings.userPersonas) {
      settings.userPersonas = [];
      // 迁移旧数据
      if (settings.userPersona) {
        settings.userPersonas.push({
          id: Date.now(),
          name: settings.userPersona.name || '用户设定',
          content: settings.userPersona.customContent || settings.userPersona.content || '',
          enabled: settings.userPersona.enabled !== false
        });
      }
    }

    // 从酒馆读取用户设定（作为默认项，如果没有自定义的话）
    const stPersona = getUserPersonaFromST();
    if (stPersona && settings.userPersonas.length === 0) {
      settings.userPersonas.push({
        id: Date.now(),
        name: stPersona.name || '用户',
        content: stPersona.description || '',
        enabled: true,
        fromST: true
      });
    }

    // 添加所有用户设定条目
    settings.userPersonas.forEach((persona, idx) => {
      items.push({
        type: 'user-entry',
        personaIdx: idx,
        id: persona.id,
        name: persona.name || '用户设定',
        content: persona.content || '',
        enabled: persona.enabled !== false
      });
    });
  }

  // 收集角色卡的世界书条目 - 按角色分组
  if (filter === 'all' || filter === 'character') {
    settings.contacts.forEach((contact, contactIdx) => {
      if (contact.rawData?.data?.character_book?.entries?.length > 0) {
        const entries = contact.rawData.data.character_book.entries;
        // 先添加角色卡头部
        items.push({
          type: 'character-header',
          source: contact.name,
          contactIdx: contactIdx,
          entriesCount: entries.length,
          collapsed: contact.lorebookCollapsed !== false // 默认折叠
        });
        // 再添加条目（如果未折叠）
        if (contact.lorebookCollapsed === false) {
          entries.forEach((entry, idx) => {
            items.push({
              type: 'character',
              source: contact.name,
              contactIdx: contactIdx,
              entryIdx: idx,
              title: entry.comment || entry.keys?.[0] || `条目 ${idx + 1}`,
              content: entry.content || '',
              keys: entry.keys || [],
              enabled: entry.enabled !== false
            });
          });
        }
      }
    });
  }

  // 收集选择的世界书条目（全局世界书）
  if (filter === 'all' || filter === 'global') {
    (settings.selectedLorebooks || []).forEach((lb, lbIdx) => {
      // 跳过角色卡自带的世界书
      if (lb.fromCharacter) return;
      // 显示世界书本身
      items.push({
        type: 'global-header',
        source: lb.name,
        lorebookIdx: lbIdx,
        title: lb.name,
        date: lb.addedTime || '',
        entriesCount: (lb.entries || []).length,
        enabled: lb.enabled !== false
      });
      // 显示世界书下的条目
      (lb.entries || []).forEach((entry, entryIdx) => {
        items.push({
          type: 'global',
          source: lb.name,
          lorebookIdx: lbIdx,
          entryIdx: entryIdx,
          title: entry.comment || entry.keys?.[0] || entry.key?.[0] || `条目 ${entryIdx + 1}`,
          content: entry.content || '',
          keys: entry.keys || entry.key || [],
          enabled: entry.enabled !== false && entry.disable !== true
        });
      });
    });
  }

  if (items.length === 0) {
    const emptyMsg = filter === 'user'
      ? '暂无用户设定<br>请在酒馆中设置用户人格'
      : '暂无收藏<br>导入角色卡或添加世界书';
    listEl.innerHTML = `
      <div class="wechat-empty" style="padding: 40px 20px;">
        <div class="wechat-empty-icon">📚</div>
        <div class="wechat-empty-text">${emptyMsg}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map((item, idx) => {
    if (item.type === 'user-entry') {
      // 用户设定条目（带展开面板容器）
      const isEnabled = item.enabled !== false;
      const previewText = (item.content || '').substring(0, 40) + ((item.content || '').length > 40 ? '...' : '');
      return `
        <div class="wechat-persona-wrapper" data-persona-idx="${item.personaIdx}">
          <div class="wechat-favorites-entry wechat-favorites-user-entry" data-type="user-entry" data-persona-idx="${item.personaIdx}">
            <div class="wechat-favorites-header-icon">👤</div>
            <div class="wechat-favorites-entry-info">
              <span class="wechat-favorites-entry-title">${escapeHtml(item.name)}</span>
              <span class="wechat-favorites-entry-keys">${previewText || '点击编辑'}</span>
            </div>
            <label class="wechat-toggle wechat-toggle-small" data-type="user-entry" data-persona-idx="${item.personaIdx}">
              <input type="checkbox" ${isEnabled ? 'checked' : ''}>
              <span class="wechat-toggle-slider"></span>
            </label>
          </div>
          <div class="wechat-persona-expand-panel" id="wechat-persona-panel-${item.personaIdx}">
            <!-- 展开面板内容会动态插入 -->
          </div>
        </div>
      `;
    } else if (item.type === 'character-header') {
      // 角色卡世界书标题行（可折叠）
      const collapseIcon = item.collapsed ? '▶' : '▼';
      return `
        <div class="wechat-favorites-header wechat-favorites-character-header" data-type="character-header" data-contact-idx="${item.contactIdx}">
          <div class="wechat-favorites-collapse-icon">${collapseIcon}</div>
          <div class="wechat-favorites-header-icon">📝</div>
          <div class="wechat-favorites-header-info">
            <span class="wechat-favorites-header-title">${escapeHtml(item.source)}</span>
            <span class="wechat-favorites-header-count">${item.entriesCount} 个条目</span>
          </div>
        </div>
      `;
    } else if (item.type === 'global-header') {
      // 全局世界书标题行
      const isEnabled = item.enabled !== false;
      return `
        <div class="wechat-favorites-header" data-type="global-header" data-lb-idx="${item.lorebookIdx}">
          <div class="wechat-favorites-header-icon">🌍</div>
          <div class="wechat-favorites-header-info">
            <span class="wechat-favorites-header-title">${item.title}</span>
            <span class="wechat-favorites-header-count">${item.entriesCount} 个条目</span>
          </div>
          <label class="wechat-toggle" data-lb-idx="${item.lorebookIdx}">
            <input type="checkbox" ${isEnabled ? 'checked' : ''}>
            <span class="wechat-toggle-slider"></span>
          </label>
          <button class="wechat-favorites-delete-btn" data-lb-idx="${item.lorebookIdx}" title="删除">×</button>
        </div>
      `;
    } else {
      // 条目行（细条）- 带展开面板容器
      const enabledClass = item.enabled ? '' : 'disabled';
      const typeTag = item.type === 'character' ? '角色' : '全局';
      const entryId = `entry-${item.type}-${item.contactIdx ?? 'lb'}-${item.lorebookIdx ?? ''}-${item.entryIdx}`;
      return `
        <div class="wechat-entry-wrapper" data-entry-id="${entryId}">
          <div class="wechat-favorites-entry ${enabledClass}"
               data-type="${item.type}"
               data-contact-idx="${item.contactIdx ?? ''}"
               data-lb-idx="${item.lorebookIdx ?? ''}"
               data-entry-idx="${item.entryIdx}"
               data-entry-id="${entryId}">
            <div class="wechat-favorites-entry-info">
              <span class="wechat-favorites-entry-title">${item.title}</span>
              <span class="wechat-favorites-entry-keys">${item.keys.slice(0, 3).join(', ')}</span>
            </div>
            <span class="wechat-favorites-entry-tag">${typeTag}</span>
            <label class="wechat-toggle wechat-toggle-small" data-type="${item.type}" data-contact-idx="${item.contactIdx ?? ''}" data-lb-idx="${item.lorebookIdx ?? ''}" data-entry-idx="${item.entryIdx}">
              <input type="checkbox" ${item.enabled ? 'checked' : ''}>
              <span class="wechat-toggle-slider"></span>
            </label>
          </div>
          <div class="wechat-entry-expand-panel" id="${entryId}-panel">
            <!-- 展开面板内容会动态插入 -->
          </div>
        </div>
      `;
    }
  }).join('');

  // 如果是用户标签，在底部添加"新建"按钮
  if (filter === 'user') {
    listEl.innerHTML += `
      <button class="wechat-add-persona-btn" id="wechat-add-persona-btn">
        <span>+</span> 新建用户设定
      </button>
    `;
  }

  // 绑定用户设定条目点击事件（展开面板）
  listEl.querySelectorAll('.wechat-favorites-user-entry').forEach(entry => {
    entry.addEventListener('click', (e) => {
      if (e.target.closest('.wechat-toggle')) return;
      const personaIdx = parseInt(entry.dataset.personaIdx);
      toggleUserPersonaPanel(personaIdx);
    });
  });

  // 绑定用户设定开关
  listEl.querySelectorAll('.wechat-favorites-user-entry .wechat-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    const checkbox = toggle.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener('change', (e) => {
      const personaIdx = parseInt(toggle.dataset.personaIdx);
      if (settings.userPersonas && settings.userPersonas[personaIdx]) {
        settings.userPersonas[personaIdx].enabled = e.target.checked;
        saveSettingsDebounced();
      }
    });
  });

  // 绑定新建按钮（新建使用弹窗）
  document.getElementById('wechat-add-persona-btn')?.addEventListener('click', () => {
    showNewPersonaModal(); // 新建使用弹窗
  });

  // 绑定角色卡世界书头部点击（展开/折叠）
  listEl.querySelectorAll('.wechat-favorites-character-header').forEach(header => {
    header.addEventListener('click', () => {
      const contactIdx = parseInt(header.dataset.contactIdx);
      const contact = settings.contacts[contactIdx];
      if (contact) {
        // 切换折叠状态
        contact.lorebookCollapsed = contact.lorebookCollapsed === false ? true : false;
        saveSettingsDebounced();
        refreshFavoritesList(filter);
      }
    });
  });

  // 绑定条目点击事件（点击非toggle区域展开面板）
  listEl.querySelectorAll('.wechat-favorites-entry:not(.wechat-favorites-user-entry)').forEach(entry => {
    entry.addEventListener('click', (e) => {
      // 如果点击的是toggle，不展开面板
      if (e.target.closest('.wechat-toggle')) return;

      const type = entry.dataset.type;
      const entryIdx = parseInt(entry.dataset.entryIdx);
      const entryId = entry.dataset.entryId;

      if (type === 'character') {
        const contactIdx = parseInt(entry.dataset.contactIdx);
        toggleEntryPanel(type, contactIdx, null, entryIdx, entryId);
      } else if (type === 'global') {
        const lbIdx = parseInt(entry.dataset.lbIdx);
        toggleEntryPanel(type, null, lbIdx, entryIdx, entryId);
      }
    });
  });

  // 绑定删除按钮
  listEl.querySelectorAll('.wechat-favorites-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lbIdx = parseInt(btn.dataset.lbIdx);
      if (confirm('确定要删除这个世界书吗？')) {
        settings.selectedLorebooks.splice(lbIdx, 1);
        saveSettingsDebounced();
        refreshFavoritesList(filter);
      }
    });
  });

  // 绑定启用/禁用开关（世界书整体开关）
  listEl.querySelectorAll('.wechat-favorites-header .wechat-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    const checkbox = toggle.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener('change', (e) => {
      const lbIdx = parseInt(toggle.dataset.lbIdx);
      if (settings.selectedLorebooks[lbIdx]) {
        settings.selectedLorebooks[lbIdx].enabled = e.target.checked;
        saveSettingsDebounced();
      }
    });
  });

  // 绑定条目开关
  listEl.querySelectorAll('.wechat-favorites-entry .wechat-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    const checkbox = toggle.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener('change', (e) => {
      const type = toggle.dataset.type;
      const entryIdx = parseInt(toggle.dataset.entryIdx);

      if (type === 'character') {
        const contactIdx = parseInt(toggle.dataset.contactIdx);
        const contact = settings.contacts[contactIdx];
        if (contact?.rawData?.data?.character_book?.entries?.[entryIdx]) {
          contact.rawData.data.character_book.entries[entryIdx].enabled = e.target.checked;
          saveSettingsDebounced();
        }
      } else if (type === 'global') {
        const lbIdx = parseInt(toggle.dataset.lbIdx);
        if (settings.selectedLorebooks[lbIdx]?.entries?.[entryIdx]) {
          settings.selectedLorebooks[lbIdx].entries[entryIdx].enabled = e.target.checked;
          saveSettingsDebounced();
        }
      }

      // 更新条目样式
      const entryEl = toggle.closest('.wechat-favorites-entry');
      if (entryEl) {
        entryEl.classList.toggle('disabled', !e.target.checked);
      }
    });
  });
}

// 当前展开的条目ID
let currentExpandedEntryId = null;

// 切换条目展开面板
function toggleEntryPanel(type, contactIdx, lbIdx, entryIdx, entryId) {
  const settings = extension_settings[extensionName];
  const panel = document.getElementById(`${entryId}-panel`);
  const entryEl = document.querySelector(`.wechat-favorites-entry[data-entry-id="${entryId}"]`);

  if (!panel) return;

  let entry, source;
  if (type === 'character') {
    const contact = settings.contacts[contactIdx];
    entry = contact?.rawData?.data?.character_book?.entries?.[entryIdx];
    source = contact?.name || '未知角色';
  } else {
    const lb = settings.selectedLorebooks[lbIdx];
    entry = lb?.entries?.[entryIdx];
    source = lb?.name || '未知世界书';
  }

  if (!entry) {
    showToast('无法找到条目', '❌');
    return;
  }

  // 如果已经展开，则收起
  if (currentExpandedEntryId === entryId) {
    closeEntryPanel();
    return;
  }

  // 先关闭其他展开的面板
  if (currentExpandedEntryId) {
    closeEntryPanel();
  }

  currentExpandedEntryId = entryId;

  // 填充面板内容
  panel.innerHTML = `
    <div class="wechat-lorebook-panel-header">
      <span class="wechat-lorebook-panel-title">${entry.comment || entry.keys?.[0] || '条目详情'}</span>
      <button class="wechat-lorebook-panel-close" id="wechat-entry-panel-close">收起</button>
    </div>
    <div class="wechat-lorebook-panel-content">
      <div class="wechat-lorebook-entry-item">
        <div class="wechat-edit-field">
          <label>来源</label>
          <input type="text" id="wechat-entry-edit-source" value="${escapeHtml(source)}" readonly style="background: var(--wechat-bg-secondary); cursor: default;">
        </div>
        <div class="wechat-edit-field">
          <label>关键词</label>
          <input type="text" id="wechat-entry-edit-keys" value="${escapeHtml((entry.keys || entry.key || []).join(', '))}" placeholder="用逗号分隔多个关键词">
        </div>
        <div class="wechat-edit-field">
          <label>标题/备注</label>
          <input type="text" id="wechat-entry-edit-comment" value="${escapeHtml(entry.comment || '')}" placeholder="条目标题">
        </div>
        <div class="wechat-edit-field">
          <label>内容</label>
          <textarea id="wechat-entry-edit-content" placeholder="条目内容..." style="min-height: 120px;">${escapeHtml(entry.content || '')}</textarea>
        </div>
        <div class="wechat-edit-field" style="flex-direction: row; align-items: center; gap: 10px;">
          <label style="margin-bottom: 0;">状态</label>
          <span style="color: ${entry.enabled !== false && entry.disable !== true ? 'var(--wechat-green)' : 'var(--wechat-text-secondary)'}">
            ${entry.enabled !== false && entry.disable !== true ? '✅ 启用' : '❌ 禁用'}
          </span>
        </div>
      </div>
    </div>
    <div class="wechat-lorebook-panel-footer">
      <div class="wechat-edit-actions">
        <button class="wechat-btn wechat-btn-small wechat-btn-blue" id="wechat-entry-sync-btn">同步到酒馆</button>
      </div>
      <div class="wechat-edit-actions">
        <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-entry-save-btn">保存</button>
      </div>
    </div>
  `;

  // 显示面板
  panel.classList.add('wechat-lorebook-panel-show');
  entryEl?.classList.add('wechat-favorites-item-expanded');

  // 绑定事件
  bindEntryPanelEvents(type, contactIdx, lbIdx, entryIdx, entryId);
}

// 关闭条目展开面板
function closeEntryPanel() {
  if (!currentExpandedEntryId) return;

  const panel = document.getElementById(`${currentExpandedEntryId}-panel`);
  const entryEl = document.querySelector(`.wechat-favorites-entry[data-entry-id="${currentExpandedEntryId}"]`);

  if (panel) {
    panel.classList.remove('wechat-lorebook-panel-show');
    panel.innerHTML = '';
  }
  entryEl?.classList.remove('wechat-favorites-item-expanded');
  currentExpandedEntryId = null;
}

// 绑定条目面板事件
function bindEntryPanelEvents(type, contactIdx, lbIdx, entryIdx, entryId) {
  const settings = extension_settings[extensionName];

  // 收起按钮
  document.getElementById('wechat-entry-panel-close')?.addEventListener('click', () => {
    closeEntryPanel();
  });

  // 同步到酒馆
  document.getElementById('wechat-entry-sync-btn')?.addEventListener('click', async () => {
    const keys = document.getElementById('wechat-entry-edit-keys')?.value.trim();
    const comment = document.getElementById('wechat-entry-edit-comment')?.value.trim();
    const content = document.getElementById('wechat-entry-edit-content')?.value.trim();

    if (!content) {
      showToast('请先填写内容', '⚠️');
      return;
    }

    try {
      if (type === 'global') {
        const lb = settings.selectedLorebooks[lbIdx];
        if (lb && lb.name) {
          await syncLorebookEntryToTavern(lb.name, entryIdx, {
            keys: keys.split(/[,，]/).map(k => k.trim()).filter(k => k),
            comment: comment,
            content: content
          });
          showToast('已同步到酒馆');
        }
      } else {
        showToast('角色卡条目暂不支持同步', '⚠️');
      }
    } catch (err) {
      console.error('同步失败:', err);
      showToast('同步失败: ' + err.message, '❌');
    }
  });

  // 保存
  document.getElementById('wechat-entry-save-btn')?.addEventListener('click', () => {
    const keys = document.getElementById('wechat-entry-edit-keys')?.value.trim();
    const comment = document.getElementById('wechat-entry-edit-comment')?.value.trim();
    const content = document.getElementById('wechat-entry-edit-content')?.value.trim();

    let entry;
    if (type === 'character') {
      const contact = settings.contacts[contactIdx];
      entry = contact?.rawData?.data?.character_book?.entries?.[entryIdx];
    } else {
      entry = settings.selectedLorebooks[lbIdx]?.entries?.[entryIdx];
    }

    if (entry) {
      entry.keys = keys.split(/[,，]/).map(k => k.trim()).filter(k => k);
      entry.key = entry.keys; // 兼容两种格式
      entry.comment = comment;
      entry.content = content;
      saveSettingsDebounced();
      showToast('已保存');
      closeEntryPanel();
      // 刷新列表
      const activeTab = document.querySelector('.wechat-favorites-tab.active');
      refreshFavoritesList(activeTab?.dataset.tab || 'all');
    }
  });
}

// 同步世界书条目到酒馆
async function syncLorebookEntryToTavern(lorebookName, entryIdx, entryData) {
  try {
    if (typeof loadWorldInfo !== 'function' || typeof saveWorldInfo !== 'function') {
      throw new Error('世界书API不可用');
    }

    const worldData = await loadWorldInfo(lorebookName);
    if (!worldData?.entries) {
      throw new Error('无法加载世界书数据');
    }

    // 更新条目
    if (worldData.entries[entryIdx]) {
      worldData.entries[entryIdx].key = entryData.keys;
      worldData.entries[entryIdx].comment = entryData.comment;
      worldData.entries[entryIdx].content = entryData.content;
      await saveWorldInfo(lorebookName, worldData);
    } else {
      throw new Error('找不到对应的条目');
    }
  } catch (err) {
    console.error('同步世界书条目失败:', err);
    throw err;
  }
}

// 从酒馆获取用户设定
function getUserPersonaFromST() {
  try {
    // SillyTavern 暴露的全局变量
    let name = '';
    let description = '';
    let avatar = '';

    // 方法1: 从 getContext 获取
    const context = getContext();
    if (context) {
      name = context.name1 || '';
      avatar = context.user_avatar || '';
    }

    // 方法2: 从 name1 全局变量获取
    if (!name && typeof name1 !== 'undefined') {
      name = name1;
    }

    // 方法3: 从 power_user.persona_description 获取描述
    if (typeof power_user !== 'undefined') {
      if (power_user.persona_description) {
        description = power_user.persona_description;
      }
      // 从 personas 系统获取当前 persona
      if (power_user.personas && power_user.default_persona) {
        const currentPersona = power_user.default_persona;
        if (power_user.personas[currentPersona]) {
          description = power_user.personas[currentPersona];
          if (!name) name = currentPersona;
        }
      }
    }

    // 方法4: 尝试从 user_avatar 获取名字
    if (!name && typeof user_avatar !== 'undefined') {
      name = user_avatar.replace(/\.[^/.]+$/, ''); // 去掉扩展名
    }

    // 方法5: 从 DOM 获取当前 persona 描述
    if (!description) {
      const personaDescEl = document.querySelector('#persona_description');
      if (personaDescEl && personaDescEl.value) {
        description = personaDescEl.value;
      }
    }

    if (name || description) {
      return { name, description, avatar };
    }
  } catch (err) {
    console.error('获取用户设定失败:', err);
  }
  return null;
}

// 当前展开的用户设定索引
let currentExpandedPersonaIdx = -1;

// 切换用户设定展开面板
function toggleUserPersonaPanel(personaIdx) {
  const settings = extension_settings[extensionName];
  const panel = document.getElementById(`wechat-persona-panel-${personaIdx}`);
  const entryEl = document.querySelector(`.wechat-favorites-user-entry[data-persona-idx="${personaIdx}"]`);

  if (!panel || !settings.userPersonas?.[personaIdx]) return;

  // 如果已经展开，则收起
  if (currentExpandedPersonaIdx === personaIdx) {
    closeUserPersonaPanel();
    return;
  }

  // 先关闭其他展开的面板
  if (currentExpandedPersonaIdx >= 0) {
    closeUserPersonaPanel();
  }

  currentExpandedPersonaIdx = personaIdx;
  const persona = settings.userPersonas[personaIdx];

  // 填充面板内容
  panel.innerHTML = `
    <div class="wechat-lorebook-panel-header">
      <span class="wechat-lorebook-panel-title">编辑用户设定</span>
      <button class="wechat-lorebook-panel-close" id="wechat-persona-panel-close">收起</button>
    </div>
    <div class="wechat-lorebook-panel-content">
      <div class="wechat-lorebook-entry-item">
        <div class="wechat-edit-field">
          <label>名称</label>
          <input type="text" id="wechat-persona-edit-name" value="${escapeHtml(persona.name || '')}" placeholder="设定名称">
        </div>
        <div class="wechat-edit-field">
          <label>内容</label>
          <textarea id="wechat-persona-edit-content" placeholder="描述你的角色设定..." style="min-height: 120px;">${escapeHtml(persona.content || '')}</textarea>
        </div>
        <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 10px;">
          💡 启用的设定会作为用户背景发送给AI
        </div>
      </div>
    </div>
    <div class="wechat-lorebook-panel-footer">
      <div class="wechat-edit-actions">
        <button class="wechat-btn wechat-btn-small" id="wechat-persona-import-btn">从酒馆导入</button>
        <button class="wechat-btn wechat-btn-small wechat-btn-blue" id="wechat-persona-sync-btn">同步到酒馆</button>
      </div>
      <div class="wechat-edit-actions">
        <button class="wechat-btn wechat-btn-small wechat-btn-danger" id="wechat-persona-delete-btn">删除</button>
        <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-persona-save-btn">保存</button>
      </div>
    </div>
  `;

  // 显示面板
  panel.classList.add('wechat-lorebook-panel-show');
  entryEl?.classList.add('wechat-favorites-item-expanded');

  // 绑定事件
  bindPersonaPanelEvents(personaIdx);
}

// 关闭用户设定展开面板
function closeUserPersonaPanel() {
  if (currentExpandedPersonaIdx < 0) return;

  const panel = document.getElementById(`wechat-persona-panel-${currentExpandedPersonaIdx}`);
  const entryEl = document.querySelector(`.wechat-favorites-user-entry[data-persona-idx="${currentExpandedPersonaIdx}"]`);

  if (panel) {
    panel.classList.remove('wechat-lorebook-panel-show');
    panel.innerHTML = '';
  }
  entryEl?.classList.remove('wechat-favorites-item-expanded');
  currentExpandedPersonaIdx = -1;
}

// 绑定用户设定面板事件
function bindPersonaPanelEvents(personaIdx) {
  const settings = extension_settings[extensionName];

  // 收起按钮
  document.getElementById('wechat-persona-panel-close')?.addEventListener('click', () => {
    closeUserPersonaPanel();
  });

  // 从酒馆导入
  document.getElementById('wechat-persona-import-btn')?.addEventListener('click', () => {
    const stPersona = getUserPersonaFromST();
    if (stPersona) {
      const nameInput = document.getElementById('wechat-persona-edit-name');
      const contentInput = document.getElementById('wechat-persona-edit-content');
      if (nameInput) nameInput.value = stPersona.name || '';
      if (contentInput) contentInput.value = stPersona.description || '';
      showToast('已从酒馆导入用户设定');
    } else {
      showToast('未找到酒馆用户设定', '⚠️');
    }
  });

  // 同步到酒馆
  document.getElementById('wechat-persona-sync-btn')?.addEventListener('click', () => {
    const name = document.getElementById('wechat-persona-edit-name')?.value.trim();
    const content = document.getElementById('wechat-persona-edit-content')?.value.trim();

    if (!content) {
      showToast('请先填写内容', '⚠️');
      return;
    }

    syncPersonaToTavern(name, content);
  });

  // 删除
  document.getElementById('wechat-persona-delete-btn')?.addEventListener('click', () => {
    if (confirm('确定要删除这个用户设定吗？')) {
      settings.userPersonas.splice(personaIdx, 1);
      saveSettingsDebounced();
      closeUserPersonaPanel();
      refreshFavoritesList('user');
    }
  });

  // 保存
  document.getElementById('wechat-persona-save-btn')?.addEventListener('click', () => {
    const name = document.getElementById('wechat-persona-edit-name')?.value.trim();
    const content = document.getElementById('wechat-persona-edit-content')?.value.trim();

    if (!name) {
      showToast('请输入名称', '⚠️');
      return;
    }

    settings.userPersonas[personaIdx].name = name;
    settings.userPersonas[personaIdx].content = content;
    saveSettingsDebounced();

    showToast('已保存');
    closeUserPersonaPanel();
    refreshFavoritesList('user');
  });
}

// 同步用户设定到酒馆
function syncPersonaToTavern(name, content) {
  try {
    // 检查 power_user 是否可用
    if (typeof power_user === 'undefined') {
      showToast('无法访问酒馆设置', '❌');
      return;
    }

    // 更新 persona_description
    power_user.persona_description = content;

    // 如果有 name 且 personas 系统可用，也更新它
    if (name && power_user.personas && power_user.default_persona) {
      power_user.personas[power_user.default_persona] = content;
    }

    // 更新 DOM 中的输入框（如果存在）
    const personaDescEl = document.querySelector('#persona_description');
    if (personaDescEl) {
      personaDescEl.value = content;
      personaDescEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 触发酒馆保存
    if (typeof SillyTavern !== 'undefined' && SillyTavern.saveSettingsDebounced) {
      SillyTavern.saveSettingsDebounced();
    } else if (typeof saveSettingsDebounced !== 'undefined') {
      saveSettingsDebounced();
    }

    showToast('已同步到酒馆');
  } catch (err) {
    console.error('同步到酒馆失败:', err);
    showToast('同步失败: ' + err.message, '❌');
  }
}

// 显示新建用户设定弹窗
function showNewPersonaModal() {
  const settings = extension_settings[extensionName];

  // 初始化数组
  if (!settings.userPersonas) {
    settings.userPersonas = [];
  }

  const modal = document.createElement('div');
  modal.className = 'wechat-modal';
  modal.id = 'wechat-user-persona-modal';
  modal.innerHTML = `
    <div class="wechat-modal-content wechat-modal-large" style="position: relative;">
      <button class="wechat-modal-close-x" id="wechat-user-persona-cancel" title="关闭">×</button>
      <div class="wechat-modal-title">新建用户设定</div>
      <div style="margin-bottom: 15px;">
        <div style="font-size: 13px; color: var(--wechat-text-secondary); margin-bottom: 5px;">名称</div>
        <input type="text" class="wechat-settings-input" id="wechat-user-persona-name"
          placeholder="给这个设定起个名字" value="">
      </div>
      <div style="margin-bottom: 15px;">
        <div style="font-size: 13px; color: var(--wechat-text-secondary); margin-bottom: 5px;">内容</div>
        <textarea class="wechat-voice-input-text" id="wechat-user-persona-content"
          placeholder="描述你的角色设定..." style="min-height: 150px; max-height: 250px;"></textarea>
      </div>
      <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 15px;">
        💡 启用的设定会作为用户背景发送给AI
      </div>
      <div class="wechat-modal-actions">
        <button class="wechat-btn wechat-btn-secondary" id="wechat-user-persona-import">从酒馆导入</button>
        <button class="wechat-btn wechat-btn-primary" id="wechat-user-persona-save">创建</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 取消
  modal.querySelector('#wechat-user-persona-cancel').addEventListener('click', () => {
    modal.remove();
  });

  // 从酒馆导入
  modal.querySelector('#wechat-user-persona-import').addEventListener('click', () => {
    const stPersona = getUserPersonaFromST();
    if (stPersona) {
      document.getElementById('wechat-user-persona-name').value = stPersona.name || '';
      document.getElementById('wechat-user-persona-content').value = stPersona.description || '';
      showToast('已从酒馆导入用户设定');
    } else {
      showToast('未找到酒馆用户设定', '⚠️');
    }
  });

  // 保存
  modal.querySelector('#wechat-user-persona-save').addEventListener('click', () => {
    const name = document.getElementById('wechat-user-persona-name').value.trim();
    const content = document.getElementById('wechat-user-persona-content').value.trim();

    if (!name) {
      showToast('请输入名称', '⚠️');
      return;
    }

    // 新建
    settings.userPersonas.push({
      id: Date.now(),
      name: name,
      content: content,
      enabled: true
    });

    saveSettingsDebounced();
    refreshFavoritesList('user');
    modal.remove();
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// 获取酒馆世界书列表
async function getLorebooksList() {
  try {
    const response = await fetch('/api/worldinfo/get', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({})
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error('获取世界书列表失败:', err);
  }
  return [];
}

// 显示世界书选择弹窗
async function showLorebookModal() {
  const modal = document.getElementById('wechat-lorebook-modal');
  const listEl = document.getElementById('wechat-lorebook-list');

  listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--wechat-text-secondary);">加载中...</div>';
  modal.classList.remove('hidden');

  try {
    let lorebooks = [];

    // SillyTavern 在前端暴露了 world_names 全局变量
    if (typeof world_names !== 'undefined' && Array.isArray(world_names)) {
      lorebooks = [...world_names];
    }

    if (lorebooks.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--wechat-text-secondary);">
          暂无世界书<br>
          <small style="color:#888;">请在酒馆中创建世界书后刷新</small>
        </div>
      `;
      return;
    }

    // 过滤重复和空值
    lorebooks = [...new Set(lorebooks.filter(Boolean))];

    listEl.innerHTML = lorebooks.map(name => `
      <div class="wechat-lorebook-item" data-name="${name}">
        <div class="wechat-lorebook-item-icon">
          <svg viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        </div>
        <span class="wechat-lorebook-item-name">${name}</span>
        <span class="wechat-lorebook-item-arrow">›</span>
      </div>
    `).join('');

    // 绑定点击事件
    listEl.querySelectorAll('.wechat-lorebook-item').forEach(item => {
      item.addEventListener('click', async () => {
        const name = item.dataset.name;
        await loadLorebookEntries(name);
        modal.classList.add('hidden');
      });
    });
  } catch (err) {
    console.error('获取世界书失败:', err);
    listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--wechat-text-secondary);">加载失败: ' + err.message + '</div>';
  }
}

// 加载世界书条目
async function loadLorebookEntries(lorebookName) {
  const settings = extension_settings[extensionName];
  if (!settings.selectedLorebooks) {
    settings.selectedLorebooks = [];
  }

  // 检查是否已添加
  if (settings.selectedLorebooks.some(lb => lb.name === lorebookName)) {
    showToast('该世界书已在收藏中', '⚠️');
    return;
  }

  let entries = [];

  try {
    // 使用 SillyTavern 的 loadWorldInfo 函数加载世界书数据
    const data = await loadWorldInfo(lorebookName);
    if (data && data.entries) {
      entries = Object.values(data.entries);
    }
  } catch (err) {
    console.error('加载世界书条目失败:', err);
  }

  const now = new Date();
  const timeStr = `${(now.getMonth() + 1)}月${now.getDate()}日`;

  settings.selectedLorebooks.push({
    name: lorebookName,
    addedTime: timeStr,
    entries: entries
  });

  saveSettingsDebounced();
  refreshFavoritesList();

  if (entries.length > 0) {
    showToast(`已添加: ${lorebookName} (${entries.length}条)`);
  } else {
    showToast(`已添加: ${lorebookName}`);
  }
}

// 添加世界书到收藏
function addLorebookToFavorites(name) {
  const settings = extension_settings[extensionName];
  if (!settings.selectedLorebooks) {
    settings.selectedLorebooks = [];
  }

  // 检查是否已添加
  if (settings.selectedLorebooks.some(lb => lb.name === name)) {
    showToast('该世界书已在收藏中', '⚠️');
    return;
  }

  const now = new Date();
  const timeStr = `${(now.getMonth() + 1)}月${now.getDate()}日`;

  settings.selectedLorebooks.push({
    name: name,
    addedTime: timeStr
  });

  saveSettingsDebounced();
  refreshFavoritesList();
  showToast(`已添加: ${name}`);
}

// ========== 总结功能相关函数 ==========

// 世界书名称（固定）
const LOREBOOK_NAME = '【可乐】聊天记录';

// 获取当前应该是第几杯
function getNextCupNumber() {
  const settings = extension_settings[extensionName];
  const selectedLorebooks = settings.selectedLorebooks || [];

  // 查找【可乐】聊天记录世界书
  const lorebook = selectedLorebooks.find(lb => lb.name === LOREBOOK_NAME);
  if (lorebook && lorebook.entries) {
    return lorebook.entries.length + 1;
  }

  return 1;
}

// 标记前缀
const SUMMARY_MARKER_PREFIX = '🧊 可乐已加冰_';

// 收集所有联系人的聊天记录（只收集最后一个标记之后的内容）
function collectAllChatHistory() {
  const settings = extension_settings[extensionName];
  const contacts = settings.contacts || [];

  const allChats = [];

  contacts.forEach(contact => {
    const chatHistory = contact.chatHistory || [];
    if (chatHistory.length === 0) return;

    // 查找最后一个标记的位置
    let lastMarkerIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        lastMarkerIndex = i;
        break;
      }
    }

    // 只收集标记之后的消息
    const startIndex = lastMarkerIndex + 1;
    const newMessages = chatHistory.slice(startIndex);

    // 过滤掉系统标记消息，只保留真实对话
    const realMessages = newMessages.filter(msg =>
      !msg.content?.startsWith(SUMMARY_MARKER_PREFIX)
    );

    if (realMessages.length > 0) {
      allChats.push({
        contactName: contact.name,
        contactDescription: contact.description || '',
        messages: realMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          time: msg.time || '',
          isVoice: msg.isVoice || false
        }))
      });
    }
  });

  return allChats;
}

// 在所有联系人的聊天记录中插入标记
function insertSummaryMarker(cupNumber) {
  const settings = extension_settings[extensionName];
  const contacts = settings.contacts || [];
  const marker = `${SUMMARY_MARKER_PREFIX}${cupNumber}`;
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  contacts.forEach(contact => {
    if (!contact.chatHistory) contact.chatHistory = [];

    // 检查该联系人是否有未总结的消息
    let hasNewMessages = false;
    for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
      const msg = contact.chatHistory[i];
      if (msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        break; // 找到标记，停止
      }
      if (!msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        hasNewMessages = true;
        break;
      }
    }

    // 只有有新消息的联系人才插入标记
    if (hasNewMessages || contact.chatHistory.length === 0) {
      // 如果最后一条消息不是标记，才插入
      const lastMsg = contact.chatHistory[contact.chatHistory.length - 1];
      if (!lastMsg?.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        contact.chatHistory.push({
          role: 'system',
          content: marker,
          time: timeStr,
          timestamp: Date.now(),
          isMarker: true
        });
      }
    }
  });

  saveSettingsDebounced();
}

// 生成总结提示词（每次只生成一杯，记录感情变化）
function generateSummaryPrompt(allChats, cupNumber) {
  let prompt = `分析以下微信聊天记录，记录感情关系的变化。

【任务】
这是第${cupNumber}杯记录。请总结这段对话中感情关系的发展和变化。

【记录要点】
- 感情状态的变化（亲密度、信任度、态度转变等）
- 关系中的重要事件（约定、承诺、矛盾、和解等）
- 双方互动的关键内容
- 只记录事实，不做主观评价

【输出要求】
- 只输出一个条目的JSON
- 不要使用markdown代码块
- 直接以 { 开头，以 } 结尾

【JSON格式】
{"keys":["关键词1","关键词2"],"content":"感情变化记录","comment":"第${cupNumber}杯"}

【示例】
{"keys":["表白","确认关系"],"content":"小美向用户表白，用户接受。两人确认恋爱关系，约定周末见面。小美表现得很开心，多次说想用户。","comment":"第1杯"}

【聊天记录】
`;

  allChats.forEach(chat => {
    prompt += `\n[与${chat.contactName}的对话]\n`;
    chat.messages.slice(-300).forEach(msg => { // 取最近300条消息
      const speaker = msg.role === 'user' ? '用户' : chat.contactName;
      prompt += `${speaker}: ${msg.content}\n`;
    });
  });

  prompt += `\n总结这段对话中的感情变化，输出第${cupNumber}杯的JSON：`;

  return prompt;
}

// 调用总结API
async function callSummaryAPI(prompt) {
  const settings = extension_settings[extensionName];

  const apiUrl = settings.summaryApiUrl;
  const apiKey = settings.summaryApiKey;
  const model = settings.summarySelectedModel;

  if (!apiUrl || !apiKey || !model) {
    throw new Error('请先配置总结API（URL、密钥和模型）');
  }

  const chatUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: '你是一个专业的内容分析师，擅长从对话中提取关键信息并生成结构化的世界书条目。' },
        { role: 'user', content: prompt }
      ],
      temperature: 1,
      max_tokens: 8196
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  console.log('[可乐不加冰] AI原始响应:', content);

  // 尝试解析JSON（多种方式）
  const parseJSON = (str) => {
    // 方法1: 直接解析
    try {
      const result = JSON.parse(str);
      console.log('[可乐不加冰] 方法1成功: 直接解析');
      return result;
    } catch (e) {}

    // 方法2: 移除 markdown 代码块后解析
    try {
      const cleaned = str.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleaned);
      console.log('[可乐不加冰] 方法2成功: 移除markdown');
      return result;
    } catch (e) {}

    // 方法3: 从文本中提取 JSON 对象（找第一个 { 到最后一个 }）
    try {
      const firstBrace = str.indexOf('{');
      const lastBrace = str.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonPart = str.substring(firstBrace, lastBrace + 1);
        const result = JSON.parse(jsonPart);
        console.log('[可乐不加冰] 方法3成功: 提取JSON部分');
        return result;
      }
    } catch (e) {}

    // 方法4: 尝试匹配 entries 数组（更宽松）
    try {
      // 找到 "entries" 后的数组内容
      const match = str.match(/"entries"\s*:\s*\[/);
      if (match) {
        const startIdx = str.indexOf('[', match.index);
        let bracketCount = 1;
        let endIdx = startIdx + 1;
        while (endIdx < str.length && bracketCount > 0) {
          if (str[endIdx] === '[') bracketCount++;
          if (str[endIdx] === ']') bracketCount--;
          endIdx++;
        }
        const arrayContent = str.substring(startIdx, endIdx);
        const result = JSON.parse(`{"entries":${arrayContent}}`);
        console.log('[可乐不加冰] 方法4成功: 提取entries数组');
        return result;
      }
    } catch (e) {}

    // 方法5: 尝试修复常见JSON错误
    try {
      let fixed = str
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/[\u201c\u201d]/g, '"')  // 中文引号
        .replace(/'/g, '"');

      const firstBrace = fixed.indexOf('{');
      const lastBrace = fixed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const result = JSON.parse(fixed.substring(firstBrace, lastBrace + 1));
        console.log('[可乐不加冰] 方法5成功: 修复JSON格式');
        return result;
      }
    } catch (e) {}

    // 方法6: 从非JSON文本中提取结构化信息
    try {
      const entries = [];
      const blocks = str.split(/\n\n+|\d+\.\s+/);

      for (const block of blocks) {
        if (!block.trim()) continue;

        let keys = [];
        let content = '';
        let comment = '';

        // 尝试提取关键词
        const keyMatch = block.match(/[关键词keys]+[：:\s]+([^\n]+)/i);
        if (keyMatch) keys = keyMatch[1].split(/[,，、]/g).map(k => k.trim()).filter(k => k);

        // 尝试提取内容
        const contentMatch = block.match(/[内容content]+[：:\s]+([^\n]+)/i);
        if (contentMatch) content = contentMatch[1].trim();

        // 尝试提取标题
        const titleMatch = block.match(/[标题title评论comment]+[：:\s]+([^\n]+)/i);
        if (titleMatch) comment = titleMatch[1].trim();

        // 如果有足够信息，创建条目
        if ((keys.length > 0 || comment) && content) {
          entries.push({
            keys: keys.length > 0 ? keys : [comment || '关键词'],
            content: content,
            comment: comment || keys[0] || '条目'
          });
        }
      }

      if (entries.length > 0) {
        console.log('[可乐不加冰] 方法6成功: 从文本提取');
        return { entries };
      }
    } catch (e) {}

    return null;
  };

  const parsed = parseJSON(content);
  if (parsed) {
    // 现在返回单个条目格式（不是 entries 数组）
    // 如果解析结果有 keys 和 content，说明是单条目
    if (parsed.keys && parsed.content) {
      console.log('[可乐不加冰] 解析成功: 单条目格式');
      return parsed;
    }
    // 兼容旧的 entries 数组格式（取第一个）
    if (parsed.entries && parsed.entries.length > 0) {
      console.log('[可乐不加冰] 解析成功: entries数组格式，取第一个');
      return parsed.entries[0];
    }
    // 如果是数组，取第一个
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log('[可乐不加冰] 解析成功: 数组格式，取第一个');
      return parsed[0];
    }
  }

  // 最终降级：如果内容不为空，创建一个基本条目
  console.error('[可乐不加冰] 所有解析方法失败，原始内容:', content);

  if (content && content.trim().length > 20) {
    console.log('[可乐不加冰] 使用降级方案：创建基本条目');
    // 提取有意义的文本片段作为关键词
    const words = content.match(/[\u4e00-\u9fa5]{2,}/g) || ['聊天', '记录'];
    const uniqueWords = [...new Set(words)].slice(0, 5);

    return {
      keys: uniqueWords.length > 0 ? uniqueWords : ['聊天记录'],
      content: content.substring(0, 800).replace(/```[\s\S]*?```/g, '').trim(),
      comment: '感情记录'
    };
  }

  throw new Error('AI返回内容为空或无法解析');
}

// 保存单个条目到收藏（追加到已有世界书）
function saveEntryToFavorites(entry, cupNumber) {
  const settings = extension_settings[extensionName];

  if (!settings.selectedLorebooks) {
    settings.selectedLorebooks = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // 查找已有的【可乐】聊天记录世界书
  let lorebook = settings.selectedLorebooks.find(lb => lb.name === LOREBOOK_NAME);

  if (!lorebook) {
    // 不存在则创建新的
    lorebook = {
      name: LOREBOOK_NAME,
      addedTime: timeStr,
      entries: [],
      enabled: true,
      fromSummary: true
    };
    settings.selectedLorebooks.push(lorebook);
  }

  // 格式化新条目
  const newEntry = {
    uid: cupNumber - 1,
    keys: entry.keys || [],
    content: entry.content || '',
    comment: entry.comment || `第${cupNumber}杯`,
    enabled: true,
    case_sensitive: false,
    priority: 10,
    id: cupNumber - 1,
    addedTime: timeStr
  };

  // 追加条目
  lorebook.entries.push(newEntry);
  lorebook.lastUpdated = timeStr;

  saveSettingsDebounced();

  return lorebook;
}

// 同步单个条目到酒馆世界书（追加模式）
async function syncEntryToSillyTavern(entry, cupNumber) {
  try {
    const name = LOREBOOK_NAME;

    // 构建单个条目格式
    const newEntry = {
      uid: cupNumber - 1,
      key: entry.keys || [],
      keysecondary: [],
      comment: entry.comment || `第${cupNumber}杯`,
      content: entry.content || '',
      constant: false,
      vectorized: false,
      selective: true,
      selectiveLogic: 0,
      addMemo: true,
      order: 100,
      position: 0,
      disable: false,
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: false,
      probability: 100,
      useProbability: true,
      depth: 4,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: false,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      role: 0,
      sticky: null,
      cooldown: null,
      delay: null
    };

    console.log('[可乐不加冰] 准备同步第', cupNumber, '杯到酒馆');

    // 检查世界书是否已存在
    const worldExists = typeof world_names !== 'undefined' &&
                        Array.isArray(world_names) &&
                        world_names.includes(name);

    if (!worldExists) {
      // 世界书不存在，创建新的
      console.log('[可乐不加冰] 世界书不存在，创建新的...');
      if (typeof createNewWorldInfo === 'function') {
        await createNewWorldInfo(name);
        await sleep(500);
      }
    }

    // 加载现有世界书数据
    let worldInfo = { entries: {} };
    if (typeof loadWorldInfo === 'function') {
      const existingData = await loadWorldInfo(name);
      if (existingData && existingData.entries) {
        worldInfo = existingData;
      }
    }

    // 追加新条目（使用 cupNumber-1 作为 key，确保不会覆盖）
    const entryKey = cupNumber - 1;
    worldInfo.entries[entryKey] = newEntry;

    console.log('[可乐不加冰] 当前条目数:', Object.keys(worldInfo.entries).length);

    // 保存世界书
    if (typeof saveWorldInfo === 'function') {
      await saveWorldInfo(name, worldInfo);
      console.log('[可乐不加冰] 保存完成');

      // 验证
      await sleep(300);
      const verifyData = await loadWorldInfo(name);
      const savedCount = verifyData?.entries ? Object.keys(verifyData.entries).length : 0;
      console.log('[可乐不加冰] 验证: 条目数 =', savedCount);

      return true;
    }

    throw new Error('saveWorldInfo 函数不可用');
  } catch (err) {
    console.error('[可乐不加冰] 同步到酒馆失败:', err);
    throw err;
  }
}

// 执行总结主函数
async function executeSummary() {
  const progressEl = document.getElementById('wechat-summary-progress');
  const executeBtn = document.getElementById('wechat-summary-execute');

  const updateProgress = (msg) => {
    if (progressEl) progressEl.textContent = msg;
  };

  // 禁用按钮
  if (executeBtn) {
    executeBtn.disabled = true;
    executeBtn.textContent = '⏳ 处理中...';
  }

  try {
    // 步骤1: 收集聊天记录
    updateProgress('📋 收集聊天记录...');
    const allChats = collectAllChatHistory();

    if (allChats.length === 0) {
      throw new Error('没有新的聊天记录需要总结');
    }

    const totalMessages = allChats.reduce((sum, chat) => sum + chat.messages.length, 0);
    updateProgress(`📋 收集到 ${allChats.length} 个对话，共 ${totalMessages} 条消息`);
    await sleep(500);

    // 步骤2: 获取当前杯数
    const cupNumber = getNextCupNumber();
    updateProgress(`🍵 准备生成第${cupNumber}杯...`);
    await sleep(300);

    // 步骤3: 生成提示词并调用API
    updateProgress('🤖 调用AI分析感情变化...');
    const prompt = generateSummaryPrompt(allChats, cupNumber);
    const entry = await callSummaryAPI(prompt);

    updateProgress(`✨ 已生成第${cupNumber}杯记录`);
    await sleep(500);

    // 步骤4: 保存到收藏（追加到【可乐】聊天记录世界书）
    updateProgress('💾 保存到收藏...');
    saveEntryToFavorites(entry, cupNumber);
    await sleep(300);

    // 步骤5: 同步到酒馆（可选，失败不影响使用）
    updateProgress('📤 尝试同步到酒馆...');
    try {
      await syncEntryToSillyTavern(entry, cupNumber);
      updateProgress(`✅ 完成！第${cupNumber}杯已保存`);
    } catch (syncErr) {
      // 同步失败但本地保存成功，这是可以接受的
      console.error('同步到酒馆失败:', syncErr);
      updateProgress(`✅ 第${cupNumber}杯已保存到收藏！(酒馆同步暂不可用)`);
    }

    // 步骤6: 插入标记，防止下次重复总结
    insertSummaryMarker(cupNumber);

    // 刷新收藏列表
    refreshFavoritesList();

  } catch (err) {
    console.error('执行总结失败:', err);
    updateProgress(`❌ 失败: ${err.message}`);
  } finally {
    // 恢复按钮
    if (executeBtn) {
      executeBtn.disabled = false;
      executeBtn.textContent = '执行总结';
    }
  }
}

// 回退总结（删除最后一杯）
async function rollbackSummary() {
  const settings = extension_settings[extensionName];
  const progressEl = document.getElementById('wechat-summary-progress');

  const updateProgress = (msg) => {
    if (progressEl) progressEl.textContent = msg;
  };

  // 查找【可乐】聊天记录世界书
  const selectedLorebooks = settings.selectedLorebooks || [];
  const lorebookIdx = selectedLorebooks.findIndex(lb => lb.name === LOREBOOK_NAME);

  if (lorebookIdx < 0 || !selectedLorebooks[lorebookIdx].entries?.length) {
    updateProgress('❌ 没有可回退的总结');
    return;
  }

  const lorebook = selectedLorebooks[lorebookIdx];
  const cupNumber = lorebook.entries.length; // 当前是第几杯

  if (!confirm(`确定要回退第${cupNumber}杯总结吗？\n\n这将删除：\n1. 世界书中的第${cupNumber}杯条目\n2. 所有聊天记录中的"${SUMMARY_MARKER_PREFIX}${cupNumber}"标记`)) {
    return;
  }

  updateProgress(`🔄 正在回退第${cupNumber}杯...`);

  try {
    // 1. 从收藏中删除最后一个条目
    lorebook.entries.pop();
    updateProgress('📋 已删除收藏中的条目...');

    // 2. 从所有联系人聊天记录中删除对应标记
    const markerToRemove = `${SUMMARY_MARKER_PREFIX}${cupNumber}`;
    const contacts = settings.contacts || [];
    let removedCount = 0;

    contacts.forEach(contact => {
      if (!contact.chatHistory) return;

      // 从后往前遍历，删除匹配的标记
      for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
        const msg = contact.chatHistory[i];
        if (msg.content === markerToRemove || (msg.isMarker && msg.content?.startsWith(SUMMARY_MARKER_PREFIX + cupNumber))) {
          contact.chatHistory.splice(i, 1);
          removedCount++;
        }
      }
    });

    updateProgress(`📋 已删除 ${removedCount} 个聊天标记...`);

    // 3. 尝试从酒馆世界书中删除
    try {
      if (typeof loadWorldInfo === 'function' && typeof saveWorldInfo === 'function') {
        const worldData = await loadWorldInfo(LOREBOOK_NAME);
        if (worldData?.entries) {
          // 删除对应的条目（key 是 cupNumber - 1）
          const entryKey = cupNumber - 1;
          if (worldData.entries[entryKey]) {
            delete worldData.entries[entryKey];
            await saveWorldInfo(LOREBOOK_NAME, worldData);
            updateProgress('📤 已同步删除酒馆世界书条目...');
          }
        }
      }
    } catch (syncErr) {
      console.error('同步删除酒馆条目失败:', syncErr);
      // 不影响本地回退
    }

    // 4. 保存设置
    saveSettingsDebounced();

    // 5. 刷新界面
    refreshFavoritesList();
    refreshChatList();

    // 如果当前在聊天页面，刷新聊天历史显示
    if (currentChatIndex >= 0) {
      const contact = settings.contacts[currentChatIndex];
      if (contact) {
        const messagesContainer = document.getElementById('wechat-chat-messages');
        if (messagesContainer) {
          messagesContainer.innerHTML = renderChatHistory(contact, contact.chatHistory || []);
          bindVoiceBubbleEvents(messagesContainer);
        }
      }
    }

    updateProgress(`✅ 已回退第${cupNumber}杯，当前剩余 ${lorebook.entries.length} 杯`);

  } catch (err) {
    console.error('回退总结失败:', err);
    updateProgress(`❌ 回退失败: ${err.message}`);
  }
}

// 测试 API 连接
async function testApiConnection(apiUrl, apiKey) {
  try {
    // 尝试请求 /models 端点（OpenAI 兼容格式）
    const modelsUrl = apiUrl.replace(/\/+$/, '') + '/models';
    const headers = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: headers,
    });

    if (response.ok) {
      const data = await response.json();
      const modelCount = data.data?.length || 0;
      return {
        success: true,
        message: `发现 ${modelCount} 个可用模型`
      };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        message: `HTTP ${response.status}: ${errorText.substring(0, 100)}`
      };
    }
  } catch (err) {
    return {
      success: false,
      message: err.message
    };
  }
}

// 获取 API 配置
function getApiConfig() {
  const settings = extension_settings[extensionName];
  return {
    url: settings.apiUrl || '',
    key: settings.apiKey || '',
    model: settings.selectedModel || 'gpt-3.5-turbo'
  };
}

// 获取模型列表
async function fetchModelList() {
  const apiUrl = document.getElementById('wechat-api-url')?.value.trim();
  const apiKey = document.getElementById('wechat-api-key')?.value.trim();

  if (!apiUrl) {
    showToast('请先填写 API 地址', '⚠️');
    return [];
  }

  const modelsUrl = apiUrl.replace(/\/+$/, '') + '/models';
  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: headers,
    });

    if (response.ok) {
      const data = await response.json();
      // 兼容 OpenAI 格式和其他格式
      let models = [];
      if (data.data && Array.isArray(data.data)) {
        // OpenAI 格式
        models = data.data.map(m => ({
          id: m.id,
          name: m.id
        }));
      } else if (Array.isArray(data)) {
        // 直接数组格式
        models = data.map(m => ({
          id: typeof m === 'string' ? m : m.id,
          name: typeof m === 'string' ? m : (m.name || m.id)
        }));
      }
      return models;
    } else {
      const errorText = await response.text();
      showToast(`获取模型列表失败: HTTP ${response.status}`, '❌');
      return [];
    }
  } catch (err) {
    showToast(`获取模型列表失败: ${err.message}`, '❌');
    return [];
  }
}

// 刷新模型下拉列表
async function refreshModelSelect() {
  const select = document.getElementById('wechat-model-select');
  const refreshBtn = document.getElementById('wechat-refresh-models');
  if (!select) return;

  // 显示加载状态
  const originalText = refreshBtn?.textContent;
  if (refreshBtn) {
    refreshBtn.textContent = '加载中...';
    refreshBtn.disabled = true;
  }

  const models = await fetchModelList();
  const settings = extension_settings[extensionName];

  // 清空现有选项
  select.innerHTML = '';

  if (models.length === 0) {
    select.innerHTML = '<option value="">-- 未获取到模型 --</option>';
  } else {
    select.innerHTML = '<option value="">-- 请选择模型 --</option>';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      if (model.id === settings.selectedModel) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // 缓存模型列表
    settings.modelList = models;
    saveSettingsDebounced();
  }

  // 恢复按钮状态
  if (refreshBtn) {
    refreshBtn.textContent = originalText;
    refreshBtn.disabled = false;
  }
}

// 从缓存恢复模型列表
function restoreModelSelect() {
  const select = document.getElementById('wechat-model-select');
  if (!select) return;

  const settings = extension_settings[extensionName];
  const models = settings.modelList || [];

  if (models.length > 0) {
    select.innerHTML = '<option value="">-- 请选择模型 --</option>';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      if (model.id === settings.selectedModel) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }
}

// 渲染聊天历史
function renderChatHistory(contact, chatHistory) {
  const firstChar = contact.name ? contact.name.charAt(0) : '?';
  const avatarContent = contact.avatar
    ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
    : firstChar;

  let html = '';
  let lastTimestamp = 0;
  const TIME_GAP_THRESHOLD = 5 * 60 * 1000; // 5分钟间隔显示时间

  chatHistory.forEach((msg, index) => {
    // 获取消息时间戳
    const msgTimestamp = msg.timestamp || new Date(msg.time).getTime() || 0;

    // 检查是否是总结标记消息
    if (msg.isMarker || msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
      // 像时间戳一样居中显示标记
      const markerText = msg.content || '可乐已加冰';
      html += `<div class="wechat-msg-time">${escapeHtml(markerText)}</div>`;
      lastTimestamp = msgTimestamp;
      return; // 跳过后续的普通消息渲染
    }

    // 判断是否需要显示时间标签（间隔超过5分钟或第一条消息）
    if (index === 0 || (msgTimestamp - lastTimestamp > TIME_GAP_THRESHOLD)) {
      const timeLabel = formatMessageTime(msgTimestamp);
      if (timeLabel) {
        html += `<div class="wechat-msg-time">${timeLabel}</div>`;
      }
    }
    lastTimestamp = msgTimestamp;

    // 判断是否是语音消息
    const isVoice = msg.isVoice === true;
    let bubbleContent;

    if (isVoice) {
      bubbleContent = generateVoiceBubbleStatic(msg.content, msg.role === 'user');
    } else {
      bubbleContent = `<div class="wechat-message-bubble">${escapeHtml(msg.content)}</div>`;
    }

    if (msg.role === 'user') {
      // 用户消息（右侧）
      html += `
        <div class="wechat-message self">
          <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
          <div class="wechat-message-content">
            ${bubbleContent}
          </div>
        </div>
      `;
    } else {
      // AI/角色消息（左侧）
      html += `
        <div class="wechat-message">
          <div class="wechat-message-avatar">${avatarContent}</div>
          <div class="wechat-message-content">
            ${bubbleContent}
          </div>
        </div>
      `;
    }
  });

  return html;
}

// 格式化消息时间标签（微信风格）
function formatMessageTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const oneDay = 24 * 60 * 60 * 1000;

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // 今天：只显示时间
  if (diff < oneDay && date.getDate() === now.getDate()) {
    return timeStr;
  }

  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()) {
    return `昨天 ${timeStr}`;
  }

  // 一周内：显示星期几
  if (diff < 7 * oneDay) {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${days[date.getDay()]} ${timeStr}`;
  }

  // 更早：显示日期
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
}

// 生成静态语音消息HTML（用于历史记录，带唯一ID）
function generateVoiceBubbleStatic(content, isSelf) {
  const duration = calculateVoiceDuration(content);
  const width = Math.min(200, Math.max(80, 60 + duration * 3));
  const uniqueId = 'voice-hist-' + Math.random().toString(36).substring(2, 11);

  // 语音图标SVG - 三条弧线样式（微信风格）
  // 发送消息（右侧绿色气泡）：弧线朝左 (((
  // 接收消息（左侧白色气泡）：弧线朝右 )))
  const voiceIconSvg = isSelf
    ? `<svg class="wechat-voice-icon-svg" viewBox="0 0 24 24">
        <path class="wechat-voice-arc arc1" d="M12 8c-2.5 2-2.5 6 0 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc2" d="M8 6c-4 3-4 9 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc3" d="M4 4c-5.5 4-5.5 12 0 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>`
    : `<svg class="wechat-voice-icon-svg" viewBox="0 0 24 24">
        <path class="wechat-voice-arc arc1" d="M12 8c2.5 2 2.5 6 0 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc2" d="M16 6c4 3 4 9 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc3" d="M20 4c5.5 4 5.5 12 0 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>`;

  return `
    <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" data-voice-id="${uniqueId}" data-content="${escapeHtml(content)}" style="width: ${width}px;">
      <div class="wechat-voice-bar">
        <span class="wechat-voice-duration">${duration}"</span>
        <span class="wechat-voice-icon">${voiceIconSvg}</span>
      </div>
      <div class="wechat-voice-text hidden" id="${uniqueId}">${escapeHtml(content)}</div>
    </div>
  `;
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示Toast提示
function showToast(message, icon = '✅') {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  // 移除已有的toast
  const existingToast = phone.querySelector('.wechat-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'wechat-toast';
  toast.innerHTML = `<span class="wechat-toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
  phone.appendChild(toast);

  // 动画结束后移除
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// 根据内容长度计算语音秒数
function calculateVoiceDuration(content) {
  // 大约每3个字符1秒，最少2秒，最多60秒
  const seconds = Math.max(2, Math.min(60, Math.ceil(content.length / 3)));
  return seconds;
}

// 生成语音消息HTML
function generateVoiceBubble(content, isSelf) {
  const duration = calculateVoiceDuration(content);
  // 语音条宽度根据秒数变化，最小80px，最大200px
  const width = Math.min(200, Math.max(80, 60 + duration * 3));
  const uniqueId = 'voice-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);

  // 语音图标SVG - 三条弧线样式（微信风格）
  // 发送消息（右侧绿色气泡）：弧线朝左 (((
  // 接收消息（左侧白色气泡）：弧线朝右 )))
  const voiceIconSvg = isSelf
    ? `<svg class="wechat-voice-icon-svg" viewBox="0 0 24 24">
        <path class="wechat-voice-arc arc1" d="M12 8c-2.5 2-2.5 6 0 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc2" d="M8 6c-4 3-4 9 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc3" d="M4 4c-5.5 4-5.5 12 0 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>`
    : `<svg class="wechat-voice-icon-svg" viewBox="0 0 24 24">
        <path class="wechat-voice-arc arc1" d="M12 8c2.5 2 2.5 6 0 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc2" d="M16 6c4 3 4 9 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="wechat-voice-arc arc3" d="M20 4c5.5 4 5.5 12 0 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>`;

  return `
    <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" data-voice-id="${uniqueId}" data-content="${escapeHtml(content)}" style="width: ${width}px;">
      <div class="wechat-voice-bar">
        <span class="wechat-voice-duration">${duration}"</span>
        <span class="wechat-voice-icon">${voiceIconSvg}</span>
      </div>
      <div class="wechat-voice-text hidden" id="${uniqueId}">${escapeHtml(content)}</div>
    </div>
  `;
}

// 添加消息到聊天界面（支持语音消息）
function appendMessage(role, content, contact, isVoice = false) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = contact?.avatar
    ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
    : firstChar;

  let bubbleContent;
  if (isVoice) {
    bubbleContent = generateVoiceBubble(content, role === 'user');
  } else {
    bubbleContent = `<div class="wechat-message-bubble">${escapeHtml(content)}</div>`;
  }

  let messageHtml = '';

  if (role === 'user') {
    messageHtml = `
      <div class="wechat-message self">
        <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
        <div class="wechat-message-content">
          ${bubbleContent}
        </div>
      </div>
    `;
  } else {
    messageHtml = `
      <div class="wechat-message">
        <div class="wechat-message-avatar">${avatarContent}</div>
        <div class="wechat-message-content">
          ${bubbleContent}
        </div>
      </div>
    `;
  }

  messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定语音点击事件
  if (isVoice) {
    bindVoiceBubbleEvents(messagesContainer);
  }
}

// 显示打字中状态
function showTypingIndicator(contact) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const firstChar = contact?.name ? contact.name.charAt(0) : '?';
  const avatarContent = contact?.avatar
    ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
    : firstChar;

  const typingHtml = `
    <div class="wechat-message wechat-typing-indicator">
      <div class="wechat-message-avatar">${avatarContent}</div>
      <div class="wechat-message-content">
        <div class="wechat-message-bubble wechat-typing">
          <span class="wechat-typing-dot"></span>
          <span class="wechat-typing-dot"></span>
          <span class="wechat-typing-dot"></span>
        </div>
      </div>
    </div>
  `;

  messagesContainer.insertAdjacentHTML('beforeend', typingHtml);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 隐藏打字中状态
function hideTypingIndicator() {
  const indicator = document.querySelector('.wechat-typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// 从消息中提取指定标签内容（支持多个标签）
function extractCustomTags(message, tags) {
  if (!tags || tags.length === 0) return '';

  const results = [];
  tags.forEach(tag => {
    // 构建正则表达式，匹配 <tag>内容</tag>
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const matches = message.match(regex);
    if (matches) {
      matches.forEach(m => {
        const content = m.replace(new RegExp(`<\\/?${tag}>`, 'gi'), '').trim();
        if (content) {
          results.push(content);
        }
      });
    }
  });

  return results.join('\n');
}

// 从主界面消息中提取时间
function extractTimeFromSTChat() {
  const settings = extension_settings[extensionName];

  try {
    const context = getContext();
    const chat = context.chat || [];

    if (chat.length === 0) return null;

    // 从最近的消息中查找时间标签（取最近5条）
    const recentChat = chat.slice(-5);

    // 时间标签列表（优先级从高到低）
    const defaultTimeTags = ['time', 'timestamp', '时间', 'datetime', 'date', 'now'];

    // 合并用户配置的标签中可能包含时间的标签
    const customTags = settings.contextTags || [];
    const timeRelatedCustomTags = customTags.filter(tag =>
      tag.toLowerCase().includes('time') ||
      tag.includes('时间') ||
      tag.includes('日期')
    );

    const allTimeTags = [...defaultTimeTags, ...timeRelatedCustomTags];

    // 从最新消息向前搜索
    for (let i = recentChat.length - 1; i >= 0; i--) {
      const msg = recentChat[i];
      const content = msg.mes || '';

      // 尝试从标签中提取时间
      for (const tag of allTimeTags) {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = content.match(regex);
        if (match && match[1]) {
          const timeStr = match[1].trim();
          const parsedTime = parseTimeString(timeStr);
          if (parsedTime) {
            console.log(`[可乐不加冰] 从主界面提取到时间: ${timeStr} -> ${new Date(parsedTime).toLocaleString()}`);
            return parsedTime;
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.error('提取时间失败:', err);
    return null;
  }
}

// 解析时间字符串为时间戳
function parseTimeString(timeStr) {
  if (!timeStr) return null;

  // 格式1: HH:MM 或 H:MM（纯时间，使用今天日期）
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

  // 格式2: YYYY-MM-DD HH:MM:SS 或 YYYY/MM/DD HH:MM:SS
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

  // 格式3: MM-DD HH:MM 或 M月D日 HH:MM（使用今年）
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

  // 格式4: 中文描述如"上午10:30"、"下午3:45"、"凌晨2:00"
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
    // 如果是10位（秒），转换为毫秒
    return ts < 10000000000 ? ts * 1000 : ts;
  }

  // 格式6: 尝试 Date.parse（最后手段）
  const parsed = Date.parse(timeStr);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return null;
}

// 获取酒馆主聊天的上下文
function getSTChatContext(layers) {
  const settings = extension_settings[extensionName];

  // 检查开关
  if (!settings.contextEnabled) return '';
  if (layers <= 0) return '';

  const tags = settings.contextTags || [];
  if (tags.length === 0) return '';

  try {
    const context = getContext();
    const chat = context.chat || [];

    if (chat.length === 0) return '';

    // 取最近 N 条消息
    const recentChat = chat.slice(-layers);

    // 提取标签内容
    const contents = [];
    recentChat.forEach(msg => {
      const extracted = extractCustomTags(msg.mes || '', tags);
      if (extracted) {
        const role = msg.is_user ? '用户' : (msg.name || '角色');
        contents.push(`[${role}]: ${extracted}`);
      }
    });

    if (contents.length === 0) return '';

    return `【剧情上下文】\n${contents.join('\n')}\n`;
  } catch (err) {
    console.error('获取酒馆上下文失败:', err);
    return '';
  }
}

// 刷新上下文标签显示
function refreshContextTags() {
  const settings = extension_settings[extensionName];
  const tagsContainer = document.getElementById('wechat-context-tags');
  if (!tagsContainer) return;

  const tags = settings.contextTags || [];
  // 标签 + 添加按钮，按钮始终在最后
  tagsContainer.innerHTML = tags.map((tag, i) => `
    <div class="wechat-context-tag-item" data-index="${i}">
      <span>&lt;${tag}&gt;</span>
      <button class="wechat-tag-del-btn" data-index="${i}">×</button>
    </div>
  `).join('') + '<button class="wechat-tag-add-btn" id="wechat-context-add-tag">+</button>';
}

// 构建 AI 请求的系统提示
function buildSystemPrompt(contact) {
  const settings = extension_settings[extensionName];
  const rawData = contact.rawData || {};
  const charData = rawData.data || rawData;

  let systemPrompt = '';

  // 酒馆主聊天上下文（根据层数设置）
  const contextLevel = settings.contextLevel ?? 5;
  const stContext = getSTChatContext(contextLevel);
  if (stContext) {
    systemPrompt += stContext + '\n';
  }

  // 用户设定（收集所有启用的设定）
  const userPersonas = settings.userPersonas || [];
  const enabledPersonas = userPersonas.filter(p => p.enabled !== false);

  if (enabledPersonas.length > 0) {
    systemPrompt += `【用户设定】\n`;
    enabledPersonas.forEach(persona => {
      if (persona.name) {
        systemPrompt += `[${persona.name}]\n`;
      }
      if (persona.content) {
        systemPrompt += `${persona.content}\n`;
      }
    });
    systemPrompt += '\n';
  }

  // 角色名
  if (charData.name) {
    systemPrompt += `你是 ${charData.name}。\n\n`;
  }

  // 角色描述
  if (charData.description) {
    systemPrompt += `【角色描述】\n${charData.description}\n\n`;
  }

  // 角色性格
  if (charData.personality) {
    systemPrompt += `【性格】\n${charData.personality}\n\n`;
  }

  // 场景
  if (charData.scenario) {
    systemPrompt += `【场景】\n${charData.scenario}\n\n`;
  }

  // 示例对话
  if (charData.mes_example) {
    systemPrompt += `【示例对话】\n${charData.mes_example}\n\n`;
  }

  // 世界书/角色书条目 - 只包含启用的条目
  if (charData.character_book?.entries?.length > 0) {
    const enabledEntries = charData.character_book.entries.filter(entry =>
      entry.enabled !== false && entry.disable !== true
    );
    if (enabledEntries.length > 0) {
      systemPrompt += `【世界观设定】\n`;
      enabledEntries.forEach(entry => {
        if (entry.content) {
          systemPrompt += `- ${entry.content}\n`;
        }
      });
      systemPrompt += '\n';
    }
  }

  // 选择的世界书条目 - 只包含启用的
  const selectedLorebooks = settings.selectedLorebooks || [];
  const enabledLorebookEntries = [];
  selectedLorebooks.forEach(lb => {
    if (lb.enabled === false) return; // 整本世界书禁用
    (lb.entries || []).forEach(entry => {
      if (entry.enabled !== false && entry.disable !== true && entry.content) {
        enabledLorebookEntries.push(entry.content);
      }
    });
  });
  if (enabledLorebookEntries.length > 0) {
    systemPrompt += `【世界书设定】\n`;
    enabledLorebookEntries.forEach(content => {
      systemPrompt += `- ${content}\n`;
    });
    systemPrompt += '\n';
  }

  // 添加微信对话格式提示
  systemPrompt += `【回复格式】
你正在通过微信与用户聊天。请用简短、自然的口语化方式回复，就像真实的微信聊天一样。
- 你可以发送多条消息，每条消息之间用 ||| 分隔
- 每条消息不要太长，控制在1-2句话
- 可以使用表情符号
- 回复要符合角色性格
- 不要使用任何格式标记，直接输出对话内容
- 如果想发送语音消息，使用格式：[语音:语音内容]

示例（多条消息）：
你在干嘛|||想你了|||今天工作好累啊

示例（包含语音）：
[语音:宝贝我想你了，今天怎么没给我发消息啊]|||你是不是把我忘了`;

  return systemPrompt;
}

// 构建消息历史
function buildMessages(contact, userMessage) {
  const systemPrompt = buildSystemPrompt(contact);
  const chatHistory = contact.chatHistory || [];

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // 添加历史消息（最多保留300条）
  // 注意：调用此函数时，当前用户消息还未加入 chatHistory，所以不会重复
  const recentHistory = chatHistory.slice(-300);
  recentHistory.forEach(msg => {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  });

  // 添加当前用户的最新消息
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

// 调用 AI API
async function callAI(contact, userMessage) {
  const apiConfig = getApiConfig();

  if (!apiConfig.url) {
    throw new Error('请先在设置中配置 API 地址');
  }

  if (!apiConfig.model) {
    throw new Error('请先在设置中选择模型');
  }

  const messages = buildMessages(contact, userMessage);
  const chatUrl = apiConfig.url.replace(/\/+$/, '') + '/chat/completions';

  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiConfig.key) {
    headers['Authorization'] = `Bearer ${apiConfig.key}`;
  }

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: apiConfig.model,
      messages: messages,
      temperature: 1,
      max_tokens: 8196
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errorText.substring(0, 100)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '...';
}

// 发送消息（支持多条消息数组和语音消息）
async function sendMessage(messageText, isMultipleMessages = false, isVoice = false) {
  if (currentChatIndex < 0) return;

  const settings = extension_settings[extensionName];
  const contact = settings.contacts[currentChatIndex];
  if (!contact) return;

  // 初始化聊天历史
  if (!contact.chatHistory) {
    contact.chatHistory = [];
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // 处理消息列表（支持多条消息）
  let messagesToSend = [];
  if (isMultipleMessages && Array.isArray(messageText)) {
    messagesToSend = messageText.filter(m => m.trim());
  } else if (typeof messageText === 'string' && messageText.trim()) {
    messagesToSend = [messageText.trim()];
  }

  if (messagesToSend.length === 0) return;

  // 清空输入框
  const input = document.getElementById('wechat-input');
  if (input) input.value = '';

  // 从主界面提取时间，如果没有则使用系统时间
  const extractedTime = extractTimeFromSTChat();
  const msgTimestamp = extractedTime || Date.now();

  // 先在界面上显示用户消息（但暂不加入历史）
  for (let i = 0; i < messagesToSend.length; i++) {
    const msg = messagesToSend[i];
    appendMessage('user', msg, contact, isVoice);
    if (i < messagesToSend.length - 1) {
      await sleep(300);
    }
  }

  // 更新最后一条消息预览
  contact.lastMessage = isVoice ? '[语音消息]' : messagesToSend[messagesToSend.length - 1];

  // 显示打字中状态
  showTypingIndicator(contact);

  try {
    // 调用 AI - 此时 chatHistory 还不包含当前用户消息，所以不会重复
    const combinedMessage = isVoice
      ? `[用户发送了语音消息，内容是：${messagesToSend.join('\n')}]`
      : messagesToSend.join('\n');
    const aiResponse = await callAI(contact, combinedMessage);

    // 隐藏打字中状态
    hideTypingIndicator();

    // AI 调用成功后，才把用户消息加入历史（使用提取的时间或系统时间）
    for (const msg of messagesToSend) {
      contact.chatHistory.push({
        role: 'user',
        content: msg,
        time: timeStr,
        timestamp: msgTimestamp,
        isVoice: isVoice
      });
    }

    // 解析 AI 回复（支持多条消息，用 ||| 分隔，支持语音格式 [语音:内容]）
    const aiMessages = aiResponse.split('|||').map(m => m.trim()).filter(m => m);

    // 依次显示 AI 的多条回复
    for (let i = 0; i < aiMessages.length; i++) {
      let aiMsg = aiMessages[i];
      let aiIsVoice = false;

      // 检查是否是语音消息格式 [语音:内容] 或 [语音：内容]
      const voiceMatch = aiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
      if (voiceMatch) {
        aiMsg = voiceMatch[1];
        aiIsVoice = true;
      }

      // 添加 AI 回复到历史
      contact.chatHistory.push({
        role: 'assistant',
        content: aiMsg,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: aiIsVoice
      });

      // 显示 AI 回复
      appendMessage('assistant', aiMsg, contact, aiIsVoice);

      // 如果不是最后一条，显示打字中并添加延迟
      if (i < aiMessages.length - 1) {
        showTypingIndicator(contact);
        await sleep(800 + Math.random() * 400); // 随机延迟 800-1200ms
        hideTypingIndicator();
      }
    }

    // 更新最后一条消息预览
    const lastAiMsg = aiMessages[aiMessages.length - 1];
    const lastVoiceMatch = lastAiMsg.match(/^\[语音[：:]\s*(.+?)\]$/);
    contact.lastMessage = lastVoiceMatch ? '[语音消息]' : lastAiMsg;
    saveSettingsDebounced();
    refreshChatList(); // 刷新聊天列表显示最新消息

  } catch (err) {
    hideTypingIndicator();
    console.error('AI 调用失败:', err);

    // 即使失败，也要把用户消息加入历史（使用提取的时间或系统时间）
    for (const msg of messagesToSend) {
      contact.chatHistory.push({
        role: 'user',
        content: msg,
        time: timeStr,
        timestamp: msgTimestamp,
        isVoice: isVoice
      });
    }
    saveSettingsDebounced();
    refreshChatList(); // 刷新聊天列表

    // 显示错误消息
    appendMessage('assistant', `⚠️ ${err.message}`, contact);
  }
}

// 睡眠函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 注入作者注释
function injectAuthorNote() {
  try {
    const context = getContext();
    if (context && context.setExtensionPrompt) {
      context.setExtensionPrompt(extensionName, authorNoteTemplate, 1, 0);
      showToast('微信格式提示已注入');
    } else {
      // 备用方案：尝试直接修改
      const authorNoteTextarea = document.querySelector('#author_note_text');
      if (authorNoteTextarea) {
        authorNoteTextarea.value = authorNoteTemplate;
        authorNoteTextarea.dispatchEvent(new Event('input'));
        showToast('微信格式提示已注入');
      } else {
        showToast('无法找到作者注释区域', '⚠️');
        console.log('作者注释模板：', authorNoteTemplate);
      }
    }
  } catch (err) {
    console.error('注入作者注释失败:', err);
    showToast('注入失败，请手动添加', '❌');
  }
}

let phoneAutoCenteringBound = false;
let phoneManuallyPositioned = false; // 用户是否手动拖拽过

function centerPhoneInViewport({ force = false } = {}) {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;
  if (!force && phone.classList.contains('hidden')) return;

  // 如果用户手动拖拽过，不自动居中（除非是首次显示）
  const settings = extension_settings[extensionName];
  if (phoneManuallyPositioned && settings.phonePosition && !force) {
    return;
  }

  // 如果有保存的位置，使用保存的位置
  if (settings.phonePosition && !force) {
    phone.style.setProperty('left', `${settings.phonePosition.x}px`, 'important');
    phone.style.setProperty('top', `${settings.phonePosition.y}px`, 'important');
    phoneManuallyPositioned = true;
    return;
  }

  const viewport = window.visualViewport;
  const rawViewportWidth = viewport?.width ?? window.innerWidth;
  const rawViewportHeight = viewport?.height ?? window.innerHeight;
  const viewportWidth = rawViewportWidth >= 100 ? rawViewportWidth : window.innerWidth;
  const viewportHeight = rawViewportHeight >= 100 ? rawViewportHeight : window.innerHeight;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;

  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const maxWidth = isCoarsePointer ? 360 : 375;
  const maxHeight = isCoarsePointer ? 700 : 667;
  const margin = isCoarsePointer ? 8 : 12;

  const availableWidth = Math.max(0, Math.floor(viewportWidth - margin * 2));
  const availableHeight = Math.max(0, Math.floor(viewportHeight - margin * 2));
  const targetWidth = Math.min(maxWidth, availableWidth);
  const targetHeight = Math.min(maxHeight, availableHeight);

  if (targetWidth > 0) phone.style.setProperty('width', `${targetWidth}px`, 'important');
  if (targetHeight > 0) phone.style.setProperty('height', `${targetHeight}px`, 'important');
  phone.style.setProperty('max-width', 'none', 'important');
  phone.style.setProperty('max-height', 'none', 'important');

  const effectiveWidth = targetWidth > 0 ? targetWidth : phone.getBoundingClientRect().width;
  const effectiveHeight = targetHeight > 0 ? targetHeight : phone.getBoundingClientRect().height;

  const unclampedCenterX = viewportLeft + viewportWidth / 2;
  const unclampedCenterY = viewportTop + viewportHeight / 2;

  const minCenterX = viewportLeft + margin + effectiveWidth / 2;
  const maxCenterX = viewportLeft + viewportWidth - margin - effectiveWidth / 2;
  const minCenterY = viewportTop + margin + effectiveHeight / 2;
  const maxCenterY = viewportTop + viewportHeight - margin - effectiveHeight / 2;

  const centerX = Math.round(Math.min(Math.max(unclampedCenterX, minCenterX), maxCenterX));
  const centerY = Math.round(Math.min(Math.max(unclampedCenterY, minCenterY), maxCenterY));

  phone.style.setProperty('left', `${centerX}px`, 'important');
  phone.style.setProperty('top', `${centerY}px`, 'important');
  phone.style.setProperty('right', 'auto', 'important');
  phone.style.setProperty('bottom', 'auto', 'important');
}

// 设置手机拖拽功能
function setupPhoneDrag() {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialX = 0;
  let initialY = 0;

  // 拖拽手柄：状态栏区域
  const statusbar = phone.querySelector('.wechat-statusbar');
  if (!statusbar) return;

  // 添加拖拽提示样式
  statusbar.style.cursor = 'grab';
  statusbar.title = '拖拽移动手机位置';

  const handleStart = (e) => {
    // 排除按钮点击
    if (e.target.closest('button') || e.target.closest('a')) return;

    isDragging = true;
    statusbar.style.cursor = 'grabbing';

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;

    const rect = phone.getBoundingClientRect();
    initialX = rect.left + rect.width / 2;
    initialY = rect.top + rect.height / 2;

    e.preventDefault();
  };

  const handleMove = (e) => {
    if (!isDragging) return;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    const newX = initialX + deltaX;
    const newY = initialY + deltaY;

    phone.style.setProperty('left', `${newX}px`, 'important');
    phone.style.setProperty('top', `${newY}px`, 'important');

    e.preventDefault();
  };

  const handleEnd = () => {
    if (!isDragging) return;

    isDragging = false;
    statusbar.style.cursor = 'grab';
    phoneManuallyPositioned = true;

    // 保存位置到设置
    const rect = phone.getBoundingClientRect();
    const settings = extension_settings[extensionName];
    settings.phonePosition = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    saveSettingsDebounced();
  };

  // 鼠标事件
  statusbar.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);

  // 触摸事件
  statusbar.addEventListener('touchstart', handleStart, { passive: false });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);

  // 双击状态栏重置位置到中心
  statusbar.addEventListener('dblclick', () => {
    phoneManuallyPositioned = false;
    const settings = extension_settings[extensionName];
    delete settings.phonePosition;
    saveSettingsDebounced();
    centerPhoneInViewport({ force: true });
  });
}

function setupPhoneAutoCentering() {
  if (phoneAutoCenteringBound) return;
  phoneAutoCenteringBound = true;

  let rafPending = false;
  const handler = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      centerPhoneInViewport();
    });
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handler);
    window.visualViewport.addEventListener('scroll', handler);
  }

  const phone = document.getElementById('wechat-phone');
  phone?.addEventListener('focusin', () => {
    centerPhoneInViewport({ force: true });
    setTimeout(() => centerPhoneInViewport({ force: true }), 250);

    if (document.activeElement?.id === 'wechat-input') {
      const messages = document.getElementById('wechat-chat-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
  });
  phone?.addEventListener('focusout', () => {
    setTimeout(() => centerPhoneInViewport({ force: true }), 250);
  });

  setTimeout(() => centerPhoneInViewport({ force: true }), 0);
}

// 切换手机显示
function togglePhone() {
  const phone = document.getElementById('wechat-phone');
  const settings = extension_settings[extensionName];

  phone.classList.toggle('hidden');
  settings.phoneVisible = !phone.classList.contains('hidden');
  saveSettingsDebounced();

  // 更新时间
  if (settings.phoneVisible) {
    document.querySelector('.wechat-statusbar-time').textContent = getCurrentTime();
    centerPhoneInViewport();
    setTimeout(() => centerPhoneInViewport({ force: true }), 150);
  }
}

// 切换深色模式
function toggleDarkMode() {
  const phone = document.getElementById('wechat-phone');
  const toggle = document.getElementById('wechat-dark-toggle');
  const settings = extension_settings[extensionName];

  settings.darkMode = !settings.darkMode;
  phone.classList.toggle('wechat-dark', settings.darkMode);
  toggle.classList.toggle('on', settings.darkMode);
  saveSettingsDebounced();
}

// 解析聊天消息中的微信格式
function parseWeChatMessage(text) {
  const patterns = [
    { regex: /\[微信:\s*(.+?)\]/g, type: 'text' },
    { regex: /\[语音:\s*(\d+)秒?\]/g, type: 'voice' },
    { regex: /\[图片:\s*(.+?)\]/g, type: 'image' },
    { regex: /\[表情:\s*(.+?)\]/g, type: 'emoji' },
    { regex: /\[红包:\s*(.+?)\]/g, type: 'redpacket' },
    { regex: /\[转账:\s*(.+?)\]/g, type: 'transfer' },
    { regex: /\[撤回\]/g, type: 'recall' },
  ];

  const messages = [];
  let lastIndex = 0;
  let match;

  // 合并所有匹配
  const allMatches = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(text)) !== null) {
      allMatches.push({
        index: match.index,
        length: match[0].length,
        type: pattern.type,
        content: match[1] || ''
      });
    }
  }

  // 按位置排序
  allMatches.sort((a, b) => a.index - b.index);

  return allMatches;
}

// 展开面板相关
let expandMode = null; // 'voice' 或 'multi'
let expandMsgItems = [''];

// 显示展开面板 - 语音模式
function showExpandVoice() {
  expandMode = 'voice';
  const panel = document.getElementById('wechat-expand-input');
  const title = document.getElementById('wechat-expand-title');
  const body = document.getElementById('wechat-expand-body');

  title.textContent = '语音消息';
  body.innerHTML = `
    <div class="wechat-expand-hint">输入语音内容，系统会根据字数计算时长</div>
    <textarea class="wechat-expand-textarea" id="wechat-expand-voice-text" placeholder="输入语音内容..."></textarea>
    <div class="wechat-expand-preview">
      <span class="wechat-expand-preview-label">预计时长:</span>
      <span class="wechat-expand-preview-value" id="wechat-expand-voice-duration">0"</span>
    </div>
  `;

  panel.classList.remove('hidden');

  // 绑定输入事件更新时长
  const textarea = document.getElementById('wechat-expand-voice-text');
  textarea.addEventListener('input', updateExpandVoiceDuration);
  setTimeout(() => textarea.focus(), 50);
}

// 更新语音时长预览
function updateExpandVoiceDuration() {
  const textarea = document.getElementById('wechat-expand-voice-text');
  const durationEl = document.getElementById('wechat-expand-voice-duration');
  if (textarea && durationEl) {
    const content = textarea.value.trim();
    const duration = content ? calculateVoiceDuration(content) : 0;
    durationEl.textContent = duration + '"';
  }
}

// 显示展开面板 - 多条消息模式
function showExpandMulti() {
  expandMode = 'multi';
  expandMsgItems = [''];
  const panel = document.getElementById('wechat-expand-input');
  const title = document.getElementById('wechat-expand-title');

  title.textContent = '多条消息';
  renderExpandMsgList();

  panel.classList.remove('hidden');

  // 聚焦第一个输入框
  setTimeout(() => {
    const firstInput = document.querySelector('.wechat-expand-msg-input');
    if (firstInput) firstInput.focus();
  }, 50);
}

// 渲染多条消息列表
function renderExpandMsgList() {
  const body = document.getElementById('wechat-expand-body');

  let html = '<div class="wechat-expand-msg-list" id="wechat-expand-msg-list">';
  expandMsgItems.forEach((msg, index) => {
    html += `
      <div class="wechat-expand-msg-item">
        <span class="wechat-expand-msg-num">${index + 1}</span>
        <input type="text" class="wechat-expand-msg-input" data-index="${index}" value="${escapeHtml(msg)}" placeholder="消息 ${index + 1}">
        ${expandMsgItems.length > 1 ? `<button class="wechat-expand-msg-del" data-index="${index}">✕</button>` : ''}
      </div>
    `;
  });
  html += '</div>';
  html += '<button class="wechat-expand-add-btn" id="wechat-expand-add-msg">+ 添加消息</button>';

  body.innerHTML = html;

  // 绑定事件
  document.querySelectorAll('.wechat-expand-msg-input').forEach(input => {
    input.addEventListener('input', (e) => {
      expandMsgItems[parseInt(e.target.dataset.index)] = e.target.value;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addExpandMsgItem();
      }
    });
  });

  document.querySelectorAll('.wechat-expand-msg-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      expandMsgItems.splice(index, 1);
      renderExpandMsgList();
    });
  });

  document.getElementById('wechat-expand-add-msg')?.addEventListener('click', addExpandMsgItem);
}

// 添加一条消息
function addExpandMsgItem() {
  expandMsgItems.push('');
  renderExpandMsgList();

  // 聚焦新输入框
  setTimeout(() => {
    const inputs = document.querySelectorAll('.wechat-expand-msg-input');
    const lastInput = inputs[inputs.length - 1];
    if (lastInput) lastInput.focus();
  }, 50);
}

// 关闭展开面板
function closeExpandPanel() {
  const panel = document.getElementById('wechat-expand-input');
  panel.classList.add('hidden');
  expandMode = null;
}

// 功能面板相关
let funcPanelPage = 0;

function toggleFuncPanel() {
  const panel = document.getElementById('wechat-func-panel');
  const expandPanel = document.getElementById('wechat-expand-input');

  // 如果语音/多条消息面板打开，先关闭它
  if (!expandPanel.classList.contains('hidden')) {
    expandPanel.classList.add('hidden');
    expandMode = null;
  }

  panel.classList.toggle('hidden');
}

function hideFuncPanel() {
  const panel = document.getElementById('wechat-func-panel');
  panel.classList.add('hidden');
}

function showFuncPanel() {
  const panel = document.getElementById('wechat-func-panel');
  panel.classList.remove('hidden');
}

function setFuncPanelPage(pageIndex) {
  funcPanelPage = pageIndex;
  const pages = document.getElementById('wechat-func-pages');
  const dots = document.querySelectorAll('.wechat-func-dot');

  if (pages) {
    pages.style.transform = `translateX(-${pageIndex * 100}%)`;
  }

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === pageIndex);
  });
}

function initFuncPanel() {
  const pages = document.getElementById('wechat-func-pages');
  if (!pages) return;

  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  // 开始拖拽（触摸/鼠标）
  const handleStart = (e) => {
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    currentX = startX;
    isDragging = true;
    pages.style.transition = 'none';
  };

  // 拖拽中（触摸/鼠标）
  const handleMove = (e) => {
    if (!isDragging) return;
    currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
  };

  // 结束拖拽（触摸/鼠标）
  const handleEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    pages.style.transition = 'transform 0.3s ease';

    const diff = startX - currentX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && funcPanelPage < 1) {
        setFuncPanelPage(1);
      } else if (diff < 0 && funcPanelPage > 0) {
        setFuncPanelPage(0);
      }
    }
  };

  // 触摸事件
  pages.addEventListener('touchstart', handleStart, { passive: true });
  pages.addEventListener('touchmove', handleMove, { passive: true });
  pages.addEventListener('touchend', handleEnd);

  // 鼠标事件（电脑端支持）
  pages.addEventListener('mousedown', (e) => {
    handleStart(e);
    e.preventDefault();
  });
  pages.addEventListener('mousemove', handleMove);
  pages.addEventListener('mouseup', handleEnd);
  pages.addEventListener('mouseleave', handleEnd);

  // 点击指示点切换页面
  document.querySelectorAll('.wechat-func-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const page = parseInt(dot.dataset.page);
      setFuncPanelPage(page);
    });
  });

  // 功能项点击
  document.querySelectorAll('.wechat-func-item').forEach(item => {
    item.addEventListener('click', () => {
      const func = item.dataset.func;
      handleFuncItemClick(func);
    });
  });
}

function handleFuncItemClick(func) {
  switch (func) {
    case 'voice':
      hideFuncPanel();
      showExpandVoice();
      break;
    case 'multi':
      hideFuncPanel();
      showExpandMulti();
      break;
    case 'photo':
    case 'camera':
    case 'videocall':
    case 'location':
    case 'redpacket':
    case 'gift':
    case 'transfer':
    case 'favorites':
    case 'contact':
    case 'file':
    case 'card':
    case 'music':
      // 暂时只提示功能开发中
      showToast('该功能开发中...', '🚧');
      break;
  }
}

// 发送展开面板的内容
function sendExpandContent() {
  if (expandMode === 'voice') {
    const textarea = document.getElementById('wechat-expand-voice-text');
    const content = textarea?.value.trim();

    if (!content) {
      showToast('请输入语音内容', '⚠️');
      return;
    }

    closeExpandPanel();
    sendMessage(content, false, true);
  } else if (expandMode === 'multi') {
    const validMessages = expandMsgItems.filter(m => m.trim());

    if (validMessages.length === 0) {
      showToast('请至少输入一条消息', '⚠️');
      return;
    }

    closeExpandPanel();
    sendMessage(validMessages, true);
  }
}

// 绑定事件
function bindEvents() {
  // 添加按钮 - 显示下拉菜单
  document.getElementById('wechat-add-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('wechat-dropdown-menu');
    dropdown.classList.toggle('hidden');
  });

  // 点击其他地方关闭下拉菜单
  document.getElementById('wechat-phone')?.addEventListener('click', (e) => {
    if (!e.target.closest('#wechat-add-btn') && !e.target.closest('#wechat-dropdown-menu')) {
      document.getElementById('wechat-dropdown-menu')?.classList.add('hidden');
    }
  });

  // 通讯录页面的添加按钮 - 直接进入添加朋友页面
  document.getElementById('wechat-contacts-add-btn')?.addEventListener('click', () => {
    showPage('wechat-add-page');
  });

  // 下拉菜单 - 添加朋友
  document.getElementById('wechat-menu-add-friend')?.addEventListener('click', () => {
    document.getElementById('wechat-dropdown-menu').classList.add('hidden');
    showPage('wechat-add-page');
  });

  // 下拉菜单 - 其他选项（暂时只关闭菜单）
  document.getElementById('wechat-menu-group')?.addEventListener('click', () => {
    document.getElementById('wechat-dropdown-menu').classList.add('hidden');
  });
  document.getElementById('wechat-menu-scan')?.addEventListener('click', () => {
    document.getElementById('wechat-dropdown-menu').classList.add('hidden');
  });
  document.getElementById('wechat-menu-pay')?.addEventListener('click', () => {
    document.getElementById('wechat-dropdown-menu').classList.add('hidden');
  });

  // 返回按钮
  document.getElementById('wechat-back-btn')?.addEventListener('click', () => {
    showPage('wechat-main-content');
  });

  document.getElementById('wechat-chat-back-btn')?.addEventListener('click', () => {
    currentChatIndex = -1;
    showPage('wechat-main-content');
    refreshContactsList(); // 刷新列表显示最新消息
  });

  document.getElementById('wechat-settings-back-btn')?.addEventListener('click', () => {
    showPage('wechat-me-page');
  });

  document.getElementById('wechat-favorites-back-btn')?.addEventListener('click', () => {
    showPage('wechat-me-page');
  });

  // 导入 PNG
  document.getElementById('wechat-import-png')?.addEventListener('click', () => {
    document.getElementById('wechat-file-png').click();
  });

  // 导入 JSON
  document.getElementById('wechat-import-json')?.addEventListener('click', () => {
    document.getElementById('wechat-file-json').click();
  });

  // PNG 文件选择
  document.getElementById('wechat-file-png')?.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const charData = await extractCharacterFromPNG(file);
      charData.file = file;

      // 直接添加联系人，不显示确认弹窗
      if (addContact(charData)) {
        showToast('导入成功', '✅');
        // 尝试导入到 SillyTavern（静默失败）
        try {
          await importCharacterToST(charData);
        } catch (err) {
          console.log('导入到酒馆失败（可忽略）:', err.message);
        }
        showPage('wechat-main-content');
      }
    } catch (err) {
      showToast(err.message, '❌');
    }
    this.value = '';
  });

  // JSON 文件选择
  document.getElementById('wechat-file-json')?.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const charData = await extractCharacterFromJSON(file);
      charData.file = file;

      // 直接添加联系人，不显示确认弹窗
      if (addContact(charData)) {
        showToast('导入成功', '✅');
        // 尝试导入到 SillyTavern（静默失败）
        try {
          await importCharacterToST(charData);
        } catch (err) {
          console.log('导入到酒馆失败（可忽略）:', err.message);
        }
        showPage('wechat-main-content');
      }
    } catch (err) {
      showToast(err.message, '❌');
    }
    this.value = '';
  });

  // 深色模式切换
  document.getElementById('wechat-dark-toggle')?.addEventListener('click', toggleDarkMode);

  // 聊天输入框发送消息
  const chatInput = document.getElementById('wechat-input');
  if (chatInput) {
    // 按回车发送
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(chatInput.value);
      }
    });
  }

  // 点击 + 按钮切换功能面板
  document.querySelector('.wechat-chat-input-more')?.addEventListener('click', () => {
    toggleFuncPanel();
  });

  // 语音按钮 - 快捷方式直接打开语音输入
  document.querySelector('.wechat-chat-input-voice')?.addEventListener('click', () => {
    hideFuncPanel();
    showExpandVoice();
  });

  // 功能面板滑动和点击
  initFuncPanel();

  // 展开面板 - 关闭按钮
  document.getElementById('wechat-expand-close')?.addEventListener('click', () => {
    closeExpandPanel();
  });

  // 展开面板 - 发送按钮
  document.getElementById('wechat-expand-send')?.addEventListener('click', () => {
    sendExpandContent();
  });

  // 标签栏切换（处理所有标签栏，包括主页面和"我"页面）
  document.querySelectorAll('.wechat-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      // 更新所有标签栏的状态
      document.querySelectorAll('.wechat-tab').forEach(t => {
        if (t.dataset.tab === this.dataset.tab) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });

      const tabName = this.dataset.tab;
      if (tabName === 'me') {
        showPage('wechat-me-page');
      } else if (tabName === 'chat') {
        showPage('wechat-main-content');
        // 显示微信聊天列表，隐藏通讯录
        document.getElementById('wechat-chat-tab-content')?.classList.remove('hidden');
        document.getElementById('wechat-contacts-tab-content')?.classList.add('hidden');
        // 刷新聊天列表
        refreshChatList();
      } else if (tabName === 'contacts') {
        showPage('wechat-main-content');
        // 显示通讯录，隐藏微信聊天列表
        document.getElementById('wechat-chat-tab-content')?.classList.add('hidden');
        document.getElementById('wechat-contacts-tab-content')?.classList.remove('hidden');
      } else {
        // 其他标签暂时也显示主页面
        showPage('wechat-main-content');
      }
    });
  });

  // 聊天列表项点击 - 进入聊天
  document.getElementById('wechat-chat-list')?.addEventListener('click', (e) => {
    const chatItem = e.target.closest('.wechat-chat-item');
    if (chatItem) {
      const contactId = chatItem.dataset.contactId;
      const index = parseInt(chatItem.dataset.index);
      if (contactId) {
        openChatByContactId(contactId, index);
      }
    }
  });

  // "我"页面菜单
  document.getElementById('wechat-menu-favorites')?.addEventListener('click', () => {
    showPage('wechat-favorites-page');
  });

  document.getElementById('wechat-menu-settings')?.addEventListener('click', () => {
    showPage('wechat-settings-page');
  });

  // 服务页面
  document.getElementById('wechat-menu-service')?.addEventListener('click', () => {
    showPage('wechat-service-page');
  });

  document.getElementById('wechat-service-back-btn')?.addEventListener('click', () => {
    showPage('wechat-me-page');
  });

  // 服务页面 - 钱包点击切换滑出面板
  document.getElementById('wechat-service-wallet')?.addEventListener('click', () => {
    const walletPanel = document.getElementById('wechat-wallet-panel');
    const contextPanel = document.getElementById('wechat-context-panel');
    // 关闭另一个面板
    contextPanel?.classList.add('hidden');
    // 切换当前面板
    walletPanel?.classList.toggle('hidden');
  });

  // 服务页面 - 上下文设置点击切换滑出面板
  document.getElementById('wechat-service-context')?.addEventListener('click', () => {
    const contextPanel = document.getElementById('wechat-context-panel');
    const walletPanel = document.getElementById('wechat-wallet-panel');
    // 关闭另一个面板
    walletPanel?.classList.add('hidden');
    // 切换当前面板
    contextPanel?.classList.toggle('hidden');
  });

  // 上下文开关变化
  document.getElementById('wechat-context-enabled')?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    const settings = extension_settings[extensionName];
    settings.contextEnabled = enabled;
    saveSettingsDebounced();
    // 更新显示
    document.getElementById('wechat-context-level-display').textContent = enabled ? '已开启' : '已关闭';
    // 切换设置区域状态
    const settingsSection = document.getElementById('wechat-context-settings');
    if (settingsSection) {
      settingsSection.style.opacity = enabled ? '1' : '0.5';
      settingsSection.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  });

  // 上下文滑块变化
  document.getElementById('wechat-context-slider')?.addEventListener('input', (e) => {
    const value = e.target.value;
    const settings = extension_settings[extensionName];
    settings.contextLevel = parseInt(value);
    saveSettingsDebounced();
    // 更新显示
    document.getElementById('wechat-context-value').textContent = value;
  });

  // 标签容器事件委托（添加和删除）
  document.getElementById('wechat-context-tags')?.addEventListener('click', (e) => {
    // 删除标签
    if (e.target.classList.contains('wechat-tag-del-btn')) {
      const index = parseInt(e.target.dataset.index);
      const settings = extension_settings[extensionName];
      if (settings.contextTags && index >= 0 && index < settings.contextTags.length) {
        settings.contextTags.splice(index, 1);
        saveSettingsDebounced();
        refreshContextTags();
      }
    }
    // 添加标签
    if (e.target.classList.contains('wechat-tag-add-btn')) {
      const tagName = prompt('输入标签名（如 content、scene）:');
      if (tagName && tagName.trim()) {
        const settings = extension_settings[extensionName];
        if (!settings.contextTags) settings.contextTags = [];
        if (!settings.contextTags.includes(tagName.trim())) {
          settings.contextTags.push(tagName.trim());
          saveSettingsDebounced();
          refreshContextTags();
        }
      }
    }
  });

  // 钱包金额保存（滑出面板）
  document.getElementById('wechat-wallet-save-slide')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-wallet-input-slide');
    const amount = input?.value || '0.00';
    const settings = extension_settings[extensionName];
    settings.walletAmount = amount;
    saveSettingsDebounced();
    // 更新显示
    document.getElementById('wechat-wallet-amount').textContent = '¥' + amount;
    // 关闭面板
    document.getElementById('wechat-wallet-panel')?.classList.add('hidden');
  });

  // 总结API配置 - 密码显示切换
  document.getElementById('wechat-summary-key-toggle')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-summary-key');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  });

  // 总结API配置 - 获取模型列表
  document.getElementById('wechat-summary-fetch-models')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('wechat-summary-status');
    const urlInput = document.getElementById('wechat-summary-url');
    const keyInput = document.getElementById('wechat-summary-key');
    const modelSelect = document.getElementById('wechat-summary-model');

    const url = urlInput?.value?.trim();
    const key = keyInput?.value?.trim();

    if (!url || !key) {
      if (statusEl) statusEl.textContent = '❌ 请先填写 URL 和 Key';
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ 正在获取模型列表...';

    try {
      const modelsUrl = url.replace(/\/$/, '') + '/models';
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const models = (data.data || data || [])
        .map(m => m.id || m.name || m)
        .filter(m => typeof m === 'string')
        .sort();

      if (models.length === 0) {
        if (statusEl) statusEl.textContent = '⚠️ 未找到可用模型';
        return;
      }

      // 更新下拉列表
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">-- 选择模型 --</option>' +
          models.map(m => `<option value="${m}">${m}</option>`).join('');
      }

      // 保存到设置
      const settings = extension_settings[extensionName];
      settings.summaryModelList = models;
      saveSettingsDebounced();

      if (statusEl) statusEl.textContent = `✅ 获取到 ${models.length} 个模型`;
    } catch (err) {
      console.error('获取模型列表失败:', err);
      if (statusEl) statusEl.textContent = `❌ 获取失败: ${err.message}`;
    }
  });

  // 总结API配置 - 测试连接
  document.getElementById('wechat-summary-test')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('wechat-summary-status');
    const urlInput = document.getElementById('wechat-summary-url');
    const keyInput = document.getElementById('wechat-summary-key');
    const modelSelect = document.getElementById('wechat-summary-model');

    const url = urlInput?.value?.trim();
    const key = keyInput?.value?.trim();
    const model = modelSelect?.value;

    if (!url || !key) {
      if (statusEl) statusEl.textContent = '❌ 请先填写 URL 和 Key';
      return;
    }

    if (!model) {
      if (statusEl) statusEl.textContent = '❌ 请先选择模型';
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ 正在测试连接...';

    try {
      const chatUrl = url.replace(/\/$/, '') + '/chat/completions';
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      if (statusEl) statusEl.textContent = '✅ 连接成功！';
    } catch (err) {
      console.error('测试连接失败:', err);
      if (statusEl) statusEl.textContent = `❌ 连接失败: ${err.message}`;
    }
  });

  // 总结API配置 - 保存配置
  document.getElementById('wechat-summary-save')?.addEventListener('click', () => {
    const statusEl = document.getElementById('wechat-summary-status');
    const urlInput = document.getElementById('wechat-summary-url');
    const keyInput = document.getElementById('wechat-summary-key');
    const modelSelect = document.getElementById('wechat-summary-model');

    const settings = extension_settings[extensionName];
    settings.summaryApiUrl = urlInput?.value?.trim() || '';
    settings.summaryApiKey = keyInput?.value?.trim() || '';
    settings.summarySelectedModel = modelSelect?.value || '';
    saveSettingsDebounced();

    if (statusEl) statusEl.textContent = '✅ 配置已保存';

    // 2秒后关闭面板
    setTimeout(() => {
      document.getElementById('wechat-summary-panel')?.classList.add('hidden');
    }, 1500);
  });

  // 总结API配置 - 模型选择变化
  document.getElementById('wechat-summary-model')?.addEventListener('change', (e) => {
    const settings = extension_settings[extensionName];
    settings.summarySelectedModel = e.target.value;
    saveSettingsDebounced();
  });

  // 总结API配置 - 执行总结
  document.getElementById('wechat-summary-execute')?.addEventListener('click', () => {
    executeSummary();
  });

  // 总结API配置 - 回退总结
  document.getElementById('wechat-summary-rollback')?.addEventListener('click', () => {
    rollbackSummary();
  });

  // 总结面板 - 关闭按钮
  document.getElementById('wechat-summary-close')?.addEventListener('click', () => {
    document.getElementById('wechat-summary-panel')?.classList.add('hidden');
  });

  // 服务页面 - 服务项点击
  document.querySelectorAll('.wechat-service-item').forEach(item => {
    item.addEventListener('click', () => {
      const service = item.dataset.service;

      // 总结功能 - 打开配置面板
      if (service === 'summary') {
        const panel = document.getElementById('wechat-summary-panel');
        if (panel) {
          // 关闭其他面板
          document.getElementById('wechat-context-panel')?.classList.add('hidden');
          document.getElementById('wechat-wallet-panel')?.classList.add('hidden');
          // 切换当前面板
          panel.classList.toggle('hidden');
        }
        return;
      }

      // 其他功能暂未实现
      showToast(`"${item.querySelector('span').textContent}" 功能开发中...`, '🚧');
    });
  });

  // 收藏页面 - 添加世界书按钮
  document.getElementById('wechat-favorites-add-btn')?.addEventListener('click', () => {
    showLorebookModal();
  });

  // 世界书选择弹窗取消
  document.getElementById('wechat-lorebook-cancel')?.addEventListener('click', () => {
    document.getElementById('wechat-lorebook-modal').classList.add('hidden');
  });

  // 收藏页面标签切换
  document.querySelectorAll('.wechat-favorites-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.wechat-favorites-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      refreshFavoritesList(this.dataset.tab);
    });
  });

  // 清空联系人
  document.getElementById('wechat-clear-contacts')?.addEventListener('click', () => {
    if (confirm('确定要清空所有联系人吗？')) {
      extension_settings[extensionName].contacts = [];
      saveSettingsDebounced();
      refreshContactsList();
      showToast('已清空所有联系人');
    }
  });

  // 用户头像点击更换
  document.getElementById('wechat-me-avatar')?.addEventListener('click', () => {
    document.getElementById('wechat-user-avatar-input')?.click();
  });

  // 用户头像文件选择
  document.getElementById('wechat-user-avatar-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = function(event) {
        const settings = extension_settings[extensionName];
        settings.userAvatar = event.target.result;
        saveSettingsDebounced();
        updateMePageInfo();
        showToast('头像已更换');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('更换头像失败:', err);
      showToast('更换头像失败: ' + err.message, '❌');
    }
    e.target.value = ''; // 清空以便重复选择同一文件
  });

  // API 配置相关事件
  // 切换密钥可见性
  document.getElementById('wechat-toggle-key-visibility')?.addEventListener('click', () => {
    const keyInput = document.getElementById('wechat-api-key');
    const eyeBtn = document.getElementById('wechat-toggle-key-visibility');
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
    } else {
      keyInput.type = 'password';
      eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
    }
  });

  // 保存 API 配置
  document.getElementById('wechat-save-api')?.addEventListener('click', () => {
    const apiUrl = document.getElementById('wechat-api-url').value.trim();
    const apiKey = document.getElementById('wechat-api-key').value.trim();
    const selectedModel = document.getElementById('wechat-model-select')?.value || '';

    extension_settings[extensionName].apiUrl = apiUrl;
    extension_settings[extensionName].apiKey = apiKey;
    extension_settings[extensionName].selectedModel = selectedModel;
    saveSettingsDebounced();

    showToast('API 配置已保存');
  });

  // 刷新模型列表
  document.getElementById('wechat-refresh-models')?.addEventListener('click', () => {
    refreshModelSelect();
  });

  // 模型选择变化
  document.getElementById('wechat-model-select')?.addEventListener('change', (e) => {
    extension_settings[extensionName].selectedModel = e.target.value;
    saveSettingsDebounced();
  });

  // 测试 API 连接
  document.getElementById('wechat-test-api')?.addEventListener('click', async () => {
    const apiUrl = document.getElementById('wechat-api-url').value.trim();
    const apiKey = document.getElementById('wechat-api-key').value.trim();

    if (!apiUrl) {
      showToast('请先填写 API 地址', '⚠️');
      return;
    }

    const testBtn = document.getElementById('wechat-test-api');
    const originalText = testBtn.textContent;
    testBtn.textContent = '测试中...';
    testBtn.disabled = true;

    try {
      const result = await testApiConnection(apiUrl, apiKey);
      if (result.success) {
        showToast('连接成功');
      } else {
        showToast('连接失败：' + (result.message || '未知错误'), '❌');
      }
    } catch (err) {
      showToast('连接失败：' + err.message, '❌');
    } finally {
      testBtn.textContent = originalText;
      testBtn.disabled = false;
    }
  });

  // 弹窗取消
  document.getElementById('wechat-import-cancel')?.addEventListener('click', () => {
    document.getElementById('wechat-import-modal').classList.add('hidden');
    pendingImport = null;
  });

  // 弹窗确认
  document.getElementById('wechat-import-confirm')?.addEventListener('click', async () => {
    if (pendingImport) {
      try {
        // 添加到联系人
        if (addContact(pendingImport)) {
          // 尝试导入到 SillyTavern
          try {
            await importCharacterToST(pendingImport);
            showToast(`${pendingImport.name} 已添加`);
          } catch (err) {
            showToast(`${pendingImport.name} 已添加，导入酒馆失败`, '⚠️');
          }
        }
      } catch (err) {
        showToast('添加失败：' + err.message, '❌');
      }
      document.getElementById('wechat-import-modal').classList.add('hidden');
      pendingImport = null;
      showPage('wechat-main-content');
    }
  });

  // 绑定联系人点击
  bindContactsEvents();
}

// 待导入的角色数据
let pendingImport = null;

// 显示导入确认弹窗
function showImportModal(charData) {
  pendingImport = charData;

  const preview = document.getElementById('wechat-card-preview');
  preview.innerHTML = `
    <div class="wechat-card-preview-avatar">
      ${charData.avatar ? `<img src="${charData.avatar}">` : charData.name.charAt(0)}
    </div>
    <div class="wechat-card-preview-name">${charData.name}</div>
    <div class="wechat-card-preview-desc">${charData.description?.substring(0, 200) || '暂无简介'}</div>
  `;

  document.getElementById('wechat-import-modal').classList.remove('hidden');
}

// 监听聊天消息更新
function setupMessageObserver() {
  const context = getContext();
  if (!context) return;

  // 监听新消息
  const chatContainer = document.getElementById('chat');
  if (chatContainer) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList?.contains('mes')) {
            // 检查是否包含微信格式
            const mesText = node.querySelector('.mes_text');
            if (mesText) {
              const wechatMessages = parseWeChatMessage(mesText.textContent);
              if (wechatMessages.length > 0) {
                // 可以在这里添加微信消息的特殊显示
                console.log('检测到微信格式消息:', wechatMessages);
              }
            }
          }
        });
      });
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
  }
}

// 添加扩展按钮到酒馆魔法棒菜单
function addExtensionButton() {
  // 添加到扩展菜单 (extensionsMenu)
  const extensionsMenu = document.getElementById('extensionsMenu');
  if (extensionsMenu && !document.getElementById('wechat-extension-menu-item')) {
    const menuItem = document.createElement('div');
    menuItem.id = 'wechat-extension-menu-item';
    menuItem.className = 'list-group-item flex-container flexGap5';
    menuItem.innerHTML = `
      <span class="fa-solid fa-comment-dots"></span>
      可乐
    `;
    menuItem.style.cursor = 'pointer';
    menuItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePhone();
      // 关闭扩展菜单
      const menu = document.getElementById('extensionsMenu');
      if (menu) menu.style.display = 'none';
    });
    extensionsMenu.appendChild(menuItem);
  }
}

// 初始化插件
jQuery(async () => {
  loadSettings();

  // 添加 HTML 到页面
  const phoneHTML = generatePhoneHTML();
  $('body').append(phoneHTML);
  setupPhoneAutoCentering();
  setupPhoneDrag();

  // 绑定事件
  bindEvents();

  // 恢复模型列表
  restoreModelSelect();

  // 设置消息监听
  setupMessageObserver();

  // 添加扩展按钮到酒馆魔法棒菜单
  addExtensionButton();

  // 更新时间
  setInterval(() => {
    const timeEl = document.querySelector('.wechat-statusbar-time');
    if (timeEl && !document.getElementById('wechat-phone').classList.contains('hidden')) {
      timeEl.textContent = getCurrentTime();
    }
  }, 60000);

  console.log('✅ 可乐不加冰 v1.0.0 已加载');
});
