import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';

interface FileUploadProps {
  onFileUpload: (contents: string[]) => void;
  setFileName: (names: string[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, setFileName }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
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
        fileName.endsWith('.zip') ||
        fileName === 'jenkinsfile' ||
        fileName.includes('jenkinsfile')
      );
    });
    
    if (validFiles.length === 0) {
      alert('Please upload valid files (JSON, XML, Groovy, YAML, or bundle files).');
      return;
    }
    
    setFileName(validFiles.map(file => file.name));
    
    Promise.all(validFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
      });
    })).then(contents => {
      onFileUpload(contents);
    }).catch(err => {
      console.error("Error reading files:", err);
      alert("An error occurred while reading the files.");
    });
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
          <p className="text-xs text-text-secondary">JSON, XML, Groovy, YAML, or bundle files (tar/zip)</p>
        </div>
        <input id="dropzone-file" type="file" className="hidden" onChange={onFileChange} multiple />
      </label>
    </div>
  );
};
