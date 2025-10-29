// services/llmProvider.ts
// Abstract interface for LLM providers (Gemini, Claude, etc.)

export type LLMProvider = 'gemini' | 'claude' | 'openai';

export interface LLMGenerateOptions {
  systemInstruction: string;
  userPrompt: string;
  model?: string; // Optional model override
}

export interface ILLMService {
  generateContent(options: LLMGenerateOptions): Promise<string>;
  getName(): string;
  getDefaultModel(): string;
}

// Model configurations for each provider
export const LLM_MODELS = {
  gemini: {
    fast: 'gemini-2.5-flash',
    pro: 'gemini-2.5-pro',
  },
  claude: {
    fast: 'claude-3-5-haiku-20241022',    // For quick summaries
    pro: 'claude-sonnet-4-20250514',    // For detailed summaries (latest flagship model)
  },
  openai: {
    fast: 'gpt-4o-mini',
    pro: 'gpt-4o',
  },
} as const;

export const LLM_PROVIDER_NAMES: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  openai: 'OpenAI GPT-4',
};
