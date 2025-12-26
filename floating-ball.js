/**
 * 悬浮球组件
 * 可爱猫咪悬浮窗，支持拖拽，点击打开主界面
 */

import { getSettings } from './config.js';
import { requestSave } from './save-manager.js';

// 悬浮球状态
let floatingBallState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  initialX: 0,
  initialY: 0,
  currentX: 0,
  currentY: 0,
  hasMoved: false
};

// SVG 图标 - 渐变圆圈和猫咪
const FLOATING_BALL_SVG = `
<svg viewBox="0 0 100 100" width="60" height="60" class="floating-ball-svg">
  <defs>
    <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FFB6C1;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#FFC0CB;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFEFD5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- 渐变圆圈 -->
  <circle cx="50" cy="50" r="44" fill="none" stroke="url(#ring-gradient)" stroke-width="5" stroke-linecap="round"/>
  <!-- 猫咪头部轮廓 -->
  <g transform="translate(50, 52)" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- 头部 -->
    <ellipse cx="0" cy="0" rx="22" ry="18"/>
    <!-- 左耳 -->
    <path d="M-18,-12 L-22,-24 L-12,-16"/>
    <!-- 右耳 -->
    <path d="M18,-12 L22,-24 L12,-16"/>
    <!-- 内耳（粉色填充） -->
    <path d="M-17,-14 L-19,-21 L-13,-16" fill="#FFB6C1" stroke="none"/>
    <path d="M17,-14 L19,-21 L13,-16" fill="#FFB6C1" stroke="none"/>
    <!-- 左眼 -->
    <circle cx="-8" cy="-2" r="3" fill="#333"/>
    <!-- 右眼 -->
    <circle cx="8" cy="-2" r="3" fill="#333"/>
    <!-- 鼻子 -->
    <ellipse cx="0" cy="6" rx="2" ry="1.5" fill="#FFB6C1"/>
    <!-- 嘴巴 -->
    <path d="M0,7 Q-4,12 -8,9" fill="none"/>
    <path d="M0,7 Q4,12 8,9" fill="none"/>
    <!-- 腮红 -->
    <ellipse cx="-14" cy="4" rx="4" ry="3" fill="#FFB6C1" opacity="0.5" stroke="none"/>
    <ellipse cx="14" cy="4" rx="4" ry="3" fill="#FFB6C1" opacity="0.5" stroke="none"/>
    <!-- 胡须 -->
    <path d="M-24,0 L-12,2"/>
    <path d="M-24,6 L-12,5"/>
    <path d="M24,0 L12,2"/>
    <path d="M24,6 L12,5"/>
  </g>
</svg>
`;

// 创建悬浮球
export function createFloatingBall() {
  // 检查是否已存在
  if (document.getElementById('wechat-floating-ball')) {
    return;
  }

  const ball = document.createElement('div');
  ball.id = 'wechat-floating-ball';
  ball.className = 'wechat-floating-ball';
  ball.innerHTML = FLOATING_BALL_SVG;

  document.body.appendChild(ball);

  // 恢复位置
  restorePosition(ball);

  // 绑定事件
  bindFloatingBallEvents(ball);

  // 根据主界面状态设置悬浮球可见性
  updateFloatingBallVisibility();

  return ball;
}

// 恢复保存的位置
function restorePosition(ball) {
  const settings = getSettings();
  const savedPos = settings.floatingBallPosition;

  if (savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
    // 确保位置在视口内
    const maxX = window.innerWidth - 60;
    const maxY = window.innerHeight - 60;
    floatingBallState.currentX = Math.min(Math.max(0, savedPos.x), maxX);
    floatingBallState.currentY = Math.min(Math.max(0, savedPos.y), maxY);
  } else {
    // 默认位置：右侧中间
    floatingBallState.currentX = window.innerWidth - 80;
    floatingBallState.currentY = (window.innerHeight - 60) / 2;
  }

  ball.style.left = floatingBallState.currentX + 'px';
  ball.style.top = floatingBallState.currentY + 'px';
}

// 保存位置
function savePosition() {
  const settings = getSettings();
  settings.floatingBallPosition = {
    x: floatingBallState.currentX,
    y: floatingBallState.currentY
  };
  requestSave();
}

// 绑定事件
function bindFloatingBallEvents(ball) {
  // 鼠标事件
  ball.addEventListener('mousedown', onDragStart);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  // 触摸事件
  ball.addEventListener('touchstart', onDragStart, { passive: false });
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);

  // 窗口大小变化时调整位置
  window.addEventListener('resize', () => {
    const maxX = window.innerWidth - 60;
    const maxY = window.innerHeight - 60;
    if (floatingBallState.currentX > maxX) {
      floatingBallState.currentX = maxX;
      ball.style.left = floatingBallState.currentX + 'px';
    }
    if (floatingBallState.currentY > maxY) {
      floatingBallState.currentY = maxY;
      ball.style.top = floatingBallState.currentY + 'px';
    }
  });
}

// 开始拖拽
function onDragStart(e) {
  const ball = document.getElementById('wechat-floating-ball');
  if (!ball) return;

  floatingBallState.isDragging = true;
  floatingBallState.hasMoved = false;

  // 获取起始位置
  if (e.type === 'touchstart') {
    floatingBallState.startX = e.touches[0].clientX;
    floatingBallState.startY = e.touches[0].clientY;
    e.preventDefault();
  } else {
    floatingBallState.startX = e.clientX;
    floatingBallState.startY = e.clientY;
  }

  floatingBallState.initialX = floatingBallState.currentX;
  floatingBallState.initialY = floatingBallState.currentY;

  ball.classList.add('dragging');
}

// 拖拽移动
function onDragMove(e) {
  if (!floatingBallState.isDragging) return;

  const ball = document.getElementById('wechat-floating-ball');
  if (!ball) return;

  let clientX, clientY;
  if (e.type === 'touchmove') {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
    e.preventDefault();
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const deltaX = clientX - floatingBallState.startX;
  const deltaY = clientY - floatingBallState.startY;

  // 如果移动距离超过5px，认为是拖拽而非点击
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    floatingBallState.hasMoved = true;
  }

  // 计算新位置
  let newX = floatingBallState.initialX + deltaX;
  let newY = floatingBallState.initialY + deltaY;

  // 限制在视口内
  const maxX = window.innerWidth - 60;
  const maxY = window.innerHeight - 60;
  newX = Math.min(Math.max(0, newX), maxX);
  newY = Math.min(Math.max(0, newY), maxY);

  floatingBallState.currentX = newX;
  floatingBallState.currentY = newY;

  ball.style.left = newX + 'px';
  ball.style.top = newY + 'px';
}

// 结束拖拽
function onDragEnd(e) {
  if (!floatingBallState.isDragging) return;

  const ball = document.getElementById('wechat-floating-ball');
  if (ball) {
    ball.classList.remove('dragging');
  }

  floatingBallState.isDragging = false;

  // 如果没有移动，视为点击
  if (!floatingBallState.hasMoved) {
    toggleMainInterface();
  } else {
    // 保存位置
    savePosition();
  }
}

// 切换主界面显示
function toggleMainInterface() {
  const phone = document.getElementById('wechat-phone');
  if (!phone) return;

  const isHidden = phone.classList.contains('hidden');

  if (isHidden) {
    phone.classList.remove('hidden');
  } else {
    phone.classList.add('hidden');
  }

  // 更新设置
  const settings = getSettings();
  settings.phoneVisible = isHidden;
  requestSave();

  // 更新悬浮球状态
  updateFloatingBallVisibility();
}

// 更新悬浮球可见性（主界面显示时隐藏悬浮球，反之显示）
export function updateFloatingBallVisibility() {
  const ball = document.getElementById('wechat-floating-ball');
  const phone = document.getElementById('wechat-phone');

  if (!ball) return;

  // 主界面隐藏时显示悬浮球，主界面显示时也显示悬浮球（方便用户随时关闭）
  ball.style.display = 'flex';
}

// 显示悬浮球
export function showFloatingBall() {
  const ball = document.getElementById('wechat-floating-ball');
  if (ball) {
    ball.style.display = 'flex';
  }
}

// 隐藏悬浮球
export function hideFloatingBall() {
  const ball = document.getElementById('wechat-floating-ball');
  if (ball) {
    ball.style.display = 'none';
  }
}

// 销毁悬浮球
export function destroyFloatingBall() {
  const ball = document.getElementById('wechat-floating-ball');
  if (ball) {
    ball.remove();
  }
}
