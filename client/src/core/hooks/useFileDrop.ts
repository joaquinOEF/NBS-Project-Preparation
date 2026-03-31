import { useState, useCallback, useRef, DragEvent } from 'react';

interface UseFileDropOptions {
  onFileDrop: (file: File, content: string) => void;
  acceptedTypes?: string[];
}

export function useFileDrop({ onFileDrop, acceptedTypes = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.txt', '.md'] }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedTypes.includes(ext)) continue;

      // Read as text for simple files
      if (['.txt', '.md'].includes(ext)) {
        const text = await file.text();
        onFileDrop(file, text);
      } else {
        // For binary files, read as base64 and let server parse
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onFileDrop(file, `[File: ${file.name}, ${(file.size / 1024).toFixed(1)}KB, type: ${file.type}]\n(Binary file uploaded — server will parse)`);
        };
        reader.readAsDataURL(file);
      }
    }
  }, [onFileDrop, acceptedTypes]);

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
