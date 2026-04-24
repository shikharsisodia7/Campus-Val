import { useState } from "react";
import {
  useListCourses,
  useGetCourse,
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
} from "lucide-react";
import { termLabel } from "@/lib/api";

export default function Courses() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string | null>(null);
  const [coreOnly, setCoreOnly] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const { data: courses = [], isLoading } = useListCourses({
    search: search || undefined,
    department: department ?? undefined,
    core: coreOnly ? ("true" as unknown as boolean) : undefined,
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
    query: { enabled: !!code },
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
  const { data: sections = [], isLoading } = useListCourseSections(code, {
    term: "fall",
    year: 2025,
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
        <div className="space-y-3">
          {sections.map((s) => (
            <div
              key={s.id}
              data-testid={`section-${s.id}`}
              className="rounded-md border border-border p-3 bg-muted/10"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-mono text-sm font-bold">
                  {s.courseCode} · {s.sectionNumber}
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
              <div className="text-sm font-medium text-foreground mt-1">
                {s.instructor}
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {s.meetingDays.join("")} {s.startTime}-{s.endTime}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {s.location}
                </span>
              </div>
              {s.rating && (
                <div className="mt-2 pt-2 border-t border-border/60 text-xs">
                  <div className="flex items-center gap-3 text-foreground/90">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-600" />
                      <strong>{s.rating.overallRating ?? "—"}</strong>
                      <span className="text-muted-foreground">
                        /5 ({s.rating.numRatings})
                      </span>
                    </span>
                    <span>
                      Difficulty: <strong>{s.rating.difficulty ?? "—"}</strong>
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
          ))}
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
