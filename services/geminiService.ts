
import { GoogleGenAI, Type } from "@google/genai";
import { RegulationResult, LocalDoc, SearchSourceMode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
你是一位嚴謹的台灣食品法規專家。你的任務是從提供的「法規知識庫文段」中精準檢索資訊。

**核心規範 (SSoT):**
1. **僅限知識庫**: 你的回答必須 100% 來自提供的【在地知識庫內容】。
2. **區分來源**: 
   - 來源為 "drive" 時：代表透過雲端同步之 TFDA 正式法規。
   - 來源為 "local" 時：代表使用者在本地 Sandbox 上傳之測試文件。
   請在回答中清楚標註資訊來源性質。
3. **禁止補齊**: 如果知識庫中沒有特定的項目，請誠實回覆未找到法定標準。
4. **來源引用**: 每一筆檢驗條件都必須標註來源文件名稱。
`;

function getRelevantChunks(docs: LocalDoc[], query: string, limit: number = 15): string {
  const queryTerms = query.toLowerCase().split(/[\s,，、]+/).filter(t => t.length > 0);
  const allChunks: { content: string; source: string; name: string; score: number }[] = [];
  
  docs.forEach(doc => {
    const chunkSize = 1000;
    for (let i = 0; i < doc.content.length; i += chunkSize) {
      const chunkText = doc.content.substring(i, i + chunkSize);
      let score = 0;
      queryTerms.forEach(term => {
        if (chunkText.toLowerCase().includes(term)) score += 10;
        if (doc.name.toLowerCase().includes(term)) score += 5;
      });
      if (score > 0) {
        allChunks.push({ content: chunkText, source: doc.source, name: doc.name, score: score });
      }
    }
  });

  const topChunks = allChunks.sort((a, b) => b.score - a.score).slice(0, limit);
  if (topChunks.length === 0) return "【無匹配文段】";
  return topChunks.map(c => `[來源: ${c.source} | 文件: ${c.name}]\n內容: ${c.content}`).join('\n---\n');
}

export async function queryRegulation(
  foodQuery: string, 
  driveDocs: LocalDoc[] = [], 
  localTestDocs: LocalDoc[] = [],
  mode: SearchSourceMode = 'drive'
): Promise<RegulationResult> {
  // 前端 Gemini RAG 邏輯
  const targetDocs = mode === 'local' ? localTestDocs : (mode === 'drive' ? driveDocs : [...driveDocs, ...localTestDocs]);
  if (targetDocs.length === 0) throw new Error(`目前選擇的模式 (${mode}) 知識庫內容為空，請先上傳文件或同步 Google Drive。`);

  const relevantContext = getRelevantChunks(targetDocs, foodQuery);
  if (relevantContext === "【無匹配文段】") {
    throw new Error(`在目前知識庫中找不到與「${foodQuery}」相關的條文。`);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `使用者查詢： 「${foodQuery}」\n\n【檢索到的相關法規片段】\n${relevantContext}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
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
            sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING } } } },
          },
          required: ["foodItem", "category", "summary", "pesticides", "heavyMetals", "others", "sources"],
        },
      },
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini RAG Error:", error);
    throw error;
  }
}
