// services/promptSelector.ts
// Utility to select appropriate system instructions based on parser type

import {
  DEFAULT_SUMMARY_SYSTEM_INSTRUCTION,
  DEFAULT_HARNESS_YAML_SYSTEM_INSTRUCTION,
  ENRICH_YAML_SYSTEM_INSTRUCTION,
  VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
  VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
  DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
  JENKINS_SUMMARY_SYSTEM_INSTRUCTION,
  JENKINS_HARNESS_YAML_SYSTEM_INSTRUCTION,
  JENKINS_ENRICH_YAML_SYSTEM_INSTRUCTION,
  JENKINS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
  JENKINS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
} from './aiService';

export interface SystemInstructions {
  summary: string;
  basePipeline: string;
  enrichPipeline: string;
  validateScripts: string;
  validateSchema: string;
  customGeneration: string;
}

/**
 * Get the appropriate system instructions based on the parser type
 */
export function getSystemInstructions(parserType: string): SystemInstructions {
  switch (parserType) {
    case 'jenkins':
      return {
        summary: JENKINS_SUMMARY_SYSTEM_INSTRUCTION,
        basePipeline: JENKINS_HARNESS_YAML_SYSTEM_INSTRUCTION,
        enrichPipeline: JENKINS_ENRICH_YAML_SYSTEM_INSTRUCTION,
        validateScripts: JENKINS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
        validateSchema: JENKINS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
        customGeneration: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION, // Can be used for both
      };
    case 'ucd':
    default:
      return {
        summary: DEFAULT_SUMMARY_SYSTEM_INSTRUCTION,
        basePipeline: DEFAULT_HARNESS_YAML_SYSTEM_INSTRUCTION,
        enrichPipeline: ENRICH_YAML_SYSTEM_INSTRUCTION,
        validateScripts: VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
        validateSchema: VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
        customGeneration: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
      };
  }
}

/**
 * Get a human-readable name for the parser type
 */
export function getParserDisplayName(parserType: string): string {
  switch (parserType) {
    case 'jenkins':
      return 'Jenkins';
    case 'ucd':
      return 'UrbanCode Deploy';
    default:
      return 'Unknown';
  }
}
