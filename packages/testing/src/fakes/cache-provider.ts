import type { CacheLease, CacheProvider } from '@sentra/ports';
import type { FakeClock } from './clock';
import { createFakeClock } from './clock';

interface CacheEntry<T = unknown> {
  value: T;
  expiresAtMs: number | null;
}

interface LeaseRecord {
  token: string;
  expiresAtMs: number;
}

/**
 * In-memory cache with TTL expiry, counters, and advisory leases backed by a
 * deterministic clock rather than wall time.
 */
export class FakeCacheProvider implements CacheProvider {
  private readonly store = new Map<string, CacheEntry>();
  private readonly leases = new Map<string, LeaseRecord>();
  private unavailable = false;
  private leaseCounter = 0;

  public constructor(private readonly clock: FakeClock = createFakeClock()) {}

  public setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  public async get<T>(key: string): Promise<T | null> {
    this.assertAvailable();
    const entry = this.store.get(key);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= this.clock.now().getTime()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.assertAvailable();
    this.store.set(key, {
      value,
      expiresAtMs: this.clock.now().getTime() + ttlSeconds * 1000,
    });
  }

  public async delete(key: string): Promise<void> {
    this.assertAvailable();
    this.store.delete(key);
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    this.assertAvailable();
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  public async increment(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    this.assertAvailable();
    const nowMs = this.clock.now().getTime();
    const entry = this.store.get(key);
    let count = 1;

    if (entry !== undefined && (entry.expiresAtMs === null || entry.expiresAtMs > nowMs)) {
      count = (entry.value as number) + 1;
    }

    const expiresAtMs = nowMs + ttlSeconds * 1000;
    this.store.set(key, { value: count, expiresAtMs });

    const remainingSeconds = Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000));
    return { count, ttlSeconds: remainingSeconds };
  }

  public async acquireLease(key: string, ttlSeconds: number): Promise<CacheLease | null> {
    this.assertAvailable();
    const nowMs = this.clock.now().getTime();
    const existing = this.leases.get(key);
    if (existing !== undefined && existing.expiresAtMs > nowMs) {
      return null;
    }

    const token = `lease_${++this.leaseCounter}`;
    const expiresAtMs = nowMs + ttlSeconds * 1000;
    this.leases.set(key, { token, expiresAtMs });

    return new FakeCacheLease(this, key, token);
  }

  public async ping(): Promise<boolean> {
    return !this.unavailable;
  }

  public async close(): Promise<void> {
    this.store.clear();
    this.leases.clear();
  }

  public releaseLease(key: string, token: string): boolean {
    const lease = this.leases.get(key);
    if (lease === undefined || lease.token !== token) {
      return false;
    }
    this.leases.delete(key);
    return true;
  }

  public renewLease(key: string, token: string, ttlSeconds: number): boolean {
    const lease = this.leases.get(key);
    if (lease === undefined || lease.token !== token) {
      return false;
    }
    lease.expiresAtMs = this.clock.now().getTime() + ttlSeconds * 1000;
    return true;
  }

  private assertAvailable(): void {
    if (this.unavailable) {
      throw new Error('Fake cache provider is unavailable.');
    }
  }
}

class FakeCacheLease implements CacheLease {
  public constructor(
    private readonly cache: FakeCacheProvider,
    public readonly key: string,
    public readonly token: string,
  ) {}

  public async release(): Promise<void> {
    this.cache.releaseLease(this.key, this.token);
  }

  public async renew(ttlSeconds: number): Promise<boolean> {
    return this.cache.renewLease(this.key, this.token, ttlSeconds);
  }
}

export const createFakeCacheProvider = (clock?: FakeClock): FakeCacheProvider =>
  new FakeCacheProvider(clock);
