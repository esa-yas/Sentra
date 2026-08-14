import { PURPOSES } from '@sentra/contracts';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TEMPLATES } from '@sentra/ports';
import { describe, expect, it } from 'vitest';
import type { NotificationProvider } from '@sentra/ports';

export interface NotificationProviderContractHarness {
  readonly notifications: NotificationProvider;
  readonly listDeliveries: () => readonly unknown[];
  readonly simulateTransportFailure: (reason: string) => void;
  readonly clearTransportFailure: () => void;
}

export const describeNotificationProviderContract = (
  name: string,
  factory: () => NotificationProviderContractHarness,
): void => {
  describe(`${name} NotificationProvider`, () => {
    const sampleInput = () => ({
      channel: NOTIFICATION_CHANNELS.EMAIL,
      template: NOTIFICATION_TEMPLATES.PARTNER_SECRET_ROTATED,
      recipient: 'ops@bank.example',
      organizationId: '01ORG_BANK',
      purpose: PURPOSES.PARTNER_ADMINISTRATION,
      variables: { connectionName: 'sandbox' },
      correlationId: 'crl_notify_contract',
    });

    it('accepts a notification and returns a receipt', async () => {
      const { notifications } = factory();
      const result = await notifications.send(sampleInput());

      expect(result).toMatchObject({
        channel: NOTIFICATION_CHANNELS.EMAIL,
      });
      expect('failed' in result).toBe(false);
    });

    it('returns a structured failure instead of throwing when transport fails', async () => {
      const { notifications, simulateTransportFailure } = factory();
      simulateTransportFailure('smtp unavailable');

      const result = await notifications.send(sampleInput());

      expect(result).toEqual({ failed: true, reason: 'smtp unavailable' });
    });

    it('returns the original receipt verbatim on deduplicated replay', async () => {
      const { notifications, listDeliveries } = factory();
      const input = { ...sampleInput(), deduplicationId: 'notify-dedupe-1' };

      const first = await notifications.send(input);
      const second = await notifications.send(input);

      expect(listDeliveries()).toHaveLength(1);
      expect(second).toEqual(first);
    });
  });
};
