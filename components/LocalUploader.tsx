
import React, { useState, useCallback, memo, useEffect } from 'react';
import { set, get } from 'idb-keyval';
import { LocalDoc, FileProcessingDetail } from '../types';

declare const pdfjsLib: any;
declare const mammoth: any;
declare const XLSX: any;

export const LocalUploader = memo(({ onDocsChange }: { onDocsChange: (docs: LocalDoc[]) => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [details, setDetails] = useState<FileProcessingDetail[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [localDocs, setLocalDocs] = useState<LocalDoc[]>([]);

  useEffect(() => {
    get<LocalDoc[]>('local_test_docs').then(d => d && setLocalDocs(d));
  }, []);

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const parseFile = async (file: File): Promise<string> => {
    const buffer = await readFileAsArrayBuffer(file);
    const ext = file.name.split('.').pop()?.toLowerCase();

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

    if (ext === 'xlsx' || ext === 'csv') {
      const workbook = XLSX.read(buffer, { type: 'array' });
      let fullText = "";
      workbook.SheetNames.forEach((name: string) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        fullText += `[Sheet: ${name}]\n${csv}\n`;
      });
      return fullText;
    }

    return new TextDecoder().decode(buffer);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    
    const existing: LocalDoc[] = (await get<LocalDoc[]>('local_test_docs')) || [];
    const newDocs = [...existing];
    const currentDetails: FileProcessingDetail[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const detail: FileProcessingDetail = {
        id: `local-${Date.now()}-${i}`,
        name: file.name,
        mimeType: file.type || 'text/plain',
        size: file.size,
        status: 'processing'
      };

      try {
        const content = await parseFile(file);
        if (content.length > 5) { // 至少要有內容
          newDocs.push({
            id: detail.id,
            name: file.name,
            content,
            uploadDate: Date.now(),
            source: 'local',
            mimeType: detail.mimeType,
            fingerprint: `${file.size}-${file.lastModified}`
          });
          detail.status = 'success';
          detail.contentLength = content.length;
        } else {
          detail.status = 'skipped';
          detail.reason = '解析內容太短';
        }
      } catch (e: any) {
        detail.status = 'failed';
        detail.reason = e.message;
      }
      currentDetails.push(detail);
    }

    await set('local_test_docs', newDocs);
    setLocalDocs(newDocs);
    setDetails(prev => [...currentDetails, ...prev]);
    onDocsChange(newDocs);
    setIsProcessing(false);
  };

  const clearLocal = async () => {
    if (confirm("確定要清空本地測試庫嗎？")) {
      await set('local_test_docs', []);
      setLocalDocs([]);
      setDetails([]);
      onDocsChange([]);
    }
  };

  return (
    <div className="bg-white rounded-[32px] border border-blue-50 shadow-xl p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <h4 className="text-sm font-black uppercase tracking-[0.2em] text-gray-800">LOCAL SANDBOX (本地測試)</h4>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReport(true)} className="text-[10px] font-black uppercase text-blue-600 px-3 py-1 hover:bg-blue-50 rounded-lg">歷史報告</button>
          <button onClick={clearLocal} className="text-[10px] font-black uppercase text-red-400 px-3 py-1 hover:bg-red-50 rounded-lg">清空</button>
        </div>
      </div>

      <div className="relative group">
        <input type="file" multiple onChange={e => handleFiles(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isProcessing} />
        <div className="p-10 border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center text-center group-hover:border-blue-300 group-hover:bg-blue-50/30 transition-all bg-gray-50/50">
           <svg className="h-10 w-10 text-blue-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
           <span className="text-xs font-black text-gray-400 uppercase tracking-widest">拖曳或點擊上傳測試文件 (PDF / DOCX)</span>
           <p className="mt-2 text-[10px] text-gray-400">目前本地庫存有 {localDocs.length} 份文件</p>
        </div>
      </div>

      {isProcessing && (
        <div className="flex items-center justify-center gap-3 py-4 text-blue-600">
           <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
           <span className="text-xs font-black uppercase">正在進行本地內容解析與索引...</span>
        </div>
      )}

      {showReport && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowReport(false)}>
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-gray-800 uppercase tracking-widest">本地解析明細</h3>
              <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-black">關閉</button>
            </div>
            <div className="space-y-3 max-h-[50vh] overflow-auto pr-2">
              {details.length === 0 ? <p className="text-center py-10 text-gray-300 italic">尚無上傳紀錄</p> : details.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="truncate flex-grow mr-4">
                    <p className="text-xs font-bold text-gray-700 truncate">{d.name}</p>
                    <p className="text-[9px] text-gray-400 font-medium uppercase">{d.status} | {d.contentLength || 0} 字</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${d.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
