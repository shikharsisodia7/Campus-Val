/**
 * The URL as it may appear in request logs: query string dropped, and the
 * signed token in a local-upload link replaced.
 *
 * `PUT /api/storage/local-upload/:token` authorizes a write on possession of the
 * token alone (15-minute, single-object, HMAC-signed). Logs are routinely shipped
 * to third-party collectors and read by more people than can write to storage, so
 * a token that lands in a log line is a write credential handed to the log
 * pipeline. Path-embedded secrets are exactly what a "strip the query string"
 * rule misses.
 */
const UPLOAD_TOKEN_SEGMENT = /(\/storage\/local-upload\/)[^/?#]+/i;

export function sanitizeLoggedUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.split("?")[0]!.split("#")[0]!.replace(UPLOAD_TOKEN_SEGMENT, "$1[redacted]");
}
