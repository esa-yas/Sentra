import { type MemberRole, type Permission, type PartnerScope } from './authorization';
import { type OrganizationType } from './organization';
import { type Purpose } from './purpose';
import { type ActorType } from './audit';

/**
 * The resolved caller. Slide 073 requires every request to prove identity, tenant,
 * purpose, role, and permitted action, so both authentication paths — a Supabase JWT for
 * a person and an OAuth2 client-credentials token for a partner — collapse into this one
 * shape. Everything downstream authorizes against a `RequestPrincipal` and never needs to
 * know which path produced it.
 */
export interface OrganizationMembershipSummary {
  organizationId: string;
  organizationSlug: string;
  organizationType: OrganizationType;
  role: MemberRole;
  permissions: readonly Permission[];
  purposes: readonly Purpose[];
}

interface PrincipalBase {
  /** Stable, app-owned identifier. Never a provider subject. */
  id: string;
  actorType: ActorType;
  /** Human-readable label for the audit timeline. Must not contain personal data. */
  label: string;
}

export interface UserPrincipal extends PrincipalBase {
  kind: 'USER';
  actorType: 'USER';
  /** The issuer and subject the token came from, retained for audit provenance. */
  issuer: string;
  subject: string;
  memberships: readonly OrganizationMembershipSummary[];
}

export interface PartnerPrincipal extends PrincipalBase {
  kind: 'PARTNER';
  actorType: 'PARTNER';
  /** A partner token is bound to exactly one tenant. */
  organizationId: string;
  organizationType: OrganizationType;
  partnerConnectionId: string;
  scopes: readonly PartnerScope[];
  permissions: readonly Permission[];
  purposes: readonly Purpose[];
  /** Token identifier, used to trace and to revoke. */
  tokenId: string;
}

/** Used by background jobs and startup tasks, which have no external caller. */
export interface SystemPrincipal extends PrincipalBase {
  kind: 'SYSTEM';
  actorType: 'SYSTEM' | 'JOB';
  purposes: readonly Purpose[];
}

export type RequestPrincipal = UserPrincipal | PartnerPrincipal | SystemPrincipal;

export const isUserPrincipal = (principal: RequestPrincipal): principal is UserPrincipal =>
  principal.kind === 'USER';

export const isPartnerPrincipal = (principal: RequestPrincipal): principal is PartnerPrincipal =>
  principal.kind === 'PARTNER';

export const isSystemPrincipal = (principal: RequestPrincipal): principal is SystemPrincipal =>
  principal.kind === 'SYSTEM';

/** The organizations a principal can act within. */
export const principalOrganizationIds = (principal: RequestPrincipal): readonly string[] => {
  switch (principal.kind) {
    case 'USER':
      return principal.memberships.map((membership) => membership.organizationId);
    case 'PARTNER':
      return [principal.organizationId];
    case 'SYSTEM':
      return [];
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
};

/**
 * Permissions a principal holds inside one organization. A user with no membership in
 * that organization holds nothing, which is what makes cross-tenant access a 403 rather
 * than a silent empty result.
 */
export const principalPermissionsIn = (
  principal: RequestPrincipal,
  organizationId: string,
): readonly Permission[] => {
  switch (principal.kind) {
    case 'USER': {
      const membership = principal.memberships.find((entry) => entry.organizationId === organizationId);
      return membership?.permissions ?? [];
    }
    case 'PARTNER':
      return principal.organizationId === organizationId ? principal.permissions : [];
    case 'SYSTEM':
      // A system principal is trusted for its declared purposes but is never granted
      // tenant-scoped permissions implicitly; a job must state what it operates on.
      return [];
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
};

export const principalPurposes = (principal: RequestPrincipal, organizationId?: string): readonly Purpose[] => {
  switch (principal.kind) {
    case 'USER': {
      if (organizationId === undefined) {
        return [...new Set(principal.memberships.flatMap((membership) => [...membership.purposes]))];
      }
      const membership = principal.memberships.find((entry) => entry.organizationId === organizationId);
      return membership?.purposes ?? [];
    }
    case 'PARTNER':
      return organizationId === undefined || principal.organizationId === organizationId ? principal.purposes : [];
    case 'SYSTEM':
      return principal.purposes;
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
};
