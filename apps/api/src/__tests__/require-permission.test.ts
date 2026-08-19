import {
  ForbiddenError,
  InvalidTokenError,
  MEMBER_ROLES,
  ORGANIZATION_TYPES,
  PERMISSIONS,
  TenantMismatchError,
  resolveRolePermissions,
  resolveRolePurposes,
  type UserPrincipal,
} from '@sentra/contracts';
import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { createAuthorizer, type UserSessionResolver } from '../auth/require-permission';
import { getAuthContext } from '../auth/request-context';

const principalWith = (
  organizationId: string,
  role: (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES],
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
      organizationType: ORGANIZATION_TYPES.BANK,
      role,
      permissions: resolveRolePermissions(role, ORGANIZATION_TYPES.BANK),
      purposes: resolveRolePurposes(role),
    },
  ],
});

const resolverFor = (principal: UserPrincipal): UserSessionResolver => ({
  execute: async (token) => {
    if (token !== 'good') {
      throw new InvalidTokenError();
    }
    return { principal };
  },
});

const mockReq = (opts: { auth?: string; org?: string } = {}): Request => {
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) headers['authorization'] = opts.auth;
  if (opts.org !== undefined) headers['x-organization-id'] = opts.org;
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
};

const invoke = async (
  handler: RequestHandler,
  req: Request,
): Promise<{ err: unknown; passed: boolean }> => {
  let err: unknown;
  let passed = false;
  await (handler as (req: Request, res: Response, next: (e?: unknown) => void) => Promise<void>)(
    req,
    {} as Response,
    (e?: unknown) => {
      if (e !== undefined) err = e;
      else passed = true;
    },
  );
  return { err, passed };
};

describe('createAuthorizer / requirePermission', () => {
  it('passes through every request when auth is not configured (demo mode)', async () => {
    const { requirePermission, authEnabled } = createAuthorizer(undefined);
    expect(authEnabled).toBe(false);
    const { passed, err } = await invoke(requirePermission(PERMISSIONS.ORGANIZATION_READ), mockReq());
    expect(passed).toBe(true);
    expect(err).toBeUndefined();
  });

  it('allows a member holding the permission and attaches the auth context', async () => {
    const { requirePermission } = createAuthorizer(resolverFor(principalWith('org-a', MEMBER_ROLES.OWNER)));
    const req = mockReq({ auth: 'Bearer good' });
    const { passed } = await invoke(requirePermission(PERMISSIONS.PARTNER_WRITE), req);
    expect(passed).toBe(true);
    expect(getAuthContext(req)?.organizationId).toBe('org-a');
  });

  it('rejects a member lacking the permission with ForbiddenError', async () => {
    const { requirePermission } = createAuthorizer(resolverFor(principalWith('org-a', MEMBER_ROLES.ANALYST)));
    const { err } = await invoke(requirePermission(PERMISSIONS.PARTNER_WRITE), mockReq({ auth: 'Bearer good' }));
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects an X-Organization-Id the caller is not a member of', async () => {
    const { requirePermission } = createAuthorizer(resolverFor(principalWith('org-a', MEMBER_ROLES.OWNER)));
    const { err } = await invoke(
      requirePermission(PERMISSIONS.ORGANIZATION_READ),
      mockReq({ auth: 'Bearer good', org: 'org-b' }),
    );
    expect(err).toBeInstanceOf(TenantMismatchError);
  });

  it('rejects a request with no bearer token', async () => {
    const { requirePermission } = createAuthorizer(resolverFor(principalWith('org-a', MEMBER_ROLES.OWNER)));
    const { err } = await invoke(requirePermission(PERMISSIONS.ORGANIZATION_READ), mockReq());
    expect(err).toBeInstanceOf(InvalidTokenError);
  });
});
