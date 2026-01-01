/**
 * 多人卡导入模块
 * 功能：导入多人卡 PNG/JSON，AI 辅助解析，生成角色表格
 */

import { getSettings } from './config.js';
import { requestSave } from './save-manager.js';
import { showToast } from './toast.js';
import { escapeHtml } from './utils.js';
import { refreshContactsList } from './contacts.js';
import { refreshChatList } from './ui.js';

// ========== 头像生成 ==========

/**
 * 生成文字头像（白底黑字）
 * @param {string} text - 显示的文字（取第一个字符）
 * @param {object} options - 可选配置
 */
export function generateTextAvatar(text, options = {}) {
  const {
    size = 200,
    bgColor = '#ffffff',
    textColor = '#000000',
    fontSize = null,
    fontFamily = 'Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif'
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  // 文字（取第一个字符）
  const displayText = (text || '?').charAt(0);
  const calcFontSize = fontSize || Math.floor(size * 0.5);

  ctx.fillStyle = textColor;
  ctx.font = `bold ${calcFontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayText, size / 2, size / 2);

  return canvas.toDataURL('image/png');
}

/**
 * 生成群聊默认头像（白底 + "群"字）
 */
export function generateGroupAvatar() {
  return generateTextAvatar('群');
}

// ========== 状态变量 ==========

let pendingMultiImportFile = null;
let pendingParseResult = null;
let pendingOtherEdit = null;    // 当前编辑的"其它"信息 { tableIdx, charIdx, btn }

// ========== 弹窗 HTML ==========

/**
 * 获取多人卡导入弹窗 HTML
 */
export function getMultiCharImportModalHtml() {
  return `
    <div id="wechat-multi-import-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content" style="max-width: 420px;">
        <div class="wechat-modal-header">
          <span>导入多人卡</span>
          <span class="wechat-modal-close" id="wechat-multi-import-close">&times;</span>
        </div>

        <div class="wechat-modal-body">
          <!-- AI 配置区 -->
          <div class="wechat-settings-section">
            <div class="wechat-settings-title">解析 AI 配置</div>

            <!-- 使用独立API开关 -->
            <div class="wechat-settings-row">
              <span>使用独立API</span>
              <div class="wechat-switch" id="wechat-multi-import-custom-api"></div>
            </div>

            <!-- API配置（默认隐藏） -->
            <div id="wechat-multi-import-api-config" class="hidden" style="margin-top: 12px;">
              <div class="wechat-settings-item">
                <label>API 地址</label>
                <input type="text" class="wechat-settings-input"
                       id="wechat-multi-import-api-url"
                       placeholder="https://api.example.com/v1">
              </div>

              <div class="wechat-settings-item">
                <label>API 密钥</label>
                <input type="password" class="wechat-settings-input"
                       id="wechat-multi-import-api-key"
                       placeholder="sk-...">
              </div>

              <div class="wechat-settings-item">
                <label>模型</label>
                <div style="display: flex; gap: 8px;">
                  <div id="wechat-multi-import-model-select-wrapper" style="flex: 1; display: flex;">
                    <select class="wechat-settings-input wechat-settings-select"
                            id="wechat-multi-import-model-select" style="flex: 1;">
                      <option value="">--请选择模型--</option>
                    </select>
                  </div>
                  <div id="wechat-multi-import-model-input-wrapper" style="flex: 1; display: none;">
                    <input type="text" class="wechat-settings-input"
                           id="wechat-multi-import-model-input"
                           placeholder="手动输入模型名">
                  </div>
                  <button class="wechat-btn wechat-btn-small" id="wechat-multi-import-model-toggle">手动</button>
                  <button class="wechat-btn wechat-btn-small wechat-btn-primary" id="wechat-multi-import-fetch-model">获取</button>
                </div>
              </div>

              <button class="wechat-btn" id="wechat-multi-import-test" style="width: 100%; margin-top: 8px;">
                测试连接
              </button>
            </div>

            <!-- 使用全局配置提示 -->
            <div id="wechat-multi-import-global-tip" style="margin-top: 8px; font-size: 12px; color: var(--wechat-text-secondary);">
              将使用全局 AI 配置进行解析
            </div>
          </div>

          <!-- 文件选择区 -->
          <div class="wechat-settings-section" style="margin-top: 16px;">
            <div class="wechat-settings-title">选择文件</div>
            <div style="display: flex; gap: 10px;">
              <button class="wechat-btn" id="wechat-multi-import-select-png" style="flex: 1;">
                选择 PNG 文件
              </button>
              <button class="wechat-btn" id="wechat-multi-import-select-json" style="flex: 1;">
                选择 JSON 文件
              </button>
            </div>
            <div id="wechat-multi-import-file-info" style="margin-top: 8px; font-size: 13px; color: var(--wechat-text-secondary);">
              未选择文件
            </div>
          </div>
        </div>

        <div class="wechat-modal-footer">
          <button class="wechat-btn" id="wechat-multi-import-cancel">取消</button>
          <button class="wechat-btn wechat-btn-primary" id="wechat-multi-import-start" disabled>开始解析</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 获取角色表格选择弹窗 HTML（选择导入哪些角色为联系人/群聊）
 */
export function getCharSelectModalHtml() {
  return `
    <div id="wechat-char-select-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content" style="max-width: 450px; max-height: 80vh; display: flex; flex-direction: column;">
        <div class="wechat-modal-header">
          <span>选择要导入的角色</span>
          <span class="wechat-modal-close" id="wechat-char-select-close">&times;</span>
        </div>

        <div class="wechat-modal-body" style="flex: 1; overflow-y: auto; padding: 0;">
          <!-- 角色列表区 -->
          <div style="padding: 12px; border-bottom: 1px solid var(--wechat-border);">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <input type="checkbox" id="wechat-char-select-all" checked style="margin-right: 8px;">
              <label for="wechat-char-select-all" style="font-weight: bold;">创建独立联系人</label>
              <span id="wechat-char-select-count" style="margin-left: auto; font-size: 12px; color: var(--wechat-text-secondary);">0/0</span>
            </div>
            <div id="wechat-char-select-list" style="max-height: 250px; overflow-y: auto;">
              <!-- 角色列表动态填充 -->
            </div>
          </div>

          <!-- 群聊选项区 -->
          <div style="padding: 12px;">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <input type="checkbox" id="wechat-char-select-group" checked style="margin-right: 8px;">
              <label for="wechat-char-select-group" style="font-weight: bold;">同时创建群聊</label>
            </div>
            <div id="wechat-char-select-group-options">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <div id="wechat-char-select-group-avatar" style="width: 48px; height: 48px; background: #fff; border: 1px solid #ddd; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; color: #000;">群</div>
                <input type="text" id="wechat-char-select-group-name" class="wechat-settings-input" placeholder="群聊名称（可选）" style="flex: 1;">
              </div>
              <div style="font-size: 12px; color: var(--wechat-text-secondary);">
                将包含上方勾选的联系人（至少需要2人）
              </div>
            </div>
          </div>
        </div>

        <div class="wechat-modal-footer">
          <button class="wechat-btn" id="wechat-char-select-cancel">取消</button>
          <button class="wechat-btn wechat-btn-primary" id="wechat-char-select-confirm">确认导入</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 获取"其它信息"编辑弹窗 HTML
 */
export function getCharOtherEditModalHtml() {
  return `
    <div id="wechat-char-other-edit-modal" class="wechat-modal hidden">
      <div class="wechat-modal-content" style="max-width: 400px;">
        <div class="wechat-modal-header">
          <span id="wechat-char-other-edit-title">编辑其它信息</span>
          <span class="wechat-modal-close" id="wechat-char-other-edit-close">&times;</span>
        </div>
        <div class="wechat-modal-body" style="padding: 16px;">
          <textarea id="wechat-char-other-edit-textarea"
                    class="wechat-settings-input"
                    style="width: 100%; height: 200px; resize: vertical; font-size: 14px; line-height: 1.5;"
                    placeholder="其它信息"></textarea>
        </div>
        <div class="wechat-modal-footer">
          <button class="wechat-btn" id="wechat-char-other-edit-cancel">取消</button>
          <button class="wechat-btn wechat-btn-primary" id="wechat-char-other-edit-save">保存</button>
        </div>
      </div>
    </div>
  `;
}

// ========== 角色表格管理 ==========

/**
 * 生成角色表格列表 HTML（在服务-AI功能区显示）
 */
export function generateCharacterTablesHtml() {
  const settings = getSettings();
  const tables = settings.parsedCharacterTables || [];

  if (tables.length === 0) {
    return `
      <div class="wechat-char-tables-empty">
        <div style="font-size: 28px; margin-bottom: 8px;">📋</div>
        <div>暂无角色表格</div>
        <div style="font-size: 12px; margin-top: 4px;">导入多人卡时会自动解析生成</div>
      </div>
    `;
  }

  return tables.map((table, idx) => {
    const isExpanded = table.isExpanded || false;
    const worldView = table.worldView || '';

    return `
      <div class="wechat-char-table-card ${isExpanded ? 'expanded' : ''}" data-table-idx="${idx}">
        <!-- 标题栏 -->
        <div class="wechat-char-table-header">
          <span class="wechat-char-table-arrow">${isExpanded ? '▼' : '▶'}</span>
          <span class="wechat-char-table-title">${escapeHtml(table.name)}</span>
          <span class="wechat-char-table-badge">${table.characters.length}个角色</span>
          <span class="wechat-char-table-modified-tip hidden">已修改</span>
          <button class="wechat-char-table-delete" title="删除">×</button>
        </div>

        <!-- 表格内容 -->
        <div class="wechat-char-table-body ${isExpanded ? '' : 'hidden'}">
          <!-- 世界观区域 -->
          <div class="wechat-worldview-section">
            <div class="wechat-worldview-header">
              <span class="wechat-worldview-title">🌍 世界观</span>
            </div>
            <textarea class="wechat-worldview-textarea"
                      data-field="worldView"
                      placeholder="世界观/背景设定（可编辑）">${escapeHtml(worldView)}</textarea>
          </div>

          <!-- 角色表格区域 -->
          <div class="wechat-characters-section">
            <div class="wechat-characters-header">
              <span class="wechat-characters-title">👥 角色列表</span>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary wechat-char-table-start-chat" style="margin-left: auto;">
                发起群聊
              </button>
            </div>
            <div class="wechat-char-table-scroll">
              <table class="wechat-char-table">
                <thead>
                  <tr>
                    <th style="width: 28px;"><input type="checkbox" class="wechat-char-select-all-check" title="全选"></th>
                    <th style="min-width: 70px;">姓名</th>
                    <th style="width: 48px;">性别</th>
                    <th style="width: 48px;">年龄</th>
                    <th style="width: 46px;">其它</th>
                    <th style="width: 24px;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${table.characters.map((char, charIdx) => {
                    const otherText = typeof char.other === 'string' ? char.other : (char.other ? JSON.stringify(char.other) : '');
                    const hasOther = otherText.length > 0;
                    return `
                    <tr data-char-idx="${charIdx}">
                      <td>
                        <input type="checkbox" class="wechat-char-row-check" data-char-idx="${charIdx}">
                      </td>
                      <td>
                        <input type="text" class="wechat-char-edit-input char-name"
                               value="${escapeHtml(char.name)}"
                               data-field="name" placeholder="姓名">
                      </td>
                    <td>
                      <input type="text" class="wechat-char-edit-input char-gender"
                             value="${escapeHtml(char.gender || '')}"
                             data-field="gender" placeholder="-">
                    </td>
                    <td>
                      <input type="text" class="wechat-char-edit-input char-age"
                             value="${escapeHtml(char.age || '')}"
                             data-field="age" placeholder="-">
                    </td>
                    <td>
                      <button class="wechat-btn wechat-btn-small wechat-char-other-btn"
                              data-char-idx="${charIdx}"
                              data-other="${escapeHtml(otherText)}"
                              title="${hasOther ? '点击查看/编辑' : '点击添加'}"
                              style="width: 100%; font-size: 11px; padding: 3px 4px; ${hasOther ? 'background: var(--wechat-primary); color: white;' : ''}">
                        ${hasOther ? '详情' : '+'}
                      </button>
                    </td>
                    <td>
                      <button class="wechat-char-row-delete" title="删除此行">×</button>
                    </td>
                  </tr>
                  `;}).join('')}
              </tbody>
            </table>
          </div>

          <!-- 添加行按钮 -->
          <button class="wechat-char-add-row">+ 添加角色</button>
          </div>

          <!-- 底部操作栏 -->
          <div class="wechat-char-table-footer">
            <span class="wechat-char-table-time">创建于 ${table.createTime || '-'}</span>
            <div class="wechat-char-table-actions">
              <button class="wechat-btn wechat-btn-small wechat-char-table-save hidden">
                保存
              </button>
              <button class="wechat-btn wechat-btn-small wechat-btn-primary wechat-char-table-import">
                导入为联系人
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 添加角色表格
 */
export function addCharacterTable(tableData) {
  const settings = getSettings();
  if (!settings.parsedCharacterTables) {
    settings.parsedCharacterTables = [];
  }

  // 检查是否已存在同名表格
  const existingIdx = settings.parsedCharacterTables.findIndex(
    t => t.name === tableData.name
  );

  if (existingIdx >= 0) {
    if (confirm(`「${tableData.name}」已存在，是否覆盖？`)) {
      settings.parsedCharacterTables[existingIdx] = tableData;
    } else {
      tableData.name = `${tableData.name} (${Date.now()})`;
      settings.parsedCharacterTables.push(tableData);
    }
  } else {
    settings.parsedCharacterTables.push(tableData);
  }

  requestSave();
  refreshCharacterTablesUI();
}

/**
 * 刷新角色表格 UI
 */
export function refreshCharacterTablesUI() {
  const container = document.getElementById('wechat-char-tables-container');
  if (container) {
    container.innerHTML = generateCharacterTablesHtml();
  }
}

// ========== 弹窗操作 ==========

/**
 * 打开多人卡导入弹窗
 */
export function openMultiImportModal() {
  pendingMultiImportFile = null;
  const fileInfo = document.getElementById('wechat-multi-import-file-info');
  const startBtn = document.getElementById('wechat-multi-import-start');

  if (fileInfo) fileInfo.textContent = '未选择文件';
  if (startBtn) startBtn.disabled = true;

  document.getElementById('wechat-multi-import-modal')?.classList.remove('hidden');
}

/**
 * 关闭多人卡导入弹窗
 */
export function closeMultiImportModal() {
  document.getElementById('wechat-multi-import-modal')?.classList.add('hidden');
  pendingMultiImportFile = null;
}

/**
 * 打开角色选择弹窗
 */
export function openCharSelectModal(parseResult) {
  pendingParseResult = parseResult;
  const { characters } = parseResult;

  const listContainer = document.getElementById('wechat-char-select-list');
  if (!listContainer) return;

  // 填充角色列表
  listContainer.innerHTML = characters.map((char, idx) => {
    const firstChar = (char.name || '?').charAt(0);
    const genderAge = [char.gender, char.age ? `${char.age}岁` : ''].filter(Boolean).join(' · ');
    return `
      <div class="wechat-char-select-item" data-index="${idx}" style="display: flex; align-items: center; padding: 8px; border-radius: 6px; margin-bottom: 4px; background: var(--wechat-bg-secondary);">
        <input type="checkbox" class="wechat-char-select-check" data-index="${idx}" checked style="margin-right: 10px;">
        <div style="width: 36px; height: 36px; background: #fff; border: 1px solid #ddd; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; color: #000; margin-right: 10px; flex-shrink: 0;">
          ${escapeHtml(firstChar)}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(char.name)}</div>
          <div style="font-size: 12px; color: var(--wechat-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${genderAge ? `${genderAge} · ` : ''}${escapeHtml((char.other || '').substring(0, 30))}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 更新计数
  updateCharSelectCount();
  updateCharSelectGroupName();

  document.getElementById('wechat-char-select-modal')?.classList.remove('hidden');
}

/**
 * 关闭角色选择弹窗
 */
export function closeCharSelectModal() {
  document.getElementById('wechat-char-select-modal')?.classList.add('hidden');
  pendingParseResult = null;
}

/**
 * 打开"其它信息"编辑弹窗
 */
function openCharOtherEditModal(tableIdx, charIdx, otherText, btn) {
  pendingOtherEdit = { tableIdx, charIdx, btn };

  const settings = getSettings();
  const table = settings.parsedCharacterTables?.[tableIdx];
  const charName = table?.characters?.[charIdx]?.name || '角色';

  const titleEl = document.getElementById('wechat-char-other-edit-title');
  if (titleEl) titleEl.textContent = `${charName} - 其它信息`;

  const textarea = document.getElementById('wechat-char-other-edit-textarea');
  if (textarea) textarea.value = otherText;

  document.getElementById('wechat-char-other-edit-modal')?.classList.remove('hidden');
}

/**
 * 关闭"其它信息"编辑弹窗
 */
function closeCharOtherEditModal() {
  document.getElementById('wechat-char-other-edit-modal')?.classList.add('hidden');
  pendingOtherEdit = null;
}

/**
 * 保存"其它信息"
 */
function saveCharOtherEdit() {
  if (!pendingOtherEdit) return;

  const { tableIdx, charIdx, btn } = pendingOtherEdit;
  const textarea = document.getElementById('wechat-char-other-edit-textarea');
  const newValue = textarea?.value?.trim() || '';

  // 更新 settings
  const settings = getSettings();
  const table = settings.parsedCharacterTables?.[tableIdx];
  if (table && table.characters[charIdx]) {
    table.characters[charIdx].other = newValue;
    requestSave();
  }

  // 更新按钮状态
  if (btn) {
    btn.dataset.other = newValue;
    const hasOther = newValue.length > 0;
    btn.textContent = hasOther ? '详情' : '+';
    btn.title = hasOther ? '点击查看/编辑' : '点击添加';
    btn.style.background = hasOther ? 'var(--wechat-primary)' : '';
    btn.style.color = hasOther ? 'white' : '';
  }

  closeCharOtherEditModal();
  showToast('已保存');
}

/**
 * 绑定"其它信息"编辑弹窗事件
 */
export function bindCharOtherEditEvents() {
  document.getElementById('wechat-char-other-edit-close')?.addEventListener('click', closeCharOtherEditModal);
  document.getElementById('wechat-char-other-edit-cancel')?.addEventListener('click', closeCharOtherEditModal);
  document.getElementById('wechat-char-other-edit-save')?.addEventListener('click', saveCharOtherEdit);
}

/**
 * 更新选中计数
 */
function updateCharSelectCount() {
  const checkboxes = document.querySelectorAll('.wechat-char-select-check');
  const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
  const total = checkboxes.length;

  const countEl = document.getElementById('wechat-char-select-count');
  if (countEl) countEl.textContent = `${checked}/${total}`;

  // 如果选中少于2个，禁用群聊选项
  const groupCheckbox = document.getElementById('wechat-char-select-group');
  const groupOptions = document.getElementById('wechat-char-select-group-options');

  if (checked < 2) {
    if (groupCheckbox) groupCheckbox.checked = false;
    if (groupOptions) groupOptions.style.opacity = '0.5';
  } else {
    if (groupOptions) groupOptions.style.opacity = '1';
  }
}

/**
 * 更新群名
 */
function updateCharSelectGroupName() {
  if (!pendingParseResult) return;

  const checkboxes = document.querySelectorAll('.wechat-char-select-check:checked');
  const selectedNames = Array.from(checkboxes).map(cb => {
    const idx = parseInt(cb.dataset.index);
    return pendingParseResult.characters[idx]?.name;
  }).filter(Boolean);

  const groupNameInput = document.getElementById('wechat-char-select-group-name');
  if (groupNameInput && !groupNameInput.dataset.userEdited) {
    const autoName = selectedNames.slice(0, 3).join('、') + (selectedNames.length > 3 ? '...' : '');
    groupNameInput.placeholder = autoName || '群聊名称';
  }
}

// ========== 文件处理 ==========

/**
 * 选择文件
 */
function selectFile(accept, callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) callback(file);
  };
  input.click();
}

/**
 * 处理文件选择（旧弹窗）
 */
function handleFileSelected(file) {
  pendingMultiImportFile = file;
  const fileInfo = document.getElementById('wechat-multi-import-file-info');
  const startBtn = document.getElementById('wechat-multi-import-start');

  if (fileInfo) fileInfo.textContent = `已选择：${file.name}`;
  if (startBtn) startBtn.disabled = false;
}

/**
 * 获取多人卡导入的 API 配置
 * 优先从弹窗输入框读取，如果弹窗未打开或未启用独立API则从 settings 读取
 */
function getMultiImportApiConfig() {
  // 检查弹窗是否打开且启用了独立API
  const modal = document.getElementById('wechat-multi-import-modal');
  const customApiSwitch = document.getElementById('wechat-multi-import-custom-api');
  const isModalOpen = modal && !modal.classList.contains('hidden');
  const useCustomApi = customApiSwitch && customApiSwitch.classList.contains('on');

  if (isModalOpen && useCustomApi) {
    // 从弹窗输入框读取
    const inputWrapper = document.getElementById('wechat-multi-import-model-input-wrapper');
    const isManualMode = inputWrapper && inputWrapper.style.display !== 'none';

    let model = '';
    if (isManualMode) {
      model = document.getElementById('wechat-multi-import-model-input')?.value?.trim() || '';
    } else {
      model = document.getElementById('wechat-multi-import-model-select')?.value?.trim() || '';
    }

    return {
      apiUrl: document.getElementById('wechat-multi-import-api-url')?.value?.trim() || '',
      apiKey: document.getElementById('wechat-multi-import-api-key')?.value?.trim() || '',
      model: model
    };
  }

  // 从 settings 读取已保存的配置
  const settings = getSettings();
  return {
    apiUrl: settings.multiCharApiUrl || '',
    apiKey: settings.multiCharApiKey || '',
    model: settings.multiCharModel || ''
  };
}

// ========== AI 解析 ==========

/**
 * 开始解析多人卡
 */
async function startMultiImportParse() {
  if (!pendingMultiImportFile) {
    showToast('请先选择文件', 'warning');
    return;
  }

  const config = getMultiImportApiConfig();
  if (!config.apiUrl || !config.model) {
    showToast('请配置 AI 接口', 'warning');
    return;
  }

  const startBtn = document.getElementById('wechat-multi-import-start');
  if (startBtn) {
    startBtn.textContent = '解析中...';
    startBtn.disabled = true;
  }

  try {
    // 1. 解析文件
    let charData;
    const fileName = pendingMultiImportFile.name;

    if (fileName.endsWith('.png')) {
      const { extractCharacterFromPNG } = await import('./character-import.js');
      charData = await extractCharacterFromPNG(pendingMultiImportFile);
    } else {
      const { extractCharacterFromJSON } = await import('./character-import.js');
      charData = await extractCharacterFromJSON(pendingMultiImportFile);
    }

    const rawData = charData.rawData || charData;
    const data = rawData.data || rawData;
    const entries = data.character_book?.entries || [];

    if (entries.length === 0) {
      showToast('未找到世界书条目', 'warning');
      return;
    }

    // 2. AI 解析每个条目
    const characters = [];
    for (let i = 0; i < entries.length; i++) {
      if (startBtn) startBtn.textContent = `解析中 (${i + 1}/${entries.length})...`;

      const entry = entries[i];
      const parsed = await parseEntryWithAI(entry, config);
      if (parsed && parsed.name) {
        characters.push({
          ...parsed,
          originalEntry: entry
        });
      }
    }

    if (characters.length === 0) {
      showToast('未解析到有效角色', 'warning');
      return;
    }

    // 3. 解析世界观
    if (startBtn) startBtn.textContent = '解析世界观...';
    const worldView = await parseWorldViewWithAI(entries, config);

    // 4. 创建角色表格
    const table = {
      id: 'table_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      name: fileName,
      sourceName: charData.name || fileName,
      createTime: new Date().toLocaleString('zh-CN'),
      isExpanded: true,
      worldView: worldView,
      characters
    };

    addCharacterTable(table);
    closeMultiImportModal();
    showToast(`已解析 ${characters.length} 个角色`);

  } catch (err) {
    console.error('[可乐] 多人卡解析失败:', err);
    showToast('解析失败: ' + err.message, 'error');
  } finally {
    if (startBtn) {
      startBtn.textContent = '开始解析';
      startBtn.disabled = false;
    }
  }
}

/**
 * 用 AI 解析单个世界书条目
 */
async function parseEntryWithAI(entry, config) {
  const content = entry.content || '';
  const entryName = entry.comment || entry.name || '';

  const prompt = `请判断以下文本是否描述的是一个角色（人物）。

判断标准：
- 必须是描述人物的文本（不是地点、物品、事件、组织等）
- 必须能从文本中提取出性别（男/女）或年龄（数字）中的至少一项

如果是角色，返回 JSON（注意：所有字段的值都必须是字符串）：
{"isCharacter": true, "name": "角色的真实姓名", "gender": "男或女", "age": "年龄数字", "other": "其它重要信息，用纯文本描述"}

如果不是角色（比如是城市、地点、物品、组织等），返回：
{"isCharacter": false}

重要提示：
1. name 必须是角色的真实姓名，不要用条目名称
2. other 字段必须是纯文本字符串，不要用 JSON 对象
3. 如果没有明确的性别或年龄信息，该条目不是角色

条目名称：${entryName}
条目内容：
${content}

只返回 JSON，不要其它内容。`;

  const chatUrl = config.apiUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`API 错误 (${response.status})`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  // 提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      // 如果不是角色，返回 null
      if (parsed.isCharacter === false) {
        return null;
      }
      // 检查是否有性别或年龄
      const hasGender = parsed.gender && parsed.gender !== '-' && parsed.gender !== '';
      const hasAge = parsed.age && parsed.age !== '-' && parsed.age !== '';
      if (!hasGender && !hasAge) {
        return null;  // 没有性别也没有年龄，不算角色
      }
      // 确保 name 是字符串且不为空
      if (!parsed.name || typeof parsed.name !== 'string' || parsed.name.trim() === '') {
        return null;
      }
      // 确保 other 是字符串
      if (parsed.other && typeof parsed.other !== 'string') {
        parsed.other = JSON.stringify(parsed.other);
      }
      return {
        name: parsed.name.trim(),
        gender: String(parsed.gender || '').trim(),
        age: String(parsed.age || '').trim(),
        other: String(parsed.other || '').trim()
      };
    } catch (e) {
      console.error('[可乐] JSON 解析失败:', text);
    }
  }

  // 解析失败返回 null
  return null;
}

/**
 * 用 AI 解析世界观信息（从所有条目中提取非角色相关的世界设定）
 */
async function parseWorldViewWithAI(entries, config) {
  // 合并所有条目内容
  const allContent = entries.map(entry => {
    const name = entry.comment || entry.name || '';
    const content = entry.content || '';
    return `[${name}]\n${content}`;
  }).join('\n\n---\n\n');

  const prompt = `请从以下世界书条目中提取世界观/背景设定信息。

要求：
1. 提取故事发生的世界观、时代背景、地点设定等
2. 不要提取具体角色的个人信息
3. 关注世界的规则、组织、历史、文化等设定
4. 返回一段连贯的世界观描述文本

世界书内容：
${allContent}

请直接返回世界观描述，不需要JSON格式，不需要额外解释。如果没有明确的世界观设定，返回"暂无世界观设定"。`;

  const chatUrl = config.apiUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 3000
      })
    });

    if (!response.ok) {
      console.error('[可乐] 世界观解析 API 错误:', response.status);
      return '';
    }

    const data = await response.json();
    const worldView = data.choices?.[0]?.message?.content || '';
    return worldView.trim();
  } catch (err) {
    console.error('[可乐] 世界观解析失败:', err);
    return '';
  }
}

// ========== 导入为联系人/群聊 ==========

/**
 * 确认导入角色为联系人/群聊
 */
async function confirmCharSelectImport() {
  if (!pendingParseResult) return;

  const settings = getSettings();
  const { characters, originalCard } = pendingParseResult;

  // 获取用户选择
  const createContacts = document.getElementById('wechat-char-select-all')?.checked !== false;
  const createGroup = document.getElementById('wechat-char-select-group')?.checked;
  const customGroupName = document.getElementById('wechat-char-select-group-name')?.value?.trim();

  // 获取选中的角色
  const checkboxes = document.querySelectorAll('.wechat-char-select-check:checked');
  const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
  const selectedChars = selectedIndices.map(idx => characters[idx]).filter(Boolean);

  if (selectedChars.length === 0) {
    showToast('请至少选择一个角色', 'warning');
    return;
  }

  const createdContacts = [];

  // 1. 创建联系人
  if (createContacts) {
    for (const char of selectedChars) {
      // 检查是否已存在
      const exists = settings.contacts.some(c => c.name === char.name);
      if (exists) continue;

      // 生成白底黑字头像
      const avatar = generateTextAvatar(char.name);

      const contactData = {
        id: 'contact_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        name: char.name,
        description: (char.other || '').substring(0, 50),
        avatar: avatar,
        importTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        rawData: {
          data: {
            name: char.name,
            description: char.other || '',
            personality: '',
            character_book: {
              entries: char.originalEntry ? [char.originalEntry] : []
            }
          }
        },
        useCustomApi: false,
        customApiUrl: '',
        customApiKey: '',
        customModel: '',
        customHakimiBreakLimit: false
      };

      settings.contacts.push(contactData);
      createdContacts.push(contactData);
    }
  }

  // 2. 创建群聊（使用多人群聊模式，和角色表格发起群聊一样）
  let groupCreated = false;
  if (createGroup && selectedChars.length >= 2) {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // 群聊名称：用户输入 > 默认"群聊"
    const groupName = customGroupName || '群聊';

    // 生成白底黑字"群"头像
    const groupAvatar = generateGroupAvatar();

    const multiPersonChat = {
      id: 'mp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      name: groupName,
      avatar: groupAvatar,
      type: 'multi-person',
      worldView: '',  // 从导入弹窗创建的群聊没有世界观
      members: selectedChars.map(char => ({
        id: 'mp_member_' + Math.random().toString(36).substring(2, 9),
        name: char.name,
        gender: char.gender || '',
        age: char.age || '',
        description: char.other || ''
      })),
      chatHistory: [],
      lastMessage: '',
      lastMessageTime: Date.now(),
      createdTime: timeStr,
      sourceTable: originalCard?.name || '导入'
    };

    if (!settings.multiPersonChats) settings.multiPersonChats = [];
    settings.multiPersonChats.push(multiPersonChat);
    groupCreated = true;
  }

  // 保存并刷新
  requestSave();
  refreshContactsList();
  refreshChatList();  // 刷新聊天列表以显示新创建的群聊
  closeCharSelectModal();

  // 提示结果
  const msgs = [];
  if (createdContacts.length > 0) msgs.push(`${createdContacts.length} 个联系人`);
  if (groupCreated) msgs.push('1 个群聊');

  if (msgs.length > 0) {
    showToast(`导入成功！已创建 ${msgs.join(' 和 ')}`, '✓');
  } else {
    showToast('未创建任何内容');
  }

  pendingParseResult = null;
}

// ========== 角色表格操作 ==========

/**
 * 标记表格为已修改状态
 */
function markTableAsModified(card) {
  if (card.classList.contains('modified')) return;

  card.classList.add('modified');

  const tip = card.querySelector('.wechat-char-table-modified-tip');
  if (tip) tip.classList.remove('hidden');

  const saveBtn = card.querySelector('.wechat-char-table-save');
  if (saveBtn) saveBtn.classList.remove('hidden');
}

/**
 * 清除已修改状态
 */
function clearTableModified(card) {
  card.classList.remove('modified');

  const tip = card.querySelector('.wechat-char-table-modified-tip');
  if (tip) tip.classList.add('hidden');

  const saveBtn = card.querySelector('.wechat-char-table-save');
  if (saveBtn) saveBtn.classList.add('hidden');
}

/**
 * 保存表格修改
 */
function saveTableChanges(card, tableIdx) {
  const settings = getSettings();
  const table = settings.parsedCharacterTables?.[tableIdx];
  if (!table) return;

  // 保存世界观
  const worldViewTextarea = card.querySelector('.wechat-worldview-textarea');
  if (worldViewTextarea) {
    table.worldView = worldViewTextarea.value?.trim() || '';
  }

  // 保存角色列表
  const rows = card.querySelectorAll('.wechat-char-table tbody tr');
  const newCharacters = [];

  rows.forEach(row => {
    const name = row.querySelector('[data-field="name"]')?.value?.trim() || '';
    const gender = row.querySelector('[data-field="gender"]')?.value?.trim() || '';
    const age = row.querySelector('[data-field="age"]')?.value?.trim() || '';
    // 从按钮的 data-other 属性读取
    const otherBtn = row.querySelector('.wechat-char-other-btn');
    const other = otherBtn?.dataset?.other || '';

    if (name) {
      newCharacters.push({ name, gender, age, other });
    }
  });

  table.characters = newCharacters;
  table.lastModified = new Date().toLocaleString('zh-CN');

  requestSave();
  clearTableModified(card);

  const badge = card.querySelector('.wechat-char-table-badge');
  if (badge) badge.textContent = `${newCharacters.length}个角色`;

  showToast('已保存');
}

/**
 * 添加新行
 */
function addTableRow(card) {
  const tbody = card.querySelector('.wechat-char-table tbody');
  if (!tbody) return;

  const newIdx = tbody.querySelectorAll('tr').length;
  const newRow = document.createElement('tr');
  newRow.dataset.charIdx = newIdx;
  newRow.innerHTML = `
    <td>
      <input type="checkbox" class="wechat-char-row-check" data-char-idx="${newIdx}">
    </td>
    <td>
      <input type="text" class="wechat-char-edit-input char-name"
             value="" data-field="name" placeholder="姓名">
    </td>
    <td>
      <input type="text" class="wechat-char-edit-input char-gender"
             value="" data-field="gender" placeholder="-">
    </td>
    <td>
      <input type="text" class="wechat-char-edit-input char-age"
             value="" data-field="age" placeholder="-">
    </td>
    <td>
      <button class="wechat-btn wechat-btn-small wechat-char-other-btn"
              data-char-idx="${newIdx}"
              data-other=""
              title="点击添加"
              style="width: 100%; font-size: 11px; padding: 3px 4px;">
        +
      </button>
    </td>
    <td>
      <button class="wechat-char-row-delete" title="删除此行">×</button>
    </td>
  `;
  tbody.appendChild(newRow);
  newRow.querySelector('.char-name')?.focus();
}

/**
 * 从表格导入联系人
 */
function importFromTable(tableIdx) {
  const settings = getSettings();
  const table = settings.parsedCharacterTables?.[tableIdx];
  if (!table) return;

  const parseResult = {
    isMultiChar: true,
    characters: table.characters.map(char => ({
      name: char.name,
      gender: char.gender,
      age: char.age,
      other: char.other,
      description: char.other,
      originalEntry: char.originalEntry || null
    })),
    originalCard: { name: table.sourceName || table.name }
  };

  openCharSelectModal(parseResult);
}

/**
 * 从角色表格发起多人群聊
 */
async function startMultiPersonChat(card, tableIdx) {
  const settings = getSettings();
  const table = settings.parsedCharacterTables?.[tableIdx];
  if (!table) return;

  // 获取勾选的角色
  const rowCheckboxes = card.querySelectorAll('.wechat-char-row-check:checked');
  const selectedIndices = Array.from(rowCheckboxes).map(cb => parseInt(cb.dataset.charIdx));
  const selectedChars = selectedIndices.map(idx => table.characters[idx]).filter(Boolean);

  if (selectedChars.length < 2) {
    showToast('请至少选择2个角色', '⚠️');
    return;
  }

  // 获取世界观
  const worldView = table.worldView || '';

  // 创建多人群聊
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 群聊名称：默认为"群聊"
  const groupName = '群聊';

  // 生成白底黑字"群"头像
  const groupAvatar = generateGroupAvatar();

  const multiPersonChat = {
    id: 'mp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    name: groupName,
    avatar: groupAvatar,  // 白底黑字"群"头像
    type: 'multi-person',  // 标记为多人群聊类型
    worldView: worldView,  // 保存世界观
    members: selectedChars.map(char => ({
      id: 'mp_member_' + Math.random().toString(36).substring(2, 9),
      name: char.name,
      gender: char.gender || '',
      age: char.age || '',
      description: char.other || ''
    })),
    chatHistory: [],
    lastMessage: '',
    lastMessageTime: Date.now(),
    createdTime: timeStr,
    sourceTable: table.name  // 记录来源表格
  };

  // 添加到多人群聊列表
  if (!settings.multiPersonChats) settings.multiPersonChats = [];
  settings.multiPersonChats.push(multiPersonChat);

  requestSave();
  showToast(`已创建多人群聊「${groupName}」`);

  // 刷新列表并打开群聊
  const { refreshChatList } = await import('./ui.js');
  refreshChatList();

  // 打开多人群聊
  const { openMultiPersonChat } = await import('./multi-person-chat.js');
  openMultiPersonChat(settings.multiPersonChats.length - 1);
}

// ========== 事件绑定 ==========

/**
 * 绑定多人卡导入弹窗事件
 */
export function bindMultiImportEvents() {
  // 关闭弹窗
  document.getElementById('wechat-multi-import-close')?.addEventListener('click', closeMultiImportModal);
  document.getElementById('wechat-multi-import-cancel')?.addEventListener('click', closeMultiImportModal);

  // 独立API开关
  document.getElementById('wechat-multi-import-custom-api')?.addEventListener('click', function () {
    this.classList.toggle('on');
    const isOn = this.classList.contains('on');
    document.getElementById('wechat-multi-import-api-config')?.classList.toggle('hidden', !isOn);
    document.getElementById('wechat-multi-import-global-tip')?.classList.toggle('hidden', isOn);
  });

  // 手动/选择模式切换
  document.getElementById('wechat-multi-import-model-toggle')?.addEventListener('click', function () {
    const selectWrapper = document.getElementById('wechat-multi-import-model-select-wrapper');
    const inputWrapper = document.getElementById('wechat-multi-import-model-input-wrapper');
    const isManual = inputWrapper?.style.display === 'none';

    if (selectWrapper) selectWrapper.style.display = isManual ? 'none' : 'flex';
    if (inputWrapper) inputWrapper.style.display = isManual ? 'flex' : 'none';
    this.textContent = isManual ? '选择' : '手动';
  });

  // 获取模型列表
  document.getElementById('wechat-multi-import-fetch-model')?.addEventListener('click', async function () {
    const apiUrl = document.getElementById('wechat-multi-import-api-url')?.value?.trim();
    const apiKey = document.getElementById('wechat-multi-import-api-key')?.value?.trim();

    if (!apiUrl) {
      showToast('请先填写 API 地址', 'warning');
      return;
    }

    this.textContent = '...';
    this.disabled = true;

    try {
      const { fetchModelListFromApi } = await import('./ai.js');
      const models = await fetchModelListFromApi(apiUrl, apiKey);

      const select = document.getElementById('wechat-multi-import-model-select');
      if (select && models.length > 0) {
        select.innerHTML = '<option value="">--请选择模型--</option>' +
          models.map(m => `<option value="${m}">${m}</option>`).join('');
        showToast(`获取到 ${models.length} 个模型`);
      } else {
        showToast('未找到可用模型', 'warning');
      }
    } catch (err) {
      showToast('获取失败: ' + err.message, 'error');
    } finally {
      this.textContent = '获取';
      this.disabled = false;
    }
  });

  // 测试连接
  document.getElementById('wechat-multi-import-test')?.addEventListener('click', async function () {
    const config = getMultiImportApiConfig();
    if (!config.apiUrl || !config.model) {
      showToast('请填写完整配置', 'warning');
      return;
    }

    this.textContent = '测试中...';
    this.disabled = true;

    try {
      const { testConnection } = await import('./ai.js');
      await testConnection(config.apiUrl, config.apiKey, config.model);
      showToast('连接成功');
    } catch (err) {
      showToast('连接失败: ' + err.message, 'error');
    } finally {
      this.textContent = '测试连接';
      this.disabled = false;
    }
  });

  // 选择 PNG 文件
  document.getElementById('wechat-multi-import-select-png')?.addEventListener('click', () => {
    selectFile('.png', handleFileSelected);
  });

  // 选择 JSON 文件
  document.getElementById('wechat-multi-import-select-json')?.addEventListener('click', () => {
    selectFile('.json', handleFileSelected);
  });

  // 开始解析
  document.getElementById('wechat-multi-import-start')?.addEventListener('click', startMultiImportParse);
}

/**
 * 绑定角色选择弹窗事件
 */
export function bindCharSelectEvents() {
  // 关闭弹窗
  document.getElementById('wechat-char-select-close')?.addEventListener('click', closeCharSelectModal);
  document.getElementById('wechat-char-select-cancel')?.addEventListener('click', closeCharSelectModal);

  // 确认导入
  document.getElementById('wechat-char-select-confirm')?.addEventListener('click', confirmCharSelectImport);

  // 角色勾选变化（使用事件委托）
  document.getElementById('wechat-char-select-list')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('wechat-char-select-check')) {
      updateCharSelectCount();
      updateCharSelectGroupName();
    }
  });

  // 全选开关
  document.getElementById('wechat-char-select-all')?.addEventListener('change', function () {
    const listContainer = document.getElementById('wechat-char-select-list');
    if (listContainer) {
      listContainer.style.opacity = this.checked ? '1' : '0.5';
      listContainer.style.pointerEvents = this.checked ? 'auto' : 'none';
    }
    if (!this.checked) {
      const groupCheckbox = document.getElementById('wechat-char-select-group');
      if (groupCheckbox) groupCheckbox.checked = false;
    }
  });

  // 群名输入框标记用户已编辑
  document.getElementById('wechat-char-select-group-name')?.addEventListener('input', function () {
    this.dataset.userEdited = 'true';
  });
}

/**
 * 绑定角色表格事件
 */
export function bindCharacterTableEvents() {
  const container = document.getElementById('wechat-char-tables-container');
  if (!container) return;

  // 输入变化 -> 标记已修改
  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('wechat-char-edit-input') ||
        e.target.classList.contains('wechat-worldview-textarea')) {
      const card = e.target.closest('.wechat-char-table-card');
      if (card) markTableAsModified(card);
    }
  });

  // 点击事件
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.wechat-char-table-card');
    if (!card) return;

    const idx = parseInt(card.dataset.tableIdx);
    const settings = getSettings();
    const table = settings.parsedCharacterTables?.[idx];
    if (!table) return;

    // 展开/收起
    if (e.target.closest('.wechat-char-table-header') &&
      !e.target.closest('.wechat-char-table-delete')) {
      table.isExpanded = !table.isExpanded;
      requestSave();
      refreshCharacterTablesUI();
      return;
    }

    // 删除表格
    if (e.target.closest('.wechat-char-table-delete')) {
      if (confirm(`确定删除「${table.name}」吗？`)) {
        settings.parsedCharacterTables.splice(idx, 1);
        requestSave();
        refreshCharacterTablesUI();
        showToast('已删除');
      }
      return;
    }

    // 删除行
    if (e.target.closest('.wechat-char-row-delete')) {
      const row = e.target.closest('tr');
      if (row) {
        row.remove();
        markTableAsModified(card);
      }
      return;
    }

    // 添加行
    if (e.target.closest('.wechat-char-add-row')) {
      addTableRow(card);
      markTableAsModified(card);
      return;
    }

    // 保存
    if (e.target.closest('.wechat-char-table-save')) {
      saveTableChanges(card, idx);
      return;
    }

    // 导入为联系人
    if (e.target.closest('.wechat-char-table-import')) {
      if (card.classList.contains('modified')) {
        if (confirm('有未保存的修改，是否先保存？')) {
          saveTableChanges(card, idx);
        }
      }
      importFromTable(idx);
      return;
    }

    // 全选/取消全选勾选框
    if (e.target.classList.contains('wechat-char-select-all-check')) {
      const isChecked = e.target.checked;
      const rowCheckboxes = card.querySelectorAll('.wechat-char-row-check');
      rowCheckboxes.forEach(cb => {
        cb.checked = isChecked;
      });
      return;
    }

    // 发起群聊按钮
    if (e.target.closest('.wechat-char-table-start-chat')) {
      // 如果有未保存的修改，先保存
      if (card.classList.contains('modified')) {
        saveTableChanges(card, idx);
      }
      startMultiPersonChat(card, idx);
      return;
    }

    // "其它"按钮点击
    if (e.target.closest('.wechat-char-other-btn')) {
      const btn = e.target.closest('.wechat-char-other-btn');
      const charIdx = parseInt(btn.dataset.charIdx);
      const otherText = btn.dataset.other || '';
      openCharOtherEditModal(idx, charIdx, otherText, btn);
      return;
    }
  });

  // 行勾选框变化时，更新全选框状态
  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('wechat-char-row-check')) {
      const card = e.target.closest('.wechat-char-table-card');
      if (!card) return;

      const allCheckbox = card.querySelector('.wechat-char-select-all-check');
      const rowCheckboxes = card.querySelectorAll('.wechat-char-row-check');
      const checkedCount = Array.from(rowCheckboxes).filter(cb => cb.checked).length;

      if (allCheckbox) {
        allCheckbox.checked = checkedCount === rowCheckboxes.length;
        allCheckbox.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
      }
    }
  });
}

/**
 * 初始化多人卡导入模块
 */
export function initMultiCharImport() {
  bindMultiImportEvents();
  bindCharSelectEvents();
  bindCharacterTableEvents();
  bindCharOtherEditEvents();
  refreshCharacterTablesUI();
}
