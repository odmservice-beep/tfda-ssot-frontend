
import { kv } from '@vercel/kv';
import { GoogleGenAI, Type } from "@google/genai";
import { scoreChunks } from '../services/serverCommon';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1g8byFRR2crm5hddWDf8RYF3m4Ov9qTK4';
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const { query, mode = 'drive', topK = 6, localContext = [] } = req.body;

  if (!process.env.API_KEY) {
    return res.status(400).json({ error: 'MISSING_GEMINI_API_KEY' });
  }

  try {
    let contextChunks: any[] = [];

    // 1. 檢索雲端知識庫
    if (mode === 'drive' || mode === 'both') {
      const allDriveChunks: any[] = await kv.get(`drive_chunks_${FOLDER_ID}`) || [];
      const driveHits = scoreChunks(allDriveChunks, query).slice(0, Math.max(1, topK));
      contextChunks.push(...driveHits);
    }

    // 2. 檢索本地 Context (如果有)
    if (localContext.length > 0 && (mode === 'local' || mode === 'both')) {
       // 模擬本地文本分片
       localContext.forEach((doc: any) => {
          contextChunks.push({
             text: doc.content,
             fileName: `[本地上傳] ${doc.name}`,
             drivePath: 'local-sandbox',
             snippet: doc.content.substring(0, 100)
          });
       });
    }

    if (contextChunks.length === 0) {
      return res.status(404).json({ error: 'NO_RELEVANT_DATA', message: '在現有知識庫中找不到與查詢相關的法規內容。' });
    }

    const contextText = contextChunks.map((c, i) => `[ID:${i}] 來源:${c.fileName}\n內容:${c.text}`).join("\n\n---\n\n");

    // 3. 呼叫 Gemini 3 Pro
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        { 
          role: 'user', 
          parts: [{ text: `使用者問題： 「${query}」\n\n請根據以下法規參考內容進行精確回答。必須以 JSON 格式回覆。回答應包含 foodItem (受查品項), category (分類), summary (法規摘要說明), pesticides, heavyMetals, others (具體限值), 以及 sources (引用來源清單)。\n\n【參考內容】\n${contextText}` }]
        }
      ],
      config: {
        systemInstruction: "你是一位精通台灣食品安全與衛生法規的專家。回答必須完全基於提供的參考內容。請在 sources 中標註參考的檔名，並提供準確的引用片段 (snippet)。",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foodItem: { type: Type.STRING },
            category: { type: Type.STRING },
            summary: { type: Type.STRING },
            pesticides: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { item: { type: Type.STRING }, limit: { type: Type.STRING }, note: { type: Type.STRING } } } },
            heavyMetals: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { item: { type: Type.STRING }, limit: { type: Type.STRING }, note: { type: Type.STRING } } } },
            others: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { item: { type: Type.STRING }, limit: { type: Type.STRING }, note: { type: Type.STRING } } } },
            sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING }, snippet: { type: Type.STRING } } } },
          },
          required: ["foodItem", "category", "summary", "pesticides", "heavyMetals", "others", "sources"],
        }
      }
    });

    const result = JSON.parse(response.text);
    res.status(200).json({
       ...result,
       debug: {
          retrievedChunks: contextChunks.length,
          model: 'gemini-3-pro-preview'
       }
    });
  } catch (error: any) {
    const errorId = `ERR_QUERY_${Date.now()}`;
    console.error(errorId, error);
    res.status(500).json({ errorId, error: error.message });
  }
}
