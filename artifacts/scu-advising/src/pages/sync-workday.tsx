import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSyncWorkdaySections,
  useGetSectionsSyncStatus,
} from "@workspace/api-client-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Database,
  Loader2,
  Info,
} from "lucide-react";

const TERMS = ["fall", "winter", "spring", "summer"] as const;
const YEARS = [2025, 2026, 2027] as const;

export default function SyncWorkdayPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState<(typeof TERMS)[number]>("spring");
  const [year, setYear] = useState<number>(2026);
  const [rawText, setRawText] = useState("");

  const { data: status, refetch: refetchStatus } = useGetSectionsSyncStatus();
  const sync = useSyncWorkdaySections({
    mutation: {
      onSuccess: () => {
        refetchStatus();
        qc.invalidateQueries({ queryKey: ["/courses"] });
      },
    },
  });

  const result = sync.data;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold mb-2">
            Sync Workday Sections
          </h1>
          <p className="text-muted-foreground">
            CampusVal already shows the official Fall 2026, Winter 2027 &amp;
            Spring 2027 schedules (instructors and meeting times) everywhere. This
            page adds the one thing those published schedules don't include:{" "}
            <strong className="text-foreground">live seat availability</strong>.
            Paste your Workday "Find Course Sections" results to overlay
            real-time open/total seats onto the matching sections. Your Workday
            password is never sent to or stored by CampusVal — only the section
            table you copy.
          </p>
        </div>

        <Card className="p-5 mb-6 bg-emerald-50 border-emerald-200 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <div className="font-semibold mb-1">
              How this works (safe by design)
            </div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Open Workday → Academics → <em>Find Course Sections</em>.
              </li>
              <li>
                Filter by Academic Period (e.g. <em>Spring Quarter 2026</em>)
                and the subject(s) you care about.
              </li>
              <li>
                Click the table, press <kbd className="px-1.5 py-0.5 rounded border bg-white">Ctrl/Cmd&nbsp;A</kbd>,
                then <kbd className="px-1.5 py-0.5 rounded border bg-white">Ctrl/Cmd&nbsp;C</kbd> to copy
                the visible rows.
              </li>
              <li>
                Pick the term &amp; year below, paste into the box, hit{" "}
                <strong>Sync</strong>.
              </li>
            </ol>
          </div>
        </Card>

        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Term
              </label>
              <Select
                value={term}
                onValueChange={(v) => setTerm(v as (typeof TERMS)[number])}
              >
                <SelectTrigger className="w-40" data-testid="select-term">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Year
              </label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-32" data-testid="select-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 text-amber-700 shrink-0" />
              <span>
                Re-pasting the same term <strong>replaces</strong> previous
                rows for that term so stale sections don't linger.
              </span>
            </div>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Pasted Workday data
          </label>
          <textarea
            data-testid="input-workday-text"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Paste rows copied from Workday's "Find Course Sections" table.\n\nEach line is tab-separated, in this column order:\nCOURSE-SECTION  ⇥  Title  ⇥  Instructor (Last, First)  ⇥  Days | Start - End  ⇥  Location  ⇥  open/total  ⇥  waitlist`}
            className="w-full h-48 font-mono text-xs border border-input rounded-md p-3 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground">
                {rawText.length > 0
                  ? `${rawText.split(/\r?\n/).filter((l) => l.trim()).length} non-empty lines`
                  : "Empty"}
              </div>
            </div>
            <Button
              data-testid="button-sync"
              disabled={!rawText.trim() || sync.isPending}
              onClick={() =>
                sync.mutate({
                  data: { rawText, term, year, replaceTerm: true },
                })
              }
            >
              {sync.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing & saving…
                </>
              ) : (
                <>
                  <ClipboardPaste className="h-4 w-4 mr-2" />
                  Sync {term} {year}
                </>
              )}
            </Button>
          </div>
        </Card>

        {result && (
          <Card className="p-5 mb-6" data-testid="sync-result">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h2 className="font-serif text-xl font-semibold">
                Sync complete — {result.term} {result.year}
              </h2>
            </div>
            <div className="flex flex-wrap gap-3 mb-4">
              <Badge variant="outline" className="text-sm">
                Parsed: <strong className="ml-1">{result.parsedCount}</strong>
              </Badge>
              <Badge variant="outline" className="text-sm">
                Saved: <strong className="ml-1">{result.insertedCount}</strong>
              </Badge>
              <Badge variant="outline" className="text-sm">
                Replaced:{" "}
                <strong className="ml-1">{result.deletedCount}</strong>
              </Badge>
              {result.errors.length > 0 && (
                <Badge variant="destructive" className="text-sm">
                  Skipped: {result.errors.length}
                </Badge>
              )}
            </div>

            {result.sampleSections.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  First {result.sampleSections.length} parsed sections
                </div>
                <div className="space-y-1.5">
                  {result.sampleSections.map((s) => (
                    <div
                      key={s.id}
                      className="text-sm flex flex-wrap items-baseline gap-2 border-b border-border/50 pb-1.5"
                    >
                      <span className="font-mono font-bold">
                        {s.courseCode}-{s.sectionNumber}
                      </span>
                      <span>{s.instructor}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.meetingDays.join("")} {s.startTime}-{s.endTime}
                      </span>
                      {s.location && (
                        <span className="text-xs text-muted-foreground">
                          · {s.location}
                        </span>
                      )}
                      <span className="text-xs ml-auto text-muted-foreground">
                        {s.seatsOpen}/{s.seatsTotal} open
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <div className="text-sm font-semibold text-amber-900">
                    {result.errors.length} line(s) skipped
                  </div>
                </div>
                <div className="space-y-1 max-h-40 overflow-auto text-xs font-mono text-amber-900/80">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <div key={i} className="truncate">
                      <span className="text-amber-700">[{e.reason}]</span>{" "}
                      {e.line.slice(0, 120)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {sync.isError && (
          <Card className="p-4 mb-6 border-destructive bg-destructive/10 text-sm text-destructive">
            <div className="font-semibold mb-1">Sync failed</div>
            <div className="text-xs">
              {(() => {
                const err = sync.error as unknown;
                if (
                  err &&
                  typeof err === "object" &&
                  "message" in err &&
                  typeof (err as { message: unknown }).message === "string"
                ) {
                  return (err as { message: string }).message;
                }
                return "The server rejected the paste. Check that each line follows the tab-separated column order shown in the textbox, then try again.";
              })()}
            </div>
          </Card>
        )}

        {result && result.parsedCount === 0 && (
          <Card className="p-4 mb-6 border-amber-300 bg-amber-50 text-sm text-amber-900">
            <div className="font-semibold mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Parsed 0 sections
            </div>
            <div className="text-xs space-y-1">
              <p>
                Your paste didn't contain anything that looks like a SCU course
                code (e.g. <code>CSEN 12-01</code>, <code>MATH 11-02</code>).
                A few things to try:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  Make sure each row is <strong>tab-separated</strong> in the
                  column order shown in the textbox (course code first).
                </li>
                <li>
                  In Workday, switch to the <em>table</em> view (not the card
                  detail view), then select rows and copy.
                </li>
                <li>
                  Make sure each section line includes the course code AND the
                  meeting time on the same line (or paste the whole detail
                  block — the parser handles both).
                </li>
              </ul>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl font-semibold">
              What's currently synced
            </h2>
          </div>
          {!status || status.totalSections === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sections have been synced yet. Once you paste a term, it will
              power the "Live sections" panel inside every course drawer.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                <strong className="text-foreground">
                  {status.totalSections}
                </strong>{" "}
                sections across{" "}
                <strong className="text-foreground">
                  {status.byTerm.length}
                </strong>{" "}
                term(s).
              </p>
              <div className="space-y-1.5">
                {status.byTerm.map((t) => (
                  <div
                    key={`${t.term}-${t.year}`}
                    className="flex items-baseline gap-3 text-sm border-b border-border/50 pb-1.5"
                  >
                    <span className="font-mono font-semibold capitalize">
                      {t.term} {t.year}
                    </span>
                    <span className="text-muted-foreground">
                      {t.count} sections
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Last synced{" "}
                      {new Date(t.lastSyncedAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
