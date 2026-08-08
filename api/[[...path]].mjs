// Vercel Function entry for the entire Express API (mounted at /api/* by the
// app itself — see artifacts/api-server/src/app.ts, `app.use("/api", router)`).
// The optional catch-all filename ([[...path]]) matches both the bare "/api"
// path and every "/api/*" sub-path, handing the original request straight
// through to Express, which does its own internal routing exactly as it
// does locally/on Replit — nothing about Express's routing changes here.
//
// Requires artifacts/api-server/dist/vercel.mjs to already exist, which the
// "vercel-build" script (see package.json) builds before Vercel packages
// this function.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
