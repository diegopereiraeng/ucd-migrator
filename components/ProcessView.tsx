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
  generateFromNamedContexts,
  DEFAULT_SUMMARY_SYSTEM_INSTRUCTION,
  DEFAULT_HARNESS_YAML_SYSTEM_INSTRUCTION,
  ENRICH_YAML_SYSTEM_INSTRUCTION,
  VALIDATE_SCRIPTS_SYSTEM_INSTRUCTION,
  VALIDATE_SCHEMA_SYSTEM_INSTRUCTION,
  DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION,
  stringifyParsedDataForPrompt,
  extractYamlFromResponse,
  aiService
} from '../services/aiService';
import { SummaryView } from './SummaryView';
import { CodeBlock } from './CodeBlock';
import { FileTreeView } from './FileTreeView';
import { AiIcon, CodeIcon, ProcessIcon, DownloadIcon, SettingsIcon, PlusIcon, SequentialIcon, BranchIcon, TrashIcon } from './icons';
import { getSystemInstructions, getParserDisplayName } from '../services/promptSelector';
import { LLMProvider, LLM_PROVIDER_NAMES } from '../services/llmProvider';
import {
  formatHarnessValidationResult,
  validateHarnessYamlShape,
} from '../services/harnessYamlValidator';

interface ProcessViewProps {
  parsedData: ParsedData;
  fileName: string;
  parserType: string;
  llmProvider: LLMProvider;
  onLLMChange: (provider: LLMProvider) => void;
}

const generateId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const StepCard: React.FC<{ step: ParsedStep }> = ({ step }) => {
  // Generate anchor ID if this step has a fileName property or if we can derive it from the step name
  let anchorId: string | undefined;
  if (step.properties?.fileName) {
    anchorId = `file-${step.properties.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  } else if (step.name && (step.name.includes('Jenkinsfile') || step.name.includes('.groovy') || step.name.includes('.xml'))) {
    // Try to extract filename from step name for common cases
    const match = step.name.match(/(?:Shared Library: |Job Configuration \(|Build Configuration \()?([^:)]+)/);
    if (match) {
      anchorId = `file-${match[1].replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
  }
  
  return (
    <div 
      id={anchorId}
      className="bg-card-dark border border-border-color rounded-lg mb-4 transition-colors"
      style={{
        scrollMarginTop: '20px' // Add some space when scrolling to element
      }}
    >
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

        {step.properties?.fileList && Array.isArray(step.properties.fileList) && (
          <FileTreeView files={step.properties.fileList} />
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
  const [splitPipelineSystemInstruction, setSplitPipelineSystemInstruction] = useState(systemInstructions.splitPipeline || '');
  const [pipelineSkeletonSystemInstruction, setPipelineSkeletonSystemInstruction] = useState(systemInstructions.pipelineSkeleton || '');
  const [ciStageGenerationSystemInstruction, setCiStageGenerationSystemInstruction] = useState(systemInstructions.ciStageGeneration || '');
  const [cdStageGenerationSystemInstruction, setCdStageGenerationSystemInstruction] = useState(systemInstructions.cdStageGeneration || '');
  const [validatePipelineSyntaxSystemInstruction, setValidatePipelineSyntaxSystemInstruction] = useState(systemInstructions.validatePipelineSyntax || '');
  const [validateCiSyntaxSystemInstruction, setValidateCiSyntaxSystemInstruction] = useState(systemInstructions.validateCiSyntax || '');
  const [validateCdSyntaxSystemInstruction, setValidateCdSyntaxSystemInstruction] = useState(systemInstructions.validateCdSyntax || '');
  const [masterMergeSystemInstruction, setMasterMergeSystemInstruction] = useState(systemInstructions.masterMerge || '');
  const [finalUnifiedValidateSystemInstruction, setFinalUnifiedValidateSystemInstruction] = useState(systemInstructions.finalUnifiedValidate || '');

  const [addStepModalState, setAddStepModalState] = useState<{
      isOpen: boolean;
      parentId: string | null;
  }>({ isOpen: false, parentId: null });

  const promptTemplates = useMemo(() => {
    const templates = [
      { name: 'Custom Prompt', instruction: DEFAULT_CUSTOM_GEN_SYSTEM_INSTRUCTION },
      { name: 'Generate Base Pipeline', instruction: harnessYamlSystemInstruction },
      { name: 'Enrich Pipeline (Add Failure Steps)', instruction: enrichYamlSystemInstruction },
      { name: 'Validate Scripts (Find Missing)', instruction: validateScriptsSystemInstruction },
      { name: 'Validate/Fix Harness Schema', instruction: validateSchemaSystemInstruction },
    ];

    if (parserType === 'azureDevOps') {
      templates.push(
        { name: 'ADO Split Pipeline/CI/CD', instruction: splitPipelineSystemInstruction },
        { name: 'ADO Pipeline Skeleton', instruction: pipelineSkeletonSystemInstruction },
        { name: 'ADO CI Stage Generation', instruction: ciStageGenerationSystemInstruction },
        { name: 'ADO CD Stage Generation', instruction: cdStageGenerationSystemInstruction },
        { name: 'ADO Pipeline Syntax Validation', instruction: validatePipelineSyntaxSystemInstruction },
        { name: 'ADO CI Syntax Validation', instruction: validateCiSyntaxSystemInstruction },
        { name: 'ADO CD Syntax Validation', instruction: validateCdSyntaxSystemInstruction },
        { name: 'ADO Master Merge', instruction: masterMergeSystemInstruction },
        { name: 'ADO Final Unified Validation', instruction: finalUnifiedValidateSystemInstruction },
      );
    }

    return templates;
  }, [
    parserType,
    harnessYamlSystemInstruction,
    enrichYamlSystemInstruction,
    validateScriptsSystemInstruction,
    validateSchemaSystemInstruction,
    splitPipelineSystemInstruction,
    pipelineSkeletonSystemInstruction,
    ciStageGenerationSystemInstruction,
    cdStageGenerationSystemInstruction,
    validatePipelineSyntaxSystemInstruction,
    validateCiSyntaxSystemInstruction,
    validateCdSyntaxSystemInstruction,
    masterMergeSystemInstruction,
    finalUnifiedValidateSystemInstruction,
  ]);
  
  const getInitialWorkflow = (): WorkflowStep[] => {
    if (parserType === 'azureDevOps') {
      return [
        { id: 'ado-split', parentId: null, title: 'Step 1: Split ADO Pipeline Artifacts', description: 'Extracts and normalizes pipeline-level, CI, and CD definitions for specialist conversion.', systemInstruction: splitPipelineSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: [] },
        { id: 'ado-pipeline-skeleton', parentId: 'ado-split', title: 'Step 2A: Generate Pipeline Skeleton', description: 'Generates top-level Harness pipeline YAML without stages.', systemInstruction: pipelineSkeletonSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split'] },
        { id: 'ado-ci-generate', parentId: 'ado-split', title: 'Step 2B: Generate CI Stages', description: 'Converts Azure CI definitions into Harness CI stages.', systemInstruction: ciStageGenerationSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split'] },
        { id: 'ado-cd-generate', parentId: 'ado-split', title: 'Step 2C: Generate CD Stages', description: 'Converts Azure CD definitions into Harness Deployment/Custom stages.', systemInstruction: cdStageGenerationSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split'] },
        { id: 'ado-pipeline-validate', parentId: 'ado-pipeline-skeleton', title: 'Step 3A: Validate Pipeline Skeleton', description: 'Validates and auto-fixes top-level pipeline YAML structure.', systemInstruction: validatePipelineSyntaxSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split', 'ado-pipeline-skeleton'] },
        { id: 'ado-ci-validate', parentId: 'ado-ci-generate', title: 'Step 3B: Validate CI Stages', description: 'Validates and auto-fixes CI stage YAML fragments.', systemInstruction: validateCiSyntaxSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split', 'ado-ci-generate'] },
        { id: 'ado-cd-validate', parentId: 'ado-cd-generate', title: 'Step 3C: Validate CD Stages', description: 'Validates and auto-fixes CD stage YAML fragments.', systemInstruction: validateCdSyntaxSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split', 'ado-cd-generate'] },
        { id: 'ado-master-merge', parentId: 'ado-pipeline-validate', title: 'Step 4: Master Merge', description: 'Merges validated skeleton + CI + CD fragments into one unified pipeline.', systemInstruction: masterMergeSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-split', 'ado-pipeline-validate', 'ado-ci-validate', 'ado-cd-validate'] },
        { id: 'ado-final-validate', parentId: 'ado-master-merge', title: 'Step 5: Final Unified Validation', description: 'Runs final schema validation and safe auto-fixes for the complete merged pipeline.', systemInstruction: finalUnifiedValidateSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['ado-master-merge'] },
      ];
    }

    return [
      { id: 'base', parentId: null, title: 'Step 1: Generate Base Pipeline', description: `Generates the initial pipeline based on the ${parserDisplayName} main success path.`, systemInstruction: harnessYamlSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: [] },
      { id: 'enrich', parentId: 'base', title: 'Step 2: Add Missing Steps', description: `Analyzes the first pipeline and adds logic from the ${parserDisplayName} failure paths.`, systemInstruction: enrichYamlSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['base'] },
      { id: 'validate-scripts', parentId: 'enrich', title: 'Step 3: Validate Scripts', description: `Cross-references the final YAML against the original ${parserDisplayName} data to ensure no scripts were missed.`, systemInstruction: validateScriptsSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['enrich'] },
      { id: 'validate-schema', parentId: 'validate-scripts', title: 'Step 4: Validate Schema', description: 'Performs a structural validation of the YAML against the Harness schema.', systemInstruction: validateSchemaSystemInstruction, status: 'initial', result: '', isCustom: false, contextSourceIds: ['validate-scripts'] }
    ];
  };

  useEffect(() => {
    setWorkflow(getInitialWorkflow());
  }, [
    parserType,
    harnessYamlSystemInstruction,
    enrichYamlSystemInstruction,
    validateScriptsSystemInstruction,
    validateSchemaSystemInstruction,
    splitPipelineSystemInstruction,
    pipelineSkeletonSystemInstruction,
    ciStageGenerationSystemInstruction,
    cdStageGenerationSystemInstruction,
    validatePipelineSyntaxSystemInstruction,
    validateCiSyntaxSystemInstruction,
    validateCdSyntaxSystemInstruction,
    masterMergeSystemInstruction,
    finalUnifiedValidateSystemInstruction,
  ]);

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

  const parseJsonSafely = <T,>(value: string): T | null => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  };

  const getAzureSplitArtifacts = (): any => {
    const allSteps: ParsedStep[] = [];
    parsedData.processes.forEach((process) => {
      allSteps.push(...process.mainFlow);
    });
    const summaryStep = allSteps.find(step => step.id === 'bundle_summary');

    return summaryStep?.properties?.splitArtifacts || null;
  };

  const getAzureSourceSummary = (): Record<string, unknown> | null => {
    const allSteps: ParsedStep[] = [];
    parsedData.processes.forEach((process) => {
      allSteps.push(...process.mainFlow);
    });

    const summaryStep = allSteps.find(step => step.id === 'bundle_summary');
    const summaryProps = summaryStep?.properties;
    if (!summaryProps) {
      return null;
    }

    return {
      totalFiles: summaryProps.totalFiles,
      pipelineCount: summaryProps.pipelineCount,
      templateCount: summaryProps.templateCount,
      variableGroupCount: summaryProps.variableGroupCount,
      fileList: summaryProps.fileList,
      splitArtifacts: summaryProps.splitArtifacts,
    };
  };

  const getNormalizedYaml = (rawContent: string): string => extractYamlFromResponse(rawContent);

  const getAzureContextPayload = (split: any): Record<string, string> => {
    const pipelineMeta = split?.pipeline_meta || {};
    const ciDefinition = split?.ci_definition || {};
    const cdDefinition = split?.cd_definition || {};

    return {
      pipeline_meta: JSON.stringify(pipelineMeta, null, 2),
      ci_definition: JSON.stringify(ciDefinition, null, 2),
      cd_definition: JSON.stringify(cdDefinition, null, 2),
      pipeline_meta_classification_summary: JSON.stringify(pipelineMeta?.classification_summary || {}, null, 2),
      pipeline_meta_resources_summary: JSON.stringify(pipelineMeta?.resources_summary || [], null, 2),
      pipeline_meta_expression_evidence: JSON.stringify(pipelineMeta?.expression_evidence || [], null, 2),
      pipeline_meta_output_variable_links: JSON.stringify(pipelineMeta?.output_variable_links || [], null, 2),
      pipeline_meta_deployment_lifecycle_index: JSON.stringify(pipelineMeta?.deployment_lifecycle_index || [], null, 2),
      ci_output_variable_links: JSON.stringify(ciDefinition?.output_variable_links || [], null, 2),
      cd_output_variable_links: JSON.stringify(cdDefinition?.output_variable_links || [], null, 2),
      cd_lifecycle_hooks: JSON.stringify(cdDefinition?.lifecycle_hooks || [], null, 2),
    };
  };

  const getAzureNamedMetadataContexts = (split: any): Array<{ name: string; content: unknown }> => {
    const pipelineMeta = split?.pipeline_meta || {};
    const ciDefinition = split?.ci_definition || {};
    const cdDefinition = split?.cd_definition || {};

    return [
      { name: 'pipeline_meta_classification_summary', content: pipelineMeta?.classification_summary || {} },
      { name: 'pipeline_meta_resources_summary', content: pipelineMeta?.resources_summary || [] },
      { name: 'pipeline_meta_expression_evidence', content: pipelineMeta?.expression_evidence || [] },
      { name: 'pipeline_meta_output_variable_links', content: pipelineMeta?.output_variable_links || [] },
      { name: 'pipeline_meta_deployment_lifecycle_index', content: pipelineMeta?.deployment_lifecycle_index || [] },
      { name: 'ci_output_variable_links', content: ciDefinition?.output_variable_links || [] },
      { name: 'cd_output_variable_links', content: cdDefinition?.output_variable_links || [] },
      { name: 'cd_lifecycle_hooks', content: cdDefinition?.lifecycle_hooks || [] },
    ];
  };

  const hasCiSplitContent = (split: any): boolean => {
    const stageCount = split?.ci_definition?.stages?.length || 0;
    const jobCount = split?.ci_definition?.jobs?.length || 0;
    const templateCount = split?.ci_definition?.templates?.length || 0;
    return stageCount > 0 || jobCount > 0 || templateCount > 0;
  };

  const hasCdSplitContent = (split: any): boolean => {
    const stageCount = split?.cd_definition?.stages?.length || 0;
    const jobCount = split?.cd_definition?.jobs?.length || 0;
    const releaseCount = split?.cd_definition?.release_definitions?.length || 0;
    const templateCount = split?.cd_definition?.templates?.length || 0;
    return stageCount > 0 || jobCount > 0 || releaseCount > 0 || templateCount > 0;
  };


  const handleGenerate = async (stepId: string) => {
    const step = workflow.find(s => s.id === stepId);
    if (!step) return;

    setWorkflow(prev => prev.map(s => s.id === stepId ? { ...s, status: 'loading', result: '' } : s));

    try {
      let result = '';
      const { systemInstruction, contextSourceIds } = step;

      const completedContextMap = new Map<string, WorkflowStep>();
      contextSourceIds.forEach((id) => {
        const stepCandidate = workflow.find(s => s.id === id);
        if (stepCandidate?.status === 'completed') {
          completedContextMap.set(id, stepCandidate);
        }
      });

      let requiredContextIds = [...contextSourceIds];
      if (step.id === 'ado-master-merge') {
        const split = parseJsonSafely<any>(workflow.find(s => s.id === 'ado-split')?.result || '') || getAzureSplitArtifacts();
        const hasCi = hasCiSplitContent(split);
        const hasCd = hasCdSplitContent(split);
        requiredContextIds = ['ado-split', 'ado-pipeline-validate'];
        if (hasCi) {
          requiredContextIds.push('ado-ci-validate');
        }
        if (hasCd) {
          requiredContextIds.push('ado-cd-validate');
        }
      }

      const missingRequiredContexts = requiredContextIds.filter(id => !completedContextMap.has(id));
      if (missingRequiredContexts.length > 0) {
          throw new Error(`One or more required context steps must be completed before running this step. Missing: ${missingRequiredContexts.join(', ')}`);
      }

      const contextSteps = requiredContextIds
          .map(id => completedContextMap.get(id))
          .filter((s): s is WorkflowStep => !!s);
      
      const parentResult = contextSteps.length > 0 ? contextSteps[0].result : '';

      switch(step.id) {
        case 'ado-split': {
          const splitArtifacts = getAzureSplitArtifacts();
          if (splitArtifacts) {
            result = JSON.stringify(splitArtifacts, null, 2);
            break;
          }

          result = await generateFromContext({
            parsedData: stringifyParsedDataForPrompt(parsedData),
          }, systemInstruction);
          break;
        }
        case 'ado-pipeline-skeleton': {
          const split = parseJsonSafely<any>(parentResult) || getAzureSplitArtifacts();
          result = await generateFromContext({
            ...getAzureContextPayload(split),
            parsedData: stringifyParsedDataForPrompt(parsedData),
          }, systemInstruction);
          break;
        }
        case 'ado-ci-generate': {
          const split = parseJsonSafely<any>(parentResult) || getAzureSplitArtifacts();
          result = await generateFromContext({
            ...getAzureContextPayload(split),
            parsedData: stringifyParsedDataForPrompt(parsedData),
          }, systemInstruction);
          break;
        }
        case 'ado-cd-generate': {
          const split = parseJsonSafely<any>(parentResult) || getAzureSplitArtifacts();
          result = await generateFromContext({
            ...getAzureContextPayload(split),
            placeholder_serviceRef: '<+service.name>',
            placeholder_serviceUseFromStage: 'Build',
            placeholder_environmentRef: '<+env.name>',
            placeholder_infraRef: '<+infra.name>',
            placeholder_infraType: 'SshWinRmAzure',
            placeholder_connectorRef: '<+input>',
            placeholder_credentialsRef: '<+input>',
            placeholder_hostConnectionType: 'Hostname',
            placeholder_resourceGroup: '<+input>',
            placeholder_subscriptionId: '<+input>',
            parsedData: stringifyParsedDataForPrompt(parsedData),
          }, systemInstruction);
          break;
        }
        case 'ado-pipeline-validate': {
          const split = parseJsonSafely<any>(contextSteps.find(s => s.id === 'ado-split')?.result || '') || getAzureSplitArtifacts();
          const pipelineSkeletonYaml = getNormalizedYaml(contextSteps.find(s => s.id === 'ado-pipeline-skeleton')?.result || parentResult);
          result = await generateFromContext({
            ...getAzureContextPayload(split),
            pipeline_skeleton_yaml: pipelineSkeletonYaml,
          }, systemInstruction);
          break;
        }
        case 'ado-ci-validate': {
          const split = parseJsonSafely<any>(contextSteps.find(s => s.id === 'ado-split')?.result || '') || getAzureSplitArtifacts();
          const ciFragmentYaml = getNormalizedYaml(contextSteps.find(s => s.id === 'ado-ci-generate')?.result || parentResult);
          result = await generateFromContext({
            ...getAzureContextPayload(split),
            ci_fragment_yaml: ciFragmentYaml,
          }, systemInstruction);
          break;
        }
        case 'ado-cd-validate': {
          const split = parseJsonSafely<any>(contextSteps.find(s => s.id === 'ado-split')?.result || '') || getAzureSplitArtifacts();
          const cdFragmentYaml = getNormalizedYaml(contextSteps.find(s => s.id === 'ado-cd-generate')?.result || parentResult);
          result = await generateFromContext({
            ...getAzureContextPayload(split),
            cd_fragment_yaml: cdFragmentYaml,
            placeholder_serviceRef: '<+service.name>',
            placeholder_serviceUseFromStage: 'Build',
            placeholder_environmentRef: '<+env.name>',
            placeholder_infraRef: '<+infra.name>',
            placeholder_infraType: 'SshWinRmAzure',
            placeholder_connectorRef: '<+input>',
            placeholder_credentialsRef: '<+input>',
            placeholder_hostConnectionType: 'Hostname',
            placeholder_resourceGroup: '<+input>',
            placeholder_subscriptionId: '<+input>',
          }, systemInstruction);
          break;
        }
        case 'ado-master-merge': {
          const split = parseJsonSafely<any>(contextSteps.find(s => s.id === 'ado-split')?.result || '') || getAzureSplitArtifacts();
          const adoSourceSummary = getAzureSourceSummary();
          const pipelineGenerated = getNormalizedYaml(workflow.find(s => s.id === 'ado-pipeline-skeleton')?.result || '');
          const ciGenerated = getNormalizedYaml(workflow.find(s => s.id === 'ado-ci-generate')?.result || '');
          const cdGenerated = getNormalizedYaml(workflow.find(s => s.id === 'ado-cd-generate')?.result || '');
          const pipelineValidated = getNormalizedYaml(contextSteps.find(s => s.id === 'ado-pipeline-validate')?.result || '');
          const ciValidated = getNormalizedYaml(contextSteps.find(s => s.id === 'ado-ci-validate')?.result || '');
          const cdValidated = getNormalizedYaml(contextSteps.find(s => s.id === 'ado-cd-validate')?.result || '');

          result = await generateFromNamedContexts([
            { name: 'ado_source_summary', content: adoSourceSummary || {} },
            { name: 'pipeline_meta', content: split?.pipeline_meta || {} },
            ...getAzureNamedMetadataContexts(split),
            { name: 'pipeline_generated_yaml', content: pipelineGenerated },
            { name: 'ci_generated_yaml', content: ciGenerated },
            { name: 'cd_generated_yaml', content: cdGenerated },
            { name: 'pipeline_validated_yaml', content: pipelineValidated },
            { name: 'ci_validated_yaml', content: ciValidated },
            { name: 'cd_validated_yaml', content: cdValidated },
            { name: 'parsedData', content: stringifyParsedDataForPrompt(parsedData) },
          ], systemInstruction);

          const mergedYaml = getNormalizedYaml(result);
          result = `\`\`\`yaml\n${mergedYaml}\n\`\`\``;
          break;
        }
        case 'ado-final-validate':
          {
            const mergedYaml = getNormalizedYaml(parentResult);
            const aiValidationResult = await validateSchema(mergedYaml, systemInstruction);
            const correctedYamlCandidate = getNormalizedYaml(aiValidationResult);

            const correctedValidation = validateHarnessYamlShape(correctedYamlCandidate);
            const mergedValidation = validateHarnessYamlShape(mergedYaml);

            let finalYaml = correctedYamlCandidate;
            let finalValidation = correctedValidation;

            if (!correctedValidation.valid && mergedValidation.valid) {
              finalYaml = mergedYaml;
              finalValidation = mergedValidation;
            }

            if (!finalValidation.valid) {
              const localValidationFeedback = formatHarnessValidationResult(finalValidation);
              const retrySystemInstruction = `${systemInstruction}\n\nAdditional deterministic local validation feedback (must be fully fixed):\n${localValidationFeedback}\n\nReturn corrected_pipeline_yaml with all listed local errors fixed.`;

              const llmRetryValidationResult = await validateSchema(finalYaml, retrySystemInstruction);
              const llmRetryYamlCandidate = getNormalizedYaml(llmRetryValidationResult);
              const retryValidation = validateHarnessYamlShape(llmRetryYamlCandidate);

              if (retryValidation.valid) {
                finalYaml = llmRetryYamlCandidate;
                finalValidation = retryValidation;
              }
            }

            if (finalValidation.valid) {
              result = `\`\`\`yaml\n${finalYaml}\n\`\`\``;
            } else {
              result = `\`\`\`yaml\n${finalYaml}\n\`\`\`\n\n${formatHarnessValidationResult(finalValidation)}`;
            }
          }
          break;
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
          {
            const inputYaml = getNormalizedYaml(parentResult);
            const aiValidationResult = await validateSchema(inputYaml, systemInstruction);
            const correctedYamlCandidate = getNormalizedYaml(aiValidationResult);
            const localValidationTarget = correctedYamlCandidate?.includes('pipeline:') ? correctedYamlCandidate : inputYaml;
            const localValidation = validateHarnessYamlShape(localValidationTarget);
            result = `${aiValidationResult}\n\n${formatHarnessValidationResult(localValidation)}`;
          }
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
    const latestYamlStep = [...workflow].reverse().find((s) => {
      if (s.status !== 'completed') return false;
      return s.result.includes('pipeline:');
    });
    const yamlRaw = latestYamlStep?.result || "No YAML generated yet.";
    const yamlToExport = getNormalizedYaml(yamlRaw);
    downloadFile(yamlToExport, `${fileName.replace('.json', '')}-harness-pipeline.yml`, 'application/x-yaml');
  };

  const handleExportParsedText = () => {
    const parsedText = stringifyParsedDataForPrompt(parsedData);
    downloadFile(parsedText, `${fileName.replace('.json', '')}-parsed-prompt.txt`, 'text/plain');
  };

  const workflowRoots = useMemo(() => workflow.filter(step => step.parentId === null), [workflow]);
  const completedSteps = useMemo(() => workflow.filter(s => s.status === 'completed'), [workflow]);


  return (
    <>
      <style>{`
        @keyframes highlight-flash {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); border-color: rgb(99, 102, 241); }
          50% { box-shadow: 0 0 20px 5px rgba(99, 102, 241, 0.4); border-color: rgb(99, 102, 241); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); border-color: var(--border-color); }
        }
        .highlight-flash {
          animation: highlight-flash 2s ease-in-out;
        }
      `}</style>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-1">Pipeline Analysis</h2>
          <p className="text-text-secondary">Source: <span className="font-semibold">{parsedData.componentName}</span></p>
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
            {parserType === 'azureDevOps' && (
              <>
                <div>
                  <label htmlFor="ado-split-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 1: Split Prompt</label>
                  <textarea id="ado-split-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={splitPipelineSystemInstruction} onChange={(e) => setSplitPipelineSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-pipeline-skeleton-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 2A: Pipeline Skeleton Prompt</label>
                  <textarea id="ado-pipeline-skeleton-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={pipelineSkeletonSystemInstruction} onChange={(e) => setPipelineSkeletonSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-ci-gen-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 2B: CI Generation Prompt</label>
                  <textarea id="ado-ci-gen-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={ciStageGenerationSystemInstruction} onChange={(e) => setCiStageGenerationSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-cd-gen-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 2C: CD Generation Prompt</label>
                  <textarea id="ado-cd-gen-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={cdStageGenerationSystemInstruction} onChange={(e) => setCdStageGenerationSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-pipeline-validate-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 3A: Pipeline Syntax Validator</label>
                  <textarea id="ado-pipeline-validate-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={validatePipelineSyntaxSystemInstruction} onChange={(e) => setValidatePipelineSyntaxSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-ci-validate-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 3B: CI Syntax Validator</label>
                  <textarea id="ado-ci-validate-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={validateCiSyntaxSystemInstruction} onChange={(e) => setValidateCiSyntaxSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-cd-validate-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 3C: CD Syntax Validator</label>
                  <textarea id="ado-cd-validate-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={validateCdSyntaxSystemInstruction} onChange={(e) => setValidateCdSyntaxSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-master-merge-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 4: Master Merge Prompt</label>
                  <textarea id="ado-master-merge-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={masterMergeSystemInstruction} onChange={(e) => setMasterMergeSystemInstruction(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ado-final-validate-prompt" className="block text-sm font-medium text-text-primary mb-1">ADO Step 5: Final Validator Prompt</label>
                  <textarea id="ado-final-validate-prompt" rows={6} className="w-full p-2 bg-background-dark border border-border-color rounded-md text-xs" value={finalUnifiedValidateSystemInstruction} onChange={(e) => setFinalUnifiedValidateSystemInstruction(e.target.value)} />
                </div>
              </>
            )}
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
             <option value="copilot">{LLM_PROVIDER_NAMES.copilot}</option>
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
    </>
  );
};