import { loadConfig, type AppConfig } from '@sentra/config';
import { createNullLogger } from '@sentra/observability';
import type { Express } from 'express';
import { createApp } from '../app';
import { buildContainer, type Container } from '../container';

/**
 * Builds a fully in-memory API for tests without reading the ambient environment: a
 * synthetic, valid configuration is passed explicitly so the suite is hermetic.
 */
const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sentra:sentra@localhost:5432/sentra_test?schema=public',
  DATABASE_DIRECT_URL: 'postgresql://sentra:sentra@localhost:5432/sentra_test?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
};

export const buildTestConfig = (): AppConfig => loadConfig(TEST_ENV);

export const buildTestApp = async (): Promise<{ app: Express; container: Container }> => {
  const container = await buildContainer(buildTestConfig(), createNullLogger());
  return { app: createApp(container), container };
};
