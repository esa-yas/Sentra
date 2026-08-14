/**
 * Cache and distributed counters.
 *
 * Redis implements this today. Everything here is disposable by definition: slide 045 is
 * explicit that Redis holds cache and transport state only, so every method must be safe to
 * fail. An implementation that becomes unavailable degrades latency, never correctness.
 */

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  delete(key: string): Promise<void>;

  /** Removes every key under a prefix. Used when a tenant's policy changes. */
  deleteByPrefix(prefix: string): Promise<number>;

  /**
   * Increments a counter, creating it with the given TTL on first use. Returns the value
   * after incrementing and the remaining window, which is what the rate limiter needs to
   * populate its response headers.
   */
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttlSeconds: number }>;

  /**
   * Acquires a mutually exclusive lease. Used to keep exactly one worker running a
   * scheduled sweep. Returns null when the lease is already held.
   *
   * This is advisory only. Anything requiring correctness uses a database transaction and
   * an advisory lock instead, because a cache lease cannot survive a Redis failover.
   */
  acquireLease(key: string, ttlSeconds: number): Promise<CacheLease | null>;

  /** True when the provider is reachable, for the readiness probe. */
  ping(): Promise<boolean>;

  close(): Promise<void>;
}

export interface CacheLease {
  readonly key: string;
  readonly token: string;
  /** Releases the lease. A no-op when it has already expired. */
  release(): Promise<void>;
  /** Extends the lease when work takes longer than expected. */
  renew(ttlSeconds: number): Promise<boolean>;
}
