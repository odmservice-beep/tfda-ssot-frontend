
export type DocSource = 'local' | 'drive';

export interface RegulationResult {
  foodItem: string;
  category: string;
  summary: string;
  isFromLocalPdf?: boolean;
  pesticides: { item: string; limit: string; note?: string; }[];
  heavyMetals: { item: string; limit: string; note?: string; }[];
  others: { item: string; limit: string; note?: string; }[];
  sources: { title: string; url: string; sourceType?: DocSource; }[];
}

export interface LocalDoc {
  id: string;
  name: string;
  content: string;
  uploadDate: number;
  source: DocSource;
  mimeType: string;
  fingerprint: string;
}

export type AuthStatus = 
  | 'unauthorized' 
  | 'requesting' 
  | 'authorized' 
  | 'error' 
  | 'preview_blocked';

export interface SyncStatus {
  phase: 'idle' | 'processing' | 'done' | 'error';
  message: string;
  progress: { current: number; total: number };
}

export interface KBMetadata {
  rootFolderId: string;
  lastSyncAt: number;
  fingerprint: string;
  stats: { total: number; success: number; failed: number; skipped: number; };
}

export type SearchSourceMode = 'local' | 'drive' | 'both';

export interface FileProcessingDetail {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: 'processing' | 'success' | 'failed' | 'skipped';
  reason?: string;
  contentLength?: number;
}
