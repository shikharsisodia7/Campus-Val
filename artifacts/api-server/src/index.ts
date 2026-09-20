// MUST stay the first import: validates the environment before the app (and the
// database module, which throws on a missing DATABASE_URL) is even loaded.
import "./config-check";
import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env["PORT"]);
// 0.0.0.0 so the process is reachable from outside a container/VM network
// namespace; set HOST=127.0.0.1 when a same-host reverse proxy fronts it.
const host = process.env["HOST"]?.trim() || "0.0.0.0";

const server = app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
});

// Container/VM orchestrators stop a service with SIGTERM. Stop accepting new
// connections, let in-flight requests (e.g. an APR upload being parsed)
// finish, then exit — with a hard cap so a stuck socket can't block a deploy.
const SHUTDOWN_GRACE_MS = 15_000;
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  const force = setTimeout(() => {
    logger.warn("Graceful shutdown timed out; exiting");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();
  server.close((closeErr) => {
    if (closeErr) logger.error({ err: closeErr }, "Error while closing server");
    process.exit(closeErr ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
