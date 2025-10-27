// components/ProcessView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { ParsedData, ParsedProcess, ParsedStep, WorkflowStep } from '../types';
import { 
  generateSummary, 
  generateHarnessPipeline,
  generateEnrichedPipeline,
  validateScripts,
  validateSchema,
  generateFromContext,
  DEFAULT_SUMMARY_SYSTEM_INSTRUCTION,
  DEFAULT_HARNESS_YAML_SYSTEM_INSTRUCTION,
  ENRICH_YAML_SYSTEM_INSTRUCTION,
  VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
  VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
  DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
  stringifyParsedDataForPrompt,
  aiService
} from '../services/aiService';
import { SummaryView } from './SummaryView';
import { CodeBlock } from './CodeBlock';
import { AiIcon, CodeIcon, ProcessIcon, DownloadIcon, SettingsIcon, PlusIcon, SequentialIcon, BranchIcon, TrashIcon } from './icons';
import { getSystemInstructions, getParserDisplayName } from '../services/promptSelector';
import { LLMProvider, LLM_PROVIDER_NAMES } from '../services/llmProvider';

interface ProcessViewProps {
  parsedData: ParsedData;
  fileName: string;
  parserType: string;
  llmProvider: LLMProvider;
  onLLMChange: (provider: LLMProvider) => void;
}

const generateId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const StepCard: React.FC<{ step: ParsedStep }> = ({ step }) => {
  return (
    <div className="bg-card-dark border border-border-color rounded-lg mb-4">
      <div className="p-4">
        <h5 className="font-bold text-brand-secondary">{step.name}</h5>
        <p className="text-xs text-text-secondary italic mb-2">{step.details}</p>
        
        {step.incomingPaths.length > 0 && (
            <div className="mb-2">
                <p className="text-xs font-semibold text-text-secondary">Incoming Connections:</p>
                <ul className="list-disc list-inside pl-2 text-xs">
                    {step.incomingPaths.map((path, idx) => (
                        <li key={idx}>From "{path.source}" (On {path.type}{path.value ? `="${path.value}"` : ''})</li>
                    ))}
                </ul>
            </div>
        )}

        {step.scriptBody && <CodeBlock title="Script Body" code={step.scriptBody} />}
        {step.postProcessingScript && <CodeBlock title="Post-Processing Script" code={step.postProcessingScript} />}
        {step.preconditionScript && <CodeBlock title="Precondition Script" code={step.preconditionScript} />}
      </div>
      {(step.onSuccess || step.onFailure || step.onAlways || (step.valuePaths && step.valuePaths.length > 0)) && (
          <div className="border-t border-border-color bg-background-light rounded-b-lg px-4 py-2 text-xs">
              <p className="font-semibold text-text-secondary mb-1">Outgoing Paths:</p>
              {step.onSuccess && <p><strong>On Success:</strong> → "{step.onSuccess}"</p>}
              {step.onFailure && <p className="text-red-400"><strong>On Failure:</strong> → "{step.onFailure}"</p>}
              {step.onAlways && <p><strong>Always:</strong> → "{step.onAlways}"</p>}
              {step.valuePaths && step.valuePaths.map((p, i) => (
                  <p key={i}><strong>On Value "{p.value}":</strong> → "{p.destination}"</p>
              ))}
          </div>
      )}
    </div>
  );
};

const ProcessDetails: React.FC<{ process: ParsedProcess }> = ({ process }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="bg-background-light border border-border-color rounded-xl mb-6">
       <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left p-4 bg-card-light rounded-t-xl hover:bg-card-dark focus:outline-none">
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-bold">{process.name}</h4>
            <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
          </div>
          <p className="text-sm text-text-secondary mt-1">{process.description}</p>
       </button>
       {isOpen && (
         <div className="p-4">
            {process.mainFlow.length > 0 && (
                <div>
                    <h5 className="font-semibold text-text-primary mb-2">Main Execution Flow</h5>
                    {process.mainFlow.map(step => <StepCard key={step.id} step={step} />)}
                </div>
            )}
            {process.failureFlow.length > 0 && (
                <div className="mt-6">
                    <h5 className="font-semibold text-red-400 mb-2">Failure Handling Flow</h5>
                    {process.failureFlow.map(step => <StepCard key={step.id} step={step} />)}
                </div>
            )}
         </div>
       )}
    </div>
  )
}

const AddStepControl: React.FC<{ onAdd: (isBranch: boolean) => void }> = ({ onAdd }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-center w-10 h-10 bg-card-dark border-2 border-dashed border-border-color rounded-full hover:bg-card-light hover:border-brand-secondary transition-all"
                aria-label="Add new step"
            >
                <PlusIcon className="w-6 h-6" />
            </button>
            {isOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-60 bg-card-dark border border-border-color rounded-lg shadow-lg z-10">
                    <div className="p-2">
                        <p className="text-xs text-text-secondary px-2 pb-1">Add new action:</p>
                        <button
                            onClick={() => { onAdd(false); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 text-left px-3 py-2 text-sm rounded-md hover:bg-card-light"
                        >
                            <SequentialIcon className="w-5 h-5 text-brand-secondary" />
                            <span>Sequential Step</span>
                        </button>
                        <button
                            onClick={() => { onAdd(true); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 text-left px-3 py-2 text-sm rounded-md hover:bg-card-light"
                        >
                            <BranchIcon className="w-5 h-5 text-brand-secondary" />
                            <span>Parallel Branch</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const WorkflowNodeComponent: React.FC<{
    step: WorkflowStep;
    allSteps: WorkflowStep[];
    onGenerate: (stepId: string) => void;
    onAddStep: (parentId: string, isBranch: boolean) => void;
    onUpdateInstruction: (stepId: string, instruction: string) => void;
    onDelete: (stepId: string) => void;
    onEditResult: (stepId: string, newResult: string) => void;
}> = ({ step, allSteps, onGenerate, onAddStep, onUpdateInstruction, onDelete, onEditResult }) => {

    const [isEditing, setIsEditing] = useState(false);
    const [editedResult, setEditedResult] = useState(step.result);

    const children = useMemo(() => allSteps.filter(s => s.parentId === step.id), [allSteps, step.id]);
    const isCompleted = step.status === 'completed';

    // Update editedResult when step.result changes
    useEffect(() => {
        setEditedResult(step.result);
    }, [step.result]);

    const handleSaveEdit = () => {
        onEditResult(step.id, editedResult);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditedResult(step.result);
        setIsEditing(false);
    };

    const getConnectorHTML = () => {
        if (step.parentId === null) return null;
        return (
            <div className="absolute top-1/2 -left-5 w-5 h-px bg-border-color" aria-hidden="true" />
        );
    };

    return (
        <div className="flex flex-col items-center">
            <div className={`bg-background-light p-4 md:p-6 rounded-xl border border-border-color w-full max-w-2xl relative ${step.parentId ? 'mt-8' : ''}`}>
                {getConnectorHTML()}
                <button 
                  onClick={() => onDelete(step.id)} 
                  className="absolute top-3 right-3 text-text-secondary hover:text-red-400 transition-colors"
                  aria-label="Delete step"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <p className="text-sm text-text-secondary mt-1 mb-4">{step.description}</p>
                
                {step.isCustom && (
                    <div className="mb-4">
                         <label htmlFor={`prompt-${step.id}`} className="block text-sm font-medium text-text-primary mb-1">System Prompt</label>
                         <textarea 
                            id={`prompt-${step.id}`}
                            rows={6}
                            className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" 
                            value={step.systemInstruction} 
                            onChange={(e) => onUpdateInstruction(step.id, e.target.value)}
                         />
                    </div>
                )}

                <button 
                    onClick={() => onGenerate(step.id)} 
                    disabled={step.status === 'loading'} 
                    className="bg-brand-primary hover:bg-brand-secondary text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    {step.status === 'loading' ? 'Generating...' : (step.result ? `Regenerate` : `Generate`)}
                </button>

                {step.status === 'loading' && <div className="flex items-center justify-center h-40 text-text-secondary mt-4"><CodeIcon className="w-10 h-10 animate-pulse text-brand-secondary" /><p className="ml-3">Generating...</p></div>}
                
                {step.result && step.status !== 'loading' && (
                    <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-text-primary">Result</span>
                            <div className="flex gap-2">
                                {isEditing ? (
                                    <>
                                        <button
                                            onClick={handleSaveEdit}
                                            className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold py-1 px-3 rounded transition-colors"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            className="text-xs bg-gray-600 hover:bg-gray-700 text-white font-semibold py-1 px-3 rounded transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-xs bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 font-semibold py-1 px-3 rounded transition-colors"
                                    >
                                        Edit YAML
                                    </button>
                                )}
                            </div>
                        </div>
                        {isEditing ? (
                            <textarea
                                value={editedResult}
                                onChange={(e) => setEditedResult(e.target.value)}
                                className="w-full p-3 bg-background-dark border border-border-color rounded-md text-xs font-mono text-text-primary min-h-[300px]"
                                spellCheck={false}
                            />
                        ) : (
                            <CodeBlock title="" code={step.result} />
                        )}
                    </div>
                )}
                
                {step.status === 'error' && <p className="text-red-400 mt-2">An error occurred during generation.</p>}
            </div>

            {isCompleted && (
                <div className="mt-8 flex flex-col items-center gap-4">
                    <div className="w-px h-8 bg-border-color" />
                    <AddStepControl onAdd={(isBranch) => onAddStep(step.id, isBranch)} />
                </div>
            )}

            {children.length > 0 && (
                <div className="w-full flex justify-center mt-8">
                     <div className="w-px h-8 bg-border-color" />
                </div>
            )}
            
            {children.length > 0 && (
                 <div className={`w-full flex ${children.length > 1 ? 'flex-row justify-around gap-8' : 'flex-col items-center'}`}>
                    {children.map(child => (
                        <div key={child.id} className="flex-1 relative flex flex-col items-center">
                            {children.length > 1 && <div className="absolute top-0 left-0 right-0 h-px bg-border-color" />}
                             <WorkflowNodeComponent
                                step={child}
                                allSteps={allSteps}
                                onGenerate={onGenerate}
                                onAddStep={onAddStep}
                                onUpdateInstruction={onUpdateInstruction}
                                onDelete={onDelete}
                                onEditResult={onEditResult}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const AddStepModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (details: { title: string; description: string; systemInstruction: string; contextIds: string[] }) => void;
    parentId: string | null;
    completedSteps: WorkflowStep[];
    promptTemplates: {name: string, instruction: string}[];
}> = ({ isOpen, onClose, onSubmit, parentId, completedSteps, promptTemplates }) => {
    const [title, setTitle] = useState('New Custom Step');
    const [description, setDescription] = useState('Generate a custom Harness configuration.');
    const [systemInstruction, setSystemInstruction] = useState(DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION);
    const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);

    useEffect(() => {
        if (parentId) {
            setSelectedContextIds([parentId]);
        }
        // Reset to default custom prompt when modal opens
        setSystemInstruction(promptTemplates.find(p => p.name === 'Custom Prompt')?.instruction || DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION);
    }, [parentId, isOpen, promptTemplates]);

    if (!isOpen) return null;

    const handleContextToggle = (id: string) => {
        setSelectedContextIds(prev =>
            prev.includes(id) ? prev.filter(ctxId => ctxId !== id) : [...prev, id]
        );
    };
    
    const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedInstruction = e.target.value;
        setSystemInstruction(selectedInstruction);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ title, description, systemInstruction, contextIds: selectedContextIds });
        // Reset form for next time
        setTitle('New Custom Step');
        setDescription('Generate a custom Harness configuration.');
        setSystemInstruction(DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION);
        setSelectedContextIds([]);
    };

    return (
        <div className="fixed inset-0 bg-background-dark bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-background-light border border-border-color rounded-xl shadow-xl w-full max-w-2xl p-6 m-4">
                <h2 className="text-xl font-bold mb-4">Add New Workflow Step</h2>
                <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
                    <div>
                        <label htmlFor="step-title" className="block text-sm font-medium text-text-primary mb-1">Title</label>
                        <input id="step-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full p-2 bg-background-dark border border-border-color rounded-md text-sm" />
                    </div>
                     <div>
                        <label htmlFor="step-desc" className="block text-sm font-medium text-text-primary mb-1">Description</label>
                        <textarea id="step-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-sm" />
                    </div>
                    <div>
                        <label htmlFor="prompt-template" className="block text-sm font-medium text-text-primary mb-1">Prompt Template</label>
                        <select
                            id="prompt-template"
                            onChange={handleTemplateChange}
                            value={systemInstruction}
                            className="w-full p-2 bg-background-dark border border-border-color rounded-md text-sm"
                        >
                            {promptTemplates.map(template => (
                                <option key={template.name} value={template.instruction}>{template.name}</option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="step-prompt" className="block text-sm font-medium text-text-primary mb-1">System Prompt</label>
                        <textarea id="step-prompt" rows={8} value={systemInstruction} onChange={e => setSystemInstruction(e.target.value)} required className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" />
                    </div>
                     <div>
                        <h3 className="text-sm font-medium text-text-primary mb-2">Select Context Sources</h3>
                        <div className="space-y-2 p-3 bg-background-dark border border-border-color rounded-md max-h-40 overflow-y-auto">
                            {completedSteps.length === 0 ? (
                                <p className="text-xs text-text-secondary">No completed steps available to use as context.</p>
                            ) : (
                                completedSteps.map(step => (
                                    <label key={step.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-card-dark cursor-pointer">
                                        <input type="checkbox" checked={selectedContextIds.includes(step.id)} onChange={() => handleContextToggle(step.id)} className="form-checkbox bg-background-dark border-border-color text-brand-primary focus:ring-brand-secondary" />
                                        <span className="text-sm">{step.title}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-card-dark border border-border-color rounded-lg hover:bg-card-light transition-colors">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded-lg disabled:bg-gray-500" disabled={selectedContextIds.length === 0}>Add Step</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


export const ProcessView: React.FC<ProcessViewProps> = ({ parsedData, fileName, parserType, llmProvider, onLLMChange }) => {
  // Get parser-specific system instructions
  const systemInstructions = getSystemInstructions(parserType);
  const parserDisplayName = getParserDisplayName(parserType);
  
  const [summary, setSummary] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('process');
  
  const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
  
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [summarySystemInstruction, setSummarySystemInstruction] = useState(systemInstructions.summary);
  const [harnessYamlSystemInstruction, setHarnessYamlSystemInstruction] = useState(systemInstructions.basePipeline);
  const [enrichYamlSystemInstruction, setEnrichYamlSystemInstruction] = useState(systemInstructions.enrichPipeline);
  const [validateScriptsSystemInstruction, setValidateScriptsSystemInstruction] = useState(systemInstructions.validateScripts);
  const [validateSchemaSystemInstruction, setValidateSchemaSystemInstruction] = useState(systemInstructions.validateSchema);

  const [addStepModalState, setAddStepModalState] = useState<{
      isOpen: boolean;
      parentId: string | null;
  }>({ isOpen: false, parentId: null });

  const promptTemplates = useMemo(() => [
    { name: 'Custom Prompt', instruction: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION },
    { name: 'Generate Base Pipeline', instruction: harnessYamlSystemInstruction },
    { name: 'Enrich Pipeline (Add Failure Steps)', instruction: enrichYamlSystemInstruction },
    { name: 'Validate Scripts (Find Missing)', instruction: validateScriptsSystemInstruction },
    { name: 'Validate/Fix Harness Schema', instruction: validateSchemaSystemInstruction },
  ], [harnessYamlSystemInstruction, enrichYamlSystemInstruction, validateScriptsSystemInstruction, validateSchemaSystemInstruction]);
  
  const getInitialWorkflow = (): WorkflowStep[] => [
    { id: 'base', parentId: null, title: 'Step 1: Generate Base Pipeline', description: `Generates the initial pipeline based on the ${parserDisplayName} main success path.`, systemInstruction: harnessYamlSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: [] },
    { id: 'enrich', parentId: 'base', title: 'Step 2: Add Missing Steps', description: `Analyzes the first pipeline and adds logic from the ${parserDisplayName} failure paths.`, systemInstruction: enrichYamlSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['base'] },
    { id: 'validate-scripts', parentId: 'enrich', title: 'Step 3: Validate Scripts', description: `Cross-references the final YAML against the original ${parserDisplayName} data to ensure no scripts were missed.`, systemInstruction: validateScriptsSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['enrich'] },
    { id: 'validate-schema', parentId: 'validate-scripts', title: 'Step 4: Validate Schema', description: 'Performs a structural validation of the YAML against the Harness schema.', systemInstruction: validateSchemaSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['validate-scripts'] }
  ];

  useEffect(() => {
    setWorkflow(getInitialWorkflow());
  }, [harnessYamlSystemInstruction, enrichYamlSystemInstruction, validateScriptsSystemInstruction, validateSchemaSystemInstruction]);

  useEffect(() => {
    const getSummary = async () => {
      setError('');
      setIsSummaryLoading(true);
      try {
        const summaryResult = await generateSummary(parsedData, summarySystemInstruction);
        setSummary(summaryResult);
      } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(`Failed to generate AI summary. ${errorMessage}`);
        setSummary(`Could not load summary. Error: ${errorMessage}`);
      } finally {
        setIsSummaryLoading(false);
      }
    };
    getSummary();
  }, [parsedData, summarySystemInstruction]);

  // Handler to manually regenerate the AI Migration Guide
  const handleRegenerateSummary = async () => {
    setError('');
    setIsSummaryLoading(true);
    try {
      const summaryResult = await generateSummary(parsedData, summarySystemInstruction);
      setSummary(summaryResult);
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to generate AI summary. ${errorMessage}`);
      setSummary(`Could not load summary. Error: ${errorMessage}`);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleUpdateInstruction = (stepId: string, instruction: string) => {
    setWorkflow(prev => prev.map(s => s.id === stepId ? { ...s, systemInstruction: instruction } : s));
  };

  const handleEditResult = (stepId: string, newResult: string) => {
    setWorkflow(prev => prev.map(s => s.id === stepId ? { ...s, result: newResult } : s));
  };
  
  const handleOpenAddStepModal = (parentId: string, isBranch: boolean) => {
    setAddStepModalState({ isOpen: true, parentId });
  };

  const handleAddCustomStep = (details: { title: string; description: string; systemInstruction: string; contextIds: string[] }) => {
    const { parentId } = addStepModalState;
    if (parentId === null) return;

    const newStep: WorkflowStep = {
        id: generateId(),
        parentId,
        title: details.title,
        description: details.description,
        systemInstruction: details.systemInstruction,
        status: 'initial',
        result: '',
        isCustom: true,
        contextSourceIds: details.contextIds,
    };
    setWorkflow(prev => [...prev, newStep]);
    setAddStepModalState({ isOpen: false, parentId: null });
  };

  const handleDeleteStep = (stepIdToDelete: string) => {
    setWorkflow(prevWorkflow => {
        const idsToDelete = new Set<string>();
        const queue: string[] = [stepIdToDelete];
        
        while(queue.length > 0) {
            const currentId = queue.shift()!;
            if (currentId) {
                idsToDelete.add(currentId);
                const children = prevWorkflow.filter(s => s.parentId === currentId);
                children.forEach(child => queue.push(child.id));
            }
        }
        
        return prevWorkflow.filter(s => !idsToDelete.has(s.id));
    });
  };


  const handleGenerate = async (stepId: string) => {
    const step = workflow.find(s => s.id === stepId);
    if (!step) return;

    setWorkflow(prev => prev.map(s => s.id === stepId ? { ...s, status: 'loading', result: '' } : s));

    try {
      let result = '';
      const { systemInstruction, contextSourceIds } = step;

      const contextSteps = contextSourceIds
          .map(id => workflow.find(s => s.id === id))
          .filter((s): s is WorkflowStep => !!s && s.status === 'completed');

      if (contextSteps.length !== contextSourceIds.length) {
          throw new Error("One or more context steps must be completed before running this step.");
      }
      
      const parentResult = contextSteps.length > 0 ? contextSteps[0].result : '';

      switch(step.id) {
        case 'base':
          result = await generateHarnessPipeline(parsedData, systemInstruction);
          break;
        case 'enrich':
          result = await generateEnrichedPipeline(parentResult, parsedData, systemInstruction);
          break;
        case 'validate-scripts':
          result = await validateScripts(parentResult, parsedData, systemInstruction);
          break;
        case 'validate-schema':
          result = await validateSchema(parentResult, systemInstruction);
          break;
        default: // Custom steps
          const context = contextSteps.reduce((acc, s) => {
              const key = s.title.replace(/[^a-zA-Z0-9_]/g, '_');
              acc[key] = s.result;
              return acc;
          }, { ucdData: stringifyParsedDataForPrompt(parsedData) });
          result = await generateFromContext(context, systemInstruction);
          break;
      }

      setWorkflow(prev => prev.map(s => s.id === stepId ? { ...s, status: 'completed', result } : s));
      
      const children = workflow.filter(s => s.parentId === stepId);
      if (children.length === 1 && children[0].status === 'initial' && !children[0].isCustom) {
          const childId = children[0].id;
          setWorkflow(prev => prev.map(s => s.id === childId ? { ...s, status: 'pending' } : s));
      }

    } catch (e) {
      console.error(`Error generating for step ${stepId}:`, e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setWorkflow(prev => prev.map(s => s.id === stepId ? { ...s, status: 'error', result: `Error: ${errorMessage}` } : s));
    }
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleExportSummary = () => {
    downloadFile(summary, `${fileName.replace('.json', '')}-summary.txt`, 'text/plain');
  };

  const handleExportYaml = () => {
    const latestYamlStep = [...workflow].reverse().find(s => s.status === 'completed' && s.result.includes('pipeline:'));
    const yamlToExport = latestYamlStep?.result || "No YAML generated yet.";
    downloadFile(yamlToExport, `${fileName.replace('.json', '')}-harness-pipeline.yml`, 'application/x-yaml');
  };

  const handleExportParsedText = () => {
    const parsedText = stringifyParsedDataForPrompt(parsedData);
    downloadFile(parsedText, `${fileName.replace('.json', '')}-parsed-prompt.txt`, 'text/plain');
  };

  const workflowRoots = useMemo(() => workflow.filter(step => step.parentId === null), [workflow]);
  const completedSteps = useMemo(() => workflow.filter(s => s.status === 'completed'), [workflow]);


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-1">Analysis of <span className="text-brand-primary">{fileName}</span></h2>
        <p className="text-text-secondary">Component Template: <span className="font-semibold">{parsedData.componentName}</span></p>
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </div>
      
      <div className="bg-card-dark border border-border-color rounded-lg">
        <button onClick={() => setShowPromptSettings(!showPromptSettings)} className="w-full flex justify-between items-center p-3 text-sm font-semibold text-text-secondary hover:text-text-primary">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5"/>
            <span>AI System Prompts</span>
          </div>
          <span className={`transform transition-transform ${showPromptSettings ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showPromptSettings && (
          <div className="p-4 border-t border-border-color space-y-4">
            <div>
              <label htmlFor="summary-prompt" className="block text-sm font-medium text-text-primary mb-1">AI Migration Guide System Prompt</label>
              <textarea id="summary-prompt" rows={8} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={summarySystemInstruction} onChange={(e) => setSummarySystemInstruction(e.target.value)} />
            </div>
             <div>
              <label htmlFor="base-pipeline-prompt" className="block text-sm font-medium text-text-primary mb-1">Step 1: Base Pipeline Prompt</label>
              <textarea id="base-pipeline-prompt" rows={8} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={harnessYamlSystemInstruction} onChange={(e) => setHarnessYamlSystemInstruction(e.target.value)} />
            </div>
             <div>
              <label htmlFor="enrich-pipeline-prompt" className="block text-sm font-medium text-text-primary mb-1">Step 2: Enrich Pipeline Prompt</label>
              <textarea id="enrich-pipeline-prompt" rows={8} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={enrichYamlSystemInstruction} onChange={(e) => setEnrichYamlSystemInstruction(e.target.value)} />
            </div>
             <div>
              <label htmlFor="validate-scripts-prompt" className="block text-sm font-medium text-text-primary mb-1">Step 3: Validate Scripts Prompt</label>
              <textarea id="validate-scripts-prompt" rows={8} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={validateScriptsSystemInstruction} onChange={(e) => setValidateScriptsSystemInstruction(e.target.value)} />
            </div>
             <div>
              <label htmlFor="validate-schema-prompt" className="block text-sm font-medium text-text-primary mb-1">Step 4: Validate Schema Prompt</label>
              <textarea id="validate-schema-prompt" rows={8} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={validateSchemaSystemInstruction} onChange={(e) => setValidateSchemaSystemInstruction(e.target.value)} />
            </div>
          </div>
        )}
       </div>

       {/* LLM Provider Selector - Can switch at any time */}
       <div className="flex justify-between items-center mb-4 pb-3 border-b border-border-color">
         <div className="flex items-center gap-3">
           <AiIcon className="w-5 h-5 text-brand-primary" />
           <label htmlFor="llm-provider-select" className="text-sm text-text-secondary">AI Provider:</label>
           <select
             id="llm-provider-select"
             value={llmProvider}
             onChange={(e) => onLLMChange(e.target.value as LLMProvider)}
             className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/20 focus:ring-2 focus:ring-brand-primary focus:outline-none cursor-pointer transition-all"
             title="Switch AI provider at any time"
           >
             <option value="gemini">{LLM_PROVIDER_NAMES.gemini}</option>
             <option value="claude">{LLM_PROVIDER_NAMES.claude}</option>
             <option value="openai">{LLM_PROVIDER_NAMES.openai}</option>
           </select>
           <span className="text-xs text-text-secondary italic">💡 Switch anytime</span>
         </div>
         <div className="text-xs text-text-secondary">
           Parser: {parserDisplayName}
         </div>
       </div>

       <div className="border-b border-border-color">
            <nav className="-mb-px flex space-x-6">
                <button onClick={() => setActiveTab('process')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'process' ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-500'}`}>Parsed Process Flow</button>
                <button onClick={() => setActiveTab('summary')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'summary' ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-500'}`}>AI Migration Guide</button>
                <button onClick={() => setActiveTab('harness')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'harness' ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-500'}`}>Harness Generation Workflow</button>
            </nav>
        </div>

        <div className={activeTab === 'process' ? '' : 'hidden'}>
            <div className="flex justify-end mb-4">
                <button
                    onClick={handleExportParsedText}
                    className="flex items-center gap-2 bg-card-dark border border-border-color text-sm font-semibold py-2 px-4 rounded-lg hover:bg-card-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <DownloadIcon className="w-4 h-4" />
                    Export as Text
                </button>
            </div>
            {parsedData.processes.map(p => <ProcessDetails key={p.name} process={p} />)}
        </div>
        
        <div className={activeTab === 'summary' ? '' : 'hidden'}>
            <div className="flex justify-end gap-3 mb-4">
                <button
                    onClick={handleRegenerateSummary}
                    disabled={isSummaryLoading}
                    className="flex items-center gap-2 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-sm font-semibold py-2 px-4 rounded-lg hover:bg-brand-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Regenerate AI Migration Guide with current LLM provider"
                >
                    <AiIcon className="w-4 h-4" />
                    {isSummaryLoading ? 'Generating...' : 'Regenerate Guide'}
                </button>
                <button
                    onClick={handleExportSummary}
                    disabled={isSummaryLoading || !summary}
                    className="flex items-center gap-2 bg-card-dark border border-border-color text-sm font-semibold py-2 px-4 rounded-lg hover:bg-card-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <DownloadIcon className="w-4 h-4" />
                    Export Guide
                </button>
            </div>
            <SummaryView summary={summary} isLoading={isSummaryLoading} />
        </div>

        <div className={activeTab === 'harness' ? '' : 'hidden'}>
           <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Generation Workflow</h3>
               <button onClick={handleExportYaml} disabled={!workflow.some(s => s.status === 'completed')} className="flex items-center gap-2 bg-card-dark border border-border-color text-sm font-semibold py-2 px-4 rounded-lg hover:bg-card-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors" >
                   <DownloadIcon className="w-4 h-4" />
                   Export Latest YAML
               </button>
           </div>
           <div className="space-y-8">
                {workflowRoots.map(rootStep => (
                    <WorkflowNodeComponent
                        key={rootStep.id}
                        step={rootStep}
                        allSteps={workflow}
                        onGenerate={handleGenerate}
                        onAddStep={handleOpenAddStepModal}
                        onUpdateInstruction={handleUpdateInstruction}
                        onDelete={handleDeleteStep}
                        onEditResult={handleEditResult}
                    />
                ))}
           </div>
        </div>
      
        <AddStepModal 
          isOpen={addStepModalState.isOpen}
          onClose={() => setAddStepModalState({ isOpen: false, parentId: null })}
          onSubmit={handleAddCustomStep}
          parentId={addStepModalState.parentId}
          completedSteps={completedSteps}
          promptTemplates={promptTemplates}
        />
    </div>
  );
};