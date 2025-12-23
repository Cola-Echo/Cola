/**
 * 收藏/世界书管理
 */

import { requestSave } from './save-manager.js';
import { world_names, loadWorldInfo, saveWorldInfo } from '../../../world-info.js';
import { getSettings } from './config.js';
import { escapeHtml } from './utils.js';
import { getUserPersonaFromST } from './ui.js';
import { showToast } from './toast.js';

// 刷新收藏列表
export function refreshFavoritesList(filter = 'all') {
  const settings = getSettings();
  const listEl = document.getElementById('wechat-favorites-list');
  if (!listEl) return;

  const selectedLorebooks = settings.selectedLorebooks || [];
  const userPersonas = settings.userPersonas || [];

  let items = [];

  // 用户设定
  if (filter === 'all' || filter === 'user') {
    userPersonas.forEach((persona, idx) => {
      items.push({
        type: 'user',
        index: idx,
        name: persona.name || '用户设定',
        content: persona.content?.substring(0, 50) + '...' || '',
        enabled: persona.enabled !== false,
        time: persona.addedTime || ''
      });
    });
  }

  // 世界书
  if (filter === 'all' || filter === 'global' || filter === 'character') {
    selectedLorebooks.forEach((lb, idx) => {
      // 过滤掉总结世界书（不在收藏中显示，只在历史回顾中显示）
      const isSummaryBook = lb.fromSummary === true ||
        (lb.name?.startsWith('【可乐】和') && lb.name?.endsWith('的聊天'));
      if (isSummaryBook) return;

      // 判断是否是角色卡自带的世界书
      const isCharacterBook = lb.fromCharacter === true;
      const itemType = isCharacterBook ? 'character' : 'global';

      if (filter === 'all' || filter === itemType) {
        items.push({
          type: itemType,
          index: idx,
          name: lb.name,
          content: `${lb.entries?.length || 0} 个条目`,
          enabled: lb.enabled !== false,
          time: lb.addedTime || '',
          entriesCount: lb.entries?.length || 0
        });
      }
    });
  }

  if (items.length === 0) {
    // 根据当前筛选显示不同的空状态按钮
    let emptyButtons = '';
    let emptyIcon = '<svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.4;"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
    let emptyText = '暂无收藏内容';

    if (filter === 'user') {
      emptyIcon = '<svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.4;"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
      emptyText = '暂无用户设定';
      emptyButtons = `<button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-empty-add-persona">添加用户设定</button>`;
    } else if (filter === 'character') {
      emptyIcon = '<svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.4;"><circle cx="12" cy="8" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 21v-2a4 4 0 014-4h10a4 4 0 014 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M8 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
      emptyText = '暂无角色卡世界书';
      emptyButtons = `
        <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-empty-import-png">导入 PNG</button>
        <button class="wechat-btn wechat-btn-secondary wechat-btn-small" id="wechat-empty-import-json">导入 JSON</button>
      `;
    } else if (filter === 'global') {
      emptyIcon = '<svg viewBox="0 0 24 24" width="48" height="48" style="opacity: 0.4;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
      emptyText = '暂无全局世界书';
      emptyButtons = `<button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-empty-add-lorebook">从酒馆导入</button>`;
    } else {
      emptyButtons = `
        <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-empty-add-persona">添加用户设定</button>
        <button class="wechat-btn wechat-btn-secondary wechat-btn-small" id="wechat-empty-add-lorebook">添加世界书</button>
      `;
    }

    listEl.innerHTML = `
      <div class="wechat-empty" style="padding: 40px 20px;">
        <div class="wechat-empty-icon">${emptyIcon}</div>
        <div class="wechat-empty-text">${emptyText}</div>
        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          ${emptyButtons}
        </div>
      </div>
    `;
    // 绑定空状态按钮事件
    listEl.querySelector('#wechat-empty-add-lorebook')?.addEventListener('click', () => {
      showAddLorebookPanel();
    });
    listEl.querySelector('#wechat-empty-add-persona')?.addEventListener('click', () => {
      showAddPersonaPanel();
    });
    listEl.querySelector('#wechat-empty-import-png')?.addEventListener('click', () => {
      document.getElementById('wechat-file-png')?.click();
    });
    listEl.querySelector('#wechat-empty-import-json')?.addEventListener('click', () => {
      document.getElementById('wechat-file-json')?.click();
    });
    return;
  }

  listEl.innerHTML = items.map(item => `
    <div class="wechat-favorites-item" data-type="${item.type}" data-index="${item.index}" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid var(--wechat-border); cursor: pointer;">
      <div class="wechat-favorites-item-info" style="flex: 1; min-width: 0;">
        <div class="wechat-favorites-item-name" style="font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</div>
        <div class="wechat-favorites-item-content" style="font-size: 12px; color: var(--wechat-text-secondary); margin-top: 2px;">${escapeHtml(item.content)}</div>
      </div>
      <div class="wechat-favorites-item-actions" style="display: flex; align-items: center; gap: 12px; margin-left: 10px;">
        <label class="wechat-toggle wechat-toggle-small">
          <input type="checkbox" class="wechat-favorites-toggle" ${item.enabled ? 'checked' : ''}>
          <span class="wechat-toggle-slider"></span>
        </label>
        <button class="wechat-favorites-remove" data-type="${item.type}" data-index="${item.index}" title="移除" style="background: none; border: none; color: #ff4d4f; font-size: 18px; padding: 4px; cursor: pointer; line-height: 1;">×</button>
      </div>
    </div>
  `).join('');

  // 绑定点击事件
  listEl.querySelectorAll('.wechat-favorites-item').forEach(itemEl => {
    // 点击条目展开详情
    itemEl.addEventListener('click', (e) => {
      if (e.target.closest('.wechat-toggle')) return;
      if (e.target.closest('.wechat-favorites-remove')) return;
      const type = itemEl.dataset.type;
      const index = parseInt(itemEl.dataset.index);
      showFavoritesDetail(type, index);
    });

    // 开关切换
    const toggle = itemEl.querySelector('.wechat-favorites-toggle');
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        e.stopPropagation();
        const type = itemEl.dataset.type;
        const index = parseInt(itemEl.dataset.index);
        toggleFavoritesItem(type, index, toggle.checked);
      });
    }

    // 移除按钮
    const removeBtn = itemEl.querySelector('.wechat-favorites-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = removeBtn.dataset.type;
        const index = parseInt(removeBtn.dataset.index);
        removeFavoritesItem(type, index);
      });
    }
  });
}

// 切换收藏项启用状态
export function toggleFavoritesItem(type, index, enabled) {
  const settings = getSettings();

  if (type === 'user') {
    if (settings.userPersonas?.[index]) {
      settings.userPersonas[index].enabled = enabled;
    }
  } else {
    if (settings.selectedLorebooks?.[index]) {
      settings.selectedLorebooks[index].enabled = enabled;
    }
  }

  requestSave();
}

// 移除收藏项
export function removeFavoritesItem(type, index) {
  const settings = getSettings();

  if (type === 'user') {
    const persona = settings.userPersonas?.[index];
    if (!persona) return;
    if (confirm(`确定移除「${persona.name || '用户设定'}」？`)) {
      settings.userPersonas.splice(index, 1);
      requestSave();
      refreshFavoritesList();
      showToast('已移除');
    }
  } else {
    const lorebook = settings.selectedLorebooks?.[index];
    if (!lorebook) return;
    if (confirm(`确定移除「${lorebook.name}」？`)) {
      settings.selectedLorebooks.splice(index, 1);
      requestSave();
      refreshFavoritesList();
      showToast('已移除');
    }
  }
}

// 显示收藏详情
export function showFavoritesDetail(type, index) {
  const settings = getSettings();

  if (type === 'user') {
    showUserPersonaEditModal(index);
  } else {
    const lorebook = settings.selectedLorebooks?.[index];
    if (lorebook) {
      showLorebookDetail(lorebook, index);
    }
  }
}

// 当前展开的用户设定索引
let expandedPersonaIdx = null;

// 显示用户设定详情（下滑展开面板）
export function showUserPersonaEditModal(personaIdx = -1) {
  const settings = getSettings();
  const listEl = document.getElementById('wechat-favorites-list');
  if (!listEl) return;

  // 如果是新建，使用弹窗
  if (personaIdx < 0) {
    showNewPersonaModal();
    return;
  }

  // 如果已经展开同一个，则关闭
  if (expandedPersonaIdx === personaIdx) {
    closeUserPersonaDetail();
    return;
  }

  // 关闭之前展开的
  closeUserPersonaDetail();
  closeLorebookDetail(); // 也关闭世界书面板
  expandedPersonaIdx = personaIdx;

  const persona = settings.userPersonas?.[personaIdx];
  if (!persona) return;

  // 找到对应的列表项
  const itemEls = listEl.querySelectorAll('.wechat-favorites-item');
  let targetItemEl = null;
  itemEls.forEach(el => {
    if (el.dataset.type === 'user' && parseInt(el.dataset.index) === personaIdx) {
      targetItemEl = el;
      el.classList.add('wechat-favorites-item-expanded');
    }
  });

  if (!targetItemEl) return;

  // 创建展开面板
  const panel = document.createElement('div');
  panel.className = 'wechat-persona-expand-panel';
  panel.id = 'wechat-persona-expand-panel';
  panel.innerHTML = `
    <div class="wechat-lorebook-panel-header">
      <span class="wechat-lorebook-panel-title">编辑用户设定</span>
      <button class="wechat-lorebook-panel-close">收起 ▲</button>
    </div>
    <div class="wechat-lorebook-panel-content">
      <div class="wechat-edit-field">
        <label>名称</label>
        <input type="text" class="wechat-persona-name-input" value="${escapeHtml(persona.name || '')}" placeholder="如：基本信息">
      </div>
      <div class="wechat-edit-field">
        <label>内容</label>
        <textarea class="wechat-persona-content-input" rows="6" placeholder="输入用户设定内容...">${escapeHtml(persona.content || '')}</textarea>
      </div>
      <div class="wechat-edit-actions">
        <button class="wechat-btn wechat-btn-primary wechat-persona-save-btn">保存</button>
        <button class="wechat-btn wechat-btn-secondary wechat-persona-sync-btn">同步到酒馆</button>
      </div>
    </div>
    <div class="wechat-lorebook-panel-footer">
      <button class="wechat-btn wechat-btn-danger wechat-btn-small" id="wechat-persona-delete">删除</button>
      <button class="wechat-btn wechat-btn-secondary wechat-btn-small" id="wechat-persona-refresh" style="color: #333;">从酒馆拉取</button>
    </div>
  `;

  // 插入到列表项后面
  targetItemEl.after(panel);

  // 动画展开
  requestAnimationFrame(() => {
    panel.classList.add('wechat-lorebook-panel-show');
  });

  // 绑定事件
  bindPersonaPanelEvents(panel, personaIdx);
}

// 关闭用户设定详情面板
export function closeUserPersonaDetail() {
  const panel = document.getElementById('wechat-persona-expand-panel');
  if (panel) {
    panel.classList.remove('wechat-lorebook-panel-show');
    setTimeout(() => panel.remove(), 200);
  }

  // 移除展开状态
  const listEl = document.getElementById('wechat-favorites-list');
  if (listEl) {
    listEl.querySelectorAll('.wechat-favorites-item[data-type="user"]').forEach(el => {
      el.classList.remove('wechat-favorites-item-expanded');
    });
  }

  expandedPersonaIdx = null;
}

// 新建用户设定弹窗
function showNewPersonaModal() {
  const settings = getSettings();

  const modal = document.createElement('div');
  modal.className = 'wechat-modal';
  modal.id = 'wechat-persona-modal';
  modal.innerHTML = `
    <div class="wechat-modal-content" style="position: relative; max-width: 400px;">
      <button class="wechat-modal-close-x" id="wechat-persona-close">×</button>
      <div class="wechat-modal-title">新增用户设定</div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">名称</label>
        <input type="text" id="wechat-persona-name" class="wechat-settings-input" value="" placeholder="如：基本信息">
      </div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">内容</label>
        <textarea id="wechat-persona-content" class="wechat-settings-input" rows="6" placeholder="输入用户设定内容..."></textarea>
      </div>
      <div class="wechat-modal-actions">
        <button class="wechat-btn wechat-btn-secondary" id="wechat-persona-import">从酒馆导入</button>
        <button class="wechat-btn wechat-btn-primary" id="wechat-persona-save">保存</button>
      </div>
    </div>
  `;

  // 添加到手机容器内，确保居中显示
  const phoneContainer = document.querySelector('.wechat-phone') || document.body;
  phoneContainer.appendChild(modal);

  // 关闭
  modal.querySelector('#wechat-persona-close').addEventListener('click', () => modal.remove());

  // 从酒馆导入
  modal.querySelector('#wechat-persona-import').addEventListener('click', () => {
    const stPersona = getUserPersonaFromST();
    if (stPersona) {
      modal.querySelector('#wechat-persona-name').value = stPersona.name || '';
      modal.querySelector('#wechat-persona-content').value = stPersona.description || '';
      showToast('已从酒馆导入用户设定');
    } else {
      showToast('未找到酒馆用户设定', '⚠️');
    }
  });

  // 保存
  modal.querySelector('#wechat-persona-save').addEventListener('click', () => {
    const name = modal.querySelector('#wechat-persona-name').value.trim();
    const content = modal.querySelector('#wechat-persona-content').value.trim();

    if (!content) {
      showToast('请输入内容', '⚠️');
      return;
    }

    if (!settings.userPersonas) settings.userPersonas = [];

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

    settings.userPersonas.push({ name, content, enabled: true, addedTime: timeStr });

    requestSave();
    modal.remove();
    refreshFavoritesList();
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// 绑定用户设定面板事件
function bindPersonaPanelEvents(panel, personaIdx) {
  const settings = getSettings();

  // 关闭/收起按钮
  panel.querySelector('.wechat-lorebook-panel-close').addEventListener('click', closeUserPersonaDetail);

  // 保存按钮
  panel.querySelector('.wechat-persona-save-btn').addEventListener('click', () => {
    const name = panel.querySelector('.wechat-persona-name-input').value.trim();
    const content = panel.querySelector('.wechat-persona-content-input').value.trim();

    if (!content) {
      showToast('请输入内容', '⚠️');
      return;
    }

    if (settings.userPersonas?.[personaIdx]) {
      settings.userPersonas[personaIdx].name = name;
      settings.userPersonas[personaIdx].content = content;
      requestSave();
      showToast('已保存');
      refreshFavoritesList();
      closeUserPersonaDetail();
    }
  });

  // 同步到酒馆按钮
  panel.querySelector('.wechat-persona-sync-btn').addEventListener('click', async () => {
    const btn = panel.querySelector('.wechat-persona-sync-btn');
    const name = panel.querySelector('.wechat-persona-name-input').value.trim();
    const content = panel.querySelector('.wechat-persona-content-input').value.trim();

    btn.disabled = true;
    btn.textContent = '同步中...';

    try {
      await syncPersonaToTavern(name, content);
      showToast('已同步到酒馆');
    } catch (err) {
      showToast('同步失败: ' + err.message, '❌');
    } finally {
      btn.disabled = false;
      btn.textContent = '同步到酒馆';
    }
  });

  // 删除按钮
  panel.querySelector('#wechat-persona-delete').addEventListener('click', () => {
    if (confirm('确定删除此用户设定？')) {
      settings.userPersonas.splice(personaIdx, 1);
      requestSave();
      closeUserPersonaDetail();
      refreshFavoritesList();
    }
  });

  // 从酒馆拉取按钮
  panel.querySelector('#wechat-persona-refresh').addEventListener('click', () => {
    const stPersona = getUserPersonaFromST();
    if (stPersona) {
      panel.querySelector('.wechat-persona-name-input').value = stPersona.name || '';
      panel.querySelector('.wechat-persona-content-input').value = stPersona.description || '';
      showToast('已从酒馆拉取');
    } else {
      showToast('未找到酒馆用户设定', '⚠️');
    }
  });
}

// 同步用户设定到酒馆
async function syncPersonaToTavern(name, content) {
  try {
    // 尝试使用酒馆的 power_user 设置
    if (typeof power_user !== 'undefined') {
      // 设置描述
      power_user.persona_description = content;

      // 如果有 personas 对象，也更新对应的
      if (power_user.personas && power_user.default_persona) {
        power_user.personas[power_user.default_persona] = content;
      }

      // 保存设置
      if (typeof SillyTavern !== 'undefined' && SillyTavern.saveSettingsDebounced) {
        await SillyTavern.requestSave();
      }

      // 尝试执行同步命令
      if (typeof SillyTavern !== 'undefined' && SillyTavern.executeSlashCommandsWithOptions) {
        await SillyTavern.executeSlashCommandsWithOptions('/persona-sync');
      }

      return true;
    }

    throw new Error('power_user 不可用');
  } catch (err) {
    console.error('[可乐不加冰] 同步到酒馆失败:', err);
    throw err;
  }
}

// 当前展开的世界书索引
let expandedLorebookIdx = null;

// 显示世界书详情（下滑展开面板）
export function showLorebookDetail(lorebook, lorebookIdx) {
  const listEl = document.getElementById('wechat-favorites-list');
  if (!listEl) return;

  // 如果已经展开同一个，则关闭
  if (expandedLorebookIdx === lorebookIdx) {
    closeLorebookDetail();
    return;
  }

  // 关闭之前展开的
  closeLorebookDetail();
  expandedLorebookIdx = lorebookIdx;

  // 找到对应的列表项
  const itemEls = listEl.querySelectorAll('.wechat-favorites-item');
  let targetItemEl = null;
  itemEls.forEach(el => {
    if (el.dataset.type !== 'user' && parseInt(el.dataset.index) === lorebookIdx) {
      targetItemEl = el;
      el.classList.add('wechat-favorites-item-expanded');
    }
  });

  if (!targetItemEl) return;

  const entries = lorebook.entries || [];

  // 创建展开面板
  const panel = document.createElement('div');
  panel.className = 'wechat-lorebook-expand-panel';
  panel.id = 'wechat-lorebook-expand-panel';
  panel.innerHTML = `
    <div class="wechat-lorebook-panel-header">
      <span class="wechat-lorebook-panel-title">${escapeHtml(lorebook.name)}</span>
      <button class="wechat-lorebook-panel-close">收起 ▲</button>
    </div>
    <div class="wechat-lorebook-panel-content">
      ${entries.length === 0 ? '<div class="wechat-empty-text" style="padding: 20px;">暂无条目</div>' :
        entries.map((entry, idx) => `
          <div class="wechat-lorebook-entry-item" data-entry-index="${idx}">
            <div class="wechat-lorebook-entry-header">
              <span class="wechat-lorebook-entry-title">${escapeHtml(entry.comment || entry.keys?.[0] || '条目' + (idx + 1))}</span>
              <div class="wechat-lorebook-entry-actions">
                <label class="wechat-toggle wechat-toggle-small">
                  <input type="checkbox" class="wechat-entry-toggle" ${entry.enabled !== false ? 'checked' : ''}>
                  <span class="wechat-toggle-slider"></span>
                </label>
                <button class="wechat-entry-edit-btn" title="编辑">✏️</button>
              </div>
            </div>
            <div class="wechat-lorebook-entry-keys">
              ${(entry.keys || []).map(k => `<span class="wechat-tag">${escapeHtml(k)}</span>`).join('')}
            </div>
            <div class="wechat-lorebook-entry-preview">${escapeHtml(entry.content?.substring(0, 150) || '')}${entry.content?.length > 150 ? '...' : ''}</div>
            <div class="wechat-lorebook-entry-edit-form hidden" data-entry-index="${idx}">
              <div class="wechat-edit-field">
                <label>备注名称</label>
                <input type="text" class="wechat-entry-comment" value="${escapeHtml(entry.comment || '')}" placeholder="条目备注">
              </div>
              <div class="wechat-edit-field">
                <label>关键词（逗号分隔）</label>
                <input type="text" class="wechat-entry-keys-input" value="${escapeHtml((entry.keys || []).join(', '))}" placeholder="关键词1, 关键词2">
              </div>
              <div class="wechat-edit-field">
                <label>内容</label>
                <textarea class="wechat-entry-content-input" rows="5" placeholder="条目内容">${escapeHtml(entry.content || '')}</textarea>
              </div>
              <div class="wechat-edit-actions">
                <button class="wechat-btn wechat-btn-secondary wechat-entry-cancel-btn">取消</button>
                <button class="wechat-btn wechat-btn-primary wechat-entry-save-btn">保存并同步</button>
              </div>
            </div>
          </div>
        `).join('')
      }
    </div>
    <div class="wechat-lorebook-panel-footer">
      <button class="wechat-btn wechat-btn-danger wechat-btn-small" id="wechat-lorebook-remove">移除世界书</button>
      <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-lorebook-sync">同步到酒馆</button>
      <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-lorebook-refresh">从酒馆刷新</button>
    </div>
  `;

  // 插入到列表项后面
  targetItemEl.after(panel);

  // 动画展开
  requestAnimationFrame(() => {
    panel.classList.add('wechat-lorebook-panel-show');
  });

  // 绑定事件
  bindLorebookPanelEvents(panel, lorebook, lorebookIdx);
}

// 关闭世界书详情面板
export function closeLorebookDetail() {
  const panel = document.getElementById('wechat-lorebook-expand-panel');
  if (panel) {
    panel.classList.remove('wechat-lorebook-panel-show');
    setTimeout(() => panel.remove(), 200);
  }

  // 移除展开状态
  const listEl = document.getElementById('wechat-favorites-list');
  if (listEl) {
    listEl.querySelectorAll('.wechat-favorites-item-expanded').forEach(el => {
      el.classList.remove('wechat-favorites-item-expanded');
    });
  }

  expandedLorebookIdx = null;
}

// 绑定展开面板的事件
function bindLorebookPanelEvents(panel, lorebook, lorebookIdx) {
  // 关闭/收起按钮
  panel.querySelector('.wechat-lorebook-panel-close').addEventListener('click', closeLorebookDetail);

  // 条目启用开关
  panel.querySelectorAll('.wechat-entry-toggle').forEach((toggle) => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      const entryItem = toggle.closest('.wechat-lorebook-entry-item');
      const entryIdx = parseInt(entryItem.dataset.entryIndex);
      const settings = getSettings();
      if (settings.selectedLorebooks?.[lorebookIdx]?.entries?.[entryIdx]) {
        settings.selectedLorebooks[lorebookIdx].entries[entryIdx].enabled = toggle.checked;
        requestSave();
        // 同步到酒馆
        await syncLorebookToTavern(lorebook.name, lorebookIdx);
      }
    });
  });

  // 编辑按钮
  panel.querySelectorAll('.wechat-entry-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryItem = btn.closest('.wechat-lorebook-entry-item');
      const editForm = entryItem.querySelector('.wechat-lorebook-entry-edit-form');
      const preview = entryItem.querySelector('.wechat-lorebook-entry-preview');
      const keysDiv = entryItem.querySelector('.wechat-lorebook-entry-keys');

      // 切换显示
      editForm.classList.toggle('hidden');
      if (!editForm.classList.contains('hidden')) {
        preview.classList.add('hidden');
        keysDiv.classList.add('hidden');
        btn.textContent = '📝';
      } else {
        preview.classList.remove('hidden');
        keysDiv.classList.remove('hidden');
        btn.textContent = '✏️';
      }
    });
  });

  // 取消编辑按钮
  panel.querySelectorAll('.wechat-entry-cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryItem = btn.closest('.wechat-lorebook-entry-item');
      const editForm = entryItem.querySelector('.wechat-lorebook-entry-edit-form');
      const preview = entryItem.querySelector('.wechat-lorebook-entry-preview');
      const keysDiv = entryItem.querySelector('.wechat-lorebook-entry-keys');
      const editBtn = entryItem.querySelector('.wechat-entry-edit-btn');

      editForm.classList.add('hidden');
      preview.classList.remove('hidden');
      keysDiv.classList.remove('hidden');
      editBtn.textContent = '✏️';
    });
  });

  // 保存编辑按钮
  panel.querySelectorAll('.wechat-entry-save-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryItem = btn.closest('.wechat-lorebook-entry-item');
      const entryIdx = parseInt(entryItem.dataset.entryIndex);

      const comment = entryItem.querySelector('.wechat-entry-comment').value.trim();
      const keysInput = entryItem.querySelector('.wechat-entry-keys-input').value;
      const content = entryItem.querySelector('.wechat-entry-content-input').value;

      // 解析关键词
      const keys = keysInput.split(/[,，]/).map(k => k.trim()).filter(k => k);

      const settings = getSettings();
      if (settings.selectedLorebooks?.[lorebookIdx]?.entries?.[entryIdx]) {
        const entry = settings.selectedLorebooks[lorebookIdx].entries[entryIdx];
        entry.comment = comment;
        entry.keys = keys;
        entry.content = content;
        requestSave();

        // 同步到酒馆
        btn.disabled = true;
        btn.textContent = '同步中...';
        try {
          await syncLorebookToTavern(lorebook.name, lorebookIdx);
          showToast('已保存并同步到酒馆');

          // 更新UI显示
          const titleEl = entryItem.querySelector('.wechat-lorebook-entry-title');
          titleEl.textContent = comment || keys[0] || '条目' + (entryIdx + 1);

          const keysDiv = entryItem.querySelector('.wechat-lorebook-entry-keys');
          keysDiv.innerHTML = keys.map(k => `<span class="wechat-tag">${escapeHtml(k)}</span>`).join('');

          const preview = entryItem.querySelector('.wechat-lorebook-entry-preview');
          preview.textContent = content.substring(0, 150) + (content.length > 150 ? '...' : '');

          // 关闭编辑表单
          const editForm = entryItem.querySelector('.wechat-lorebook-entry-edit-form');
          editForm.classList.add('hidden');
          keysDiv.classList.remove('hidden');
          preview.classList.remove('hidden');
          entryItem.querySelector('.wechat-entry-edit-btn').textContent = '✏️';
        } catch (err) {
          showToast('同步失败: ' + err.message, '❌');
        } finally {
          btn.disabled = false;
          btn.textContent = '保存并同步';
        }
      }
    });
  });

  // 移除世界书
  panel.querySelector('#wechat-lorebook-remove').addEventListener('click', () => {
    if (confirm(`确定移除「${lorebook.name}」？`)) {
      const settings = getSettings();
      settings.selectedLorebooks.splice(lorebookIdx, 1);
      requestSave();
      closeLorebookDetail();
      refreshFavoritesList();
    }
  });

  // 同步到酒馆
  panel.querySelector('#wechat-lorebook-sync')?.addEventListener('click', async () => {
    const btn = panel.querySelector('#wechat-lorebook-sync');
    btn.disabled = true;
    btn.textContent = '同步中...';
    try {
      await syncLorebookToTavern(lorebook.name, lorebookIdx);
      showToast(`「${lorebook.name}」已同步到酒馆`);
    } catch (err) {
      showToast('同步失败: ' + err.message, '❌');
    } finally {
      btn.disabled = false;
      btn.textContent = '同步到酒馆';
    }
  });

  // 从酒馆刷新
  panel.querySelector('#wechat-lorebook-refresh').addEventListener('click', async () => {
    const btn = panel.querySelector('#wechat-lorebook-refresh');
    btn.disabled = true;
    btn.textContent = '刷新中...';
    try {
      await refreshLorebookFromTavern(lorebook.name, lorebookIdx);
      showToast('已从酒馆刷新');
      closeLorebookDetail();
      refreshFavoritesList();
    } catch (err) {
      showToast('刷新失败: ' + err.message, '❌');
    } finally {
      btn.disabled = false;
      btn.textContent = '从酒馆刷新';
    }
  });
}

// 同步世界书到酒馆
async function syncLorebookToTavern(name, lorebookIdx) {
  const settings = getSettings();
  const lorebook = settings.selectedLorebooks?.[lorebookIdx];
  if (!lorebook) throw new Error('世界书不存在');

  if (typeof saveWorldInfo !== 'function') {
    throw new Error('saveWorldInfo 函数不可用');
  }

  // 检查世界书是否存在于酒馆
  const availableWorlds = typeof world_names !== 'undefined' ? world_names : [];
  if (!availableWorlds.includes(name)) {
    throw new Error(`世界书「${name}」在酒馆中不存在，请先在酒馆创建`);
  }

  // 构建酒馆格式的世界书数据
  const worldInfo = { entries: {} };

  lorebook.entries.forEach((entry, idx) => {
    worldInfo.entries[entry.uid ?? idx] = {
      uid: entry.uid ?? idx,
      key: entry.keys || [],
      keysecondary: entry.keysecondary || [],
      comment: entry.comment || '',
      content: entry.content || '',
      constant: entry.constant ?? false,
      vectorized: entry.vectorized ?? false,
      selective: entry.selective ?? true,
      selectiveLogic: entry.selectiveLogic ?? 0,
      addMemo: entry.addMemo ?? true,
      order: entry.order ?? 100,
      position: entry.position ?? 0,
      disable: entry.enabled === false,
      excludeRecursion: entry.excludeRecursion ?? false,
      preventRecursion: entry.preventRecursion ?? false,
      delayUntilRecursion: entry.delayUntilRecursion ?? false,
      probability: entry.probability ?? 100,
      useProbability: entry.useProbability ?? true,
      depth: entry.depth ?? 4,
      group: entry.group ?? '',
      groupOverride: entry.groupOverride ?? false,
      groupWeight: entry.groupWeight ?? 100,
      scanDepth: entry.scanDepth ?? null,
      caseSensitive: entry.caseSensitive ?? false,
      matchWholeWords: entry.matchWholeWords ?? null,
      useGroupScoring: entry.useGroupScoring ?? null,
      automationId: entry.automationId ?? '',
      role: entry.role ?? 0,
      sticky: entry.sticky ?? null,
      cooldown: entry.cooldown ?? null,
      delay: entry.delay ?? null
    };
  });

  // 保存到酒馆 - 第三个参数 true 表示立即保存
  await saveWorldInfo(name, worldInfo, true);
  console.log(`[可乐不加冰] 世界书「${name}」已同步到酒馆`);
}

// 从酒馆刷新世界书
export async function refreshLorebookFromTavern(name, lorebookIdx) {
  if (typeof loadWorldInfo !== 'function') {
    throw new Error('loadWorldInfo 函数不可用');
  }

  const worldData = await loadWorldInfo(name);
  if (!worldData?.entries) {
    throw new Error('无法加载世界书数据');
  }

  const settings = getSettings();
  const entries = Object.values(worldData.entries).map(entry => ({
    uid: entry.uid,
    keys: entry.key || [],
    keysecondary: entry.keysecondary || [],
    content: entry.content || '',
    comment: entry.comment || '',
    enabled: entry.disable !== true,
    priority: entry.priority || 10,
    constant: entry.constant,
    selective: entry.selective,
    selectiveLogic: entry.selectiveLogic,
    order: entry.order,
    position: entry.position,
    depth: entry.depth,
    group: entry.group,
    probability: entry.probability,
    useProbability: entry.useProbability,
    role: entry.role
  }));

  if (settings.selectedLorebooks?.[lorebookIdx]) {
    settings.selectedLorebooks[lorebookIdx].entries = entries;
    settings.selectedLorebooks[lorebookIdx].lastUpdated = new Date().toISOString();
    requestSave();
  }
}

// 显示添加世界书弹窗
export function showAddLorebookPanel() {
  // 移除已有弹窗
  document.getElementById('wechat-add-lorebook-modal')?.remove();

  const availableWorlds = typeof world_names !== 'undefined' ? world_names : [];
  const settings = getSettings();
  const selectedNames = (settings.selectedLorebooks || []).map(lb => lb.name);

  const modal = document.createElement('div');
  modal.className = 'wechat-modal';
  modal.id = 'wechat-add-lorebook-modal';
  modal.innerHTML = `
    <div class="wechat-modal-content" style="position: relative; max-width: 350px; max-height: 80vh; margin: auto;">
      <button class="wechat-modal-close-x" id="wechat-lorebook-modal-close">×</button>
      <div class="wechat-modal-title">导入全局世界书</div>
      <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 12px; padding: 0 4px;">从酒馆世界书列表中选择要导入的世界书，导入后将作为全局世界书供所有角色共享使用</div>
      <div style="max-height: 50vh; overflow-y: auto;">
        ${availableWorlds.length === 0 ? '<div class="wechat-empty-text" style="padding: 20px; text-align: center;">暂无可用世界书<br><span style="font-size: 12px; color: var(--wechat-text-secondary);">请先在酒馆中创建世界书</span></div>' :
          availableWorlds.map(name => `
            <div class="wechat-lorebook-item ${selectedNames.includes(name) ? 'selected' : ''}" data-name="${escapeHtml(name)}" style="padding: 12px; border-bottom: 1px solid var(--wechat-border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
              <span class="wechat-lorebook-name">${escapeHtml(name)}</span>
              <span style="color: var(--wechat-green);">${selectedNames.includes(name) ? '✓ 已导入' : '+ 导入'}</span>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;

  // 添加到手机容器内，确保居中显示
  const phoneContainer = document.querySelector('.wechat-phone') || document.body;
  phoneContainer.appendChild(modal);

  // 关闭按钮
  modal.querySelector('#wechat-lorebook-modal-close').addEventListener('click', () => modal.remove());

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // 绑定世界书点击
  modal.querySelectorAll('.wechat-lorebook-item').forEach(item => {
    item.addEventListener('click', async () => {
      const name = item.dataset.name;
      await addLorebookToFavorites(name);
      modal.remove();
      refreshFavoritesList();
    });
  });
}

// 显示添加用户设定弹窗
export function showAddPersonaPanel() {
  // 移除已有弹窗
  document.getElementById('wechat-add-persona-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'wechat-modal';
  modal.id = 'wechat-add-persona-modal';
  modal.innerHTML = `
    <div class="wechat-modal-content" style="position: relative; max-width: 350px; margin: auto;">
      <button class="wechat-modal-close-x" id="wechat-persona-modal-close">×</button>
      <div class="wechat-modal-title">添加用户设定</div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">名称</label>
        <input type="text" class="wechat-settings-input" id="wechat-new-persona-name" placeholder="如：基本信息">
      </div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">内容</label>
        <textarea class="wechat-settings-input" id="wechat-new-persona-content" rows="5" placeholder="输入用户设定内容..."></textarea>
      </div>
      <div class="wechat-modal-actions">
        <button class="wechat-btn wechat-btn-primary" id="wechat-new-persona-import">从酒馆导入</button>
        <button class="wechat-btn wechat-btn-primary" id="wechat-new-persona-save">保存</button>
      </div>
    </div>
  `;

  // 添加到手机容器内，确保居中显示
  const phoneContainer = document.querySelector('.wechat-phone') || document.body;
  phoneContainer.appendChild(modal);

  // 关闭按钮
  modal.querySelector('#wechat-persona-modal-close').addEventListener('click', () => modal.remove());

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // 从酒馆导入
  modal.querySelector('#wechat-new-persona-import').addEventListener('click', () => {
    const stPersona = getUserPersonaFromST();
    if (stPersona) {
      modal.querySelector('#wechat-new-persona-name').value = stPersona.name || '';
      modal.querySelector('#wechat-new-persona-content').value = stPersona.description || '';
      showToast('已从酒馆导入用户设定');
    } else {
      showToast('未找到酒馆用户设定', '⚠️');
    }
  });

  // 保存
  modal.querySelector('#wechat-new-persona-save').addEventListener('click', () => {
    const name = modal.querySelector('#wechat-new-persona-name').value.trim();
    const content = modal.querySelector('#wechat-new-persona-content').value.trim();

    if (!content) {
      showToast('请输入内容', '⚠️');
      return;
    }

    const settings = getSettings();
    if (!settings.userPersonas) settings.userPersonas = [];

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

    settings.userPersonas.push({ name: name || '用户设定', content, enabled: true, addedTime: timeStr });
    requestSave();

    modal.remove();
    refreshFavoritesList();
    showToast('用户设定已添加');
  });
}

// 显示世界书选择弹窗
export async function showLorebookModal() {
  const modal = document.getElementById('wechat-lorebook-modal');
  const listEl = document.getElementById('wechat-lorebook-list');
  if (!modal || !listEl) return;

  listEl.innerHTML = '<div class="wechat-loading">加载中...</div>';
  modal.classList.remove('hidden');

  try {
    const availableWorlds = typeof world_names !== 'undefined' ? world_names : [];
    const settings = getSettings();
    const selectedNames = (settings.selectedLorebooks || []).map(lb => lb.name);

    if (availableWorlds.length === 0) {
      listEl.innerHTML = '<div class="wechat-empty-text">暂无可用世界书</div>';
      return;
    }

    listEl.innerHTML = availableWorlds.map(name => `
      <div class="wechat-lorebook-item ${selectedNames.includes(name) ? 'selected' : ''}" data-name="${escapeHtml(name)}">
        <span class="wechat-lorebook-name">${escapeHtml(name)}</span>
        <span class="wechat-lorebook-check">${selectedNames.includes(name) ? '✓' : '+'}</span>
      </div>
    `).join('');

    // 绑定点击事件
    listEl.querySelectorAll('.wechat-lorebook-item').forEach(item => {
      item.addEventListener('click', async () => {
        const name = item.dataset.name;
        await addLorebookToFavorites(name);
        modal.classList.add('hidden');
      });
    });
  } catch (err) {
    console.error('[可乐] 加载世界书列表失败:', err);
    listEl.innerHTML = '<div class="wechat-empty-text">加载失败</div>';
  }
}

// 添加世界书到收藏
export async function addLorebookToFavorites(name) {
  const settings = getSettings();
  if (!settings.selectedLorebooks) settings.selectedLorebooks = [];

  // 检查是否已添加
  if (settings.selectedLorebooks.some(lb => lb.name === name)) {
    showToast('该世界书已在收藏中', '⚠️');
    return;
  }

  try {
    // 加载世界书数据
    let entries = [];
    if (typeof loadWorldInfo === 'function') {
      const worldData = await loadWorldInfo(name);
      if (worldData?.entries) {
        entries = Object.values(worldData.entries).map(entry => ({
          uid: entry.uid,
          keys: entry.key || [],
          content: entry.content || '',
          comment: entry.comment || '',
          enabled: entry.disable !== true,
          priority: entry.priority || 10
        }));
      }
    }

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

    settings.selectedLorebooks.push({
      name,
      entries,
      addedTime: timeStr,
      enabled: true,
      fromCharacter: false  // 标记为全局世界书
    });

    requestSave();
    refreshFavoritesList('global');
    showToast(`已导入「${name}」为全局世界书`);
  } catch (err) {
    console.error('[可乐] 添加世界书失败:', err);
    showToast('添加失败: ' + err.message, '❌');
  }
}

// 同步角色卡内置世界书到酒馆
export async function syncCharacterBookToTavern(charData) {
  const rawData = charData.rawData || {};
  const data = rawData.data || rawData;
  const characterBook = data.character_book;

  if (!characterBook || !characterBook.entries || characterBook.entries.length === 0) {
    console.log('[可乐不加冰] 角色卡没有内置世界书');
    return null;
  }

  const charName = data.name || charData.name || '未知角色';
  // 使用角色卡自带的世界书名称，如果没有则使用角色名
  const lorebookName = characterBook.name || charName;

  try {
    // 检查是否已有同名世界书
    const settings = getSettings();

    // 从 contacts 中查找对应的联系人 ID（因为 charData.id 可能为 undefined）
    const matchedContact = settings.contacts?.find(c => c.name === charName);
    const contactId = charData.id || matchedContact?.id || null;

    console.log('[可乐不加冰] syncCharacterBookToTavern:', {
      charName,
      lorebookName,
      charDataId: charData.id,
      matchedContactId: matchedContact?.id,
      finalContactId: contactId
    });

    const existingIdx = settings.selectedLorebooks?.findIndex(lb => lb.name === lorebookName);
    if (existingIdx >= 0) {
      console.log(`[可乐不加冰] 角色书「${lorebookName}」已存在，更新内容`);
      // 更新已有的
      settings.selectedLorebooks[existingIdx].entries = characterBook.entries.map((entry, idx) => ({
        uid: entry.id ?? idx,
        keys: entry.keys || [],
        keysecondary: entry.secondary_keys || [],
        content: entry.content || '',
        comment: entry.comment || entry.name || '',
        enabled: entry.enabled !== false && entry.disable !== true,
        constant: entry.constant ?? false,
        selective: entry.selective ?? true,
        order: entry.insertion_order ?? entry.order ?? 100,
        position: entry.position ?? 0,
        depth: entry.depth ?? 4
      }));
      settings.selectedLorebooks[existingIdx].lastUpdated = new Date().toISOString();
      // 更新角色关联信息
      settings.selectedLorebooks[existingIdx].characterName = charName;
      settings.selectedLorebooks[existingIdx].characterId = contactId;
    } else {
      // 添加新的
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

      const entries = characterBook.entries.map((entry, idx) => ({
        uid: entry.id ?? idx,
        keys: entry.keys || [],
        keysecondary: entry.secondary_keys || [],
        content: entry.content || '',
        comment: entry.comment || entry.name || '',
        enabled: entry.enabled !== false && entry.disable !== true,
        constant: entry.constant ?? false,
        selective: entry.selective ?? true,
        order: entry.insertion_order ?? entry.order ?? 100,
        position: entry.position ?? 0,
        depth: entry.depth ?? 4
      }));

      if (!settings.selectedLorebooks) settings.selectedLorebooks = [];
      settings.selectedLorebooks.push({
        name: lorebookName,
        entries,
        addedTime: timeStr,
        enabled: true,
        fromCharacter: true,
        characterName: charName,
        characterId: contactId
      });
    }

    requestSave();

    // 尝试同步到酒馆世界书系统
    if (typeof saveWorldInfo === 'function') {
      // 构建酒馆格式
      const worldInfo = { entries: {} };
      const entries = settings.selectedLorebooks.find(lb => lb.name === lorebookName)?.entries || [];

      entries.forEach((entry, idx) => {
        worldInfo.entries[entry.uid ?? idx] = {
          uid: entry.uid ?? idx,
          key: entry.keys || [],
          keysecondary: entry.keysecondary || [],
          comment: entry.comment || '',
          content: entry.content || '',
          constant: entry.constant ?? false,
          selective: entry.selective ?? true,
          order: entry.order ?? 100,
          position: entry.position ?? 0,
          disable: entry.enabled === false,
          depth: entry.depth ?? 4
        };
      });

      // 检查酒馆中是否已有这个世界书
      const availableWorlds = typeof world_names !== 'undefined' ? world_names : [];
      if (availableWorlds.includes(lorebookName)) {
        // 更新已有的
        await saveWorldInfo(lorebookName, worldInfo, true);
        console.log(`[可乐不加冰] 角色书「${lorebookName}」已同步到酒馆（更新）`);
      } else {
        // 需要先创建世界书
        try {
          const response = await fetch('/api/worldinfo/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: lorebookName })
          });
          if (response.ok) {
            // 创建后保存内容
            await saveWorldInfo(lorebookName, worldInfo, true);
            console.log(`[可乐不加冰] 角色书「${lorebookName}」已创建并同步到酒馆`);
          }
        } catch (createErr) {
          console.warn('[可乐不加冰] 创建世界书失败:', createErr);
        }
      }
    }

    return lorebookName;
  } catch (err) {
    console.error('[可乐不加冰] 同步角色书失败:', err);
    return null;
  }
}
