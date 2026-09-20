import type { Request } from "express";

/**
 * The externally-visible origin of this deployment, e.g.
 * "https://campusval.scu.edu".
 *
 * PUBLIC_APP_URL wins when set — behind a reverse proxy the Host header may
 * be an internal name — and otherwise it is the request's own origin, which
 * is correct on Vercel and local runs (and behind a proxy once TRUST_PROXY is
 * configured, since req.protocol then honours X-Forwarded-Proto).
 */
export function publicOrigin(req: Pick<Request, "protocol" | "get">): string {
  const configured = process.env["PUBLIC_APP_URL"]?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* invalid value is reported at startup; fall through */
    }
  }
  return `${req.protocol}://${req.get("host")}`;
}
