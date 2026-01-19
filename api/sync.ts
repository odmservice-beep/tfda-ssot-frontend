
import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';
import { drive, listFilesRecursive, createChunks } from '../services/serverCommon';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.API_KEY) {
    return res.status(400).json({ 
      error: 'MISSING_ENV', 
      message: '伺服器缺少必備環境變數 (SERVICE_ACCOUNT 或 API_KEY)' 
    });
  }

  const stats = { scanned: 0, processed: 0, skipped: 0, chunks: 0, skippedList: [] as any[] };

  try {
    const driveFiles = await listFilesRecursive(FOLDER_ID);
    stats.scanned = driveFiles.length;

    // 取得舊索引以進行增量比對
    const oldIndex: any[] = await kv.get(`drive_index_${FOLDER_ID}`) || [];
    const newIndex: any[] = [];
    const allChunks: any[] = [];

    for (const file of driveFiles) {
      const isDoc = file.mimeType === 'application/vnd.google-apps.document';
      const isSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
      const isText = ['text/plain', 'text/markdown', 'text/csv'].includes(file.mimeType);
      const isPDF = file.mimeType === 'application/pdf';

      if (!isDoc && !isSheet && !isText && !isPDF) {
        stats.skipped++;
        stats.skippedList.push({ name: file.name, mime: file.mimeType, reason: '格式不支援' });
        continue;
      }

      // 檢查是否需要更新 (Modified Time)
      const existing = oldIndex.find(o => o.id === file.id);
      if (existing && existing.modifiedTime === file.modifiedTime) {
        // 直接使用舊的 blob 資料，不重新下載 (增量)
        try {
          const oldBlobRes = await fetch(existing.blobUrl);
          const oldData = await oldBlobRes.json();
          allChunks.push(...oldData.chunks);
          newIndex.push(existing);
          continue;
        } catch (e) {
          console.warn(`無法讀取舊 Blob [${file.name}], 重新處理。`);
        }
      }

      try {
        let textContent = "";
        if (isDoc) {
          const exportRes = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' });
          textContent = exportRes.data as string;
        } else if (isSheet) {
          const exportRes = await drive.files.export({ fileId: file.id, mimeType: 'text/csv' });
          textContent = exportRes.data as string;
        } else if (isPDF) {
          // Vercel Serverless 中解析 PDF 較為耗時且需 binary。此處先標記 Metadata
          textContent = `[PDF 文件摘要: ${file.name}] 該檔案目前以 Metadata 同步，內容可能需要手動查閱。`;
        } else {
          const downloadRes = await drive.files.get({ fileId: file.id, alt: 'media' });
          textContent = typeof downloadRes.data === 'string' ? downloadRes.data : JSON.stringify(downloadRes.data);
        }

        const fileChunks = createChunks(textContent, file.name, file.id, file.drivePath);
        allChunks.push(...fileChunks);

        // 儲存此檔案的分片到 Blob
        const blob = await put(`knowledge/${FOLDER_ID}/${file.id}.json`, JSON.stringify({
          id: file.id,
          name: file.name,
          chunks: fileChunks
        }), { access: 'public', contentType: 'application/json' });

        newIndex.push({ 
          id: file.id, 
          name: file.name, 
          modifiedTime: file.modifiedTime, 
          blobUrl: blob.url 
        });
        stats.processed++;
        stats.chunks += fileChunks.length;

      } catch (err: any) {
        stats.skipped++;
        stats.skippedList.push({ name: file.name, reason: err.message });
      }
    }

    // 更新持久化索引
    await kv.set(`drive_index_${FOLDER_ID}`, newIndex);
    await kv.set(`drive_chunks_${FOLDER_ID}`, allChunks); // 儲存所有分片供檢索
    await kv.set(`last_sync_${FOLDER_ID}`, Date.now());

    res.status(200).json({
      success: true,
      ...stats,
      lastSyncAt: Date.now()
    });
  } catch (error: any) {
    const errorId = `ERR_SYNC_${Date.now()}`;
    console.error(errorId, error);
    res.status(500).json({ errorId, error: error.message });
  }
}
