import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolvePackage = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Tests resolve workspace packages to TypeScript sources so the suite runs without a
 * prior build. Production resolves the same specifiers to `dist` via package.json `main`.
 */
const workspaceAliases = {
  '@sentra/contracts': resolvePackage('./packages/contracts/src/index.ts'),
  '@sentra/config': resolvePackage('./packages/config/src/index.ts'),
  '@sentra/observability': resolvePackage('./packages/observability/src/index.ts'),
  '@sentra/ports': resolvePackage('./packages/ports/src/index.ts'),
  '@sentra/core': resolvePackage('./packages/core/src/index.ts'),
  '@sentra/db': resolvePackage('./packages/db/src/index.ts'),
  '@sentra/adapters': resolvePackage('./packages/adapters/src/index.ts'),
  '@sentra/testing': resolvePackage('./packages/testing/src/index.ts'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: workspaceAliases },
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          include: [
            'packages/*/src/**/__tests__/**/*.test.ts',
            'apps/api/src/**/__tests__/**/*.test.ts',
            'apps/worker/src/**/__tests__/**/*.test.ts',
          ],
        },
      },
      {
        resolve: { alias: workspaceAliases },
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          globalSetup: ['tests/integration/global-setup.ts'],
          // Integration tests share one database. Run every file in a single fork,
          // sequentially, so that a per-test TRUNCATE in one file can never race a write in
          // another file (which otherwise deadlocks or wipes a row mid-test).
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
