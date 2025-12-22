/**
 * 与 SillyTavern 的集成：作者注释注入、监听主聊天消息、扩展菜单按钮
 */

import { getContext } from '../../../extensions.js';
import { authorNoteTemplate, extensionName, getSettings } from './config.js';
import { showToast } from './toast.js';
import { togglePhone } from './phone.js';
import { parseWeChatMessage } from './utils.js';

// 注入作者注释（微信格式指南）
export function injectAuthorNote() {
  try {
    const settings = getSettings();
    // 优先使用自定义模板
    const template = settings.authorNoteCustom || authorNoteTemplate;

    const context = getContext();
    if (context?.setExtensionPrompt) {
      context.setExtensionPrompt(extensionName, template, 1, 0);
      showToast('微信格式提示已注入');
      return;
    }

    const authorNoteTextarea = document.querySelector('#author_note_text');
    if (authorNoteTextarea) {
      authorNoteTextarea.value = template;
      authorNoteTextarea.dispatchEvent(new Event('input'));
      showToast('微信格式提示已注入');
      return;
    }

    showToast('无法找到作者注释区域', 'info');
    console.log('作者注释模板：', template);
  } catch (err) {
    console.error('[可乐] 注入作者注释失败:', err);
    showToast('注入失败，请手动添加', '⚠️');
  }
}

// 监听酒馆主聊天消息更新（用于识别微信格式）
export function setupMessageObserver() {
  const context = getContext();
  if (!context) return;

  const chatContainer = document.getElementById('chat');
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList?.contains('mes')) {
          const mesText = node.querySelector('.mes_text');
          if (!mesText) return;

          const wechatMessages = parseWeChatMessage(mesText.textContent);
          if (wechatMessages.length > 0) {
            console.log('检测到微信格式消息:', wechatMessages);
          }
        }
      });
    });
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
}

// 添加扩展按钮到酒馆扩展菜单
export function addExtensionButton() {
  console.log('[可乐] 开始添加扩展按钮...');

  // 方法1: 直接查找 extensionsMenu (legacy 方式)
  const extensionsMenu = document.getElementById('extensionsMenu');
  if (extensionsMenu) {
    console.log('[可乐] 找到 extensionsMenu');
    addMenuItemToMenu(extensionsMenu);
    return;
  }

  // 方法2: 监听魔法棒点击
  const wandButton = document.getElementById('extensionsMenuButton');
  if (wandButton) {
    console.log('[可乐] 找到魔法棒按钮，添加点击监听');
    wandButton.addEventListener('click', () => {
      console.log('[可乐] 魔法棒被点击');
      // 多次尝试，因为菜单可能需要时间渲染
      setTimeout(tryAddMenuItem, 10);
      setTimeout(tryAddMenuItem, 50);
      setTimeout(tryAddMenuItem, 100);
      setTimeout(tryAddMenuItem, 200);
    });
  } else {
    console.log('[可乐] 未找到魔法棒按钮，500ms后重试');
    setTimeout(addExtensionButton, 500);
  }
}

// 尝试添加菜单项
function tryAddMenuItem() {
  if (document.getElementById('wechat-extension-menu-item')) {
    console.log('[可乐] 菜单项已存在');
    return;
  }

  // 遍历所有元素，找包含特定文本的菜单
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    // 查找直接包含菜单项文本的容器
    if (el.children.length > 3 && el.children.length < 30) {
      const text = el.textContent || '';
      if ((text.includes('打开数据库') || text.includes('Open DB') || text.includes('附加文件') || text.includes('Attach File'))
          && !text.includes('可乐')) {
        console.log('[可乐] 找到菜单容器:', el.tagName, el.className);
        addMenuItemToMenu(el);
        return;
      }
    }
  }
  console.log('[可乐] 未找到合适的菜单容器');
}

// 添加菜单项到菜单
function addMenuItemToMenu(menu) {
  if (document.getElementById('wechat-extension-menu-item')) return;

  const menuItem = document.createElement('div');
  menuItem.id = 'wechat-extension-menu-item';
  menuItem.className = 'list-group-item flex-container flexGap5';
  menuItem.innerHTML = `
    <span class="fa-solid fa-comment-dots"></span>
    可乐
  `;
  menuItem.style.cursor = 'pointer';
  menuItem.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePhone();
    menu.style.display = 'none';
  });

  menu.appendChild(menuItem);
  console.log('[可乐] ✅ 扩展按钮已添加!');
}
