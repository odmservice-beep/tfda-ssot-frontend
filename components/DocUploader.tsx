
import React, { useState, memo } from 'react';
import { syncLibrary } from '../services/api';
import { SyncResult } from '../types';

export const DocUploader = memo(({ onSyncComplete }: { onSyncComplete: (res: SyncResult) => void }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);

  const FIXED_FOLDER_ID = '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';

  const handleSync = async () => {
    setIsSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await syncLibrary();
      setLastSyncResult(result);
      onSyncComplete(result as any);
    } catch (err: any) {
      alert(`同步失敗: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-[32px] border border-emerald-50 shadow-2xl p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-600 p-2.5 rounded-xl text-white shadow-lg shadow-emerald-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-gray-800">TFDA 雲端固定知識庫</h4>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">ID: {FIXED_FOLDER_ID.substring(0, 8)}...{FIXED_FOLDER_ID.substring(28)}</p>
          </div>
        </div>
        
        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center space-x-2 ${
            isSyncing ? 'bg-gray-100 text-gray-400' : 'bg-emerald-900 text-white hover:bg-black'
          }`}
        >
          {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
          <span>{isSyncing ? '正在執行增量同步...' : '立即同步雲端庫'}</span>
        </button>
      </div>

      {lastSyncResult && (
        <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center text-[10px] font-black text-emerald-700 uppercase mb-4">
            <span className="flex items-center gap-2">
               <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
               同步成功 (增量模式)
            </span>
            <span>更新於: {new Date(lastSyncResult.lastSyncAt).toLocaleTimeString()}</span>
          </div>
          
          <div className="grid grid-cols-4 gap-4 mb-4">
             {[
               { label: '掃描文件', val: lastSyncResult.scanned },
               { label: '更新檔案', val: lastSyncResult.processed },
               { label: '生成分片', val: lastSyncResult.chunks },
               { label: '略過/不變', val: lastSyncResult.skipped }
             ].map((s, i) => (
               <div key={i} className="bg-white p-3 rounded-xl text-center border border-emerald-100 shadow-sm">
                  <div className="text-[8px] text-gray-400 font-bold uppercase">{s.label}</div>
                  <div className="text-sm font-black text-gray-800">{s.val}</div>
               </div>
             ))}
          </div>

          {lastSyncResult.skippedList?.length > 0 && (
            <details className="mt-2 group">
              <summary className="text-[9px] font-bold text-gray-400 cursor-pointer uppercase tracking-widest hover:text-emerald-600 transition-colors">檢視略過清單 ({lastSyncResult.skippedList.length})</summary>
              <div className="mt-2 max-h-24 overflow-y-auto space-y-1 bg-white/50 p-2 rounded-lg border border-emerald-50">
                {lastSyncResult.skippedList.map((s: any, i: number) => (
                  <div key={i} className="text-[8px] text-gray-500 flex justify-between">
                    <span className="truncate max-w-[70%]">{s.name}</span>
                    <span className="text-red-400 font-medium">{s.reason}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-[10px] text-blue-800 font-medium leading-relaxed flex items-start gap-3">
        <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>
          本系統已連結 TFDA 專屬雲端資料夾。同步時會自動解析 <b>Google Docs</b>、<b>Sheets</b>、<b>TXT</b> 與 <b>MD</b> 檔案內容並建立語義索引。PDF 檔案目前僅同步 Metadata。
        </span>
      </div>
    </div>
  );
});
