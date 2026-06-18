'use client';

import { Upload, X } from 'lucide-react';
import { MAX_STYLE_SCREENSHOTS, validateStyleImage } from '@/lib/styleInspiration';

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}

export default function ScreenshotUploader({ files, onFilesChange, disabled }: Props) {
  const addFiles = (incoming: FileList | null) => {
    if (!incoming || disabled) return;
    const next = [...files];
    const errors: string[] = [];

    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_STYLE_SCREENSHOTS) {
        errors.push(`Only ${MAX_STYLE_SCREENSHOTS} images can be analyzed at once.`);
        break;
      }
      const error = validateStyleImage(file);
      if (error) {
        errors.push(error);
        continue;
      }
      next.push(file);
    }

    if (errors.length > 0) {
      window.alert(errors.join('\n'));
    }
    onFilesChange(next);
  };

  return (
    <div className="space-y-3">
      <label
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-matrix-border bg-matrix-surface/60 p-6 text-center transition-colors hover:border-matrix-green ${
          disabled ? 'pointer-events-none opacity-60' : ''
        }`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <Upload size={22} className="text-matrix-green" />
        <div>
          <p className="text-sm font-mono text-matrix-green">Upload screenshots or your own logo</p>
          <p className="mt-1 text-xs font-mono text-matrix-green-muted">
            PNG, JPG, or WebP. Up to {MAX_STYLE_SCREENSHOTS} files, 5MB each.
          </p>
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
      </label>

      {files.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex items-center justify-between gap-3 border border-matrix-border bg-matrix-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-mono text-matrix-green">{file.name}</p>
                <p className="text-[11px] font-mono text-matrix-green-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
                className="text-matrix-green-muted transition-colors hover:text-matrix-red"
                aria-label={`Remove ${file.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
