import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';
import { extractArchive, filterRelevantFiles, ExtractedFile } from '../services/archiveExtractor';

interface FileUploadProps {
  onFileUpload: (contents: string[]) => void;
  setFileName: (names: string[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, setFileName }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    // Accept JSON, XML, Groovy, YAML, and bundle files (tar, zip)
    const validFiles = Array.from(files).filter(file => {
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();
      
      return (
        fileType === 'application/json' ||
        fileType === 'application/xml' ||
        fileType === 'text/xml' ||
        fileType === 'text/plain' ||
        fileType === 'application/x-yaml' ||
        fileType === 'text/yaml' ||
        fileType === 'application/yaml' ||
        fileType === 'application/x-tar' ||
        fileType === 'application/zip' ||
        fileType === 'application/x-zip-compressed' ||
        fileType === '' || // Files without MIME type (like Jenkinsfile)
        fileName.endsWith('.json') ||
        fileName.endsWith('.xml') ||
        fileName.endsWith('.groovy') ||
        fileName.endsWith('.yml') ||
        fileName.endsWith('.yaml') ||
        fileName.endsWith('.tar') ||
        fileName.endsWith('.tar.gz') ||
        fileName.endsWith('.tgz') ||
        fileName.endsWith('.zip') ||
        fileName === 'jenkinsfile' ||
        fileName.includes('jenkinsfile')
      );
    });
    
    if (validFiles.length === 0) {
      alert('Please upload valid files (JSON, XML, Groovy, YAML, or bundle files).');
      return;
    }
    
    try {
      const allContents: string[] = [];
      const allFileNames: string[] = [];
      
      for (const file of validFiles) {
        const fileName = file.name.toLowerCase();
        
        // Check if it's an archive file
        const isArchive = 
          fileName.endsWith('.tar') ||
          fileName.endsWith('.tar.gz') ||
          fileName.endsWith('.tgz') ||
          fileName.endsWith('.zip');
        
        if (isArchive) {
          // Extract archive and get all files (including nested folders)
          console.log(`Extracting archive: ${file.name}`);
          const extractedFiles: ExtractedFile[] = await extractArchive(file);
          
          // Filter to only relevant CI/CD files
          const relevantFiles = filterRelevantFiles(extractedFiles);
          
          console.log(`Found ${relevantFiles.length} relevant files in ${file.name}:`);
          relevantFiles.forEach(f => console.log(`  - ${f.path}`));
          
          // Add all extracted file contents
          relevantFiles.forEach(extracted => {
            allContents.push(extracted.content);
            allFileNames.push(`${file.name}/${extracted.path}`);
          });
          
          if (relevantFiles.length === 0) {
            alert(`No relevant CI/CD files found in archive: ${file.name}`);
          }
        } else {
          // Regular file - read as text
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
          });
          
          allContents.push(content);
          allFileNames.push(file.name);
        }
      }
      
      if (allContents.length === 0) {
        alert('No valid files found to process.');
        return;
      }
      
      setFileName(allFileNames);
      onFileUpload(allContents);
      
    } catch (err) {
      console.error("Error processing files:", err);
      alert("An error occurred while processing the files: " + (err as Error).message);
    }
  };

  const onDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);
  
  const onDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFiles(event.dataTransfer.files);
      event.dataTransfer.clearData();
    }
  }, [onFileUpload, setFileName]);


  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleFiles(event.target.files);
    }
  };

  return (
    <div className="flex items-center justify-center w-full">
      <label
        htmlFor="dropzone-file"
        className={`flex flex-col items-center justify-center w-full h-64 border-2 border-border-color border-dashed rounded-lg cursor-pointer bg-card-dark hover:bg-card-light transition-colors ${isDragging ? 'bg-card-light' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon className="w-10 h-10 mb-3 text-text-secondary" />
          <p className="mb-2 text-sm text-text-secondary">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-text-secondary">JSON, XML, Groovy, YAML, or archives (tar/tar.gz/zip)</p>
        </div>
        <input id="dropzone-file" type="file" className="hidden" onChange={onFileChange} multiple />
      </label>
    </div>
  );
};
