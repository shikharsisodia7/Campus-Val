import { describe, it, expect } from "vitest";
import {
  PILOT_FEATURES,
  getPrimaryNavItems,
  getAdditionalFeatureGroups,
  isPathPilotAllowed,
} from "./pilot-features";

const CORE_PATHS = ["/", "/degree-plan", "/planner", "/tentative-plans"];

const PILOT_VISIBLE_PATHS = [
  "/courses",
  "/core-reqs",
  "/gpa",
  "/transfer",
  "/progress-report",
  "/resources",
  "/shared-with-me",
];

const PILOT_HIDDEN_PATHS = [
  "/professors",
  "/compare",
  "/graduation-paths",
  "/advice",
  "/advisor",
  "/voice",
  "/policies",
  "/evaluation",
  "/sync-workday",
  "/feedback",
];

describe("pilot-features registry", () => {
  it("tracks exactly the professor's three key workflows plus Dashboard as CORE", () => {
    const corePaths = getPrimaryNavItems().map((f) => f.path);
    expect(corePaths).toEqual(CORE_PATHS);
  });

  it("classifies every tracked feature into the expected pilot status", () => {
    for (const path of PILOT_VISIBLE_PATHS) {
      const f = PILOT_FEATURES.find((x) => x.path === path);
      expect(f, `expected ${path} to be tracked`).toBeTruthy();
      expect(f!.status).toBe("PILOT_VISIBLE");
    }
    for (const path of PILOT_HIDDEN_PATHS) {
      const f = PILOT_FEATURES.find((x) => x.path === path);
      expect(f, `expected ${path} to be tracked`).toBeTruthy();
      expect(f!.status).toBe("PILOT_HIDDEN");
    }
  });

  it("never lets a PILOT_HIDDEN path resolve for a non-admin", () => {
    for (const path of PILOT_HIDDEN_PATHS) {
      expect(isPathPilotAllowed(path, false)).toBe(false);
    }
  });

  it("always lets an admin reach every tracked path, hidden or not", () => {
    for (const f of PILOT_FEATURES) {
      expect(isPathPilotAllowed(f.path, true)).toBe(true);
    }
  });

  it("lets everyone reach CORE and PILOT_VISIBLE paths", () => {
    for (const path of [...CORE_PATHS, ...PILOT_VISIBLE_PATHS]) {
      expect(isPathPilotAllowed(path, false)).toBe(true);
    }
  });

  it("treats an untracked path (auth, onboarding, admin/*) as ungated", () => {
    expect(isPathPilotAllowed("/onboarding", false)).toBe(true);
    expect(isPathPilotAllowed("/admin/usage", false)).toBe(true);
  });

  it("Additional Features groups show only PILOT_VISIBLE items to a non-admin", () => {
    const groups = getAdditionalFeatureGroups(false);
    const shownPaths = groups.flatMap((g) => g.items.map((i) => i.path));
    for (const path of PILOT_VISIBLE_PATHS) {
      expect(shownPaths).toContain(path);
    }
    for (const path of PILOT_HIDDEN_PATHS) {
      expect(shownPaths).not.toContain(path);
    }
    expect(groups.some((g) => g.id === "hidden-during-pilot")).toBe(false);
  });

  it("Additional Features groups show PILOT_VISIBLE and PILOT_HIDDEN items to an admin", () => {
    const groups = getAdditionalFeatureGroups(true);
    const shownPaths = groups.flatMap((g) => g.items.map((i) => i.path));
    for (const path of [...PILOT_VISIBLE_PATHS, ...PILOT_HIDDEN_PATHS]) {
      expect(shownPaths).toContain(path);
    }
    expect(groups.some((g) => g.id === "hidden-during-pilot")).toBe(true);
  });

  it("never leaves the legacy /feedback route as the only feedback mechanism (Report Error replaces it)", () => {
    const feedback = PILOT_FEATURES.find((f) => f.path === "/feedback");
    expect(feedback?.status).toBe("PILOT_HIDDEN");
  });

  it("keeps Graduation Paths hidden, since only one major (CSE) is a fully prescribed sequence", () => {
    const gradPaths = PILOT_FEATURES.find((f) => f.path === "/graduation-paths");
    expect(gradPaths?.status).toBe("PILOT_HIDDEN");
  });
});
