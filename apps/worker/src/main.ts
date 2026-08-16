import { describeConfig, loadEnv } from '@sentra/config';
import { QUEUE_NAMES } from '@sentra/contracts';
import { createLogger } from '@sentra/observability';
import type { QueueConsumerHandle } from '@sentra/ports';
import { buildWorkerContainer } from './container';
import { startHealthServer } from './health-server';

/**
 * Worker process entrypoint.
 *
 * Two responsibilities ship in one process for the MVP but are kept separate so they can be
 * split later:
 *   1. The outbox publisher loop (claims committed outbox rows and enqueues them).
 *   2. The BullMQ consumer for `recommendation.issued` (idempotent, inbox-guarded).
 *
 * Configuration is parsed once and the process refuses to start when it is invalid.
 */
const main = async (): Promise<void> => {
  const config = loadEnv();
  const logger = createLogger({
    level: config.runtime.logLevel,
    serviceName: 'sentra-worker',
    serviceVersion: config.runtime.serviceVersion,
    pretty: !config.runtime.isProduction,
  });

  const container = buildWorkerContainer(config, logger);

  logger.info('worker_starting', {
    providerMode: config.runtime.providerMode,
    runPublisher: config.queue.runPublisherInWorker,
    concurrency: config.queue.workerConcurrency,
    config: describeConfig(config),
  });

  const consumerHandle: QueueConsumerHandle = await container.queue.consume(
    QUEUE_NAMES.RECOMMENDATION_EVENTS,
    container.consumer.handle,
    { concurrency: config.queue.workerConcurrency },
  );
  logger.info('worker_consumer_ready', { queue: QUEUE_NAMES.RECOMMENDATION_EVENTS });

  if (config.queue.runPublisherInWorker) {
    container.publisher.start();
    logger.info('worker_publisher_started', {
      pollIntervalMs: config.worker.outboxPollIntervalMs,
      batchSize: config.worker.outboxBatchSize,
    });
  }

  const healthServer = startHealthServer(container, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('worker_shutting_down', { signal });
    void (async () => {
      try {
        await container.publisher.stop();
        await consumerHandle.stop();
        healthServer.close();
        await container.disconnect();
      } catch (error) {
        logger.error('worker_shutdown_error', {
          error: error instanceof Error ? error.message : 'unknown error',
        });
      } finally {
        process.exit(0);
      }
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

void main();
