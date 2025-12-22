/**
 * 聊天背景功能模块
 * 支持每个联系人独立设置背景，含图片裁剪功能
 */

import { requestSave } from './save-manager.js';
import { getSettings } from './config.js';
import { showToast } from './toast.js';
import { currentChatIndex } from './chat.js';

// 裁剪器状态
let cropperState = {
  image: null,
  canvas: null,
  ctx: null,
  imageX: 0,
  imageY: 0,
  imageWidth: 0,
  imageHeight: 0,
  cropBox: { x: 50, y: 50, width: 200, height: 300 },
  isDragging: false,
  isResizing: false,
  resizeHandle: null,
  dragStart: { x: 0, y: 0 },
  boxStart: { x: 0, y: 0, width: 0, height: 0 }
};

// 初始化聊天背景功能
export function initChatBackground() {
  // 背景面板相关事件
  document.getElementById('wechat-menu-chat-bg')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-menu')?.classList.add('hidden');
    showChatBgPanel();
  });

  document.getElementById('wechat-chat-bg-close')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-bg-panel')?.classList.add('hidden');
  });

  document.getElementById('wechat-chat-bg-upload')?.addEventListener('click', () => {
    document.getElementById('wechat-chat-bg-file')?.click();
  });

  document.getElementById('wechat-chat-bg-file')?.addEventListener('change', handleBgFileSelect);

  document.getElementById('wechat-chat-bg-clear')?.addEventListener('click', clearChatBackground);

  // 裁剪器事件
  document.getElementById('wechat-cropper-cancel')?.addEventListener('click', closeCropper);
  document.getElementById('wechat-cropper-confirm')?.addEventListener('click', confirmCrop);

  // 裁剪框拖拽事件
  const cropperBox = document.getElementById('wechat-cropper-box');
  if (cropperBox) {
    cropperBox.addEventListener('mousedown', handleCropBoxMouseDown);
    cropperBox.addEventListener('touchstart', handleCropBoxTouchStart, { passive: false });
  }

  // 全局移动和释放事件
  document.addEventListener('mousemove', handleCropperMouseMove);
  document.addEventListener('mouseup', handleCropperMouseUp);
  document.addEventListener('touchmove', handleCropperTouchMove, { passive: false });
  document.addEventListener('touchend', handleCropperTouchEnd);

  // 调整大小手柄
  document.querySelectorAll('.wechat-cropper-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => handleResizeStart(e, handle));
    handle.addEventListener('touchstart', (e) => handleResizeTouchStart(e, handle), { passive: false });
  });
}

// 显示背景设置面板
export function showChatBgPanel() {
  const panel = document.getElementById('wechat-chat-bg-panel');
  const preview = document.getElementById('wechat-chat-bg-preview');

  if (!panel || !preview) return;

  // 获取当前联系人的背景
  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];

  if (contact?.chatBackground) {
    preview.innerHTML = `<img src="${contact.chatBackground}" alt="背景预览">`;
  } else {
    preview.innerHTML = '<span class="wechat-chat-bg-placeholder">暂无背景</span>';
  }

  // 关闭其他面板
  document.getElementById('wechat-recalled-panel')?.classList.add('hidden');
  panel.classList.remove('hidden');
}

// 处理背景图片选择
async function handleBgFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const reader = new FileReader();
    reader.onload = function(event) {
      openCropper(event.target.result);
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('[可乐] 读取背景图片失败:', err);
    showToast('读取图片失败', '⚠️');
  }

  e.target.value = '';
}

// 打开裁剪器
function openCropper(imageSrc) {
  const modal = document.getElementById('wechat-cropper-modal');
  const canvas = document.getElementById('wechat-cropper-canvas');
  const container = document.getElementById('wechat-cropper-container');

  if (!modal || !canvas || !container) return;

  const img = new Image();
  img.onload = function() {
    cropperState.image = img;
    cropperState.canvas = canvas;
    cropperState.ctx = canvas.getContext('2d');

    // 计算画布尺寸（适应容器）
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width || 300;
    const containerHeight = 300;

    const scale = Math.min(containerWidth / img.width, containerHeight / img.height);
    const displayWidth = img.width * scale;
    const displayHeight = img.height * scale;

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    cropperState.imageWidth = displayWidth;
    cropperState.imageHeight = displayHeight;
    cropperState.imageX = (containerWidth - displayWidth) / 2;
    cropperState.imageY = (containerHeight - displayHeight) / 2;

    // 绘制图片
    cropperState.ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

    // 初始化裁剪框（居中，9:16比例）
    const boxHeight = Math.min(displayHeight * 0.8, 250);
    const boxWidth = boxHeight * 9 / 16;
    cropperState.cropBox = {
      x: (displayWidth - boxWidth) / 2,
      y: (displayHeight - boxHeight) / 2,
      width: boxWidth,
      height: boxHeight
    };

    updateCropBoxUI();
    modal.classList.remove('hidden');
  };

  img.onerror = function() {
    showToast('图片加载失败', '⚠️');
  };

  img.src = imageSrc;
}

// 更新裁剪框UI
function updateCropBoxUI() {
  const cropBox = document.getElementById('wechat-cropper-box');
  const canvas = cropperState.canvas;

  if (!cropBox || !canvas) return;

  // 获取画布在容器中的位置
  const container = document.getElementById('wechat-cropper-container');
  const containerRect = container.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const offsetX = canvasRect.left - containerRect.left;
  const offsetY = canvasRect.top - containerRect.top;

  cropBox.style.left = (cropperState.cropBox.x + offsetX) + 'px';
  cropBox.style.top = (cropperState.cropBox.y + offsetY) + 'px';
  cropBox.style.width = cropperState.cropBox.width + 'px';
  cropBox.style.height = cropperState.cropBox.height + 'px';
}

// 裁剪框拖拽开始
function handleCropBoxMouseDown(e) {
  if (e.target.classList.contains('wechat-cropper-handle')) return;

  e.preventDefault();
  cropperState.isDragging = true;
  cropperState.dragStart = { x: e.clientX, y: e.clientY };
  cropperState.boxStart = { ...cropperState.cropBox };
}

function handleCropBoxTouchStart(e) {
  if (e.target.classList.contains('wechat-cropper-handle')) return;

  e.preventDefault();
  const touch = e.touches[0];
  cropperState.isDragging = true;
  cropperState.dragStart = { x: touch.clientX, y: touch.clientY };
  cropperState.boxStart = { ...cropperState.cropBox };
}

// 调整大小开始
function handleResizeStart(e, handle) {
  e.preventDefault();
  e.stopPropagation();
  cropperState.isResizing = true;
  cropperState.resizeHandle = handle.classList.contains('nw') ? 'nw' :
                              handle.classList.contains('ne') ? 'ne' :
                              handle.classList.contains('sw') ? 'sw' : 'se';
  cropperState.dragStart = { x: e.clientX, y: e.clientY };
  cropperState.boxStart = { ...cropperState.cropBox };
}

function handleResizeTouchStart(e, handle) {
  e.preventDefault();
  e.stopPropagation();
  const touch = e.touches[0];
  cropperState.isResizing = true;
  cropperState.resizeHandle = handle.classList.contains('nw') ? 'nw' :
                              handle.classList.contains('ne') ? 'ne' :
                              handle.classList.contains('sw') ? 'sw' : 'se';
  cropperState.dragStart = { x: touch.clientX, y: touch.clientY };
  cropperState.boxStart = { ...cropperState.cropBox };
}

// 鼠标移动
function handleCropperMouseMove(e) {
  if (!cropperState.isDragging && !cropperState.isResizing) return;

  const dx = e.clientX - cropperState.dragStart.x;
  const dy = e.clientY - cropperState.dragStart.y;

  if (cropperState.isDragging) {
    moveCropBox(dx, dy);
  } else if (cropperState.isResizing) {
    resizeCropBox(dx, dy);
  }
}

function handleCropperTouchMove(e) {
  if (!cropperState.isDragging && !cropperState.isResizing) return;

  e.preventDefault();
  const touch = e.touches[0];
  const dx = touch.clientX - cropperState.dragStart.x;
  const dy = touch.clientY - cropperState.dragStart.y;

  if (cropperState.isDragging) {
    moveCropBox(dx, dy);
  } else if (cropperState.isResizing) {
    resizeCropBox(dx, dy);
  }
}

// 移动裁剪框
function moveCropBox(dx, dy) {
  let newX = cropperState.boxStart.x + dx;
  let newY = cropperState.boxStart.y + dy;

  // 限制在画布范围内
  newX = Math.max(0, Math.min(newX, cropperState.imageWidth - cropperState.cropBox.width));
  newY = Math.max(0, Math.min(newY, cropperState.imageHeight - cropperState.cropBox.height));

  cropperState.cropBox.x = newX;
  cropperState.cropBox.y = newY;
  updateCropBoxUI();
}

// 调整裁剪框大小
function resizeCropBox(dx, dy) {
  const minSize = 50;
  const handle = cropperState.resizeHandle;
  let { x, y, width, height } = cropperState.boxStart;

  if (handle === 'se') {
    width = Math.max(minSize, width + dx);
    height = Math.max(minSize, height + dy);
  } else if (handle === 'sw') {
    const newWidth = Math.max(minSize, width - dx);
    x = x + (width - newWidth);
    width = newWidth;
    height = Math.max(minSize, height + dy);
  } else if (handle === 'ne') {
    width = Math.max(minSize, width + dx);
    const newHeight = Math.max(minSize, height - dy);
    y = y + (height - newHeight);
    height = newHeight;
  } else if (handle === 'nw') {
    const newWidth = Math.max(minSize, width - dx);
    const newHeight = Math.max(minSize, height - dy);
    x = x + (width - newWidth);
    y = y + (height - newHeight);
    width = newWidth;
    height = newHeight;
  }

  // 限制在画布范围内
  x = Math.max(0, x);
  y = Math.max(0, y);
  if (x + width > cropperState.imageWidth) width = cropperState.imageWidth - x;
  if (y + height > cropperState.imageHeight) height = cropperState.imageHeight - y;

  cropperState.cropBox = { x, y, width, height };
  updateCropBoxUI();
}

// 鼠标释放
function handleCropperMouseUp() {
  cropperState.isDragging = false;
  cropperState.isResizing = false;
}

function handleCropperTouchEnd() {
  cropperState.isDragging = false;
  cropperState.isResizing = false;
}

// 关闭裁剪器
function closeCropper() {
  document.getElementById('wechat-cropper-modal')?.classList.add('hidden');
  cropperState.image = null;
}

// 确认裁剪
function confirmCrop() {
  if (!cropperState.image || !cropperState.canvas) {
    showToast('裁剪失败', '⚠️');
    return;
  }

  // 计算原图裁剪区域
  const scaleX = cropperState.image.width / cropperState.imageWidth;
  const scaleY = cropperState.image.height / cropperState.imageHeight;

  const cropX = cropperState.cropBox.x * scaleX;
  const cropY = cropperState.cropBox.y * scaleY;
  const cropWidth = cropperState.cropBox.width * scaleX;
  const cropHeight = cropperState.cropBox.height * scaleY;

  // 创建裁剪后的画布
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = cropWidth;
  outputCanvas.height = cropHeight;
  const outputCtx = outputCanvas.getContext('2d');

  outputCtx.drawImage(
    cropperState.image,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  // 转为DataURL并保存
  const croppedImage = outputCanvas.toDataURL('image/jpeg', 0.85);
  saveChatBackground(croppedImage);

  closeCropper();
  document.getElementById('wechat-chat-bg-panel')?.classList.add('hidden');
}

// 保存聊天背景
function saveChatBackground(imageData) {
  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];

  if (!contact) {
    showToast('保存失败', '⚠️');
    return;
  }

  contact.chatBackground = imageData;
  requestSave();

  // 立即应用背景
  applyChatBackground(imageData);
  showToast('背景已设置');
}

// 清除聊天背景
function clearChatBackground() {
  const settings = getSettings();
  const contact = settings.contacts[currentChatIndex];

  if (!contact) return;

  delete contact.chatBackground;
  requestSave();

  // 清除背景
  applyChatBackground(null);

  // 更新预览
  const preview = document.getElementById('wechat-chat-bg-preview');
  if (preview) {
    preview.innerHTML = '<span class="wechat-chat-bg-placeholder">暂无背景</span>';
  }

  document.getElementById('wechat-chat-bg-panel')?.classList.add('hidden');
  showToast('背景已清除');
}

// 应用聊天背景
export function applyChatBackground(imageData) {
  const messagesContainer = document.getElementById('wechat-chat-messages');
  if (!messagesContainer) return;

  if (imageData) {
    messagesContainer.style.backgroundImage = `url(${imageData})`;
  } else {
    messagesContainer.style.backgroundImage = '';
  }
}

// 加载当前联系人的背景（openChat时调用）
export function loadContactBackground(contactIndex) {
  const settings = getSettings();
  const contact = settings.contacts[contactIndex];

  if (contact?.chatBackground) {
    applyChatBackground(contact.chatBackground);
  } else {
    applyChatBackground(null);
  }
}
