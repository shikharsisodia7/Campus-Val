import { describe, expect, it } from "vitest";
import { canonicalResourceBlocker, isCanonicalResourceReady, selectCanonicalResourceForFile } from "./canonical-resources";

describe("canonical department resource gate", () => {
  const ready = { provenanceStatus: "verified", reviewStatus: "approved", publicationStatus: "published" } as const;

  it("requires independent provenance, review, and publication decisions", () => {
    expect(isCanonicalResourceReady(ready)).toBe(true);
    expect(canonicalResourceBlocker(ready)).toBeNull();

    expect(isCanonicalResourceReady({ ...ready, provenanceStatus: "documented" })).toBe(false);
    expect(canonicalResourceBlocker({ ...ready, provenanceStatus: "documented" })).toContain("provenance");

    expect(isCanonicalResourceReady({ ...ready, reviewStatus: "pending" })).toBe(false);
    expect(canonicalResourceBlocker({ ...ready, reviewStatus: "pending" })).toContain("review");

    expect(isCanonicalResourceReady({ ...ready, publicationStatus: "archived" })).toBe(false);
    expect(canonicalResourceBlocker({ ...ready, publicationStatus: "archived" })).toContain("publication");
  });

  it("fails closed for unknown states", () => {
    expect(isCanonicalResourceReady({ provenanceStatus: "verified", reviewStatus: "approved", publicationStatus: "unrecognized" })).toBe(false);
  });

  it("uses a reviewed resource registry rather than a directory name, including non-CAS schools", () => {
    const lsb = { ...ready, sourceFileName: "Finance checklist.xlsx", school: "LSB" };
    const soe = { ...ready, sourceFileName: "Electrical Engineering checklist.xlsx", school: "SOE" };
    expect(selectCanonicalResourceForFile([lsb, soe], "finance CHECKLIST.xlsx").resource).toBe(lsb);
    expect(selectCanonicalResourceForFile([lsb, soe], "Electrical Engineering checklist.xlsx").resource).toBe(soe);
    expect(selectCanonicalResourceForFile([lsb], "student-upload.xlsx").error).toContain("not registered");
    expect(selectCanonicalResourceForFile([{ ...lsb, publicationStatus: "archived" }], lsb.sourceFileName).error).toContain("only archived");
    expect(selectCanonicalResourceForFile([lsb, { ...lsb }], lsb.sourceFileName).error).toContain("more than one");
  });
});
