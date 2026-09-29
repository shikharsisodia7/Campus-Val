import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  TRACKING_STATUS_OPTIONS,
  TRACKING_TERM_OPTIONS,
  TYPING_DELAY_MS,
  defaultYearForTerm,
  entrySummary,
  trackingYearOptions,
  type TrackingEntry,
  type TrackingField,
  type TrackingTerm,
  type TrackingValues,
} from '@workspace/api-client-react';
import type { Colors, Styles } from './theme';

export interface EditorTarget {
  /** What the entry is about, in the department's or the student's own words. */
  name: string;
  /** Which values this place holds. A marker, a chosen cell and a list entry hold both. */
  field: TrackingField;
  /** Finds the entry among the document's entries, so the sheet always shows what is saved now. */
  find: (entries: TrackingEntry[]) => TrackingEntry | undefined;
  /** A list entry's name can be changed; a cell's name is the department's. */
  renamable?: boolean;
  /** A marker, a chosen cell and a list entry carry a note. */
  notes?: boolean;
  onSet: (values: Partial<TrackingValues>, delayMs?: number) => void;
  onRemove?: () => void;
}

/**
 * The student's own status and quarter for one item. It is a sheet rather than
 * a control inside the document, because a status list does not fit inside a
 * table cell on a phone. What it saves is exactly what the web app saves.
 */
export function TrackingEditor({
  target,
  entries,
  onClose,
  colors,
  styles,
}: {
  target: EditorTarget | null;
  entries: TrackingEntry[];
  onClose: () => void;
  colors: Colors;
  styles: Styles;
}) {
  const entry = target?.find(entries);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setLabel(entry?.itemLabel ?? '');
    setNote(entry?.note ?? '');
    // Only when another entry is opened: typing must not be overwritten by a save coming back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.name, entry?.key]);

  if (!target) return null;
  const years = trackingYearOptions(new Date(), entry?.termYear);
  const setTerm = (term: TrackingTerm | null) =>
    target.onSet(term ? { term, termYear: entry?.termYear ?? defaultYearForTerm(term) } : { term: null, termYear: null });

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} numberOfLines={2} accessibilityRole="header">
            My tracking
          </Text>
          <Pressable style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Done">
            <Feather name="check" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={[styles.body, styles.strong]}>{target.name}</Text>
          <Text style={styles.small}>
            Your own planning note, saved as you choose. It does not change the original document. Now: {entry ? entrySummary(entry) : 'no status yet'}.
          </Text>

          {target.renamable && (
            <>
              <Text style={styles.label}>Requirement or item</Text>
              <TextInput
                style={styles.input}
                value={label}
                maxLength={200}
                accessibilityLabel="Requirement or item"
                onChangeText={(text) => {
                  setLabel(text);
                  if (text.trim()) target.onSet({ itemLabel: text.trim() }, TYPING_DELAY_MS);
                }}
                onBlur={() => !label.trim() && setLabel(entry?.itemLabel ?? '')}
              />
            </>
          )}

          {target.field !== 'term' && (
            <>
              <Text style={styles.label}>My status</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={`My status for ${target.name}`}>
                <Choice label="No status" selected={!entry?.status} onPress={() => target.onSet({ status: null })} styles={styles} testID="status-none" />
                {TRACKING_STATUS_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    label={option.label}
                    selected={entry?.status === option.value}
                    onPress={() => target.onSet({ status: option.value })}
                    styles={styles}
                    testID={`status-${option.value}`}
                  />
                ))}
              </View>
            </>
          )}

          {target.field !== 'status' && (
            <>
              <Text style={styles.label}>My quarter</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={`My quarter for ${target.name}`}>
                <Choice label="No quarter" selected={!entry?.term} onPress={() => setTerm(null)} styles={styles} testID="term-none" />
                {TRACKING_TERM_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    label={option.label}
                    selected={entry?.term === option.value}
                    onPress={() => setTerm(option.value)}
                    styles={styles}
                    testID={`term-${option.value}`}
                  />
                ))}
              </View>
              {entry?.term ? (
                <>
                  <Text style={styles.label}>Year</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {years.map((year) => (
                      <Choice
                        key={year}
                        label={String(year)}
                        selected={entry.termYear === year}
                        onPress={() => target.onSet({ term: entry.term, termYear: year })}
                        styles={styles}
                        testID={`year-${year}`}
                      />
                    ))}
                  </ScrollView>
                </>
              ) : null}
            </>
          )}

          {target.notes && (
            <>
              <Text style={styles.label}>Note</Text>
              <TextInput
                style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]}
                value={note}
                multiline
                maxLength={500}
                accessibilityLabel={`Note for ${target.name}`}
                onChangeText={(text) => {
                  setNote(text);
                  target.onSet({ note: text.trim() ? text : null }, TYPING_DELAY_MS);
                }}
              />
            </>
          )}

          {target.onRemove && entry ? (
            <Pressable
              style={[styles.button, styles.danger, { marginTop: 24 }]}
              onPress={() => {
                target.onRemove?.();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove the entry for ${target.name}`}
            >
              <Feather name="trash-2" size={16} color="#B91C1C" />
              <Text style={styles.dangerText}>Remove this entry</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function Choice({
  label,
  selected,
  onPress,
  styles,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: Styles;
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** A student's cell as it is drawn in the document: marked as theirs, in words. */
export function MineBox({
  entry,
  name,
  onPress,
  styles,
  testID,
}: {
  entry: TrackingEntry | undefined;
  name: string;
  onPress: () => void;
  styles: Styles;
  testID?: string;
}) {
  const has = !!(entry?.status || entry?.term);
  return (
    <Pressable
      style={styles.mine}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`My tracking for ${name}: ${entry ? entrySummary(entry) : 'no status yet'}. Does not change the original document.`}
      testID={testID}
    >
      <Text style={styles.mineTag}>MY TRACKING</Text>
      <Text style={has ? styles.mineValue : styles.mineEmpty}>{has && entry ? entrySummary(entry) : 'Tap to set'}</Text>
    </Pressable>
  );
}
