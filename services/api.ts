
import { RegulationResult, SyncResult, LocalDoc, SearchSourceMode } from "../types";

export async function serverQuery(
  query: string, 
  mode: SearchSourceMode, 
  localDocs?: LocalDoc[]
): Promise<RegulationResult> {
  const res = await fetch(`/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      query, 
      mode, 
      topK: 6,
      localContext: localDocs?.map(d => ({ name: d.name, content: d.content }))
    }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'SERVER_ERROR', message: '檢索伺服器發生異常' }));
    throw new Error(errorData.message || errorData.error || '查詢失敗');
  }
  
  return res.json();
}

export async function syncLibrary(): Promise<SyncResult> {
  const res = await fetch(`/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: '同步通訊失敗' }));
    throw new Error(errorData.message || '同步服務暫不可用');
  }
  
  return res.json();
}
