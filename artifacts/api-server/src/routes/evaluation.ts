import { Router, type IRouter } from "express";
import { EVALUATION_SCENARIOS } from "../data/evaluation-bench";
import { openai } from "@workspace/integrations-openai-ai-server";
import { buildSystemPrompt } from "../data/advisor-prompt";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const MODEL = "gpt-5.2";

router.get("/evaluation/scenarios", (_req, res) => {
  res.json(EVALUATION_SCENARIOS);
});

router.post("/evaluation/run", requireAuth, async (req, res) => {
  const body = (req.body ?? {}) as { scenarioIds?: string[] };
  const scenarios =
    body.scenarioIds && body.scenarioIds.length > 0
      ? EVALUATION_SCENARIOS.filter((s) => body.scenarioIds!.includes(s.id))
      : EVALUATION_SCENARIOS;

  if (scenarios.length === 0) {
    return res.status(400).json({ error: "No matching scenarios" });
  }

  const systemPrompt = buildSystemPrompt();

  // Risk-weighted scoring:
  // - Higher-risk scenarios contribute more to the weighted average (critical = 4x).
  // - Higher-risk scenarios have a stricter pass bar (critical needs >=0.9 + zero forbidden hits).
  // - Forbidden keywords are weighted heavier on higher-risk scenarios.
  const riskWeights: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  const riskPassThreshold: Record<string, number> = {
    low: 0.6,
    medium: 0.7,
    high: 0.8,
    critical: 0.9,
  };
  const riskForbiddenPenalty: Record<string, number> = {
    low: 0.3,
    medium: 0.5,
    high: 0.7,
    critical: 1.0,
  };

  const results = await Promise.all(
    scenarios.map(async (scenario) => {
      const startedAt = Date.now();
      let response = "";
      try {
        const completion = await openai.chat.completions.create({
          model: MODEL,
          max_completion_tokens: 800,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: scenario.prompt },
          ],
        });
        response = completion.choices[0]?.message?.content ?? "";
      } catch (err) {
        response = `[error] ${err instanceof Error ? err.message : "unknown"}`;
      }
      const latencyMs = Date.now() - startedAt;

      const responseLower = response.toLowerCase();
      const matched = scenario.expectedKeywords.filter((k) =>
        responseLower.includes(k.toLowerCase()),
      );
      const missed = scenario.expectedKeywords.filter(
        (k) => !responseLower.includes(k.toLowerCase()),
      );
      const triggeredForbidden = scenario.forbiddenKeywords.filter((k) =>
        responseLower.includes(k.toLowerCase()),
      );

      const baseScore =
        scenario.expectedKeywords.length === 0
          ? 1
          : matched.length / scenario.expectedKeywords.length;
      const penaltyPerHit = riskForbiddenPenalty[scenario.risk] ?? 0.5;
      const penalty = triggeredForbidden.length * penaltyPerHit;
      const score = Math.max(0, Math.min(1, baseScore - penalty));
      const threshold = riskPassThreshold[scenario.risk] ?? 0.7;
      const passed = score >= threshold && triggeredForbidden.length === 0;
      const weight = riskWeights[scenario.risk] ?? 1;

      return {
        scenarioId: scenario.id,
        category: scenario.category,
        risk: scenario.risk,
        prompt: scenario.prompt,
        response,
        matchedKeywords: matched,
        missedKeywords: missed,
        triggeredForbidden,
        score: Number(score.toFixed(3)),
        weight,
        passThreshold: threshold,
        passed,
        latencyMs,
      };
    }),
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const averageScore =
    totalWeight === 0
      ? 0
      : results.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight;
  const unweightedScore =
    results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const criticalFailures = results.filter(
    (r) => !r.passed && r.risk === "critical",
  ).length;
  const highOrAboveFailures = results.filter(
    (r) => !r.passed && (r.risk === "critical" || r.risk === "high"),
  ).length;

  res.json({
    ranAt: new Date().toISOString(),
    model: MODEL,
    totalScenarios: results.length,
    passed,
    failed,
    averageScore: Number(averageScore.toFixed(3)),
    unweightedScore: Number(unweightedScore.toFixed(3)),
    criticalFailures,
    highOrAboveFailures,
    scoringNote:
      "Score is risk-weighted: critical=4x, high=3x, medium=2x, low=1x. Pass thresholds escalate by risk (critical>=0.9, high>=0.8, medium>=0.7, low>=0.6). Any forbidden-keyword hit fails the scenario.",
    results,
  });
});

export default router;
