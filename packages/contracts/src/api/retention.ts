import { z } from 'zod';
import { purposeSchema } from '../purpose';
import { ulidSchema } from '../identifiers';

export const RETENTION_ACTIONS = {
  /** Remove the row entirely. */
  DELETE: 'DELETE',
  /** Keep the row for aggregate measurement, stripped of anything identifying. */
  ANONYMIZE: 'ANONYMIZE',
} as const;

export type RetentionAction = (typeof RETENTION_ACTIONS)[keyof typeof RETENTION_ACTIONS];

export const retentionActionSchema = z.enum([RETENTION_ACTIONS.DELETE, RETENTION_ACTIONS.ANONYMIZE]);

export const RETENTION_POLICY_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
} as const;

export type RetentionPolicyStatus =
  (typeof RETENTION_POLICY_STATUSES)[keyof typeof RETENTION_POLICY_STATUSES];

export const retentionPolicyStatusSchema = z.enum([
  RETENTION_POLICY_STATUSES.DRAFT,
  RETENTION_POLICY_STATUSES.ACTIVE,
  RETENTION_POLICY_STATUSES.RETIRED,
]);

/** One year. Beyond this, a record needs an explicit legal justification, not a default. */
const MAX_RETENTION_SECONDS = 31_536_000;

export const createRetentionPolicyRequestSchema = z
  .object({
    /** The table or aggregate the policy governs, for example `telecom_risk_event`. */
    resourceType: z.string().min(3).max(64).regex(/^[a-z][a-z0-9_]*$/, 'Must be a snake_case resource name.'),
    purpose: purposeSchema,
    retentionSeconds: z.number().int().min(60).max(MAX_RETENTION_SECONDS),
    action: retentionActionSchema,
    /** The lawful basis for holding the data this long. Recorded for the DPIA. */
    legalBasis: z.string().min(3).max(200),
  })
  .strict();

export type CreateRetentionPolicyRequest = z.infer<typeof createRetentionPolicyRequestSchema>;

export const retentionPolicyResponseSchema = z.object({
  id: ulidSchema,
  organizationId: ulidSchema.nullable(),
  resourceType: z.string(),
  purpose: purposeSchema,
  retentionSeconds: z.number().int(),
  action: retentionActionSchema,
  legalBasis: z.string(),
  version: z.number().int(),
  status: retentionPolicyStatusSchema,
  effectiveFrom: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type RetentionPolicyResponse = z.infer<typeof retentionPolicyResponseSchema>;

export const RETENTION_RUN_STATUSES = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type RetentionRunStatus = (typeof RETENTION_RUN_STATUSES)[keyof typeof RETENTION_RUN_STATUSES];

export const retentionRunStatusSchema = z.enum([
  RETENTION_RUN_STATUSES.RUNNING,
  RETENTION_RUN_STATUSES.COMPLETED,
  RETENTION_RUN_STATUSES.FAILED,
]);

/**
 * Slide 075 requires deletion to be provable, not merely scheduled. Each run records how
 * many records it affected and a digest over that result, so an auditor can confirm the
 * sweep happened without being granted access to the deleted content.
 */
export const retentionRunResponseSchema = z.object({
  id: ulidSchema,
  retentionPolicyId: ulidSchema,
  status: retentionRunStatusSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  recordsAffected: z.number().int().nonnegative(),
  proofHash: z.string().nullable(),
});

export type RetentionRunResponse = z.infer<typeof retentionRunResponseSchema>;
