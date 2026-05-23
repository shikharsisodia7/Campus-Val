import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListCourses, useGetCourse } from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Scale, BookOpen, Search, Sparkles } from "lucide-react";

type SlotIdx = 0 | 1 | 2;

export default function ComparePage() {
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);

  const setSlot = (i: SlotIdx, code: string | null) =>
    setSlots((s) => {
      const next = [...s];
      next[i] = code;
      return next;
    });

  return (
    <AppShell>
      <PageHeader
        title="Compare Courses"
        subtitle="Put up to three courses side-by-side: units, prerequisites, descriptions, and core tags."
        right={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Scale className="h-4 w-4 text-primary" />
            {slots.filter(Boolean).length}/3 selected
          </div>
        }
      />
      <PageContent>
        <div className="grid md:grid-cols-3 gap-4">
          {([0, 1, 2] as SlotIdx[]).map((i) => (
            <CompareSlot
              key={i}
              code={slots[i] ?? null}
              onSelect={(c) => setSlot(i, c)}
              onClear={() => setSlot(i, null)}
              index={i}
            />
          ))}
        </div>

        {slots.filter(Boolean).length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="p-5 bg-primary/[0.04] border-primary/20">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-medium text-sm">Quick takeaways</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use this view to weigh workload, prereqs, and how each
                    course satisfies your Core or major. For deeper guidance
                    about which one fits your plan, ask the AI Advisor with all
                    course codes listed above.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </PageContent>
    </AppShell>
  );
}

function CompareSlot({
  code,
  onSelect,
  onClear,
  index,
}: {
  code: string | null;
  onSelect: (code: string) => void;
  onClear: () => void;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <Card className="min-h-[280px] p-0 overflow-hidden border-dashed">
        <AnimatePresence mode="wait">
          {!code ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full min-h-[280px] flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center mb-3">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div className="text-sm font-medium">Add course #{index + 1}</div>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Search by code or title
              </p>
              <CoursePicker onPick={onSelect} />
            </motion.div>
          ) : (
            <motion.div
              key={code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <Badge className="bg-primary text-primary-foreground">
                  Slot {index + 1}
                </Badge>
                <button
                  onClick={onClear}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CourseDetail code={code} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function CoursePicker({ onPick }: { onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: courses = [], isLoading } = useListCourses({
    search: q || undefined,
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Search className="h-3.5 w-3.5 mr-1.5" /> Browse courses
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="p-2 border-b">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. CSCI 60, ENGL 1A"
            className="h-9"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {isLoading && (
            <div className="p-3 text-xs text-muted-foreground">Loading…</div>
          )}
          {!isLoading && courses.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              No matches.
            </div>
          )}
          {courses.slice(0, 50).map((c) => (
            <button
              key={c.code}
              onClick={() => {
                onPick(c.code);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-start gap-2 border-b last:border-b-0"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">{c.code}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.title}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CourseDetail({ code }: { code: string }) {
  const { data, isLoading } = useGetCourse(code);
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-4 w-full bg-muted animate-pulse rounded" />
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-sm text-muted-foreground">Course not found.</div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <div className="font-serif font-bold text-base text-foreground">
          {data.code}
        </div>
        <div className="text-sm text-foreground/90">{data.title}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Units" value={`${data.units ?? "—"}`} />
        <Stat
          label="Department"
          value={data.department || data.code.split(" ")[0] || "—"}
        />
      </div>
      {data.prereqLogic && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
            Prerequisites
          </div>
          <div className="text-xs">{data.prereqLogic}</div>
        </div>
      )}
      {data.description && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
            Description
          </div>
          <p className="text-xs text-muted-foreground line-clamp-6">
            {data.description}
          </p>
        </div>
      )}
      {data.coreAreas && data.coreAreas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.coreAreas.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-accent/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
