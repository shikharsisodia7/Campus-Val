/**
 * Central, validated runtime configuration for the API server.
 *
 * Why this exists: on a university-managed host nobody has the Vercel/Replit
 * dashboards open, so a missing variable must fail at startup with a message
 * that names the variable — not surface later as a 500 on the first request
 * that happens to touch it. `index.ts` (the long-running entry) calls
 * `assertStartupConfig()`; the Vercel Function entry (`vercel.ts`) does not,
 * since serverless platforms surface missing config through their own build/
 * runtime logs and must not crash at import time.
 *
 * Nothing here logs values — only variable NAMES appear in error text.
 */
import path from "node:path";

export interface ConfigProblem {
  variable: string;
  message: string;
  /** "error" blocks startup; "warning" is logged once and startup continues. */
  severity: "error" | "warning";
}

export class ConfigError extends Error {
  readonly problems: ConfigProblem[];
  constructor(problems: ConfigProblem[]) {
    const errors = problems.filter((p) => p.severity === "error");
    super(
      `Invalid CampusVal server configuration:\n` +
        errors.map((p) => `  - ${p.variable}: ${p.message}`).join("\n"),
    );
    this.name = "ConfigError";
    this.problems = problems;
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

type Env = Record<string, string | undefined>;

function present(env: Env, name: string): boolean {
  const v = env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export type StorageProviderName = "vercel-blob" | "replit" | "local";

/**
 * Which private object-storage backend applies to this environment.
 * Explicit `PRIVATE_STORAGE_PROVIDER` always wins; otherwise the platform is
 * inferred exactly as it was before the provider setting existed, so no
 * existing deployment changes behaviour.
 */
export function resolveStorageProvider(env: Env = process.env): StorageProviderName | null {
  const explicit = env["PRIVATE_STORAGE_PROVIDER"]?.trim().toLowerCase();
  if (explicit === "vercel-blob" || explicit === "replit" || explicit === "local") {
    return explicit;
  }
  if (present(env, "VERCEL")) return "vercel-blob";
  if (present(env, "PRIVATE_STORAGE_DIR")) return "local";
  if (present(env, "PRIVATE_OBJECT_DIR")) return "replit";
  return null;
}

/** True when the selected storage provider has everything it needs. */
export function isStorageProviderConfigured(env: Env = process.env): boolean {
  const provider = resolveStorageProvider(env);
  switch (provider) {
    case "vercel-blob":
      return present(env, "BLOB_READ_WRITE_TOKEN");
    case "local":
      return present(env, "PRIVATE_STORAGE_DIR") && present(env, "STORAGE_SIGNING_SECRET");
    case "replit":
      return present(env, "PRIVATE_OBJECT_DIR");
    default:
      return false;
  }
}

/**
 * Collects every configuration problem at once (rather than failing on the
 * first) so an operator fixes them in one pass.
 */
export function collectConfigProblems(env: Env = process.env): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const isProduction = env["NODE_ENV"] === "production";
  const err = (variable: string, message: string) =>
    problems.push({ variable, message, severity: "error" });
  const warn = (variable: string, message: string) =>
    problems.push({ variable, message, severity: "warning" });

  // --- Listening socket ---------------------------------------------------
  const rawPort = env["PORT"];
  if (!present(env, "PORT")) {
    err("PORT", "is required (the TCP port the server should listen on, e.g. 8080).");
  } else {
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      err("PORT", `must be an integer between 1 and 65535 (got "${rawPort}").`);
    }
  }

  // --- Database ------------------------------------------------------------
  if (!present(env, "DATABASE_URL")) {
    err("DATABASE_URL", "is required (a postgresql:// connection string).");
  } else if (!/^postgres(ql)?:\/\//i.test(env["DATABASE_URL"]!.trim())) {
    err("DATABASE_URL", "must be a postgres:// or postgresql:// connection string.");
  }
  if (present(env, "DATABASE_POOL_MAX")) {
    const n = Number(env["DATABASE_POOL_MAX"]);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      err("DATABASE_POOL_MAX", "must be an integer between 1 and 200.");
    }
  }

  // --- Authentication (Clerk) ----------------------------------------------
  if (isProduction) {
    if (!present(env, "CLERK_SECRET_KEY")) {
      err("CLERK_SECRET_KEY", "is required in production (server-side Clerk secret key).");
    }
    if (!present(env, "CLERK_PUBLISHABLE_KEY")) {
      err("CLERK_PUBLISHABLE_KEY", "is required in production (Clerk publishable key).");
    }
  }

  // --- Public origin / TLS -------------------------------------------------
  if (present(env, "PUBLIC_APP_URL")) {
    try {
      const u = new URL(env["PUBLIC_APP_URL"]!.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        err("PUBLIC_APP_URL", "must be an http(s) URL.");
      } else if (isProduction && u.protocol !== "https:") {
        warn(
          "PUBLIC_APP_URL",
          "is not https:// — session cookies will not be marked Secure and browsers will treat the site as insecure.",
        );
      }
    } catch {
      err("PUBLIC_APP_URL", "must be an absolute URL such as https://campusval.scu.edu.");
    }
  } else if (isProduction) {
    warn(
      "PUBLIC_APP_URL",
      "is not set; canonical/OG URLs fall back to the request Host header. Set it (and TRUST_PROXY) when running behind a reverse proxy.",
    );
  }

  // --- Private object storage (APR uploads) --------------------------------
  const provider = resolveStorageProvider(env);
  if (provider === null) {
    warn(
      "PRIVATE_STORAGE_PROVIDER",
      "no private storage backend is configured — Academic Progress Report upload is disabled until one is (see docs/SCU_DEPLOYMENT.md).",
    );
  } else if (!isStorageProviderConfigured(env)) {
    if (provider === "local") {
      if (!present(env, "PRIVATE_STORAGE_DIR")) {
        err("PRIVATE_STORAGE_DIR", "is required when PRIVATE_STORAGE_PROVIDER=local (an absolute, persistent, private directory).");
      }
      if (!present(env, "STORAGE_SIGNING_SECRET")) {
        err("STORAGE_SIGNING_SECRET", "is required when PRIVATE_STORAGE_PROVIDER=local (32+ random characters; signs upload tokens).");
      }
    } else if (provider === "vercel-blob") {
      err("BLOB_READ_WRITE_TOKEN", "is required when PRIVATE_STORAGE_PROVIDER=vercel-blob.");
    } else if (provider === "replit") {
      err("PRIVATE_OBJECT_DIR", "is required when PRIVATE_STORAGE_PROVIDER=replit.");
    }
  }
  if (provider === "local" && present(env, "PRIVATE_STORAGE_DIR")) {
    // Checked with the POSIX rule on purpose: this runs on Linux hosts, and a
    // Windows-style path ("C:/...", e.g. rewritten by a shell) is not usable there.
    if (!path.posix.isAbsolute(env["PRIVATE_STORAGE_DIR"]!.trim())) {
      err(
        "PRIVATE_STORAGE_DIR",
        "must be an absolute path (e.g. /var/lib/campusval/private). Got a relative or Windows-style path — check for shell path rewriting.",
      );
    }
  }
  if (provider === "local" && present(env, "STORAGE_SIGNING_SECRET")) {
    if (env["STORAGE_SIGNING_SECRET"]!.trim().length < 32) {
      err("STORAGE_SIGNING_SECRET", "must be at least 32 characters.");
    }
  }

  // --- Workday availability integration ------------------------------------
  if (env["WORKDAY_AVAILABILITY_ENABLED"]?.trim().toLowerCase() === "true") {
    if (!present(env, "WORKDAY_AVAILABILITY_URL")) {
      err(
        "WORKDAY_AVAILABILITY_URL",
        "is required when WORKDAY_AVAILABILITY_ENABLED=true (the SCU-approved section-availability endpoint).",
      );
    } else {
      try {
        const u = new URL(env["WORKDAY_AVAILABILITY_URL"]!.trim());
        if (u.protocol !== "https:") {
          err("WORKDAY_AVAILABILITY_URL", "must be an https:// URL.");
        }
      } catch {
        err("WORKDAY_AVAILABILITY_URL", "must be an absolute https:// URL.");
      }
    }
    if (!present(env, "WORKDAY_AVAILABILITY_AUTH_TOKEN")) {
      err(
        "WORKDAY_AVAILABILITY_AUTH_TOKEN",
        "is required when WORKDAY_AVAILABILITY_ENABLED=true (credential issued by SCU for the approved integration).",
      );
    }
  }

  return problems;
}

/** Throws `ConfigError` when any blocking problem exists; returns warnings otherwise. */
export function assertStartupConfig(env: Env = process.env): ConfigProblem[] {
  const problems = collectConfigProblems(env);
  if (problems.some((p) => p.severity === "error")) {
    throw new ConfigError(problems);
  }
  return problems.filter((p) => p.severity === "warning");
}

/**
 * Express `trust proxy` value from TRUST_PROXY. Unset/"false" → off (correct
 * when the server is exposed directly). "true"/"1" trusts one hop (the
 * common single reverse proxy). Any other integer trusts that many hops; any
 * other string is passed through as a subnet list ("loopback, 10.0.0.0/8").
 * On Vercel (always behind exactly one platform proxy) it defaults to 1.
 */
export function resolveTrustProxy(env: Env = process.env): boolean | number | string {
  const raw = env["TRUST_PROXY"]?.trim();
  if (!raw) return present(env, "VERCEL") ? 1 : false;
  if (raw.toLowerCase() === "false" || raw === "0") return false;
  if (raw.toLowerCase() === "true") return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * Origins allowed to make credentialed cross-origin requests. The bundled
 * frontend is served from the same origin as the API, so the production
 * default is "same-origin only": PUBLIC_APP_URL plus any explicit
 * CORS_ALLOWED_ORIGINS entries. Outside production, localhost origins are
 * additionally allowed so the Vite dev server can call the API.
 */
export function resolveAllowedOrigins(env: Env = process.env): string[] {
  const out = new Set<string>();
  if (present(env, "PUBLIC_APP_URL")) {
    try {
      out.add(new URL(env["PUBLIC_APP_URL"]!.trim()).origin);
    } catch {
      /* reported by collectConfigProblems */
    }
  }
  for (const raw of (env["CORS_ALLOWED_ORIGINS"] ?? "").split(",")) {
    const v = raw.trim();
    if (!v) continue;
    try {
      out.add(new URL(v).origin);
    } catch {
      /* ignore malformed entries */
    }
  }
  return [...out];
}

export function isOriginAllowed(
  origin: string | undefined,
  env: Env = process.env,
): boolean {
  // Non-browser / same-origin requests carry no Origin header.
  if (!origin) return true;
  if (resolveAllowedOrigins(env).includes(origin)) return true;
  if (env["NODE_ENV"] !== "production") {
    try {
      const host = new URL(origin).hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
    } catch {
      return false;
    }
  }
  return false;
}
