/**
 * 历史回顾和日志功能
 */

import { requestSave } from './save-manager.js';
import { getSettings, LOREBOOK_NAME_PREFIX, LOREBOOK_NAME_SUFFIX } from './config.js';
import { escapeHtml } from './utils.js';
import { showToast } from './toast.js';

// 最大日志数量
const MAX_LOGS = 20;

// 获取错误日志
export function getErrorLogs() {
  const settings = getSettings();
  return settings.errorLogs || [];
}

// 添加错误日志
export function addErrorLog(error, context = '') {
  const settings = getSettings();
  if (!settings.errorLogs) settings.errorLogs = [];

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0') + ':' + now.getSeconds().toString().padStart(2,'0');

  // 生成简短的错误摘要（约15字）
  const errorMsg = error?.message || String(error);
  let summary = context ? context + ': ' : '';
  // 截取关键信息
  if (errorMsg.length > 15 - summary.length) {
    summary += errorMsg.substring(0, 15 - summary.length) + '...';
  } else {
    summary += errorMsg;
  }

  const logEntry = {
    time: timeStr,
    summary: summary.substring(0, 18), // 确保不超过18字
    message: errorMsg,
    context: context
  };

  settings.errorLogs.unshift(logEntry);

  // 只保留最近的 MAX_LOGS 条
  if (settings.errorLogs.length > MAX_LOGS) {
    settings.errorLogs = settings.errorLogs.slice(0, MAX_LOGS);
  }

  requestSave();
  return logEntry;
}

// 清空错误日志
export function clearErrorLogs() {
  const settings = getSettings();
  settings.errorLogs = [];
  requestSave();
}

// 刷新日志列表显示
export function refreshLogsList() {
  const listEl = document.getElementById('wechat-logs-list');
  if (!listEl) return;

  const logs = getErrorLogs();

  if (logs.length === 0) {
    listEl.innerHTML = '<div style="text-align: center; color: var(--wechat-text-secondary); padding: 20px;">暂无错误日志 ✅</div>';
    return;
  }

  listEl.innerHTML = logs.map((log, idx) => `
    <div class="wechat-log-item" style="padding: 8px 10px; border-bottom: 1px solid var(--wechat-border); ${idx === 0 ? 'background: rgba(255,77,79,0.08);' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #ff4d4f; font-weight: 500;">${escapeHtml(log.summary || log.message?.substring(0, 15) + '...')}</span>
        <span style="color: var(--wechat-text-secondary); font-size: 11px;">${escapeHtml(log.time)}</span>
      </div>
      ${log.message && log.message !== log.summary ? `<div style="margin-top: 4px; font-size: 11px; color: var(--wechat-text-secondary); word-break: break-all;">${escapeHtml(log.message.substring(0, 80))}${log.message.length > 80 ? '...' : ''}</div>` : ''}
    </div>
  `).join('');
}

// 判断世界书是否是总结生成的
function isSummaryLorebook(lorebook) {
  // 检查名称格式：【可乐】和xxx的聊天
  if (lorebook.name?.startsWith(LOREBOOK_NAME_PREFIX) && lorebook.name?.endsWith(LOREBOOK_NAME_SUFFIX)) {
    return true;
  }
  // 检查标记
  if (lorebook.fromSummary === true) {
    return true;
  }
  return false;
}

// 判断是否是群聊总结
function isGroupSummary(lorebook) {
  // 从名称中提取人名部分
  if (!lorebook.name?.startsWith(LOREBOOK_NAME_PREFIX)) return false;
  const nameContent = lorebook.name.slice(LOREBOOK_NAME_PREFIX.length, -LOREBOOK_NAME_SUFFIX.length);
  // 如果包含逗号，说明是多人（群聊）
  return nameContent.includes(',') || nameContent.includes('，');
}

// 获取总结世界书列表（按类型分类）
export function getSummaryLorebooks(filter = 'all') {
  const settings = getSettings();
  const selectedLorebooks = settings.selectedLorebooks || [];

  const summaryBooks = selectedLorebooks
    .map((lb, idx) => ({ ...lb, originalIndex: idx }))
    .filter(lb => isSummaryLorebook(lb));

  if (filter === 'all') {
    return summaryBooks;
  } else if (filter === 'contact') {
    return summaryBooks.filter(lb => !isGroupSummary(lb));
  } else if (filter === 'group') {
    return summaryBooks.filter(lb => isGroupSummary(lb));
  }

  return summaryBooks;
}

// 刷新历史回顾列表
export function refreshHistoryList(filter = 'all') {
  const listEl = document.getElementById('wechat-history-list');
  if (!listEl) return;

  const summaryBooks = getSummaryLorebooks(filter);

  if (summaryBooks.length === 0) {
    const emptyText = filter === 'contact' ? '暂无单聊总结' : filter === 'group' ? '暂无群聊总结' : '暂无总结记录';
    listEl.innerHTML = `<div style="text-align: center; color: var(--wechat-text-secondary); padding: 30px;">${emptyText}<br><span style="font-size: 12px;">前往"总结"功能生成总结</span></div>`;
    return;
  }

  listEl.innerHTML = summaryBooks.map(lb => {
    // 从名称中提取人名
    let displayName = lb.name;
    if (lb.name?.startsWith(LOREBOOK_NAME_PREFIX)) {
      displayName = lb.name.slice(LOREBOOK_NAME_PREFIX.length, -LOREBOOK_NAME_SUFFIX.length);
    }
    const isGroup = isGroupSummary(lb);
    const entriesCount = lb.entries?.length || 0;

    return `
      <div class="wechat-history-item" data-index="${lb.originalIndex}" style="padding: 12px; border-bottom: 1px solid var(--wechat-border); cursor: pointer;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--wechat-text-primary);">${escapeHtml(displayName)}</div>
            <div style="font-size: 12px; color: var(--wechat-text-secondary);">${entriesCount} 杯总结 · ${lb.lastUpdated || lb.addedTime || '未知时间'}</div>
          </div>
          <label class="wechat-toggle wechat-toggle-small" onclick="event.stopPropagation()">
            <input type="checkbox" class="wechat-history-toggle" data-index="${lb.originalIndex}" ${lb.enabled !== false ? 'checked' : ''}>
            <span class="wechat-toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  // 绑定点击事件
  listEl.querySelectorAll('.wechat-history-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      showHistoryDetail(idx);
    });
  });

  // 绑定开关事件
  listEl.querySelectorAll('.wechat-history-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      e.stopPropagation();
      const idx = parseInt(toggle.dataset.index);
      toggleHistoryItem(idx, toggle.checked);
    });
  });
}

// 切换历史记录项启用状态
export function toggleHistoryItem(index, enabled) {
  const settings = getSettings();
  if (settings.selectedLorebooks?.[index]) {
    settings.selectedLorebooks[index].enabled = enabled;
    requestSave();
    showToast(enabled ? '已启用' : '已禁用');
  }
}

// 显示历史记录详情
export function showHistoryDetail(index) {
  const settings = getSettings();
  const lorebook = settings.selectedLorebooks?.[index];
  if (!lorebook) return;

  // 从名称中提取人名
  let displayName = lorebook.name;
  if (lorebook.name?.startsWith(LOREBOOK_NAME_PREFIX)) {
    displayName = lorebook.name.slice(LOREBOOK_NAME_PREFIX.length, -LOREBOOK_NAME_SUFFIX.length);
  }

  const entries = lorebook.entries || [];

  // 创建详情弹窗
  const modal = document.createElement('div');
  modal.className = 'wechat-modal';
  modal.id = 'wechat-history-detail-modal';
  modal.innerHTML = `
    <div class="wechat-modal-content" style="position: relative; max-width: 400px; max-height: 80vh; overflow-y: auto;">
      <button class="wechat-modal-close-x" id="wechat-history-detail-close">×</button>
      <div class="wechat-modal-title">${escapeHtml(displayName)}</div>
      <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 12px;">
        ${isGroupSummary(lorebook) ? '👥 群聊总结' : '💬 单聊总结'} · ${entries.length} 杯
      </div>
      <div class="wechat-history-entries" style="max-height: 400px; overflow-y: auto;">
        ${entries.length === 0 ? '<div style="text-align: center; color: var(--wechat-text-secondary); padding: 20px;">暂无条目</div>' :
          entries.map((entry, idx) => `
            <div class="wechat-history-entry" data-entry-index="${idx}" style="padding: 12px; border: 1px solid var(--wechat-border); border-radius: 8px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 500;">${escapeHtml(entry.comment || '第' + (idx + 1) + '杯')}</span>
                <label class="wechat-toggle wechat-toggle-small">
                  <input type="checkbox" class="wechat-entry-toggle" data-entry-index="${idx}" ${entry.enabled !== false ? 'checked' : ''}>
                  <span class="wechat-toggle-slider"></span>
                </label>
              </div>
              <div style="font-size: 12px; color: var(--wechat-text-secondary); margin-bottom: 6px;">
                ${(entry.keys || []).map(k => `<span style="background: var(--wechat-bg-secondary); padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${escapeHtml(k)}</span>`).join('')}
              </div>
              <div style="font-size: 13px; line-height: 1.5; color: var(--wechat-text-primary);">${escapeHtml(entry.content || '').substring(0, 200)}${(entry.content?.length || 0) > 200 ? '...' : ''}</div>
            </div>
          `).join('')
        }
      </div>
      <div class="wechat-modal-actions" style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="wechat-btn wechat-btn-primary wechat-btn-small" id="wechat-history-sync" style="flex: 1;">同步到酒馆</button>
        <button class="wechat-btn wechat-btn-small" id="wechat-history-refresh" style="flex: 1;">从酒馆刷新</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 关闭按钮
  modal.querySelector('#wechat-history-detail-close').addEventListener('click', () => modal.remove());

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // 条目开关
  modal.querySelectorAll('.wechat-entry-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const entryIdx = parseInt(toggle.dataset.entryIndex);
      if (settings.selectedLorebooks?.[index]?.entries?.[entryIdx]) {
        settings.selectedLorebooks[index].entries[entryIdx].enabled = toggle.checked;
        requestSave();
      }
    });
  });

  // 同步到酒馆按钮
  modal.querySelector('#wechat-history-sync').addEventListener('click', async () => {
    const btn = modal.querySelector('#wechat-history-sync');
    btn.disabled = true;
    btn.textContent = '同步中...';
    try {
      const { syncEntryToSillyTavern } = await import('./summary.js');
      for (let i = 0; i < entries.length; i++) {
        await syncEntryToSillyTavern(entries[i], i + 1, lorebook.name);
      }
      showToast('已同步到酒馆');
    } catch (err) {
      console.error('[可乐] 同步失败:', err);
      showToast('同步失败: ' + err.message, '⚠️');
      addErrorLog(err, '历史回顾同步');
    } finally {
      btn.disabled = false;
      btn.textContent = '同步到酒馆';
    }
  });

  // 从酒馆刷新按钮
  modal.querySelector('#wechat-history-refresh').addEventListener('click', async () => {
    const btn = modal.querySelector('#wechat-history-refresh');
    btn.disabled = true;
    btn.textContent = '刷新中...';
    try {
      const { refreshLorebookFromTavern } = await import('./favorites.js');
      await refreshLorebookFromTavern(lorebook.name, index);
      showToast('已从酒馆刷新');
      modal.remove();
      refreshHistoryList();
    } catch (err) {
      console.error('[可乐] 从酒馆刷新失败:', err);
      showToast('刷新失败: ' + err.message, '⚠️');
      addErrorLog(err, '历史回顾刷新');
    } finally {
      btn.disabled = false;
      btn.textContent = '从酒馆刷新';
    }
  });
}

// 初始化错误捕获（仅捕获插件内部错误）
export function initErrorCapture() {
  // 插件错误由各模块调用 addErrorLog 主动记录
  // 不再全局捕获 console.error，避免记录酒馆其他错误
  console.log('[可乐不加冰] 错误日志系统已初始化');
}

// 渲染心动瞬间历史记录
export function renderToyHistory(contact) {
  const contentEl = document.getElementById('wechat-history-content');
  if (!contentEl) return;

  const toyHistory = contact?.toyHistory || [];

  if (toyHistory.length === 0) {
    contentEl.innerHTML = `
      <div class="wechat-history-empty">
        <div class="wechat-history-empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" style="color: #ff6b8a; opacity: 0.5;">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </div>
        <div>暂无心动瞬间记录</div>
      </div>
    `;
    return;
  }

  // 按时间倒序排列
  const sortedHistory = [...toyHistory].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  contentEl.innerHTML = sortedHistory.map((session, sortedIdx) => {
    const targetText = session.target === 'character' ? 'TA在用' : '你在用';
    const messages = session.messages || [];
    const originalIndex = toyHistory.indexOf(session);

    return `
      <div class="wechat-toy-history-card" data-index="${originalIndex}">
        <div class="wechat-toy-history-card-header">
          <div class="wechat-toy-history-card-gift">
            <span class="wechat-toy-history-card-gift-emoji">${escapeHtml(session.gift?.emoji || '')}</span>
            <span class="wechat-toy-history-card-gift-name">${escapeHtml(session.gift?.name || '未知玩具')}</span>
          </div>
          <div class="wechat-toy-history-card-actions">
            <span class="wechat-toy-history-card-target">${targetText}<button class="wechat-toy-target-close-btn" data-tab="toy" data-index="${originalIndex}" title="删除">×</button></span>
            <button class="wechat-history-delete-btn" data-tab="toy" data-index="${originalIndex}" title="删除">×</button>
          </div>
        </div>
        <div class="wechat-toy-history-card-meta">
          <span>${escapeHtml(session.time || '未知时间')}</span>
          <span>时长 ${escapeHtml(session.duration || '00:00')}</span>
        </div>
        <div class="wechat-toy-history-card-messages wechat-toy-history-scrollable">
          ${messages.length === 0 ? '<div style="color: #999; text-align: center;">暂无对话记录</div>' :
            messages.map(msg => `
              <div class="wechat-toy-history-msg">
                <span class="wechat-toy-history-msg-sender ${msg.role === 'user' ? 'user' : 'ai'}">${msg.role === 'user' ? '你' : 'TA'}:</span>
                <span class="wechat-toy-history-msg-content">${escapeHtml(msg.content || '')}</span>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }).join('');
}
