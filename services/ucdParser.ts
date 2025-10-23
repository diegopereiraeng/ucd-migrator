// services/ucdParser.ts
import { UCDComponentTemplate, UCDProcess, Step, Edge, ParsedData, ParsedProcess, ParsedStep, ParsedPath } from '../types';

const getStepDetails = (step: Step): string => {
  switch (step.type) {
    case 'plugin':
      return `Plugin: ${step.pluginName} - ${step.commandName}`;
    case 'runProcess':
      return `Runs Process: ${step.processName}`;
    case 'setStatus':
      return `Set Status to: ${step.status}`;
    case 'switch':
        return `Switch on property: ${step.propertyName}`;
    case 'finish':
      return 'End of Process';
    default:
      return `Type: ${step.type}`;
  }
};

const parseProcess = (process: UCDProcess): ParsedProcess => {
  const { rootActivity } = process;
  if (!rootActivity || !rootActivity.children) {
    return { name: process.name, description: process.description, mainFlow: [], failureFlow: [] };
  }

  const allParsedSteps = new Map<string, ParsedStep>();

  // First pass: create all ParsedStep objects
  for (const step of rootActivity.children) {
    const pStep: ParsedStep = {
      name: step.name,
      id: step.name,
      type: step.type,
      details: getStepDetails(step),
      properties: step.properties || {},
      scriptBody: step.properties?.scriptBody,
      postProcessingScript: step.postProcessingScript?.body,
      preconditionScript: step.preconditionScript,
      incomingPaths: [],
      valuePaths: [],
    };
    allParsedSteps.set(pStep.id, pStep);
  }

  // Second pass: populate paths based on edges
  for (const edge of rootActivity.edges) {
    const toStep = allParsedSteps.get(edge.to);
    if (!toStep) continue;

    if (edge.from) { // This is a connection between two steps
      const fromStep = allParsedSteps.get(edge.from);
      if (fromStep) {
        const path: ParsedPath = { source: fromStep.name, type: edge.type, value: edge.value };
        toStep.incomingPaths.push(path);
        
        switch (edge.type) {
          case 'SUCCESS':
            fromStep.onSuccess = toStep.name;
            break;
          case 'FAILURE':
            fromStep.onFailure = toStep.name;
            break;
          case 'ALWAYS':
            fromStep.onAlways = toStep.name;
            break;
          case 'VALUE':
            fromStep.valuePaths = fromStep.valuePaths || [];
            fromStep.valuePaths.push({ value: edge.value || 'default', destination: toStep.name });
            break;
        }
      }
    } else { // This is an edge from the start of the process
      const path: ParsedPath = { source: 'Start', type: edge.type, value: edge.value };
      toStep.incomingPaths.push(path);
    }
  }

  // Traversal to determine order and flow
  const mainFlow: ParsedStep[] = [];
  const failureFlow: ParsedStep[] = [];
  const visited = new Set<string>();
  const failurePathStarters = new Set<string>();

  // Identify all nodes that are destinations of a FAILURE edge
  for (const step of allParsedSteps.values()) {
    if (step.onFailure) {
        failurePathStarters.add(step.onFailure);
    }
  }

  const startNodes = Array.from(allParsedSteps.values()).filter(step => 
    step.incomingPaths.some(p => p.source === 'Start')
  );

  // Fallback for graphs with no explicit start edges
  if (startNodes.length === 0) {
      const allDestinations = new Set<string>();
      rootActivity.edges.forEach(edge => { if(edge.to) allDestinations.add(edge.to) });
      
      const potentialStarts = Array.from(allParsedSteps.values()).filter(step => 
          !allDestinations.has(step.id) && step.type !== 'finish'
      );
      startNodes.push(...potentialStarts);
  }


  function traverse(stepId: string | undefined, currentFlow: ParsedStep[]) {
    if (!stepId || visited.has(stepId)) return;
    
    const step = allParsedSteps.get(stepId);
    if (!step) return;

    visited.add(stepId);
    currentFlow.push(step);
    
    // Continue traversal on success/always/value paths
    traverse(step.onSuccess, currentFlow);
    traverse(step.onAlways, currentFlow);
    if(step.valuePaths) {
        step.valuePaths.forEach(vp => traverse(vp.destination, currentFlow));
    }
  }
  
  // Traverse main flow
  startNodes.forEach(node => {
    if (!visited.has(node.id)) {
        traverse(node.id, mainFlow);
    }
  });

  // Traverse failure flows
  failurePathStarters.forEach(stepId => {
    if (!visited.has(stepId)) {
        traverse(stepId, failureFlow);
    }
  });


  // Add any remaining unvisited nodes (often disconnected failure handlers or orphaned steps)
  for (const step of allParsedSteps.values()) {
    if (!visited.has(step.id) && step.type !== 'finish') {
        // If it has incoming failure paths, it's part of failure flow. Otherwise, it's an orphan in the main flow.
        if (step.incomingPaths.some(p => p.type === 'FAILURE')) {
             if (!failureFlow.find(s => s.id === step.id)) failureFlow.push(step);
        } else {
             if (!mainFlow.find(s => s.id === step.id)) mainFlow.push(step);
        }
    }
  }


  return {
    name: process.name,
    description: process.description,
    mainFlow,
    failureFlow
  };
};


export const parseUCD = (jsonContents: string[]): ParsedData | null => {
  try {
    const allProcesses: UCDProcess[] = [];
    const componentNames: string[] = [];

    for (const jsonContent of jsonContents) {
      const data: UCDComponentTemplate = JSON.parse(jsonContent);
      if (!data.name || (!data.processes && !data.genericProcesses)) {
        console.warn('Skipping a file due to invalid UCD Component Template JSON structure.', data.name);
        continue;
      }
      componentNames.push(data.name);

      if (data.processes) {
        allProcesses.push(...data.processes);
      }
      if (data.genericProcesses) {
        data.genericProcesses.forEach(gp => {
          allProcesses.push(gp);
          if (gp.linkedProcesses) {
            allProcesses.push(...gp.linkedProcesses);
          }
        });
      }
    }

    if (componentNames.length === 0) {
        throw new Error('No valid UCD Component Template JSON files were processed.');
    }

    const uniqueProcesses = allProcesses.filter((p, index, self) => 
        p.rootActivity && index === self.findIndex((t) => (
            t.name === p.name
        ))
    );

    const parsedProcesses = uniqueProcesses.map(parseProcess);

    return {
      componentName: componentNames.join(', '),
      processes: parsedProcesses,
    };
  } catch (error) {
    console.error('Error parsing UCD JSON:', error);
    return null;
  }
};
