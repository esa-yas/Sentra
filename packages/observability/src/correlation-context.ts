import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * One correlation ID follows a request through Express, Prisma, BullMQ, and Sentry
 * (slides 024 and 077). Carrying it in async-local storage means a use case deep in the
 * core does not need a context argument threaded through every signature just to be
 * traceable, and a background job inherits the trace of the event that scheduled it.
 *
 * This is observability state only. Nothing authorizes against it.
 */
export interface CorrelationContext {
  /** Stable across retries and across the async work a request schedules. */
  readonly correlationId: string;
  /** Unique to one HTTP request or one job attempt. */
  readonly requestId: string;
  readonly organizationId?: string;
  readonly principalId?: string;
  readonly principalKind?: 'USER' | 'PARTNER' | 'SYSTEM';
  readonly purpose?: string;
  /** Per-stage timings recorded by the deadline runner. */
  readonly stageTimings: Record<string, number>;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export const generateCorrelationId = (): string => `crl_${randomUUID().replace(/-/g, '')}`;

export const generateRequestId = (): string => `req_${randomUUID().replace(/-/g, '')}`;

export const getCorrelationContext = (): CorrelationContext | undefined => storage.getStore();

/**
 * The current correlation ID, or a freshly generated one when called outside any context.
 * Never returns undefined, so an error path can always be correlated.
 */
export const getCorrelationId = (): string => storage.getStore()?.correlationId ?? generateCorrelationId();

export const runWithCorrelationContext = <T>(
  context: Partial<CorrelationContext> & Pick<CorrelationContext, 'correlationId'>,
  callback: () => T,
): T =>
  storage.run(
    {
      requestId: context.requestId ?? generateRequestId(),
      stageTimings: context.stageTimings ?? {},
      ...context,
    },
    callback,
  );

/**
 * Enriches the active context in place. Used once the principal is resolved, so log lines
 * emitted after authentication carry the tenant without re-entering storage.
 */
export const enrichCorrelationContext = (
  fields: Partial<Omit<CorrelationContext, 'correlationId' | 'requestId' | 'stageTimings'>>,
): void => {
  const current = storage.getStore();
  if (current === undefined) {
    return;
  }
  Object.assign(current, fields);
};

export const recordStageTiming = (stage: string, durationMs: number): void => {
  const current = storage.getStore();
  if (current === undefined) {
    return;
  }
  current.stageTimings[stage] = durationMs;
};
