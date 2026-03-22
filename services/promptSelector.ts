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
import {
  GITHUB_ACTIONS_SUMMARY_SYSTEM_INSTRUCTION,
  GITHUB_ACTIONS_HARNESS_YAML_SYSTEM_INSTRUCTION,
  GITHUB_ACTIONS_ENRICH_YAML_SYSTEM_INSTRUCTION,
  GITHUB_ACTIONS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
  GITHUB_ACTIONS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
} from './githubActionsSystemInstructions';
import {
  AZURE_DEVOPS_SUMMARY_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_HARNESS_YAML_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_ENRICH_YAML_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_SPLIT_PIPELINE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_PIPELINE_SKELETON_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_CI_STAGE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_CD_STAGE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_PIPELINE_SYNTAX_VALIDATE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_CI_SYNTAX_VALIDATE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_CD_SYNTAX_VALIDATE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_MASTER_MERGE_SYSTEM_INSTRUCTION,
  AZURE_DEVOPS_FINAL_UNIFIED_VALIDATE_SYSTEM_INSTRUCTION,
} from './azureDevOpsSystemInstructions';

export interface SystemInstructions {
  summary: string;
  basePipeline: string;
  enrichPipeline: string;
  validateScripts: string;
  validateSchema: string;
  customGeneration: string;
  splitPipeline?: string;
  pipelineSkeleton?: string;
  ciStageGeneration?: string;
  cdStageGeneration?: string;
  validatePipelineSyntax?: string;
  validateCiSyntax?: string;
  validateCdSyntax?: string;
  masterMerge?: string;
  finalUnifiedValidate?: string;
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
        customGeneration: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
        splitPipeline: '',
        pipelineSkeleton: '',
        ciStageGeneration: '',
        cdStageGeneration: '',
        validatePipelineSyntax: '',
        validateCiSyntax: '',
        validateCdSyntax: '',
        masterMerge: '',
        finalUnifiedValidate: '',
      };
    case 'githubActions':
      return {
        summary: GITHUB_ACTIONS_SUMMARY_SYSTEM_INSTRUCTION,
        basePipeline: GITHUB_ACTIONS_HARNESS_YAML_SYSTEM_INSTRUCTION,
        enrichPipeline: GITHUB_ACTIONS_ENRICH_YAML_SYSTEM_INSTRUCTION,
        validateScripts: GITHUB_ACTIONS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
        validateSchema: GITHUB_ACTIONS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
        customGeneration: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
        splitPipeline: '',
        pipelineSkeleton: '',
        ciStageGeneration: '',
        cdStageGeneration: '',
        validatePipelineSyntax: '',
        validateCiSyntax: '',
        validateCdSyntax: '',
        masterMerge: '',
        finalUnifiedValidate: '',
      };
    case 'azureDevOps':
      return {
        summary: AZURE_DEVOPS_SUMMARY_SYSTEM_INSTRUCTION,
        basePipeline: AZURE_DEVOPS_HARNESS_YAML_SYSTEM_INSTRUCTION,
        enrichPipeline: AZURE_DEVOPS_ENRICH_YAML_SYSTEM_INSTRUCTION,
        validateScripts: AZURE_DEVOPS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
        validateSchema: AZURE_DEVOPS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
        customGeneration: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
        splitPipeline: AZURE_DEVOPS_SPLIT_PIPELINE_SYSTEM_INSTRUCTION,
        pipelineSkeleton: AZURE_DEVOPS_PIPELINE_SKELETON_SYSTEM_INSTRUCTION,
        ciStageGeneration: AZURE_DEVOPS_CI_STAGE_SYSTEM_INSTRUCTION,
        cdStageGeneration: AZURE_DEVOPS_CD_STAGE_SYSTEM_INSTRUCTION,
        validatePipelineSyntax: AZURE_DEVOPS_PIPELINE_SYNTAX_VALIDATE_SYSTEM_INSTRUCTION,
        validateCiSyntax: AZURE_DEVOPS_CI_SYNTAX_VALIDATE_SYSTEM_INSTRUCTION,
        validateCdSyntax: AZURE_DEVOPS_CD_SYNTAX_VALIDATE_SYSTEM_INSTRUCTION,
        masterMerge: AZURE_DEVOPS_MASTER_MERGE_SYSTEM_INSTRUCTION,
        finalUnifiedValidate: AZURE_DEVOPS_FINAL_UNIFIED_VALIDATE_SYSTEM_INSTRUCTION,
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
        splitPipeline: '',
        pipelineSkeleton: '',
        ciStageGeneration: '',
        cdStageGeneration: '',
        validatePipelineSyntax: '',
        validateCiSyntax: '',
        validateCdSyntax: '',
        masterMerge: '',
        finalUnifiedValidate: '',
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
    case 'githubActions':
      return 'Github Action Deploy';
    case 'azureDevOps':
      return 'Azure DevOps';
    case 'ucd':
      return 'UrbanCode Deploy';
    default:
      return 'Unknown';
  }
}
