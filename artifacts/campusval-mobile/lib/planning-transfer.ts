/**
 * "Add to planning" in the mobile app: which plan a note goes to, and what is sent.
 * The matching rules themselves (which requirement is certain, duplicates, appending)
 * live in @workspace/api-client-react and are the web app's own, so both apps decide
 * the same way. Nothing here creates a plan.
 */
import { PLANNING_NOTE_MAX, PLANNING_TITLE_MAX, type AcademicPlan } from '@workspace/api-client-react';

/** The plan the student last chose in this session, so a second transfer starts from it. */
let lastChosenPlanId: number | null = null;
export const rememberPlan = (planId: number) => {
  lastChosenPlanId = planId;
};

/** The plan to start from: the one last chosen, else the Degree Plan, else the first plan there is. Never a new one. */
export function defaultPlanId(plans: Pick<AcademicPlan, 'id' | 'planType'>[], remembered: number | null = lastChosenPlanId): number | null {
  if (remembered !== null && plans.some((p) => p.id === remembered)) return remembered;
  return plans.find((p) => p.planType === 'degree')?.id ?? plans[0]?.id ?? null;
}

/** The text a transfer starts from, one line, within what the server keeps. */
export function startingDraft(text: string): { note: string; title: string } {
  const clean = text.trim().replace(/\s+/g, ' ');
  return { note: clean.slice(0, PLANNING_NOTE_MAX), title: clean.slice(0, PLANNING_TITLE_MAX) };
}

/** Where the note came from: the student's own document, and a safe pointer inside it. Provenance only. */
export function noteSourceFor(documentId: number, anchor: string | null) {
  return { type: 'DEGREE_CHECKSHEET' as const, documentId, anchor };
}
