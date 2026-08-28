import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAddPlanItem,
  useGetProfile,
  getGetPlanQueryKey,
  Term,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "wouter";

/**
 * "Load Four-Year Plan" entry point for Degree Plan.
 *
 * Most SCU majors have no prescribed quarter-by-quarter sequence. Engineering
 * is the main case where a published sample plan exists at all. The server
 * already classifies every sequence as prescribed / recommended / example
 * with provenance (see api-server/src/data/graduation-paths.ts) and exposes
 * only the non-"example" (real, sourced) majors via /four_year_index. This
 * component lists exactly those majors in a dropdown — never a fabricated
 * plan for a major that doesn't publish one — and only ever offers a
 * one-click preload for a "prescribed" sequence; "recommended" majors show
 * their official source link instead.
 *
 * Loading never destroys existing work: courses already in the plan come back
 * as duplicates from the API and are counted as skipped.
 */

const REAL_COURSE_CODE = /^[A-Z]{2,5}\s\d+[A-Z]*$/;
const isRealCourseCode = (code: string) => REAL_COURSE_CODE.test(code.trim());

interface PathQuarter {
  year: number;
  term: string;
  courses: string[];
}

interface PathData {
  type: string;
  title: string;
  sequenceTrust: "prescribed" | "recommended" | "example";
  provenance?: {
    sourceUrl?: string;
    sourceLabel?: string;
    catalogYear?: string;
    lastVerified?: string;
    verificationNote?: string;
  };
  quarters: PathQuarter[];
}

const TRUST_COPY: Record<
  PathData["sequenceTrust"],
  { badge: string; tone: string; blurb: string }
> = {
  prescribed: {
    badge: "Prescribed sequence",
    tone: "border-emerald-300 text-emerald-800 bg-emerald-50",
    blurb:
      "Reconciled course-by-course against SCU's published plan for this major.",
  },
  recommended: {
    badge: "Recommended sequence",
    tone: "border-amber-300 text-amber-900 bg-amber-50",
    blurb:
      "An official SCU sample plan exists for this major, but CampusVal has not reconciled it course-by-course. Review it with your advisor rather than loading it as-is.",
  },
  example: {
    badge: "Example only",
    tone: "border-border text-muted-foreground bg-muted/30",
    blurb:
      "This is an illustrative pathway, not a published SCU sequence. Most majors have no defined four-year plan — students usually build their own.",
  },
};

interface FourYearIndexEntry {
  code: string;
  title: string;
  sequenceTrust: PathData["sequenceTrust"];
}

export function FourYearPreload({
  degreePlan,
}: {
  /** Only the plan id is needed — accepts a summary or a full plan detail. */
  degreePlan: { id: number } | null | undefined;
}) {
  const { data: profile } = useGetProfile();
  const queryClient = useQueryClient();
  const addPlanItem = useAddPlanItem();

  const [index, setIndex] = useState<FourYearIndexEntry[] | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  const [data, setData] = useState<PathData | null>(null);
  const [open, setOpen] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // The dropdown lists only majors with a real, sourced four-year plan
  // (never the generated-template ones).
  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}api/graduation-paths/four_year_index`;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setIndex(j?.majors ?? []);
      })
      .catch(() => {
        if (!cancelled) setIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedMajor) return;
    const params = new URLSearchParams({ major: selectedMajor });
    const url = `${import.meta.env.BASE_URL}api/graduation-paths/four_year?${params.toString()}`;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMajor]);

  // Only a genuinely prescribed sequence may be loaded in one click.
  const loadable = useMemo(() => {
    if (!data || data.sequenceTrust !== "prescribed") return null;
    const startYear = profile?.startYear;
    if (!startYear) return null;
    const items = data.quarters.flatMap((q) =>
      q.courses.filter(isRealCourseCode).map((courseCode) => ({
        courseCode,
        academicYear: startYear + (q.year - 1),
        term: q.term as Term,
      })),
    );
    return items.length > 0 ? { items, startYear } : null;
  }, [data, profile?.startYear]);

  async function handleConfirm() {
    if (!loadable || !degreePlan) return;
    setIsPreloading(true);
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const item of loadable.items) {
      try {
        await addPlanItem.mutateAsync({
          id: degreePlan.id,
          data: {
            itemType: "course",
            courseCode: item.courseCode,
            academicYear: item.academicYear,
            term: item.term,
          },
        });
        added += 1;
      } catch (err: any) {
        if (err?.data?.duplicate) skipped += 1;
        else failed += 1;
      }
    }
    await queryClient.invalidateQueries({
      queryKey: getGetPlanQueryKey(degreePlan.id),
    });
    await queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans"),
    });
    setIsPreloading(false);
    setResult({ added, skipped, failed });
  }

if (!index || index.length === 0) return null;

  const trust = data ? TRUST_COPY[data.sequenceTrust] : null;
  const ownMajorInIndex = index.find((m) => m.code === profile?.major);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-testid="button-load-four-year-plan"
          >
            <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
            Load Four-Year Plan
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Majors with a department-defined four-year plan:
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {index.map((m) => (
            <DropdownMenuItem
              key={m.code}
              data-testid={`four-year-menu-item-${m.code}`}
              onSelect={() => {
                setResult(null);
                setSelectedMajor(m.code);
                setOpen(true);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span>
                {m.title}
                {m.code === ownMajorInIndex?.code && (
                  <span className="ml-1 text-[10px] text-muted-foreground">(your major)</span>
                )}
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] ${TRUST_COPY[m.sequenceTrust].tone}`}
              >
                {m.sequenceTrust === "prescribed" ? "Loadable" : "Reference"}
              </Badge>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            Most majors don't publish a fixed four-year plan and expect
            students to build one in consultation with an advisor.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open && !!data}
        onOpenChange={(o) => !isPreloading && setOpen(o)}
      >
        {data && trust && (
        <DialogContent data-testid="dialog-four-year-preload">
          <DialogHeader>
            <DialogTitle>{data.title}</DialogTitle>
            <DialogDescription>{trust.blurb}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <Badge
              variant="outline"
              className={`text-[10px] ${trust.tone}`}
              data-testid="four-year-trust-badge"
            >
              {trust.badge}
            </Badge>

            {data.provenance?.sourceUrl && (
              <div
                className="rounded-md border border-border bg-muted/20 p-2.5 text-xs"
                data-testid="four-year-provenance"
              >
                <a
                  href={data.provenance.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {data.provenance.sourceLabel ?? "Official SCU source"}
                </a>
                <div className="mt-1 text-muted-foreground">
                  {data.provenance.catalogYear && (
                    <span>Catalog year {data.provenance.catalogYear}. </span>
                  )}
                  {data.provenance.lastVerified && (
                    <span>Last verified {data.provenance.lastVerified}.</span>
                  )}
                </div>
                {data.provenance.verificationNote && (
                  <p className="mt-1 text-muted-foreground">
                    {data.provenance.verificationNote}
                  </p>
                )}
              </div>
            )}

            {result ? (
              <div className="space-y-1" data-testid="four-year-preload-result">
                <p className="font-medium">
                  Added {result.added} course{result.added === 1 ? "" : "s"} to
                  your Degree Plan.
                </p>
                {result.skipped > 0 && (
                  <p className="text-muted-foreground">
                    Skipped {result.skipped} already in your plan — nothing was
                    duplicated or overwritten.
                  </p>
                )}
                {result.failed > 0 && (
                  <p className="text-amber-700">
                    {result.failed} course{result.failed === 1 ? "" : "s"} could
                    not be added; add {result.failed === 1 ? "it" : "them"} by
                    hand.
                  </p>
                )}
              </div>
            ) : loadable && degreePlan ? (
              <p className="text-muted-foreground">
                This adds {loadable.items.length} real courses from the
                published sequence to your Degree Plan, starting from your entry
                year ({loadable.startYear}). Courses already in your plan are
                skipped, and open Core or elective slots are never auto-filled.
              </p>
            ) : (
              <p className="text-muted-foreground" data-testid="four-year-not-loadable">
                CampusVal will not load this sequence for you. You can{" "}
                <Link
                  href={`/graduation-paths?major=${encodeURIComponent(selectedMajor ?? "")}`}
                  className="text-primary underline"
                >
                  review it in full
                </Link>{" "}
                and add the courses you want yourself.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Many majors have no defined four-year plan, and students commonly
              build their own. Confirm any sequence with your advisor and verify
              registration in Workday.
            </p>
          </div>

          <DialogFooter>
            {result ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPreloading}
                >
                  Cancel
                </Button>
                {loadable && degreePlan && (
                  <Button
                    onClick={handleConfirm}
                    disabled={isPreloading}
                    data-testid="button-confirm-four-year-preload"
                  >
                    {isPreloading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add {loadable.items.length} courses
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
        )}
      </Dialog>
    </>
  );
}
