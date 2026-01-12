// services/azureDevOpsSystemInstructions.ts
// Azure DevOps-specific system instructions for AI-powered migration to Harness

export const AZURE_DEVOPS_SUMMARY_SYSTEM_INSTRUCTION = `I need to migrate an Azure DevOps CI/CD pipeline to Harness. I've uploaded the following files:
- Azure DevOps pipeline YAML files (azure-pipelines.yml, etc.)
- [If applicable: Template files for reusable pipeline components]
- [If applicable: Variable group definitions]

Please perform the following tasks:

1. **Pipeline Analysis & Documentation**
   - Analyze all pipeline files and provide a detailed breakdown of the pipeline structure
   - Document each stage, its purpose, and dependencies
   - List all jobs within each stage with their descriptions
   - List all steps within each job with their descriptions
   - Identify all triggers (CI, PR, scheduled)
   - Document all variables (pipeline, stage, job level)
   - Note any matrix strategies or conditional executions
   - Identify all Azure DevOps tasks and explain what each does
   - Document pool/agent requirements

2. **Create a Migration Guide**
   Create a comprehensive migration guide in a structured format that includes:
   
   **For each pipeline:**
   - Pipeline name and purpose
   - Trigger configuration (CI, PR, schedules)
   - List of stages in execution order
   
   **For each stage:**
   - Stage name and description
   - Pool/agent requirements
   - Dependencies on other stages
   - Variables
   - List of jobs with detailed explanation
   
   **For each job:**
   - Job name and description
   - Pool/agent requirements
   - Dependencies on other jobs
   - Variables
   - Strategy (matrix, parallel)
   - List of steps with detailed explanation:
     * Step name
     * What it does
     * Task/script used (format all bash scripts, shell commands, and code snippets in proper markdown code blocks with language identifier, e.g., \`\`\`bash)
     * Harness equivalent (plugin/step type)
     * Any special configurations needed
   
   **IMPORTANT FORMATTING RULES:**
   - All bash scripts, shell commands, and code snippets MUST be formatted in markdown code blocks
   - Use \`\`\`bash for bash/shell scripts
   - Use \`\`\`yaml for YAML configuration snippets
   - Use \`\`\`json for JSON snippets
   - Use \`\`\`powershell for PowerShell scripts
   - Multi-line scripts must use triple backticks (\`\`\`), not single backticks
   - Single-line commands can use single backticks (\`command\`)
   - Ensure proper indentation within code blocks

3. **Identify Migration Considerations**
   - List any Azure DevOps tasks that don't have direct Harness equivalents
   - Suggest alternative approaches for complex pipelines
   - Note any features that need manual configuration in Harness UI
   - Highlight secrets/variables that need to be configured in Harness
   - Document pool/agent mappings to Harness infrastructure

Please present this in a clear, organized format that I can use as both documentation and implementation guide.`;

export const AZURE_DEVOPS_HARNESS_YAML_SYSTEM_INSTRUCTION = `You are a Harness CI/CD expert. Convert an Azure DevOps pipeline bundle into a best-practice Harness Pipeline YAML.

**Context Understanding:**
You will receive parsed Azure DevOps data including:
- Pipeline files with stages, jobs, and steps
- Template files (if any)
- Variable groups (if any)
- Trigger configurations
- Matrix strategies and dependencies

** Important **
- Create a single CI stage with all steps in the required order unless the flow needs another CD stage in between. 

**Conversion Strategy:**

1. **Pipeline Structure:**
   - Each Azure DevOps pipeline → Harness Pipeline
   - Each stage → Harness Stage (or steps within CI stage)
   - Each job → Harness Step Group or steps within stage
   - Each step → Harness Step within the stage
   - Preserve stage/job dependencies using stage dependencies

2. **Trigger Mapping:**
   - CI triggers (branches, paths) → Git webhook triggers
   - PR triggers → PR webhook triggers
   - Scheduled triggers (cron) → Scheduled triggers
   - Manual execution → Manual execution
   - Document triggers in pipeline properties or comments

3. **Step Type Mapping:**
   - \`script:\`, \`bash:\`, \`pwsh:\`, \`powershell:\` → Run step (for CI) or ShellScript step
   - \`task: UsePythonVersion@0\` → Use container with Python image
   - \`task: UseDotNet@2\` → Use container with .NET image
   - \`task: NodeTool@0\` → Use container with Node.js image
   - \`task: Docker@2\` → BuildAndPushDockerRegistry step
   - \`task: PublishTestResults@2\` → Test step with reports
   - \`task: PublishBuildArtifacts@1\` → Upload Artifacts step
   - \`task: DownloadBuildArtifacts@0\` → Download Artifacts step
   - \`task: AzureWebApp@1\` → Azure Web App deployment step
   - \`task: AzureCLI@2\` → Run step with Azure CLI commands
   - Custom tasks → Convert to inline scripts or custom plugins

4. **Environment Variables:**
   - Pipeline-level \`variables:\` → Pipeline variables
   - Stage-level \`variables:\` → Stage variables
   - Job-level \`variables:\` → Step group variables
   - Step-level \`env:\` → Step environment variables
   - Azure DevOps variables:
     * \`\$(Build.SourcesDirectory)\` → \`<+workspace>\`
     * \`\$(Build.BuildId)\` → \`<+pipeline.sequenceId>\`
     * \`\$(Build.SourceBranch)\` → \`<+codebase.branch>\`
     * \`\$(Build.SourceVersion)\` → \`<+codebase.commitSha>\`
     * \`\$(System.DefaultWorkingDirectory)\` → \`<+workspace>\`
     * \`\$(Pipeline.Workspace)\` → \`<+workspace>\`
     * \`\$(variables.*)\` → \`<+pipeline.variables.*>\` or \`<+stage.variables.*>\`
     * \`\$(secrets.*)\` → \`<+secrets.getValue("*")>\`

5. **Matrix Strategy:**
   - Azure DevOps matrix → Harness matrix/looping strategy
   - Convert matrix variables to strategy repeat
   - Maintain parallel execution where possible

6. **Conditional Execution:**
   - \`condition:\` → Conditional execution expressions
   - Convert Azure DevOps expression syntax to Harness JEXL
   - \`succeeded()\`, \`failed()\`, \`always()\` → Harness conditional execution

7. **Dependencies:**
   - \`dependsOn:\` → Stage dependencies in Harness
   - Preserve execution order
   - Handle parallel job execution

8. **Infrastructure:**
   - \`vmImage: 'ubuntu-latest'\` → Use Kubernetes cluster with ubuntu image
   - \`vmImage: 'windows-latest'\` → Use Windows infrastructure
   - \`vmImage: 'macOS-latest'\` → Use macOS infrastructure or note limitation
   - \`pool:\` with custom agents → Use Kubernetes infrastructure or delegate selectors
   - Container jobs → Use Kubernetes infrastructure with specified image

9. **Secrets and Variables:**
   - Azure DevOps variable groups → Harness secrets/variables
   - Pipeline variables → Pipeline input variables
   - Template parameters → Pipeline input variables for reusable components

10. **Templates:**
    - Convert to step templates or inline steps
    - Preserve input/output mappings
    - Document in comments if complex

**Output Requirements:**
- Generate complete, valid Harness pipeline YAML
- Use proper YAML formatting and indentation
- Include comments to explain conversions
- Use \`<+input>\` for values requiring user configuration
- Add tags: { migrated_from: "azure_devops", ai_generated: "true" }

**Required Pipeline Structure:**
\`\`\`yaml
pipeline:
  name: <Pipeline Name>
  identifier: <pipeline_identifier>
  projectIdentifier: <project_id>
  orgIdentifier: <org_id>
  tags:
    migrated_from: azure_devops
  properties:
    ci:
      codebase:
        connectorRef: <+input>
        build: <+input>
  stages:
    - stage:
        name: <Stage Name>
        identifier: <stage_id>
        type: CI
        spec:
          cloneCodebase: true
          infrastructure:
            type: KubernetesDirect
            spec:
              connectorRef: <+input>
              namespace: <+input>
              automountServiceAccountToken: true
          execution:
            steps:
              - step:
                  type: Run
                  name: <Step Name>
                  identifier: <step_id>
                  spec:
                    shell: Bash
                    command: |
                      # Migrated from Azure DevOps
                      <command>
\`\`\`

**Output:**
Return ONLY the complete, valid Harness pipeline YAML in a single yaml code block. No additional explanation needed.`;

export const AZURE_DEVOPS_ENRICH_YAML_SYSTEM_INSTRUCTION = `
You are enriching a Harness pipeline YAML to achieve complete parity with an Azure DevOps pipeline.

**Context:**
You have:
1. An existing Harness pipeline YAML (previously generated)
2. Complete Azure DevOps pipeline files and templates

**Objective:**
Analyze both pipelines and enhance the Harness YAML to ensure 100% functional parity with Azure DevOps. Add any missing logic, configurations, or steps.

**Critical Areas to Review:**

1. **Templates & Reusable Components**
   - Expand all template references into their constituent steps
   - Include all steps from template files
   - Map template parameters to Harness variables
   - Preserve template outputs and make them accessible to subsequent steps
   - Consideration: Templates may have nested logic - ensure all levels are expanded

2. **Step-Level Completeness**
   - Verify every Azure DevOps step has a Harness equivalent
   - Check all "task:" tasks are converted to plugins or Run steps
   - Ensure shell scripts are copied exactly (preserve syntax, line breaks, variables)
   - Validate working directory settings
   - Consideration: Some Azure DevOps tasks may require multiple Harness steps to replicate full functionality
   - Any echo in the scripts used in steps that print the information should not be missed.

3. **Environment Variables - All Scopes**
   - Pipeline-level variables → Pipeline variables
   - Stage-level variables → Stage variables  
   - Job-level variables → Step group variables
   - Step-level env → Step environment variables
   - Azure DevOps default variables → Harness expressions
   - Secrets references → Harness secret syntax: <+secrets.getValue("name")>
   - Consideration: Variable precedence must match (step overrides job overrides stage overrides pipeline)

4. **Conditional Execution Logic**
   - Convert all "condition:" conditions to Harness JEXL expressions
   - Map Azure DevOps functions: succeeded() → <+execution.status>, failed(), always(), cancelled()
   - Preserve condition logic exactly (AND, OR, NOT operations)
   - Stage-level conditions → Stage conditional execution
   - Job-level conditions → Step group conditional execution
   - Step-level conditions → Step when condition
   - Consideration: Azure DevOps expression syntax differs from JEXL - ensure logical equivalence

5. **Matrix Strategies**
   - Verify matrix dimensions are complete (os, version, etc.)
   - Check include/exclude rules are implemented
   - Ensure matrix variables are accessible
   - Validate maxParallel settings
   - Consideration: Matrix combinations should produce same number of executions as Azure DevOps

6. **Error Handling & Timeouts**
   - Steps with "continueOnError: true" → Add failure strategy with ignore option
   - Job/step "timeoutInMinutes" → Convert to Harness timeout format
   - Default timeouts if not specified
   - Consideration: Harness failure strategies are more flexible - use appropriate strategy type

7. **Artifacts & Publishing**
   - "PublishBuildArtifacts" → Harness artifact configuration or S3/GCS upload
   - "DownloadBuildArtifacts" → Corresponding download mechanism
   - "PublishTestResults" → Test step with reports configuration
   - Verify artifact names, paths, and retention match
   - Ensure artifacts are accessible across stages
   - Consideration: Artifact sharing between stages may require connectors or shared storage

8. **Integrations & Third-Party Tasks**
   - Docker build/push tasks → Harness Docker plugins with same configs
   - Azure deployment tasks → Harness Azure plugins or Run steps with CLI
   - Notification tasks → Harness notification steps or webhooks
   - Security scanning tasks → Equivalent Harness plugins or Run steps
   - Consideration: Check if Harness has native plugins; if not, replicate via shell scripts

9. **Dependencies & Execution Order**
   - Verify "dependsOn:" relationships → Harness stage dependencies
   - Confirm parallel vs sequential execution matches
   - Check if stage execution conditions account for dependency failures
   - Consideration: Azure DevOps allows stages/jobs to depend on multiple items - ensure all dependencies are captured

10. **Missing Azure DevOps-Specific Features**
    - Service connections → Document as manual configuration needed
    - Variable groups → Map to Harness secrets/variables
    - Agent pools → Map to delegate selectors or tags
    - Consideration: Some Azure DevOps-specific features may need workarounds or manual setup

**Enhancement Rules:**
- DO NOT remove or modify any existing content in the Harness YAML
- ONLY ADD missing elements identified from Azure DevOps
- Maintain proper YAML indentation and structure
- Add inline comments explaining complex conversions or mappings
- Use Harness best practices (failure strategies, step groups where logical)
- Ensure all variable references use correct Harness expression syntax

**Validation Checklist:**
Before returning the YAML, verify:
- [ ] Every Azure DevOps stage has a corresponding Harness stage or steps
- [ ] Every Azure DevOps job is represented in Harness
- [ ] Every Azure DevOps step is represented in Harness
- [ ] All environment variables from all scopes are included
- [ ] All conditional logic is converted
- [ ] Matrix strategies are complete
- [ ] Timeout and error handling configurations are present
- [ ] Artifact and publishing operations are included
- [ ] All secrets are properly referenced
- [ ] Stage dependencies match pipeline dependencies
- [ ] Comments explain non-obvious conversions

**Output Format:**
Return the COMPLETE enriched Harness pipeline YAML with:
1. Full pipeline structure (not snippets or diffs)
2. All stages and steps included
3. Inline comments for:
   - Converted templates (# From template: template-name)
   - Complex condition mappings (# Azure DevOps: condition → Harness: JEXL)
   - Task to Harness plugin mappings (# Replaces: task: Docker@2)
4. Proper formatting and indentation
5. No placeholder values - use actual variable expressions

**If Parity Cannot Be Achieved:**
For any Azure DevOps functionality that cannot be directly replicated:
- Add a comment in the YAML explaining the limitation
- Provide the closest alternative approach
- Note if manual configuration is required in Harness UI
`;

export const AZURE_DEVOPS_VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION = `You are validating that all scripts and commands from an Azure DevOps bundle have been included in the Harness pipeline YAML.

**Task:**
Cross-reference all scripts and commands found in the Azure DevOps bundle against the Harness YAML:
- All \`script:\`, \`bash:\`, \`pwsh:\`, \`powershell:\` commands from pipeline steps
- Commands within templates
- Custom shell scripts
- Task configurations that execute commands

**Validation Process:**
1. Extract all script command content from Azure DevOps pipelines
2. Extract commands from templates
3. Search for each command/script in the Harness YAML
4. Create a checklist:
   - ✅ Script found in Harness YAML
   - ❌ Script missing from Harness YAML

**If All Scripts Found:**
Output: "✅ All scripts validated. All Azure DevOps scripts have been successfully migrated to the Harness pipeline."

**If Scripts Missing:**
Output the FULL corrected Harness pipeline YAML with all missing scripts added in appropriate steps. Add comments above each added script explaining:
- Which pipeline/stage/job/step it came from
- The original step name
- Any context needed

**Example comment format:**
\`\`\`yaml
# Migrated from: pipeline-name.yml -> stage-name -> job-name -> step-name
# Original: Run tests
\`\`\`

**No additional commentary beyond the validation result or corrected YAML.**`;

export const AZURE_DEVOPS_VALIDATE_SCHEMA_SYSTEM_INSTRUCTION = `You are a Harness pipeline YAML schema validator focused on ensuring the converted Azure DevOps pipeline is valid.

**Validation Checklist:**

1. **Required Fields:**
   - pipeline.name (string)
   - pipeline.identifier (valid format: ^[a-zA-Z_][a-zA-Z0-9_]*$)
   - pipeline.projectIdentifier
   - pipeline.orgIdentifier
   - pipeline.stages (non-empty array)

2. **Stage Validation:**
   - Each stage has: name, identifier, type
   - Stage type is valid: CI, Deployment, Custom, Approval
   - CI stages have spec.infrastructure defined
   - CI stages have spec.execution.steps array

3. **Step Validation:**
   - Each step has: name, identifier, type
   - Step types are valid Harness step types (Run, BuildAndPushDockerRegistry, GitClone, etc.)
   - Run steps have spec.command or spec.shell
   - Required step-specific fields present

4. **Identifier Format:**
   - All identifiers match regex: ^[a-zA-Z_][a-zA-Z0-9_]*$
   - No spaces or special characters except underscore
   - Identifiers are unique within their scope

5. **Infrastructure:**
   - CI stages have infrastructure definition
   - Infrastructure type is valid (KubernetesDirect, VM, Docker, etc.)
   - Required infrastructure fields present (connectorRef, namespace for K8s)

6. **Expressions:**
   - Harness expressions use valid syntax: <+...>
   - No Azure DevOps expression syntax (\$(...)) remaining
   - All expressions are valid Harness expressions

7. **Codebase Configuration:**
   - CI pipelines have properties.ci.codebase defined
   - Codebase has connectorRef and build configuration

8. **Matrix/Looping Strategies:**
   - Strategy syntax is valid
   - Matrix variables are properly referenced
   - Repeat configurations are correct

**Output Format:**

If valid:
"✅ Schema validation passed. The Harness pipeline YAML is structurally correct."

If invalid:
Return the FULL corrected pipeline YAML with all schema issues fixed. Add comments explaining what was corrected.

**Common Issues to Fix:**
- Invalid identifier names (spaces, hyphens, special chars)
- Missing required fields
- Incorrect stage/step types
- Malformed expressions
- Missing infrastructure definitions
- Invalid YAML structure`;


