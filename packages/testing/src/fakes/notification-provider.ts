import type { NotificationInput, NotificationProvider, NotificationReceipt } from '@sentra/ports';
import type { FakeClock } from './clock';
import { createFakeClock } from './clock';
import type { FakeIdGenerator } from './id-generator';
import { createFakeIdGenerator } from './id-generator';

export interface FakeNotificationProviderOptions {
  readonly clock?: FakeClock;
  readonly ids?: FakeIdGenerator;
  readonly failReason?: string;
}

/**
 * Records outbound notifications and honours deduplication without pretending every send
 * succeeds when the transport is configured to fail.
 */
export class FakeNotificationProvider implements NotificationProvider {
  public readonly name = 'fake-notification';

  private readonly clock: FakeClock;
  private readonly ids: FakeIdGenerator;
  private failReason: string | undefined;
  private readonly sent: NotificationReceipt[] = [];
  private readonly receiptsByDedupeKey = new Map<string, NotificationReceipt>();

  public constructor(options: FakeNotificationProviderOptions = {}) {
    this.clock = options.clock ?? createFakeClock();
    this.ids = options.ids ?? createFakeIdGenerator();
    this.failReason = options.failReason;
  }

  public readonly deliveries = (): readonly NotificationReceipt[] => [...this.sent];

  public setFailReason(reason: string | undefined): void {
    this.failReason = reason;
  }

  public async send(
    input: NotificationInput,
  ): Promise<NotificationReceipt | { failed: true; reason: string }> {
    if (this.failReason !== undefined) {
      return { failed: true, reason: this.failReason };
    }

    if (input.deduplicationId !== undefined) {
      const dedupeKey = `${input.channel}:${input.deduplicationId}`;
      const existing = this.receiptsByDedupeKey.get(dedupeKey);
      if (existing !== undefined) {
        return existing;
      }
    }

    const receipt: NotificationReceipt = {
      id: this.ids.generate(),
      channel: input.channel,
      acceptedAt: this.clock.now(),
      providerMessageId: `fake-msg-${this.sent.length + 1}`,
    };

    if (input.deduplicationId !== undefined) {
      this.receiptsByDedupeKey.set(`${input.channel}:${input.deduplicationId}`, receipt);
    }

    this.sent.push(receipt);
    return receipt;
  }
}

export const createFakeNotificationProvider = (
  options?: FakeNotificationProviderOptions,
): FakeNotificationProvider => new FakeNotificationProvider(options);
