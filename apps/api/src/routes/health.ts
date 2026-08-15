import type { HealthResponse, ReadinessResponse } from '@sentra/contracts';
import { Router } from 'express';
import type { Container } from '../container';

/** Liveness and readiness. Kept free of internal detail (slide 077). */
export const createHealthRouter = (container: Container): Router => {
  const router = Router();
  const { config } = container;

  const uptimeSeconds = (): number => Math.max(0, Math.round((Date.now() - container.startedAtMs) / 1000));

  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: config.runtime.serviceName,
      version: config.runtime.serviceVersion,
      uptimeSeconds: uptimeSeconds(),
    };
    res.json(body);
  });

  router.get('/ready', async (_req, res) => {
    const dependencies = await container.store.checkDependencies();
    const failed = dependencies.some((item) => item.status !== 'ok');
    const body: ReadinessResponse = {
      status: failed ? 'unavailable' : 'ok',
      service: config.runtime.serviceName,
      version: config.runtime.serviceVersion,
      uptimeSeconds: uptimeSeconds(),
      dependencies: dependencies.map((item) => ({
        name: item.name,
        status: item.status,
        latencyMs: item.latencyMs,
      })),
    };
    res.status(failed ? 503 : 200).json(body);
  });

  return router;
};
