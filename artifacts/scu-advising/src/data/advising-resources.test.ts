import { describe, expect, it } from "vitest";
import { PRE_PROFESSIONAL_TRACKS, visibleTrustedResources, type TrustedResource } from "./advising-resources";

const resource = (over: Partial<TrustedResource>): TrustedResource => ({
  id: "r",
  title: "Guide",
  sourceOrganization: "Organization",
  url: "https://example.edu/guide",
  description: "d",
  category: "guide",
  editorialStatus: "approved",
  displayOrder: 1,
  ...over,
});

describe("pre-professional trusted resources", () => {
  it("ships with no resources: nothing is shown until the faculty lead provides them", () => {
    for (const track of PRE_PROFESSIONAL_TRACKS) expect(track.trustedResources).toEqual([]);
  });

  it("shows only approved resources, in the editor's order; external alone is never trusted", () => {
    const list = [
      resource({ id: "b", title: "B", displayOrder: 2 }),
      resource({ id: "pending", title: "Pending", editorialStatus: "pending_review", displayOrder: 0 }),
      resource({ id: "a", title: "A", displayOrder: 1 }),
    ];
    expect(visibleTrustedResources(list).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
