/**
 * Best-effort RateMyProfessor lookup using their unofficial GraphQL
 * endpoint. RMP doesn't publish a public API, so this is fragile by
 * nature — any callsite must tolerate a graceful failure and fall back
 * to the deep-link URL.
 *
 * SCU's school ID on RMP is 882.
 *
 * Cache: 24 hours per (lowercased) name. Stored in-process — fine for
 * a single Express instance; if we ever scale horizontally we'd swap
 * this for Redis. Negative results (not found) cache for 1 hour so a
 * newly-listed professor shows up within a day.
 */

const SCU_SCHOOL_ID = 882;
const RMP_BASE = "https://www.ratemyprofessors.com";
// This public token ships in RMP's own web bundle and is required by
// the GraphQL endpoint. It is not a secret — anyone hitting the site
// is sending it. We still keep it server-side so the browser doesn't
// originate cross-origin requests.
const RMP_AUTH_TOKEN = "dGVzdDp0ZXN0";

export interface RmpComment {
  comment: string;
  date: string;
  quality: number | null;
  difficulty: number | null;
  course: string | null;
}

export interface RmpResult {
  found: boolean;
  name: string;
  deepLinkUrl: string;
  avgRating: number | null;
  avgDifficulty: number | null;
  wouldTakeAgainPercent: number | null;
  numRatings: number | null;
  department: string | null;
  topTags: string[];
  recentComments: RmpComment[];
  cachedAt: string | null;
  error: string | null;
}

interface CacheEntry {
  expiresAt: number;
  value: RmpResult;
}
const cache = new Map<string, CacheEntry>();
const POS_TTL_MS = 24 * 60 * 60 * 1000;
const NEG_TTL_MS = 60 * 60 * 1000;

function deepLink(name: string): string {
  return `${RMP_BASE}/search/professors/${SCU_SCHOOL_ID}?q=${encodeURIComponent(name)}`;
}

function emptyResult(name: string, error: string | null = null): RmpResult {
  return {
    found: false,
    name,
    deepLinkUrl: deepLink(name),
    avgRating: null,
    avgDifficulty: null,
    wouldTakeAgainPercent: null,
    numRatings: null,
    department: null,
    topTags: [],
    recentComments: [],
    cachedAt: null,
    error,
  };
}

const SEARCH_QUERY = `query TeacherSearchQuery($query: TeacherSearchQuery!) {
  newSearch {
    teachers(query: $query, first: 5) {
      edges {
        node {
          id
          legacyId
          firstName
          lastName
          department
          school { name id legacyId }
          avgRating
          numRatings
          avgDifficulty
          wouldTakeAgainPercent
        }
      }
    }
  }
}`;

const TEACHER_QUERY = `query TeacherRatings($id: ID!) {
  node(id: $id) {
    __typename
    ... on Teacher {
      firstName
      lastName
      department
      avgRating
      avgDifficulty
      wouldTakeAgainPercent
      numRatings
      teacherRatingTags { tagName tagCount }
      ratings(first: 8) {
        edges {
          node {
            class
            date
            comment
            qualityRating
            difficultyRatingNumber
          }
        }
      }
    }
  }
}`;

async function rmpFetch(query: string, variables: unknown): Promise<unknown> {
  const res = await fetch(`${RMP_BASE}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${RMP_AUTH_TOKEN}`,
      "User-Agent":
        "Mozilla/5.0 (CampusVal-SCU; +https://campusval.replit.app) AppleWebKit/537.36",
      Origin: RMP_BASE,
      Referer: `${RMP_BASE}/`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`RMP HTTP ${res.status}`);
  }
  return (await res.json()) as unknown;
}

interface SearchHit {
  id: string;
  legacyId?: number;
  firstName: string;
  lastName: string;
  department?: string | null;
  school?: { name?: string; id?: string; legacyId?: number };
  avgRating?: number;
  numRatings?: number;
}

function pickBest(
  hits: SearchHit[],
  rawName: string,
): SearchHit | null {
  if (hits.length === 0) return null;
  const lower = rawName.toLowerCase();
  const target = lower.replace(/[^a-z\s,'-]/g, "").trim();
  // Score hits: exact "last, first" or "first last" match wins; else max numRatings.
  let best: SearchHit | null = null;
  let bestScore = -Infinity;
  for (const h of hits) {
    const full = `${h.firstName} ${h.lastName}`.toLowerCase();
    const reversed = `${h.lastName}, ${h.firstName}`.toLowerCase();
    let score = 0;
    if (full === target || reversed === target) score += 1000;
    if (target.includes(h.lastName.toLowerCase())) score += 50;
    if (target.includes(h.firstName.toLowerCase())) score += 25;
    score += (h.numRatings ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

function normalizeName(raw: string): string {
  // Workday gives "Smith, John" or "Smith, John (Primary)" — convert to "John Smith".
  const stripped = raw.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (stripped.includes(",")) {
    const [last, first] = stripped.split(",").map((s) => s.trim());
    return `${first ?? ""} ${last ?? ""}`.trim();
  }
  return stripped;
}

export async function lookupRmp(rawName: string): Promise<RmpResult> {
  const name = normalizeName(rawName);
  if (!name) return emptyResult(rawName, "Empty professor name");

  const key = name.toLowerCase();
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  let result: RmpResult;
  try {
    const searchResp = (await rmpFetch(SEARCH_QUERY, {
      query: { text: name, schoolID: btoa(`School-${SCU_SCHOOL_ID}`) },
    })) as {
      data?: {
        newSearch?: { teachers?: { edges?: { node: SearchHit }[] } };
      };
    };
    const edges = searchResp?.data?.newSearch?.teachers?.edges ?? [];
    const hits = edges
      .map((e) => e.node)
      .filter((n) => {
        const sid = n.school?.legacyId ?? Number(n.school?.id ?? 0);
        return !sid || sid === SCU_SCHOOL_ID;
      });
    const best = pickBest(hits, name);
    if (!best) {
      result = emptyResult(rawName, "No RMP profile matched this name at SCU.");
    } else {
      const detailResp = (await rmpFetch(TEACHER_QUERY, { id: best.id })) as {
        data?: {
          node?: {
            firstName?: string;
            lastName?: string;
            department?: string | null;
            avgRating?: number | null;
            avgDifficulty?: number | null;
            wouldTakeAgainPercent?: number | null;
            numRatings?: number | null;
            teacherRatingTags?: { tagName: string; tagCount: number }[];
            ratings?: {
              edges?: {
                node: {
                  class?: string | null;
                  date?: string | null;
                  comment?: string | null;
                  qualityRating?: number | null;
                  difficultyRatingNumber?: number | null;
                };
              }[];
            };
          };
        };
      };
      const n = detailResp?.data?.node;
      const tags = (n?.teacherRatingTags ?? [])
        .sort((a, b) => b.tagCount - a.tagCount)
        .slice(0, 5)
        .map((t) => t.tagName);
      const recent: RmpComment[] = (n?.ratings?.edges ?? [])
        .map((e) => e.node)
        .filter((r) => (r.comment ?? "").trim().length > 0)
        .slice(0, 5)
        .map((r) => ({
          comment: (r.comment ?? "").trim(),
          date: r.date ?? "",
          quality: r.qualityRating ?? null,
          difficulty: r.difficultyRatingNumber ?? null,
          course: r.class ?? null,
        }));
      const wouldTakeRaw = n?.wouldTakeAgainPercent ?? null;
      result = {
        found: true,
        name: `${n?.firstName ?? best.firstName} ${n?.lastName ?? best.lastName}`.trim(),
        deepLinkUrl: best.legacyId
          ? `${RMP_BASE}/professor/${best.legacyId}`
          : deepLink(name),
        avgRating: n?.avgRating ?? null,
        avgDifficulty: n?.avgDifficulty ?? null,
        wouldTakeAgainPercent:
          wouldTakeRaw == null || wouldTakeRaw < 0 ? null : wouldTakeRaw,
        numRatings: n?.numRatings ?? null,
        department: n?.department ?? best.department ?? null,
        topTags: tags,
        recentComments: recent,
        cachedAt: new Date().toISOString(),
        error: null,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = emptyResult(
      rawName,
      `RMP lookup unavailable — using deep-link only (${msg}).`,
    );
  }

  cache.set(key, {
    value: result,
    expiresAt: now + (result.found ? POS_TTL_MS : NEG_TTL_MS),
  });
  return result;
}

export function rmpDeepLink(name: string): string {
  return deepLink(normalizeName(name));
}
