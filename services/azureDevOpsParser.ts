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

const buildSplitArtifacts = (
  bundle: AzureDevOpsBundle,
  releaseDefinitions: { fileName: string; content: string; type: string }[]
): AzureSplitArtifacts => {
  const splitArtifacts: AzureSplitArtifacts = {
    pipeline_meta: {
      files: [],
      template_references: [],
      resources_summary: [],
      output_variable_links: [],
      deployment_lifecycle_index: [],
      expression_evidence: [],
      classification_summary: {
        ciStages: 0,
        cdStages: 0,
        unknownStages: 0,
        ciJobs: 0,
        cdJobs: 0,
        unknownJobs: 0,
        hasClassicRelease: releaseDefinitions.length > 0
      }
    },
    ci_definition: {
      stages: [],
      jobs: [],
      templates: [],
      unresolvedReferences: [],
      output_variable_links: []
    },
    cd_definition: {
      stages: [],
      jobs: [],
      release_definitions: [],
      templates: [],
      unresolvedReferences: [],
      output_variable_links: [],
      lifecycle_hooks: [],
      unsupportedTechnologyCandidates: []
    }
  };

  Object.entries(bundle.pipelines).forEach(([fileName, content]) => {
    try {
      const pipeline = yaml.load(content) as AzureDevOpsPipeline & { jobs?: AzureDevOpsJob[] };
      const templateReferences = collectTemplateReferences(pipeline);
      const expressionEvidence = extractExpressionEvidence(content);
      const resourceSummary = extractResourceSummary((pipeline as any)?.resources);
      const fileOutputVariableLinks: AzureOutputVariableLink[] = [];
      const fileLifecycleSignals: AzureLifecycleHookSignal[] = [];

      fileOutputVariableLinks.push(
        ...collectOutputReferenceLinksFromNode(fileName, pipeline, {
          contextPath: '$'
        })
      );

      splitArtifacts.pipeline_meta.files.push({
        fileName,
        name: pipeline?.name || fileName,
        trigger: pipeline?.trigger,
        pr: pipeline?.pr,
        schedules: pipeline?.schedules,
        variables: pipeline?.variables,
        resources: pipeline?.resources,
        parameters: pipeline?.parameters,
        hasStages: Array.isArray(pipeline?.stages),
        hasRootJobs: Array.isArray((pipeline as any)?.jobs) || (!!(pipeline as any)?.jobs && typeof (pipeline as any)?.jobs === 'object'),
        hasRootSteps: Array.isArray((pipeline as any)?.steps),
        expressionEvidence,
        resourceSummary,
        templateReferences,
        stageSkeleton: (pipeline?.stages || []).map((stage, index) => {
          const stageClassification = classifyStage(stage);
          updateStageCounts(splitArtifacts, stageClassification.kind);
          return {
            index,
            stageName: stage.displayName || stage.stage || `stage_${index + 1}`,
            dependsOn: stage.dependsOn,
            condition: stage.condition,
            classification: stageClassification.kind,
            confidence: stageClassification.confidence,
            reasons: stageClassification.reasons,
            jobCount: stage.jobs?.length || 0
          };
        }),
        outputVariableLinks: fileOutputVariableLinks,
        deploymentLifecycleSignals: fileLifecycleSignals
      });

      splitArtifacts.pipeline_meta.resources_summary.push({
        fileName,
        ...resourceSummary
      });
      splitArtifacts.pipeline_meta.expression_evidence.push({
        fileName,
        ...expressionEvidence
      });

      splitArtifacts.pipeline_meta.template_references.push(...templateReferences);

      if (Array.isArray(pipeline?.stages)) {
        pipeline.stages.forEach((stage, stageIndex) => {
          const stageName = stage.displayName || stage.stage || `stage_${stageIndex + 1}`;
          const stageClassification = classifyStage(stage);
          const stageOutputReferences = collectOutputReferenceLinksFromNode(fileName, stage, {
            stageName,
            contextPath: `$.stages[${stageIndex}]`
          });
          fileOutputVariableLinks.push(...stageOutputReferences);

          const normalizedStage = {
            fileName,
            stageName,
            raw: stage,
            classification: stageClassification.kind,
            confidence: stageClassification.confidence,
            reasons: stageClassification.reasons,
            outputVariableReferences: stageOutputReferences
          };

          if (stageClassification.kind === 'cd') {
            splitArtifacts.cd_definition.stages.push(normalizedStage);
          } else {
            splitArtifacts.ci_definition.stages.push(normalizedStage);
          }

          (stage.jobs || []).forEach((job, jobIndex) => {
            const jobName = job.displayName || (job as any).deployment || job.job || `job_${jobIndex + 1}`;
            const jobClassification = classifyJob(job);
            updateJobCounts(splitArtifacts, jobClassification.kind);
            const jobOutputVariableLinks = collectJobOutputVariableLinks(fileName, stageName, jobName, job, `$.stages[${stageIndex}].jobs[${jobIndex}]`);
            const lifecycleSignal = extractDeploymentLifecycleSignal(fileName, stageName, jobName, job, `$.stages[${stageIndex}].jobs[${jobIndex}]`);
            fileOutputVariableLinks.push(...jobOutputVariableLinks);
            if (lifecycleSignal) {
              fileLifecycleSignals.push(lifecycleSignal);
              splitArtifacts.cd_definition.lifecycle_hooks.push(lifecycleSignal);
            }

            const normalizedJob = {
              fileName,
              stageName,
              jobName,
              raw: job,
              classification: jobClassification.kind,
              confidence: jobClassification.confidence,
              reasons: jobClassification.reasons,
              outputVariableLinks: jobOutputVariableLinks,
              deploymentLifecycle: lifecycleSignal
            };

            if (jobClassification.kind === 'cd') {
              splitArtifacts.cd_definition.jobs.push(normalizedJob);
              splitArtifacts.cd_definition.output_variable_links.push(...jobOutputVariableLinks);
            } else {
              splitArtifacts.ci_definition.jobs.push(normalizedJob);
              splitArtifacts.ci_definition.output_variable_links.push(...jobOutputVariableLinks);
            }
          });
        });
      }

      const rootJobs = (pipeline as any)?.jobs;
      if (Array.isArray(rootJobs)) {
        rootJobs.forEach((job: AzureDevOpsJob, jobIndex: number) => {
          const jobName = job.displayName || (job as any).deployment || job.job || `root_job_${jobIndex + 1}`;
          const jobClassification = classifyJob(job);
          updateJobCounts(splitArtifacts, jobClassification.kind);
          const jobOutputVariableLinks = collectJobOutputVariableLinks(fileName, 'root', jobName, job, `$.jobs[${jobIndex}]`);
          const lifecycleSignal = extractDeploymentLifecycleSignal(fileName, 'root', jobName, job, `$.jobs[${jobIndex}]`);
          fileOutputVariableLinks.push(...jobOutputVariableLinks);
          if (lifecycleSignal) {
            fileLifecycleSignals.push(lifecycleSignal);
            splitArtifacts.cd_definition.lifecycle_hooks.push(lifecycleSignal);
          }

          const normalizedJob = {
            fileName,
            stageName: 'root',
            jobName,
            raw: job,
            classification: jobClassification.kind,
            confidence: jobClassification.confidence,
            reasons: jobClassification.reasons,
            outputVariableLinks: jobOutputVariableLinks,
            deploymentLifecycle: lifecycleSignal
          };

          if (jobClassification.kind === 'cd') {
            splitArtifacts.cd_definition.jobs.push(normalizedJob);
            splitArtifacts.cd_definition.output_variable_links.push(...jobOutputVariableLinks);
          } else {
            splitArtifacts.ci_definition.jobs.push(normalizedJob);
            splitArtifacts.ci_definition.output_variable_links.push(...jobOutputVariableLinks);
          }
        });
      } else if (rootJobs && typeof rootJobs === 'object') {
        Object.entries(rootJobs).forEach(([jobId, job], jobIndex) => {
          const jobData = job as AzureDevOpsJob;
          const jobName = jobData.displayName || (jobData as any).deployment || jobData.job || jobId;
          const jobClassification = classifyJob(jobData);
          updateJobCounts(splitArtifacts, jobClassification.kind);
          const jobOutputVariableLinks = collectJobOutputVariableLinks(fileName, 'root', jobName, jobData, `$.jobs.${jobId || jobIndex}`);
          const lifecycleSignal = extractDeploymentLifecycleSignal(fileName, 'root', jobName, jobData, `$.jobs.${jobId || jobIndex}`);
          fileOutputVariableLinks.push(...jobOutputVariableLinks);
          if (lifecycleSignal) {
            fileLifecycleSignals.push(lifecycleSignal);
            splitArtifacts.cd_definition.lifecycle_hooks.push(lifecycleSignal);
          }

          const normalizedJob = {
            fileName,
            stageName: 'root',
            jobName,
            raw: jobData,
            classification: jobClassification.kind,
            confidence: jobClassification.confidence,
            reasons: jobClassification.reasons,
            outputVariableLinks: jobOutputVariableLinks,
            deploymentLifecycle: lifecycleSignal
          };

          if (jobClassification.kind === 'cd') {
            splitArtifacts.cd_definition.jobs.push(normalizedJob);
            splitArtifacts.cd_definition.output_variable_links.push(...jobOutputVariableLinks);
          } else {
            splitArtifacts.ci_definition.jobs.push(normalizedJob);
            splitArtifacts.ci_definition.output_variable_links.push(...jobOutputVariableLinks);
          }
        });
      }

      splitArtifacts.pipeline_meta.output_variable_links.push(...fileOutputVariableLinks);
      splitArtifacts.pipeline_meta.deployment_lifecycle_index.push(...fileLifecycleSignals);
    } catch (error) {
      console.error(`Error building split artifacts for ${fileName}:`, error);
    }
  });

  Object.entries(bundle.templates).forEach(([fileName, content]) => {
    try {
      const template = yaml.load(content) as any;
      const templateReferences = collectTemplateReferences(template);
      const templateClassification = classifyTemplate(template);

      const normalizedTemplate = {
        fileName,
        classification: templateClassification.kind,
        confidence: templateClassification.confidence,
        reasons: templateClassification.reasons,
        hasStages: Array.isArray(template?.stages),
        hasJobs: Array.isArray(template?.jobs),
        hasSteps: Array.isArray(template?.steps),
        templateReferences,
        raw: template
      };

      if (templateClassification.kind === 'cd') {
        splitArtifacts.cd_definition.templates.push(normalizedTemplate);
      } else {
        splitArtifacts.ci_definition.templates.push(normalizedTemplate);
      }

      splitArtifacts.pipeline_meta.template_references.push(...templateReferences);
    } catch (error) {
      console.error(`Error classifying template ${fileName}:`, error);
    }
  });

  releaseDefinitions.forEach(({ fileName, content }) => {
    try {
      const release = JSON.parse(content) as AzureDevOpsReleaseDefinition;
      const releaseOutputRefs = collectOutputReferenceLinksFromNode(fileName, release, {
        stageName: 'classic_release',
        contextPath: '$.release'
      });
      splitArtifacts.pipeline_meta.output_variable_links.push(...releaseOutputRefs);
      splitArtifacts.cd_definition.output_variable_links.push(...releaseOutputRefs);

      splitArtifacts.cd_definition.release_definitions.push({
        fileName,
        name: release.name || fileName,
        variables: release.variables,
        environments: (release.environments || []).map((env) => ({
          name: env.name,
          rank: env.rank,
          conditions: env.conditions,
          approvals: {
            hasPreDeployManualApproval: Boolean(env.preDeployApprovals?.approvals?.some((a: any) => !a.isAutomated)),
            hasPostDeployManualApproval: Boolean(env.postDeployApprovals?.approvals?.some((a: any) => !a.isAutomated)),
            preDeployApprovalsCount: env.preDeployApprovals?.approvals?.length || 0,
            postDeployApprovalsCount: env.postDeployApprovals?.approvals?.length || 0,
            hasPreDeploymentGates: Boolean(env.preDeploymentGates),
            hasPostDeploymentGates: Boolean(env.postDeploymentGates)
          },
          variables: env.variables,
          deployPhases: (env.deployPhases || []).map((phase) => ({
            name: phase.name,
            phaseType: phase.phaseType,
            deploymentInput: phase.deploymentInput,
            tasks: (phase.workflowTasks || []).map((task) => ({
              name: task.name,
              taskId: task.taskId,
              version: task.version,
              condition: task.condition,
              inputs: task.inputs
            }))
          })),
          lifecycleSignals: {
            sourceType: 'classic_release_environment',
            strategyType: 'classic_release',
            lifecycleHooks: [
              ...(env.preDeployApprovals?.approvals?.length ? ['preDeployApproval'] : []),
              ...(env.preDeploymentGates ? ['preDeploymentGates'] : []),
              'deploy',
              ...(env.postDeploymentGates ? ['postDeploymentGates'] : []),
              ...(env.postDeployApprovals?.approvals?.length ? ['postDeployApproval'] : [])
            ]
          }
        }))
      });

      (release.environments || []).forEach((env, envIndex) => {
        const lifecycleHooks = [
          ...(env.preDeployApprovals?.approvals?.length ? ['preDeployApproval'] : []),
          ...(env.preDeploymentGates ? ['preDeploymentGates'] : []),
          'deploy',
          ...(env.postDeploymentGates ? ['postDeploymentGates'] : []),
          ...(env.postDeployApprovals?.approvals?.length ? ['postDeployApproval'] : [])
        ];
        const lifecycleSignal: AzureLifecycleHookSignal = {
          fileName,
          stageName: env.name || `environment_${envIndex + 1}`,
          jobName: env.name || `environment_${envIndex + 1}`,
          contextPath: `$.release.environments[${envIndex}]`,
          sourceType: 'classic_release_environment',
          strategyType: 'classic_release',
          lifecycleHooks,
          isDeploymentJob: true,
          hasEnvironment: true,
          environmentType: 'classic_release_environment',
          environmentRef: env.name
        };
        splitArtifacts.pipeline_meta.deployment_lifecycle_index.push(lifecycleSignal);
        splitArtifacts.cd_definition.lifecycle_hooks.push(lifecycleSignal);
      });
    } catch (error) {
      console.error(`Error extracting release definition split artifacts from ${fileName}:`, error);
    }
  });

  splitArtifacts.pipeline_meta.template_references.forEach((reference) => {
    if (reference.external) {
      splitArtifacts.ci_definition.unresolvedReferences.push(reference);
      splitArtifacts.cd_definition.unresolvedReferences.push(reference);
    }
  });

  splitArtifacts.cd_definition.jobs.forEach((job) => {
    const jobName = String(job.jobName || '').toLowerCase();
    if (jobName.includes('iac') || jobName.includes('terraform') || jobName.includes('ansible') || jobName.includes('chef') || jobName.includes('puppet')) {
      splitArtifacts.cd_definition.unsupportedTechnologyCandidates.push(job.jobName);
    }
  });

  splitArtifacts.pipeline_meta.template_references = uniqueTemplateReferences(splitArtifacts.pipeline_meta.template_references);
  splitArtifacts.pipeline_meta.output_variable_links = dedupeOutputVariableLinks(splitArtifacts.pipeline_meta.output_variable_links);
  splitArtifacts.pipeline_meta.deployment_lifecycle_index = dedupeLifecycleHookSignals(splitArtifacts.pipeline_meta.deployment_lifecycle_index);
  splitArtifacts.pipeline_meta.expression_evidence = splitArtifacts.pipeline_meta.expression_evidence.map((entry) => ({
    ...entry,
    macroExpressions: uniqueStrings(entry.macroExpressions),
    templateExpressions: uniqueStrings(entry.templateExpressions),
    runtimeExpressions: uniqueStrings(entry.runtimeExpressions),
    dependencyOutputExpressions: uniqueStrings(entry.dependencyOutputExpressions)
  }));
  splitArtifacts.ci_definition.unresolvedReferences = uniqueTemplateReferences(splitArtifacts.ci_definition.unresolvedReferences);
  splitArtifacts.ci_definition.output_variable_links = dedupeOutputVariableLinks(splitArtifacts.ci_definition.output_variable_links);
  splitArtifacts.cd_definition.unresolvedReferences = uniqueTemplateReferences(splitArtifacts.cd_definition.unresolvedReferences);
  splitArtifacts.cd_definition.output_variable_links = dedupeOutputVariableLinks(splitArtifacts.cd_definition.output_variable_links);
  splitArtifacts.cd_definition.lifecycle_hooks = dedupeLifecycleHookSignals(splitArtifacts.cd_definition.lifecycle_hooks);
  splitArtifacts.cd_definition.unsupportedTechnologyCandidates = [...new Set(splitArtifacts.cd_definition.unsupportedTechnologyCandidates)];

  return splitArtifacts;
};

const classifyTemplate = (template: any): ClassificationResult => {
  const reasons: string[] = [];
  let ciScore = 0;
  let cdScore = 0;

  if (Array.isArray(template?.stages)) {
    template.stages.forEach((stage: AzureDevOpsStage) => {
      const stageClassification = classifyStage(stage);
      reasons.push(`stage:${stage.displayName || stage.stage || 'unnamed'}=${stageClassification.kind}`);
      if (stageClassification.kind === 'ci') ciScore += stageClassification.confidence;
      if (stageClassification.kind === 'cd') cdScore += stageClassification.confidence;
    });
  }

  if (Array.isArray(template?.jobs)) {
    template.jobs.forEach((job: AzureDevOpsJob) => {
      const jobClassification = classifyJob(job);
      reasons.push(`job:${job.displayName || job.job || 'unnamed'}=${jobClassification.kind}`);
      if (jobClassification.kind === 'ci') ciScore += jobClassification.confidence;
      if (jobClassification.kind === 'cd') cdScore += jobClassification.confidence;
    });
  }

  if (Array.isArray(template?.steps)) {
    template.steps.forEach((step: AzureDevOpsStep) => {
      const stepClassification = classifyStep(step);
      if (stepClassification.kind === 'ci') ciScore += stepClassification.confidence;
      if (stepClassification.kind === 'cd') cdScore += stepClassification.confidence;
    });
  }

  if (cdScore > ciScore) {
    return { kind: 'cd', confidence: Math.min(1, cdScore / Math.max(1, cdScore + ciScore)), reasons };
  }
  if (ciScore > 0) {
    return { kind: 'ci', confidence: Math.min(1, ciScore / Math.max(1, cdScore + ciScore)), reasons };
  }

  return { kind: 'unknown', confidence: 0.25, reasons: reasons.length > 0 ? reasons : ['no clear CI/CD indicators found'] };
};

const classifyStage = (stage: AzureDevOpsStage): ClassificationResult => {
  const reasons: string[] = [];
  let ciScore = 0;
  let cdScore = 0;

  const stageName = `${stage.stage || ''} ${stage.displayName || ''}`.toLowerCase();
  if (containsAny(stageName, ['deploy', 'release', 'prod', 'uat', 'qa', 'environment'])) {
    cdScore += 0.45;
    reasons.push('stage name suggests deployment/release environment');
  }
  if (containsAny(stageName, ['build', 'test', 'lint', 'compile', 'package'])) {
    ciScore += 0.35;
    reasons.push('stage name suggests build/test workflow');
  }

  (stage.jobs || []).forEach((job) => {
    const jobClassification = classifyJob(job);
    reasons.push(...jobClassification.reasons);
    if (jobClassification.kind === 'cd') cdScore += jobClassification.confidence;
    if (jobClassification.kind === 'ci') ciScore += jobClassification.confidence;
  });

  if (cdScore > ciScore) {
    return { kind: 'cd', confidence: Math.min(1, cdScore / Math.max(1, cdScore + ciScore)), reasons };
  }

  if (ciScore > 0) {
    return { kind: 'ci', confidence: Math.min(1, ciScore / Math.max(1, cdScore + ciScore)), reasons };
  }

  return { kind: 'unknown', confidence: 0.3, reasons: ['no jobs or conditions strongly indicate CI or CD'] };
};

const classifyJob = (job: AzureDevOpsJob & { deployment?: string; environment?: any }): ClassificationResult => {
  const reasons: string[] = [];
  let ciScore = 0;
  let cdScore = 0;

  const deploymentJob = Boolean((job as any).deployment);
  const hasEnvironment = Boolean((job as any).environment);
  const strategy = (job as any)?.strategy;

  if (deploymentJob) {
    cdScore += 0.95;
    reasons.push('deployment job keyword found');
  }
  if (hasEnvironment) {
    cdScore += 0.75;
    reasons.push('job.environment detected (deployment semantics)');
  }
  if (strategy && (strategy.runOnce || strategy.canary || strategy.rolling)) {
    cdScore += 0.85;
    reasons.push('deployment strategy (runOnce/canary/rolling) detected');
  }

  const jobName = `${job.job || ''} ${job.displayName || ''}`.toLowerCase();
  if (containsAny(jobName, ['deploy', 'release', 'promotion'])) {
    cdScore += 0.4;
    reasons.push('job name suggests deployment');
  }
  if (containsAny(jobName, ['build', 'test', 'lint', 'compile', 'package'])) {
    ciScore += 0.35;
    reasons.push('job name suggests CI build/test');
  }

  (job.steps || []).forEach((step) => {
    const stepClassification = classifyStep(step);
    reasons.push(...stepClassification.reasons);
    if (stepClassification.kind === 'cd') cdScore += stepClassification.confidence;
    if (stepClassification.kind === 'ci') ciScore += stepClassification.confidence;
  });

  if (cdScore > ciScore) {
    return { kind: 'cd', confidence: Math.min(1, cdScore / Math.max(1, cdScore + ciScore)), reasons };
  }

  if (ciScore > 0) {
    return { kind: 'ci', confidence: Math.min(1, ciScore / Math.max(1, cdScore + ciScore)), reasons };
  }

  return { kind: 'unknown', confidence: 0.25, reasons: ['no job-level CI/CD markers found'] };
};

const classifyStep = (step: AzureDevOpsStep): ClassificationResult => {
  const reasons: string[] = [];
  let ciScore = 0;
  let cdScore = 0;

  const taskName = String(step.task || '').toLowerCase();
  const displayName = `${step.displayName || ''} ${step.name || ''}`.toLowerCase();
  const script = String(step.script || step.bash || step.pwsh || step.powershell || '').toLowerCase();

  if (containsAny(taskName, ['azurewebapp', 'kubernetes', 'helmdeploy', 'iiswebappdeployment', 'ssh', 'windowsmachinefilecopy', 'azurecli'])) {
    cdScore += 0.7;
    reasons.push('deployment-oriented Azure task detected');
  }
  if (containsAny(taskName, ['publishbuildartifacts', 'downloadbuildartifacts', 'publishpipelineartifact', 'downloadpipelineartifact'])) {
    ciScore += 0.45;
    reasons.push('artifact flow task detected');
  }
  if (containsAny(taskName, ['vstest', 'dotnetcorecli', 'nugetcommand', 'npm', 'maven', 'gradle', 'node', 'docker'])) {
    ciScore += 0.6;
    reasons.push('build/test toolchain task detected');
  }

  if (containsAny(displayName, ['deploy', 'release', 'promote'])) {
    cdScore += 0.4;
    reasons.push('step name suggests deployment/release');
  }
  if (containsAny(displayName, ['build', 'test', 'lint', 'package', 'compile'])) {
    ciScore += 0.35;
    reasons.push('step name suggests build/test/package');
  }

  if (containsAny(script, ['kubectl', 'helm ', 'az webapp', 'az functionapp', 'terraform apply', 'ansible-playbook'])) {
    cdScore += 0.65;
    reasons.push('deployment/IaC command detected in script');
  }
  if (containsAny(script, ['mvn ', 'gradle ', 'npm ', 'yarn ', 'dotnet build', 'dotnet test', 'go test', 'docker build'])) {
    ciScore += 0.55;
    reasons.push('build/test command detected in script');
  }

  if (cdScore > ciScore) {
    return { kind: 'cd', confidence: Math.min(1, cdScore / Math.max(1, cdScore + ciScore)), reasons };
  }
  if (ciScore > 0) {
    return { kind: 'ci', confidence: Math.min(1, ciScore / Math.max(1, cdScore + ciScore)), reasons };
  }

  return { kind: 'unknown', confidence: 0.2, reasons: ['no strong CI/CD step indicators found'] };
};

const collectTemplateReferences = (node: any, currentPath = '$'): TemplateReference[] => {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const refs: TemplateReference[] = [];

  if (typeof node.template === 'string') {
    refs.push({
      template: node.template,
      contextPath: currentPath,
      repository: node.repository,
      external: Boolean(node.repository)
    });
  }

  if (typeof node.extends?.template === 'string') {
    refs.push({
      template: node.extends.template,
      contextPath: `${currentPath}.extends`,
      repository: node.extends.repository,
      external: Boolean(node.extends.repository)
    });
  }

  Object.entries(node).forEach(([key, value]) => {
    const childPath = `${currentPath}.${key}`;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        refs.push(...collectTemplateReferences(item, `${childPath}[${index}]`));
      });
    } else if (value && typeof value === 'object') {
      refs.push(...collectTemplateReferences(value, childPath));
    }
  });

  return refs;
};

const uniqueTemplateReferences = (refs: TemplateReference[]): TemplateReference[] => {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.template}|${ref.contextPath}|${ref.repository || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractExpressionEvidence = (content: string): AzureExpressionEvidence => {
  const macroExpressions = content.match(/\$\([^)]+\)/g) || [];
  const templateExpressions = content.match(/\$\{\{[\s\S]*?\}\}/g) || [];
  const runtimeExpressions = content.match(/\$\[[\s\S]*?\]/g) || [];
  const dependencyOutputExpressions = content.match(/(?:stageDependencies|dependencies)\.[A-Za-z0-9_.\[\]'"-]+/g) || [];

  return {
    macroExpressions: uniqueStrings(macroExpressions),
    templateExpressions: uniqueStrings(templateExpressions),
    runtimeExpressions: uniqueStrings(runtimeExpressions),
    dependencyOutputExpressions: uniqueStrings(dependencyOutputExpressions)
  };
};

const extractResourceSummary = (resources: any): AzureResourceSummary => {
  if (!resources || typeof resources !== 'object') {
    return {
      hasResources: false,
      kinds: [],
      repositories: [],
      pipelines: [],
      containers: [],
      packages: [],
      builds: [],
      webhooks: []
    };
  }

  const repositories = Array.isArray(resources.repositories)
    ? resources.repositories.map((repo: any) => ({
        alias: repo?.repository,
        type: repo?.type,
        name: repo?.name,
        ref: repo?.ref,
        endpoint: repo?.endpoint
      }))
    : [];

  const pipelines = Array.isArray(resources.pipelines)
    ? resources.pipelines.map((pipeline: any) => ({
        alias: pipeline?.pipeline,
        source: pipeline?.source,
        project: pipeline?.project,
        branch: pipeline?.branch,
        tags: Array.isArray(pipeline?.tags) ? pipeline.tags : [],
        hasTrigger: Boolean(pipeline?.trigger)
      }))
    : [];

  const containers = Array.isArray(resources.containers)
    ? resources.containers.map((container: any) => ({
        alias: container?.container,
        image: container?.image,
        endpoint: container?.endpoint,
        trigger: container?.trigger
      }))
    : [];

  const packages = Array.isArray(resources.packages)
    ? resources.packages.map((pkg: any) => ({
        alias: pkg?.package,
        type: pkg?.type,
        name: pkg?.name,
        version: pkg?.version
      }))
    : [];

  const builds = Array.isArray(resources.builds)
    ? resources.builds.map((build: any) => ({
        alias: build?.build,
        type: build?.type,
        source: build?.source,
        project: build?.project,
        version: build?.version
      }))
    : [];

  const webhooks = Array.isArray(resources.webhooks)
    ? resources.webhooks.map((webhook: any) => ({
        alias: webhook?.webhook,
        connection: webhook?.connection,
        filtersCount: Array.isArray(webhook?.filters) ? webhook.filters.length : 0
      }))
    : [];

  const kinds = [
    repositories.length > 0 ? 'repositories' : '',
    pipelines.length > 0 ? 'pipelines' : '',
    containers.length > 0 ? 'containers' : '',
    packages.length > 0 ? 'packages' : '',
    builds.length > 0 ? 'builds' : '',
    webhooks.length > 0 ? 'webhooks' : ''
  ].filter(Boolean);

  return {
    hasResources: kinds.length > 0,
    kinds,
    repositories,
    pipelines,
    containers,
    packages,
    builds,
    webhooks
  };
};

const collectJobOutputVariableLinks = (
  fileName: string,
  stageName: string,
  jobName: string,
  job: AzureDevOpsJob,
  contextPath: string
): AzureOutputVariableLink[] => {
  const links: AzureOutputVariableLink[] = [];

  (job.steps || []).forEach((step, stepIndex) => {
    const scriptBody = getStepScript(step);
    if (!scriptBody) {
      return;
    }

    const setVarMatches = scriptBody.match(/##vso\[task\.setvariable[^\]]+\]/gi) || [];
    setVarMatches.forEach((match) => {
      const variableNameMatch = match.match(/variable=([^;\]]+)/i);
      const isOutput = /isoutput=true/i.test(match);
      if (!isOutput) {
        return;
      }

      links.push({
        fileName,
        stageName,
        jobName,
        scope: 'set',
        contextPath: `${contextPath}.steps[${stepIndex}]`,
        producerStep: step.name || step.displayName || `step_${stepIndex + 1}`,
        variableName: variableNameMatch?.[1]?.trim()
      });
    });
  });

  links.push(
    ...collectOutputReferenceLinksFromNode(fileName, job, {
      stageName,
      jobName,
      contextPath
    })
  );

  return links;
};

const collectOutputReferenceLinksFromNode = (
  fileName: string,
  node: any,
  context: { stageName?: string; jobName?: string; contextPath: string }
): AzureOutputVariableLink[] => {
  const links: AzureOutputVariableLink[] = [];

  if (!node || typeof node !== 'object') {
    return links;
  }

  const traverse = (value: any, path: string) => {
    if (typeof value === 'string') {
      const matches = value.match(/(?:stageDependencies|dependencies)\.[A-Za-z0-9_.\[\]'"-]+/g) || [];
      matches.forEach((expression) => {
        links.push({
          fileName,
          stageName: context.stageName || 'unknown',
          jobName: context.jobName || 'unknown',
          scope: 'generic_reference',
          contextPath: path,
          referenceExpression: expression,
          referencePath: path
        });
      });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => traverse(item, `${path}[${index}]`));
      return;
    }

    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => {
        traverse(child, `${path}.${key}`);
      });
    }
  };

  traverse(node, context.contextPath);
  return links;
};

const extractDeploymentLifecycleSignal = (
  fileName: string,
  stageName: string,
  jobName: string,
  job: AzureDevOpsJob,
  contextPath: string
): AzureLifecycleHookSignal | null => {
  const jobData = job as any;
  const strategy = jobData?.strategy || {};
  const hasRunOnce = Boolean(strategy.runOnce);
  const hasRolling = Boolean(strategy.rolling);
  const hasCanary = Boolean(strategy.canary);
  const strategyType = hasRunOnce ? 'runOnce' : hasRolling ? 'rolling' : hasCanary ? 'canary' : 'none';

  const deploymentBlock = hasRunOnce ? strategy.runOnce : hasRolling ? strategy.rolling : hasCanary ? strategy.canary : null;
  const lifecycleHooks = deploymentBlock
    ? [
        deploymentBlock.preDeploy ? 'preDeploy' : '',
        deploymentBlock.deploy ? 'deploy' : '',
        deploymentBlock.routeTraffic ? 'routeTraffic' : '',
        deploymentBlock.postRouteTraffic ? 'postRouteTraffic' : '',
        deploymentBlock.on?.success ? 'on.success' : '',
        deploymentBlock.on?.failure ? 'on.failure' : ''
      ].filter(Boolean)
    : [];

  const isDeploymentJob = Boolean(jobData?.deployment);
  const hasEnvironment = Boolean(jobData?.environment);
  if (!isDeploymentJob && !hasEnvironment && strategyType === 'none') {
    return null;
  }

  const environmentType = typeof jobData?.environment === 'string'
    ? 'shorthand'
    : jobData?.environment?.resourceType || (hasEnvironment ? 'structured' : 'none');
  const environmentRef = typeof jobData?.environment === 'string'
    ? jobData.environment
    : jobData?.environment?.name;

  const increments = Array.isArray(strategy?.canary?.increments)
    ? strategy.canary.increments
    : strategy?.canary?.increments
      ? [strategy.canary.increments]
      : undefined;

  return {
    fileName,
    stageName,
    jobName,
    contextPath,
    sourceType: 'yaml_deployment_job',
    strategyType,
    lifecycleHooks,
    isDeploymentJob,
    hasEnvironment,
    environmentType,
    environmentRef,
    maxParallel: strategy?.rolling?.maxParallel,
    increments
  };
};

const getStepScript = (step: AzureDevOpsStep): string => {
  if (typeof step.script === 'string') return step.script;
  if (typeof step.bash === 'string') return step.bash;
  if (typeof step.pwsh === 'string') return step.pwsh;
  if (typeof step.powershell === 'string') return step.powershell;
  return '';
};

const dedupeOutputVariableLinks = (links: AzureOutputVariableLink[]): AzureOutputVariableLink[] => {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.fileName}|${link.stageName}|${link.jobName}|${link.scope}|${link.contextPath}|${link.producerStep || ''}|${link.variableName || ''}|${link.referenceExpression || ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const dedupeLifecycleHookSignals = (signals: AzureLifecycleHookSignal[]): AzureLifecycleHookSignal[] => {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.fileName}|${signal.stageName}|${signal.jobName}|${signal.contextPath}|${signal.sourceType}|${signal.strategyType}|${signal.lifecycleHooks.join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const uniqueStrings = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const updateStageCounts = (splitArtifacts: AzureSplitArtifacts, kind: PipelineKind): void => {
  if (kind === 'ci') {
    splitArtifacts.pipeline_meta.classification_summary.ciStages += 1;
  } else if (kind === 'cd') {
    splitArtifacts.pipeline_meta.classification_summary.cdStages += 1;
  } else {
    splitArtifacts.pipeline_meta.classification_summary.unknownStages += 1;
  }
};

const updateJobCounts = (splitArtifacts: AzureSplitArtifacts, kind: PipelineKind): void => {
  if (kind === 'ci') {
    splitArtifacts.pipeline_meta.classification_summary.ciJobs += 1;
  } else if (kind === 'cd') {
    splitArtifacts.pipeline_meta.classification_summary.cdJobs += 1;
  } else {
    splitArtifacts.pipeline_meta.classification_summary.unknownJobs += 1;
  }
};

const containsAny = (text: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => text.includes(keyword));
};

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

type PipelineKind = 'ci' | 'cd' | 'unknown';

interface ClassificationResult {
  kind: PipelineKind;
  confidence: number;
  reasons: string[];
}

interface TemplateReference {
  template: string;
  contextPath: string;
  repository?: string;
  external: boolean;
}

interface AzureExpressionEvidence {
  macroExpressions: string[];
  templateExpressions: string[];
  runtimeExpressions: string[];
  dependencyOutputExpressions: string[];
}

interface AzureResourceSummary {
  hasResources: boolean;
  kinds: string[];
  repositories: Array<{ alias?: string; type?: string; name?: string; ref?: string; endpoint?: string }>;
  pipelines: Array<{ alias?: string; source?: string; project?: string; branch?: string; tags?: string[]; hasTrigger?: boolean }>;
  containers: Array<{ alias?: string; image?: string; endpoint?: string; trigger?: any }>;
  packages: Array<{ alias?: string; type?: string; name?: string; version?: string }>;
  builds: Array<{ alias?: string; type?: string; source?: string; project?: string; version?: string }>;
  webhooks: Array<{ alias?: string; connection?: string; filtersCount?: number }>;
}

interface AzureOutputVariableLink {
  fileName: string;
  stageName: string;
  jobName: string;
  scope: 'set' | 'generic_reference';
  contextPath: string;
  producerStep?: string;
  variableName?: string;
  referencePath?: string;
  referenceExpression?: string;
}

interface AzureLifecycleHookSignal {
  fileName: string;
  stageName: string;
  jobName: string;
  contextPath: string;
  sourceType: 'yaml_deployment_job' | 'classic_release_environment';
  strategyType: string;
  lifecycleHooks: string[];
  isDeploymentJob: boolean;
  hasEnvironment: boolean;
  environmentType: string;
  environmentRef?: string;
  maxParallel?: number | string;
  increments?: number[];
}

interface AzureSplitArtifacts {
  pipeline_meta: {
    files: any[];
    template_references: TemplateReference[];
    resources_summary: Array<AzureResourceSummary & { fileName: string }>;
    output_variable_links: AzureOutputVariableLink[];
    deployment_lifecycle_index: AzureLifecycleHookSignal[];
    expression_evidence: Array<AzureExpressionEvidence & { fileName: string }>;
    classification_summary: {
      ciStages: number;
      cdStages: number;
      unknownStages: number;
      ciJobs: number;
      cdJobs: number;
      unknownJobs: number;
      hasClassicRelease: boolean;
    };
  };
  ci_definition: {
    stages: any[];
    jobs: any[];
    templates: any[];
    unresolvedReferences: TemplateReference[];
    output_variable_links: AzureOutputVariableLink[];
  };
  cd_definition: {
    stages: any[];
    jobs: any[];
    release_definitions: any[];
    templates: any[];
    unresolvedReferences: TemplateReference[];
    output_variable_links: AzureOutputVariableLink[];
    lifecycle_hooks: AzureLifecycleHookSignal[];
    unsupportedTechnologyCandidates: string[];
  };
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

    const splitArtifacts = buildSplitArtifacts(bundle, releaseDefinitions);

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
    const summaryProcess = createSummaryProcess(bundle, splitArtifacts);
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
  const stageClassification = classifyStage(stage);

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
      jobCount: stage.jobs?.length || 0,
      classification: stageClassification.kind,
      classificationConfidence: stageClassification.confidence,
      classificationReasons: stageClassification.reasons
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
  const jobClassification = classifyJob(job);

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
      stepCount: job.steps?.length || 0,
      classification: jobClassification.kind,
      classificationConfidence: jobClassification.confidence,
      classificationReasons: jobClassification.reasons
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

  const stepClassification = classifyStep(step);

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
      scriptType: step.bash ? 'bash' : step.pwsh ? 'pwsh' : step.powershell ? 'powershell' : step.script ? 'script' : undefined,
      classification: stepClassification.kind,
      classificationConfidence: stepClassification.confidence,
      classificationReasons: stepClassification.reasons
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
const createSummaryProcess = (bundle: AzureDevOpsBundle, splitArtifacts: AzureSplitArtifacts): ParsedProcess => {
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
      fileList: bundle.allFiles.map(f => `${f.fileName} (${f.type})`),
      splitArtifacts
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

