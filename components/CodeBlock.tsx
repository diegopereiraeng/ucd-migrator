
import React, { useState } from 'react';

interface CodeBlockProps {
  title: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-background-dark border border-border-color rounded-lg my-2">
      <div className="flex justify-between items-center px-4 py-2 bg-card-light rounded-t-lg">
        <h4 className="text-sm font-semibold text-text-secondary">{title}</h4>
        <button
          onClick={handleCopy}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono overflow-x-auto text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );
};
