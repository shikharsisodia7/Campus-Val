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

/**
 * What happened with the live source for one term, for operators watching
 * registration (no URL, credential or upstream body, ever).
 */
export interface TermDiagnostics {
  term: Term;
  year: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: ProviderFailureReason | null;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  /** Section records in the last successful response. */
  sectionsUpdated: number;
}

export type RefreshOutcome =
  | { refreshed: true }
  | { refreshed: false; reason: "not_live" }
  | { refreshed: false; reason: "too_soon"; retryAfterSeconds: number }
  | { refreshed: false; reason: "failed"; failure: ProviderFailureReason };

export interface AvailabilityServiceOptions {
  live?: CourseAvailabilityProvider | null;
  fixture?: CourseAvailabilityProvider | null;
  manual: CourseAvailabilityProvider;
  cacheTtlMs?: number;
  /** How long a failed upstream call suppresses further attempts. Default: min(cacheTtlMs, 15 s). */
  failureBackoffMs?: number;
  /**
   * The shortest gap between two upstream calls a "Refresh availability"
   * request may force for one term (bounded upstream traffic during
   * registration). Defaults to the cache TTL, at least 15 s.
   */
  minRefreshIntervalMs?: number;
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
  /** term key -> what happened upstream, for the diagnostics endpoint. */
  private readonly stats = new Map<string, TermDiagnostics>();
  private readonly minRefreshIntervalMs: number;

  constructor(private readonly opts: AvailabilityServiceOptions) {
    this.now = opts.now ?? (() => new Date());
    this.failureBackoffMs = opts.failureBackoffMs ?? Math.min(opts.cacheTtlMs ?? 60_000, 15_000);
    this.cache = new SingleFlightTtlCache<OkResult>(opts.cacheTtlMs ?? 60_000, 32, () => this.now().getTime());
    this.livePolicy = opts.livePolicy ?? DEFAULT_LIVE_POLICY;
    this.manualPolicy = opts.manualPolicy ?? MANUAL_PASTE_POLICY;
    this.minRefreshIntervalMs = opts.minRefreshIntervalMs ?? Math.max(opts.cacheTtlMs ?? 60_000, 15_000);
  }

  private statsFor(term: Term, year: number): TermDiagnostics {
    const key = `${term}|${year}`;
    let s = this.stats.get(key);
    if (!s) {
      s = {
        term,
        year,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        sectionsUpdated: 0,
      };
      this.stats.set(key, s);
      // Bounded like the cache: a long-running process never accumulates every term ever asked for.
      while (this.stats.size > 32) this.stats.delete(this.stats.keys().next().value!);
    }
    return s;
  }

  /** Configuration and per-term upstream history. Safe to show to an administrator. */
  diagnostics(): {
    liveConfigured: boolean;
    provider: string | null;
    cacheTtlSeconds: number;
    minRefreshSeconds: number;
    liveWithinSeconds: number;
    staleAfterSeconds: number;
    fixtureActive: boolean;
    terms: TermDiagnostics[];
  } {
    return {
      liveConfigured: this.liveConfigured,
      provider: this.opts.live?.id ?? null,
      cacheTtlSeconds: Math.round((this.opts.cacheTtlMs ?? 60_000) / 1000),
      minRefreshSeconds: Math.round(this.minRefreshIntervalMs / 1000),
      liveWithinSeconds: Math.round(this.livePolicy.liveWithinMs / 1000),
      staleAfterSeconds: Math.round(this.livePolicy.staleAfterMs / 1000),
      fixtureActive: !!this.opts.fixture,
      terms: [...this.stats.values()].map((s) => ({ ...s })),
    };
  }

  /**
   * "Refresh availability": force one upstream call for the term, unless the
   * last attempt was less than `minRefreshIntervalMs` ago. Never throws; a
   * failure keeps the last good answer (stale-if-error).
   */
  async refreshTerm(term: Term, year: number): Promise<RefreshOutcome> {
    if (!this.opts.live) return { refreshed: false, reason: "not_live" };
    const s = this.stats.get(`${term}|${year}`);
    const last = s?.lastAttemptAt ? Date.parse(s.lastAttemptAt) : null;
    const elapsed = last === null ? Number.POSITIVE_INFINITY : this.now().getTime() - last;
    if (elapsed < this.minRefreshIntervalMs) {
      return { refreshed: false, reason: "too_soon", retryAfterSeconds: Math.ceil((this.minRefreshIntervalMs - elapsed) / 1000) };
    }
    const key = `${term}|${year}`;
    this.cache.expire(key);
    this.failures.delete(key); // an explicit refresh is allowed past the outage backoff
    const { failure } = await this.fetchLive(term, year);
    return failure ? { refreshed: false, reason: "failed", failure } : { refreshed: true };
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
        const stats = this.statsFor(term, year);
        stats.lastAttemptAt = this.now().toISOString();
        try {
          r = await live.getAvailability({ term, year });
        } catch {
          r = { ok: false, reason: "upstream_error", message: "" };
        }
        if (!r.ok) {
          this.failures.set(key, { at: this.now().getTime(), reason: r.reason });
          stats.lastFailureAt = this.now().toISOString();
          stats.lastFailureReason = r.reason;
          stats.consecutiveFailures += 1;
          stats.totalFailures += 1;
          throw new ProviderFailure(r.reason);
        }
        this.failures.delete(key);
        stats.lastSuccessAt = this.now().toISOString();
        stats.consecutiveFailures = 0;
        stats.totalSuccesses += 1;
        stats.sectionsUpdated = r.records.length;
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
    this.stats.clear();
  }
}
