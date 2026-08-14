/**
 * Background work transport.
 *
 * BullMQ implements this today and Google Cloud Pub/Sub is expected to replace it
 * (slide 056). The interface is deliberately narrow — enqueue, schedule, consume — because
 * everything richer that BullMQ offers would not survive the move.
 *
 * Delivery semantics (Version 1a):
 *   * At-least-once delivery. Consumers must tolerate duplicates and out-of-order arrival.
 *   * A message becomes visible when `now >= availableAt`, where `availableAt = enqueuedAt + delayMs`.
 *     Visibility is inclusive at the exact `availableAt` instant.
 *   * Handler failures retry until `maxAttempts` is exhausted; there is no exactly-once effect.
 *   * The queue never holds business truth (slide 045).
 */

export interface QueueMessage<TPayload = unknown> {
  /** Stable identifier used for consumer-side deduplication. */
  readonly id: string;
  readonly name: string;
  readonly payload: TPayload;
  readonly attempt: number;
  readonly enqueuedAt: Date;
}

export interface EnqueueOptions {
  /** Delay before the message becomes visible. */
  readonly delayMs?: number;
  /**
   * Deduplication key. Where the transport supports it, an in-flight message with the same
   * key is not enqueued twice. Never relied upon for correctness — the outbox and the inbox
   * provide that.
   */
  readonly deduplicationId?: string;
  readonly maxAttempts?: number;
  readonly priority?: number;
}

export interface QueueConsumerOptions {
  /** Messages processed concurrently by one worker. */
  readonly concurrency?: number;
  /**
   * Optional throughput hint to a transport that supports local throttling.
   *
   * Version 1a does not guarantee enforcement across implementations. Correctness must
   * never depend on this value; it exists only as an adapter hint for protecting a
   * downstream dependency when supported.
   */
  readonly ratePerSecond?: number;
}

export type QueueHandler<TPayload = unknown> = (message: QueueMessage<TPayload>) => Promise<void>;

export interface QueueProvider {
  /** Publishes one message. Resolves once the transport has accepted it. */
  enqueue<TPayload>(
    queueName: string,
    jobName: string,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<{ id: string }>;

  /**
   * Registers a repeating job. Used for the retention sweep; the schedule lives with the
   * transport rather than in an external scheduler, so one deployment carries both.
   */
  schedule<TPayload>(
    queueName: string,
    jobName: string,
    cronExpression: string,
    payload: TPayload,
  ): Promise<void>;

  /** Starts consuming. Returns a handle that stops the consumer for graceful shutdown. */
  consume<TPayload>(
    queueName: string,
    handler: QueueHandler<TPayload>,
    options?: QueueConsumerOptions,
  ): Promise<QueueConsumerHandle>;

  /** Releases transport connections. */
  close(): Promise<void>;
}

export interface QueueConsumerHandle {
  /** Stops accepting new messages and waits for in-flight work to finish. */
  stop(): Promise<void>;
}
