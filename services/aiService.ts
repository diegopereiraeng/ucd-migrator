// services/aiService.ts
// Unified AI service that supports multiple LLM providers

import { ParsedData } from '../types';
import { LLMProvider, ILLMService, LLMGenerateOptions } from './llmProvider';
import { geminiService } from './geminiServiceWrapper';
import { claudeService } from './claudeService';
import { stringifyParsedDataForPrompt, cleanYamlResponse } from './geminiService';

// Export all system instructions from both UCD and Jenkins
export * from './geminiService';

class AIService {
  private currentProvider: LLMProvider = 'gemini';
  private services: Record<LLMProvider, ILLMService> = {
    gemini: geminiService,
    claude: claudeService,
  };

  setProvider(provider: LLMProvider): void {
    this.currentProvider = provider;
  }

  getProvider(): LLMProvider {
    return this.currentProvider;
  }

  getProviderName(): string {
    return this.services[this.currentProvider].getName();
  }

  private async generate(options: LLMGenerateOptions): Promise<string> {
    const service = this.services[this.currentProvider];
    return await service.generateContent(options);
  }

  async generateSummary(parsedData: ParsedData, systemInstruction: string): Promise<string> {
    const userPrompt = `Here is the parsed data to analyze:\n\n${stringifyParsedDataForPrompt(parsedData)}\n\nPlease generate the migration guide now.`;
    
    return await this.generate({
      systemInstruction,
      userPrompt,
    });
  }

  async generateHarnessPipeline(parsedData: ParsedData, systemInstruction: string): Promise<string> {
    const userPrompt = `Parsed Process Details:\n---\n${stringifyParsedDataForPrompt(parsedData)}\n---\n\nGenerate the Harness Pipeline YAML now.`;
    
    const result = await this.generate({
      systemInstruction,
      userPrompt,
    });
    
    return cleanYamlResponse(result);
  }

  async generateEnrichedPipeline(baseYaml: string, parsedData: ParsedData, systemInstruction: string): Promise<string> {
    const userPrompt = `Here is the base Harness pipeline YAML (success path only):\n\`\`\`yaml\n${baseYaml}\n\`\`\`\n\nHere is the full parsed data, including the failure path:\n---\n${stringifyParsedDataForPrompt(parsedData)}\n---\n\nNow, update the YAML to include the failure handling logic.`;
    
    const result = await this.generate({
      systemInstruction,
      userPrompt,
    });
    
    return cleanYamlResponse(result);
  }

  async validateScripts(yaml: string, parsedData: ParsedData, systemInstruction: string): Promise<string> {
    const userPrompt = `Here is the Harness pipeline YAML to validate:\n\`\`\`yaml\n${yaml}\n\`\`\`\n\nHere is the full parsed data containing all original scripts:\n---\n${stringifyParsedDataForPrompt(parsedData)}\n---\n\nProvide your validation report now.`;
    
    return await this.generate({
      systemInstruction,
      userPrompt,
    });
  }

  async validateSchema(yaml: string, systemInstruction: string): Promise<string> {
    const userPrompt = `Here is the Harness pipeline YAML to validate:\n\`\`\`yaml\n${yaml}\n\`\`\`\n\nProvide your schema validation report now.`;
    
    return await this.generate({
      systemInstruction,
      userPrompt,
    });
  }

  async generateFromContext(
    context: { [key: string]: string },
    systemInstruction: string
  ): Promise<string> {
    let userPrompt = "Based on the following context data, please generate the required output according to the system instruction.\n\n";
    
    userPrompt += '### Context Data ###\n';
    userPrompt += '```json\n';
    userPrompt += JSON.stringify(context, null, 2);
    userPrompt += '\n```\n';
    
    const result = await this.generate({
      systemInstruction,
      userPrompt,
    });
    
    return cleanYamlResponse(result);
  }
}

// Export singleton instance
export const aiService = new AIService();

// For backward compatibility, export the same function names
export const generateSummary = (parsedData: ParsedData, systemInstruction: string) =>
  aiService.generateSummary(parsedData, systemInstruction);

export const generateHarnessPipeline = (parsedData: ParsedData, systemInstruction: string) =>
  aiService.generateHarnessPipeline(parsedData, systemInstruction);

export const generateEnrichedPipeline = (baseYaml: string, parsedData: ParsedData, systemInstruction: string) =>
  aiService.generateEnrichedPipeline(baseYaml, parsedData, systemInstruction);

export const validateScripts = (yaml: string, parsedData: ParsedData, systemInstruction: string) =>
  aiService.validateScripts(yaml, parsedData, systemInstruction);

export const validateSchema = (yaml: string, systemInstruction: string) =>
  aiService.validateSchema(yaml, systemInstruction);

export const generateFromContext = (context: { [key: string]: string }, systemInstruction: string) =>
  aiService.generateFromContext(context, systemInstruction);
