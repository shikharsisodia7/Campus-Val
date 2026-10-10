// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mutate = vi.fn();
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return { ...actual, useSetMajorTrack: () => ({ mutate, isPending: false, isError: false }) };
});

const { TrackPicker } = await import("./TrackPicker");

const variants = {
  major: "BIOE",
  kind: "track" as const,
  required: true,
  options: [
    { key: "biomolecular", label: "Biomolecular track" },
    { key: "pre-med", label: "Pre-med track" },
  ],
  selected: null,
  note: null,
};

function renderPicker(v = variants) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TrackPicker variants={v} />
    </QueryClientProvider>,
  );
}

describe("TrackPicker", () => {
  beforeEach(() => mutate.mockReset());

  it("asks for a required track with a labelled control and says it is planning only", () => {
    renderPicker();
    const select = screen.getByLabelText(/your track/i) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Choose your track…" })).toBeTruthy();
    expect(screen.getByText(/planning only/i)).toBeTruthy();
  });

  it("saves the chosen track, and clears it with the empty option", () => {
    renderPicker({ ...variants, selected: "pre-med" });
    const select = screen.getByLabelText(/your track/i);
    fireEvent.change(select, { target: { value: "biomolecular" } });
    expect(mutate).toHaveBeenCalledWith({ data: { major: "BIOE", track: "biomolecular" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(mutate).toHaveBeenLastCalledWith({ data: { major: "BIOE", track: null } });
  });

  it("offers an optional emphasis as optional, with the Bulletin's note", () => {
    renderPicker({ ...variants, kind: "emphasis" as never, required: false, note: "Only one emphasis is allowed." });
    expect(screen.getByLabelText(/your emphasis \(optional\)/i)).toBeTruthy();
    expect(screen.getByRole("option", { name: "No emphasis" })).toBeTruthy();
    expect(screen.getByText("Only one emphasis is allowed.")).toBeTruthy();
  });
});
