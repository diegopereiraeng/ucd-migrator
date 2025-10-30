// App.tsx
import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessView } from './components/ProcessView';
import { AiIcon } from './components/icons';
import { ParsedData } from './types';
import { parsers, defaultParserKey } from './services/parserService';

function App() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [selectedParser, setSelectedParser] = useState<string>(defaultParserKey);

  const handleFileUpload = (contents: string[]) => {
    setError('');
    const parserFunc = parsers[selectedParser]?.parse;
    if (!parserFunc) {
      setError(`Invalid parser selected: ${selectedParser}`);
      return;
    }

    const data = parserFunc(contents);
    console.log('Parsed data:', data);

    // 🧩 TypeScript-safe check (permite estructuras variadas sin romper tipos)
    const d = data as any;

    const hasProcesses =
      (Array.isArray(d?.processes) && d.processes.length >= 0) ||
      (Array.isArray(d?.genericProcesses) && d.genericProcesses.length >= 0) ||
      (Array.isArray(d?.componentProcesses) && d.componentProcesses.length >= 0);

    if (data && hasProcesses) {
      setParsedData(data);
    } else {
      setError(
        'Invalid JSON file(s). Please check the file format and ensure it matches a supported structure (processes, genericProcesses, or componentProcesses).'
      );
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
      {/* Header */}
      <header className="py-4 border-b border-border-color">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AiIcon className="w-8 h-8 text-brand-primary" />
            <h1 className="text-xl font-bold">
              Harness UCD Process Analyzer & Migration Assistant
            </h1>
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

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        {!parsedData ? (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold">Upload Source CI/CD File(s)</h2>
              <p className="text-text-secondary mt-2">
                Select a parser and upload one or more exported template files to begin.
              </p>
            </div>

            <div className="max-w-md mx-auto mb-6">
              <label
                htmlFor="parser-select"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Select Parser:
              </label>
              <select
                id="parser-select"
                value={selectedParser}
                onChange={(e) => setSelectedParser(e.target.value)}
                className="w-full p-2 bg-card-dark border border-border-color rounded-lg focus:ring-brand-primary focus:border-brand-primary"
              >
                {Object.entries(parsers).map(([key, parser]) => (
                  <option key={key} value={key}>
                    {parser.name}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-center text-red-500 mb-4">{error}</p>}
            <FileUpload onFileUpload={handleFileUpload} setFileName={handleSetFileNames} />
          </div>
        ) : (
          <ProcessView parsedData={parsedData} fileName={fileName} />
        )}
      </main>

      {/* Footer */}
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