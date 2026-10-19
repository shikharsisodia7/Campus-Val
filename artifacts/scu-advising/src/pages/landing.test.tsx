// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
}));

import Landing from "./landing";

afterEach(cleanup);

describe("public landing page", () => {
  it("presents the three reliable pilot workflows and no experimental marketing", () => {
    render(<Landing />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByText("Degree Planning")).toBeTruthy();
    expect(screen.getByText("Quarter Planning")).toBeTruthy();
    expect(screen.getByText("Explore Options with Tentative Degree Planning")).toBeTruthy();
    expect(screen.getByText(/Explore different majors, minors, and academic pathways/i)).toBeTruthy();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/AI planning support|graduation paths|automatic graduation|official degree audit/i);
  });

  it("states the pilot status and offers no broad sign-up call to action", () => {
    render(<Landing />);
    expect(screen.getByTestId("landing-pilot-status").textContent).toMatch(/only to invited pilot participants/i);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Workday and SCU remain authoritative/);
    expect(text).not.toMatch(/get started|sign up with|AI-powered|AI-assisted|smart|intelligent/i);
    expect(screen.queryByRole("button", { name: /sign up|get started/i })).toBeNull();
  });

  it("the no-JavaScript copy says the same things and nothing more", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../landing-prerender.html"), "utf-8");
    for (const phrase of [
      "Degree Planning",
      "Quarter Planning",
      "Explore Options with Tentative Degree Planning",
      "Available only to invited pilot participants",
      "Workday and SCU remain authoritative",
    ]) {
      expect(html).toContain(phrase);
    }
    expect(html).not.toMatch(/\bAI\b/);
    expect(html).not.toMatch(/href="\/sign-up"|Get started|@scu\.edu account/i);
  });
});
