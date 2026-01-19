import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';
import { drive, listFilesRecursive, createChunks } from './serverCommon';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  // Debug env
  console.log('[DEBUG][env]', {
    hasServiceAccount: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    serviceAccountLength: process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length || 0,
    hasApiKey: !!process.env.API_KEY,
    apiKeyLength: process.env.API_KEY?.length || 0,
    folderId: FOLDER_ID,
  });

  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.API_KEY) {
      return res.status(400).json({
        error: 'MISSING_ENV',
        message: '伺服器缺少必備環境變數 (GOOGLE_SERVICE_ACCOUNT_JSON 或 API_KEY)',
      });
    }

    console.log('[DEBUG] start listFilesRecursive...');
    const files = await listFilesRecursive(FOLDER_ID);
    console.log('[DEBUG] listFilesRecursive done', { count: files.length });

    // 這裡你原本的流程：下載/抽文字/切 chunk/上傳 blob/寫 kv
    // 我先保留你的 chunk 產生器
    console.log('[DEBUG] start createChunks...');
    const chunks = await createChunks(files);
    console.log('[DEBUG] createChunks done', { chunks: chunks.length });

    // 存到 KV（示例 key，你可依你的專案調整）
    await kv.set('tfda:chunks', chunks);

    return res.status(200).json({ ok: true, files: files.length, chunks: chunks.length });
  } catch (err: any) {
    console.error('[api/sync] error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err?.message || err) });
  }
}
