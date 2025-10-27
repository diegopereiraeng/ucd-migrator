// services/geminiServiceWrapper.ts
import { GoogleGenAI } from "@google/genai";
import { ILLMService, LLMGenerateOptions, LLM_MODELS } from './llmProvider';

export class GeminiService implements ILLMService {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (this.client) {
      return this.client;
    }
    
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file.');
    }

    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  getName(): string {
    return 'Google Gemini';
  }

  getDefaultModel(): string {
    return LLM_MODELS.gemini.pro;
  }

  async generateContent(options: LLMGenerateOptions): Promise<string> {
    const { systemInstruction, userPrompt, model } = options;
    const fullPrompt = `${systemInstruction}\n\n${userPrompt}`;
    
    try {
      const client = this.getClient();
      const response = await client.models.generateContent({
        model: model || this.getDefaultModel(),
        contents: fullPrompt,
      });
      
      return response.text;
    } catch (error) {
      this.handleApiError(error, 'generate content with Gemini');
    }
  }

  private handleApiError(error: unknown, context: string): never {
    console.error(`Error during ${context}:`, error);
    let message = `Could not ${context}.`;
    
    if (error instanceof Error) {
      if (error.message.includes('API key not valid')) {
        message = 'The Gemini API key is invalid or missing. Please ensure it is configured correctly.';
      } else if (error.message.includes('fetch-failed')) {
        message += ' A network error occurred. Please check your connection.';
      } else if (error.message.includes('PERMISSION_DENIED')) {
        message = 'Gemini API access denied. Please check your API key permissions and ensure billing is enabled.';
      } else {
        message += ` Reason: ${error.message}`;
      }
    } else {
      message += ' An unknown error occurred.';
    }
    
    throw new Error(message);
  }
}

export const geminiService = new GeminiService();
