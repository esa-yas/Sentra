import { ForbiddenError, type UserPrincipal } from '@sentra/contracts';
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

/**
 * Reads the context a tenant-scoped handler needs, distinguishing the two ways it can be absent.
 *
 * When the API runs without a user store (in-memory provider mode) the authorization guard is a
 * pass-through, so no context is ever attached. Reporting that as "you are not an authenticated
 * member" blames the caller for a server misconfiguration and sends people hunting through their
 * login; the message therefore names the real cause and the fix.
 */
export const requireAuthContext = (
  req: Request,
  authConfigured: boolean,
  action = 'This action',
): AuthContext => {
  if (!authConfigured) {
    throw new ForbiddenError(
      `${action} needs the API's user store, which is not wired in "in-memory" provider mode. Start the API with SENTRA_PROVIDER_MODE=real (for example \`pnpm dev:real\`) and Supabase configured.`,
    );
  }
  const context = getAuthContext(req);
  if (context === undefined) {
    throw new ForbiddenError(`${action} requires an authenticated member.`);
  }
  return context;
};
