/**
 * Smoke tests for the mobile sign-in flow guard.
 *
 * Tests:
 * 1. build.js exits non-zero with a clear error when CLERK_PUBLISHABLE_KEY is unset.
 * 2. _layout.tsx contains the visible key-guard that renders a warning instead of crashing.
 *
 * Run with: node scripts/smoke-test.mjs
 */

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: build.js exits non-zero when CLERK_PUBLISHABLE_KEY is missing
// ---------------------------------------------------------------------------
console.log('\nTest group: build.js CLERK_PUBLISHABLE_KEY guard');

{
  const env = { ...process.env };
  delete env.CLERK_PUBLISHABLE_KEY;

  const result = spawnSync('node', ['scripts/build.js'], {
    cwd: projectRoot,
    env,
    timeout: 10_000,
    encoding: 'utf-8',
  });

  assert(result.status !== 0, 'exits non-zero when CLERK_PUBLISHABLE_KEY is unset');

  const output = (result.stderr ?? '') + (result.stdout ?? '');
  assert(
    output.includes('CLERK_PUBLISHABLE_KEY'),
    'error output mentions CLERK_PUBLISHABLE_KEY',
  );
  assert(
    output.includes('ERROR'),
    'error output includes ERROR label',
  );
}

// Also verify that an empty-string value is treated the same as unset
{
  const result = spawnSync('node', ['scripts/build.js'], {
    cwd: projectRoot,
    env: { ...process.env, CLERK_PUBLISHABLE_KEY: '' },
    timeout: 10_000,
    encoding: 'utf-8',
  });

  assert(
    result.status !== 0,
    'exits non-zero when CLERK_PUBLISHABLE_KEY is set to empty string',
  );
}

// ---------------------------------------------------------------------------
// Test 2: _layout.tsx has the visible key-guard
// ---------------------------------------------------------------------------
console.log('\nTest group: _layout.tsx visible sign-in guard');

{
  const layout = readFileSync(
    path.join(projectRoot, 'app/_layout.tsx'),
    'utf-8',
  );

  assert(
    layout.includes('!publishableKey'),
    '_layout.tsx guards on empty publishableKey',
  );

  assert(
    layout.includes('MissingKeyScreen'),
    '_layout.tsx renders MissingKeyScreen component when key is absent',
  );

  assert(
    layout.includes('testID="missing-key-warning"'),
    'MissingKeyScreen has a testID for automated assertions',
  );

  assert(
    layout.includes('Sign-in unavailable') ||
      layout.includes('authentication key') ||
      layout.includes('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    'MissingKeyScreen displays a human-readable message that describes the problem',
  );

  // Guard must fire before ClerkProvider is mounted so Clerk never sees an
  // empty key (which would cause a hard crash in the native SDK).
  const guardIndex = layout.indexOf('!publishableKey');
  const clerkIndex = layout.indexOf('<ClerkProvider');
  assert(
    guardIndex !== -1 && clerkIndex !== -1 && guardIndex < clerkIndex,
    'key guard appears before <ClerkProvider> in the render path',
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
