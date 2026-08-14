import type {
  EnqueueOptions,
  QueueConsumerHandle,
  QueueConsumerOptions,
  QueueHandler,
  QueueMessage,
  QueueProvider,
} from '@sentra/ports';
import type { FakeClock } from './clock';
import { createFakeClock } from './clock';
import type { FakeIdGenerator } from './id-generator';
import { createFakeIdGenerator } from './id-generator';

interface StoredMessage {
  readonly id: string;
  readonly queueName: string;
  readonly jobName: string;
  readonly payload: unknown;
  readonly maxAttempts: number;
  readonly enqueuedAt: Date;
  readonly availableAt: Date;
  attempt: number;
  readonly deduplicationId?: string;
  duplicateDeliveriesRemaining: number;
  failUntilAttempt: number;
  status: 'pending' | 'completed' | 'dead';
}

interface ScheduledJob {
  readonly queueName: string;
  readonly jobName: string;
  readonly cronExpression: string;
  readonly payload: unknown;
}

export interface FakeQueueProviderOptions {
  readonly clock?: FakeClock;
  readonly ids?: FakeIdGenerator;
  /** When true, every delivered message is handed to the handler twice. */
  readonly duplicateDelivery?: boolean;
}

/**
 * In-memory queue that models delay, retry, duplicate delivery, and handler failure
 * without hiding the semantics behind unconditional success responses.
 */
export class FakeQueueProvider implements QueueProvider {
  private readonly clock: FakeClock;
  private readonly ids: FakeIdGenerator;
  private readonly duplicateDelivery: boolean;
  private readonly queues = new Map<string, StoredMessage[]>();
  private readonly dedupeIndex = new Map<string, string>();
  private readonly schedules: ScheduledJob[] = [];
  private readonly handlers = new Map<string, QueueHandler>();
  private readonly activeConsumers = new Set<string>();
  private consumerCounter = 0;

  public constructor(options: FakeQueueProviderOptions = {}) {
    this.clock = options.clock ?? createFakeClock();
    this.ids = options.ids ?? createFakeIdGenerator();
    this.duplicateDelivery = options.duplicateDelivery ?? false;
  }

  public readonly messages = (): readonly StoredMessage[] =>
    [...this.queues.values()].flatMap((queue) => [...queue]);

  public async enqueue<TPayload>(
    queueName: string,
    jobName: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<{ id: string }> {
    if (options.deduplicationId !== undefined) {
      const existingId = this.dedupeIndex.get(`${queueName}:${options.deduplicationId}`);
      if (existingId !== undefined) {
        return { id: existingId };
      }
    }

    const id = this.ids.generate();
    const now = this.clock.now();
    const message: StoredMessage = {
      id,
      queueName,
      jobName,
      payload,
      maxAttempts: options.maxAttempts ?? 3,
      enqueuedAt: now,
      availableAt: new Date(now.getTime() + (options.delayMs ?? 0)),
      attempt: 0,
      ...(options.deduplicationId === undefined ? {} : { deduplicationId: options.deduplicationId }),
      duplicateDeliveriesRemaining: this.duplicateDelivery ? 1 : 0,
      failUntilAttempt: 0,
      status: 'pending',
    };

    const queue = this.queues.get(queueName) ?? [];
    queue.push(message);
    this.queues.set(queueName, queue);

    if (options.deduplicationId !== undefined) {
      this.dedupeIndex.set(`${queueName}:${options.deduplicationId}`, id);
    }

    return { id };
  }

  /** Makes the next deliveries of {@link messageId} fail until {@link attempt} is reached. */
  public failUntilAttempt(messageId: string, attempt: number): void {
    const message = this.findMessage(messageId);
    if (message !== undefined) {
      message.failUntilAttempt = attempt;
    }
  }

  /** Delivers {@link messageId} to the registered consumer one extra time. */
  public forceDuplicateDelivery(messageId: string): void {
    const message = this.findMessage(messageId);
    if (message !== undefined) {
      message.duplicateDeliveriesRemaining += 1;
    }
  }

  public async schedule<TPayload>(
    queueName: string,
    jobName: string,
    cronExpression: string,
    payload: TPayload,
  ): Promise<void> {
    this.schedules.push({ queueName, jobName, cronExpression, payload });
  }

  public readonly scheduledJobs = (): readonly ScheduledJob[] => [...this.schedules];

  public async consume<TPayload>(
    queueName: string,
    handler: QueueHandler<TPayload>,
    _options?: QueueConsumerOptions,
  ): Promise<QueueConsumerHandle> {
    const consumerId = `consumer_${++this.consumerCounter}`;
    this.handlers.set(queueName, handler as QueueHandler);
    this.activeConsumers.add(consumerId);

    return {
      stop: async () => {
        this.activeConsumers.delete(consumerId);
        if (this.activeConsumers.size === 0) {
          this.handlers.delete(queueName);
        }
      },
    };
  }

  /** Processes every message that is currently available. Test helper. */
  public async flush(queueName?: string): Promise<void> {
    const queueNames =
      queueName === undefined ? [...this.queues.keys()] : [queueName];

    for (const name of queueNames) {
      for (let round = 0; round < 20; round += 1) {
        if (this.pendingCount(name) === 0) {
          break;
        }
        await this.drainQueue(name, false);
      }
    }
  }

  public async close(): Promise<void> {
    this.handlers.clear();
    this.activeConsumers.clear();
  }

  private async drainQueue(queueName: string, force = false): Promise<void> {
    const handler = this.handlers.get(queueName);
    if (handler === undefined) {
      return;
    }

    const queue = this.queues.get(queueName) ?? [];
    const now = this.clock.now();

    for (const message of queue) {
      if (message.status !== 'pending') {
        continue;
      }
      if (!force && now.getTime() < message.availableAt.getTime()) {
        continue;
      }

      const deliveries = 1 + message.duplicateDeliveriesRemaining;
      message.duplicateDeliveriesRemaining = 0;
      message.attempt += 1;

      const queueMessage: QueueMessage = {
        id: message.id,
        name: message.jobName,
        payload: message.payload,
        attempt: message.attempt,
        enqueuedAt: message.enqueuedAt,
      };

      for (let delivery = 0; delivery < deliveries; delivery += 1) {
        if (message.attempt <= message.failUntilAttempt) {
          if (message.attempt >= message.maxAttempts) {
            message.status = 'dead';
          }
          continue;
        }

        try {
          await handler(queueMessage);
          message.status = 'completed';
        } catch {
          if (message.attempt >= message.maxAttempts) {
            message.status = 'dead';
          }
        }
      }
    }
  }

  private findMessage(messageId: string): StoredMessage | undefined {
    for (const queue of this.queues.values()) {
      const match = queue.find((message) => message.id === messageId);
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }

  private pendingCount(queueName: string): number {
    const queue = this.queues.get(queueName) ?? [];
    return queue.filter((message) => message.status === 'pending').length;
  }
}

export const createFakeQueueProvider = (options?: FakeQueueProviderOptions): FakeQueueProvider =>
  new FakeQueueProvider(options);
