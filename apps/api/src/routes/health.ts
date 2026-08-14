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

  router.get('/ready', (_req, res) => {
    const body: ReadinessResponse = {
      status: 'ok',
      service: config.runtime.serviceName,
      version: config.runtime.serviceVersion,
      uptimeSeconds: uptimeSeconds(),
      dependencies: [
        { name: 'in-memory-store', status: 'ok', latencyMs: 0 },
        { name: 'audit-chain', status: 'ok', latencyMs: 0 },
      ],
    };
    res.json(body);
  });

  return router;
};
