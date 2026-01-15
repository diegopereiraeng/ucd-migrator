# Harness UCD Process Analyzer & Migration Assistant

This is a web-based tool designed to help DevOps engineers and migration specialists analyze UrbanCode Deploy (UCD) Component Template JSON files. It parses the file, visualizes the deployment processes, and leverages Harness AI to generate comprehensive migration guides and a multi-step, validated Harness Pipeline YAML.

## Features

*   **JSON Parsing & Visualization:** Upload a UCD Component Template JSON to see a structured, easy-to-read breakdown of its processes, including main and failure-handling flows.
*   **AI-Powered Migration Guide:** Automatically generates a detailed, step-by-step markdown guide on how to migrate the specific UCD process to Harness CD.
*   **Guided Harness YAML Generation:** A four-step workflow to create a Harness Pipeline YAML:
    1.  **Generate Base Pipeline:** Creates an initial YAML file based on the main success path of the UCD process.
    2.  **Add Missing Steps:** Enriches the base YAML by incorporating the failure-handling logic from the UCD process.
    3.  **Validate Scripts:** Cross-references the generated YAML against the original UCD data to ensure all scripts have been included.
    4.  **Validate Schema:** Performs a high-level structural check on the final YAML to ensure it adheres to the Harness schema.
*   **Customizable AI Prompts:** Advanced settings allow you to tweak the system instructions sent to the AI for tailored results.

## Prerequisites

Before you begin, ensure you have the following installed on your local machine:

*   [Node.js](https://nodejs.org/) (v18 or later is recommended)
*   [npm](https://www.npmjs.com/) (usually comes with Node.js)
*   Use nvm to handle multiple node versions
*   An **API Key** from one of the supported AI providers:
    *   **Google Gemini** (default, recommended) - [Get API Key](https://aistudio.google.com/app/apikey)
    *   **Anthropic Claude** - [Get API Key](https://console.anthropic.com/)
    *   **OpenAI GPT-4** - [Get API Key](https://platform.openai.com/api-keys)
    *   **GitHub Copilot** - [Get API Key](https://github.com/settings/tokens)

## Getting Started

Follow these steps to set up and run the project locally.

### 1. Clone the Repository

First, clone this repository to your local machine using your preferred method.

```bash
# Using HTTPS
git clone https://github.com/diegopereiraeng/ucd-migrator.git

# Navigate into the project directory
cd ucd-migrator
```

### 2. Install Dependencies

Once you are in the project's root directory, install the necessary Node.js packages.

```bash
npm install
```

### 3. Set Up Environment Variables

The application requires an API Key from at least one AI provider to function. You must create an environment file to store your API key(s) securely.

1.  In the root of the project directory, create a new file named `.env`.
2.  Add your API key(s) to this file, prefixed with `VITE_`, as shown below:

```bash
# .env
# Google Gemini (default, recommended)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Anthropic Claude (optional)
VITE_CLAUDE_API_KEY=your_claude_api_key_here

# OpenAI GPT-4 (optional)
VITE_OPENAI_API_KEY=your_openai_api_key_here

# GitHub Copilot (optional)
VITE_COPILOT_API_KEY=your_copilot_api_key_here
# Optional: Custom API endpoint (defaults to https://api.githubcopilot.com/v1/chat/completions)
VITE_COPILOT_API_ENDPOINT=https://api.githubcopilot.com/v1/chat/completions
```

Replace the placeholder values with your actual API keys.

**Important:** 
- The `VITE_` prefix is required by the Vite development server to expose the variable to the application code running in the browser.
- At minimum, you need one API key (Gemini is the default provider).
- The `.gitignore` file is configured to prevent this file from being committed to version control.

### 4. Run the Development Server

Start the local development server with the following command:

```bash
npm run dev
```

This command will start the application. The terminal will display the local URL where the app is running, which is typically `http://localhost:3000` or `http://localhost:5173`.

## Running with Docker

### Building the Docker Image

```bash
# Build the image
docker build -t ucd-migrator:latest .
```

### Running the Docker Container

**Note:** Since this is a static React app built with Vite, environment variables need to be set at build time, not runtime. To use different API keys, you'll need to rebuild the image with the appropriate environment variables.

#### Option 1: Build with Environment Variables

1. Create a `.env.production` file with your API keys:

```bash
# .env.production
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_CLAUDE_API_KEY=your_claude_api_key_here
VITE_OPENAI_API_KEY=your_openai_api_key_here
VITE_COPILOT_API_KEY=your_copilot_api_key_here
VITE_COPILOT_API_ENDPOINT=https://api.githubcopilot.com/v1/chat/completions
```

2. Build the image:

```bash
docker build -t ucd-migrator:latest .
```

3. Run the container:

```bash
docker run -d \
  -p 8080:80 \
  --name ucd-migrator \
  ucd-migrator:latest
```

4. Access the application:

```bash
open http://localhost:8080
```

#### Option 2: Using Docker Build Arguments

```bash
docker build \
  --build-arg VITE_GEMINI_API_KEY=your_gemini_api_key_here \
  --build-arg VITE_CLAUDE_API_KEY=your_claude_api_key_here \
  --build-arg VITE_OPENAI_API_KEY=your_openai_api_key_here \
  --build-arg VITE_COPILOT_API_KEY=your_copilot_api_key_here \
  -t ucd-migrator:latest .
```

**Note:** You'll need to update the Dockerfile to accept these build arguments. See the [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for more details.

#### Stopping and Removing the Container

```bash
# Stop the container
docker stop ucd-migrator

# Remove the container
docker rm ucd-migrator
```

For more detailed deployment instructions, including Kubernetes/Helm deployment, see the [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

## How to Use the Application

1.  Open the provided URL (e.g., `http://localhost:3000` or `http://localhost:8080` if using Docker) in your web browser.
2.  **Select an AI Provider** from the dropdown (Gemini, Claude, OpenAI, or Copilot).
3.  **Select a Parser** based on your source system (UrbanCode Deploy, Jenkins, or GitHub Actions).
4.  Drag and drop your exported CI/CD configuration file(s) onto the upload area, or click to browse for the file(s).
5.  Once uploaded, the application will parse the file and display the main analysis view.
6.  Navigate through the available tabs:
    *   **Parsed Process Flow:** An interactive view of the main and failure flows from your CI/CD process, broken down by step.
    *   **AI Migration Guide:** A comprehensive markdown guide generated by the AI, explaining how to migrate the process to Harness.
    *   **Harness Generation Workflow:** The guided, multi-step workflow to generate and validate a Harness Pipeline YAML file.
7.  Use the "Export" buttons within each tab to download the generated guide, the raw parsed text, or the final YAML file to your local machine.

For detailed usage instructions, see the [USAGE_GUIDE.md](./USAGE_GUIDE.md).