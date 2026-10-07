/**
 * "Add to planning" in the mobile app decides exactly as the web app does: the rules are the
 * shared ones from @workspace/api-client-react, and only which plan to start from and what is
 * sent are the app's own.
 */
import { describe, expect, it } from 'vitest';
import {
  PLANNING_NOTE_MAX,
  courseCodesIn,
  filterCandidates,
  isDuplicateNote,
  mergedNote,
  planContextLabel,
  reliableTarget,
  transferCandidates,
} from '@workspace/api-client-react';
import { defaultPlanId, noteSourceFor, rememberPlan, startingDraft } from './planning-transfer';

const item = (stableKey: string, label: string, courses: string[], kind?: string) => ({
  id: stableKey,
  stableKey,
  label,
  courses,
  customization: kind ? { kind } : null,
});
const groups = [
  {
    id: 'major',
    title: 'Major Requirements — Biology',
    items: [
      item('major:biology#biol-1a', 'BIOL 1A — Cells', ['BIOL 1A']),
      item('major:biology#lab-1', 'Lab one', ['LAB 5']),
      item('major:biology#lab-2', 'Lab two', ['LAB 5']),
      item('major:biology#custom:x', 'My own', [], 'custom'),
    ],
  },
  { id: 'core', title: 'University Core Curriculum', items: [item('university-core:cas#ctw1', 'Critical Thinking & Writing 1', [])] },
];

describe('which plan a transfer goes to', () => {
  const plans = [
    { id: 7, planType: 'tentative' as const },
    { id: 3, planType: 'degree' as const },
  ];
  it('starts from the Degree Plan, never creating one', () => {
    expect(defaultPlanId(plans, null)).toBe(3);
    expect(defaultPlanId([{ id: 9, planType: 'tentative' as const }], null)).toBe(9);
    expect(defaultPlanId([], null)).toBeNull();
  });
  it('remembers the plan last chosen in this session, while it exists', () => {
    rememberPlan(7);
    expect(defaultPlanId(plans)).toBe(7);
    expect(defaultPlanId([{ id: 3, planType: 'degree' as const }])).toBe(3);
  });
  it('names plans as the web app does', () => {
    expect(planContextLabel({ name: 'My plan', planType: 'degree' })).toBe('Degree Plan');
    expect(planContextLabel({ name: 'Finance', planType: 'tentative' })).toBe('Tentative Degree Plan — Finance');
    expect(planContextLabel({ name: 'Tentative Degree Plan (Finance)', planType: 'tentative' })).toBe('Tentative Degree Plan (Finance)');
  });
});

describe('the shared matching rules', () => {
  const candidates = transferCandidates(groups);
  it('offers source requirements only: a My requirement is edited where it is', () => {
    expect(candidates.map((c) => c.item.stableKey)).not.toContain('major:biology#custom:x');
    expect(candidates).toHaveLength(4);
  });
  it('preselects only a requirement a course code belongs to alone', () => {
    expect(courseCodesIn('Take BIOL 1A in the fall')).toEqual(['BIOL 1A']);
    expect(reliableTarget('BIOL 1A in the fall', candidates)?.candidate.item.stableKey).toBe('major:biology#biol-1a');
    expect(reliableTarget('LAB 5 either section', candidates)).toBeNull();
    expect(reliableTarget('see the advisor about the portfolio', candidates)).toBeNull();
  });
  it('searches the student’s own words, not similarity', () => {
    expect(filterCandidates(candidates, 'critical').map((c) => c.item.stableKey)).toEqual(['university-core:cas#ctw1']);
    expect(filterCandidates(candidates, '')).toHaveLength(4);
  });
  it('catches an exact duplicate and appends or replaces', () => {
    expect(isDuplicateNote('Take it  in fall', 'take it in FALL')).toBe(true);
    expect(isDuplicateNote('Take it in fall', 'something new')).toBe(false);
    expect(isDuplicateNote('', 'anything')).toBe(false);
    expect(mergedNote('First', ' Second ', 'append')).toBe('First\nSecond');
    expect(mergedNote('First', 'Second', 'replace')).toBe('Second');
    expect(mergedNote('', 'Only', 'append')).toBe('Only');
  });
});

describe('what is sent', () => {
  it('starts from the words on one line, within what the server keeps', () => {
    const long = `BIOL 1A\n${'x'.repeat(700)}`;
    const draft = startingDraft(long);
    expect(draft.note.startsWith('BIOL 1A x')).toBe(true);
    expect(draft.note).toHaveLength(PLANNING_NOTE_MAX);
    expect(draft.title).toHaveLength(160);
  });
  it('records only which document and a safe pointer, never its content', () => {
    expect(noteSourceFor(12, 'annotation:5')).toEqual({ type: 'DEGREE_CHECKSHEET', documentId: 12, anchor: 'annotation:5' });
    expect(Object.keys(noteSourceFor(12, null)).sort()).toEqual(['anchor', 'documentId', 'type']);
  });
});
