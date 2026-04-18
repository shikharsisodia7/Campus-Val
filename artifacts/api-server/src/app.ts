import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidates = [
  path.resolve(__dirname, "../../scu-advising/dist/public"),
  path.resolve(__dirname, "../../../artifacts/scu-advising/dist/public"),
  path.resolve(process.cwd(), "artifacts/scu-advising/dist/public"),
];
const staticDir = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));

if (staticDir) {
  logger.info({ staticDir }, "Serving static frontend");
  app.use(express.static(staticDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });
} else {
  logger.warn({ candidates }, "Frontend build not found; only /api will be served");
}

export default app;
