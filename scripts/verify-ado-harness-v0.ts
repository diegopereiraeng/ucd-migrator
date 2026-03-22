import { validateHarnessYamlShape } from '../services/harnessYamlValidator';

const assertTrue = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runCase = (name: string, yamlText: string, expectedValid: boolean, expectedIssueContains?: string) => {
  const result = validateHarnessYamlShape(yamlText);
  assertTrue(
    result.valid === expectedValid,
    `[${name}] expected valid=${expectedValid}, got valid=${result.valid}. Issues: ${result.issues.map(i => `${i.path}:${i.message}`).join(' | ')}`
  );

  if (expectedIssueContains) {
    const found = result.issues.some(issue => issue.message.includes(expectedIssueContains));
    assertTrue(found, `[${name}] expected issue containing "${expectedIssueContains}".`);
  }

  console.log(`✔ ${name} -> valid=${result.valid}, errors=${result.issues.filter(i => i.severity === 'error').length}`);
};

const validLegacyYaml = `
pipeline:
  name: Azure Migrated Pipeline
  identifier: AzureMigratedPipeline
  projectIdentifier: Diego
  orgIdentifier: TPM
  variables:
    - name: releaseTag
      type: String
      value: main
  stages:
    - stage:
        name: Build
        identifier: Build
        type: CI
        failureStrategies:
          - onFailure:
              errors:
                - AllErrors
              action:
                type: MarkAsFailure
        spec:
          cloneCodebase: true
          platform:
            os: Linux
            arch: Amd64
          infrastructure:
            type: KubernetesDirect
            spec:
              connectorRef: account.k8s
              namespace: ci
          execution:
            steps:
              - step:
                  type: Run
                  name: Run_1
                  identifier: Run_1
                  spec:
                    shell: Sh
                    command: echo "build"
    - stage:
        name: Deploy
        identifier: Deploy
        type: Deployment
        failureStrategies:
          - onFailure:
              errors:
                - AllErrors
              action:
                type: StageRollback
        spec:
          deploymentType: CustomDeployment
          service:
            serviceRef: svc
          environment:
            environmentRef: env
            deployToAll: false
            infrastructureDefinitions:
              - identifier: infra
          execution:
            steps:
              - step:
                  type: ShellScript
                  name: DeployScript
                  identifier: DeployScript
                  spec:
                    shell: Bash
                    onDelegate: true
                    source:
                      type: Inline
                      spec:
                        script: echo "deploy"
`;

const validCiCloudRuntimeYaml = `
pipeline:
  name: Cloud Runtime CI
  identifier: CloudRuntimeCI
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Build
        identifier: Build
        type: CI
        failureStrategies:
          - onFailure:
              errors:
                - AllErrors
              action:
                type: MarkAsFailure
        spec:
          cloneCodebase: true
          platform:
            os: Windows
            arch: Amd64
          runtime:
            type: Cloud
            spec:
              size: small
          execution:
            steps:
              - step:
                  type: Run
                  name: Run_1
                  identifier: Run_1
                  spec:
                    shell: PowerShell
                    command: Write-Host "build"
`;

const invalidCiDualBackendYaml = `
pipeline:
  name: Invalid CI Backend
  identifier: InvalidCIBackend
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Build
        identifier: Build
        type: CI
        failureStrategies: []
        spec:
          cloneCodebase: true
          platform:
            os: Linux
            arch: Amd64
          runtime:
            type: Cloud
            spec:
              size: small
          infrastructure:
            type: KubernetesDirect
            spec:
              connectorRef: account.k8s
              namespace: ci
          execution:
            steps:
              - step:
                  type: Run
                  name: Run_1
                  identifier: Run_1
                  spec:
                    shell: Sh
                    command: echo "build"
`;

const invalidStageTypeCasingYaml = `
pipeline:
  name: Bad Stage Casing
  identifier: BadStageCasing
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Deploy
        identifier: Deploy
        type: deployment
        failureStrategies: []
        spec:
          deploymentType: CustomDeployment
          service:
            serviceRef: svc
          environment:
            environmentRef: env
            deployToAll: false
            infrastructureDefinitions:
              - identifier: infra
          execution:
            steps:
              - step:
                  type: ShellScript
                  name: DeployScript
                  identifier: DeployScript
                  spec:
                    shell: Bash
                    onDelegate: true
                    source:
                      type: Inline
                      spec:
                        script: echo "deploy"
`;

const invalidVariableTypeYaml = `
pipeline:
  name: Bad Variable Type
  identifier: BadVariableType
  projectIdentifier: Diego
  orgIdentifier: TPM
  variables:
    - name: releaseTag
      type: Expression
      value: main
  stages:
    - stage:
        name: Build
        identifier: Build
        type: CI
        failureStrategies: []
        spec:
          cloneCodebase: true
          infrastructure:
            type: KubernetesDirect
            spec:
              connectorRef: account.k8s
              namespace: ci
          execution:
            steps:
              - step:
                  type: Run
                  name: Run_1
                  identifier: Run_1
                  spec:
                    shell: Sh
                    command: echo "build"
`;

const invalidCustomDeploymentTypeYaml = `
pipeline:
  name: Bad Custom Type
  identifier: BadCustomType
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Deploy
        identifier: Deploy
        type: Deployment
        failureStrategies: []
        spec:
          deploymentType: Custom
          service:
            serviceRef: svc
          environment:
            environmentRef: env
            deployToAll: false
            infrastructureDefinitions:
              - identifier: infra
          execution:
            steps:
              - step:
                  type: ShellScript
                  name: DeployScript
                  identifier: DeployScript
                  spec:
                    shell: Bash
                    onDelegate: true
                    source:
                      type: Inline
                      spec:
                        script: echo "deploy"
`;

const invalidEnvironmentPropertiesYaml = `
pipeline:
  name: Bad Environment Properties
  identifier: BadEnvironmentProperties
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Deploy
        identifier: Deploy
        type: Deployment
        failureStrategies: []
        spec:
          deploymentType: CustomDeployment
          service:
            serviceRef: svc
          environment:
            environmentRef: env
            deployToAll: false
            properties:
              ci:
                codebase:
                  build:
                    type: Build
            infrastructureDefinitions:
              - identifier: infra
          execution:
            steps:
              - step:
                  type: ShellScript
                  name: DeployScript
                  identifier: DeployScript
                  spec:
                    shell: Bash
                    onDelegate: true
                    source:
                      type: Inline
                      spec:
                        script: echo "deploy"
`;

const invalidApprovalStepYaml = `
pipeline:
  name: Bad Approval Step
  identifier: BadApprovalStep
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: CustomDeploy
        identifier: CustomDeploy
        type: Custom
        failureStrategies: []
        spec:
          execution:
            steps:
              - step:
                  type: Approval
                  name: WrongApproval
                  identifier: WrongApproval
                  spec: {}
`;

const invalidServiceConfigMissingUseFromStageYaml = `
pipeline:
  name: Bad ServiceConfig
  identifier: BadServiceConfig
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Deploy
        identifier: Deploy
        type: Deployment
        failureStrategies: []
        spec:
          deploymentType: CustomDeployment
          serviceConfig:
            serviceRef: svc
          environment:
            environmentRef: env
            deployToAll: false
            infrastructureDefinitions:
              - identifier: infra
          execution:
            steps:
              - step:
                  type: ShellScript
                  name: DeployScript
                  identifier: DeployScript
                  spec:
                    shell: Bash
                    onDelegate: true
                    source:
                      type: Inline
                      spec:
                        script: echo "deploy"
`;

const invalidWinRmAzureInfraYaml = `
pipeline:
  name: Bad WinRM Azure Infra
  identifier: BadWinRmAzureInfra
  projectIdentifier: Diego
  orgIdentifier: TPM
  stages:
    - stage:
        name: Deploy
        identifier: Deploy
        type: Deployment
        failureStrategies: []
        spec:
          deploymentType: CustomDeployment
          service:
            serviceRef: svc
          environment:
            environmentRef: env
            deployToAll: false
            infrastructureDefinitions:
              - identifier: infra
          infrastructure:
            environmentRef: env
            infrastructureDefinition:
              type: SshWinRmAzure
              spec:
                connectorRef: account.azure
                credentialsRef: account.azureCred
          execution:
            steps:
              - step:
                  type: ShellScript
                  name: DeployScript
                  identifier: DeployScript
                  spec:
                    shell: Bash
                    onDelegate: true
                    source:
                      type: Inline
                      spec:
                        script: echo "deploy"
`;

runCase('Valid legacy pipeline', validLegacyYaml, true);
runCase('Accept CI runtime Cloud backend', validCiCloudRuntimeYaml, true);
runCase('Reject invalid stage.type casing', invalidStageTypeCasingYaml, false, 'Invalid stage.type deployment');
runCase('Reject CI stage with both runtime and infrastructure', invalidCiDualBackendYaml, false, 'must use either spec.runtime or spec.infrastructure');
runCase('Reject invalid variable type', invalidVariableTypeYaml, false, 'Variable type Expression is invalid');
runCase('Reject deploymentType Custom', invalidCustomDeploymentTypeYaml, false, 'deploymentType: Custom is invalid');
runCase('Reject environment.properties in deployment', invalidEnvironmentPropertiesYaml, false, 'must not include properties block');
runCase('Reject Approval as execution step type', invalidApprovalStepYaml, false, 'Step type Approval is invalid in execution context');
runCase('Reject invalid serviceConfig missing useFromStage', invalidServiceConfigMissingUseFromStageYaml, false, 'serviceConfig requires useFromStage.stage');
runCase('Reject incomplete SshWinRmAzure infrastructure', invalidWinRmAzureInfraYaml, false, 'SshWinRmAzure requires spec.hostConnectionType');

console.log('\nAll Azure Harness legacy v0 validation checks passed.');
