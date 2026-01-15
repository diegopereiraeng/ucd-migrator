// services/llmProvider.ts
// Abstract interface for LLM providers (Gemini, Claude, etc.)

export type LLMProvider = 'gemini' | 'claude' | 'openai' | 'copilot';

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
    fast: 'claude-opus-4-20250514',    // For quick summaries
    pro: 'claude-opus-4-5-20251101',    // For detailed summaries (latest flagship model)
  },
  openai: {
    fast: 'gpt-5-mini',
    pro: 'gpt-5-mini',
  },
  copilot: {
    fast: 'copilot-chat',
    pro: 'copilot-chat',
  },
} as const;

export const LLM_PROVIDER_NAMES: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  openai: 'OpenAI GPT-4',
  copilot: 'GitHub Copilot',
};
