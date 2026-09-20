import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/"),
  // Versioned SQL migrations (see docs/SCU_DEPLOYMENT.md#database-migrations).
  // `push` ignores this; `generate` writes here; the API bundle's
  // dist/migrate.mjs applies them.
  // Relative on purpose: drizzle-kit resolves `out` against the working
  // directory (lib/db when run through pnpm), and re-joins an absolute path.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
