import {
  ForbiddenError,
  HTTP_HEADERS,
  TenantMismatchError,
  authorize,
  type Permission,
  type UserPrincipal,
} from '@sentra/contracts';
import type { Request, RequestHandler } from 'express';
import { bearerTokenFrom } from './user-authentication';
import { setAuthContext } from './request-context';

/** The subset of the identity use case the authorizer needs — just resolving a principal. */
export interface UserSessionResolver {
  execute(rawToken: string): Promise<{ principal: UserPrincipal }>;
}

/**
 * Resolves which organization the caller is acting on. An explicit `X-Organization-Id` header
 * is honoured only if it names one of the caller's memberships (otherwise it is a cross-tenant
 * attempt). With no header, a single-membership user acts on their sole tenant; a
 * multi-membership user must choose, so an unscoped request is refused rather than guessed.
 */
const resolveActiveOrganization = (req: Request, principal: UserPrincipal): string => {
  const organizationIds = principal.memberships.map((membership) => membership.organizationId);
  const requested = req.header(HTTP_HEADERS.ORGANIZATION_ID);

  if (requested !== undefined && requested.trim() !== '') {
    if (!organizationIds.includes(requested)) {
      throw new TenantMismatchError();
    }
    return requested;
  }
  if (organizationIds.length === 1) {
    return organizationIds[0]!;
  }
  if (organizationIds.length === 0) {
    throw new ForbiddenError('The user has no active organization membership.');
  }
  throw new ForbiddenError('Select an organization for this request via the organization header.');
};

/**
 * Builds the `requirePermission` guard. When no resolver is supplied — auth is not configured
 * (demo/in-memory mode) — every guard is a pass-through, so the console runs open exactly as
 * before. When it is supplied, each guard verifies the caller, resolves and validates the
 * active organization, and enforces the permission, attaching the {@link AuthContext} the
 * handlers read to scope their queries.
 */
export const createAuthorizer = (resolver: UserSessionResolver | undefined) => {
  const requirePermission =
    (permission: Permission): RequestHandler =>
    async (req, _res, next) => {
      try {
        if (resolver === undefined) {
          next();
          return;
        }
        const { principal } = await resolver.execute(bearerTokenFrom(req));
        const organizationId = resolveActiveOrganization(req, principal);
        authorize(principal, { permission, organizationId });
        setAuthContext(req, { principal, organizationId });
        next();
      } catch (error) {
        next(error);
      }
    };

  return { requirePermission, authEnabled: resolver !== undefined };
};
