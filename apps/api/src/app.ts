import { HTTP_HEADERS } from '@sentra/contracts';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Container } from './container';
import { correlationMiddleware } from './middleware/correlation';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLoggingMiddleware } from './middleware/request-logging';
import { requestMetricsMiddleware } from './middleware/request-metrics';
import { createHealthRouter } from './routes/health';
import { createOperationsRouter } from './routes/operations';
import { createSimulatorRouter } from './routes/simulator';

/**
 * Builds the Express application from an assembled {@link Container}. Kept separate from
 * `main` so tests can drive the app with supertest without opening a socket.
 */
export const createApp = (container: Container): Express => {
  const app = express();
  const { config, store, clock, logger } = container;

  app.disable('x-powered-by');
  app.set('trust proxy', config.api.trustProxyHops);

  app.use(helmet());
  app.use(
    cors({
      origin: config.api.corsAllowedOrigins.length > 0 ? [...config.api.corsAllowedOrigins] : true,
      exposedHeaders: [HTTP_HEADERS.CORRELATION_ID],
    }),
  );
  app.use(express.json({ limit: config.api.bodyLimitBytes }));

  app.use(correlationMiddleware());
  app.use(requestLoggingMiddleware(logger, clock));
  app.use(requestMetricsMiddleware(clock, (durationMs, failed) => store.recordApiRequest(durationMs, failed)));

  app.use('/', createHealthRouter(container));
  app.use('/api/simulator', createSimulatorRouter(container));
  app.use('/api', createOperationsRouter(container));

  app.use(notFoundHandler());
  app.use(errorHandler(container.logger));

  return app;
};
