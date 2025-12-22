/**
 * 手机面板：显示/隐藏、自动居中、拖拽定位
 */

import { requestSave } from './save-manager.js';
import { getSettings } from './config.js';
import { getCurrentTime } from './utils.js';

let phoneAutoCenteringBound = false;
let phoneManuallyPositioned = false;

export function centerPhoneInViewport({ force = false } = {}) {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;
  if (!force && phone.classList.contains('hidden')) return;

  const settings = getSettings();

  // 用户手动拖拽后，不再自动居中（除非 force）
  if (phoneManuallyPositioned && settings.phonePosition && !force) return;

  // 有保存位置则优先使用
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

export function setupPhoneDrag() {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialX = 0;
  let initialY = 0;

  const statusbar = phone.querySelector('.wechat-statusbar');
  if (!statusbar) return;

  statusbar.style.cursor = 'grab';
  statusbar.title = '拖拽移动手机位置';

  const handleStart = (e) => {
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

    const rect = phone.getBoundingClientRect();
    const settings = getSettings();
    settings.phonePosition = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    requestSave();
  };

  statusbar.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);

  statusbar.addEventListener('touchstart', handleStart, { passive: false });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);

  statusbar.addEventListener('dblclick', () => {
    phoneManuallyPositioned = false;
    const settings = getSettings();
    delete settings.phonePosition;
    requestSave();
    centerPhoneInViewport({ force: true });
  });
}

export function setupPhoneAutoCentering() {
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

export function togglePhone() {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  const settings = getSettings();

  phone.classList.toggle('hidden');
  settings.phoneVisible = !phone.classList.contains('hidden');
  requestSave();

  if (settings.phoneVisible) {
    const timeEl = document.querySelector('.wechat-statusbar-time');
    if (timeEl) timeEl.textContent = getCurrentTime();
    centerPhoneInViewport();
    setTimeout(() => centerPhoneInViewport({ force: true }), 150);
  }
}
