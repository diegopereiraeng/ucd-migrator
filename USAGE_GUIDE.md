# Harness UCD Process Analyzer & Migration Assistant - Complete Usage Guide

## 📋 Table of Contents
1. [Application Overview](#application-overview)
2. [Features](#features)
3. [Prerequisites](#prerequisites)
4. [Installation & Setup](#installation--setup)
5. [Step-by-Step Usage Guide](#step-by-step-usage-guide)
6. [Understanding the Interface](#understanding-the-interface)
7. [Advanced Features](#advanced-features)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Application Overview

The **Harness UCD Process Analyzer & Migration Assistant** is a web-based tool designed to help DevOps engineers and migration specialists analyze and migrate CI/CD configurations from legacy systems to Harness CD. The application supports multiple source systems:

- **UrbanCode Deploy (UCD)**: Component Template JSON files
- **Jenkins**: Jenkinsfiles, Groovy scripts, and configuration XML files
- **GitHub Actions**: Workflow YAML files and composite actions

The tool leverages AI (Google Gemini, Anthropic Claude, or OpenAI GPT) to:
- Parse and visualize complex deployment processes
- Generate comprehensive migration guides
- Create validated Harness Pipeline YAML configurations
- Provide step-by-step migration workflows

---

## ✨ Features

### Core Capabilities

1. **Multi-Format File Support**
   - Upload individual files (JSON, XML, Groovy, YAML)
   - Upload archive files (ZIP, TAR, TAR.GZ) containing multiple CI/CD files
   - Automatic extraction and filtering of relevant files from archives

2. **Intelligent Parsing**
   - Parses UCD Component Template processes (main and failure flows)
   - Analyzes Jenkins pipelines and configurations
   - Processes GitHub Actions workflows and composite actions
   - Extracts scripts, properties, and execution flows

3. **Visual Process Analysis**
   - Interactive view of parsed processes
   - Breakdown of main execution flows and failure handling
   - Step-by-step visualization with connections and dependencies
   - File tree view for complex configurations

4. **AI-Powered Migration Guide**
   - Automatically generates detailed migration documentation
   - Explains how to migrate specific processes to Harness CD
   - Provides context-aware recommendations
   - Supports multiple AI providers (Gemini, Claude, OpenAI)

5. **Guided Harness YAML Generation**
   - Four-step workflow for creating validated Harness pipelines:
     1. **Generate Base Pipeline**: Creates initial YAML from main success path
     2. **Add Missing Steps**: Incorporates failure-handling logic
     3. **Validate Scripts**: Ensures all scripts are included
     4. **Validate Schema**: Performs structural validation
   - Custom workflow steps can be added
   - Edit generated YAML directly in the interface

6. **Customizable AI Prompts**
   - Advanced settings to modify system instructions
   - Parser-specific prompt templates
   - Custom workflow steps with tailored prompts

7. **Export Capabilities**
   - Export AI Migration Guide as text file
   - Export generated Harness Pipeline YAML
   - Export parsed data as formatted text

---

## 🔧 Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or later recommended)
- **npm** (usually comes with Node.js)
- **nvm** (for managing multiple Node.js versions) - optional but recommended
- **API Key** from one of the supported AI providers:
  - Google Gemini: [Get API Key](https://aistudio.google.com/app/apikey)
  - Anthropic Claude: [Get API Key](https://console.anthropic.com/)
  - OpenAI: [Get API Key](https://platform.openai.com/api-keys)

---

## 🚀 Installation & Setup

### Step 1: Clone the Repository

```bash
# Using HTTPS
git clone https://github.com/diegopereiraeng/ucd-migrator.git

# Navigate into the project directory
cd ucd-migrator
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Environment Variables

1. Create a `.env` file in the root directory:

```bash
# For Google Gemini
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# For Anthropic Claude (optional)
VITE_CLAUDE_API_KEY=your_claude_api_key_here

# For OpenAI (optional)
VITE_OPENAI_API_KEY=your_openai_api_key_here
```

**Important Notes:**
- The `VITE_` prefix is required for Vite to expose variables to the browser
- At minimum, you need one API key (Gemini is the default)
- The `.env` file is automatically ignored by git for security

### Step 4: Start the Development Server

```bash
npm run dev
```

The application will start and display a URL (typically `http://localhost:3000` or `http://localhost:5173`).

---

## 📖 Step-by-Step Usage Guide

### Getting Started

1. **Open the Application**
   - Navigate to the URL shown in your terminal (e.g., `http://localhost:3000`)
   - You'll see the upload interface

2. **Select a Parser**
   - Choose the appropriate parser from the dropdown:
     - **UrbanCode Deploy**: For UCD Component Template JSON files
     - **Jenkins Deploy**: For Jenkinsfiles, Groovy scripts, and XML configs
     - **Github Action Deploy**: For GitHub Actions workflow files

3. **Select AI Provider**
   - Choose your preferred AI provider:
     - **Google Gemini** (default, recommended)
     - **Anthropic Claude**
     - **OpenAI GPT-4**
   - You can switch providers at any time during analysis

### Uploading Files

#### Option A: Single File Upload

1. Click the upload area or drag and drop a file
2. Supported formats:
   - **JSON files** (`.json`) - UCD templates, configuration files
   - **XML files** (`.xml`) - Jenkins configs, build files
   - **Groovy files** (`.groovy`) - Jenkins scripts
   - **YAML files** (`.yml`, `.yaml`) - GitHub Actions workflows

#### Option B: Archive Upload

1. Upload a ZIP, TAR, or TAR.GZ archive containing multiple files
2. The application will:
   - Automatically extract the archive
   - Filter for relevant CI/CD files
   - Process all matching files together
3. Supported archive formats:
   - `.zip`
   - `.tar`
   - `.tar.gz` or `.tgz`

**Example Archive Structure:**
```
jenkins-bundle.zip
├── Jenkinsfile
├── config.xml
├── build.xml
└── scripts/
    └── deploy.groovy
```

### Analyzing Your Files

Once files are uploaded:

1. **Automatic Parsing**
   - The application parses your files immediately
   - You'll see the main analysis view with three tabs

2. **View Parsed Process Flow**
   - Click the **"Parsed Process Flow"** tab
   - Review the structured breakdown:
     - **Main Execution Flow**: Success path steps
     - **Failure Handling Flow**: Error handling steps
   - Each step shows:
     - Step name and description
     - Incoming connections (where it comes from)
     - Outgoing paths (success, failure, always, value-based)
     - Script bodies, post-processing, and precondition scripts
     - File trees for complex configurations

3. **Export Parsed Data** (Optional)
   - Click **"Export as Text"** to download the parsed data
   - Useful for reviewing or sharing the analysis

### Using the AI Migration Guide

1. **Navigate to AI Migration Guide Tab**
   - Click the **"AI Migration Guide"** tab
   - The guide is automatically generated using your selected AI provider

2. **Review the Guide**
   - The guide provides:
     - Overview of the source process
     - Step-by-step migration instructions
     - Harness-specific recommendations
     - Best practices and considerations

3. **Regenerate Guide** (Optional)
   - Click **"Regenerate Guide"** to create a new version
   - Useful if you switch AI providers or want a different perspective

4. **Export the Guide**
   - Click **"Export Guide"** to download as a text file
   - Share with your team or use as documentation

### Generating Harness Pipeline YAML

The **Harness Generation Workflow** is a guided, multi-step process:

#### Step 1: Generate Base Pipeline

1. Navigate to the **"Harness Generation Workflow"** tab
2. Find the **"Step 1: Generate Base Pipeline"** card
3. Click **"Generate"**
4. The AI creates an initial Harness Pipeline YAML based on the main success path
5. Review the generated YAML in the code block

**What it does:**
- Analyzes the main execution flow
- Creates a basic Harness pipeline structure
- Maps UCD/Jenkins/GitHub Actions steps to Harness steps

#### Step 2: Add Missing Steps

1. After Step 1 completes, **Step 2** becomes available
2. Click **"Generate"** on **"Step 2: Add Missing Steps"**
3. The AI enriches the pipeline with:
   - Failure handling logic
   - Error recovery steps
   - Missing scripts and configurations

**What it does:**
- Takes the base pipeline from Step 1
- Analyzes failure flows from the source
- Adds appropriate error handling and rollback steps

#### Step 3: Validate Scripts

1. After Step 2 completes, proceed to **Step 3**
2. Click **"Generate"** on **"Step 3: Validate Scripts"**
3. The AI cross-references the YAML against the original source

**What it does:**
- Compares generated YAML with original scripts
- Identifies any missing scripts or configurations
- Ensures all script bodies are properly included

#### Step 4: Validate Schema

1. After Step 3 completes, proceed to **Step 4**
2. Click **"Generate"** on **"Step 4: Validate Schema"**
3. The AI performs structural validation

**What it does:**
- Validates YAML structure against Harness schema
- Fixes any schema violations
- Ensures the pipeline is syntactically correct

#### Editing Generated YAML

At any step, you can:
1. Click **"Edit YAML"** on a completed step
2. Modify the YAML directly in the text area
3. Click **"Save"** to apply changes
4. Click **"Cancel"** to discard changes

#### Exporting the Final Pipeline

1. After completing the workflow (or at any point), click **"Export Latest YAML"**
2. The most recent completed YAML is downloaded
3. File name format: `[original-filename]-harness-pipeline.yml`

### Adding Custom Workflow Steps

You can extend the workflow with custom steps:

1. **After completing a step**, you'll see a **"+"** button below it
2. Click the **"+"** button
3. Choose step type:
   - **Sequential Step**: Runs after the parent step
   - **Parallel Branch**: Runs in parallel with other branches

4. **Fill in the Custom Step Form:**
   - **Title**: Name for your step
   - **Description**: What this step does
   - **Prompt Template**: Select from predefined templates or use "Custom Prompt"
   - **System Prompt**: Edit the AI instruction (required)
   - **Context Sources**: Select which completed steps to use as context

5. Click **"Add Step"**
6. The new step appears in the workflow
7. Click **"Generate"** to run it

**Use Cases:**
- Add environment-specific configurations
- Generate additional Harness resources (connectors, secrets)
- Create custom validation steps
- Generate documentation

### Switching AI Providers

You can switch AI providers at any time:

1. **Before Upload**: Select from the dropdown on the upload screen
2. **During Analysis**: Use the AI Provider selector in the top-right
3. **Effects:**
   - AI Migration Guide regenerates with new provider
   - New workflow steps use the selected provider
   - Existing completed steps remain unchanged

### Customizing AI Prompts

For advanced users who want to customize AI behavior:

1. **Open Prompt Settings**
   - Click the **"AI System Prompts"** section header
   - The settings panel expands

2. **Modify Prompts**
   - **AI Migration Guide Prompt**: Controls how the migration guide is generated
   - **Step 1-4 Prompts**: Control each workflow step's behavior

3. **Save Changes**
   - Changes are applied immediately
   - New generations use the updated prompts

**Tips:**
- Be specific about what you want the AI to focus on
- Include examples or constraints in your prompts
- Test with small changes first

---

## 🖥️ Understanding the Interface

### Main Components

#### Header
- **Application Title**: "Harness UCD Process Analyzer & Migration Assistant"
- **Analyze New File(s) Button**: Resets the application to upload new files

#### Upload Screen
- **Parser Selector**: Choose the source system type
- **AI Provider Selector**: Choose which AI to use
- **File Upload Area**: Drag and drop or click to browse

#### Analysis Screen

**Tabs:**
1. **Parsed Process Flow**: Visual breakdown of processes
2. **AI Migration Guide**: AI-generated migration documentation
3. **Harness Generation Workflow**: Step-by-step YAML generation

**Common Elements:**
- **Export Buttons**: Download various outputs
- **Settings Panel**: Customize AI prompts
- **AI Provider Selector**: Switch providers anytime

### Step Status Indicators

Workflow steps show different statuses:
- **Initial**: Not started (gray)
- **Pending**: Ready to run (waiting for dependencies)
- **Loading**: Currently generating (animated)
- **Completed**: Successfully generated (green)
- **Error**: Generation failed (red)

### Visual Flow Indicators

- **Connectors**: Lines showing step relationships
- **Parallel Branches**: Side-by-side steps that run in parallel
- **Sequential Steps**: Vertical flow from parent to child

---

## 🎓 Advanced Features

### Working with Multiple Files

The application can process multiple files simultaneously:

1. **Upload Multiple Files**: Select multiple files or upload an archive
2. **Combined Analysis**: All files are parsed together
3. **Cross-Reference**: The AI can reference multiple files when generating pipelines

### Archive Extraction

When uploading archives:

1. **Automatic Detection**: The app detects ZIP, TAR, and TAR.GZ files
2. **Smart Filtering**: Only CI/CD relevant files are extracted:
   - `.github/workflows/` and `.github/actions/` directories
   - Jenkinsfiles and Groovy scripts
   - JSON, XML, YAML configuration files
3. **Nested Folders**: Supports deeply nested directory structures
4. **Mac File Filtering**: Automatically excludes `.DS_Store` and `__MACOSX` files

### Context-Aware Generation

Custom workflow steps can use context from previous steps:

1. **Select Context Sources**: Choose which completed steps to reference
2. **Context Passing**: The AI receives outputs from selected steps
3. **Iterative Refinement**: Build upon previous generations

### Parallel Workflows

Create parallel branches for:
- Generating multiple pipeline variants
- Creating different environment configurations
- Testing different approaches simultaneously

---

## 🔍 Troubleshooting

### Common Issues

#### "Invalid JSON file(s)" Error

**Cause**: The uploaded file doesn't match the selected parser's expected format.

**Solutions:**
- Verify you selected the correct parser (UCD, Jenkins, or GitHub Actions)
- Check that the file is a valid JSON/XML/YAML file
- For UCD: Ensure the file contains `processes`, `genericProcesses`, or `componentProcesses` arrays
- For Jenkins: Ensure the file contains Jenkinsfile or configuration XML
- For GitHub Actions: Ensure the file is a valid workflow YAML

#### "No relevant CI/CD files found in archive"

**Cause**: The archive doesn't contain files matching the expected patterns.

**Solutions:**
- Check that your archive contains:
  - For Jenkins: `Jenkinsfile`, `.groovy`, or `.xml` files
  - For GitHub Actions: `.yml`/`.yaml` files in `.github/workflows/` or `.github/actions/`
  - For UCD: `.json` files with process definitions
- Ensure files aren't in excluded directories (like `__MACOSX`)

#### API Key Errors

**Cause**: Missing or invalid API key.

**Solutions:**
- Verify your `.env` file exists in the project root
- Check that the API key variable starts with `VITE_`
- Ensure the API key is valid and has sufficient credits/quota
- Restart the development server after adding/changing API keys

#### Generation Fails or Times Out

**Cause**: AI provider issues or very large/complex files.

**Solutions:**
- Try switching to a different AI provider
- Break down very large files into smaller chunks
- Check your API key quota/limits
- Simplify the source configuration if possible
- Check browser console for detailed error messages

#### YAML Validation Errors

**Cause**: Generated YAML doesn't match Harness schema.

**Solutions:**
- Run Step 4 (Validate Schema) to automatically fix issues
- Manually edit the YAML using the "Edit YAML" feature
- Review Harness documentation for correct schema
- Check that all required fields are present

### Getting Help

1. **Check Browser Console**: Open Developer Tools (F12) and check for errors
2. **Review File Format**: Ensure your source files match expected formats
3. **Try Different AI Provider**: Some providers handle certain tasks better
4. **Simplify Input**: Test with simpler configurations first

---

## 📝 Best Practices

### For Best Results

1. **Use Clean Source Files**
   - Remove unnecessary comments or metadata
   - Ensure files are well-structured

2. **Start Simple**
   - Begin with basic processes
   - Add complexity incrementally

3. **Review Each Step**
   - Don't skip validation steps
   - Review generated YAML before proceeding

4. **Iterate and Refine**
   - Use custom steps to refine outputs
   - Edit YAML directly when needed
   - Regenerate if results aren't satisfactory

5. **Export Regularly**
   - Save your work frequently
   - Export intermediate results for backup

6. **Test Generated Pipelines**
   - Import into Harness and test
   - Validate against your requirements
   - Adjust as needed

---

## 🎉 Summary

The Harness UCD Process Analyzer & Migration Assistant provides a comprehensive solution for migrating CI/CD configurations to Harness CD. By combining intelligent parsing, AI-powered analysis, and guided workflows, it simplifies the complex task of pipeline migration.

**Key Workflow:**
1. Upload your source files (UCD, Jenkins, or GitHub Actions)
2. Review the parsed process flow
3. Read the AI-generated migration guide
4. Generate Harness Pipeline YAML through the guided workflow
5. Validate and export your pipeline

**Remember:**
- You can switch AI providers at any time
- Custom steps allow for advanced workflows
- Always validate generated YAML before deploying
- Export your work regularly

Happy migrating! 🚀

