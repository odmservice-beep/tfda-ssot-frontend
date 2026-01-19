import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';

import {
  drive,
  listFilesRecursive,
  createChunks,
} from '../services/serverCommon.js';

const FOLDER_ID =
  process.env.GOOGLE_DRIVE_FOLDER_ID ||
  '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return res.status(400).json({
      error: 'MISSING_ENV',
      message: '缺少 GOOGLE_SERVICE_ACCOUNT_JSON',
    });
  }

  try {
    // 1️⃣ 列出整個 Google Drive 資料夾（遞迴）
    const files = await listFilesRecursive(FOLDER_ID);

    if (!files.length) {
      return res.status(200).json({
        ok: true,
        message: '資料夾內沒有可同步的檔案',
        count: 0,
      });
    }

    let totalChunks = 0;

    // 2️⃣ 逐一處理檔案
    for (const file of files) {
      // 跳過 Google Docs 類型（如要支援可再擴充）
      if (file.mimeType.startsWith('application/vnd.google-apps')) {
        continue;
      }

      // 下載檔案內容
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );

      const buffer = Buffer.from(response.data as ArrayBuffer);

      // 3️⃣ 切 chunk（向量前處理）
      const chunks = createChunks(buffer.toString('utf-8'), {
        source: file.drivePath,
        fileId: file.id,
      });

      // 4️⃣ 存入 KV（作為知識庫）
      for (const chunk of chunks) {
        await kv.set(chunk.id, chunk);
      }

      totalChunks += chunks.length;

      // （選用）存原始檔案到 Blob
      await put(`drive/${file.id}`, buffer, {
        access: 'private',
        contentType: file.mimeType,
      });
    }

    return res.status(200).json({
      ok: true,
      files: files.length,
      chunks: totalChunks,
      message: 'Google Drive 知識庫同步完成',
    });
  } catch (err: any) {
    console.error('[api/sync] error:', err);
    return res.status(500).json({
      error: 'SYNC_FAILED',
      message: err?.message || '同步失敗',
    });
  }
}
