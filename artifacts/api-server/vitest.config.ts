import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // API tests share one database; run files serially to avoid interference.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
