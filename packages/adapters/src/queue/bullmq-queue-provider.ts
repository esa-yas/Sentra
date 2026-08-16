import type { AppConfig } from '@sentra/config';
import type {
  EnqueueOptions,
  QueueConsumerHandle,
  QueueConsumerOptions,
  QueueHandler,
  QueueInspector,
  QueueJobLifecycle,
  QueueMessage,
  QueueProvider,
  RawQueueHealth,
  RawQueueJob,
} from '@sentra/ports';
import { isKnownQueueName } from '@sentra/contracts';
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { createRedisConnection } from '../redis/redis-connection';

/**
 * BullMQ-backed {@link QueueProvider} and {@link QueueInspector}.
 *
 * Delivery is at-least-once (slide 056): consumers must tolerate duplicates and the outbox,
 * not the queue, remains the authoritative record (slide 045). The interface is deliberately
 * the narrow port shape so a later move to Google Cloud Pub/Sub does not require touching
 * business code.
 *
 * Mapping notes versus the in-memory fake used by the shared contract suite:
 *   * `deduplicationId` maps to BullMQ's `jobId`. Adding a job with an existing id returns the
 *     existing job rather than creating a second transport record — the same guarantee the
 *     fake models, achieved through BullMQ's native de-duplication.
 *   * Retry/backoff are real BullMQ attempt semantics, so there is no `configureFailure` or
 *     `flush` hook: those are fake-only test controls that a real broker cannot expose. The
 *     business guarantees (attempt progression, backoff, duplicate tolerance) are proven by
 *     dedicated integration tests instead.
 */
export class BullmqQueueProvider implements QueueProvider, QueueInspector {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  /** Lazily created shared connections, closed on shutdown. */
  private readonly connections: Redis[] = [];

  public constructor(private readonly config: AppConfig) {}

  private producerConnection(): Redis {
    const connection = createRedisConnection(this.config, 'queue-client');
    this.connections.push(connection);
    return connection;
  }

  private getQueue(queueName: string): Queue {
    this.assertKnownQueue(queueName);
    let queue = this.queues.get(queueName);
    if (queue === undefined) {
      queue = new Queue(queueName, {
        connection: this.producerConnection(),
        prefix: this.config.queue.prefix,
      });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  /** Guards against a queue name derived from untrusted input reaching the transport. */
  private assertKnownQueue(queueName: string): void {
    if (!isKnownQueueName(queueName)) {
      throw new Error(`Unknown queue "${queueName}". Only the fixed queue catalog is allowed.`);
    }
  }

  public async enqueue<TPayload>(
    queueName: string,
    jobName: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<{ id: string }> {
    const queue = this.getQueue(queueName);

    const jobOptions: JobsOptions = {
      attempts: options.maxAttempts ?? this.config.queue.retry.maxAttempts,
      backoff: {
        type: this.config.queue.retry.backoff,
        delay: this.config.queue.retry.initialDelayMs,
      },
      removeOnComplete: { age: this.config.queue.completedJobRetentionSeconds },
      removeOnFail: { age: this.config.queue.failedJobRetentionSeconds },
    };
    if (options.delayMs !== undefined) {
      jobOptions.delay = options.delayMs;
    }
    if (options.priority !== undefined) {
      jobOptions.priority = options.priority;
    }
    // A stable job id makes enqueueing idempotent: republishing the same outbox event (after a
    // crash between transport-accept and DB-record) does not create a second job.
    if (options.deduplicationId !== undefined) {
      jobOptions.jobId = options.deduplicationId;
    }

    const job = await queue.add(jobName, payload, jobOptions);
    if (job.id === undefined) {
      throw new Error('BullMQ did not return a job id.');
    }
    return { id: job.id };
  }

  public async schedule<TPayload>(
    queueName: string,
    jobName: string,
    cronExpression: string,
    payload: TPayload,
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.add(jobName, payload, {
      repeat: { pattern: cronExpression },
      removeOnComplete: { age: this.config.queue.completedJobRetentionSeconds },
      removeOnFail: { age: this.config.queue.failedJobRetentionSeconds },
    });
  }

  public async consume<TPayload>(
    queueName: string,
    handler: QueueHandler<TPayload>,
    options: QueueConsumerOptions = {},
  ): Promise<QueueConsumerHandle> {
    this.assertKnownQueue(queueName);
    const connection = createRedisConnection(this.config, 'queue-worker');
    this.connections.push(connection);

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const message: QueueMessage<TPayload> = {
          id: job.id ?? job.name,
          name: job.name,
          payload: job.data as TPayload,
          attempt: job.attemptsMade + 1,
          enqueuedAt: new Date(job.timestamp),
        };
        await handler(message);
      },
      {
        connection,
        prefix: this.config.queue.prefix,
        concurrency: options.concurrency ?? this.config.queue.workerConcurrency,
        ...(options.ratePerSecond === undefined
          ? {}
          : { limiter: { max: options.ratePerSecond, duration: 1_000 } }),
      },
    );

    this.workers.push(worker);
    // Surface connection readiness before returning so a dead Redis fails the caller loudly.
    await worker.waitUntilReady();

    return {
      stop: async () => {
        await worker.close();
      },
    };
  }

  public async close(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
    await Promise.allSettled([...this.queues.values()].map((queue) => queue.close()));
    await Promise.allSettled(this.connections.map((connection) => connection.quit().catch(() => connection.disconnect())));
  }

  // -------------------------------------------------------------------------
  // QueueInspector
  // -------------------------------------------------------------------------

  public async isReachable(): Promise<boolean> {
    try {
      // A counts read round-trips to Redis; success proves the transport is reachable.
      const queue = this.getQueue('recommendation-events');
      await queue.getJobCounts('waiting');
      return true;
    } catch {
      return false;
    }
  }

  public async countWorkers(queueName: string): Promise<number> {
    try {
      const queue = this.getQueue(queueName);
      const workers = await queue.getWorkers();
      return workers.length;
    } catch {
      return 0;
    }
  }

  public async getQueueHealth(queueName: string): Promise<RawQueueHealth> {
    const queue = this.getQueue(queueName);
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      );
      const paused = await queue.isPaused();
      return {
        name: queueName,
        reachable: true,
        paused,
        counts: {
          waiting: counts['waiting'] ?? 0,
          active: counts['active'] ?? 0,
          delayed: counts['delayed'] ?? 0,
          completed: counts['completed'] ?? 0,
          failed: counts['failed'] ?? 0,
        },
      };
    } catch {
      return {
        name: queueName,
        reachable: false,
        paused: false,
        counts: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
      };
    }
  }

  public async listJobs(
    queueName: string,
    filter: { readonly state?: QueueJobLifecycle; readonly offset: number; readonly limit: number },
  ): Promise<readonly RawQueueJob[]> {
    const queue = this.getQueue(queueName);
    const types: QueueJobLifecycle[] =
      filter.state === undefined || filter.state === 'unknown' || filter.state === 'paused'
        ? ['active', 'waiting', 'delayed', 'failed', 'completed']
        : [filter.state];
    const start = filter.offset;
    const end = filter.offset + filter.limit - 1;
    const jobs = await queue.getJobs(
      types as Parameters<Queue['getJobs']>[0],
      start,
      end,
      false,
    );
    const mapped = await Promise.all(
      jobs.filter((job): job is Job => job !== undefined).map((job) => this.toRawJob(queueName, job)),
    );
    return mapped;
  }

  public async getJob(queueName: string, jobId: string): Promise<RawQueueJob | null> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job === undefined) {
      return null;
    }
    return this.toRawJob(queueName, job);
  }

  public async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job === undefined) {
      return false;
    }
    const state = await job.getState();
    if (state !== 'failed') {
      return false;
    }
    await job.retry('failed');
    return true;
  }

  private async toRawJob(queueName: string, job: Job): Promise<RawQueueJob> {
    let state: QueueJobLifecycle;
    try {
      state = (await job.getState()) as QueueJobLifecycle;
    } catch {
      state = 'unknown';
    }
    return {
      id: job.id ?? job.name,
      queue: queueName,
      name: job.name,
      data: job.data,
      state,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      createdAtMs: job.timestamp ?? null,
      processedOnMs: job.processedOn ?? null,
      finishedOnMs: job.finishedOn ?? null,
      delayUntilMs:
        job.delay > 0 && job.timestamp ? job.timestamp + job.delay : null,
      failedReason: job.failedReason ?? null,
    };
  }
}

export const createBullmqQueueProvider = (config: AppConfig): BullmqQueueProvider =>
  new BullmqQueueProvider(config);
