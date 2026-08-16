import {
  JOB_NAMES,
  QUEUE_NAMES,
  RECOMMENDATION_ISSUED_EVENT_TYPE,
  findForbiddenFields,
  recommendationIssuedJobSchema,
  type QueueName,
  type RecommendationIssuedJob,
} from '@sentra/contracts';
import type { Logger } from '@sentra/observability';
import type { Clock, IdGenerator, OutboxEventRecord, OutboxRepository, QueueProvider } from '@sentra/ports';

/**
 * Drains the transactional outbox into the durable queue.
 *
 * The boundary the whole pattern exists to protect: the evaluate transaction only ever
 * commits a PENDING outbox row alongside its recommendation. This publisher — a separate
 * lifecycle — then claims committed rows and publishes them. A rolled-back transaction
 * leaves no row, so it produces no job.
 *
 * Delivery is at-least-once. Two crash windows are handled explicitly:
 *   * Crash after claim, before publish: the row stays PUBLISHING and is reclaimed once its
 *     claim lease expires ({@link OutboxPublisherOptions.claimTimeoutMs}).
 *   * Crash after publish, before the DB records it: the row is reclaimed and republished, but
 *     enqueueing is idempotent because the job id is the stable outbox event id, so BullMQ
 *     returns the existing job rather than creating a second one. The worker's inbox makes any
 *     residual duplicate a no-op.
 *
 * There is deliberately no distributed transaction between PostgreSQL and Redis (slide 045).
 */
export interface OutboxPublisherOptions {
  readonly outbox: OutboxRepository;
  readonly queue: QueueProvider;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly claimTimeoutMs: number;
  /** Base retry delay; grows exponentially with the attempt count. */
  readonly retryInitialDelayMs: number;
  readonly retryMaxDelayMs?: number;
}

/** Raised for a payload that can never succeed, so the row is dead-lettered rather than retried. */
class PoisonEventError extends Error {}

interface QueueRoute {
  readonly queueName: QueueName;
  readonly jobName: string;
}

export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private draining = false;

  public constructor(private readonly options: OutboxPublisherOptions) {}

  /** Starts the poll loop. Idempotent. */
  public start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.pollIntervalMs);
    // Do not keep the process alive solely for polling.
    this.timer.unref?.();
    void this.tick();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Let an in-flight drain finish so a claimed row is not abandoned mid-publish.
    while (this.draining) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async tick(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.options.logger.error('outbox_publisher_tick_failed', {
        error: error instanceof Error ? error.message : 'unknown error',
      });
    } finally {
      this.draining = false;
    }
  }

  /** Claims and publishes one batch. Returns the number of rows published. Exposed for tests. */
  public async runOnce(): Promise<number> {
    const now = this.options.clock.now();
    const claimed = await this.options.outbox.claimBatch({
      limit: this.options.batchSize,
      claimToken: this.options.ids.generate(),
      now,
      reclaimBefore: new Date(now.getTime() - this.options.claimTimeoutMs),
    });

    let published = 0;
    for (const event of claimed) {
      const outcome = await this.publishOne(event);
      if (outcome === 'published') {
        published += 1;
      }
    }
    return published;
  }

  private async publishOne(event: OutboxEventRecord): Promise<'published' | 'failed' | 'dead'> {
    try {
      const route = this.routeFor(event.eventType);
      const job = this.buildJob(event);
      const forbidden = findForbiddenFields(job.payload);
      if (forbidden.length > 0) {
        // A forbidden field can never be published safely — dead-letter rather than retry.
        throw new PoisonEventError(`Payload carries forbidden field(s): ${forbidden.join(', ')}.`);
      }

      await this.options.queue.enqueue(route.queueName, route.jobName, job, {
        // Stable logical job id → idempotent republish.
        deduplicationId: event.id,
        maxAttempts: event.maxAttempts,
      });

      await this.options.outbox.markPublished(event.id, this.options.clock.now());
      this.options.logger.info('outbox_event_published', {
        eventId: event.id,
        eventType: event.eventType,
        queue: route.queueName,
        correlationId: event.correlationId,
      });
      return 'published';
    } catch (error) {
      return this.handlePublishFailure(event, error);
    }
  }

  private async handlePublishFailure(
    event: OutboxEventRecord,
    error: unknown,
  ): Promise<'failed' | 'dead'> {
    const message = error instanceof Error ? error.message : 'unknown publish error';
    const attemptsAfter = event.attempts + 1;
    const poison = error instanceof PoisonEventError;

    if (poison || attemptsAfter >= event.maxAttempts) {
      await this.options.outbox.markDeadLettered(event.id, truncateError(message));
      this.options.logger.warn('outbox_event_dead_lettered', {
        eventId: event.id,
        eventType: event.eventType,
        correlationId: event.correlationId,
        reason: poison ? 'poison' : 'attempts_exhausted',
      });
      return 'dead';
    }

    const backoffMs = this.backoffFor(attemptsAfter);
    await this.options.outbox.markFailed({
      id: event.id,
      error: truncateError(message),
      availableAt: new Date(this.options.clock.now().getTime() + backoffMs),
    });
    this.options.logger.warn('outbox_event_publish_retry', {
      eventId: event.id,
      eventType: event.eventType,
      correlationId: event.correlationId,
      attempt: attemptsAfter,
      retryInMs: backoffMs,
    });
    return 'failed';
  }

  private backoffFor(attempt: number): number {
    const base = this.options.retryInitialDelayMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(base, this.options.retryMaxDelayMs ?? 60_000);
  }

  private routeFor(eventType: string): QueueRoute {
    if (eventType === RECOMMENDATION_ISSUED_EVENT_TYPE) {
      return { queueName: QUEUE_NAMES.RECOMMENDATION_EVENTS, jobName: JOB_NAMES.PUBLISH_RECOMMENDATION };
    }
    // An event type with no route can never be delivered — treat it as poison rather than
    // retrying it forever.
    throw new PoisonEventError(`No queue route for event type "${eventType}".`);
  }

  private buildJob(event: OutboxEventRecord): RecommendationIssuedJob {
    const candidate = {
      eventId: event.id,
      eventType: RECOMMENDATION_ISSUED_EVENT_TYPE,
      schemaVersion: event.schemaVersion,
      organizationId: event.organizationId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      occurredAt: event.createdAt.toISOString(),
      payload: event.payload,
    };
    const parsed = recommendationIssuedJobSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new PoisonEventError(`Invalid recommendation.issued payload: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}

const truncateError = (message: string): string => (message.length > 500 ? `${message.slice(0, 500)}…` : message);

export const createOutboxPublisher = (options: OutboxPublisherOptions): OutboxPublisher =>
  new OutboxPublisher(options);
