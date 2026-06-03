import express, { type Express } from "express";
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

const CRAWLER_FILES = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt"]);

const SPA_ROUTES = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/onboarding",
  "/courses",
  "/planner",
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
  "/evaluation",
]);

if (staticDir) {
  logger.info({ staticDir }, "Serving static frontend");
  app.use(express.static(staticDir));

  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    if (CRAWLER_FILES.has(req.path)) {
      return res.status(404).end();
    }

    if (SPA_ROUTES.has(req.path)) {
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
