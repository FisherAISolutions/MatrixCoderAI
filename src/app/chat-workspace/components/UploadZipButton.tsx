'use client';
import { useRef } from 'react';
import { FolderUp } from 'lucide-react';

interface Props {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZipButton({ onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    // Reset so re-uploading the same file works
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Import zip project"
        title="Import zip project"
        data-testid="upload-zip-button"
      >
        <FolderUp size={12} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={handleChange}
        data-testid="upload-zip-input"
      />
    </>
  );
}
