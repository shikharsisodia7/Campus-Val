import { describe, it, expect } from "vitest";
import { sanitizeLoggedUrl } from "./log-url";

describe("sanitizeLoggedUrl", () => {
  it("redacts the signed upload token that lives in the PATH", () => {
    const token = "eyJvIjoiL29iamVjdHMvdXBsb2Fkcy9hYmMifQ.Zm9vYmFyc2lnbmF0dXJl";
    const out = sanitizeLoggedUrl(`/api/storage/local-upload/${token}`);
    expect(out).toBe("/api/storage/local-upload/[redacted]");
    expect(out).not.toContain("eyJ");
  });

  it("redacts it whether or not the app is mounted under a prefix, and ignores case", () => {
    expect(sanitizeLoggedUrl("/storage/local-upload/abc.def")).toBe("/storage/local-upload/[redacted]");
    expect(sanitizeLoggedUrl("/API/STORAGE/LOCAL-UPLOAD/abc.def")).toBe("/API/STORAGE/LOCAL-UPLOAD/[redacted]");
  });

  it("still drops query strings and fragments", () => {
    expect(sanitizeLoggedUrl("/api/courses/MATH%2011/sections?term=fall&year=2026")).toBe(
      "/api/courses/MATH%2011/sections",
    );
    expect(sanitizeLoggedUrl("/api/storage/local-upload/tok?x=1#frag")).toBe("/api/storage/local-upload/[redacted]");
  });

  it("leaves every other path untouched", () => {
    expect(sanitizeLoggedUrl("/api/progress-report/file")).toBe("/api/progress-report/file");
    expect(sanitizeLoggedUrl("/api/storage/uploads/request-url")).toBe("/api/storage/uploads/request-url");
  });

  it("passes undefined through", () => {
    expect(sanitizeLoggedUrl(undefined)).toBeUndefined();
  });
});
