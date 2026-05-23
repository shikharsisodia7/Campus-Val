import { useState, useEffect } from "react";
import {
  useListCourses,
  useGetCourse,
  getGetCourseQueryKey,
  useListCourseSections,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfessorLookup } from "@/components/ProfessorLookup";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search,
  BookOpen,
  AlertCircle,
  Lock,
  Star,
  Users,
  Clock,
  MapPin,
  CalendarPlus,
  Check,
  FlaskConical,
  User,
} from "lucide-react";
import { termLabel } from "@/lib/api";
import { addToSchedule, getSchedule, subscribe } from "@/lib/schedule-store";
import { useToast } from "@/hooks/use-toast";

export default function Courses() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string | null>(null);
  const [coreOnly, setCoreOnly] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const { data: courses = [], isLoading } = useListCourses({
    search: search || undefined,
    department: department ?? undefined,
    core: coreOnly ? true : undefined,
  });

  const departments = Array.from(new Set(courses.map((c) => c.department))).sort();

  return (
    <AppShell>
      <PageHeader
        title="Course Catalog"
        subtitle="Search SCU's 2025-2026 undergraduate bulletin (~2,300 courses). Per-quarter offerings, instructors, and seat availability live in Workday Student / Camino."
      />
      <PageContent>
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code, title, or description"
                className="pl-9"
              />
            </div>
            <Button
              variant={coreOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setCoreOnly(!coreOnly)}
              data-testid="button-core-only"
            >
              Core only
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <DeptChip
              label="All depts"
              active={department === null}
              onClick={() => setDepartment(null)}
            />
            {departments.map((d) => (
              <DeptChip
                key={d}
                label={d}
                active={department === d}
                onClick={() => setDepartment(department === d ? null : d)}
              />
            ))}
          </div>
        </Card>

        {isLoading ? (
          <div className="text-muted-foreground">Loading courses…</div>
        ) : courses.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No courses match your search.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <button
                key={c.code}
                onClick={() => setOpenCode(c.code)}
                data-testid={`course-${c.code.replace(/\s+/g, "-")}`}
                className="text-left"
              >
                <Card className="p-5 h-full hover:border-primary/40 hover:shadow-md transition-all group cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-bold text-primary">
                        {c.code}
                      </div>
                      <div className="font-semibold text-foreground mt-1 group-hover:text-primary transition-colors">
                        {c.title}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {c.units}u
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
                    {c.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {c.coreAreas.slice(0, 2).map((a) => (
                      <Badge
                        key={a}
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {a}
                      </Badge>
                    ))}
                    {c.difficulty && (
                      <DifficultyBadge difficulty={c.difficulty} />
                    )}
                    {c.restrictedToColleges &&
                      c.restrictedToColleges.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal border-amber-300 text-amber-800 bg-amber-50 flex items-center gap-1"
                          data-testid={`restriction-${c.code.replace(/\s+/g, "-")}`}
                        >
                          <Lock className="h-2.5 w-2.5" />
                          {c.restrictedToColleges[0] === "School of Engineering"
                            ? "Engineering only"
                            : "Restricted"}
                        </Badge>
                      )}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}

        <CourseDrawer code={openCode} onClose={() => setOpenCode(null)} />
      </PageContent>
    </AppShell>
  );
}

function DeptChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`dept-${label}`}
      className={
        active
          ? "px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground"
          : "px-2.5 py-1 rounded-full text-xs font-medium border border-border hover:border-primary/40 text-foreground/80"
      }
    >
      {label}
    </button>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const colors: Record<string, string> = {
    easy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    moderate: "bg-amber-50 text-amber-800 border-amber-200",
    hard: "bg-orange-50 text-orange-800 border-orange-200",
    very_hard: "bg-red-50 text-red-800 border-red-200",
  };
  const label = difficulty.replace("_", " ");
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors[difficulty] ?? ""}`}
    >
      {label}
    </span>
  );
}

function CourseDrawer({
  code,
  onClose,
}: {
  code: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useGetCourse(code ?? "", {
    query: {
      enabled: !!code,
      queryKey: getGetCourseQueryKey(code ?? ""),
    },
  });
  return (
    <Sheet open={!!code} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {isLoading || !data ? (
          <div className="text-muted-foreground p-6">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <div className="font-mono text-sm font-bold text-primary">
                {data.code} · {data.units} units
              </div>
              <SheetTitle className="font-serif text-2xl">
                {data.title}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-5">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {data.description}
              </p>

              <Section title="Prerequisites">
                <p className="text-sm text-foreground">{data.prereqLogic}</p>
                {data.prereqGroups.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {data.prereqGroups.map((group, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-muted-foreground">Need one of:</span>
                        {group.map((alt, j) => (
                          <Badge
                            key={j}
                            variant="outline"
                            className="font-mono"
                          >
                            {alt}
                          </Badge>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {data.corequisites.length > 0 && (
                <Section title="Corequisites">
                  <div className="flex flex-wrap gap-1.5">
                    {data.corequisites.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Offered terms">
                <div className="text-xs text-muted-foreground italic">
                  Per-quarter section schedules are not in the bulletin —
                  check Workday Student for the current term's offerings,
                  instructors, and seat counts.
                </div>
                <div className="mt-2">
                  <ProfessorLookup variant="inline" />
                </div>
              </Section>

              {data.coreAreas.length > 0 && (
                <Section title="Counts toward Core">
                  <div className="flex flex-wrap gap-1.5">
                    {data.coreAreas.map((a) => (
                      <Badge key={a} variant="secondary" className="text-xs">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </Section>
              )}

              {data.restrictedToColleges &&
                data.restrictedToColleges.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-4 flex gap-3">
                    <Lock className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900">
                      <div className="font-semibold mb-1">
                        Restricted enrollment
                      </div>
                      Only open to: {data.restrictedToColleges.join(", ")}.
                      Other students need an inter-college permission number from
                      the offering department.
                    </div>
                  </div>
                )}

              {data.notes && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-900">{data.notes}</p>
                </div>
              )}

              <SectionsList code={data.code} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionsList({ code }: { code: string }) {
  const { data: sections = [], isLoading } = useListCourseSections(code);
  const { toast } = useToast();
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const refresh = () =>
      setScheduledIds(new Set(getSchedule().map((s) => s.id)));
    refresh();
    return subscribe(refresh);
  }, []);
  // Group by term/year for prominence
  const grouped = new Map<string, typeof sections>();
  for (const s of sections) {
    const key = `${s.term}|${s.year}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  const groups = Array.from(grouped.entries()).sort((a, b) => {
    const [, ya] = a[0].split("|");
    const [, yb] = b[0].split("|");
    return Number(yb) - Number(ya);
  });
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Users className="h-3 w-3" />
        Live sections & instructor info
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading sections…</div>
      ) : sections.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
          <div>
            <div className="font-semibold mb-1">
              Live data source not connected
            </div>
            Real-time section info (instructor, meeting time, seats) and
            professor ratings require a connection to SCU's Workday/Camino
            course catalog and a verified ratings source. We don't show
            placeholder data here on purpose — it would mislead students
            picking sections. Ask your developer to wire up an SCU course-avails
            feed to populate this panel.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([key, rows]) => {
            const [term, year] = key.split("|");
            return (
              <div key={key}>
                <div className="flex items-baseline gap-2 mb-2 pb-1.5 border-b-2 border-primary/30">
                  <span className="font-serif text-lg font-bold text-primary capitalize">
                    {term} {year}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {rows.length} section{rows.length === 1 ? "" : "s"}{" "}
                    offered
                  </span>
                </div>
                <div className="space-y-2.5">
                  {rows.map((s) => {
                    const isLab =
                      /L\d*$/.test(s.courseCode.replace(/\s/g, "")) ||
                      /^L|L$/.test(s.sectionNumber);
                    const inSchedule = scheduledIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        data-testid={`section-${s.id}`}
                        className="rounded-md border border-border p-3 bg-card hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">
                              {s.courseCode} · §{s.sectionNumber}
                            </span>
                            {isLab && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 h-5 bg-purple-100 text-purple-900 border-purple-300"
                              >
                                <FlaskConical className="h-2.5 w-2.5 mr-0.5" />
                                LAB
                              </Badge>
                            )}
                          </div>
                          <Badge
                            variant={s.seatsOpen > 0 ? "default" : "destructive"}
                            className="text-[10px]"
                          >
                            {s.seatsOpen > 0
                              ? `${s.seatsOpen}/${s.seatsTotal} open`
                              : `Waitlist ${s.waitlist}`}
                          </Badge>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <User className="h-3.5 w-3.5 text-primary" />
                            {s.instructor || (
                              <span className="text-muted-foreground italic font-normal">
                                Instructor TBA
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            <span className="font-mono">
                              {s.meetingDays.length > 0
                                ? s.meetingDays.join("")
                                : "TBA"}
                            </span>
                            <span>
                              {s.startTime && s.endTime
                                ? `${s.startTime}–${s.endTime}`
                                : ""}
                            </span>
                          </div>
                          {s.location && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {s.location}
                            </div>
                          )}
                        </div>

                        <Button
                          variant={inSchedule ? "secondary" : "default"}
                          size="sm"
                          className="mt-2.5 w-full h-8 text-xs"
                          disabled={inSchedule}
                          onClick={() => {
                            const r = addToSchedule(s);
                            toast({
                              title: r.added
                                ? "Added to your schedule"
                                : (r.reason ?? "Already added"),
                              description: r.added
                                ? `${s.courseCode} · §${s.sectionNumber} — open the Weekly Schedule to see it.`
                                : undefined,
                            });
                          }}
                          data-testid={`add-${s.id}`}
                        >
                          {inSchedule ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1" />
                              In your schedule
                            </>
                          ) : (
                            <>
                              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                              Add to Schedule
                            </>
                          )}
                        </Button>

                        {s.rating && (
                          <div className="mt-2 pt-2 border-t border-border/60 text-xs">
                            <div className="flex items-center gap-3 text-foreground/90">
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 text-amber-600" />
                                <strong>
                                  {s.rating.overallRating ?? "—"}
                                </strong>
                                <span className="text-muted-foreground">
                                  /5 ({s.rating.numRatings})
                                </span>
                              </span>
                              <span>
                                Difficulty:{" "}
                                <strong>{s.rating.difficulty ?? "—"}</strong>
                              </span>
                              {s.rating.averageGpa !== null && (
                                <span>
                                  Avg GPA: <strong>{s.rating.averageGpa}</strong>
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 italic">
                              {s.rating.sourceNote}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <BookOpen className="h-3 w-3" />
        {title}
      </div>
      {children}
    </div>
  );
}
