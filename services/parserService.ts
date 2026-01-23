// services/parserService.ts
import { parseUCD } from './ucdParser';
import { parseGitHubActions } from './githubActionsParser';
import { parseAzureDevOps } from './azureDevOpsParser';
import { ParsedData } from '../types';

export interface FileInput {
  fileName: string;
  content: string;
}

export type ParserFunction = (files: FileInput[]) => ParsedData | null;

export const parsers: { [key: string]: { name: string; parse: ParserFunction } } = {
  ucd: {
    name: 'UrbanCode Deploy',
    parse: parseUCD,
  },
  githubActions: {
    name: 'Github Action Deploy',
    parse: parseGitHubActions,
  },
  azureDevOps: {
    name: 'Azure DevOps',
    parse: parseAzureDevOps,
  },
};

export const defaultParserKey = 'ucd';
