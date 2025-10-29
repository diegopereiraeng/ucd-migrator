// services/githubActionsParser.ts
import { GitHubActionsBundle, ParsedData, ParsedProcess, ParsedStep, GitHubWorkflow, GitHubJob } from '../types';
import * as yaml from 'js-yaml';

/**
 * Parses GitHub Actions workflow files and converts them into ParsedData format
 * The bundle includes: workflow YAML files, composite actions, and reusable workflows
 */
export const parseGitHubActions = (fileContents: string[]): ParsedData | null => {
  try {
    const bundle: GitHubActionsBundle = {
      workflows: {},
      compositeActions: {},
      reusableWorkflows: {},
      allFiles: []
    };

    // Categorize files based on their content and names
    fileContents.forEach((content, index) => {
      const fileName = extractFileName(content, index);
      const fileType = detectFileType(fileName, content);

      bundle.allFiles.push({
        fileName,
        content,
        type: fileType
      });

      switch (fileType) {
        case 'workflow':
          bundle.workflows[fileName] = content;
          break;
        case 'composite-action':
          bundle.compositeActions[fileName] = content;
          break;
        case 'reusable-workflow':
          bundle.reusableWorkflows[fileName] = content;
          break;
      }
    });

    if (Object.keys(bundle.workflows).length === 0 && 
        Object.keys(bundle.compositeActions).length === 0 && 
        Object.keys(bundle.reusableWorkflows).length === 0) {
      console.error('No valid GitHub Actions files found in bundle');
      return null;
    }

    // Create processes for each workflow
    const processes: ParsedProcess[] = [];
    
    // Parse workflows
    Object.entries(bundle.workflows).forEach(([fileName, content]) => {
      const process = parseWorkflowFile(fileName, content);
      if (process) {
        processes.push(process);
      }
    });

    // Parse composite actions
    Object.entries(bundle.compositeActions).forEach(([fileName, content]) => {
      const process = parseCompositeAction(fileName, content);
      if (process) {
        processes.push(process);
      }
    });

    // Parse reusable workflows
    Object.entries(bundle.reusableWorkflows).forEach(([fileName, content]) => {
      const process = parseReusableWorkflow(fileName, content);
      if (process) {
        processes.push(process);
      }
    });

    // Add a summary process with all file information
    const summaryProcess = createSummaryProcess(bundle);
    processes.unshift(summaryProcess);

    return {
      componentName: 'GitHub Actions Pipeline',
      processes
    };
  } catch (error) {
    console.error('Error parsing GitHub Actions bundle:', error);
    return null;
  }
};

/**
 * Extracts filename from content or generates one
 */
const extractFileName = (content: string, index: number): string => {
  // Try to find filename in first comment
  const firstLines = content.split('\n').slice(0, 10).join('\n');
  
  // Check for workflow file indicators
  if (firstLines.includes('name:') && (firstLines.includes('on:') || firstLines.includes('jobs:'))) {
    const nameMatch = firstLines.match(/name:\s*['"]?([^'"\\n]+)['"]?/);
    if (nameMatch) {
      return `${nameMatch[1].replace(/[^a-zA-Z0-9-_]/g, '_')}.yml`;
    }
    return `workflow_${index + 1}.yml`;
  }
  
  // Check for composite action
  if (firstLines.includes('runs:') && firstLines.includes('using:')) {
    return `action_${index + 1}.yml`;
  }
  
  return `workflow_${index + 1}.yml`;
};

/**
 * Detects file type based on filename and content
 */
const detectFileType = (fileName: string, content: string): string => {
  try {
    const parsed = yaml.load(content) as any;
    
    // Check if it's a workflow file
    if (parsed && parsed.on && parsed.jobs) {
      // Check if it's a reusable workflow
      if (parsed.on.workflow_call) {
        return 'reusable-workflow';
      }
      return 'workflow';
    }
    
    // Check if it's a composite action
    if (parsed && parsed.runs && parsed.runs.using === 'composite') {
      return 'composite-action';
    }
    
    return 'workflow';
  } catch (error) {
    console.error('Error detecting file type:', error);
    return 'unknown';
  }
};

/**
 * Parses a GitHub Actions workflow file
 */
const parseWorkflowFile = (fileName: string, content: string): ParsedProcess | null => {
  try {
    const workflow: GitHubWorkflow = yaml.load(content) as GitHubWorkflow;
    const mainFlow: ParsedStep[] = [];

    // Add workflow-level information - ONLY place where full YAML is stored
    const workflowStep: ParsedStep = {
      name: `Workflow: ${workflow.name || fileName}`,
      id: `workflow_${sanitizeId(fileName)}`,
      type: 'plugin',
      details: 'GitHub Actions Workflow',
      properties: {
        fileName,
        workflowName: workflow.name,
        triggers: extractTriggers(workflow.on),
        environmentVariables: workflow.env || {},
        jobCount: Object.keys(workflow.jobs || {}).length
      },
      scriptBody: content,  // Full YAML stored ONLY here
      incomingPaths: []
    };
    mainFlow.push(workflowStep);

    // Parse each job - don't duplicate full content
    if (workflow.jobs) {
      Object.entries(workflow.jobs).forEach(([jobId, job]) => {
        const jobSteps = parseJob(jobId, job);
        mainFlow.push(...jobSteps);
      });
    }

    return {
      name: workflow.name || fileName,
      description: `GitHub Actions workflow from ${fileName}`,
      mainFlow,
      failureFlow: []
    };
  } catch (error) {
    console.error(`Error parsing workflow file ${fileName}:`, error);
    return null;
  }
};

/**
 * Parses a GitHub Actions job
 */
const parseJob = (jobId: string, job: GitHubJob): ParsedStep[] => {
  const steps: ParsedStep[] = [];

  // Add job-level information
  const jobStep: ParsedStep = {
    name: `Job: ${job.name || jobId}`,
    id: `job_${sanitizeId(jobId)}`,
    type: 'plugin',
    details: `GitHub Actions Job (runs-on: ${Array.isArray(job['runs-on']) ? job['runs-on'].join(', ') : job['runs-on']})`,
    properties: {
      jobId,
      jobName: job.name,
      runsOn: job['runs-on'],
      needs: job.needs,
      if: job.if,
      strategy: job.strategy,
      environmentVariables: job.env || {},
      outputs: job.outputs,
      timeoutMinutes: job['timeout-minutes'],
      stepCount: job.steps?.length || 0
    },
    // No scriptBody here to avoid token duplication
    // Full workflow YAML is already stored at workflow level
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
 * Parses a GitHub Actions step
 */
const parseStep = (jobId: string, step: any, index: number): ParsedStep => {
  const stepName = step.name || step.uses || step.run?.split('\n')[0] || `Step ${index + 1}`;
  const isAction = !!step.uses;
  const isScript = !!step.run;

  return {
    name: stepName,
    id: `step_${sanitizeId(jobId)}_${index}`,
    type: 'plugin',
    details: isAction ? `GitHub Action: ${step.uses}` : isScript ? 'Run Script' : 'Step',
    properties: {
      stepId: step.id,
      uses: step.uses,
      with: step.with,
      env: step.env,
      if: step.if,
      continueOnError: step['continue-on-error'],
      timeoutMinutes: step['timeout-minutes'],
      shell: step.shell,
      hasScript: isScript,
      hasAction: isAction
    },
    scriptBody: step.run,
    incomingPaths: []
  };
};

/**
 * Parses a composite action file
 */
const parseCompositeAction = (fileName: string, content: string): ParsedProcess | null => {
  try {
    const action = yaml.load(content) as any;
    const mainFlow: ParsedStep[] = [];

    // Add action-level information - store full content only here
    const actionStep: ParsedStep = {
      name: `Composite Action: ${action.name || fileName}`,
      id: `action_${sanitizeId(fileName)}`,
      type: 'plugin',
      details: 'GitHub Composite Action',
      properties: {
        fileName,
        actionName: action.name,
        description: action.description,
        inputs: action.inputs,
        outputs: action.outputs,
        runsUsing: action.runs?.using
      },
      scriptBody: content,  // Full YAML stored here
      incomingPaths: []
    };
    mainFlow.push(actionStep);

    // Parse steps in the composite action - don't duplicate content
    if (action.runs?.steps) {
      action.runs.steps.forEach((step: any, index: number) => {
        const stepData = parseStep('composite', step, index);
        mainFlow.push(stepData);
      });
    }

    return {
      name: action.name || fileName,
      description: action.description || `Composite action from ${fileName}`,
      mainFlow,
      failureFlow: []
    };
  } catch (error) {
    console.error(`Error parsing composite action ${fileName}:`, error);
    return null;
  }
};

/**
 * Parses a reusable workflow file
 */
const parseReusableWorkflow = (fileName: string, content: string): ParsedProcess | null => {
  try {
    const workflow: GitHubWorkflow = yaml.load(content) as GitHubWorkflow;
    const mainFlow: ParsedStep[] = [];

    // Add reusable workflow-level information - store full content only here
    const workflowStep: ParsedStep = {
      name: `Reusable Workflow: ${workflow.name || fileName}`,
      id: `reusable_${sanitizeId(fileName)}`,
      type: 'plugin',
      details: 'GitHub Reusable Workflow',
      properties: {
        fileName,
        workflowName: workflow.name,
        inputs: workflow.on?.workflow_call?.inputs,
        outputs: workflow.on?.workflow_call?.outputs,
        secrets: workflow.on?.workflow_call?.secrets,
        jobCount: Object.keys(workflow.jobs || {}).length
      },
      scriptBody: content,  // Full YAML stored here
      incomingPaths: []
    };
    mainFlow.push(workflowStep);

    // Parse each job - don't duplicate full content
    if (workflow.jobs) {
      Object.entries(workflow.jobs).forEach(([jobId, job]) => {
        const jobSteps = parseJob(jobId, job);
        mainFlow.push(...jobSteps);
      });
    }

    return {
      name: workflow.name || fileName,
      description: `Reusable workflow from ${fileName}`,
      mainFlow,
      failureFlow: []
    };
  } catch (error) {
    console.error(`Error parsing reusable workflow ${fileName}:`, error);
    return null;
  }
};

/**
 * Creates a summary process with all bundle information
 */
const createSummaryProcess = (bundle: GitHubActionsBundle): ParsedProcess => {
  const mainFlow: ParsedStep[] = [];

  const summaryStep: ParsedStep = {
    name: 'GitHub Actions Bundle Summary',
    id: 'bundle_summary',
    type: 'plugin',
    details: 'Overview of uploaded GitHub Actions files',
    properties: {
      totalFiles: bundle.allFiles.length,
      workflowCount: Object.keys(bundle.workflows).length,
      compositeActionCount: Object.keys(bundle.compositeActions).length,
      reusableWorkflowCount: Object.keys(bundle.reusableWorkflows).length,
      fileList: bundle.allFiles.map(f => `${f.fileName} (${f.type})`)
    },
    incomingPaths: []
  };
  mainFlow.push(summaryStep);

  return {
    name: 'Bundle Summary',
    description: `Summary of ${bundle.allFiles.length} GitHub Actions file(s)`,
    mainFlow,
    failureFlow: []
  };
};

/**
 * Extracts trigger information from workflow.on
 */
const extractTriggers = (on: any): string[] => {
  if (!on) return [];
  
  const triggers: string[] = [];
  
  if (typeof on === 'string') {
    triggers.push(on);
  } else if (Array.isArray(on)) {
    triggers.push(...on);
  } else if (typeof on === 'object') {
    triggers.push(...Object.keys(on));
  }
  
  return triggers;
};

/**
 * Sanitizes a string to be used as an identifier
 */
const sanitizeId = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
};
