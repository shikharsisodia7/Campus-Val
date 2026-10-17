import { describe, expect, it } from "vitest";
import type { NoteCandidate } from "./checklist-notes";
import { reconcileLegacyNote, type LegacyNoteRow } from "./legacy-reconcile";

const candidate = (over: Partial<NoteCandidate> = {}): NoteCandidate => ({
  sourceReference: "Biology!D44",
  sectionName: "Biology Major Requirements",
  rowLabel: "UD BIOL CMB THEME w/ Lab 1",
  body: "Theme",
  targetKey: "major:biology#theme-cmb",
  kind: "requirement",
  status: "published",
  reason: null,
  ...over,
});
const legacy = (over: Partial<LegacyNoteRow> = {}): LegacyNoteRow => ({
  id: 49,
  status: "unmapped",
  targetKey: null,
  noteKind: null,
  body: "Theme",
  sourceAnchorText: "UD BIOL CMB THEME w/ Lab 1",
  canonicalResourceId: null,
  origin: "imported",
  reviewedBy: null,
  createdBy: "importer@campusval.local",
  updatedBy: "importer@campusval.local",
  ...over,
});

describe("reconciling a legacy checklist import with the current extractor", () => {
  it("moves an importer-owned note to the extractor's current anchor and status", () => {
    expect(reconcileLegacyNote(legacy(), candidate())).toEqual({
      action: "update",
      next: { status: "published", targetKey: "major:biology#theme-cmb", noteKind: "requirement" },
    });
    // A dated note the extractor now holds for review is taken down, not left live.
    const dated = "RTC 3: Can overlap with another Core or a Major requirement (as of 10/23)";
    expect(
      reconcileLegacyNote(
        legacy({ status: "published", targetKey: "university-core:cas#rtc3", noteKind: "core_overlap", body: dated, sourceAnchorText: "RTC 3" }),
        candidate({ rowLabel: "RTC 3", body: dated, targetKey: "university-core:cas#rtc3", kind: "core_overlap", status: "draft" }),
      ),
    ).toMatchObject({ action: "update", next: { status: "draft" } });
  });

  it("never touches a note a person has edited, reviewed or archived, or a resource-backed note", () => {
    expect(reconcileLegacyNote(legacy({ reviewedBy: "advisor@scu.edu" }), candidate()).action).toBe("skip");
    expect(reconcileLegacyNote(legacy({ updatedBy: "advisor@scu.edu" }), candidate()).action).toBe("skip");
    expect(reconcileLegacyNote(legacy({ status: "archived" }), candidate()).action).toBe("skip");
    expect(reconcileLegacyNote(legacy({ canonicalResourceId: 1 }), candidate()).action).toBe("skip");
  });

  it("skips a cell whose text or label changed since the import, and reports a match as unchanged", () => {
    expect(reconcileLegacyNote(legacy({ body: "Theme course" }), candidate())).toMatchObject({ action: "skip", why: /no longer says/ });
    expect(reconcileLegacyNote(legacy({ sourceAnchorText: "Something else" }), candidate()).action).toBe("skip");
    expect(reconcileLegacyNote(legacy({ status: "published", targetKey: "major:biology#theme-cmb", noteKind: "requirement" }), candidate())).toEqual({ action: "unchanged" });
  });
});
