import type { AppConfig } from '@sentra/config';
import {
  KNOWN_QUEUE_NAMES,
  PROVIDER_HEALTH_STATES,
  QUEUE_NAMES,
  RECOMMENDATION_ISSUED_EVENT_TYPE,
  isKnownQueueName,
  recommendationIssuedJobSchema,
  type OutboxEventView,
  type OutboxList,
  type OutboxListQuery,
  type ProviderHealth,
  type QueueActionResult,
  type QueueHealth,
  type QueueJobList,
  type QueueJobListQuery,
  type QueueJobView,
  type QueueMonitorSummary,
} from '@sentra/contracts';
import { redact } from '@sentra/observability';
import type {
  Clock,
  OutboxEventRecord,
  QueueInspector,
  QueueOutboxReadModel,
  QueueProvider,
  RawQueueJob,
} from '@sentra/ports';
import type { RedisCacheProvider } from '@sentra/adapters';

/**
 * Orchestrates the Queue Monitor read models and the development-only queue actions.
 *
 * Raw BullMQ jobs and outbox rows are mapped into dedicated, redacted projections here — a
 * raw queue payload never reaches the console. When durable delivery is not wired (in-memory
 * mode) every read returns a `NOT_CONFIGURED` shape and every mutation is refused, so the UI
 * degrades cleanly rather than erroring.
 */
export interface QueueAdminDeps {
  readonly config: AppConfig;
  readonly providerMode: 'in-memory' | 'real';
  readonly clock: Clock;
  readonly cache?: RedisCacheProvider;
  readonly queue?: QueueProvider & QueueInspector;
  readonly outboxStore?: QueueOutboxReadModel;
}

const truncate = (value: string, max = 300): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

/** Errors the routes translate into a 4xx rather than a 500. */
export class QueueActionRejected extends Error {}

export class QueueAdmin {
  private readonly enabled: boolean;

  public constructor(private readonly deps: QueueAdminDeps) {
    this.enabled =
      deps.providerMode === 'real' &&
      deps.cache !== undefined &&
      deps.queue !== undefined &&
      deps.outboxStore !== undefined;
  }

  private notConfigured(name: string, kind: ProviderHealth['kind'], detail: string): ProviderHealth {
    return {
      name,
      kind,
      state: PROVIDER_HEALTH_STATES.NOT_CONFIGURED,
      implementation: detail,
      lastSuccessAt: null,
      lastFailureAt: null,
      latencyMs: null,
    };
  }

  /** Provider-health rows for the integrations screen and the monitor header. */
  public async providerHealth(): Promise<{
    redis: ProviderHealth;
    queueTransport: ProviderHealth;
    worker: ProviderHealth;
    publisher: ProviderHealth;
  }> {
    if (!this.enabled || this.deps.cache === undefined || this.deps.queue === undefined) {
      return {
        redis: this.notConfigured('Redis', 'CACHE', 'not wired (in-memory mode)'),
        queueTransport: this.notConfigured('BullMQ', 'QUEUE', 'not wired (in-memory mode)'),
        worker: this.notConfigured('Worker', 'QUEUE', 'not wired (in-memory mode)'),
        publisher: this.notConfigured('Outbox publisher', 'QUEUE', 'not wired (in-memory mode)'),
      };
    }

    const nowIso = this.deps.clock.now().toISOString();
    const redisHealth = this.deps.cache.health();
    const redisState = redisHealth.state;

    const queueReachable = await this.deps.queue.isReachable();
    const workerCount = queueReachable
      ? await this.deps.queue.countWorkers(QUEUE_NAMES.RECOMMENDATION_EVENTS)
      : 0;

    const queueState = queueReachable
      ? PROVIDER_HEALTH_STATES.CONNECTED
      : PROVIDER_HEALTH_STATES.UNAVAILABLE;

    const workerState = !queueReachable
      ? PROVIDER_HEALTH_STATES.UNAVAILABLE
      : workerCount > 0
        ? PROVIDER_HEALTH_STATES.CONNECTED
        : PROVIDER_HEALTH_STATES.DEGRADED;

    // The publisher ships inside the worker process for the MVP, so it shares the worker's
    // observable state when co-located.
    const publisherState = this.deps.config.queue.runPublisherInWorker
      ? workerState
      : PROVIDER_HEALTH_STATES.DEGRADED;

    return {
      redis: {
        name: 'Redis',
        kind: 'CACHE',
        state: redisState,
        implementation: `ioredis (${redisHealth.detail})`,
        lastSuccessAt: redisState === PROVIDER_HEALTH_STATES.CONNECTED ? nowIso : null,
        lastFailureAt: redisState === PROVIDER_HEALTH_STATES.CONNECTED ? null : nowIso,
        latencyMs: redisState === PROVIDER_HEALTH_STATES.CONNECTED ? 1 : null,
      },
      queueTransport: {
        name: 'BullMQ',
        kind: 'QUEUE',
        state: queueState,
        implementation: 'BullMQ over Redis',
        lastSuccessAt: queueReachable ? nowIso : null,
        lastFailureAt: queueReachable ? null : nowIso,
        latencyMs: queueReachable ? 1 : null,
      },
      worker: {
        name: 'Worker',
        kind: 'QUEUE',
        state: workerState,
        implementation:
          workerCount > 0 ? `${workerCount} consumer connection(s)` : 'no consumer connected',
        lastSuccessAt: workerState === PROVIDER_HEALTH_STATES.CONNECTED ? nowIso : null,
        lastFailureAt: workerState === PROVIDER_HEALTH_STATES.CONNECTED ? null : nowIso,
        latencyMs: null,
      },
      publisher: {
        name: 'Outbox publisher',
        kind: 'QUEUE',
        state: publisherState,
        implementation: this.deps.config.queue.runPublisherInWorker
          ? 'in-process with worker'
          : 'separate process',
        lastSuccessAt: publisherState === PROVIDER_HEALTH_STATES.CONNECTED ? nowIso : null,
        lastFailureAt: publisherState === PROVIDER_HEALTH_STATES.CONNECTED ? null : nowIso,
        latencyMs: null,
      },
    };
  }

  public async monitorSummary(): Promise<QueueMonitorSummary> {
    const health = await this.providerHealth();
    const generatedAt = this.deps.clock.now().toISOString();

    if (!this.enabled || this.deps.queue === undefined || this.deps.outboxStore === undefined) {
      return {
        generatedAt,
        redis: health.redis,
        queueTransport: health.queueTransport,
        worker: health.worker,
        publisher: health.publisher,
        outbox: {
          origin: 'MEASURED',
          pending: 0,
          publishing: 0,
          published: 0,
          failed: 0,
          deadLetter: 0,
          oldestPendingAgeMs: null,
        },
        queues: [],
      };
    }

    const counts = await this.deps.outboxStore.statusCounts();
    const oldestPendingAgeMs = await this.deps.outboxStore.oldestPendingAgeMs(this.deps.clock.now());

    const queues: QueueHealth[] = [];
    for (const name of KNOWN_QUEUE_NAMES) {
      const raw = await this.deps.queue.getQueueHealth(name);
      queues.push({
        name,
        state: raw.reachable ? PROVIDER_HEALTH_STATES.CONNECTED : PROVIDER_HEALTH_STATES.UNAVAILABLE,
        paused: raw.paused,
        counts: raw.counts,
      });
    }

    return {
      generatedAt,
      redis: health.redis,
      queueTransport: health.queueTransport,
      worker: health.worker,
      publisher: health.publisher,
      outbox: {
        origin: 'MEASURED',
        pending: counts.pending,
        publishing: counts.publishing,
        published: counts.published,
        failed: counts.failed,
        deadLetter: counts.deadLetter,
        oldestPendingAgeMs,
      },
      queues,
    };
  }

  public async queueHealth(queueName: string): Promise<QueueHealth> {
    this.assertKnownQueue(queueName);
    if (!this.enabled || this.deps.queue === undefined) {
      return {
        name: queueName,
        state: PROVIDER_HEALTH_STATES.NOT_CONFIGURED,
        paused: false,
        counts: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
      };
    }
    const raw = await this.deps.queue.getQueueHealth(queueName);
    return {
      name: queueName,
      state: raw.reachable ? PROVIDER_HEALTH_STATES.CONNECTED : PROVIDER_HEALTH_STATES.UNAVAILABLE,
      paused: raw.paused,
      counts: raw.counts,
    };
  }

  public async listJobs(queueName: string, query: QueueJobListQuery): Promise<QueueJobList> {
    this.assertKnownQueue(queueName);
    if (!this.enabled || this.deps.queue === undefined || this.deps.outboxStore === undefined) {
      return { items: [] };
    }

    const offset = query.cursor === undefined ? 0 : Math.max(0, Number.parseInt(query.cursor, 10) || 0);
    const raw = await this.deps.queue.listJobs(queueName, {
      ...(query.state === undefined ? {} : { state: query.state }),
      offset,
      limit: query.limit,
    });

    const orgIds = raw
      .map((job) => this.readEnvelope(job.data).organizationId)
      .filter((id): id is string => typeof id === 'string');
    const labels = await this.deps.outboxStore.organizationLabels(orgIds);

    let items = raw.map((job) => this.toJobView(job, labels));
    if (query.eventType !== undefined) {
      items = items.filter((item) => item.eventType === query.eventType);
    }
    if (query.correlationId !== undefined) {
      items = items.filter((item) => item.correlationId === query.correlationId);
    }

    const result: QueueJobList = { items };
    if (raw.length === query.limit) {
      return { ...result, nextCursor: String(offset + query.limit) };
    }
    return result;
  }

  public async listOutbox(query: OutboxListQuery): Promise<OutboxList> {
    if (!this.enabled || this.deps.outboxStore === undefined) {
      return { items: [] };
    }

    const page = await this.deps.outboxStore.listOutbox(
      {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.eventType === undefined ? {} : { eventType: query.eventType }),
        ...(query.correlationId === undefined ? {} : { correlationId: query.correlationId }),
        ...(query.occurredAfter === undefined ? {} : { createdAfter: new Date(query.occurredAfter) }),
        ...(query.occurredBefore === undefined ? {} : { createdBefore: new Date(query.occurredBefore) }),
      },
      { limit: query.limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) },
    );

    const orgIds = page.items
      .map((record) => record.organizationId)
      .filter((id): id is string => id !== null);
    const labels = await this.deps.outboxStore.organizationLabels(orgIds);

    const result: OutboxList = { items: page.items.map((record) => this.toOutboxView(record, labels)) };
    if (page.nextCursor !== undefined) {
      return { ...result, nextCursor: page.nextCursor };
    }
    return result;
  }

  public async getOutbox(eventId: string): Promise<OutboxEventView | null> {
    if (!this.enabled || this.deps.outboxStore === undefined) {
      return null;
    }
    const record = await this.deps.outboxStore.getOutbox(eventId);
    if (record === null) {
      return null;
    }
    const labels =
      record.organizationId === null
        ? new Map<string, string>()
        : await this.deps.outboxStore.organizationLabels([record.organizationId]);
    return this.toOutboxView(record, labels);
  }

  // -------------------------------------------------------------------------
  // Development-only actions
  // -------------------------------------------------------------------------

  private assertActionsAllowed(): void {
    if (this.deps.config.runtime.isProduction) {
      throw new QueueActionRejected('Queue actions are disabled in production.');
    }
    if (!this.enabled) {
      throw new QueueActionRejected('Durable delivery is not configured in this mode.');
    }
  }

  public async retryJob(queueName: string, jobId: string, correlationId: string): Promise<QueueActionResult> {
    this.assertKnownQueue(queueName);
    this.assertActionsAllowed();
    const retried = await this.deps.queue!.retryJob(queueName, jobId);
    return {
      action: 'RETRY_JOB',
      accepted: retried,
      detail: retried ? `Job ${jobId} requeued.` : `Job ${jobId} is not in a retryable (failed) state.`,
      correlationId,
    };
  }

  public async replayOutbox(eventId: string, correlationId: string): Promise<QueueActionResult> {
    this.assertActionsAllowed();
    const record = await this.deps.outboxStore!.resetToPending(eventId, this.deps.clock.now());
    return {
      action: 'REPLAY_OUTBOX',
      accepted: record !== null,
      detail:
        record === null
          ? `Outbox event ${eventId} not found.`
          : `Outbox event ${eventId} reset to PENDING; the publisher will re-claim it.`,
      correlationId,
    };
  }

  /**
   * Enqueues a second copy of a committed synthetic event under a fresh transport id, so the
   * worker receives it twice. The inbox makes the duplicate a no-op — proving idempotency.
   */
  public async duplicateDelivery(eventId: string, correlationId: string): Promise<QueueActionResult> {
    this.assertActionsAllowed();
    const record = await this.deps.outboxStore!.getOutbox(eventId);
    if (record === null) {
      return {
        action: 'DUPLICATE_DELIVERY',
        accepted: false,
        detail: `Outbox event ${eventId} not found.`,
        correlationId,
      };
    }
    if (record.eventType !== RECOMMENDATION_ISSUED_EVENT_TYPE) {
      return {
        action: 'DUPLICATE_DELIVERY',
        accepted: false,
        detail: `Event ${eventId} is not a routable recommendation event.`,
        correlationId,
      };
    }

    const job = recommendationIssuedJobSchema.parse({
      eventId: record.id,
      eventType: RECOMMENDATION_ISSUED_EVENT_TYPE,
      schemaVersion: record.schemaVersion,
      organizationId: record.organizationId,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      correlationId: record.correlationId,
      occurredAt: record.createdAt.toISOString(),
      payload: record.payload,
    });

    await this.deps.queue!.enqueue(QUEUE_NAMES.RECOMMENDATION_EVENTS, 'recommendation.issued.publish', job, {
      // A distinct transport id forces a genuinely separate delivery of the same logical event.
      deduplicationId: `${record.id}:dup:${this.deps.clock.now().getTime()}`,
    });

    return {
      action: 'DUPLICATE_DELIVERY',
      accepted: true,
      detail: `A duplicate delivery of ${eventId} was enqueued; only one side effect should result.`,
      correlationId,
    };
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private assertKnownQueue(queueName: string): void {
    if (!isKnownQueueName(queueName)) {
      throw new QueueActionRejected(`Unknown queue "${queueName}".`);
    }
  }

  private readEnvelope(data: unknown): {
    eventId: string | null;
    eventType: string | null;
    schemaVersion: number | null;
    correlationId: string | null;
    organizationId: string | null;
    payload: Record<string, unknown>;
  } {
    const parsed = recommendationIssuedJobSchema.safeParse(data);
    if (parsed.success) {
      return {
        eventId: parsed.data.eventId,
        eventType: parsed.data.eventType,
        schemaVersion: parsed.data.schemaVersion,
        correlationId: parsed.data.correlationId,
        organizationId: parsed.data.organizationId,
        payload: parsed.data.payload,
      };
    }
    return {
      eventId: null,
      eventType: null,
      schemaVersion: null,
      correlationId: null,
      organizationId: null,
      payload: {},
    };
  }

  private toJobView(job: RawQueueJob, labels: ReadonlyMap<string, string>): QueueJobView {
    const envelope = this.readEnvelope(job.data);
    return {
      id: job.id,
      queue: job.queue,
      name: job.name,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      eventVersion: envelope.schemaVersion,
      organizationLabel:
        envelope.organizationId === null ? null : labels.get(envelope.organizationId) ?? envelope.organizationId,
      correlationId: envelope.correlationId,
      state: job.state,
      attempts: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAtMs === null ? null : new Date(job.createdAtMs).toISOString(),
      availableAt: job.delayUntilMs === null ? null : new Date(job.delayUntilMs).toISOString(),
      finishedAt: job.finishedOnMs === null ? null : new Date(job.finishedOnMs).toISOString(),
      errorSummary: job.failedReason === null ? null : truncate(job.failedReason),
      synthetic: true,
      payloadPreview: redact(envelope.payload) as Record<string, unknown>,
    };
  }

  private toOutboxView(record: OutboxEventRecord, labels: ReadonlyMap<string, string>): OutboxEventView {
    return {
      eventId: record.id,
      eventType: record.eventType,
      schemaVersion: record.schemaVersion,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      queue: record.eventType === RECOMMENDATION_ISSUED_EVENT_TYPE ? QUEUE_NAMES.RECOMMENDATION_EVENTS : null,
      organizationLabel:
        record.organizationId === null ? null : labels.get(record.organizationId) ?? record.organizationId,
      correlationId: record.correlationId,
      status: record.status,
      attempts: record.attempts,
      maxAttempts: record.maxAttempts,
      createdAt: record.createdAt.toISOString(),
      availableAt: record.availableAt.toISOString(),
      claimedAt: record.claimedAt === null ? null : record.claimedAt.toISOString(),
      publishedAt: record.publishedAt === null ? null : record.publishedAt.toISOString(),
      errorSummary: record.lastError === null ? null : truncate(record.lastError),
      synthetic: true,
      payloadPreview: redact(record.payload) as Record<string, unknown>,
    };
  }
}

export const createQueueAdmin = (deps: QueueAdminDeps): QueueAdmin => new QueueAdmin(deps);
