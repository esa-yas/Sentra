import { z } from 'zod';
import { ORGANIZATION_TYPES, type OrganizationType } from './organization';
import { PURPOSES, type Purpose } from './purpose';

/**
 * Roles describe a job, permissions describe an action, and purposes describe why the
 * action is allowed. Slide 073 requires all three to be checked, and slide 023 requires
 * security operations and administration to stay separated, which is why an auditor can
 * verify the audit chain but can never change a partner credential.
 */
export const MEMBER_ROLES = {
  /** Accountable for the tenant. Can manage members, including other administrators. */
  OWNER: 'OWNER',
  /** Day-to-day administration of members, partner connections, and retention policy. */
  ADMIN: 'ADMIN',
  /** Investigates cases and reads decisions. Cannot change configuration. */
  ANALYST: 'ANALYST',
  /** Read-only assurance role. Can verify the audit chain but change nothing. */
  AUDITOR: 'AUDITOR',
  /** Runs the service: reads health and delivery state without access to case evidence. */
  OPERATOR: 'OPERATOR',
} as const;

export type MemberRole = (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES];

export const memberRoleSchema = z.enum([
  MEMBER_ROLES.OWNER,
  MEMBER_ROLES.ADMIN,
  MEMBER_ROLES.ANALYST,
  MEMBER_ROLES.AUDITOR,
  MEMBER_ROLES.OPERATOR,
]);

export const MEMBER_STATUSES = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REMOVED: 'REMOVED',
} as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[keyof typeof MEMBER_STATUSES];

export const memberStatusSchema = z.enum([
  MEMBER_STATUSES.INVITED,
  MEMBER_STATUSES.ACTIVE,
  MEMBER_STATUSES.SUSPENDED,
  MEMBER_STATUSES.REMOVED,
]);

export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_WRITE: 'organization:write',
  /** Creating a new tenant. Only ever held inside a PLATFORM organization. */
  ORGANIZATION_CREATE: 'organization:create',
  MEMBER_READ: 'member:read',
  MEMBER_WRITE: 'member:write',
  PARTNER_READ: 'partner:read',
  PARTNER_WRITE: 'partner:write',
  /** Rotating a partner secret is separated from ordinary partner edits. */
  PARTNER_ROTATE_SECRET: 'partner:rotate_secret',
  AUDIT_READ: 'audit:read',
  AUDIT_VERIFY: 'audit:verify',
  RETENTION_READ: 'retention:read',
  RETENTION_WRITE: 'retention:write',
  /** Partner-only capabilities, granted through OAuth2 scopes rather than a role. */
  PAYMENT_INTENT_SUBMIT: 'payment_intent:submit',
  RISK_EVENT_SUBMIT: 'risk_event:submit',
  RECOMMENDATION_READ: 'recommendation:read',
  CASE_READ: 'case:read',
  OUTCOME_SUBMIT: 'outcome:submit',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

const permissionValues = ALL_PERMISSIONS as [Permission, ...Permission[]];
export const permissionSchema = z.enum(permissionValues);

/** Permissions a human role carries inside any organization. */
const ROLE_PERMISSIONS: Readonly<Record<MemberRole, readonly Permission[]>> = {
  [MEMBER_ROLES.OWNER]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.ORGANIZATION_WRITE,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.MEMBER_WRITE,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.PARTNER_WRITE,
    PERMISSIONS.PARTNER_ROTATE_SECRET,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_VERIFY,
    PERMISSIONS.RETENTION_READ,
    PERMISSIONS.RETENTION_WRITE,
    PERMISSIONS.RECOMMENDATION_READ,
  ],
  [MEMBER_ROLES.ADMIN]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.ORGANIZATION_WRITE,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.MEMBER_WRITE,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.PARTNER_WRITE,
    PERMISSIONS.PARTNER_ROTATE_SECRET,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.RETENTION_READ,
    PERMISSIONS.RETENTION_WRITE,
    PERMISSIONS.RECOMMENDATION_READ,
  ],
  [MEMBER_ROLES.ANALYST]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.RECOMMENDATION_READ,
  ],
  [MEMBER_ROLES.AUDITOR]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_VERIFY,
    PERMISSIONS.RETENTION_READ,
  ],
  [MEMBER_ROLES.OPERATOR]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.PARTNER_READ,
    PERMISSIONS.AUDIT_READ,
  ],
};

/** Purposes a human role may act under. */
const ROLE_PURPOSES: Readonly<Record<MemberRole, readonly Purpose[]>> = {
  [MEMBER_ROLES.OWNER]: [
    PURPOSES.PARTNER_ADMINISTRATION,
    PURPOSES.SERVICE_OPERATION,
    PURPOSES.AUDIT_COMPLIANCE,
    PURPOSES.CONSENT_MANAGEMENT,
  ],
  [MEMBER_ROLES.ADMIN]: [
    PURPOSES.PARTNER_ADMINISTRATION,
    PURPOSES.SERVICE_OPERATION,
    PURPOSES.CONSENT_MANAGEMENT,
  ],
  [MEMBER_ROLES.ANALYST]: [PURPOSES.FRAUD_INVESTIGATION, PURPOSES.PROTECT_PAYMENT],
  [MEMBER_ROLES.AUDITOR]: [PURPOSES.AUDIT_COMPLIANCE],
  [MEMBER_ROLES.OPERATOR]: [PURPOSES.SERVICE_OPERATION],
};

/**
 * Resolves what a membership can do. Tenant creation is the one capability that depends
 * on the organization's own type: an owner of a bank tenant administers that bank, while
 * an owner inside the platform tenant onboards new participants.
 */
export const resolveRolePermissions = (
  role: MemberRole,
  organizationType: OrganizationType,
): readonly Permission[] => {
  const base = ROLE_PERMISSIONS[role];
  const isPlatformAdministrator =
    organizationType === ORGANIZATION_TYPES.PLATFORM &&
    (role === MEMBER_ROLES.OWNER || role === MEMBER_ROLES.ADMIN);

  return isPlatformAdministrator ? [...base, PERMISSIONS.ORGANIZATION_CREATE] : base;
};

export const resolveRolePurposes = (role: MemberRole): readonly Purpose[] => ROLE_PURPOSES[role];

/**
 * OAuth2 scopes a partner connection may hold. Scopes map onto the same permission
 * vocabulary so that `authorize` behaves identically for a person and for a machine.
 */
export const PARTNER_SCOPES = {
  PAYMENT_INTENTS_WRITE: 'payment-intents:write',
  RISK_EVENTS_WRITE: 'risk-events:write',
  RECOMMENDATIONS_READ: 'recommendations:read',
  CASES_READ: 'cases:read',
  OUTCOMES_WRITE: 'outcomes:write',
} as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[keyof typeof PARTNER_SCOPES];

export const ALL_PARTNER_SCOPES: readonly PartnerScope[] = Object.values(PARTNER_SCOPES);

const partnerScopeValues = ALL_PARTNER_SCOPES as [PartnerScope, ...PartnerScope[]];
export const partnerScopeSchema = z.enum(partnerScopeValues);

const SCOPE_PERMISSIONS: Readonly<Record<PartnerScope, readonly Permission[]>> = {
  [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE]: [PERMISSIONS.PAYMENT_INTENT_SUBMIT],
  [PARTNER_SCOPES.RISK_EVENTS_WRITE]: [PERMISSIONS.RISK_EVENT_SUBMIT],
  [PARTNER_SCOPES.RECOMMENDATIONS_READ]: [PERMISSIONS.RECOMMENDATION_READ],
  [PARTNER_SCOPES.CASES_READ]: [PERMISSIONS.CASE_READ],
  [PARTNER_SCOPES.OUTCOMES_WRITE]: [PERMISSIONS.OUTCOME_SUBMIT],
};

export const resolveScopePermissions = (scopes: readonly PartnerScope[]): readonly Permission[] => {
  const permissions = new Set<Permission>();
  for (const scope of scopes) {
    for (const permission of SCOPE_PERMISSIONS[scope]) {
      permissions.add(permission);
    }
  }
  return [...permissions];
};

/**
 * Scopes a given organization type is allowed to hold at all. A telecom tenant must not
 * be able to submit payment intents, and a bank tenant must not submit telecom risk
 * events, however their credentials are configured — the lanes of slide 076 are enforced
 * here rather than trusted to onboarding discipline.
 */
export const scopesAllowedForOrganizationType = (
  organizationType: OrganizationType,
): readonly PartnerScope[] => {
  switch (organizationType) {
    case ORGANIZATION_TYPES.BANK:
      return [
        PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
        PARTNER_SCOPES.RECOMMENDATIONS_READ,
        PARTNER_SCOPES.CASES_READ,
        PARTNER_SCOPES.OUTCOMES_WRITE,
      ];
    case ORGANIZATION_TYPES.TELECOM:
      return [PARTNER_SCOPES.RISK_EVENTS_WRITE];
    case ORGANIZATION_TYPES.PLATFORM:
      return [];
    default: {
      const exhaustive: never = organizationType;
      return exhaustive;
    }
  }
};
