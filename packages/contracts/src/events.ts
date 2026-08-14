import { z } from 'zod';
import { correlationIdSchema, ulidSchema } from './identifiers';

/**
 * Durable domain events. Slide 034 makes the PostgreSQL outbox the authoritative record
 * and slide 043 forbids treating a browser subscription or a queue as business truth, so
 * every event here is written inside the same transaction as the state change it
 * describes and is published at least once afterwards.
 *
 * Consumers must assume duplicates and out-of-order delivery (slide 056).
 */
export const DOMAIN_EVENT_TYPES = {
  ORGANIZATION_CREATED: 'organization.created.v1',
  ORGANIZATION_MEMBER_ADDED: 'organization.member_added.v1',
  ORGANIZATION_MEMBER_ROLE_CHANGED: 'organization.member_role_changed.v1',
  ORGANIZATION_MEMBER_REMOVED: 'organization.member_removed.v1',
  PARTNER_CONNECTION_CREATED: 'partner_connection.created.v1',
  PARTNER_SECRET_ROTATED: 'partner_connection.secret_rotated.v1',
  RETENTION_SWEEP_COMPLETED: 'retention.sweep_completed.v1',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export const domainEventTypeSchema = z.enum([
  DOMAIN_EVENT_TYPES.ORGANIZATION_CREATED,
  DOMAIN_EVENT_TYPES.ORGANIZATION_MEMBER_ADDED,
  DOMAIN_EVENT_TYPES.ORGANIZATION_MEMBER_ROLE_CHANGED,
  DOMAIN_EVENT_TYPES.ORGANIZATION_MEMBER_REMOVED,
  DOMAIN_EVENT_TYPES.PARTNER_CONNECTION_CREATED,
  DOMAIN_EVENT_TYPES.PARTNER_SECRET_ROTATED,
  DOMAIN_EVENT_TYPES.RETENTION_SWEEP_COMPLETED,
]);

/** The current payload version for each event type, stored alongside the row. */
export const DOMAIN_EVENT_SCHEMA_VERSION = 1;

/**
 * The envelope every published event carries. Payloads are deliberately minimal: an
 * event names what changed and where to read it, rather than copying evidence into a
 * queue where retention and purpose controls do not apply.
 */
export const domainEventEnvelopeSchema = z.object({
  id: ulidSchema,
  eventType: domainEventTypeSchema,
  schemaVersion: z.number().int().positive(),
  organizationId: ulidSchema.nullable(),
  aggregateType: z.string().min(1).max(64),
  aggregateId: z.string().min(1).max(128),
  correlationId: correlationIdSchema,
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;

/** Queue names. Kept explicit so a later Pub/Sub topic can reuse the same identifiers. */
export const QUEUE_NAMES = {
  DOMAIN_EVENTS: 'sentra.domain-events',
  RETENTION: 'sentra.retention',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job payloads for the retention queue. */
export const retentionSweepJobSchema = z.object({
  schemaVersion: z.literal(1),
  correlationId: correlationIdSchema,
  /** Restricts the sweep to one policy, used for on-demand runs and tests. */
  retentionPolicyId: ulidSchema.optional(),
});

export type RetentionSweepJob = z.infer<typeof retentionSweepJobSchema>;

export const JOB_NAMES = {
  RETENTION_SWEEP: 'retention.sweep',
  PUBLISH_DOMAIN_EVENT: 'domain-event.publish',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
