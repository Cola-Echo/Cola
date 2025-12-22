/**
 * 通用图片裁剪器模块
 * 支持不同比例的裁剪（头像1:1, 封面16:9等）
 */

import { showToast } from './toast.js';

// 裁剪器状态
let cropperState = {
  image: null,
  canvas: null,
  ctx: null,
  imageWidth: 0,
  imageHeight: 0,
  imageX: 0,
  imageY: 0,
  cropBox: { x: 0, y: 0, width: 100, height: 100 },
  isDragging: false,
  isResizing: false,
  dragStart: { x: 0, y: 0 },
  boxStart: { x: 0, y: 0, width: 0, height: 0 },
  resizeHandle: null,
  aspectRatio: 1, // 宽高比
  callback: null  // 裁剪完成回调
};

/**
 * 初始化裁剪器事件
 */
export function initCropper() {
  // 取消按钮
  document.getElementById('wechat-cropper-cancel')?.addEventListener('click', closeCropper);

  // 确认按钮
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

  // 四角拖拽手柄
  document.querySelectorAll('.wechat-cropper-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => handleResizeStart(e, handle));
    handle.addEventListener('touchstart', (e) => handleResizeTouchStart(e, handle), { passive: false });
  });
}

/**
 * 打开裁剪器
 * @param {string} imageSrc - 图片数据URL
 * @param {number} aspectRatio - 宽高比 (例如 1 表示 1:1, 16/9 表示 16:9)
 * @param {function} callback - 裁剪完成回调函数，接收裁剪后的base64图片
 */
export function openCropper(imageSrc, aspectRatio = 1, callback = null) {
  const modal = document.getElementById('wechat-cropper-modal');
  const canvas = document.getElementById('wechat-cropper-canvas');
  const container = document.getElementById('wechat-cropper-container');

  if (!modal || !canvas || !container) return;

  cropperState.aspectRatio = aspectRatio;
  cropperState.callback = callback;

  const img = new Image();
  img.onload = () => {
    cropperState.image = img;
    cropperState.canvas = canvas;
    cropperState.ctx = canvas.getContext('2d');

    // 计算适应容器的尺寸
    const containerWidth = container.clientWidth || 320;
    const containerHeight = container.clientHeight || 320;

    const scale = Math.min(
      containerWidth / img.width,
      containerHeight / img.height
    );

    const displayWidth = img.width * scale;
    const displayHeight = img.height * scale;

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    cropperState.imageWidth = displayWidth;
    cropperState.imageHeight = displayHeight;
    cropperState.imageX = (containerWidth - displayWidth) / 2;
    cropperState.imageY = (containerHeight - displayHeight) / 2;

    cropperState.ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

    // 初始化裁剪框（居中，保持比例）
    initCropBox();

    modal.classList.remove('hidden');
    updateCropBoxUI();
  };
  img.src = imageSrc;
}

/**
 * 根据宽高比初始化裁剪框
 */
function initCropBox() {
  const { imageWidth, imageHeight, aspectRatio } = cropperState;

  let boxWidth, boxHeight;

  if (aspectRatio >= 1) {
    // 宽 >= 高的比例（如 1:1, 16:9）
    boxWidth = Math.min(imageWidth * 0.8, imageHeight * 0.8 * aspectRatio);
    boxHeight = boxWidth / aspectRatio;
  } else {
    // 高 > 宽的比例（如 9:16）
    boxHeight = Math.min(imageHeight * 0.8, imageWidth * 0.8 / aspectRatio);
    boxWidth = boxHeight * aspectRatio;
  }

  // 确保裁剪框不超过图片边界
  boxWidth = Math.min(boxWidth, imageWidth);
  boxHeight = Math.min(boxHeight, imageHeight);

  cropperState.cropBox = {
    x: (imageWidth - boxWidth) / 2,
    y: (imageHeight - boxHeight) / 2,
    width: boxWidth,
    height: boxHeight
  };
}

/**
 * 更新裁剪框UI
 */
function updateCropBoxUI() {
  const cropBox = document.getElementById('wechat-cropper-box');
  const canvas = cropperState.canvas;

  if (!cropBox || !canvas) return;

  const container = document.getElementById('wechat-cropper-container');
  if (!container) return;

  // 计算偏移（使裁剪框相对于容器居中的canvas）
  const offsetX = (container.clientWidth - canvas.width) / 2;
  const offsetY = (container.clientHeight - canvas.height) / 2;

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

// 四角拖拽开始
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

  // 限制在图片范围内
  newX = Math.max(0, Math.min(newX, cropperState.imageWidth - cropperState.cropBox.width));
  newY = Math.max(0, Math.min(newY, cropperState.imageHeight - cropperState.cropBox.height));

  cropperState.cropBox.x = newX;
  cropperState.cropBox.y = newY;
  updateCropBoxUI();
}

// 调整裁剪框大小（保持宽高比）
function resizeCropBox(dx, dy) {
  const { aspectRatio } = cropperState;
  const handle = cropperState.resizeHandle;
  let { x, y, width, height } = cropperState.boxStart;

  // 根据拖动的角计算新尺寸
  let delta;

  switch (handle) {
    case 'se': // 右下角
      delta = Math.max(dx, dy / aspectRatio);
      width = Math.max(50, width + delta);
      height = width / aspectRatio;
      break;
    case 'sw': // 左下角
      delta = Math.max(-dx, dy / aspectRatio);
      width = Math.max(50, width + delta);
      height = width / aspectRatio;
      x = cropperState.boxStart.x + cropperState.boxStart.width - width;
      break;
    case 'ne': // 右上角
      delta = Math.max(dx, -dy / aspectRatio);
      width = Math.max(50, width + delta);
      height = width / aspectRatio;
      y = cropperState.boxStart.y + cropperState.boxStart.height - height;
      break;
    case 'nw': // 左上角
      delta = Math.max(-dx, -dy / aspectRatio);
      width = Math.max(50, width + delta);
      height = width / aspectRatio;
      x = cropperState.boxStart.x + cropperState.boxStart.width - width;
      y = cropperState.boxStart.y + cropperState.boxStart.height - height;
      break;
  }

  // 限制边界
  if (x < 0) {
    width = width + x;
    height = width / aspectRatio;
    x = 0;
  }
  if (y < 0) {
    height = height + y;
    width = height * aspectRatio;
    y = 0;
  }
  if (x + width > cropperState.imageWidth) {
    width = cropperState.imageWidth - x;
    height = width / aspectRatio;
  }
  if (y + height > cropperState.imageHeight) {
    height = cropperState.imageHeight - y;
    width = height * aspectRatio;
  }

  // 最小尺寸限制
  if (width < 50 || height < 50) return;

  cropperState.cropBox = { x, y, width, height };
  updateCropBoxUI();
}

function handleCropperMouseUp() {
  cropperState.isDragging = false;
  cropperState.isResizing = false;
}

function handleCropperTouchEnd() {
  cropperState.isDragging = false;
  cropperState.isResizing = false;
}

/**
 * 关闭裁剪器
 */
export function closeCropper() {
  document.getElementById('wechat-cropper-modal')?.classList.add('hidden');
  cropperState.image = null;
  cropperState.callback = null;
}

/**
 * 确认裁剪
 */
function confirmCrop() {
  if (!cropperState.image || !cropperState.canvas) {
    showToast('裁剪失败', 'info');
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
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedCtx = croppedCanvas.getContext('2d');

  croppedCtx.drawImage(
    cropperState.image,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  const croppedDataUrl = croppedCanvas.toDataURL('image/jpeg', 0.9);

  // 调用回调
  if (cropperState.callback) {
    cropperState.callback(croppedDataUrl);
  }

  closeCropper();
}

/**
 * 便捷方法：选择文件并打开裁剪器
 * @param {number} aspectRatio - 宽高比
 * @param {function} callback - 裁剪完成回调
 */
export function selectAndCrop(aspectRatio, callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        openCropper(event.target.result, aspectRatio, callback);
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
}
