
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  md5Checksum?: string;
}

export interface ListResult {
  files: DriveFile[];
  debug: {
    folderId: string;
    lastStatus: number;
    errorMsg?: string;
    query: string;
  };
}

/**
 * 智慧解析 Google Drive 網址或 ID
 */
export function parseDriveId(input: string): string {
  if (!input) return "";
  try {
    const url = new URL(input);
    const pathParts = url.pathname.split('/');
    const foldersIdx = pathParts.indexOf('folders');
    if (foldersIdx !== -1 && pathParts[foldersIdx + 1]) {
      return pathParts[foldersIdx + 1];
    }
    const dIdx = pathParts.indexOf('d');
    if (dIdx !== -1 && pathParts[dIdx + 1]) {
      return pathParts[dIdx + 1];
    }
  } catch (e) {}
  return input.split('?')[0].split('/').pop()?.trim() || "";
}

function getHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`
  };
}

/**
 * 遞迴獲取資料夾下所有檔案 (全面移除 API_KEY)
 */
export async function listAllFilesRecursive(
  rootFolderId: string, 
  token: string,
  onProgress?: (folderName: string) => void
): Promise<ListResult> {
  const allFiles: DriveFile[] = [];
  const queue: { id: string; name: string }[] = [{ id: rootFolderId, name: 'Root' }];
  const visited = new Set<string>();
  let lastStatus = 200;
  let errorMsg: string | undefined;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if (onProgress) onProgress(current.name);

    let pageToken: string | undefined;
    do {
      const q = `'${current.id}' in parents and trashed = false`;
      const fields = "nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum)";
      // URL 不再攜帶 key 參數
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const res = await fetch(url, { 
        headers: getHeaders(token),
        mode: 'cors'
      });
      lastStatus = res.status;
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        errorMsg = errorData.error?.message || `HTTP ${res.status}`;
        throw new Error(`Drive API Error [${res.status}]: ${errorMsg}`);
      }
      
      const data = await res.json();
      const files = data.files || [];
      
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          queue.push({ id: file.id, name: file.name });
        } else {
          allFiles.push(file);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  return {
    files: allFiles,
    debug: {
      folderId: rootFolderId,
      lastStatus,
      errorMsg,
      query: `'${rootFolderId}' in parents (recursive scan)`
    }
  };
}

/**
 * 下載檔案內容 (全面移除 API_KEY)
 */
export async function downloadFileContent(fileId: string, mimeType: string, token: string): Promise<{ buffer: ArrayBuffer, actualMimeType: string }> {
  let url = "";
  let finalMimeType = mimeType;

  if (mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    finalMimeType = 'text/plain';
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    finalMimeType = 'text/csv';
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    finalMimeType = 'text/plain';
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  }

  const res = await fetch(url, { 
    headers: getHeaders(token),
    mode: 'cors'
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `HTTP ${res.status}`;
    throw new Error(`Download Error [${res.status}]: ${errorMsg}`);
  }
  
  return { buffer: await res.arrayBuffer(), actualMimeType: finalMimeType };
}
