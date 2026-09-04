// @vitest-environment jsdom
/**
 * A tentative schedule's `sectionNumber` is a synthetic placeholder assigned
 * by the Registrar-tentative importer, not a real SCU section number (spec:
 * "do NOT fabricate user-facing section numbers"). The calendar must never
 * render it as if it were one.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { ScheduleEvent } from "@workspace/api-client-react";

import { CalendarGrid } from "./CalendarGrid";

afterEach(cleanup);

function makeSection(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 1,
    scheduleId: 1,
    kind: "section",
    courseCode: "MATH 11",
    courseTitle: "Calculus I",
    sectionNumber: "1",
    units: 5,
    instructor: "Dr. Example",
    name: null,
    category: null,
    institution: null,
    externalCourseLabel: null,
    notes: null,
    meetingDays: ["M", "W", "F"],
    startTime: "09:00",
    endTime: "09:50",
    location: "Kenna 101",
    componentType: "lecture",
    ...overrides,
  } as ScheduleEvent;
}

describe("CalendarGrid tentative-section labeling", () => {
  // Event renders once per meeting day (M/W/F), so assertions use
  // getAllByText/queryAllByText rather than assuming a single match.

  it("shows the real course-sectionNumber for a published (non-tentative) schedule", () => {
    render(
      <CalendarGrid events={[makeSection()]} isTentativeSchedule={false} />,
    );
    expect(screen.getAllByText("MATH 11-1").length).toBeGreaterThan(0);
  });

  it("never renders the synthetic sectionNumber for a tentative schedule", () => {
    render(
      <CalendarGrid events={[makeSection()]} isTentativeSchedule={true} />,
    );
    expect(screen.queryAllByText("MATH 11-1").length).toBe(0);
    expect(screen.queryAllByText(/-1\b/).length).toBe(0);
    expect(screen.getAllByText("MATH 11").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tentative").length).toBeGreaterThan(0);
  });
});

describe("CalendarGrid accessibility", () => {
  it("exposes each event as a keyboard-reachable, labeled control — not a mouse-only div", () => {
    const onEventClick = vi.fn();
    render(
      <CalendarGrid
        events={[makeSection()]}
        isTentativeSchedule={false}
        onEventClick={onEventClick}
      />,
    );

    const eventEls = screen.getAllByRole("button", { name: /MATH 11-1/i });
    expect(eventEls.length).toBeGreaterThan(0);
    const eventEl = eventEls[0]!;
    expect(eventEl.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(eventEl, { key: "Enter" });
    expect(onEventClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(eventEl, { key: " " });
    expect(onEventClick).toHaveBeenCalledTimes(2);
  });
});
