import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAzureDevOps } from '../services/azureDevOpsParser';
import type { ParsedData } from '../types';

type FileInput = {
  fileName: string;
  content: string;
};

type SplitArtifacts = {
  pipeline_meta?: {
    classification_summary?: {
      ciStages?: number;
      cdStages?: number;
      ciJobs?: number;
      cdJobs?: number;
      hasClassicRelease?: boolean;
    };
  };
  ci_definition?: {
    stages?: unknown[];
    jobs?: unknown[];
  };
  cd_definition?: {
    stages?: unknown[];
    jobs?: unknown[];
    release_definitions?: unknown[];
  };
};

const ciOnlyYaml = `
name: ci-only
trigger:
  - main

jobs:
  - job: Build
    displayName: Build
    steps:
      - script: echo "build"
      - script: echo "test"
`;

const cdOnlyYaml = `
name: cd-only
stages:
  - stage: Deploy
    jobs:
      - deployment: DeployWeb
        displayName: Deploy Web
        environment: prod
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "deploy"
`;

const mixedYaml = `
name: mixed
stages:
  - stage: Build
    jobs:
      - job: BuildJob
        steps:
          - script: echo "compile"
  - stage: Deploy
    dependsOn: Build
    jobs:
      - deployment: DeployJob
        environment: prod
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "ship"
`;

const assertTrue = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getSplitArtifacts = (parsed: ParsedData): SplitArtifacts => {
  const summaryStep = parsed.processes
    .flatMap(process => process.mainFlow)
    .find(step => step.id === 'bundle_summary');

  const splitArtifacts = (summaryStep?.properties as any)?.splitArtifacts;
  if (!splitArtifacts) {
    throw new Error('splitArtifacts not found in bundle_summary step');
  }

  return splitArtifacts;
};

const runCase = (
  caseName: string,
  files: FileInput[],
  check: (split: SplitArtifacts) => void
) => {
  const parsed = parseAzureDevOps(files);
  assertTrue(!!parsed, `[${caseName}] parser returned null`);

  const split = getSplitArtifacts(parsed as ParsedData);
  check(split);

  const ciStages = split.pipeline_meta?.classification_summary?.ciStages ?? 0;
  const cdStages = split.pipeline_meta?.classification_summary?.cdStages ?? 0;
  const ciJobs = split.pipeline_meta?.classification_summary?.ciJobs ?? 0;
  const cdJobs = split.pipeline_meta?.classification_summary?.cdJobs ?? 0;

  console.log(`✔ ${caseName} -> ciStages=${ciStages}, cdStages=${cdStages}, ciJobs=${ciJobs}, cdJobs=${cdJobs}`);
};

const releasePath = resolve(process.cwd(), 'ALE-SSIS.json');
const releaseContent = readFileSync(releasePath, 'utf-8');

runCase(
  'CI only',
  [{ fileName: 'ci-only.yml', content: ciOnlyYaml }],
  (split) => {
    const ciJobs = split.ci_definition?.jobs?.length ?? 0;
    const cdJobs = split.cd_definition?.jobs?.length ?? 0;
    assertTrue(ciJobs > 0, '[CI only] expected CI jobs > 0');
    assertTrue(cdJobs === 0, '[CI only] expected CD jobs = 0');
  }
);

runCase(
  'CD only',
  [{ fileName: 'cd-only.yml', content: cdOnlyYaml }],
  (split) => {
    const cdJobs = split.cd_definition?.jobs?.length ?? 0;
    assertTrue(cdJobs > 0, '[CD only] expected CD jobs > 0');
  }
);

runCase(
  'Mixed CI/CD',
  [{ fileName: 'mixed.yml', content: mixedYaml }],
  (split) => {
    const ciJobs = split.ci_definition?.jobs?.length ?? 0;
    const cdJobs = split.cd_definition?.jobs?.length ?? 0;
    assertTrue(ciJobs > 0, '[Mixed CI/CD] expected CI jobs > 0');
    assertTrue(cdJobs > 0, '[Mixed CI/CD] expected CD jobs > 0');
  }
);

runCase(
  'Classic release JSON',
  [{ fileName: 'ALE-SSIS.json', content: releaseContent }],
  (split) => {
    const releases = split.cd_definition?.release_definitions?.length ?? 0;
    const hasClassicRelease = split.pipeline_meta?.classification_summary?.hasClassicRelease;
    assertTrue(releases > 0, '[Classic release JSON] expected release definitions > 0');
    assertTrue(!!hasClassicRelease, '[Classic release JSON] expected hasClassicRelease=true');
  }
);

console.log('\nAll ADO split fixture checks passed.');
