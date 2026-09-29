/**
 * A department's document on a phone.
 *
 * What the department wrote is shown as plain text and cannot be edited. What
 * is the student's is marked "MY TRACKING" and is offered only where the
 * document left room for it, or on a cell the student chose. Every piece of
 * text is a Text element: nothing from a file is ever rendered as markup.
 */
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import {
  canHold,
  cellKey,
  entriesByPlace,
  entrySummary,
  itemKey,
  safeExternalUrl,
  sheetRowName,
  termShortLabel,
  type ChecksheetDocBlock,
  type ChecksheetDocRun,
  type ChecksheetSheet,
  type ChecksheetTracking,
  type DegreeChecksheetDocument,
  type DegreeChecksheetRender,
  type TrackingEntry,
} from '@workspace/api-client-react';
import { fitPicture, ROW_NUMBER_WIDTH, sheetGrid, tableCellText, tableRowName, tableWidths, touchToFraction } from '@/lib/checksheet-layout';
import { originalFileUrl, pdfPageImageUrl } from '@/lib/checksheet-files';
import { Choice, MineBox, type EditorTarget } from './TrackingEditor';
import type { Colors, Styles } from './theme';

export interface PreviewProps {
  document: DegreeChecksheetDocument;
  render: DegreeChecksheetRender;
  tracking: ChecksheetTracking;
  /** Off shows the source alone, exactly as uploaded. */
  showTracking: boolean;
  /** True while the student is choosing a cell to track. */
  picking: boolean;
  onPicked: () => void;
  /** A detached entry the student is putting back. */
  relink: TrackingEntry | null;
  onRelinkDone: () => void;
  /** True while the student is choosing where a new marker goes. */
  placingMarker: boolean;
  onMarkerPlaced: () => void;
  edit: (target: EditorTarget) => void;
  /** The student's session token, for the picture itself. */
  token: string | null;
  width: number;
  colors: Colors;
  styles: Styles;
}

const PLACE = 'Place here';

function PlaceHere({ name, onPress, styles, testID }: { name: string; onPress: () => void; styles: Styles; testID: string }) {
  return (
    <Pressable
      style={[styles.button, styles.primary, { paddingHorizontal: 8 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Place the entry here, for ${name}`}
      testID={testID}
    >
      <Feather name="map-pin" size={14} color="#FFFFFF" />
      <Text style={styles.primaryText}>{PLACE}</Text>
    </Pressable>
  );
}

// ─── spreadsheet ─────────────────────────────────────────────────────────────

export function SheetPreview(props: PreviewProps) {
  const { render, styles } = props;
  const sheets = render.sheets ?? [];
  const [active, setActive] = useState(0);
  const index = Math.min(active, sheets.length - 1);
  const sheet = sheets[index];
  if (!sheet) return null;

  return (
    <View style={{ gap: 8 }}>
      {sheets.length > 1 && (
        <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Worksheets">
          {sheets.map((s, i) => (
            <Choice
              key={s.index}
              label={`${s.name}${s.visibility === 'hidden' ? ' (hidden in Excel)' : ''}${s.rows.length === 0 ? ' (empty)' : ''}`}
              selected={i === index}
              onPress={() => setActive(i)}
              styles={styles}
              testID={`sheet-tab-${s.index}`}
            />
          ))}
        </View>
      )}
      {sheet.rows.length === 0 ? (
        <Text style={styles.small}>This worksheet is empty in the uploaded file.</Text>
      ) : (
        <Grid {...props} sheet={sheet} position={index} />
      )}
      {(render.warnings ?? []).includes('calculated_cells_not_shown') && (
        <Text style={styles.small} testID="calculated-note">
          Some cells of this spreadsheet hold an error value such as #N/A, which a formula shows when it has nothing to list. CampusVal
          does not run formulas, so those cells are left empty here. Every other formula shows the result saved in the file. Open the
          original to see the spreadsheet as it is.
        </Text>
      )}
    </View>
  );
}

function Grid({ sheet, position, tracking, showTracking, picking, onPicked, relink, onRelinkDone, edit, styles, document }: PreviewProps & { sheet: ChecksheetSheet; position: number }) {
  const grid = useMemo(() => sheetGrid(sheet, showTracking), [sheet, showTracking]);
  const entries = useMemo(() => entriesByPlace(tracking.entries), [tracking.entries]);
  const placingCell = relink?.anchorType === 'sheet_cell';
  const placingItem = relink?.anchorType === 'sheet_item';

  return (
    <ScrollView
      horizontal
      style={styles.grid}
      accessibilityLabel={`${document.title}, ${sheet.name}. A copy of the uploaded workbook. Scroll sideways to read every column.`}
      testID="sheet-grid"
    >
      <View style={{ width: grid.totalWidth + ROW_NUMBER_WIDTH }}>
        {grid.rows.map((row) => (
          <View key={row.r} style={styles.gridRow}>
            <View style={[styles.rowNumber, { width: ROW_NUMBER_WIDTH }]} accessible={false} importantForAccessibility="no">
              <Text style={styles.rowNumberText}>{row.r + 1}</Text>
            </View>
            {row.boxes.map((box) => {
              const cells = sheet.rows.find((candidate) => candidate.r === box.r)?.cells ?? [];
              if (box.tracking) {
                const anchor = { sheet: position, row: box.r, col: box.c };
                const entry = entries.get(cellKey('sheet_cell', anchor));
                const name = sheetRowName(cells, box.r, box.c, grid.studentColumns);
                const field = box.tracking;
                const target = placingCell && relink && !entry && canHold(field, relink);
                return (
                  <View key={box.c} style={[styles.box, { width: box.width }]} testID={`cell-${position}-${box.r}-${box.c}`}>
                    {target && relink ? (
                      <PlaceHere
                        name={name}
                        styles={styles}
                        testID={`place-here-${position}-${box.r}-${box.c}`}
                        onPress={() => {
                          tracking.placeInCell(relink.key, anchor, field);
                          onRelinkDone();
                        }}
                      />
                    ) : (
                      <MineBox
                        entry={entry}
                        name={name}
                        styles={styles}
                        testID={`mine-${position}-${box.r}-${box.c}`}
                        onPress={() =>
                          edit({
                            name,
                            field,
                            find: (all) => entriesByPlace(all).get(cellKey('sheet_cell', anchor)),
                            onSet: (values) => tracking.setCell('sheet_cell', anchor, field, values),
                          })
                        }
                      />
                    )}
                  </View>
                );
              }

              const text = box.text.trim();
              const item = { sheet: position, row: box.r, col: box.c };
              const chosen = showTracking && text ? entries.get(itemKey('sheet_item', item)) : undefined;
              const pickable = (picking || placingItem) && text !== '' && !chosen;
              const content = (
                <>
                  <Text
                    style={[
                      styles.boxText,
                      box.bold && styles.boxBold,
                      box.italic && { fontStyle: 'italic' },
                      { textAlign: box.align },
                    ]}
                  >
                    {box.text}
                  </Text>
                  {chosen && (
                    <View style={{ marginTop: 6 }}>
                      <MineBox
                        entry={chosen}
                        name={text.slice(0, 120)}
                        styles={styles}
                        testID={`item-${position}-${box.r}-${box.c}`}
                        onPress={() =>
                          edit({
                            name: text.slice(0, 120),
                            field: 'both',
                            find: (all) => all.find((candidate) => candidate.key === chosen.key),
                            notes: true,
                            onSet: (values, delay) => tracking.change(chosen.key, values, delay),
                            onRemove: () => tracking.remove(chosen.key),
                          })
                        }
                      />
                    </View>
                  )}
                </>
              );
              const boxStyle = [styles.box, box.filled && styles.boxFilled, pickable && styles.boxPickable, { width: box.width }];
              if (!pickable) {
                return (
                  <View key={box.c} style={boxStyle}>
                    {content}
                  </View>
                );
              }
              return (
                <Pressable
                  key={box.c}
                  style={boxStyle}
                  accessibilityRole="button"
                  accessibilityLabel={`${placingItem ? 'Place the entry on' : 'Track'} ${text.slice(0, 120)}`}
                  onPress={() => {
                    if (placingItem && relink) {
                      tracking.placeInCell(relink.key, item, null);
                      onRelinkDone();
                      return;
                    }
                    tracking.addItem('sheet_item', item, text.slice(0, 200));
                    onPicked();
                  }}
                >
                  {content}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Word document ───────────────────────────────────────────────────────────

function Runs({ runs, colors, styles, base }: { runs: ChecksheetDocRun[] | undefined; colors: Colors; styles: Styles; base?: object }) {
  return (
    <Text style={[styles.body, base]}>
      {(runs ?? []).map((run, i) => {
        const href = safeExternalUrl(run.href);
        return (
          <Text
            key={i}
            style={[
              run.bold && styles.boxBold,
              run.italic && { fontStyle: 'italic' as const },
              (run.underline || href) && { textDecorationLine: 'underline' as const },
              href ? { color: colors.primary } : null,
            ]}
            {...(href
              ? { accessibilityRole: 'link' as const, onPress: () => void Linking.openURL(href), accessibilityHint: 'Opens in your browser' }
              : {})}
          >
            {run.text}
          </Text>
        );
      })}
    </Text>
  );
}

const HEADING_SIZE = [20, 18, 16, 15, 14, 14];

export function DocPreview(props: PreviewProps) {
  const { render, document, colors, styles } = props;
  const blocks = render.blocks ?? [];
  return (
    <View style={[styles.grid, { padding: 12, gap: 10 }]} accessibilityLabel={`${document.title}, document`} testID="doc-preview">
      {blocks.map((block, index) => (
        <Block key={index} {...props} block={block} index={index} colors={colors} />
      ))}
    </View>
  );
}

function Block(props: PreviewProps & { block: ChecksheetDocBlock; index: number }) {
  const { block, colors, styles, document } = props;
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level ?? 1, 1), 6);
      return (
        <View accessibilityRole="header">
          <Runs runs={block.runs} colors={colors} styles={styles} base={{ fontFamily: 'Inter_700Bold', fontSize: HEADING_SIZE[level - 1] }} />
        </View>
      );
    }
    case 'paragraph':
      return <Runs runs={block.runs} colors={colors} styles={styles} />;
    case 'list-item':
      return (
        <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 8 + Math.min(block.depth ?? 0, 8) * 16 }}>
          <Text style={styles.body}>{block.ordered ? '–' : '•'}</Text>
          <View style={{ flex: 1 }}>
            <Runs runs={block.runs} colors={colors} styles={styles} />
          </View>
        </View>
      );
    case 'table':
      return <DocTable {...props} />;
    case 'image':
      return block.mime && block.data && /^[A-Za-z0-9+/=]+$/.test(block.data) ? (
        <Image
          source={{ uri: `data:${block.mime};base64,${block.data}` }}
          style={{ width: '100%', height: 200 }}
          contentFit="contain"
          accessibilityLabel={block.alt || `Picture in ${document.title}`}
        />
      ) : null;
    case 'image-omitted':
      return (
        <Text style={styles.small}>
          A picture in this document is not shown in the preview{block.alt ? ` (“${block.alt}”)` : ''}. Open the original file to see it.
        </Text>
      );
    default:
      return null;
  }
}

function DocTable({ block, index, tracking, showTracking, picking, onPicked, relink, onRelinkDone, edit, colors, styles }: PreviewProps & { block: ChecksheetDocBlock; index: number }) {
  const rows = block.rows ?? [];
  const studentColumns = (block.tracking?.columns ?? []).map((column) => column.c);
  const offered = new Map((block.tracking?.cells ?? []).map((cell) => [`${cell.r}:${cell.c}`, cell]));
  const widths = tableWidths(rows, studentColumns, showTracking);
  const entries = entriesByPlace(tracking.entries);
  const placingCell = relink?.anchorType === 'doc_cell';
  const placingItem = relink?.anchorType === 'doc_item';

  return (
    <ScrollView horizontal style={[styles.grid, { borderRadius: 4 }]} testID={`doc-table-${index}`}>
      <View>
        {rows.map((row, r) => {
          const name = tableRowName(row, r, studentColumns);
          let c = 0;
          return (
            <View key={r} style={styles.gridRow}>
              {row.map((cell, position) => {
                const column = c;
                const span = Math.max(1, cell.colSpan ?? 1);
                let width = 0;
                for (let i = 0; i < span; i++) width += widths[column + i] ?? widths[position] ?? 120;
                c += span;
                const text = tableCellText(cell);
                const slot = showTracking && text === '' ? offered.get(`${r}:${position}`) : undefined;
                if (slot) {
                  const anchor = { block: index, row: r, col: position };
                  const entry = entries.get(cellKey('doc_cell', anchor));
                  const target = placingCell && relink && !entry && canHold(slot.field, relink);
                  return (
                    <View key={position} style={[styles.box, { width }]} testID={`doc-cell-${index}-${r}-${position}`}>
                      {target && relink ? (
                        <PlaceHere
                          name={name}
                          styles={styles}
                          testID={`doc-place-here-${index}-${r}-${position}`}
                          onPress={() => {
                            tracking.placeInCell(relink.key, anchor, slot.field);
                            onRelinkDone();
                          }}
                        />
                      ) : (
                        <MineBox
                          entry={entry}
                          name={name}
                          styles={styles}
                          onPress={() =>
                            edit({
                              name,
                              field: slot.field,
                              find: (all) => entriesByPlace(all).get(cellKey('doc_cell', anchor)),
                              onSet: (values) => tracking.setCell('doc_cell', anchor, slot.field, values),
                            })
                          }
                        />
                      )}
                    </View>
                  );
                }
                const item = { block: index, row: r, col: position };
                const chosen = showTracking && text ? entries.get(itemKey('doc_item', item)) : undefined;
                const pickable = (picking || placingItem) && text !== '' && !chosen;
                const content = (
                  <>
                    <Runs runs={cell.runs} colors={colors} styles={styles} base={cell.header ? { fontFamily: 'Inter_600SemiBold' } : undefined} />
                    {chosen && (
                      <View style={{ marginTop: 6 }}>
                        <MineBox
                          entry={chosen}
                          name={text.slice(0, 120)}
                          styles={styles}
                          onPress={() =>
                            edit({
                              name: text.slice(0, 120),
                              field: 'both',
                              find: (all) => all.find((candidate) => candidate.key === chosen.key),
                              notes: true,
                              onSet: (values, delay) => tracking.change(chosen.key, values, delay),
                              onRemove: () => tracking.remove(chosen.key),
                            })
                          }
                        />
                      </View>
                    )}
                  </>
                );
                const boxStyle = [styles.box, cell.header && styles.boxFilled, pickable && styles.boxPickable, { width }];
                return pickable ? (
                  <Pressable
                    key={position}
                    style={boxStyle}
                    accessibilityRole="button"
                    accessibilityLabel={`${placingItem ? 'Place the entry on' : 'Track'} ${text.slice(0, 120)}`}
                    onPress={() => {
                      if (placingItem && relink) {
                        tracking.placeInCell(relink.key, item, null);
                        onRelinkDone();
                        return;
                      }
                      tracking.addItem('doc_item', item, text.slice(0, 200));
                      onPicked();
                    }}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View key={position} style={boxStyle}>
                    {content}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── picture ─────────────────────────────────────────────────────────────────

const markerLabel = (entry: TrackingEntry) => termShortLabel(entry.term, entry.termYear) ?? (entry.status ? entry.status[0]!.toUpperCase() : '•');

export function ImagePreview({ document, render, tracking, showTracking, relink, onRelinkDone, placingMarker, onMarkerPlaced, edit, token, width, colors, styles }: PreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const size = fitPicture({ width: render.width ?? 0, height: render.height ?? 0 }, width, zoom);
  const markers = showTracking ? tracking.entries.filter((entry) => entry.anchorType === 'point' && !entry.detached) : [];
  const placing = placingMarker || relink?.anchorType === 'point';

  const onLayout = (event: LayoutChangeEvent) => setBox(event.nativeEvent.layout);
  const place = (event: GestureResponderEvent) => {
    const at = touchToFraction({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, box);
    if (!at) return;
    if (relink?.anchorType === 'point') {
      tracking.movePoint(relink.key, { page: 0, ...at });
      onRelinkDone();
      return;
    }
    const key = tracking.addPoint({ page: 0, ...at }, {});
    onMarkerPlaced();
    edit(markerTarget(tracking, key, 'Marker on the picture'));
  };

  if (!token) return <Text style={styles.small}>Sign in again to see this picture.</Text>;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.outline, zoom <= 1 && styles.disabled]}
          disabled={zoom <= 1}
          onPress={() => setZoom((z) => Math.max(1, z - 0.5))}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Feather name="zoom-out" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.body, { alignSelf: 'center' }]} accessibilityLabel={`Zoom ${Math.round(zoom * 100)} percent`}>
          {Math.round(zoom * 100)}%
        </Text>
        <Pressable
          style={[styles.button, styles.outline, zoom >= 4 && styles.disabled]}
          disabled={zoom >= 4}
          onPress={() => setZoom((z) => Math.min(4, z + 0.5))}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Feather name="zoom-in" size={18} color={colors.foreground} />
        </Pressable>
      </View>
      {placing && (
        <Text style={[styles.small, styles.strong]} accessibilityLiveRegion="polite">
          Tap the place on the picture where the marker belongs.
        </Text>
      )}
      <ScrollView horizontal style={styles.grid} testID="image-preview">
        <ScrollView nestedScrollEnabled style={{ maxHeight: 520 }}>
          <Pressable
            onLayout={onLayout}
            onPress={placing ? place : undefined}
            disabled={!placing}
            style={{ width: size.width, height: size.height }}
            accessibilityRole={placing ? 'button' : 'image'}
            accessibilityLabel={placing ? 'The picture. Tap where the marker belongs.' : `${document.title}, picture`}
          >
            <Image
              source={{ uri: `${originalFileUrl(document.id)}?v=${document.sourceVersion}`, headers: { Authorization: `Bearer ${token}` } }}
              style={{ width: size.width, height: size.height }}
              contentFit="fill"
              cachePolicy="none"
              accessible={false}
            />
            {markers.map((entry) => (
              <Pressable
                key={entry.key}
                style={[styles.marker, { left: (entry.anchor.x ?? 0) * size.width, top: (entry.anchor.y ?? 0) * size.height }]}
                onPress={() => edit(markerTarget(tracking, entry.key, 'Marker on the picture'))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`My tracking marker: ${entrySummary(entry)}`}
                testID={`marker-${entry.key}`}
              >
                <Text style={styles.markerText}>{markerLabel(entry)}</Text>
              </Pressable>
            ))}
          </Pressable>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

/** The editor for a marker, read fresh each time it opens. */
export function markerTarget(tracking: ChecksheetTracking, key: string, fallback: string): EditorTarget {
  const entry = tracking.entries.find((candidate) => candidate.key === key);
  return {
    name: entry?.itemLabel ?? fallback,
    field: 'both',
    find: (all) => all.find((candidate) => candidate.key === key),
    notes: true,
    onSet: (values, delay) => tracking.change(key, values, delay),
    onRemove: () => tracking.remove(key),
  };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/**
 * A PDF, page by page. The app has no PDF renderer of its own, so each page
 * is drawn to a picture by the server (the same PDF.js the web app uses,
 * running once on the server instead of once per browser) and shown here the
 * same way a picture is: zoom, and a marker placed by touch. The original
 * file is never changed; "Open original" still opens the file itself, for
 * reading in the phone's own viewer.
 */
export function PdfPreview({ document, render, tracking, showTracking, relink, onRelinkDone, placingMarker, onMarkerPlaced, edit, token, width, colors, styles }: PreviewProps) {
  const pageCount = render.pages?.length ?? 0;
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const current = render.pages?.[page];
  const size = fitPicture({ width: current?.width ?? 0, height: current?.height ?? 0 }, width, zoom);
  const markers = showTracking ? tracking.entries.filter((entry) => entry.anchorType === 'point' && !entry.detached && (entry.anchor.page ?? 0) === page) : [];
  const placing = placingMarker || relink?.anchorType === 'point';

  const onLayout = (event: LayoutChangeEvent) => setBox(event.nativeEvent.layout);
  const place = (event: GestureResponderEvent) => {
    const at = touchToFraction({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, box);
    if (!at) return;
    if (relink?.anchorType === 'point') {
      tracking.movePoint(relink.key, { page, ...at });
      onRelinkDone();
      return;
    }
    const key = tracking.addPoint({ page, ...at }, {});
    onMarkerPlaced();
    edit(markerTarget(tracking, key, `Marker on page ${page + 1}`));
  };

  if (pageCount === 0) {
    return (
      <Text style={styles.small} testID="pdf-preview">
        This PDF could not be drawn. Use “Open original” to read it, and track it with My Tracking below.
      </Text>
    );
  }
  if (!token) return <Text style={styles.small}>Sign in again to see this document.</Text>;

  return (
    <View style={{ gap: 8 }} testID="pdf-preview">
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.outline, page <= 0 && styles.disabled]}
          disabled={page <= 0}
          onPress={() => setPage((p) => Math.max(0, p - 1))}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
        >
          <Feather name="chevron-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.body, { alignSelf: 'center' }]} accessibilityLabel={`Page ${page + 1} of ${pageCount}`}>
          {page + 1} / {pageCount}
        </Text>
        <Pressable
          style={[styles.button, styles.outline, page >= pageCount - 1 && styles.disabled]}
          disabled={page >= pageCount - 1}
          onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          accessibilityRole="button"
          accessibilityLabel="Next page"
        >
          <Feather name="chevron-right" size={18} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.button, styles.outline, zoom <= 1 && styles.disabled]}
          disabled={zoom <= 1}
          onPress={() => setZoom((z) => Math.max(1, z - 0.5))}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Feather name="zoom-out" size={18} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={[styles.button, styles.outline, zoom >= 3 && styles.disabled]}
          disabled={zoom >= 3}
          onPress={() => setZoom((z) => Math.min(3, z + 0.5))}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Feather name="zoom-in" size={18} color={colors.foreground} />
        </Pressable>
      </View>
      {placing && (
        <Text style={[styles.small, styles.strong]} accessibilityLiveRegion="polite">
          Tap the place on this page where the marker belongs. Turn the page first if it belongs on another one.
        </Text>
      )}
      <ScrollView horizontal style={styles.grid} testID="pdf-page">
        <ScrollView nestedScrollEnabled style={{ maxHeight: 560 }}>
          <Pressable
            key={page}
            onLayout={onLayout}
            onPress={placing ? place : undefined}
            disabled={!placing}
            style={{ width: size.width, height: size.height }}
            accessibilityRole={placing ? 'button' : 'image'}
            accessibilityLabel={placing ? `Page ${page + 1}. Tap where the marker belongs.` : `${document.title}, page ${page + 1} of ${pageCount}`}
          >
            <Image
              source={{ uri: pdfPageImageUrl(document.id, page + 1), headers: { Authorization: `Bearer ${token}` } }}
              style={{ width: size.width, height: size.height }}
              contentFit="fill"
              cachePolicy="none"
              accessible={false}
            />
            {markers.map((entry) => (
              <Pressable
                key={entry.key}
                style={[styles.marker, { left: (entry.anchor.x ?? 0) * size.width, top: (entry.anchor.y ?? 0) * size.height }]}
                onPress={() => edit(markerTarget(tracking, entry.key, `Marker on page ${page + 1}`))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`My tracking marker: ${entrySummary(entry)}`}
                testID={`marker-${entry.key}`}
              >
                <Text style={styles.markerText}>{markerLabel(entry)}</Text>
              </Pressable>
            ))}
          </Pressable>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
