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

import {
  ADVICE_TIPS,
  TIP_SOURCE_META,
  type AdviceTip,
  type TipCategory,
} from "@/data/advice-tips";

const CATEGORY_META: Record<
  TipCategory,
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
  const [cat, setCat] = useState<TipCategory | "All">("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ADVICE_TIPS.filter(
      (t) => cat === "All" || t.category === cat,
    ).filter(
      (t) =>
        !query ||
        t.title.toLowerCase().includes(query) ||
        t.body.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query),
    );
  }, [cat, q]);

  const categories = ["All", ...Object.keys(CATEGORY_META)] as const;

  return (
    <AppShell>
      <PageHeader
        title="Advice Board"
        subtitle="Curated advice for SCU students. Peer tips are general student-experience guidance; items marked Official link to SCU's own resources."
        right={
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <Compass className="h-4 w-4 text-primary" />
            {ADVICE_TIPS.length} curated tips
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
                  onClick={() => setCat(c as TipCategory | "All")}
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
                      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {tip.category}
                          </Badge>
                          <Badge
                            variant={tip.sourceType === "official" ? "default" : "secondary"}
                            className="text-[10px]"
                            title={TIP_SOURCE_META[tip.sourceType].description}
                          >
                            {TIP_SOURCE_META[tip.sourceType].label}
                          </Badge>
                        </div>
                        <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <div className="font-medium text-sm leading-snug">
                        {tip.title}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                        {tip.body}
                      </p>
                      {tip.sourceUrl && (
                        <a
                          href={tip.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-[10px] uppercase tracking-widest text-primary/70 hover:underline"
                        >
                          {tip.sourceLabel ?? tip.sourceUrl}
                        </a>
                      )}
                      {tip.lastVerified && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Verified {tip.lastVerified}
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
