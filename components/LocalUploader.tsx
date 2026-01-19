
import React, { useState, useCallback, memo, useEffect, useRef, useMemo } from 'react';
import { set, get } from 'idb-keyval';
import { LocalDoc, FileProcessingDetail, BrowserCapabilities } from '../types';

declare const pdfjsLib: any;
declare const mammoth: any;
declare const XLSX: any;

interface UploadItem {
  file: File;
  relativePath: string;
}

export const LocalUploader = memo(({ onDocsChange }: { onDocsChange: (docs: LocalDoc[]) => void }) => {
  // --- 狀態管理 ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [details, setDetails] = useState<FileProcessingDetail[]>([]);
  const [localDocs, setLocalDocs] = useState<LocalDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // --- 瀏覽器能力偵測 ---
  const caps = useMemo<BrowserCapabilities>(() => ({
    fileSystemAccess: 'showOpenFilePicker' in window && 'showDirectoryPicker' in window,
    webkitDirectory: 'webkitdirectory' in document.createElement('input'),
    dragFolder: 'webkitGetAsEntry' in DataTransferItem.prototype || 'getAsFileSystemHandle' in DataTransferItem.prototype
  }), []);

  useEffect(() => {
    get<LocalDoc[]>('local_test_docs').then(d => d && setLocalDocs(d));
  }, []);

  // --- 核心邏輯：檔案解析 ---
  const parseFile = async (file: File): Promise<string> => {
    const reader = new FileReader();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'pdf') {
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let text = "";
        for (let j = 1; j <= pdf.numPages; j++) {
          const page = await pdf.getPage(j);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(" ") + "\n";
        }
        return text.trim();
      }
      if (ext === 'docx') {
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        return result.value;
      }
      if (['xlsx', 'xls'].includes(ext!)) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        return workbook.SheetNames.map((name: string) => `[Sheet: ${name}]\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n");
      }
      return new TextDecoder().decode(buffer);
    } catch (e) { throw e; }
  };

  // --- 核心邏輯：遞迴讀取 (僅用於 Drag & Drop) ---
  const readDirRecursive = async (handle: any, path: string = ""): Promise<UploadItem[]> => {
    let results: UploadItem[] = [];
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      results.push({ file, relativePath: path + file.name });
    } else if (handle.kind === 'directory') {
      for await (const entry of handle.values()) {
        results = results.concat(await readDirRecursive(entry, path + handle.name + "/"));
      }
    }
    return results;
  };

  // --- 核心邏輯：批次處理與去重 ---
  const addItemsWithBatch = async (items: UploadItem[]) => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: items.length });
    const signal = (abortControllerRef.current = new AbortController()).signal;
    
    const existing: LocalDoc[] = (await get<LocalDoc[]>('local_test_docs')) || [];
    const newDocs = [...existing];
    const batchSize = 50;
    const allowed = ['pdf', 'docx', 'doc', 'txt', 'xls', 'xlsx', 'csv'];

    for (let i = 0; i < items.length; i += batchSize) {
      if (signal.aborted) break;
      const batch = items.slice(i, i + batchSize);
      
      for (const item of batch) {
        const { file, relativePath } = item;
        const fingerprint = `${file.size}-${file.lastModified}-${relativePath}`;
        const detail: FileProcessingDetail = {
          id: crypto.randomUUID(),
          name: file.name,
          relativePath,
          mimeType: file.type || 'text/plain',
          size: file.size,
          status: 'processing',
          timestamp: Date.now()
        };

        if (!allowed.includes(file.name.split('.').pop()?.toLowerCase() || '')) {
          detail.status = 'skipped';
          detail.reason = '格式不支援';
        } else if (existing.some(d => d.fingerprint === fingerprint)) {
          detail.status = 'duplicate';
        } else {
          try {
            const content = await parseFile(file);
            newDocs.push({
              id: detail.id,
              name: file.name,
              relativePath,
              content,
              uploadDate: Date.now(),
              source: 'local',
              mimeType: detail.mimeType,
              fingerprint,
              size: file.size
            });
            detail.status = 'success';
            detail.contentLength = content.length;
          } catch (e: any) {
            detail.status = 'failed';
            detail.reason = e.message;
            detail.errorStack = e.stack;
          }
        }
        setDetails(prev => [detail, ...prev].slice(0, 500));
        setProgress(p => ({ ...p, current: Math.min(p.current + 1, items.length) }));
      }
      await new Promise(r => setTimeout(r, 0)); // Yield to UI
    }

    try {
      await set('local_test_docs', newDocs);
      setLocalDocs(newDocs);
      onDocsChange(newDocs);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
        setStorageWarning("瀏覽器儲存空間已滿，部分大型檔案可能未成功存入。");
      }
    }
    setIsProcessing(false);
    abortControllerRef.current = null;
  };

  // --- 觸發器：點擊按鈕同步觸發 Input ---
  const pickFiles = () => {
    // 強制同步觸發以避免瀏覽器封鎖
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const pickFolder = () => {
    if (!caps.webkitDirectory && !caps.fileSystemAccess) {
      alert("此瀏覽器不支援資料夾選擇，請改用 Chrome/Edge 或改用拖曳上傳。");
      return;
    }
    // 強制同步觸發以避免瀏覽器封鎖
    if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  // --- Input Change 事件處理 ---
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Fix: Explicitly cast FileList items to File to avoid unknown type errors
    const items: UploadItem[] = Array.from(files as FileList).map((f: File) => ({
      file: f,
      relativePath: f.name
    }));
    addItemsWithBatch(items);
    e.target.value = ''; // 重置以支援重複選取同名檔案
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      alert("未選擇任何資料夾或資料夾內無內容。");
      return;
    }
    // Fix: Explicitly cast FileList items to File and use any for webkitRelativePath access
    const items: UploadItem[] = Array.from(files as FileList).map((f: File) => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name
    }));
    addItemsWithBatch(items);
    e.target.value = ''; // 重置
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const dt = e.dataTransfer;
    let items: UploadItem[] = [];

    if (dt.items) {
      // Fix: Cast DataTransferItemList to any[] to allow check and method calls on DataTransferItem
      const dataTransferItems = Array.from(dt.items) as any[];
      for (const item of dataTransferItems) {
        // Fix: Use any casting to handle experimental or vendor-specific methods
        if (item && typeof item === 'object' && 'getAsFileSystemHandle' in item) {
          const handle = await (item as any).getAsFileSystemHandle();
          if (handle) items = items.concat(await readDirRecursive(handle));
        } else if (item && (item as any).webkitGetAsEntry) {
          const entry = (item as any).webkitGetAsEntry();
          if (entry) {
            const traverseEntry = async (ent: any, path: string = ""): Promise<UploadItem[]> => {
              if (ent.isFile) {
                const f = await new Promise<File>(r => ent.file(r));
                return [{ file: f, relativePath: path + f.name }];
              } else if (ent.isDirectory) {
                let res: UploadItem[] = [];
                const reader = ent.createReader();
                const ents = await new Promise<any[]>(r => reader.readEntries(r));
                for (const child of ents) res = res.concat(await traverseEntry(child, path + ent.name + "/"));
                return res;
              }
              return [];
            };
            items = items.concat(await traverseEntry(entry));
          }
        }
      }
    }
    addItemsWithBatch(items);
  };

  // --- UI 工具 ---
  const filteredDocs = useMemo(() => {
    return localDocs
      .filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.relativePath?.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'size') return b.size - a.size;
        return b.uploadDate - a.uploadDate;
      });
  }, [localDocs, searchTerm, sortBy]);

  const exportDebugReport = () => {
    const report = {
      capabilities: caps,
      lastSessionDetails: details,
      totalFiles: localDocs.length,
      origin: window.location.origin,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `debug-report-${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="bg-white rounded-[40px] border border-blue-50 shadow-2xl p-10 space-y-8 overflow-hidden">
      {/* 標題與基礎狀態 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-xl shadow-blue-200">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h4 className="text-lg font-black uppercase tracking-widest text-gray-800">LOCAL SANDBOX</h4>
              <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-100 shadow-sm">
                已上傳文件：{localDocs.length}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              本地離線檢索引擎
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setShowDebug(!showDebug)} className="px-4 py-2 bg-gray-50 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all">
            Debug 診斷
          </button>
          <button type="button" onClick={() => { if(confirm("清空全部？")) { set('local_test_docs', []); setLocalDocs([]); onDocsChange([]); } }} className="px-4 py-2 bg-red-50 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all">
            清空庫
          </button>
        </div>
      </div>

      {/* 上傳區域 */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative group transition-all duration-500 border-4 border-dashed rounded-[32px] p-16 text-center flex flex-col items-center justify-center ${
          isDragging ? 'border-blue-500 bg-blue-50/50 scale-[0.98]' : 'border-gray-100 bg-gray-50/20 hover:border-blue-200 hover:bg-blue-50/10'
        }`}
      >
        <div className={`mb-6 p-6 rounded-3xl transition-all shadow-xl ${isDragging ? 'bg-blue-500 text-white scale-110' : 'bg-blue-100 text-blue-500 group-hover:scale-105'}`}>
          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        </div>
        <h5 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-3">
          拖曳或點擊上傳：單檔或整個資料夾（含子資料夾）
        </h5>
        <p className="text-[11px] text-gray-400 font-medium max-w-sm mx-auto leading-relaxed mb-10 uppercase tracking-[0.2em]">
          PDF, DOCX, TXT, Excel • 自動維持目錄階層
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <button type="button" onClick={pickFiles} className="px-10 py-4 bg-white border-2 border-gray-100 text-gray-700 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-blue-500 hover:text-blue-600 hover:shadow-2xl hover:shadow-blue-200 transition-all">
            選擇檔案
          </button>
          <button type="button" onClick={pickFolder} className="px-10 py-4 bg-white border-2 border-gray-100 text-gray-700 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-emerald-500 hover:text-emerald-600 hover:shadow-2xl hover:shadow-emerald-200 transition-all">
            選擇資料夾
          </button>
        </div>

        {/* 隱藏的 Input 元素 */}
        <input 
          ref={fileInputRef} 
          type="file" 
          multiple 
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv" 
          className="hidden" 
          onChange={handleFileInputChange} 
        />
        <input 
          ref={folderInputRef} 
          type="file" 
          {...({ webkitdirectory: "", directory: "" } as any)} 
          multiple 
          className="hidden" 
          onChange={handleFolderInputChange} 
        />
      </div>

      {/* 進度條 */}
      {isProcessing && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
              正在處理批次檔案 ({progress.current}/{progress.total})
            </span>
            <button type="button" onClick={() => abortControllerRef.current?.abort()} className="text-[9px] text-red-500 font-bold uppercase hover:underline">取消剩餘工作</button>
          </div>
          <div className="h-2 bg-blue-50 rounded-full overflow-hidden border border-blue-100">
            <div className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.4)]" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
          </div>
        </div>
      )}

      {storageWarning && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-[11px] text-amber-700 font-bold flex items-center gap-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          {storageWarning}
        </div>
      )}

      {/* 檔案管理面板 */}
      <div className="space-y-6 pt-4 border-t border-gray-50">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-72">
             <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜尋庫內檔案..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 border border-transparent focus:border-blue-300 transition-all" />
             <svg className="absolute left-3 top-3 w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400">
            <span>排序方式:</span>
            {['date', 'name', 'size'].map(t => (
              <button key={t} type="button" onClick={() => setSortBy(t as any)} className={`px-2 py-1 rounded-md transition-all ${sortBy === t ? 'bg-blue-600 text-white' : 'hover:text-blue-600'}`}>{t === 'date' ? '時間' : t === 'name' ? '名稱' : '大小'}</button>
            ))}
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
          {filteredDocs.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-gray-50 rounded-3xl">
              <p className="text-gray-300 italic text-sm font-medium">尚無匹配的文件內容</p>
            </div>
          ) : filteredDocs.map(doc => (
            <div key={doc.id} className="group flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all">
              <div className="truncate flex-grow mr-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${doc.name.toLowerCase().endsWith('pdf') ? 'bg-red-50 text-red-500' : doc.name.toLowerCase().endsWith('docx') ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-500'}`}>
                    {doc.name.split('.').pop()}
                  </span>
                  <h6 className="text-xs font-bold text-gray-800 truncate">{doc.name}</h6>
                </div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter truncate">
                  {doc.relativePath} • {(doc.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button type="button" onClick={async () => { const d = localDocs.filter(x => x.id !== doc.id); await set('local_test_docs', d); setLocalDocs(d); onDocsChange(d); }} className="p-2 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Debug 面板 */}
      {showDebug && (
        <div className="fixed inset-0 z-[200] bg-gray-900/90 backdrop-blur-sm flex justify-end animate-in fade-in duration-300" onClick={() => setShowDebug(false)}>
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
               <div>
                 <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">系統診斷報告</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Local Sandbox Debug Console</p>
               </div>
               <button type="button" onClick={() => setShowDebug(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                 <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>
            
            <div className="flex-grow overflow-auto p-8 space-y-8 custom-scrollbar">
              <section className="space-y-4">
                <h5 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2">Browser Capabilities</h5>
                <div className="grid grid-cols-2 gap-3 text-[11px] font-bold">
                  {Object.entries(caps).map(([k, v]) => (
                    <div key={k} className={`p-3 rounded-xl border flex justify-between items-center ${v ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                      <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span>{v ? 'SUPPORTED' : 'UNSUPPORTED'}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                 <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Recent Activity Logs</h5>
                    <button type="button" onClick={exportDebugReport} className="text-[9px] font-black bg-blue-600 text-white px-3 py-1 rounded-md uppercase tracking-widest hover:bg-blue-700 transition-all">匯出完整報告</button>
                 </div>
                 <div className="space-y-2">
                    {details.length === 0 ? <p className="text-center py-10 text-gray-300 italic text-xs">尚無操作紀錄</p> : details.map(d => (
                      <div key={d.id} className={`p-4 rounded-2xl border text-[11px] font-mono leading-tight ${d.status === 'success' ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : d.status === 'duplicate' ? 'bg-amber-50/50 border-amber-100 text-amber-800' : 'bg-red-50/50 border-red-100 text-red-800'}`}>
                        <div className="flex justify-between mb-1">
                          <span className="font-bold truncate max-w-[70%]">[{d.status.toUpperCase()}] {d.relativePath}</span>
                          <span className="opacity-40">{new Date(d.timestamp).toLocaleTimeString()}</span>
                        </div>
                        {d.reason && <p className="mt-1 bg-white/50 p-2 rounded border border-current/10">Error: {d.reason}</p>}
                        {d.errorStack && <details className="mt-2"><summary className="cursor-pointer opacity-60">View Stack Trace</summary><pre className="mt-1 text-[8px] overflow-auto whitespace-pre-wrap opacity-60">{d.errorStack}</pre></details>}
                      </div>
                    ))}
                 </div>
              </section>
            </div>
            <div className="p-8 bg-gray-50 border-t border-gray-100">
               <div className="flex justify-between text-[11px] font-black text-gray-500 uppercase">
                  <span>Total Objects in IDB:</span>
                  <span className="text-gray-900">{localDocs.length}</span>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
