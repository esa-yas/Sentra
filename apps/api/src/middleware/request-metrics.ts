import type { Clock } from '@sentra/ports';
import type { RequestHandler } from 'express';

/**
 * Records API latency and failure counts for the operations dashboard. The recorder is
 * injected as a callback so this middleware stays free of any adapter import (the boundary
 * rules forbid middleware from reaching into `@sentra/adapters`).
 */
export const requestMetricsMiddleware = (
  clock: Clock,
  record: (durationMs: number, failed: boolean) => void,
): RequestHandler => (_req, res, next) => {
  const start = clock.monotonicMs();
  res.on('finish', () => {
    record(clock.monotonicMs() - start, res.statusCode >= 500);
  });
  next();
};
