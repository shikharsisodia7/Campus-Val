import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted BEFORE body parsers (it streams raw bytes).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);

app.use("/api", router);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidates = [
  path.resolve(__dirname, "../../scu-advising/dist/public"),
  path.resolve(__dirname, "../../../artifacts/scu-advising/dist/public"),
  path.resolve(process.cwd(), "artifacts/scu-advising/dist/public"),
];
const staticDir = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));

const SPA_ROUTES = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/onboarding",
  "/courses",
  "/planner",
  "/degree-plan",
  "/tentative-plans",
  "/schedule",
  "/gpa",
  "/transfer",
  "/sync-workday",
  "/policies",
  "/advisor",
  "/voice",
  "/graduation-paths",
  "/professors",
  "/core-reqs",
  "/compare",
  "/advice",
  "/resources",
  "/evaluation",
  "/feedback",
]);

// Static prerendered landing HTML injected for crawlers that don't execute JS.
// React will hydrate/overwrite this on the client.
const LANDING_PRERENDER = `
<div style="min-height:100vh;font-family:Inter,system-ui,sans-serif;background:#fff;color:#1a1a1a">
  <header style="position:sticky;top:0;z-index:40;border-bottom:1px solid #e5e7eb;background:rgba(255,255,255,0.8);backdrop-filter:blur(8px)">
    <div style="max-width:64rem;margin:0 auto;padding:0 1.5rem;height:4rem;display:flex;align-items:center;justify-content:space-between">
      <a href="/" style="display:flex;align-items:center;gap:0.625rem;text-decoration:none;color:inherit">
        <img src="/logo-bronco.png" width="36" height="36" alt="CampusVal Bronco logo" />
        <span style="font-weight:700;font-size:1.125rem;letter-spacing:-0.025em">CampusVal</span>
      </a>
      <div style="display:flex;align-items:center;gap:0.5rem">
        <a href="/sign-in" style="padding:0.375rem 0.75rem;border-radius:0.375rem;text-decoration:none;color:#1a1a1a;font-size:0.875rem">Sign in</a>
        <a href="/sign-up" style="padding:0.375rem 0.75rem;border-radius:0.375rem;background:#8C1515;color:#fff;text-decoration:none;font-size:0.875rem">Get started</a>
      </div>
    </div>
  </header>
  <section style="max-width:64rem;margin:0 auto;padding:5rem 1.5rem 6rem;text-align:center">
    <img src="/logo-bronco.png" width="88" height="88" alt="CampusVal Bronco logo" style="display:inline-block;margin-bottom:2rem" />
    <h1 style="font-size:3rem;font-weight:700;line-height:1.2;letter-spacing:-0.025em;max-width:40rem;margin:0 auto">
      Your AI academic advisor for <span style="color:#8C1515">Santa Clara</span>
    </h1>
    <p style="margin-top:1.25rem;font-size:1.125rem;color:#6b6b6b;max-width:32rem;margin-left:auto;margin-right:auto">
      Plan your quarters, track Core requirements, and get answers grounded in real SCU policy.
    </p>
    <div style="margin-top:2rem;display:flex;align-items:center;justify-content:center;gap:0.75rem">
      <a href="/sign-up" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.5rem;background:#8C1515;color:#fff;border-radius:0.5rem;text-decoration:none;font-size:1rem;font-weight:500">
        Sign up with SCU email &#8594;
      </a>
      <a href="/sign-in" style="display:inline-flex;align-items:center;padding:0.75rem 1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;text-decoration:none;color:#1a1a1a;font-size:1rem">
        Sign in
      </a>
    </div>
    <p style="margin-top:1rem;font-size:0.75rem;color:#6b6b6b">Requires an <code style="color:#8C1515">@scu.edu</code> account.</p>
  </section>
  <section style="max-width:64rem;margin:0 auto;padding:0 1.5rem 6rem">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
      <div style="border-radius:0.75rem;border:1px solid #e5e7eb;padding:1.25rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:rgba(140,21,21,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C1515" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </div>
        <div style="font-weight:600">Core tracker</div>
        <div style="font-size:0.875rem;color:#6b6b6b;margin-top:0.25rem">Check off SCU Core requirements as you complete them.</div>
      </div>
      <div style="border-radius:0.75rem;border:1px solid #e5e7eb;padding:1.25rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:rgba(140,21,21,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C1515" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div style="font-weight:600">Quarter planner</div>
        <div style="font-size:0.875rem;color:#6b6b6b;margin-top:0.25rem">Unit caps and prereq checks before you register.</div>
      </div>
      <div style="border-radius:0.75rem;border:1px solid #e5e7eb;padding:1.25rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:rgba(140,21,21,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C1515" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <div style="font-weight:600">Graduation paths</div>
        <div style="font-size:0.875rem;color:#6b6b6b;margin-top:0.25rem">3- and 4-year plans for every undergrad major.</div>
      </div>
      <div style="border-radius:0.75rem;border:1px solid #e5e7eb;padding:1.25rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:rgba(140,21,21,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C1515" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div style="font-weight:600">Course catalog</div>
        <div style="font-size:0.875rem;color:#6b6b6b;margin-top:0.25rem">Search every department, with live section data.</div>
      </div>
      <div style="border-radius:0.75rem;border:1px solid #e5e7eb;padding:1.25rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:rgba(140,21,21,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C1515" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div style="font-weight:600">AI advisor</div>
        <div style="font-size:0.875rem;color:#6b6b6b;margin-top:0.25rem">Answers grounded in SCU's bulletin and policies.</div>
      </div>
      <div style="border-radius:0.75rem;border:1px solid #e5e7eb;padding:1.25rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:rgba(140,21,21,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C1515" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
        </div>
        <div style="font-weight:600">Transfer credit</div>
        <div style="font-size:0.875rem;color:#6b6b6b;margin-top:0.25rem">ASSIST.org articulation for California colleges.</div>
      </div>
    </div>
  </section>
  <footer style="border-top:1px solid #e5e7eb;padding:1.5rem;text-align:center;font-size:0.75rem;color:#6b6b6b">
    An independent student tool, not affiliated with Santa Clara University. Always confirm decisions with an official SCU advisor.
  </footer>
</div>
`.trim();

function buildLandingHtml(indexHtml: string, origin: string): string {
  const canonical = `${origin}/`;
  let html = indexHtml;

  // Inject canonical + og:url + twitter:url into <head>
  const canonicalTag = `<link rel="canonical" href="${canonical}" />\n    <meta property="og:url" content="${canonical}" />\n    <meta name="twitter:url" content="${canonical}" />`;
  html = html.replace(
    "<!-- canonical injected server-side for the root route -->",
    canonicalTag,
  );

  // Inject prerendered landing content into #root
  html = html.replace(
    "<!--CAMPUSVAL_PRERENDER-->",
    LANDING_PRERENDER,
  );

  return html;
}

if (staticDir) {
  logger.info({ staticDir }, "Serving static frontend");

  // Root route: inject canonical URL + prerendered landing HTML for crawlers.
  // Must be registered BEFORE express.static so the directory index doesn't
  // short-circuit this handler.
  app.get("/", (req: Request, res: Response) => {
    const indexPath = path.join(staticDir, "index.html");
    fs.readFile(indexPath, "utf-8", (err, data) => {
      if (err) {
        res.status(500).send("Internal Server Error");
        return;
      }
      const origin = `${req.protocol}://${req.get("host")}`;
      const html = buildLandingHtml(data, origin);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    });
  });

  // Static assets (JS, CSS, images, fonts, etc.) — registered after the root
  // handler so GET / is handled above, not by the directory index.
  app.use(express.static(staticDir));

  // Crawler governance files: serve from static if present, otherwise real 404.
  app.get(["/robots.txt", "/sitemap.xml", "/llms.txt"], (req, res) => {
    const filePath = path.join(staticDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).end();
    }
  });

  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    const firstSegment = "/" + (req.path.split("/").filter(Boolean)[0] ?? "");
    const known = SPA_ROUTES.has(req.path) || SPA_ROUTES.has(firstSegment);
    if (known) {
      return res.sendFile(path.join(staticDir, "index.html"));
    }
    return res.status(404).sendFile(path.join(staticDir, "index.html"));
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });
} else {
  logger.warn({ candidates }, "Frontend build not found; only /api will be served");
}

export default app;
