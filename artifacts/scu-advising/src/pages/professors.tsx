import { useMemo, useState } from "react";
import {
  useListProfessors,
  useGetProfessorRmp,
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
  Star,
  ExternalLink,
  TrendingDown,
  Users,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function ProfessorsPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useListProfessors({});

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

  return (
    <AppShell>
      <PageHeader
        title="Professors"
        subtitle="Every instructor from SCU's published Fall 2026 schedule (plus any Workday sections you've synced). Click a name for live RateMyProfessor ratings — cached server-side for 24 hours."
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
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {data
                ? `${filtered.length} of ${data.professors.length} instructors`
                : "Loading…"}
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
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-primary font-medium">
                    View ratings →
                  </span>
                  <a
                    href={p.rmpDeepLinkUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    RMP <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            {selected && (
              <RmpSheetBody name={selected} />
            )}
          </SheetContent>
        </Sheet>
      </PageContent>
    </AppShell>
  );
}

function RmpSheetBody({ name }: { name: string }) {
  const { data, isLoading, error } = useGetProfessorRmp(name);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-serif">{name}</SheetTitle>
        <SheetDescription>
          Live RateMyProfessor lookup (SCU, school 882). Cached server-side
          for 24 hours.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-5">
          {isLoading ? (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Looking up…
            </div>
          ) : error ? (
            <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm">
              Couldn't reach the RMP lookup endpoint. Try again in a minute.
            </Card>
          ) : data && data.found ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <RmpStat
                  label="Quality"
                  value={data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
                  icon={<Star className="h-4 w-4 text-amber-500" />}
                />
                <RmpStat
                  label="Difficulty"
                  value={
                    data.avgDifficulty != null
                      ? data.avgDifficulty.toFixed(1)
                      : "—"
                  }
                  icon={<TrendingDown className="h-4 w-4 text-blue-600" />}
                />
                <RmpStat
                  label="Would take again"
                  value={
                    data.wouldTakeAgainPercent != null
                      ? `${Math.round(data.wouldTakeAgainPercent)}%`
                      : "—"
                  }
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Based on {data.numRatings ?? 0} student rating
                {(data.numRatings ?? 0) === 1 ? "" : "s"}
                {data.department ? ` · ${data.department}` : ""}
                {data.cachedAt
                  ? ` · cached ${new Date(data.cachedAt).toLocaleString()}`
                  : ""}
              </div>

              {data.topTags.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Top tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.topTags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[11px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {data.recentComments.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Recent student comments
                  </div>
                  <div className="space-y-3">
                    {data.recentComments.map((c, i) => (
                      <Card key={i} className="p-3 bg-muted/30">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {c.course ?? "Unspecified course"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {c.date ? c.date.slice(0, 10) : ""}
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground/90">
                          {c.comment}
                        </p>
                        {(c.quality != null || c.difficulty != null) && (
                          <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
                            {c.quality != null && (
                              <span>Quality {c.quality.toFixed(1)}</span>
                            )}
                            {c.difficulty != null && (
                              <span>Difficulty {c.difficulty.toFixed(1)}</span>
                            )}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <a
                href={data.deepLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                View full profile on RateMyProfessors{" "}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          ) : (
            <Card className="p-5 space-y-3">
              <div className="text-sm text-foreground">
                No matching RateMyProfessor profile loaded automatically.
              </div>
              {data?.error && (
                <div className="text-xs text-muted-foreground">{data.error}</div>
              )}
              {data?.deepLinkUrl && (
                <a
                  href={data.deepLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Search RateMyProfessors directly{" "}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </Card>
          )}
        </div>
    </>
  );
}

function RmpStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-bold text-foreground">
        {value}
      </div>
    </Card>
  );
}
