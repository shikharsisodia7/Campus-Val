import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * REGRESSION: dropping a course into "Completed Before Current Plan" silently
 * did nothing, which the professor reported.
 *
 * Root cause was the board's collision detection. `closestCorners` scores
 * droppables against the corners of the DRAGGED CARD, not the cursor. The
 * completed strip is ~80px tall while a term column runs the full height of
 * the board, so a tall course card hovering over the strip still scored closer
 * to the term column behind it — dnd-kit reported the drop over a term (or
 * over the card itself) and the completed branch in handleDragEnd never ran.
 *
 * Confirmed live before the fix: dnd-kit's own aria-live region announced
 * "Draggable item 243 was moved over droppable area 243" for the whole drag.
 * After switching to pointer-first detection it announced
 * "...moved over droppable area bucket:completed" and the item persisted with
 * bucket "completed" and completionSource "manually_marked".
 *
 * These assertions are source-level on purpose: the failure was in dnd-kit's
 * geometry, which jsdom cannot reproduce (it has no layout), so a rendered
 * test would pass while the real app stayed broken.
 */
const boardSource = readFileSync(resolve(__dirname, "./Board.tsx"), "utf8");

describe("Board collision detection", () => {
  it("checks what the pointer is inside before falling back to geometry", () => {
    expect(boardSource).toMatch(/pointerWithin\(args\)/);
    expect(boardSource).toMatch(
      /pointerCollisions\.length > 0\s*\?\s*pointerCollisions\s*:\s*closestCorners\(args\)/,
    );
  });

  it("does not pass closestCorners directly to DndContext any more", () => {
    expect(boardSource).not.toMatch(/collisionDetection=\{closestCorners\}/);
    expect(boardSource).toMatch(/collisionDetection=\{collisionDetection\}/);
  });

  it("still routes a drop on the completed dropzone into the completed bucket", () => {
    expect(boardSource).toMatch(/overId === COMPLETED_DROPZONE_ID/);
    expect(boardSource).toMatch(/bucket: "completed"/);
    expect(boardSource).toMatch(/completionSource:/);
  });

  it("returns a course to normal planning when dragged back out", () => {
    expect(boardSource).toMatch(
      /bucket: "planned" as const, completionSource: null/,
    );
  });

  it("refuses to file a requirement placeholder as completed coursework", () => {
    expect(boardSource).toMatch(
      /draggedItem\.itemType === "requirement_placeholder"\) return/,
    );
  });
});
