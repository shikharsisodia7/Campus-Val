import { useState } from "react";
import {
  useListEvaluationScenarios,
  useRunEvaluation,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Gauge,
  Play,
} from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

export default function Evaluation() {
  const { data: scenarios = [] } = useListEvaluationScenarios();
  const runEval = useRunEvaluation();
  const [selected, setSelected] = useState<string[] | null>(null);

  const result = runEval.data;

  const onRun = (ids?: string[]) => {
    setSelected(ids ?? null);
    runEval.mutate({
      data: ids ? { scenarioIds: ids } : { scenarioIds: [] },
    });
  };

  return (
    <AppShell>
      <PageHeader
        title="AI Planning Assistant Evaluation Framework"
        subtitle="Benchmark the AI planning assistant against curated SCU policy scenarios. Each scenario is graded on whether the response includes required keywords, avoids forbidden patterns, and meets a risk-weighted bar."
        right={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onRun(scenarios.filter((s) => s.risk === "critical").map((s) => s.id))}
              disabled={runEval.isPending || scenarios.length === 0}
              data-testid="button-run-critical"
            >
              Run critical only
            </Button>
            <Button
              onClick={() => onRun()}
              disabled={runEval.isPending || scenarios.length === 0}
              data-testid="button-run-all"
            >
              <Play className="h-4 w-4 mr-1.5" />
              {runEval.isPending ? "Running…" : "Run full benchmark"}
            </Button>
          </div>
        }
      />
      <PageContent>
        {!result && !runEval.isPending && (
          <Card className="p-6">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              {scenarios.length} scenarios in the benchmark
            </div>
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
              Each scenario sends a prompt to the AI assistant and grades the
              response. "Critical" scenarios test rules where a wrong answer
              could cost a student tuition or graduation timing (e.g.
              post-enrollment outside coursework, the 87.5-unit transfer cap,
              residency requirements).
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  data-testid={`scenario-${s.id}`}
                  className="rounded-md border border-border p-3 bg-muted/10"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-mono text-muted-foreground">
                      {s.id}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${RISK_COLORS[s.risk] ?? ""}`}
                    >
                      {s.risk}
                    </Badge>
                  </div>
                  <div className="text-sm text-foreground mt-1.5 leading-snug">
                    {s.prompt}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground italic">
                    {s.rubric}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {runEval.isPending && (
          <Card className="p-12 text-center">
            <div className="text-sm font-semibold text-foreground">
              Running benchmark…
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Sending {selected?.length ?? scenarios.length} scenarios to the
              assistant model. This typically takes 20-60 seconds.
            </p>
          </Card>
        )}

        {result && (
          <>
            <Card className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <ScoreStat
                  label="Avg score"
                  value={`${(result.averageScore * 100).toFixed(0)}%`}
                />
                <ScoreStat
                  label="Passed"
                  value={`${result.passed} / ${result.totalScenarios}`}
                  positive
                />
                <ScoreStat
                  label="Failed"
                  value={String(result.failed)}
                  negative={result.failed > 0}
                />
                <ScoreStat
                  label="Critical failures"
                  value={String(result.criticalFailures)}
                  negative={result.criticalFailures > 0}
                />
                <ScoreStat label="Model" value={result.model} mono />
              </div>
              <Progress
                value={result.averageScore * 100}
                className="mt-4"
              />
              <div className="text-xs text-muted-foreground mt-2 italic">
                Run at {new Date(result.ranAt).toLocaleString()}
              </div>
            </Card>

            <div className="space-y-3">
              {result.results.map((r) => (
                <ResultCard key={r.scenarioId} r={r} />
              ))}
            </div>
          </>
        )}
      </PageContent>
    </AppShell>
  );
}

function ResultCard({
  r,
}: {
  r: {
    scenarioId: string;
    category: string;
    risk: string;
    prompt: string;
    response: string;
    matchedKeywords: string[];
    missedKeywords: string[];
    triggeredForbidden: string[];
    score: number;
    passed: boolean;
    latencyMs: number;
  };
}) {
  return (
    <Card
      data-testid={`result-${r.scenarioId}`}
      className={`p-5 border-l-4 ${
        r.passed ? "border-l-emerald-500" : "border-l-destructive"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-mono text-xs text-muted-foreground">
              {r.scenarioId}
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] ${RISK_COLORS[r.risk] ?? ""}`}
            >
              {r.risk}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {r.category.replace("_", " ")}
            </Badge>
          </div>
          <div className="text-sm text-foreground mt-1.5">{r.prompt}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs text-muted-foreground font-mono">
            {r.latencyMs}ms · {(r.score * 100).toFixed(0)}%
          </div>
          {r.passed ? (
            <Badge className="bg-emerald-600 text-white">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Passed
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              Failed
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
        {r.response}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {r.matchedKeywords.length > 0 && (
          <div>
            <div className="uppercase tracking-wider font-semibold text-emerald-700 mb-1">
              Matched
            </div>
            <div className="flex flex-wrap gap-1">
              {r.matchedKeywords.map((k) => (
                <Badge
                  key={k}
                  className="bg-emerald-100 text-emerald-800 text-[10px]"
                >
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {r.missedKeywords.length > 0 && (
          <div>
            <div className="uppercase tracking-wider font-semibold text-amber-800 mb-1">
              Missed
            </div>
            <div className="flex flex-wrap gap-1">
              {r.missedKeywords.map((k) => (
                <Badge
                  key={k}
                  variant="outline"
                  className="border-amber-300 text-amber-800 text-[10px]"
                >
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {r.triggeredForbidden.length > 0 && (
          <div>
            <div className="uppercase tracking-wider font-semibold text-destructive mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Forbidden patterns hit
            </div>
            <div className="flex flex-wrap gap-1">
              {r.triggeredForbidden.map((k) => (
                <Badge key={k} variant="destructive" className="text-[10px]">
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ScoreStat({
  label,
  value,
  positive,
  negative,
  mono,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div
        className={`font-serif text-2xl font-bold mt-1 ${
          positive
            ? "text-emerald-700"
            : negative
              ? "text-destructive"
              : "text-foreground"
        } ${mono ? "font-mono text-base" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
