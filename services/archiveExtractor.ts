// services/archiveExtractor.ts
import JSZip from 'jszip';
import * as pako from 'pako';

/**
 * Checks if a file path is a Mac-specific metadata file that should be excluded
 */
const isMacSpecificFile = (path: string): boolean => {
  const normalizedPath = path.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  
  return (
    // __MACOSX folders and their contents
    normalizedPath.includes('__MACOSX') ||
    // Mac resource fork files (start with ._)
    fileName.startsWith('._') ||
    // Mac folder metadata
    fileName === '.DS_Store'
  );
};

export interface ExtractedFile {
  path: string;
  content: string;
  fileName: string;
}

/**
 * Extracts files from a ZIP archive
 * Handles nested folders recursively
 */
export const extractZipFile = async (arrayBuffer: ArrayBuffer): Promise<ExtractedFile[]> => {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const extractedFiles: ExtractedFile[] = [];

    // Process all files in the zip (including nested directories)
    const filePromises: Promise<void>[] = [];
    
    zip.forEach((relativePath, zipEntry) => {
      // Skip directories (they don't have content)
      if (zipEntry.dir) {
        return;
      }

      // Skip Mac-specific files and folders
      if (isMacSpecificFile(relativePath)) {
        return;
      }

      // Extract the file
      const promise = zipEntry.async('string').then((content) => {
        const fileName = relativePath.split('/').pop() || relativePath;
        extractedFiles.push({
          path: relativePath,
          content,
          fileName
        });
      });

      filePromises.push(promise);
    });

    await Promise.all(filePromises);
    
    console.log(`Extracted ${extractedFiles.length} files from ZIP archive`);
    return extractedFiles;
  } catch (error) {
    console.error('Error extracting ZIP file:', error);
    throw new Error('Failed to extract ZIP file');
  }
};

/**
 * Extracts files from a TAR archive (with optional gzip compression)
 * Handles nested folders recursively
 */
export const extractTarFile = async (arrayBuffer: ArrayBuffer): Promise<ExtractedFile[]> => {
  try {
    let tarData: Uint8Array;

    // Check if the tar is gzip compressed
    const uint8Array = new Uint8Array(arrayBuffer);
    const isGzipped = uint8Array[0] === 0x1f && uint8Array[1] === 0x8b;

    if (isGzipped) {
      // Decompress gzip
      tarData = pako.inflate(uint8Array);
    } else {
      tarData = uint8Array;
    }

    const extractedFiles: ExtractedFile[] = [];
    let offset = 0;

    // Parse TAR format manually
    while (offset < tarData.length) {
      // TAR header is 512 bytes
      if (offset + 512 > tarData.length) {
        break;
      }

      // Read file name (100 bytes at offset 0)
      const nameBytes = tarData.slice(offset, offset + 100);
      const nameEnd = nameBytes.indexOf(0);
      const fileName = new TextDecoder().decode(
        nameBytes.slice(0, nameEnd === -1 ? 100 : nameEnd)
      );

      // If empty filename, we've reached the end
      if (!fileName || fileName.trim() === '') {
        break;
      }

      // Read file size (12 bytes at offset 124, in octal)
      const sizeBytes = tarData.slice(offset + 124, offset + 136);
      const sizeStr = new TextDecoder().decode(sizeBytes).trim().replace(/\0/g, '');
      const fileSize = parseInt(sizeStr, 8);

      // Read file type (1 byte at offset 156)
      const fileType = String.fromCharCode(tarData[offset + 156]);

      // Skip header
      offset += 512;

      // If it's a regular file (type '0' or '\0'), extract content
      if ((fileType === '0' || fileType === '\0' || fileType === '') && fileSize > 0) {
        // Skip Mac-specific files
        if (!isMacSpecificFile(fileName)) {
          if (offset + fileSize <= tarData.length) {
          const contentBytes = tarData.slice(offset, offset + fileSize);
          const content = new TextDecoder().decode(contentBytes);

          const pathParts = fileName.split('/');
          const name = pathParts[pathParts.length - 1];

            extractedFiles.push({
              path: fileName,
              content,
              fileName: name
            });
          }
        }
      }

      // Move to next file (file data is padded to 512-byte boundary)
      const paddedSize = Math.ceil(fileSize / 512) * 512;
      offset += paddedSize;
    }

    console.log(`Extracted ${extractedFiles.length} files from TAR archive`);
    return extractedFiles;
  } catch (error) {
    console.error('Error extracting TAR file:', error);
    throw new Error('Failed to extract TAR file');
  }
};

/**
 * Detects archive type and extracts all files
 * Supports: .zip, .tar, .tar.gz, .tgz
 */
export const extractArchive = async (
  file: File
): Promise<ExtractedFile[]> => {
  const fileName = file.name.toLowerCase();

  try {
    const arrayBuffer = await file.arrayBuffer();

    if (fileName.endsWith('.zip')) {
      return await extractZipFile(arrayBuffer);
    } else if (
      fileName.endsWith('.tar') ||
      fileName.endsWith('.tar.gz') ||
      fileName.endsWith('.tgz')
    ) {
      return await extractTarFile(arrayBuffer);
    } else {
      throw new Error(`Unsupported archive format: ${fileName}`);
    }
  } catch (error) {
    console.error(`Error extracting archive ${fileName}:`, error);
    throw error;
  }
};

/**
 * Filters extracted files to only include relevant CI/CD files
 */
export const filterRelevantFiles = (files: ExtractedFile[]): ExtractedFile[] => {
  return files.filter(file => {
    const path = file.path.toLowerCase();
    const name = file.fileName.toLowerCase();

    // Exclude Mac-specific files (double-check in case they slipped through)
    if (isMacSpecificFile(file.path)) {
      return false;
    }

    // Include CI/CD related files
    return (
      // GitHub Actions
      path.includes('.github/workflows/') ||
      path.includes('.github/actions/') ||
      name.endsWith('.yml') ||
      name.endsWith('.yaml') ||
      // Jenkins
      name === 'jenkinsfile' ||
      name.includes('jenkinsfile') ||
      name.endsWith('.groovy') ||
      name === 'config.xml' ||
      name === 'build.xml' ||
      // General
      name.endsWith('.json') ||
      name.endsWith('.xml')
    );
  });
};
