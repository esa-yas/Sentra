import { z } from 'zod';

/**
 * Organization type decides which legal lane a tenant sits in. Slide 076 requires the
 * telecom and financial lanes to stay separate, so this value gates what a tenant may
 * submit and what it may ever read back.
 */
export const ORGANIZATION_TYPES = {
  BANK: 'BANK',
  TELECOM: 'TELECOM',
  /** The operator of the network itself. Holds administrative capability, not evidence. */
  PLATFORM: 'PLATFORM',
} as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[keyof typeof ORGANIZATION_TYPES];

export const organizationTypeSchema = z.enum([
  ORGANIZATION_TYPES.BANK,
  ORGANIZATION_TYPES.TELECOM,
  ORGANIZATION_TYPES.PLATFORM,
]);

export const ORGANIZATION_STATUSES = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[keyof typeof ORGANIZATION_STATUSES];

export const organizationStatusSchema = z.enum([
  ORGANIZATION_STATUSES.ACTIVE,
  ORGANIZATION_STATUSES.SUSPENDED,
  ORGANIZATION_STATUSES.ARCHIVED,
]);

/**
 * Go-live lifecycle, distinct from operational {@link ORGANIZATION_STATUSES}. A newly signed-up
 * tenant starts in SANDBOX (test credentials only). It may request production access, which a
 * PLATFORM administrator moves to APPROVED — or to NEEDS_CONTACT when the team wants to speak to
 * the applicant first (that state surfaces a phone number / booking link to the tenant).
 */
export const ORGANIZATION_APPROVAL_STATUSES = {
  SANDBOX: 'SANDBOX',
  PENDING_REVIEW: 'PENDING_REVIEW',
  NEEDS_CONTACT: 'NEEDS_CONTACT',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
} as const;

export type OrganizationApprovalStatus =
  (typeof ORGANIZATION_APPROVAL_STATUSES)[keyof typeof ORGANIZATION_APPROVAL_STATUSES];

export const organizationApprovalStatusSchema = z.enum([
  ORGANIZATION_APPROVAL_STATUSES.SANDBOX,
  ORGANIZATION_APPROVAL_STATUSES.PENDING_REVIEW,
  ORGANIZATION_APPROVAL_STATUSES.NEEDS_CONTACT,
  ORGANIZATION_APPROVAL_STATUSES.APPROVED,
  ORGANIZATION_APPROVAL_STATUSES.DECLINED,
]);

/**
 * A URL- and log-safe tenant handle. Constrained so it can appear in an audit chain key
 * and a queue name without escaping.
 */
export const organizationSlugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, 'Must be lowercase alphanumeric with internal hyphens.');

/** ISO 3166-1 alpha-2. Jurisdiction drives consent policy and retention rules. */
export const jurisdictionSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 country code.');

/** ISO 4217. */
export const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 currency code.');
