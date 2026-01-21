// services/azureDevOpsParser.ts
import { AzureDevOpsBundle, ParsedData, ParsedProcess, ParsedStep, AzureDevOpsPipeline, AzureDevOpsJob, AzureDevOpsStage } from '../types';
import { FileInput } from './parserService';
import * as yaml from 'js-yaml';

/**
 * Parses Azure DevOps pipeline files and converts them into ParsedData format
 * The bundle includes: pipeline YAML files, template files, and variable groups
 */
export const parseAzureDevOps = (files: FileInput[]): ParsedData | null => {
  try {
    const bundle: AzureDevOpsBundle = {
      pipelines: {},
      templates: {},
      allFiles: []
    };

    // Categorize files based on their actual filenames and content
    files.forEach(({ fileName, content }) => {
      const fileType = detectFileType(fileName, content);

      bundle.allFiles.push({
        fileName,
        content,
        type: fileType
      });

      switch (fileType) {
        case 'pipeline':
          bundle.pipelines[fileName] = content;
          break;
        case 'template':
          bundle.templates[fileName] = content;
          break;
        case 'variable-group':
          if (!bundle.variableGroups) {
            bundle.variableGroups = {};
          }
          bundle.variableGroups[fileName] = content;
          break;
      }
    });

    if (Object.keys(bundle.pipelines).length === 0 && 
        Object.keys(bundle.templates).length === 0) {
      console.error('No valid Azure DevOps files found in bundle');
      return null;
    }

    // Create processes for each pipeline
    const processes: ParsedProcess[] = [];
    
    // Parse pipelines
    Object.entries(bundle.pipelines).forEach(([fileName, content]) => {
      const process = parsePipelineFile(fileName, content);
      if (process) {
        processes.push(process);
      }
    });

    // Parse templates
    Object.entries(bundle.templates).forEach(([fileName, content]) => {
      const process = parseTemplateFile(fileName, content);
      if (process) {
        processes.push(process);
      }
    });

    // Add a summary process with all file information
    const summaryProcess = createSummaryProcess(bundle);
    processes.unshift(summaryProcess);

    return {
      componentName: 'Azure DevOps Pipeline',
      processes
    };
  } catch (error) {
    console.error('Error parsing Azure DevOps bundle:', error);
    return null;
  }
};

/**
 * Detects file type based on filename and content
 */
const detectFileType = (fileName: string, content: string): string => {
  try {
    const lowerFileName = fileName.toLowerCase();
    const isYamlFile = lowerFileName.endsWith('.yml') || lowerFileName.endsWith('.yaml');
    const nameIndicatesTemplate = lowerFileName.includes('template');
    const nameIndicatesVariableGroup =
      lowerFileName.includes('variable-group') || lowerFileName.includes('variable');

    // Try to parse as YAML to check structure
    const parsed = yaml.load(content) as any;

    if (parsed && typeof parsed === 'object') {
      const hasStages = !!parsed.stages;
      const hasJobs = !!parsed.jobs;
      const hasSteps = !!parsed.steps;
      const hasTriggers = !!parsed.trigger || !!parsed.pr || !!parsed.schedules;
      const hasResources = !!parsed.resources;
      const hasExtends = !!parsed.extends;
      const hasPool = !!parsed.pool;
      const hasParameters = !!parsed.parameters;
      const hasTemplateRef = !!parsed.template;

      const hasPipelineSignals =
        hasTriggers || hasResources || hasExtends || hasPool;

      if (hasPipelineSignals) {
        return 'pipeline';
      }

      if ((hasTemplateRef || hasParameters) && (hasStages || hasJobs || hasSteps)) {
        return 'template';
      }

      if (hasStages || hasJobs || hasSteps) {
        return nameIndicatesTemplate ? 'template' : 'pipeline';
      }

      if (parsed.variables) {
        return 'variable-group';
      }
    }

    if (nameIndicatesTemplate) {
      return 'template';
    }

    if (nameIndicatesVariableGroup) {
      return 'variable-group';
    }

    // Default to pipeline for YAML files
    if (isYamlFile) {
      return 'pipeline';
    }

    return 'unknown';
  } catch (error) {
    console.error('Error detecting file type:', error);
    return 'unknown';
  }
};

/**
 * Parses an Azure DevOps pipeline file
 */
const parsePipelineFile = (fileName: string, content: string): ParsedProcess | null => {
  try {
    const pipeline: AzureDevOpsPipeline = yaml.load(content) as AzureDevOpsPipeline;
    const mainFlow: ParsedStep[] = [];

    // Add pipeline-level information - store full YAML only here
    const pipelineStep: ParsedStep = {
      name: `Pipeline: ${pipeline.name || fileName}`,
      id: `pipeline_${sanitizeId(fileName)}`,
      type: 'plugin',
      details: 'Azure DevOps Pipeline',
      properties: {
        fileName,
        pipelineName: pipeline.name,
        triggers: extractTriggers(pipeline.trigger),
        prTriggers: extractTriggers(pipeline.pr),
        schedules: pipeline.schedules || [],
        variables: pipeline.variables || {},
        resources: pipeline.resources,
        parameters: pipeline.parameters,
        stageCount: pipeline.stages?.length || 0
      },
      scriptBody: content,  // Full YAML stored ONLY here
      incomingPaths: []
    };
    mainFlow.push(pipelineStep);

    // Parse each stage - don't duplicate full content
    if (pipeline.stages && pipeline.stages.length > 0) {
      pipeline.stages.forEach((stage, index) => {
        const stageSteps = parseStage(`stage_${index}`, stage);
        mainFlow.push(...stageSteps);
      });
    } else if ((pipeline as any).jobs) {
      // Handle pipelines without stages (jobs directly at root)
      const jobs = (pipeline as any).jobs;
      if (Array.isArray(jobs)) {
        jobs.forEach((job: AzureDevOpsJob, index: number) => {
          const jobSteps = parseJob(`root_job_${index}`, job);
          mainFlow.push(...jobSteps);
        });
      } else if (typeof jobs === 'object') {
        Object.entries(jobs).forEach(([jobId, job]) => {
          const jobSteps = parseJob(jobId, job as AzureDevOpsJob);
          mainFlow.push(...jobSteps);
        });
      }
    }

    return {
      name: pipeline.name || fileName,
      description: `Azure DevOps pipeline from ${fileName}`,
      mainFlow,
      failureFlow: []
    };
  } catch (error) {
    console.error(`Error parsing pipeline file ${fileName}:`, error);
    return null;
  }
};

/**
 * Parses an Azure DevOps stage
 */
const parseStage = (stageId: string, stage: AzureDevOpsStage): ParsedStep[] => {
  const steps: ParsedStep[] = [];

  // Add stage-level information
  const stageStep: ParsedStep = {
    name: `Stage: ${stage.displayName || stage.stage || stageId}`,
    id: `stage_${sanitizeId(stage.stage || stageId)}`,
    type: 'plugin',
    details: `Azure DevOps Stage (pool: ${stage.pool?.vmImage || stage.pool?.name || 'default'})`,
    properties: {
      stageId: stage.stage,
      displayName: stage.displayName,
      dependsOn: stage.dependsOn,
      condition: stage.condition,
      variables: stage.variables || {},
      pool: stage.pool,
      jobCount: stage.jobs?.length || 0
    },
    // No scriptBody here to avoid token duplication
    incomingPaths: []
  };
  steps.push(stageStep);

  // Parse each job in the stage
  if (stage.jobs) {
    stage.jobs.forEach((job, index) => {
      const jobSteps = parseJob(`${stageId}_job_${index}`, job);
      steps.push(...jobSteps);
    });
  }

  return steps;
};

/**
 * Parses an Azure DevOps job
 */
const parseJob = (jobId: string, job: AzureDevOpsJob): ParsedStep[] => {
  const steps: ParsedStep[] = [];

  // Add job-level information
  const jobStep: ParsedStep = {
    name: `Job: ${job.displayName || job.job || jobId}`,
    id: `job_${sanitizeId(job.job || jobId)}`,
    type: 'plugin',
    details: `Azure DevOps Job (pool: ${job.pool?.vmImage || job.pool?.name || 'default'})`,
    properties: {
      jobId: job.job,
      displayName: job.displayName,
      dependsOn: job.dependsOn,
      condition: job.condition,
      pool: job.pool,
      strategy: job.strategy,
      variables: job.variables || {},
      timeoutInMinutes: job.timeoutInMinutes,
      stepCount: job.steps?.length || 0
    },
    // No scriptBody here to avoid token duplication
    incomingPaths: []
  };
  steps.push(jobStep);

  // Parse each step in the job
  if (job.steps) {
    job.steps.forEach((step, index) => {
      const stepData = parseStep(jobId, step, index);
      steps.push(stepData);
    });
  }

  return steps;
};

/**
 * Parses an Azure DevOps step
 */
const parseStep = (jobId: string, step: AzureDevOpsStep, index: number): ParsedStep => {
  const stepName = step.displayName || step.name || step.task || `Step ${index + 1}`;
  const isTask = !!step.task;
  const isScript = !!(step.script || step.bash || step.pwsh || step.powershell);
  
  // Determine script body
  let scriptBody: string | undefined;
  if (step.script) {
    scriptBody = step.script;
  } else if (step.bash) {
    scriptBody = step.bash;
  } else if (step.pwsh) {
    scriptBody = step.pwsh;
  } else if (step.powershell) {
    scriptBody = step.powershell;
  }

  return {
    name: stepName,
    id: `step_${sanitizeId(jobId)}_${index}`,
    type: 'plugin',
    details: isTask ? `Azure DevOps Task: ${step.task}` : isScript ? 'Run Script' : 'Step',
    properties: {
      stepId: step.name,
      task: step.task,
      inputs: step.inputs,
      env: step.env,
      condition: step.condition,
      continueOnError: step.continueOnError,
      timeoutInMinutes: step.timeoutInMinutes,
      enabled: step.enabled,
      hasScript: isScript,
      hasTask: isTask,
      scriptType: step.bash ? 'bash' : step.pwsh ? 'pwsh' : step.powershell ? 'powershell' : step.script ? 'script' : undefined
    },
    scriptBody,
    incomingPaths: []
  };
};

/**
 * Parses a template file
 */
const parseTemplateFile = (fileName: string, content: string): ParsedProcess | null => {
  try {
    const template = yaml.load(content) as any;
    const mainFlow: ParsedStep[] = [];

    // Add template-level information - store full content only here
    const templateStep: ParsedStep = {
      name: `Template: ${template.name || fileName}`,
      id: `template_${sanitizeId(fileName)}`,
      type: 'plugin',
      details: 'Azure DevOps Template',
      properties: {
        fileName,
        templateName: template.name,
        parameters: template.parameters,
        steps: template.steps ? 'Has steps' : undefined,
        jobs: template.jobs ? 'Has jobs' : undefined,
        stages: template.stages ? 'Has stages' : undefined
      },
      scriptBody: content,  // Full YAML stored here
      incomingPaths: []
    };
    mainFlow.push(templateStep);

    // Parse steps in the template - don't duplicate content
    if (template.steps) {
      template.steps.forEach((step: AzureDevOpsStep, index: number) => {
        const stepData = parseStep('template', step, index);
        mainFlow.push(stepData);
      });
    }

    return {
      name: template.name || fileName,
      description: `Template from ${fileName}`,
      mainFlow,
      failureFlow: []
    };
  } catch (error) {
    console.error(`Error parsing template file ${fileName}:`, error);
    return null;
  }
};

/**
 * Creates a summary process with all bundle information
 */
const createSummaryProcess = (bundle: AzureDevOpsBundle): ParsedProcess => {
  const mainFlow: ParsedStep[] = [];

  const summaryStep: ParsedStep = {
    name: 'Azure DevOps Bundle Summary',
    id: 'bundle_summary',
    type: 'plugin',
    details: 'Overview of uploaded Azure DevOps files',
    properties: {
      totalFiles: bundle.allFiles.length,
      pipelineCount: Object.keys(bundle.pipelines).length,
      templateCount: Object.keys(bundle.templates).length,
      variableGroupCount: bundle.variableGroups ? Object.keys(bundle.variableGroups).length : 0,
      fileList: bundle.allFiles.map(f => `${f.fileName} (${f.type})`)
    },
    incomingPaths: []
  };
  mainFlow.push(summaryStep);

  return {
    name: 'Bundle Summary',
    description: `Summary of ${bundle.allFiles.length} Azure DevOps file(s)`,
    mainFlow,
    failureFlow: []
  };
};

/**
 * Extracts trigger information from pipeline trigger/pr
 */
const extractTriggers = (trigger: any): string[] => {
  if (!trigger) return [];
  
  const triggers: string[] = [];
  
  if (trigger.branches) {
    if (trigger.branches.include) {
      triggers.push(`branches: ${trigger.branches.include.join(', ')}`);
    }
    if (trigger.branches.exclude) {
      triggers.push(`exclude: ${trigger.branches.exclude.join(', ')}`);
    }
  }
  
  if (trigger.paths) {
    if (trigger.paths.include) {
      triggers.push(`paths: ${trigger.paths.include.join(', ')}`);
    }
  }
  
  if (trigger.tags) {
    if (trigger.tags.include) {
      triggers.push(`tags: ${trigger.tags.include.join(', ')}`);
    }
  }
  
  return triggers;
};

/**
 * Sanitizes a string to be used as an identifier
 */
const sanitizeId = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
};

