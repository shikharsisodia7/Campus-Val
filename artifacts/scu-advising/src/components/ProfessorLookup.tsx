import { useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SCU_RMP_SCHOOL_ID = 882;

function buildRmpUrl(name: string): string {
  const trimmed = name.trim();
  const q = trimmed.length > 0 ? encodeURIComponent(trimmed) : "*";
  return `https://www.ratemyprofessors.com/search/professors/${SCU_RMP_SCHOOL_ID}?q=${q}`;
}

interface ProfessorLookupProps {
  variant?: "card" | "inline";
}

export function ProfessorLookup({ variant = "card" }: ProfessorLookupProps) {
  const [name, setName] = useState("");

  const open = () => {
    window.open(buildRmpUrl(name), "_blank", "noopener,noreferrer");
  };

  if (variant === "inline") {
    return (
      <a
        href={buildRmpUrl("")}
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
      className="border-t border-border p-3 bg-muted/10"
      data-testid="card-rmp-lookup"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
        <Star className="h-3 w-3" />
        Look up a professor
      </div>
      <div className="flex gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") open();
          }}
          placeholder="e.g. Wood"
          className="h-8 text-sm"
          data-testid="input-rmp-name"
        />
        <Button
          size="sm"
          onClick={open}
          data-testid="button-rmp-search"
          className="shrink-0 h-8 px-2"
          title="Open RateMyProfessor search for SCU"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
        Opens RateMyProfessor's SCU listing in a new tab. Type a last name (or
        leave blank to browse all). Reviews are user-submitted, not endorsed by
        SCU or this app.
      </p>
    </div>
  );
}
