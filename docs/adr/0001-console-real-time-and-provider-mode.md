# ADR 0001: Operations Console real-time strategy and provider-mode switching

- Status: Accepted
- Date: 2026-08-14
- Scope: Version 1a, Slice 1 (visible synthetic journey)

## Context

Slice 1 delivers the Sentra Operations Console inside `apps/web` alongside the Express
API in `apps/api`. Two cross-cutting decisions shape every screen and needed to be settled
before more slices build on them:

1. **How the console receives live updates.** The Live Events stream, Overview dashboard,
   System Flow, and System Health screens all show data that changes as synthetic
   scenarios run. We must pick the simplest transport that is honest about freshness.
2. **How the system switches between fake and real providers.** The brief requires that we
   build visibly now using in-memory fakes, then replace persistence (Slice 2) and durable
   delivery (Slice 3) behind the same ports without rewriting core logic or the frontend.

## Decision 1 — Real-time updates: polling

The console uses **client-side polling** against the read-model APIs. Live screens issue a
`fetch` on mount and then on a fixed interval (4–5s), replacing their local state with the
latest response. There is no SSE endpoint and no WebSocket server in Slice 1.

### Rationale

- **One-way, low-frequency data.** The console only reads; a human watching an operations
  dashboard does not need sub-second latency. A few seconds of staleness is acceptable and
  is visually obvious (each screen renders a `generatedAt`/timestamp).
- **Considerably simpler.** Polling needs no long-lived connection, no server-side
  fan-out, no reconnection/backoff logic, and no extra process. It works through the
  existing Next.js `/api/*` rewrite with the same correlation-id response header we already
  rely on, and it degrades gracefully to an error notice when the API is down.
- **Portable.** Polling behaves identically behind Railway today and Cloud Run later, with
  no sticky-session or connection-draining concerns that SSE/WebSockets introduce on
  autoscaling platforms.

### Tradeoffs

- Wasteful when idle: each open tab issues periodic requests even with no new data. At MVP
  scale (internal operators, synthetic data) this cost is negligible. The read-model
  endpoints are cheap in-memory reads and are cursor-paginated to bound payload size.
- Not suitable for genuinely bidirectional or high-frequency needs. If a future
  requirement demands push (e.g. an operator acting on a job the instant it fails), we will
  revisit: **SSE** is the first upgrade for one-way push, and **WebSockets** only if a
  demonstrated bidirectional requirement appears. This ADR should be superseded, not
  quietly worked around, when that happens.

## Decision 2 — Provider-mode switching via a single configuration flag + composition root

The composition root (`apps/api/src/container.ts`) is the only place that instantiates
concrete adapters. It reads `SENTRA_PROVIDER_MODE` (validated once in `@sentra/config`,
values `in-memory` | `real`) and wires the matching implementations of the ports the core
depends on. Core business logic and every frontend component depend only on ports and
shared contracts, never on a concrete provider.

Slice 1 ships `in-memory` only: `SystemClock`, `UlidIdGenerator`, `InMemoryUnitOfWork`,
`InMemoryAuditProvider`, and `InMemoryOperationsStore`. `real` (Postgres/Prisma, Redis,
BullMQ) is enabled from Slice 2 onward by adding those adapters to the same switch.

### Rationale

- **Replaceability is the point.** Ports-and-adapters plus a single wiring seam means Slice
  2 can swap persistence behind `UnitOfWork`/`AuditProvider`/the store without touching core
  or the console. Dependency-cruiser enforces that core never imports Prisma/BullMQ/Redis
  and that the web app never imports core/ports/adapters/db.
- **Centralized, validated config.** All environment access lives in `@sentra/config`, so
  the mode is parsed and range-checked once at boot; an invalid value fails fast rather than
  producing subtly wrong behaviour.
- **Honest UI.** The active mode is surfaced read-only on the Topbar, Overview, Integrations,
  and Development screens, and synthetic figures are explicitly tagged, so no one mistakes
  in-memory demo data for validated production truth.

### Tradeoffs

- A single coarse flag does not allow per-provider mixing (e.g. real Postgres + fake queue)
  yet. The contract already reserves a `mixed` value in the summary read model for when that
  becomes useful; introducing it will mean per-capability wiring in the container, which we
  deferred to avoid speculative complexity in Slice 1.
- The in-memory adapters are real, contract-abiding implementations (not test doubles), so
  they carry a small maintenance cost. This is deliberate: it keeps the `vitest`-based fakes
  out of the runtime dependency graph and lets the console run without external services.

## Consequences

- New live screens should poll a read-model endpoint and render loading/empty/error/success
  states; they must not open sockets in Slice 1.
- New capabilities are wired in the composition root behind `SENTRA_PROVIDER_MODE`; adapters
  live in `packages/adapters`, and the switch is the only place that knows which is active.
- Revisit this ADR when a push or bidirectional requirement is demonstrated, or when
  per-provider mode mixing is needed.
