/**
 * A marker keeps its place on the page at any zoom and any screen size,
 * because its position is a fraction of the page and never a pixel count.
 */
import { describe, expect, it } from "vitest";
import {
  ZOOM_STEPS,
  fractionToPixels,
  fractionToStyle,
  nextFreePosition,
  nudge,
  pageDisplayWidth,
  pointToFraction,
  zoomIn,
  zoomOut,
} from "./tracking-geometry";

describe("pointToFraction", () => {
  const box = { left: 100, top: 50, width: 600, height: 800 };

  it("turns a click into a position on the page", () => {
    expect(pointToFraction(100, 50, box)).toEqual({ x: 0, y: 0 });
    expect(pointToFraction(700, 850, box)).toEqual({ x: 1, y: 1 });
    expect(pointToFraction(400, 450, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointToFraction(250, 250, box)).toEqual({ x: 0.25, y: 0.25 });
  });

  it("keeps a click just outside the page on the page", () => {
    expect(pointToFraction(40, 10, box)).toEqual({ x: 0, y: 0 });
    expect(pointToFraction(9_999, 9_999, box)).toEqual({ x: 1, y: 1 });
  });

  it("rounds to four decimals, which is finer than a pixel", () => {
    expect(pointToFraction(233.333333, 316.666666, box)).toEqual({ x: 0.2222, y: 0.3333 });
  });

  it("refuses a page that has no size yet", () => {
    expect(pointToFraction(10, 10, { left: 0, top: 0, width: 0, height: 800 })).toBeNull();
    expect(pointToFraction(10, 10, { left: 0, top: 0, width: 600, height: Number.NaN })).toBeNull();
  });
});

describe("the same marker at different zooms and sizes", () => {
  // A marker placed on a Letter page shown 600px wide...
  const small = { left: 0, top: 0, width: 600, height: 776 };
  const placed = pointToFraction(150, 388, small)!;

  it("is the same fraction however large the page is drawn", () => {
    expect(placed).toEqual({ x: 0.25, y: 0.5 });
    // ...clicked at the same spot on the page shown at 200%, then on a phone.
    expect(pointToFraction(300, 776, { left: 0, top: 0, width: 1200, height: 1552 })).toEqual(placed);
    expect(pointToFraction(80, 207, { left: 0, top: 0, width: 320, height: 414 })).toEqual(placed);
  });

  it("is also the same when the page has been scrolled or moved on screen", () => {
    expect(pointToFraction(150 + 37, 388 - 1200, { left: 37, top: -1200, width: 600, height: 776 })).toEqual(placed);
  });

  it("lands on the same part of the page at every size", () => {
    expect(fractionToPixels(placed, { width: 600, height: 776 })).toEqual({ left: 150, top: 388 });
    expect(fractionToPixels(placed, { width: 1200, height: 1552 })).toEqual({ left: 300, top: 776 });
    expect(fractionToPixels(placed, { width: 320, height: 414 })).toEqual({ left: 80, top: 207 });
  });

  it("round-trips: place, draw at another size, read back", () => {
    for (const size of [
      { width: 320, height: 414 },
      { width: 612, height: 792 },
      { width: 1836, height: 2376 },
    ]) {
      for (const point of [
        { x: 0.1, y: 0.9 },
        { x: 0.3333, y: 0.6667 },
        { x: 0.999, y: 0.001 },
      ]) {
        const pixels = fractionToPixels(point, size);
        const back = pointToFraction(pixels.left, pixels.top, { left: 0, top: 0, ...size })!;
        expect(back.x).toBeCloseTo(point.x, 3);
        expect(back.y).toBeCloseTo(point.y, 3);
      }
    }
  });

  it("is placed with percentages, so nothing is recalculated when the page resizes", () => {
    expect(fractionToStyle(placed)).toEqual({ left: "25%", top: "50%" });
    expect(fractionToStyle({ x: 0.102, y: 0.3333 })).toEqual({ left: "10.2%", top: "33.33%" });
    expect(fractionToStyle({ x: -2, y: 9 })).toEqual({ left: "0%", top: "100%" });
  });
});

describe("nudge", () => {
  it("moves by a step and stays on the page", () => {
    expect(nudge({ x: 0.5, y: 0.5 }, 0.01, 0)).toEqual({ x: 0.51, y: 0.5 });
    expect(nudge({ x: 0.5, y: 0.5 }, 0, -0.01)).toEqual({ x: 0.5, y: 0.49 });
    expect(nudge({ x: 0.995, y: 0.002 }, 0.01, -0.01)).toEqual({ x: 1, y: 0 });
  });

  it("does not drift after many steps there and back", () => {
    let at = { x: 0.3, y: 0.7 };
    for (let i = 0; i < 25; i++) at = nudge(at, 0.01, 0.01);
    for (let i = 0; i < 25; i++) at = nudge(at, -0.01, -0.01);
    expect(at).toEqual({ x: 0.3, y: 0.7 });
  });
});

describe("nextFreePosition", () => {
  it("starts near the top-left margin", () => {
    expect(nextFreePosition([])).toEqual({ x: 0.06, y: 0.06 });
  });

  it("goes below the markers already there instead of on top of them", () => {
    const first = nextFreePosition([]);
    const second = nextFreePosition([first]);
    const third = nextFreePosition([first, second]);
    expect(second).toEqual({ x: 0.06, y: 0.12 });
    expect(third).toEqual({ x: 0.06, y: 0.18 });
  });

  it("ignores markers elsewhere on the page", () => {
    expect(nextFreePosition([{ x: 0.8, y: 0.06 }])).toEqual({ x: 0.06, y: 0.06 });
  });
});

describe("zoom", () => {
  it("steps up and down through fixed levels and stops at the ends", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1.1)).toBe(1);
    expect(zoomIn(ZOOM_STEPS[ZOOM_STEPS.length - 1]!)).toBe(3);
    expect(zoomOut(ZOOM_STEPS[0])).toBe(0.5);
  });

  it("fits the page to the space at 100% and scales from there", () => {
    expect(pageDisplayWidth(612, 900, 1)).toBe(900);
    expect(pageDisplayWidth(612, 900, 2)).toBe(1800);
    expect(pageDisplayWidth(612, 340, 1)).toBe(340);
    expect(pageDisplayWidth(612, 340, 1.5)).toBe(510);
  });

  it("does not blow a small page up to fill a very wide screen", () => {
    expect(pageDisplayWidth(612, 1500, 1)).toBe(979);
  });

  it("uses the page's own width before the space has been measured", () => {
    expect(pageDisplayWidth(612, 0, 1)).toBe(612);
  });
});
