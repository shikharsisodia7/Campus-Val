// @vitest-environment jsdom
/**
 * The source previews and the tracking controls drawn on them: what is the
 * department's is shown as text and cannot be edited; what is the student's is
 * marked as such and offered only where the document left room for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ChecksheetDocumentView } from "./ChecksheetDocumentView";
import { ChecksheetSpreadsheetView } from "./ChecksheetSpreadsheetView";
import { MyTrackingPanel } from "./MyTrackingPanel";
import { PointMarkerLayer, type MarkerMode } from "./PointMarkerLayer";
import { SaveIndicator } from "./TrackingControls";
import { ViewerToolbar } from "./ViewerToolbar";
import { HOSTILE, documentBlocks, electivesSheet, fakeTracking, majorSheet, testEntry } from "./checksheet-test-data";

const NOW = new Date(2026, 8, 28, 12);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>)["__checksheetPwned"];
});

describe("spreadsheet", () => {
  const view = (tracking = fakeTracking([]), showTracking = true) =>
    render(
      <ChecksheetSpreadsheetView
        documentId={1}
        title="Applied Widgetry Major"
        sheets={[majorSheet, electivesSheet]}
        tracking={tracking}
        showTracking={showTracking}
      />,
    );

  it("shows the source grid as uploaded: wording, order, merged title", () => {
    view();
    const grid = screen.getByTestId("checksheet-grid");
    expect(grid.textContent).toContain("Applied Widgetry Major Checksheet (sample)");
    expect(grid.textContent).toContain("Prerequisite for WIDG 112");
    const rows = [...grid.querySelectorAll("tbody tr")].map((tr) => tr.getAttribute("data-source-row"));
    expect(rows).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(grid.querySelector('tr[data-source-row="1"] td')!.getAttribute("colspan")).toBe("5");
  });

  it("offers a control ONLY in the cells the document left for the student", () => {
    view();
    const cells = [...document.querySelectorAll("[data-tracking-cell]")].map((el) => el.getAttribute("data-testid"));
    expect(cells).toEqual([
      "checksheet-cell-0-4-2",
      "checksheet-cell-0-4-3",
      "checksheet-cell-0-5-2",
      "checksheet-cell-0-5-3",
      "checksheet-cell-0-6-3",
    ]);
    // Header row, section heading, requirement, course and notes cells hold no control.
    for (const row of ["3", "4"]) {
      expect(document.querySelector(`tr[data-source-row="${row}"]`)!.querySelector("select")).toBeNull();
    }
    const item = document.querySelector('tr[data-source-row="5"]')!;
    const plain = [...item.querySelectorAll("td")].filter((td) => !td.hasAttribute("data-tracking-cell"));
    expect(plain.map((td) => td.textContent)).toEqual(["Introduction to Widgetry", "WIDG 101", "Recommended first course"]);
    expect(plain.every((td) => td.querySelector("select, input, textarea, [contenteditable]") === null)).toBe(true);
  });

  it("never offers a control over a cell the department filled in", () => {
    view();
    // Row 7's Status cell says "Waived by department"; it is shown, not replaced.
    const row = document.querySelector('tr[data-source-row="7"]')!;
    expect(row.textContent).toContain("Waived by department");
    expect(screen.queryByTestId("checksheet-cell-0-6-2")).toBeNull();
  });

  it("marks every control as the student's, in words and not by colour alone", () => {
    view();
    for (const cell of document.querySelectorAll("[data-tracking-cell]")) {
      expect(cell.textContent).toContain("My tracking");
      expect(cell.getAttribute("title")).toMatch(/does not change the original document/);
    }
  });

  it("labels each control with what it is for", () => {
    view();
    expect(screen.getByLabelText("My status for Introduction to Widgetry, WIDG 101")).toBeTruthy();
    expect(screen.getByLabelText("My quarter for Widget Mathematics I, WIDG 111: quarter")).toBeTruthy();
    expect(screen.getByLabelText("My quarter for Widget Mathematics I, WIDG 111: year")).toBeTruthy();
  });

  it("records a status against the cell's position", () => {
    const setCell = vi.fn();
    view(fakeTracking([], { setCell }));
    fireEvent.change(screen.getByTestId("checksheet-cell-status-0-4-2"), { target: { value: "completed" } });
    expect(setCell).toHaveBeenCalledWith("sheet_cell", { sheet: 0, row: 4, col: 2 }, "status", { status: "completed" });
  });

  it("records a quarter with the year of the academic year in progress, which can be changed", () => {
    const setCell = vi.fn();
    view(fakeTracking([], { setCell }));
    fireEvent.change(screen.getByTestId("checksheet-cell-term-0-4-3-term"), { target: { value: "winter" } });
    expect(setCell).toHaveBeenLastCalledWith("sheet_cell", { sheet: 0, row: 4, col: 3 }, "term", { term: "winter", termYear: 2027 });
    fireEvent.change(screen.getByTestId("checksheet-cell-term-0-4-3-term"), { target: { value: "fall" } });
    expect(setCell).toHaveBeenLastCalledWith("sheet_cell", { sheet: 0, row: 4, col: 3 }, "term", { term: "fall", termYear: 2026 });
  });

  it("shows saved values, changes the year, and clears back to nothing", () => {
    const setCell = vi.fn();
    view(
      fakeTracking(
        [
          testEntry({ key: "sheet:0:4:2", anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "in_progress" }),
          testEntry({ key: "sheet:0:4:3", id: 12, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 3 }, field: "term", term: "spring", termYear: 2025 }),
        ],
        { setCell },
      ),
    );
    expect((screen.getByTestId("checksheet-cell-status-0-4-2") as HTMLSelectElement).value).toBe("in_progress");
    expect((screen.getByTestId("checksheet-cell-term-0-4-3-term") as HTMLSelectElement).value).toBe("spring");
    expect((screen.getByTestId("checksheet-cell-term-0-4-3-year") as HTMLSelectElement).value).toBe("2025");
    // Another row is untouched by them.
    expect((screen.getByTestId("checksheet-cell-status-0-5-2") as HTMLSelectElement).value).toBe("");

    fireEvent.change(screen.getByTestId("checksheet-cell-term-0-4-3-year"), { target: { value: "2024" } });
    expect(setCell).toHaveBeenLastCalledWith("sheet_cell", { sheet: 0, row: 4, col: 3 }, "term", { term: "spring", termYear: 2024 });
    fireEvent.change(screen.getByTestId("checksheet-cell-term-0-4-3-term"), { target: { value: "" } });
    expect(setCell).toHaveBeenLastCalledWith("sheet_cell", { sheet: 0, row: 4, col: 3 }, "term", { term: null, termYear: null });
    fireEvent.change(screen.getByTestId("checksheet-cell-status-0-4-2"), { target: { value: "" } });
    expect(setCell).toHaveBeenLastCalledWith("sheet_cell", { sheet: 0, row: 4, col: 2 }, "status", { status: null });
  });

  it("'Show original only' removes every control and leaves the source alone", () => {
    view(
      fakeTracking([
        testEntry({ key: "sheet:0:4:2", anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "in_progress" }),
      ]),
      false,
    );
    expect(document.querySelectorAll("[data-tracking-cell]")).toHaveLength(0);
    expect(document.querySelectorAll("select")).toHaveLength(0);
    const grid = screen.getByTestId("checksheet-grid");
    expect(grid.textContent).not.toContain("My tracking");
    // The student's "In Progress" is nowhere in it; the department's own header still is.
    expect(grid.textContent).not.toContain("In Progress");
    expect(grid.textContent).toContain("Quarter Completed");
    expect(grid.textContent).toContain("Introduction to Widgetry");
  });

  it("switches worksheets, each with its own cells", () => {
    const setCell = vi.fn();
    view(fakeTracking([], { setCell }));
    const tabs = within(screen.getByTestId("checksheet-sheet-tabs")).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Major", "Electives"]);
    fireEvent.click(tabs[1]!);
    expect(screen.getByTestId("checksheet-grid").textContent).toContain("SPRK 110 Sprocket History");
    fireEvent.change(screen.getByTestId("checksheet-cell-status-1-1-1"), { target: { value: "planned" } });
    expect(setCell).toHaveBeenCalledWith("sheet_cell", { sheet: 1, row: 1, col: 1 }, "status", { status: "planned" });
  });

  it("can be scrolled from the keyboard", () => {
    view();
    const region = screen.getByTestId("checksheet-grid-scroll");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toMatch(/scrollable/);
  });
});

describe("Word document", () => {
  const view = (tracking = fakeTracking([]), showTracking = true) =>
    render(
      <ChecksheetDocumentView documentId={4} title="Advising guide" blocks={documentBlocks} tracking={tracking} showTracking={showTracking} />,
    );

  it("keeps headings, paragraphs, a list and a table", () => {
    view();
    const root = screen.getByTestId("checksheet-document-4");
    expect(within(root).getByRole("heading", { name: "Applied Widgetry Advising Guide (sample)" })).toBeTruthy();
    expect(root.querySelectorAll("ul > li")).toHaveLength(2);
    expect(root.querySelector("ul")!.textContent).toContain("Take WIDG 111 before WIDG 112.");
    expect(root.querySelectorAll("table tr")).toHaveLength(3);
    expect(root.querySelector("p .font-semibold")!.textContent).toBe("WIDG 101");
  });

  it("shows hostile content as text: nothing from the file becomes an element", () => {
    view();
    const root = screen.getByTestId("checksheet-document-4");
    expect(root.textContent).toContain(HOSTILE.script);
    expect(root.textContent).toContain(HOSTILE.image);
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("iframe, object, embed, style, form")).toBeNull();
    expect(root.querySelectorAll("img")).toHaveLength(0);
    expect(root.querySelector("[onerror], [onclick], [onload]")).toBeNull();
    expect((window as unknown as Record<string, unknown>)["__checksheetPwned"]).toBeUndefined();
  });

  it("follows only plain web links, in a new tab, without handing over the page", () => {
    view();
    const links = [...screen.getByTestId("checksheet-document-4").querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://www.example.edu/widgetry"]);
    expect(links[0]!.getAttribute("target")).toBe("_blank");
    expect(links[0]!.getAttribute("rel")).toContain("noopener");
    expect(links[0]!.getAttribute("rel")).toContain("noreferrer");
    // The javascript: link is still readable, as plain text.
    expect(screen.getByText("A link that must not be followed").closest("a")).toBeNull();
  });

  it("says so when a picture is not shown", () => {
    view();
    expect(screen.getByText(/A picture in this document is not shown in the preview/).textContent).toContain("Course flowchart");
  });

  it("tracks in the empty Status and Quarter cells of a table", () => {
    const setCell = vi.fn();
    view(fakeTracking([], { setCell }));
    expect([...document.querySelectorAll("[data-tracking-cell]")].map((el) => el.getAttribute("data-testid"))).toEqual([
      "checksheet-doc-cell-4-1-2",
      "checksheet-doc-cell-4-1-3",
      "checksheet-doc-cell-4-2-2",
      "checksheet-doc-cell-4-2-3",
    ]);
    fireEvent.change(screen.getByLabelText("My status for WIDG 101 Introduction to Widgetry"), { target: { value: "completed" } });
    expect(setCell).toHaveBeenCalledWith("doc_cell", { block: 4, row: 1, col: 2 }, "status", { status: "completed" });
    fireEvent.change(screen.getByTestId("checksheet-doc-cell-term-4-2-3-term"), { target: { value: "spring" } });
    expect(setCell).toHaveBeenLastCalledWith("doc_cell", { block: 4, row: 2, col: 3 }, "term", { term: "spring", termYear: 2027 });
  });

  it("'Show original only' leaves the table as the department wrote it", () => {
    view(fakeTracking([]), false);
    expect(document.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByTestId("checksheet-document-4").textContent).not.toContain("My tracking");
  });
});

describe("tracking a filled cell the student chooses", () => {
  const sheetView = (tracking = fakeTracking([]), showTracking = true) =>
    render(
      <ChecksheetSpreadsheetView documentId={1} title="Major" sheets={[majorSheet]} tracking={tracking} showTracking={showTracking} />,
    );
  const docView = (tracking = fakeTracking([]), showTracking = true) =>
    render(<ChecksheetDocumentView documentId={4} title="Guide" blocks={documentBlocks} tracking={tracking} showTracking={showTracking} />);

  it("offers nothing to choose until the student asks", () => {
    sheetView();
    expect(screen.getByTestId("checksheet-pick-item").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelectorAll("[data-pickable]")).toHaveLength(0);
    expect(screen.queryByTestId("checksheet-pick-instructions")).toBeNull();
  });

  it("then lets any cell that says something be chosen, and no empty one", () => {
    sheetView();
    fireEvent.click(screen.getByTestId("checksheet-pick-item"));
    expect(screen.getByTestId("checksheet-pick-instructions").textContent).toMatch(/document's own text is not changed/);
    const pickable = [...document.querySelectorAll("[data-pickable]")];
    // Every filled cell of the sheet: 1 title + 5 headers + 1 heading + 3 + 3 + 3.
    expect(pickable).toHaveLength(16);
    expect(pickable.every((el) => (el.textContent ?? "").trim() !== "")).toBe(true);
    expect(pickable.every((el) => el.getAttribute("role") === "button" && el.getAttribute("tabindex") === "0")).toBe(true);
    // The student's empty Status / Quarter cells are not among them.
    expect(document.querySelectorAll("[data-tracking-cell][data-pickable]")).toHaveLength(0);
  });

  it("records the cell's position and what it says, then stops choosing", () => {
    const addItem = vi.fn(() => "sheetitem:0:5:0");
    sheetView(fakeTracking([], { addItem }));
    fireEvent.click(screen.getByTestId("checksheet-pick-item"));
    fireEvent.click(screen.getByLabelText("Track Widget Mathematics I"));
    expect(addItem).toHaveBeenCalledWith("sheet_item", { sheet: 0, row: 5, col: 0 }, "Widget Mathematics I");
    expect(screen.getByTestId("checksheet-pick-item").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelectorAll("[data-pickable]")).toHaveLength(0);
  });

  it("can be chosen from the keyboard", () => {
    const addItem = vi.fn(() => "k");
    sheetView(fakeTracking([], { addItem }));
    fireEvent.click(screen.getByTestId("checksheet-pick-item"));
    fireEvent.keyDown(screen.getByLabelText("Track WIDG 130"), { key: "Enter" });
    expect(addItem).toHaveBeenCalledWith("sheet_item", { sheet: 0, row: 6, col: 1 }, "WIDG 130");
  });

  const chosen = testEntry({
    key: "sheetitem:0:5:0",
    id: 40,
    anchorType: "sheet_item",
    anchor: { sheet: 0, row: 5, col: 0 },
    itemLabel: "Widget Mathematics I",
    status: "in_progress",
    term: "winter",
    termYear: 2027,
  });

  it("shows the student's tracking UNDER the department's text, which is still there", () => {
    sheetView(fakeTracking([chosen]));
    const cell = document.querySelector('tr[data-source-row="6"] td')!;
    expect(cell.firstChild!.textContent).toBe("Widget Mathematics I");
    const block = within(cell as HTMLElement).getByTestId("checksheet-item-0-5-0");
    expect(block.textContent).toContain("My tracking");
    expect(block.getAttribute("title")).toMatch(/does not change the original document/);
    expect((within(block).getByLabelText("My status for Widget Mathematics I") as HTMLSelectElement).value).toBe("in_progress");
    expect((within(block).getByLabelText("My quarter for Widget Mathematics I: quarter") as HTMLSelectElement).value).toBe("winter");
    expect((within(block).getByLabelText("My quarter for Widget Mathematics I: year") as HTMLSelectElement).value).toBe("2027");
    expect(screen.getByTestId("checksheet-pick-count").textContent).toBe("You are tracking 1 cell you chose.");
  });

  it("changes, clears and stops tracking", () => {
    const change = vi.fn();
    const remove = vi.fn();
    sheetView(fakeTracking([chosen], { change, remove }));
    fireEvent.change(screen.getByTestId("checksheet-item-0-5-0-status"), { target: { value: "completed" } });
    expect(change).toHaveBeenLastCalledWith("sheetitem:0:5:0", { status: "completed" });
    fireEvent.change(screen.getByTestId("checksheet-item-0-5-0-status"), { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith("sheetitem:0:5:0", { status: null });
    fireEvent.change(screen.getByTestId("checksheet-item-0-5-0-term-term"), { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith("sheetitem:0:5:0", { term: null, termYear: null });
    fireEvent.click(screen.getByLabelText("Stop tracking Widget Mathematics I"));
    expect(remove).toHaveBeenCalledWith("sheetitem:0:5:0");
  });

  it("does not offer a cell that is already tracked", () => {
    sheetView(fakeTracking([chosen]));
    fireEvent.click(screen.getByTestId("checksheet-pick-item"));
    expect(screen.queryByLabelText("Track Widget Mathematics I")).toBeNull();
    expect(screen.getByLabelText("Track WIDG 111")).toBeTruthy();
  });

  it("'Show original only' hides the tracking, the toolbar and leaves the text", () => {
    sheetView(fakeTracking([chosen]), false);
    expect(screen.queryByTestId("checksheet-pick-toolbar")).toBeNull();
    expect(document.querySelectorAll("[data-tracked-item]")).toHaveLength(0);
    expect(document.querySelector('tr[data-source-row="6"] td')!.textContent).toBe("Widget Mathematics I");
  });

  it("works the same in a Word table", () => {
    const addItem = vi.fn(() => "blockitem:4:1:0");
    const view = docView(fakeTracking([], { addItem }));
    fireEvent.click(screen.getByTestId("checksheet-pick-item"));
    // Text outside a table cannot be chosen.
    expect([...document.querySelectorAll("[data-pickable]")].every((el) => el.closest("table"))).toBe(true);
    fireEvent.click(screen.getByLabelText("Track WIDG 101 Introduction to Widgetry"));
    expect(addItem).toHaveBeenCalledWith("doc_item", { block: 4, row: 1, col: 0 }, "WIDG 101 Introduction to Widgetry");
    view.unmount();

    const change = vi.fn();
    docView(
      fakeTracking(
        [testEntry({ key: "blockitem:4:1:0", id: 41, anchorType: "doc_item", anchor: { block: 4, row: 1, col: 0 }, status: "planned" })],
        { change },
      ),
    );
    const cell = screen.getByTestId("checksheet-doc-source-4-1-0");
    expect(cell.firstChild!.textContent).toBe("WIDG 101 Introduction to Widgetry");
    fireEvent.change(within(cell).getByTestId("checksheet-doc-item-4-1-0-status"), { target: { value: "completed" } });
    expect(change).toHaveBeenCalledWith("blockitem:4:1:0", { status: "completed" });
  });

  it("has no toolbar on a Word document without a table", () => {
    render(
      <ChecksheetDocumentView
        documentId={5}
        title="Notes"
        blocks={[{ type: "paragraph", runs: [{ text: "Only text." }] }]}
        tracking={fakeTracking([])}
        showTracking
      />,
    );
    expect(screen.queryByTestId("checksheet-pick-toolbar")).toBeNull();
  });
});

describe("markers on a page or picture", () => {
  const IDLE: MarkerMode = { placing: false, moving: null, open: null };

  function layer(options: { mode?: MarkerMode; entries?: ReturnType<typeof testEntry>[]; spies?: Parameters<typeof fakeTracking>[1]; size?: [number, number] } = {}) {
    const onModeChange = vi.fn();
    const [width, height] = options.size ?? [600, 800];
    const result = render(
      <div style={{ position: "relative", width, height }}>
        <PointMarkerLayer
          page={1}
          pageLabel="page 2"
          entries={options.entries ?? []}
          tracking={fakeTracking(options.entries ?? [], options.spies)}
          mode={options.mode ?? IDLE}
          onModeChange={onModeChange}
        />
      </div>,
    );
    const el = screen.getByTestId("checksheet-marker-layer-1");
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width, height, right: 100 + width, bottom: 50 + height, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
    return { el, onModeChange, ...result };
  }

  const marker = testEntry({ key: "id:21", id: 21, anchorType: "point", anchor: { page: 1, x: 0.25, y: 0.5 }, status: "completed", term: "fall", termYear: 2026 });

  it("places a marker by percentages of the page, so it holds its place at any zoom", () => {
    layer({ entries: [marker] });
    const el = screen.getByTestId("checksheet-marker-id:21");
    expect(el.style.left).toBe("25%");
    expect(el.style.top).toBe("50%");
    expect(el.style.left).not.toMatch(/px/);
  });

  it("is positioned identically whatever size the page is drawn at", () => {
    const small = layer({ entries: [marker], size: [320, 414] });
    const at = (el: HTMLElement) => [el.style.left, el.style.top];
    const first = at(screen.getByTestId("checksheet-marker-id:21"));
    small.unmount();
    layer({ entries: [marker], size: [1836, 2376] });
    expect(at(screen.getByTestId("checksheet-marker-id:21"))).toEqual(first);
  });

  it("shows only the markers of its own page", () => {
    layer({ entries: [marker, testEntry({ key: "id:22", id: 22, anchorType: "point", anchor: { page: 0, x: 0.1, y: 0.1 } })] });
    expect(screen.queryByTestId("checksheet-marker-id:21")).toBeTruthy();
    expect(screen.queryByTestId("checksheet-marker-id:22")).toBeNull();
  });

  it("says what it is: the student's tracking, with its status and quarter", () => {
    layer({ entries: [marker] });
    const el = screen.getByTestId("checksheet-marker-id:21");
    expect(el.getAttribute("aria-label")).toBe("My tracking, marker 1 on page 2: Completed, Fall 2026. Open to edit.");
    expect(el.textContent).toBe("F26");
    expect(el.tagName).toBe("BUTTON");
  });

  it("lets clicks through to the page when no marker is being placed", () => {
    const addPoint = vi.fn();
    const { el } = layer({ spies: { addPoint } });
    expect(el.getAttribute("data-targeting")).toBe("false");
    expect(el.className).toContain("pointer-events-none");
    fireEvent.click(el, { clientX: 400, clientY: 450 });
    expect(addPoint).not.toHaveBeenCalled();
  });

  it("turns a click into a position on the page, then opens the new marker", () => {
    const addPoint = vi.fn(() => "new:1");
    const { el, onModeChange } = layer({ mode: { placing: true, moving: null, open: null }, spies: { addPoint } });
    expect(el.getAttribute("data-targeting")).toBe("true");
    // The layer is 600x800 at (100, 50): this click is a quarter across, halfway down.
    fireEvent.click(el, { clientX: 250, clientY: 450 });
    expect(addPoint).toHaveBeenCalledWith({ page: 1, x: 0.25, y: 0.5 }, {});
    expect(onModeChange).toHaveBeenCalledWith({ placing: false, moving: null, open: "new:1" });
  });

  it("gives the same position for the same spot on a page drawn twice as large", () => {
    const addPoint = vi.fn(() => "new:1");
    const { el } = layer({ mode: { placing: true, moving: null, open: null }, spies: { addPoint }, size: [1200, 1600] });
    fireEvent.click(el, { clientX: 100 + 300, clientY: 50 + 800 });
    expect(addPoint).toHaveBeenCalledWith({ page: 1, x: 0.25, y: 0.5 }, {});
  });

  it("moves a marker to the next place clicked", () => {
    const movePoint = vi.fn();
    const addPoint = vi.fn();
    const { el, onModeChange } = layer({ entries: [marker], mode: { placing: false, moving: "id:21", open: null }, spies: { movePoint, addPoint } });
    fireEvent.click(el, { clientX: 100 + 540, clientY: 50 + 80 });
    expect(movePoint).toHaveBeenCalledWith("id:21", { page: 1, x: 0.9, y: 0.1 });
    expect(addPoint).not.toHaveBeenCalled();
    expect(onModeChange).toHaveBeenCalledWith({ placing: false, moving: null, open: "id:21" });
  });

  it("edits, nudges and removes a marker from its editor", () => {
    const change = vi.fn();
    const movePoint = vi.fn();
    const remove = vi.fn();
    layer({ entries: [marker], mode: { placing: false, moving: null, open: "id:21" }, spies: { change, movePoint, remove } });
    const editor = screen.getByTestId("checksheet-marker-editor-id:21");
    expect(editor.textContent).toMatch(/does not change the original document/);

    fireEvent.change(screen.getByTestId("checksheet-marker-status-id:21"), { target: { value: "planned" } });
    expect(change).toHaveBeenLastCalledWith("id:21", { status: "planned" });
    fireEvent.change(screen.getByTestId("checksheet-marker-term-id:21-term"), { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith("id:21", { term: null, termYear: null });
    fireEvent.change(screen.getByTestId("checksheet-marker-note-id:21"), { target: { value: "Took with lab" } });
    expect(change).toHaveBeenLastCalledWith("id:21", { note: "Took with lab" }, 700);

    fireEvent.click(screen.getByLabelText("Move marker 1 on page 2 right"));
    expect(movePoint).toHaveBeenLastCalledWith("id:21", { page: 1, x: 0.26, y: 0.5 }, 700);
    fireEvent.click(screen.getByLabelText("Move marker 1 on page 2 up"));
    expect(movePoint).toHaveBeenLastCalledWith("id:21", { page: 1, x: 0.25, y: 0.49 }, 700);

    fireEvent.click(screen.getByTestId("checksheet-marker-delete-id:21"));
    expect(remove).toHaveBeenCalledWith("id:21");
  });
});

describe("viewer controls", () => {
  const IDLE: MarkerMode = { placing: false, moving: null, open: null };
  const toolbar = (props: Partial<React.ComponentProps<typeof ViewerToolbar>> = {}) => {
    const spies = { onZoom: vi.fn(), onPage: vi.fn(), onModeChange: vi.fn(), onAddHere: vi.fn() };
    render(<ViewerToolbar zoom={1} page={1} pageCount={3} mode={IDLE} showTracking what="page" {...spies} {...props} />);
    return spies;
  };

  it("zooms in, out and back to fit", () => {
    const { onZoom } = toolbar();
    fireEvent.click(screen.getByTestId("checksheet-zoom-in"));
    expect(onZoom).toHaveBeenLastCalledWith(1.25);
    fireEvent.click(screen.getByTestId("checksheet-zoom-out"));
    expect(onZoom).toHaveBeenLastCalledWith(0.75);
    fireEvent.click(screen.getByTestId("checksheet-zoom-level"));
    expect(onZoom).toHaveBeenLastCalledWith(1);
    expect(screen.getByTestId("checksheet-zoom-level").textContent).toBe("100%");
  });

  it("stops at the smallest and largest zoom", () => {
    toolbar({ zoom: 3 });
    expect((screen.getByTestId("checksheet-zoom-in") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    toolbar({ zoom: 0.5 });
    expect((screen.getByTestId("checksheet-zoom-out") as HTMLButtonElement).disabled).toBe(true);
  });

  it("goes to a page by button or by number, within the document", () => {
    const { onPage } = toolbar({ page: 2 });
    fireEvent.click(screen.getByTestId("checksheet-page-next"));
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByTestId("checksheet-page-prev"));
    expect(onPage).toHaveBeenLastCalledWith(1);
    const input = screen.getByLabelText("Page");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPage).toHaveBeenLastCalledWith(3);
    expect(screen.getByTestId("checksheet-page-count").textContent).toBe("of 3");
  });

  it("has no page controls for a single page or a picture", () => {
    toolbar({ pageCount: 1 });
    expect(screen.queryByTestId("checksheet-page-next")).toBeNull();
    cleanup();
    toolbar({ page: undefined, pageCount: undefined, onPage: undefined, what: "picture" });
    expect(screen.queryByTestId("checksheet-page-input")).toBeNull();
  });

  it("starts and cancels placing a marker, and explains what to do", () => {
    const { onModeChange } = toolbar();
    const button = screen.getByTestId("checksheet-add-marker");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("checksheet-marker-instructions")).toBeNull();
    fireEvent.click(button);
    expect(onModeChange).toHaveBeenLastCalledWith({ placing: true, moving: null, open: null });
    cleanup();

    const placing = toolbar({ mode: { placing: true, moving: null, open: null } });
    expect(screen.getByTestId("checksheet-add-marker").textContent).toBe("Cancel");
    expect(screen.getByTestId("checksheet-marker-instructions").textContent).toMatch(/Click or tap the page next to the requirement/);
    fireEvent.click(screen.getByTestId("checksheet-add-marker"));
    expect(placing.onModeChange).toHaveBeenLastCalledWith({ placing: false, moving: null, open: null });
  });

  it("can add a marker without a pointer", () => {
    const { onAddHere } = toolbar({ mode: { placing: true, moving: null, open: null }, page: 2 });
    fireEvent.click(screen.getByTestId("checksheet-add-marker-here"));
    expect(onAddHere).toHaveBeenCalled();
    expect(screen.getByTestId("checksheet-add-marker-here").textContent).toBe("Add one to page 2 instead");
  });

  it("offers no marker control while only the original is shown", () => {
    toolbar({ showTracking: false });
    expect(screen.queryByTestId("checksheet-add-marker")).toBeNull();
  });
});

describe("My Tracking", () => {
  const onPlace = vi.fn();
  const panel = (entries: ReturnType<typeof testEntry>[], spies: Parameters<typeof fakeTracking>[1] = {}, onShowPlace = vi.fn()) =>
    render(
      <MyTrackingPanel
        documentId={1}
        tracking={fakeTracking(entries, spies)}
        describePlace={(entry) => `Marker on page ${(entry.anchor.page ?? 0) + 1}`}
        onShowPlace={onShowPlace}
        onPlace={onPlace}
        inlineAvailable={false}
        pointsAvailable
      />,
    );

  it("explains that these are the student's own notes and the file is not changed", () => {
    panel([]);
    expect(screen.getByRole("heading", { name: "My Tracking" })).toBeTruthy();
    expect(screen.getByTestId("checksheet-tracking-help").textContent).toMatch(/never change the original file/);
    expect(screen.getByTestId("checksheet-manual-empty")).toBeTruthy();
  });

  it("adds an item to the student's list", () => {
    const addManual = vi.fn(() => "new:1");
    panel([], { addManual });
    const submit = screen.getByTestId("checksheet-manual-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Requirement or item"), { target: { value: "  Upper-division elective " } });
    fireEvent.click(submit);
    expect(addManual).toHaveBeenCalledWith("Upper-division elective");
    expect((screen.getByLabelText("Requirement or item") as HTMLInputElement).value).toBe("");
  });

  it("edits a list entry: name, status, quarter, note; and removes it", () => {
    const change = vi.fn();
    const remove = vi.fn();
    panel([testEntry({ key: "id:5", id: 5, itemLabel: "Widget Ethics", status: "planned", term: "spring", termYear: 2027, note: "Ask advisor" })], { change, remove });
    const row = screen.getByTestId("checksheet-entry-id:5");
    expect((within(row).getByTestId("checksheet-entry-label-id:5") as HTMLInputElement).value).toBe("Widget Ethics");
    expect((within(row).getByLabelText("My status for Widget Ethics") as HTMLSelectElement).value).toBe("planned");
    expect((within(row).getByLabelText("My quarter for Widget Ethics: quarter") as HTMLSelectElement).value).toBe("spring");
    expect((within(row).getByLabelText("Note for Widget Ethics") as HTMLInputElement).value).toBe("Ask advisor");

    fireEvent.change(within(row).getByLabelText("My status for Widget Ethics"), { target: { value: "completed" } });
    expect(change).toHaveBeenLastCalledWith("id:5", { status: "completed" });
    fireEvent.change(within(row).getByLabelText("My status for Widget Ethics"), { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith("id:5", { status: null });
    fireEvent.change(within(row).getByTestId("checksheet-entry-label-id:5"), { target: { value: "Widget Ethics (WIDG 130)" } });
    expect(change).toHaveBeenLastCalledWith("id:5", { itemLabel: "Widget Ethics (WIDG 130)" }, 700);
    fireEvent.change(within(row).getByLabelText("Note for Widget Ethics"), { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith("id:5", { note: null }, 700);

    fireEvent.click(within(row).getByLabelText("Remove the entry for Widget Ethics"));
    expect(remove).toHaveBeenCalledWith("id:5");
  });

  it("does not save an empty name", () => {
    const change = vi.fn();
    panel([testEntry({ key: "id:5", id: 5, itemLabel: "Widget Ethics" })], { change });
    const input = screen.getByTestId("checksheet-entry-label-id:5") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input.value).toBe("Widget Ethics");
  });

  it("lists the markers on the page so each can be edited without a pointer", () => {
    const change = vi.fn();
    const onShowPlace = vi.fn();
    const point = testEntry({ key: "id:21", id: 21, anchorType: "point", anchor: { page: 1, x: 0.25, y: 0.5 }, status: "completed" });
    panel([point], { change }, onShowPlace);
    const list = screen.getByTestId("checksheet-marker-list");
    expect(list.textContent).toContain("Marker on page 2");
    fireEvent.change(within(list).getByLabelText("My status for Marker on page 2"), { target: { value: "in_progress" } });
    expect(change).toHaveBeenLastCalledWith("id:21", { status: "in_progress" });
    fireEvent.click(within(list).getByText("Show"));
    expect(onShowPlace).toHaveBeenCalledWith(point);
  });

  it("sets aside entries a replacement could not keep in place, to keep or remove", () => {
    const keepAsListEntry = vi.fn();
    const remove = vi.fn();
    panel(
      [
        testEntry({ key: "id:31", id: 31, anchorType: "sheet_cell", detached: true, itemLabel: "Introduction to Widgetry", status: "completed" }),
        testEntry({ key: "id:32", id: 32, anchorType: "point", detached: true, itemLabel: "Marker on page 2", term: "fall", termYear: 2025 }),
      ],
      { keepAsListEntry, remove },
    );
    const box = screen.getByTestId("checksheet-detached");
    expect(box.textContent).toContain("2 entries were made on the previous file");
    expect(box.textContent).toContain("not shown on the new document");
    expect(box.textContent).toContain("Introduction to Widgetry · Completed");
    expect(box.textContent).toContain("Marker on page 2 · Fall 2025");
    // A detached marker is not among the markers on the document.
    expect(screen.queryByTestId("checksheet-marker-list")).toBeNull();

    // A marker can be put back by the student; a cell entry cannot be dropped onto a page.
    expect(screen.queryByTestId("checksheet-detached-place-id:31")).toBeNull();
    fireEvent.click(screen.getByTestId("checksheet-detached-place-id:32"));
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ key: "id:32" }));

    fireEvent.click(screen.getByTestId("checksheet-detached-keep-id:31"));
    expect(keepAsListEntry).toHaveBeenCalledWith("id:31");
    fireEvent.click(screen.getByLabelText("Remove the entry for Marker on page 2"));
    expect(remove).toHaveBeenCalledWith("id:32");
  });
});

describe("save state", () => {
  it("says Saving, Saved, and Could not save with a way to try again", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SaveIndicator state={{ status: "saving", failedKeys: [] }} onRetry={onRetry} testId="save" />);
    const el = screen.getByTestId("save");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.textContent).toBe("Saving…");
    rerender(<SaveIndicator state={{ status: "saved", failedKeys: [] }} onRetry={onRetry} testId="save" />);
    expect(el.textContent).toBe("Saved");
    rerender(<SaveIndicator state={{ status: "error", failedKeys: ["id:1"] }} onRetry={onRetry} testId="save" />);
    expect(el.textContent).toContain("Could not save");
    fireEvent.click(within(el).getByText("Try again"));
    expect(onRetry).toHaveBeenCalled();
    rerender(<SaveIndicator state={{ status: "idle", failedKeys: [] }} onRetry={onRetry} testId="save" />);
    expect(el.textContent).toBe("");
  });
});
