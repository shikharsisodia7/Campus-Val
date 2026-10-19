#!/usr/bin/env node
// Bakes the canonical origin into dist/public/index.html at build time, for
// deployments (Vercel) where "/" is served as a static file with no server
// in front of it to inject anything per-request.
//
// This mirrors buildLandingHtml() in artifacts/api-server/src/app.ts, which
// does the same per request when Express serves "/". The no-JavaScript landing
// markup itself is already in the built file (landing-prerender.html, inlined
// by vite.config.ts), so neither copy carries page wording.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, "../dist/public/index.html");

// Same fallback baked into the source index.html — see INDEX_HTML_FALLBACK_ORIGIN
// in artifacts/api-server/src/app.ts.
const FALLBACK_ORIGIN = "https://campus-val.vercel.app";

function resolveCanonicalOrigin() {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  // VERCEL_PROJECT_PRODUCTION_URL is the stable production domain; only
  // meaningful/desired for an actual production build. Preview builds use
  // their own deployment URL (VERCEL_URL) so a preview never claims to be
  // the production canonical.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return FALLBACK_ORIGIN;
}

const origin = resolveCanonicalOrigin();
const canonical = `${origin}/`;

let html = readFileSync(indexPath, "utf-8");

const canonicalTag = `<link rel="canonical" href="${canonical}" />\n    <meta property="og:url" content="${canonical}" />\n    <meta name="twitter:url" content="${canonical}" />`;
html = html.replace("<!-- canonical injected server-side for the root route -->", canonicalTag);
html = html.split(FALLBACK_ORIGIN).join(origin);

writeFileSync(indexPath, html);
console.log(`[postbuild-seo] baked canonical origin ${origin} into dist/public/index.html`);
