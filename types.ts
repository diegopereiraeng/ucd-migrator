// types.ts

// --- Raw UCD JSON Interfaces ---

export interface UCDComponentTemplate {
  name: string;
  description: string;
  propDefs: any[];
  processes: UCDProcess[];
  genericProcesses: UCDProcess[];
}

export interface UCDProcess {
  name: string;
  description: string;
  rootActivity: RootActivity;
  linkedProcesses?: UCDProcess[];
}

export interface RootActivity {
  edges: Edge[];
  children: Step[];
  type: string;
}

export interface Step {
  name: string;
  type: 'plugin' | 'runProcess' | 'setStatus' | 'switch' | 'finish' | 'graph';
  children: Step[];
  properties?: { [key: string]: any };
  processName?: string;
  pluginName?: string;
  commandName?: string;
  status?: string;
  propertyName?: string;
  // FIX: Add missing optional properties for post-processing and precondition scripts.
  postProcessingScript?: { body: string };
  preconditionScript?: string;
}

export interface Edge {
  from: string;
  to: string;
  type: 'SUCCESS' | 'FAILURE' | 'ALWAYS' | 'VALUE';
  value?: string;
}


// --- Raw Jenkins Bundle Interfaces ---

export interface JenkinsBundle {
  jenkinsfile?: string;
  configXml?: string;
  buildXml?: string;
  groovyScripts: { [fileName: string]: string };
  allFiles: { fileName: string; content: string; type: string }[];
}

export interface JenkinsStage {
  name: string;
  steps: JenkinsStep[];
  agent?: string;
  environment?: { [key: string]: string };
  when?: string;
}

export interface JenkinsStep {
  name: string;
  type: string;
  script?: string;
  parameters?: { [key: string]: any };
}

// --- Raw GitHub Actions Bundle Interfaces ---

export interface GitHubActionsBundle {
  workflows: { [fileName: string]: string };
  compositeActions: { [fileName: string]: string };
  reusableWorkflows: { [fileName: string]: string };
  allFiles: { fileName: string; content: string; type: string }[];
}

export interface GitHubWorkflow {
  name?: string;
  on?: GitHubTrigger;
  env?: { [key: string]: string };
  jobs: { [jobId: string]: GitHubJob };
}

export interface GitHubTrigger {
  push?: any;
  pull_request?: any;
  schedule?: any;
  workflow_dispatch?: any;
  workflow_call?: any;
  [key: string]: any;
}

export interface GitHubJob {
  name?: string;
  'runs-on': string | string[];
  needs?: string | string[];
  if?: string;
  strategy?: {
    matrix?: { [key: string]: any[] };
    'fail-fast'?: boolean;
    'max-parallel'?: number;
  };
  env?: { [key: string]: string };
  steps: GitHubStep[];
  outputs?: { [key: string]: string };
  'timeout-minutes'?: number;
}

export interface GitHubStep {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  with?: { [key: string]: any };
  env?: { [key: string]: string };
  if?: string;
  'continue-on-error'?: boolean;
  'timeout-minutes'?: number;
  shell?: string;
}

// --- Parsed Data Interfaces ---

export interface ParsedPath {
  source: string;
  type: Edge['type'];
  value?: string;
}

export interface ParsedStep {
  name: string;
  id: string;
  type: Step['type'];
  details: string;
  properties: { [key:string]: any };
  scriptBody?: string;
  postProcessingScript?: string;
  preconditionScript?: string;
  incomingPaths: ParsedPath[];
  onSuccess?: string;
  onFailure?: string;
  onAlways?: string;
  valuePaths?: { value: string, destination: string }[];
}

export interface ParsedProcess {
  name: string;
  description: string;
  mainFlow: ParsedStep[];
  failureFlow: ParsedStep[];
}

export interface ParsedData {
  componentName: string;
  processes: ParsedProcess[];
}

// --- Workflow Generation Interfaces ---

export interface WorkflowStep {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  systemInstruction: string;
  status: 'initial' | 'pending' | 'loading' | 'completed' | 'error';
  result: string;
  isCustom: boolean;
  contextSourceIds: string[];
}