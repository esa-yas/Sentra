import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  MEMBER_ROLES,
  ORGANIZATION_TYPES,
  PERMISSIONS,
  TenantMismatchError,
  authorize,
  can,
  resolveRolePermissions,
  resolveRolePurposes,
  type PartnerPrincipal,
  type UserPrincipal,
} from '../index';

const userInOrg = (
  organizationId: string,
  role: (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES] = MEMBER_ROLES.ADMIN,
  organizationType: (typeof ORGANIZATION_TYPES)[keyof typeof ORGANIZATION_TYPES] = ORGANIZATION_TYPES.BANK,
): UserPrincipal => ({
  id: 'user-1',
  kind: 'USER',
  actorType: 'USER',
  label: 'user:user-1',
  issuer: 'https://issuer.test',
  subject: 'sub-1',
  memberships: [
    {
      organizationId,
      organizationSlug: 'acme-bank',
      organizationType,
      role,
      permissions: resolveRolePermissions(role, organizationType),
      purposes: resolveRolePurposes(role),
    },
  ],
});

const partnerInOrg = (organizationId: string): PartnerPrincipal => ({
  id: 'partner-1',
  kind: 'PARTNER',
  actorType: 'PARTNER',
  label: 'partner:partner-1',
  organizationId,
  organizationType: ORGANIZATION_TYPES.BANK,
  partnerConnectionId: 'pc-1',
  tokenId: 'tok-1',
  scopes: [],
  permissions: [PERMISSIONS.RECOMMENDATION_READ],
  purposes: [],
});

describe('authorize', () => {
  it('permits a member holding the required permission', () => {
    expect(() =>
      authorize(userInOrg('org-a'), {
        permission: PERMISSIONS.PARTNER_WRITE,
        organizationId: 'org-a',
      }),
    ).not.toThrow();
  });

  it('rejects a member lacking the permission with ForbiddenError', () => {
    // An analyst has read access but cannot write partner connections.
    expect(() =>
      authorize(userInOrg('org-a', MEMBER_ROLES.ANALYST), {
        permission: PERMISSIONS.PARTNER_WRITE,
        organizationId: 'org-a',
      }),
    ).toThrow(ForbiddenError);
  });

  it('rejects access to an organization the principal does not belong to with TenantMismatchError', () => {
    expect(() =>
      authorize(userInOrg('org-a'), {
        permission: PERMISSIONS.ORGANIZATION_READ,
        organizationId: 'org-b',
      }),
    ).toThrow(TenantMismatchError);
  });

  it('scopes a partner principal to its own tenant', () => {
    expect(() =>
      authorize(partnerInOrg('org-a'), {
        permission: PERMISSIONS.RECOMMENDATION_READ,
        organizationId: 'org-a',
      }),
    ).not.toThrow();
    expect(() =>
      authorize(partnerInOrg('org-a'), {
        permission: PERMISSIONS.RECOMMENDATION_READ,
        organizationId: 'org-b',
      }),
    ).toThrow(TenantMismatchError);
  });
});

describe('can', () => {
  it('mirrors authorize without throwing', () => {
    const user = userInOrg('org-a', MEMBER_ROLES.ANALYST);
    expect(can(user, { permission: PERMISSIONS.RECOMMENDATION_READ, organizationId: 'org-a' })).toBe(true);
    expect(can(user, { permission: PERMISSIONS.PARTNER_WRITE, organizationId: 'org-a' })).toBe(false);
    expect(can(user, { permission: PERMISSIONS.ORGANIZATION_READ, organizationId: 'org-b' })).toBe(false);
  });
});
