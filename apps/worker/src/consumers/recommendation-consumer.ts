import {
  EVENT_SEVERITIES,
  EVENT_STATUSES,
  OPERATIONAL_EVENT_TYPES,
  RECOMMENDATION_ISSUED_EVENT_TYPE,
  recommendationIssuedJobSchema,
} from '@sentra/contracts';
import type { Logger } from '@sentra/observability';
import type {
  Clock,
  IdGenerator,
  InboxRepository,
  OperationalEventWriter,
  QueueMessage,
  UnitOfWork,
} from '@sentra/ports';

/**
 * Idempotent consumer for `recommendation.issued`.
 *
 * The required sequence (slide 034): register the event id for this consumer, and only if it
 * is new perform the side effect and mark it processed — all inside one transaction, which is
 * committed before the queue is acknowledged. A duplicate delivery therefore finds the inbox
 * row already present and acknowledges without repeating the effect.
 *
 * The side effect is deliberately internal and synthetic: it records a durable operational
 * "delivery" event. Slice 3 never contacts a real customer, bank, telecom, or notification
 * provider.
 */
const SUPPORTED_SCHEMA_VERSIONS = new Set<number>([1]);
const INBOX_SOURCE = 'worker.recommendation-events';
/** Inbox rows are safe to expire after this window; the queue no longer holds the job by then. */
const INBOX_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export interface RecommendationConsumerDeps {
  readonly unitOfWork: UnitOfWork;
  readonly inbox: InboxRepository;
  readonly operationalEvents: OperationalEventWriter;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export type ConsumeOutcome = 'processed' | 'duplicate' | 'rejected';

export class RecommendationIssuedConsumer {
  public constructor(private readonly deps: RecommendationConsumerDeps) {}

  /** QueueHandler-compatible entry point. Throws only on retryable infrastructure failures. */
  public readonly handle = async (message: QueueMessage): Promise<void> => {
    await this.process(message);
  };

  public async process(message: QueueMessage): Promise<ConsumeOutcome> {
    const parsed = recommendationIssuedJobSchema.safeParse(message.payload);
    if (!parsed.success) {
      // A malformed payload can never succeed. Do not retry a poison message; acknowledge it.
      this.deps.logger.warn('recommendation_consumer_rejected', {
        jobId: message.id,
        reason: 'invalid_payload',
        attempt: message.attempt,
      });
      return 'rejected';
    }

    const job = parsed.data;
    if (!SUPPORTED_SCHEMA_VERSIONS.has(job.schemaVersion)) {
      this.deps.logger.warn('recommendation_consumer_rejected', {
        jobId: message.id,
        eventId: job.eventId,
        reason: 'unsupported_version',
        schemaVersion: job.schemaVersion,
        correlationId: job.correlationId,
      });
      return 'rejected';
    }

    // The transaction registers the inbox row and performs the side effect together. A
    // failure here (for example the database being unavailable) throws, so the queue retries.
    const outcome = await this.deps.unitOfWork.run<ConsumeOutcome>(async (scope) => {
      const fresh = await this.deps.inbox.tryRecord(
        {
          id: this.deps.ids.generate(),
          source: INBOX_SOURCE,
          externalId: job.eventId,
          eventType: RECOMMENDATION_ISSUED_EVENT_TYPE,
          correlationId: job.correlationId,
          expiresAt: new Date(this.deps.clock.now().getTime() + INBOX_TTL_MS),
        },
        scope,
      );

      if (!fresh) {
        return 'duplicate';
      }

      const recommendedAction =
        typeof job.payload['recommendedAction'] === 'string'
          ? (job.payload['recommendedAction'] as string)
          : 'UNKNOWN';

      await this.deps.operationalEvents.record(
        {
          id: this.deps.ids.generate(),
          organizationId: job.organizationId,
          type: OPERATIONAL_EVENT_TYPES.NOTIFICATION,
          severity: EVENT_SEVERITIES.INFO,
          status: EVENT_STATUSES.COMPLETED,
          actor: 'worker',
          subjectRef: null,
          provider: 'worker.recommendation-events',
          attempt: message.attempt,
          durationMs: null,
          synthetic: true,
          payloadPreview: {
            deliveredEventId: job.eventId,
            recommendedAction,
            note: 'Synthetic durable delivery recorded by the Slice 3 worker.',
          },
          correlationId: job.correlationId,
          occurredAt: this.deps.clock.now(),
        },
        scope,
      );

      return 'processed';
    });

    this.deps.logger.info('recommendation_consumer_handled', {
      jobId: message.id,
      eventId: job.eventId,
      correlationId: job.correlationId,
      attempt: message.attempt,
      outcome,
    });
    return outcome;
  }
}

export const createRecommendationIssuedConsumer = (
  deps: RecommendationConsumerDeps,
): RecommendationIssuedConsumer => new RecommendationIssuedConsumer(deps);
