import { describe, expect, it } from 'vitest';
import type { CacheProvider } from '@sentra/ports';

export interface CacheProviderContractHarness {
  readonly cache: CacheProvider;
  readonly advanceTime: (seconds: number) => void;
}

export const describeCacheProviderContract = (
  name: string,
  factory: () => CacheProviderContractHarness,
): void => {
  describe(`${name} CacheProvider`, () => {
    it('stores and retrieves a value before its TTL expires', async () => {
      const { cache } = factory();
      await cache.set('rate:tenant:1', 3, 60);
      await expect(cache.get<number>('rate:tenant:1')).resolves.toBe(3);
    });

    it('expires a value after its TTL elapses', async () => {
      const { cache, advanceTime } = factory();
      await cache.set('rate:tenant:2', 5, 10);
      advanceTime(11);
      await expect(cache.get<number>('rate:tenant:2')).resolves.toBeNull();
    });

    it('increments a counter and reports the remaining window', async () => {
      const { cache } = factory();
      const first = await cache.increment('rate:token-endpoint', 60);
      const second = await cache.increment('rate:token-endpoint', 60);

      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
      expect(second.ttlSeconds).toBeGreaterThan(0);
    });

    it('returns null for an already-held lease', async () => {
      const { cache } = factory();
      const first = await cache.acquireLease('worker:retention', 30);
      const second = await cache.acquireLease('worker:retention', 30);

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it('releases a lease so another worker may acquire it', async () => {
      const { cache } = factory();
      const lease = await cache.acquireLease('worker:retention', 30);
      expect(lease).not.toBeNull();
      await lease?.release();

      await expect(cache.acquireLease('worker:retention', 30)).resolves.not.toBeNull();
    });

    it('reports reachability through ping', async () => {
      const { cache } = factory();
      await expect(cache.ping()).resolves.toBe(true);
    });
  });
};
