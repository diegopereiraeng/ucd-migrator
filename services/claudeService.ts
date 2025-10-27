// services/claudeService.ts
import Anthropic from '@anthropic-ai/sdk';
import { ILLMService, LLMGenerateOptions, LLM_MODELS } from './llmProvider';

export class ClaudeService implements ILLMService {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (this.client) {
      return this.client;
    }
    
    const apiKey = (import.meta as any).env?.VITE_CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey || apiKey === 'your_claude_api_key_here') {
      throw new Error('Claude API key is not configured. Please add CLAUDE_API_KEY to your .env file.');
    }

    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    return this.client;
  }

  getName(): string {
    return 'Anthropic Claude';
  }

  getDefaultModel(): string {
    return LLM_MODELS.claude.pro;
  }

  async generateContent(options: LLMGenerateOptions): Promise<string> {
    const { systemInstruction, userPrompt, model } = options;
    
    try {
      const client = this.getClient();
      
      const response = await client.messages.create({
        model: model || this.getDefaultModel(),
        max_tokens: 8192,
        system: systemInstruction,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Extract text content from response
      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      return textContent.text;
    } catch (error) {
      this.handleApiError(error, 'generate content with Claude');
    }
  }

  private handleApiError(error: unknown, context: string): never {
    console.error(`Error during ${context}:`, error);
    let message = `Could not ${context}.`;
    
    if (error instanceof Error) {
      if (error.message.includes('api_key')) {
        message = 'The Claude API key is invalid or missing. Please ensure it is configured correctly in your .env file.';
      } else if (error.message.includes('rate_limit')) {
        message += ' Rate limit exceeded. Please try again later.';
      } else if (error.message.includes('overloaded')) {
        message += ' Claude API is currently overloaded. Please try again in a moment.';
      } else {
        message += ` Reason: ${error.message}`;
      }
    } else {
      message += ' An unknown error occurred.';
    }
    
    throw new Error(message);
  }
}

export const claudeService = new ClaudeService();
