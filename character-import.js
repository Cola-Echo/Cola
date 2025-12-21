/**
 * 角色卡导入：从 PNG/JSON 解析 + 导入到 SillyTavern
 */

import { getRequestHeaders } from '../../../../script.js';

// 从 PNG 提取角色卡数据 (V2 格式)
export async function extractCharacterFromPNG(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const arrayBuffer = e.target.result;
        const dataView = new DataView(arrayBuffer);

        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
          if (dataView.getUint8(i) !== pngSignature[i]) {
            throw new Error('不是有效的 PNG 文件');
          }
        }

        let offset = 8;
        while (offset < arrayBuffer.byteLength) {
          const length = dataView.getUint32(offset);
          const type = String.fromCharCode(
            dataView.getUint8(offset + 4),
            dataView.getUint8(offset + 5),
            dataView.getUint8(offset + 6),
            dataView.getUint8(offset + 7)
          );

          if (type === 'tEXt' || type === 'iTXt') {
            const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
            const text = new TextDecoder('utf-8').decode(chunkData);

            if (text.startsWith('chara\0')) {
              const base64Data = text.substring(6);

              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              const jsonStr = new TextDecoder('utf-8').decode(bytes);
              const charData = JSON.parse(jsonStr);

              const uint8Array = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i]);
              }
              const avatarBase64 = 'data:image/png;base64,' + btoa(binary);

              resolve({
                name: charData.name || charData.data?.name || '未知角色',
                description: charData.description || charData.data?.description || '',
                avatar: avatarBase64,
                rawData: charData
              });
              return;
            }
          }

          offset += 12 + length;
        }

        throw new Error('PNG 文件中未找到角色卡数据');
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

// 从 JSON 导入角色卡
export async function extractCharacterFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const charData = JSON.parse(e.target.result);
        resolve({
          name: charData.name || charData.data?.name || '未知角色',
          description: charData.description || charData.data?.description || charData.personality || '',
          avatar: charData.avatar || null,
          rawData: charData
        });
      } catch (err) {
        reject(new Error('JSON 解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// 导入角色卡到 SillyTavern
export async function importCharacterToST(characterData) {
  try {
    const formData = new FormData();
    if (characterData.file) {
      formData.append('avatar', characterData.file);
    }

    const response = await fetch('/api/characters/import', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: formData
    });

    if (!response.ok) {
      throw new Error('导入失败');
    }

    return await response.json();
  } catch (err) {
    console.error('[可乐] 导入角色卡失败:', err);
    throw err;
  }
}
