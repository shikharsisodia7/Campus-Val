import { describe, expect, it } from "vitest";
import { withExplicitSslMode } from "@workspace/db/ssl-mode";

describe("withExplicitSslMode", () => {
  it("states verify-full for the modes pg 8 already treats as verify-full", () => {
    for (const mode of ["prefer", "require", "verify-ca", "REQUIRE"]) {
      expect(withExplicitSslMode(`postgresql://u:p@host.neon.tech/db?sslmode=${mode}`)).toBe(
        "postgresql://u:p@host.neon.tech/db?sslmode=verify-full",
      );
    }
  });

  it("changes only the sslmode value, wherever it sits among the parameters", () => {
    expect(withExplicitSslMode("postgres://u:p%40ss@h:5432/db?channel_binding=require&sslmode=require&x=1")).toBe(
      "postgres://u:p%40ss@h:5432/db?channel_binding=require&sslmode=verify-full&x=1",
    );
  });

  it("leaves strings that need no change exactly as given", () => {
    for (const url of [
      "postgresql://campusval:campusval@localhost:5432/campusval",
      "postgresql://u:p@h/db?sslmode=disable",
      "postgresql://u:p@h/db?sslmode=verify-full",
      "postgresql://u:p@h/db?uselibpqcompat=true&sslmode=require",
      "postgresql://u:p@/db?host=/cloudsql/project:region:instance",
      "postgresql://u:p@h/db?sslmode=requirement",
    ]) {
      expect(withExplicitSslMode(url)).toBe(url);
    }
  });
});
