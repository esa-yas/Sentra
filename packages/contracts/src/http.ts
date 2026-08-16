import { z } from 'zod';

/** Header names shared by the API, the generated partner SDKs, and the test suite. */
export const HTTP_HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
  REQUEST_ID: 'x-request-id',
  IDEMPOTENCY_KEY: 'idempotency-key',
  /** Caller-declared budget for the synchronous decision path, in milliseconds. */
  DEADLINE_MS: 'x-deadline-ms',
  /** Purpose the caller is acting under, when a token permits more than one. */
  PURPOSE: 'x-purpose',
  BOOTSTRAP_TOKEN: 'x-sentra-bootstrap-token',
  RETRY_AFTER: 'retry-after',
  RATE_LIMIT_LIMIT: 'ratelimit-limit',
  RATE_LIMIT_REMAINING: 'ratelimit-remaining',
  RATE_LIMIT_RESET: 'ratelimit-reset',
} as const;

export const paginationQuerySchema = z.object({
  /** Opaque cursor: the ULID of the last item from the previous page. */
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  /** Present when more results exist. Absent on the final page. */
  nextCursor?: string;
}

/** Liveness and readiness payloads, kept free of any internal detail. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = healthResponseSchema.extend({
  dependencies: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['ok', 'unavailable']),
      latencyMs: z.number().nonnegative().optional(),
    }),
  ),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
