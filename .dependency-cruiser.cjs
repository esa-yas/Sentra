/**
 * Architecture boundaries as an executable assertion.
 *
 * Slide 048 of the specification requires that provider SDKs never reach core modules.
 * These rules are enforced in CI, so a boundary violation fails the build rather than
 * surviving as a code-review comment.
 */

/** Provider SDKs that may only ever be imported from `packages/adapters`. */
const PROVIDER_SDK_PATTERN =
  '^(@prisma/client|prisma|@supabase/.+|@sentry/.+|bullmq|ioredis|@google/genai|@google-cloud/.+|@node-rs/argon2|jose|ulid)$';

/** HTTP and process-level frameworks that may only be imported from `apps/*`. */
const DELIVERY_FRAMEWORK_PATTERN = '^(express|helmet|cors|next|react|react-dom|supertest)$';

module.exports = {
  forbidden: [
    {
      // Deliberately not filtered by `dependencyTypes`. Under pnpm's isolated layout an
      // undeclared import is *unresolvable* rather than an npm dependency, so a type filter
      // would let the very violation this rule exists to catch pass silently.
      name: 'core-no-provider-sdk',
      comment:
        'packages/core is the application core. It must depend on ports only, never on a provider SDK, ' +
        'so Supabase, Railway, BullMQ, Gemini, and future GCP SDKs remain replaceable.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: PROVIDER_SDK_PATTERN },
    },
    {
      name: 'core-no-delivery-framework',
      comment: 'packages/core must not know how it is delivered over the wire.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: DELIVERY_FRAMEWORK_PATTERN },
    },
    {
      name: 'core-no-adapters',
      comment: 'packages/core must not import concrete adapters or the Prisma layer.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^packages/(adapters|db)/' },
    },
    {
      name: 'ports-are-types-only',
      comment:
        'packages/ports declares interfaces. It must not depend on the core, on adapters, or on a provider SDK.',
      severity: 'error',
      from: { path: '^packages/ports/src' },
      to: {
        moreThanOneDependencyType: false,
        path: `^packages/(core|adapters|db)/`,
      },
    },
    {
      name: 'ports-no-provider-sdk',
      comment: 'packages/ports must not depend on a provider SDK.',
      severity: 'error',
      from: { path: '^packages/ports/src' },
      to: { path: PROVIDER_SDK_PATTERN },
    },
    {
      name: 'contracts-are-standalone',
      comment: 'packages/contracts is the shared vocabulary and must not depend on any other workspace package.',
      severity: 'error',
      from: { path: '^packages/contracts/src' },
      to: { path: '^packages/(?!contracts/)' },
    },
    {
      name: 'routes-use-container-only',
      comment:
        'Express routes and controllers must receive dependencies from the composition root. ' +
        'Importing packages/adapters directly would couple HTTP delivery to a provider.',
      severity: 'error',
      from: { path: '^apps/api/src/(routes|controllers|middleware)/' },
      to: { path: '^packages/adapters/' },
    },
    {
      name: 'no-business-logic-in-web',
      comment:
        'The Next.js application is a presentation shell. It must not import the core, ports, adapters, or Prisma.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^packages/(core|ports|adapters|db)/' },
    },
    {
      name: 'web-never-touches-database',
      comment: 'The browser-facing application must never hold a database client or a service-role credential.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^(@prisma/client|prisma|ioredis|bullmq)$' },
    },
    {
      // Also a boundary check in its own right: an import that cannot be resolved is
      // usually a package reaching for a dependency it never declared.
      name: 'no-unresolvable-imports',
      comment: 'Every import must resolve. An unresolvable module means a missing dependency declaration.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies hide ownership and break incremental builds.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Unreachable modules are dead weight; delete them or wire them up.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(vitest|eslint|next|postcss)\\.config\\.(js|cjs|mjs|ts)$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^apps/mobile/|(^|/)(dist|coverage|\\.next|\\.next-verify)/|(^|/)next-env\\.d\\.ts$' },
    tsPreCompilationDeps: true,
    // Resolves `@sentra/*` to source rather than to built output, so the rules apply to a
    // clean checkout. See the comment in that file for why it is separate from the build.
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.cjs', '.mjs'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
