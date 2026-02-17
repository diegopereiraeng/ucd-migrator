// services/azureDevOpsParser.ts
import { AzureDevOpsBundle, ParsedData, ParsedProcess, ParsedStep, AzureDevOpsPipeline, AzureDevOpsJob, AzureDevOpsStage, AzureDevOpsStep } from '../types';
import { FileInput } from './parserService';
import * as yaml from 'js-yaml';

// Azure DevOps Release Definition (Classic) interfaces
interface AzureDevOpsReleaseDefinition {
  source?: number;
  revision?: number;
  description?: string;
  createdBy?: any;
  createdOn?: string;
  modifiedBy?: any;
  modifiedOn?: string;
  isDeleted?: boolean;
  lastRelease?: any;
  variables?: { [key: string]: { value: string; isSecret?: boolean } };
  variableGroups?: any[];
  environments?: AzureDevOpsReleaseEnvironment[];
  artifacts?: any[];
  triggers?: any[];
  releaseNameFormat?: string;
  name?: string;
}

interface AzureDevOpsReleaseEnvironment {
  id?: number;
  name: string;
  rank?: number;
  owner?: any;
  variables?: { [key: string]: { value: string; isSecret?: boolean } };
  variableGroups?: any[];
  preDeployApprovals?: any;
  postDeployApprovals?: any;
  deployPhases?: AzureDevOpsDeployPhase[];
  environmentOptions?: any;
  demands?: any[];
  conditions?: any[];
  executionPolicy?: any;
  schedules?: any[];
  retentionPolicy?: any;
  properties?: any;
  preDeploymentGates?: any;
  postDeploymentGates?: any;
  environmentTriggers?: any[];
  badgeUrl?: string;
}

interface AzureDevOpsDeployPhase {
  deploymentInput?: any;
  rank?: number;
  phaseType?: number;
  name?: string;
  refName?: string;
  workflowTasks?: AzureDevOpsWorkflowTask[];
}

interface AzureDevOpsWorkflowTask {
  environment?: any;
  taskId?: string;
  version?: string;
  name?: string;
  refName?: string;
  enabled?: boolean;
  alwaysRun?: boolean;
  continueOnError?: boolean;
  timeoutInMinutes?: number;
  definitionType?: string;
  overrideInputs?: any;
  condition?: string;
  inputs?: { [key: string]: string };
}

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

    // Check for release definitions in allFiles
    const releaseDefinitions = bundle.allFiles.filter(f => f.type === 'release-definition');
    
    if (Object.keys(bundle.pipelines).length === 0 && 
        Object.keys(bundle.templates).length === 0 &&
        releaseDefinitions.length === 0) {
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

    // Parse release definitions (classic JSON pipelines)
    releaseDefinitions.forEach(({ fileName, content }) => {
      const releaseProcesses = parseReleaseDefinition(fileName, content);
      if (releaseProcesses) {
        processes.push(...releaseProcesses);
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
    
    // Check for JSON files - could be Release Definitions
    if (lowerFileName.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content);
        // Check if it's a Release Definition (has environments array with deployPhases)
        if (parsed.environments && Array.isArray(parsed.environments) && 
            parsed.environments.some((env: any) => env.deployPhases)) {
          return 'release-definition';
        }
      } catch (e) {
        // Not valid JSON, continue with other checks
      }
    }
    
    // Check for variable group files
    if (lowerFileName.includes('variable') || lowerFileName.includes('variable-group')) {
      return 'variable-group';
    }
    
    // Check for template files (usually contain 'template' in name or have template structure)
    if (lowerFileName.includes('template') || 
        lowerFileName.includes('template.yml') || 
        lowerFileName.includes('template.yaml')) {
      return 'template';
    }
    
    // Try to parse as YAML to check structure
    const parsed = yaml.load(content) as any;
    
    // Check if it's a pipeline file (has stages or jobs at root)
    if (parsed && (parsed.stages || parsed.jobs || parsed.trigger || parsed.pr)) {
      return 'pipeline';
    }
    
    // Check if it's a template (has parameters or is referenced as template)
    if (parsed && (parsed.parameters || parsed.template || parsed.steps)) {
      return 'template';
    }
    
    // Default to pipeline for YAML files
    if (lowerFileName.endsWith('.yml') || lowerFileName.endsWith('.yaml')) {
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
 * Parses an Azure DevOps Release Definition (classic JSON pipeline)
 */
const parseReleaseDefinition = (fileName: string, content: string): ParsedProcess[] | null => {
  try {
    const releaseDefinition: AzureDevOpsReleaseDefinition = JSON.parse(content);
    const processes: ParsedProcess[] = [];

    // Create a main process for the release definition
    const mainFlow: ParsedStep[] = [];

    // Add release definition-level information
    const releaseStep: ParsedStep = {
      name: `Release Definition: ${releaseDefinition.name || fileName}`,
      id: `release_${sanitizeId(fileName)}`,
      type: 'plugin',
      details: 'Azure DevOps Release Definition (Classic)',
      properties: {
        fileName,
        releaseName: releaseDefinition.name,
        revision: releaseDefinition.revision,
        createdOn: releaseDefinition.createdOn,
        modifiedOn: releaseDefinition.modifiedOn,
        environmentCount: releaseDefinition.environments?.length || 0,
        variableCount: releaseDefinition.variables ? Object.keys(releaseDefinition.variables).length : 0
      },
      scriptBody: content,
      incomingPaths: []
    };
    mainFlow.push(releaseStep);

    // Add variables step if present
    if (releaseDefinition.variables && Object.keys(releaseDefinition.variables).length > 0) {
      const variablesStep: ParsedStep = {
        name: 'Release Variables',
        id: `release_${sanitizeId(fileName)}_variables`,
        type: 'plugin',
        details: 'Pipeline-level variables',
        properties: {
          variables: Object.entries(releaseDefinition.variables).map(([key, val]) => ({
            name: key,
            value: val.isSecret ? '***SECRET***' : val.value,
            isSecret: val.isSecret || false
          }))
        },
        incomingPaths: []
      };
      mainFlow.push(variablesStep);
    }

    // Parse each environment (stage)
    if (releaseDefinition.environments) {
      releaseDefinition.environments.forEach((env, envIndex) => {
        const envSteps = parseReleaseEnvironment(fileName, env, envIndex);
        mainFlow.push(...envSteps);
      });
    }

    processes.push({
      name: releaseDefinition.name || fileName,
      description: `Azure DevOps Release Definition from ${fileName}`,
      mainFlow,
      failureFlow: []
    });

    return processes;
  } catch (error) {
    console.error(`Error parsing release definition ${fileName}:`, error);
    return null;
  }
};

/**
 * Parses an Azure DevOps Release Environment (stage in classic pipeline)
 */
const parseReleaseEnvironment = (fileName: string, env: AzureDevOpsReleaseEnvironment, envIndex: number): ParsedStep[] => {
  const steps: ParsedStep[] = [];

  // Add environment-level information
  const envStep: ParsedStep = {
    name: `Environment: ${env.name}`,
    id: `env_${sanitizeId(fileName)}_${envIndex}`,
    type: 'plugin',
    details: `Azure DevOps Release Environment (Rank: ${env.rank || envIndex + 1})`,
    properties: {
      environmentId: env.id,
      environmentName: env.name,
      rank: env.rank,
      owner: env.owner?.displayName,
      variableCount: env.variables ? Object.keys(env.variables).length : 0,
      phaseCount: env.deployPhases?.length || 0,
      hasPreDeployApprovals: env.preDeployApprovals?.approvals?.some((a: any) => !a.isAutomated) || false,
      hasPostDeployApprovals: env.postDeployApprovals?.approvals?.some((a: any) => !a.isAutomated) || false,
      conditions: env.conditions,
      retentionPolicy: env.retentionPolicy
    },
    incomingPaths: []
  };
  steps.push(envStep);

  // Add environment variables if present
  if (env.variables && Object.keys(env.variables).length > 0) {
    const envVarsStep: ParsedStep = {
      name: `${env.name} Variables`,
      id: `env_${sanitizeId(fileName)}_${envIndex}_variables`,
      type: 'plugin',
      details: 'Environment-level variables',
      properties: {
        variables: Object.entries(env.variables).map(([key, val]) => ({
          name: key,
          value: val.isSecret ? '***SECRET***' : val.value,
          isSecret: val.isSecret || false
        }))
      },
      incomingPaths: []
    };
    steps.push(envVarsStep);
  }

  // Parse deploy phases
  if (env.deployPhases) {
    env.deployPhases.forEach((phase, phaseIndex) => {
      const phaseSteps = parseDeployPhase(fileName, env.name, phase, envIndex, phaseIndex);
      steps.push(...phaseSteps);
    });
  }

  return steps;
};

/**
 * Parses an Azure DevOps Deploy Phase (job in classic pipeline)
 */
const parseDeployPhase = (
  fileName: string, 
  envName: string, 
  phase: AzureDevOpsDeployPhase, 
  envIndex: number, 
  phaseIndex: number
): ParsedStep[] => {
  const steps: ParsedStep[] = [];

  // Add phase-level information
  const phaseStep: ParsedStep = {
    name: `Phase: ${phase.name || `Phase ${phaseIndex + 1}`}`,
    id: `phase_${sanitizeId(fileName)}_${envIndex}_${phaseIndex}`,
    type: 'plugin',
    details: `Deploy Phase (Type: ${getPhaseTypeName(phase.phaseType)})`,
    properties: {
      phaseName: phase.name,
      phaseType: phase.phaseType,
      phaseTypeName: getPhaseTypeName(phase.phaseType),
      rank: phase.rank,
      deploymentInput: phase.deploymentInput,
      taskCount: phase.workflowTasks?.length || 0
    },
    incomingPaths: []
  };
  steps.push(phaseStep);

  // Parse workflow tasks
  if (phase.workflowTasks) {
    phase.workflowTasks.forEach((task, taskIndex) => {
      const taskStep = parseWorkflowTask(fileName, envName, task, envIndex, phaseIndex, taskIndex);
      steps.push(taskStep);
    });
  }

  return steps;
};

/**
 * Parses an Azure DevOps Workflow Task
 */
const parseWorkflowTask = (
  fileName: string,
  envName: string,
  task: AzureDevOpsWorkflowTask,
  envIndex: number,
  phaseIndex: number,
  taskIndex: number
): ParsedStep => {
  // Determine script body from inputs
  let scriptBody: string | undefined;
  if (task.inputs) {
    if (task.inputs.script) {
      scriptBody = task.inputs.script;
    } else if (task.inputs.filePath) {
      scriptBody = `File: ${task.inputs.filePath}${task.inputs.arguments ? `\nArguments: ${task.inputs.arguments}` : ''}`;
    }
  }

  return {
    name: task.name || `Task ${taskIndex + 1}`,
    id: `task_${sanitizeId(fileName)}_${envIndex}_${phaseIndex}_${taskIndex}`,
    type: 'plugin',
    details: `Task: ${task.taskId || 'Unknown'} (v${task.version || '*'})`,
    properties: {
      taskId: task.taskId,
      version: task.version,
      enabled: task.enabled !== false,
      alwaysRun: task.alwaysRun || false,
      continueOnError: task.continueOnError || false,
      timeoutInMinutes: task.timeoutInMinutes,
      condition: task.condition,
      definitionType: task.definitionType,
      inputs: task.inputs,
      targetType: task.inputs?.targetType,
      environment: envName
    },
    scriptBody,
    incomingPaths: []
  };
};

/**
 * Gets the human-readable name for a phase type
 */
const getPhaseTypeName = (phaseType?: number): string => {
  switch (phaseType) {
    case 1: return 'Agent-based deployment';
    case 2: return 'Run on server';
    case 3: return 'Machine group deployment';
    case 4: return 'Deployment group';
    default: return `Unknown (${phaseType})`;
  }
};

/**
 * Sanitizes a string to be used as an identifier
 */
const sanitizeId = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
};

