// api/sync.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getDriveClient,
  diagnoseEnv,
} from '@/services/serverCommon';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('[sync] request received');

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
    });
  }

  try {
    // 1️⃣ 檢查 env 是否正常（不會洩漏 private key）
    console.log('[sync] diagnosing env...');
    const envStatus = diagnoseEnv();
    console.log('[sync] env status:', envStatus);

    if (!envStatus.ok) {
      throw new Error(`ENV_ERROR: ${envStatus.reason}`);
    }

    // 2️⃣ 建立 Google Drive client
    console.log('[sync] creating drive client...');
    const drive = getDriveClient();
    console.log('[sync] drive client created');

    // 3️⃣ 測試呼叫 Google Drive API（最安全的一個）
    console.log('[sync] calling drive.files.list...');
    const result = await drive.files.list({
      pageSize: 5,
      fields: 'files(id, name)',
    });

    console.log(
      '[sync] drive.files.list success, count:',
      result.data.files?.length || 0
    );

    // 4️⃣ 成功回傳
    return res.status(200).json({
      ok: true,
      step: 'drive_list_success',
      files: result.data.files || [],
    });
  } catch (err: any) {
    // ❌ 任何錯誤都一定會進到這裡
    console.error('[sync] ERROR OCCURRED');
    console.error(err);

    return res.status(500).json({
      ok: false,
      error: err.message || 'UNKNOWN_ERROR',
      stack:
        process.env.NODE_ENV === 'production'
          ? undefined
          : err.stack,
    });
  }
}
