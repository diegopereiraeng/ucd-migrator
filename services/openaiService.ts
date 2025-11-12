// services/openaiService.ts
import OpenAI from 'openai';
import { ILLMService, LLMGenerateOptions, LLM_MODELS } from './llmProvider';

export class OpenAIService implements ILLMService {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) {
      return this.client;
    }
    
    const apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      throw new Error('OpenAI API key is not configured. Please add OPENAI_API_KEY to your .env file.');
    }

    this.client = new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true 
    });
    return this.client;
  }

  getName(): string {
    return 'OpenAI GPT-4';
  }

  getDefaultModel(): string {
    return LLM_MODELS.openai.pro;
  }

  async generateContent(options: LLMGenerateOptions): Promise<string> {
    const { systemInstruction, userPrompt, model } = options;
    
    try {
      const client = this.getClient();
      
      const response = await client.chat.completions.create({
        model: model || this.getDefaultModel(),
        messages: [
          {
            role: 'system',
            content: systemInstruction,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 1,
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      return content;
    } catch (error) {
      this.handleApiError(error, 'generate content with OpenAI');
    }
  }

  private handleApiError(error: unknown, context: string): never {
    console.error(`Error during ${context}:`, error);
    let message = `Could not ${context}.`;
    
    if (error instanceof Error) {
      if (error.message.includes('api_key') || error.message.includes('Incorrect API key')) {
        message = 'The OpenAI API key is invalid or missing. Please ensure it is configured correctly in your .env file.';
      } else if (error.message.includes('rate_limit') || error.message.includes('Rate limit')) {
        message += ' Rate limit exceeded. Please try again later.';
      } else if (error.message.includes('insufficient_quota')) {
        message += ' Your OpenAI account has insufficient quota. Please check your billing details.';
      } else if (error.message.includes('model_not_found')) {
        message += ' The requested model is not available. Please check your OpenAI account access.';
      } else {
        message += ` Reason: ${error.message}`;
      }
    } else {
      message += ' An unknown error occurred.';
    }
    
    throw new Error(message);
  }
}

export const openaiService = new OpenAIService();
