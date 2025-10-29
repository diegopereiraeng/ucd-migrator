// services/yamlParser.ts
import yaml from 'js-yaml';
import { ParsedData, ParsedProcess, ParsedStep } from '../types';

export function parseYAML(contents: string[]): ParsedData {
  const processes: ParsedProcess[] = [];
  let componentName = 'YAML Pipeline';

  contents.forEach((content, index) => {
    try {
      // Parse YAML content
      const yamlData: any = yaml.load(content);
      
      // Try to extract pipeline name from YAML if available
      const pipelineName = yamlData?.pipeline?.name || 
                          yamlData?.name || 
                          `YAML Pipeline ${index + 1}`;
      
      if (index === 0 && yamlData?.pipeline?.name) {
        componentName = yamlData.pipeline.name;
      }
      
      // Create a ParsedStep with the YAML content
      const yamlStep: ParsedStep = {
        name: 'YAML Content',
        id: `yaml-${index + 1}`,
        type: 'plugin',
        details: `Uploaded YAML pipeline content\n\n\`\`\`yaml\n${content}\n\`\`\``,
        properties: {
          rawYaml: content,
          parsedData: yamlData
        },
        incomingPaths: []
      };
      
      // Create a process from the YAML content
      const process: ParsedProcess = {
        name: pipelineName,
        description: 'Uploaded YAML pipeline',
        mainFlow: [yamlStep],
        failureFlow: []
      };
      
      processes.push(process);
    } catch (error) {
      console.error(`Failed to parse YAML file ${index + 1}:`, error);
      // Still create a process with the raw content
      const errorStep: ParsedStep = {
        name: 'Raw YAML Content (Parse Error)',
        id: `yaml-error-${index + 1}`,
        type: 'plugin',
        details: `YAML content (failed to parse)\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\n\`\`\`yaml\n${content}\n\`\`\``,
        properties: {
          rawYaml: content,
          parseError: error instanceof Error ? error.message : 'Unknown error'
        },
        incomingPaths: []
      };
      
      processes.push({
        name: `YAML File ${index + 1} (Parse Error)`,
        description: 'YAML content with parse error',
        mainFlow: [errorStep],
        failureFlow: []
      });
    }
  });

  return { 
    componentName,
    processes 
  };
}
