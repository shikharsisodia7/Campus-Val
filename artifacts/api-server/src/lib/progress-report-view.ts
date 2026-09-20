/**
 * Minimized projection for the planning surfaces (Degree Plan, Tentative
 * Degree Plan, Quarter Plan). Those panels are a completion benchmark, not a
 * grade report, so the server never sends them what they must not show:
 * per-course grades, the raw source line of each row, and the student ID the
 * parser read from the document. Enforcing this here — not only by hiding it
 * in the UI — means a planning view cannot leak a grade even if a component
 * is later changed to render more.
 */
export function planningProjection(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const p = parsed as Record<string, any>;
  const { reportStudentId: _omitId, ...rest } = p;
  const groups = Array.isArray(p["groups"])
    ? p["groups"].map((g: any) => ({
        ...g,
        requirements: (g.requirements ?? []).map((r: any) => {
          const { sourceText: _omitSource, ...req } = r;
          return {
            ...req,
            courses: (r.courses ?? []).map((c: any) => ({ ...c, grade: null })),
          };
        }),
      }))
    : undefined;
  return groups ? { ...rest, groups } : rest;
}

