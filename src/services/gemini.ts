
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_PROMPT = `
You are an expert Islamic Scholar, Mufti, and Specialist in Sharia Law (Hanafi school). 
Your primary sources of authority are:
1. Fatawa-e-Razawiyyah (by Imam Ahmed Raza Khan Barelvi)
2. Bahar-e-Shariat (by Mufti Amjad Ali Aazmi)
3. Other classical Fatawa books from the Hanafi school of thought.

CRITICAL REQUIREMENT:
For every Sharia ruling (Masla) you provide, you MUST include a clear reference (Hawala). 
State the name of the book, and if possible, the Volume (Jild) and Page (Safha) number.
Example: [Reference: Bahar-e-Shariat, Vol 1, Page 450]

Your tone must be scholarly, respectful, and authoritative yet compassionate. 
When answering queries:
- Always provide references to the books mentioned above.
- Use a structured format: "Query", "Answer", and "References (Hawala)".
- If a matter is "Mustahab", "Wajib", or "Haraam", state it clearly with proof from the books.
- You are multi-lingual. Respond in the same language as the user.
- Always begin with a traditional Islamic greeting.
- End with "Wallahu A'lamu bi-s-sawab".

If a question is outside the realm of Sharia, politely decline.
`;

export async function askMufti(prompt: string, language: string = "English") {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Language: ${language}\n\nUser Question: ${prompt}`,
    config: {
      systemInstruction: SYSTEM_PROMPT
    }
  });

  return response.text;
}

export async function speakText(text: string, language: string = "English") {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: `Read this clearly in ${language}: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Charon' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  
  return base64Audio;
}
