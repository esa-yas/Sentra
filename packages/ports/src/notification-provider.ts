import type { Purpose } from '@sentra/contracts';

/**
 * Outbound notification.
 *
 * The platform notifies operators, not customers: slide 041 keeps the customer relationship
 * with the bank, so a warning shown to a person is rendered by the bank's own channel from a
 * recommendation we return. This port therefore carries operational and administrative
 * messages only.
 *
 * Content is templated and versioned rather than composed at a call site, so no message can
 * accidentally interpolate evidence into an email.
 */

export const NOTIFICATION_CHANNELS = {
  EMAIL: 'EMAIL',
  /** Delivered to a tenant's configured operations endpoint. */
  WEBHOOK: 'WEBHOOK',
  /** Recorded for display in the console only. */
  IN_APP: 'IN_APP',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

export const NOTIFICATION_TEMPLATES = {
  MEMBER_INVITED: 'member_invited.v1',
  PARTNER_SECRET_ROTATED: 'partner_secret_rotated.v1',
  PARTNER_SECRET_ROTATION_DUE: 'partner_secret_rotation_due.v1',
  AUDIT_CHAIN_VERIFICATION_FAILED: 'audit_chain_verification_failed.v1',
  OUTBOX_EVENT_DEAD_LETTERED: 'outbox_event_dead_lettered.v1',
  RETENTION_SWEEP_FAILED: 'retention_sweep_failed.v1',
} as const;

export type NotificationTemplate =
  (typeof NOTIFICATION_TEMPLATES)[keyof typeof NOTIFICATION_TEMPLATES];

export interface NotificationInput {
  readonly channel: NotificationChannel;
  readonly template: NotificationTemplate;
  /** Opaque recipient reference: an email address, a webhook identifier, or a user ID. */
  readonly recipient: string;
  readonly organizationId: string | null;
  readonly purpose: Purpose;
  /**
   * Values interpolated into the template. Redacted before sending, and templates are
   * written to need only non-sensitive fields.
   */
  readonly variables: Record<string, string | number | boolean>;
  readonly correlationId: string;
  /**
   * Suppresses duplicate sends when a job is retried.
   *
   * Replay semantics (Version 1a): when the same `channel` and `deduplicationId` are seen
   * again, the provider returns the original stored receipt verbatim and performs no
   * additional delivery.
   */
  readonly deduplicationId?: string;
}

export interface NotificationReceipt {
  readonly id: string;
  readonly channel: NotificationChannel;
  readonly acceptedAt: Date;
  /** Provider-side identifier, when the transport supplies one. */
  readonly providerMessageId?: string;
}

export interface NotificationProvider {
  readonly name: string;

  /**
   * Queues one notification. Never throws for a transport failure: a delivery problem must
   * not roll back the business change that prompted the message.
   */
  send(input: NotificationInput): Promise<NotificationReceipt | { failed: true; reason: string }>;
}
