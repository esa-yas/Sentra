import {
  ForbiddenError,
  NotFoundError,
  PARTNER_CONNECTION_KINDS,
  PERMISSIONS,
  createPartnerConnectionRequestSchema,
  developmentStatusSchema,
  eventListQuerySchema,
  outboxListQuerySchema,
  partnerApiActivityQuerySchema,
  partnerConnectionListQuerySchema,
  queueJobListQuerySchema,
  sandboxSignedRequestSchema,
  type DevelopmentStatus,
  type FlowRun,
  type ProviderHealth,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router, type Request, type Response } from 'express';
import type { Container } from '../container';
import { getAuthContext } from '../auth/request-context';
import { createAuthorizer } from '../auth/require-permission';
import { QueueActionRejected } from '../queue-admin';
import { parseOrThrow } from '../validation';

/**
 * Read-model APIs for the Operations Console. These serve dedicated projections, not raw
 * tables (slide 043). All list endpoints are cursor-paginated.
 */
export const createOperationsRouter = (container: Container): Router => {
  const router = Router();
  const { store, config, queueAdmin } = container;

  // The organization a request acts on: set by the authorization middleware when auth is
  // enabled, and falling back to the demo organization in open in-memory mode.
  const resolveOrganizationId = (req: Request): string =>
    getAuthContext(req)?.organizationId ?? container.syntheticOrganizationId;

  // Every console endpoint requires an authenticated member of the active organization. The
  // guard is a pass-through when auth is not configured (demo/in-memory mode), so that mode is
  // unchanged. Partner credential writes below add a stricter permission on top.
  const { requirePermission } = createAuthorizer(container.auth?.resolve);
  const partnerWrite = requirePermission(PERMISSIONS.PARTNER_WRITE);
  const rotateSecret = requirePermission(PERMISSIONS.PARTNER_ROTATE_SECRET);
  router.use(requirePermission(PERMISSIONS.ORGANIZATION_READ));

  router.get('/operations/summary', async (req, res) => {
    res.json(await store.summary(resolveOrganizationId(req), config.runtime.nodeEnv));
  });

  router.get('/operations/integrations', async (_req, res) => {
    const base = await store.providers();
    const health = await queueAdmin.providerHealth();
    // Replace the placeholder CACHE/QUEUE rows with the real Redis/BullMQ health, and add the
    // worker and publisher rows so the console reflects the full durable-delivery topology.
    const withoutPlaceholders = base.filter(
      (provider: ProviderHealth) => provider.kind !== 'CACHE' && provider.kind !== 'QUEUE',
    );
    res.json({
      items: [
        ...withoutPlaceholders,
        health.redis,
        health.queueTransport,
        health.worker,
        health.publisher,
      ],
    });
  });

  // -------------------------------------------------------------------------
  // Queue Monitor (Slice 3 durable delivery)
  // -------------------------------------------------------------------------

  router.get('/operations/queues', async (_req, res) => {
    res.json(await queueAdmin.monitorSummary());
  });

  router.get('/operations/queues/:queueName', async (req, res) => {
    res.json(await queueAdmin.queueHealth(req.params.queueName));
  });

  router.get('/operations/queues/:queueName/jobs', async (req, res) => {
    const query = parseOrThrow(queueJobListQuerySchema, req.query);
    res.json(await queueAdmin.listJobs(req.params.queueName, query));
  });

  router.get('/operations/outbox', async (req, res) => {
    const query = parseOrThrow(outboxListQuerySchema, req.query);
    res.json(await queueAdmin.listOutbox(query));
  });

  router.get('/operations/outbox/:eventId', async (req, res) => {
    const event = await queueAdmin.getOutbox(req.params.eventId);
    if (event === null) {
      throw new NotFoundError('outbox event', req.params.eventId);
    }
    res.json(event);
  });

  // Development-only safe actions. Refused in production; operate on synthetic records only.
  const runAction = async (res: Response, action: () => Promise<unknown>): Promise<void> => {
    try {
      res.json(await action());
    } catch (error) {
      if (error instanceof QueueActionRejected) {
        res.status(403).json({ error: 'forbidden', message: error.message });
        return;
      }
      throw error;
    }
  };

  router.post('/operations/queues/:queueName/jobs/:jobId/retry', async (req, res) => {
    await runAction(res, () =>
      queueAdmin.retryJob(req.params.queueName, req.params.jobId, getCorrelationId()),
    );
  });

  router.post('/operations/outbox/:eventId/replay', async (req, res) => {
    await runAction(res, () => queueAdmin.replayOutbox(req.params.eventId, getCorrelationId()));
  });

  router.post('/operations/outbox/:eventId/duplicate', async (req, res) => {
    await runAction(res, () => queueAdmin.duplicateDelivery(req.params.eventId, getCorrelationId()));
  });

  router.get('/events', async (req, res) => {
    const query = parseOrThrow(eventListQuerySchema, req.query);
    res.json(await store.listEvents(resolveOrganizationId(req), query));
  });

  router.get('/events/:id', async (req, res) => {
    const event = await store.getEvent(resolveOrganizationId(req), req.params.id);
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
    res.json(
      await store.listDecisions(resolveOrganizationId(req), Number.isFinite(limit) ? limit : 50, cursor),
    );
  });

  router.get('/cases/:id', async (req, res) => {
    const organizationId = resolveOrganizationId(req);
    const recommendation = await store.getDecision(organizationId, req.params.id);
    if (recommendation === undefined) {
      throw new NotFoundError('case', req.params.id);
    }
    const flow = (await store.getFlowByCorrelation(organizationId, recommendation.correlationId)) ?? null;
    res.json({ recommendation, flow });
  });

  router.get('/operations/flow/latest', async (req, res) => {
    res.json((await store.latestFlow(resolveOrganizationId(req))) ?? emptyFlow(getCorrelationId()));
  });

  router.get('/operations/flow/:correlationId', async (req, res) => {
    const flow = await store.getFlowByCorrelation(resolveOrganizationId(req), req.params.correlationId);
    if (flow === undefined) {
      throw new NotFoundError('flow', req.params.correlationId);
    }
    res.json(flow);
  });

  router.get('/operations/api-activity', async (req, res) => {
    if (container.partner === undefined) {
      res.json({ items: [], degraded: true, detail: 'Partner API activity requires real provider mode.' });
      return;
    }
    const query = parseOrThrow(partnerApiActivityQuerySchema, req.query);
    const listed = await container.partner.activity.list(
      {
        ...(query.organizationId === undefined ? {} : { organizationId: query.organizationId }),
        ...(query.partnerConnectionId === undefined ? {} : { partnerConnectionId: query.partnerConnectionId }),
        ...(query.endpoint === undefined ? {} : { endpoint: query.endpoint }),
        ...(query.method === undefined ? {} : { method: query.method.toUpperCase() }),
        ...(query.status === undefined ? {} : { statusCode: query.status }),
        ...(query.correlationId === undefined ? {} : { correlationId: query.correlationId }),
        ...(query.environment === undefined ? {} : { environment: query.environment }),
      },
      { limit: query.limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) },
    );
    const orgIds = [...new Set(listed.items.map((item) => item.organizationId).filter((id): id is string => id !== null))];
    const partnerIds = [
      ...new Set(listed.items.map((item) => item.partnerConnectionId).filter((id): id is string => id !== null)),
    ];
    const orgLabels = await container.partner.directory.organizationLabels(orgIds);
    const partnerLabels = new Map<string, string>();
    await Promise.all(
      partnerIds.map(async (id) => {
        const connection = await container.partner!.connections.findByIdUnscoped(id);
        if (connection !== null) {
          partnerLabels.set(id, connection.name);
        }
      }),
    );
    const redis = await queueAdmin.providerHealth();
    res.json({
      items: listed.items.map((item) => ({
        id: item.id,
        occurredAt: item.occurredAt.toISOString(),
        organizationId: item.organizationId,
        organizationLabel: item.organizationId === null ? null : (orgLabels.get(item.organizationId) ?? null),
        partnerConnectionId: item.partnerConnectionId,
        partnerLabel: item.partnerConnectionId === null ? null : (partnerLabels.get(item.partnerConnectionId) ?? null),
        endpoint: item.endpoint,
        method: item.method,
        statusCode: item.statusCode,
        durationMs: item.durationMs,
        correlationId: item.correlationId,
        authentication: item.authentication,
        signature: item.signature,
        replay: item.replay,
        idempotency: item.idempotency,
        rateLimit: item.rateLimit,
        errorCode: item.errorCode,
        environment: item.environment,
        synthetic: item.synthetic,
      })),
      ...(listed.nextCursor === undefined ? {} : { nextCursor: listed.nextCursor }),
      redisState: redis.redis.state,
    });
  });

  router.get('/operations/partners', async (req, res) => {
    if (container.partner === undefined) {
      res.json({ items: [], degraded: true, detail: 'Partner directory requires real provider mode.' });
      return;
    }
    const query = parseOrThrow(partnerConnectionListQuerySchema, req.query);
    const listed = await container.partner.directory.listConnections(
      {
        ...(query.organizationId === undefined ? {} : { organizationId: query.organizationId }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.environment === undefined ? {} : { environment: query.environment }),
      },
      { limit: query.limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) },
    );
    const orgLabels = await container.partner.directory.organizationLabels(
      listed.items.map((item) => item.organizationId),
    );
    const since = new Date(container.clock.now().getTime() - 24 * 60 * 60 * 1000);
    const items = await Promise.all(
      listed.items.map(async (connection) => {
        const keys = await container.partner!.keys.listForConnection(connection.organizationId, connection.id);
        const active = keys.filter((key) => key.status === 'ACTIVE');
        const expiries = active
          .map((key) => key.notAfter)
          .filter((value): value is Date => value !== null)
          .sort((a, b) => a.getTime() - b.getTime());
        const recentFailures = await container.partner!.activity.recentFailureCount(connection.id, since);
        return {
          id: connection.id,
          organizationId: connection.organizationId,
          organizationLabel: orgLabels.get(connection.organizationId) ?? connection.organizationId,
          name: connection.name,
          kind: connection.kind,
          environment: connection.environment,
          status: connection.status,
          scopes: [...connection.scopes],
          activeKeyIds: active.map((key) => key.kid),
          keyExpiresAt: expiries[0]?.toISOString() ?? null,
          lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
          recentFailures,
          createdAt: connection.createdAt.toISOString(),
        };
      }),
    );
    res.json({
      items,
      ...(listed.nextCursor === undefined ? {} : { nextCursor: listed.nextCursor }),
      bootstrapEnabled: container.config.partnerBootstrap.enabled && !container.config.runtime.isProduction,
    });
  });

  const refuseProductionAdmin = (): void => {
    if (container.config.runtime.isProduction) {
      throw new ForbiddenError(
        'Partner credential administration is not available in production. Slice 4B adds authenticated human administrators.',
      );
    }
  };

  router.post('/operations/partners', partnerWrite, async (req, res) => {
    refuseProductionAdmin();
    if (container.partner === undefined) {
      throw new ForbiddenError('Partner administration requires real provider mode.');
    }
    const input = parseOrThrow(createPartnerConnectionRequestSchema, req.body ?? {});
    const organizationId =
      input.kind === PARTNER_CONNECTION_KINDS.TELECOM_EVENTS
        ? container.partner.telecomOrganizationId
        : container.partner.bankOrganizationId;
    const created = await container.partner.admin.createConnection(organizationId, input, 'operations-console');
    res.status(201).json(created);
  });

  router.post('/operations/partners/:connectionId/keys', rotateSecret, async (req, res) => {
    refuseProductionAdmin();
    if (container.partner === undefined) {
      throw new ForbiddenError('Partner administration requires real provider mode.');
    }
    const connection = await container.partner.connections.findByIdUnscoped((req.params['connectionId'] as string));
    if (connection === null) {
      throw new NotFoundError('partner connection', (req.params['connectionId'] as string));
    }
    const issued = await container.partner.admin.issueKey(connection.organizationId, connection.id);
    res.status(201).json(issued);
  });

  router.post('/operations/partners/:connectionId/keys/:kid/revoke', rotateSecret, async (req, res) => {
    refuseProductionAdmin();
    if (container.partner === undefined) {
      throw new ForbiddenError('Partner administration requires real provider mode.');
    }
    const connection = await container.partner.connections.findByIdUnscoped((req.params['connectionId'] as string));
    if (connection === null) {
      throw new NotFoundError('partner connection', (req.params['connectionId'] as string));
    }
    await container.partner.admin.revokeKey(connection.organizationId, connection.id, (req.params['kid'] as string));
    res.json({ revoked: true, correlationId: getCorrelationId() });
  });

  router.post('/operations/partners/:connectionId/revoke', partnerWrite, async (req, res) => {
    refuseProductionAdmin();
    if (container.partner === undefined) {
      throw new ForbiddenError('Partner administration requires real provider mode.');
    }
    const connection = await container.partner.connections.findByIdUnscoped((req.params['connectionId'] as string));
    if (connection === null) {
      throw new NotFoundError('partner connection', (req.params['connectionId'] as string));
    }
    await container.partner.admin.revokeConnection(connection.organizationId, connection.id);
    res.json({ revoked: true, correlationId: getCorrelationId() });
  });

  router.post('/operations/sandbox/signed-request', partnerWrite, async (req, res) => {
    refuseProductionAdmin();
    if (container.partner === undefined) {
      throw new ForbiddenError('The sandbox generator requires real provider mode.');
    }
    const input = parseOrThrow(sandboxSignedRequestSchema, req.body ?? {});
    const result = await container.partner.sandbox.run(input.kind);
    res.json(result);
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
    inputSummary: 'Awaiting activity',
    outputSummary: 'This stage populates as the decision engine processes a case',
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
        ? 'Version 1a · Slice 4A — secure partner API integration'
        : 'Version 1a · Slice 1 — visible synthetic journey',
    nextMilestone:
      container.providerMode === 'real'
        ? 'Slice 4B — human administrator authentication and organization RBAC'
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
      { name: 'Operations Console', state: 'IMPLEMENTED', detail: 'Overview, Live Events, Scam Cases, System Flow.' },
      { name: 'Persistence', state: container.providerMode === 'real' ? 'IMPLEMENTED' : 'SIMULATED', detail: container.providerMode === 'real' ? 'Prisma/PostgreSQL unit of work, audit, outbox, read models.' : 'In-memory store; Postgres read models arrive in Slice 2.' },
      { name: 'Telecom risk signals', state: 'SIMULATED', detail: 'Synthetic; real feeds are a later version.' },
      { name: 'Business outcomes', state: 'SIMULATED', detail: 'No bank feedback loop yet; outcome counters are synthetic.' },
      {
        name: 'Durable delivery (Redis/BullMQ)',
        state: container.providerMode === 'real' ? 'IMPLEMENTED' : 'PLANNED',
        detail:
          container.providerMode === 'real'
            ? 'Outbox publisher → BullMQ → idempotent worker (at-least-once).'
            : 'Slice 3; requires real provider mode.',
      },
      { name: 'Partner auth + signatures', state: container.providerMode === 'real' ? 'IMPLEMENTED' : 'PLANNED', detail: container.providerMode === 'real' ? 'ES256 request signing, nonce replay protection, HTTP idempotency, Redis rate limits, sandbox credential bootstrap.' : 'Requires real provider mode (Slice 4A).' },
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
