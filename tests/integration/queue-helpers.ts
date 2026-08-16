import { createRedisConnection } from '@sentra/adapters';
import { loadConfig, type AppConfig } from '@sentra/config';

/**
 * Shared configuration for the durable-delivery integration suite. Redis and BullMQ are
 * pointed at a disposable local database (index 15) with a test-only key namespace, so a run
 * can flush freely without touching the development instance on index 0. Retry delays are
 * compressed so attempt progression is observable within a test timeout.
 */
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
export const TEST_QUEUE_PREFIX = 'sentra-it-queue';
export const TEST_CACHE_PREFIX = 'sentra-it';

export const buildQueueTestConfig = (overrides: Record<string, string> = {}): AppConfig =>
  loadConfig({
    ...process.env,
    REDIS_URL: TEST_REDIS_URL,
    REDIS_KEY_PREFIX: TEST_CACHE_PREFIX,
    REDIS_COMMAND_TIMEOUT_MS: '2000',
    QUEUE_PREFIX: TEST_QUEUE_PREFIX,
    WORKER_CONCURRENCY: '2',
    WORKER_RETRY_MAX_ATTEMPTS: '3',
    WORKER_RETRY_INITIAL_DELAY_MS: '50',
    WORKER_RETRY_BACKOFF: 'exponential',
    ...overrides,
  });

/**
 * The minimal Redis surface the suite drives. Reached through the adapter's connection
 * factory ({@link createRedisConnection}) so the test workspace does not depend on `ioredis`
 * directly — the adapter package remains the only place that imports the driver.
 */
export interface TestRedis {
  flushdb(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  quit(): Promise<unknown>;
}

const connect = (): TestRedis =>
  createRedisConnection(buildQueueTestConfig(), 'cache') as unknown as TestRedis;

/** Wipes the disposable test Redis database so BullMQ and cache keys never leak across runs. */
export const flushTestRedis = async (): Promise<void> => {
  const redis = connect();
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
};

/** A raw client on the same disposable database, for asserting on physical keys. */
export const rawTestRedis = (): TestRedis => connect();

/** Polls `predicate` until it returns a truthy value or the timeout elapses. */
export const waitFor = async <T>(
  predicate: () => Promise<T> | T,
  { timeoutMs = 8_000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let last: T = await predicate();
  while (!last) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = await predicate();
  }
  return last;
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
