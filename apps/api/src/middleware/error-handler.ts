import { InternalError, NotFoundError, isAppError, toErrorEnvelope, type AppError } from '@sentra/contracts';
import { getCorrelationId, type Logger } from '@sentra/observability';
import type { ErrorRequestHandler, RequestHandler } from 'express';

/** Terminal 404 for unmatched routes, funnelled through the same error envelope. */
export const notFoundHandler = (): RequestHandler => (req, _res, next) => {
  next(new NotFoundError('route', req.path));
};

/**
 * Converts any thrown error into the shared error envelope, mapping the stable `code` to an
 * HTTP status and never leaking a stack trace, a SQL fragment, or an internal path. The
 * error object is redacted by the logger before it is written or sent to Sentry.
 */
export const errorHandler = (logger: Logger): ErrorRequestHandler => (err, _req, res, _next) => {
  const correlationId =
    (res.locals['correlationId'] as string | undefined) ?? getCorrelationId();
  const appError: AppError = isAppError(err) ? err : new InternalError();

  if (appError.httpStatus >= 500) {
    logger.error('request_failed', { err, code: appError.code });
  } else {
    logger.warn('request_rejected', { code: appError.code, status: appError.httpStatus });
  }

  if (res.headersSent) {
    return;
  }
  res.status(appError.httpStatus).json(toErrorEnvelope(appError, correlationId));
};
