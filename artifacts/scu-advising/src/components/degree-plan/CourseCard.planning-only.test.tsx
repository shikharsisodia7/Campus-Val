/**
 * Degree Plan course cards are PLANNING surfaces only.
 *
 * Two professor requirements are locked in here:
 *
 *  - Exact sections belong exclusively to Quarter Plan. The Degree Plan
 *    dialog must never grow an instructor picker, section-number picker,
 *    meeting-time picker or lecture/lab alternatives. Degree Plan answers
 *    "CHEM 11 -> Fall"; Quarter Plan answers "which section".
 *
 *  - Drag-and-drop is the movement model. The visible move-arrow dropdown is
 *    gone; what remains is the completion-provenance menu, which records WHY
 *    a course counts as already done (AP, transfer, prior coursework) —
 *    something a drag cannot express.
 *
 * These assert against the component source so they cannot be satisfied by a
 * hidden element or a mocked-away subtree.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cardSource = readFileSync(resolve(__dirname, "./CourseCard.tsx"), "utf8");
const boardSource = readFileSync(resolve(__dirname, "./Board.tsx"), "utf8");

describe("no exact-section controls on Degree Plan", () => {
  it("has no section-number picker", () => {
    expect(cardSource).not.toMatch(/sectionNumber/);
  });

  it("has no instructor selection", () => {
    expect(cardSource).not.toMatch(/instructor/i);
  });

  it("has no meeting-time or weekly-schedule controls", () => {
    expect(cardSource).not.toMatch(/meetingDays/);
    expect(cardSource).not.toMatch(/startTime/);
  });

  it("has no lecture/lab component picker", () => {
    expect(cardSource).not.toMatch(/componentType/);
  });
});

describe("drag-and-drop is the movement model", () => {
  it("no longer renders a move-to-term dropdown on the card", () => {
    expect(cardSource).not.toMatch(/Move to\.\.\./);
    expect(cardSource).not.toMatch(/DropdownMenuLabel>Move/);
  });

  it("keeps the completion-provenance menu, which a drag cannot express", () => {
    expect(cardSource).toMatch(/completion-source-trigger-/);
    expect(cardSource).toMatch(/Completed before current plan/);
  });

  it("gives the provenance trigger an accessible label", () => {
    expect(cardSource).toMatch(/aria-label=\{`Mark /);
  });

  it("keeps dragging reachable from the keyboard via dnd-kit's KeyboardSensor", () => {
    expect(boardSource).toMatch(/useSensor\(KeyboardSensor\)/);
  });

  it("still supports dropping onto the completed area", () => {
    expect(boardSource).toMatch(/COMPLETED_DROPZONE_ID/);
    expect(boardSource).toMatch(/droppedOnCompleted/);
  });

  it("supports Summer as a drop target once the year enables it", () => {
    expect(boardSource).toMatch(/terms\.push\("summer"\)/);
  });
});
