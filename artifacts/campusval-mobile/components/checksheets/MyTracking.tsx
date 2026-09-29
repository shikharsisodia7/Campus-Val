import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { entrySummary, type ChecksheetTracking, type DegreeChecksheetDocument, type TrackingEntry } from '@workspace/api-client-react';
import { canPlaceAgain, describePlace } from '@/lib/checksheet-rules';
import { markerTarget } from './Previews';
import type { EditorTarget } from './TrackingEditor';
import type { Colors, Styles } from './theme';

/**
 * The student's own tracking for one document: their list, the markers, and
 * anything a replacement set aside. Every document has it, so a PDF or a file
 * with no preview is still usable as a checksheet.
 */
export function MyTracking({
  document,
  tracking,
  edit,
  onPlaceAgain,
  colors,
  styles,
}: {
  document: DegreeChecksheetDocument;
  tracking: ChecksheetTracking;
  edit: (target: EditorTarget) => void;
  onPlaceAgain: (entry: TrackingEntry) => void;
  colors: Colors;
  styles: Styles;
}) {
  const [label, setLabel] = useState('');
  const detached = tracking.entries.filter((entry) => entry.detached);
  const markers = tracking.entries.filter((entry) => entry.anchorType === 'point' && !entry.detached);
  const manual = tracking.entries.filter((entry) => entry.anchorType === 'manual' && !entry.detached);
  const inPlace = tracking.entries.filter(
    (entry) => !entry.detached && entry.anchorType !== 'manual' && entry.anchorType !== 'point',
  ).length;

  const add = () => {
    const name = label.trim();
    if (!name) return;
    const key = tracking.addManual(name);
    setLabel('');
    edit(listTarget(tracking, key, name));
  };

  return (
    <View style={{ gap: 10 }} testID="my-tracking">
      <Text style={styles.cardTitle} accessibilityRole="header">
        My Tracking
      </Text>
      <Text style={styles.small}>
        Your own planning notes for this document. They are saved in CampusVal, only you can see them, and they never change the
        original file.
        {document.inlineTracking ? ' Where this document has a Status or Quarter column, you can also fill it in directly above.' : ''}
      </Text>

      {detached.length > 0 && (
        <View style={[styles.notice, styles.warning]} testID="detached">
          <Text style={[styles.body, styles.strong, styles.warningText]}>
            {detached.length} {detached.length === 1 ? 'entry was' : 'entries were'} made on the previous file
          </Text>
          <Text style={[styles.small, styles.warningText]}>
            The file was replaced, and CampusVal could not confirm that{' '}
            {detached.length === 1 ? 'this entry still belongs' : 'these entries still belong'} in the same place, so{' '}
            {detached.length === 1 ? 'it is' : 'they are'} not shown on the new document. Keep each one in your list
            {detached.some((entry) => canPlaceAgain(entry, document)) ? ', place it on the new document yourself,' : ''} or remove it.
          </Text>
          {detached.map((entry) => {
            const name = describePlace(entry, document);
            return (
              <View key={entry.key} style={{ gap: 6, paddingTop: 8 }}>
                <Text style={[styles.body, styles.warningText]}>
                  <Text style={styles.strong}>{name}</Text> · {entrySummary(entry)}
                </Text>
                <View style={styles.actions}>
                  {canPlaceAgain(entry, document) && (
                    <Pressable
                      style={[styles.button, styles.outline]}
                      onPress={() => onPlaceAgain(entry)}
                      accessibilityRole="button"
                      accessibilityLabel={`Place ${name} on the new document`}
                      testID={`place-again-${entry.key}`}
                    >
                      <Feather name="map-pin" size={15} color={colors.foreground} />
                      <Text style={styles.outlineText}>{entry.anchorType === 'point' ? 'Place on the picture' : 'Place in a cell'}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.button, styles.outline]}
                    onPress={() => tracking.keepAsListEntry(entry.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Keep ${name} in my list`}
                    testID={`keep-${entry.key}`}
                  >
                    <Text style={styles.outlineText}>Keep in my list</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.danger]}
                    onPress={() => tracking.remove(entry.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove the entry for ${name}`}
                  >
                    <Text style={styles.dangerText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {inPlace > 0 && (
        <Text style={styles.small}>
          {inPlace} {inPlace === 1 ? 'entry' : 'entries'} filled in directly in the document above.
        </Text>
      )}

      {markers.length > 0 && (
        <View testID="marker-list">
          <Text style={styles.label}>MARKERS</Text>
          {markers.map((entry) => {
            const name = describePlace(entry, document);
            return (
              <Pressable
                key={entry.key}
                style={styles.entry}
                onPress={() => edit(markerTarget(tracking, entry.key, name))}
                accessibilityRole="button"
                accessibilityLabel={`${name}: ${entrySummary(entry)}. Edit.`}
              >
                <Feather name="map-pin" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.body}>{name}</Text>
                  <Text style={styles.small}>{entrySummary(entry)}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View>
        <Text style={styles.label}>MY LIST</Text>
        {manual.length === 0 && (
          <Text style={styles.small} testID="manual-empty">
            Nothing in your list yet. Add a requirement or course to track it here.
          </Text>
        )}
        {manual.map((entry) => {
          const name = entry.itemLabel ?? 'Tracking entry';
          return (
            <Pressable
              key={entry.key}
              style={styles.entry}
              onPress={() => edit(listTarget(tracking, entry.key, name))}
              accessibilityRole="button"
              accessibilityLabel={`${name}: ${entrySummary(entry)}. Edit.`}
              testID={`entry-${entry.key}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{name}</Text>
                <Text style={styles.small}>
                  {entrySummary(entry)}
                  {entry.note ? ` · ${entry.note}` : ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          );
        })}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={label}
            onChangeText={setLabel}
            onSubmitEditing={add}
            maxLength={200}
            placeholder="Requirement or item"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Requirement or item"
            returnKeyType="done"
            testID="manual-input"
          />
          <Pressable
            style={[styles.button, styles.primary, !label.trim() && styles.disabled]}
            disabled={!label.trim()}
            onPress={add}
            accessibilityRole="button"
            accessibilityLabel="Add to my list"
            accessibilityState={{ disabled: !label.trim() }}
            testID="manual-submit"
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>Add</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function listTarget(tracking: ChecksheetTracking, key: string, name: string): EditorTarget {
  return {
    name,
    field: 'both',
    find: (all) => all.find((candidate) => candidate.key === key),
    renamable: true,
    notes: true,
    onSet: (values, delay) => tracking.change(key, values, delay),
    onRemove: () => tracking.remove(key),
  };
}

export function SaveIndicator({ tracking, colors, styles }: { tracking: ChecksheetTracking; colors: Colors; styles: Styles }) {
  const { status } = tracking.saveState;
  if (status === 'idle') return null;
  const text = status === 'saving' ? 'Saving…' : status === 'error' ? 'Could not save' : status === 'conflict' ? 'Updated' : 'Saved';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite" testID="save-indicator">
      <Text style={[styles.small, status === 'error' && { color: '#B91C1C' }]}>{text}</Text>
      {status === 'error' && (
        <Pressable style={[styles.button, styles.outline]} onPress={tracking.retry} accessibilityRole="button" accessibilityLabel="Try saving again">
          <Feather name="refresh-cw" size={14} color={colors.foreground} />
          <Text style={styles.outlineText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}
