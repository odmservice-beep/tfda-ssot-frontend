
import { google } from 'googleapis';
import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';

const SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');

const auth = new google.auth.JWT(
  SERVICE_ACCOUNT.client_email,
  undefined,
  SERVICE_ACCOUNT.private_key,
  ['https://www.googleapis.com/auth/drive.readonly']
);

const drive = google.drive({ version: 'v3', auth });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { folderId } = req.body;
  if (!folderId) return res.status(400).send('Missing folderId');

  try {
    const allFiles = await listFilesRecursive(folderId);
    const syncResults = [];

    for (const file of allFiles) {
      // 僅處理支援的檔案
      const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
      const isPDF = file.mimeType === 'application/pdf';
      const isText = file.mimeType === 'text/plain';

      if (!isGoogleDoc && !isPDF && !isText) continue;

      try {
        let content = "";
        if (isGoogleDoc) {
          const exportRes = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' });
          content = exportRes.data as string;
        } else {
          const downloadRes = await drive.files.get({ fileId: file.id, alt: 'media' });
          content = typeof downloadRes.data === 'string' ? downloadRes.data : JSON.stringify(downloadRes.data);
        }

        // 簡單 Chunking (每 2000 字一個 chunk)
        const chunks = [];
        for (let i = 0; i < content.length; i += 2000) {
          chunks.push(content.substring(i, i + 2000));
        }

        // 存入 Vercel Blob
        const blob = await put(`chunks/${file.id}.json`, JSON.stringify({
          name: file.name,
          id: file.id,
          chunks
        }), { access: 'public', contentType: 'application/json' });

        syncResults.push({ id: file.id, name: file.name, url: blob.url });
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
      }
    }

    // 更新 KV 索引
    await kv.set(`drive_index_${folderId}`, syncResults);
    await kv.set(`last_sync_${folderId}`, Date.now());

    res.status(200).json({
      success: true,
      fileCount: syncResults.length,
      lastSyncAt: Date.now()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

async function listFilesRecursive(folderId: string) {
  const files: any[] = [];
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });
  
  const items = res.data.files || [];
  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      const subFiles = await listFilesRecursive(item.id!);
      files.push(...subFiles);
    } else {
      files.push(item);
    }
  }
  return files;
}
