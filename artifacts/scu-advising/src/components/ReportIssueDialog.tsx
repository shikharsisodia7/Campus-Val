import { useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTrackUsage } from "@/hooks/use-track-usage";
import {
  FEATURE_OPTIONS,
  REPORT_TYPE_OPTIONS,
  detectFeatureFromPath,
  type ReportType,
} from "@/lib/feedback-features";

interface FormState {
  type: ReportType | "";
  subject: string;
  description: string;
  feature: string;
  academicItem: string;
  officialSourceUrl: string;
  proposedCorrection: string;
}

function emptyForm(pathname: string): FormState {
  return {
    type: "",
    subject: "",
    description: "",
    feature: detectFeatureFromPath(pathname),
    academicItem: "",
    officialSourceUrl: "",
    proposedCorrection: "",
  };
}

/**
 * "Report Error / Suggest Changes" — the professor follow-up's structured
 * error/correction/suggestion form (docs/FEEDBACK_AND_ERROR_REPORTING.md).
 * Deliberately its own dialog rather than a reuse of the plain /feedback
 * page: it captures page context, an optional academic item, and an
 * optional official-source URL, none of which the simple page needed.
 *
 * `trigger` lets the same dialog be mounted from two places in AppShell
 * (the desktop header button and the mobile nav sheet) without duplicating
 * this logic.
 */
export function ReportIssueDialog({ trigger }: { trigger: React.ReactNode }) {
  const [location] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(location));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useTrackUsage("feedback_submit", submitted);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Re-detect on every open so a report started from one page never
      // shows another page's stale auto-capture.
      setForm(emptyForm(location));
      setSubmitted(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSubmit =
    form.type !== "" && form.subject.trim().length > 0 && form.description.trim().length >= 4;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(getApiUrl("/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "general",
          message: form.description.trim(),
          page: location,
          type: form.type,
          subject: form.subject.trim(),
          feature: form.feature,
          pathname: location,
          academicItem: form.academicItem.trim() || undefined,
          officialSourceUrl: form.officialSourceUrl.trim() || undefined,
          proposedCorrection: form.proposedCorrection.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      setSubmitted(true);
      toast({
        title: "Report submitted",
        description: "Thanks -- your report was submitted for review.",
      });
      setOpen(false);
    } catch (err) {
      // Deliberately do NOT reset `form` here -- Part 7 of the spec requires
      // preserving entered text on failure so nothing typed is lost.
      toast({
        title: "Couldn't submit report",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        data-testid="dialog-report-issue"
        onEscapeKeyDown={() => setOpen(false)}
        onPointerDownOutside={() => setOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>Report Error / Suggest Changes</DialogTitle>
          <DialogDescription>
            Found incorrect information or have a suggestion? Send it here so the CampusVal team
            can review it.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          Do not include student records, APR contents, grades, or other sensitive personal
          information.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ri-type">
              Type <span aria-hidden="true">*</span>
            </Label>
            <Select value={form.type} onValueChange={(v) => update("type", v as ReportType)}>
              <SelectTrigger id="ri-type" data-testid="select-report-type" aria-required="true">
                <SelectValue placeholder="What's this about?" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ri-subject">
              Subject <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="ri-subject"
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              placeholder="Short summary"
              maxLength={200}
              required
              aria-required="true"
              data-testid="input-report-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ri-description">
              Description <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="ri-description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={4}
              placeholder="What did you see? What did you expect? What should change?"
              required
              aria-required="true"
              data-testid="input-report-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ri-feature">Page / feature</Label>
            <Select value={form.feature} onValueChange={(v) => update("feature", v)}>
              <SelectTrigger id="ri-feature" data-testid="select-report-feature">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground" data-testid="text-report-pathname">
              Current page: {location}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ri-academic-item">Academic item / course / program (optional)</Label>
            <Input
              id="ri-academic-item"
              value={form.academicItem}
              onChange={(e) => update("academicItem", e.target.value)}
              placeholder="e.g. MATH 11, Computer Science B.S."
              maxLength={200}
              data-testid="input-report-academic-item"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ri-source-url">Official source URL (optional)</Label>
            <Input
              id="ri-source-url"
              type="url"
              value={form.officialSourceUrl}
              onChange={(e) => update("officialSourceUrl", e.target.value)}
              placeholder="Official SCU source showing the correction, if available"
              maxLength={500}
              data-testid="input-report-source-url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ri-proposed-correction">Expected / proposed correction (optional)</Label>
            <Textarea
              id="ri-proposed-correction"
              value={form.proposedCorrection}
              onChange={(e) => update("proposedCorrection", e.target.value)}
              rows={3}
              placeholder='e.g. "This requirement should say choose 2, not all 4."'
              maxLength={2000}
              data-testid="input-report-proposed-correction"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
            data-testid="button-report-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="gap-2 bg-[#8C1515] hover:bg-[#7a1212]"
            data-testid="button-report-submit"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Submitting..." : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}