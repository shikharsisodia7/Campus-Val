/**
 * Compiles the whole app for iOS and Android, exactly as a release would, and
 * checks that Degree Checksheets is in both bundles.
 *
 * This is what proves the screens build: every import resolves, every native
 * module the screens use is installed, and the code survives the production
 * transform. It does not run the app. Running it needs a simulator or a phone.
 *
 *   node scripts/bundle-check.mjs
 *
 * Needs no account, key or network beyond the packages already installed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.bundle-check');
rmSync(out, { recursive: true, force: true });

const env = {
  ...process.env,
  // Placeholders: the bundle is compiled, never started.
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA',
  EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN ?? 'campusval.invalid',
  EXPO_NO_TELEMETRY: '1',
  CI: '1',
};

const result = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'ios', '--platform', 'android', '--output-dir', out], {
  cwd: root,
  env,
  encoding: 'utf-8',
  shell: true,
  timeout: 15 * 60_000,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) {
  console.error(`\nFAIL: the app did not compile (exit ${result.status}).`);
  process.exit(1);
}

function bundles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? bundles(file) : /\.(hbc|js)$/.test(name) ? [file] : [];
  });
}

let failed = 0;
for (const platform of ['ios', 'android']) {
  const files = bundles(path.join(out, '_expo', 'static', 'js', platform));
  if (files.length === 0) {
    console.error(`FAIL: no ${platform} bundle was written.`);
    failed += 1;
    continue;
  }
  const size = files.reduce((sum, file) => sum + statSync(file).size, 0);
  // Words that only the Degree Checksheets screens contain.
  const text = files.map((file) => readFileSync(file).toString('latin1')).join('');
  const present = ['Degree Checksheets', 'MY TRACKING', 'Upload Checksheet'].filter((phrase) => text.includes(phrase));
  const ok = present.length === 3;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${platform}: ${files.length} file(s), ${(size / (1024 * 1024)).toFixed(2)} MB, Degree Checksheets ${ok ? 'included' : 'MISSING'}`);
  if (!ok) failed += 1;
}

rmSync(out, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
