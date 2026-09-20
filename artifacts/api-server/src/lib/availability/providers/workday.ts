/**
 * Adapter for an SCU-authorized live section-availability source.
 *
 * WHAT THIS IS, AND IS NOT. CampusVal has no approved Workday endpoint yet
 * (see docs/WORKDAY_INTEGRATION.md and docs/SECTION_AVAILABILITY.md), so
 * this does NOT know or pretend to know Workday's real API. It implements
 * CampusVal's OWN documented input contract (`UpstreamAvailabilityPayload`
 * below) over HTTPS with a bearer credential from the environment. When SCU
 * (Tony) names the supported mechanism, one of two things is true:
 *   a) the source can emit this shape (e.g. behind an SCU-run gateway) —
 *      then this class works unchanged with just URL + credential; or
 *   b) it emits something else — then only `normalizeUpstreamPayload` is
 *      replaced. The service, cache, freshness rules, API and UI are already
 *      finished and do not change.
 *
 * It only ever runs when WORKDAY_AVAILABILITY_ENABLED=true, and it never
 * scrapes an authenticated Workday page.
 */
import { z } from "zod";

import { statusFromSeats } from "../freshness";
import type {
  AvailabilityQuery,
  AvailabilityStatus,
  CourseAvailabilityProvider,
  ProviderResult,
  SectionAvailabilityRecord,
  Term,
} from "../types";

const TERMS: readonly Term[] = ["fall", "winter", "spring", "summer"];

const nullableInt = z.number().int().nonnegative().nullable().optional();

/** The JSON body CampusVal expects from an approved availability source. */
export const UpstreamAvailabilityPayload = z.object({
  /** When the source says the whole snapshot was true (ISO 8601). */
  asOf: z.string().datetime({ offset: true }).nullable().optional(),
  sections: z.array(
    z.object({
      course: z.string().min(1),
      section: z.string().min(1),
      term: z.enum(["fall", "winter", "spring", "summer"]),
      year: z.number().int(),
      instructor: z.string().nullable().optional(),
      capacity: nullableInt,
      enrolled: nullableInt,
      seatsAvailable: nullableInt,
      waitlist: nullableInt,
      /** Optional explicit status; when absent it is derived from seat numbers. */
      status: z.string().nullable().optional(),
      updatedAt: z.string().datetime({ offset: true }).nullable().optional(),
    }),
  ),
});
export type UpstreamAvailabilityPayload = z.infer<typeof UpstreamAvailabilityPayload>;

function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

function statusFromLabel(label: string | null | undefined): AvailabilityStatus | null {
  if (!label) return null;
  const v = label.trim().toLowerCase();
  if (v === "open") return "open";
  if (v === "waitlist" || v === "waitlisted" || v === "wait list") return "waitlist";
  // An instructor-closed section and a merely-full one both mean "you can't
  // just enroll"; CampusVal has no source that separates them.
  if (v === "closed" || v === "full") return "full";
  return null;
}

/**
 * Validate and normalize an upstream payload. Records that individually fail
 * validation are dropped (never guessed at); a payload that is not the
 * expected shape at all is rejected as a whole.
 */
export function normalizeUpstreamPayload(
  raw: unknown,
  fetchedAt: string,
  source: SectionAvailabilityRecord["source"],
): { ok: true; records: SectionAvailabilityRecord[]; dropped: number } | { ok: false } {
  const top = z.object({ sections: z.array(z.unknown()) }).passthrough().safeParse(raw);
  if (!top.success) return { ok: false };

  const asOf = (raw as { asOf?: unknown }).asOf;
  const asOfIso = typeof asOf === "string" && !Number.isNaN(Date.parse(asOf)) ? asOf : null;

  const records: SectionAvailabilityRecord[] = [];
  let dropped = 0;
  for (const item of top.data.sections) {
    const parsed = UpstreamAvailabilityPayload.shape.sections.element.safeParse(item);
    if (!parsed.success || !TERMS.includes(parsed.data.term)) {
      dropped += 1;
      continue;
    }
    const s = parsed.data;
    const explicit = statusFromLabel(s.status);
    const derived = statusFromSeats({
      capacity: s.capacity,
      enrolled: s.enrolled,
      seatsAvailable: s.seatsAvailable,
      waitlistCount: s.waitlist,
    });
    // An explicit "closed/full" wins over derived seats (instructor-closed
    // sections can still show seats); otherwise seat numbers are the truth.
    const status: AvailabilityStatus =
      explicit === "full" || explicit === "waitlist" ? explicit : derived !== "unknown" ? derived : (explicit ?? "unknown");

    const seatsAvailable =
      s.seatsAvailable ??
      (s.capacity != null && s.enrolled != null ? Math.max(s.capacity - s.enrolled, 0) : null);

    records.push({
      courseCode: normalizeCourseCode(s.course),
      sectionNumber: s.section.trim(),
      term: s.term,
      year: s.year,
      instructor: s.instructor ?? null,
      capacity: s.capacity ?? null,
      enrolled: s.enrolled ?? null,
      seatsAvailable,
      waitlistCount: s.waitlist ?? null,
      status,
      // Prefer the upstream's own timestamp. If it gave none, the moment
      // CampusVal received the answer is the most we can honestly claim.
      lastUpdatedAt: s.updatedAt ?? asOfIso ?? fetchedAt,
      source,
    });
  }
  return { ok: true, records, dropped };
}

export interface WorkdayProviderConfig {
  url: string;
  authToken: string;
  /** Header carrying the credential. Default "Authorization". */
  authHeader?: string;
  /** Prefix before the token, e.g. "Bearer". Empty string sends the token bare. Default "Bearer". */
  authScheme?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export const WORKDAY_LIVE_SOURCE: SectionAvailabilityRecord["source"] = {
  id: "workday_live",
  label: "Workday (SCU-approved availability feed)",
  isLive: true,
};

export class WorkdayAvailabilityProvider implements CourseAvailabilityProvider {
  readonly id = "workday_live" as const;
  readonly label = WORKDAY_LIVE_SOURCE.label;
  readonly isLiveSource = true;

  private readonly cfg: Required<Omit<WorkdayProviderConfig, "fetchImpl" | "now">> & {
    fetchImpl: typeof fetch;
    now: () => Date;
  };

  constructor(cfg: WorkdayProviderConfig) {
    this.cfg = {
      url: cfg.url,
      authToken: cfg.authToken,
      authHeader: cfg.authHeader ?? "Authorization",
      authScheme: cfg.authScheme ?? "Bearer",
      timeoutMs: cfg.timeoutMs ?? 5000,
      fetchImpl: cfg.fetchImpl ?? fetch,
      now: cfg.now ?? (() => new Date()),
    };
  }

  async getAvailability(query: AvailabilityQuery): Promise<ProviderResult> {
    const url = new URL(this.cfg.url);
    url.searchParams.set("term", query.term);
    url.searchParams.set("year", String(query.year));

    const headers: Record<string, string> = { Accept: "application/json" };
    headers[this.cfg.authHeader] = this.cfg.authScheme
      ? `${this.cfg.authScheme} ${this.cfg.authToken}`
      : this.cfg.authToken;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const res = await this.cfg.fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "error", // never follow a redirect to another host carrying the credential
      });
      // NOTE: messages below deliberately contain no response body, URL,
      // header or token — only a coarse reason.
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: "unauthorized", message: "The availability source rejected CampusVal's credential." };
      }
      if (!res.ok) {
        return { ok: false, reason: "upstream_error", message: `The availability source returned HTTP ${res.status}.` };
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        return { ok: false, reason: "invalid_payload", message: "The availability source returned a response that is not JSON." };
      }
      const fetchedAt = this.cfg.now().toISOString();
      const normalized = normalizeUpstreamPayload(json, fetchedAt, WORKDAY_LIVE_SOURCE);
      if (!normalized.ok) {
        return { ok: false, reason: "invalid_payload", message: "The availability source returned an unexpected payload shape." };
      }
      return { ok: true, records: normalized.records, fetchedAt };
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        return { ok: false, reason: "timeout", message: "The availability source did not respond in time." };
      }
      return { ok: false, reason: "upstream_error", message: "The availability source could not be reached." };
    } finally {
      clearTimeout(timer);
    }
  }
}
