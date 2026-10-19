import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import { authSessionMiddleware } from "./lib/auth";
import router from "./routes";
import { logger } from "./lib/logger";
import { sanitizeLoggedUrl } from "./lib/log-url";
import { isOriginAllowed, resolveTrustProxy } from "./lib/config";
import { publicOrigin } from "./lib/public-origin";

const app: Express = express();

// Behind a university reverse proxy / load balancer the socket peer is the
// proxy, so req.protocol / req.ip / secure-cookie decisions are only correct
// when Express is told how many proxy hops to trust. Off unless TRUST_PROXY
// is set (see docs/SCU_DEPLOYMENT.md) — trusting X-Forwarded-* from an
// untrusted network would let any client spoof its IP and protocol.
app.set("trust proxy", resolveTrustProxy());
app.disable("x-powered-by");

/**
 * Baseline response hardening that is safe for every route (API and SPA).
 * A full Content-Security-Policy is deliberately NOT set here: the SPA loads
 * Clerk's hosted scripts/frames, and a wrong CSP would break sign-in. The
 * private-file route sets its own strict CSP (see private-file-response.ts).
 */
app.use((req: Request, res: Response, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=()");
  // Pre-pilot: invited participants only, never indexed (docs/PILOT_STATUS.md).
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.secure) {
    // Only advertised over TLS (req.secure honours trust proxy), so a plain-
    // http local run never pins browsers to https.
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: sanitizeLoggedUrl(req.url),
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

// Credentialed CORS is an allowlist, not a reflection of any Origin. The
// bundled frontend is same-origin (no CORS needed); PUBLIC_APP_URL and
// CORS_ALLOWED_ORIGINS name any extra browser origins. Disallowed origins get
// no CORS headers (the browser blocks the read) rather than an error.
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session verification for the configured identity provider (AUTH_PROVIDER;
// Clerk today, SCU SSO later — see lib/auth). Routes only see req.userId.
app.use(authSessionMiddleware());

app.use("/api", router);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidates = [
  // Named explicitly (a test, or a host that keeps the web app elsewhere): used
  // instead of looking for a build beside the server.
  ...(process.env["WEB_APP_DIR"] ? [path.resolve(process.env["WEB_APP_DIR"])] : []),
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
  "/progress-report",
  "/degree-checksheets",
  "/shared-with-me",
  "/admin/usage",
  "/admin/feedback",
  "/admin/program-requirements",
]);

// The fallback origin baked into index.html's static og:image/JSON-LD tags,
// used only if this file is ever served without going through this function
// (e.g. `vite preview` locally). Rewritten below to the real request origin
// so production never advertises a stale/decommissioned domain.
const INDEX_HTML_FALLBACK_ORIGIN = "https://campus-val.vercel.app";

function buildLandingHtml(indexHtml: string, origin: string): string {
  const canonical = `${origin}/`;
  let html = indexHtml;

  // Inject canonical + og:url + twitter:url into <head>
  const canonicalTag = `<link rel="canonical" href="${canonical}" />\n    <meta property="og:url" content="${canonical}" />\n    <meta name="twitter:url" content="${canonical}" />`;
  html = html.replace(
    "<!-- canonical injected server-side for the root route -->",
    canonicalTag,
  );

  // Rewrite the fallback origin baked into og:image/twitter:image/JSON-LD to
  // this request's real origin, so the deployed domain never leaks a stale
  // hardcoded one (e.g. after moving off Replit).
  html = html.split(INDEX_HTML_FALLBACK_ORIGIN).join(origin);

  return html;
}

if (staticDir) {
  logger.info({ staticDir }, "Serving static frontend");

  // Root route: inject the canonical URL. The no-JavaScript landing markup is
  // already in the built index.html (landing-prerender.html, inlined by Vite).
  // Must be registered BEFORE express.static so the directory index doesn't
  // short-circuit this handler.
  app.get("/", (req: Request, res: Response) => {
    const indexPath = path.join(staticDir, "index.html");
    fs.readFile(indexPath, "utf-8", (err, data) => {
      if (err) {
        res.status(500).send("Internal Server Error");
        return;
      }
      const origin = publicOrigin(req);
      const html = buildLandingHtml(data, origin);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    });
  });

  // Static assets (JS, CSS, images, fonts, etc.) — registered after the root
  // handler so GET / is handled above, not by the directory index.
  app.use(express.static(staticDir));

  // robots.txt (Disallow: / during the pilot): from the static build if
  // present, otherwise a real 404. Sent as is; it names no domain.
  app.get("/robots.txt", (_req, res) => {
    const filePath = path.join(staticDir, "robots.txt");
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    res.type("text/plain").sendFile(filePath);
  });

  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    const firstSegment = "/" + (req.path.split("/").filter(Boolean)[0] ?? "");
    const known = SPA_ROUTES.has(req.path) || SPA_ROUTES.has(firstSegment);
    const status = known ? 200 : 404;
    fs.readFile(path.join(staticDir, "index.html"), "utf-8", (err, data) => {
      if (err) {
        res.status(500).send("Internal Server Error");
        return;
      }
      const origin = publicOrigin(req);
      const html = data.split(INDEX_HTML_FALLBACK_ORIGIN).join(origin);
      res.status(status).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });
} else {
  logger.warn({ candidates }, "Frontend build not found; only /api will be served");
}

/**
 * Last-resort error handler. Anything a route did not handle becomes a generic
 * JSON response — never a stack trace, SQL text, file path, or a third-party
 * error body. The detail stays in the server log (error name + request id),
 * which is where operators look. Malformed request bodies keep their 4xx.
 */
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
  const clientError = typeof status === "number" && status >= 400 && status < 500;
  if (!clientError) {
    req.log?.error({ event: "unhandled_error", errorName: err instanceof Error ? err.name : "unknown", err }, "Unhandled error");
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  res
    .status(clientError ? status : 500)
    .json({ error: clientError ? "The request could not be processed." : "Something went wrong. Please try again." });
});

export default app;
