import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scoreChunks } from './serverCommon';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // 僅允許 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { query, chunks } = req.body ?? {};

    // 基本輸入驗證
    if (
      typeof query !== 'string' ||
      !Array.isArray(chunks) ||
      chunks.length === 0
    ) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'query 必須是字串，chunks 必須是非空陣列',
      });
    }

    // 執行相似度計算
    const results = await scoreChunks(query, chunks);

    return res.status(200).json({ results });
  } catch (err: any) {
    console.error('[api/query] error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err?.message || 'Unknown error',
    });
  }
}
