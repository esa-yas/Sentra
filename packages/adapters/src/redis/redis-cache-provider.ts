import type { AppConfig } from '@sentra/config';
import type { CacheLease, CacheProvider } from '@sentra/ports';
import { PROVIDER_HEALTH_STATES, type ProviderHealthState } from '@sentra/contracts';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { createRedisConnection } from './redis-connection';

/**
 * Redis-backed {@link CacheProvider}.
 *
 * Everything here is disposable: Redis holds cache and transport state only (slide 045). The
 * adapter therefore never treats a failure as an empty-but-valid result — a failed read
 * rejects so the caller can decide, which is what stops a Redis outage from silently
 * becoming a zero-risk "allow". Keys are namespaced with the application prefix so two
 * deployments (and the test suite) can share one Redis without colliding, and no method ever
 * logs the connection string or a value.
 */
export class RedisCacheProvider implements CacheProvider {
  private readonly redis: Redis;
  private readonly prefix: string;
  /** Distinguishes "never connected" from "connected once, now reconnecting". */
  private hasConnected = false;
  private lastError: string | null = null;

  public constructor(config: AppConfig, redis?: Redis) {
    this.redis = redis ?? createRedisConnection(config, 'cache');
    this.prefix = `${config.redis.keyPrefix}:cache`;

    this.redis.on('ready', () => {
      this.hasConnected = true;
      this.lastError = null;
    });
    this.redis.on('error', (error: Error) => {
      // Message only — never the connection target, which can carry credentials.
      this.lastError = error.message;
    });
  }

  /** Full physical key: `<prefix>:cache:<logical key>`. */
  private keyOf(key: string): string {
    return `${this.prefix}:${key}`;
  }

  public async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.keyOf(key));
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('CacheProvider.set received a value that cannot be serialised to JSON.');
    }
    await this.redis.set(this.keyOf(key), serialized, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(this.keyOf(key));
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    const match = `${this.keyOf(prefix)}*`;
    let cursor = '0';
    let removed = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        removed += await this.redis.del(...keys);
      }
    } while (cursor !== '0');
    return removed;
  }

  public async increment(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    const fullKey = this.keyOf(key);
    const count = await this.redis.incr(fullKey);
    if (count === 1) {
      await this.redis.expire(fullKey, Math.max(1, Math.ceil(ttlSeconds)));
    }
    let ttl = await this.redis.ttl(fullKey);
    if (ttl < 0) {
      // Key exists without a TTL (a crash between INCR and EXPIRE). Repair it.
      ttl = Math.max(1, Math.ceil(ttlSeconds));
      await this.redis.expire(fullKey, ttl);
    }
    return { count, ttlSeconds: ttl };
  }

  public async acquireLease(key: string, ttlSeconds: number): Promise<CacheLease | null> {
    const fullKey = this.keyOf(`lease:${key}`);
    const token = randomUUID();
    const result = await this.redis.set(
      fullKey,
      token,
      'PX',
      Math.max(1, Math.ceil(ttlSeconds * 1000)),
      'NX',
    );
    if (result !== 'OK') {
      return null;
    }
    return new RedisCacheLease(this.redis, fullKey, key, token);
  }

  public async ping(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      if (pong === 'PONG') {
        this.hasConnected = true;
        return true;
      }
      return false;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'ping failed';
      return false;
    }
  }

  /**
   * Coarse health for the readiness probe and the operations console. `CONNECTED` when the
   * socket is ready, `DEGRADED` when it has connected before but is currently retrying, and
   * `UNAVAILABLE` when it has never reached a usable state.
   */
  public health(): { state: ProviderHealthState; detail: string } {
    const status = this.redis.status;
    if (status === 'ready') {
      return { state: PROVIDER_HEALTH_STATES.CONNECTED, detail: 'ready' };
    }
    if (this.hasConnected) {
      return {
        state: PROVIDER_HEALTH_STATES.DEGRADED,
        detail: this.lastError ?? `reconnecting (${status})`,
      };
    }
    return {
      state: PROVIDER_HEALTH_STATES.UNAVAILABLE,
      detail: this.lastError ?? `not connected (${status})`,
    };
  }

  public async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

/** Compare-and-delete so a lease is only released by its own holder. */
const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
/** Compare-and-extend so a lease is only renewed by its own holder. */
const RENEW_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

class RedisCacheLease implements CacheLease {
  public constructor(
    private readonly redis: Redis,
    private readonly physicalKey: string,
    public readonly key: string,
    public readonly token: string,
  ) {}

  public async release(): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.physicalKey, this.token);
  }

  public async renew(ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      this.physicalKey,
      this.token,
      String(Math.max(1, Math.ceil(ttlSeconds * 1000))),
    );
    return result === 1;
  }
}

export const createRedisCacheProvider = (config: AppConfig, redis?: Redis): RedisCacheProvider =>
  new RedisCacheProvider(config, redis);
