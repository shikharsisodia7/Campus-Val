import { useState } from "react";
import { useListPolicies } from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, ExternalLink } from "lucide-react";

interface Policy {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl?: string | null;
  tags: string[];
}

export default function Policies() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState<Policy | null>(null);

  const { data: policies = [] } = useListPolicies({
    search: search || undefined,
    category: category ?? undefined,
  });

  const categories = Array.from(new Set(policies.map((p) => p.category))).sort();

  return (
    <AppShell>
      <PageHeader
        title="SCU Academic Policies"
        subtitle="The verified policies CampusVal's AI advisor uses as ground truth."
      />
      <PageContent>
        <Card className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-policy-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search policies, tags, or keywords"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              label="All"
              active={category === null}
              onClick={() => setCategory(null)}
            />
            {categories.map((c) => (
              <Chip
                key={c}
                label={c}
                active={category === c}
                onClick={() => setCategory(category === c ? null : c)}
              />
            ))}
          </div>
        </Card>

        {policies.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No policies match your search.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpen(p)}
                data-testid={`policy-${p.id}`}
                className="text-left"
              >
                <Card className="p-5 h-full hover:border-primary/40 hover:shadow-md transition-all group cursor-pointer">
                  <Badge variant="secondary" className="text-[11px] mb-2">
                    {p.category}
                  </Badge>
                  <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {p.title}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {p.summary}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {p.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono text-muted-foreground bg-muted"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}

        <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
          <SheetContent className="overflow-y-auto sm:max-w-lg">
            {open && (
              <>
                <SheetHeader>
                  <Badge variant="secondary" className="w-fit mb-1">
                    {open.category}
                  </Badge>
                  <SheetTitle className="font-serif text-2xl">
                    {open.title}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="text-sm font-semibold text-foreground">
                    {open.summary}
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                    {open.body}
                  </p>
                  <div className="border-t border-border pt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                      Source
                    </div>
                    {open.sourceUrl ? (
                      <a
                        href={open.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {open.source}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <div className="text-sm text-foreground">
                        {open.source}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </PageContent>
    </AppShell>
  );
}

function Chip({
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
