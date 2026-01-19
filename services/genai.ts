// services/genai.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

let _genai: GoogleGenerativeAI | null = null;

function getApiKey(): string {
  // ✅ Vite 前端環境變數一定要用 import.meta.env 且要 VITE_ 前綴
  const key = import.meta.env.VITE_GOOGLE_GENAI_API_KEY as string | undefined;

  if (!key || !key.trim()) {
    throw new Error(
      "VITE_GOOGLE_GENAI_API_KEY is not set. Please check your .env.local"
    );
  }

  return key.trim();
}

export function getGenAI(): GoogleGenerativeAI {
  if (_genai) return _genai;

  const apiKey = getApiKey();
  _genai = new GoogleGenerativeAI(apiKey);
  return _genai;
}
