
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-emerald-700 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <h1 className="text-xl font-bold tracking-tight">台灣食品法規查詢系統</h1>
              <p className="text-xs text-emerald-100 opacity-80">TFDA Standards Search Engine</p>
            </div>
          </div>
          <div className="hidden md:block">
            <span className="bg-emerald-600 px-3 py-1 rounded-full text-xs font-medium border border-emerald-500">
              官方平台 ‧ 精準檢索
            </span>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        {children}
      </main>

      <footer className="bg-gray-100 border-t border-gray-200 py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>© {currentYear} 台灣食品法規查詢系統</p>
          <p className="mt-1">
            資料來源：<a href="https://law.moj.gov.tw/" target="_blank" className="underline hover:text-emerald-600">全國法規資料庫</a>、
            <a href="https://consumer.fda.gov.tw/" target="_blank" className="underline hover:text-emerald-600">食品原料整合查詢平臺</a>
          </p>
          <p className="mt-2 text-[10px] opacity-70 italic">本系統強制僅從官方平台檢索數據，僅供參考，正式報關或檢驗請以政府公告為準。</p>
        </div>
      </footer>
    </div>
  );
};
