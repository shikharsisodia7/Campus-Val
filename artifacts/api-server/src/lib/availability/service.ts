/**
 * Availability service: turns whichever providers are configured into ONE
 * answer per section, with an honest freshness and provenance, and turns
 * provider failure into "unknown" — never into a fabricated "open".
 *
 * Precedence per section (first source that has a record wins):
 *   1. live provider (Workday) — only when WORKDAY_AVAILABILITY_ENABLED=true
 *   2. fixture provider — development only, clearly labelled SAMPLE DATA
 *   3. manual Workday paste (DB snapshot by the data steward)
 * Anything with no record stays `unknown` from the static Registrar schedule.
 *
 * Failure handling for the live provider:
 *   - success → cached for `cacheTtlMs`, one upstream call per TTL (single-flight)
 *   - failure with a previous good result → keep serving it; its age decides
 *     whether it is still "cached" or has gone "stale" (stale ⇒ status unknown)
 *   - failure with nothing to fall back on → live state "unavailable"; sections
 *     fall through to the manual snapshot / static schedule
 *   - a failed upstream call is remembered for `failureBackoffMs`, during which
 *     the upstream is NOT called again: an outage costs one timeout per backoff
 *     window, not one per student request (each of which would otherwise block
 *     for the full upstream timeout before answering "unknown")
 * Planning never breaks: `getTermAvailability` does not throw.
 */
import { SingleFlightTtlCache } from "./cache";
import {
  DEFAULT_LIVE_POLICY,
  MANUAL_PASTE_POLICY,
  classifyFreshness,
  trustedStatus,
  type FreshnessPolicy,
} from "./freshness";
import type {
  AvailabilityFreshness,
  CourseAvailabilityProvider,
  ProviderFailureReason,
  ProviderResult,
  ResolvedAvailability,
  SectionAvailabilityRecord,
  Term,
} from "./types";

type OkResult = Extract<ProviderResult, { ok: true }>;

/** What the header of the section picker can say about the live feed as a whole. */
export type LiveFeedState =
  | "live" // upstream answered recently
  | "cached" // serving a previous upstream answer (within the stale limit)
  | "stale" // previous upstream answer is too old to trust
  | "unavailable" // configured, but not reachable and nothing to fall back on
  | "not_configured"; // no live provider is enabled in this deployment

export interface TermAvailability {
  /** key = `${COURSE CODE}|${sectionNumber}` */
  bySection: Map<string, ResolvedAvailability & { record: SectionAvailabilityRecord }>;
  live: {
    state: LiveFeedState;
    /** Newest upstream timestamp we hold, or null. */
    lastUpdatedAt: string | null;
    failure: ProviderFailureReason | null;
  };
  /** True when a development fixture is contributing (UI shows SAMPLE DATA). */
  fixtureActive: boolean;
}

export interface AvailabilityServiceOptions {
  live?: CourseAvailabilityProvider | null;
  fixture?: CourseAvailabilityProvider | null;
  manual: CourseAvailabilityProvider;
  cacheTtlMs?: number;
  /** How long a failed upstream call suppresses further attempts. Default: min(cacheTtlMs, 15 s). */
  failureBackoffMs?: number;
  livePolicy?: FreshnessPolicy;
  manualPolicy?: FreshnessPolicy;
  now?: () => Date;
  onProviderFailure?: (info: { provider: string; reason: ProviderFailureReason }) => void;
}

export const sectionKey = (courseCode: string, sectionNumber: string): string =>
  `${courseCode.trim().toUpperCase().replace(/\s+/g, " ")}|${sectionNumber.trim()}`;

class ProviderFailure extends Error {
  constructor(readonly reason: ProviderFailureReason) {
    super(reason);
  }
}

/** A failure replayed from the backoff window: no upstream call was made, so nothing new to report. */
class BackedOff extends ProviderFailure {}

export class AvailabilityService {
  private readonly cache: SingleFlightTtlCache<OkResult>;
  private readonly livePolicy: FreshnessPolicy;
  private readonly manualPolicy: FreshnessPolicy;
  private readonly now: () => Date;
  private readonly failureBackoffMs: number;
  /** key → when the last upstream attempt failed and why. */
  private readonly failures = new Map<string, { at: number; reason: ProviderFailureReason }>();
  /** Failures already reported: every waiter on one shared in-flight call sees the SAME error object. */
  private readonly reported = new WeakSet<Error>();

  constructor(private readonly opts: AvailabilityServiceOptions) {
    this.now = opts.now ?? (() => new Date());
    this.failureBackoffMs = opts.failureBackoffMs ?? Math.min(opts.cacheTtlMs ?? 60_000, 15_000);
    this.cache = new SingleFlightTtlCache<OkResult>(opts.cacheTtlMs ?? 60_000, 32, () => this.now().getTime());
    this.livePolicy = opts.livePolicy ?? DEFAULT_LIVE_POLICY;
    this.manualPolicy = opts.manualPolicy ?? MANUAL_PASTE_POLICY;
  }

  get liveConfigured(): boolean {
    return !!this.opts.live;
  }

  private async fetchLive(term: Term, year: number): Promise<{ result: OkResult | null; failure: ProviderFailureReason | null }> {
    const live = this.opts.live;
    if (!live) return { result: null, failure: null };
    const key = `${term}|${year}`;
    try {
      const { value } = await this.cache.get(key, async () => {
        const recent = this.failures.get(key);
        if (recent && this.now().getTime() - recent.at < this.failureBackoffMs) {
          throw new BackedOff(recent.reason); // do not hammer (or wait on) an upstream that just failed
        }
        let r: ProviderResult;
        try {
          r = await live.getAvailability({ term, year });
        } catch {
          r = { ok: false, reason: "upstream_error", message: "" };
        }
        if (!r.ok) {
          this.failures.set(key, { at: this.now().getTime(), reason: r.reason });
          throw new ProviderFailure(r.reason);
        }
        this.failures.delete(key);
        return r;
      });
      return { result: value, failure: null };
    } catch (err) {
      const reason: ProviderFailureReason = err instanceof ProviderFailure ? err.reason : "upstream_error";
      // Report each real upstream failure once — not once per student who was waiting on it,
      // and not for replays from the backoff window (no upstream call was made).
      if (err instanceof Error && !(err instanceof BackedOff) && !this.reported.has(err)) {
        this.reported.add(err);
        this.opts.onProviderFailure?.({ provider: live.id, reason });
      }
      // Stale-if-error: keep serving the last good answer; freshness decides whether it is trusted.
      const previous = this.cache.peek(key);
      return { result: previous?.value ?? null, failure: reason };
    }
  }

  async getTermAvailability(term: Term, year: number, courseCode?: string): Promise<TermAvailability> {
    const now = this.now();
    const bySection: TermAvailability["bySection"] = new Map();

    const only = courseCode?.trim().toUpperCase().replace(/\s+/g, " ");
    const put = (record: SectionAvailabilityRecord, policy: FreshnessPolicy, treatAsLive: boolean) => {
      if (only && record.courseCode.trim().toUpperCase().replace(/\s+/g, " ") !== only) return;
      const key = sectionKey(record.courseCode, record.sectionNumber);
      if (bySection.has(key)) return; // a higher-precedence source already answered
      let freshness: AvailabilityFreshness = classifyFreshness(record.lastUpdatedAt, now, policy);
      // A non-live source is a snapshot, never "live".
      if (!treatAsLive && freshness === "live") freshness = "cached";
      bySection.set(key, {
        availabilityStatus: trustedStatus(record.status, freshness),
        lastUpdatedAt: record.lastUpdatedAt,
        sourceType:
          record.source.id === "workday_live"
            ? "workday_live"
            : record.source.id === "fixture"
              ? "fixture"
              : record.source.id === "manual_workday_paste"
                ? "workday_self_paste"
                : "registrar_schedule",
        sourceLabel: record.source.label,
        isLive: record.source.isLive && freshness === "live",
        freshness,
        record,
      });
    };

    // 1. live
    let liveState: TermAvailability["live"] = { state: "not_configured", lastUpdatedAt: null, failure: null };
    if (this.opts.live) {
      const { result, failure } = await this.fetchLive(term, year);
      if (result) {
        let newest: string | null = null;
        for (const r of result.records) {
          put(r, this.livePolicy, true);
          if (r.lastUpdatedAt && (!newest || Date.parse(r.lastUpdatedAt) > Date.parse(newest))) newest = r.lastUpdatedAt;
        }
        const f = classifyFreshness(newest ?? result.fetchedAt, now, this.livePolicy);
        liveState = {
          state: f === "unavailable" ? "unavailable" : f,
          lastUpdatedAt: newest ?? result.fetchedAt,
          failure,
        };
      } else {
        liveState = { state: "unavailable", lastUpdatedAt: null, failure };
      }
    }

    // 2. fixture (development only)
    let fixtureActive = false;
    if (this.opts.fixture) {
      const r = await this.opts.fixture.getAvailability({ term, year, courseCode }).catch((): ProviderResult => ({ ok: false, reason: "upstream_error", message: "" }));
      if (r.ok) {
        fixtureActive = r.records.length > 0;
        for (const rec of r.records) put(rec, { liveWithinMs: 0, staleAfterMs: Number.MAX_SAFE_INTEGER }, false);
      }
    }

    // 3. manual paste snapshot
    const manual = await this.opts.manual
      .getAvailability({ term, year, courseCode })
      .catch((): ProviderResult => ({ ok: false, reason: "upstream_error", message: "" }));
    if (manual.ok) for (const rec of manual.records) put(rec, this.manualPolicy, false);

    return { bySection, live: liveState, fixtureActive };
  }

  /** Test seam. */
  clearCache(): void {
    this.cache.clear();
    this.failures.clear();
  }
}
