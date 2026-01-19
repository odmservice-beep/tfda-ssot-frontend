
import React, { useState, useEffect, useCallback, memo } from 'react';
import { get } from 'idb-keyval';
import { Layout } from './components/Layout';
import { ResultCard } from './components/ResultCard';
import { DocUploader } from './components/DocUploader';
import { LocalUploader } from './components/LocalUploader';
import { serverQuery } from './services/api';
import { RegulationResult, LocalDoc, SearchSourceMode } from './types';

const SearchSection = memo(({ onSearch, isLoading, sourceMode, setSourceMode }: any) => {
  const [q, setQ] = useState('');
  const handleSubmit = (e: any) => { e.preventDefault(); q.trim() && onSearch(q); };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/60 backdrop-blur-md p-4 rounded-[24px] border border-gray-100 shadow-xl">
        <div className="flex items-center space-x-2">
           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">檢索範圍</label>
           <div className="flex bg-gray-100 p-1 rounded-xl">
              {[
                {id: 'drive', label: 'TFDA 雲端庫'},
                {id: 'local', label: '本地沙盒'},
                {id: 'both', label: '混合檢索'}
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSourceMode(opt.id as SearchSourceMode)}
                  className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${sourceMode === opt.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {opt.label}
                </button>
              ))}
           </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3">
        <input 
          value={q} 
          onChange={e => setQ(e.target.value)} 
          placeholder="輸入法規關鍵字，例如「乾燥紅蘿蔔丁」、「重金屬限量」..." 
          className="flex-grow px-8 py-5 bg-white border-2 border-gray-100 rounded-2xl shadow-xl text-lg outline-none focus:border-emerald-500 transition-all font-medium" 
        />
        <button type="submit" disabled={isLoading || !q.trim()} className="bg-emerald-600 text-white font-black py-5 px-12 rounded-2xl shadow-xl hover:bg-emerald-700 disabled:bg-gray-200 transition-all active:scale-95">
          {isLoading ? '正在分析...' : '智慧查詢'}
        </button>
      </form>
    </section>
  );
});

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegulationResult | null>(null);
  const [localDocs, setLocalDocs] = useState<LocalDoc[]>([]);
  const [sourceMode, setSourceMode] = useState<SearchSourceMode>('drive');

  const loadLocal = async () => {
    const l = await get<LocalDoc[]>('local_test_docs');
    l && setLocalDocs(l);
  };

  useEffect(() => { loadLocal(); }, []);

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true); setError(null); setResult(null);
    try {
      // 呼叫伺服器端 RAG API
      const data = await serverQuery(query, sourceMode, sourceMode !== 'drive' ? localDocs : []);
      setResult(data);
    } catch (err: any) { 
      setError(err.message || '查詢發生錯誤，請檢查網路狀態或 API 設定。'); 
    } finally { 
      setIsLoading(false); 
    }
  }, [localDocs, sourceMode]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-10 pb-20">
        <section className="text-center space-y-2">
          <h2 className="text-5xl font-extrabold text-gray-900 tracking-tight">
            TFDA <span className="text-emerald-600">法規助理</span>
          </h2>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em]">Corporate Internal Knowledge Base</p>
        </section>

        <DocUploader onSyncComplete={() => {}} />
        <LocalUploader onDocsChange={setLocalDocs} />
        
        <SearchSection onSearch={handleSearch} isLoading={isLoading} sourceMode={sourceMode} setSourceMode={setSourceMode} />

        <section className="min-h-[300px]">
          {isLoading && (
            <div className="py-20 text-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse">後端正在進行雲端檢索與語義分析...</p>
            </div>
          )}
          {error && (
            <div className="p-8 bg-red-50 text-red-800 rounded-3xl border border-red-100 font-bold flex flex-col items-center">
              <span className="text-sm mb-2 opacity-50">查詢錯誤</span>
              {error}
              <button onClick={() => window.location.reload()} className="mt-4 text-xs underline opacity-70">重新整理頁面</button>
            </div>
          )}
          {result && !isLoading && <ResultCard data={result} />}
        </section>
      </div>
    </Layout>
  );
};

export default App;
