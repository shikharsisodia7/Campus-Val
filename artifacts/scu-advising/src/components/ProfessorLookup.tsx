import { useState } from "react";
import { ExternalLink, Loader2, Search, Info, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";

/**
 * SCU professor lookup backed exclusively by official data:
 *  1. CampusVal's synced SCU section data (who actually teaches, which courses,
 *     which terms) — sourced from the Registrar schedule + Workday paste-ins.
 *  2. SCU's official course evaluations portal (evaluations.scu.edu). SCU
 *     keeps evaluation results behind university single sign-on, so no
 *     numeric scores can be shown here — we link students to the official
 *     portal instead of fabricating metrics.
 */

const SCU_EVALUATIONS_URL = "https://evaluations.scu.edu/";

interface ScuProfessor {
  name: string;
  departments: string[];
  courses: string[];
  latestTerm: string;
}

interface ProfessorLookupProps {
  variant?: "card" | "inline";
}

export function ProfessorLookup({ variant = "card" }: ProfessorLookupProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [scuMatch, setScuMatch] = useState<ScuProfessor | null>(null);
  const [scuChecked, setScuChecked] = useState(false);

  async function runLookup() {
    const q = name.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setScuMatch(null);
    setScuChecked(false);

    try {
      const sres = await fetch(getApiUrl(`/professors?q=${encodeURIComponent(q)}`));
      if (sres.ok) {
        const data = (await sres.json()) as { professors: ScuProfessor[] };
        const lower = q.toLowerCase();
        const match =
          data.professors.find((p) => p.name.toLowerCase() === lower) ??
          data.professors.find((p) => p.name.toLowerCase().includes(lower)) ??
          null;
        setScuMatch(match);
        setScuChecked(true);
      }
    } catch {
      /* Directory lookup is best-effort; the evaluations note below always renders. */
    } finally {
      setLoading(false);
    }
  }

  if (variant === "inline") {
    return (
      <a
        href={SCU_EVALUATIONS_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="link-scu-evaluations"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
      >
        <GraduationCap className="h-3 w-3" />
        SCU course evaluations (SCU login required)
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div
      className="border-t border-border p-3 bg-muted/10 space-y-2.5"
      data-testid="card-professor-lookup"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        <GraduationCap className="h-3 w-3" />
        Look up a professor
      </div>
      <div className="flex gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runLookup();
          }}
          placeholder="e.g. Smith or John Smith"
          className="h-8 text-sm"
          data-testid="input-professor-name"
        />
        <Button
          size="sm"
          onClick={() => void runLookup()}
          disabled={loading || name.trim().length === 0}
          data-testid="button-professor-search"
          className="shrink-0 h-8 px-2"
          title="Look up this professor"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {searched && !loading && (
        <div className="space-y-2 text-sm" data-testid="professor-result">
          {scuChecked && scuMatch && (
            <div className="rounded-md border border-border bg-background px-2.5 py-2">
              <div className="font-medium text-foreground">{scuMatch.name}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Teaches at SCU
                {scuMatch.departments.length > 0
                  ? ` · ${scuMatch.departments.join(", ")}`
                  : ""}
                {scuMatch.latestTerm && scuMatch.latestTerm !== "—"
                  ? ` · latest: ${scuMatch.latestTerm}`
                  : ""}
              </div>
            </div>
          )}
          {scuChecked && !scuMatch && (
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              No instructor by that name in CampusVal's synced SCU section data.
              They may still teach at SCU — only synced terms appear here.
            </p>
          )}

          <div className="rounded-md border border-border bg-background px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">
              No SCU course evaluation data is available in CampusVal. SCU
              publishes evaluation results only behind university sign-on, so
              we never show (or invent) scores here.
            </p>
            <a
              href={SCU_EVALUATIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
              data-testid="link-scu-evaluations-result"
            >
              Open SCU's official evaluations portal (SCU login)
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        Instructor data comes from SCU's published schedule and your Workday
        syncs. Course evaluation results live on SCU's official portal
        (evaluations.scu.edu) and require SCU sign-in — CampusVal never invents
        ratings.
      </p>
    </div>
  );
}
