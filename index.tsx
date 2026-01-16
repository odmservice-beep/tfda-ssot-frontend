import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ================================
// 🔍 ENV DEBUG（最重要）
// ================================
console.log(
  '[ENV CHECK] VITE_GOOGLE_GENAI_API_KEY exists?',
  !!import.meta.env.VITE_GOOGLE_GENAI_API_KEY
);

console.log(
  '[ENV CHECK] API KEY VALUE:',
  import.meta.env.VITE_GOOGLE_GENAI_API_KEY
);

// ================================
// 🚀 React App 啟動
// ================================
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Could not find root element to mount');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
