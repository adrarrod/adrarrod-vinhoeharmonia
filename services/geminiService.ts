import { GoogleGenAI, Type } from "@google/genai";
import { Wine } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const wineSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.NUMBER },
    name: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['Tinto', 'Branco', 'Rosé', 'Espumante'] },
    region: { type: Type.STRING },
    price: { type: Type.NUMBER },
    imageUrl: { type: Type.STRING },
    description: { type: Type.STRING, description: "A nova descrição personalizada para o vinho, explicando por que ele atende ao pedido do cliente." },
  },
  required: ['id', 'name', 'type', 'region', 'price', 'imageUrl', 'description']
};


export async function getWineRecommendations(
  userPrompt: string,
  userName: string,
  allWines: Omit<Wine, 'description'>[]
): Promise<Wine[]> {
  const prompt = `Você é um sommelier especialista chamado HarmonIA. O cliente, ${userName}, pediu o seguinte: "${userPrompt}". 
  Baseado neste pedido, analise a lista de vinhos a seguir: ${JSON.stringify(allWines)}.
  Selecione os 3 vinhos que melhor se adequam ao pedido. Para cada um dos 3 vinhos, crie uma descrição personalizada e atraente em português do Brasil, explicando por que é uma boa escolha para ${userName}.
  Responda APENAS com o JSON.`;

  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: wineSchema,
        },
      },
    });
    
    let jsonText = '';
    for await (const chunk of stream) {
      jsonText += chunk.text;
    }
    
    const recommendedWines = JSON.parse(jsonText.trim());
    
    if (Array.isArray(recommendedWines) && recommendedWines.length > 0) {
      return recommendedWines;
    }
    return [];

  } catch (error) {
    console.error("Error getting wine recommendations:", error);
    return [];
  }
}