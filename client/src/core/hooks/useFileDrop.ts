import { useState, useCallback, useRef, DragEvent } from 'react';

interface UseFileDropOptions {
  sessionId: string | null;
  sessionType: 'concept-note' | 'cbo';
  onFileProcessed: (filename: string, content: string) => void;
  onError?: (error: string) => void;
}

export function useFileDrop({ sessionId, sessionType, onFileProcessed, onError }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
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

    if (!sessionId) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const textTypes = ['txt', 'md', 'csv'];

      if (textTypes.includes(ext)) {
        // Text files — read directly
        const content = await file.text();
        onFileProcessed(file.name, content);
      } else {
        // Binary files — upload to server for parsing
        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch(`/api/upload/${sessionType}/${sessionId}`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json();
            onError?.(err.error || 'Upload failed');
            continue;
          }

          const data = await res.json();
          const content = data.content || `[File uploaded: ${file.name}, ${data.contentLength} chars extracted]`;
          onFileProcessed(file.name, content);
        } catch (err: any) {
          onError?.(err.message || 'Upload failed');
        } finally {
          setIsUploading(false);
        }
      }
    }
  }, [sessionId, sessionType, onFileProcessed, onError]);

  return {
    isDragging,
    isUploading,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
