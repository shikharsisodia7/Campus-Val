import { useEffect, useState } from "react";
import type { DegreeChecksheetDocument } from "@workspace/api-client-react";
import { AlertTriangle, FileUp, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CHECKSHEET_UPLOAD_PHASE_LABEL,
  useChecksheetUpload,
  type ChecksheetDetails,
  type ChecksheetFileSelection,
} from "@/hooks/use-degree-checksheets";
import { ChecksheetDetailsFields, EMPTY_DETAILS, sourceUrlProblem } from "./ChecksheetDetailsFields";
import { ChecksheetFileZone } from "./ChecksheetFileZone";
import { fileFingerprint, titleFromFileName } from "./checksheet-format";

/**
 * Upload one department document. A file and a title are all that is needed;
 * everything else is optional.
 *
 * The title starts as a tidied copy of the file name, which the student can
 * change. Nothing is read from the file to decide what it is, and nothing
 * here says whether the document applies to the student.
 */
export function ChecksheetUploadDialog({
  open,
  onOpenChange,
  existing,
  maxUploadBytes,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: DegreeChecksheetDocument[];
  maxUploadBytes?: number;
  onUploaded: (document: DegreeChecksheetDocument) => void;
}) {
  const [file, setFile] = useState<ChecksheetFileSelection | null>(null);
  const [details, setDetails] = useState<ChecksheetDetails>(EMPTY_DETAILS);
  const [titleEdited, setTitleEdited] = useState(false);
  /** Titles of documents that already hold this exact file, once noticed. */
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const { upload, busy, phase, error, clearError } = useChecksheetUpload();
  const { toast } = useToast();

  // Every opening starts clean.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDetails(EMPTY_DETAILS);
    setTitleEdited(false);
    setDuplicates(null);
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = !!file && !!details.title.trim() && !sourceUrlProblem(details.sourceUrl) && !busy && !checking;

  const send = async () => {
    if (!file) return;
    const document = await upload(file, { ...details, title: details.title.trim() });
    if (document) {
      toast({ title: "Document uploaded", description: `“${document.title}” is stored privately.` });
      onUploaded(document);
      onOpenChange(false);
    }
  };

  const submit = async () => {
    if (!file || !ready) return;
    // The same file again is allowed (one checksheet can serve two plans), but
    // it is usually a mistake, so it is pointed out first.
    setChecking(true);
    const fingerprint = await fileFingerprint(file.file);
    setChecking(false);
    const same = fingerprint ? existing.filter((document) => document.fileFingerprint === fingerprint) : [];
    if (same.length > 0) {
      setDuplicates(same.map((document) => document.title));
      return;
    }
    await send();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6"
        data-testid="checksheet-upload-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Upload a checksheet or advising resource</DialogTitle>
          <DialogDescription>
            Choose the document you are using for your planning. If the department shares it as a Google Doc or
            Sheet, download it first (File, Download) as a PDF, Word or Excel file. The file is stored privately
            and is never changed.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="status" data-testid="checksheet-uploading">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <p className="font-medium" data-testid="checksheet-upload-phase">
              {CHECKSHEET_UPLOAD_PHASE_LABEL[phase]}
            </p>
            <p className="text-sm text-muted-foreground">Please don't close this tab.</p>
          </div>
        ) : duplicates ? (
          <div className="space-y-3" role="alertdialog" aria-labelledby="duplicate-title" data-testid="checksheet-duplicate-warning">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1 text-sm">
                <p id="duplicate-title" className="font-semibold">
                  This file appears to already be uploaded.
                </p>
                <p>
                  The same file is already in your library as{" "}
                  {duplicates.map((title, i) => (
                    <span key={i}>
                      {i > 0 && (i === duplicates.length - 1 ? " and " : ", ")}
                      <strong>“{title}”</strong>
                    </span>
                  ))}
                  . You can still upload it again as a separate document, with its own tracking.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setDuplicates(null)} data-testid="checksheet-duplicate-cancel">
                Cancel
              </Button>
              <Button type="button" onClick={() => void send()} data-testid="checksheet-duplicate-confirm">
                Upload Anyway
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <ChecksheetFileZone
              maxBytes={maxUploadBytes}
              onFileSelected={(selected) => {
                setFile(selected);
                clearError();
                if (selected && !titleEdited) setDetails((d) => ({ ...d, title: titleFromFileName(selected.name) }));
              }}
            />
            <ChecksheetDetailsFields
              value={details}
              onChange={(next) => {
                if (next.title !== details.title) setTitleEdited(true);
                setDetails(next);
              }}
            />
            {error && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
                data-testid="checksheet-upload-error"
              >
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="checksheet-upload-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={!ready} className="gap-2" data-testid="checksheet-upload-submit">
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Upload
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
