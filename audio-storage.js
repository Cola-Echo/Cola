/**
 * 语音存储模块 - 使用 IndexedDB 存储语音回放
 */

const DB_NAME = 'WechatVoiceStorage';
const DB_VERSION = 1;
const STORE_NAME = 'voiceRecordings';

let db = null;

/**
 * 初始化数据库
 */
export async function initAudioDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[可乐] IndexedDB 打开失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[可乐] IndexedDB 初始化成功');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // 创建存储对象
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        // 索引：按联系人和通话记录查询
        store.createIndex('contactIndex', 'contactIndex', { unique: false });
        store.createIndex('callTimestamp', 'callTimestamp', { unique: false });
        console.log('[可乐] IndexedDB 存储结构创建成功');
      }
    };
  });
}

/**
 * 保存语音记录
 * @param {Object} voiceData - 语音数据
 * @param {number} voiceData.contactIndex - 联系人索引
 * @param {number} voiceData.callTimestamp - 通话时间戳
 * @param {string} voiceData.text - 语音对应的文字
 * @param {Blob} voiceData.audioBlob - 音频数据
 * @param {number} voiceData.duration - 时长（秒）
 * @returns {Promise<number>} 保存的记录 ID
 */
export async function saveVoiceRecording(voiceData) {
  await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      contactIndex: voiceData.contactIndex,
      callTimestamp: voiceData.callTimestamp,
      text: voiceData.text,
      audioBlob: voiceData.audioBlob,
      duration: voiceData.duration,
      savedAt: Date.now()
    };

    const request = store.add(record);

    request.onsuccess = () => {
      console.log('[可乐] 语音保存成功, ID:', request.result);
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('[可乐] 语音保存失败:', request.error);
      reject(request.error);
    };
  });
}

/**
 * 批量保存语音记录
 * @param {Array} voiceDataList - 语音数据数组
 * @returns {Promise<Array>} 保存的记录 ID 数组
 */
export async function saveVoiceRecordings(voiceDataList) {
  const ids = [];
  for (const voiceData of voiceDataList) {
    const id = await saveVoiceRecording(voiceData);
    ids.push(id);
  }
  return ids;
}

/**
 * 获取指定通话的所有语音记录
 * @param {number} contactIndex - 联系人索引
 * @param {number} callTimestamp - 通话时间戳
 * @returns {Promise<Array>} 语音记录数组
 */
export async function getVoiceRecordingsByCall(contactIndex, callTimestamp) {
  await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('callTimestamp');

    const request = index.getAll(callTimestamp);

    request.onsuccess = () => {
      // 过滤出指定联系人的记录
      const records = request.result.filter(r => r.contactIndex === contactIndex);
      resolve(records);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取指定联系人的所有语音记录
 * @param {number} contactIndex - 联系人索引
 * @returns {Promise<Array>} 语音记录数组
 */
export async function getVoiceRecordingsByContact(contactIndex) {
  await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('contactIndex');

    const request = index.getAll(contactIndex);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取单条语音记录
 * @param {number} id - 记录 ID
 * @returns {Promise<Object>} 语音记录
 */
export async function getVoiceRecording(id) {
  await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 删除语音记录
 * @param {number} id - 记录 ID
 */
export async function deleteVoiceRecording(id) {
  await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('[可乐] 语音删除成功, ID:', id);
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 删除指定通话的所有语音记录
 * @param {number} contactIndex - 联系人索引
 * @param {number} callTimestamp - 通话时间戳
 */
export async function deleteVoiceRecordingsByCall(contactIndex, callTimestamp) {
  const records = await getVoiceRecordingsByCall(contactIndex, callTimestamp);
  for (const record of records) {
    await deleteVoiceRecording(record.id);
  }
}

/**
 * 播放语音记录
 * @param {number} id - 记录 ID
 * @returns {Promise<HTMLAudioElement>} 音频元素
 */
export async function playVoiceRecording(id) {
  const record = await getVoiceRecording(id);
  if (!record || !record.audioBlob) {
    throw new Error('语音记录不存在');
  }

  const audioUrl = URL.createObjectURL(record.audioBlob);
  const audio = new Audio(audioUrl);

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve(audio);
    };

    audio.onerror = (err) => {
      URL.revokeObjectURL(audioUrl);
      reject(err);
    };

    audio.play().catch(reject);
  });
}

/**
 * 获取存储统计信息
 * @returns {Promise<Object>} 统计信息
 */
export async function getStorageStats() {
  await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const countRequest = store.count();
    const allRequest = store.getAll();

    let count = 0;
    let totalSize = 0;

    countRequest.onsuccess = () => {
      count = countRequest.result;
    };

    allRequest.onsuccess = () => {
      const records = allRequest.result;
      totalSize = records.reduce((sum, r) => sum + (r.audioBlob?.size || 0), 0);
      resolve({
        count,
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
      });
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}
