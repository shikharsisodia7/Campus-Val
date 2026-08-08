import { useRef, useState, useCallback } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const ALLOWED_EXTS = [".pdf", ".xlsx"];

export interface SelectedFile {
  file: File;
  name: string;
  size: number;
  contentType: string;
}

interface UploadZoneProps {
  onFileSelected: (f: SelectedFile) => void;
  disabled?: boolean;
}

function validateFile(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  const mimeOk = ALLOWED_TYPES.has(file.type);
  const extOk = ALLOWED_EXTS.includes(ext);
  if (!mimeOk && !extOk) {
    return "Only PDF or .xlsx (Excel) files are supported.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "File exceeds the 10 MB limit.";
  }
  return null;
}

export function UploadZone({ onFileSelected, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SelectedFile | null>(null);

  const processFile = useCallback(
    (file: File) => {
      const err = validateFile(file);
      if (err) {
        setError(err);
        setPreview(null);
        return;
      }
      setError(null);
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      const contentType = ALLOWED_TYPES.has(file.type)
        ? file.type
        : ext === ".pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const selected: SelectedFile = {
        file,
        name: file.name,
        size: file.size,
        contentType,
      };
      setPreview(selected);
      onFileSelected(selected);
    },
    [onFileSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // reset input value so re-selecting same file triggers onChange
      e.target.value = "";
    },
    [processFile],
  );

  const clear = () => {
    setPreview(null);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <div
        data-testid="upload-zone"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
        role="button"
        tabIndex={0}
        aria-label="Upload zone — click or drop a file"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <UploadCloud className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Drop your file here, or{" "}
            <span className="text-primary underline underline-offset-2">click to browse</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF or Excel (.xlsx) · max 10 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          data-testid="input-file"
          onChange={handleChange}
          disabled={disabled}
          aria-label="Select file"
        />
      </div>

      {error && (
        <p
          data-testid="upload-error"
          className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {preview && !error && (
        <div
          data-testid="upload-preview"
          className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
        >
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p data-testid="preview-file-name" className="truncate text-sm font-medium">{preview.name}</p>
            <p data-testid="preview-file-size" className="text-xs text-muted-foreground">{formatBytes(preview.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            data-testid="button-clear-file"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            aria-label="Remove selected file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
