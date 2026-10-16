// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
}));

import Landing from "./landing";

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
});
