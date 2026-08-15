import {
  NotFoundError,
  developmentStatusSchema,
  eventListQuerySchema,
  type DevelopmentStatus,
  type FlowRun,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router } from 'express';
import type { Container } from '../container';
import { parseOrThrow } from '../validation';

/**
 * Read-model APIs for the Operations Console. These serve dedicated projections, not raw
 * tables (slide 043). All list endpoints are cursor-paginated.
 */
export const createOperationsRouter = (container: Container): Router => {
  const router = Router();
  const { store, config } = container;

  router.get('/operations/summary', async (_req, res) => {
    res.json(await store.summary(config.runtime.nodeEnv));
  });

  router.get('/operations/integrations', async (_req, res) => {
    res.json({ items: await store.providers() });
  });

  router.get('/events', async (req, res) => {
    const query = parseOrThrow(eventListQuerySchema, req.query);
    res.json(await store.listEvents(query));
  });

  router.get('/events/:id', async (req, res) => {
    const event = await store.getEvent(req.params.id);
    if (event === undefined) {
      throw new NotFoundError('event', req.params.id);
    }
    res.json(event);
  });

  router.get('/cases', async (req, res) => {
    const rawLimit = req.query['limit'];
    const rawCursor = req.query['cursor'];
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : 50;
    const cursor = typeof rawCursor === 'string' ? rawCursor : undefined;
    res.json(await store.listDecisions(Number.isFinite(limit) ? limit : 50, cursor));
  });

  router.get('/cases/:id', async (req, res) => {
    const recommendation = await store.getDecision(req.params.id);
    if (recommendation === undefined) {
      throw new NotFoundError('case', req.params.id);
    }
    const flow = (await store.getFlowByCorrelation(recommendation.correlationId)) ?? null;
    res.json({ recommendation, flow });
  });

  router.get('/operations/flow/latest', async (_req, res) => {
    res.json((await store.latestFlow()) ?? emptyFlow(getCorrelationId()));
  });

  router.get('/operations/flow/:correlationId', async (req, res) => {
    const flow = await store.getFlowByCorrelation(req.params.correlationId);
    if (flow === undefined) {
      throw new NotFoundError('flow', req.params.correlationId);
    }
    res.json(flow);
  });

  router.get('/operations/development-status', (_req, res) => {
    res.json(buildDevelopmentStatus(container));
  });

  return router;
};

/** A pipeline of pending stages, so the flow visualization renders before any run. */
const emptyFlow = (correlationId: string): FlowRun => ({
  correlationId,
  decisionId: '',
  startedAt: new Date().toISOString(),
  stages: [
    ['TELECOM_EVENT', 'Telecom Event', 'ingest/telecom-risk-event'],
    ['EVENT_VALIDATION', 'Event Validation', 'edge/validation + deny-list'],
    ['CONSENT_CHECK', 'Consent Check', 'core/consent'],
    ['CORRELATION', 'Correlation', 'core/correlation'],
    ['PAYMENT_INTENT', 'Payment Intent', 'ingest/payment-intent'],
    ['RISK_EVALUATION', 'Risk Evaluation', 'core/decision/risk-engine'],
    ['RULES_AND_POLICY', 'Rules & Policy', 'core/decision/policy'],
    ['RECOMMENDATION', 'Recommendation', 'core/decision'],
    ['BANK_DECISION', 'Bank Decision', 'partner/bank (external)'],
    ['OUTCOME', 'Outcome', 'partner/bank (external)'],
    ['CONTINUOUS_LEARNING', 'Continuous Learning', 'analytics (off-path)'],
  ].map(([stage, label, module]) => ({
    stage: stage as FlowRun['stages'][number]['stage'],
    label: label as string,
    module: module as string,
    status: 'PENDING' as const,
    durationMs: null,
    correlationId,
    inputSummary: 'Awaiting a synthetic run',
    outputSummary: 'Run a scenario in the Risk Simulator to populate this stage',
    failureBehavior: '—',
    relatedAuditEventId: null,
  })),
});

const buildDevelopmentStatus = (container: Container): DevelopmentStatus => {
  const status: DevelopmentStatus = {
    version: container.config.runtime.serviceVersion,
    commit: container.config.runtime.serviceCommit,
    environment: container.config.runtime.nodeEnv,
    providerMode: container.providerMode,
    currentMilestone:
      container.providerMode === 'real'
        ? 'Version 1a · Slice 2 — PostgreSQL persistence'
        : 'Version 1a · Slice 1 — visible synthetic journey',
    nextMilestone:
      container.providerMode === 'real'
        ? 'Slice 3 — Redis + BullMQ durable delivery'
        : 'Slice 2 — Prisma repositories, PostgreSQL unit of work, transactional audit + outbox',
    verification: {
      recordedAt: null,
      unitTests: null,
      note: 'Test totals are reported by `pnpm verify`, not asserted live by this endpoint.',
    },
    capabilities: [
      { name: 'Deterministic risk engine', state: 'IMPLEMENTED', detail: 'Explainable scoring, reason codes, versioned policy.' },
      { name: 'Correlation-ID propagation', state: 'IMPLEMENTED', detail: 'One id across UI, API response, and redacted logs.' },
      { name: 'Hash-chained audit events', state: 'IMPLEMENTED', detail: container.providerMode === 'real' ? 'Canonical v1 hash chain in PostgreSQL.' : 'Canonical v1 hash chain (in-memory adapter).' },
      { name: 'Operations Console', state: 'IMPLEMENTED', detail: 'Overview, Live Events, Risk Simulator, System Flow.' },
      { name: 'Persistence', state: container.providerMode === 'real' ? 'IMPLEMENTED' : 'SIMULATED', detail: container.providerMode === 'real' ? 'Prisma/PostgreSQL unit of work, audit, outbox, read models.' : 'In-memory store; Postgres read models arrive in Slice 2.' },
      { name: 'Telecom risk signals', state: 'SIMULATED', detail: 'Synthetic; real feeds are a later version.' },
      { name: 'Business outcomes', state: 'SIMULATED', detail: 'No bank feedback loop yet; outcome counters are synthetic.' },
      { name: 'Durable delivery (Redis/BullMQ)', state: 'PLANNED', detail: 'Slice 3.' },
      { name: 'Partner auth + signatures', state: 'PLANNED', detail: 'Slice 4 trust edge.' },
      { name: 'AI assistance (Gemini)', state: 'PLANNED', detail: 'Contract-only; off the deterministic path.' },
    ],
    migrations: {
      state: container.providerMode === 'real' ? 'UP_TO_DATE' : 'NOT_APPLICABLE',
      detail:
        container.providerMode === 'real'
          ? 'Prisma migrations applied; runtime uses DATABASE_URL.'
          : 'In-memory provider mode; Prisma migrations apply from Slice 2 onward.',
    },
  };

  return developmentStatusSchema.parse(status);
};
