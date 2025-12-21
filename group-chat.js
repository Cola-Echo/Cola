/**
 * 群聊功能
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { getSettings, SUMMARY_MARKER_PREFIX, getUserStickers, parseMemeTag, MEME_PROMPT_TEMPLATE, splitAIMessages } from './config.js';
import { showToast } from './toast.js';
import { escapeHtml, sleep, formatMessageTime, calculateVoiceDuration, bindImageLoadFallback } from './utils.js';
import { getUserAvatarHTML, refreshChatList, getUserPersonaFromST } from './ui.js';
import { getSTChatContext, HAKIMI_HEADER } from './ai.js';
import { playMusic as kugouPlayMusic } from './music.js';

// 当前群聊的索引
export let currentGroupChatIndex = -1;

// 替换消息中的占位符
const GROUP_CHAT_HISTORY_LIMIT = 300;
const GROUP_CHAT_SUMMARY_REMINDER_THRESHOLD = 300; // 达到此条数时提醒总结
const GROUP_CHAT_PERSONA_PREAMBLE_ENABLED = true;
const GROUP_CHAT_PERSONA_PREAMBLE_MAX_CHARS = 60000; // 用户设定最大字符数（模型支持128K上下文）
const GROUP_CHAT_DEBUG = false;
// 群聊上限：最多 3 个独立 AI + 1 个用户（合计 4）
const GROUP_CHAT_MAX_AI_MEMBERS = 3;

// 检查群聊记录是否需要总结提醒
function checkGroupSummaryReminder(groupChat) {
  if (!groupChat || !groupChat.chatHistory) return;
  const count = groupChat.chatHistory.length;
  if (count >= GROUP_CHAT_SUMMARY_REMINDER_THRESHOLD) {
    showToast(`群聊记录已达${count}条，建议总结`, '⚠️', 4000);
  }
}

// 解析用户表情包 token -> URL
function resolveUserStickerUrl(token, settings) {
  if (settings.userStickersEnabled === false) return null;
  const stickers = getUserStickers(settings);
  if (stickers.length === 0) return null;

  const raw = (token || '').toString().trim();
  if (!raw) return null;

  // 序号匹配
  if (/^\d+$/.test(raw)) {
    const index = parseInt(raw, 10) - 1;
    return stickers[index]?.url || null;
  }

  // 名称匹配
  const key = raw.toLowerCase();
  const byName = stickers.find(s => (s?.name || '').toLowerCase() === key);
  if (byName?.url) return byName.url;

  // 模糊匹配
  const fuzzy = stickers.find(s => {
    const name = (s?.name || '').toLowerCase();
    return name && (name.includes(key) || key.includes(name));
  });
  return fuzzy?.url || null;
}

function isEnabledFlag(value) {
  return value !== false && value !== 'false';
}

function getEnabledUserPersonas(settings) {
  const personas = Array.isArray(settings?.userPersonas) ? settings.userPersonas : [];
  // 如果用户在插件里显式维护了 userPersonas，则严格遵循其 enabled 开关
  if (personas.length > 0) {
    return personas.filter(p => p && isEnabledFlag(p.enabled));
  }

  const stPersona = getUserPersonaFromST();
  const content = stPersona?.description?.trim();
  if (!content) return [];

  return [{
    name: (stPersona?.name || '').trim() || '用户设定',
    content,
    enabled: true,
    addedTime: '',
    source: 'sillytavern',
  }];
}

function buildUserPersonaBlock(settings) {
  const enabledPersonas = getEnabledUserPersonas(settings);
  if (enabledPersonas.length === 0) return '';

  let text = `【用户设定】\n`;
  enabledPersonas.forEach(persona => {
    const name = (persona?.name || '').trim();
    const content = (persona?.content || '').trim();
    if (name) text += `[${name}]\n`;
    if (content) text += `${replacePromptPlaceholders(content)}\n`;
  });
  return text.trim();
}

function isDisabledTrueFlag(value) {
  return value === true || value === 'true';
}

function isLorebookEnabled(lorebook) {
  if (!lorebook) return false;
  if (!isEnabledFlag(lorebook.enabled)) return false;
  if (isDisabledTrueFlag(lorebook.disable)) return false;
  return true;
}

function isLorebookEntryEnabled(entry) {
  if (!entry) return false;
  if (!isEnabledFlag(entry.enabled)) return false;
  if (isDisabledTrueFlag(entry.disable)) return false;
  return true;
}

function findCharacterLorebookForMember(member, settings) {
  const selectedLorebooks = Array.isArray(settings?.selectedLorebooks) ? settings.selectedLorebooks : [];
  const rawData = member?.rawData || {};
  const charData = rawData.data || rawData;
  const charName = (charData?.name || member?.name || '').trim();

  return selectedLorebooks.find(lb => {
    if (!lb?.fromCharacter) return false;
    if (member?.id && lb.characterId && lb.characterId === member.id) return true;
    if (charName && lb.characterName && lb.characterName === charName) return true;
    if (charName && lb.name && lb.name === charName) return true;
    return false;
  }) || null;
}

function buildMemberCharacterBookBlock(member, settings) {
  const rawData = member?.rawData || {};
  const charData = rawData.data || rawData;
  const charName = (charData?.name || member?.name || '').trim();

  const contents = [];

  // 优先：使用 selectedLorebooks 里同步的“角色世界书”，以便严格遵循启用/关闭开关
  const characterLorebook = findCharacterLorebookForMember(member, settings);
  if (characterLorebook) {
    // 若该角色世界书被关闭，则完全不注入（避免“关了还生效”）
    if (!isLorebookEnabled(characterLorebook)) return '';

    (characterLorebook.entries || []).forEach(entry => {
      if (!entry?.content) return;
      if (!isLorebookEntryEnabled(entry)) return;
      contents.push(entry.content);
    });
  }

  // 回退：如果没找到同步世界书/或条目为空，则尝试从 rawData.character_book 读取（同样遵循 entry 开关）
  if (contents.length === 0) {
    const bookEntries = Array.isArray(charData?.character_book?.entries) ? charData.character_book.entries : [];
    bookEntries.forEach(entry => {
      if (!entry?.content) return;
      if (!isLorebookEntryEnabled(entry)) return;
      contents.push(entry.content);
    });
  }

  const uniqueContents = Array.from(new Set(contents.map(c => (c || '').trim()).filter(Boolean)));
  if (uniqueContents.length === 0) return '';

  const title = charName || member?.name || '角色';
  let text = `【${title}专属世界书】\n`;
  uniqueContents.forEach(content => {
    text += `- ${replacePromptPlaceholders(content)}\n`;
  });
  return text.trim();
}

function buildGlobalLorebookBlock(settings) {
  const selectedLorebooks = Array.isArray(settings?.selectedLorebooks) ? settings.selectedLorebooks : [];
  const contents = [];

  selectedLorebooks.forEach(lb => {
    if (!lb || lb.fromCharacter) return;
    if (!isLorebookEnabled(lb)) return;
    (lb.entries || []).forEach(entry => {
      if (!entry?.content) return;
      if (!isLorebookEntryEnabled(entry)) return;
      contents.push(entry.content);
    });
  });

  const uniqueContents = Array.from(new Set(contents.map(c => (c || '').trim()).filter(Boolean)));
  if (uniqueContents.length === 0) return '';

  let text = `【共享世界观】\n`;
  uniqueContents.forEach(content => {
    text += `- ${replacePromptPlaceholders(content)}\n`;
  });
  return text.trim();
}

function buildUserPersonaPreamble(settings, member = null) {
  const personaBlock = buildUserPersonaBlock(settings);
  const characterBookBlock = member ? buildMemberCharacterBookBlock(member, settings) : '';
  const globalLorebookBlock = buildGlobalLorebookBlock(settings);
  if (!personaBlock && !characterBookBlock && !globalLorebookBlock) return '';

  const blocks = [];
  if (personaBlock) blocks.push(personaBlock);
  if (characterBookBlock) blocks.push(characterBookBlock);
  if (globalLorebookBlock) blocks.push(globalLorebookBlock);

  let preamble = `（以下为长期设定/背景信息，不是本轮发言；请在回复时始终遵守）\n${blocks.join('\n\n')}`;
  if (preamble.length > GROUP_CHAT_PERSONA_PREAMBLE_MAX_CHARS) {
    preamble = preamble.slice(0, GROUP_CHAT_PERSONA_PREAMBLE_MAX_CHARS).trimEnd() + '\n（用户设定过长，已截断）';
  }
  return preamble;
}

export function enforceGroupChatMemberLimit(groupChat, { toast = false } = {}) {
  const memberIds = Array.isArray(groupChat?.memberIds) ? groupChat.memberIds.filter(Boolean) : [];
  if (memberIds.length <= GROUP_CHAT_MAX_AI_MEMBERS) {
    return { memberIds, wasTrimmed: false, originalCount: memberIds.length };
  }

  const trimmed = memberIds.slice(0, GROUP_CHAT_MAX_AI_MEMBERS);
  groupChat.memberIds = trimmed;
  saveSettingsDebounced();

  if (toast) {
    showToast(`群聊最多 ${GROUP_CHAT_MAX_AI_MEMBERS} 个成员（+你=4），已自动裁剪`, '⚠️');
  }

  return { memberIds: trimmed, wasTrimmed: true, originalCount: memberIds.length };
}

function getGroupChatHistoryForApi(chatHistory, maxMessages = GROUP_CHAT_HISTORY_LIMIT) {
  const history = Array.isArray(chatHistory) ? chatHistory : [];
  const filtered = history.filter(msg => {
    if (!msg) return false;
    if (msg.isMarker) return false;
    const content = msg.content || '';
    if (typeof content === 'string' && content.startsWith(SUMMARY_MARKER_PREFIX)) return false;
    return msg.role === 'user' || msg.role === 'assistant';
  });
  return filtered.slice(-maxMessages);
}

function replaceMessagePlaceholders(content) {
  if (!content) return content;
  const context = getContext();
  const userName = context?.name1 || 'User';
  // 替换 {{user}} 占位符（不区分大小写）
  return content.replace(/\{\{user\}\}/gi, userName);
}

// 替换用户设定和世界书中的占位符（包括 {{user}}）
function replacePromptPlaceholders(content) {
  if (!content) return content;
  const context = getContext();
  const settings = getSettings();

  let result = content;

  // 替换 {{user}} - 优先使用插件内的用户设定名称，否则使用酒馆的 name1
  const enabledPersonas = getEnabledUserPersonas(settings);
  const personaName = (enabledPersonas.find(p => (p?.name || '').trim())?.name || '').trim();
  // 如果有启用的用户设定且有名称，使用第一个的名称；否则用酒馆的 name1
  const userName = personaName || (context?.name1 || 'User');

  result = result.replace(/\{\{user\}\}/gi, userName);

  // 替换 {{char}} - 当前角色名（在调用处处理）
  // 这里只处理通用占位符

  return result;
}

// 设置当前群聊索引
export function setCurrentGroupChatIndex(index) {
  currentGroupChatIndex = index;
}

// 显示群聊创建弹窗
export function showGroupCreateModal() {
  const settings = getSettings();
  const contacts = settings.contacts || [];

  if (contacts.length < 2) {
    showToast('至少需要2个联系人才能创建群聊', '⚠️');
    return;
  }

  // 填充联系人列表
  const listContainer = document.getElementById('wechat-group-contacts-list');
  if (listContainer) {
    listContainer.innerHTML = contacts.map((contact, index) => {
      const firstChar = contact.name ? contact.name.charAt(0) : '?';
      const avatarHtml = contact.avatar
        ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
        : firstChar;

      // 获取角色的独立API配置（如果有的话）
      const hasCustomApi = contact.useCustomApi || false;
      const customApiUrl = contact.customApiUrl || '';
      const customApiKey = contact.customApiKey || '';
      const customModel = contact.customModel || '';
      const customHakimi = contact.customHakimiBreakLimit || false;

      return `
        <div class="wechat-group-contact-item" data-contact-id="${contact.id}" data-index="${index}" style="margin-bottom: 4px;">
          <div class="wechat-group-contact-row" style="display: flex; align-items: center; padding: 10px; cursor: pointer; border-radius: 6px; background: var(--wechat-bg-secondary);">
            <div style="width: 20px; height: 20px; margin-right: 10px;">
              <input type="checkbox" class="wechat-group-contact-check" data-contact-id="${contact.id}" style="width: 18px; height: 18px; cursor: pointer;">
            </div>
            <div style="width: 40px; height: 40px; border-radius: 6px; overflow: hidden; background: var(--wechat-bg-tertiary, #3a3a3a); display: flex; align-items: center; justify-content: center; font-size: 16px; margin-right: 10px;">
              ${avatarHtml}
            </div>
            <div style="flex: 1; font-size: 14px;">${escapeHtml(contact.name)}</div>
            <div class="wechat-group-api-toggle" style="font-size: 12px; color: var(--wechat-text-secondary); padding: 4px 8px;">
              ${hasCustomApi ? '⚙️' : '▼'}
            </div>
          </div>
          <div class="wechat-group-contact-api-config hidden" data-contact-id="${contact.id}" style="padding: 12px; margin-top: 4px; background: var(--wechat-bg-tertiary, #2a2a2a); border-radius: 6px;">
            <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 10px;">为 ${escapeHtml(contact.name)} 配置独立API（可选）</div>
            <div style="margin-bottom: 8px;">
              <input type="text" class="wechat-settings-input wechat-group-api-url" placeholder="API 地址" value="${escapeHtml(customApiUrl)}" style="width: 100%; box-sizing: border-box; font-size: 12px;">
            </div>
            <div style="margin-bottom: 8px;">
              <input type="password" class="wechat-settings-input wechat-group-api-key" placeholder="API 密钥" value="${escapeHtml(customApiKey)}" style="width: 100%; box-sizing: border-box; font-size: 12px;">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
              <select class="wechat-settings-input wechat-settings-select wechat-group-model" style="flex: 1; font-size: 12px;">
                <option value="">-- 选择模型 --</option>
                ${customModel ? `<option value="${escapeHtml(customModel)}" selected>${escapeHtml(customModel)}</option>` : ''}
              </select>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary wechat-group-fetch-model" style="font-size: 11px; padding: 4px 8px;">获取</button>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--wechat-border);">
              <div style="font-size: 12px;">
                <span style="color: #1e90ff;">哈基米破限</span>
                <span style="color: var(--wechat-text-secondary); font-size: 10px; margin-left: 4px;">解除输出限制</span>
              </div>
              <div class="wechat-switch wechat-group-hakimi-toggle ${customHakimi ? 'on' : ''}" style="transform: scale(0.8);"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    listContainer.querySelectorAll('.wechat-group-contact-item').forEach(item => {
      const row = item.querySelector('.wechat-group-contact-row');
      const checkbox = item.querySelector('input[type="checkbox"]');
      const apiConfig = item.querySelector('.wechat-group-contact-api-config');
      const apiToggle = item.querySelector('.wechat-group-api-toggle');

      // 点击勾选框只切换选中状态
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedCount = document.querySelectorAll('.wechat-group-contact-check:checked').length;
        if (checkbox.checked && selectedCount > GROUP_CHAT_MAX_AI_MEMBERS) {
          checkbox.checked = false;
          showToast(`群聊最多只能选择 ${GROUP_CHAT_MAX_AI_MEMBERS} 个成员（+你=4）`, '⚠️');
        }
        updateSelectedCount();
      });

      // 点击行的其他位置展开/收起API配置
      row.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;

        // 先关闭其他展开的配置
        listContainer.querySelectorAll('.wechat-group-contact-api-config').forEach(config => {
          if (config !== apiConfig) {
            config.classList.add('hidden');
            const otherToggle = config.parentElement.querySelector('.wechat-group-api-toggle');
            if (otherToggle && !otherToggle.textContent.includes('⚙️')) {
              otherToggle.textContent = '▼';
            }
          }
        });

        // 切换当前配置的显示状态
        apiConfig.classList.toggle('hidden');
        if (!apiConfig.classList.contains('hidden')) {
          apiToggle.textContent = '▲';
        } else {
          const contactId = item.dataset.contactId;
          const contact = settings.contacts.find(c => c.id === contactId);
          apiToggle.textContent = contact?.useCustomApi ? '⚙️' : '▼';
        }
      });

      // 获取模型按钮
      const fetchBtn = item.querySelector('.wechat-group-fetch-model');
      fetchBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const urlInput = item.querySelector('.wechat-group-api-url');
        const keyInput = item.querySelector('.wechat-group-api-key');
        const modelSelect = item.querySelector('.wechat-group-model');
        const apiUrl = urlInput?.value?.trim();
        const apiKey = keyInput?.value?.trim();

        if (!apiUrl) {
          showToast('请先填写API地址', '🧊');
          return;
        }

        fetchBtn.textContent = '...';
        fetchBtn.disabled = true;

        try {
          const { fetchModelListFromApi } = await import('./ai.js');
          const models = await fetchModelListFromApi(apiUrl, apiKey);
          if (models.length > 0) {
            // 填充下拉列表
            const currentValue = modelSelect.value;
            modelSelect.innerHTML = '<option value="">-- 选择模型 --</option>' +
              models.map(m => `<option value="${m}" ${m === currentValue ? 'selected' : ''}>${m}</option>`).join('');
            showToast(`获取到 ${models.length} 个模型`);
          } else {
            showToast('未找到可用模型', '🧊');
          }
        } catch (err) {
          console.error('[可乐] 获取模型失败:', err);
          showToast('获取失败，请手动输入', '⚠️');
        } finally {
          fetchBtn.textContent = '获取';
          fetchBtn.disabled = false;
        }
      });

      // 当API配置变化时，自动保存到联系人
      const saveApiConfig = () => {
        const contactId = item.dataset.contactId;
        const contact = settings.contacts.find(c => c.id === contactId);
        if (!contact) return;

        const urlInput = item.querySelector('.wechat-group-api-url');
        const keyInput = item.querySelector('.wechat-group-api-key');
        const modelSelect = item.querySelector('.wechat-group-model');

        contact.customApiUrl = urlInput?.value?.trim() || '';
        contact.customApiKey = keyInput?.value?.trim() || '';
        contact.customModel = modelSelect?.value?.trim() || '';
        contact.useCustomApi = !!(contact.customApiUrl && contact.customModel);

        // 更新图标
        apiToggle.textContent = contact.useCustomApi ? '⚙️' : '▼';

        saveSettingsDebounced();
      };

      item.querySelector('.wechat-group-api-url')?.addEventListener('change', saveApiConfig);
      item.querySelector('.wechat-group-api-key')?.addEventListener('change', saveApiConfig);
      item.querySelector('.wechat-group-model')?.addEventListener('change', saveApiConfig);

      // 哈基米破限开关
      const hakimiToggle = item.querySelector('.wechat-group-hakimi-toggle');
      hakimiToggle?.addEventListener('click', () => {
        const contactId = item.dataset.contactId;
        const contact = settings.contacts.find(c => c.id === contactId);
        if (!contact) return;

        hakimiToggle.classList.toggle('on');
        contact.customHakimiBreakLimit = hakimiToggle.classList.contains('on');
        saveSettingsDebounced();
      });
    });
  }

  // 清空群名输入
  const nameInput = document.getElementById('wechat-group-name');
  if (nameInput) nameInput.value = '';

  // 重置选中计数
  updateSelectedCount();

  // 显示弹窗
  document.getElementById('wechat-group-create-modal')?.classList.remove('hidden');
}

// 更新选中人数
function updateSelectedCount() {
  const allCheckboxes = Array.from(document.querySelectorAll('.wechat-group-contact-check'));
  const count = allCheckboxes.filter(cb => cb.checked).length;
  const countEl = document.getElementById('wechat-group-selected-count');
  const confirmBtn = document.getElementById('wechat-group-create-confirm');

  if (countEl) countEl.textContent = `${count}/${GROUP_CHAT_MAX_AI_MEMBERS}`;
  if (confirmBtn) confirmBtn.disabled = count < 2 || count > GROUP_CHAT_MAX_AI_MEMBERS;

  // 达到上限后，禁用未选中的勾选框（防止继续选择）
  allCheckboxes.forEach(cb => {
    if (!cb.checked) {
      cb.disabled = count >= GROUP_CHAT_MAX_AI_MEMBERS;
    }
  });
}

// 关闭群聊创建弹窗
export function closeGroupCreateModal() {
  document.getElementById('wechat-group-create-modal')?.classList.add('hidden');
}

// 创建群聊
export function createGroupChat() {
  const settings = getSettings();

  // 获取选中的联系人
  const checkboxes = document.querySelectorAll('.wechat-group-contact-check:checked');
  const memberIds = Array.from(checkboxes).map(cb => cb.dataset.contactId);

  if (memberIds.length < 2) {
    showToast('请至少选择2个成员', '⚠️');
    return;
  }

  if (memberIds.length > GROUP_CHAT_MAX_AI_MEMBERS) {
    showToast(`群聊最多只能选择 ${GROUP_CHAT_MAX_AI_MEMBERS} 个成员（+你=4）`, '⚠️');
    return;
  }

  // 群聊必须全部使用独立 API（每个成员一个独立后端）
  const invalidMembers = memberIds
    .map(id => settings.contacts.find(c => c.id === id))
    .filter(c => !c || !c.useCustomApi || !c.customApiUrl || !c.customModel);

  if (invalidMembers.length > 0) {
    const names = invalidMembers.map(c => c?.name || '未知').join('、');
    showToast(`以下成员未配置独立API：${names}`, '⚠️');
    return;
  }

  // 获取群名
  let groupName = document.getElementById('wechat-group-name')?.value?.trim();

  // 如果没有输入群名，使用成员名称
  if (!groupName) {
    const memberNames = memberIds.map(id => {
      const contact = settings.contacts.find(c => c.id === id);
      return contact?.name || '未知';
    });
    groupName = memberNames.slice(0, 3).join('、');
    if (memberNames.length > 3) groupName += '...';
  }

  // 创建群聊对象
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  const groupChat = {
    id: 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    name: groupName,
    memberIds: memberIds,
    chatHistory: [],
    lastMessage: '',
    lastMessageTime: Date.now(),
    createdTime: timeStr
  };

  // 添加到群聊列表
  if (!settings.groupChats) settings.groupChats = [];
  settings.groupChats.push(groupChat);

  saveSettingsDebounced();
  refreshChatList();
  closeGroupCreateModal();

  showToast(`群聊"${groupName}"创建成功`);

  // 打开新创建的群聊
  const groupIndex = settings.groupChats.length - 1;
  openGroupChat(groupIndex);
}

// 打开群聊界面
export function openGroupChat(groupIndex) {
  console.log('[可乐] openGroupChat 被调用, groupIndex:', groupIndex);
  const settings = getSettings();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  currentGroupChatIndex = groupIndex;

  // 获取成员信息
  const { memberIds } = enforceGroupChatMemberLimit(groupChat, { toast: true });
  const members = memberIds.map(id =>
    settings.contacts.find(c => c.id === id)
  ).filter(Boolean);

  document.getElementById('wechat-main-content')?.classList.add('hidden');
  document.getElementById('wechat-chat-page')?.classList.remove('hidden');
  document.getElementById('wechat-chat-title').textContent = `群聊(${members.length + 1})`;

  const messagesContainer = document.getElementById('wechat-chat-messages');
  const chatHistory = groupChat.chatHistory || [];

  if (chatHistory.length === 0) {
    messagesContainer.innerHTML = '';
  } else {
    messagesContainer.innerHTML = renderGroupChatHistory(groupChat, members, chatHistory);
    bindGroupVoiceBubbleEvents(messagesContainer);
    bindGroupPhotoBubbleEvents(messagesContainer);
    bindGroupMusicCardEvents(messagesContainer);
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 标记当前是群聊模式
  messagesContainer.dataset.isGroup = 'true';
  messagesContainer.dataset.groupIndex = groupIndex;
  console.log('[可乐] 群聊标记已设置:', { isGroup: messagesContainer.dataset.isGroup, groupIndex: messagesContainer.dataset.groupIndex });
}

// 渲染群聊历史
function renderGroupChatHistory(groupChat, members, chatHistory) {
  let html = '';
  let lastTimestamp = 0;
  const TIME_GAP_THRESHOLD = 5 * 60 * 1000;

  chatHistory.forEach((msg, index) => {
    const msgTimestamp = msg.timestamp || new Date(msg.time).getTime() || 0;

    // 时间戳显示
    if (index === 0 || (msgTimestamp - lastTimestamp > TIME_GAP_THRESHOLD)) {
      const timeLabel = formatMessageTime(msgTimestamp);
      if (timeLabel) {
        html += `<div class="wechat-msg-time">${timeLabel}</div>`;
      }
    }
    lastTimestamp = msgTimestamp;

    // 检查是否是总结标记消息（和单聊逻辑一致）
    if (msg.isMarker || msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
      const markerText = msg.content || '可乐已加冰';
      html += `<div class="wechat-msg-time">${escapeHtml(markerText)}</div>`;
      return;
    }

    const isVoice = msg.isVoice === true;
    const isSticker = msg.isSticker === true;
    const isPhoto = msg.isPhoto === true;
    const isMusic = msg.isMusic === true;

    if (msg.role === 'user') {
      // 用户消息
      let bubbleContent;
      if (isSticker) {
        bubbleContent = `<div class="wechat-sticker-bubble"><img src="${msg.content}" alt="表情" class="wechat-sticker-img"></div>`;
      } else if (isPhoto) {
        const photoId = 'photo_' + Math.random().toString(36).substring(2, 9);
        bubbleContent = `
          <div class="wechat-photo-bubble" data-photo-id="${photoId}">
            <div class="wechat-photo-content" id="${photoId}-content">${escapeHtml(msg.content)}</div>
            <div class="wechat-photo-blur" id="${photoId}-blur">
              <div class="wechat-photo-icon">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1.5 16H7.5L6 4z"/><path d="M6 4c0-1 1-2 6-2s6 1 6 2"/><path d="M9 8h6"/><circle cx="15" cy="6" r="0.5" fill="currentColor"/><circle cx="11" cy="7" r="0.5" fill="currentColor"/></svg>
              </div>
              <span class="wechat-photo-hint">点击查看</span>
            </div>
          </div>
        `;
      } else if (isVoice) {
        bubbleContent = generateGroupVoiceBubbleStatic(msg.content, true);
      } else if (isMusic && msg.musicInfo) {
        // 音乐卡片
        bubbleContent = generateGroupMusicCardStatic(msg.musicInfo);
      } else {
        const processedContent = parseMemeTag(msg.content);
        const hasMeme = processedContent !== msg.content;
        bubbleContent = `<div class="wechat-message-bubble">${hasMeme ? processedContent : escapeHtml(msg.content)}</div>`;
      }

      html += `
        <div class="wechat-message self">
          <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
          <div class="wechat-message-content">${bubbleContent}</div>
        </div>
      `;
    } else {
      // 角色消息
      // 优先通过角色ID匹配（群聊里 name 可能重复/变更），找不到再回退到 name
      const member = (msg.characterId && members.find(m => m.id === msg.characterId))
        || members.find(m => m.name === msg.characterName);
      const charName = member?.name || msg.characterName || '未知';
      const firstChar = charName.charAt(0);
      const avatarContent = member?.avatar
        ? `<img src="${member.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
        : firstChar;

      let bubbleContent;
      if (isSticker) {
        bubbleContent = `<div class="wechat-sticker-bubble"><img src="${msg.content}" alt="表情" class="wechat-sticker-img"></div>`;
      } else if (isPhoto) {
        const photoId = 'photo_' + Math.random().toString(36).substring(2, 9);
        bubbleContent = `
          <div class="wechat-photo-bubble" data-photo-id="${photoId}">
            <div class="wechat-photo-content" id="${photoId}-content">${escapeHtml(msg.content)}</div>
            <div class="wechat-photo-blur" id="${photoId}-blur">
              <div class="wechat-photo-icon">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1.5 16H7.5L6 4z"/><path d="M6 4c0-1 1-2 6-2s6 1 6 2"/><path d="M9 8h6"/><circle cx="15" cy="6" r="0.5" fill="currentColor"/><circle cx="11" cy="7" r="0.5" fill="currentColor"/></svg>
              </div>
              <span class="wechat-photo-hint">点击查看</span>
            </div>
          </div>
        `;
      } else if (isVoice) {
        bubbleContent = generateGroupVoiceBubbleStatic(msg.content, false);
      } else if (isMusic && msg.musicInfo) {
        // 音乐卡片
        bubbleContent = generateGroupMusicCardStatic(msg.musicInfo);
      } else {
        const processedContent = parseMemeTag(msg.content);
        const hasMeme = processedContent !== msg.content;
        bubbleContent = `<div class="wechat-message-bubble">${hasMeme ? processedContent : escapeHtml(msg.content)}</div>`;
      }

      html += `
        <div class="wechat-message wechat-message-group">
          <div class="wechat-message-avatar">${avatarContent}</div>
          <div class="wechat-message-content">
            <div class="wechat-message-sender" style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 2px;">${escapeHtml(charName)}</div>
            ${bubbleContent}
          </div>
        </div>
      `;
    }
  });

  return html;
}

// 生成群聊静态语音气泡
function generateGroupVoiceBubbleStatic(content, isSelf) {
  const seconds = calculateVoiceDuration(content);
  const width = Math.min(50 + seconds * 3, 180);
  const voiceId = 'voice_' + Math.random().toString(36).substring(2, 9);
  // 用户消息波形朝右，角色消息波形朝左
  const wavesSvg = isSelf
    ? `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 12h2v4H3zM7 8h2v8H7zm4 4h2v6h-2zm4-6h2v10h-2z" fill="currentColor"/></svg>`
    : `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 12h2v4h-2zm-4-4h2v8h-2zm-4 4h2v6h-2zm-4-6h2v10H7z" fill="currentColor"/></svg>`;

  // 用户消息：波形在左，秒数在右
  // 角色消息：秒数在左，波形在右
  const bubbleInner = isSelf
    ? `<span class="wechat-voice-waves">${wavesSvg}</span><span class="wechat-voice-duration">${seconds}</span>`
    : `<span class="wechat-voice-duration">${seconds}</span><span class="wechat-voice-waves">${wavesSvg}</span>`;

  return `
    <div class="wechat-voice-bubble ${isSelf ? 'self' : ''}" style="width: ${width}px" data-voice-id="${voiceId}">
      ${bubbleInner}
    </div>
    <div class="wechat-voice-text hidden" id="${voiceId}">${escapeHtml(content)}</div>
  `;
}

// 生成群聊静态音乐卡片（用于历史消息渲染）
function generateGroupMusicCardStatic(musicInfo) {
  const name = musicInfo?.name || '未知歌曲';
  const artist = musicInfo?.artist || '未知歌手';
  const cover = musicInfo?.cover || '';
  const platform = musicInfo?.platform || '';
  const songId = musicInfo?.id || '';

  const platformName = platform === 'netease' ? '网易云音乐' :
                       platform === 'qq' ? 'QQ音乐' :
                       platform === 'kuwo' ? '酷我音乐' : '音乐';

  const cardId = 'music_card_' + Math.random().toString(36).substring(2, 9);

  return `
    <div class="wechat-music-card" id="${cardId}" data-song-id="${escapeHtml(songId)}" data-platform="${escapeHtml(platform)}" data-name="${escapeHtml(name)}" data-artist="${escapeHtml(artist)}" data-cover="${escapeHtml(cover)}">
      <div class="wechat-music-card-cover">
        <img src="${cover}" alt="" onerror="this.style.display='none'">
      </div>
      <div class="wechat-music-card-info">
        <div class="wechat-music-card-name">${escapeHtml(name)}</div>
        <div class="wechat-music-card-artist">${escapeHtml(artist)}</div>
      </div>
      <div class="wechat-music-card-play">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="6,4 20,12 6,20"/></svg>
      </div>
    </div>
    <div class="wechat-music-card-footer">${escapeHtml(platformName)}</div>
  `;
}

// 绑定群聊语音气泡点击事件
function bindGroupVoiceBubbleEvents(container) {
  const voiceBubbles = container.querySelectorAll('.wechat-voice-bubble:not([data-bound])');
  voiceBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');
    bubble.addEventListener('click', () => {
      const voiceId = bubble.dataset.voiceId;
      const textEl = document.getElementById(voiceId);
      if (textEl) {
        textEl.classList.toggle('hidden');
      }
    });
  });
}

// 绑定群聊照片气泡点击事件（toggle切换蒙层）
function bindGroupPhotoBubbleEvents(container) {
  const photoBubbles = container.querySelectorAll('.wechat-photo-bubble:not([data-bound])');
  photoBubbles.forEach(bubble => {
    bubble.setAttribute('data-bound', 'true');
    bubble.addEventListener('click', () => {
      const photoId = bubble.dataset.photoId;
      const blurEl = document.getElementById(`${photoId}-blur`);
      if (blurEl) {
        blurEl.classList.toggle('hidden');
      }
    });
  });
}

// 绑定群聊音乐卡片点击事件
function bindGroupMusicCardEvents(container) {
  const musicCards = container.querySelectorAll('.wechat-music-card:not([data-bound])');
  musicCards.forEach(card => {
    card.setAttribute('data-bound', 'true');
    card.addEventListener('click', function() {
      const id = this.dataset.songId;
      const plat = this.dataset.platform;
      const n = this.dataset.name;
      const a = this.dataset.artist;
      if (id && plat) {
        kugouPlayMusic(id, plat, n, a);
      }
    });
  });
}

// 追加群聊消息到界面
export function appendGroupMessage(role, content, characterName, characterId, isVoice = false, isSticker = false) {
  const settings = getSettings();
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');

  if (role === 'user') {
    messageDiv.className = 'wechat-message self';

    let bubbleContent;
    if (isSticker) {
      bubbleContent = `<div class="wechat-sticker-bubble"><img src="${content}" alt="表情" class="wechat-sticker-img"></div>`;
    } else if (isVoice) {
      const seconds = calculateVoiceDuration(content);
      const width = Math.min(50 + seconds * 3, 180);
      const voiceId = 'voice_' + Math.random().toString(36).substring(2, 9);
      // 用户消息：波形在左，秒数在右
      bubbleContent = `
        <div class="wechat-voice-bubble self" style="width: ${width}px" data-voice-id="${voiceId}">
          <span class="wechat-voice-waves"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 12h2v4H3zM7 8h2v8H7zm4 4h2v6h-2zm4-6h2v10h-2z" fill="currentColor"/></svg></span>
          <span class="wechat-voice-duration">${seconds}</span>
        </div>
        <div class="wechat-voice-text hidden" id="${voiceId}">${escapeHtml(content)}</div>
      `;
    } else {
      const processedContent = parseMemeTag(content);
      const hasMeme = processedContent !== content;
      bubbleContent = `<div class="wechat-message-bubble">${hasMeme ? processedContent : escapeHtml(content)}</div>`;
    }

    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
      <div class="wechat-message-content">${bubbleContent}</div>
    `;
  } else {
    // 角色消息
    messageDiv.className = 'wechat-message wechat-message-group';

    // 优先用角色ID匹配（群聊里 name 可能重复/变更），找不到再回退到 name
    const member = (characterId && settings.contacts.find(c => c.id === characterId))
      || settings.contacts.find(c => c.name === characterName);

    const charName = member?.name || characterName || '未知';

    if (GROUP_CHAT_DEBUG) {
      console.log('[可乐] appendGroupMessage:', { characterName, characterId, resolvedName: member?.name });
    }

    const firstChar = charName.charAt(0);
    const avatarContent = member?.avatar
      ? `<img src="${member.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar;

    let bubbleContent;
    if (isSticker) {
      bubbleContent = `<div class="wechat-sticker-bubble"><img src="${content}" alt="表情" class="wechat-sticker-img"></div>`;
    } else if (isVoice) {
      const seconds = calculateVoiceDuration(content);
      const width = Math.min(50 + seconds * 3, 180);
      const voiceId = 'voice_' + Math.random().toString(36).substring(2, 9);
      // 角色消息：秒数在左，波形在右
      bubbleContent = `
        <div class="wechat-voice-bubble" style="width: ${width}px" data-voice-id="${voiceId}">
          <span class="wechat-voice-duration">${seconds}</span>
          <span class="wechat-voice-waves"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 12h2v4h-2zm-4-4h2v8h-2zm-4 4h2v6h-2zm-4-6h2v10H7z" fill="currentColor"/></svg></span>
        </div>
        <div class="wechat-voice-text hidden" id="${voiceId}">${escapeHtml(content)}</div>
      `;
    } else {
      const processedContent = parseMemeTag(content);
      const hasMeme = processedContent !== content;
      bubbleContent = `<div class="wechat-message-bubble">${hasMeme ? processedContent : escapeHtml(content)}</div>`;
    }

    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${avatarContent}</div>
      <div class="wechat-message-content">
        <div class="wechat-message-sender" style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 2px;">${escapeHtml(charName)}</div>
        ${bubbleContent}
      </div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  if (isVoice) {
    bindGroupVoiceBubbleEvents(messagesContainer);
  }
}

// 追加群聊音乐卡片消息到界面
export function appendGroupMusicCardMessage(role, song) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : 'wechat-message-group'}`;

  const name = song?.name || '未知歌曲';
  const artist = song?.artist || '未知歌手';
  const cover = song?.cover || '';
  const platform = song?.platform || '';
  const songId = song?.id || '';

  const platformName = platform === 'netease' ? '网易云音乐' :
                       platform === 'qq' ? 'QQ音乐' :
                       platform === 'kuwo' ? '酷我音乐' : '音乐';

  const cardId = 'music_card_' + Math.random().toString(36).substring(2, 9);

  const musicCardHTML = `
    <div class="wechat-music-card" id="${cardId}" data-song-id="${escapeHtml(songId)}" data-platform="${escapeHtml(platform)}" data-name="${escapeHtml(name)}" data-artist="${escapeHtml(artist)}" data-cover="${escapeHtml(cover)}">
      <div class="wechat-music-card-cover">
        <img src="${cover}" alt="" onerror="this.style.display='none'">
      </div>
      <div class="wechat-music-card-info">
        <div class="wechat-music-card-name">${escapeHtml(name)}</div>
        <div class="wechat-music-card-artist">${escapeHtml(artist)}</div>
      </div>
      <div class="wechat-music-card-play">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="6,4 20,12 6,20"/></svg>
      </div>
    </div>
    <div class="wechat-music-card-footer">${escapeHtml(platformName)}</div>
  `;

  if (role === 'user') {
    messageDiv.innerHTML = `
      <div class="wechat-message-avatar">${getUserAvatarHTML()}</div>
      <div class="wechat-message-content">${musicCardHTML}</div>
    `;
  } else {
    messageDiv.innerHTML = `
      <div class="wechat-message-avatar"></div>
      <div class="wechat-message-content">${musicCardHTML}</div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定音乐卡片点击事件
  const card = document.getElementById(cardId);
  if (card) {
    card.addEventListener('click', function() {
      const id = this.dataset.songId;
      const plat = this.dataset.platform;
      const n = this.dataset.name;
      const a = this.dataset.artist;
      if (id && plat) {
        kugouPlayMusic(id, plat, n, a);
      }
    });
  }
}

// 显示群聊打字指示器
export function showGroupTypingIndicator(characterName, characterId = null) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  hideGroupTypingIndicator();

  const settings = getSettings();
  const member = (characterId && settings.contacts.find(c => c.id === characterId))
    || settings.contacts.find(c => c.name === characterName);

  const displayName = member?.name || characterName || '群成员';
  const firstChar = displayName?.charAt(0) || '?';
  const avatarContent = member?.avatar
    ? `<img src="${member.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
    : firstChar;

  const typingDiv = document.createElement('div');
  typingDiv.className = 'wechat-message wechat-typing-wrapper wechat-message-group';
  typingDiv.id = 'wechat-group-typing-indicator';

  typingDiv.innerHTML = `
      <div class="wechat-message-avatar">${avatarContent}</div>
      <div class="wechat-message-content">
      <div class="wechat-message-sender" style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 2px;">${escapeHtml(displayName)}</div>
      <div class="wechat-message-bubble wechat-typing">
        <span class="wechat-typing-dot"></span>
        <span class="wechat-typing-dot"></span>
        <span class="wechat-typing-dot"></span>
      </div>
    </div>
  `;

  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 隐藏群聊打字指示器
export function hideGroupTypingIndicator() {
  const indicator = document.getElementById('wechat-group-typing-indicator');
  if (indicator) indicator.remove();
}

// 构建群聊系统提示词
export function buildGroupSystemPrompt(groupChat, members, silentCharacters = []) {
  const settings = getSettings();

  let systemPrompt = '';

  // 哈基米破限（使用全局设置）
  if (settings.hakimiBreakLimit) {
    // 优先使用自定义破限词
    systemPrompt += settings.hakimiCustomPrompt || HAKIMI_HEADER;
  }

  // 酒馆上下文
  const contextLevel = settings.contextLevel ?? 5;
  const stContext = getSTChatContext(contextLevel);
  if (stContext) {
    systemPrompt += stContext + '\n';
  }

  // 用户设定
  const personaBlock = buildUserPersonaBlock(settings);
  if (personaBlock) {
    systemPrompt += personaBlock + '\n\n';
  }

  // ========== 采用和单聊一样的简单逻辑 ==========
  // 全局世界书（只读取 fromCharacter: false 的，角色书直接从 charData.character_book 读取）
  const globalLorebookEntries = [];
  const selectedLorebooks = settings.selectedLorebooks || [];

  selectedLorebooks.forEach(lb => {
    // 检查世界书是否启用
    if (lb.enabled === false || lb.enabled === 'false') return;
    // 跳过角色卡自带的世界书（下面会直接从每个角色的 charData.character_book 读取）
    if (lb.fromCharacter) return;

    // 只读取全局世界书
    (lb.entries || []).forEach(entry => {
      if (entry.enabled !== false && entry.enabled !== 'false' && entry.disable !== true && entry.content) {
        globalLorebookEntries.push(entry.content);
      }
    });
  });

  if (globalLorebookEntries.length > 0) {
    systemPrompt += `【共享世界观】\n`;
    globalLorebookEntries.forEach(content => {
      // 替换世界书中的 {{user}} 占位符
      systemPrompt += `- ${replacePromptPlaceholders(content)}\n`;
    });
    systemPrompt += '\n';
  }

  // 群聊成员信息（每个角色带自己的角色书）
  systemPrompt += `【群聊成员】\n`;
  systemPrompt += `这是一个包含 ${members.length} 位角色的群聊。每个角色只能使用自己的设定，不能使用其他角色的设定。\n\n`;

  members.forEach((member, idx) => {
    const rawData = member.rawData || {};
    const charData = rawData.data || rawData;
    const charName = charData.name || member.name;

    systemPrompt += `=== 角色 ${idx + 1}: ${charName} ===\n`;
    // 替换角色描述和性格中的 {{user}} 占位符
    if (charData.description) systemPrompt += `描述：${replacePromptPlaceholders(charData.description)}\n`;
    if (charData.personality) systemPrompt += `性格：${replacePromptPlaceholders(charData.personality)}\n`;

    // 直接从角色卡数据读取角色书（和单聊一样的逻辑）
    if (charData.character_book?.entries?.length > 0) {
      const enabledEntries = charData.character_book.entries.filter(entry =>
        entry.enabled !== false && entry.disable !== true
      );
      if (enabledEntries.length > 0) {
        systemPrompt += `[${charName}专属设定 - 仅该角色可用]\n`;
        enabledEntries.forEach(entry => {
          // 替换角色书中的 {{user}} 占位符
          if (entry.content) systemPrompt += `  · ${replacePromptPlaceholders(entry.content)}\n`;
        });
      }
    }
    systemPrompt += '\n';
  });

  // 保底机制：标注沉默太久的角色
  if (silentCharacters.length > 0) {
    systemPrompt += `【保底提醒】\n`;
    systemPrompt += `以下角色已经沉默太久（连续4次用户发言都没有回复），本次回复中必须包含他们的发言：\n`;
    silentCharacters.forEach(name => {
      systemPrompt += `- ${name}\n`;
    });
    systemPrompt += '\n';
  }

  // 群聊专用提示词（优先使用用户自定义，否则使用内置模板）
  if (settings.groupAutoInjectPrompt) {
    const groupPrompt = settings.userGroupAuthorNote || settings.groupAuthorNote;
    if (groupPrompt) {
      systemPrompt += groupPrompt + '\n\n';
    }
  }

  // 用户表情包功能（仅在启用时添加）
  const userStickers = getUserStickers(settings);
  if (settings.userStickersEnabled !== false && userStickers.length > 0) {
    systemPrompt += `【表情包功能】
群成员们有 ${userStickers.length} 个共享表情包可以使用！
发送格式（任选其一）：
- [角色名]: [表情:序号]（序号从1开始）
- [角色名]: [表情:表情包名称]（推荐：从列表复制名称，避免数错）

可用表情包列表：
${userStickers.map((s, i) => `  ${i + 1}. ${s.name || '表情' + (i + 1)}`).join('\n')}

使用建议：
- 根据表情包名称选择合适的表情
- 适当时候发送表情包，让聊天更生动
- 表情包必须单独一条消息发送
- 发送格式示例：[角色A]: [表情:1] 或 [角色A]: [表情:${userStickers[0]?.name || '表情1'}]

`;
  }

  // Meme 表情包提示词（如果启用）
  if (settings.memeStickersEnabled) {
    systemPrompt += '\n\n' + MEME_PROMPT_TEMPLATE;
  }

  return systemPrompt;
}

// 构建群聊消息列表
export function buildGroupMessages(groupChat, members, userMessage, silentCharacters = []) {
  const systemPrompt = buildGroupSystemPrompt(groupChat, members, silentCharacters);
  const chatHistory = groupChat.chatHistory || [];

  const messages = [{ role: 'system', content: systemPrompt }];

  // 添加历史消息
  const recentHistory = chatHistory.slice(-300);
  recentHistory.forEach(msg => {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else {
      const formattedContent = msg.characterName
        ? `[${msg.characterName}]: ${msg.content}`
        : msg.content;
      messages.push({ role: 'assistant', content: formattedContent });
    }
  });

  messages.push({ role: 'user', content: userMessage });

  return messages;
}

// 解析群聊 AI 回复
export function parseGroupResponse(response, members) {
  const results = [];
  const settings = getSettings();
  const memeRegex = /<\s*meme\s*>\s*[\u4e00-\u9fa5]*?[a-zA-Z0-9]+?\.(?:jpg|jpeg|png|gif)\s*<\s*\/\s*meme\s*>/gi;

  // 按 ||| 分隔多条消息
  const parts = response.split('|||').map(p => p.trim()).filter(p => p);

  // 辅助函数：分割内容中的 meme 标签
  const splitContentByMeme = (content) => {
    const memeMatches = content.match(memeRegex);
    if (!memeMatches) return [content];

    const contentParts = [];
    let remaining = content;
    for (const meme of memeMatches) {
      const memeIndex = remaining.indexOf(meme);
      if (memeIndex > 0) {
        const before = remaining.substring(0, memeIndex).trim();
        if (before) contentParts.push(before);
      }
      contentParts.push(meme);
      remaining = remaining.substring(memeIndex + meme.length);
    }
    remaining = remaining.trim();
    if (remaining) contentParts.push(remaining);
    return contentParts.filter(p => p);
  };

  parts.forEach(part => {
    // 匹配 [角色名]: 内容 格式
    const match = part.match(/^\[(.+?)\][:：]\s*(.+)$/s);

    if (match) {
      const charName = match[1].trim();
      let content = match[2].trim();

      // 查找对应的联系人（更宽松的匹配）
      const member = members.find(m => {
        const memberName = m.name?.trim().toLowerCase();
        const rawName = m.rawData?.data?.name?.trim().toLowerCase();
        const rawName2 = m.rawData?.name?.trim().toLowerCase();
        const searchName = charName.trim().toLowerCase();

        return memberName === searchName ||
               rawName === searchName ||
               rawName2 === searchName ||
               memberName?.includes(searchName) ||
               searchName.includes(memberName);
      });

      const characterId = member?.id || null;
      const characterName = member?.name || charName;

      // 检查内容是否包含 meme 标签与其他文字混合
      const contentParts = splitContentByMeme(content);

      for (const contentPart of contentParts) {
        let finalContent = contentPart;
        let isVoice = false;
        let isSticker = false;
        let stickerUrl = null;

        // 检查是否是语音消息
        const voiceMatch = finalContent.match(/^\[语音[:：]\s*(.+?)\]$/);
        if (voiceMatch) {
          finalContent = voiceMatch[1];
          isVoice = true;
        }

        // 检查是否是表情包消息 [表情:序号] / [表情:名称]
        const stickerMatch = finalContent.match(/^\[表情[:：]\s*(.+?)\]$/);
        if (stickerMatch) {
          const token = (stickerMatch[1] || '').trim();
          stickerUrl = resolveUserStickerUrl(token, settings);
          if (stickerUrl) {
            finalContent = stickerUrl;
            isSticker = true;
          }
        }

        results.push({
          characterId,
          characterName,
          content: finalContent,
          isVoice,
          isSticker
        });
      }
    } else {
      // 无法解析格式时，尝试作为第一个角色的消息
      if (members.length > 0) {
        // 同样检查 meme 分割
        const contentParts = splitContentByMeme(part);
        for (const contentPart of contentParts) {
          results.push({
            characterId: members[0].id,
            characterName: members[0].name,
            content: contentPart,
            isVoice: false,
            isSticker: false
          });
        }
      }
    }
  });

  return results;
}

// 调用单个角色的 AI（必须使用角色独立 API 配置）
async function callSingleCharacterAI(member, groupChat, members, userMessage, silentCharacters = [], currentRoundResponses = []) {
  const settings = getSettings();

  // 必须使用角色独立配置，不再回退到群聊/单聊API
  if (!member.useCustomApi || !member.customApiUrl || !member.customModel) {
    throw new Error(`角色「${member.name}」未配置独立API，无法参与群聊`);
  }

  const apiUrl = member.customApiUrl;
  const apiKey = member.customApiKey || '';
  const apiModel = member.customModel;

  // 构建针对单个角色的系统提示词
  const systemPrompt = buildSingleCharacterPrompt(member, groupChat, members, silentCharacters);

  const messages = [{ role: 'system', content: systemPrompt }];

  // 添加历史消息（限长：避免 system/用户设定被挤掉）
  const chatHistory = getGroupChatHistoryForApi(groupChat.chatHistory);
  chatHistory.forEach(msg => {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
      return;
    }

    // 关键：只把“本角色自己”的历史作为 assistant，其它角色的发言作为 user 注入，
    // 否则模型会误以为“自己（assistant）曾经说过别人的台词”，极易串台/口吻漂移。
    const isSelfAssistant = (msg.characterId && msg.characterId === member.id) ||
      (!msg.characterId && msg.characterName === member.name);

    if (isSelfAssistant) {
      messages.push({ role: 'assistant', content: msg.content });
      return;
    }

    const formattedContent = msg.characterName
      ? `[${msg.characterName}]: ${msg.content}`
      : msg.content;
    messages.push({ role: 'user', content: formattedContent });
  });

  // 关键兼容：把“用户设定/世界书 + 本轮用户消息 + 当前轮已产生的群友回复”合并到同一条（最后一条）user 消息里，
  // 避免部分后端只取最后一条 user 导致后续角色丢失设定/世界书。
  const userMessageParts = [];

  if (GROUP_CHAT_PERSONA_PREAMBLE_ENABLED) {
    const personaPreamble = buildUserPersonaPreamble(settings, member);
    if (personaPreamble) userMessageParts.push(personaPreamble);
  }

  userMessageParts.push(userMessage);

  if (currentRoundResponses.length > 0) {
    const otherRoundResponses = currentRoundResponses.filter(r => r.characterId !== member.id);
    if (otherRoundResponses.length > 0) {
      const roundContent = otherRoundResponses
        .slice(-30)
        .map((r, idx) => `${idx + 1}. [${r.characterName}]: ${r.content}`)
        .join('\n');

      userMessageParts.push(`【其他群成员刚才的回复】
${roundContent}

（现在轮到你 ${member.name} 发言）
【重要】你的回复会和上面的消息交错显示！
- 你的第1条消息会显示在别人第1条后面
- 你的第2条消息会显示在别人第2条后面
- 以此类推...
所以请按顺序回应：先回应第1条，再回应第2条...确保交错后语义通顺。
如果某条不需要回应，可以跳过或用简短回应（如"嗯"）占位。`);
    }
  }

  const finalUserMessage = userMessageParts.filter(Boolean).join('\n\n');
  messages.push({ role: 'user', content: finalUserMessage });

  const chatUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: apiModel,
      messages,
      temperature: 1,
      max_tokens: 8196
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errorText.substring(0, 100)}`);
  }

  const data = await response.json();
  let rawResponse = data.choices?.[0]?.message?.content || '';

  // 获取所有其他角色的名字（用于过滤串台）
  const otherMemberNames = members.filter(m => m.id !== member.id).map(m => m.name);

  // 清理响应，移除可能的角色名前缀（包括自己的）
  rawResponse = rawResponse.replace(/^\[.+?\][:：]\s*/s, '').trim();

  // 辅助函数：检查内容是否属于其他角色
  const isOtherCharacterContent = (text) => {
    for (const name of otherMemberNames) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 检查是否以其他角色名开头
      if (text.startsWith(`[${name}]`) ||
          text.match(new RegExp(`^\\[${escapedName}\\][:：]`)) ||
          text.startsWith(`${name}:`) ||
          text.startsWith(`${name}：`)) {
        return true;
      }
    }
    return false;
  };

  // 辅助函数：清理内容中的角色前缀
  const cleanPrefix = (text) => {
    let cleaned = text.replace(/^\[.+?\][:：]\s*/s, '').trim();
    // 也移除自己名字的前缀
    const selfPattern = new RegExp(`^${member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:：]\\s*`);
    cleaned = cleaned.replace(selfPattern, '').trim();
    return cleaned;
  };

  // 辅助函数：截断到其他角色内容之前
  const truncateAtOtherCharacter = (text) => {
    let result = text;
    for (const name of otherMemberNames) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 检查中间是否有其他角色的发言
      const patterns = [
        new RegExp(`\\s*\\[${escapedName}\\][:：]`),
        new RegExp(`\\s*${escapedName}[:：]`)
      ];
      for (const pattern of patterns) {
        const match = result.match(pattern);
        if (match && match.index > 0) {
          result = result.substring(0, match.index).trim();
        }
      }
    }
    return result;
  };

  // 过滤掉其他角色的内容
  if (rawResponse.includes('|||')) {
    const parts = rawResponse.split('|||').map(p => p.trim()).filter(p => p);
    const filteredParts = [];

    for (const part of parts) {
      // 跳过完全属于其他角色的部分
      if (isOtherCharacterContent(part)) {
        continue;
      }

      // 清理前缀并截断
      let cleaned = cleanPrefix(part);
      cleaned = truncateAtOtherCharacter(cleaned);

      if (cleaned) {
        filteredParts.push(cleaned);
      }
    }

    rawResponse = filteredParts.join('|||');
  } else {
    // 单条消息
    if (isOtherCharacterContent(rawResponse)) {
      rawResponse = '';
    } else {
      rawResponse = cleanPrefix(rawResponse);
      rawResponse = truncateAtOtherCharacter(rawResponse);
    }
  }

  // 检查是否是语音消息
  let isVoice = false;
  const voiceMatch = rawResponse.match(/^\[语音[:：]\s*(.+?)\]$/);
  if (voiceMatch) {
    rawResponse = voiceMatch[1];
    isVoice = true;
  }

  // 如果过滤后为空，生成一个默认回复
  if (!rawResponse || !rawResponse.trim()) {
    // 使用原始响应的第一部分（去掉角色名前缀）
    const originalContent = data.choices?.[0]?.message?.content || '';
    const firstPart = originalContent.split('|||')[0]?.trim() || '';
    const cleanedFirst = firstPart.replace(/^\[.+?\][:：]\s*/s, '').trim();
    if (cleanedFirst && !isOtherCharacterContent(cleanedFirst)) {
      rawResponse = cleanedFirst;
    }
  }

  return {
    characterId: member.id,
    characterName: member.name,
    content: rawResponse,
    isVoice
  };
}

// 构建单角色系统提示词
function buildSingleCharacterPrompt(member, groupChat, members, silentCharacters = []) {
  const settings = getSettings();

  // 调试日志：检查角色数据结构
  const rawData = member.rawData || {};
  const charData = rawData.data || rawData;
  if (GROUP_CHAT_DEBUG) {
    console.log('[可乐] buildSingleCharacterPrompt 角色数据:', {
      memberName: member.name,
      hasRawData: !!member.rawData,
      rawDataKeys: Object.keys(rawData),
      charDataKeys: Object.keys(charData),
      hasCharacterBook: !!charData.character_book,
      characterBookEntriesCount: charData.character_book?.entries?.length || 0,
      characterBookEntries: charData.character_book?.entries?.map(e => ({
        content: e.content?.substring(0, 50),
        enabled: e.enabled,
        disable: e.disable
      }))
    });
  }

  let systemPrompt = '';

  // 哈基米破限
  const useHakimi = member.customHakimiBreakLimit ?? settings.hakimiBreakLimit;
  if (useHakimi) {
    // 优先使用自定义破限词
    systemPrompt += settings.hakimiCustomPrompt || HAKIMI_HEADER;
  }

  // 酒馆上下文
  const contextLevel = settings.contextLevel ?? 5;
  const stContext = getSTChatContext(contextLevel);
  if (stContext) {
    systemPrompt += stContext + '\n';
  }

  // 用户设定：同时放入 system（更强约束）+ user preamble（兼容部分后端忽略 system / 只取最后一条 user）
  const personaBlock = buildUserPersonaBlock(settings);
  if (personaBlock) systemPrompt += personaBlock + '\n\n';

  // 当前角色信息（rawData 和 charData 已在函数开头定义）
  const charName = charData.name || member.name;

  // ========== 采用和单聊一样的简单逻辑 ==========
  // 1. 直接从 charData.character_book 读取角色书（不依赖匹配）
  // 2. 从 selectedLorebooks 只读取全局世界书（跳过 fromCharacter）

  // 全局世界书（非角色卡自带的世界书，供所有角色共享）
  const selectedLorebooks = settings.selectedLorebooks || [];
  const globalLorebookEntries = [];

  selectedLorebooks.forEach(lb => {
    if (!lb || lb.fromCharacter) return;
    if (!isLorebookEnabled(lb)) return;

    (lb.entries || []).forEach(entry => {
      if (!entry?.content) return;
      if (!isLorebookEntryEnabled(entry)) return;
      globalLorebookEntries.push(entry.content);
    });
  });

  if (globalLorebookEntries.length > 0) {
    systemPrompt += `【共享世界观】\n`;
    globalLorebookEntries.forEach(content => {
      // 替换世界书中的 {{user}} 占位符
      systemPrompt += `- ${replacePromptPlaceholders(content)}\n`;
    });
    systemPrompt += '\n';
  }

  systemPrompt += `【你扮演的角色】\n`;
  systemPrompt += `你是 ${charName}。\n`;
  // 替换角色描述和性格中的 {{user}} 占位符
  if (charData.description) systemPrompt += `描述：${replacePromptPlaceholders(charData.description)}\n`;
  if (charData.personality) systemPrompt += `性格：${replacePromptPlaceholders(charData.personality)}\n`;

  // 角色专属世界书：优先使用 selectedLorebooks 的 fromCharacter（尊重启用/关闭开关），回退到 rawData.character_book
  const characterLorebook = findCharacterLorebookForMember(member, settings);
  let characterBookContents = [];
  if (characterLorebook) {
    if (isLorebookEnabled(characterLorebook)) {
      characterBookContents = (characterLorebook.entries || [])
        .filter(entry => entry?.content && isLorebookEntryEnabled(entry))
        .map(entry => entry.content);
    } else {
      characterBookContents = null; // 该角色世界书被关闭：完全不注入
    }
  }

  if (characterBookContents !== null) {
    if (characterBookContents.length === 0 && charData.character_book?.entries?.length > 0) {
      characterBookContents = charData.character_book.entries
        .filter(entry => entry?.content && isLorebookEntryEnabled(entry))
        .map(entry => entry.content);
    }

    const uniqueCharacterEntries = Array.from(new Set(characterBookContents.map(c => (c || '').trim()).filter(Boolean)));
    if (uniqueCharacterEntries.length > 0) {
      systemPrompt += `\n【${charName}专属设定】\n`;
      uniqueCharacterEntries.forEach(content => {
        systemPrompt += `- ${replacePromptPlaceholders(content)}\n`;
      });
    }
  }
  systemPrompt += '\n';

  // 群聊其他成员信息（简略，不包含他们的角色书）
  systemPrompt += `【群聊其他成员】\n`;
  members.forEach(m => {
    if (m.id !== member.id) {
      systemPrompt += `- ${m.name}\n`;
    }
  });
  systemPrompt += '\n';

  // 回复格式 - 类似单聊规则，放宽限制
  systemPrompt += `【回复格式】
你正在微信群聊中，请以 ${member.name} 的身份回复。

规则：
1. 直接输出对话内容，不要加角色名前缀
2. 你可以发送1-2条消息，每条消息之间用 ||| 分隔
3. 每条消息保持简短自然，像真实微信聊天一样（1-3句话为宜）
4. 保持角色性格特点，回复要符合你的人设
5. 可以使用表情符号
6. 必须回复至少一条消息，哪怕只是"嗯"、"哦"、表情符号等简短回应
7. 语音消息格式：[语音:内容]
8. 语音消息必须独立发送，不能和其他消息混在一起

【交错显示机制】
群聊中各角色的消息会交错显示（你的第1条、别人的第1条、你的第2条、别人的第2条...）
所以如果你要回应别人的多条消息，请按对方消息的顺序依次回应，确保交错后对话通顺。

示例（普通多条消息）：
哈哈你说得对|||我也这么觉得

示例（语音消息）：
[语音:哎呀笑死我了你们太搞笑了]

【重要规则】
× 只能以 ${member.name} 的身份说话，禁止代替其他群成员发言
× 不要使用 [角色名]: 格式，直接输出对话内容
× 不要输出空内容，必须回复
√ 可以@其他群成员互动，如"@xxx 你觉得呢"
√ 可以对其他群成员的发言进行回应、吐槽、附和等
`;

  // 保底机制提醒
  if (silentCharacters.includes(member.name)) {
    systemPrompt += `\n【提醒】你已经沉默很久了，这次请务必回复！\n`;
  }

  if (GROUP_CHAT_DEBUG) {
    console.log('[可乐] buildSingleCharacterPrompt 最终提示词:', {
      角色: member.name,
      提示词长度: systemPrompt.length,
      用户设定注入方式: GROUP_CHAT_PERSONA_PREAMBLE_ENABLED ? 'user_role_preamble' : 'system_prompt',
      提示词预览: systemPrompt.substring(0, 500)
    });
  }

  return systemPrompt;
}

// 调用群聊 AI（支持每个角色独立 API）
export async function callGroupAI(groupChat, members, userMessage, silentCharacters = []) {
  const settings = getSettings();

  // 始终使用独立调用模式，为每个角色单独调用AI
  // 使用群聊API来决定发言顺序
  const speakingOrder = await determineSpeakingOrder(groupChat, members, userMessage, silentCharacters);

  // 为每个角色收集消息（用于交错显示）
  const memberMessages = {}; // { memberName: [msg1, msg2, ...] }
  const currentRoundResponses = []; // 当前轮次已产生的回复

  // 后台静默处理所有 AI 响应（不显示 typing 指示器）
  for (const memberName of speakingOrder) {
    const member = members.find(m => m.name === memberName);
    if (!member) continue;

    memberMessages[memberName] = [];

    // 最多重试5次
    const MAX_RETRIES = 5;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 传入当前轮次已有的回复，让后面的角色能看到前面的发言
        const response = await callSingleCharacterAI(member, groupChat, members, userMessage, silentCharacters, currentRoundResponses);

        // 调试日志：检查 AI 返回的角色信息
        if (GROUP_CHAT_DEBUG) {
          console.log('[可乐] callSingleCharacterAI 返回:', {
            expectedMember: memberName,
            returnedId: response.characterId,
            returnedName: response.characterName,
            content: response.content?.substring(0, 50),
            attempt
          });
        }

        // 只有非空响应才添加
        if (response.content && response.content.trim()) {
          // 使用智能分割（处理 ||| 和 meme 标签）
          const parts = splitAIMessages(response.content);
          for (const part of parts) {
            let partContent = part;
            let partIsVoice = false;
            // 检查每个部分是否是语音
            const voiceMatch = part.match(/^\[语音[:：]\s*(.+?)\]$/);
            if (voiceMatch) {
              partContent = voiceMatch[1];
              partIsVoice = true;
            }
            const partResponse = {
              characterId: response.characterId,
              characterName: response.characterName,
              content: partContent,
              isVoice: partIsVoice
            };
            memberMessages[memberName].push(partResponse);
            currentRoundResponses.push(partResponse);
          }
        }

        // 成功，跳出重试循环
        break;
      } catch (err) {
        lastError = err;
        console.error(`[可乐] ${member.name} 的 AI 调用失败 (第${attempt}次):`, err.message);

        if (attempt < MAX_RETRIES) {
          // 等待一段时间后重试（递增延迟）
          const delay = 1000 * attempt; // 1秒, 2秒, 3秒...
          console.log(`[可乐] ${member.name} 将在 ${delay}ms 后重试...`);
          await sleep(delay);
        } else {
          // 5次都失败了，记录错误但继续处理其他角色
          console.error(`[可乐] ${member.name} 的 AI 调用失败，已重试${MAX_RETRIES}次:`, lastError.message);
        }
      }
    }
  }

  // 交错合并各角色的消息：按 speakingOrder 轮询，每次取1条实现自然交错
  const results = [];
  const memberNames = speakingOrder.filter(name => memberMessages[name]?.length > 0);

  const memberIndexes = {};
  memberNames.forEach(name => { memberIndexes[name] = 0; });

  while (true) {
    let pushedAny = false;

    for (const name of memberNames) {
      const msgs = memberMessages[name] || [];
      const idx = memberIndexes[name] || 0;
      if (idx >= msgs.length) continue;

      // 每次只取1条，实现更自然的交错对话
      results.push(msgs[idx]);
      memberIndexes[name] = idx + 1;
      pushedAny = true;
    }

    if (!pushedAny) break;
  }

  // 如果没有任何响应，返回一个默认响应
  if (results.length === 0 && members.length > 0) {
    results.push({
      characterId: members[0].id,
      characterName: members[0].name,
      content: '...',
      isVoice: false
    });
  }

  return results;
}

// 使用群聊API决定发言顺序
async function determineSpeakingOrder(groupChat, members, userMessage, silentCharacters = []) {
  const settings = getSettings();

  // 使用群聊API来决定发言顺序
  const apiUrl = settings.groupApiUrl || settings.apiUrl;
  const apiKey = settings.groupApiKey || settings.apiKey;
  const apiModel = settings.groupSelectedModel || settings.selectedModel;

  // 如果没有配置群聊API，让所有角色都参与（保底角色优先，其他随机排序）
  if (!apiUrl || !apiModel) {
    const order = [];
    // 保底角色优先
    silentCharacters.forEach(name => {
      if (members.find(m => m.name === name)) {
        order.push(name);
      }
    });
    // 其他角色按群成员顺序加入（避免随机打乱）
    const otherMembers = members.filter(m => !silentCharacters.includes(m.name));
    otherMembers.forEach(m => order.push(m.name));
    return order.length > 0 ? order : [members[0]?.name].filter(Boolean);
  }

  try {
    const memberNames = members.map(m => m.name).join('、');
    const silentInfo = silentCharacters.length > 0
      ? `\n注意：${silentCharacters.join('、')} 已经沉默很久了，应该优先让他们发言。`
      : '';

    const orderPrompt = `你是一个群聊发言顺序调度器。
当前群聊成员有：${memberNames}
用户刚才说：${userMessage}${silentInfo}

请根据对话内容判断：
1. 哪些角色应该回复这条消息（不需要所有人都回复）
2. 他们的发言顺序应该是什么（避免抢话，让对话自然流畅）

请直接返回应该发言的角色名列表，用逗号分隔，例如：角色A,角色B
不需要解释，只返回角色名列表。如果没人需要回复，返回第一个角色名。`;

    const chatUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [{ role: 'user', content: orderPrompt }],
        temperature: 1,
        max_tokens: 8196
      })
    });

    if (!response.ok) {
      throw new Error('获取发言顺序失败');
    }

    const data = await response.json();
    const orderText = data.choices?.[0]?.message?.content || '';

    // 解析返回的角色名列表
    const orderedNamesRaw = orderText
      .split(/[,，、\n]/)
      .map(name => name.trim())
      .filter(name => members.find(m => m.name === name));

    // 去重，防止重复调用同一角色
    const orderedNames = [];
    const seen = new Set();
    orderedNamesRaw.forEach(name => {
      if (!seen.has(name)) {
        orderedNames.push(name);
        seen.add(name);
      }
    });

    if (orderedNames.length > 0) {
      // 确保保底角色在列表中（按 silentCharacters 原顺序插到最前）
      const silentToAdd = silentCharacters.filter(name =>
        members.find(m => m.name === name) && !seen.has(name)
      );
      return [...silentToAdd, ...orderedNames];
    }
  } catch (err) {
    console.error('[可乐] 获取发言顺序失败:', err);
  }

  // 如果调用失败，使用默认顺序
  const defaultOrder = [];
  silentCharacters.forEach(name => {
    if (members.find(m => m.name === name)) {
      defaultOrder.push(name);
    }
  });
  if (defaultOrder.length === 0) {
    defaultOrder.push(members[0]?.name);
  }
  return defaultOrder.filter(Boolean);
}

// 计算沉默太久的角色（连续4次用户发言没回复）
function getSilentCharacters(groupChat, members) {
  const chatHistory = groupChat.chatHistory || [];
  const silentCharacters = [];

  // 初始化每个成员的沉默计数
  const silenceCounts = {};
  members.forEach(m => {
    silenceCounts[m.name] = 0;
  });

  // 从历史记录末尾往前数，统计每个角色的沉默次数
  let userMessageCount = 0;
  const respondedInSession = new Set();

  for (let i = chatHistory.length - 1; i >= 0 && userMessageCount < 4; i--) {
    const msg = chatHistory[i];
    if (msg.role === 'user') {
      userMessageCount++;
      // 重置本轮已回复的角色记录
      respondedInSession.clear();
    } else if (msg.role === 'assistant' && msg.characterName) {
      respondedInSession.add(msg.characterName);
    }
  }

  // 再次遍历，统计连续沉默
  userMessageCount = 0;
  for (let i = chatHistory.length - 1; i >= 0 && userMessageCount < 4; i--) {
    const msg = chatHistory[i];
    if (msg.role === 'user') {
      userMessageCount++;
      // 检查这次用户发言之后有没有角色回复
      const respondersAfterThis = new Set();
      for (let j = i + 1; j < chatHistory.length; j++) {
        const nextMsg = chatHistory[j];
        if (nextMsg.role === 'user') break;
        if (nextMsg.role === 'assistant' && nextMsg.characterName) {
          respondersAfterThis.add(nextMsg.characterName);
        }
      }
      // 没回复的角色沉默计数+1
      members.forEach(m => {
        if (!respondersAfterThis.has(m.name)) {
          silenceCounts[m.name]++;
        }
      });
    }
  }

  // 找出沉默>=4次的角色
  members.forEach(m => {
    if (silenceCounts[m.name] >= 4) {
      silentCharacters.push(m.name);
    }
  });

  return silentCharacters;
}

// AI间对话提示词
function buildAIDialoguePrompt(groupChat, members, lastResponses) {
  const lastSpeakers = lastResponses.map(r => r.characterName).join('、');
  const lastMessages = lastResponses.map(r => `[${r.characterName}]: ${r.content}`).join('\n');

  return `【群聊互动（继续聊天）】
刚才 ${lastSpeakers || '群友'} 的发言：
${lastMessages}

请你作为“你自己”（system 中指定的角色）对上面的内容做出自然回应。

规则：
1. 只输出你自己的台词，不要替其他角色发言，不要复述或生成其他角色的台词
2. 不要添加任何角色名前缀（不要写“[角色名]:”/“名字：”）
3. 回复尽量简短自然（1-2 句）；如要连发 1-2 条，用 ||| 分隔
4. 如果觉得无需回应，可以返回空`;
}

// 自动同步群成员的角色卡世界书到 selectedLorebooks
async function syncGroupMembersLorebooks(members, settings) {
  if (!settings.selectedLorebooks) settings.selectedLorebooks = [];

  let hasChanges = false;

  for (const member of members) {
    const rawData = member.rawData || {};
    const charData = rawData.data || rawData;
    const characterBook = charData.character_book;

    if (!characterBook || !characterBook.entries || characterBook.entries.length === 0) {
      continue;
    }

    const charName = charData.name || member.name;
    const lorebookName = characterBook.name || charName;

    // 查找该角色对应的世界书（避免仅按 name 命中全局世界书）
    let existingIdx = -1;
    if (member.id) {
      existingIdx = settings.selectedLorebooks.findIndex(lb => lb?.fromCharacter === true && lb.characterId === member.id);
    }
    if (existingIdx < 0) {
      existingIdx = settings.selectedLorebooks.findIndex(lb => lb?.fromCharacter === true && lb.characterName === charName);
    }
    if (existingIdx < 0) {
      existingIdx = settings.selectedLorebooks.findIndex(lb => lb?.fromCharacter === true && lb.name === lorebookName);
    }

    if (existingIdx >= 0) {
      // 更新已有的世界书的角色关联信息（如果缺失）
      const existing = settings.selectedLorebooks[existingIdx];
      if (!existing.characterName || !existing.characterId) {
        existing.characterName = charName;
        existing.characterId = member.id;
        existing.fromCharacter = true;
        hasChanges = true;
        console.log('[可乐] 更新世界书角色关联:', lorebookName, '-> 角色:', charName, 'ID:', member.id);
      }
    } else {
      // 添加新的世界书
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

      const entries = characterBook.entries.map((entry, idx) => ({
        uid: entry.id ?? idx,
        keys: entry.keys || [],
        keysecondary: entry.secondary_keys || [],
        content: entry.content || '',
        comment: entry.comment || entry.name || '',
        enabled: isLorebookEntryEnabled(entry),
        constant: entry.constant ?? false,
        selective: entry.selective ?? true,
        order: entry.insertion_order ?? entry.order ?? 100,
        position: entry.position ?? 0,
        depth: entry.depth ?? 4
      }));

      settings.selectedLorebooks.push({
        name: lorebookName,
        entries,
        addedTime: timeStr,
        enabled: true,
        fromCharacter: true,
        characterName: charName,
        characterId: member.id
      });

      hasChanges = true;
      console.log('[可乐] 自动同步角色世界书:', lorebookName, '角色:', charName, 'ID:', member.id, '条目数:', entries.length);
    }
  }

  if (hasChanges) {
    saveSettingsDebounced();
  }
}

// 发送群聊消息
export async function sendGroupMessage(messageText, isMultipleMessages = false, isVoice = false) {
  console.log('[可乐] ===== sendGroupMessage 被调用 =====', { messageText, isMultipleMessages, isVoice, currentGroupChatIndex });

  if (currentGroupChatIndex < 0) {
    console.log('[可乐] currentGroupChatIndex < 0，退出');
    return;
  }

  const settings = getSettings();
  const groupChat = settings.groupChats?.[currentGroupChatIndex];
  if (!groupChat) return;

  // 获取成员信息（限制：最多 3 个独立 AI + 用户）
  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  if (members.length === 0) {
    showToast('群聊成员不存在', '⚠️');
    return;
  }

  // 群聊必须全部使用独立 API
  const invalidMembers = members.filter(m => !m.useCustomApi || !m.customApiUrl || !m.customModel);
  if (invalidMembers.length > 0) {
    const names = invalidMembers.map(m => m?.name || '未知').join('、');
    showToast(`以下成员未配置独立API：${names}`, '⚠️');
    return;
  }

  // 自动同步群成员的角色卡世界书到 selectedLorebooks
  await syncGroupMembersLorebooks(members, settings);

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // 清空输入框
  const input = document.getElementById('wechat-input');
  if (input) input.value = '';
  // 更新发送按钮状态
  window.updateSendButtonState?.();

  // 处理多条消息
  let messagesToSend = [];
  if (isMultipleMessages && Array.isArray(messageText)) {
    messagesToSend = messageText.filter(m => m.trim());
  } else if (typeof messageText === 'string' && messageText.trim()) {
    messagesToSend = [messageText.trim()];
  }

  if (messagesToSend.length === 0) return;

  // 逐条显示用户消息
  for (let i = 0; i < messagesToSend.length; i++) {
    const msg = messagesToSend[i];
    appendGroupMessage('user', msg, null, null, isVoice);
    if (i < messagesToSend.length - 1) {
      await sleep(300);
    }
  }

  // 添加到历史
  for (const msg of messagesToSend) {
    groupChat.chatHistory.push({
      role: 'user',
      content: msg,
      time: timeStr,
      timestamp: msgTimestamp,
      isVoice: isVoice
    });
  }

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();

  // 显示打字指示器
  showGroupTypingIndicator(members[0]?.name, members[0]?.id);

  try {
    // 计算沉默太久的角色
    const silentCharacters = getSilentCharacters(groupChat, members);

    // 调用 AI
    const combinedUserMessage = messagesToSend.join('\n');
    const combinedMessage = isVoice
      ? `[用户发送了语音消息，内容是：${combinedUserMessage}]`
      : combinedUserMessage;
    let responses = await callGroupAI(groupChat, members, combinedMessage, silentCharacters);

    hideGroupTypingIndicator();

    // 逐条显示 AI 回复，每条消息之间间隔约1秒
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      // 替换占位符
      const displayContent = replaceMessagePlaceholders(resp.content);

      // 调试日志：检查显示时的角色信息
      console.log('[可乐] 显示消息:', {
        index: i,
        characterName: resp.characterName,
        characterId: resp.characterId,
        content: displayContent?.substring(0, 30)
      });

    // 显示 typing 指示器并等待约1秒（模拟打字延迟）
      showGroupTypingIndicator(resp.characterName, resp.characterId);
      await sleep(800 + Math.random() * 400); // 0.8-1.2秒
      hideGroupTypingIndicator();

      groupChat.chatHistory.push({
        role: 'assistant',
        content: displayContent,
        characterId: resp.characterId,
        characterName: resp.characterName,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: resp.isVoice,
        isSticker: resp.isSticker
      });

      appendGroupMessage('assistant', displayContent, resp.characterName, resp.characterId, resp.isVoice, resp.isSticker);
    }

    // AI间对话：最多3轮（让角色之间互动）
    let dialogueRound = 0;
    let lastResponses = responses;
    const allRespondedNames = new Set(responses.map(r => r.characterName));

    while (dialogueRound < 3 && lastResponses.length > 0 && members.length > 1) {
      // 获取可以回应的角色（优先选择还没发言的，但也允许已发言的继续对话）
      const lastSpeakerNames = new Set(lastResponses.map(r => r.characterName));
      let otherMembers = members.filter(m => !lastSpeakerNames.has(m.name));

      // 如果所有角色都已在本轮发言，则允许任何角色继续对话（除了刚刚发言的）
      if (otherMembers.length === 0 && dialogueRound < 2) {
        // 从已发言的角色中随机选择一些继续对话
        const previousSpeakers = members.filter(m =>
          allRespondedNames.has(m.name) && !lastSpeakerNames.has(m.name)
        );
        if (previousSpeakers.length > 0) {
          otherMembers = previousSpeakers;
        }
      }

      if (otherMembers.length === 0) break;

      // 等待一下再发起AI间对话
      await sleep(800 + Math.random() * 400);

      // 构建AI间对话提示
      const dialoguePrompt = buildAIDialoguePrompt(groupChat, members, lastResponses);

      // 随机决定是否产生AI间对话（80%概率产生）
      if (Math.random() > 0.8) {
        dialogueRound++;
        continue;
      }

      showGroupTypingIndicator(otherMembers[0]?.name, otherMembers[0]?.id);

      try {
        const dialogueResponses = await callGroupAI(groupChat, members, dialoguePrompt, []);

        hideGroupTypingIndicator();

        // 过滤掉空回复
        const validResponses = dialogueResponses.filter(r => r.content && r.content.trim());

        if (validResponses.length === 0) {
          dialogueRound++;
          break;
        }

        // 显示AI间对话回复，逐条显示，每条间隔约1秒
        for (let i = 0; i < validResponses.length; i++) {
          const resp = validResponses[i];
          // 替换占位符
          const displayContent = replaceMessagePlaceholders(resp.content);

          // 显示 typing 指示器并等待约1秒
          showGroupTypingIndicator(resp.characterName, resp.characterId);
          await sleep(800 + Math.random() * 400); // 0.8-1.2秒
          hideGroupTypingIndicator();

          groupChat.chatHistory.push({
            role: 'assistant',
            content: displayContent,
            characterId: resp.characterId,
            characterName: resp.characterName,
            time: timeStr,
            timestamp: Date.now(),
            isVoice: resp.isVoice
          });

          appendGroupMessage('assistant', displayContent, resp.characterName, resp.characterId, resp.isVoice, resp.isSticker);
        }

        lastResponses = validResponses;
        // 记录所有已发言的角色
        validResponses.forEach(r => allRespondedNames.add(r.characterName));
        dialogueRound++;

      } catch (err) {
        hideGroupTypingIndicator();
        console.error('[可乐] AI间对话失败:', err);
        break;
      }
    }

    // 更新最后消息
    const allResponses = groupChat.chatHistory.filter(m => m.role === 'assistant');
    if (allResponses.length > 0) {
      const lastResp = allResponses[allResponses.length - 1];
      const lastContent = replaceMessagePlaceholders(lastResp.content);
      groupChat.lastMessage = `[${lastResp.characterName}]: ${lastResp.isSticker ? '[表情]' : (lastResp.isVoice ? '[语音消息]' : lastContent)}`;
    }
    groupChat.lastMessageTime = Date.now();

    saveSettingsDebounced();
    refreshChatList();
    checkGroupSummaryReminder(groupChat);

  } catch (err) {
    hideGroupTypingIndicator();
    console.error('[可乐] 群聊 AI 调用失败:', err);

    appendGroupMessage('assistant', `⚠️ ${err.message}`, '系统', null, false);
    saveSettingsDebounced();
  }
}

// 判断当前是否在群聊
export function isInGroupChat() {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  const result = messagesContainer?.dataset.isGroup === 'true';
  console.log('[可乐] isInGroupChat 检查:', {
    containerExists: !!messagesContainer,
    isGroupValue: messagesContainer?.dataset?.isGroup,
    result
  });
  return result;
}

// 获取当前群聊索引
export function getCurrentGroupIndex() {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (messagesContainer?.dataset.isGroup === 'true') {
    const index = parseInt(messagesContainer.dataset.groupIndex);
    return isNaN(index) ? -1 : index;
  }
  return -1;
}

// 发送群聊表情贴纸消息
export async function sendGroupStickerMessage(stickerUrl, description = '') {
  const groupIndex = getCurrentGroupIndex();
  if (groupIndex < 0) return;

  const settings = getSettings();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  if (!Array.isArray(groupChat.chatHistory)) {
    groupChat.chatHistory = [];
  }

  // 获取成员信息
  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  if (members.length === 0) {
    showToast('群聊成员不存在', '⚠️');
    return;
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // 保存到聊天历史
  groupChat.chatHistory.push({
    role: 'user',
    content: stickerUrl,
    time: timeStr,
    timestamp: msgTimestamp,
    isSticker: true,
    stickerDescription: description || ''
  });

  // 更新最后消息
  groupChat.lastMessage = '[表情]';
  groupChat.lastMessageTime = msgTimestamp;

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();

  // 显示消息
  appendGroupStickerMessage('user', stickerUrl);

  // 显示打字指示器
  showGroupTypingIndicator(members[0]?.name, members[0]?.id);

  try {
    // 自动同步群成员的角色卡世界书
    await syncGroupMembersLorebooks(members, settings);

    // 计算沉默太久的角色
    const silentCharacters = getSilentCharacters(groupChat, members);

    // 调用 AI - 传递表情描述让 AI 理解
    const aiPrompt = description
      ? `[用户发送了一个表情包：${description}]`
      : '[用户发送了一个表情包]';
    const responses = await callGroupAI(groupChat, members, aiPrompt, silentCharacters);

    hideGroupTypingIndicator();

    // 逐条显示 AI 回复
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      const displayContent = replaceMessagePlaceholders(resp.content);

      // 显示 typing 指示器并等待
      showGroupTypingIndicator(resp.characterName, resp.characterId);
      await sleep(800 + Math.random() * 400);
      hideGroupTypingIndicator();

      groupChat.chatHistory.push({
        role: 'assistant',
        content: displayContent,
        characterId: resp.characterId,
        characterName: resp.characterName,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: resp.isVoice,
        isSticker: resp.isSticker
      });

      appendGroupMessage('assistant', displayContent, resp.characterName, resp.characterId, resp.isVoice, resp.isSticker);
    }

    // 更新最后消息
    const allResponses = groupChat.chatHistory.filter(m => m.role === 'assistant');
    if (allResponses.length > 0) {
      const lastResp = allResponses[allResponses.length - 1];
      const lastContent = replaceMessagePlaceholders(lastResp.content);
      groupChat.lastMessage = `[${lastResp.characterName}]: ${lastResp.isSticker ? '[表情]' : (lastResp.isVoice ? '[语音消息]' : lastContent)}`;
    }
    groupChat.lastMessageTime = Date.now();

    saveSettingsDebounced();
    refreshChatList();
    checkGroupSummaryReminder(groupChat);

  } catch (err) {
    hideGroupTypingIndicator();
    console.error('[可乐] 群聊表情消息 AI 调用失败:', err);
    saveSettingsDebounced();
    refreshChatList();
    appendGroupMessage('assistant', `⚠️ ${err.message}`, '系统', null, false);
  }
}

// 添加群聊表情消息到界面
function appendGroupStickerMessage(role, stickerUrl, characterName = null, characterId = null) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;

  let avatarContent;
  if (role === 'user') {
    avatarContent = getUserAvatarHTML();
  } else {
    const settings = getSettings();
    const contact = settings.contacts?.find(c => c.id === characterId);
    const firstChar = characterName?.charAt(0) || '?';
    avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar;
  }

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-sticker-bubble">
        <img src="${stickerUrl}" alt="表情" class="wechat-sticker-img">
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  const imgEl = messageDiv.querySelector('img.wechat-sticker-img');
  if (imgEl) {
    bindImageLoadFallback(imgEl, {
      errorAlt: '图片加载失败',
      errorStyle: {
        border: '2px dashed #ff4d4f',
        padding: '10px',
        background: 'rgba(255,77,79,0.1)'
      },
      onFail: (baseSrc) => {
        console.error('[可乐] 群聊表情包图片加载失败:', {
          src: imgEl.src?.substring(0, 80),
          原始URL: (baseSrc || '').substring(0, 120),
          完整URL: stickerUrl
        });
      }
    });
  }
}

// 发送群聊照片消息
export async function sendGroupPhotoMessage(description) {
  const groupIndex = getCurrentGroupIndex();
  if (groupIndex < 0) return;

  const settings = getSettings();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  if (!Array.isArray(groupChat.chatHistory)) {
    groupChat.chatHistory = [];
  }

  // 获取成员信息
  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  if (members.length === 0) {
    showToast('群聊成员不存在', '⚠️');
    return;
  }

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // 保存到聊天历史（直接使用用户描述）
  groupChat.chatHistory.push({
    role: 'user',
    content: description,
    time: timeStr,
    timestamp: msgTimestamp,
    isPhoto: true
  });

  // 更新最后消息
  groupChat.lastMessage = '[照片]';
  groupChat.lastMessageTime = msgTimestamp;

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();

  // 显示消息
  appendGroupPhotoMessage('user', description);

  // 显示打字指示器
  showGroupTypingIndicator(members[0]?.name, members[0]?.id);

  try {
    // 计算沉默太久的角色
    const silentCharacters = getSilentCharacters(groupChat, members);

    // 调用 AI
    const responses = await callGroupAI(groupChat, members, `[用户发送了一张照片，图片描述：${description}]`, silentCharacters);

    hideGroupTypingIndicator();

    // 逐条显示 AI 回复
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      const displayContent = replaceMessagePlaceholders(resp.content);

      // 显示 typing 指示器并等待
      showGroupTypingIndicator(resp.characterName, resp.characterId);
      await sleep(800 + Math.random() * 400);
      hideGroupTypingIndicator();

      groupChat.chatHistory.push({
        role: 'assistant',
        content: displayContent,
        characterId: resp.characterId,
        characterName: resp.characterName,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: resp.isVoice,
        isSticker: resp.isSticker
      });

      appendGroupMessage('assistant', displayContent, resp.characterName, resp.characterId, resp.isVoice, resp.isSticker);
    }

    // 更新最后消息
    const allResponses = groupChat.chatHistory.filter(m => m.role === 'assistant');
    if (allResponses.length > 0) {
      const lastResp = allResponses[allResponses.length - 1];
      const lastContent = replaceMessagePlaceholders(lastResp.content);
      groupChat.lastMessage = `[${lastResp.characterName}]: ${lastResp.isSticker ? '[表情]' : (lastResp.isVoice ? '[语音消息]' : lastContent)}`;
    }
    groupChat.lastMessageTime = Date.now();

    saveSettingsDebounced();
    refreshChatList();
    checkGroupSummaryReminder(groupChat);

  } catch (err) {
    hideGroupTypingIndicator();
    console.error('[可乐] 群聊照片消息 AI 调用失败:', err);
    saveSettingsDebounced();
    refreshChatList();
    appendGroupMessage('assistant', `⚠️ ${err.message}`, '系统', null, false);
  }
}

// 添加群聊照片消息到界面
function appendGroupPhotoMessage(role, description, characterName = null, characterId = null) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `wechat-message ${role === 'user' ? 'self' : ''}`;
  const photoId = 'photo_' + Math.random().toString(36).substring(2, 9);

  let avatarContent;
  if (role === 'user') {
    avatarContent = getUserAvatarHTML();
  } else {
    const settings = getSettings();
    const contact = settings.contacts?.find(c => c.id === characterId);
    const firstChar = characterName?.charAt(0) || '?';
    avatarContent = contact?.avatar
      ? `<img src="${contact.avatar}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='${firstChar}'">`
      : firstChar;
  }

  messageDiv.innerHTML = `
    <div class="wechat-message-avatar">${avatarContent}</div>
    <div class="wechat-message-content">
      <div class="wechat-photo-bubble" data-photo-id="${photoId}">
        <div class="wechat-photo-content" id="${photoId}-content">${escapeHtml(description)}</div>
        <div class="wechat-photo-blur" id="${photoId}-blur">
          <div class="wechat-photo-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1.5 16H7.5L6 4z"/><path d="M6 4c0-1 1-2 6-2s6 1 6 2"/><path d="M9 8h6"/><circle cx="15" cy="6" r="0.5" fill="currentColor"/><circle cx="11" cy="7" r="0.5" fill="currentColor"/></svg>
          </div>
          <span class="wechat-photo-hint">点击查看</span>
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // 绑定点击事件（toggle切换蒙层）
  const photoBubble = messageDiv.querySelector('.wechat-photo-bubble');
  photoBubble?.addEventListener('click', () => {
    const blurEl = document.getElementById(`${photoId}-blur`);
    if (blurEl) {
      blurEl.classList.toggle('hidden');
    }
  });
}

// 批量发送混合消息（一次性发完再调用AI）
// messages: [{ type: 'text'|'voice'|'sticker'|'photo', content: string }]
export async function sendGroupBatchMessages(messages) {
  const groupIndex = getCurrentGroupIndex();
  if (groupIndex < 0) return;
  if (!messages || messages.length === 0) return;

  const settings = getSettings();
  const groupChat = settings.groupChats?.[groupIndex];
  if (!groupChat) return;

  if (!Array.isArray(groupChat.chatHistory)) {
    groupChat.chatHistory = [];
  }

  // 获取成员信息
  const { memberIds } = enforceGroupChatMemberLimit(groupChat);
  const members = memberIds.map(id => settings.contacts.find(c => c.id === id)).filter(Boolean);

  if (members.length === 0) {
    showToast('群聊成员不存在', '⚠️');
    return;
  }

  // 群聊必须全部使用独立 API
  const invalidMembers = members.filter(m => !m.useCustomApi || !m.customApiUrl || !m.customModel);
  if (invalidMembers.length > 0) {
    const names = invalidMembers.map(m => m?.name || '未知').join('、');
    showToast(`以下成员未配置独立API：${names}`, '⚠️');
    return;
  }

  // 自动同步群成员的角色卡世界书
  await syncGroupMembersLorebooks(members, settings);

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const msgTimestamp = Date.now();

  // 清空输入框
  const input = document.getElementById('wechat-input');
  if (input) input.value = '';
  window.updateSendButtonState?.();

  // 构建AI提示词的描述
  const promptParts = [];

  // 第一步：显示所有用户消息（不调用AI）
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content?.trim();
    if (!content) continue;

    if (msg.type === 'sticker') {
      // 表情消息
      groupChat.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp,
        isSticker: true
      });
      appendGroupStickerMessage('user', content);
      promptParts.push('[用户发送了一个表情包]');
    } else if (msg.type === 'photo') {
      // 照片消息
      groupChat.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp,
        isPhoto: true
      });
      appendGroupPhotoMessage('user', content);
      promptParts.push(`[用户发送了一张照片，描述：${content}]`);
    } else if (msg.type === 'voice') {
      // 语音消息
      groupChat.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp,
        isVoice: true
      });
      appendGroupMessage('user', content, null, null, true);
      promptParts.push(`[用户发送了语音消息：${content}]`);
    } else {
      // 文字消息
      groupChat.chatHistory.push({
        role: 'user',
        content: content,
        time: timeStr,
        timestamp: msgTimestamp
      });
      appendGroupMessage('user', content, null, null, false);
      promptParts.push(content);
    }

    // 消息之间的间隔
    if (i < messages.length - 1) {
      await sleep(200);
    }
  }

  // 更新最后消息
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.type === 'sticker') {
    groupChat.lastMessage = '[表情]';
  } else if (lastMsg.type === 'photo') {
    groupChat.lastMessage = '[照片]';
  } else if (lastMsg.type === 'voice') {
    groupChat.lastMessage = '[语音消息]';
  } else {
    // 检查内容是否包含 <meme> 标签
    const content = lastMsg.content || '';
    if (content.includes('<meme>')) {
      groupChat.lastMessage = '[图片]';
    } else {
      groupChat.lastMessage = content;
    }
  }
  groupChat.lastMessageTime = msgTimestamp;

  // 立即保存，确保用户消息不会丢失
  saveSettingsDebounced();

  // 第二步：调用AI（一次性）
  showGroupTypingIndicator(members[0]?.name, members[0]?.id);

  try {
    // 计算沉默太久的角色
    const silentCharacters = getSilentCharacters(groupChat, members);

    const combinedPrompt = promptParts.join('\n');
    const responses = await callGroupAI(groupChat, members, combinedPrompt, silentCharacters);

    hideGroupTypingIndicator();

    // 逐条显示 AI 回复
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      const displayContent = replaceMessagePlaceholders(resp.content);

      // 显示 typing 指示器并等待
      showGroupTypingIndicator(resp.characterName, resp.characterId);
      await sleep(800 + Math.random() * 400);
      hideGroupTypingIndicator();

      groupChat.chatHistory.push({
        role: 'assistant',
        content: displayContent,
        characterId: resp.characterId,
        characterName: resp.characterName,
        time: timeStr,
        timestamp: Date.now(),
        isVoice: resp.isVoice,
        isSticker: resp.isSticker
      });

      appendGroupMessage('assistant', displayContent, resp.characterName, resp.characterId, resp.isVoice, resp.isSticker);
    }

    // 更新最后消息
    const allResponses = groupChat.chatHistory.filter(m => m.role === 'assistant');
    if (allResponses.length > 0) {
      const lastResp = allResponses[allResponses.length - 1];
      const lastContent = replaceMessagePlaceholders(lastResp.content);
      groupChat.lastMessage = `[${lastResp.characterName}]: ${lastResp.isSticker ? '[表情]' : (lastResp.isVoice ? '[语音消息]' : lastContent)}`;
    }
    groupChat.lastMessageTime = Date.now();

    saveSettingsDebounced();
    refreshChatList();
    checkGroupSummaryReminder(groupChat);

  } catch (err) {
    hideGroupTypingIndicator();
    console.error('[可乐] 群聊批量消息 AI 调用失败:', err);
    saveSettingsDebounced();
    refreshChatList();
    appendGroupMessage('assistant', `⚠️ ${err.message}`, '系统', null);
  }
}
