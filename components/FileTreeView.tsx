// components/FileTreeView.tsx
import React, { useState } from 'react';

interface FileNode {
  name: string;
  type: 'file' | 'directory' | 'archive';
  children?: FileNode[];
  fullPath?: string;
  fileType?: string;
}

interface FileTreeViewProps {
  files: string[];
}

// Intermediate tree node structure used during building
interface TreeNodeBuilder {
  name: string;
  type: 'file' | 'directory' | 'archive';
  children?: { [key: string]: TreeNodeBuilder };
  fullPath?: string;
  fileType?: string;
}

const buildFileTree = (filePaths: string[]): FileNode[] => {
  const root: { [key: string]: TreeNodeBuilder } = {};

  filePaths.forEach(filePath => {
    // Parse file path and type from format "path/to/file.ext (type)"
    const match = filePath.match(/^(.+?)\s*\(([^)]+)\)$/);
    const path = match ? match[1] : filePath;
    const fileType = match ? match[2] : '';

    const parts = path.split('/').filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      if (!current[part]) {
        const isLastPart = index === parts.length - 1;
        const isArchive = isLastPart && (part.endsWith('.zip') || part.endsWith('.tar') || part.endsWith('.tar.gz') || part.endsWith('.tgz'));
        
        current[part] = {
          name: part,
          type: isLastPart ? (isArchive ? 'archive' : 'file') : 'directory',
          children: isLastPart ? undefined : {},
          fullPath: isLastPart ? path : undefined,
          fileType: isLastPart ? fileType : undefined
        };
      }

      if (index < parts.length - 1) {
        current = current[part].children!;
      }
    });
  });

  // Convert object structure to array
  const convertToArray = (obj: { [key: string]: TreeNodeBuilder }): FileNode[] => {
    return Object.values(obj).map(node => ({
      name: node.name,
      type: node.type,
      children: node.children ? convertToArray(node.children) : undefined,
      fullPath: node.fullPath,
      fileType: node.fileType
    })).sort((a, b) => {
      // Directories first, then files
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  };

  return convertToArray(root);
};

const FileIcon: React.FC<{ type: FileNode['type']; name: string }> = ({ type, name }) => {
  if (type === 'directory') {
    return <span className="text-brand-secondary">📁</span>;
  }
  if (type === 'archive') {
    return <span className="text-yellow-400">📦</span>;
  }
  
  // File type icons based on extension
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'yml':
    case 'yaml':
      return <span className="text-blue-400">📄</span>;
    case 'json':
      return <span className="text-green-400">📋</span>;
    case 'xml':
      return <span className="text-orange-400">📰</span>;
    case 'groovy':
    case 'js':
    case 'ts':
      return <span className="text-purple-400">📜</span>;
    case 'md':
      return <span className="text-cyan-400">📝</span>;
    default:
      return <span className="text-gray-400">📄</span>;
  }
};

const TreeNode: React.FC<{ node: FileNode; level: number }> = ({ node, level }) => {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isFile = node.type === 'file' || node.type === 'archive';

  const handleClick = (e: React.MouseEvent) => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    } else if (isFile && node.fullPath) {
      // Generate anchor ID from file path (same logic as StepCard)
      const anchorId = `file-${node.fullPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const element = document.getElementById(anchorId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Add a highlight effect
        element.classList.add('highlight-flash');
        setTimeout(() => element.classList.remove('highlight-flash'), 2000);
      }
    }
  };

  return (
    <div>
      <div
        className={`flex items-center py-1 px-2 rounded transition-colors ${
          isFile ? 'cursor-pointer hover:bg-brand-primary/10 hover:text-brand-primary' : hasChildren ? 'cursor-pointer hover:bg-card-light' : ''
        } ${
          level > 0 ? 'ml-' + (level * 4) : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        title={isFile ? 'Click to view file content' : undefined}
      >
        {hasChildren && (
          <span className="mr-1 text-text-secondary text-xs transition-transform inline-block" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
        )}
        {!hasChildren && <span className="mr-1 w-3 inline-block"></span>}
        <FileIcon type={node.type} name={node.name} />
        <span className="ml-2 text-sm text-text-primary">{node.name}</span>
        {node.fileType && (
          <span className="ml-2 text-xs text-text-secondary italic">({node.fileType})</span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child, index) => (
            <TreeNode key={`${child.name}-${index}`} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTreeView: React.FC<FileTreeViewProps> = ({ files }) => {
  if (!files || files.length === 0) {
    return null;
  }

  const tree = buildFileTree(files);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-text-secondary">
          Files ({files.length})
        </p>
      </div>
      <div 
        className="bg-background-dark border border-border-color rounded-lg p-2 overflow-y-auto"
        style={{ maxHeight: '500px' }}
      >
        {tree.map((node, index) => (
          <TreeNode key={`${node.name}-${index}`} node={node} level={0} />
        ))}
      </div>
    </div>
  );
};
