/**
 * 可乐不加冰 - 主入口（模块化）
 */

console.log('[可乐] main.js 开始加载...');

import { requestSave, setupUnloadSave } from './save-manager.js';

import { loadSettings, getSettings, MEME_PROMPT_TEMPLATE } from './config.js';
import { generatePhoneHTML } from './phone-html.js';
import { showPage, refreshChatList, updateMePageInfo, getUserPersonaFromST, updateTabBadge } from './ui.js';
import { showToast } from './toast.js';
import { ICON_SUCCESS, ICON_INFO } from './icons.js';

import { addContact, refreshContactsList, openContactSettings, saveContactSettings, closeContactSettings, changeContactAvatar, getCurrentEditingContactIndex } from './contacts.js';
import { openChatByContactId, setCurrentChatIndex, sendMessage, showRecalledMessages, currentChatIndex, openChat } from './chat.js';
import { refreshFavoritesList, showLorebookModal, syncCharacterBookToTavern, showAddLorebookPanel, showAddPersonaPanel } from './favorites.js';
import { executeSummary, rollbackSummary, refreshSummaryChatList, selectAllSummaryChats } from './summary.js';
import { fetchModelListFromApi } from './ai.js';

import { extractCharacterFromPNG, extractCharacterFromJSON, importCharacterToST } from './character-import.js';

import { setupPhoneAutoCentering, setupPhoneDrag, centerPhoneInViewport } from './phone.js';

import { showGroupCreateModal, closeGroupCreateModal, createGroupChat, sendGroupMessage, isInGroupChat, setCurrentGroupChatIndex, getCurrentGroupIndex, openGroupChat } from './group-chat.js';
import { toggleDarkMode, refreshContextTags } from './settings-ui.js';
import { initFuncPanel, toggleFuncPanel, hideFuncPanel, showExpandVoice, closeExpandPanel, sendExpandContent } from './chat-func-panel.js';
import { initEmojiPanel, toggleEmojiPanel, hideEmojiPanel } from './emoji-panel.js';
import { injectAuthorNote, setupMessageObserver, addExtensionButton } from './st-integration.js';
import { getCurrentTime } from './utils.js';
import { refreshHistoryList, refreshLogsList, clearErrorLogs, initErrorCapture, addErrorLog } from './history-logs.js';
import { initChatBackground } from './chat-background.js';
import { initMoments, openMomentsPage, clearContactMoments } from './moments.js';
import { initRedPacketEvents } from './red-packet.js';
import { initTransferEvents } from './transfer.js';
import { initGroupRedPacket } from './group-red-packet.js';
import { initCropper } from './cropper.js';

function normalizeModelListForSelect(models) {
  return (models || []).map(m => {
    if (typeof m === 'string') return { id: m, name: m };
    return { id: m?.id || '', name: m?.name || m?.id || '' };
  }).filter(m => m.id);
}

function restoreModelSelect() {
  // select 元素在 HTML 生成时已经包含了选项，无需额外恢复
}

function restoreGroupModelSelect() {
  // select 元素在 HTML 生成时已经包含了选项，无需额外恢复
}

function seedDefaultUserPersonaFromST(settings) {
  if (Array.isArray(settings.userPersonas) && settings.userPersonas.length > 0) return false;

  const stPersona = getUserPersonaFromST();
  const content = stPersona?.description?.trim();
  if (!content) return false;

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  settings.userPersonas = [{
    name: (stPersona?.name || '').trim() || '用户设定',
    content,
    enabled: true,
    addedTime: timeStr,
  }];

  return true;
}

async function refreshModelSelect() {
  const select = document.getElementById('wechat-model-select');
  const refreshBtn = document.getElementById('wechat-refresh-models');
  if (!select) return;

  const settings = getSettings();
  const apiUrl = document.getElementById('wechat-api-url')?.value?.trim() || settings.apiUrl || '';
  const apiKey = document.getElementById('wechat-api-key')?.value?.trim() || settings.apiKey || '';

  if (!apiUrl) {
    showToast('请先填写 API 地址', 'info');
    return;
  }

  const originalText = refreshBtn?.textContent;
  if (refreshBtn) {
    refreshBtn.textContent = '加载中...';
    refreshBtn.disabled = true;
  }

  try {
    const modelIds = await fetchModelListFromApi(apiUrl, apiKey);

    // 更新 select 选项
    select.innerHTML = '<option value="">-- 选择模型 --</option>' +
      modelIds.map(id => `<option value="${id}">${id}</option>`).join('');

    settings.modelList = modelIds;
    requestSave();
    showToast(`获取到 ${modelIds.length} 个模型`);
  } catch (err) {
    console.error('[可乐] 获取模型列表失败:', err);
    showToast(`获取失败，请手动输入模型名`, '⚠️');
  } finally {
    if (refreshBtn) {
      refreshBtn.textContent = originalText;
      refreshBtn.disabled = false;
    }
  }
}

function syncContextEnabledUI(enabled) {
  const display = document.getElementById('wechat-context-level-display');
  if (display) display.textContent = enabled ? '已开启' : '已关闭';

  const settingsSection = document.getElementById('wechat-context-settings');
  if (settingsSection) {
    settingsSection.style.opacity = enabled ? '1' : '0.5';
    settingsSection.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

function updateWalletAmountDisplay() {
  const settings = getSettings();
  const amountEl = document.getElementById('wechat-wallet-amount');
  if (!amountEl) return;

  const amount = settings.walletAmount || '5773.89';
  amountEl.textContent = amount.startsWith('￥') ? amount : `￥${amount}`;
}

function bindEvents() {
  // 添加按钮 - 显示下拉菜单
  document.getElementById('wechat-add-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('wechat-dropdown-menu')?.classList.toggle('hidden');
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
    document.getElementById('wechat-dropdown-menu')?.classList.add('hidden');
    showPage('wechat-add-page');
  });

  // 下拉菜单 - 发起群聊
  document.getElementById('wechat-menu-group')?.addEventListener('click', () => {
    document.getElementById('wechat-dropdown-menu')?.classList.add('hidden');
    showGroupCreateModal();
  });

  // 下拉菜单 - 其他选项（暂时只关闭菜单）
  ['wechat-menu-scan', 'wechat-menu-pay'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      document.getElementById('wechat-dropdown-menu')?.classList.add('hidden');
    });
  });

  // ===== 群聊创建弹窗事件 =====
  document.getElementById('wechat-group-create-close')?.addEventListener('click', closeGroupCreateModal);
  document.getElementById('wechat-group-create-confirm')?.addEventListener('click', createGroupChat);

  // 返回按钮
  document.getElementById('wechat-back-btn')?.addEventListener('click', () => {
    showPage('wechat-main-content');
  });

  document.getElementById('wechat-chat-back-btn')?.addEventListener('click', () => {
    setCurrentChatIndex(-1);
    setCurrentGroupChatIndex(-1);
    // 清除群聊标记
    const messagesContainer = document.getElementById('wechat-chat-messages');
    if (messagesContainer) {
      messagesContainer.dataset.isGroup = 'false';
      messagesContainer.dataset.groupIndex = '-1';
      // 清除背景
      messagesContainer.style.backgroundImage = '';
    }
    // 关闭所有聊天页面板
    document.getElementById('wechat-chat-menu')?.classList.add('hidden');
    document.getElementById('wechat-recalled-panel')?.classList.add('hidden');
    document.getElementById('wechat-chat-bg-panel')?.classList.add('hidden');
    showPage('wechat-main-content');
    refreshContactsList();
    refreshChatList();
  });

  // ===== 聊天页菜单事件 =====
  // 三个点按钮 - 显示聊天菜单
  document.getElementById('wechat-chat-more-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('wechat-chat-menu');
    const recalledPanel = document.getElementById('wechat-recalled-panel');
    const bgPanel = document.getElementById('wechat-chat-bg-panel');
    recalledPanel?.classList.add('hidden');
    bgPanel?.classList.add('hidden');
    menu?.classList.toggle('hidden');
  });

  // 撤回消息菜单项 - 显示撤回消息区
  document.getElementById('wechat-menu-recalled')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-menu')?.classList.add('hidden');
    showRecalledMessages();
  });

  // 关闭撤回消息区面板
  document.getElementById('wechat-recalled-close')?.addEventListener('click', () => {
    document.getElementById('wechat-recalled-panel')?.classList.add('hidden');
  });

  // 查看TA的朋友圈
  document.getElementById('wechat-menu-moments')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-menu')?.classList.add('hidden');
    if (currentChatIndex >= 0) {
      openMomentsPage(currentChatIndex);
    }
  });

  // 清空TA的朋友圈
  document.getElementById('wechat-menu-clear-moments')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-menu')?.classList.add('hidden');
    if (currentChatIndex >= 0) {
      clearContactMoments(currentChatIndex);
    }
  });

  // 清空当前聊天（支持单聊和群聊）
  document.getElementById('wechat-menu-clear-chat')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-menu')?.classList.add('hidden');

    const groupIndex = getCurrentGroupIndex();
    const settings = getSettings();

    // 群聊清空
    if (groupIndex >= 0) {
      if (!confirm('确定要清空当前群聊记录吗？此操作不可恢复。')) return;

      const groupChat = settings.groupChats?.[groupIndex];
      if (groupChat) {
        groupChat.chatHistory = [];
        groupChat.lastMessage = '';
        requestSave();
        openGroupChat(groupIndex); // 刷新群聊界面
        showToast('群聊记录已清空');
      }
      return;
    }

    // 单聊清空
    if (currentChatIndex < 0) return;

    if (!confirm('确定要清空当前聊天记录吗？此操作不可恢复。')) return;

    const contact = settings.contacts[currentChatIndex];
    if (contact) {
      contact.chatHistory = [];
      contact.lastMessage = '';
      requestSave();
      openChat(currentChatIndex); // 刷新聊天界面
      showToast('聊天记录已清空');
    }
  });

  // 点击聊天页其他地方关闭菜单和面板
  document.getElementById('wechat-chat-page')?.addEventListener('click', (e) => {
    if (!e.target.closest('#wechat-chat-more-btn') && !e.target.closest('#wechat-chat-menu')) {
      document.getElementById('wechat-chat-menu')?.classList.add('hidden');
    }
    if (!e.target.closest('#wechat-chat-bg-panel') && !e.target.closest('#wechat-chat-menu')) {
      document.getElementById('wechat-chat-bg-panel')?.classList.add('hidden');
    }
  });

  document.getElementById('wechat-settings-back-btn')?.addEventListener('click', () => {
    showPage('wechat-me-page');
  });

  document.getElementById('wechat-favorites-back-btn')?.addEventListener('click', () => {
    showPage('wechat-me-page');
  });

  // 导入 PNG/JSON
  document.getElementById('wechat-import-png')?.addEventListener('click', () => {
    document.getElementById('wechat-file-png')?.click();
  });
  document.getElementById('wechat-import-json')?.addEventListener('click', () => {
    document.getElementById('wechat-file-json')?.click();
  });

  // PNG 文件选择
  document.getElementById('wechat-file-png')?.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const charData = await extractCharacterFromPNG(file);
      charData.file = file;

      if (addContact(charData)) {
        showToast('导入成功');
        try {
          await importCharacterToST(charData);
        } catch (err) {
          console.log('导入到酒馆失败（可忽略）:', err.message);
        }
        // 同步角色卡内置世界书
        const lorebookName = await syncCharacterBookToTavern(charData);
        if (lorebookName) {
          showToast(`角色书「${lorebookName}」已同步`);
        }
        showPage('wechat-main-content');
      }
    } catch (err) {
      showToast(err.message, '⚠️');
    }

    this.value = '';
  });

  // JSON 文件选择
  document.getElementById('wechat-file-json')?.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const charData = await extractCharacterFromJSON(file);
      charData.file = file;

      if (addContact(charData)) {
        showToast('导入成功');
        try {
          await importCharacterToST(charData);
        } catch (err) {
          console.log('导入到酒馆失败（可忽略）:', err.message);
        }
        // 同步角色卡内置世界书
        const lorebookName = await syncCharacterBookToTavern(charData);
        if (lorebookName) {
          showToast(`角色书「${lorebookName}」已同步`);
        }
        showPage('wechat-main-content');
      }
    } catch (err) {
      showToast(err.message, '⚠️');
    }

    this.value = '';
  });

  // 深色模式切换
  document.getElementById('wechat-dark-toggle')?.addEventListener('click', toggleDarkMode);

  // 自动注入提示
  document.getElementById('wechat-auto-inject-toggle')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.autoInjectPrompt = !settings.autoInjectPrompt;
    document.getElementById('wechat-auto-inject-toggle')?.classList.toggle('on', settings.autoInjectPrompt);
    // 展开/收起编辑区域
    const contentDiv = document.getElementById('wechat-auto-inject-content');
    if (contentDiv) {
      contentDiv.classList.toggle('hidden', !settings.autoInjectPrompt);
    }
    requestSave();
    if (settings.autoInjectPrompt) injectAuthorNote();
  });

  // 保存作者注释模板
  document.getElementById('wechat-save-author-note')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.authorNoteCustom = document.getElementById('wechat-author-note-content')?.value || '';
    requestSave();
    showToast('作者注释模板已保存');
  });

  // 哈基米破限开关
  document.getElementById('wechat-hakimi-toggle')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.hakimiBreakLimit = !settings.hakimiBreakLimit;
    document.getElementById('wechat-hakimi-toggle')?.classList.toggle('on', settings.hakimiBreakLimit);
    // 展开/收起编辑区域
    const contentDiv = document.getElementById('wechat-hakimi-content');
    if (contentDiv) {
      contentDiv.classList.toggle('hidden', !settings.hakimiBreakLimit);
    }
    requestSave();
    showToast(settings.hakimiBreakLimit ? '哈基米破限已开启' : '哈基米破限已关闭');
  });

  // 保存哈基米破限词
  document.getElementById('wechat-save-hakimi')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.hakimiCustomPrompt = document.getElementById('wechat-hakimi-prompt')?.value || '';
    requestSave();
    showToast('破限提示词已保存');
  });

  // ===== Meme表情包事件 =====
  // 关闭面板
  document.getElementById('wechat-meme-stickers-close')?.addEventListener('click', () => {
    document.getElementById('wechat-meme-stickers-panel')?.classList.add('hidden');
  });

  // Meme开关
  document.getElementById('wechat-meme-stickers-toggle')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.memeStickersEnabled = !settings.memeStickersEnabled;
    const toggle = document.getElementById('wechat-meme-stickers-toggle');
    toggle?.classList.toggle('on', settings.memeStickersEnabled);
    requestSave();
    showToast(settings.memeStickersEnabled ? 'Meme表情包已启用' : 'Meme表情包已禁用');
  });

  // 添加表情包 - 弹出文本输入框
  document.getElementById('wechat-add-meme-sticker')?.addEventListener('click', () => {
    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'wechat-modal';
    modal.id = 'wechat-add-meme-modal';
    modal.innerHTML = `
      <div class="wechat-modal-content" style="max-width: 320px; background: #fff !important; color: #000 !important;">
        <div class="wechat-modal-title" style="color: #000 !important;">添加表情包</div>
        <div style="font-size: 12px; color: #666 !important; margin-bottom: 10px;">
          输入猫箱格式的文件名，每行一个<br>
          格式：名称+6位ID.扩展名<br>
          例如：是的主人yvrgdc.jpg
        </div>
        <textarea id="wechat-meme-input" placeholder="被揍了哭哭81x5zq.jpg&#10;开心跳舞abc123.gif&#10;..." style="width: 100%; height: 120px; box-sizing: border-box; font-size: 12px; color: #000 !important; background: #fff !important; padding: 10px; border-radius: 6px; border: 1px solid #ddd; font-family: monospace; resize: vertical;"></textarea>
        <div style="display: flex; gap: 10px; margin-top: 12px; justify-content: flex-end;">
          <button class="wechat-btn wechat-btn-secondary" id="wechat-meme-cancel" style="background: #f0f0f0 !important; color: #333 !important;">取消</button>
          <button class="wechat-btn wechat-btn-primary" id="wechat-meme-confirm">添加</button>
        </div>
      </div>
    `;

    const phoneContainer = document.getElementById('wechat-phone');
    if (phoneContainer) {
      phoneContainer.appendChild(modal);
    } else {
      document.body.appendChild(modal);
    }

    // 聚焦输入框
    document.getElementById('wechat-meme-input')?.focus();

    // 取消按钮
    document.getElementById('wechat-meme-cancel')?.addEventListener('click', () => modal.remove());

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 确认添加
    document.getElementById('wechat-meme-confirm')?.addEventListener('click', () => {
      const input = document.getElementById('wechat-meme-input');
      const text = input?.value?.trim();
      if (!text) {
        modal.remove();
        return;
      }

      // 解析输入的每一行
      const lines = text.split('\n').map(s => s.trim()).filter(s => s);
      if (lines.length === 0) {
        modal.remove();
        return;
      }

      // 添加到表情包列表
      const textarea = document.getElementById('wechat-meme-stickers-list');
      if (textarea) {
        const currentList = textarea.value.trim();
        const updatedList = currentList ? currentList + '\n' + lines.join('\n') : lines.join('\n');
        textarea.value = updatedList;
        showToast(`已添加 ${lines.length} 个表情包`);
      }

      modal.remove();
    });
  });

  // ===== 角色设置弹窗事件 =====
  // 关闭按钮
  document.getElementById('wechat-contact-settings-close')?.addEventListener('click', closeContactSettings);

  // 保存按钮
  document.getElementById('wechat-contact-settings-save')?.addEventListener('click', saveContactSettings);

  // 更换头像按钮
  document.getElementById('wechat-change-avatar-btn')?.addEventListener('click', () => {
    const index = getCurrentEditingContactIndex();
    if (index >= 0) changeContactAvatar(index);
  });

  // 独立API开关
  document.getElementById('wechat-contact-custom-api-toggle')?.addEventListener('click', () => {
    const toggle = document.getElementById('wechat-contact-custom-api-toggle');
    const apiSettingsDiv = document.getElementById('wechat-contact-api-settings');
    toggle?.classList.toggle('on');
    const isOn = toggle?.classList.contains('on');
    if (apiSettingsDiv) {
      if (isOn) {
        apiSettingsDiv.classList.remove('hidden');
        apiSettingsDiv.style.display = 'flex';
      } else {
        apiSettingsDiv.classList.add('hidden');
        apiSettingsDiv.style.display = 'none';
      }
    }
  });

  // 角色独立哈基米开关
  document.getElementById('wechat-contact-hakimi-toggle')?.addEventListener('click', () => {
    document.getElementById('wechat-contact-hakimi-toggle')?.classList.toggle('on');
  });

  // 角色独立API获取模型按钮
  document.getElementById('wechat-contact-fetch-model')?.addEventListener('click', async () => {
    const apiUrl = document.getElementById('wechat-contact-api-url')?.value?.trim();
    const apiKey = document.getElementById('wechat-contact-api-key')?.value?.trim();
    const modelInput = document.getElementById('wechat-contact-model');
    const modelList = document.getElementById('wechat-contact-model-list');
    const fetchBtn = document.getElementById('wechat-contact-fetch-model');

    if (!apiUrl) {
      showToast('请先填写API地址', 'info');
      return;
    }

    fetchBtn.textContent = '...';
    fetchBtn.disabled = true;

    try {
      const { fetchModelListFromApi } = await import('./ai.js');
      const models = await fetchModelListFromApi(apiUrl, apiKey);
      if (models.length > 0) {
        const currentValue = modelInput?.value || '';
        modelList.innerHTML = models.map(m => `<option value="${m}">`).join('');
        showToast(`获取到 ${models.length} 个模型`);
      } else {
        showToast('未找到可用模型', 'info');
      }
    } catch (err) {
      console.error('[可乐] 获取模型失败:', err);
      showToast('获取失败: ' + err.message, '⚠️');
    } finally {
      fetchBtn.textContent = '获取';
      fetchBtn.disabled = false;
    }
  });

  // 角色独立API测试连接按钮
  document.getElementById('wechat-contact-test-api')?.addEventListener('click', async () => {
    const apiUrl = document.getElementById('wechat-contact-api-url')?.value?.trim();
    const apiKey = document.getElementById('wechat-contact-api-key')?.value?.trim();
    const model = document.getElementById('wechat-contact-model')?.value?.trim();
    const testBtn = document.getElementById('wechat-contact-test-api');

    if (!apiUrl) {
      showToast('请先填写API地址', 'info');
      return;
    }
    if (!model) {
      showToast('请先填写或选择模型', 'info');
      return;
    }

    testBtn.textContent = '测试中...';
    testBtn.disabled = true;

    try {
      const chatUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: '请回复"连接成功"' }],
          max_tokens: 8196
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '';
      showToast(`连接成功！回复: ${reply.substring(0, 20)}...`, 'success');
    } catch (err) {
      console.error('[可乐] 测试连接失败:', err);
      showToast('❌ 连接失败: ' + err.message, '⚠️');
    } finally {
      testBtn.textContent = '测试连接';
      testBtn.disabled = false;
    }
  });

  // ===== 群聊设置事件 =====
  // 群聊提示词注入开关
  document.getElementById('wechat-group-inject-toggle')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.groupAutoInjectPrompt = !settings.groupAutoInjectPrompt;
    document.getElementById('wechat-group-inject-toggle')?.classList.toggle('on', settings.groupAutoInjectPrompt);
    // 展开/收起编辑区域
    const contentDiv = document.getElementById('wechat-group-inject-content');
    if (contentDiv) {
      contentDiv.classList.toggle('hidden', !settings.groupAutoInjectPrompt);
    }
    requestSave();
    showToast(settings.groupAutoInjectPrompt ? '群聊提示词注入已开启' : '群聊提示词注入已关闭');
  });

  // 保存群聊作者注释
  document.getElementById('wechat-save-group-note')?.addEventListener('click', () => {
    const settings = getSettings();
    settings.userGroupAuthorNote = document.getElementById('wechat-group-author-note')?.value || '';
    requestSave();
    showToast('群聊作者注释已保存');
  });

  // 聊天输入框发送消息（支持单聊和群聊）
  const chatInput = document.getElementById('wechat-input');

  // 更新发送按钮状态（全局可用）
  window.updateSendButtonState = () => {
    const moreBtn = document.querySelector('.wechat-chat-input-more');
    const sendText = moreBtn?.querySelector('.wechat-input-send-text');
    const moreIcon = moreBtn?.querySelector('.wechat-input-more-icon');
    if (!sendText || !moreIcon) return;

    const input = document.getElementById('wechat-input');
    const hasText = input?.value?.trim();
    if (hasText) {
      sendText.style.display = 'inline-block';
      moreIcon.style.display = 'none';
    } else {
      sendText.style.display = 'none';
      moreIcon.style.display = 'inline-block';
    }
  };

  // 监听输入变化
  chatInput?.addEventListener('input', window.updateSendButtonState);

  // 监听聚焦时也更新状态
  chatInput?.addEventListener('focus', window.updateSendButtonState);

  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = chatInput.value?.trim();
      if (!text) return;

      // 调试日志
      const messagesContainer = document.getElementById('wechat-chat-messages');
      console.log('[可乐] Enter 键发送消息:', {
        text: text.substring(0, 20),
        isGroup: messagesContainer?.dataset?.isGroup,
        groupIndex: messagesContainer?.dataset?.groupIndex,
        isInGroupChatResult: isInGroupChat()
      });

      if (isInGroupChat()) {
        console.log('[可乐] 调用 sendGroupMessage');
        sendGroupMessage(text);
      } else {
        console.log('[可乐] 调用 sendMessage (单聊)');
        sendMessage(text);
      }

      // 发送后更新按钮状态
      setTimeout(window.updateSendButtonState, 50);
    }
  });

  // 聊天输入区按钮
  document.querySelector('.wechat-chat-input-more')?.addEventListener('click', () => {
    const text = chatInput?.value?.trim();
    if (text) {
      // 有文字时发送消息
      if (isInGroupChat()) {
        sendGroupMessage(text);
      } else {
        sendMessage(text);
      }
      // 发送后更新按钮状态
      setTimeout(window.updateSendButtonState, 50);
    } else {
      // 无文字时切换功能面板
      toggleFuncPanel();
    }
  });
  document.querySelector('.wechat-chat-input-voice')?.addEventListener('click', () => {
    hideFuncPanel();
    hideEmojiPanel();
    showExpandVoice();
  });

  // 表情按钮
  document.querySelector('.wechat-chat-input-emoji')?.addEventListener('click', () => {
    hideFuncPanel();
    toggleEmojiPanel();
  });

  initFuncPanel();
  initEmojiPanel();
  initChatBackground();
  initMoments();
  initRedPacketEvents();
  initTransferEvents();
  initGroupRedPacket();
  initCropper();

  // 展开面板
  document.getElementById('wechat-expand-close')?.addEventListener('click', closeExpandPanel);
  document.getElementById('wechat-expand-send')?.addEventListener('click', sendExpandContent);

  // 标签栏切换
  document.querySelectorAll('.wechat-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.wechat-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === this.dataset.tab);
      });

      const tabName = this.dataset.tab;
      if (tabName === 'me') {
        showPage('wechat-me-page');
        return;
      }

      if (tabName === 'discover') {
        showPage('wechat-discover-page');
        return;
      }

      if (tabName === 'chat') {
        showPage('wechat-main-content');
        document.getElementById('wechat-chat-tab-content')?.classList.remove('hidden');
        document.getElementById('wechat-contacts-tab-content')?.classList.add('hidden');
        refreshChatList();
        return;
      }

      if (tabName === 'contacts') {
        showPage('wechat-main-content');
        document.getElementById('wechat-chat-tab-content')?.classList.add('hidden');
        document.getElementById('wechat-contacts-tab-content')?.classList.remove('hidden');
        refreshContactsList();
        return;
      }

      showPage('wechat-main-content');
    });
  });

  // 聊天列表项点击（支持单聊和群聊）
  document.getElementById('wechat-chat-list')?.addEventListener('click', (e) => {
    const chatItem = e.target.closest('.wechat-chat-item');
    if (!chatItem) return;

    // 检查是否是群聊
    if (chatItem.classList.contains('wechat-chat-item-group')) {
      const groupIndex = parseInt(chatItem.dataset.groupIndex);
      if (!isNaN(groupIndex)) {
        import('./group-chat.js').then(m => m.openGroupChat(groupIndex));
      }
    } else {
      // 单聊
      const contactId = chatItem.dataset.contactId;
      const index = parseInt(chatItem.dataset.index);
      if (contactId) openChatByContactId(contactId, index);
    }
  });

  // “我”页面菜单
  document.getElementById('wechat-menu-favorites')?.addEventListener('click', () => {
    showPage('wechat-favorites-page');
  });
  document.getElementById('wechat-menu-settings')?.addEventListener('click', () => {
    showPage('wechat-settings-page');
  });
  document.getElementById('wechat-menu-service')?.addEventListener('click', () => {
    showPage('wechat-service-page');
    updateWalletAmountDisplay();
  });

  // 服务页返回
  document.getElementById('wechat-service-back-btn')?.addEventListener('click', () => {
    showPage('wechat-me-page');
  });

  // 服务页面 - 钱包/上下文开关面板
  document.getElementById('wechat-service-wallet')?.addEventListener('click', () => {
    document.getElementById('wechat-context-panel')?.classList.add('hidden');
    document.getElementById('wechat-wallet-panel')?.classList.toggle('hidden');
  });

  document.getElementById('wechat-service-context')?.addEventListener('click', () => {
    document.getElementById('wechat-wallet-panel')?.classList.add('hidden');
    document.getElementById('wechat-context-panel')?.classList.toggle('hidden');
  });

  // 上下文开关变化
  document.getElementById('wechat-context-enabled')?.addEventListener('change', (e) => {
    const settings = getSettings();
    settings.contextEnabled = e.target.checked;
    requestSave();
    syncContextEnabledUI(settings.contextEnabled);
  });

  // 上下文滑块变化
  document.getElementById('wechat-context-slider')?.addEventListener('input', (e) => {
    const settings = getSettings();
    settings.contextLevel = parseInt(e.target.value);
    requestSave();
    document.getElementById('wechat-context-value').textContent = e.target.value;
  });

  // 标签容器事件委托（添加/删除）
  document.getElementById('wechat-context-tags')?.addEventListener('click', (e) => {
    const settings = getSettings();

    if (e.target.classList.contains('wechat-tag-del-btn')) {
      const index = parseInt(e.target.dataset.index);
      if (Array.isArray(settings.contextTags) && index >= 0 && index < settings.contextTags.length) {
        settings.contextTags.splice(index, 1);
        requestSave();
        refreshContextTags();
      }
      return;
    }

    if (e.target.classList.contains('wechat-tag-add-btn')) {
      const tagName = prompt('输入标签名（如 content、scene）:');
      if (tagName && tagName.trim()) {
        settings.contextTags = Array.isArray(settings.contextTags) ? settings.contextTags : [];
        if (!settings.contextTags.includes(tagName.trim())) {
          settings.contextTags.push(tagName.trim());
          requestSave();
          refreshContextTags();
        }
      }
    }
  });

  // 钱包金额保存（滑出面板）
  document.getElementById('wechat-wallet-save-slide')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-wallet-input-slide');
    const amount = input?.value || '0.00';
    const settings = getSettings();
    settings.walletAmount = amount;
    requestSave();
    updateWalletAmountDisplay();
    document.getElementById('wechat-wallet-panel')?.classList.add('hidden');
  });

  // 支付密码保存
  document.getElementById('wechat-save-password-btn')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-new-password-input');
    const password = input?.value || '';
    // 验证是否为6位数字
    if (!/^\d{6}$/.test(password)) {
      showToast('请输入6位数字密码', 'info');
      return;
    }
    const settings = getSettings();
    settings.paymentPassword = password;
    requestSave();
    showToast('密码已保存', '✓');
    document.getElementById('wechat-change-password-panel')?.classList.add('hidden');
    input.value = '';
  });

  // 密码输入框只允许数字
  document.getElementById('wechat-new-password-input')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  // 总结模板保存
  document.getElementById('wechat-summary-template-save')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-summary-template-input');
    const template = input?.value || '';
    const settings = getSettings();
    settings.customSummaryTemplate = template;
    requestSave();
    showToast('模板已保存', '✓');
    document.getElementById('wechat-summary-template-panel')?.classList.add('hidden');
  });

  // 总结模板恢复默认
  document.getElementById('wechat-summary-template-reset')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-summary-template-input');
    if (input) input.value = '';
    const settings = getSettings();
    settings.customSummaryTemplate = '';
    requestSave();
    showToast('已恢复默认模板', '✓');
  });

  // 总结 API 配置
  document.getElementById('wechat-summary-key-toggle')?.addEventListener('click', () => {
    const input = document.getElementById('wechat-summary-key');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('wechat-summary-fetch-models')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('wechat-summary-status');
    const url = document.getElementById('wechat-summary-url')?.value?.trim();
    const key = document.getElementById('wechat-summary-key')?.value?.trim();
    const modelSelect = document.getElementById('wechat-summary-model');

    if (!url || !key) {
      if (statusEl) statusEl.innerHTML = `${ICON_INFO} 请先填写 URL 和 Key`;
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ 正在获取模型列表...';

    try {
      const models = await fetchModelListFromApi(url, key);
      if (models.length === 0) {
        if (statusEl) statusEl.innerHTML = `${ICON_INFO} 未找到可用模型`;
        return;
      }

      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">-- 选择模型 --</option>' +
          models.map(m => `<option value="${m}">${m}</option>`).join('');
      }

      const settings = getSettings();
      settings.summaryModelList = models;
      requestSave();

      if (statusEl) statusEl.innerHTML = `${ICON_SUCCESS} 获取到 ${models.length} 个模型`;
    } catch (err) {
      console.error('[可乐] 获取模型列表失败:', err);
      if (statusEl) statusEl.textContent = `⚠️ 获取失败: ${err.message}`;
    }
  });

  document.getElementById('wechat-summary-test')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('wechat-summary-status');
    const url = document.getElementById('wechat-summary-url')?.value?.trim();
    const key = document.getElementById('wechat-summary-key')?.value?.trim();
    const model = document.getElementById('wechat-summary-model')?.value;

    if (!url || !key) {
      if (statusEl) statusEl.innerHTML = `${ICON_INFO} 请先填写 URL 和 Key`;
      return;
    }
    if (!model) {
      if (statusEl) statusEl.innerHTML = `${ICON_INFO} 请先选择模型`;
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ 正在测试连接...';

    try {
      const chatUrl = url.replace(/\/+$/, '') + '/chat/completions';
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      if (statusEl) statusEl.innerHTML = `${ICON_SUCCESS} 连接成功！`;
    } catch (err) {
      console.error('[可乐] 测试连接失败:', err);
      if (statusEl) statusEl.textContent = `⚠️ 连接失败: ${err.message}`;
    }
  });

  document.getElementById('wechat-summary-save')?.addEventListener('click', () => {
    const statusEl = document.getElementById('wechat-summary-status');
    const urlInput = document.getElementById('wechat-summary-url');
    const keyInput = document.getElementById('wechat-summary-key');
    const modelSelect = document.getElementById('wechat-summary-model');

    const settings = getSettings();
    settings.summaryApiUrl = urlInput?.value?.trim() || '';
    settings.summaryApiKey = keyInput?.value?.trim() || '';
    settings.summarySelectedModel = modelSelect?.value || '';
    requestSave();

    if (statusEl) statusEl.innerHTML = `${ICON_SUCCESS} 配置已保存`;
    setTimeout(() => document.getElementById('wechat-summary-panel')?.classList.add('hidden'), 1500);
  });

  document.getElementById('wechat-summary-model')?.addEventListener('change', (e) => {
    const settings = getSettings();
    settings.summarySelectedModel = e.target.value;
    requestSave();
  });

  document.getElementById('wechat-summary-execute')?.addEventListener('click', () => {
    executeSummary();
  });

  document.getElementById('wechat-summary-rollback')?.addEventListener('click', () => {
    rollbackSummary();
  });

  document.getElementById('wechat-summary-close')?.addEventListener('click', () => {
    document.getElementById('wechat-summary-panel')?.classList.add('hidden');
  });

  // 总结面板 - 全选/取消全选
// 刷新按钮
  document.getElementById('wechat-summary-refresh')?.addEventListener('click', () => {
    refreshSummaryChatList();
  });

  document.getElementById('wechat-summary-select-all')?.addEventListener('click', () => {
    selectAllSummaryChats(true);
  });

  document.getElementById('wechat-summary-deselect-all')?.addEventListener('click', () => {
    selectAllSummaryChats(false);
  });

  // 发现页面 - 朋友圈点击
  document.getElementById('wechat-discover-moments')?.addEventListener('click', () => {
    openMomentsPage();
  });

  // 服务页面 - 服务项点击
  document.querySelectorAll('.wechat-service-item').forEach(item => {
    item.addEventListener('click', () => {
      const service = item.dataset.service;
      // 关闭其他面板
      const allPanels = ['wechat-context-panel', 'wechat-wallet-panel', 'wechat-summary-panel', 'wechat-history-panel', 'wechat-logs-panel', 'wechat-meme-stickers-panel', 'wechat-change-password-panel', 'wechat-summary-template-panel'];

      if (service === 'summary') {
        allPanels.filter(p => p !== 'wechat-summary-panel').forEach(p => document.getElementById(p)?.classList.add('hidden'));
        const panel = document.getElementById('wechat-summary-panel');
        const isHidden = panel?.classList.contains('hidden');
        panel?.classList.toggle('hidden');
        if (isHidden) {
          refreshSummaryChatList();
        }
        return;
      }

      if (service === 'history') {
        allPanels.filter(p => p !== 'wechat-history-panel').forEach(p => document.getElementById(p)?.classList.add('hidden'));
        const panel = document.getElementById('wechat-history-panel');
        const isHidden = panel?.classList.contains('hidden');
        panel?.classList.toggle('hidden');
        if (isHidden) {
          refreshHistoryList('all');
        }
        return;
      }

      if (service === 'logs') {
        allPanels.filter(p => p !== 'wechat-logs-panel').forEach(p => document.getElementById(p)?.classList.add('hidden'));
        const panel = document.getElementById('wechat-logs-panel');
        const isHidden = panel?.classList.contains('hidden');
        panel?.classList.toggle('hidden');
        if (isHidden) {
          refreshLogsList();
        }
        return;
      }

      if (service === 'meme-stickers') {
        allPanels.filter(p => p !== 'wechat-meme-stickers-panel').forEach(p => document.getElementById(p)?.classList.add('hidden'));
        const panel = document.getElementById('wechat-meme-stickers-panel');
        panel?.classList.toggle('hidden');
        return;
      }

      if (service === 'change-password') {
        allPanels.filter(p => p !== 'wechat-change-password-panel').forEach(p => document.getElementById(p)?.classList.add('hidden'));
        const panel = document.getElementById('wechat-change-password-panel');
        panel?.classList.toggle('hidden');
        return;
      }

      if (service === 'summary-template') {
        allPanels.filter(p => p !== 'wechat-summary-template-panel').forEach(p => document.getElementById(p)?.classList.add('hidden'));
        const panel = document.getElementById('wechat-summary-template-panel');
        panel?.classList.toggle('hidden');
        return;
      }

      const label = item.querySelector('span')?.textContent || '该';
      showToast(`"${label}" 功能开发中...`, 'info');
    });
  });

  // 收藏页面 - 添加按钮根据当前标签显示不同功能
  document.getElementById('wechat-favorites-add-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();

    // 获取当前选中的标签
    const activeTab = document.querySelector('.wechat-favorites-tab.active');
    const currentFilter = activeTab?.dataset.tab || 'all';

    // 根据标签执行不同操作
    if (currentFilter === 'user') {
      // 用户标签：直接弹出添加用户设定
      showAddPersonaPanel();
      return;
    }

    if (currentFilter === 'character') {
      // 角色卡标签：显示导入选项
      let menu = document.getElementById('wechat-favorites-add-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'wechat-favorites-add-menu';
        menu.className = 'wechat-dropdown-menu';
        menu.style.cssText = 'position: absolute; top: 45px; right: 10px; z-index: 100;';
        document.getElementById('wechat-favorites-page')?.appendChild(menu);
      }
      menu.innerHTML = `
        <div class="wechat-dropdown-item" id="wechat-add-menu-import-png">
          <span><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>
          <span>导入 PNG</span>
        </div>
        <div class="wechat-dropdown-item" id="wechat-add-menu-import-json">
          <span><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>
          <span>导入 JSON</span>
        </div>
      `;
      menu.classList.remove('hidden');

      menu.querySelector('#wechat-add-menu-import-png')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        document.getElementById('wechat-file-png')?.click();
      });
      menu.querySelector('#wechat-add-menu-import-json')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        document.getElementById('wechat-file-json')?.click();
      });

      // 点击其他地方关闭菜单
      const closeMenu = (ev) => {
        if (!ev.target.closest('#wechat-favorites-add-menu') && !ev.target.closest('#wechat-favorites-add-btn')) {
          menu.classList.add('hidden');
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
      return;
    }

    if (currentFilter === 'lorebook') {
      // 世界书标签：直接弹出添加世界书
      showAddLorebookPanel();
      return;
    }

    // 全部标签：显示完整菜单
    let menu = document.getElementById('wechat-favorites-add-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'wechat-favorites-add-menu';
      menu.className = 'wechat-dropdown-menu';
      menu.style.cssText = 'position: absolute; top: 45px; right: 10px; z-index: 100;';
      document.getElementById('wechat-favorites-page')?.appendChild(menu);
    }
    menu.innerHTML = `
      <div class="wechat-dropdown-item" id="wechat-add-menu-persona">
        <span><svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>
        <span>添加用户设定</span>
      </div>
      <div class="wechat-dropdown-item" id="wechat-add-menu-import-png">
        <span><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>
        <span>导入 PNG</span>
      </div>
      <div class="wechat-dropdown-item" id="wechat-add-menu-import-json">
        <span><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>
        <span>导入 JSON</span>
      </div>
      <div class="wechat-dropdown-item" id="wechat-add-menu-lorebook">
        <span><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>
        <span>添加世界书</span>
      </div>
    `;
    menu.classList.remove('hidden');

    menu.querySelector('#wechat-add-menu-lorebook')?.addEventListener('click', () => {
      menu.classList.add('hidden');
      showAddLorebookPanel();
    });
    menu.querySelector('#wechat-add-menu-persona')?.addEventListener('click', () => {
      menu.classList.add('hidden');
      showAddPersonaPanel();
    });
    menu.querySelector('#wechat-add-menu-import-png')?.addEventListener('click', () => {
      menu.classList.add('hidden');
      document.getElementById('wechat-file-png')?.click();
    });
    menu.querySelector('#wechat-add-menu-import-json')?.addEventListener('click', () => {
      menu.classList.add('hidden');
      document.getElementById('wechat-file-json')?.click();
    });

    // 点击其他地方关闭菜单
    const closeMenu = (ev) => {
      if (!ev.target.closest('#wechat-favorites-add-menu') && !ev.target.closest('#wechat-favorites-add-btn')) {
        menu.classList.add('hidden');
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  });

  document.getElementById('wechat-lorebook-cancel')?.addEventListener('click', () => {
    document.getElementById('wechat-lorebook-modal')?.classList.add('hidden');
  });

  document.querySelectorAll('.wechat-favorites-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.wechat-favorites-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      refreshFavoritesList(this.dataset.tab);
    });
  });

  // 清空联系人
  document.getElementById('wechat-clear-contacts')?.addEventListener('click', () => {
    if (!confirm('确定要清空所有联系人吗？')) return;
    const settings = getSettings();
    settings.contacts = [];
    requestSave();
    refreshContactsList();
    showToast('已清空所有联系人');
  });

  // 用户头像更换
  document.getElementById('wechat-me-avatar')?.addEventListener('click', () => {
    document.getElementById('wechat-user-avatar-input')?.click();
  });

  document.getElementById('wechat-user-avatar-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = function (event) {
        const settings = getSettings();
        settings.userAvatar = event.target.result;
        requestSave();
        updateMePageInfo();
        showToast('头像已更换');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[可乐] 更换头像失败:', err);
      showToast('更换头像失败: ' + err.message, '⚠️');
    }

    e.target.value = '';
  });

  // API 配置：密钥可见性
  document.getElementById('wechat-toggle-key-visibility')?.addEventListener('click', () => {
    const keyInput = document.getElementById('wechat-api-key');
    const eyeBtn = document.getElementById('wechat-toggle-key-visibility');
    if (!keyInput || !eyeBtn) return;

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
    const apiUrl = document.getElementById('wechat-api-url')?.value.trim() || '';
    const apiKey = document.getElementById('wechat-api-key')?.value.trim() || '';
    const selectedModel = document.getElementById('wechat-model-select')?.value || '';

    const settings = getSettings();
    settings.apiUrl = apiUrl;
    settings.apiKey = apiKey;
    settings.selectedModel = selectedModel;
    requestSave();

    showToast('API 配置已保存');
  });

  // 刷新模型列表
  document.getElementById('wechat-refresh-models')?.addEventListener('click', () => {
    refreshModelSelect();
  });

  // 模型选择变化（支持手动输入和从列表选择）
  const modelInput = document.getElementById('wechat-model-select');
  if (modelInput) {
    modelInput.addEventListener('change', (e) => {
      const settings = getSettings();
      settings.selectedModel = e.target.value.trim();
      requestSave();
    });
    modelInput.addEventListener('input', (e) => {
      const settings = getSettings();
      settings.selectedModel = e.target.value.trim();
      requestSave();
    });
  }

  // 测试 API 连接
  document.getElementById('wechat-test-api')?.addEventListener('click', async () => {
    const apiUrl = document.getElementById('wechat-api-url')?.value.trim() || '';
    const apiKey = document.getElementById('wechat-api-key')?.value.trim() || '';

    if (!apiUrl) {
      showToast('请先填写 API 地址', 'info');
      return;
    }

    const testBtn = document.getElementById('wechat-test-api');
    const originalText = testBtn?.textContent;
    if (testBtn) {
      testBtn.textContent = '测试中...';
      testBtn.disabled = true;
    }

    try {
      await fetchModelListFromApi(apiUrl, apiKey);
      showToast('连接成功');
    } catch (err) {
      showToast('连接失败：' + err.message, '⚠️');
    } finally {
      if (testBtn) {
        testBtn.textContent = originalText;
        testBtn.disabled = false;
      }
    }
  });

  // 自己填模型按钮 - 单聊
  document.getElementById('wechat-manual-model')?.addEventListener('click', () => {
    const modelName = prompt('请输入模型名称：');
    if (modelName && modelName.trim()) {
      const select = document.getElementById('wechat-model-select');
      if (select) {
        // 添加一个新选项并选中
        const option = document.createElement('option');
        option.value = modelName.trim();
        option.textContent = modelName.trim();
        option.selected = true;
        select.appendChild(option);

        const settings = getSettings();
        settings.selectedModel = modelName.trim();
        requestSave();
        showToast('模型已设置');
      }
    }
  });

  // ===== 群聊 API 配置事件 =====
  // 群聊密钥可见性
  document.getElementById('wechat-toggle-group-key-visibility')?.addEventListener('click', () => {
    const keyInput = document.getElementById('wechat-group-api-key');
    const eyeBtn = document.getElementById('wechat-toggle-group-key-visibility');
    if (!keyInput || !eyeBtn) return;

    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
    } else {
      keyInput.type = 'password';
      eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
    }
  });

  // 群聊获取模型列表
  document.getElementById('wechat-group-refresh-models')?.addEventListener('click', async () => {
    const settings = getSettings();
    const apiUrl = document.getElementById('wechat-group-api-url')?.value?.trim() || settings.groupApiUrl || '';
    const apiKey = document.getElementById('wechat-group-api-key')?.value?.trim() || settings.groupApiKey || '';
    const refreshBtn = document.getElementById('wechat-group-refresh-models');
    const select = document.getElementById('wechat-group-model-select');

    if (!apiUrl) {
      showToast('请先填写群聊 API 地址', 'info');
      return;
    }

    const originalText = refreshBtn?.textContent;
    if (refreshBtn) {
      refreshBtn.textContent = '加载中...';
      refreshBtn.disabled = true;
    }

    try {
      const modelIds = await fetchModelListFromApi(apiUrl, apiKey);

      // 更新 select 选项
      if (select) {
        select.innerHTML = '<option value="">-- 选择模型 --</option>' +
          modelIds.map(id => `<option value="${id}">${id}</option>`).join('');
      }

      settings.groupModelList = modelIds;
      requestSave();
      showToast(`获取到 ${modelIds.length} 个模型`);
    } catch (err) {
      console.error('[可乐] 获取群聊模型列表失败:', err);
      showToast('获取失败，请手动输入模型名', '⚠️');
    } finally {
      if (refreshBtn) {
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
      }
    }
  });

  // 群聊自己填模型
  document.getElementById('wechat-group-manual-model')?.addEventListener('click', () => {
    const modelName = prompt('请输入群聊模型名称：');
    if (modelName && modelName.trim()) {
      const select = document.getElementById('wechat-group-model-select');
      if (select) {
        // 添加一个新选项并选中
        const option = document.createElement('option');
        option.value = modelName.trim();
        option.textContent = modelName.trim();
        option.selected = true;
        select.appendChild(option);

        const settings = getSettings();
        settings.groupSelectedModel = modelName.trim();
        requestSave();
        showToast('群聊模型已设置');
      }
    }
  });

  // 群聊测试连接
  document.getElementById('wechat-group-test-api')?.addEventListener('click', async () => {
    const apiUrl = document.getElementById('wechat-group-api-url')?.value.trim() || '';
    const apiKey = document.getElementById('wechat-group-api-key')?.value.trim() || '';

    if (!apiUrl) {
      showToast('请先填写群聊 API 地址', 'info');
      return;
    }

    const testBtn = document.getElementById('wechat-group-test-api');
    const originalText = testBtn?.textContent;
    if (testBtn) {
      testBtn.textContent = '测试中...';
      testBtn.disabled = true;
    }

    try {
      await fetchModelListFromApi(apiUrl, apiKey);
      showToast('群聊 API 连接成功');
    } catch (err) {
      showToast('连接失败：' + err.message, '⚠️');
    } finally {
      if (testBtn) {
        testBtn.textContent = originalText;
        testBtn.disabled = false;
      }
    }
  });

  // 保存群聊 API 配置
  document.getElementById('wechat-group-save-api')?.addEventListener('click', () => {
    const apiUrl = document.getElementById('wechat-group-api-url')?.value.trim() || '';
    const apiKey = document.getElementById('wechat-group-api-key')?.value.trim() || '';
    const selectedModel = document.getElementById('wechat-group-model-select')?.value || '';

    const settings = getSettings();
    settings.groupApiUrl = apiUrl;
    settings.groupApiKey = apiKey;
    settings.groupSelectedModel = selectedModel;
    requestSave();

    showToast('群聊 API 配置已保存');
  });

  // 群聊模型选择变化
  const groupModelInput = document.getElementById('wechat-group-model-select');
  if (groupModelInput) {
    groupModelInput.addEventListener('change', (e) => {
      const settings = getSettings();
      settings.groupSelectedModel = e.target.value.trim();
      requestSave();
    });
    groupModelInput.addEventListener('input', (e) => {
      const settings = getSettings();
      settings.groupSelectedModel = e.target.value.trim();
      requestSave();
    });
  }

  // 总结 API - 自己填模型
  document.getElementById('wechat-summary-manual-model')?.addEventListener('click', () => {
    const modelName = prompt('请输入总结模型名称：');
    if (modelName && modelName.trim()) {
      const select = document.getElementById('wechat-summary-model');
      if (select) {
        // 添加一个新选项并选中
        const option = document.createElement('option');
        option.value = modelName.trim();
        option.textContent = modelName.trim();
        option.selected = true;
        select.appendChild(option);

        const settings = getSettings();
        settings.summarySelectedModel = modelName.trim();
        requestSave();
        showToast('总结模型已设置');
      }
    }
  });

  // ===== 历史回顾面板事件 =====
  document.getElementById('wechat-history-close')?.addEventListener('click', () => {
    document.getElementById('wechat-history-panel')?.classList.add('hidden');
  });

  // 历史回顾标签切换
  document.querySelectorAll('.wechat-history-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.wechat-history-tab').forEach(t => {
        t.classList.remove('active', 'wechat-btn-primary');
      });
      tab.classList.add('active', 'wechat-btn-primary');
      refreshHistoryList(tab.dataset.tab);
    });
  });

  // ===== 日志面板事件 =====
  document.getElementById('wechat-logs-close')?.addEventListener('click', () => {
    document.getElementById('wechat-logs-panel')?.classList.add('hidden');
  });

  document.getElementById('wechat-logs-clear')?.addEventListener('click', () => {
    if (confirm('确定清空所有日志？')) {
      clearErrorLogs();
      refreshLogsList();
      showToast('日志已清空');
    }
  });

  // 绑定联系人点击
  refreshContactsList();
}

function init() {
  loadSettings();
  const settings = getSettings();
  if (seedDefaultUserPersonaFromST(settings)) {
    requestSave();
  }

  const phoneHTML = generatePhoneHTML();
  document.body.insertAdjacentHTML('beforeend', phoneHTML);

  setupPhoneAutoCentering();
  setupPhoneDrag();

  bindEvents();

  // 初始化发送按钮状态
  window.updateSendButtonState?.();

  // 初始化底部导航栏红点
  updateTabBadge();

  restoreModelSelect();
  restoreGroupModelSelect();

  // 同步上下文面板初始 UI
  syncContextEnabledUI(settings.contextEnabled);
  refreshContextTags();
  updateWalletAmountDisplay();

  if (settings.autoInjectPrompt) {
    injectAuthorNote();
  }

  setupMessageObserver();
  addExtensionButton();

  // 初始化错误捕获
  initErrorCapture();

  // 初始化页面卸载保存
  setupUnloadSave();

  setInterval(() => {
    const phone = document.getElementById('wechat-phone');
    if (!phone || phone.classList.contains('hidden')) return;
    const timeEl = document.querySelector('.wechat-statusbar-time');
    if (timeEl) timeEl.textContent = getCurrentTime();
  }, 60000);

  // 首次可见时居中
  centerPhoneInViewport({ force: true });

  console.log('✅ 可乐不加冰 已加载');
}

if (typeof jQuery === 'function') {
  jQuery(() => setTimeout(init, 500));
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500), { once: true });
}

