import { useMemo, useState } from "react";
import type { DegreeChecksheetCategory } from "@workspace/api-client-react";
import { AlertTriangle, ClipboardCheck, ExternalLink, Loader2, Upload } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { PlanningComparisonWorkspace } from "@/components/degree-plan/PlanningComparisonWorkspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useChecksheetDocuments } from "@/hooks/use-degree-checksheets";
import { useTrackUsage } from "@/hooks/use-track-usage";
import { ChecksheetDocumentCard } from "@/components/degree-checksheets/ChecksheetDocumentCard";
import { ChecksheetUploadDialog } from "@/components/degree-checksheets/ChecksheetUploadDialog";
import {
  CHECKSHEET_CATEGORY_OPTIONS,
  SCU_CHECKSHEETS_URL,
  SUPPORTED_FORMATS_TEXT,
} from "@/components/degree-checksheets/checksheet-format";

/** Filters appear only once there are enough documents for them to help. */
const FILTER_FROM = 4;

/**
 * Degree Checksheets: the department documents a student has uploaded (major
 * and minor checksheets, four-year plans, flowcharts, advising resources),
 * each in its own collapsible container with the student's own tracking.
 *
 * This page is a reference library. It does not decide which document applies
 * to the student, and nothing here changes the Degree Plan, the requirements
 * shown beside it, the Quarter Plan or an Academic Progress Report.
 */
function ChecksheetWorkspace() {
  const { data, isLoading, isError, refetch } = useChecksheetDocuments();
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<DegreeChecksheetCategory | "all">("all");
  /** The document to open once it appears in the list (just uploaded). */
  const [justAdded, setJustAdded] = useState<number | null>(null);

  const documents = useMemo(() => data?.documents ?? [], [data]);
  const available = data?.available;
  const atLimit = !!data && documents.length >= data.maxDocuments;

  const present = useMemo(
    () => CHECKSHEET_CATEGORY_OPTIONS.filter((option) => documents.some((d) => d.category === option.value)),
    [documents],
  );
  const showFilters = documents.length >= FILTER_FROM && present.length > 1;
  const active = showFilters && filter !== "all" && present.some((option) => option.value === filter) ? filter : "all";
  const shown = active === "all" ? documents : documents.filter((d) => d.category === active);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        className="h-10 gap-2"
        onClick={() => setUploading(true)}
        disabled={available !== true || atLimit}
        title={atLimit ? `You can keep up to ${data?.maxDocuments} documents.` : undefined}
        data-testid="button-upload-checksheet"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Upload Checksheet
      </Button>
      <Button asChild variant="outline" className="h-10 gap-2">
        <a
          href={SCU_CHECKSHEETS_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Find SCU Degree Checksheets on the official SCU website (opens in a new tab)"
          data-testid="link-scu-checksheets"
        >
          Find SCU Degree Checksheets
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 pr-1" data-testid="checksheet-workspace">
        <Card className="space-y-2 p-4" data-testid="card-checksheets-help">
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            <li>
              Checksheets are advising resources published by SCU departments. <strong>You choose</strong> the
              document that fits your planning and upload it here.
            </li>
            <li>
              Your status and quarter entries are your own planning notes. The original document is never changed,
              and only you can see what you upload or enter.
            </li>
            <li>Workday is the definitive reference for degree completion.</li>
          </ul>
        </Card>

        {isLoading && (
          <div className="space-y-3" role="status" aria-label="Loading your documents" data-testid="status-loading">
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {isError && !isLoading && (
          <Card className="p-4" role="alert" data-testid="card-checksheets-load-error">
            <p className="text-sm">Couldn't load your Degree Checksheets right now.</p>
            <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => void refetch()}>
              Try again
            </Button>
          </Card>
        )}

        {available === false && !isLoading && (
          <Card className="border-border bg-muted/40 p-5" data-testid="card-storage-unavailable">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-semibold text-foreground">File uploads aren't configured for this deployment.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This feature requires private file storage to be set up by the server operator. The rest of
                  CampusVal works normally. You can still find your department's documents on the SCU website.
                </p>
                <div className="mt-3">{actions}</div>
              </div>
            </div>
          </Card>
        )}

        {available === true && documents.length === 0 && (
          <Card className="flex flex-col items-center gap-4 p-8 text-center sm:p-12" data-testid="card-checksheets-empty">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ClipboardCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="max-w-xl space-y-2">
              <h2 className="font-serif text-2xl font-semibold">No documents yet</h2>
              <p className="text-sm text-muted-foreground">
                Upload major and minor checksheets, four-year plans, flowcharts, and other department advising
                resources so you can reference them while planning.
              </p>
              <p className="text-xs text-muted-foreground">Accepted: {SUPPORTED_FORMATS_TEXT}.</p>
            </div>
            {actions}
          </Card>
        )}

        {available === true && documents.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" data-testid="checksheet-document-count">
                {documents.length} document{documents.length === 1 ? "" : "s"} uploaded. Open one at a time, or
                several.
              </p>
              {actions}
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show documents of type" data-testid="checksheet-filters">
                {[{ value: "all" as const, plural: "All" }, ...present].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={active === option.value ? "default" : "outline"}
                    className={cn("h-9 text-xs")}
                    aria-pressed={active === option.value}
                    onClick={() => setFilter(option.value)}
                    data-testid={`checksheet-filter-${option.value}`}
                  >
                    {option.plural}
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {option.value === "all" ? documents.length : documents.filter((d) => d.category === option.value).length}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            <section aria-label="Uploaded Degree Checksheets" className="space-y-3" data-testid="checksheet-document-list">
              {shown.map((document) => (
                <ChecksheetDocumentCard
                  key={document.id}
                  document={document}
                  // One open by default; the rest stay collapsed until asked for.
                  defaultOpen={documents.length === 1 || document.id === justAdded}
                  maxUploadBytes={data?.maxUploadBytes}
                />
              ))}
            </section>
          </>
        )}

        {uploading && !data && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
          </p>
        )}

        <ChecksheetUploadDialog
          open={uploading}
          onOpenChange={setUploading}
          existing={documents}
          maxUploadBytes={data?.maxUploadBytes}
          onUploaded={(document) => {
            setJustAdded(document.id);
            setFilter("all");
          }}
        />
    </div>
  );
}

/**
 * Degree Checksheets, in the three-way comparison workspace:
 *
 *   Planning Requirements | Degree Checksheets | Workday APR (compact)
 *
 * The left and right regions are the same sidebars Degree Plan uses (see
 * PlanningComparisonWorkspace); the center is this page's own content. Comparing
 * is manual on purpose: nothing here checks a checksheet item off because an APR
 * row looks similar.
 */
export default function DegreeChecksheetsPage() {
  useTrackUsage("degree_checksheets");
  return (
    <AppShell>
      <PageHeader
        compact
        title="Degree Checksheets"
        subtitle="Compare your planning requirements, your department's checksheet and your Workday APR side by side."
      />
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8">
        <PlanningComparisonWorkspace main={<ChecksheetWorkspace />} mainLabel="Degree Checksheets" showCompactApr />
      </div>
    </AppShell>
  );
}
