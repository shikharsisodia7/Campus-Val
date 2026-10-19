import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./safe-url";

describe("safeExternalUrl", () => {
  it("keeps plain web addresses", () => {
    expect(safeExternalUrl("https://www.scu.edu/bulletin/")).toBe("https://www.scu.edu/bulletin/");
    expect(safeExternalUrl(" http://example.edu/a ")).toBe("http://example.edu/a");
  });

  it("drops anything that would run or render content on click", () => {
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd", "/relative", "not a url", "", null, undefined]) {
      expect(safeExternalUrl(bad as string | null | undefined)).toBeUndefined();
    }
  });
});
