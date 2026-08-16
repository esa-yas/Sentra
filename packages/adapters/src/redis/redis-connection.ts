import type { AppConfig } from '@sentra/config';
import { Redis, type RedisOptions } from 'ioredis';

/**
 * Shared ioredis connection factory for the cache adapter and the BullMQ transport.
 *
 * Redis holds cache and transport state only, never business truth (slide 045), so every
 * connection is configured to fail fast and reconnect with bounded backoff rather than
 * blocking a request path indefinitely. Credentials live in the URL and are never logged.
 */
export type RedisConnectionRole = 'cache' | 'queue-client' | 'queue-subscriber' | 'queue-worker';

/**
 * BullMQ's blocking commands require `maxRetriesPerRequest: null`. The cache path wants the
 * opposite — a bounded number of retries so a command rejects instead of hanging — so the
 * two roles are configured differently from the same base.
 */
export const createRedisConnection = (
  config: AppConfig,
  role: RedisConnectionRole,
): Redis => {
  const isBlockingRole = role === 'queue-worker' || role === 'queue-subscriber';

  const options: RedisOptions = {
    connectTimeout: config.redis.connectTimeoutMs,
    commandTimeout: role === 'cache' ? config.redis.commandTimeoutMs : undefined,
    // Blocking BullMQ operations need this set to null; the cache path keeps a small bound so
    // a command fails loudly rather than queueing forever behind a dead connection.
    maxRetriesPerRequest: isBlockingRole ? null : 3,
    enableReadyCheck: true,
    // Reconnect with capped exponential-ish backoff. Correctness never depends on a live
    // Redis, so aggressive retries buy nothing; a bounded delay keeps the logs quiet.
    retryStrategy: (times: number): number =>
      Math.min(times * 200, config.redis.maxReconnectDelayMs),
    // Keep failed commands queued only briefly; drop them once we give up connecting.
    enableOfflineQueue: role === 'cache',
    lazyConnect: false,
  };

  return new Redis(config.redis.url, options);
};
