/**
 * 语音 API 封装
 * TTS (文字转语音) 和 STT (语音转文字)
 */

import { getSettings } from './config.js';

/**
 * 获取语音 API 配置
 * @param {Object} contact - 角色对象（可选，用于获取角色独立配置）
 * @returns {Object} 配置对象
 */
export function getVoiceApiConfig(contact = null) {
  const settings = getSettings();

  // 基础配置
  const config = {
    stt: {
      url: settings.sttApiUrl || '',
      key: settings.sttApiKey || '',
      model: settings.sttModel || ''
    },
    tts: {
      url: settings.ttsApiUrl || '',
      key: settings.ttsApiKey || '',
      model: settings.ttsModel || '',
      voice: settings.ttsVoice || '',
      speed: settings.ttsSpeed || 1,
      emotion: settings.ttsEmotion || '默认',
      proxyUrl: settings.ttsProxyUrl || ''
    }
  };

  // 角色独立 TTS 配置
  if (contact?.useCustomVoice && contact.customTtsVoice) {
    config.tts.voice = contact.customTtsVoice;
  }

  return config;
}

/**
 * 根据 Blob 类型获取文件名
 */
function getAudioFileName(blob) {
  const type = blob.type || 'audio/webm';
  if (type.includes('webm')) return 'audio.webm';
  if (type.includes('ogg')) return 'audio.ogg';
  if (type.includes('mp4')) return 'audio.mp4';
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3';
  if (type.includes('wav')) return 'audio.wav';
  if (type.includes('flac')) return 'audio.flac';
  return 'audio.webm';
}

/**
 * 将音频 Blob 转换为 WAV 格式（更好的兼容性）
 * 导出供其他模块使用
 */
export async function convertToWav(audioBlob) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 创建 WAV 文件
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = audioBuffer.length;
    const dataSize = samples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV 头部
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // 写入音频数据
    const channelData = [];
    for (let i = 0; i < numChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < samples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    await audioContext.close();
    return new Blob([buffer], { type: 'audio/wav' });
  } catch (err) {
    console.warn('[可乐] WAV 转换失败，使用原格式:', err);
    return audioBlob;
  }
}

/**
 * STT: 语音转文字
 * @param {Blob} audioBlob - 音频数据
 * @param {Object} options - 选项
 * @returns {Promise<string>} 识别的文字
 */
export async function speechToText(audioBlob, options = {}) {
  const config = getVoiceApiConfig();

  if (!config.stt.url || !config.stt.key) {
    throw new Error('请先配置语音识别 (STT) API');
  }

  // 自动补全 URL 路径
  let sttUrl = config.stt.url.trim().replace(/\/+$/, '');
  if (!sttUrl.includes('/audio/transcriptions')) {
    sttUrl = sttUrl + '/audio/transcriptions';
  }

  // 如果不是 WAV 格式，尝试转换以提高兼容性
  let processedBlob = audioBlob;
  if (!audioBlob.type.includes('wav')) {
    console.log('[可乐] 转换音频为 WAV 格式...');
    processedBlob = await convertToWav(audioBlob);
  }

  // 根据音频类型设置正确的文件名
  const fileName = getAudioFileName(processedBlob);

  const formData = new FormData();
  formData.append('file', processedBlob, fileName);

  if (config.stt.model) {
    formData.append('model', config.stt.model);
  }

  try {
    console.log('[可乐] STT 请求:', {
      url: sttUrl,
      model: config.stt.model,
      originalType: audioBlob.type,
      processedType: processedBlob.type,
      audioSize: processedBlob.size,
      fileName: fileName
    });

    const response = await fetch(sttUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.stt.key}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[可乐] STT API 错误:', response.status, errorText);
      // 尝试解析 JSON 错误
      try {
        const errorJson = JSON.parse(errorText);
        const errorMsg = errorJson.error?.message || errorJson.message || errorText;
        throw new Error(errorMsg);
      } catch (parseErr) {
        // 如果不是 JSON 解析错误，而是 throw 的错误，重新抛出
        if (parseErr.message && !parseErr.message.includes('JSON')) {
          throw parseErr;
        }
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
    }

    const result = await response.json();
    console.log('[可乐] STT 响应:', result);
    return result.text || '';
  } catch (err) {
    console.error('[可乐] STT 请求失败:', err);
    throw err;
  }
}

/**
 * TTS: 文字转语音
 * @param {string} text - 要合成的文字
 * @param {Object} contact - 角色对象（用于获取角色独立音色）
 * @param {Object} options - 选项
 * @returns {Promise<Blob>} 音频 Blob
 */
export async function textToSpeech(text, contact = null, options = {}) {
  const config = getVoiceApiConfig(contact);

  if (!config.tts.url || !config.tts.key) {
    throw new Error('请先配置语音合成 (TTS) API');
  }

  if (!text || !text.trim()) {
    throw new Error('合成文字不能为空');
  }

  // 自动补全 URL 路径
  let ttsUrl = config.tts.url.trim().replace(/\/+$/, '');
  if (!ttsUrl.includes('/audio/speech')) {
    ttsUrl = ttsUrl + '/audio/speech';
  }

  // 构建请求体
  const model = (options.model || config.tts.model || '').trim();
  const voice = (options.voice || config.tts.voice || '').trim();

  // 检查必填字段
  if (!model) {
    throw new Error('请先配置 TTS 模型');
  }
  if (!voice) {
    throw new Error('请先配置 TTS 音色');
  }

  // 检测是否是 Gemini TTS 模型
  const isGeminiTTS = model.toLowerCase().includes('gemini') && model.toLowerCase().includes('tts');
  // 检测是否是 GSVI 模型 (gsv2p.acgnai.top)
  const isGSVI = model.toLowerCase().includes('gsvi');
  // 检测是否是 MiniMax TTS API
  const isMiniMax = ttsUrl.toLowerCase().includes('minimax') || ttsUrl.includes('/t2a_v2');

  // MiniMax API 使用完全不同的格式
  if (isMiniMax) {
    // 修正 URL：MiniMax 使用 /v1/t2a_v2 而不是 /audio/speech
    ttsUrl = ttsUrl.replace(/\/audio\/speech$/, '/t2a_v2');
    if (!ttsUrl.includes('/t2a_v2')) {
      ttsUrl = ttsUrl.replace(/\/+$/, '') + '/t2a_v2';
    }

    // 如果配置了代理 URL，使用代理（解决 CORS 问题）
    if (config.tts.proxyUrl) {
      const proxyBase = config.tts.proxyUrl.trim().replace(/\/+$/, '');
      // 提取 MiniMax URL 的路径部分
      const urlObj = new URL(ttsUrl);
      ttsUrl = proxyBase + urlObj.pathname;
      console.log('[可乐] MiniMax 使用代理:', ttsUrl);
    }
  }

  // 构建请求体
  let requestBody;

  if (isMiniMax) {
    // MiniMax API 格式
    const speed = options.speed || config.tts.speed || 1;
    const emotion = options.emotion || config.tts.emotion;

    requestBody = {
      model: model,
      text: text.trim(),
      stream: false,
      voice_setting: {
        voice_id: voice,
        speed: speed,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    };

    // 添加情绪参数（只有有效值才添加）
    if (emotion && emotion !== '默认') {
      const emotionMap = {
        '高兴': 'happy',
        '悲伤': 'sad',
        '愤怒': 'angry',
        '害怕': 'fearful',
        '厌恶': 'disgusted',
        '惊讶': 'surprised',
        '中性': 'calm',
        '生动': 'fluent',
        '低语': 'whisper'
      };
      // 只有在 emotionMap 中有对应值时才添加
      const mappedEmotion = emotionMap[emotion];
      if (mappedEmotion) {
        requestBody.voice_setting.emotion = mappedEmotion;
      }
    }
  } else {
    requestBody = {
      model: model,
      voice: voice
    };

    // GSVI 模型只需要基本参数
    if (isGSVI) {
      requestBody.input = text.trim();
      // GSVI API 不需要 language 和 emotion 参数
    } else {
      // OpenAI 标准格式使用 input
      requestBody.input = text.trim();

      // 非 Gemini TTS 时才添加额外参数
      if (!isGeminiTTS) {
        // 只有非默认语速才添加 speed 参数
        const speed = options.speed || config.tts.speed || 1;
        if (speed !== 1) {
          requestBody.speed = speed;
        }

        // 扩展参数 (GPT-SoVITS 等支持)
        const emotion = options.emotion || config.tts.emotion;
        if (emotion && emotion !== '默认') {
          requestBody.other_params = {
            text_lang: '中英混合',
            prompt_lang: '中文',
            emotion: emotion
          };
        }
      }
    }
  }

  try {
    const textContent = requestBody.input || requestBody.text || '';
    console.log('[可乐] TTS 请求:', {
      url: ttsUrl,
      model: model,
      voice: voice,
      isGSVI: isGSVI,
      isGeminiTTS: isGeminiTTS,
      isMiniMax: isMiniMax,
      textLength: textContent.length,
      textFull: textContent  // 打印完整文本
    });

    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': isMiniMax ? 'application/json' : 'audio/mpeg, audio/wav, audio/*',
        'Authorization': `Bearer ${config.tts.key}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[可乐] TTS API 错误:');
      console.error('  状态码:', response.status);
      console.error('  响应内容:', errorText);
      console.error('  请求URL:', ttsUrl);
      console.error('  请求体:', JSON.stringify(requestBody, null, 2));

      // 尝试解析 JSON 错误
      try {
        const errorJson = JSON.parse(errorText);
        // MiniMax 错误格式: base_resp.status_msg
        const errorMsg = errorJson.base_resp?.status_msg || errorJson.error?.message || errorJson.message || errorJson.error || errorText;
        throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      } catch (parseErr) {
        if (parseErr.message && !parseErr.message.includes('JSON')) {
          throw parseErr;
        }
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 300)}`);
      }
    }

    // MiniMax API 返回 JSON，需要特殊处理
    if (isMiniMax) {
      const jsonResp = await response.json();
      console.log('[可乐] MiniMax TTS 响应:', {
        status_code: jsonResp.base_resp?.status_code,
        status_msg: jsonResp.base_resp?.status_msg,
        audio_length: jsonResp.extra_info?.audio_length,
        audio_format: jsonResp.extra_info?.audio_format
      });

      // 检查 MiniMax 错误
      if (jsonResp.base_resp?.status_code !== 0) {
        throw new Error('MiniMax TTS 错误: ' + (jsonResp.base_resp?.status_msg || '未知错误'));
      }

      if (!jsonResp.data?.audio) {
        throw new Error('MiniMax TTS 未返回音频数据');
      }

      // 将 hex 编码的音频转换为 Blob
      const hexAudio = jsonResp.data.audio;
      const bytes = new Uint8Array(hexAudio.length / 2);
      for (let i = 0; i < hexAudio.length; i += 2) {
        bytes[i / 2] = parseInt(hexAudio.substr(i, 2), 16);
      }

      const audioFormat = jsonResp.extra_info?.audio_format || 'mp3';
      const mimeType = `audio/${audioFormat}`;
      return new Blob([bytes], { type: mimeType });
    }

    const audioBlob = await response.blob();
    console.log('[可乐] TTS 响应:', {
      音频大小: audioBlob.size,
      类型: audioBlob.type,
      响应头ContentType: response.headers.get('content-type')
    });

    // 先检查是否返回了错误的 JSON（有些 API 错误时返回 JSON）
    const contentType = response.headers.get('content-type') || audioBlob.type;
    if (contentType.includes('application/json') || contentType.includes('text/')) {
      const text = await audioBlob.text();
      console.error('[可乐] TTS 返回了文本而非音频:', text);
      try {
        const errJson = JSON.parse(text);
        const errMsg = errJson.error?.message || errJson.message || errJson.error || JSON.stringify(errJson);
        throw new Error('TTS 错误: ' + errMsg);
      } catch (e) {
        if (e.message.includes('TTS')) throw e;
        throw new Error('TTS 返回了非音频数据: ' + text.substring(0, 100));
      }
    }

    // 检查是否返回了有效的音频数据
    if (audioBlob.size < 100) {
      console.error('[可乐] TTS 返回的数据太小，可能不是有效音频');
      throw new Error('TTS 返回的音频数据无效');
    }

    // 修复：如果 blob 类型为空或不是音频类型，手动指定 MIME 类型
    // 某些 TTS API（如 GPT-SoVITS）返回的音频没有正确的 Content-Type
    let finalBlob = audioBlob;
    if (!audioBlob.type || audioBlob.type === '' || !audioBlob.type.startsWith('audio/')) {
      // 尝试从 Content-Type 头获取类型，或使用默认的 audio/wav
      let mimeType = 'audio/wav';
      const headerType = response.headers.get('content-type');
      if (headerType && headerType.startsWith('audio/')) {
        mimeType = headerType.split(';')[0].trim();
      } else if (headerType && headerType.includes('octet-stream')) {
        // application/octet-stream 通常是 wav 格式
        mimeType = 'audio/wav';
      }

      console.log('[可乐] TTS blob 类型为空，手动指定为:', mimeType);
      const arrayBuffer = await audioBlob.arrayBuffer();
      finalBlob = new Blob([arrayBuffer], { type: mimeType });
    }

    return finalBlob;
  } catch (err) {
    console.error('[可乐] TTS 请求失败:', err);
    // 检查是否是网络错误
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw new Error('网络连接失败，请检查 API 地址是否正确，或尝试使用代理');
    }
    throw err;
  }
}

/**
 * 播放音频
 * @param {Blob|string} audio - 音频 Blob 或 URL
 * @returns {Promise<HTMLAudioElement>} Audio 元素
 */
export function playAudio(audio) {
  return new Promise((resolve, reject) => {
    const audioEl = new Audio();

    if (audio instanceof Blob) {
      audioEl.src = URL.createObjectURL(audio);
    } else {
      audioEl.src = audio;
    }

    audioEl.onended = () => {
      if (audio instanceof Blob) {
        URL.revokeObjectURL(audioEl.src);
      }
      resolve(audioEl);
    };

    audioEl.onerror = (err) => {
      if (audio instanceof Blob) {
        URL.revokeObjectURL(audioEl.src);
      }
      reject(err);
    };

    audioEl.play().catch(reject);
  });
}

/**
 * 录音类
 */
export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.mimeType = 'audio/webm';
  }

  /**
   * 开始录音
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRecording) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 选择最佳支持的音频格式
      this.mimeType = getSupportedMimeType();
      console.log('[可乐] 录音使用格式:', this.mimeType);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType
      });
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(100); // 每100ms收集一次数据
      this.isRecording = true;
      console.log('[可乐] 开始录音');
    } catch (err) {
      console.error('[可乐] 无法获取麦克风权限:', err);
      throw new Error('无法获取麦克风权限，请检查浏览器设置');
    }
  }

  /**
   * 停止录音
   * @returns {Promise<Blob>} 录音数据
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.isRecording || !this.mediaRecorder) {
        reject(new Error('没有正在进行的录音'));
        return;
      }

      const mimeType = this.mimeType;

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        this.cleanup();
        console.log('[可乐] 录音结束，格式:', mimeType, '大小:', audioBlob.size);
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  /**
   * 取消录音
   */
  cancel() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
    this.cleanup();
    this.isRecording = false;
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  /**
   * 检查浏览器是否支持录音
   * @returns {boolean}
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
}

/**
 * 获取 MediaRecorder 支持的音频格式
 */
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

/**
 * 测试 STT API
 * @returns {Promise<boolean>}
 */
export async function testSttApi() {
  const config = getVoiceApiConfig();

  if (!config.stt.url || !config.stt.key) {
    throw new Error('请先填写 STT API 地址和密钥');
  }

  console.log('[可乐] 开始 STT 测试...');
  console.log('[可乐] STT 配置:', {
    url: config.stt.url,
    model: config.stt.model,
    keyLength: config.stt.key?.length || 0
  });

  // 创建测试音频 (1.5秒，包含一些变化的音调模拟语音)
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();

  oscillator.connect(gainNode);
  gainNode.connect(destination);

  // 模拟语音的频率变化
  oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
  oscillator.frequency.linearRampToValueAtTime(400, audioContext.currentTime + 0.5);
  oscillator.frequency.linearRampToValueAtTime(300, audioContext.currentTime + 1);
  oscillator.frequency.linearRampToValueAtTime(350, audioContext.currentTime + 1.5);

  // 音量包络
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.3);
  gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 1.2);
  gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1.5);

  oscillator.start();

  const mimeType = getSupportedMimeType();
  console.log('[可乐] 录制音频格式:', mimeType);

  const recorder = new MediaRecorder(destination.stream, { mimeType });
  const chunks = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = e => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      oscillator.stop();
      audioContext.close();

      const blob = new Blob(chunks, { type: mimeType });
      console.log('[可乐] 测试音频大小:', blob.size, 'bytes');

      if (blob.size < 100) {
        reject(new Error('测试音频生成失败'));
        return;
      }

      try {
        // speechToText 会自动转换为 WAV 格式
        const result = await speechToText(blob);
        console.log('[可乐] STT 测试结果:', result);
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };

    recorder.start(100);
    // 录制 1.5 秒
    setTimeout(() => recorder.stop(), 1500);
  });
}

/**
 * 测试 TTS API
 * @returns {Promise<Blob>}
 */
export async function testTtsApi() {
  const config = getVoiceApiConfig();

  if (!config.tts.url || !config.tts.key) {
    throw new Error('请先填写 TTS API 地址和密钥');
  }

  return await textToSpeech('测试语音合成');
}
