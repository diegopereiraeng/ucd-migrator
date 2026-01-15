// services/copilotService.ts
import { ILLMService, LLMGenerateOptions, LLM_MODELS } from './llmProvider';

export class CopilotService implements ILLMService {
  private apiKey: string | null = null;
  private apiEndpoint: string = 'https://api.githubcopilot.com/v1/chat/completions'; // Default endpoint

  private getApiKey(): string {
    if (this.apiKey) {
      return this.apiKey;
    }
    
    const apiKey = (import.meta as any).env?.VITE_COPILOT_API_KEY || process.env.COPILOT_API_KEY;
    if (!apiKey || apiKey === 'your_copilot_api_key_here') {
      throw new Error('Copilot API key is not configured. Please add COPILOT_API_KEY to your .env file.');
    }

    this.apiKey = apiKey;
    return this.apiKey;
  }

  private getApiEndpoint(): string {
    return (import.meta as any).env?.VITE_COPILOT_API_ENDPOINT || process.env.COPILOT_API_ENDPOINT || this.apiEndpoint;
  }

  getName(): string {
    return 'GitHub Copilot';
  }

  getDefaultModel(): string {
    return LLM_MODELS.copilot.pro;
  }

  async generateContent(options: LLMGenerateOptions): Promise<string> {
    const { systemInstruction, userPrompt, model } = options;
    
    try {
      const apiKey = this.getApiKey();
      const endpoint = this.getApiEndpoint();
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
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
          max_tokens: 8192,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || 
          `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in Copilot response');
      }

      return content;
    } catch (error) {
      this.handleApiError(error, 'generate content with Copilot');
    }
  }

  private handleApiError(error: unknown, context: string): never {
    console.error(`Error during ${context}:`, error);
    let message = `Could not ${context}.`;
    
    if (error instanceof Error) {
      if (error.message.includes('api_key') || error.message.includes('API key') || error.message.includes('401')) {
        message = 'The Copilot API key is invalid or missing. Please ensure it is configured correctly in your .env file.';
      } else if (error.message.includes('rate_limit') || error.message.includes('Rate limit') || error.message.includes('429')) {
        message += ' Rate limit exceeded. Please try again later.';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        message += ' Access forbidden. Please check your API key permissions.';
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        message += ' API endpoint not found. Please check your COPILOT_API_ENDPOINT configuration.';
      } else {
        message += ` Reason: ${error.message}`;
      }
    } else {
      message += ' An unknown error occurred.';
    }
    
    throw new Error(message);
  }
}

export const copilotService = new CopilotService();

