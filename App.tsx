// App.tsx
import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessView } from './components/ProcessView';
import { AiIcon } from './components/icons';
import { ParsedData } from './types';
import { parsers, defaultParserKey } from './services/parserService';
import { aiService } from './services/aiService';
import { LLMProvider, LLM_PROVIDER_NAMES } from './services/llmProvider';

function App() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [selectedParser, setSelectedParser] = useState<string>(defaultParserKey);
  const [selectedLLM, setSelectedLLM] = useState<LLMProvider>('gemini');

  const handleLLMChange = (provider: LLMProvider) => {
    setSelectedLLM(provider);
    aiService.setProvider(provider);
  };

  const handleFileUpload = (contents: string[]) => {
    setError('');
    const parserFunc = parsers[selectedParser]?.parse;
    if (!parserFunc) {
      setError(`Invalid parser selected: ${selectedParser}`);
      return;
    }

    const data = parserFunc(contents);
    if (data && data.processes.length > 0) {
      setParsedData(data);
    } else {
      setError('Invalid or empty JSON file(s). Please check the file format and ensure it contains valid processes.');
      setParsedData(null);
      setFileName('');
    }
  };
  
  const handleSetFileNames = (names: string[]) => {
    setFileName(names.join(', '));
  };

  const handleReset = () => {
    setParsedData(null);
    setFileName('');
    setError('');
  };

  return (
    <div className="bg-background-dark min-h-screen text-text-primary font-sans">
      <header className="py-4 border-b border-border-color">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AiIcon className="w-8 h-8 text-brand-primary" />
            <h1 className="text-xl font-bold">Harness Jenkins Pipeline Analyzer & Migration Assistant</h1>
          </div>
          {parsedData && (
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm bg-card-dark border border-border-color rounded-lg hover:bg-card-light transition-colors"
            >
              Analyze New File(s)
            </button>
          )}
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {!parsedData ? (
          <div>
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold">Upload Source CI/CD File(s)</h2>
                <p className="text-text-secondary mt-2">Select a parser and upload one or more exported template files to begin.</p>
            </div>
            
            <div className="max-w-md mx-auto mb-6 space-y-4">
                <div>
                  <label htmlFor="parser-select" className="block text-sm font-medium text-text-secondary mb-2">Select Parser:</label>
                  <select 
                    id="parser-select"
                    value={selectedParser}
                    onChange={(e) => setSelectedParser(e.target.value)}
                    className="w-full p-2 bg-card-dark border border-border-color rounded-lg focus:ring-brand-primary focus:border-brand-primary"
                  >
                    {Object.entries(parsers).map(([key, parser]) => (
                      <option key={key} value={key}>{parser.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="llm-select" className="block text-sm font-medium text-text-secondary mb-2">Select AI Provider:</label>
                  <select 
                    id="llm-select"
                    value={selectedLLM}
                    onChange={(e) => handleLLMChange(e.target.value as LLMProvider)}
                    className="w-full p-2 bg-card-dark border border-border-color rounded-lg focus:ring-brand-primary focus:border-brand-primary"
                  >
                    <option value="gemini">{LLM_PROVIDER_NAMES.gemini}</option>
                    <option value="claude">{LLM_PROVIDER_NAMES.claude}</option>
                    <option value="openai">{LLM_PROVIDER_NAMES.openai}</option>
                  </select>
                  <p className="text-xs text-text-secondary mt-1">
                    Current: {LLM_PROVIDER_NAMES[selectedLLM]}
                  </p>
                </div>
            </div>

            {error && <p className="text-center text-red-500 mb-4">{error}</p>}
            <FileUpload onFileUpload={handleFileUpload} setFileName={handleSetFileNames} />
          </div>
        ) : (
          <ProcessView parsedData={parsedData} fileName={fileName} parserType={selectedParser} llmProvider={selectedLLM} onLLMChange={handleLLMChange} />
        )}
      </main>
      <footer className="py-4 mt-8 border-t border-border-color">
        <div className="container mx-auto px-4 text-center text-text-secondary text-sm">
          <p>Created by Diego Pereira</p>
          <p className="mt-1">Powered by Harness AI</p>
        </div>
      </footer>
    </div>
  );
}

export default App;