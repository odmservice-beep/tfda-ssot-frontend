
import React, { useState, useEffect, useCallback, memo } from 'react';
import { get } from 'idb-keyval';
import { Layout } from './components/Layout';
import { ResultCard } from './components/ResultCard';
import { DocUploader } from './components/DocUploader';
import { LocalUploader } from './components/LocalUploader';
import { queryRegulation } from './services/geminiService';
import { RegulationResult, LocalDoc, SearchSourceMode } from './types';

const SearchSection = memo(({ onSearch, isLoading, sourceMode, setSourceMode }: any) => {
  const [q, setQ] = useState('');
  const handleSubmit = (e: any) => { e.preventDefault(); q.trim() && onSearch(q); };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/60 backdrop-blur-md p-4 rounded-[24px] border border-gray-100 shadow-xl">
        <div className="flex items-center space-x-2">
           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">檢索來源模式</label>
           <div className="flex bg-gray-100 p-1 rounded-xl">
              {['drive', 'local', 'both'].map(id => (
                <button
                  key={id}
                  onClick={() => setSourceMode(id as SearchSourceMode)}
                  className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${sourceMode === id ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {id === 'drive' ? '雲端庫' : id === 'local' ? '本地沙盒' : '全域混合'}
                </button>
              ))}
           </div>
        </div>
        <div className="text-[9px] font-black text-emerald-600/60 uppercase tracking-widest mr-2">
          SSOT 檢索模式: {sourceMode.toUpperCase()}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="查詢：乾燥紅蘿蔔丁 / 檢驗條件..." className="flex-grow px-8 py-5 bg-white border-2 border-gray-100 rounded-2xl shadow-xl text-lg outline-none focus:border-emerald-500 transition-all font-medium" />
        <button type="submit" disabled={isLoading || !q.trim()} className="bg-emerald-600 text-white font-black py-5 px-12 rounded-2xl shadow-xl hover:bg-emerald-700 disabled:bg-gray-200 transition-all">
          {isLoading ? '深度檢索中...' : '法規查詢'}
        </button>
      </form>
    </section>
  );
});

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegulationResult | null>(null);
  const [driveDocs, setDriveDocs] = useState<LocalDoc[]>([]);
  const [localDocs, setLocalDocs] = useState<LocalDoc[]>([]);
  const [sourceMode, setSourceMode] = useState<SearchSourceMode>('local');

  const load = async () => {
    const [d, l] = await Promise.all([get<LocalDoc[]>('regulation_docs'), get<LocalDoc[]>('local_test_docs')]);
    d && setDriveDocs(d);
    l && setLocalDocs(l);
  };

  useEffect(() => { load(); }, []);

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true); setError(null); setResult(null);
    try {
      const data = await queryRegulation(query, driveDocs, localDocs, sourceMode);
      setResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  }, [driveDocs, localDocs, sourceMode]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-10 pb-20">
        <section className="text-center space-y-2">
          <h2 className="text-5xl font-extrabold text-gray-900 tracking-tight"><span className="text-emerald-600">食品法規</span> 智慧助理</h2>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em]">Pure OAuth & Sandbox SSoT Engine</p>
        </section>

        <DocUploader docs={driveDocs} onDocsChange={(d) => setDriveDocs(d)} />
        <LocalUploader onDocsChange={setLocalDocs} />
        
        <SearchSection onSearch={handleSearch} isLoading={isLoading} sourceMode={sourceMode} setSourceMode={setSourceMode} />

        <section className="min-h-[300px]">
          {isLoading && (
            <div className="py-20 text-center animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">正在執行深度法規語義分析...</p>
            </div>
          )}
          {error && <div className="p-8 bg-red-50 text-red-800 rounded-3xl border border-red-100 font-bold">{error}</div>}
          {result && !isLoading && <ResultCard data={result} />}
        </section>
      </div>
    </Layout>
  );
};

export default App;
