/**
 * 联系人管理
 */

import { requestSave, saveNow } from './save-manager.js';
import { getSettings, LOREBOOK_NAME_PREFIX, LOREBOOK_NAME_SUFFIX } from './config.js';
import { generateContactsList } from './ui.js';
import { showToast } from './toast.js';
import { selectAndCrop } from './cropper.js';

// 当前换头像的联系人索引
let pendingAvatarContactIndex = -1;

// 当前编辑的联系人索引
let currentEditingContactIndex = -1;

// 添加联系人
export function addContact(characterData) {
  const settings = getSettings();
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

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
    rawData: characterData.rawData,
    // 角色独立配置
    useCustomApi: false,
    customApiUrl: '',
    customApiKey: '',
    customModel: '',
    customHakimiBreakLimit: false
  });

  requestSave();
  refreshContactsList();
  return true;
}

// 刷新联系人列表
export function refreshContactsList() {
  const contactsContainer = document.getElementById('wechat-contacts');
  if (contactsContainer) {
    contactsContainer.innerHTML = generateContactsList();
    bindContactsEvents();
  }
}

// 删除联系人
export function deleteContact(index) {
  const settings = getSettings();
  const contact = settings.contacts[index];
  if (!contact) return;

  if (confirm(`确定要删除 ${contact.name} 吗？`)) {
    // 删除关联的世界书（角色卡世界书和总结世界书）
    deleteContactLorebooks(contact);

    settings.contacts.splice(index, 1);
    saveNow();
    refreshContactsList();
  }
}

// 删除联系人关联的世界书
function deleteContactLorebooks(contact) {
  const settings = getSettings();
  if (!settings.selectedLorebooks) return;

  const contactName = contact.name;
  const contactId = contact.id;

  // 从后往前遍历删除，避免索引问题
  for (let i = settings.selectedLorebooks.length - 1; i >= 0; i--) {
    const lb = settings.selectedLorebooks[i];

    // 检查是否是该联系人的角色卡世界书
    const isCharacterBook = lb.fromCharacter === true &&
      (lb.characterName === contactName || lb.characterId === contactId);

    // 检查是否是该联系人的总结世界书
    const summaryBookName = `${LOREBOOK_NAME_PREFIX}${contactName}${LOREBOOK_NAME_SUFFIX}`;
    const isSummaryBook = lb.name === summaryBookName;

    if (isCharacterBook || isSummaryBook) {
      console.log(`[可乐不加冰] 删除关联世界书: ${lb.name}`);
      settings.selectedLorebooks.splice(i, 1);
    }
  }
}

// 删除群聊
export function deleteGroupChat(groupIndex) {
  const settings = getSettings();
  const groupChats = settings.groupChats || [];
  const group = groupChats[groupIndex];
  if (!group) return;

  if (confirm(`确定要删除该群聊吗？`)) {
    // 删除群聊关联的总结世界书
    deleteGroupLorebooks(group, settings);

    groupChats.splice(groupIndex, 1);
    requestSave();
    refreshContactsList();
    // 同时刷新聊天列表
    import('./ui.js').then(m => m.refreshChatList());
    showToast('群聊已删除');
  }
}

// 删除群聊关联的世界书
function deleteGroupLorebooks(group, settings) {
  if (!settings.selectedLorebooks) return;

  // 获取群成员名称列表构建世界书名称
  const memberNames = (group.memberIds || []).map(id => {
    const contact = settings.contacts?.find(c => c.id === id);
    return contact?.name || '未知';
  });
  const memberNamesStr = memberNames.join(',');
  const summaryBookName = `${LOREBOOK_NAME_PREFIX}${memberNamesStr}${LOREBOOK_NAME_SUFFIX}`;

  // 从后往前遍历删除，避免索引问题
  for (let i = settings.selectedLorebooks.length - 1; i >= 0; i--) {
    const lb = settings.selectedLorebooks[i];
    if (lb.name === summaryBookName) {
      console.log(`[可乐不加冰] 删除群聊关联世界书: ${lb.name}`);
      settings.selectedLorebooks.splice(i, 1);
    }
  }
}

// 更换角色头像（在设置弹窗中使用）
export function changeContactAvatar(contactIndex) {
  pendingAvatarContactIndex = contactIndex;

  // 使用裁剪器选择并裁剪头像（1:1比例）
  selectAndCrop(1, (croppedImage) => {
    if (pendingAvatarContactIndex < 0) return;

    const settings = getSettings();
    if (settings.contacts[pendingAvatarContactIndex]) {
      settings.contacts[pendingAvatarContactIndex].avatar = croppedImage;
      requestSave();
      refreshContactsList();
      // 更新弹窗中的头像预览
      updateContactSettingsAvatar(pendingAvatarContactIndex);
      showToast('角色头像已更换');
    }
  });
}

// 更新弹窗中的头像预览
function updateContactSettingsAvatar(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  const avatarPreview = document.getElementById('wechat-contact-avatar-preview');
  if (avatarPreview) {
    const firstChar = contact.name ? contact.name.charAt(0) : '?';
    avatarPreview.innerHTML = contact.avatar
      ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
      : firstChar;
  }
}

// 打开角色设置弹窗
export function openContactSettings(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];
  if (!contact) return;

  currentEditingContactIndex = contactIndex;

  // 填充头像和名称
  const avatarPreview = document.getElementById('wechat-contact-avatar-preview');
  const nameEl = document.getElementById('wechat-contact-settings-name');
  if (avatarPreview) {
    const firstChar = contact.name ? contact.name.charAt(0) : '?';
    avatarPreview.innerHTML = contact.avatar
      ? `<img src="${contact.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`
      : firstChar;
  }
  if (nameEl) nameEl.textContent = contact.name;

  // 填充独立 API 配置
  const useCustomApi = contact.useCustomApi || false;
  const customApiToggle = document.getElementById('wechat-contact-custom-api-toggle');
  const apiSettingsDiv = document.getElementById('wechat-contact-api-settings');

  if (customApiToggle) {
    customApiToggle.classList.toggle('on', useCustomApi);
  }
  if (apiSettingsDiv) {
    if (useCustomApi) {
      apiSettingsDiv.classList.remove('hidden');
      apiSettingsDiv.style.display = 'flex';
    } else {
      apiSettingsDiv.classList.add('hidden');
      apiSettingsDiv.style.display = 'none';
    }
  }

  document.getElementById('wechat-contact-api-url').value = contact.customApiUrl || '';
  document.getElementById('wechat-contact-api-key').value = contact.customApiKey || '';

  // 填充模型值到下拉列表或输入框
  const modelSelect = document.getElementById('wechat-contact-model-select');
  const modelInput = document.getElementById('wechat-contact-model-input');
  const selectWrapper = document.getElementById('wechat-contact-model-select-wrapper');
  const inputWrapper = document.getElementById('wechat-contact-model-input-wrapper');
  const customModel = contact.customModel || '';

  if (customModel && modelSelect) {
    // 检查是否在下拉列表中存在
    const existingOption = Array.from(modelSelect.options).find(opt => opt.value === customModel);
    if (existingOption) {
      modelSelect.value = customModel;
    } else {
      // 添加为新选项并选中
      const newOption = document.createElement('option');
      newOption.value = customModel;
      newOption.textContent = customModel;
      modelSelect.appendChild(newOption);
      modelSelect.value = customModel;
    }
  } else if (modelSelect) {
    modelSelect.value = '';
  }
  if (modelInput) modelInput.value = customModel;

  // 重置为下拉列表模式
  if (selectWrapper) selectWrapper.style.display = 'flex';
  if (inputWrapper) inputWrapper.style.display = 'none';

  // 填充哈基米破限
  const hakimiToggle = document.getElementById('wechat-contact-hakimi-toggle');
  if (hakimiToggle) {
    hakimiToggle.classList.toggle('on', contact.customHakimiBreakLimit || false);
  }

  // 显示弹窗
  document.getElementById('wechat-contact-settings-modal')?.classList.remove('hidden');
}

// 保存角色设置
export function saveContactSettings() {
  if (currentEditingContactIndex < 0) return;

  const settings = getSettings();
  const contact = settings.contacts[currentEditingContactIndex];
  if (!contact) return;

  // 保存独立 API 配置
  contact.useCustomApi = document.getElementById('wechat-contact-custom-api-toggle')?.classList.contains('on') || false;
  contact.customApiUrl = document.getElementById('wechat-contact-api-url')?.value?.trim() || '';
  contact.customApiKey = document.getElementById('wechat-contact-api-key')?.value?.trim() || '';

  // 获取模型值：优先从输入框获取（手动模式），其次从下拉列表获取
  const inputWrapper = document.getElementById('wechat-contact-model-input-wrapper');
  const isManualMode = inputWrapper?.style.display === 'flex';
  contact.customModel = isManualMode
    ? (document.getElementById('wechat-contact-model-input')?.value?.trim() || '')
    : (document.getElementById('wechat-contact-model-select')?.value?.trim() || '');

  // 保存哈基米破限
  contact.customHakimiBreakLimit = document.getElementById('wechat-contact-hakimi-toggle')?.classList.contains('on') || false;

  requestSave();
  showToast('角色设置已保存');

  // 关闭弹窗
  document.getElementById('wechat-contact-settings-modal')?.classList.add('hidden');
  currentEditingContactIndex = -1;
}

// 关闭角色设置弹窗
export function closeContactSettings() {
  document.getElementById('wechat-contact-settings-modal')?.classList.add('hidden');
  currentEditingContactIndex = -1;
}

// 获取当前编辑的联系人索引
export function getCurrentEditingContactIndex() {
  return currentEditingContactIndex;
}

// 绑定联系人事件
export function bindContactsEvents() {
  // 导入 openChat 以避免循环依赖
  import('./chat.js').then(chatModule => {
    // 单击卡片进入聊天
    document.querySelectorAll('.wechat-contact-card:not(.wechat-group-card) .wechat-card-content').forEach(card => {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.wechat-card-avatar')) return;
        const cardEl = this.closest('.wechat-contact-card');
        const index = parseInt(cardEl.dataset.index);
        chatModule.openChat(index);
      });
    });
  });

  // 群聊卡片点击进入群聊
  import('./group-chat.js').then(groupModule => {
    document.querySelectorAll('.wechat-group-card .wechat-card-content').forEach(card => {
      card.addEventListener('click', function(e) {
        const cardEl = this.closest('.wechat-group-card');
        const groupIndex = parseInt(cardEl.dataset.groupIndex);
        groupModule.openGroupChat(groupIndex);
      });
    });

    // 群聊头像点击也进入群聊
    document.querySelectorAll('.wechat-group-avatar').forEach(avatar => {
      avatar.addEventListener('click', function(e) {
        e.stopPropagation();
        const groupIndex = parseInt(this.dataset.groupIndex);
        groupModule.openGroupChat(groupIndex);
      });
    });
  });

  // 群聊删除按钮
  document.querySelectorAll('.wechat-group-delete').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const groupIndex = parseInt(this.dataset.groupIndex);
      deleteGroupChat(groupIndex);
    });
  });

  // 头像事件绑定（长按删除 + 单击打开设置）
  document.querySelectorAll('.wechat-card-avatar').forEach(avatar => {
    let pressTimer = null;
    let isLongPress = false;

    // 长按开始
    const handlePressStart = (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        showDeleteBubble(avatar);
      }, 500);
    };

    // 长按取消
    const handlePressEnd = (e) => {
      clearTimeout(pressTimer);
      // 如果不是长按，则执行单击打开设置弹窗
      if (!isLongPress) {
        const index = parseInt(avatar.dataset.index);
        openContactSettings(index);
      }
    };

    // 移动时取消长按
    const handlePressCancel = () => {
      clearTimeout(pressTimer);
    };

    // 触摸设备
    avatar.addEventListener('touchstart', handlePressStart, { passive: true });
    avatar.addEventListener('touchend', handlePressEnd);
    avatar.addEventListener('touchmove', handlePressCancel, { passive: true });
    avatar.addEventListener('touchcancel', handlePressCancel);

    // 鼠标设备
    avatar.addEventListener('mousedown', handlePressStart);
    avatar.addEventListener('mouseup', handlePressEnd);
    avatar.addEventListener('mouseleave', handlePressCancel);

    // 阻止原有的click事件
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
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

  // 点击其他地方关闭删除气泡
  document.addEventListener('click', hideDeleteBubble);
  document.addEventListener('touchstart', hideDeleteBubble, { passive: true });

  // 初始化滑动删除功能
  initSwipeToDelete();
}

// 显示删除气泡
function showDeleteBubble(avatarEl) {
  // 先移除已有的气泡
  hideDeleteBubble();

  const index = parseInt(avatarEl.dataset.index);
  const settings = getSettings();
  const contact = settings.contacts[index];
  if (!contact) return;

  // 创建删除气泡
  const bubble = document.createElement('div');
  bubble.className = 'wechat-delete-bubble';
  bubble.dataset.index = index;
  bubble.innerHTML = `<span>🗑️</span> 删除`;

  // 添加到头像元素
  avatarEl.style.position = 'relative';
  avatarEl.classList.add('has-bubble');
  avatarEl.appendChild(bubble);

  // 绑定删除事件
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = parseInt(bubble.dataset.index);
    deleteContactDirect(idx);
    hideDeleteBubble();
  });

  // 触摸设备
  bubble.addEventListener('touchend', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const idx = parseInt(bubble.dataset.index);
    deleteContactDirect(idx);
    hideDeleteBubble();
  });
}

// 隐藏删除气泡
function hideDeleteBubble(e) {
  // 如果点击的是气泡本身，不关闭
  if (e && e.target.closest('.wechat-delete-bubble')) return;

  const bubbles = document.querySelectorAll('.wechat-delete-bubble');
  bubbles.forEach(bubble => bubble.remove());

  document.querySelectorAll('.wechat-card-avatar.has-bubble').forEach(avatar => {
    avatar.classList.remove('has-bubble');
  });
}

// 直接删除联系人（不需要确认）
function deleteContactDirect(index) {
  const settings = getSettings();
  const contact = settings.contacts[index];
  if (!contact) return;

  // 删除关联的世界书（角色卡世界书和总结世界书）
  deleteContactLorebooks(contact);

  settings.contacts.splice(index, 1);
  requestSave();
  refreshContactsList();
}

// 初始化滑动删除功能
function initSwipeToDelete() {
  const cards = document.querySelectorAll('.wechat-contact-card');

  cards.forEach(card => {
    const wrapper = card.querySelector('.wechat-card-swipe-wrapper');
    if (!wrapper || wrapper.dataset.swipeInit) return;
    wrapper.dataset.swipeInit = 'true';

    const isGroupCard = card.classList.contains('wechat-group-card');

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let hasMoved = false; // 是否真的发生了移动
    let isOpen = false;
    const deleteWidth = 70;
    const moveThreshold = 10; // 移动阈值，超过此距离才算拖动

    const handleStart = (e) => {
      // 群聊卡片不需要跳过头像
      if (!isGroupCard && e.target.closest('.wechat-card-avatar')) return;
      isDragging = true;
      hasMoved = false;
      startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      wrapper.style.transition = 'none';
    };

    const handleMove = (e) => {
      if (!isDragging) return;
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const diff = clientX - startX;

      // 只有移动超过阈值才算真正的拖动
      if (Math.abs(diff) > moveThreshold) {
        hasMoved = true;
      }

      if (!hasMoved) return;

      let newX = isOpen ? -deleteWidth + diff : diff;
      newX = Math.max(-deleteWidth, Math.min(0, newX));
      currentX = newX;
      wrapper.style.transform = `translateX(${newX}px)`;
    };

    const handleEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      wrapper.style.transition = 'transform 0.3s ease';

      // 如果没有真正移动，不做任何处理，让点击事件正常触发
      if (!hasMoved) {
        return;
      }

      if (currentX < -deleteWidth / 2) {
        wrapper.style.transform = `translateX(-${deleteWidth}px)`;
        isOpen = true;
      } else {
        wrapper.style.transform = 'translateX(0)';
        isOpen = false;
      }
    };

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

    wrapper.addEventListener('touchstart', (e) => { closeOthers(); handleStart(e); }, { passive: true });
    wrapper.addEventListener('touchmove', handleMove, { passive: true });
    wrapper.addEventListener('touchend', handleEnd);

    const onMouseMove = (e) => handleMove(e);
    const onMouseUp = (e) => {
      handleEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    wrapper.addEventListener('mousedown', (e) => {
      if (!isGroupCard && e.target.closest('.wechat-card-avatar')) return;
      closeOthers();
      handleStart(e);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      // 不再 preventDefault，让点击事件可以正常触发
    });
  });
}
