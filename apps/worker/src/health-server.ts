import { createServer, type Server } from 'node:http';
import type { Logger } from '@sentra/observability';
import type { WorkerContainer } from './container';

/**
 * Minimal liveness/readiness HTTP surface for the worker, kept free of any framework.
 *
 * Readiness reflects the dependencies the worker genuinely needs — Redis (transport) and
 * PostgreSQL (system of record). A worker that cannot reach either is not ready to process,
 * but this is deliberately separate from the API's readiness so a worker outage never makes
 * the read-only Operations Console unusable.
 */
export const startHealthServer = (container: WorkerContainer, logger: Logger): Server => {
  const uptimeSeconds = (): number => Math.max(0, Math.round((Date.now() - container.startedAtMs) / 1000));

  const server = createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/health' || url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'sentra-worker', uptimeSeconds: uptimeSeconds() }));
      return;
    }

    if (url === '/ready' || url === '/readyz') {
      void (async () => {
        const dependencies: { name: string; status: 'ok' | 'unavailable' }[] = [];

        const redisOk = await container.cache.ping().catch(() => false);
        dependencies.push({ name: 'redis', status: redisOk ? 'ok' : 'unavailable' });

        let postgresOk = true;
        try {
          await container.prisma.$queryRaw`SELECT 1`;
        } catch {
          postgresOk = false;
        }
        dependencies.push({ name: 'postgresql', status: postgresOk ? 'ok' : 'unavailable' });

        const failed = dependencies.some((item) => item.status !== 'ok');
        res.writeHead(failed ? 503 : 200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: failed ? 'unavailable' : 'ok',
            service: 'sentra-worker',
            uptimeSeconds: uptimeSeconds(),
            dependencies,
          }),
        );
      })();
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  server.listen(container.config.queue.workerPort, () => {
    logger.info('worker_health_listening', { port: container.config.queue.workerPort });
  });

  return server;
};
