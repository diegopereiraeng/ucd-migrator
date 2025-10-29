// services/parserService.ts
import { parseUCD } from './ucdParser';
import { parseJenkins } from './jenkinsParser';
import { parseYAML } from './yamlParser';
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
  yaml: {
    name: 'YAML Pipeline',
    parse: parseYAML,
  },
};

export const defaultParserKey = 'jenkins';
