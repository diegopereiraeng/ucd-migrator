// services/parserService.ts
import { parseUCD } from './ucdParser';
import { parseJenkins } from './jenkinsParser';
import { ParsedData } from '../types';

export type ParserFunction = (jsonContents: string[]) => ParsedData | null;

export const parsers: { [key: string]: { name: string; parse: ParserFunction } } = {
  ucd: {
    name: 'UrbanCode Deploy',
    parse: parseUCD,
  },
  jenkins: {
    name: 'Jenkins Deploy',
    parse: parseJenkins,
  },
};

export const defaultParserKey = 'jenkins';
