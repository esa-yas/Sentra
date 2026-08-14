import { describe, expect, it } from 'vitest';
import {
  MEMBER_ROLES,
  PARTNER_SCOPES,
  PERMISSIONS,
  resolveRolePermissions,
  resolveScopePermissions,
  scopesAllowedForOrganizationType,
} from '../authorization';
import { ORGANIZATION_TYPES } from '../organization';

describe('role permissions', () => {
  it('lets a platform owner onboard new tenants', () => {
    const permissions = resolveRolePermissions(MEMBER_ROLES.OWNER, ORGANIZATION_TYPES.PLATFORM);

    expect(permissions).toContain(PERMISSIONS.ORGANIZATION_CREATE);
  });

  it('does not let a bank owner create other tenants', () => {
    const permissions = resolveRolePermissions(MEMBER_ROLES.OWNER, ORGANIZATION_TYPES.BANK);

    expect(permissions).not.toContain(PERMISSIONS.ORGANIZATION_CREATE);
    expect(permissions).toContain(PERMISSIONS.ORGANIZATION_WRITE);
  });

  it('gives an auditor verification rights without any write capability', () => {
    const permissions = resolveRolePermissions(MEMBER_ROLES.AUDITOR, ORGANIZATION_TYPES.BANK);

    expect(permissions).toContain(PERMISSIONS.AUDIT_VERIFY);
    expect(permissions).not.toContain(PERMISSIONS.PARTNER_WRITE);
    expect(permissions).not.toContain(PERMISSIONS.MEMBER_WRITE);
    expect(permissions).not.toContain(PERMISSIONS.ORGANIZATION_WRITE);
  });

  it('keeps secret rotation away from an analyst', () => {
    const permissions = resolveRolePermissions(MEMBER_ROLES.ANALYST, ORGANIZATION_TYPES.BANK);

    expect(permissions).not.toContain(PERMISSIONS.PARTNER_ROTATE_SECRET);
  });

  it('separates operations from case evidence', () => {
    // Slide 023 keeps security operations and administration apart: an operator watches
    // service health and must not gain investigative reach.
    const permissions = resolveRolePermissions(MEMBER_ROLES.OPERATOR, ORGANIZATION_TYPES.BANK);

    expect(permissions).toContain(PERMISSIONS.PARTNER_READ);
    expect(permissions).not.toContain(PERMISSIONS.RECOMMENDATION_READ);
    expect(permissions).not.toContain(PERMISSIONS.PARTNER_WRITE);
  });
});

describe('partner scope permissions', () => {
  it('translates scopes into the same permission vocabulary people use', () => {
    const permissions = resolveScopePermissions([
      PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
      PARTNER_SCOPES.OUTCOMES_WRITE,
    ]);

    expect(permissions).toEqual(
      expect.arrayContaining([PERMISSIONS.PAYMENT_INTENT_SUBMIT, PERMISSIONS.OUTCOME_SUBMIT]),
    );
  });

  it('deduplicates overlapping scopes', () => {
    const permissions = resolveScopePermissions([
      PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
      PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
    ]);

    expect(permissions).toEqual([PERMISSIONS.PAYMENT_INTENT_SUBMIT]);
  });

  it('grants nothing for an empty scope set', () => {
    expect(resolveScopePermissions([])).toEqual([]);
  });
});

describe('legal lane separation', () => {
  it('never lets a telecom tenant submit payment intents', () => {
    // Slide 076: the telecom and financial lanes carry different legal authority and the
    // architecture must not blur them, whatever a credential is configured with.
    const allowed = scopesAllowedForOrganizationType(ORGANIZATION_TYPES.TELECOM);

    expect(allowed).toEqual([PARTNER_SCOPES.RISK_EVENTS_WRITE]);
    expect(allowed).not.toContain(PARTNER_SCOPES.PAYMENT_INTENTS_WRITE);
    expect(allowed).not.toContain(PARTNER_SCOPES.RECOMMENDATIONS_READ);
  });

  it('never lets a bank tenant submit telecom risk events', () => {
    const allowed = scopesAllowedForOrganizationType(ORGANIZATION_TYPES.BANK);

    expect(allowed).not.toContain(PARTNER_SCOPES.RISK_EVENTS_WRITE);
    expect(allowed).toContain(PARTNER_SCOPES.PAYMENT_INTENTS_WRITE);
  });

  it('gives the platform tenant no partner data scopes at all', () => {
    // The network operator administers participants; it is not itself a participant.
    expect(scopesAllowedForOrganizationType(ORGANIZATION_TYPES.PLATFORM)).toEqual([]);
  });
});
