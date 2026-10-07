import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  PLANNING_NOTE_MAX,
  errorMessage,
  filterCandidates,
  getGetPlanRequirementsQueryKey,
  isDuplicateNote,
  mergedNote,
  planContextLabel,
  reliableTarget,
  transferCandidates,
  useCreateCustomRequirement,
  useGetPlanRequirements,
  useListPlans,
  useSaveRequirementEdit,
  type RequirementGroup,
} from '@workspace/api-client-react';
import { defaultPlanId, noteSourceFor, rememberPlan, startingDraft } from '@/lib/planning-transfer';
import { ErrorNote, SheetFrame } from './DetailsSheet';
import { Choice } from './TrackingEditor';
import type { Colors, Styles } from './theme';

/** What the student is taking from their checksheet, and where in it. */
export interface PlanningTransfer {
  text: string;
  anchor: string | null;
}

/** At most this many requirements are listed at once; the search narrows them. */
const LISTED = 40;

/**
 * "Add to planning" on a phone: the same action as on the web. The student sees what is being
 * taken, chooses the plan it goes to and the requirement it belongs to (preselected only when a
 * course code in the text belongs to exactly one requirement), edits the words, and saves. It is
 * saved as their own My Note (or a My requirement) on that plan, through the same endpoints the
 * web sidebar uses, so it is on the web's Planning Requirements at once. Never a Department Note;
 * the uploaded document is never touched.
 */
export function AddToPlanningSheet({
  document,
  transfer,
  onClose,
  onSaved,
  colors,
  styles,
}: {
  document: { id: number; title: string };
  transfer: PlanningTransfer;
  onClose: () => void;
  /** Called with a short confirmation ("Added to My Note on Degree Plan"). */
  onSaved: (message: string) => void;
  colors: Colors;
  styles: Styles;
}) {
  const queryClient = useQueryClient();
  const { data: planList, isLoading: plansLoading } = useListPlans();
  const plans = useMemo(() => planList?.plans ?? [], [planList]);
  const [planId, setPlanId] = useState<number | null>(null);
  useEffect(() => {
    if (planId === null && plans.length > 0) setPlanId(defaultPlanId(plans));
  }, [planId, plans]);
  const plan = plans.find((p) => p.id === planId) ?? null;

  const requirements = useGetPlanRequirements(planId ?? 0, {
    query: { enabled: planId !== null, queryKey: getGetPlanRequirementsQueryKey(planId ?? 0) },
  });
  const groups: RequirementGroup[] = useMemo(() => requirements.data?.groups ?? [], [requirements.data]);
  const candidates = useMemo(() => transferCandidates(groups), [groups]);

  const start = useMemo(() => startingDraft(transfer.text), [transfer.text]);
  const [mode, setMode] = useState<'note' | 'custom'>('note');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [matchedBy, setMatchedBy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(start.note);
  const [choice, setChoice] = useState<'append' | 'replace'>('append');
  const [customTitle, setCustomTitle] = useState(start.title);
  const [customGroup, setCustomGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A new plan's requirements: preselect only what is certain, and a group for a My requirement.
  useEffect(() => {
    const found = reliableTarget(start.note, candidates);
    setTargetKey(found?.candidate.item.stableKey ?? null);
    setMatchedBy(found?.code ?? null);
    setCustomGroup(groups.find((g) => g.kind === 'major')?.stableKey ?? groups[0]?.stableKey ?? null);
  }, [candidates, groups, start.note]);

  const save = useSaveRequirementEdit();
  const create = useCreateCustomRequirement();
  const busy = save.isPending || create.isPending;

  const target = candidates.find((c) => c.item.stableKey === targetKey) ?? null;
  const existingNote = target?.item.customization?.kind === 'edit' ? (target.item.customization.note ?? '') : '';
  const words = draft.trim();
  const duplicate = isDuplicateNote(existingNote, words) && choice === 'append';
  const merged = mergedNote(existingNote, words, choice);
  const length = mode === 'note' ? merged.length : words.length;
  const tooLong = length > PLANNING_NOTE_MAX;
  const title = customTitle.replace(/\s+/g, ' ').trim();
  const canSave =
    !!plan && !busy && !tooLong && (mode === 'note' ? !!target && words.length > 0 && !duplicate : title.length > 0 && !!customGroup);
  const filtered = filterCandidates(candidates, query);

  const submit = async () => {
    if (!canSave || !plan) return;
    setError(null);
    const noteSource = noteSourceFor(document.id, transfer.anchor);
    try {
      if (mode === 'note') {
        await save.mutateAsync({ id: plan.id, data: { sourceKey: target!.item.stableKey!, note: merged, noteSource } });
      } else {
        await create.mutateAsync({ id: plan.id, data: { groupKey: customGroup!, title, note: words || null, courseCodes: [], ...(words ? { noteSource } : {}) } });
      }
      rememberPlan(plan.id);
      // The same plan queries the web sidebar reads, so nothing keeps a stale copy.
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
      onSaved(`${mode === 'note' ? 'Added to My Note' : 'Added to Planning Requirements'} · ${planContextLabel(plan)}`);
    } catch (err) {
      setError(errorMessage(err, 'It could not be saved. Your plan is unchanged; please try again.'));
    }
  };

  return (
    <SheetFrame title="Add to planning" onClose={onClose} busy={busy} colors={colors} styles={styles}>
      <Text style={styles.small}>Saved as your own note on the plan you choose. It does not change the checksheet, your Workday APR or what SCU requires.</Text>

      <View style={[styles.notice, { marginTop: 12 }]} testID="transfer-source">
        <Text style={[styles.small, styles.strong]}>From {document.title}</Text>
        <Text style={styles.body} numberOfLines={4}>
          {transfer.text.trim() || '(write your note below)'}
        </Text>
      </View>

      <Text style={styles.label}>Plan</Text>
      {plansLoading ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your plans" />
      ) : plans.length === 0 ? (
        <Text style={styles.small} testID="transfer-no-plan">
          You have no plan yet. Open your Degree Plan first; nothing is created for you here.
        </Text>
      ) : (
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Plan">
          {plans.map((p) => (
            <Choice key={p.id} label={planContextLabel(p)} selected={p.id === planId} onPress={() => setPlanId(p.id)} styles={styles} testID={`transfer-plan-${p.id}`} />
          ))}
        </View>
      )}

      <Text style={styles.label}>Add it as</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Add it as">
        <Choice label="My Note on a requirement" selected={mode === 'note'} onPress={() => setMode('note')} styles={styles} testID="transfer-mode-note" />
        <Choice label="Custom Requirement" selected={mode === 'custom'} onPress={() => setMode('custom')} styles={styles} testID="transfer-mode-custom" />
      </View>

      {requirements.isLoading && planId !== null ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading the plan's requirements" style={{ marginTop: 12 }} />
      ) : requirements.isError ? (
        <ErrorNote message="This plan's requirements could not be loaded. Try again in a moment." styles={styles} />
      ) : mode === 'note' ? (
        <>
          <Text style={styles.label}>Planning Requirement</Text>
          {target ? (
            <View style={[styles.notice, { gap: 4 }]} testID="transfer-target">
              <Text style={[styles.body, styles.strong]}>{target.item.label}</Text>
              <Text style={styles.small}>{target.groupTitle}</Text>
              {matchedBy && <Text style={styles.small}>Preselected because {matchedBy} is listed under it. Change it if that is wrong.</Text>}
              <Pressable
                onPress={() => {
                  setTargetKey(null);
                  setMatchedBy(null);
                }}
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: 'center' }}
                testID="transfer-change-target"
              >
                <Text style={[styles.body, { textDecorationLine: 'underline' }]}>Choose a different requirement</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search your Planning Requirements"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Search your Planning Requirements"
                testID="transfer-search"
              />
              <View style={{ marginTop: 8 }} testID="transfer-options">
                {filtered.length === 0 && <Text style={styles.small}>No requirement matches.</Text>}
                {filtered.slice(0, LISTED).map((c) => (
                  <Pressable
                    key={c.item.stableKey}
                    style={styles.entry}
                    onPress={() => setTargetKey(c.item.stableKey!)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.item.label}, ${c.groupTitle}`}
                    testID={`transfer-option-${c.item.stableKey}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{c.item.label}</Text>
                      <Text style={styles.small}>{c.groupTitle}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
                {filtered.length > LISTED && <Text style={styles.small}>{filtered.length - LISTED} more: search to narrow the list.</Text>}
              </View>
            </>
          )}

          {!!existingNote && (
            <View style={[styles.notice, styles.warning, { marginTop: 12, gap: 6 }]} testID="transfer-existing">
              <Text style={[styles.small, styles.strong, styles.warningText]}>This requirement already has a My Note</Text>
              <Text style={[styles.body, styles.warningText]}>{existingNote}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Existing note">
                <Choice label="Add to it" selected={choice === 'append'} onPress={() => setChoice('append')} styles={styles} testID="transfer-append" />
                <Choice label="Replace it" selected={choice === 'replace'} onPress={() => setChoice('replace')} styles={styles} testID="transfer-replace" />
              </View>
              {duplicate && (
                <Text style={[styles.small, styles.strong, styles.warningText]} accessibilityLiveRegion="polite" testID="transfer-duplicate">
                  This text is already in that note. Replace the note, change the text, or cancel.
                </Text>
              )}
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={styles.label}>Title of your requirement</Text>
          <TextInput style={styles.input} value={customTitle} onChangeText={setCustomTitle} maxLength={160} accessibilityLabel="Title of your requirement" testID="transfer-custom-title" />
          <Text style={styles.label}>Under</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Under">
            {groups
              .filter((g) => !!g.stableKey)
              .map((g) => (
                <Choice key={g.stableKey} label={g.title} selected={customGroup === g.stableKey} onPress={() => setCustomGroup(g.stableKey!)} styles={styles} testID={`transfer-group-${g.stableKey}`} />
              ))}
          </View>
          <Text style={[styles.small, { marginTop: 8 }]}>It is marked “My requirement”: yours, not from the Bulletin, and it never counts toward your degree.</Text>
        </>
      )}

      <Text style={styles.label}>My Note (edit it as you like)</Text>
      <TextInput
        style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
        value={draft}
        onChangeText={setDraft}
        multiline
        accessibilityLabel="My Note"
        testID="transfer-note"
      />
      <Text style={[styles.small, { textAlign: 'right' }, tooLong && { color: '#B91C1C' }]} accessibilityLiveRegion="polite">
        {length}/{PLANNING_NOTE_MAX}
        {tooLong ? ' · too long to save' : ''}
      </Text>

      <ErrorNote message={error} styles={styles} />
      <Pressable
        style={[styles.button, styles.primary, { marginTop: 16 }, !canSave && styles.disabled]}
        disabled={!canSave}
        onPress={() => void submit()}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave, busy }}
        testID="transfer-save"
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
        <Text style={styles.primaryText}>{mode === 'note' ? 'Save to My Note' : 'Create requirement'}</Text>
      </Pressable>
    </SheetFrame>
  );
}
