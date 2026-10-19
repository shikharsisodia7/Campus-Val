import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // API tests share one database; run files serially to avoid interference.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    // Most suites exercise features, not the access population, and sign in as
    // ordinary @scu.edu users. Production defaults to pilot (lib/auth/policy.ts);
    // the pilot rules have their own tests, which set CAMPUSVAL_ACCESS_MODE.
    env: { CAMPUSVAL_ACCESS_MODE: "institution" },
  },
});
