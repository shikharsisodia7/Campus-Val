/**
 * Small bounded TTL cache with single-flight, for upstream availability
 * calls. Registration-period availability may be requested by every student
 * on every render; this guarantees ONE upstream request per key per TTL no
 * matter how many students ask, and (via `peek`) lets the caller keep
 * serving the last good answer — flagged stale by the freshness policy — if
 * the upstream starts failing.
 *
 * Process-local by design: it needs no extra infrastructure. On a
 * multi-instance host each instance keeps its own copy, so upstream load is
 * (instances × 1 request/TTL) — see docs/SECTION_AVAILABILITY.md.
 */
export interface CacheEntry<V> {
  value: V;
  storedAt: number;
}

export class SingleFlightTtlCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 32,
    private readonly now: () => number = Date.now,
  ) {}

  /** Last stored value for the key (even if past TTL), or undefined. */
  peek(key: string): CacheEntry<V> | undefined {
    return this.entries.get(key);
  }

  private isFresh(e: CacheEntry<V> | undefined): e is CacheEntry<V> {
    return !!e && this.now() - e.storedAt <= this.ttlMs;
  }

  /**
   * Returns a fresh cached value, or runs `load` once (shared by concurrent
   * callers). If `load` throws, the error propagates — callers decide
   * whether to fall back to `peek()`.
   */
  async get(key: string, load: () => Promise<V>): Promise<{ value: V; fromCache: boolean }> {
    const hit = this.entries.get(key);
    if (this.isFresh(hit)) return { value: hit.value, fromCache: true };

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = load()
        .then((value) => {
          this.set(key, value);
          return value;
        })
        .finally(() => {
          this.inflight.delete(key);
        });
      this.inflight.set(key, pending);
    }
    return { value: await pending, fromCache: false };
  }

  set(key: string, value: V): void {
    this.entries.delete(key); // re-insert to refresh LRU order
    this.entries.set(key, { value, storedAt: this.now() });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
