import { useEffect, useMemo, useState } from "react";
import {
  useListProfessors,
  getListProfessorsQueryKey,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Search,
  ExternalLink,
  Users,
  Loader2,
  RefreshCw,
  GraduationCap,
} from "lucide-react";

const SCU_EVALUATIONS_URL = "https://evaluations.scu.edu/";

export default function ProfessorsPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Live directory: re-pull from the server every second so any newly synced
  // Workday sections show up without a manual refresh.
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } =
    useListProfessors(
      {},
      {
        query: {
          queryKey: getListProfessorsQueryKey({}),
          refetchInterval: 1000,
          refetchIntervalInBackground: false,
        },
      },
    );

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    if (!data) return [];
    if (!lower) return data.professors;
    return data.professors.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.departments.some((d) => d.toLowerCase().includes(lower)) ||
        p.courses.some((c) => c.toLowerCase().includes(lower)),
    );
  }, [data, q]);

  const selectedProf = useMemo(
    () => data?.professors.find((p) => p.name === selected) ?? null,
    [data, selected],
  );

  return (
    <AppShell>
      <PageHeader
        title="Professors"
        subtitle="Every instructor from SCU's published Fall 2026 schedule (plus any Workday sections you've synced). Evaluation results live on SCU's official portal and require SCU sign-in."
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-professors"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        }
      />
      <PageContent>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-professors"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, department, or course code (e.g. Vahid, CSEN, MATH 11)…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <div className="text-xs text-muted-foreground">
                {data
                  ? `${filtered.length} of ${data.professors.length} instructors`
                  : "Loading…"}
              </div>
              <LiveBadge updatedAt={dataUpdatedAt} />
            </div>
          </div>
        </Card>

        {isLoading ? (
          <Card className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading instructors…
          </Card>
        ) : data && data.professors.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <Users className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              {data.emptyReason}
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No instructors match "{q}".
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <Card
                key={p.name}
                className="p-5 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelected(p.name)}
                data-testid={`professor-card-${p.name.replace(/\s+/g, "_")}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-serif font-semibold text-base leading-tight">
                    {p.name}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {p.sectionsCount} section{p.sectionsCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Latest: {p.latestTerm}
                </div>
                {p.departments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.departments.map((d) => (
                      <Badge key={d} variant="outline" className="text-[10px] font-mono">
                        {d}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-xs text-foreground/80 line-clamp-2">
                  <span className="text-muted-foreground">Teaches:</span>{" "}
                  {p.courses.slice(0, 6).join(", ")}
                  {p.courses.length > 6 ? `, +${p.courses.length - 6} more` : ""}
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-primary font-medium">
                    View details →
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg overflow-y-auto"
            onEscapeKeyDown={() => setSelected(null)}
            onPointerDownOutside={() => setSelected(null)}
          >
            {selected && (
              <ProfessorSheetBody
                name={selected}
                departments={selectedProf?.departments ?? []}
                courses={selectedProf?.courses ?? []}
                sectionsCount={selectedProf?.sectionsCount ?? 0}
                latestTerm={selectedProf?.latestTerm ?? ""}
              />
            )}
          </SheetContent>
        </Sheet>
      </PageContent>
    </AppShell>
  );
}

function ProfessorSheetBody({
  name,
  departments,
  courses,
  sectionsCount,
  latestTerm,
}: {
  name: string;
  departments: string[];
  courses: string[];
  sectionsCount: number;
  latestTerm: string;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-serif">{name}</SheetTitle>
        <SheetDescription>
          From SCU's published schedule and your synced Workday sections.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Sections
            </div>
            <div className="mt-1 font-serif text-2xl font-bold text-foreground">
              {sectionsCount}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Latest term
            </div>
            <div className="mt-1 font-serif text-lg font-bold text-foreground">
              {latestTerm || "—"}
            </div>
          </Card>
        </div>

        {departments.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Departments
            </div>
            <div className="flex flex-wrap gap-1.5">
              {departments.map((d) => (
                <Badge key={d} variant="outline" className="font-mono text-[11px]">
                  {d}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {courses.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Courses taught
            </div>
            <div className="flex flex-wrap gap-1.5">
              {courses.map((c) => (
                <Badge key={c} variant="secondary" className="font-mono text-[11px]">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Card className="p-4 space-y-2" data-testid="card-evaluations-unavailable">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GraduationCap className="h-4 w-4 text-primary" />
            SCU course evaluations
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            No SCU course evaluation data is available in CampusVal. SCU
            publishes evaluation results only on its official portal behind
            university single sign-on, and CampusVal never invents ratings or
            scores.
          </p>
          <a
            href={SCU_EVALUATIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            data-testid="link-scu-evaluations-portal"
          >
            Open SCU's official evaluations portal (SCU login required)
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Card>
      </div>
    </>
  );
}

function LiveBadge({ updatedAt }: { updatedAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!updatedAt) return null;
  const secs = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const label = secs <= 1 ? "just now" : `${secs}s ago`;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
      title="This directory re-checks the server every second."
      data-testid="live-badge-professors"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live · {label}
    </span>
  );
}
