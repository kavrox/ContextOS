import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
  try {
    const response = await ai.models.list();
    for await (const model of response) {
      if (model.name.includes('gemini-1.5') || model.name.includes('gemini-2.0')) {
        console.log(model.name);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
main();
