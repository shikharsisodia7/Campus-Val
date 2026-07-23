import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Lightbulb,
  Calendar,
  BookOpen,
  Users,
  Heart,
  Compass,
  Briefcase,
  Coffee,
  Search,
} from "lucide-react";

interface Tip {
  id: string;
  category: "Registration" | "Studying" | "Professors" | "Wellness" | "Career" | "Campus Life";
  title: string;
  body: string;
  source?: string;
}

const TIPS: Tip[] = [
  {
    id: "r1",
    category: "Registration",
    title: "Have a Plan B (and C) for every quarter",
    body: "Workday class times shift the day enrollment opens. Pick 6–7 sections, rank them, and have backups ready — especially for popular Core courses like ETHC 4 or any CTW.",
    source: "What students wish they knew first",
  },
  {
    id: "r2",
    category: "Registration",
    title: "Watch the waitlist closely the first week",
    body: "Drop-add runs through the first Friday of the quarter. Refresh Workday daily — seats free up as people finalize schedules.",
  },
  {
    id: "r3",
    category: "Registration",
    title: "Priority registration ≠ open enrollment",
    body: "Athletes, honors, and accommodation students enroll first. Your standing's window opens later — check the Dashboard for your exact slot.",
  },
  {
    id: "s1",
    category: "Studying",
    title: "Use the Drahmann Center for free tutoring",
    body: "Walk-in math/science tutoring + writing partners. Located in Benson — most useful before midterms week.",
    source: "scu.edu/drahmann",
  },
  {
    id: "s2",
    category: "Studying",
    title: "Form study groups in week 2, not week 9",
    body: "By week 9 everyone's underwater. The best groups form early in office hours or in class — ask 2-3 people you respect to meet weekly.",
  },
  {
    id: "s3",
    category: "Studying",
    title: "Library 3rd floor for silence, 1st for collab",
    body: "Learning Commons 1st floor is loud-friendly. 3rd floor is silent. Reserve a study room online up to a week ahead — they fill fast in week 9-10.",
  },
  {
    id: "p1",
    category: "Professors",
    title: "Office hours are the cheat code",
    body: "Most office hours are empty. Show up once a quarter with one specific question — it builds the relationship you'll need for rec letters.",
  },
  {
    id: "p2",
    category: "Professors",
    title: "Ask around before judging a professor",
    body: "SCU's official course evaluations (evaluations.scu.edu, SCU login) plus upper-classmen are your best sources. Some \"hard\" professors are the best teachers — and vice versa.",
  },
  {
    id: "p3",
    category: "Professors",
    title: "Email like a professional",
    body: "Subject line that's specific, greeting with title, sign with your name + course. Saves time + sets a tone.",
  },
  {
    id: "w1",
    category: "Wellness",
    title: "CAPS is free and confidential",
    body: "Counseling & Psychological Services offers free short-term therapy + same-day urgent slots. Call (408) 554-4501.",
    source: "scu.edu/caps",
  },
  {
    id: "w2",
    category: "Wellness",
    title: "Cowell gym is open until 11pm most nights",
    body: "Free for students. Group fitness classes (yoga, spin, HIIT) are also included and post weekly on the Cowell site.",
  },
  {
    id: "w3",
    category: "Wellness",
    title: "Don't skip sleep for one bad assignment",
    body: "Your GPA recovers from a B faster than your body recovers from a month of 4-hour nights. Build a hard stop time.",
  },
  {
    id: "c1",
    category: "Career",
    title: "Handshake > LinkedIn for SCU jobs",
    body: "SCU's Handshake portal has internships specifically targeting Broncos. Set up alerts for your major your sophomore year.",
    source: "scu.joinhandshake.com",
  },
  {
    id: "c2",
    category: "Career",
    title: "The Career Center reviews resumes drop-in",
    body: "Walk-in hours in Benson — bring a printed copy. Get one professional headshot done senior year (free events on campus).",
  },
  {
    id: "c3",
    category: "Career",
    title: "Faculty research = best summer plan",
    body: "Ask 2-3 faculty in your major if they need a research assistant. Even unpaid lab time first year is gold for grad school + future internships.",
  },
  {
    id: "l1",
    category: "Campus Life",
    title: "The Cellar Market closes earlier than you think",
    body: "11pm most nights. Stock your dorm on Sundays — Trader Joe's is a 7-min drive (or the Broncho Express shuttle).",
  },
  {
    id: "l2",
    category: "Campus Life",
    title: "Mission gardens are the best study spot in spring",
    body: "Quiet, free WiFi, no one will bother you. Bring a hoodie — it's colder than it looks once the sun moves.",
  },
  {
    id: "l3",
    category: "Campus Life",
    title: "Use Bronco Bucks at the Cellar + Mission Bakery",
    body: "Faster than swiping a meal — and the Mission Bakery's morning pastries sell out by 10am.",
  },
];

const CATEGORY_META: Record<
  Tip["category"],
  { icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  Registration: { icon: Calendar, tint: "bg-primary/10 text-primary" },
  Studying: { icon: BookOpen, tint: "bg-amber-500/10 text-amber-700" },
  Professors: { icon: Users, tint: "bg-blue-500/10 text-blue-700" },
  Wellness: { icon: Heart, tint: "bg-rose-500/10 text-rose-700" },
  Career: { icon: Briefcase, tint: "bg-emerald-600/10 text-emerald-700" },
  "Campus Life": { icon: Coffee, tint: "bg-violet-500/10 text-violet-700" },
};

export default function AdvicePage() {
  const [cat, setCat] = useState<Tip["category"] | "All">("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return TIPS.filter((t) => cat === "All" || t.category === cat).filter(
      (t) =>
        !query ||
        t.title.toLowerCase().includes(query) ||
        t.body.toLowerCase().includes(query),
    );
  }, [cat, q]);

  const categories = ["All", ...Object.keys(CATEGORY_META)] as const;

  return (
    <AppShell>
      <PageHeader
        title="Advice Board"
        subtitle="Real, time-tested tips from SCU students and advisors — the things they wish someone told them sooner."
        right={
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <Compass className="h-4 w-4 text-primary" />
            {TIPS.length} curated tips
          </div>
        }
      />
      <PageContent>
        <Card className="p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search advice (e.g. registration, sleep, tutoring)"
              className="pl-9"
              data-testid="input-advice-search"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const active = cat === c;
              return (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCat(c as Tip["category"] | "All")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {c}
                </motion.button>
              );
            })}
          </div>
        </Card>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tip, i) => {
            const meta = CATEGORY_META[tip.category];
            const Icon = meta.icon;
            return (
              <motion.div
                key={tip.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: (i % 12) * 0.03 }}
                whileHover={{ y: -3 }}
              >
                <Card className="p-4 h-full cv-card-hover relative overflow-hidden">
                  <div className="flex items-start gap-3">
                    <div
                      className={`shrink-0 h-9 w-9 rounded-md flex items-center justify-center ${meta.tint}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {tip.category}
                        </Badge>
                        <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <div className="font-medium text-sm leading-snug">
                        {tip.title}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                        {tip.body}
                      </p>
                      {tip.source && (
                        <div className="mt-2 text-[10px] uppercase tracking-widest text-primary/70">
                          {tip.source}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No tips match that filter. Try clearing your search.
          </Card>
        )}
      </PageContent>
    </AppShell>
  );
}
