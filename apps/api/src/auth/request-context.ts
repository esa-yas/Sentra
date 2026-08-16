import type { UserPrincipal } from '@sentra/contracts';
import type { Request } from 'express';

/**
 * The authenticated context a protected route acts within: who the caller is, and the one
 * organization they are acting on for this request. Attached by the authorization middleware
 * (Slice 4B.2) and read by handlers to scope every tenant query.
 */
export interface AuthContext {
  readonly principal: UserPrincipal;
  readonly organizationId: string;
}

type RequestWithAuth = Request & { authz?: AuthContext };

export const setAuthContext = (req: Request, context: AuthContext): void => {
  (req as RequestWithAuth).authz = context;
};

export const getAuthContext = (req: Request): AuthContext | undefined =>
  (req as RequestWithAuth).authz;
