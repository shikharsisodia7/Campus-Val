// @vitest-environment jsdom
/**
 * The small-screen APR drawer: one shared component for Degree Plan, Tentative
 * Degree Plan and Quarter Plan, accessible by keyboard and screen reader.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AprReferenceSheet } from "./AprReferenceSheet";

afterEach(cleanup);

describe("AprReferenceSheet", () => {
  it("renders a labelled trigger button and keeps the panel closed until it is used", () => {
    render(<AprReferenceSheet><div data-testid="panel">APR panel</div></AprReferenceSheet>);
    const trigger = screen.getByRole("button", { name: /Academic Progress Report/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("opens a titled, described dialog containing the panel", async () => {
    render(<AprReferenceSheet><div data-testid="panel">APR panel</div></AprReferenceSheet>);
    fireEvent.click(screen.getByTestId("button-open-apr-reference"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Workday Academic Progress Report/); // accessible name (sr-only title)
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByTestId("panel")).toBeTruthy();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    render(<AprReferenceSheet><div data-testid="panel">APR panel</div></AprReferenceSheet>);
    const trigger = screen.getByTestId("button-open-apr-reference");
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("one drawer, every planning page", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

  it("Degree Plan / Tentative Degree Plan render the shared drawer around ContextPanel", () => {
    expect(read("../degree-plan/DegreePlanWorkspace.tsx")).toMatch(/<AprReferenceSheet>\s*<ContextPanel \/>/);
  });

  it("Quarter Plan uses the SAME drawer around the SAME WorkdayAprPanel, and shows the permanent column only from xl up", () => {
    const planner = read("../../pages/planner.tsx");
    expect(planner).toMatch(/<AprReferenceSheet>\s*<WorkdayAprPanel/);
    expect(planner).toMatch(/hidden[^"]*xl:flex[^"]*"\s+data-testid="quarter-plan-apr-column"/);
    expect(planner).toMatch(/xl:hidden"\s+data-testid="quarter-plan-apr-drawer-bar"/);
  });

  it("no planning page renders its own separate APR implementation", () => {
    for (const f of ["../degree-plan/ContextPanel.tsx", "../../pages/planner.tsx"]) {
      expect(read(f)).not.toMatch(/RequirementGroupList|AprStructuredView/);
    }
  });
});
