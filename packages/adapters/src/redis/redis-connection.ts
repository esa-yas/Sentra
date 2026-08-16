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
 * Builds the ioredis options for a connection role. Extracted as a pure function so the
 * fail-fast guarantees below can be unit-tested without opening a socket.
 *
 * BullMQ's blocking commands (worker/subscriber) require `maxRetriesPerRequest: null` and
 * must NOT carry a `commandTimeout`, or a legitimately blocking `BRPOPLPUSH` would abort.
 * Every non-blocking role — the cache and the queue producer/inspector — instead gets a
 * bounded `commandTimeout`, so a command that reaches a connected-but-slow Redis rejects
 * within a few seconds rather than stalling the request path. (The separate case of BullMQ
 * waiting for connection *readiness* against a wholly unreachable Redis is bounded in the
 * queue provider's inspector reads, not here.)
 */
export const redisOptionsForRole = (config: AppConfig, role: RedisConnectionRole): RedisOptions => {
  const isBlockingRole = role === 'queue-worker' || role === 'queue-subscriber';

  return {
    connectTimeout: config.redis.connectTimeoutMs,
    // Bounded per-command timeout for every non-blocking role, so a stalled command fails
    // loudly instead of hanging the request path. Blocking BullMQ roles must not set it.
    commandTimeout: isBlockingRole ? undefined : config.redis.commandTimeoutMs,
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
};

export const createRedisConnection = (config: AppConfig, role: RedisConnectionRole): Redis =>
  new Redis(config.redis.url, redisOptionsForRole(config, role));
