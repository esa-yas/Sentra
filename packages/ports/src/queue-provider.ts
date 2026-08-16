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

/**
 * Read-only inspection surface for the operations console. Kept separate from
 * {@link QueueProvider} so a producer or worker never depends on the monitoring shape, and
 * so a transport that cannot introspect (a future Pub/Sub) is not forced to implement it.
 *
 * A single retry action is included because it is the one mutation the console needs. It is
 * intentionally the only mutation here.
 */
export type QueueJobLifecycle =
  | 'waiting'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'unknown';

export interface RawQueueJobCounts {
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly completed: number;
  readonly failed: number;
}

export interface RawQueueHealth {
  readonly name: string;
  readonly reachable: boolean;
  readonly paused: boolean;
  readonly counts: RawQueueJobCounts;
}

export interface RawQueueJob {
  readonly id: string;
  readonly queue: string;
  readonly name: string;
  readonly data: unknown;
  readonly state: QueueJobLifecycle;
  readonly attemptsMade: number;
  readonly maxAttempts: number;
  readonly createdAtMs: number | null;
  readonly processedOnMs: number | null;
  readonly finishedOnMs: number | null;
  readonly delayUntilMs: number | null;
  readonly failedReason: string | null;
}

export interface QueueInspector {
  /** True when the underlying transport is reachable. */
  isReachable(): Promise<boolean>;
  /** Number of worker connections currently registered on a queue, for a live worker signal. */
  countWorkers(queueName: string): Promise<number>;
  getQueueHealth(queueName: string): Promise<RawQueueHealth>;
  listJobs(
    queueName: string,
    filter: { readonly state?: QueueJobLifecycle; readonly offset: number; readonly limit: number },
  ): Promise<readonly RawQueueJob[]>;
  getJob(queueName: string, jobId: string): Promise<RawQueueJob | null>;
  /** Requeues a failed job. Returns false when the job is not in a retryable state. */
  retryJob(queueName: string, jobId: string): Promise<boolean>;
}
