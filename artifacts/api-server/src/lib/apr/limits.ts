/**
 * Size limits for APR uploads and for the workbook CampusVal will hold.
 *
 * The upload limit is configurable (`APR_MAX_UPLOAD_MB`) because a self-hosted
 * deployment sits behind a reverse proxy with its own body limit and the two
 * must agree — see docs/SCU_DEPLOYMENT.md. The structural limits are fixed:
 * they bound memory while reading an untrusted file.
 */

const DEFAULT_MAX_UPLOAD_MB = 10;
const HARD_MAX_UPLOAD_MB = 50;

export function aprMaxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env["APR_MAX_UPLOAD_MB"]);
  const mb = Number.isFinite(raw) && raw >= 1 && raw <= HARD_MAX_UPLOAD_MB ? raw : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(mb * 1024 * 1024);
}

export function aprMaxUploadLabel(env: NodeJS.ProcessEnv = process.env): string {
  return `${Math.round(aprMaxUploadBytes(env) / (1024 * 1024))} MB`;
}

export const APR_LIMITS = {
  maxSheets: 25,
  maxRows: 20_000,
  maxColumns: 80,
  maxCells: 200_000,
  maxCellTextLength: 4_000,
  /** Total size the zip may declare once inflated (guards against zip bombs). */
  maxInflatedBytes: 150 * 1024 * 1024,
  maxZipEntries: 2_000,
} as const;

export const APR_LABEL_MAX_LENGTH = 80;
/** A generous cap on documents per student: many majors/minors, never unbounded. */
export const APR_MAX_DOCUMENTS_PER_USER = 12;
