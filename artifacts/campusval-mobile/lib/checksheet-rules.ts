/**
 * What the mobile app offers for a document, decided from what the document
 * is. Kept apart from the screens so it can be tested without a phone.
 */
import type { DegreeChecksheetDocument, TrackingEntry } from '@workspace/api-client-react';

type Kind = Pick<DegreeChecksheetDocument, 'previewKind' | 'inlineTracking'>;

/** Where an entry sits, in words. */
export function describePlace(entry: Pick<TrackingEntry, 'itemLabel' | 'anchorType' | 'anchor'>, document: Pick<DegreeChecksheetDocument, 'previewKind'>): string {
  if (entry.itemLabel) return entry.itemLabel;
  if (entry.anchorType === 'point') {
    return document.previewKind === 'image' ? 'Marker on the picture' : `Marker on page ${(entry.anchor.page ?? 0) + 1}`;
  }
  return 'Tracking entry';
}

/** Whether the current document has a place this detached entry could go back to, on a phone. */
export function canPlaceAgain(entry: Pick<TrackingEntry, 'anchorType'>, document: Kind): boolean {
  if (entry.anchorType === 'sheet_cell') return document.previewKind === 'spreadsheet' && document.inlineTracking;
  if (entry.anchorType === 'sheet_item') return document.previewKind === 'spreadsheet';
  if (entry.anchorType === 'doc_cell') return document.previewKind === 'document' && document.inlineTracking;
  if (entry.anchorType === 'doc_item') return document.previewKind === 'document';
  // A marker can be placed by touch on a picture. PDF pages are not drawn in the mobile app.
  if (entry.anchorType === 'point') return document.previewKind === 'image';
  return false;
}

export interface TrackingWays {
  /** Status and quarter in the document's own columns. */
  inPlace: boolean;
  /** Any cell that says something can be chosen and tracked. */
  chooseCell: boolean;
  /** A marker can be placed by touch. */
  placeMarker: boolean;
  /** The student's own list. Always. */
  myList: true;
}

/**
 * The ways a document can be tracked in the mobile app. What is offered is
 * what the document's format supports, and the screen says no more than this.
 */
export function trackingWays(document: Kind & Pick<DegreeChecksheetDocument, 'renderStatus'>): TrackingWays {
  const ready = document.renderStatus === 'ready';
  const cells = ready && (document.previewKind === 'spreadsheet' || document.previewKind === 'document');
  return {
    inPlace: cells && document.inlineTracking,
    chooseCell: cells,
    placeMarker: ready && document.previewKind === 'image',
    myList: true,
  };
}

/** One sentence telling the student how this document can be tracked here. */
export function trackingHint(document: Kind & Pick<DegreeChecksheetDocument, 'renderStatus'>): string {
  const ways = trackingWays(document);
  if (ways.inPlace) return 'Tap a “My tracking” cell to set your status and quarter. The document itself is never changed.';
  if (ways.chooseCell) return 'This document has no column for you to fill in. Use “Track a cell” to choose an item, or add it to My Tracking.';
  if (ways.placeMarker) return 'Use “Add a marker” and tap the picture, or add items to My Tracking.';
  if (document.previewKind === 'pdf') return 'Open the original to read it, and track items with My Tracking.';
  return 'This file has no preview. Open the original to read it, and track items with My Tracking.';
}
