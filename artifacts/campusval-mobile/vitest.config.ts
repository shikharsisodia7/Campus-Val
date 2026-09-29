import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Tests for what the mobile app decides and computes: layout, rules, wording,
 * and the tracking it shares with the web app. They run in Node; nothing here
 * needs a phone or a simulator. The screens themselves are checked by the
 * bundle check (scripts/bundle-check.mjs), which compiles them for iOS and
 * Android.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
});
