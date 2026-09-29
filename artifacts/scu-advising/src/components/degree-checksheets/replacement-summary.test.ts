/**
 * What the student is told after replacing a file: what stayed, what followed
 * its page, and what needs them.
 */
import { describe, expect, it } from "vitest";
import { replacementSummary } from "./ChecksheetDocumentCard";

describe("replacement summary", () => {
  it("says so when there was nothing to carry over", () => {
    expect(replacementSummary({ kept: 0, detached: 0 })).toBe("There was no tracking to carry over.");
  });

  it("says everything stayed", () => {
    expect(replacementSummary({ kept: 1, detached: 0, moved: 0 })).toBe("All 1 of your tracking entry is still in place.");
    expect(replacementSummary({ kept: 3, detached: 0 })).toBe("All 3 of your tracking entries are still in place.");
  });

  it("says when markers followed their pages to new page numbers", () => {
    expect(replacementSummary({ kept: 2, detached: 0, moved: 2 })).toBe(
      "All 2 of your tracking entries are still in place. They followed their pages to a new page number.",
    );
    expect(replacementSummary({ kept: 3, detached: 0, moved: 1 })).toMatch(/1 of them followed its page to a new page number\.$/);
  });

  it("says what could not be matched, that nothing sits against the wrong requirement, and what to do", () => {
    const text = replacementSummary({ kept: 1, detached: 2, moved: 0 });
    expect(text).toContain("2 of your tracking entries could not be matched to the new file");
    expect(text).toContain("nothing is shown against the wrong requirement");
    expect(text).toContain("You can place them on the new document yourself.");
    expect(text).toMatch(/1 tracking entry stayed in place\.$/);
  });

  it("does not mention what stayed when nothing did", () => {
    expect(replacementSummary({ kept: 0, detached: 1 })).not.toContain("stayed");
  });
});
