import { describe, it, expect } from "vitest";
import {
  ConfigError,
  assertStartupConfig,
  collectConfigProblems,
  isOriginAllowed,
  isStorageProviderConfigured,
  resolveAllowedOrigins,
  resolveStorageProvider,
  resolveTrustProxy,
} from "./config";

const validProd = {
  NODE_ENV: "production",
  PORT: "8080",
  DATABASE_URL: "postgresql://u:p@db.internal:5432/campusval",
  CLERK_SECRET_KEY: "sk_test_x",
  CLERK_PUBLISHABLE_KEY: "pk_test_x",
  PUBLIC_APP_URL: "https://campusval.scu.edu",
  PRIVATE_STORAGE_DIR: "/var/lib/campusval/private",
  STORAGE_SIGNING_SECRET: "x".repeat(40),
};

const errorsFor = (env: Record<string, string | undefined>) =>
  collectConfigProblems(env)
    .filter((p) => p.severity === "error")
    .map((p) => p.variable);

describe("startup config validation", () => {
  it("accepts a complete production configuration with no errors", () => {
    expect(errorsFor(validProd)).toEqual([]);
    expect(() => assertStartupConfig(validProd)).not.toThrow();
  });

  it("names every missing critical variable at once (not just the first)", () => {
    const errs = errorsFor({ NODE_ENV: "production" });
    expect(errs).toEqual(
      expect.arrayContaining([
        "PORT",
        "DATABASE_URL",
        "CLERK_SECRET_KEY",
        "CLERK_PUBLISHABLE_KEY",
      ]),
    );
  });

  it("throws a ConfigError whose message names the variables but never their values", () => {
    const env = { ...validProd, DATABASE_URL: "mysql://secret-user:secret-pass@h/db" };
    let thrown: unknown;
    try {
      assertStartupConfig(env);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const msg = (thrown as ConfigError).message;
    expect(msg).toContain("DATABASE_URL");
    expect(msg).not.toContain("secret-pass");
    expect(msg).not.toContain("secret-user");
  });

  it("rejects an invalid PORT", () => {
    expect(errorsFor({ ...validProd, PORT: "abc" })).toContain("PORT");
    expect(errorsFor({ ...validProd, PORT: "70000" })).toContain("PORT");
    expect(errorsFor({ ...validProd, PORT: "0" })).toContain("PORT");
  });

  it("does not require Clerk keys outside production (tests / local dev)", () => {
    const errs = errorsFor({ NODE_ENV: "development", PORT: "3000", DATABASE_URL: validProd.DATABASE_URL });
    expect(errs).toEqual([]);
  });

  it("warns (does not fail) when PUBLIC_APP_URL is plain http in production", () => {
    const problems = collectConfigProblems({ ...validProd, PUBLIC_APP_URL: "http://campusval.scu.edu" });
    const p = problems.find((x) => x.variable === "PUBLIC_APP_URL");
    expect(p?.severity).toBe("warning");
  });

  it("warns (does not fail) when no private storage backend is configured", () => {
    const { PRIVATE_STORAGE_DIR: _d, STORAGE_SIGNING_SECRET: _s, ...noStorage } = validProd;
    const problems = collectConfigProblems(noStorage);
    expect(problems.find((x) => x.variable === "PRIVATE_STORAGE_PROVIDER")?.severity).toBe("warning");
    expect(errorsFor(noStorage)).toEqual([]);
  });

  it("rejects a private storage directory that is not an absolute POSIX path (e.g. shell-rewritten 'C:/Program Files/...')", () => {
    expect(errorsFor({ ...validProd, PRIVATE_STORAGE_DIR: "C:/Program Files/Git/var/lib/campusval/private" })).toContain("PRIVATE_STORAGE_DIR");
    expect(errorsFor({ ...validProd, PRIVATE_STORAGE_DIR: "relative/dir" })).toContain("PRIVATE_STORAGE_DIR");
    expect(errorsFor({ ...validProd, PRIVATE_STORAGE_DIR: "/var/lib/campusval/private" })).toEqual([]);
  });

  it("requires a signing secret (32+ chars) when the local storage provider is selected", () => {
    expect(
      errorsFor({ ...validProd, STORAGE_SIGNING_SECRET: undefined }),
    ).toContain("STORAGE_SIGNING_SECRET");
    expect(
      errorsFor({ ...validProd, STORAGE_SIGNING_SECRET: "short" }),
    ).toContain("STORAGE_SIGNING_SECRET");
  });

  it("requires URL + credential when the Workday availability integration is enabled, and refuses a non-https URL", () => {
    const enabled = { ...validProd, WORKDAY_AVAILABILITY_ENABLED: "true" };
    expect(errorsFor(enabled)).toEqual(
      expect.arrayContaining(["WORKDAY_AVAILABILITY_URL", "WORKDAY_AVAILABILITY_AUTH_TOKEN"]),
    );
    expect(
      errorsFor({ ...enabled, WORKDAY_AVAILABILITY_URL: "http://insecure.example", WORKDAY_AVAILABILITY_AUTH_TOKEN: "t" }),
    ).toContain("WORKDAY_AVAILABILITY_URL");
    expect(
      errorsFor({ ...enabled, WORKDAY_AVAILABILITY_URL: "https://ok.example/x", WORKDAY_AVAILABILITY_AUTH_TOKEN: "t" }),
    ).toEqual([]);
  });

  it("leaves the Workday integration entirely optional when disabled", () => {
    expect(errorsFor({ ...validProd, WORKDAY_AVAILABILITY_ENABLED: "false" })).toEqual([]);
  });
});

describe("storage provider resolution", () => {
  it("explicit PRIVATE_STORAGE_PROVIDER wins over platform inference", () => {
    expect(resolveStorageProvider({ VERCEL: "1", PRIVATE_STORAGE_PROVIDER: "local" })).toBe("local");
  });

  it("infers the pre-existing providers exactly as before", () => {
    expect(resolveStorageProvider({ VERCEL: "1" })).toBe("vercel-blob");
    expect(resolveStorageProvider({ PRIVATE_OBJECT_DIR: "/bucket/x" })).toBe("replit");
    expect(resolveStorageProvider({ PRIVATE_STORAGE_DIR: "/data" })).toBe("local");
    expect(resolveStorageProvider({})).toBeNull();
  });

  it("reports configured only when the selected provider has everything it needs", () => {
    expect(isStorageProviderConfigured({ VERCEL: "1" })).toBe(false);
    expect(isStorageProviderConfigured({ VERCEL: "1", BLOB_READ_WRITE_TOKEN: "t" })).toBe(true);
    expect(isStorageProviderConfigured({ PRIVATE_STORAGE_DIR: "/d" })).toBe(false);
    expect(
      isStorageProviderConfigured({ PRIVATE_STORAGE_DIR: "/d", STORAGE_SIGNING_SECRET: "s".repeat(32) }),
    ).toBe(true);
    expect(isStorageProviderConfigured({})).toBe(false);
  });
});

describe("reverse proxy + CORS", () => {
  it("TRUST_PROXY defaults to off and parses hop counts / subnet lists", () => {
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: "false" })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: "true" })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: "2" })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: "loopback, 10.0.0.0/8" })).toBe("loopback, 10.0.0.0/8");
    // Vercel is always one platform proxy deep; an explicit setting still wins.
    expect(resolveTrustProxy({ VERCEL: "1" })).toBe(1);
    expect(resolveTrustProxy({ VERCEL: "1", TRUST_PROXY: "false" })).toBe(false);
  });

  it("production CORS is an allowlist: PUBLIC_APP_URL + CORS_ALLOWED_ORIGINS only", () => {
    const env = {
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://campusval.scu.edu/",
      CORS_ALLOWED_ORIGINS: "https://portal.scu.edu, not a url",
    };
    expect(resolveAllowedOrigins(env).sort()).toEqual(
      ["https://campusval.scu.edu", "https://portal.scu.edu"].sort(),
    );
    expect(isOriginAllowed("https://campusval.scu.edu", env)).toBe(true);
    expect(isOriginAllowed("https://portal.scu.edu", env)).toBe(true);
    expect(isOriginAllowed("https://evil.example", env)).toBe(false);
    // localhost is NOT allowed in production
    expect(isOriginAllowed("http://localhost:5173", env)).toBe(false);
    // no Origin header (same-origin / non-browser) is fine
    expect(isOriginAllowed(undefined, env)).toBe(true);
  });

  it("allows localhost origins outside production for the Vite dev server", () => {
    expect(isOriginAllowed("http://localhost:5173", { NODE_ENV: "development" })).toBe(true);
    expect(isOriginAllowed("https://evil.example", { NODE_ENV: "development" })).toBe(false);
  });
});
