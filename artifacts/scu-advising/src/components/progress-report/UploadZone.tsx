import { useRef, useState, useCallback } from "react";
import { UploadCloud, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AprFileSelection } from "@/hooks/use-apr-documents";
import { formatBytes, PDF_TYPE, XLSX_TYPE } from "./apr-format";

export type SelectedFile = AprFileSelection;

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

interface UploadZoneProps {
  onFileSelected: (f: SelectedFile | null) => void;
  disabled?: boolean;
  /** The server's configured limit (from GET /progress-reports). */
  maxBytes?: number;
}

/**
 * Checked again, authoritatively, on the server. This is only so a student
 * learns about a wrong file before waiting for an upload.
 */
export function validateAprFile(
  file: { name: string; size: number; type: string },
  maxBytes: number,
): { contentType: string } | { error: string } {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (ext === ".xls") {
    return {
      error:
        "This is the older .xls format. In Workday, export your Academic Progress report to Excel (.xlsx) and upload that file.",
    };
  }
  if (ext !== ".xlsx" && ext !== ".pdf") {
    return { error: "Upload the Excel (.xlsx) or PDF file exported from Workday's Academic Progress report." };
  }
  if (file.size === 0) return { error: "This file is empty." };
  if (file.size > maxBytes) {
    return { error: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.` };
  }
  return { contentType: ext === ".pdf" ? PDF_TYPE : XLSX_TYPE };
}

export function UploadZone({ onFileSelected, disabled, maxBytes = DEFAULT_MAX_BYTES }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SelectedFile | null>(null);

  const processFile = useCallback(
    (file: File) => {
      const result = validateAprFile(file, maxBytes);
      if ("error" in result) {
        setError(result.error);
        setPreview(null);
        onFileSelected(null);
        return;
      }
      setError(null);
      const selected: SelectedFile = {
        file,
        name: file.name,
        size: file.size,
        contentType: result.contentType,
      };
      setPreview(selected);
      onFileSelected(selected);
    },
    [onFileSelected, maxBytes],
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
    onFileSelected(null);
  };

  return (
    <div className="space-y-3">
      <div
        data-testid="upload-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer select-none",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
        role="button"
        tabIndex={0}
        aria-label="Choose the Workday Academic Progress Excel file to upload"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Drop your file here, or{" "}
            <span className="text-primary underline underline-offset-2">click to browse</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="upload-supported-format">
            Workday export: Excel (.xlsx) or PDF · max {Math.round(maxBytes / (1024 * 1024))} MB
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={`.xlsx,.pdf,${XLSX_TYPE},${PDF_TYPE}`}
        className="sr-only"
        data-testid="input-file"
        onChange={handleChange}
        disabled={disabled}
        aria-label="Select file"
      />
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
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p data-testid="preview-file-name" className="truncate text-sm font-medium">
              {preview.name}
            </p>
            <p data-testid="preview-file-size" className="text-xs text-muted-foreground">
              {formatBytes(preview.size)}
              {preview.contentType === PDF_TYPE && " · PDF: shown as uploaded; its table is read for the planning sidebar."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            data-testid="button-clear-file"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            aria-label="Remove selected file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export { formatBytes };
