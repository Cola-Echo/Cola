/**
 * 统一保存管理器
 * 解决频繁调用 saveSettingsDebounced 导致的 "Settings could not be saved" 问题
 */

import { saveSettingsDebounced } from '../../../../script.js';

// 保存状态
let saveTimer = null;
let isSaving = false;
let pendingSave = false;
let autoSaveTimer = null;
let hasPendingChanges = false; // 标记是否有未保存的变更

// 配置
const SAVE_DELAY = 2500; // 2.5秒延迟，合并频繁操作
const SAVE_COOLDOWN = 1000; // 保存后的冷却时间
const AUTO_SAVE_INTERVAL = 15000; // 15秒自动保存间隔（移动端保险）

/**
 * 请求保存（防抖）
 * 用于一般操作，会合并多次调用
 */
export function requestSave() {
  hasPendingChanges = true; // 标记有待保存的变更

  // 如果已经有待处理的定时器，清除它
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  // 设置新的定时器
  saveTimer = setTimeout(() => {
    saveTimer = null;
    executeSave();
  }, SAVE_DELAY);
}

/**
 * 立即保存
 * 用于关键操作，如发送消息完成、删除联系人等
 */
export function saveNow() {
  hasPendingChanges = true; // 确保标记
  // 清除待处理的定时器
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  executeSave();
}

/**
 * 执行实际保存
 */
function executeSave() {
  // 如果正在保存，标记有待处理的保存请求
  if (isSaving) {
    pendingSave = true;
    return;
  }

  isSaving = true;
  hasPendingChanges = false; // 清除待保存标记

  try {
    saveSettingsDebounced();
  } catch (e) {
    console.error('[SaveManager] 保存失败:', e);
  }

  // 冷却期后重置状态
  setTimeout(() => {
    isSaving = false;
    // 如果冷却期间有新的保存请求，执行它
    if (pendingSave) {
      pendingSave = false;
      executeSave();
    }
  }, SAVE_COOLDOWN);
}

/**
 * 自动保存检查
 * 定期检查是否有未保存的变更，有则保存
 */
function autoSaveCheck() {
  if (hasPendingChanges && !isSaving && !saveTimer) {
    console.log('[SaveManager] 自动保存触发');
    executeSave();
  }
}

/**
 * 启动自动保存定时器
 */
function startAutoSave() {
  if (autoSaveTimer) return; // 避免重复启动
  autoSaveTimer = setInterval(autoSaveCheck, AUTO_SAVE_INTERVAL);
}

/**
 * 统一处理页面卸载/隐藏时的保存
 */
function handleUnload() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  // 直接调用原始保存函数，确保数据不丢失
  if (hasPendingChanges) {
    saveSettingsDebounced();
    hasPendingChanges = false;
  }
}

/**
 * 页面卸载前保存
 * 支持桌面端和移动端
 */
export function setupUnloadSave() {
  // 桌面端：关闭/刷新页面时触发
  window.addEventListener('beforeunload', handleUnload);

  // 移动端关键：页面变为不可见时立即保存
  // 当用户切换应用、锁屏、切换标签页时触发
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleUnload();
    }
  });

  // 移动端补充：比 beforeunload 更可靠的页面卸载事件
  // 在 iOS Safari 和部分 Android 浏览器上效果更好
  window.addEventListener('pagehide', handleUnload);

  // 启动自动保存（移动端的最后保险）
  startAutoSave();
}
