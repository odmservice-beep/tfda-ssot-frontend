import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';
import {
  drive,
  listFilesRecursive,
  createChunks,
} from '../services/serverCommon';

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

  /* =========================
   * DEBUG: 環境變數檢查
   * ========================= */
  const hasServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const serviceAccountLength =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length || 0;

  const hasApiKey = !!process.env.API_KEY;
  const apiKeyLength = process.env.API_KEY?.length || 0;

  console.log('[DEBUG][env]', {
    hasServiceAccount,
    serviceAccountLength,
    hasApiKey,
    apiKeyLength,
    folderId: FOLDER_ID,
  });

  if (!hasServiceAccount || !hasApiKey) {
    return res.status(400).json({
      error: 'MISSING_ENV',
      debug: {
        hasServiceAccount,
        serviceAccountLength,
        hasApiKey,
        apiKeyLength,
      },
    });
  }

  try {
    console.log('[DEBUG] start listFilesRecursive');

    const files = await listFilesRecursive(FOLDER_ID);

    console.log('[DEBUG] files fetched', {
      count: files.length,
      sample: files.slice(0, 2).map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
      })),
    });

    const chunks = createChunks(files);

    console.log('[DEBUG] chunks created', {
      chunkCount: chunks.length,
      firstChunkSize: chunks[0]?.length || 0,
    });

    await kv.set('drive:lastSyncAt', Date.now());
    await kv.set('drive:fileCount', files.length);

    console.log('[DEBUG] kv saved');

    return res.status(200).json({
      ok: true,
      files: files.length,
      chunks: chunks.length,
    });
  } catch (err: any) {
    console.error('[api/sync][ERROR]', err);
    return res.status(500).json({
      error: 'SYNC_FAILED',
      message: err?.message,
    });
  }
}
