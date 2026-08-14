import { z } from 'zod';

/**
 * The audit vocabulary. Slide 021 asks for one traceable decision timeline and slide 027
 * requires recording who or what caused every transition, so actor, action, resource, and
 * outcome are all mandatory rather than best-effort.
 */
export const ACTOR_TYPES = {
  /** A signed-in person acting through a console. */
  USER: 'USER',
  /** A partner machine client acting through an OAuth2 client-credentials token. */
  PARTNER: 'PARTNER',
  /** The platform acting on its own behalf, for example during startup reconciliation. */
  SYSTEM: 'SYSTEM',
  /** A background job such as the outbox publisher or a retention sweep. */
  JOB: 'JOB',
} as const;

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

export const actorTypeSchema = z.enum([
  ACTOR_TYPES.USER,
  ACTOR_TYPES.PARTNER,
  ACTOR_TYPES.SYSTEM,
  ACTOR_TYPES.JOB,
]);

export const AUDIT_OUTCOMES = {
  ALLOWED: 'ALLOWED',
  DENIED: 'DENIED',
  ERROR: 'ERROR',
} as const;

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[keyof typeof AUDIT_OUTCOMES];

export const auditOutcomeSchema = z.enum([
  AUDIT_OUTCOMES.ALLOWED,
  AUDIT_OUTCOMES.DENIED,
  AUDIT_OUTCOMES.ERROR,
]);

/**
 * Actions use a stable `resource.verb` form. New actions may be added without a schema
 * change, but the pattern is validated so the timeline stays machine-groupable.
 */
export const auditActionSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Must be a dot-separated lowercase action such as member.added.');

export const AUDIT_ACTIONS = {
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  MEMBER_ADDED: 'member.added',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_REMOVED: 'member.removed',
  USER_PROVISIONED: 'user.provisioned',
  USER_SIGNED_IN: 'user.signed_in',
  PARTNER_CONNECTION_CREATED: 'partner_connection.created',
  PARTNER_CONNECTION_UPDATED: 'partner_connection.updated',
  PARTNER_SECRET_ROTATED: 'partner_connection.secret_rotated',
  PARTNER_SIGNING_KEY_REGISTERED: 'partner_signing_key.registered',
  PARTNER_SIGNING_KEY_REVOKED: 'partner_signing_key.revoked',
  PARTNER_TOKEN_ISSUED: 'partner_token.issued',
  PARTNER_TOKEN_REJECTED: 'partner_token.rejected',
  AUTHORIZATION_DENIED: 'authorization.denied',
  AUDIT_CHAIN_VERIFIED: 'audit_chain.verified',
  RETENTION_POLICY_CREATED: 'retention_policy.created',
  RETENTION_SWEEP_COMPLETED: 'retention_sweep.completed',
  OUTBOX_EVENT_DEAD_LETTERED: 'outbox_event.dead_lettered',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | (string & {});

export const RESOURCE_TYPES = {
  ORGANIZATION: 'organization',
  ORGANIZATION_MEMBER: 'organization_member',
  USER: 'user',
  IDENTITY_LINK: 'identity_link',
  PARTNER_CONNECTION: 'partner_connection',
  PARTNER_SIGNING_KEY: 'partner_signing_key',
  AUDIT_EVENT: 'audit_event',
  OUTBOX_EVENT: 'outbox_event',
  RETENTION_POLICY: 'retention_policy',
  RETENTION_RUN: 'retention_run',
  IDEMPOTENCY_KEY: 'idempotency_key',
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES] | (string & {});
