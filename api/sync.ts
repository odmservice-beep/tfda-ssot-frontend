import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';
import { drive, listFilesRecursive, createChunks } from './serverCommon';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';

// 只回傳「是否存在」，不要把敏感內容吐出去
function envReport() {
  const keys = [
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_FOLDER_ID',
    'API_KEY',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'BLOB_READ_WRITE_TOKEN',
  ] as const;

  const report: Record<string, boolean> = {};
  for (const k of keys) report[k] = !!process.env[k];
  return report;
}

function safeErr(err: any) {
  // googleapis 常見錯誤欄位：err.code / err.response?.data / err.errors
  return {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    status: err?.status,
    stack: err?.stack,
    responseData: err?.response?.data,
    errors: err?.errors,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 讓前端 fetch 好 debug
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    // 1) env 檢查
    const env = envReport();
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.status(400).json({
        ok: false,
        error: 'MISSING_ENV',
        message: '缺 GOOGLE_SERVICE_ACCOUNT_JSON（請貼 service account 的 JSON，不是 OAuth client JSON）',
        env,
      });
    }
    if (!env.API_KEY) {
      return res.status(400).json({
        ok: false,
        error: 'MISSING_ENV',
        message: '缺 API_KEY（前端呼叫 /api/sync 會帶的驗證 key）',
        env,
      });
    }

    // 2) API_KEY 驗證（避免外部亂打）
    const clientKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['X-API-KEY'] as unknown as string) ||
      (req.body as any)?.apiKey;

    if (!clientKey || clientKey !== process.env.API_KEY) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'API_KEY 不正確或沒帶（請在前端 fetch 加上 x-api-key）',
        hasClientKey: !!clientKey,
      });
    }

    // 3) 測試 Drive：先 list 一次根目錄 children（最快抓到權限問題）
    let testList: any = null;
    try {
      const r = await drive.files.list({
        q: `'${FOLDER_ID}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,modifiedTime,size)',
        pageSize: 5,
      });
      testList = r.data?.files || [];
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        stage: 'drive.files.list',
        message:
          'Drive 讀取失敗：常見原因是「資料夾沒分享給 service account」、「Drive API 沒啟用」、「憑證不是 service account JSON」',
        env,
        folderId: FOLDER_ID,
        error: safeErr(e),
      });
    }

    // 4) 真的遞迴抓檔案
    let files: any[] = [];
    try {
      files = await listFilesRecursive(FOLDER_ID, '');
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        stage: 'listFilesRecursive',
        message: '遞迴列檔失敗（多半也是 Drive 權限/API 問題）',
        env,
        folderId: FOLDER_ID,
        testList,
        error: safeErr(e),
      });
    }

    // 5) 測試 KV / Blob（不把 token 回傳）
    const kvOk = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
    const blobOk = !!process.env.BLOB_READ_WRITE_TOKEN;

    // 這兩個若缺，不一定要直接擋，你可依需求改成 return 400
    // 先在 debug 版直接回報狀態
    let kvPing: any = null;
    if (kvOk) {
      try {
        await kv.set('debug:sync:lastPing', new Date().toISOString());
        kvPing = 'ok';
      } catch (e: any) {
        kvPing = { ok: false, error: safeErr(e) };
      }
    }

    let blobPing: any = null;
    if (blobOk) {
      try {
        const up = await put('debug-sync.txt', 'debug ping', { access: 'private' });
        blobPing = { ok: true, url: up.url };
      } catch (e: any) {
        blobPing = { ok: false, error: safeErr(e) };
      }
    }

    // 6) Chunking（依你的服務實作）
    let chunks: any[] = [];
    try {
      chunks = createChunks(files);
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        stage: 'createChunks',
        message: 'createChunks 失敗（資料結構/程式邏輯）',
        filesCount: files.length,
        error: safeErr(e),
      });
    }

    // ✅ 成功回傳 debug 資訊（你就能在 Network → Response 看到）
    return res.status(200).json({
      ok: true,
      env,
      folderId: FOLDER_ID,
      testListSample: testList,
      filesCount: files.length,
      chunksCount: chunks.length,
      kv: { enabled: kvOk, ping: kvPing },
      blob: { enabled: blobOk, ping: blobPing },
    });
  } catch (err: any) {
    // 最外層保險
    return res.status(500).json({
      ok: false,
      stage: 'top-level',
      message: 'sync function crashed (uncaught)',
      env: envReport(),
      error: safeErr(err),
    });
  }
}
