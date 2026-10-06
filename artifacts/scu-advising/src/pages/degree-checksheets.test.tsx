// @vitest-environment jsdom
/**
 * The Degree Checksheets page: every uploaded document in its own collapsible
 * container, with its details, its upload date and its own actions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DegreeChecksheetAnnotation, DegreeChecksheetList, DegreeChecksheetRender } from "@workspace/api-client-react";
import {
  imageRender,
  pdfRender,
  spreadsheetRender,
  testAnnotation,
  testDocument,
} from "@/components/degree-checksheets/checksheet-test-data";

let listQuery: { data?: DegreeChecksheetList; isLoading: boolean; isError: boolean; refetch: () => void };
let renders: Record<number, DegreeChecksheetRender | null>;
let annotations: Record<number, DegreeChecksheetAnnotation[]>;
let renderFails: Set<number>;
const renderRequests: number[] = [];
const annotationRequests: number[] = [];
const deleteMutate = vi.fn();
const updateMutate = vi.fn();
const api = {
  createAnnotation: vi.fn(),
  updateAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
  uploadUrl: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
};

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>("@workspace/api-client-react");
  return {
    ...actual,
    useListDegreeChecksheets: () => listQuery,
    useGetDegreeChecksheetRender: (id: number, options: { query: { enabled: boolean } }) => {
      if (!options.query.enabled) return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
      renderRequests.push(id);
      if (renderFails.has(id)) return { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
      return {
        data: { document: testDocument({ id }), render: renders[id] ?? null },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    },
    useListDegreeChecksheetAnnotations: (id: number, options: { query: { enabled: boolean } }) => {
      if (!options.query.enabled) return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
      annotationRequests.push(id);
      return { data: stableAnnotations(id), isLoading: false, isError: false, refetch: vi.fn() };
    },
    useDeleteDegreeChecksheet: (options: { mutation: { onSuccess: () => void } }) => ({
      mutate: (args: unknown) => {
        deleteMutate(args);
        options.mutation.onSuccess();
      },
      isPending: false,
    }),
    useUpdateDegreeChecksheet: (options: { mutation: { onSuccess: () => void } }) => ({
      mutate: (args: unknown) => {
        updateMutate(args);
        options.mutation.onSuccess();
      },
      isPending: false,
    }),
    useGetProfile: () => ({
      data: { major: "Finance", secondMajor: "Mathematics", minor: "Undeclared", additionalMajors: [], additionalMinors: ["Data Science"] },
    }),
    createDegreeChecksheetAnnotation: (...args: unknown[]) => api.createAnnotation(...args),
    updateDegreeChecksheetAnnotation: (...args: unknown[]) => api.updateAnnotation(...args),
    deleteDegreeChecksheetAnnotation: (...args: unknown[]) => api.deleteAnnotation(...args),
    requestDegreeChecksheetUploadUrl: (...args: unknown[]) => api.uploadUrl(...args),
    createDegreeChecksheet: (...args: unknown[]) => api.create(...args),
    replaceDegreeChecksheetFile: (...args: unknown[]) => api.replace(...args),
  };
});

/** The same object for the same list, as a real query returns until it refetches. */
const annotationCache = new Map<number, { source: DegreeChecksheetAnnotation[]; data: unknown }>();
const NO_ANNOTATIONS: DegreeChecksheetAnnotation[] = [];
function stableAnnotations(id: number) {
  const source = annotations[id] ?? NO_ANNOTATIONS;
  const cached = annotationCache.get(id);
  if (cached?.source === source) return cached.data;
  const data = { maxAnnotations: 500, annotations: source };
  annotationCache.set(id, { source, data });
  return data;
}

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/hooks/use-track-usage", () => ({ useTrackUsage: () => {} }));
// These tests are about the page's own content (the center region). The comparison shell, the Planning Requirements and the compact APR have their own tests.
vi.mock("@/components/degree-plan/PlanningComparisonWorkspace", () => ({
  PlanningComparisonWorkspace: ({ main }: { main: React.ReactNode }) => <>{main}</>,
}));
// The PDF library needs a real browser; its viewer is covered by the browser tests.
vi.mock("@/components/degree-checksheets/ChecksheetPdfView", () => ({
  default: ({ documentId, pages, showTracking }: { documentId: number; pages: unknown[]; showTracking: boolean }) => (
    <div data-testid={`checksheet-pdf-${documentId}`} data-pages={pages.length} data-tracking={String(showTracking)} />
  ),
}));

import DegreeChecksheetsPage from "./degree-checksheets";

const MAJOR = testDocument({ id: 1 });
const MINOR = testDocument({
  id: 2,
  title: "Sprocket Studies Minor Checksheet",
  category: "minor_checksheet",
  programName: "Sprocket Studies",
  programRole: "minor",
  school: null,
  academicYearLabel: null,
  uploadedAt: "2026-09-23T18:00:00.000Z",
  fileFingerprint: "bbbbbbbbbbbb",
});
const PLAN = testDocument({
  id: 3,
  title: "Widget Engineering Four-Year Plan",
  category: "four_year_plan",
  programName: null,
  programRole: null,
  school: null,
  academicYearLabel: "2024 Curriculum",
  sourceFormat: "pdf",
  previewKind: "pdf",
  inlineTracking: false,
  fileName: "plan.pdf",
  mimeType: "application/pdf",
  sourceUrl: "https://www.scu.edu/engineering/plan",
  fileFingerprint: "cccccccccccc",
});
const FLOW = testDocument({
  id: 4,
  title: "Widget Flowchart",
  category: "flowchart",
  programName: null,
  programRole: "general",
  school: null,
  academicYearLabel: null,
  sourceFormat: "png",
  previewKind: "image",
  inlineTracking: false,
  fileName: "flow.png",
  mimeType: "image/png",
  fileFingerprint: "dddddddddddd",
});
const OLD = testDocument({
  id: 5,
  title: "Old format sheet",
  category: "other",
  programName: null,
  programRole: null,
  school: null,
  academicYearLabel: null,
  sourceFormat: "xls",
  previewKind: null,
  inlineTracking: false,
  renderStatus: "original_only",
  renderNoteCode: "legacy_xls_no_preview",
  renderNoteMessage: "This is the older Excel format (.xls). It is stored and you can open the original, but CampusVal cannot preview it.",
  fileName: "old.xls",
  fileFingerprint: "eeeeeeeeeeee",
});

const library = (documents = [MAJOR, MINOR, PLAN, FLOW]): DegreeChecksheetList => ({
  available: true,
  maxUploadBytes: 20 * 1024 * 1024,
  maxDocuments: 30,
  acceptedExtensions: [".pdf", ".xlsx", ".xls", ".docx", ".png", ".jpg", ".jpeg"],
  documents,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DegreeChecksheetsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listQuery = { data: library(), isLoading: false, isError: false, refetch: vi.fn() };
  renders = { 1: spreadsheetRender, 2: spreadsheetRender, 3: pdfRender, 4: imageRender };
  annotations = {};
  annotationCache.clear();
  renderFails = new Set();
  renderRequests.length = 0;
  annotationRequests.length = 0;
  deleteMutate.mockClear();
  updateMutate.mockClear();
  for (const fn of Object.values(api)) fn.mockReset();
  api.createAnnotation.mockImplementation(async (_doc: number, body: Partial<DegreeChecksheetAnnotation>) =>
    testAnnotation({ id: 900, revision: 1, ...body, field: "status" }),
  );
  api.updateAnnotation.mockImplementation(async (_doc: number, id: number, body: Partial<DegreeChecksheetAnnotation>) =>
    testAnnotation({ id, revision: 2, ...body }),
  );
  api.deleteAnnotation.mockResolvedValue({ deleted: true });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const card = (id: number) => screen.getByTestId(`checksheet-document-${id}`);
const toggle = (id: number) => screen.getByTestId(`checksheet-toggle-${id}`);
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe("the page", () => {
  it("is called Degree Checksheets, and says what it is for", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Degree Checksheets");
    const help = screen.getByTestId("card-checksheets-help").textContent!;
    expect(help).toMatch(/advising resources published by SCU departments/);
    expect(help).toMatch(/You choose/);
    expect(help).toMatch(/original document is never changed/);
    expect(help).toContain("Workday is the definitive reference for degree completion.");
  });

  it("never claims to know which document applies, or that one is official or current", () => {
    renderPage();
    fireEvent.click(toggle(1));
    const text = document.body.textContent!.toLowerCase();
    for (const claim of [
      "your correct checksheet",
      "applies to you",
      "latest checksheet",
      "official status",
      "verified",
      "requirement met",
      "current requirements",
      "department updated",
      "source of truth",
    ]) {
      expect(text, claim).not.toContain(claim);
    }
    // The one warning about authority appears once, not on every card.
    expect(text.split("definitive reference").length - 1).toBe(1);
  });

  it("links to the official SCU checksheets page, safely, in a new tab", () => {
    renderPage();
    const link = screen.getByTestId("link-scu-checksheets");
    expect(link.getAttribute("href")).toBe("https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toBe("Find SCU Degree Checksheets");
    expect(link.getAttribute("aria-label")).toMatch(/official SCU website \(opens in a new tab\)/);
  });
});

describe("with nothing uploaded", () => {
  beforeEach(() => {
    listQuery = { data: library([]), isLoading: false, isError: false, refetch: vi.fn() };
  });

  it("shows an empty state with both actions", () => {
    renderPage();
    const empty = screen.getByTestId("card-checksheets-empty");
    expect(empty.textContent).toMatch(/Upload major and minor checksheets, four-year plans, flowcharts, and other department advising\s+resources so you can reference them while planning\./);
    expect(within(empty).getByTestId("button-upload-checksheet").textContent).toBe("Upload Checksheet");
    expect(within(empty).getByTestId("link-scu-checksheets")).toBeTruthy();
    expect(screen.queryByTestId("checksheet-document-list")).toBeNull();
  });

  it("opens the upload dialog", () => {
    renderPage();
    expect(screen.queryByTestId("checksheet-upload-dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("button-upload-checksheet"));
    expect(screen.getByTestId("checksheet-upload-dialog")).toBeTruthy();
  });
});

describe("states", () => {
  it("shows a loading state that holds the page's shape", () => {
    listQuery = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderPage();
    expect(screen.getByTestId("status-loading").getAttribute("role")).toBe("status");
    expect(screen.queryByTestId("card-checksheets-empty")).toBeNull();
  });

  it("offers to try again when the list cannot be loaded", () => {
    const refetch = vi.fn();
    listQuery = { data: undefined, isLoading: false, isError: true, refetch };
    renderPage();
    fireEvent.click(within(screen.getByTestId("card-checksheets-load-error")).getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("explains when uploads are not set up, and still links to SCU", () => {
    listQuery = { data: { ...library([]), available: false }, isLoading: false, isError: false, refetch: vi.fn() };
    renderPage();
    const box = screen.getByTestId("card-storage-unavailable");
    expect(box.textContent).toMatch(/File uploads aren't configured/);
    expect((within(box).getByTestId("button-upload-checksheet") as HTMLButtonElement).disabled).toBe(true);
    expect(within(box).getByTestId("link-scu-checksheets")).toBeTruthy();
  });

  it("stops offering uploads at the document limit", () => {
    listQuery = { data: { ...library(), maxDocuments: 4 }, isLoading: false, isError: false, refetch: vi.fn() };
    renderPage();
    expect((screen.getByTestId("button-upload-checksheet") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the library", () => {
  it("lists every document with its title, details and upload date", () => {
    renderPage();
    expect(screen.getByTestId("checksheet-document-count").textContent).toMatch(/^4 documents uploaded/);
    const major = within(card(1));
    expect(major.getByTestId("checksheet-title").textContent).toBe("Applied Widgetry Major Checksheet");
    expect(major.getByTestId("checksheet-summary").textContent).toBe(
      "Major Checksheet · Applied Widgetry · Major · Sample School of Widgets",
    );
    expect(major.getByTestId("checksheet-year").textContent).toBe("Fall 2025 and Later");
    expect(major.getByTestId("checksheet-uploaded").textContent).toMatch(/^Uploaded Sep 2[89], 2026$/);
    expect(major.getByTestId("checksheet-status").textContent).toBe("Ready");

    const minor = within(card(2));
    expect(minor.getByTestId("checksheet-summary").textContent).toBe("Minor Checksheet · Sprocket Studies · Minor");
    expect(minor.getByTestId("checksheet-uploaded").textContent).toMatch(/^Uploaded Sep 23, 2026$/);
    // Details that were not given are simply absent.
    expect(minor.queryByTestId("checksheet-year")).toBeNull();
    expect(within(card(3)).getByTestId("checksheet-year").textContent).toBe("2024 Curriculum");
  });

  it("keeps the order the server gives it", () => {
    renderPage();
    const ids = [...screen.getByTestId("checksheet-document-list").querySelectorAll("[data-checksheet-card]")].map((el) =>
      el.getAttribute("data-checksheet-card"),
    );
    expect(ids).toEqual(["1", "2", "3", "4"]);
  });

  it("starts collapsed, and loads no preview or tracking until a document is opened", () => {
    renderPage();
    for (const id of [1, 2, 3, 4]) {
      expect(toggle(id).getAttribute("aria-expanded")).toBe("false");
      expect(document.getElementById(toggle(id).getAttribute("aria-controls")!)!.hidden).toBe(true);
    }
    expect(renderRequests).toEqual([]);
    expect(annotationRequests).toEqual([]);
    expect(screen.queryByTestId("checksheet-grid")).toBeNull();
  });

  it("opens the only document straight away", () => {
    listQuery = { data: library([MAJOR]), isLoading: false, isError: false, refetch: vi.fn() };
    renderPage();
    expect(toggle(1).getAttribute("aria-expanded")).toBe("true");
    expect(within(card(1)).getByTestId("checksheet-grid")).toBeTruthy();
  });

  it("expands and collapses one document without touching the others", () => {
    renderPage();
    fireEvent.click(toggle(2));
    expect(toggle(2).getAttribute("aria-expanded")).toBe("true");
    expect(toggle(1).getAttribute("aria-expanded")).toBe("false");
    expect(within(card(2)).getByTestId("checksheet-grid")).toBeTruthy();
    expect(new Set(renderRequests)).toEqual(new Set([2]));

    fireEvent.click(toggle(2));
    expect(toggle(2).getAttribute("aria-expanded")).toBe("false");
    expect(within(card(2)).queryByTestId("checksheet-grid")).toBeNull();
  });

  it("shows each format with its own viewer", () => {
    renderPage();
    fireEvent.click(toggle(1));
    expect(within(card(1)).getByTestId("checksheet-spreadsheet-1")).toBeTruthy();
    fireEvent.click(toggle(4));
    expect(within(card(4)).getByTestId("checksheet-image-4")).toBeTruthy();
    expect(within(card(4)).getByTestId("checksheet-image").getAttribute("src")).toMatch(/api\/degree-checksheets\/4\/file\?v=1-0$/);
  });

  it("loads the PDF viewer only when a PDF is opened", async () => {
    renderPage();
    expect(screen.queryByTestId("checksheet-pdf-3")).toBeNull();
    fireEvent.click(toggle(3));
    const pdf = await screen.findByTestId("checksheet-pdf-3");
    expect(pdf.getAttribute("data-pages")).toBe("2");
  });

  it("says plainly when a document has no preview, and still offers tracking", () => {
    listQuery = { data: library([MAJOR, OLD]), isLoading: false, isError: false, refetch: vi.fn() };
    renderPage();
    expect(within(card(5)).getByTestId("checksheet-status").textContent).toBe("Stored, no preview");
    fireEvent.click(toggle(5));
    const notice = within(card(5)).getByTestId("checksheet-no-preview-5");
    expect(notice.textContent).toMatch(/cannot preview it/);
    expect(notice.textContent).toMatch(/Open original/);
    expect(within(card(5)).getByTestId("checksheet-my-tracking-5")).toBeTruthy();
    expect(renderRequests).not.toContain(5);
  });

  it("a document whose preview fails shows its own message; the rest of the page is fine", () => {
    renderFails.add(1);
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.click(toggle(2));
    expect(within(card(1)).getByTestId("checksheet-preview-error").textContent).toMatch(/original file is still available/);
    expect(within(card(1)).getByTestId("checksheet-my-tracking-1")).toBeTruthy();
    expect(within(card(2)).getByTestId("checksheet-grid")).toBeTruthy();
    expect(screen.getAllByTestId(/^checksheet-document-\d+$/)).toHaveLength(4);
  });

  it("offers filters once there are enough documents, and only for the types present", () => {
    renderPage();
    const filters = within(screen.getByTestId("checksheet-filters"));
    expect(filters.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "All4",
      "Major checksheets1",
      "Minor checksheets1",
      "Four-year plans1",
      "Flowcharts1",
    ]);
    fireEvent.click(filters.getByTestId("checksheet-filter-minor_checksheet"));
    expect(screen.getAllByTestId(/^checksheet-document-\d+$/).map((el) => el.getAttribute("data-checksheet-card"))).toEqual(["2"]);
    expect(filters.getByTestId("checksheet-filter-minor_checksheet").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(filters.getByTestId("checksheet-filter-all"));
    expect(screen.getAllByTestId(/^checksheet-document-\d+$/)).toHaveLength(4);
  });

  it("does not clutter a small library with filters", () => {
    listQuery = { data: library([MAJOR, MINOR]), isLoading: false, isError: false, refetch: vi.fn() };
    renderPage();
    expect(screen.queryByTestId("checksheet-filters")).toBeNull();
  });
});

describe("a document's actions", () => {
  it("opens the original file of that document, in a new tab", () => {
    renderPage();
    const link = screen.getByTestId("checksheet-original-3");
    expect(link.getAttribute("href")).toMatch(/api\/degree-checksheets\/3\/file$/);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toBe("Open the original file of Widget Engineering Four-Year Plan (opens in a new tab)");
  });

  it("renames one document", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("checksheet-rename-2"));
    const form = within(card(2)).getByTestId("checksheet-rename-form");
    const input = within(form).getByTestId("checksheet-rename-input") as HTMLInputElement;
    expect(input.value).toBe("Sprocket Studies Minor Checksheet");
    fireEvent.change(input, { target: { value: "  Sprocket Minor (my plan) " } });
    fireEvent.click(within(form).getByTestId("checksheet-rename-save"));
    expect(updateMutate).toHaveBeenCalledWith({ id: 2, data: { title: "Sprocket Minor (my plan)" } });
    expect(within(card(2)).queryByTestId("checksheet-rename-form")).toBeNull();
  });

  it("will not save an empty title", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("checksheet-rename-1"));
    fireEvent.change(screen.getByTestId("checksheet-rename-input"), { target: { value: "   " } });
    expect((screen.getByTestId("checksheet-rename-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("edits the details of one document, offering the student's programs as suggestions", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("checksheet-details-2"));
    const form = within(within(card(2)).getByTestId("checksheet-details-form"));
    expect((form.getByTestId("checksheet-field-category") as HTMLSelectElement).value).toBe("minor_checksheet");
    const suggestions = [...form.getByTestId("checksheet-program-suggestions").querySelectorAll("option")].map((o) => o.value);
    // The student's programs, not "Undeclared"; and any other program may be typed.
    expect(suggestions).toEqual(["Finance", "Mathematics", "Data Science"]);

    fireEvent.change(form.getByTestId("checksheet-field-program"), { target: { value: "Hypothetical Program" } });
    fireEvent.change(form.getByTestId("checksheet-field-year"), { target: { value: "Prior to Fall 2025" } });
    fireEvent.change(form.getByTestId("checksheet-field-role"), { target: { value: "additional_minor" } });
    fireEvent.change(form.getByTestId("checksheet-field-category"), { target: { value: "advising_resource" } });
    fireEvent.change(form.getByTestId("checksheet-field-school"), { target: { value: "" } });
    fireEvent.change(form.getByTestId("checksheet-field-url"), { target: { value: "https://www.scu.edu/sprockets" } });
    fireEvent.click(form.getByTestId("checksheet-details-save"));
    expect(updateMutate).toHaveBeenCalledWith({
      id: 2,
      data: {
        title: "Sprocket Studies Minor Checksheet",
        category: "advising_resource",
        programName: "Hypothetical Program",
        programRole: "additional_minor",
        school: null,
        academicYearLabel: "Prior to Fall 2025",
        sourceUrl: "https://www.scu.edu/sprockets",
      },
    });
    expect(form.getByTestId("checksheet-details-help").textContent).toMatch(/does not use them to decide which requirements apply/);
  });

  it("will not save a link that is not a web address", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("checksheet-details-1"));
    fireEvent.change(screen.getByTestId("checksheet-field-url"), { target: { value: "javascript:alert(1)" } });
    expect(screen.getByTestId("checksheet-field-url-problem").textContent).toMatch(/https:\/\//);
    expect((screen.getByTestId("checksheet-details-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a recorded source link as a safe link, and never an unsafe one", () => {
    listQuery = {
      data: library([PLAN, testDocument({ id: 9, title: "Bad link", sourceUrl: "javascript:alert(1)" })]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();
    fireEvent.click(toggle(3));
    fireEvent.click(toggle(9));
    const link = within(screen.getByTestId("checksheet-source-3")).getByRole("link");
    expect(link.getAttribute("href")).toBe("https://www.scu.edu/engineering/plan");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByTestId("checksheet-source-9")).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("asks before deleting, and deletes only that document", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("checksheet-delete-2"));
    const dialog = screen.getByTestId("checksheet-delete-dialog");
    expect(dialog.textContent).toContain("Delete “Sprocket Studies Minor Checksheet”?");
    expect(dialog.textContent).toMatch(/its uploaded file and the tracking you entered/);
    expect(dialog.textContent).toMatch(/Your other documents, your plans and your Academic Progress Reports are not changed/);
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("checksheet-delete-cancel"));
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("checksheet-delete-2"));
    fireEvent.click(screen.getByTestId("checksheet-delete-confirm"));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate).toHaveBeenCalledWith({ id: 2 });
  });

  it("explains what replacing does to tracking before it is done", () => {
    annotations[1] = [
      testAnnotation({ id: 11, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "completed" }),
      testAnnotation({ id: 12, anchorType: "manual", itemLabel: "Elective", status: "planned" }),
    ];
    renderPage();
    fireEvent.click(screen.getByTestId("checksheet-replace-1"));
    const form = within(card(1)).getByTestId("checksheet-replace-form");
    expect(form.textContent).toMatch(/Only this document is replaced/);
    expect(form.textContent).toMatch(/Your current file stays in place until the new one has been checked/);
    expect(within(form).getByTestId("checksheet-replace-tracking-note").textContent).toMatch(
      /You have 1 tracking entry placed on this document.*Your own list is always kept/s,
    );
    expect((within(form).getByTestId("checksheet-replace-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(within(card(2)).queryByTestId("checksheet-replace-form")).toBeNull();
  });
});

describe("tracking on the page", () => {
  it("shows what was saved, on the right document only", () => {
    annotations[1] = [
      testAnnotation({ id: 11, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "in_progress" }),
      testAnnotation({ id: 12, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 3 }, field: "term", term: "winter", termYear: 2027 }),
    ];
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.click(toggle(2));
    const value = (id: number, testId: string) => (within(card(id)).getByTestId(testId) as HTMLSelectElement).value;
    expect(value(1, "checksheet-cell-status-0-4-2")).toBe("in_progress");
    expect(value(1, "checksheet-cell-term-0-4-3-term")).toBe("winter");
    expect(value(1, "checksheet-cell-term-0-4-3-year")).toBe("2027");
    // The same cell of another document is empty.
    expect(value(2, "checksheet-cell-status-0-4-2")).toBe("");
    expect(within(card(1)).getByTestId("checksheet-cell-count").textContent).toMatch(/^2 entries filled in directly/);
  });

  it("saves a choice at once and says Saved", async () => {
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.change(within(card(1)).getByTestId("checksheet-cell-status-0-5-2"), { target: { value: "completed" } });
    expect(api.createAnnotation).toHaveBeenCalledWith(1, {
      anchorType: "sheet_cell",
      anchor: { sheet: 0, row: 5, col: 2 },
      status: "completed",
    });
    await settle();
    await waitFor(() => expect(within(card(1)).getByTestId("checksheet-save-1").textContent).toBe("Saved"));
    expect((within(card(1)).getByTestId("checksheet-cell-status-0-5-2") as HTMLSelectElement).value).toBe("completed");
  });

  it("keeps an entry through collapse and expand", async () => {
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.change(within(card(1)).getByTestId("checksheet-cell-status-0-4-2"), { target: { value: "planned" } });
    await settle();
    fireEvent.click(toggle(1));
    expect(within(card(1)).queryByTestId("checksheet-grid")).toBeNull();
    fireEvent.click(toggle(1));
    expect((within(card(1)).getByTestId("checksheet-cell-status-0-4-2") as HTMLSelectElement).value).toBe("planned");
    // It was created once, not again on reopening.
    expect(api.createAnnotation).toHaveBeenCalledTimes(1);
  });

  it("changes a saved entry with the revision it was loaded at", async () => {
    annotations[1] = [
      testAnnotation({ id: 11, revision: 4, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "planned" }),
    ];
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.change(within(card(1)).getByTestId("checksheet-cell-status-0-4-2"), { target: { value: "completed" } });
    expect(api.updateAnnotation).toHaveBeenCalledWith(1, 11, { status: "completed", expectedRevision: 4 });
    await settle();
  });

  it("clearing a cell removes its entry", async () => {
    annotations[1] = [
      testAnnotation({ id: 11, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "planned" }),
    ];
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.change(within(card(1)).getByTestId("checksheet-cell-status-0-4-2"), { target: { value: "" } });
    expect(api.deleteAnnotation).toHaveBeenCalledWith(1, 11);
    expect(api.updateAnnotation).not.toHaveBeenCalled();
    await settle();
    expect((within(card(1)).getByTestId("checksheet-cell-status-0-4-2") as HTMLSelectElement).value).toBe("");
  });

  it("says Could not save, keeps what was chosen, and saves it on Try again", async () => {
    api.createAnnotation.mockRejectedValueOnce(new Error("network"));
    renderPage();
    fireEvent.click(toggle(1));
    fireEvent.change(within(card(1)).getByTestId("checksheet-cell-status-0-4-2"), { target: { value: "completed" } });
    await settle();
    const indicator = within(card(1)).getByTestId("checksheet-save-1");
    await waitFor(() => expect(indicator.textContent).toContain("Could not save"));
    expect((within(card(1)).getByTestId("checksheet-cell-status-0-4-2") as HTMLSelectElement).value).toBe("completed");

    fireEvent.click(within(indicator).getByText("Try again"));
    await settle();
    await waitFor(() => expect(indicator.textContent).toBe("Saved"));
    expect(api.createAnnotation).toHaveBeenCalledTimes(2);
  });

  it("'Show original only' hides the student's entries and the My Tracking list", () => {
    annotations[1] = [
      testAnnotation({ id: 11, anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, field: "status", status: "in_progress" }),
    ];
    renderPage();
    fireEvent.click(toggle(1));
    expect(within(card(1)).getByTestId("checksheet-source-notice").textContent).toMatch(/shown as you uploaded it and is never changed/);
    const button = within(card(1)).getByTestId("checksheet-toggle-tracking-1");
    expect(button.textContent).toBe("Show original only");
    fireEvent.click(button);
    expect(within(card(1)).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(card(1)).queryByTestId("checksheet-my-tracking-1")).toBeNull();
    expect(within(card(1)).getByTestId("checksheet-grid").textContent).toContain("Introduction to Widgetry");
    expect(button.textContent).toBe("Show my tracking");
    fireEvent.click(button);
    expect((within(card(1)).getByTestId("checksheet-cell-status-0-4-2") as HTMLSelectElement).value).toBe("in_progress");
  });

  it("adds a list entry to a PDF, which has no cells to fill in", async () => {
    api.createAnnotation.mockImplementation(async (_doc: number, body: Partial<DegreeChecksheetAnnotation>) =>
      testAnnotation({ id: 901, ...body }),
    );
    renderPage();
    fireEvent.click(toggle(3));
    await screen.findByTestId("checksheet-pdf-3");
    const panel = within(within(card(3)).getByTestId("checksheet-my-tracking-3"));
    fireEvent.change(panel.getByTestId("checksheet-manual-label"), { target: { value: "WIDG 190 Capstone" } });
    fireEvent.click(panel.getByTestId("checksheet-manual-submit"));
    expect(api.createAnnotation).toHaveBeenCalledWith(3, { anchorType: "manual", anchor: {}, itemLabel: "WIDG 190 Capstone" });
    await settle();
    fireEvent.change(panel.getByLabelText("My status for WIDG 190 Capstone"), { target: { value: "planned" } });
    await settle();
    expect(api.updateAnnotation).toHaveBeenCalledWith(3, 901, { status: "planned", expectedRevision: 1 });
  });
});

describe("uploading", () => {
  const file = (name: string, type: string, size = 2048) => {
    const f = new File([new Uint8Array(size)], name, { type });
    return f;
  };

  function openDialog() {
    renderPage();
    fireEvent.click(screen.getByTestId("button-upload-checksheet"));
    return within(screen.getByTestId("checksheet-upload-dialog"));
  }

  it("needs only a file and a title, and suggests the title from the file name", () => {
    const dialog = openDialog();
    const submit = dialog.getByTestId("checksheet-upload-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(dialog.getByTestId("checksheet-input-file"), {
      target: { files: [file("finance_major-checksheet.pdf", "application/pdf")] },
    });
    expect((dialog.getByTestId("checksheet-field-title") as HTMLInputElement).value).toBe("finance major checksheet");
    expect(submit.disabled).toBe(false);
    // Nothing else was filled in from the file.
    expect((dialog.getByTestId("checksheet-field-program") as HTMLInputElement).value).toBe("");
    expect((dialog.getByTestId("checksheet-field-year") as HTMLInputElement).value).toBe("");
    expect((dialog.getByTestId("checksheet-field-role") as HTMLSelectElement).value).toBe("");
    fireEvent.change(dialog.getByTestId("checksheet-field-title"), { target: { value: "" } });
    expect(submit.disabled).toBe(true);
  });

  it("keeps a title the student typed when a file is chosen afterwards", () => {
    const dialog = openDialog();
    fireEvent.change(dialog.getByTestId("checksheet-field-title"), { target: { value: "My Finance Checksheet" } });
    fireEvent.change(dialog.getByTestId("checksheet-input-file"), { target: { files: [file("x.pdf", "application/pdf")] } });
    expect((dialog.getByTestId("checksheet-field-title") as HTMLInputElement).value).toBe("My Finance Checksheet");
  });

  it("refuses an unsupported file before anything is sent", () => {
    const dialog = openDialog();
    fireEvent.change(dialog.getByTestId("checksheet-input-file"), { target: { files: [file("page.html", "text/html")] } });
    expect(dialog.getByTestId("checksheet-file-error").textContent).toMatch(/isn't supported/);
    expect((dialog.getByTestId("checksheet-upload-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(api.uploadUrl).not.toHaveBeenCalled();
  });

  it("uploads to private storage, then registers the document with its details", async () => {
    api.uploadUrl.mockResolvedValue({ uploadURL: "/api/storage/local-upload/token", objectPath: "/objects/uploads/abc/def", contentType: "application/pdf" });
    api.create.mockResolvedValue(testDocument({ id: 77, title: "Finance Major Checksheet" }));
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const dialog = openDialog();
      const chosen = file("finance.pdf", "application/pdf");
      fireEvent.change(dialog.getByTestId("checksheet-input-file"), { target: { files: [chosen] } });
      fireEvent.change(dialog.getByTestId("checksheet-field-title"), { target: { value: "Finance Major Checksheet" } });
      fireEvent.change(dialog.getByTestId("checksheet-field-category"), { target: { value: "major_checksheet" } });
      fireEvent.change(dialog.getByTestId("checksheet-field-year"), { target: { value: "2025-26" } });
      fireEvent.click(dialog.getByTestId("checksheet-upload-submit"));

      await waitFor(() => expect(api.create).toHaveBeenCalled());
      expect(api.uploadUrl).toHaveBeenCalledWith({ name: "finance.pdf", size: 2048, contentType: "application/pdf" });
      expect(fetchMock).toHaveBeenCalledWith("/api/storage/local-upload/token", {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: chosen,
      });
      expect(api.create).toHaveBeenCalledWith({
        objectPath: "/objects/uploads/abc/def",
        fileName: "finance.pdf",
        fileSize: 2048,
        contentType: "application/pdf",
        title: "Finance Major Checksheet",
        category: "major_checksheet",
        programName: null,
        programRole: null,
        school: null,
        academicYearLabel: "2025-26",
        sourceUrl: null,
      });
      await waitFor(() => expect(screen.queryByTestId("checksheet-upload-dialog")).toBeNull());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows the server's reason when a file is refused, and keeps the form", async () => {
    api.uploadUrl.mockResolvedValue({ uploadURL: "/u", objectPath: "/objects/uploads/a/b", contentType: "application/pdf" });
    api.create.mockRejectedValue(Object.assign(new Error("422"), { data: { error: "This PDF is damaged and could not be opened. Download it again and re-upload." } }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    try {
      const dialog = openDialog();
      fireEvent.change(dialog.getByTestId("checksheet-input-file"), { target: { files: [file("broken.pdf", "application/pdf")] } });
      fireEvent.click(dialog.getByTestId("checksheet-upload-submit"));
      const error = await dialog.findByTestId("checksheet-upload-error");
      expect(error.textContent).toBe("This PDF is damaged and could not be opened. Download it again and re-upload.");
      expect((dialog.getByTestId("checksheet-field-title") as HTMLInputElement).value).toBe("broken");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("points out a file that is already uploaded, and lets the student cancel or upload anyway", async () => {
    // The fingerprint of 2048 zero bytes, as the library would report it.
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(2048));
    const fingerprint = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
    listQuery = { data: library([testDocument({ id: 1, title: "Finance (first copy)", fileFingerprint: fingerprint }), MINOR]), isLoading: false, isError: false, refetch: vi.fn() };
    api.uploadUrl.mockResolvedValue({ uploadURL: "/u", objectPath: "/objects/uploads/a/b", contentType: "application/pdf" });
    api.create.mockResolvedValue(testDocument({ id: 78 }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    try {
      const dialog = openDialog();
      fireEvent.change(dialog.getByTestId("checksheet-input-file"), { target: { files: [file("finance.pdf", "application/pdf")] } });
      fireEvent.click(dialog.getByTestId("checksheet-upload-submit"));

      const warning = await dialog.findByTestId("checksheet-duplicate-warning");
      expect(warning.textContent).toContain("This file appears to already be uploaded.");
      expect(warning.textContent).toContain("“Finance (first copy)”");
      expect(api.uploadUrl).not.toHaveBeenCalled();
      expect(within(warning).getByTestId("checksheet-duplicate-cancel").textContent).toBe("Cancel");
      expect(within(warning).getByTestId("checksheet-duplicate-confirm").textContent).toBe("Upload Anyway");

      fireEvent.click(within(warning).getByTestId("checksheet-duplicate-cancel"));
      expect(dialog.queryByTestId("checksheet-duplicate-warning")).toBeNull();
      expect(api.create).not.toHaveBeenCalled();
      // The form, with the chosen file's title, is still there.
      expect((dialog.getByTestId("checksheet-field-title") as HTMLInputElement).value).toBe("finance");

      fireEvent.change(dialog.getByTestId("checksheet-input-file"), { target: { files: [file("finance.pdf", "application/pdf")] } });
      fireEvent.click(dialog.getByTestId("checksheet-upload-submit"));
      fireEvent.click(await dialog.findByTestId("checksheet-duplicate-confirm"));
      await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
