  
import React from 'react';
import { AiIcon } from './icons';

interface SummaryViewProps {
  summary: string;
  isLoading: boolean;
}

// A simple markdown-to-html converter with HTML pass-through support
const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  // First, clean up any class attributes from AI-generated HTML to prevent display issues
  let cleanText = text.replace(/class="[^"]*"/g, '');
  
  // Convert markdown to HTML, but skip lines that already contain HTML tags
  const lines = cleanText.split('\n');
  const processedLines = lines.map(line => {
    // Skip lines that already have HTML tags (except our generated ones)
    if (line.trim().match(/^<(h[1-6]|ul|ol|li|strong|em|code|p|div|br)/)) {
      return line;
    }
    
    // Process markdown headers
    if (line.match(/^### /)) {
      return line.replace(/^### (.*)$/g, '<h3 class="text-xl font-semibold mt-6 mb-2">$1</h3>');
    }
    if (line.match(/^## /)) {
      return line.replace(/^## (.*)$/g, '<h2 class="text-2xl font-bold mt-8 mb-4 border-b border-border-color pb-2">$1</h2>');
    }
    if (line.match(/^# /)) {
      return line.replace(/^# (.*)$/g, '<h1 class="text-3xl font-extrabold mt-4 mb-6">$1</h1>');
    }
    
    // Process markdown lists
    if (line.match(/^\* /)) {
      return line.replace(/^\* (.*)$/g, '<li class="ml-6 mb-2 list-disc">$1</li>');
    }
    if (line.match(/^\d+\. /)) {
      return line.replace(/^\d+\. (.*)$/g, '<li class="ml-6 mb-2 list-decimal">$1</li>');
    }
    
    // Process inline markdown
    let processed = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-card-light text-sm font-mono px-1 py-0.5 rounded">$1</code>');
    
    return processed;
  });
  
  const html = processedLines.join('<br />');

  return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
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
