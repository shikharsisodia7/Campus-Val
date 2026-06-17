import { useState } from "react";
import { ExternalLink, Star, Loader2, Search, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";

const SCU_RMP_SCHOOL_ID = 882;

function browseUrl(name: string): string {
  const trimmed = name.trim();
  const q = trimmed.length > 0 ? encodeURIComponent(trimmed) : "*";
  return `https://www.ratemyprofessors.com/search/professors/${SCU_RMP_SCHOOL_ID}?q=${q}`;
}

interface RmpResult {
  found: boolean;
  name: string;
  deepLinkUrl: string;
  avgRating: number | null;
  avgDifficulty: number | null;
  wouldTakeAgainPercent: number | null;
  numRatings: number | null;
  department: string | null;
  topTags: string[];
  error: string | null;
}

interface ScuProfessor {
  name: string;
  departments: string[];
  courses: string[];
  latestTerm: string;
}

interface ProfessorLookupProps {
  variant?: "card" | "inline";
}

type RmpStatus = "found" | "not_found" | "error";

export function ProfessorLookup({ variant = "card" }: ProfessorLookupProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [rmp, setRmp] = useState<RmpResult | null>(null);
  const [rmpStatus, setRmpStatus] = useState<RmpStatus>("not_found");
  const [scuMatch, setScuMatch] = useState<ScuProfessor | null>(null);
  const [scuChecked, setScuChecked] = useState(false);

  async function runLookup() {
    const q = name.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setRmp(null);
    setRmpStatus("not_found");
    setScuMatch(null);
    setScuChecked(false);

    // 1) Check whether this is a real SCU instructor in our synced section data.
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
      /* SCU data is best-effort; RMP result below is the main answer. */
    }

    // 2) Real RateMyProfessor lookup — honestly distinguishes a genuine
    //    "no profile" from a lookup that couldn't run (network/auth/RMP down).
    try {
      const res = await fetch(getApiUrl(`/professors/${encodeURIComponent(q)}/rmp`));
      if (!res.ok) {
        setRmp(null);
        setRmpStatus("error");
      } else {
        const result = (await res.json()) as RmpResult;
        setRmp(result);
        if (result.found) {
          setRmpStatus("found");
        } else if (result.error && /unavailable|HTTP\s*\d|timed?\s*out|network/i.test(result.error)) {
          // The lookup itself failed upstream — not a true absence.
          setRmpStatus("error");
        } else {
          setRmpStatus("not_found");
        }
      }
    } catch {
      setRmp(null);
      setRmpStatus("error");
    } finally {
      setLoading(false);
    }
  }

  if (variant === "inline") {
    return (
      <a
        href={browseUrl("")}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="link-rmp-browse"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
      >
        <Star className="h-3 w-3" />
        Find a professor on RateMyProfessor (SCU)
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div
      className="border-t border-border p-3 bg-muted/10 space-y-2.5"
      data-testid="card-rmp-lookup"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        <Star className="h-3 w-3" />
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
          data-testid="input-rmp-name"
        />
        <Button
          size="sm"
          onClick={() => void runLookup()}
          disabled={loading || name.trim().length === 0}
          data-testid="button-rmp-search"
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
        <div className="space-y-2 text-sm" data-testid="rmp-result">
          {/* SCU section-data verification */}
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

          {/* RateMyProfessor result — honest about presence/absence/errors */}
          {rmpStatus === "error" ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] text-amber-800">
                Couldn't reach RateMyProfessor just now, so we can't confirm
                whether{" "}
                <span className="font-medium">"{name.trim()}"</span> has a
                profile. This is a temporary lookup error — not a sign the
                professor is unrated. Try again in a moment.
              </p>
              <a
                href={browseUrl(name)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                data-testid="link-rmp-browse-fallback"
              >
                Search RateMyProfessor yourself <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : rmp && rmp.found ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{rmp.name}</span>
                {rmp.avgRating != null && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Star className="h-3 w-3 fill-current" />
                    {rmp.avgRating.toFixed(1)}/5
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                {rmp.numRatings != null && <div>{rmp.numRatings} rating{rmp.numRatings === 1 ? "" : "s"} on RateMyProfessor</div>}
                {rmp.wouldTakeAgainPercent != null && (
                  <div>{Math.round(rmp.wouldTakeAgainPercent)}% would take again</div>
                )}
                {rmp.avgDifficulty != null && <div>Difficulty {rmp.avgDifficulty.toFixed(1)}/5</div>}
              </div>
              {rmp.topTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {rmp.topTags.slice(0, 4).map((t) => (
                    <span key={t} className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <a
                href={rmp.deepLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                data-testid="link-rmp-profile"
              >
                View full reviews <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-background px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">
                No RateMyProfessor profile found for{" "}
                <span className="font-medium text-foreground">"{name.trim()}"</span> at SCU.
                {rmp?.error ? "" : " That usually means no student has rated them yet — not that anything is wrong."}
              </p>
              <a
                href={browseUrl(name)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                data-testid="link-rmp-browse-fallback"
              >
                Search RateMyProfessor yourself <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        Ratings are pulled live from RateMyProfessor (user-submitted, not endorsed
        by SCU or CampusVal). We never invent ratings — if a professor isn't
        listed, we tell you.
      </p>
    </div>
  );
}
