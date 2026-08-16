import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRedisCacheProvider, type RedisCacheProvider } from '@sentra/adapters';
import { buildQueueTestConfig, flushTestRedis, rawTestRedis, sleep, TEST_CACHE_PREFIX } from './queue-helpers';

/**
 * The real Redis cache adapter, exercised against a disposable local Redis (index 15).
 *
 * The shared CacheProvider contract suite is not run verbatim here: its `advanceTime` control
 * assumes a fake clock, and Redis TTLs are wall-clock. That fake-only hook cannot map to a
 * real broker, so the guarantees it protects (expiry, namespacing, atomic leases) are proven
 * directly below with a real short TTL instead.
 */
describe('RedisCacheProvider (real Redis)', () => {
  const config = buildQueueTestConfig();
  let cache: RedisCacheProvider;

  beforeAll(async () => {
    await flushTestRedis();
    cache = createRedisCacheProvider(config);
    // Prove connectivity before asserting behaviour.
    expect(await cache.ping()).toBe(true);
  });

  afterAll(async () => {
    await cache.close();
  });

  it('gets, sets, and deletes a JSON value', async () => {
    const key = `obj:${randomUUID()}`;
    expect(await cache.get(key)).toBeNull();

    await cache.set(key, { risk: 'HIGH', score: 91 }, 60);
    expect(await cache.get(key)).toEqual({ risk: 'HIGH', score: 91 });

    await cache.delete(key);
    expect(await cache.get(key)).toBeNull();
  });

  it('namespaces every physical key with the application prefix', async () => {
    const key = `ns:${randomUUID()}`;
    await cache.set(key, { ok: true }, 60);

    const raw = rawTestRedis();
    try {
      const stored = await raw.get(`${TEST_CACHE_PREFIX}:cache:${key}`);
      expect(stored).toBe(JSON.stringify({ ok: true }));
      // Nothing is stored at the un-namespaced key.
      expect(await raw.get(key)).toBeNull();
    } finally {
      await raw.quit();
    }
  });

  it('expires a value once its TTL elapses', async () => {
    const key = `ttl:${randomUUID()}`;
    await cache.set(key, 'transient', 1);
    // Present immediately, gone after the one-second TTL passes.
    expect(await cache.get(key)).toBe('transient');
    await sleep(1_300);
    expect(await cache.get(key)).toBeNull();
  });

  it('increments a counter and applies a TTL on first touch', async () => {
    const key = `rate:${randomUUID()}`;
    const first = await cache.increment(key, 60);
    expect(first.count).toBe(1);
    expect(first.ttlSeconds).toBeGreaterThan(0);
    const second = await cache.increment(key, 60);
    expect(second.count).toBe(2);
  });

  it('grants an exclusive lease and refuses a second holder until release', async () => {
    const key = `lease:${randomUUID()}`;
    const lease = await cache.acquireLease(key, 30);
    expect(lease).not.toBeNull();

    // A competing acquire fails while the lease is held.
    expect(await cache.acquireLease(key, 30)).toBeNull();

    await lease!.release();
    const reacquired = await cache.acquireLease(key, 30);
    expect(reacquired).not.toBeNull();
    await reacquired!.release();
  });

  it('reports CONNECTED health while the socket is ready', async () => {
    const health = cache.health();
    expect(health.state).toBe('CONNECTED');
  });

  it('propagates failure instead of silently returning null after shutdown', async () => {
    const doomed = createRedisCacheProvider(config);
    expect(await doomed.ping()).toBe(true);
    await doomed.close();

    // A closed connection must reject — a cache outage must never look like a valid cache miss.
    await expect(doomed.get('anything')).rejects.toThrow();
    expect(doomed.health().state).not.toBe('CONNECTED');
  });
});
