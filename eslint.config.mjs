// Repo-wide lint. Deliberately about CORRECTNESS, not taste: every rule that is an
// error here catches a class of real bug (a hook called conditionally, a duplicated
// object key, unreachable code, a swallowed-by-mistake fallthrough, an unused
// variable that hides a typo). Formatting is left to Prettier and type errors to
// `pnpm run typecheck`, so neither is duplicated here.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vercel/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      // Machine-written by orval from lib/api-spec/openapi.yaml.
      "lib/api-zod/src/generated/**",
      "lib/api-client-react/src/generated/**",
      // Design scratch space, not shipped.
      "artifacts/mockup-sandbox/**",
      // Drizzle-kit output.
      "lib/db/drizzle/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: {
      // A disable comment that no longer suppresses anything is itself a bug: it
      // hides the next real problem on that line.
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // The codebase talks to loosely-typed third-party payloads and test doubles in
      // many places; `any` is policed by review and the typechecker, not this rule.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      // `catch {}` is used on purpose for best-effort cleanup; an empty BLOCK elsewhere is a bug.
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // React (web app + Expo app): hooks must obey the rules of hooks.
  {
    files: ["artifacts/scu-advising/**/*.{ts,tsx}", "artifacts/campusval-mobile/**/*.{ts,tsx}", "lib/api-client-react/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Intentional omissions are marked with a disable comment and a reason.
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Node scripts and config files are plain ESM/CJS with no browser globals. Plain `.js`
  // files in this repo are CommonJS scripts (no "type": "module"), so `require` is correct there.
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "scripts/**", "artifacts/*/scripts/**", "**/*.config.{js,ts,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  // The Chrome extension runs against the WebExtension API, not Node.
  {
    files: ["chrome-extension/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },

  // AudioWorklet modules run in AudioWorkletGlobalScope, which defines its own globals.
  {
    files: ["**/*worklet*.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
        sampleRate: "readonly",
        currentTime: "readonly",
        currentFrame: "readonly",
      },
    },
  },

  // Tests: doubles and fixtures routinely use non-null assertions and unused params.
  {
    files: ["**/*.test.{ts,tsx}", "**/__fixtures__/**", "artifacts/e2e/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
