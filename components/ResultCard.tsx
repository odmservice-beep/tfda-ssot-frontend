
import React from 'react';
import { RegulationResult } from '../types';

interface ResultCardProps {
  data: RegulationResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ data }) => {
  const SectionTitle = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
    <div className="flex items-center space-x-2 border-l-4 border-emerald-600 pl-4 py-1 mb-6">
      <span className="text-emerald-600">{icon}</span>
      <h3 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h3>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
      {/* 緊湊標題列 */}
      <div className="bg-gray-900 px-8 py-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center">
            <span className="bg-emerald-600 w-2 h-8 mr-3 rounded-full"></span>
            {data.foodItem}
          </h2>
          <div className="flex items-center mt-1 ml-5 space-x-3">
            <p className="text-gray-400 text-sm">
              官方分類：<span className="text-emerald-400 font-medium">{data.category}</span>
            </p>
            {data.summary.includes("使用者上傳") && (
              <span className="bg-blue-600 text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/30">
                Ref Local PDF
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-emerald-900/50 border border-emerald-700/50 rounded text-[10px] font-black tracking-widest text-emerald-400 uppercase">
            Double Verified
          </span>
        </div>
      </div>

      <div className="p-8 space-y-12">
        {/* 摘要與分析說明 */}
        <div className="bg-emerald-50/30 rounded-lg p-6 border border-emerald-100">
          <p className="text-gray-700 leading-relaxed italic font-medium">
            「{data.summary}」
          </p>
        </div>

        {/* 1. 農藥殘留 */}
        <section>
          <SectionTitle 
            title="農藥殘留限量標準 (Pesticide Residues)" 
            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>}
          />
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest py-3 px-4">
              <div className="col-span-5">檢驗項目 Item</div>
              <div className="col-span-3 text-right">限量 Limit (mg/kg)</div>
              <div className="col-span-4 pl-6">說明 Note</div>
            </div>
            <div className="divide-y divide-gray-100">
              {data.pesticides.map((p, i) => (
                <div key={i} className="grid grid-cols-12 py-4 px-4 items-center hover:bg-emerald-50/30 transition-colors">
                  <div className="col-span-5 font-bold text-gray-800 text-sm">{p.item}</div>
                  <div className="col-span-3 text-right font-black text-emerald-700">{p.limit}</div>
                  <div className="col-span-4 pl-6 text-xs text-gray-400 leading-tight">{p.note || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. 重金屬項目 */}
        <section>
          <SectionTitle 
            title="重金屬項目檢驗條件 (Heavy Metals)" 
            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>}
          />
          <div className="border border-gray-100 rounded-lg overflow-hidden">
             <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest py-3 px-4">
              <div className="col-span-4">檢測元素 Element</div>
              <div className="col-span-4 text-right">限量 Limit (mg/kg)</div>
              <div className="col-span-4 pl-8">法規細節 Detail</div>
            </div>
            <div className="divide-y divide-gray-100">
              {data.heavyMetals.map((hm, i) => (
                <div key={i} className="grid grid-cols-12 py-4 px-4 items-center hover:bg-emerald-50/30 transition-colors">
                  <div className="col-span-4 font-bold text-gray-800 text-sm">{hm.item}</div>
                  <div className="col-span-4 text-right font-black text-emerald-800">{hm.limit}</div>
                  <div className="col-span-4 pl-8 text-xs text-gray-400">{hm.note || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. 其他項目 */}
        <section>
          <SectionTitle 
            title="其他檢驗項目 (Additives & Toxins)" 
            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.047a1 1 0 01.974 0l7 4A1 1 0 0119.8 6.05v7.9a1 1 0 01-.526.874l-7 4a1 1 0 01-.974 0l-7-4A1 1 0 013.8 13.95v-7.9a1 1 0 01.526-.874l7-4zM12 3.321L5.8 6.864 12 10.407l6.2-3.543L12 3.321zM4.8 13.514l6.2 3.543v-7.086L4.8 6.428v7.086zm7.2 3.543l6.2-3.543V6.428l-6.2 3.543v7.086z" clipRule="evenodd" /></svg>}
          />
          <div className="space-y-2">
            {data.others.map((o, i) => (
              <div key={i} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white border border-gray-100 rounded-lg hover:border-emerald-200 transition-all">
                <div className="flex items-center space-x-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="font-bold text-gray-800 text-sm">{o.item}</span>
                  {o.note && <span className="text-[10px] text-gray-400 font-medium bg-gray-50 px-2 py-0.5 rounded truncate max-w-[200px]">備註: {o.note}</span>}
                </div>
                <div className="mt-2 md:mt-0 font-black text-emerald-700 bg-emerald-50 px-4 py-1 rounded-full text-sm">
                  {o.limit}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 法源依據 */}
        <section className="pt-10 border-t border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.903 7.903 0 0112 4c1.21 0 2.338.27 3.344.755a.75.75 0 01.406.67v8.442a.75.75 0 01-1.007.709c-.917-.294-1.921-.433-2.943-.433-1.022 0-2.026.139-2.943.433a.75.75 0 01-1.007-.709V5.426a.75.75 0 01.406-.67zM3.25 14.755a.75.75 0 01-1.007-.709V5.604a.75.75 0 011.007-.709c.917.294 1.921.433 2.943.433 1.022 0 2.026-.139 2.943-.433a.75.75 0 011.007.709V14.05a.75.75 0 01-.406.67A7.903 7.903 0 017 15.5c-1.022 0-2.026-.139-2.943-.433z" /></svg>
                法源依據及參考資料
              </h4>
              <p className="text-[10px] text-gray-400 italic">
                數據來源包含：衛福部公告之官方連結、以及使用者提供之本地知識附件。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.sources.map((s, i) => (
                <a 
                  key={i} 
                  href={s.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded text-xs text-blue-600 font-bold hover:bg-emerald-50 hover:text-emerald-700 transition-all flex items-center shadow-sm"
                >
                  {s.title}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
