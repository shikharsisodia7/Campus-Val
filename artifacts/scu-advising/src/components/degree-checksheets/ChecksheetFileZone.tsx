import { useCallback, useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChecksheetFileSelection } from "@/hooks/use-degree-checksheets";
import { CHECKSHEET_ACCEPT, SUPPORTED_FORMATS_TEXT, formatBytes, validateChecksheetFile } from "./checksheet-format";

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

/** Choose or drop ONE file. What is chosen is checked again on the server. */
export function ChecksheetFileZone({
  onFileSelected,
  disabled,
  maxBytes = DEFAULT_MAX_BYTES,
}: {
  onFileSelected: (file: ChecksheetFileSelection | null) => void;
  disabled?: boolean;
  /** The server's configured limit (from GET /degree-checksheets). */
  maxBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChecksheetFileSelection | null>(null);

  const processFile = useCallback(
    (file: File) => {
      const result = validateChecksheetFile(file, maxBytes);
      if ("error" in result) {
        setError(result.error);
        setPreview(null);
        onFileSelected(null);
        return;
      }
      setError(null);
      const selected = { file, name: file.name, size: file.size, contentType: result.contentType };
      setPreview(selected);
      onFileSelected(selected);
    },
    [onFileSelected, maxBytes],
  );

  return (
    <div className="space-y-2">
      <div
        data-testid="checksheet-upload-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !disabled) processFile(file);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
        role="button"
        tabIndex={0}
        aria-label="Choose the department document to upload"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <UploadCloud className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Drop the file here, or <span className="text-primary underline underline-offset-2">click to browse</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="checksheet-supported-formats">
            {SUPPORTED_FORMATS_TEXT} · max {Math.round(maxBytes / (1024 * 1024))} MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={CHECKSHEET_ACCEPT}
          className="sr-only"
          data-testid="checksheet-input-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
            // Reset so choosing the same file again is noticed.
            e.target.value = "";
          }}
          disabled={disabled}
          aria-label="Select file"
          tabIndex={-1}
        />
      </div>

      {error && (
        <p
          data-testid="checksheet-file-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {preview && !error && (
        <div
          data-testid="checksheet-file-preview"
          className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
        >
          <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" data-testid="checksheet-file-name">
              {preview.name}
            </p>
            <p className="text-xs text-muted-foreground">{formatBytes(preview.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
              setError(null);
              onFileSelected(null);
            }}
            aria-label="Remove selected file"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
