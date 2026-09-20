/**
 * The availability layer, tested with deterministic fixtures and fakes — no
 * network, no real Workday. Covers what the professor asked to be provable:
 * open, full/closed, unavailable, upstream failure, stale data, missing
 * optional fields, cache behaviour, and "fixtures are never live".
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SingleFlightTtlCache } from "./cache";
import {
  DEFAULT_LIVE_POLICY,
  MANUAL_PASTE_POLICY,
  classifyFreshness,
  statusFromSeats,
  trustedStatus,
} from "./freshness";
import { WorkdayAvailabilityProvider, normalizeUpstreamPayload, WORKDAY_LIVE_SOURCE } from "./providers/workday";
import { FixtureAvailabilityProvider } from "./providers/fixture";
import { StaticCatalogAvailabilityProvider } from "./providers/staticCatalog";
import { AvailabilityService, sectionKey } from "./service";
import { buildAvailabilityService } from "./index";
import type { CourseAvailabilityProvider, ProviderResult, SectionAvailabilityRecord } from "./types";

const PAYLOAD = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "__fixtures__", "availability", "upstream-payload.json"), "utf8"),
);

const NOW = new Date("2026-09-19T20:01:00Z");
const FETCHED = "2026-09-19T20:00:30.000Z";

describe("freshness rules", () => {
  it("classifies a live source by age", () => {
    const p = DEFAULT_LIVE_POLICY; // live ≤ 2 min, stale > 15 min
    expect(classifyFreshness("2026-09-19T20:00:30Z", NOW, p)).toBe("live");
    expect(classifyFreshness("2026-09-19T19:50:00Z", NOW, p)).toBe("cached");
    expect(classifyFreshness("2026-09-19T19:30:00Z", NOW, p)).toBe("stale");
  });

  it("treats a missing or unparseable timestamp as unavailable — never as fresh", () => {
    expect(classifyFreshness(null, NOW, DEFAULT_LIVE_POLICY)).toBe("unavailable");
    expect(classifyFreshness(undefined, NOW, DEFAULT_LIVE_POLICY)).toBe("unavailable");
    expect(classifyFreshness("yesterday-ish", NOW, DEFAULT_LIVE_POLICY)).toBe("unavailable");
  });

  it("never lets a manual snapshot be 'live', and stales it after a day", () => {
    expect(classifyFreshness("2026-09-19T20:00:59Z", NOW, MANUAL_PASTE_POLICY)).toBe("cached"); // 1s old: not "live"
    expect(classifyFreshness("2026-09-18T19:00:00Z", NOW, MANUAL_PASTE_POLICY)).toBe("stale");
  });

  it("downgrades a stale or unavailable status to unknown but leaves trusted ones alone", () => {
    expect(trustedStatus("open", "stale")).toBe("unknown");
    expect(trustedStatus("full", "unavailable")).toBe("unknown");
    expect(trustedStatus("open", "live")).toBe("open");
    expect(trustedStatus("waitlist", "cached")).toBe("waitlist");
  });

  it("derives status from seat numbers, and 'unknown' when they are absent", () => {
    expect(statusFromSeats({ capacity: 30, enrolled: 21 })).toBe("open");
    expect(statusFromSeats({ capacity: 30, enrolled: 30 })).toBe("full");
    expect(statusFromSeats({ capacity: 30, enrolled: 30, waitlistCount: 4 })).toBe("waitlist");
    expect(statusFromSeats({ seatsAvailable: 3 })).toBe("open");
    expect(statusFromSeats({ seatsAvailable: 0 })).toBe("full");
    expect(statusFromSeats({})).toBe("unknown");
    expect(statusFromSeats({ capacity: 30 })).toBe("unknown"); // capacity alone says nothing
  });
});

describe("normalizing an upstream payload", () => {
  const n = () => {
    const r = normalizeUpstreamPayload(PAYLOAD, FETCHED, WORKDAY_LIVE_SOURCE);
    if (!r.ok) throw new Error("expected ok");
    return r;
  };
  const rec = (code: string, sec: string) => n().records.find((r) => r.courseCode === code && r.sectionNumber === sec)!;

  it("maps an open section with seats and the upstream's own timestamp", () => {
    const r = rec("CSCI 10", "01");
    expect(r).toMatchObject({ status: "open", capacity: 30, enrolled: 21, seatsAvailable: 9, waitlistCount: 0, lastUpdatedAt: "2026-09-19T20:00:00Z" });
    expect(r.source.isLive).toBe(true);
  });

  it("normalizes course codes (case / spacing) and falls back to the snapshot asOf time", () => {
    const r = rec("CSCI 10", "02");
    expect(r.status).toBe("full");
    expect(r.lastUpdatedAt).toBe("2026-09-19T20:00:00Z"); // payload asOf
  });

  it("maps full+waitlist, and an explicit 'closed' even when seats remain", () => {
    expect(rec("MATH 11", "01")).toMatchObject({ status: "waitlist", waitlistCount: 4 });
    expect(rec("ENGL 1A", "05").status).toBe("full"); // instructor-closed with 8 seats left
  });

  it("copes with missing optional fields: seatsAvailable only, or nothing at all", () => {
    expect(rec("MATH 12", "01")).toMatchObject({ status: "open", seatsAvailable: 3, capacity: null, enrolled: null, instructor: null });
    const none = rec("PHYS 31", "01");
    expect(none.status).toBe("unknown"); // no seat data and no label ⇒ unknown, never guessed
    expect(none.capacity).toBeNull();
  });

  it("accepts an explicit status label case-insensitively", () => {
    expect(rec("BIOL 1A", "01").status).toBe("open");
  });

  it("drops records that fail validation rather than guessing, and keeps the rest", () => {
    const r = n();
    expect(r.dropped).toBe(2); // empty course, invalid term
    expect(r.records).toHaveLength(7);
  });

  it("uses the moment CampusVal received the answer when the upstream gives no timestamp at all", () => {
    const r = normalizeUpstreamPayload(
      { sections: [{ course: "ART 1", section: "01", term: "fall", year: 2026, capacity: 10, enrolled: 1 }] },
      FETCHED,
      WORKDAY_LIVE_SOURCE,
    );
    expect(r.ok && r.records[0]!.lastUpdatedAt).toBe(FETCHED);
  });

  it("rejects a payload that is not the expected shape at all", () => {
    expect(normalizeUpstreamPayload({ nope: true }, FETCHED, WORKDAY_LIVE_SOURCE).ok).toBe(false);
    expect(normalizeUpstreamPayload("<html>", FETCHED, WORKDAY_LIVE_SOURCE).ok).toBe(false);
    expect(normalizeUpstreamPayload(null, FETCHED, WORKDAY_LIVE_SOURCE).ok).toBe(false);
  });
});

describe("WorkdayAvailabilityProvider (HTTP behaviour with a fake fetch)", () => {
  const cfg = { url: "https://gateway.scu.example/availability", authToken: "SECRET-TOKEN-123", now: () => new Date(FETCHED) };
  const json = (body: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  it("sends the term/year and the bearer credential, and never follows redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(PAYLOAD));
    const p = new WorkdayAvailabilityProvider({ ...cfg, fetchImpl });
    const r = await p.getAvailability({ term: "fall", year: 2026 });
    expect(r.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://gateway.scu.example/availability?term=fall&year=2026");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer SECRET-TOKEN-123" });
    expect((init as RequestInit).redirect).toBe("error");
  });

  it("supports a custom credential header and a bare token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(PAYLOAD));
    const p = new WorkdayAvailabilityProvider({ ...cfg, fetchImpl, authHeader: "X-Api-Key", authScheme: "" });
    await p.getAvailability({ term: "fall", year: 2026 });
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "X-Api-Key": "SECRET-TOKEN-123" });
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [500, "upstream_error"],
    [503, "upstream_error"],
  ])("HTTP %i → %s, with a message that leaks no URL, token or body", async (status, reason) => {
    const p = new WorkdayAvailabilityProvider({ ...cfg, fetchImpl: vi.fn().mockResolvedValue(json({ detail: "internal stack trace" }, status)) });
    const r = await p.getAvailability({ term: "fall", year: 2026 });
    expect(r).toMatchObject({ ok: false, reason });
    const msg = (r as { message: string }).message;
    expect(msg).not.toMatch(/SECRET-TOKEN|gateway\.scu\.example|stack trace/);
  });

  it("reports a timeout, a network error, and a non-JSON body distinctly", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(await new WorkdayAvailabilityProvider({ ...cfg, fetchImpl: vi.fn().mockRejectedValue(abort) }).getAvailability({ term: "fall", year: 2026 }))
      .toMatchObject({ ok: false, reason: "timeout" });
    expect(await new WorkdayAvailabilityProvider({ ...cfg, fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) }).getAvailability({ term: "fall", year: 2026 }))
      .toMatchObject({ ok: false, reason: "upstream_error" });
    const notJson = { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } } as unknown as Response;
    expect(await new WorkdayAvailabilityProvider({ ...cfg, fetchImpl: vi.fn().mockResolvedValue(notJson) }).getAvailability({ term: "fall", year: 2026 }))
      .toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  it("enforces its own timeout by aborting the request", async () => {
    const fetchImpl = vi.fn((_u: unknown, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" })))),
    );
    const p = new WorkdayAvailabilityProvider({ ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 });
    expect(await p.getAvailability({ term: "fall", year: 2026 })).toMatchObject({ ok: false, reason: "timeout" });
  });
});

// ---------- service --------------------------------------------------------

const rec = (over: Partial<SectionAvailabilityRecord> & Pick<SectionAvailabilityRecord, "sectionNumber" | "status">): SectionAvailabilityRecord => ({
  courseCode: "CSCI 10",
  term: "fall",
  year: 2026,
  lastUpdatedAt: NOW.toISOString(),
  capacity: 30,
  enrolled: 20,
  seatsAvailable: 10,
  waitlistCount: 0,
  source: WORKDAY_LIVE_SOURCE,
  ...over,
});

function fakeProvider(id: CourseAvailabilityProvider["id"], impl: () => Promise<ProviderResult>, isLive = false): CourseAvailabilityProvider & { calls: number } {
  const p = {
    id,
    label: id,
    isLiveSource: isLive,
    calls: 0,
    async getAvailability() {
      p.calls += 1;
      return impl();
    },
  };
  return p;
}
const okResult = (records: SectionAvailabilityRecord[], fetchedAt = NOW.toISOString()): ProviderResult => ({ ok: true, records, fetchedAt });
const emptyManual = () => fakeProvider("manual_workday_paste", async () => okResult([]));

describe("AvailabilityService", () => {
  it("live provider: open/full sections are labelled live, isLive true, freshness live", async () => {
    const live = fakeProvider("workday_live", async () => okResult([rec({ sectionNumber: "01", status: "open" }), rec({ sectionNumber: "02", status: "full", seatsAvailable: 0 })]), true);
    const svc = new AvailabilityService({ live, manual: emptyManual(), now: () => NOW });
    const t = await svc.getTermAvailability("fall", 2026);
    const a = t.bySection.get(sectionKey("CSCI 10", "01"))!;
    expect(a).toMatchObject({ availabilityStatus: "open", sourceType: "workday_live", isLive: true, freshness: "live" });
    expect(t.bySection.get(sectionKey("CSCI 10", "02"))!.availabilityStatus).toBe("full");
    expect(t.live.state).toBe("live");
  });

  it("with NO live provider configured every section stays unknown and the state is not_configured", async () => {
    const svc = new AvailabilityService({ live: null, manual: emptyManual(), now: () => NOW });
    const t = await svc.getTermAvailability("fall", 2026);
    expect(t.live).toMatchObject({ state: "not_configured", lastUpdatedAt: null });
    expect(t.bySection.size).toBe(0);
    expect(svc.liveConfigured).toBe(false);
  });

  it("upstream failure with nothing cached: no exception, live state 'unavailable', falls through to the manual snapshot", async () => {
    const failures: string[] = [];
    const live = fakeProvider("workday_live", async () => ({ ok: false, reason: "upstream_error", message: "x" }), true);
    const manual = fakeProvider("manual_workday_paste", async () =>
      okResult([rec({ sectionNumber: "07", status: "open", lastUpdatedAt: "2026-09-19T19:00:00Z", source: { id: "manual_workday_paste", label: "manual", isLive: false } })]),
    );
    const svc = new AvailabilityService({ live, manual, now: () => NOW, onProviderFailure: (f) => failures.push(f.reason) });
    const t = await svc.getTermAvailability("fall", 2026);
    expect(t.live).toMatchObject({ state: "unavailable", failure: "upstream_error" });
    expect(failures).toEqual(["upstream_error"]);
    const a = t.bySection.get(sectionKey("CSCI 10", "07"))!;
    expect(a).toMatchObject({ sourceType: "workday_self_paste", isLive: false, freshness: "cached" });
  });

  it("stale-if-error: serves the last good answer as 'cached', then as stale ⇒ unknown once too old", async () => {
    let now = NOW;
    let healthy = true;
    const live = fakeProvider("workday_live", async () => (healthy ? okResult([rec({ sectionNumber: "01", status: "open", lastUpdatedAt: NOW.toISOString() })]) : { ok: false, reason: "timeout", message: "x" }), true);
    const svc = new AvailabilityService({ live, manual: emptyManual(), now: () => now, cacheTtlMs: 30_000 });

    expect((await svc.getTermAvailability("fall", 2026)).bySection.get(sectionKey("CSCI 10", "01"))!.availabilityStatus).toBe("open");

    healthy = false;
    now = new Date(NOW.getTime() + 5 * 60_000); // 5 min later: cache expired, upstream now failing
    const cached = await svc.getTermAvailability("fall", 2026);
    const c = cached.bySection.get(sectionKey("CSCI 10", "01"))!;
    expect(c).toMatchObject({ availabilityStatus: "open", freshness: "cached", isLive: false }); // no longer "live"
    expect(cached.live).toMatchObject({ state: "cached", failure: "timeout" });

    now = new Date(NOW.getTime() + 30 * 60_000); // 30 min: past the 15-min stale limit
    const stale = await svc.getTermAvailability("fall", 2026);
    const s = stale.bySection.get(sectionKey("CSCI 10", "01"))!;
    expect(s).toMatchObject({ availabilityStatus: "unknown", freshness: "stale", isLive: false });
    expect(stale.live.state).toBe("stale");
  });

  it("caches: many students asking within the TTL cause exactly ONE upstream call", async () => {
    const live = fakeProvider("workday_live", async () => okResult([rec({ sectionNumber: "01", status: "open" })]), true);
    const svc = new AvailabilityService({ live, manual: emptyManual(), now: () => NOW, cacheTtlMs: 60_000 });
    await Promise.all(Array.from({ length: 25 }, () => svc.getTermAvailability("fall", 2026, "CSCI 10")));
    await svc.getTermAvailability("fall", 2026, "MATH 11"); // different course, same term: still the same upstream call
    expect(live.calls).toBe(1);
    await svc.getTermAvailability("winter", 2027); // different term ⇒ a separate upstream call
    expect(live.calls).toBe(2);
  });

  it("live outranks the manual snapshot for the same section", async () => {
    const live = fakeProvider("workday_live", async () => okResult([rec({ sectionNumber: "01", status: "full", seatsAvailable: 0 })]), true);
    const manual = fakeProvider("manual_workday_paste", async () =>
      okResult([rec({ sectionNumber: "01", status: "open", source: { id: "manual_workday_paste", label: "manual", isLive: false } })]),
    );
    const t = await new AvailabilityService({ live, manual, now: () => NOW }).getTermAvailability("fall", 2026);
    expect(t.bySection.get(sectionKey("CSCI 10", "01"))).toMatchObject({ availabilityStatus: "full", sourceType: "workday_live" });
  });

  it("a manual snapshot is never 'live' and goes stale (⇒ unknown) after a day", async () => {
    const manualRec = (ts: string) =>
      rec({ sectionNumber: "01", status: "open", lastUpdatedAt: ts, source: { id: "manual_workday_paste", label: "manual", isLive: false } });
    const fresh = await new AvailabilityService({ manual: fakeProvider("manual_workday_paste", async () => okResult([manualRec("2026-09-19T20:00:59Z")])), now: () => NOW }).getTermAvailability("fall", 2026);
    expect(fresh.bySection.get(sectionKey("CSCI 10", "01"))).toMatchObject({ availabilityStatus: "open", isLive: false, freshness: "cached" });
    const old = await new AvailabilityService({ manual: fakeProvider("manual_workday_paste", async () => okResult([manualRec("2026-09-10T00:00:00Z")])), now: () => NOW }).getTermAvailability("fall", 2026);
    expect(old.bySection.get(sectionKey("CSCI 10", "01"))).toMatchObject({ availabilityStatus: "unknown", freshness: "stale" });
  });

  it("a record the upstream cannot timestamp is unavailable ⇒ unknown, not fresh", async () => {
    const live = fakeProvider("workday_live", async () => okResult([rec({ sectionNumber: "01", status: "open", lastUpdatedAt: null })]), true);
    const t = await new AvailabilityService({ live, manual: emptyManual(), now: () => NOW }).getTermAvailability("fall", 2026);
    expect(t.bySection.get(sectionKey("CSCI 10", "01"))).toMatchObject({ availabilityStatus: "unknown", freshness: "unavailable", isLive: false });
  });

  it("narrows to one course when asked, without hiding other courses from the shared live cache", async () => {
    const live = fakeProvider("workday_live", async () => okResult([rec({ sectionNumber: "01", status: "open" }), rec({ courseCode: "MATH 11", sectionNumber: "01", status: "full", seatsAvailable: 0 })]), true);
    const svc = new AvailabilityService({ live, manual: emptyManual(), now: () => NOW });
    const csci = await svc.getTermAvailability("fall", 2026, "csci  10");
    expect([...csci.bySection.keys()]).toEqual(["CSCI 10|01"]);
    const all = await svc.getTermAvailability("fall", 2026);
    expect(all.bySection.size).toBe(2);
  });
});

describe("fixture and static providers are never live", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("the fixture provider refuses to exist in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => new FixtureAvailabilityProvider()).toThrow(/production/);
  });

  it("fixture output is deterministic, labelled SAMPLE DATA, isLive false, and includes open/waitlist/full", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const a = await new FixtureAvailabilityProvider(() => NOW).getAvailability({ term: "fall", year: 2026 });
    const b = await new FixtureAvailabilityProvider(() => NOW).getAvailability({ term: "fall", year: 2026 });
    expect(a.ok && b.ok && JSON.stringify(a.records)).toBe(b.ok && a.ok ? JSON.stringify(b.records) : "");
    if (!a.ok) throw new Error();
    expect(a.records.length).toBeGreaterThan(0);
    expect(a.records.every((r) => r.source.id === "fixture" && r.source.isLive === false && /SAMPLE DATA/.test(r.source.label))).toBe(true);
    const statuses = new Set(a.records.map((r) => r.status));
    expect(statuses).toEqual(new Set(["open", "waitlist", "full", "unknown"]));
  });

  it("through the service a fixture record is sourceType 'fixture', never isLive, never 'live' freshness", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const svc = new AvailabilityService({ fixture: new FixtureAvailabilityProvider(() => NOW), manual: emptyManual(), now: () => NOW });
    const t = await svc.getTermAvailability("fall", 2026);
    expect(t.fixtureActive).toBe(true);
    for (const a of t.bySection.values()) {
      expect(a.isLive).toBe(false);
      expect(a.sourceType).toBe("fixture");
      expect(a.freshness).not.toBe("live");
    }
  });

  it("the static Registrar provider yields only unknown, timestamp-free, non-live records", async () => {
    const r = await new StaticCatalogAvailabilityProvider().getAvailability({ term: "fall", year: 2026 });
    if (!r.ok) throw new Error();
    expect(r.records.length).toBeGreaterThan(0);
    expect(r.records.every((x) => x.status === "unknown" && x.lastUpdatedAt === null && !x.source.isLive)).toBe(true);
  });
});

describe("configuration (nothing hard-coded)", () => {
  it("builds NO live provider unless explicitly enabled with a URL and a credential", () => {
    expect(buildAvailabilityService({ NODE_ENV: "test" }).liveConfigured).toBe(false);
    expect(buildAvailabilityService({ NODE_ENV: "test", WORKDAY_AVAILABILITY_ENABLED: "true" }).liveConfigured).toBe(false);
    expect(buildAvailabilityService({ NODE_ENV: "test", WORKDAY_AVAILABILITY_ENABLED: "false", WORKDAY_AVAILABILITY_URL: "https://x.example", WORKDAY_AVAILABILITY_AUTH_TOKEN: "t" }).liveConfigured).toBe(false);
    expect(buildAvailabilityService({ NODE_ENV: "test", WORKDAY_AVAILABILITY_ENABLED: "true", WORKDAY_AVAILABILITY_URL: "https://x.example", WORKDAY_AVAILABILITY_AUTH_TOKEN: "t" }).liveConfigured).toBe(true);
  });

  it("ignores AVAILABILITY_FIXTURE_ENABLED in production so sample data can never reach real students", async () => {
    const svc = buildAvailabilityService({ NODE_ENV: "production", AVAILABILITY_FIXTURE_ENABLED: "true" });
    // No provider throws, and the service reports no fixture contribution.
    vi.stubEnv("NODE_ENV", "production");
    expect((await svc.getTermAvailability("fall", 2026, "CSCI 10")).fixtureActive).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("cache", () => {
  it("expires entries after the TTL and keeps the stale value available to peek()", async () => {
    let t = 0;
    const c = new SingleFlightTtlCache<number>(100, 8, () => t);
    let loads = 0;
    const load = async () => ++loads;
    expect((await c.get("k", load)).value).toBe(1);
    t = 50;
    expect((await c.get("k", load)).fromCache).toBe(true);
    t = 200;
    expect((await c.get("k", load)).value).toBe(2);
    expect(c.peek("k")?.value).toBe(2);
  });

  it("shares one in-flight load between concurrent callers and clears the slot after a failure", async () => {
    const c = new SingleFlightTtlCache<number>(1000);
    let loads = 0;
    const slow = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 10));
      return 7;
    };
    const both = await Promise.all([c.get("k", slow), c.get("k", slow)]);
    expect(both.map((x) => x.value)).toEqual([7, 7]);
    expect(loads).toBe(1);

    await expect(c.get("bad", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect((await c.get("bad", async () => 9)).value).toBe(9); // a failure must not poison the key
  });

  it("is bounded: the oldest entries are evicted", () => {
    const c = new SingleFlightTtlCache<number>(1000, 2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.size).toBe(2);
    expect(c.peek("a")).toBeUndefined();
  });
});

// ---------- real HTTP (no fake fetch) --------------------------------------

import http from "node:http";
import type { AddressInfo } from "node:net";

describe("WorkdayAvailabilityProvider over a real HTTP connection", () => {
  let server: http.Server;
  let base: string;
  let seen: { url?: string; auth?: string } = {};
  let mode: "ok" | "redirect" | "slow" | "html" | "500" = "ok";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen = { url: req.url, auth: req.headers["authorization"] as string | undefined };
      if (mode === "redirect") {
        res.writeHead(302, { Location: "http://127.0.0.1:1/steal" }).end();
      } else if (mode === "slow") {
        setTimeout(() => res.writeHead(200, { "Content-Type": "application/json" }).end("{}"), 2_000);
      } else if (mode === "html") {
        res.writeHead(200, { "Content-Type": "text/html" }).end("<html>login page</html>");
      } else if (mode === "500") {
        res.writeHead(500).end("boom");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(PAYLOAD));
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/availability`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("fetches, authenticates and normalizes a real response", async () => {
    mode = "ok";
    const p = new WorkdayAvailabilityProvider({ url: base, authToken: "tok-123" });
    const r = await p.getAvailability({ term: "fall", year: 2026 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.records.find((x) => x.courseCode === "CSCI 10" && x.sectionNumber === "01")?.status).toBe("open");
    expect(seen.url).toBe("/availability?term=fall&year=2026");
    expect(seen.auth).toBe("Bearer tok-123");
  });

  it("refuses to follow a redirect, so the credential can never be sent to another host", async () => {
    mode = "redirect";
    const r = await new WorkdayAvailabilityProvider({ url: base, authToken: "tok-123" }).getAvailability({ term: "fall", year: 2026 });
    expect(r.ok).toBe(false);
  });

  it("times out a slow upstream instead of hanging the request", async () => {
    mode = "slow";
    const t0 = Date.now();
    const r = await new WorkdayAvailabilityProvider({ url: base, authToken: "t", timeoutMs: 300 }).getAvailability({ term: "fall", year: 2026 });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  it("treats a login/HTML page (e.g. an expired SSO session) as an invalid payload, never as data", async () => {
    mode = "html";
    expect(await new WorkdayAvailabilityProvider({ url: base, authToken: "t" }).getAvailability({ term: "fall", year: 2026 })).toMatchObject({ ok: false, reason: "invalid_payload" });
    mode = "500";
    expect(await new WorkdayAvailabilityProvider({ url: base, authToken: "t" }).getAvailability({ term: "fall", year: 2026 })).toMatchObject({ ok: false, reason: "upstream_error" });
  });

  it("an unreachable host is an upstream error, and the service degrades to unknown without throwing", async () => {
    const dead = new WorkdayAvailabilityProvider({ url: "http://127.0.0.1:1/availability", authToken: "t", timeoutMs: 500 });
    const svc = new AvailabilityService({ live: dead, manual: { id: "manual_workday_paste", label: "m", isLiveSource: false, getAvailability: async () => ({ ok: true, records: [], fetchedAt: "" }) } });
    const t = await svc.getTermAvailability("fall", 2026);
    expect(t.live.state).toBe("unavailable");
    expect(t.bySection.size).toBe(0);
  });
});
