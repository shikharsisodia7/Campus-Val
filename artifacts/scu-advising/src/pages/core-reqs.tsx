import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  BookMarked,
  Globe,
  Calculator as CalcIcon,
  Heart,
  Users,
  Palette,
  FlaskConical,
  Landmark,
  Languages,
  Sparkles,
  GraduationCap,
  Compass,
} from "lucide-react";

/**
 * SCU Core Curriculum (2025-2026 Undergraduate Bulletin).
 * Source: santaclara.edu/bulletin > Undergraduate Core Curriculum.
 */
interface CoreReq {
  id: string;
  label: string;
  group: "Foundations" | "Explorations" | "Integrations";
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  examples: string[];
}

const CORE_REQS: CoreReq[] = [
  {
    id: "ctw1",
    label: "Critical Thinking & Writing 1",
    group: "Foundations",
    icon: BookMarked,
    description:
      "First-year writing seminar. Builds analytical reading, argument, and revision skills.",
    examples: ["ENGL 1A", "CTW 1 sequence"],
  },
  {
    id: "ctw2",
    label: "Critical Thinking & Writing 2",
    group: "Foundations",
    icon: BookMarked,
    description: "Continues argument and research-based writing.",
    examples: ["ENGL 2", "CTW 2 sequence"],
  },
  {
    id: "ci1",
    label: "Cultures & Ideas 1",
    group: "Foundations",
    icon: Globe,
    description: "Sustained study of texts and ideas across cultures and eras.",
    examples: ["C&I 1 (HIST / PHIL / RSOC / ENGL)"],
  },
  {
    id: "ci2",
    label: "Cultures & Ideas 2",
    group: "Foundations",
    icon: Globe,
    description: "Second course in the Cultures & Ideas sequence.",
    examples: ["C&I 2 paired with your C&I 1"],
  },
  {
    id: "sl",
    label: "Second Language",
    group: "Foundations",
    icon: Languages,
    description:
      "Demonstrated proficiency through the second-year college level (or AP / placement test).",
    examples: ["SPAN 21–22", "CHIN 21–22", "AP score 4+"],
  },
  {
    id: "math",
    label: "Mathematics",
    group: "Foundations",
    icon: CalcIcon,
    description: "One course in mathematics at the college level.",
    examples: ["MATH 11/12", "MATH 30", "AMTH 106"],
  },
  {
    id: "rtc1",
    label: "Religion, Theology & Culture 1",
    group: "Explorations",
    icon: Landmark,
    description:
      "Introduces the academic study of religion in social and cultural context.",
    examples: ["RSOC 11 / SCTR 19"],
  },
  {
    id: "rtc2",
    label: "Religion, Theology & Culture 2",
    group: "Explorations",
    icon: Landmark,
    description: "Second course; deeper engagement with religious traditions.",
    examples: ["TESP / SCTR series"],
  },
  {
    id: "rtc3",
    label: "Religion, Theology & Culture 3",
    group: "Explorations",
    icon: Landmark,
    description: "Capstone in the RTC sequence — applied or contemporary topics.",
    examples: ["TESP advanced", "SCTR advanced"],
  },
  {
    id: "ethics",
    label: "Ethics",
    group: "Explorations",
    icon: Heart,
    description: "Sustained study of ethical reasoning in personal and public life.",
    examples: ["PHIL 26", "MGMT 6", "BIOL 19"],
  },
  {
    id: "civic",
    label: "Civic Engagement",
    group: "Explorations",
    icon: Users,
    description: "Course exploring democratic life and public participation.",
    examples: ["POLI / SOCI offerings tagged CE"],
  },
  {
    id: "diversity",
    label: "Diversity (U.S.)",
    group: "Explorations",
    icon: Users,
    description: "Examines difference, power, and identity in the United States.",
    examples: ["ETHN / SOCI / HIST tagged DV"],
  },
  {
    id: "arts",
    label: "Arts",
    group: "Explorations",
    icon: Palette,
    description: "Creative practice or interpretation of the arts.",
    examples: ["ARTH / MUSC / THTR / DANC"],
  },
  {
    id: "natsci",
    label: "Natural Science",
    group: "Explorations",
    icon: FlaskConical,
    description: "One course in the natural sciences with lab where applicable.",
    examples: ["BIOL 1A", "CHEM 11", "PHYS 11"],
  },
  {
    id: "socsci",
    label: "Social Science",
    group: "Explorations",
    icon: Globe,
    description: "One course studying human behavior and society.",
    examples: ["ECON 1", "PSYC 1", "ANTH 3"],
  },
  {
    id: "sts",
    label: "Science, Technology & Society",
    group: "Explorations",
    icon: Sparkles,
    description: "Examines science and tech as cultural forces.",
    examples: ["STSCI / ENGR / HIST tagged STS"],
  },
  {
    id: "elsj",
    label: "Experiential Learning for Social Justice (ELSJ)",
    group: "Integrations",
    icon: Heart,
    description:
      "Community-based learning with reflection — typically 20–25 hours field component.",
    examples: ["Course tagged ELSJ in registration"],
  },
  {
    id: "advwriting",
    label: "Advanced Writing",
    group: "Integrations",
    icon: BookMarked,
    description:
      "Upper-division course emphasizing written communication in your discipline.",
    examples: ["ENGL 181", "COMM 188", "Major's AW course"],
  },
  {
    id: "pathway",
    label: "Pathway",
    group: "Integrations",
    icon: Compass,
    description:
      "Choose a Pathway theme; complete 3 courses + a reflection essay.",
    examples: [
      "Sustainability",
      "Gender, Sexuality & Society",
      "Justice & the Arts",
      "and 18+ more",
    ],
  },
];

const STORAGE_KEY = "campusval.corereqs.v1";

export default function CoreReqs() {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCompleted(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    } catch {
      /* ignore */
    }
  }, [completed, hydrated]);

  const toggle = (id: string) =>
    setCompleted((c) => ({ ...c, [id]: !c[id] }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CORE_REQS;
    return CORE_REQS.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.examples.some((e) => e.toLowerCase().includes(q)),
    );
  }, [query]);

  const completedCount = CORE_REQS.filter((r) => completed[r.id]).length;
  const pct = Math.round((completedCount / CORE_REQS.length) * 100);

  const groups: Array<CoreReq["group"]> = [
    "Foundations",
    "Explorations",
    "Integrations",
  ];

  return (
    <AppShell>
      <PageHeader
        title="Core Curriculum"
        subtitle="The University Core every SCU undergrad completes — track your progress as you go."
        right={
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Completed
            </div>
            <div className="font-serif text-3xl font-bold text-primary">
              {completedCount}
              <span className="text-base text-muted-foreground">
                /{CORE_REQS.length}
              </span>
            </div>
          </div>
        }
      />
      <PageContent>
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium">Overall progress</div>
              <div className="text-xs text-muted-foreground">
                {pct}% of the Core complete · {CORE_REQS.length - completedCount}{" "}
                requirements remaining
              </div>
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a requirement (e.g. ethics, math, RTC)"
              className="max-w-xs"
              data-testid="input-corereqs-search"
            />
          </div>
          <Progress value={pct} className="h-2" />
        </Card>

        {groups.map((group, gi) => {
          const items = filtered.filter((r) => r.group === group);
          if (items.length === 0) return null;
          return (
            <motion.div
              key={group}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 * gi }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <h2 className="font-serif text-xl font-bold text-foreground">
                  {group}
                </h2>
                <Badge variant="outline" className="ml-1">
                  {items.filter((i) => completed[i.id]).length}/{items.length}
                </Badge>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence>
                  {items.map((req) => {
                    const isDone = !!completed[req.id];
                    const Icon = req.icon;
                    return (
                      <motion.div
                        key={req.id}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.18 }}
                      >
                        <Card
                          className={`p-4 cv-card-hover cursor-pointer relative overflow-hidden ${
                            isDone
                              ? "border-primary/40 bg-primary/[0.04]"
                              : ""
                          }`}
                          onClick={() => toggle(req.id)}
                          data-testid={`req-${req.id}`}
                        >
                          {isDone && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="absolute -top-3 -right-3 h-12 w-12 rounded-full bg-primary/10"
                            />
                          )}
                          <div className="flex items-start gap-3 relative">
                            <div
                              className={`shrink-0 h-9 w-9 rounded-md flex items-center justify-center ${
                                isDone
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-accent text-primary"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-medium text-sm leading-snug">
                                  {req.label}
                                </div>
                                {isDone ? (
                                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {req.description}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {req.examples.slice(0, 2).map((ex) => (
                                  <Badge
                                    key={ex}
                                    variant="secondary"
                                    className="text-[10px] py-0 px-1.5"
                                  >
                                    {ex}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        <Card className="p-4 text-xs text-muted-foreground">
          Progress is saved locally in your browser. Refer to the official{" "}
          <a
            href="https://www.scu.edu/bulletin/undergraduate/chapter-3/CoreCurriculum.html"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            SCU Undergraduate Bulletin
          </a>{" "}
          for graduation certification.
        </Card>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Clear all checked requirements?")) setCompleted({});
          }}
        >
          Reset progress
        </Button>
      </PageContent>
    </AppShell>
  );
}
