/**
 * Startup configuration check — imported FIRST by index.ts, on purpose.
 *
 * ES modules evaluate their imports before the importing file's own code, and
 * `@workspace/db` throws at import time if DATABASE_URL is missing. Doing the
 * validation inside index.ts's body therefore ran too late: an operator saw a
 * raw stack trace instead of "DATABASE_URL: is required". Keeping this in its
 * own module that has no dependency on the app or the database means it always
 * runs first and can name every missing variable at once.
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "./lib/logger";
import { ConfigError, assertStartupConfig, resolveStorageProvider } from "./lib/config";

function fail(message: string, variables: string[]): never {
  logger.fatal({ problems: variables }, message);
  // The logger may be asynchronous; make sure the operator sees the reason.
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
}

try {
  for (const warning of assertStartupConfig()) {
    logger.warn({ variable: warning.variable }, warning.message);
  }
} catch (err) {
  if (err instanceof ConfigError) {
    fail(err.message, err.problems.map((p) => p.variable));
  }
  throw err;
}

// Fail at startup — not on the first student upload — if the private APR
// directory cannot be created or written by the server user.
if (resolveStorageProvider() === "local") {
  const dir = process.env["PRIVATE_STORAGE_DIR"]?.trim();
  if (dir) {
    try {
      fs.mkdirSync(path.join(dir, "progress-reports"), { recursive: true, mode: 0o700 });
      const probe = path.join(dir, `.write-test-${process.pid}`);
      fs.writeFileSync(probe, "");
      fs.unlinkSync(probe);
    } catch (err) {
      const reason = (err as NodeJS.ErrnoException).code ?? "unknown";
      fail(
        `Invalid CampusVal server configuration:\n  - PRIVATE_STORAGE_DIR: cannot create or write to the private storage directory (${reason}). Check that it exists (or its parent is writable) and that the server user owns it.`,
        ["PRIVATE_STORAGE_DIR"],
      );
    }
  }
}
