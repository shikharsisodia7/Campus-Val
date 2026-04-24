import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetSectionsSyncStatus } from "@workspace/api-client-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
} from "lucide-react";
import {
  getSchedule,
  removeFromSchedule,
  clearTerm,
  subscribe,
  findConflicts,
  timeToMinutes,
  type ScheduledSection,
} from "@/lib/schedule-store";

const DAYS = [
  { key: "M", label: "Mon" },
  { key: "T", label: "Tue" },
  { key: "W", label: "Wed" },
  { key: "R", label: "Thu" },
  { key: "F", label: "Fri" },
] as const;

const HOUR_START = 8; // 8 AM
const HOUR_END = 22; // 10 PM
const PX_PER_MIN = 1.1;
const TOTAL_MIN = (HOUR_END - HOUR_START) * 60;
const GRID_HEIGHT = TOTAL_MIN * PX_PER_MIN;

function termColor(idx: number): { bg: string; border: string; text: string } {
  const palette = [
    {
      bg: "bg-blue-100",
      border: "border-blue-400",
      text: "text-blue-900",
    },
    {
      bg: "bg-emerald-100",
      border: "border-emerald-400",
      text: "text-emerald-900",
    },
    {
      bg: "bg-amber-100",
      border: "border-amber-400",
      text: "text-amber-900",
    },
    {
      bg: "bg-purple-100",
      border: "border-purple-400",
      text: "text-purple-900",
    },
    {
      bg: "bg-pink-100",
      border: "border-pink-400",
      text: "text-pink-900",
    },
    {
      bg: "bg-cyan-100",
      border: "border-cyan-400",
      text: "text-cyan-900",
    },
  ];
  return palette[idx % palette.length]!;
}

function format12(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  let h = parseInt(m[1]!, 10);
  const mer = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  if (h > 12) h -= 12;
  return `${h}:${m[2]} ${mer}`;
}

export default function SchedulePage() {
  const [sections, setSections] = useState<ScheduledSection[]>([]);
  const { data: syncStatus } = useGetSectionsSyncStatus();

  useEffect(() => {
    setSections(getSchedule());
    return subscribe(() => setSections(getSchedule()));
  }, []);

  const termOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sections) set.add(`${s.term}|${s.year}`);
    if (syncStatus?.byTerm) {
      for (const t of syncStatus.byTerm) set.add(`${t.term}|${t.year}`);
    }
    return Array.from(set).map((k) => {
      const [term, year] = k.split("|");
      return { term: term!, year: Number(year), key: k };
    });
  }, [sections, syncStatus]);

  const [activeTerm, setActiveTerm] = useState<string>("");
  useEffect(() => {
    if (!activeTerm && termOptions.length > 0) {
      // Prefer term that has scheduled sections
      const withSections = termOptions.find((o) =>
        sections.some((s) => s.term === o.term && s.year === o.year),
      );
      setActiveTerm((withSections ?? termOptions[0]!).key);
    }
  }, [termOptions, activeTerm, sections]);

  const [aTerm, aYearStr] = activeTerm.split("|");
  const aYear = Number(aYearStr);
  const visible = sections.filter(
    (s) => s.term === aTerm && s.year === aYear,
  );

  const conflicts = useMemo(() => findConflicts(visible), [visible]);
  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) {
      set.add(c.a.id);
      set.add(c.b.id);
    }
    return set;
  }, [conflicts]);

  // Assign a stable color per course code in this view
  const colorMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof termColor>>();
    let i = 0;
    for (const s of visible) {
      const baseCode = s.courseCode.replace(/L$/, "");
      if (!m.has(baseCode)) {
        m.set(baseCode, termColor(i));
        i++;
      }
    }
    return m;
  }, [visible]);

  const totalUnits = visible.length; // crude — each section counts as 1 row in the grid
  const hourLabels = Array.from(
    { length: HOUR_END - HOUR_START + 1 },
    (_, i) => HOUR_START + i,
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between mb-6 gap-6 flex-wrap">
          <div>
            <h1 className="font-serif text-4xl font-bold mb-2 flex items-center gap-3">
              <Calendar className="h-8 w-8 text-primary" />
              Weekly Schedule
            </h1>
            <p className="text-muted-foreground">
              Pick sections from a course drawer to drop them onto this grid —
              we'll flag any time conflicts in real time so your week never
              double-books a class.
            </p>
          </div>
          <div className="flex items-end gap-3">
            {termOptions.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Term
                </label>
                <Select value={activeTerm} onValueChange={setActiveTerm}>
                  <SelectTrigger
                    className="w-44"
                    data-testid="select-active-term"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {termOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        <span className="capitalize">{o.term}</span> {o.year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Link href="/courses">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Add from catalog
              </Button>
            </Link>
          </div>
        </div>

        {sections.length === 0 ? (
          <Card className="p-10 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h2 className="font-serif text-2xl font-semibold mb-2">
              Your week is empty
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
              First,{" "}
              <Link href="/sync-workday" className="underline text-primary">
                paste your Workday section list
              </Link>{" "}
              so the catalog knows real instructors and meeting times. Then
              open any course and click <strong>Add to schedule</strong> on a
              section.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/sync-workday">
                <Button variant="default" data-testid="link-sync">
                  <ClipboardPaste className="h-4 w-4 mr-1.5" />
                  Sync Workday
                </Button>
              </Link>
              <Link href="/courses">
                <Button variant="outline">Browse courses</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              <Card className="p-4 overflow-x-auto">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: "60px repeat(5, minmax(140px, 1fr))",
                  }}
                >
                  <div></div>
                  {DAYS.map((d) => (
                    <div
                      key={d.key}
                      className="text-center font-semibold text-sm pb-2 border-b border-border"
                    >
                      {d.label}
                    </div>
                  ))}

                  <div
                    className="relative"
                    style={{ height: GRID_HEIGHT }}
                  >
                    {hourLabels.map((h) => (
                      <div
                        key={h}
                        className="absolute right-2 text-[10px] text-muted-foreground"
                        style={{
                          top: (h - HOUR_START) * 60 * PX_PER_MIN - 6,
                        }}
                      >
                        {h % 12 === 0 ? 12 : h % 12} {h < 12 ? "AM" : "PM"}
                      </div>
                    ))}
                  </div>

                  {DAYS.map((d) => (
                    <div
                      key={d.key}
                      className="relative border-l border-border/60"
                      style={{ height: GRID_HEIGHT }}
                      data-testid={`day-col-${d.key}`}
                    >
                      {hourLabels.map((h) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0 border-t border-border/30"
                          style={{
                            top: (h - HOUR_START) * 60 * PX_PER_MIN,
                          }}
                        />
                      ))}
                      {visible
                        .filter((s) => s.meetingDays.includes(d.key))
                        .map((s) => {
                          const startMin =
                            timeToMinutes(s.startTime) - HOUR_START * 60;
                          const endMin =
                            timeToMinutes(s.endTime) - HOUR_START * 60;
                          if (
                            timeToMinutes(s.startTime) === 0 ||
                            timeToMinutes(s.endTime) === 0
                          )
                            return null;
                          const top = startMin * PX_PER_MIN;
                          const height = Math.max(
                            (endMin - startMin) * PX_PER_MIN,
                            32,
                          );
                          const baseCode = s.courseCode.replace(/L$/, "");
                          const color =
                            colorMap.get(baseCode) ?? termColor(0);
                          const isConflict = conflictIds.has(s.id);
                          return (
                            <div
                              key={`${s.id}-${d.key}`}
                              data-testid={`event-${s.id}-${d.key}`}
                              className={`absolute left-0.5 right-0.5 rounded p-1 text-[10px] leading-tight overflow-hidden border ${
                                isConflict
                                  ? "bg-red-100 border-red-500 text-red-900 ring-2 ring-red-400"
                                  : `${color.bg} ${color.border} ${color.text}`
                              }`}
                              style={{ top, height }}
                              title={`${s.courseCode}-${s.sectionNumber} ${s.instructor} ${format12(s.startTime)}-${format12(s.endTime)} ${s.location}`}
                            >
                              <div className="font-mono font-bold truncate">
                                {s.courseCode}-{s.sectionNumber}
                                {s.isLab && (
                                  <span className="ml-1 text-[8px] uppercase">
                                    Lab
                                  </span>
                                )}
                              </div>
                              <div className="truncate">{s.instructor}</div>
                              <div className="truncate opacity-80">
                                {format12(s.startTime)}–{format12(s.endTime)}
                              </div>
                              {s.location && (
                                <div className="truncate opacity-70 italic">
                                  {s.location}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </Card>

              <div className="space-y-4">
                {conflicts.length > 0 ? (
                  <Card
                    className="p-4 border-red-300 bg-red-50"
                    data-testid="conflict-card"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-5 w-5 text-red-700" />
                      <h3 className="font-semibold text-red-900">
                        {conflicts.length} time conflict
                        {conflicts.length === 1 ? "" : "s"}
                      </h3>
                    </div>
                    <div className="space-y-2 text-xs text-red-900">
                      {conflicts.map((c, i) => (
                        <div
                          key={i}
                          className="border-l-2 border-red-400 pl-2"
                        >
                          <div>
                            <strong>
                              {c.a.courseCode}-{c.a.sectionNumber}
                            </strong>{" "}
                            and{" "}
                            <strong>
                              {c.b.courseCode}-{c.b.sectionNumber}
                            </strong>{" "}
                            both meet on{" "}
                            {DAYS.find((d) => d.key === c.day)?.label ??
                              c.day}{" "}
                            from{" "}
                            {format12(
                              `${Math.floor(c.overlapStart / 60)
                                .toString()
                                .padStart(2, "0")}:${(c.overlapStart % 60)
                                .toString()
                                .padStart(2, "0")}`,
                            )}{" "}
                            to{" "}
                            {format12(
                              `${Math.floor(c.overlapEnd / 60)
                                .toString()
                                .padStart(2, "0")}:${(c.overlapEnd % 60)
                                .toString()
                                .padStart(2, "0")}`,
                            )}
                            .
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : (
                  visible.length > 0 && (
                    <Card className="p-4 border-emerald-300 bg-emerald-50">
                      <div className="flex items-center gap-2 text-emerald-900">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-semibold">
                          No time conflicts
                        </span>
                      </div>
                    </Card>
                  )
                )}

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">
                      In your schedule ({visible.length})
                    </h3>
                    {visible.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => {
                          if (
                            confirm(
                              `Remove all ${visible.length} sections from ${aTerm} ${aYear}?`,
                            )
                          )
                            clearTerm(aTerm!, aYear);
                        }}
                      >
                        Clear term
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {visible.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No sections in this term yet.
                      </p>
                    ) : (
                      visible.map((s) => {
                        const inConflict = conflictIds.has(s.id);
                        return (
                          <div
                            key={s.id}
                            data-testid={`schedule-row-${s.id}`}
                            className={`flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-0 ${
                              inConflict
                                ? "bg-red-50 -mx-2 px-2 rounded"
                                : ""
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-mono font-bold flex items-baseline gap-1.5">
                                {s.courseCode}-{s.sectionNumber}
                                {s.isLab && (
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] px-1 py-0"
                                  >
                                    LAB
                                  </Badge>
                                )}
                                {inConflict && (
                                  <AlertTriangle className="h-3 w-3 text-red-600" />
                                )}
                              </div>
                              <div className="text-muted-foreground truncate">
                                {s.instructor}
                              </div>
                              <div className="text-muted-foreground">
                                {s.meetingDays.join("")}{" "}
                                {format12(s.startTime)}–{format12(s.endTime)}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => removeFromSchedule(s.id)}
                              data-testid={`remove-${s.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>

                <Card className="p-3 bg-muted/30 text-xs text-muted-foreground flex gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Tip: Don't see a course? Sections come from whatever
                    you've{" "}
                    <Link
                      href="/sync-workday"
                      className="underline text-primary"
                    >
                      pasted from Workday
                    </Link>
                    . Lab sections appear with a <strong>LAB</strong> tag.
                  </span>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
