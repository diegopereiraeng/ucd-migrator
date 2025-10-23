
import React from 'react';
import { AiIcon } from './icons';

interface SummaryViewProps {
  summary: string;
  isLoading: boolean;
}

// A simple markdown-to-html converter
const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  const html = text
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4 border-b border-border-color pb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-extrabold mt-4 mb-6">$1</h1>')
    .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-card-light text-sm font-mono px-1 py-0.5 rounded">$1</code>')
    .replace(/^\s*\n\*/gm, '<ul>\n*')
    .replace(/^(\*.+)\s*\n([^*])/gm, '$1\n</ul>\n$2')
    .replace(/^\* (.*)/gm, '<li class="ml-6 mb-2">$1</li>')
    .replace(/^\s*(\d+\..*)/gm, '<ol class="list-decimal list-inside space-y-2 mb-4">$1')
    .replace(/^(\d+\..+)\s*\n([^\d])/gm, '$1\n</ol>\n$2')
    .replace(/^\d+\. (.*)/gm, '<li class="ml-4">$1</li>')
    .replace(/\n/g, '<br />');

  return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html.replace(/<br \/><ul>/g, '<ul>').replace(/<br \/><ol/g, '<ol>') }} />;
};


export const SummaryView: React.FC<SummaryViewProps> = ({ summary, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-text-secondary bg-background-light p-6 rounded-xl border border-border-color">
        <AiIcon className="w-12 h-12 animate-pulse text-brand-secondary" />
        <p className="mt-4 text-lg">Generating AI Summary...</p>
        <p className="text-sm">This may take a moment.</p>
      </div>
    );
  }

  return (
    <div className="bg-background-light p-6 rounded-xl border border-border-color min-h-96">
      <div className="text-sm leading-relaxed text-text-secondary">
         <MarkdownRenderer text={summary} />
      </div>
    </div>
  );
};
