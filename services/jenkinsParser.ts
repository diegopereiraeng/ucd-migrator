// services/jenkinsParser.ts
import { JenkinsBundle, ParsedData, ParsedProcess, ParsedStep } from '../types';

/**
 * Parses Jenkins bundle files and converts them into ParsedData format
 * The bundle includes: Jenkinsfile, config.xml, build.xml, and groovy scripts
 */
export const parseJenkins = (fileContents: string[]): ParsedData | null => {
  try {
    const bundle: JenkinsBundle = {
      groovyScripts: {},
      allFiles: []
    };

    // Categorize files based on their content and names
    fileContents.forEach((content, index) => {
      // Try to detect file type from content
      const fileName = extractFileName(content, index);
      const fileType = detectFileType(fileName, content);

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
      }
    });

    if (!bundle.jenkinsfile && !bundle.configXml && Object.keys(bundle.groovyScripts).length === 0) {
      console.error('No valid Jenkins files found in bundle');
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
  // Try to find filename in first comment or metadata
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  
  if (firstLines.toLowerCase().includes('jenkinsfile')) {
    return 'Jenkinsfile';
  }
  if (firstLines.includes('config.xml') || content.includes('<project>')) {
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
  if (lowerFileName === 'config.xml') {
    return 'config.xml';
  }
  if (lowerFileName === 'build.xml') {
    return 'build.xml';
  }
  if (lowerFileName.endsWith('.groovy') || content.includes('def ') || content.includes('@NonCPS')) {
    return 'groovy';
  }
  if (content.trim().startsWith('<?xml') || content.includes('<project>')) {
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

  // Add Jenkinsfile analysis as main steps
  if (bundle.jenkinsfile) {
    const jenkinsfileSteps = parseJenkinsfile(bundle.jenkinsfile);
    mainFlow.push(...jenkinsfileSteps);
  }

  // Add config.xml analysis
  if (bundle.configXml) {
    const configStep = parseConfigXml(bundle.configXml);
    mainFlow.push(configStep);
  }

  // Add build.xml analysis
  if (bundle.buildXml) {
    const buildStep = parseBuildXml(bundle.buildXml);
    mainFlow.push(buildStep);
  }

  // Add groovy scripts analysis
  Object.entries(bundle.groovyScripts).forEach(([fileName, content]) => {
    const groovyStep = parseGroovyScript(fileName, content);
    mainFlow.push(groovyStep);
  });

  // Add a summary step with all file information
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
  
  // Extract pipeline structure
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
    // Keep Jenkinsfile content as it's the main pipeline definition needed for migration
    scriptBody: content,
    incomingPaths: []
  };
  
  steps.push(jenkinsfileStep);
  return steps;
};

/**
 * Extracts stage names from Jenkinsfile
 */
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
  return {
    name: 'Job Configuration (config.xml)',
    id: 'config_xml',
    type: 'plugin',
    details: 'Jenkins Job Configuration XML',
    properties: {
      hasBuilders: content.includes('<builders>'),
      hasPublishers: content.includes('<publishers>'),
      hasTriggers: content.includes('<triggers>'),
      hasScm: content.includes('<scm'),
      contentLength: content.length  // Track size without storing full content
    },
    // Remove scriptBody to reduce token usage - XML config is often very large
    // Full content is available in bundle summary if needed
    incomingPaths: []
  };
};

/**
 * Parses build.xml content
 */
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
      contentLength: content.length  // Track size without storing full content
    },
    // Remove scriptBody to reduce token usage - XML is often very large
    // Full content is available in bundle summary if needed
    incomingPaths: []
  };
};

/**
 * Extracts Ant target names from build.xml
 */
const extractAntTargets = (content: string): string[] => {
  const targets: string[] = [];
  const targetRegex = /<target\s+name="([^"]+)"/g;
  let match;
  
  while ((match = targetRegex.exec(content)) !== null) {
    targets.push(match[1]);
  }
  
  return targets;
};

/**
 * Parses groovy script content
 */
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
    // Keep Groovy scripts as they contain actual logic needed for migration
    // These are typically smaller than XML files and contain executable code
    scriptBody: content,
    incomingPaths: []
  };
};

/**
 * Extracts function names from groovy script
 */
const extractGroovyFunctions = (content: string): string[] => {
  const functions: string[] = [];
  const functionRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match;
  
  while ((match = functionRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  return functions;
};
