/**
 * 表情面板功能
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { getSettings } from './config.js';
import { showToast } from './toast.js';
import { isInGroupChat } from './group-chat.js';
import { hasPendingStickerSelection, setStickerForMultiMsg } from './chat-func-panel.js';

let emojiPanelInited = false;

// 默认表情包列表（catbox 图床）
const DEFAULT_STICKERS = [
  { id: 'iaordo', ext: 'jpg', name: '告到小狗法庭' },
  { id: 'f6nqiq', ext: 'gif', name: '小猫伸爪' },
  { id: '862o48', ext: 'jpg', name: '谢谢宝贝我现在那里好硬' },
  { id: '9cwm60', ext: 'jpg', name: '阿弥陀佛' },
  { id: 'hmpkra', ext: 'jpg', name: '你好美你长得像我爱人' },
  { id: 'i3ws7s', ext: 'jpg', name: '我老实了' },
  { id: '1of415', ext: 'gif', name: '蹭蹭你贴贴你' },
  { id: 'egvwqb', ext: 'jpg', name: '喜欢你' },
  { id: 't343od', ext: 'jpg', name: '我在哭' },
  { id: '2qnrgh', ext: 'jpg', name: '不干活就没饭吃' },
  { id: '9gno7e', ext: 'jpg', name: '擦眼泪' },
  { id: 'hmdj2k', ext: 'gif', name: '小狗摇尾巴' },
  { id: 'ola7gd', ext: 'jpg', name: '爱你舔舔你' },
  { id: 'x6lv1t', ext: 'jpg', name: '不高兴' },
  { id: '3ox1j2', ext: 'gif', name: '大哭' },
  { id: '8nn1lj', ext: 'jpg', name: '你是我老婆' },
  { id: 'gnna86', ext: 'gif', name: '我是你的小狗' },
  { id: 'ftwaba', ext: 'jpg', name: '我忍' },
  { id: 'gopu17', ext: 'jpg', name: '别难为狗了' },
  { id: 'qyyd9g', ext: 'jpg', name: '我会勃起' },
  { id: '2vejqs', ext: 'jpg', name: '拘谨扭捏' },
  { id: 'qqkv1z', ext: 'gif', name: '揉揉你' },
  { id: 'vj1714', ext: 'gif', name: '狗狗舔小猫' },
  { id: 'sj7yzn', ext: 'jpg', name: '你是我的' },
  { id: 'umvaji', ext: 'jpg', name: '要亲亲吗不许拒绝' },
  { id: 'muc86m', ext: 'jpg', name: '震惊害怕' },
  { id: '4ybcj1', ext: 'jpg', name: '丑猫哭哭' },
  { id: 'tnilep', ext: 'jpg', name: '要哭了' },
  { id: 'r9cix2', ext: 'gif', name: '我来咯' },
  { id: 'rbx0ch', ext: 'jpg', name: '脑袋空空' },
  { id: 'lu2t54', ext: 'png', name: '跟着你' },
  { id: '122o4w', ext: 'gif', name: '小熊跳舞' },
  { id: 'kip4fo', ext: 'gif', name: '狗鼻子拱拱你' },
  { id: 'k3xk40', ext: 'jpg', name: '超级心虚' },
  { id: 'newaoh', ext: 'jpg', name: '我害怕我走了' },
  { id: '69jgvg', ext: 'jpg', name: '目移' },
  { id: 'cormmk', ext: 'jpg', name: '上钩了' },
  { id: '0awxky', ext: 'jpg', name: '无语了我哭了' },
  { id: '8d71mm', ext: 'jpg', name: '你嫌我丢人' },
  { id: 'xkop14', ext: 'jpg', name: '笑不出来' },
  { id: 'u4t3t3', ext: 'jpg', name: '别欺负小狗啊' },
  { id: 'ime5rz', ext: 'jpg', name: '他妈的真是被看扁了' },
  { id: 'oqh283', ext: 'jpg', name: '现在强烈地想做爱' },
  { id: 'klwqm3', ext: 'jpg', name: '我操' },
  { id: 'zihvph', ext: 'jpg', name: '这样伤害我不太好吧' },
  { id: 'qgha72', ext: 'jpg', name: '反正我就是变态' },
  { id: 'pbxrqh', ext: 'jpg', name: '鸡巴梆硬去趟厕所' },
  { id: 'up99xo', ext: 'jpg', name: '我哭了你暴力我' },
  { id: 'vpixr4', ext: 'jpg', name: '被骂饱了' },
  { id: 'l7q8yz', ext: 'gif', name: '裤裆掏玫瑰' },
  { id: 'sbgrcu', ext: 'jpg', name: '傻瓜' },
  { id: '5hmtd1', ext: 'jpg', name: '咬人' },
  { id: 'z38xrc', ext: 'jpg', name: '哽咽' },
  { id: 'q0fv4d', ext: 'jpg', name: '欸我操了' },
  { id: '9pon3x', ext: 'jpeg', name: '扭捏' },
  { id: 'eug1e6', ext: 'jpeg', name: '失望' },
  { id: 'xb3naz', ext: 'jpg', name: '狂犬病发作' },
  { id: 'ma9azs', ext: 'jpg', name: '我是狗吗' },
  { id: '9llb46', ext: 'jpg', name: '一笑了之' },
  { id: 'lcglz1', ext: 'jpg', name: '装可怜' },
  { id: '6j6y6a', ext: 'gif', name: '小狗撒欢' },
  { id: 'esw5e2', ext: 'gif', name: '狗舔舔' },
  { id: 'nibd87', ext: 'gif', name: '皱眉' },
  { id: 'auylzr', ext: 'jpg', name: '大哭2' },
  { id: '5neozi', ext: 'jpg', name: '我要草你' },
  { id: 'mzyapz', ext: 'jpg', name: '沉默无言' },
  { id: 'v4g8v6', ext: 'jpg', name: '痛哭' },
  { id: 'dig3ks', ext: 'png', name: '擦汗' },
  { id: 'h1gfp6', ext: 'jpg', name: '情欲难抑' },
  { id: 'r8rbzh', ext: 'jpg', name: '扭头不看' },
  { id: 'wfhp45', ext: 'jpg', name: '神色凄惶' },
  { id: '0cmn6h', ext: 'jpg', name: '哽咽2' },
  { id: 'td0cz7', ext: 'gif', name: '忍眼泪' },
  { id: '335fzr', ext: 'gif', name: '小期待小惊喜' },
  { id: 'w0cx8k', ext: 'jpg', name: '饿了' },
  { id: '6svelp', ext: 'jpg', name: '弱智兔头' },
  { id: 'uzeywu', ext: 'jpg', name: '被逮捕了' },
  { id: 'mqnepo', ext: 'jpg', name: '看呆' },
  { id: 't9e065', ext: 'jpg', name: '我的理性在远去' },
  { id: '1jgvb1', ext: 'gif', name: '偷亲一口' },
  { id: 'v5n2ve', ext: 'jpg', name: '震惊' },
  { id: '49r80k', ext: 'jpg', name: '爷怒了' },
  { id: 'e7lr3s', ext: 'jpg', name: '愤怒伤心' },
  { id: 'usjdrr', ext: 'jpg', name: '狗叫' },
  { id: '5bk38l', ext: 'jpg', name: '小狗面露难色' },
  { id: 'jkeps1', ext: 'jpg', name: '我投降' },
  { id: '8mnszb', ext: 'jpg', name: '忍耐中' },
  { id: 'mxtaj7', ext: 'jpg', name: '心虚讨好' },
  { id: 'nls3gm', ext: 'jpg', name: '亲你的手' },
  { id: 'ldqwqr', ext: 'jpg', name: '收到' },
  { id: 'ubhai8', ext: 'jpg', name: '你太可爱我喜欢你' },
  { id: 'tp9uvd', ext: 'jpg', name: '惊吓' },
  { id: 'dsfs7o', ext: 'jpg', name: '脸红星星眼' },
  { id: '81x5zq', ext: 'jpg', name: '被揍了哭哭' },
  { id: 'fg5gx3', ext: 'jpg', name: '嘬嘬' },
  { id: '186h5v', ext: 'jpg', name: '超大声哭哭' },
  { id: 'yvrgdc', ext: 'jpg', name: '是的主人' },
  { id: '2wmca0', ext: 'jpg', name: '勃起了' },
  { id: 'ao8b5b', ext: 'jpg', name: '我恨上学' },
  { id: 'cpun5d', ext: 'jpg', name: '灰溜溜离开' },
];

// 获取 catbox URL
function getCatboxUrl(id, ext) {
  return `https://files.catbox.moe/${id}.${ext}`;
}

// 切换表情面板显示/隐藏
export function toggleEmojiPanel() {
  const panel = document.getElementById('wechat-emoji-panel');
  const funcPanel = document.getElementById('wechat-func-panel');
  const expandPanel = document.getElementById('wechat-expand-input');

  if (!panel) return;

  // 关闭其他面板
  funcPanel?.classList.add('hidden');
  expandPanel?.classList.add('hidden');

  // 切换表情面板
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');

  // 如果打开面板，刷新表情列表
  if (isHidden) {
    refreshEmojiGrid();
  }
}

// 隐藏表情面板
export function hideEmojiPanel() {
  document.getElementById('wechat-emoji-panel')?.classList.add('hidden');
}

// 刷新表情网格
export function refreshEmojiGrid() {
  const content = document.getElementById('wechat-emoji-content');
  if (!content) return;

  let html = '';

  // 默认表情区域
  html += '<div class="wechat-emoji-section-title">默认表情</div>';
  html += '<div class="wechat-emoji-grid" id="wechat-emoji-default-grid">';
  html += `<button class="wechat-emoji-add" id="wechat-emoji-add-btn">+</button>`;
  DEFAULT_STICKERS.forEach((sticker, index) => {
    const url = getCatboxUrl(sticker.id, sticker.ext);
    html += `
      <div class="wechat-emoji-item wechat-emoji-default-item" data-default-index="${index}" title="${sticker.name}">
        <img src="${url}" alt="${sticker.name}" loading="lazy">
      </div>
    `;
  });
  html += '</div>';

  content.innerHTML = html;

  // 绑定添加按钮事件
  document.getElementById('wechat-emoji-add-btn')?.addEventListener('click', showAddStickerDialog);

  // 绑定默认表情点击事件
  content.querySelectorAll('.wechat-emoji-default-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.defaultIndex);
      sendDefaultSticker(index);
    });
  });
}

// 显示添加表情对话框
function showAddStickerDialog() {
  const choice = prompt(
    '添加表情方式：\n' +
    '1. 输入 catbox 文件名（如：被揍了哭哭81x5zq.jpg）\n' +
    '2. 直接输入图片URL\n' +
    '3. 输入 "file" 从本地选择图片\n\n' +
    '支持一次添加多个，用换行或逗号分隔：'
  );

  if (!choice) return;

  if (choice.trim().toLowerCase() === 'file') {
    addStickerFromFile();
    return;
  }

  // 解析输入，支持多个
  const inputs = choice.split(/[,\n]/).map(s => s.trim()).filter(s => s);
  addStickersFromInput(inputs);
}

// 从输入添加表情
function addStickersFromInput(inputs) {
  const settings = getSettings();
  if (!Array.isArray(settings.stickers)) {
    settings.stickers = [];
  }

  let addedCount = 0;

  for (const input of inputs) {
    let url = '';
    let name = input;

    // 检查是否是完整 URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      url = input;
      name = input.split('/').pop() || input;
    } else {
      // 尝试解析 catbox 格式：名称+ID.扩展名
      const match = input.match(/^(.+?)([a-z0-9]{6})\.(jpg|jpeg|png|gif|webp)$/i);
      if (match) {
        const [, stickerName, id, ext] = match;
        url = getCatboxUrl(id, ext);
        name = stickerName || input;
      } else {
        // 尝试只有 ID.扩展名 的格式
        const simpleMatch = input.match(/^([a-z0-9]{6})\.(jpg|jpeg|png|gif|webp)$/i);
        if (simpleMatch) {
          const [, id, ext] = simpleMatch;
          url = getCatboxUrl(id, ext);
          name = input;
        } else {
          showToast(`无法解析: ${input}`, '⚠️');
          continue;
        }
      }
    }

    // 检查是否已存在
    const exists = settings.stickers.some(s => s.url === url);
    if (exists) {
      showToast(`已存在: ${name}`, '🧊');
      continue;
    }

    // 调试：显示添加的表情信息
    console.log('[可乐] 添加表情:', { name, url });

    settings.stickers.push({
      url,
      name,
      addedTime: new Date().toISOString()
    });
    addedCount++;
  }

  if (addedCount > 0) {
    saveSettingsDebounced();
    refreshEmojiGrid();
    showToast(`已添加 ${addedCount} 个表情`);
  }
}

// 从本地文件添加表情
function addStickerFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;

  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const settings = getSettings();
    if (!Array.isArray(settings.stickers)) {
      settings.stickers = [];
    }

    let addedCount = 0;

    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataURL(file);
        settings.stickers.push({
          url: dataUrl,
          name: file.name,
          addedTime: new Date().toISOString()
        });
        addedCount++;
      } catch (err) {
        console.error('[可乐] 添加表情失败:', err);
      }
    }

    if (addedCount > 0) {
      saveSettingsDebounced();
      refreshEmojiGrid();
      showToast(`已添加 ${addedCount} 个表情`);
    }
  });

  input.click();
}

// 读取文件为 DataURL
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 发送用户表情
function sendUserSticker(index) {
  const settings = getSettings();
  const stickers = settings.stickers || [];
  const sticker = stickers[index];

  if (!sticker) return;

  hideEmojiPanel();
  sendStickerUrl(sticker.url, sticker.name || '');
}

// 发送默认表情
function sendDefaultSticker(index) {
  const sticker = DEFAULT_STICKERS[index];
  if (!sticker) return;

  hideEmojiPanel();
  const url = getCatboxUrl(sticker.id, sticker.ext);
  sendStickerUrl(url, sticker.name || '');
}

// 发送表情 URL
function sendStickerUrl(url, description = '') {
  // 检查是否是为混合消息选择表情
  if (hasPendingStickerSelection()) {
    setStickerForMultiMsg(url);
    return;
  }

  // 正常发送表情消息
  if (isInGroupChat()) {
    import('./group-chat.js').then(m => {
      m.sendGroupStickerMessage(url, description);
    });
  } else {
    import('./chat.js').then(m => {
      m.sendStickerMessage(url, description);
    });
  }
}

// 删除用户表情
function deleteSticker(index) {
  if (!confirm('确定要删除这个表情吗？')) return;

  const settings = getSettings();
  const stickers = settings.stickers || [];

  if (index >= 0 && index < stickers.length) {
    stickers.splice(index, 1);
    saveSettingsDebounced();
    refreshEmojiGrid();
    showToast('表情已删除');
  }
}

// 初始化表情面板
export function initEmojiPanel() {
  if (emojiPanelInited) return;

  const panel = document.getElementById('wechat-emoji-panel');
  if (!panel) return;

  emojiPanelInited = true;

  // 绑定标签切换事件
  document.querySelectorAll('.wechat-emoji-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.wechat-emoji-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      if (tabName === 'search') {
        showToast('搜索功能开发中...', '🧊');
      }
    });
  });

  // 初始刷新表情网格
  refreshEmojiGrid();
}
