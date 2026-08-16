import type { AppConfig } from '@sentra/config';
import { describe, expect, it } from 'vitest';
import { redisOptionsForRole, type RedisConnectionRole } from '../redis-connection';

/**
 * The fail-fast guarantees these options encode are what keep a dead Redis from hanging the
 * Queue Monitor request path, so they are asserted directly rather than left implicit.
 */
const config = {
  redis: {
    url: 'redis://localhost:6379',
    keyPrefix: 'sentra',
    connectTimeoutMs: 5_000,
    commandTimeoutMs: 4_200,
    maxReconnectDelayMs: 5_000,
  },
} as unknown as AppConfig;

describe('redisOptionsForRole', () => {
  it('bounds every non-blocking role with a command timeout so a dead Redis fails fast', () => {
    for (const role of ['cache', 'queue-client'] as RedisConnectionRole[]) {
      const options = redisOptionsForRole(config, role);
      expect(options.commandTimeout).toBe(4_200);
      expect(options.connectTimeout).toBe(5_000);
      // Non-blocking roles keep a small, finite retry bound.
      expect(options.maxRetriesPerRequest).toBe(3);
    }
  });

  it('never sets a command timeout on blocking BullMQ roles', () => {
    for (const role of ['queue-worker', 'queue-subscriber'] as RedisConnectionRole[]) {
      const options = redisOptionsForRole(config, role);
      // A blocking BRPOPLPUSH would abort under a command timeout, so it must be unset.
      expect(options.commandTimeout).toBeUndefined();
      // Blocking commands require unlimited (null) per-request retries.
      expect(options.maxRetriesPerRequest).toBeNull();
    }
  });

  it('enables the offline queue only for the cache role', () => {
    expect(redisOptionsForRole(config, 'cache').enableOfflineQueue).toBe(true);
    expect(redisOptionsForRole(config, 'queue-client').enableOfflineQueue).toBe(false);
    expect(redisOptionsForRole(config, 'queue-worker').enableOfflineQueue).toBe(false);
  });

  it('caps reconnect backoff at the configured maximum', () => {
    const retry = redisOptionsForRole(config, 'cache').retryStrategy as (times: number) => number;
    expect(retry(1)).toBe(200);
    expect(retry(1_000)).toBe(5_000);
  });
});
