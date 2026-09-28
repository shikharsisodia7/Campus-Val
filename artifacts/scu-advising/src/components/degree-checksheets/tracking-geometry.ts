/**
 * Where a marker sits on a page or picture.
 *
 * A marker's position is stored as FRACTIONS of the page (0..1 from the
 * top-left corner), not pixels. The page can then be drawn at any zoom, on any
 * screen, and the marker is placed with CSS percentages inside the page's own
 * box: it keeps its place without anything being recalculated.
 */

export interface Fraction {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number): number => Math.round(value * 10_000) / 10_000;

/** A click or tap on the page, in viewport pixels -> a position on the page. */
export function pointToFraction(clientX: number, clientY: number, box: Box): Fraction | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  return {
    x: round(clamp((clientX - box.left) / box.width)),
    y: round(clamp((clientY - box.top) / box.height)),
  };
}

/** A position on the page -> pixels inside a page drawn at this size. */
export function fractionToPixels(fraction: Fraction, size: { width: number; height: number }): { left: number; top: number } {
  return { left: fraction.x * size.width, top: fraction.y * size.height };
}

/** CSS that places a marker; identical at every zoom. */
export function fractionToStyle(fraction: Fraction): { left: string; top: string } {
  return { left: `${round(clamp(fraction.x)) * 100}%`, top: `${round(clamp(fraction.y)) * 100}%` };
}

/** Moves a marker by a step (for the arrow controls), staying on the page. */
export function nudge(fraction: Fraction, dx: number, dy: number): Fraction {
  return { x: round(clamp(fraction.x + dx)), y: round(clamp(fraction.y + dy)) };
}

/**
 * Where a marker added without a click should go: down the left margin, below
 * the markers already there, so a new one never lands on top of another.
 */
export function nextFreePosition(existing: Fraction[]): Fraction {
  const x = 0.06;
  const step = 0.06;
  for (let i = 0; i < 15; i++) {
    const y = round(0.06 + i * step);
    if (!existing.some((p) => Math.abs(p.x - x) < 0.03 && Math.abs(p.y - y) < 0.03)) return { x, y };
  }
  return { x, y: 0.06 };
}

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

export function zoomIn(zoom: number): number {
  return ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
}

export function zoomOut(zoom: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001) ?? ZOOM_STEPS[0]!;
}

/**
 * The width a page is drawn at: it fills the space available at 100%, and the
 * zoom multiplies that. A page narrower than the space is never stretched
 * beyond its natural size at 100%.
 */
export function pageDisplayWidth(naturalWidth: number, availableWidth: number, zoom: number): number {
  const fit = availableWidth > 0 ? Math.min(availableWidth, naturalWidth * 1.6) : naturalWidth;
  return Math.max(120, Math.round(fit * zoom));
}
