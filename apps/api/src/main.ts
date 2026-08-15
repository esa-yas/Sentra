import { describeConfig, loadEnv } from '@sentra/config';
import { createLogger } from '@sentra/observability';
import { createApp } from './app';
import { buildContainer } from './container';

/**
 * Process entrypoint. Configuration is parsed once and the process refuses to start when it
 * is invalid (fail loud, never fail subtly). All business logic lives behind the assembled
 * container; this file only wires and listens.
 */
const main = async (): Promise<void> => {
  const config = loadEnv();
  const logger = createLogger({
    level: config.runtime.logLevel,
    serviceName: config.runtime.serviceName,
    serviceVersion: config.runtime.serviceVersion,
    pretty: !config.runtime.isProduction,
  });

  const container = await buildContainer(config, logger);
  const app = createApp(container);

  logger.info('api_starting', {
    providerMode: container.providerMode,
    config: describeConfig(config),
  });

  const server = app.listen(config.api.port, () => {
    logger.info('api_listening', { port: config.api.port });
  });

  const shutdown = (signal: string): void => {
    logger.info('api_shutting_down', { signal });
    server.close(() => {
      void container.disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

void main();
