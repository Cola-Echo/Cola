/**
 * 总结功能
 */

import { requestSave } from './save-manager.js';
import { getContext } from '../../../extensions.js';
import { loadWorldInfo, saveWorldInfo, createNewWorldInfo, world_names } from '../../../world-info.js';
import { getSettings, getCupName, SUMMARY_MARKER_PREFIX, LOREBOOK_NAME_PREFIX, LOREBOOK_NAME_SUFFIX } from './config.js';
import { sleep, escapeHtml } from './utils.js';
import { addErrorLog } from './history-logs.js';

// 替换占位符 {{user}} 和 {{char}}
function replacePlaceholders(content, userName, charName) {
  if (!content) return content;
  return content
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{char\}\}/gi, charName);
}

// 获取指定聊天的下一杯编号
export function getNextCupNumber(lorebookName = null) {
  const settings = getSettings();
  const selectedLorebooks = settings.selectedLorebooks || [];
  if (!lorebookName) return 1;
  const lorebook = selectedLorebooks.find(lb => lb.name === lorebookName);
  if (lorebook && lorebook.entries) {
    return lorebook.entries.length + 1;
  }
  return 1;
}

// 刷新总结聊天列表
export function refreshSummaryChatList() {
  const settings = getSettings();
  const contacts = settings.contacts || [];
  const groupChats = settings.groupChats || [];
  const listEl = document.getElementById('wechat-summary-chat-list');
  if (!listEl) return;

  let html = '';

  // 单聊
  contacts.forEach((contact, idx) => {
    const chatHistory = contact.chatHistory || [];
    // 计算未总结的消息数量
    let lastMarkerIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        lastMarkerIndex = i;
        break;
      }
    }
    const newMsgCount = chatHistory.slice(lastMarkerIndex + 1).filter(m => !m.content?.startsWith(SUMMARY_MARKER_PREFIX)).length;

    if (newMsgCount > 0) {
      html += `
        <div class="wechat-summary-chat-item" style="display: flex; align-items: center; padding: 6px 4px; cursor: pointer; border-radius: 4px; margin-bottom: 4px;">
          <input type="checkbox" class="wechat-summary-chat-check" data-type="contact" data-index="${idx}" checked style="margin-right: 8px; cursor: pointer;">
          <span style="flex: 1; font-size: 13px;">${escapeHtml(contact.name)}</span>
          <span style="font-size: 11px; color: var(--wechat-text-secondary);">${newMsgCount}条新消息</span>
        </div>
      `;
    }
  });

  // 群聊
  groupChats.forEach((group, idx) => {
    const chatHistory = group.chatHistory || [];
    // 计算未总结的消息数量
    let lastMarkerIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        lastMarkerIndex = i;
        break;
      }
    }
    const newMsgCount = chatHistory.slice(lastMarkerIndex + 1).filter(m => !m.content?.startsWith(SUMMARY_MARKER_PREFIX)).length;

    if (newMsgCount > 0) {
      html += `
        <div class="wechat-summary-chat-item" style="display: flex; align-items: center; padding: 6px 4px; cursor: pointer; border-radius: 4px; margin-bottom: 4px;">
          <input type="checkbox" class="wechat-summary-chat-check" data-type="group" data-index="${idx}" checked style="margin-right: 8px; cursor: pointer;">
          <span style="flex: 1; font-size: 13px;">👥 ${escapeHtml(group.name)}</span>
          <span style="font-size: 11px; color: var(--wechat-text-secondary);">${newMsgCount}条新消息</span>
        </div>
      `;
    }
  });

  if (!html) {
    html = '<div style="text-align: center; color: var(--wechat-text-secondary); padding: 20px; font-size: 13px;">暂无新的聊天记录</div>';
  }

  listEl.innerHTML = html;

  // 点击行也能切换checkbox
  listEl.querySelectorAll('.wechat-summary-chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = !checkbox.checked;
      }
    });
  });
}

// 全选/取消全选
export function selectAllSummaryChats(select) {
  const checkboxes = document.querySelectorAll('.wechat-summary-chat-check');
  checkboxes.forEach(cb => cb.checked = select);
}

// 获取选中的聊天
export function getSelectedChats() {
  const checkboxes = document.querySelectorAll('.wechat-summary-chat-check:checked');
  const selected = {
    contacts: [],
    groups: []
  };
  checkboxes.forEach(cb => {
    const type = cb.dataset.type;
    const index = parseInt(cb.dataset.index);
    if (type === 'contact') {
      selected.contacts.push(index);
    } else if (type === 'group') {
      selected.groups.push(index);
    }
  });
  return selected;
}

// 收集所有联系人的聊天记录（只收集最后一个标记之后的内容）
export function collectAllChatHistory(selectedFilter = null) {
  const settings = getSettings();
  const contacts = settings.contacts || [];
  const groupChats = settings.groupChats || [];
  const allChats = [];

  // 收集单聊
  contacts.forEach((contact, idx) => {
    // 如果有过滤器，检查是否被选中
    if (selectedFilter && !selectedFilter.contacts.includes(idx)) return;

    const chatHistory = contact.chatHistory || [];
    if (chatHistory.length === 0) return;

    let lastMarkerIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        lastMarkerIndex = i;
        break;
      }
    }

    const startIndex = lastMarkerIndex + 1;
    const newMessages = chatHistory.slice(startIndex);
    const realMessages = newMessages.filter(msg =>
      !msg.content?.startsWith(SUMMARY_MARKER_PREFIX)
    );

    if (realMessages.length > 0) {
      allChats.push({
        type: 'contact',
        index: idx,
        contact: contact, // 添加完整的联系人对象，用于获取通话/一起听/心动瞬间记录
        contactName: `【可乐】和${contact.name}的聊天`,
        contactDescription: contact.description || '',
        messages: realMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          time: msg.time || '',
          isVoice: msg.isVoice || false,
          isSticker: msg.isSticker || false,
          isPhoto: msg.isPhoto || false,
          musicInfo: msg.musicInfo || null
        }))
      });
    }
  });

  // 收集群聊
  groupChats.forEach((group, idx) => {
    // 如果有过滤器，检查是否被选中
    if (selectedFilter && !selectedFilter.groups.includes(idx)) return;

    const chatHistory = group.chatHistory || [];
    if (chatHistory.length === 0) return;

    let lastMarkerIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        lastMarkerIndex = i;
        break;
      }
    }

    const startIndex = lastMarkerIndex + 1;
    const newMessages = chatHistory.slice(startIndex);
    const realMessages = newMessages.filter(msg =>
      !msg.content?.startsWith(SUMMARY_MARKER_PREFIX)
    );

    if (realMessages.length > 0) {
      // 获取群成员名称列表
      const memberNames = (group.memberIds || []).map(id => {
        const contact = settings.contacts.find(c => c.id === id);
        return contact?.name || '未知';
      });
      const memberNamesStr = memberNames.join(',');

      // 收集群聊消息，包含发言者信息
      allChats.push({
        type: 'group',
        index: idx,
        contactName: `【可乐】和${memberNamesStr}的聊天`,
        contactDescription: `成员：${Math.min((group.memberIds?.length || 0), 3) + 1}人`,
        messages: realMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          characterName: msg.characterName || '',
          time: msg.time || '',
          isVoice: msg.isVoice || false,
          isSticker: msg.isSticker || false,
          isPhoto: msg.isPhoto || false,
          musicInfo: msg.musicInfo || null
        }))
      });
    }
  });

  return allChats;
}

// 在所有联系人的聊天记录中插入标记
export function insertSummaryMarker(cupNumber, selectedFilter = null) {
  const settings = getSettings();
  const contacts = settings.contacts || [];
  const groupChats = settings.groupChats || [];
  const marker = `${SUMMARY_MARKER_PREFIX}${cupNumber}`;
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // 单聊
  contacts.forEach((contact, idx) => {
    if (selectedFilter && !selectedFilter.contacts.includes(idx)) return;
    if (!contact.chatHistory) contact.chatHistory = [];

    let hasNewMessages = false;
    for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
      const msg = contact.chatHistory[i];
      if (msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) break;
      if (!msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        hasNewMessages = true;
        break;
      }
    }

    if (hasNewMessages || contact.chatHistory.length === 0) {
      const lastMsg = contact.chatHistory[contact.chatHistory.length - 1];
      if (!lastMsg?.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        contact.chatHistory.push({
          role: 'system',
          content: marker,
          time: timeStr,
          timestamp: Date.now(),
          isMarker: true
        });
      }
    }
  });

  // 群聊
  groupChats.forEach((group, idx) => {
    if (selectedFilter && !selectedFilter.groups.includes(idx)) return;
    if (!group.chatHistory) group.chatHistory = [];

    let hasNewMessages = false;
    for (let i = group.chatHistory.length - 1; i >= 0; i--) {
      const msg = group.chatHistory[i];
      if (msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) break;
      if (!msg.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        hasNewMessages = true;
        break;
      }
    }

    if (hasNewMessages || group.chatHistory.length === 0) {
      const lastMsg = group.chatHistory[group.chatHistory.length - 1];
      if (!lastMsg?.content?.startsWith(SUMMARY_MARKER_PREFIX)) {
        group.chatHistory.push({
          role: 'system',
          content: marker,
          time: timeStr,
          timestamp: Date.now(),
          isMarker: true
        });
      }
    }
  });

  requestSave();
}

// 生成总结提示词
export function generateSummaryPrompt(allChats, cupNumber) {
  const settings = getSettings();

  // 如果有自定义模板，使用自定义模板
  let prompt;
  if (settings.customSummaryTemplate && settings.customSummaryTemplate.trim()) {
    prompt = settings.customSummaryTemplate.trim() + '\n\n';
  } else {
    // 使用默认模板（纯对话记录模式）
    prompt = `你的任务是将这段【线上聊天记录】原样整理成JSON格式。

【核心原则】
- 原样保留：完整复制每一条对话，不做任何修改、润色或总结
- 格式统一：按"发言者: 内容"格式逐行记录
- 仅提取关键词：从对话中提取3-5个核心关键词用于检索触发

【输出格式要求】
- 只输出一个JSON对象
- 不要使用markdown代码块
- 直接以 { 开头，以 } 结尾
- keys: 3-5个能代表本次聊天核心内容的关键词（人名、地点、事件等）
- content: 原样复制的对话记录，每条一行，格式为"发言者: 内容"
- comment: "${getCupName(cupNumber)}"

【JSON示例】
{"keys":["公园","约会","周末"],"content":"{{user}}: 今天去哪玩？\\n{{char}}: 去公园吧\\n{{user}}: 好呀\\n{{char}}: 那我们下午2点见","comment":"${getCupName(cupNumber)}"}

`;
  }

  allChats.forEach(chat => {
    // 从联系人名字中提取角色名
    const match = chat.contactName.match(/【可乐】和(.+)的聊天/);
    const charName = match ? match[1] : '{{char}}';

    // 开头加说明
    prompt += `以下是用户{{user}}和角色${charName}的线上聊天内容：\n\n`;

    // 获取联系人的历史记录（用于匹配通话详情）
    const contact = chat.contact;
    const callHistory = contact?.callHistory || [];
    const listenHistory = contact?.listenHistory || [];
    const toyHistory = contact?.toyHistory || [];

    // 用于追踪已处理的历史记录
    let callIndex = 0;
    let listenIndex = 0;
    let toyIndex = 0;

    chat.messages.slice(-300).forEach(msg => {
      let speaker;
      if (msg.role === 'user') {
        speaker = '{{user}}';
      } else if (chat.type === 'group' && msg.characterName) {
        speaker = msg.characterName;
      } else {
        speaker = charName;
      }

      // 检查是否是通话记录
      const callRecordMatch = (msg.content || '').match(/^\[通话记录[：:](.+?)\]$/);
      const videoCallRecordMatch = (msg.content || '').match(/^\[视频通话[：:](.+?)\]$/);
      const listenRecordMatch = (msg.content || '').match(/^\[一起听[：:](.+?)\]$/);
      const toyRecordMatch = (msg.content || '').match(/^\[心动瞬间[：:](.+?)\]$/);

      if (callRecordMatch) {
        // 语音通话记录
        const duration = callRecordMatch[1];
        const voiceRecords = callHistory.filter(r => r.type === 'voice');
        const record = voiceRecords[callIndex];
        callIndex++;

        prompt += `\n--- 以下是本次语音通话 ---\n`;
        if (record && record.messages && record.messages.length > 0) {
          record.messages.forEach(m => {
            const s = m.role === 'user' ? '{{user}}' : charName;
            prompt += `${s}: ${m.content}\n`;
          });
        } else {
          prompt += `（通话时长：${duration}）\n`;
        }
        prompt += `--- 本次语音通话结束 ---\n\n`;

      } else if (videoCallRecordMatch) {
        // 视频通话记录
        const duration = videoCallRecordMatch[1];
        const videoRecords = callHistory.filter(r => r.type === 'video');
        const record = videoRecords[callIndex];

        prompt += `\n--- 以下是本次视频通话 ---\n`;
        if (record && record.messages && record.messages.length > 0) {
          record.messages.forEach(m => {
            const s = m.role === 'user' ? '{{user}}' : charName;
            prompt += `${s}: ${m.content}\n`;
          });
        } else {
          prompt += `（通话时长：${duration}）\n`;
        }
        prompt += `--- 本次视频通话结束 ---\n\n`;

      } else if (listenRecordMatch) {
        // 一起听记录
        const info = listenRecordMatch[1];
        const record = listenHistory[listenIndex];
        listenIndex++;

        prompt += `\n--- 以下是本次一起听 ---\n`;
        if (record) {
          if (record.songName) {
            prompt += `正在听：${record.songName}${record.artist ? ' - ' + record.artist : ''}\n`;
          }
          if (record.messages && record.messages.length > 0) {
            record.messages.forEach(m => {
              const s = m.role === 'user' ? '{{user}}' : charName;
              prompt += `${s}: ${m.content}\n`;
            });
          }
        } else {
          prompt += `（${info}）\n`;
        }
        prompt += `--- 本次一起听结束 ---\n\n`;

      } else if (toyRecordMatch) {
        // 心动瞬间记录
        const info = toyRecordMatch[1];
        const record = toyHistory[toyIndex];
        toyIndex++;

        prompt += `\n--- 以下是本次心动瞬间 ---\n`;
        if (record) {
          if (record.gift) {
            const targetText = record.target === 'character' ? `${charName}在用` : '{{user}}在用';
            prompt += `使用道具：${record.gift.name}（${targetText}）\n`;
          }
          if (record.messages && record.messages.length > 0) {
            record.messages.forEach(m => {
              const s = m.role === 'user' ? '{{user}}' : charName;
              prompt += `${s}: ${m.content}\n`;
            });
          }
        } else {
          prompt += `（${info}）\n`;
        }
        prompt += `--- 本次心动瞬间结束 ---\n\n`;

      } else {
        // 普通消息（不加时间戳）
        let messageContent;
        if (msg.musicInfo) {
          const musicName = msg.musicInfo.name || '未知歌曲';
          const musicArtist = msg.musicInfo.artist || '未知歌手';
          messageContent = `[分享歌曲] ${musicName} - ${musicArtist}`;
        } else if (msg.isVoice) {
          messageContent = `[语音] ${msg.content}`;
        } else if (msg.isSticker) {
          messageContent = '[发送了一个表情包]';
        } else if (msg.isPhoto) {
          messageContent = '[发送了一张图片]';
        } else {
          messageContent = msg.content;
        }

        prompt += `${speaker}: ${messageContent}\n`;
      }
    });
  });

  prompt += `\n请将以上聊天记录原样整理成${getCupName(cupNumber)}的JSON：`;

  return prompt;
}

// 调用总结API
export async function callSummaryAPI(prompt) {
  const settings = getSettings();
  const apiUrl = settings.summaryApiUrl;
  const apiKey = settings.summaryApiKey;
  const model = settings.summarySelectedModel;

  if (!apiUrl || !apiKey || !model) {
    throw new Error('请先配置总结API（URL、密钥和模型）');
  }

  const chatUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: '你是一个专业的内容分析师，擅长从对话中提取关键信息并生成结构化的世界书条目。' },
        { role: 'user', content: prompt }
      ],
      temperature: 1,
      max_tokens: 8196
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析JSON
  const parsed = parseJSONResponse(content);
  if (parsed) return parsed;

  throw new Error('AI返回内容为空或无法解析');
}

// 解析JSON响应
function parseJSONResponse(content) {
  // 方法1: 直接解析
  try {
    const result = JSON.parse(content);
    if (result.keys && result.content) return result;
    if (result.entries?.[0]) return result.entries[0];
  } catch (e) {}

  // 方法2: 移除markdown代码块
  try {
    const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);
    if (result.keys && result.content) return result;
  } catch (e) {}

  // 方法3: 提取JSON部分
  try {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const result = JSON.parse(content.substring(firstBrace, lastBrace + 1));
      if (result.keys && result.content) return result;
    }
  } catch (e) {}

  // 降级方案
  if (content && content.trim().length > 20) {
    const words = content.match(/[\u4e00-\u9fa5]{2,}/g) || ['聊天', '记录'];
    return {
      keys: [...new Set(words)].slice(0, 5),
      content: content.substring(0, 800).replace(/```[\s\S]*?```/g, '').trim(),
      comment: '感情记录'
    };
  }

  return null;
}

// 保存条目到收藏
export function saveEntryToFavorites(entry, cupNumber, lorebookName) {
  const settings = getSettings();
  if (!settings.selectedLorebooks) settings.selectedLorebooks = [];

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // 获取用户名和角色名用于替换占位符
  const context = getContext();
  const userName = context?.name1 || 'User';
  // 从世界书名称中提取角色名（格式：【可乐】和xxx的聊天）
  let charName = lorebookName;
  if (lorebookName.startsWith(LOREBOOK_NAME_PREFIX) && lorebookName.endsWith(LOREBOOK_NAME_SUFFIX)) {
    charName = lorebookName.slice(LOREBOOK_NAME_PREFIX.length, -LOREBOOK_NAME_SUFFIX.length);
  }

  let lorebook = settings.selectedLorebooks.find(lb => lb.name === lorebookName);

  if (!lorebook) {
    lorebook = {
      name: lorebookName,
      addedTime: timeStr,
      entries: [],
      enabled: true,
      fromSummary: true
    };
    settings.selectedLorebooks.push(lorebook);
  }

  // 替换 {{user}} 和 {{char}} 占位符
  const processedContent = replacePlaceholders(entry.content || '', userName, charName);
  const processedKeys = (entry.keys || []).map(key => replacePlaceholders(key, userName, charName));

  const newEntry = {
    uid: cupNumber - 1,
    keys: processedKeys,
    content: processedContent,
    comment: entry.comment || getCupName(cupNumber),
    enabled: true,
    case_sensitive: false,
    priority: 10,
    id: cupNumber - 1,
    addedTime: timeStr
  };

  lorebook.entries.push(newEntry);
  lorebook.lastUpdated = timeStr;
  requestSave();

  return lorebook;
}

// 同步条目到酒馆世界书
export async function syncEntryToSillyTavern(entry, cupNumber, lorebookName) {
  try {
    const name = lorebookName;

    // 获取用户名和角色名用于替换占位符
    const context = getContext();
    const userName = context?.name1 || 'User';
    let charName = lorebookName;
    if (lorebookName.startsWith(LOREBOOK_NAME_PREFIX) && lorebookName.endsWith(LOREBOOK_NAME_SUFFIX)) {
      charName = lorebookName.slice(LOREBOOK_NAME_PREFIX.length, -LOREBOOK_NAME_SUFFIX.length);
    }

    // 替换占位符
    const processedContent = replacePlaceholders(entry.content || '', userName, charName);
    const processedKeys = (entry.keys || []).map(key => replacePlaceholders(key, userName, charName));

    const newEntry = {
      uid: cupNumber - 1,
      key: processedKeys,
      keysecondary: [],
      comment: entry.comment || getCupName(cupNumber),
      content: processedContent,
      constant: false,
      vectorized: false,
      selective: true,
      selectiveLogic: 0,
      addMemo: true,
      order: 100,
      position: 0,
      disable: false,
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: false,
      probability: 100,
      useProbability: true,
      depth: 4,
      group: '',
      caseSensitive: false,
      role: 0
    };

    const worldExists = typeof world_names !== 'undefined' &&
                        Array.isArray(world_names) &&
                        world_names.includes(name);

    if (!worldExists) {
      if (typeof createNewWorldInfo === 'function') {
        await createNewWorldInfo(name);
        await sleep(500);
      }
    }

    let worldInfo = { entries: {} };
    if (typeof loadWorldInfo === 'function') {
      const existingData = await loadWorldInfo(name);
      if (existingData?.entries) worldInfo = existingData;
    }

    worldInfo.entries[cupNumber - 1] = newEntry;

    if (typeof saveWorldInfo === 'function') {
      await saveWorldInfo(name, worldInfo);
      return true;
    }

    throw new Error('saveWorldInfo 函数不可用');
  } catch (err) {
    console.error('[可乐不加冰] 同步到酒馆失败:', err);
    throw err;
  }
}

// 执行总结主函数（按聊天分别处理，每个聊天有自己的世界书）
export async function executeSummary() {
  const progressEl = document.getElementById('wechat-summary-progress');
  const executeBtn = document.getElementById('wechat-summary-execute');

  const updateProgress = (msg) => {
    if (progressEl) progressEl.textContent = msg;
  };

  if (executeBtn) {
    executeBtn.disabled = true;
    executeBtn.textContent = '⏳ 处理中...';
  }

  try {
    // 获取选中的聊天
    const selectedFilter = getSelectedChats();

    // 检查是否有选中项
    if (selectedFilter.contacts.length === 0 && selectedFilter.groups.length === 0) {
      throw new Error('请至少选择一个聊天进行总结');
    }

    updateProgress('📋 收集聊天记录...');
    const allChats = collectAllChatHistory(selectedFilter);

    if (allChats.length === 0) {
      throw new Error('没有新的聊天记录需要总结');
    }

    const totalMessages = allChats.reduce((sum, chat) => sum + chat.messages.length, 0);
    updateProgress('📋 收集到 ' + allChats.length + ' 个对话，共 ' + totalMessages + ' 条消息');
    await sleep(500);

    // 逐个处理每个聊天
    let successCount = 0;
    for (let i = 0; i < allChats.length; i++) {
      const chat = allChats[i];
      const lorebookName = chat.contactName; // 已经是【可乐】和xxx的聊天格式
      const cupNumber = getNextCupNumber(lorebookName);

      updateProgress('🍵 正在处理 ' + chat.contactName + ' (' + (i + 1) + '/' + allChats.length + ')...');
      await sleep(300);

      try {
        // 为单个聊天生成总结
        updateProgress('🤖 分析 ' + chat.contactName + ' 的' + getCupName(cupNumber) + '...');
        const prompt = generateSummaryPrompt([chat], cupNumber);
        const entry = await callSummaryAPI(prompt);

        // 保存到收藏
        saveEntryToFavorites(entry, cupNumber, lorebookName);

        // 尝试同步到酒馆
        try {
          await syncEntryToSillyTavern(entry, cupNumber, lorebookName);
        } catch (syncErr) {
          console.error('[可乐] 同步 ' + lorebookName + ' 到酒馆失败:', syncErr);
          addErrorLog(syncErr, '同步到酒馆');
        }

        // 为该聊天插入标记
        const singleFilter = {
          contacts: chat.type === 'contact' ? [chat.index] : [],
          groups: chat.type === 'group' ? [chat.index] : []
        };
        insertSummaryMarker(cupNumber, singleFilter);

        successCount++;
      } catch (chatErr) {
        console.error('[可乐] 处理 ' + chat.contactName + ' 失败:', chatErr);
        addErrorLog(chatErr, '总结处理: ' + chat.contactName);
        updateProgress('⚠️ ' + chat.contactName + ' 处理失败: ' + chatErr.message);
        await sleep(1000);
      }
    }

    if (successCount === allChats.length) {
      updateProgress('✅ 完成！已为 ' + successCount + ' 个聊天生成总结');
    } else {
      updateProgress('✅ 完成 ' + successCount + '/' + allChats.length + ' 个聊天总结');
    }

    // 刷新收藏列表和聊天选择列表
    import('./favorites.js').then(m => m.refreshFavoritesList());
    refreshSummaryChatList();

  } catch (err) {
    console.error('[可乐] 执行总结失败:', err);
    addErrorLog(err, '执行总结');
    updateProgress('❌ 失败: ' + err.message);
  } finally {
    if (executeBtn) {
      executeBtn.disabled = false;
      executeBtn.textContent = '执行总结';
    }
  }
}

// 回退总结（从历史回顾中选择要回退的世界书）
export async function rollbackSummary() {
  const settings = getSettings();
  const progressEl = document.getElementById('wechat-summary-progress');
  const rollbackBtn = document.getElementById('wechat-summary-rollback');

  const updateProgress = (msg) => {
    if (progressEl) progressEl.textContent = msg;
  };

  // 找到所有总结生成的世界书
  const selectedLorebooks = settings.selectedLorebooks || [];
  const summaryBooks = selectedLorebooks.filter(lb =>
    lb.fromSummary === true ||
    (lb.name && lb.name.startsWith('【可乐】和') && lb.name.endsWith('的聊天'))
  );

  if (summaryBooks.length === 0) {
    updateProgress('🧊 没有可回退的总结');
    return;
  }

  // 构建选择列表
  const options = summaryBooks.map((lb, idx) => {
    const entriesCount = lb.entries?.length || 0;
    return (idx + 1) + '. ' + lb.name + ' (' + entriesCount + '杯)';
  }).join('\n');

  const choice = prompt('选择要回退的世界书（输入序号）：\n\n' + options + '\n\n输入序号:');
  if (!choice) return;

  const choiceIdx = parseInt(choice) - 1;
  if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= summaryBooks.length) {
    updateProgress('🧊 无效的选择');
    return;
  }

  const targetBook = summaryBooks[choiceIdx];
  const lorebookIdx = selectedLorebooks.findIndex(lb => lb.name === targetBook.name);

  if (lorebookIdx < 0 || !targetBook.entries?.length) {
    updateProgress('🧊 该世界书没有可回退的条目');
    return;
  }

  const cupNumber = targetBook.entries.length;

  if (!confirm(
    '确定要回退「' + targetBook.name + '」的' + getCupName(cupNumber) + '总结吗？\n\n' +
    '这将删除：\n1. 世界书中的' + getCupName(cupNumber) + '条目\n' +
    '2. 相关聊天记录中的"' + SUMMARY_MARKER_PREFIX + cupNumber + '"标记'
  )) {
    return;
  }

  if (rollbackBtn) {
    rollbackBtn.disabled = true;
    rollbackBtn.textContent = '⏳ 回退中...';
  }

  try {
    // 1) 从收藏中删除最后一个条目
    targetBook.entries.pop();
    updateProgress('✅ 已删除收藏中的条目...');

    // 2) 从相关聊天记录中删除对应标记
    const markerToRemove = SUMMARY_MARKER_PREFIX + cupNumber;
    const contacts = settings.contacts || [];
    const groupChats = settings.groupChats || [];
    let removedCount = 0;

    // 从单聊中移除
    contacts.forEach(contact => {
      if (!contact.chatHistory) return;
      for (let i = contact.chatHistory.length - 1; i >= 0; i--) {
        const msg = contact.chatHistory[i];
        if (msg.content === markerToRemove ||
            (msg.isMarker && msg.content?.startsWith(SUMMARY_MARKER_PREFIX + cupNumber))) {
          contact.chatHistory.splice(i, 1);
          removedCount++;
        }
      }
    });

    // 从群聊中移除
    groupChats.forEach(group => {
      if (!group.chatHistory) return;
      for (let i = group.chatHistory.length - 1; i >= 0; i--) {
        const msg = group.chatHistory[i];
        if (msg.content === markerToRemove ||
            (msg.isMarker && msg.content?.startsWith(SUMMARY_MARKER_PREFIX + cupNumber))) {
          group.chatHistory.splice(i, 1);
          removedCount++;
        }
      }
    });

    updateProgress('✅ 已移除 ' + removedCount + ' 个标记...');

    // 如果世界书条目已清空，从selectedLorebooks中移除整个世界书
    if (targetBook.entries.length === 0) {
      selectedLorebooks.splice(lorebookIdx, 1);
      updateProgress('✅ 世界书已清空，已删除...');
    }

    requestSave();

    // 3) 尝试同步删除酒馆世界书条目（或整个世界书）
    try {
      const name = targetBook.name;
      const worldExists = typeof world_names !== 'undefined' &&
                          Array.isArray(world_names) &&
                          world_names.includes(name);

      if (worldExists && typeof loadWorldInfo === 'function' && typeof saveWorldInfo === 'function') {
        const worldInfo = await loadWorldInfo(name);
        if (worldInfo?.entries && worldInfo.entries[cupNumber - 1]) {
          delete worldInfo.entries[cupNumber - 1];

          // 检查酒馆世界书是否还有条目
          const remainingEntries = Object.keys(worldInfo.entries).length;
          if (remainingEntries === 0) {
            // 如果没有条目了，尝试删除整个世界书
            try {
              const { deleteWorldInfo } = await import('../../../world-info.js');
              if (typeof deleteWorldInfo === 'function') {
                await deleteWorldInfo(name);
                updateProgress('✅ 已删除酒馆世界书');
              } else {
                await saveWorldInfo(name, worldInfo);
                updateProgress('✅ 已同步回退到酒馆（世界书已清空）');
              }
            } catch (delErr) {
              await saveWorldInfo(name, worldInfo);
              updateProgress('✅ 已同步回退到酒馆');
            }
          } else {
            await saveWorldInfo(name, worldInfo);
            updateProgress('✅ 已同步回退到酒馆');
          }
        } else {
          updateProgress('✅ 本地回退完成（酒馆无需同步）');
        }
      } else {
        updateProgress('✅ 本地回退完成（酒馆同步不可用）');
      }
    } catch (syncErr) {
      console.error('[可乐] 回退同步到酒馆失败:', syncErr);
      addErrorLog(syncErr, '回退同步');
      updateProgress('✅ 本地回退完成（酒馆同步失败）');
    }

    import('./favorites.js').then(m => m.refreshFavoritesList());
    refreshSummaryChatList();
  } catch (err) {
    console.error('[可乐] 回退总结失败:', err);
    addErrorLog(err, '回退总结');
    updateProgress('⚠️ 回退失败: ' + err.message);
  } finally {
    if (rollbackBtn) {
      rollbackBtn.disabled = false;
      rollbackBtn.textContent = '回退总结';
    }
  }
}

/**
 * 从酒馆世界书恢复总结数据
 * 当插件的 selectedLorebooks 条目丢失但酒馆世界书还在时使用
 */
export async function recoverFromTavernWorldbook() {
  const settings = getSettings();
  const selectedLorebooks = settings.selectedLorebooks || [];

  // 找到所有总结生成的世界书（条目为空的）
  const emptyBooks = selectedLorebooks.filter(lb =>
    (lb.fromSummary === true || (lb.name && lb.name.startsWith(LOREBOOK_NAME_PREFIX))) &&
    (!lb.entries || lb.entries.length === 0)
  );

  if (emptyBooks.length === 0) {
    alert('没有需要恢复的世界书（所有世界书都有条目，或没有总结类世界书）');
    return;
  }

  const options = emptyBooks.map((lb, idx) => `${idx + 1}. ${lb.name}`).join('\n');
  const choice = prompt(`以下世界书条目为空，可尝试从酒馆恢复：\n\n${options}\n\n输入序号（或输入 all 恢复全部）:`);

  if (!choice) return;

  const booksToRecover = choice.toLowerCase() === 'all'
    ? emptyBooks
    : [emptyBooks[parseInt(choice) - 1]].filter(Boolean);

  if (booksToRecover.length === 0) {
    alert('无效的选择');
    return;
  }

  let recoveredCount = 0;
  let totalEntries = 0;

  for (const book of booksToRecover) {
    try {
      const name = book.name;

      // 检查酒馆世界书是否存在
      const worldExists = typeof world_names !== 'undefined' &&
                          Array.isArray(world_names) &&
                          world_names.includes(name);

      if (!worldExists) {
        console.log(`[可乐] 酒馆中不存在世界书: ${name}`);
        continue;
      }

      // 加载酒馆世界书
      if (typeof loadWorldInfo !== 'function') {
        console.error('[可乐] loadWorldInfo 函数不可用');
        continue;
      }

      const worldInfo = await loadWorldInfo(name);
      if (!worldInfo?.entries || Object.keys(worldInfo.entries).length === 0) {
        console.log(`[可乐] 酒馆世界书 ${name} 没有条目`);
        continue;
      }

      // 将酒馆条目转换为插件格式
      const entries = [];
      const sortedKeys = Object.keys(worldInfo.entries).sort((a, b) => parseInt(a) - parseInt(b));

      for (const key of sortedKeys) {
        const tavernEntry = worldInfo.entries[key];
        if (!tavernEntry) continue;

        entries.push({
          content: tavernEntry.content || '',
          comment: tavernEntry.comment || getCupName(entries.length + 1),
          keys: tavernEntry.key || [],
          enabled: !tavernEntry.disable,
          addedTime: new Date().toISOString()
        });
      }

      if (entries.length > 0) {
        // 更新插件的 selectedLorebooks
        const bookIndex = selectedLorebooks.findIndex(lb => lb.name === name);
        if (bookIndex >= 0) {
          selectedLorebooks[bookIndex].entries = entries;
          selectedLorebooks[bookIndex].lastUpdated = new Date().toISOString();
          recoveredCount++;
          totalEntries += entries.length;
          console.log(`[可乐] 已恢复 ${name}: ${entries.length} 条`);
        }
      }
    } catch (err) {
      console.error(`[可乐] 恢复 ${book.name} 失败:`, err);
    }
  }

  if (recoveredCount > 0) {
    requestSave();
    alert(`恢复完成！\n\n已恢复 ${recoveredCount} 个世界书，共 ${totalEntries} 条总结。\n\n请刷新页面查看。`);
  } else {
    alert('恢复失败：酒馆中没有找到对应的世界书数据。\n\n数据可能已彻底丢失。');
  }
}
