import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      // Isolated Next build output (see the web package's `build:check`), so a verification
      // build cannot disturb a running dev server's `.next`.
      '**/.next-verify/**',
      '**/coverage/**',
      // Flutter app — Dart, linted by `flutter analyze`, not ESLint.
      'apps/mobile/**',
      '**/node_modules/**',
      // Ephemeral agent worktrees hold full repo copies whose nested paths defeat the
      // package-scoped rule overrides below; they are never part of the linted source.
      '.claude/**',
      '**/.claude/**',
      'packages/db/src/generated/**',
      '**/*.tsbuildinfo',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Read configuration through @sentra/config loadEnv() so every variable is validated once and never logged.',
        },
      ],
    },
  },
  {
    // The configuration package is the one place allowed to read process.env, and the
    // logger is the one place allowed to write to stdout.
    files: ['packages/config/src/**/*.ts', 'packages/observability/src/logger.ts'],
    rules: { 'no-restricted-syntax': 'off', 'no-console': 'off' },
  },
  {
    // The browser bundle must read NEXT_PUBLIC_* values at build time; these are inlined by
    // Next and cannot go through the server-side loadEnv(). Confined to the one web module
    // that reads them, which only ever touches anon/public values.
    files: ['apps/web/src/lib/supabase/config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/__tests__/**/*.ts', 'tests/**/*.ts', 'packages/testing/src/**/*.ts', 'packages/db/prisma/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Build and tooling scripts run in Node directly, so they legitimately use `process`
    // and write to stdout. They are outside the application, so the configuration and
    // logging rules do not apply.
    files: ['**/*.cjs', '**/*.mjs', '**/*.js', 'packages/db/scripts/**'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
);
