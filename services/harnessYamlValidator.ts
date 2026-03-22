import * as yaml from 'js-yaml';

type ValidationSeverity = 'error' | 'warning';

export interface HarnessValidationIssue {
  severity: ValidationSeverity;
  path: string;
  message: string;
}

export interface HarnessValidationResult {
  valid: boolean;
  issues: HarnessValidationIssue[];
}

const V1_STAGE_TYPES = new Set(['ci', 'deployment', 'custom', 'approval', 'pipeline']);
const LEGACY_STAGE_TYPES = new Set(['CI', 'Deployment', 'Custom', 'Approval', 'Pipeline']);
const LEGACY_VARIABLE_TYPES = new Set(['String', 'Number', 'Secret']);
const LEGACY_INFRASTRUCTURE_TYPES = new Set([
  'KubernetesDirect',
  'KubernetesGcp',
  'KubernetesAzure',
  'Pdc',
  'SshWinRmAzure',
  'ServerlessAwsLambda',
  'AzureWebApp',
  'AzureFunction',
  'SshWinRmAws',
  'SshGcp',
  'CustomDeployment',
  'ECS',
  'Elastigroup',
  'TAS',
  'Asg',
  'GoogleCloudFunctions',
  'AWS_SAM',
  'AwsLambda',
  'KubernetesAws',
  'KubernetesRancher',
  'GoogleCloudRun',
  'AzureContainerApps',
  'Salesforce',
  'GoogleManagedInstanceGroup',
]);
const V1_DEPLOYMENT_TYPES = new Set([
  'Kubernetes',
  'NativeHelm',
  'Ssh',
  'WinRm',
  'ServerlessAwsLambda',
  'AzureWebApp',
  'AzureFunction',
  'CustomDeployment',
  'ECS',
  'Elastigroup',
  'TAS',
  'Asg',
  'GoogleCloudFunctions',
  'AwsLambda',
  'AWS_SAM',
  'GoogleCloudRun',
  'Salesforce',
  'GoogleManagedInstanceGroup',
  'AzureContainerApps',
]);

const addIssue = (
  issues: HarnessValidationIssue[],
  path: string,
  message: string,
  severity: ValidationSeverity = 'error'
): void => {
  issues.push({ severity, path, message });
};

const readStage = (stageItem: any): any => {
  if (stageItem && typeof stageItem === 'object' && stageItem.stage && typeof stageItem.stage === 'object') {
    return stageItem.stage;
  }
  return stageItem;
};

const getServiceRef = (service: any): string | undefined => {
  if (!service || typeof service !== 'object') return undefined;
  if (typeof service.serviceRef === 'string') return service.serviceRef;
  if (typeof service.ref === 'string') return service.ref;
  if (typeof service.id === 'string') return service.id;
  return undefined;
};

const getEnvironmentRef = (environment: any): string | undefined => {
  if (!environment || typeof environment !== 'object') return undefined;
  if (typeof environment.environmentRef === 'string') return environment.environmentRef;
  if (typeof environment.ref === 'string') return environment.ref;
  if (typeof environment.id === 'string') return environment.id;
  return undefined;
};

const getInfraList = (environment: any): any[] => {
  if (!environment || typeof environment !== 'object') return [];
  if (Array.isArray(environment.infrastructureDefinitions)) return environment.infrastructureDefinitions;
  if (Array.isArray(environment.infra)) return environment.infra;
  return [];
};

const getStageSteps = (stageSpec: any): any[] => {
  if (!stageSpec || typeof stageSpec !== 'object') return [];
  if (Array.isArray(stageSpec.steps)) return stageSpec.steps;
  if (stageSpec.execution && typeof stageSpec.execution === 'object' && Array.isArray(stageSpec.execution.steps)) {
    return stageSpec.execution.steps;
  }
  return [];
};

const getStepType = (stepItem: any): string | undefined => {
  if (!stepItem || typeof stepItem !== 'object') return undefined;
  if (typeof stepItem.type === 'string') return stepItem.type;
  if (stepItem.step && typeof stepItem.step === 'object' && typeof stepItem.step.type === 'string') {
    return stepItem.step.type;
  }
  return undefined;
};

const validateV1StepTypes = (
  steps: any[],
  path: string,
  issues: HarnessValidationIssue[]
): void => {
  steps.forEach((stepItem, index) => {
    const stepType = getStepType(stepItem);
    if (!stepType) {
      addIssue(issues, `${path}[${index}]`, 'Step is missing type.');
      return;
    }
    const normalized = stepType.trim().toLowerCase();
    if (normalized === 'approval') {
      addIssue(
        issues,
        `${path}[${index}].type`,
        'type: Approval is invalid for step context in v1. Use approval step type (e.g. harness-approval/custom-approval) or an approval stage.',
      );
    }
  });
};

const validateDeploymentTypeKeys = (
  node: any,
  path: string,
  issues: HarnessValidationIssue[]
): void => {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    node.forEach((item, index) => validateDeploymentTypeKeys(item, `${path}[${index}]`, issues));
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    const nodePath = `${path}.${key}`;
    if (key === 'deploymentType' && typeof value === 'string') {
      if (value === 'Custom') {
        addIssue(
          issues,
          nodePath,
          'deploymentType: Custom is invalid. Use CustomDeployment, or fallback to stage.type: custom when no native deployment type exists.',
        );
      } else if (!V1_DEPLOYMENT_TYPES.has(value)) {
        addIssue(
          issues,
          nodePath,
          `deploymentType: ${value} is not in the accepted v1 deployment type set.`,
        );
      }
    }

    validateDeploymentTypeKeys(value, nodePath, issues);
  });
};

export const validateHarnessV1YamlShape = (yamlText: string): HarnessValidationResult => {
  const issues: HarnessValidationIssue[] = [];
  let doc: any;

  try {
    doc = yaml.load(yamlText);
  } catch (error) {
    addIssue(issues, 'root', `Invalid YAML: ${(error as Error).message}`);
    return { valid: false, issues };
  }

  if (!doc || typeof doc !== 'object') {
    addIssue(issues, 'root', 'YAML root must be an object.');
    return { valid: false, issues };
  }

  if (doc.version !== 1) {
    addIssue(issues, 'version', 'Harness v1 requires version: 1.');
  }
  if (doc.kind !== 'pipeline') {
    addIssue(issues, 'kind', 'Harness v1 pipeline requires kind: pipeline.');
  }

  const spec = doc.spec;
  if (!spec || typeof spec !== 'object') {
    addIssue(issues, 'spec', 'Missing required spec object.');
    return { valid: false, issues };
  }

  if (!Array.isArray(spec.stages) || spec.stages.length === 0) {
    addIssue(issues, 'spec.stages', 'spec.stages must be a non-empty array.');
    return { valid: false, issues };
  }

  spec.stages.forEach((stageItem: any, stageIndex: number) => {
    const stagePath = `spec.stages[${stageIndex}]`;
    const stage = readStage(stageItem);

    if (!stage || typeof stage !== 'object') {
      addIssue(issues, stagePath, 'Stage entry must be an object.');
      return;
    }

    const stageTypeRaw = stage.type;
    if (typeof stageTypeRaw !== 'string' || stageTypeRaw.trim().length === 0) {
      addIssue(issues, `${stagePath}.type`, 'Stage must define type.');
      return;
    }

    const stageType = stageTypeRaw.trim().toLowerCase();
    if (!V1_STAGE_TYPES.has(stageType)) {
      addIssue(issues, `${stagePath}.type`, `Invalid stage type: ${stageTypeRaw}. Expected v1 stage type (ci/deployment/custom/approval/pipeline).`);
    }

    if (!stage.spec || typeof stage.spec !== 'object') {
      addIssue(issues, `${stagePath}.spec`, 'Stage must define spec object.');
      return;
    }

    if (stageType !== 'approval' && !Array.isArray(stage.failure)) {
      addIssue(
        issues,
        `${stagePath}.failure`,
        'Non-approval stage should include failure array for deterministic failure behavior.',
        'warning'
      );
    }

    if (stageType === 'ci') {
      const steps = getStageSteps(stage.spec);
      if (steps.length === 0) {
        addIssue(issues, `${stagePath}.spec.steps`, 'CI stage must include at least one step.');
      }
      validateV1StepTypes(steps, `${stagePath}.spec.steps`, issues);
    }

    if (stageType === 'deployment') {
      const serviceRef = getServiceRef(stage.spec.service);
      if (!hasValue(serviceRef)) {
        addIssue(issues, `${stagePath}.spec.service`, 'Deployment stage must include service reference (serviceRef/ref/id).');
      }

      const environmentRef = getEnvironmentRef(stage.spec.environment);
      if (!hasValue(environmentRef)) {
        addIssue(issues, `${stagePath}.spec.environment`, 'Deployment stage must include environment reference (environmentRef/ref/id).');
      }

      const infraList = getInfraList(stage.spec.environment);
      if (infraList.length === 0) {
        addIssue(issues, `${stagePath}.spec.environment`, 'Deployment stage should include infra/infrastructureDefinitions entries.');
      } else {
        infraList.forEach((infra, infraIndex) => {
          const identifier = typeof infra?.identifier === 'string' ? infra.identifier : infra?.id;
          if (!hasValue(identifier)) {
            addIssue(issues, `${stagePath}.spec.environment.infra[${infraIndex}]`, 'Infrastructure entry must define identifier or id.');
          }
        });
      }

      const steps = getStageSteps(stage.spec);
      if (steps.length === 0) {
        addIssue(issues, `${stagePath}.spec.steps`, 'Deployment stage must include at least one step.');
      }
      validateV1StepTypes(steps, `${stagePath}.spec.steps`, issues);
    }

    if (stageType === 'custom') {
      const steps = getStageSteps(stage.spec);
      if (steps.length === 0) {
        addIssue(issues, `${stagePath}.spec.steps`, 'Custom stage must include at least one step.');
      }
      validateV1StepTypes(steps, `${stagePath}.spec.steps`, issues);
    }

    if (stageType === 'approval') {
      const approvalSteps = Array.isArray(stage.spec.steps) ? stage.spec.steps : [];
      if (approvalSteps.length === 0) {
        addIssue(issues, `${stagePath}.spec.steps`, 'Approval stage should include at least one approval-compatible step.', 'warning');
      }
      validateV1StepTypes(approvalSteps, `${stagePath}.spec.steps`, issues);
    }
  });

  validateDeploymentTypeKeys(doc, 'root', issues);
  scanForAzureExpressions(doc, 'root', issues);

  return {
    valid: issues.every(issue => issue.severity !== 'error'),
    issues,
  };
};

const hasValue = (value: unknown): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
};

const getStageNode = (stageItem: any): any => {
  if (stageItem && typeof stageItem === 'object' && stageItem.stage && typeof stageItem.stage === 'object') {
    return stageItem.stage;
  }
  return stageItem;
};

const hasExecutionSteps = (execution: any): boolean => {
  if (!execution || typeof execution !== 'object') return false;
  if (Array.isArray(execution.steps) && execution.steps.length > 0) return true;
  if (Array.isArray(execution.stepGroups) && execution.stepGroups.length > 0) return true;
  return false;
};

const validateLegacyVariables = (
  variables: any,
  path: string,
  issues: HarnessValidationIssue[]
): void => {
  if (variables === undefined) return;

  if (!Array.isArray(variables)) {
    addIssue(issues, path, 'Variables must be an array of NGVariable objects.');
    return;
  }

  variables.forEach((variable, index) => {
    const varPath = `${path}[${index}]`;
    if (!variable || typeof variable !== 'object') {
      addIssue(issues, varPath, 'Variable entry must be an object.');
      return;
    }

    if (!hasValue(variable.name)) {
      addIssue(issues, `${varPath}.name`, 'Variable must include non-empty name.');
    }

    if (!hasValue(variable.type)) {
      addIssue(issues, `${varPath}.type`, 'Variable must include non-empty type.');
      return;
    }

    if (!LEGACY_VARIABLE_TYPES.has(variable.type)) {
      addIssue(
        issues,
        `${varPath}.type`,
        `Variable type ${variable.type} is invalid. Valid values: "String", "Number", "Secret".`,
      );
    }
  });
};

const validateLegacyStepTypes = (
  node: any,
  path: string,
  issues: HarnessValidationIssue[]
): void => {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach((item, index) => validateLegacyStepTypes(item, `${path}[${index}]`, issues));
    return;
  }

  if (typeof node !== 'object') return;

  if (node.step && typeof node.step === 'object') {
    validateLegacyStepTypes(node.step, `${path}.step`, issues);
    return;
  }

  if (node.stage && typeof node.stage === 'object') {
    return;
  }

  if (typeof node.type === 'string' && node.type === 'Approval') {
    addIssue(
      issues,
      `${path}.type`,
      'Step type Approval is invalid in execution context. Use an Approval stage or a valid approval step type.',
    );
  }

  if (node.parallel) validateLegacyStepTypes(node.parallel, `${path}.parallel`, issues);
  if (node.steps) validateLegacyStepTypes(node.steps, `${path}.steps`, issues);
  if (node.stepGroup) validateLegacyStepTypes(node.stepGroup, `${path}.stepGroup`, issues);
  if (node.execution) validateLegacyStepTypes(node.execution, `${path}.execution`, issues);
};

const validateServiceConfigShape = (
  serviceConfig: any,
  path: string,
  issues: HarnessValidationIssue[]
): void => {
  if (!serviceConfig || typeof serviceConfig !== 'object' || Array.isArray(serviceConfig)) {
    addIssue(issues, path, 'serviceConfig must be an object.');
    return;
  }

  const hasUseFromStage = hasValue(serviceConfig?.useFromStage?.stage);
  const hasService = !!serviceConfig.service && typeof serviceConfig.service === 'object';
  const hasServiceRef = hasValue(serviceConfig?.serviceRef);
  const hasServiceDefinition = serviceConfig?.serviceDefinition !== undefined;

  if (serviceConfig?.useFromStage !== undefined && !hasUseFromStage) {
    addIssue(issues, `${path}.useFromStage.stage`, 'serviceConfig.useFromStage must include non-empty stage.');
  }

  if (!hasUseFromStage && !hasService && !hasServiceRef) {
    addIssue(
      issues,
      path,
      'serviceConfig must include one of: useFromStage.stage, service, or serviceRef.',
    );
  }

  if (!hasUseFromStage && !hasServiceDefinition) {
    addIssue(
      issues,
      `${path}.useFromStage`,
      'serviceConfig requires useFromStage.stage when serviceDefinition is not provided.',
    );
  }
};

const validateSshWinRmAzureInfraSpec = (
  spec: any,
  path: string,
  issues: HarnessValidationIssue[]
): void => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    addIssue(issues, path, 'SshWinRmAzure infrastructure must include spec object.');
    return;
  }

  if (!hasValue(spec.connectorRef)) {
    addIssue(issues, `${path}.connectorRef`, 'SshWinRmAzure requires non-empty spec.connectorRef.');
  }
  if (!hasValue(spec.credentialsRef)) {
    addIssue(issues, `${path}.credentialsRef`, 'SshWinRmAzure requires non-empty spec.credentialsRef.');
  }
  if (!hasValue(spec.hostConnectionType)) {
    addIssue(issues, `${path}.hostConnectionType`, 'SshWinRmAzure requires spec.hostConnectionType (Hostname|PrivateIP|PublicIP).');
  } else if (!['Hostname', 'PrivateIP', 'PublicIP'].includes(spec.hostConnectionType)) {
    addIssue(issues, `${path}.hostConnectionType`, 'Invalid hostConnectionType for SshWinRmAzure. Valid values: Hostname, PrivateIP, PublicIP.');
  }
  if (!hasValue(spec.resourceGroup)) {
    addIssue(issues, `${path}.resourceGroup`, 'SshWinRmAzure requires non-empty spec.resourceGroup.');
  }
  if (!hasValue(spec.subscriptionId)) {
    addIssue(issues, `${path}.subscriptionId`, 'SshWinRmAzure requires non-empty spec.subscriptionId.');
  }
};

const validateInlineInfrastructureDefinition = (
  infrastructureDefinition: any,
  path: string,
  issues: HarnessValidationIssue[],
  requireType: boolean
): void => {
  if (!infrastructureDefinition || typeof infrastructureDefinition !== 'object' || Array.isArray(infrastructureDefinition)) {
    addIssue(issues, path, 'infrastructureDefinition must be an object.');
    return;
  }

  const isReferenceOnly = hasValue(infrastructureDefinition.identifier)
    && infrastructureDefinition.type === undefined
    && infrastructureDefinition.spec === undefined;

  if (!requireType && isReferenceOnly) {
    return;
  }

  if (!hasValue(infrastructureDefinition.type)) {
    addIssue(issues, `${path}.type`, 'infrastructureDefinition must include non-empty type.');
    return;
  }

  const infraType = String(infrastructureDefinition.type);
  if (!LEGACY_INFRASTRUCTURE_TYPES.has(infraType)) {
    addIssue(
      issues,
      `${path}.type`,
      `Infrastructure type ${infraType} is invalid. Valid values: ${Array.from(LEGACY_INFRASTRUCTURE_TYPES).join(', ')}.`,
    );
    if (infraType === 'WinRm') {
      addIssue(
        issues,
        `${path}.type`,
        'For Azure VM/WinRM infrastructure, use type: SshWinRmAzure (not WinRm).',
      );
    }
    return;
  }

  if (infraType === 'SshWinRmAzure') {
    validateSshWinRmAzureInfraSpec(infrastructureDefinition.spec, `${path}.spec`, issues);
  }
};

const scanForAzureExpressions = (
  node: any,
  path: string,
  issues: HarnessValidationIssue[],
  parentKey?: string
): void => {
  if (typeof node === 'string') {
    const ignoreInScriptBody = parentKey === 'script' || parentKey === 'command';
    if (!ignoreInScriptBody && /\$\([^\)]+\)/.test(node)) {
      addIssue(
        issues,
        path,
        'Azure variable expression $(...) still present outside script/command body. Convert to Harness expression.',
        'error'
      );
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => scanForAzureExpressions(item, `${path}[${index}]`, issues, parentKey));
    return;
  }

  if (node && typeof node === 'object') {
    Object.entries(node).forEach(([key, value]) => {
      scanForAzureExpressions(value, `${path}.${key}`, issues, key);
    });
  }
};

export const validateHarnessYamlShape = (yamlText: string): HarnessValidationResult => {
  const issues: HarnessValidationIssue[] = [];
  let doc: any;

  try {
    doc = yaml.load(yamlText);
  } catch (error) {
    addIssue(issues, 'root', `Invalid YAML: ${(error as Error).message}`);
    return { valid: false, issues };
  }

  if (!doc || typeof doc !== 'object') {
    addIssue(issues, 'root', 'YAML root must be an object containing pipeline.');
    return { valid: false, issues };
  }

  const pipeline = doc.pipeline;
  if (!pipeline || typeof pipeline !== 'object') {
    addIssue(issues, 'pipeline', 'Missing required pipeline object.');
    return { valid: false, issues };
  }

  if (!hasValue(pipeline.name)) {
    addIssue(issues, 'pipeline.name', 'Missing or empty pipeline.name.');
  }
  if (!hasValue(pipeline.identifier)) {
    addIssue(issues, 'pipeline.identifier', 'Missing or empty pipeline.identifier.');
  }

  if (!Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
    addIssue(issues, 'pipeline.stages', 'pipeline.stages must be a non-empty array.');
    return { valid: false, issues };
  }

  validateLegacyVariables(pipeline.variables, 'pipeline.variables', issues);

  pipeline.stages.forEach((stageItem: any, stageIndex: number) => {
    const stagePath = `pipeline.stages[${stageIndex}]`;
    const stage = getStageNode(stageItem);

    if (!stage || typeof stage !== 'object') {
      addIssue(issues, stagePath, 'Stage entry must be an object (or { stage: { ... } }).');
      return;
    }

    if (!hasValue(stage.name)) addIssue(issues, `${stagePath}.name`, 'Missing stage.name.');
    if (!hasValue(stage.identifier)) addIssue(issues, `${stagePath}.identifier`, 'Missing stage.identifier.');
    if (!hasValue(stage.type)) addIssue(issues, `${stagePath}.type`, 'Missing stage.type.');
    if (!stage.spec || typeof stage.spec !== 'object') addIssue(issues, `${stagePath}.spec`, 'Missing stage.spec object.');

    const stageType = String(stage.type || '');

    if (hasValue(stage.type) && !LEGACY_STAGE_TYPES.has(stageType)) {
      addIssue(
        issues,
        `${stagePath}.type`,
        `Invalid stage.type ${stageType}. Valid values: CI, Deployment, Custom, Approval, Pipeline.`,
      );
    }

    validateLegacyVariables(stage.variables, `${stagePath}.variables`, issues);

    if (stageType !== 'Approval' && !Array.isArray(stage.failureStrategies)) {
      addIssue(issues, `${stagePath}.failureStrategies`, 'Non-Approval stage should include failureStrategies array.');
    }

    if (stageType === 'CI') {
      if (typeof stage.spec?.cloneCodebase !== 'boolean') {
        addIssue(issues, `${stagePath}.spec.cloneCodebase`, 'CI stage must define boolean spec.cloneCodebase.');
      }

      const hasInfrastructure = stage.spec?.infrastructure !== undefined;
      const hasRuntime = stage.spec?.runtime !== undefined;

      if (!hasInfrastructure && !hasRuntime) {
        addIssue(
          issues,
          `${stagePath}.spec`,
          'CI stage must define one execution backend: spec.runtime (Harness Cloud) or spec.infrastructure (Kubernetes/VM/etc).',
        );
      }

      if (hasInfrastructure && hasRuntime) {
        addIssue(
          issues,
          `${stagePath}.spec`,
          'CI stage must use either spec.runtime or spec.infrastructure, not both.',
        );
      }

      if (hasInfrastructure && (!stage.spec?.infrastructure || typeof stage.spec.infrastructure !== 'object' || Array.isArray(stage.spec.infrastructure))) {
        addIssue(issues, `${stagePath}.spec.infrastructure`, 'CI stage spec.infrastructure must be an object when provided.');
      }

      if (hasRuntime) {
        const runtime = stage.spec?.runtime;

        if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
          addIssue(issues, `${stagePath}.spec.runtime`, 'CI stage spec.runtime must be an object when provided.');
        } else {
          if (!hasValue(runtime.type)) {
            addIssue(issues, `${stagePath}.spec.runtime.type`, 'CI runtime must define non-empty type.');
          } else if (!['Cloud', 'Docker'].includes(String(runtime.type))) {
            addIssue(issues, `${stagePath}.spec.runtime.type`, 'Invalid CI runtime type. Valid values: Cloud, Docker.');
          }

          if (!runtime.spec || typeof runtime.spec !== 'object' || Array.isArray(runtime.spec)) {
            addIssue(issues, `${stagePath}.spec.runtime.spec`, 'CI runtime must define spec object.');
          }
        }
      }

      if (!hasExecutionSteps(stage.spec?.execution)) {
        addIssue(issues, `${stagePath}.spec.execution`, 'CI stage execution must include steps or stepGroups.');
      }

      validateLegacyStepTypes(stage.spec?.execution, `${stagePath}.spec.execution`, issues);
    }

    if (stageType === 'Deployment') {
      if (!hasValue(stage.spec?.deploymentType)) {
        addIssue(issues, `${stagePath}.spec.deploymentType`, 'Deployment stage must define spec.deploymentType.');
      }
      if (stage.spec?.deploymentType === 'Custom') {
        addIssue(
          issues,
          `${stagePath}.spec.deploymentType`,
          'deploymentType: Custom is invalid. Use CustomDeployment, or fallback to stage.type: Custom for non-native deploy types.',
        );
      }
      const hasServiceRef = hasValue(stage.spec?.service?.serviceRef);
      const hasServiceUseFromStage = hasValue(stage.spec?.service?.useFromStage?.stage);
      const hasServiceConfig = stage.spec?.serviceConfig !== undefined;
      const hasServices = stage.spec?.services !== undefined;

      if (!hasServiceRef && !hasServiceUseFromStage && !hasServiceConfig && !hasServices) {
        addIssue(
          issues,
          `${stagePath}.spec.service`,
          'Deployment stage must define one of service.serviceRef, service.useFromStage.stage, serviceConfig, or services.',
        );
      }

      if (stage.spec?.service?.useFromStage !== undefined && !hasServiceUseFromStage) {
        addIssue(
          issues,
          `${stagePath}.spec.service.useFromStage.stage`,
          'service.useFromStage must include non-empty stage.',
        );
      }

      if (hasServiceConfig) {
        validateServiceConfigShape(stage.spec.serviceConfig, `${stagePath}.spec.serviceConfig`, issues);
      }
      if (!hasValue(stage.spec?.environment?.environmentRef)) {
        addIssue(issues, `${stagePath}.spec.environment.environmentRef`, 'Deployment stage must define non-empty environment.environmentRef.');
      }
      if (typeof stage.spec?.environment?.deployToAll !== 'boolean') {
        addIssue(issues, `${stagePath}.spec.environment.deployToAll`, 'Deployment stage must define boolean environment.deployToAll.');
      }

      if (stage.spec?.environment?.properties !== undefined) {
        addIssue(
          issues,
          `${stagePath}.spec.environment.properties`,
          'Deployment stage environment must not include properties block. Remove environment.properties.* structure.',
        );
      }

      const infraDefs = stage.spec?.environment?.infrastructureDefinitions;
      if (!Array.isArray(infraDefs) || infraDefs.length === 0) {
        addIssue(issues, `${stagePath}.spec.environment.infrastructureDefinitions`, 'Deployment stage must define non-empty infrastructureDefinitions array.');
      } else {
        infraDefs.forEach((infra: any, infraIndex: number) => {
          const infraPath = `${stagePath}.spec.environment.infrastructureDefinitions[${infraIndex}]`;
          const hasInlineType = hasValue(infra?.type) || infra?.spec !== undefined;

          if (hasInlineType) {
            validateInlineInfrastructureDefinition(infra, infraPath, issues, false);
            return;
          }

          if (!hasValue(infra?.identifier)) {
            addIssue(issues, `${infraPath}.identifier`, 'Infrastructure definition must include identifier.');
          }
        });
      }

      if (stage.spec?.infrastructure !== undefined) {
        const pipelineInfra = stage.spec.infrastructure;
        const infraPath = `${stagePath}.spec.infrastructure`;

        if (!pipelineInfra || typeof pipelineInfra !== 'object' || Array.isArray(pipelineInfra)) {
          addIssue(issues, infraPath, 'spec.infrastructure must be an object when provided.');
        } else {
          const hasUseFromStage = hasValue(pipelineInfra?.useFromStage?.stage);
          const hasInlineInfraDef = pipelineInfra?.infrastructureDefinition !== undefined;

          if (!hasUseFromStage && !hasInlineInfraDef) {
            addIssue(
              issues,
              infraPath,
              'spec.infrastructure must include useFromStage.stage or infrastructureDefinition.',
            );
          }

          if (pipelineInfra?.useFromStage !== undefined && !hasUseFromStage) {
            addIssue(issues, `${infraPath}.useFromStage.stage`, 'spec.infrastructure.useFromStage must include non-empty stage.');
          }

          if (hasInlineInfraDef) {
            validateInlineInfrastructureDefinition(
              pipelineInfra.infrastructureDefinition,
              `${infraPath}.infrastructureDefinition`,
              issues,
              true,
            );
          }
        }
      }

      if (stage.spec?.environmentInputs === '<+input>') {
        addIssue(issues, `${stagePath}.spec.environmentInputs`, 'Avoid placeholder-only environmentInputs: <+input>.');
      }
      if (stage.spec?.serviceOverrideInputs === '<+input>') {
        addIssue(issues, `${stagePath}.spec.serviceOverrideInputs`, 'Avoid placeholder-only serviceOverrideInputs: <+input>.');
      }
      if (stage.spec?.environment?.infrastructureDefinitions === '<+input>') {
        addIssue(issues, `${stagePath}.spec.environment.infrastructureDefinitions`, 'Avoid placeholder-only infrastructureDefinitions: <+input>.');
      }

      if (!hasExecutionSteps(stage.spec?.execution)) {
        addIssue(issues, `${stagePath}.spec.execution`, 'Deployment stage execution must include steps or stepGroups.');
      }

      validateLegacyStepTypes(stage.spec?.execution, `${stagePath}.spec.execution`, issues);
    }

    if (stageType === 'Custom') {
      if (!hasExecutionSteps(stage.spec?.execution)) {
        addIssue(issues, `${stagePath}.spec.execution`, 'Custom stage execution must include steps or stepGroups.');
      }

      validateLegacyStepTypes(stage.spec?.execution, `${stagePath}.spec.execution`, issues);
    }
  });

  scanForAzureExpressions(doc, 'pipeline', issues);

  return {
    valid: issues.every(issue => issue.severity !== 'error'),
    issues,
  };
};

export const formatHarnessValidationResult = (result: HarnessValidationResult): string => {
  const status = result.valid ? 'PASS' : 'FAIL';
  const lines = [
    'local_harness_shape_validation:',
    `status: ${status}`,
    `error_count: ${result.issues.filter(i => i.severity === 'error').length}`,
    `warning_count: ${result.issues.filter(i => i.severity === 'warning').length}`,
  ];

  if (result.issues.length === 0) {
    lines.push('issues: []');
    return lines.join('\n');
  }

  lines.push('issues:');
  result.issues.forEach((issue) => {
    lines.push(`- [${issue.severity.toUpperCase()}] ${issue.path}: ${issue.message}`);
  });

  return lines.join('\n');
};

export const formatHarnessV1ValidationResult = (result: HarnessValidationResult): string => {
  const status = result.valid ? 'PASS' : 'FAIL';
  const lines = [
    'local_harness_v1_validation:',
    `status: ${status}`,
    `error_count: ${result.issues.filter(i => i.severity === 'error').length}`,
    `warning_count: ${result.issues.filter(i => i.severity === 'warning').length}`,
  ];

  if (result.issues.length === 0) {
    lines.push('issues: []');
    return lines.join('\n');
  }

  lines.push('issues:');
  result.issues.forEach((issue) => {
    lines.push(`- [${issue.severity.toUpperCase()}] ${issue.path}: ${issue.message}`);
  });

  return lines.join('\n');
};
