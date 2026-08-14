import { HTTP_HEADERS, correlationIdSchema } from '@sentra/contracts';
import { generateCorrelationId, generateRequestId, runWithCorrelationContext } from '@sentra/observability';
import type { RequestHandler } from 'express';

/**
 * Establishes the correlation context for every request. A caller may supply
 * `x-correlation-id` so a partner can join its trace to ours (slide 077); an invalid value
 * is replaced rather than trusted. The id is echoed on the response and stored on
 * `res.locals` so the error handler can return it even when the context has unwound.
 */
export const correlationMiddleware = (): RequestHandler => (req, res, next) => {
  const header = req.header(HTTP_HEADERS.CORRELATION_ID);
  const parsed = header === undefined ? undefined : correlationIdSchema.safeParse(header);
  const correlationId = parsed?.success === true ? parsed.data : generateCorrelationId();
  const requestId = generateRequestId();

  res.setHeader(HTTP_HEADERS.CORRELATION_ID, correlationId);
  res.locals['correlationId'] = correlationId;
  res.locals['requestId'] = requestId;

  runWithCorrelationContext({ correlationId, requestId }, () => {
    next();
  });
};
