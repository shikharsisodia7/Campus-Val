// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MajorCombobox } from "./MajorCombobox";

// jsdom lacks ResizeObserver + scrollIntoView, which cmdk (the searchable
// Command list) touches on mount/selection.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver ??= ResizeObserverStub as any;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const OPTIONS = [
  { code: "BIOL", title: "Biology", college: "CAS" },
  { code: "CHEM", title: "Chemistry", college: "CAS" },
  { code: "FNCE", title: "Finance", college: "LSB" },
] as any;

afterEach(cleanup);

describe("MajorCombobox", () => {
  it("shows the selected major's title", () => {
    render(<MajorCombobox value="BIOL" onChange={() => {}} options={OPTIONS} testId="cb" />);
    expect(screen.getByTestId("cb").textContent).toContain("Biology");
  });

  it("opens on click and emits the CODE when an option is chosen", () => {
    const onChange = vi.fn();
    render(<MajorCombobox value="BIOL" onChange={onChange} options={OPTIONS} testId="cb" />);
    const trigger = screen.getByTestId("cb");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByTestId("major-option-CHEM"));
    expect(onChange).toHaveBeenCalledWith("CHEM");
  });

  it("is a keyboard-focusable combobox with an accessible label", () => {
    render(
      <MajorCombobox
        value=""
        onChange={() => {}}
        options={OPTIONS}
        testId="cb"
        ariaLabel="Set or change primary major"
      />,
    );
    const trigger = screen.getByRole("combobox", {
      name: "Set or change primary major",
    });
    expect(trigger).toBeTruthy();
    expect(trigger.tagName).toBe("BUTTON");
  });
});
