
import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { KBMetadata, SyncStatus, LocalDoc, AuthStatus } from '../types';
import { listAllFilesRecursive, downloadFileContent, parseDriveId } from '../services/driveService';

declare const google: any;

export const DocUploader = memo(({ onDocsChange }: { docs: LocalDoc[], onDocsChange: (d: LocalDoc[], m: KBMetadata) => void }) => {
  const currentOrigin = window.location.origin;
  // 1. 偵測 Preview 環境
  const isPreview = currentOrigin.includes(".scf.usercontent.goog") || currentOrigin.includes("aistudio.google.com") || (currentOrigin.startsWith("http:") && !currentOrigin.includes("localhost"));

  // 2. 配置與授權狀態
  const [clientId, setClientId] = useState(localStorage.getItem('OAUTH_CLIENT_ID') || '');
  const [folderInput, setFolderInput] = useState(localStorage.getItem('DRIVE_FOLDER_INPUT') || '');
  const [isMasked, setIsMasked] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isPreview ? 'preview_blocked' : 'unauthorized');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ phase: 'idle', message: '', progress: { current: 0, total: 0 } });
  const [kbMeta, setKbMeta] = useState<KBMetadata | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  const tokenClientRef = useRef<any>(null);

  useEffect(() => {
    get<KBMetadata>('regulation_kb_meta').then(m => m && setKbMeta(m));
  }, []);

  // 3. 初始化 Token Client (僅在非 Preview 模式)
  const initTokenClient = useCallback(() => {
    if (isPreview || typeof google === 'undefined' || !google.accounts?.oauth2 || !clientId) return;
    try {
      tokenClientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response: any) => {
          if (response.error) {
            setAuthStatus('error');
            console.error("Auth Error:", response);
            return;
          }
          setAccessToken(response.access_token);
          setAuthStatus('authorized');
        },
      });
    } catch (e) {
      console.error("GIS Init Error", e);
    }
  }, [clientId, isPreview]);

  useEffect(() => {
    initTokenClient();
  }, [initTokenClient]);

  // 4. UI 操作邏輯 (Preview 下仍可儲存)
  const handleSave = (key: string, val: string) => {
    localStorage.setItem(key, val);
    alert(`已儲存配置。`);
    if (key === 'OAUTH_CLIENT_ID' && !isPreview) initTokenClient();
  };

  const handlePaste = async (setter: (v: string) => void, key: string) => {
    try {
      const text = await navigator.clipboard.readText();
      setter(text.trim());
      localStorage.setItem(key, text.trim());
    } catch (err) {
      alert("無法存取剪貼簿，請手動貼上。");
    }
  };

  const handleCopy = (val: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    alert("已複製到剪貼簿");
  };

  const handleAuthorize = () => {
    if (isPreview) return; // 按鈕應已被禁用，但做二次防禦
    if (!clientId) {
      alert("請先填入 Web OAuth Client ID 並點擊儲存。");
      return;
    }
    if (!tokenClientRef.current) initTokenClient();
    
    setAuthStatus('requesting');
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  };

  const handleSync = async () => {
    if (!accessToken) {
      alert("請先完成 Google 授權");
      return;
    }
    const folderId = parseDriveId(folderInput);
    if (!folderId) {
      alert("請提供有效的 Google Drive 資料夾 ID 或連結");
      return;
    }

    setSyncStatus({ phase: 'processing', message: '正在建立雲端連接...', progress: { current: 0, total: 0 } });
    
    try {
      const listResult = await listAllFilesRecursive(folderId, accessToken, (name) => {
        setSyncStatus(s => ({ ...s, message: `正在掃描目錄: ${name}` }));
      });

      const docs: LocalDoc[] = [];
      let success = 0;
      const total = listResult.files.length;

      for (let i = 0; i < total; i++) {
        const file = listResult.files[i];
        setSyncStatus({ phase: 'processing', message: `同步檔案: ${file.name}`, progress: { current: i + 1, total } });
        
        try {
          const { buffer, actualMimeType } = await downloadFileContent(file.id, file.mimeType, accessToken);
          const content = new TextDecoder().decode(buffer);
          
          docs.push({
            id: file.id,
            name: file.name,
            content,
            uploadDate: Date.now(),
            source: 'drive',
            mimeType: actualMimeType,
            fingerprint: file.md5Checksum || `${file.size}-${file.modifiedTime}`
          });
          success++;
        } catch (e) {
          console.warn(`跳過無法讀取的檔案: ${file.name}`);
        }
      }

      const meta: KBMetadata = {
        rootFolderId: folderId,
        lastSyncAt: Date.now(),
        fingerprint: `oauth-${Date.now()}`,
        stats: { total, success, failed: total - success, skipped: 0 }
      };

      await set('regulation_kb_meta', meta);
      await set('regulation_docs', docs);
      setKbMeta(meta);
      onDocsChange(docs, meta);
      setSyncStatus({ phase: 'done', message: 'Google Drive 同步完成！', progress: { current: total, total } });
    } catch (err: any) {
      setSyncStatus({ phase: 'error', message: err.message, progress: { current: 0, total: 0 } });
    }
  };

  return (
    <div className="space-y-6">
      {/* 5. Preview 限制提示 */}
      {isPreview && (
        <div className="bg-red-50 border-2 border-red-100 p-6 rounded-[24px] flex items-start space-x-4 shadow-sm">
          <div className="bg-red-500 p-2 rounded-lg text-white">
             <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <div className="flex-grow">
            <h5 className="text-xs font-black text-red-600 uppercase tracking-widest mb-1">Preview 網域限制提示</h5>
            <p className="text-[11px] text-red-800 leading-relaxed font-medium">
              目前的網域 (<span className="font-mono bg-red-100 px-1 rounded">{currentOrigin}</span>) 不支援 Google OAuth 視窗授權。
              請先部署到 <span className="font-bold">Vercel、Firebase</span> 或其他 <span className="font-bold">HTTPS 正式網域</span> 後再執行授權。
              您目前仍可先填寫下方的 Client ID 配置。
            </p>
          </div>
        </div>
      )}

      {/* 設定區卡片 */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-2xl p-8 space-y-8 overflow-hidden relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gray-900 p-2 rounded-xl text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-gray-800">雲端庫授權配置</h4>
          </div>
          <button onClick={() => setShowDiag(!showDiag)} className="text-[9px] font-black text-gray-400 hover:text-black uppercase tracking-tighter">檢視診斷與 GCP 設定</button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Client ID 欄位 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center ml-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">GCP Web OAuth Client ID</label>
              <button onClick={() => setIsMasked(!isMasked)} className="text-[9px] text-indigo-600 font-bold hover:underline">{isMasked ? '顯示明碼' : '遮罩隱藏'}</button>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-grow">
                <input 
                  type={isMasked ? "password" : "text"}
                  value={clientId} 
                  onChange={e => setClientId(e.target.value)} 
                  placeholder="貼上 123456...apps.googleusercontent.com" 
                  className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent rounded-2xl text-xs font-mono outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePaste(setClientId, 'OAUTH_CLIENT_ID')} className="px-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">貼上</button>
                <button onClick={() => handleCopy(clientId)} className="px-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">複製</button>
                <button onClick={() => handleSave('OAUTH_CLIENT_ID', clientId)} className="px-6 bg-gray-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-gray-400/20 hover:scale-[1.02] active:scale-95 transition-all">儲存</button>
              </div>
            </div>
          </div>

          {/* Folder ID 欄位 */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Drive Folder 連結或 ID</label>
            <div className="flex flex-col md:flex-row gap-2">
              <input 
                value={folderInput} 
                onChange={e => setFolderInput(e.target.value)} 
                placeholder="https://drive.google.com/drive/folders/..." 
                className="flex-grow px-5 py-4 bg-gray-50 border-2 border-transparent rounded-2xl text-xs font-mono outline-none focus:border-emerald-500 focus:bg-white transition-all" 
              />
              <div className="flex gap-2">
                <button onClick={() => handlePaste(setFolderInput, 'DRIVE_FOLDER_INPUT')} className="px-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">貼上</button>
                <button onClick={() => handleSave('DRIVE_FOLDER_INPUT', folderInput)} className="px-6 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-emerald-400/20 hover:scale-[1.02] active:scale-95 transition-all">儲存</button>
              </div>
            </div>
          </div>
        </div>

        {/* 按鈕與狀態 */}
        <div className="pt-6 border-t border-gray-50 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative group">
            <button 
              onClick={handleAuthorize}
              disabled={isPreview || accessToken !== null}
              className={`px-10 py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] transition-all flex items-center space-x-2 ${
                accessToken 
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                  : isPreview 
                    ? 'bg-gray-100 text-gray-300 border border-gray-100 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-500/30 active:scale-95'
              }`}
            >
              {accessToken && <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>}
              <span>{accessToken ? 'GOOGLE 授權已就緒' : 'Google 授權登入'}</span>
            </button>
            {isPreview && (
              <span className="absolute -bottom-6 left-0 text-[9px] font-black text-red-500/60 uppercase tracking-widest">需正式網域環境</span>
            )}
          </div>

          <button 
            onClick={handleSync}
            disabled={!accessToken || syncStatus.phase === 'processing'}
            className="flex-grow bg-gray-900 text-white px-10 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-gray-500/20 hover:bg-black disabled:bg-gray-100 disabled:text-gray-300 transition-all active:scale-95 flex items-center justify-center space-x-3"
          >
            {syncStatus.phase === 'processing' && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            <span>{syncStatus.phase === 'processing' ? '同步中...' : '執行 Drive 資料庫同步'}</span>
          </button>
        </div>

        {/* 6. 診斷與 GCP 設定建議區 */}
        {showDiag && (
          <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
               <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 flex items-center">
                 <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 GCP 控制台設定建議
               </h5>
               <div className="space-y-4 text-[11px] font-mono text-indigo-900">
                  <div>
                    <p className="text-[9px] text-indigo-400 uppercase font-black mb-1">Authorized JavaScript origins</p>
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-200">
                      <code className="truncate mr-2">{currentOrigin}</code>
                      <button onClick={() => handleCopy(currentOrigin)} className="text-indigo-600 font-bold hover:underline flex-shrink-0">複製</button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] text-indigo-400 uppercase font-black mb-1">Authorized redirect URIs (如有需要)</p>
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-200">
                      <code className="truncate mr-2">{currentOrigin}</code>
                      <button onClick={() => handleCopy(currentOrigin)} className="text-indigo-600 font-bold hover:underline flex-shrink-0">複製</button>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-6 bg-gray-900 rounded-[24px] font-mono text-[10px] text-gray-400 space-y-2 border border-gray-800">
              <div className="flex justify-between border-b border-gray-800 pb-2"><span>Current Origin:</span> <span className="text-white">{currentOrigin}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span>GIS SDK Loaded:</span> <span className={typeof google !== 'undefined' ? 'text-emerald-400' : 'text-red-400'}>{typeof google !== 'undefined' ? 'YES' : 'NO'}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span>Auth Status:</span> <span className="text-white uppercase">{authStatus}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span>Token Exist:</span> <span className="text-white">{accessToken ? 'YES' : 'NO'}</span></div>
            </div>
          </div>
        )}

        {syncStatus.phase !== 'idle' && (
          <div className={`p-5 rounded-2xl text-[11px] font-bold mt-4 ${syncStatus.phase === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <div className="flex items-center justify-between mb-2">
              <span>{syncStatus.message}</span>
              {syncStatus.progress.total > 0 && <span>{Math.round((syncStatus.progress.current / syncStatus.progress.total) * 100)}%</span>}
            </div>
            {syncStatus.progress.total > 0 && (
              <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300" 
                  style={{ width: `${(syncStatus.progress.current / syncStatus.progress.total) * 100}%` }}
                ></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
