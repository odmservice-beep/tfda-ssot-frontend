
export type DocSource = 'local' | 'drive';

export interface RegulationResult {
  foodItem: string;
  category: string;
  summary: string;
  sources: { title: string; url: string; sourceType?: DocSource; snippet?: string }[];
  pesticides: { item: string; limit: string; note?: string }[];
  heavyMetals: { item: string; limit: string; note?: string }[];
  others: { item: string; limit: string; note?: string }[];
}

export interface LocalDoc {
  id: string;
  name: string;
  content: string;
  uploadDate: number;
  source: DocSource;
  mimeType: string;
  fingerprint: string;
  relativePath?: string;
  size: number;
}

export interface SyncResult {
  success: boolean;
  message: string;
  lastSyncAt: number;
  fileCount: number;
  files: string[];
}

export type SearchSourceMode = 'local' | 'drive' | 'both';

export interface FileProcessingDetail {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: 'processing' | 'success' | 'failed' | 'skipped' | 'duplicate';
  reason?: string;
  // Added errorStack property to hold error stack traces for debugging in LocalUploader.tsx
  errorStack?: string;
  contentLength?: number;
  relativePath?: string;
  timestamp: number;
}

export interface BrowserCapabilities {
  fileSystemAccess: boolean;
  webkitDirectory: boolean;
  dragFolder: boolean;
}
