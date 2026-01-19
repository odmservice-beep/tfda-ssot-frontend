import { google } from 'googleapis';

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('MISSING GOOGLE_SERVICE_ACCOUNT_JSON');

  // 允許你在 Vercel env 以單行 JSON 貼上（private_key 會包含 \n）
  const sa = JSON.parse(raw);

  // 修正 private_key 換行（常見問題）
  if (sa.private_key && typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return sa;
}

const SERVICE_ACCOUNT = getServiceAccount();

export const auth = new google.auth.JWT({
  email: SERVICE_ACCOUNT.client_email,
  key: SERVICE_ACCOUNT.private_key,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

export const drive = google.drive({ version: 'v3', auth });

export async function listFilesRecursive(folderId: string, path: string = ''): Promise<any[]> {
  const results: any[] = [];

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    pageSize: 1000,
  });

  const files = res.data.files || [];

  for (const file of files) {
    const currentPath = path ? `${path}/${file.name}` : file.name;

    if (file.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await listFilesRecursive(file.id!, currentPath);
      results.push(...sub);
    } else {
      results.push({
        ...file,
        drivePath: currentPath,
      });
    }
  }

  return results;
}

/**
 * 先做最簡單 chunk：把檔名+路徑當知識片段（你之後可改成抽內容）
 */
export async function createChunks(files: any[]) {
  const chunks = files.map((f) => ({
    id: f.id,
    title: f.name,
    path: f.drivePath,
    text: `檔名: ${f.name}\n路徑: ${f.drivePath}\n修改時間: ${f.modifiedTime || ''}\n大小: ${f.size || ''}`,
  }));

  return chunks;
}
