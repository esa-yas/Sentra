import { z } from 'zod';
import { actorTypeSchema, auditActionSchema, auditOutcomeSchema } from '../audit';
import { purposeSchema } from '../purpose';
import { correlationIdSchema, sequenceSchema, ulidSchema } from '../identifiers';
import { paginationQuerySchema } from '../http';

export const auditEventResponseSchema = z.object({
  id: ulidSchema,
  sequence: sequenceSchema,
  organizationId: ulidSchema.nullable(),
  actorType: actorTypeSchema,
  actorId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  action: auditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  purpose: purposeSchema,
  outcome: auditOutcomeSchema,
  correlationId: correlationIdSchema,
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()).nullable(),
  /** Chain digests, so an auditor can verify the timeline outside the platform. */
  hashPrev: z.string(),
  hashSelf: z.string(),
});

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

export const auditEventQuerySchema = paginationQuerySchema.extend({
  action: auditActionSchema.optional(),
  resourceType: z.string().min(1).max(64).optional(),
  resourceId: z.string().min(1).max(128).optional(),
  correlationId: correlationIdSchema.optional(),
  outcome: auditOutcomeSchema.optional(),
  occurredAfter: z.string().datetime().optional(),
  occurredBefore: z.string().datetime().optional(),
});

export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;

/**
 * The result of recomputing the hash chain. `valid: false` means a record was altered or
 * removed after the fact, which is an incident rather than a validation failure.
 */
export const auditChainVerificationResponseSchema = z.object({
  chainKey: z.string(),
  valid: z.boolean(),
  eventsVerified: z.number().int().nonnegative(),
  firstSequence: sequenceSchema.nullable(),
  lastSequence: sequenceSchema.nullable(),
  brokenAtSequence: sequenceSchema.nullable(),
  verifiedAt: z.string().datetime(),
});

export type AuditChainVerificationResponse = z.infer<typeof auditChainVerificationResponseSchema>;
