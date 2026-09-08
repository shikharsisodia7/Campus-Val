// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ReportIssueDialog } from "./ReportIssueDialog";
import { Toaster } from "@/components/ui/toaster";

let mockLocation = "/degree-plan";
vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, vi.fn()],
}));

// jsdom does not implement scrollIntoView (used by Radix Select to keep the
// highlighted option in view); Radix calls it unconditionally on mount.
Element.prototype.scrollIntoView = vi.fn();

function renderDialog() {
  return render(
    <>
      <ReportIssueDialog trigger={<button data-testid="trigger">Report Error</button>} />
      <Toaster />
    </>,
  );
}

async function openDialog() {
  fireEvent.click(screen.getByTestId("trigger"));
  await waitFor(() => expect(screen.getByTestId("dialog-report-issue")).toBeTruthy());
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByTestId("input-report-subject"), {
    target: { value: "MATH 11 term availability" },
  });
  fireEvent.change(screen.getByTestId("input-report-description"), {
    target: { value: "MATH 11 shows as offered in Spring but it is not." },
  });
  // Radix Select is not a native <select>; drive it via its trigger + option
  // role, same pattern as other Select-driven tests in this repo.
  fireEvent.click(screen.getByTestId("select-report-type"));
  const option = await screen.findByText("Incorrect academic information");
  fireEvent.click(option);
}

describe("ReportIssueDialog", () => {
  beforeEach(() => {
    mockLocation = "/degree-plan";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("stays closed until the trigger is activated", () => {
    renderDialog();
    expect(screen.queryByTestId("dialog-report-issue")).toBeNull();
  });

  it("opens on trigger click and pre-populates the page/feature from the current route", async () => {
    renderDialog();
    await openDialog();
    expect(screen.getByText("Report Error / Suggest Changes")).toBeTruthy();
    expect(screen.getByTestId("text-report-pathname").textContent).toContain("/degree-plan");
    expect(screen.getByTestId("select-report-feature").textContent).toContain("Degree Plan");
  });

  it("opens via keyboard activation (Enter on a focused trigger)", async () => {
    renderDialog();
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    fireEvent.click(trigger); // jsdom does not synthesize the native click a real Enter keypress would fire
    await waitFor(() => expect(screen.getByTestId("dialog-report-issue")).toBeTruthy());
  });

  it("disables submit until type, subject, and description are all filled", async () => {
    renderDialog();
    await openDialog();
    expect(screen.getByTestId("button-report-submit").hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByTestId("input-report-subject"), {
      target: { value: "Something" },
    });
    expect(screen.getByTestId("button-report-submit").hasAttribute("disabled")).toBe(true);

    await fillRequiredFields();
    expect(screen.getByTestId("button-report-submit").hasAttribute("disabled")).toBe(false);
  });

  it("submits successfully, shows a confirmation toast, and closes", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, id: 1 }), { status: 201 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDialog();
    await openDialog();
    await fillRequiredFields();
    fireEvent.click(screen.getByTestId("button-report-submit"));

    await waitFor(() => expect(screen.queryByTestId("dialog-report-issue")).toBeNull());
    expect(screen.getByText("Report submitted")).toBeTruthy();

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.type).toBe("incorrect_info");
    expect(body.subject).toBe("MATH 11 term availability");
    expect(body.pathname).toBe("/degree-plan");
  });

  it("keeps the dialog open and preserves entered text when submission fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Server exploded" }), { status: 500 }),
        ),
      ),
    );

    renderDialog();
    await openDialog();
    await fillRequiredFields();
    fireEvent.click(screen.getByTestId("button-report-submit"));

    await waitFor(() => expect(screen.getByText("Couldn't submit report")).toBeTruthy());
    expect(screen.getByTestId("dialog-report-issue")).toBeTruthy();
    expect((screen.getByTestId("input-report-subject") as HTMLInputElement).value).toBe(
      "MATH 11 term availability",
    );
  });

  it("closes on Escape", async () => {
    renderDialog();
    await openDialog();
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("dialog-report-issue")).toBeNull());
  });

  it("returns focus to the trigger after closing", async () => {
    renderDialog();
    await openDialog();
    fireEvent.click(screen.getByTestId("button-report-cancel"));
    await waitFor(() => expect(screen.queryByTestId("dialog-report-issue")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("trigger")));
  });
});