import { describe, expect, it } from "vitest";
import { isUploadPathOwnedBy, uploadPathOwnerSegment } from "./uploadPath";

const A = "user_student_a";
const B = "user_student_b";
const segA = uploadPathOwnerSegment(A);
const segB = uploadPathOwnerSegment(B);
const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("isUploadPathOwnedBy", () => {
  it("accepts the exact minted shape for its owner", () => {
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/${uuid}`, A)).toBe(true);
  });

  it("refuses another user's path", () => {
    expect(isUploadPathOwnedBy(`/objects/uploads/${segB}/${uuid}`, A)).toBe(false);
  });

  it("refuses path traversal out of the caller's own prefix", () => {
    // Passed the old startsWith() check; a URL parser resolves it to B's object.
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/../${segB}/${uuid}`, A)).toBe(false);
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/%2e%2e/${segB}/${uuid}`, A)).toBe(false);
  });

  it("refuses extra segments, non-UUID names and trailing junk", () => {
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/${uuid}/x`, A)).toBe(false);
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/not-a-uuid`, A)).toBe(false);
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/${uuid}/`, A)).toBe(false);
    expect(isUploadPathOwnedBy(`/objects/uploads/${segA}/${uuid.toUpperCase()}`, A)).toBe(false);
  });
});
