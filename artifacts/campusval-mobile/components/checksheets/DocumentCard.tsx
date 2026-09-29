import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import {
  FORMAT_LABEL,
  checksheetCategoryLabel,
  deleteDegreeChecksheet,
  entrySummary,
  errorMessage,
  formatBytes,
  formatUploadDate,
  programRoleLabel,
  renderStatusLabel,
  replacementSummary,
  safeExternalUrl,
  type DegreeChecksheetDocument,
  type ReplacementResult,
  type TrackingEntry,
} from '@workspace/api-client-react';
import { useChecksheetRender, useChecksheetTracking, useInvalidateChecksheets } from '@/hooks/useChecksheets';
import { UPLOAD_PHASE_LABEL, openOriginal, pickChecksheetFile, replaceChecksheetFile, type UploadPhase } from '@/lib/checksheet-files';
import { trackingHint, trackingWays } from '@/lib/checksheet-rules';
import { EditDetailsSheet, ErrorNote } from './DetailsSheet';
import { MyTracking, SaveIndicator } from './MyTracking';
import { DocPreview, ImagePreview, PdfPreview, SheetPreview, type PreviewProps } from './Previews';
import { TrackingEditor, type EditorTarget } from './TrackingEditor';
import type { Colors, Styles } from './theme';

const ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  pdf: 'file-text',
  xlsx: 'grid',
  xls: 'grid',
  docx: 'file-text',
  png: 'image',
  jpg: 'image',
};

/**
 * One document: what it is, the department's file, and the student's tracking.
 * The tracking lives here, so closing the document never discards an edit.
 */
export function DocumentCard({
  document,
  maxUploadBytes,
  width,
  defaultOpen,
  colors,
  styles,
}: {
  document: DegreeChecksheetDocument;
  maxUploadBytes: number;
  width: number;
  defaultOpen: boolean;
  colors: Colors;
  styles: Styles;
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);
  const [showTracking, setShowTracking] = useState(true);
  const [picking, setPicking] = useState(false);
  const [placingMarker, setPlacingMarker] = useState(false);
  const [relinkKey, setRelinkKey] = useState<string | null>(null);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [details, setDetails] = useState<'rename' | 'edit' | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [working, setWorking] = useState<'open' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaced, setReplaced] = useState<ReplacementResult | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const invalidate = useInvalidateChecksheets();
  const tracking = useChecksheetTracking(document.id, everOpened);
  const preview = useChecksheetRender(document.id, everOpened && document.renderStatus === 'ready');
  const relink = tracking.entries.find((entry) => entry.key === relinkKey && entry.detached) ?? null;
  const ways = trackingWays(document);
  const busy = phase !== 'idle' || working !== null;

  // A picture is fetched with the student's session, renewed whenever the document is opened or replaced.
  useEffect(() => {
    let current = true;
    if (open) void getToken().then((value) => current && setToken(value));
    return () => {
      current = false;
    };
  }, [open, document.sourceVersion, getToken]);

  const toggle = () => {
    const next = !open;
    if (next) {
      setEverOpened(true);
    } else {
      // Anything typed a moment ago is sent before the document is closed.
      void tracking.flush();
      setPicking(false);
      setPlacingMarker(false);
      setRelinkKey(null);
    }
    setOpen(next);
  };

  const open_ = async () => {
    setError(null);
    setWorking('open');
    try {
      await openOriginal(document, getToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The document could not be opened.');
    } finally {
      setWorking(null);
    }
  };

  const replace = async () => {
    setError(null);
    const picked = await pickChecksheetFile(maxUploadBytes);
    if ('cancelled' in picked) return;
    if ('error' in picked) return setError(picked.error);
    const placed = tracking.entries.filter((entry) => !entry.detached && entry.anchorType !== 'manual').length;
    Alert.alert(
      'Replace the file?',
      `“${document.title}” will show ${picked.file.name} instead. Its title and details are kept.` +
        (placed > 0
          ? ` You have ${placed} tracking ${placed === 1 ? 'entry' : 'entries'} placed on this document. Each stays only where the new file is shown to be the same; the rest are kept in My Tracking for you to place.`
          : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          onPress: async () => {
            try {
              await tracking.flush();
              const result = await replaceChecksheetFile(document.id, picked.file, setPhase);
              invalidate(document.id);
              await tracking.reload();
              setReplaced(result.tracking);
            } catch (err) {
              setError(`${errorMessage(err, err instanceof Error ? err.message : 'The file could not be replaced.')} Your previous file was kept.`);
            }
          },
        },
      ],
    );
  };

  const remove = () => {
    Alert.alert(
      'Delete this document?',
      `“${document.title}”, its file and your tracking for it will be deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setWorking('delete');
            try {
              await deleteDegreeChecksheet(document.id);
              invalidate(document.id);
            } catch (err) {
              setError(errorMessage(err, 'The document could not be deleted. Please try again.'));
              setWorking(null);
            }
          },
        },
      ],
    );
  };

  const placeAgain = (entry: TrackingEntry) => {
    setShowTracking(true);
    setPicking(false);
    setPlacingMarker(false);
    setRelinkKey(entry.key);
  };

  const summary = [checksheetCategoryLabel(document.category), document.programName, programRoleLabel(document.programRole), document.school].filter(Boolean);
  const sourceUrl = safeExternalUrl(document.sourceUrl);
  const render = preview.data?.render ?? null;

  const previewProps: PreviewProps | null = render
    ? {
        document,
        render,
        tracking,
        showTracking,
        picking: showTracking && picking && !relink,
        onPicked: () => setPicking(false),
        relink: showTracking ? relink : null,
        onRelinkDone: () => setRelinkKey(null),
        placingMarker: showTracking && placingMarker && !relink,
        onMarkerPlaced: () => setPlacingMarker(false),
        edit: setTarget,
        token,
        width: Math.max(width - 60, 200),
        colors,
        styles,
      }
    : null;

  return (
    <View style={styles.card} testID={`checksheet-card-${document.id}`}>
      <Pressable
        style={styles.cardHeader}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${document.title}. ${summary.join(', ')}. ${formatUploadDate(document.uploadedAt)}.`}
        accessibilityHint={open ? 'Closes the document' : 'Opens the document and your tracking'}
        testID={`checksheet-toggle-${document.id}`}
      >
        <Feather name={ICON[document.sourceFormat] ?? 'file'} size={20} color={colors.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{document.title}</Text>
          <Text style={styles.small}>{summary.join(' · ')}</Text>
          {document.academicYearLabel ? <Text style={styles.small}>{document.academicYearLabel}</Text> : null}
          <Text style={[styles.small, styles.strong]}>{formatUploadDate(document.uploadedAt)}</Text>
          <Text style={styles.small}>
            {document.fileName} · {FORMAT_LABEL[document.sourceFormat]} · {formatBytes(document.fileSize)} · File status:{' '}
            {renderStatusLabel(document)}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
      </Pressable>

      {open && (
        <View style={styles.cardBody}>
          <View style={styles.actions}>
            <Action icon="external-link" label="Open original" onPress={open_} busy={working === 'open'} disabled={busy} colors={colors} styles={styles} testID="open-original" />
            <Action icon="edit-2" label="Rename" onPress={() => setDetails('rename')} disabled={busy} colors={colors} styles={styles} testID="rename" />
            <Action icon="sliders" label="Edit details" onPress={() => setDetails('edit')} disabled={busy} colors={colors} styles={styles} testID="edit-details" />
            <Action icon="refresh-cw" label="Replace" onPress={replace} busy={phase !== 'idle'} disabled={busy} colors={colors} styles={styles} testID="replace" />
            <Action icon="trash-2" label="Delete" onPress={remove} busy={working === 'delete'} disabled={busy} danger colors={colors} styles={styles} testID="delete" />
          </View>
          {phase !== 'idle' && (
            <Text style={styles.small} accessibilityLiveRegion="polite">
              {UPLOAD_PHASE_LABEL[phase]}
            </Text>
          )}
          <ErrorNote message={error} styles={styles} />

          {replaced && (
            <View style={[styles.notice, replaced.detached > 0 && styles.warning]} accessibilityLiveRegion="polite" testID="replaced-note">
              <Text style={[styles.body, replaced.detached > 0 && styles.warningText]}>The file was replaced. {replacementSummary(replaced)}</Text>
              <Pressable style={[styles.button, styles.outline, { alignSelf: 'flex-start' }]} onPress={() => setReplaced(null)} accessibilityRole="button">
                <Text style={styles.outlineText}>Dismiss</Text>
              </Pressable>
            </View>
          )}
          {tracking.notice && (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Text style={styles.body}>{tracking.notice}</Text>
            </View>
          )}

          {sourceUrl && (
            <Text style={styles.small}>
              You recorded where this document came from:{' '}
              <Text style={{ color: colors.primary, textDecorationLine: 'underline' }} accessibilityRole="link" onPress={() => void Linking.openURL(sourceUrl)}>
                {sourceUrl}
              </Text>
            </Text>
          )}

          <Text style={styles.small}>
            The document below is shown as you uploaded it and is never changed. {trackingHint(document)}
          </Text>

          <View style={[styles.actions, { alignItems: 'center' }]}>
            {(ways.inPlace || ways.chooseCell || ways.placeMarker) && (
              <Action
                icon={showTracking ? 'eye-off' : 'eye'}
                label={showTracking ? 'Show original only' : 'Show my tracking'}
                onPress={() => setShowTracking((value) => !value)}
                colors={colors}
                styles={styles}
                testID="toggle-tracking"
              />
            )}
            {showTracking && ways.chooseCell && !relink && (
              <Action
                icon={picking ? 'x' : 'crosshair'}
                label={picking ? 'Cancel' : 'Track a cell'}
                onPress={() => setPicking((value) => !value)}
                colors={colors}
                styles={styles}
                testID="pick-item"
              />
            )}
            {showTracking && ways.placeMarker && !relink && (
              <Action
                icon={placingMarker ? 'x' : 'map-pin'}
                label={placingMarker ? 'Cancel' : 'Add a marker'}
                onPress={() => setPlacingMarker((value) => !value)}
                colors={colors}
                styles={styles}
                testID="add-marker"
              />
            )}
            <SaveIndicator tracking={tracking} colors={colors} styles={styles} />
          </View>

          {picking && !relink && (
            <Text style={[styles.small, styles.strong]} accessibilityLiveRegion="polite">
              Tap the cell you want to track. Its text stays as the department wrote it.
            </Text>
          )}
          {relink && showTracking && (
            <View style={styles.notice} accessibilityLiveRegion="polite" testID="relink-banner">
              <Text style={styles.body}>
                Placing <Text style={styles.strong}>“{relink.itemLabel ?? 'Tracking entry'}”</Text> ({entrySummary(relink)}).{' '}
                {relink.anchorType === 'point'
                  ? 'Tap the place on the picture where it belongs.'
                  : relink.anchorType === 'sheet_cell' || relink.anchorType === 'doc_cell'
                    ? 'Choose “Place here” in the row it belongs to.'
                    : 'Tap the cell it belongs to.'}{' '}
                The document's own text is not changed.
              </Text>
              <Pressable style={[styles.button, styles.outline, { alignSelf: 'flex-start' }]} onPress={() => setRelinkKey(null)} accessibilityRole="button" testID="relink-cancel">
                <Text style={styles.outlineText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {document.renderStatus !== 'ready' ? (
            <View style={styles.notice} testID="no-preview">
              <Text style={styles.body}>{document.renderNoteMessage ?? 'CampusVal could not build a preview of this file. It is stored and you can open the original.'}</Text>
            </View>
          ) : preview.isLoading ? (
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading the document" />
          ) : preview.isError || !previewProps ? (
            <View style={[styles.notice, styles.warning]}>
              <Text style={[styles.body, styles.warningText]}>The preview could not be loaded.</Text>
              <Pressable style={[styles.button, styles.outline, { alignSelf: 'flex-start' }]} onPress={() => void preview.refetch()} accessibilityRole="button">
                <Text style={styles.outlineText}>Try again</Text>
              </Pressable>
            </View>
          ) : render?.kind === 'spreadsheet' ? (
            <SheetPreview {...previewProps} />
          ) : render?.kind === 'document' ? (
            <DocPreview {...previewProps} />
          ) : render?.kind === 'image' ? (
            <ImagePreview {...previewProps} />
          ) : (
            <PdfPreview {...previewProps} />
          )}

          {tracking.isLoading ? (
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your tracking" />
          ) : tracking.isError ? (
            <View style={[styles.notice, styles.warning]}>
              <Text style={[styles.body, styles.warningText]}>Your tracking could not be loaded.</Text>
              <Pressable style={[styles.button, styles.outline, { alignSelf: 'flex-start' }]} onPress={() => void tracking.refetch()} accessibilityRole="button">
                <Text style={styles.outlineText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <MyTracking document={document} tracking={tracking} edit={setTarget} onPlaceAgain={placeAgain} colors={colors} styles={styles} />
          )}
        </View>
      )}

      <TrackingEditor target={target} entries={tracking.entries} onClose={() => setTarget(null)} colors={colors} styles={styles} />
      {details && (
        <EditDetailsSheet document={document} onlyTitle={details === 'rename'} onClose={() => setDetails(null)} colors={colors} styles={styles} />
      )}
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  busy,
  disabled,
  danger,
  colors,
  styles,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  colors: Colors;
  styles: Styles;
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.button, danger ? styles.danger : styles.outline, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      testID={testID}
    >
      {busy ? <ActivityIndicator size="small" color={danger ? '#B91C1C' : colors.foreground} /> : <Feather name={icon} size={15} color={danger ? '#B91C1C' : colors.foreground} />}
      <Text style={danger ? styles.dangerText : styles.outlineText}>{label}</Text>
    </Pressable>
  );
}
