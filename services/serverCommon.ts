
import { google } from 'googleapis';
import { kv } from '@vercel/kv';
import { put, head } from '@vercel/blob';

// 確保此檔案不被前端 import (雖然 Vite 通常會封鎖但這是好習慣)
if (typeof window !== 'undefined') {
  throw new Error("serverCommon.ts can only be used in Serverless Functions.");
}

const SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';

export const auth = new google.auth.JWT(
  SERVICE_ACCOUNT.client_email,
  undefined,
  SERVICE_ACCOUNT.private_key,
  ['https://www.googleapis.com/auth/drive.readonly']
);

export const drive = google.drive({ version: 'v3', auth });

/**
 * 遞迴掃描資料夾
 */
export async function listFilesRecursive(folderId: string, path: string = "") {
  const files: any[] = [];
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime, size)',
  });
  
  const items = res.data.files || [];
  for (const item of items) {
    const currentPath = path ? `${path}/${item.name}` : item.name;
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      const subFiles = await listFilesRecursive(item.id!, currentPath);
      files.push(...subFiles);
    } else {
      files.push({ ...item, drivePath: currentPath });
    }
  }
  return files;
}

/**
 * 簡易分片演算法 (Chunking)
 */
export function createChunks(text: string, fileName: string, fileId: string, drivePath: string) {
  const chunks: any[] = [];
  const chunkSize = 1000;
  const overlap = 200;
  
  for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
    const chunkText = text.substring(i, i + chunkSize);
    if (chunkText.length < 50) continue; // 忽略太短的片段
    chunks.push({
      chunkId: `${fileId}_${i}`,
      fileId,
      fileName,
      drivePath,
      text: chunkText,
      snippet: chunkText.substring(0, 100) + "..."
    });
  }
  return chunks;
}

/**
 * 簡易關鍵字相似度檢索 (Fallback for Vector Search)
 */
export function scoreChunks(chunks: any[], query: string) {
  const keywords = query.toLowerCase().split(/[\s,，、。]+/).filter(k => k.length > 1);
  return chunks.map(chunk => {
    let score = 0;
    const content = chunk.text.toLowerCase();
    keywords.forEach(kw => {
      if (content.includes(kw)) score += 10;
      // 標題命中權重加倍
      if (chunk.fileName.toLowerCase().includes(kw)) score += 20;
    });
    return { ...chunk, score };
  })
  .filter(c => c.score > 0)
  .sort((a, b) => b.score - a.score);
}
