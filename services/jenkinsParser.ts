// services/jenkinsParser.ts
import { JenkinsBundle, ParsedData, ParsedProcess, ParsedStep } from '../types';
import { FileInput } from './parserService';

/**
 * Parses Jenkins bundle files and converts them into ParsedData format
 * The bundle includes: Jenkinsfile, config.xml, build.xml, and groovy scripts
 */
export const parseJenkins = (files: FileInput[]): ParsedData | null => {
  try {
    const bundle: JenkinsBundle = {
      groovyScripts: {},
      allFiles: []
    };

    // Categorize files based on their actual filenames and content
    files.forEach(({ fileName, content }) => {
      // Detect file type from actual filename and content
      const fileType = detectFileType(fileName, content);
      
      console.log(`Processing file: ${fileName}, Detected type: ${fileType}`); // Debug log

      bundle.allFiles.push({
        fileName,
        content,
        type: fileType
      });

      switch (fileType) {
        case 'jenkinsfile':
          bundle.jenkinsfile = content;
          break;
        case 'config.xml':
          bundle.configXml = content;
          break;
        case 'build.xml':
          bundle.buildXml = content;
          break;
        case 'groovy':
          bundle.groovyScripts[fileName] = content;
          break;
        case 'xml':
          // CAMBIO CLAVE: Si es un XML genérico y no parece un script de build,
          // asumimos que es la configuración del Job para evitar que el parser retorne null.
          if (!content.includes('<project name=') && !content.includes('build.xml')) {
             bundle.configXml = content;
          } else {
             bundle.buildXml = content;
          }
          break;
      }
    });

    // Validación final: Si no hemos asignado nada, el parser falla.
    if (!bundle.jenkinsfile && !bundle.configXml && Object.keys(bundle.groovyScripts).length === 0) {
      console.error('No valid Jenkins files found in bundle. Files received:', files.map(f => f.fileName));
      return null;
    }

    // Create a single "process" that represents the entire Jenkins pipeline
    const parsedProcess = parseJenkinsBundle(bundle);

    return {
      componentName: 'Jenkins Pipeline',
      processes: [parsedProcess]
    };
  } catch (error) {
    console.error('Error parsing Jenkins bundle:', error);
    return null;
  }
};

/**
 * Extracts filename from content or generates one
 */
const extractFileName = (content: string, index: number): string => {
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  
  if (firstLines.toLowerCase().includes('jenkinsfile')) {
    return 'Jenkinsfile';
  }
  if (firstLines.includes('config.xml') || content.includes('<project>') || content.includes('<flow-definition>')) {
    return 'config.xml';
  }
  if (firstLines.includes('build.xml') || content.includes('<project name=')) {
    return 'build.xml';
  }
  if (content.includes('def ') || content.includes('import ') || content.includes('class ')) {
    return `SharedLibrary_${index + 1}.groovy`;
  }
  
  return `file_${index + 1}`;
};

/**
 * Detects file type based on filename and content
 */
const detectFileType = (fileName: string, content: string): string => {
  const lowerFileName = fileName.toLowerCase();
  
  if (lowerFileName === 'jenkinsfile' || lowerFileName.includes('jenkinsfile')) {
    return 'jenkinsfile';
  }
  
  // Detección explícita de flow-definition (Pipeline Jobs)
  if (content.includes('<flow-definition>')) {
    return 'config.xml';
  }

  if (lowerFileName === 'config.xml') {
    return 'config.xml';
  }
  if (lowerFileName === 'build.xml') {
    return 'build.xml';
  }
  if (lowerFileName.endsWith('.groovy') || content.includes('def ') || content.includes('@NonCPS')) {
    return 'groovy';
  }
  
  // Detección genérica de XML
  if (content.trim().startsWith('<?xml') || content.includes('<project>') || content.endsWith('</flow-definition>')) {
    return 'xml';
  }
  
  return 'unknown';
};

/**
 * Parses the Jenkins bundle into a single ParsedProcess
 */
const parseJenkinsBundle = (bundle: JenkinsBundle): ParsedProcess => {
  const mainFlow: ParsedStep[] = [];
  const failureFlow: ParsedStep[] = [];

  if (bundle.jenkinsfile) {
    const jenkinsfileSteps = parseJenkinsfile(bundle.jenkinsfile);
    mainFlow.push(...jenkinsfileSteps);
  }

  if (bundle.configXml) {
    const configStep = parseConfigXml(bundle.configXml);
    mainFlow.push(configStep);
  }

  if (bundle.buildXml) {
    const buildStep = parseBuildXml(bundle.buildXml);
    mainFlow.push(buildStep);
  }

  Object.entries(bundle.groovyScripts).forEach(([fileName, content]) => {
    const groovyStep = parseGroovyScript(fileName, content);
    mainFlow.push(groovyStep);
  });

  const summaryStep: ParsedStep = {
    name: 'Bundle Summary',
    id: 'bundle_summary',
    type: 'plugin',
    details: 'Complete Jenkins Bundle Analysis',
    properties: {
      totalFiles: bundle.allFiles.length,
      hasJenkinsfile: !!bundle.jenkinsfile,
      hasConfigXml: !!bundle.configXml,
      hasBuildXml: !!bundle.buildXml,
      groovyScriptCount: Object.keys(bundle.groovyScripts).length,
      fileList: bundle.allFiles.map(f => `${f.fileName} (${f.type})`)
    },
    incomingPaths: []
  };
  mainFlow.unshift(summaryStep);

  return {
    name: 'Jenkins Pipeline Analysis',
    description: `Analysis of Jenkins bundle containing ${bundle.allFiles.length} file(s)`,
    mainFlow,
    failureFlow
  };
};

/**
 * Parses Jenkinsfile content
 */
const parseJenkinsfile = (content: string): ParsedStep[] => {
  const steps: ParsedStep[] = [];
  const stages = extractStages(content);
  const hasDeclarativePipeline = content.includes('pipeline {');
  const hasScriptedPipeline = content.includes('node(') || content.includes('node {');
  
  const jenkinsfileStep: ParsedStep = {
    name: 'Jenkinsfile',
    id: 'jenkinsfile',
    type: 'plugin',
    details: hasDeclarativePipeline ? 'Declarative Pipeline' : hasScriptedPipeline ? 'Scripted Pipeline' : 'Pipeline Definition',
    properties: {
      pipelineType: hasDeclarativePipeline ? 'Declarative' : hasScriptedPipeline ? 'Scripted' : 'Unknown',
      stagesFound: stages.length,
      stageNames: stages
    },
    scriptBody: content,
    incomingPaths: []
  };
  
  steps.push(jenkinsfileStep);
  return steps;
};

const extractStages = (content: string): string[] => {
  const stages: string[] = [];
  const stageRegex = /stage\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = stageRegex.exec(content)) !== null) {
    stages.push(match[1]);
  }
  return stages;
};

/**
 * Parses config.xml content
 */
const parseConfigXml = (content: string): ParsedStep => {
  const isPipeline = content.includes('<flow-definition>');
  
  return {
    name: 'Job Configuration (config.xml)',
    id: 'config_xml',
    type: 'plugin',
    details: isPipeline ? 'Jenkins Pipeline Job Configuration' : 'Jenkins Job Configuration XML',
    properties: {
      jobType: isPipeline ? 'Pipeline' : 'Freestyle/Other',
      hasBuilders: content.includes('<builders>'),
      hasPublishers: content.includes('<publishers>'),
      hasTriggers: content.includes('<triggers>'),
      hasScm: content.includes('<scm'),
      hasParameters: content.includes('ParametersDefinitionProperty'),
      contentLength: content.length
    },
    incomingPaths: []
  };
};

const parseBuildXml = (content: string): ParsedStep => {
  const targets = extractAntTargets(content);
  return {
    name: 'Build Configuration (build.xml)',
    id: 'build_xml',
    type: 'plugin',
    details: 'Ant Build Configuration',
    properties: {
      targetsFound: targets.length,
      targetNames: targets,
      contentLength: content.length
    },
    incomingPaths: []
  };
};

const extractAntTargets = (content: string): string[] => {
  const targets: string[] = [];
  const targetRegex = /<target\s+name="([^"]+)"/g;
  let match;
  while ((match = targetRegex.exec(content)) !== null) {
    targets.push(match[1]);
  }
  return targets;
};

const parseGroovyScript = (fileName: string, content: string): ParsedStep => {
  const functions = extractGroovyFunctions(content);
  const hasSharedLibrary = content.includes('@Library') || content.includes('import ');
  
  return {
    name: `Shared Library: ${fileName}`,
    id: `groovy_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
    type: 'plugin',
    details: hasSharedLibrary ? 'Jenkins Shared Library Script' : 'Groovy Script',
    properties: {
      fileName,
      functionsFound: functions.length,
      functionNames: functions,
      hasSharedLibraryAnnotation: content.includes('@Library'),
      hasNonCPS: content.includes('@NonCPS'),
      contentLength: content.length
    },
    scriptBody: content,
    incomingPaths: []
  };
};

const extractGroovyFunctions = (content: string): string[] => {
  const functions: string[] = [];
  const functionRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  return functions;
};