import { z } from 'zod';

/**
 * Purpose is the backbone of the privacy model. Slide 075 requires a purpose tag to
 * follow every record and every event, and slide 073 requires authorization to consider
 * purpose alongside identity and role. A record created for one purpose may never be
 * silently reused for another.
 */
export const PURPOSES = {
  /** Assessing a specific payment intent before the bank authorizes it. */
  PROTECT_PAYMENT: 'PROTECT_PAYMENT',
  /** Case work on a suspected or confirmed scam, bound to an individual investigation. */
  FRAUD_INVESTIGATION: 'FRAUD_INVESTIGATION',
  /** Keeping the platform running: health checks, delivery, and reliability work. */
  SERVICE_OPERATION: 'SERVICE_OPERATION',
  /** Demonstrating what happened, to an auditor or a regulator. */
  AUDIT_COMPLIANCE: 'AUDIT_COMPLIANCE',
  /** Collecting, presenting, and revoking consent. */
  CONSENT_MANAGEMENT: 'CONSENT_MANAGEMENT',
  /** Managing tenants, partner credentials, and policy configuration. */
  PARTNER_ADMINISTRATION: 'PARTNER_ADMINISTRATION',
  /** Aggregate measurement only. Never a lawful basis for an individual decision. */
  ANALYTICS_AGGREGATE: 'ANALYTICS_AGGREGATE',
} as const;

export type Purpose = (typeof PURPOSES)[keyof typeof PURPOSES];

export const ALL_PURPOSES: readonly Purpose[] = Object.values(PURPOSES);

export const purposeSchema = z.enum([
  PURPOSES.PROTECT_PAYMENT,
  PURPOSES.FRAUD_INVESTIGATION,
  PURPOSES.SERVICE_OPERATION,
  PURPOSES.AUDIT_COMPLIANCE,
  PURPOSES.CONSENT_MANAGEMENT,
  PURPOSES.PARTNER_ADMINISTRATION,
  PURPOSES.ANALYTICS_AGGREGATE,
]);

/**
 * Purposes a partner integration may ever request through the OAuth2 token endpoint.
 * Administrative and audit purposes are deliberately excluded: a machine client must not
 * be able to mint itself investigative or compliance access.
 */
export const PARTNER_GRANTABLE_PURPOSES: readonly Purpose[] = [
  PURPOSES.PROTECT_PAYMENT,
  PURPOSES.SERVICE_OPERATION,
];

/** Data sensitivity, used to choose storage, retention, and access controls. */
export const DATA_CLASSIFICATIONS = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
} as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[keyof typeof DATA_CLASSIFICATIONS];

export const dataClassificationSchema = z.enum([
  DATA_CLASSIFICATIONS.PUBLIC,
  DATA_CLASSIFICATIONS.INTERNAL,
  DATA_CLASSIFICATIONS.CONFIDENTIAL,
  DATA_CLASSIFICATIONS.RESTRICTED,
]);
