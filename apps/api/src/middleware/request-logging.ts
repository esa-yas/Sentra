import type { Logger } from '@sentra/observability';
import type { Clock } from '@sentra/ports';
import type { RequestHandler } from 'express';

/**
 * Emits one structured, redacted access log per request. The correlation id is included
 * explicitly (captured from `res.locals`) because the `finish` event can fire after the
 * async correlation context has unwound. Only the method, route path, status, and duration
 * are logged — never the query string, headers, or body — so no secret or raw identifier
 * reaches the logs (slide 077 + the data-privacy requirements).
 */
export const requestLoggingMiddleware = (logger: Logger, clock: Clock): RequestHandler => (req, res, next) => {
  const start = clock.monotonicMs();
  res.on('finish', () => {
    const durationMs = Math.round((clock.monotonicMs() - start) * 100) / 100;
    const correlationId = typeof res.locals['correlationId'] === 'string' ? res.locals['correlationId'] : undefined;
    const fields = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      ...(correlationId === undefined ? {} : { correlationId }),
    };
    if (res.statusCode >= 500) {
      logger.error('http_request', fields);
    } else {
      logger.info('http_request', fields);
    }
  });
  next();
};
