/**
 * 配置、常量、默认设�?
 */

import { extension_settings } from '../../../extensions.js';

// 插件名称
export const extensionName = 'wechat-simulator';

// Meme 表情包列表（catbox.moe�?
export const MEME_STICKERS = [
  '告到小狗法庭iaordo.jpg',
  '小猫伸爪f6nqiq.gif',
  '谢谢宝贝我现在那里好�?62o48.jpg',
  '阿弥陀�?cwm60.jpg',
  '你好美你长得像我爱人hmpkra.jpg',
  '我老实了i3ws7s.jpg',
  '蹭蹭你贴贴你1of415.gif',
  '喜欢你egvwqb.jpg',
  '我在哭t343od.jpg',
  '不干活就没饭�?qnrgh.jpg',
  '擦眼�?gno7e.jpg',
  '小狗摇尾巴hmdj2k.gif',
  '爱你舔舔你ola7gd.jpg',
  '不高兴x6lv1t.jpg',
  '大哭3ox1j2.gif',
  '你是我老婆8nn1lj.jpg',
  '我是你的小狗gnna86.gif',
  '我忍ftwaba.jpg',
  '别难为狗了gopu17.jpg',
  '我会勃起qyyd9g.jpg',
  '拘谨扭捏2vejqs.jpg',
  '揉揉你qqkv1z.gif',
  '狗狗舔小猫vj1714.gif',
  '你是我的sj7yzn.jpg',
  '要亲亲吗不许拒绝umvaji.jpg',
  '震惊害怕muc86m.jpg',
  '丑猫哭哭4ybcj1.jpg',
  '要哭了tnilep.jpg',
  '我来咯r9cix2.gif',
  '脑袋空空rbx0ch.jpg',
  '跟着你lu2t54.png',
  '小熊跳舞122o4w.gif',
  '狗鼻子拱拱你kip4fo.gif',
  '超级心虚k3xk40.jpg',
  '我害怕我走了newaoh.jpg',
  '目移69jgvg.jpg',
  '上钩了cormmk.jpg',
  '无语了我哭了0awxky.jpg',
  '你嫌我丢�?d71mm.jpg',
  '笑不出来xkop14.jpg',
  '别欺负小狗啊u4t3t3.jpg',
  '他妈的真是被看扁了ime5rz.jpg',
  '现在强烈地想做爱oqh283.jpg',
  '我操klwqm3.jpg',
  '这样伤害我不太好吧zihvph.jpg',
  '反正我就是变态qgha72.jpg',
  '鸡巴梆硬去趟厕所pbxrqh.jpg',
  '我哭了你暴力我up99xo.jpg',
  '被骂饱了vpixr4.jpg',
  '裤裆掏玫瑰l7q8yz.gif',
  '傻瓜sbgrcu.jpg',
  '咬人5hmtd1.jpg',
  '哽咽z38xrc.jpg',
  '欸我操了q0fv4d.jpg',
  '扭捏9pon3x.jpeg',
  '失望eug1e6.jpeg',
  '狂犬病发作xb3naz.jpg',
  '我是狗吗ma9azs.jpg',
  '一笑了�?llb46.jpg',
  '装可怜lcglz1.jpg',
  '小狗撒欢6j6y6a.gif',
  '狗舔舔esw5e2.gif',
  '皱眉nibd87.gif',
  '大哭auylzr.jpg',
  '我要草你5neozi.jpg',
  '沉默无言mzyapz.jpg',
  '痛哭v4g8v6.jpg',
  '擦汗dig3ks.png',
  '情欲难抑h1gfp6.jpg',
  '扭头不看r8rbzh.jpg',
  '神色凄惶wfhp45.jpg',
  '哽咽0cmn6h.jpg',
  '忍眼泪td0cz7.gif',
  '小期待小惊喜335fzr.gif',
  '饿了w0cx8k.jpg',
  '弱智兔头6svelp.jpg',
  '被逮捕了uzeywu.jpg',
  '看呆mqnepo.jpg',
  '我的理性在远去t9e065.jpg',
  '偷亲一�?jgvb1.gif',
  '震惊v5n2ve.jpg',
  '爷怒了49r80k.jpg',
  '愤怒伤心e7lr3s.jpg',
  '狗叫usjdrr.jpg',
  '小狗面露难色5bk38l.jpg',
  '我投降jkeps1.jpg',
  '忍耐中8mnszb.jpg',
  '心虚讨好mxtaj7.jpg',
  '亲你的手nls3gm.jpg',
  '收到ldqwqr.jpg',
  '你太可爱我喜欢你ubhai8.jpg',
  '惊吓tp9uvd.jpg',
  '脸红星星眼dsfs7o.jpg',
  '被揍了哭�?1x5zq.jpg',
  '嘬嘬fg5gx3.jpg',
  '超大声哭�?86h5v.jpg',
  '是的主人yvrgdc.jpg'
];

// Meme 表情包提示词模板
export const MEME_PROMPT_TEMPLATE = `##【必须使用】表情包功能
【重要】你【必须】经常发送表情包！每2-3条回复至少发一个表情包�?

使用规则�?
- 表情包【必须】单独一条消息，�?||| 分隔
- 格式�?meme>文件�?/meme>
- 只能从下面列表选择，不能编造文件名

可用表情包列表：
[
${MEME_STICKERS.join('\n')}
]

【正确示例】：
好想你|||<meme>小狗摇尾巴hmdj2k.gif</meme>
哈哈哈笑死|||<meme>小熊跳舞122o4w.gif</meme>|||你太搞笑�?
<meme>喜欢你egvwqb.jpg</meme>|||我真的好喜欢�?

【错误示�?- 绝对禁止】：
好想�?meme>xxx</meme> �?错误！表情包没有用|||分开
<meme>不存在的表情.jpg</meme> �?错误！编造了不存在的文件�?

记住：表情包让聊天更生动，【必须】经常使用！`;

// 默认设置
export const defaultSettings = {
  darkMode: true,

  /**
   * 【自动注入提示词�?
   * 开启后会自动将微信消息格式提示词注入到作者注释中
   * 提示词模板见下方 authorNoteTemplate
   * 如需自定义格式，修改 authorNoteTemplate 即可
   */
  autoInjectPrompt: true,

  contacts: [],
  phoneVisible: false,
  // 记录拖拽后的位置（可选）
  phonePosition: null,
  userAvatar: '',
  wechatId: 'SillyTavern',
  // 收藏/世界�?用户设定
  selectedLorebooks: [],
  userPersonas: [],

  // ========== 单聊 API 配置 ==========
  apiUrl: '',
  apiKey: '',
  selectedModel: '',
  modelList: [],

  // ========== 总结功能 API 配置 ==========
  summaryApiUrl: '',
  summaryApiKey: '',
  summarySelectedModel: '',
  summaryModelList: [],

  // ========== 群聊 API 配置 ==========
  // 群聊可以使用独立的API，不配置则使用单聊API
  groupApiUrl: '',
  groupApiKey: '',
  groupSelectedModel: '',
  groupModelList: [],

  // 上下文设�?
  contextEnabled: false,
  contextLevel: 5,
  contextTags: [],
  walletAmount: '5773.89',

  /**
   * 【哈基米破限�?
   * 针对 Gemini 2.5 Pro 等模型的输出截断问题
   * 开启后会在系统提示词头部注入一�?创作沙盒"提示�?
   * 帮助解除模型的自我审查，让输出更完整
   */
  hakimiBreakLimit: false,
  // 自定义哈基米破限词（留空则使用默认）
  hakimiCustomPrompt: '',

  // 自定义作者注释模板（留空则使用默认）
  authorNoteCustom: '',

  // 群聊相关
  groupChats: [],

  // 错误日志
  errorLogs: [],

  // 表情（用户添加的单个表情�?
  stickers: [],

  // 用户表情开�?
  userStickersEnabled: true,

  // Meme 表情包功能开�?
  memeStickersEnabled: false,

  /**
   * 【群聊提示词注入�?
   * 开启后会将 groupAuthorNote 注入到群聊系统提示词�?
   * 如需自定义群聊格式，修改下方 groupAuthorNote 即可
   */
  groupAutoInjectPrompt: true,
  groupAuthorNote: `[群聊回复格式指南]
这是一个微信群聊场景，你需要扮演群内的角色进行回复�?

【核心规则�?
1. 每个角色只能使用自己的专属设定，不能使用其他角色的设�?
2. 每个角色只扮演自己，不能代替其他角色说话
3. 使用 [角色名]: 内容 的格式回�?
4. 多个角色回复时，�?||| 分隔
5. 同一角色可以发送多条消息，也用 ||| 分隔

【消息风格�?
- 每条消息保持简短自然，像真实微信聊天一样（1-3句话为宜�?
- 可以使用表情符号增加表现�?
- 保持角色性格，让对话有趣生动
- 角色之间可以互动、吐槽、附和、反驳等

【回复要求�?
- 根据聊天内容自然判断哪些角色会回复，不需要所有人都说�?
- 语音消息格式：[角色名]: [语音:内容]
- 语音消息必须独立发�?

示例�?
[角色A]: 你说得对|||[角色B]: 我不太同意诶|||[角色A]: 为什么啊�?
[角色A]: [语音:哈哈哈笑死我了]
[角色B]: @角色A 你是不是傻|||开玩笑的啦`,
  userGroupAuthorNote: '',  // 用户自定义群聊提示词（界面显示用，留空则使用内置模板）
};

// 作者注释模�?
export const authorNoteTemplate = `【可乐不加冰 消息格式指南】每次必须使用以下格式输出消息内容，不用生成除此之外的任何其他内容和文本。不得省略任何格式部分�?

【核心规�?- 必须遵守�?
- 每条消息都是独立的，�?||| 分隔多条消息
- 保持消息简短自然，像真实微信聊天（1-3句话为宜�?
- 绝对禁止代替{{user}}发言，严禁替{{user}}回复消息，严禁扮演{{user}}，严禁捏造输出{{user}}的消�?
- 只输出角色的消息内容，禁止添加任何旁白、心理描写或场景说明

【消息数量规�?- 重要�?
- 根据情境动态调整消息数量，通常1-7条不�?
- 禁止固定每次回复的消息数�?
- 模拟真实聊天节奏

【消息类型格式�?
- 普通消息：直接写内�?
- 语音消息：[语音:语音内容文字]
- 照片/图片/视频/自拍：[照片:媒体描述]
- 表情包回复：[表情:序号或名称]
- 音乐分享：[音乐:歌名]
- 撤回消息：[撤回]
- 引用回复：[回复:被引用的关键词]回复内容

【多条消息示例�?
你好|||最近怎么样？
哈哈|||太好笑了|||笑死我了
[语音:好想你啊]|||什么时候有空？

【媒体消息说明】当角色发送图片、视频、自拍等媒体时，使用照片格式并提�?-4句描述：
[照片:她随手拍下窗外的晚霞，橙红色的云彩铺满天空]
[照片:一张餐厅自拍，她对着镜头比了个耶的手势，桌上摆着精致的甜点]
[照片:手机截图，显示她正在追的剧刚更新了]
发送媒体的频率应模拟真实聊天习惯，不要过于频繁。角色会分享日常：随手拍的风景、美食、自拍、截图、录像等�?

【错误示�?- 绝对禁止�?
*她微微一�? 你好�?�?错误！禁止添加动作描�?
你好，最近怎么样？太好笑了 �?错误！没有用|||分开
{{user}}: 我也想你 �?错误！禁止替用户发言`;

// 世界书名称前缀（用于生�?【可乐】和xx的聊�?格式�?
export const LOREBOOK_NAME_PREFIX = '【可乐】和';
export const LOREBOOK_NAME_SUFFIX = '的聊天';

// 生成世界书名�?
export function generateLorebookName(contactName) {
  return `${LOREBOOK_NAME_PREFIX}${contactName}${LOREBOOK_NAME_SUFFIX}`;
}

// 杯数名称映射
export function getCupName(cupNumber) {
  const cupNames = ['第一杯', '第二杯', '第三杯', '第四杯', '第五杯', '第六杯', '第七杯', '第八杯', '第九杯', '第十杯'];
  if (cupNumber <= 10) {
    return cupNames[cupNumber - 1];
  }
  return `第${cupNumber}杯`;
}

// 总结标记前缀
export const SUMMARY_MARKER_PREFIX = '🧊 可乐已加冰_';

// 获取设置
export function getSettings() {
  if (!extension_settings[extensionName]) loadSettings();
  return extension_settings[extensionName];
}

export function getUserStickers(settings = getSettings()) {
  const raw = Array.isArray(settings?.stickers) ? settings.stickers : [];
  return raw.filter(s => s && typeof s.url === 'string' && s.url.trim());
}

// 解析 <meme> 标签，替换为图片 HTML
export function parseMemeTag(text) {
  if (!text || typeof text !== 'string') return text;
  // 匹配 <meme>任意描述+文件ID.扩展�?/meme>，只捕获文件ID部分
  // 使用 .*? 替代 [\u4e00-\u9fa5]*? 以支持包含特殊字符（�?! ? 等）的表情名�?
  return text.replace(/<\s*meme\s*>.*?([a-zA-Z0-9]+?\.(?:jpg|jpeg|png|gif))\s*<\s*\/\s*meme\s*>/gi, (match, fileId) => {
    return `<img src="https://files.catbox.moe/${fileId}" style="max-width:130px; border-radius: 10px; display: block; margin: 0 auto;" alt="表情包" onerror="this.alt='加载失败'; this.style.border='1px dashed #ff4d4f';">`;
  });
}

// 检查文本中是否包含 <meme> 标签
export function hasMemeTag(text) {
  if (!text || typeof text !== 'string') return false;
  return /<meme>\s*.+?\s*<\/meme>/i.test(text);
}

// 智能分割AI消息：处�?||| 分隔符，并将 meme/语音/照片/音乐 标签与其他文字分开
export function splitAIMessages(response) {
  if (!response || typeof response !== 'string') return [];

  // 第一步：�?||| 分隔
  const parts = response.split('|||').map(m => m.trim()).filter(m => m);

  // 第二步：对每个部分检查是否包含需要分割的特殊标签
  const result = [];
  // meme 标签 - 使用 .*? 替代 [\u4e00-\u9fa5]*? 以支持包含特殊字符的表情名称
  const memeRegex = /<\s*meme\s*>.*?[a-zA-Z0-9]+?\.(?:jpg|jpeg|png|gif)\s*<\s*\/\s*meme\s*>/gi;
  // 语音标签 [语音:xxx] 或 [语音：xxx]
  const voiceRegex = /\[语音[：:]\s*.+?\]/g;
  // 照片标签 [照片:xxx] 或 [照片：xxx]
  const photoRegex = /\[照片[：:]\s*.+?\]/g;
  // 音乐标签：
  // 1. [音乐:歌名] 或 [分享音乐:歌名] - 带冒号格式
  // 2. [分享音乐] 歌名 - 歌手 - 无冒号格式（AI可能会这样输出）
  const musicRegexWithColon = /\[(?:分享)?音乐[：:]\s*.+?\]/g;
  const musicRegexNoColon = /\[分享音乐\]\s*[\u4e00-\u9fa5a-zA-Z0-9]+(?:\s*[-–—]\s*[\u4e00-\u9fa5a-zA-Z0-9]+)?/g;
  // 表情标签 [表情:xxx]
  const stickerRegex = /\[表情[：:]\s*.+?\]/g;
  // 撤回标签 [撤回] 或 [撤回了一条消息]
  const recallRegex = /\[撤回(?:了一条消息)?\]/g;

  for (const part of parts) {
    // 【重要】检查是否是朋友圈标签 - 朋友圈标签不应该被分割，因为可能包含内嵌的 [照片:xxx]
    // 例如：[朋友圈：等着 [照片:自拍照]] 应该作为一个整体
    if (/^\[朋友圈[：:]/.test(part)) {
      result.push(part);
      continue;
    }

    // 收集所有需要分割的标签及其位置
    const specialTags = [];

    // 查找 meme 标签
    let match;
    const memeRegexLocal = new RegExp(memeRegex.source, 'gi');
    while ((match = memeRegexLocal.exec(part)) !== null) {
      specialTags.push({ tag: match[0], index: match.index });
    }

    // 查找语音标签
    const voiceRegexLocal = new RegExp(voiceRegex.source, 'g');
    while ((match = voiceRegexLocal.exec(part)) !== null) {
      specialTags.push({ tag: match[0], index: match.index });
    }

    // 查找照片标签
    const photoRegexLocal = new RegExp(photoRegex.source, 'g');
    while ((match = photoRegexLocal.exec(part)) !== null) {
      specialTags.push({ tag: match[0], index: match.index });
    }

    // 查找音乐标签（带冒号格式�?
    const musicRegexLocal1 = new RegExp(musicRegexWithColon.source, 'g');
    while ((match = musicRegexLocal1.exec(part)) !== null) {
      specialTags.push({ tag: match[0], index: match.index });
    }

    // 查找音乐标签（无冒号格式�?
    const musicRegexLocal2 = new RegExp(musicRegexNoColon.source, 'g');
    while ((match = musicRegexLocal2.exec(part)) !== null) {
      // 避免重复匹配（如果已经被带冒号的匹配到）
      const alreadyMatched = specialTags.some(t =>
        t.index === match.index ||
        (match.index >= t.index && match.index < t.index + t.tag.length)
      );
      if (!alreadyMatched) {
        specialTags.push({ tag: match[0], index: match.index });
      }
    }

    // 查找表情标签
    const stickerRegexLocal = new RegExp(stickerRegex.source, 'g');
    while ((match = stickerRegexLocal.exec(part)) !== null) {
      specialTags.push({ tag: match[0], index: match.index });
    }

    // 查找撤回标签
    const recallRegexLocal = new RegExp(recallRegex.source, 'g');
    while ((match = recallRegexLocal.exec(part)) !== null) {
      specialTags.push({ tag: match[0], index: match.index });
    }

    // 如果没有特殊标签，直接添�?
    if (specialTags.length === 0) {
      result.push(part);
      continue;
    }

    // 调试日志
    console.log('[可乐] splitAIMessages 分割:', { part, specialTags });

    // 按位置排�?
    specialTags.sort((a, b) => a.index - b.index);

    // 分割消息
    let lastEnd = 0;
    for (const { tag, index } of specialTags) {
      // 添加标签前的文字
      if (index > lastEnd) {
        const before = part.substring(lastEnd, index).trim();
        if (before) result.push(before);
      }
      // 添加标签本身
      result.push(tag);
      lastEnd = index + tag.length;
    }

    // 添加最后一个标签后的文�?
    if (lastEnd < part.length) {
      const after = part.substring(lastEnd).trim();
      if (after) result.push(after);
    }
  }

  // 调试日志
  console.log('[可乐] splitAIMessages 结果:', { 原始: response.substring(0, 100), 分割后: result });

  return result.filter(m => m);
}

function cloneDefault(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...value };
  return value;
}

function applyDefaults(target, defaults) {
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (target[key] === undefined) {
      target[key] = cloneDefault(defaultValue);
    }
  }
}

// 初始化设�?
export function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  const settings = extension_settings[extensionName];
  applyDefaults(settings, defaultSettings);

  // 兼容旧版：userPersona -> userPersonas[]
  if (settings.userPersona && (!Array.isArray(settings.userPersonas) || settings.userPersonas.length === 0)) {
    settings.userPersonas = Array.isArray(settings.userPersonas) ? settings.userPersonas : [];
    settings.userPersonas.push({
      name: settings.userPersona.name || '用户设定',
      content: settings.userPersona.customContent || settings.userPersona.content || '',
      enabled: settings.userPersona.enabled !== false,
      addedTime: settings.userPersona.addedTime || ''
    });
  }
  if (settings.userPersona) delete settings.userPersona;

  // 迁移：旧�?aiStickers -> stickers（“添加的单个表情”）
  // 说明：如果用户已经有自己�?stickers，则不再合并�?aiStickers（避免把旧默�?catbox 列表灌进去）�?
  const hasUserStickers = Array.isArray(settings.stickers) &&
    settings.stickers.some(s => typeof s?.url === 'string' && s.url.trim());

  if (Array.isArray(settings.aiStickers)) {
    if (!hasUserStickers && settings.aiStickers.length > 0) {
      settings.stickers = Array.isArray(settings.stickers) ? settings.stickers : [];
      const existingUrls = new Set(
        settings.stickers
          .map(s => (s?.url || '').toString().trim())
          .filter(Boolean)
      );

      for (const s of settings.aiStickers) {
        const url = (s?.url || '').toString().trim();
        if (!url || existingUrls.has(url)) continue;
        existingUrls.add(url);
        settings.stickers.push({
          id: s?.id,
          url,
          name: s?.name || '',
          addedTime: s?.addedTime || ''
        });
      }
    }

    delete settings.aiStickers;
  }

  if (!Array.isArray(settings.stickers)) settings.stickers = [];

  // 迁移：旧�?aiStickersEnabled -> userStickersEnabled
  if (settings.aiStickersEnabled !== undefined) {
    if (settings.userStickersEnabled === undefined) {
      settings.userStickersEnabled = settings.aiStickersEnabled;
    }
    delete settings.aiStickersEnabled;
  }

  console.log('[可乐] loadSettings 完成:', {
    用户表情数量: settings.stickers?.length || 0,
    userStickersEnabled: settings.userStickersEnabled !== false
  });
}
