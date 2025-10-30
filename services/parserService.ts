// services/parserService.ts
import { parseUCD } from './ucdParser';
import { parseJenkins } from './jenkinsParser';
import { parseGitHubActions } from './githubActionsParser';
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
  jenkins: {
    name: 'Jenkins Deploy',
    parse: parseJenkins,
  },
  githubActions: {
    name: 'Github Action Deploy',
    parse: parseGitHubActions,
  },
};

export const defaultParserKey = 'jenkins';
