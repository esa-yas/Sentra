import {
  ForbiddenError,
  InvalidTokenError,
  PERMISSIONS,
  organizationSignupRequestSchema,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router, type Request } from 'express';
import type { Container } from '../container';
import { createAuthorizer } from '../auth/require-permission';
import { getAuthContext } from '../auth/request-context';
import { bearerTokenFrom } from '../auth/user-authentication';
import { parseOrThrow } from '../validation';

/**
 * Self-service organization signup.
 *
 * Unlike the tenant-scoped routes, this one only requires a *valid user token* — a brand-new
 * user has no membership yet, so there is no organization to authorize against. The token is
 * verified (and the user provisioned just-in-time) by `auth.resolve`; the caller then becomes
 * the OWNER of a new SANDBOX tenant.
 */
export const createOrgsRouter = (container: Container): Router => {
  const router = Router();
  const auth = container.auth;
  const { requirePermission } = createAuthorizer(container.auth?.resolve);
  const orgRead = requirePermission(PERMISSIONS.ORGANIZATION_READ);
  const orgWrite = requirePermission(PERMISSIONS.ORGANIZATION_WRITE);

  const context = (
    req: Request,
  ): { organizationId: string; actor: { userId: string; label: string } } => {
    const ctx = getAuthContext(req);
    if (auth === undefined || ctx === undefined) {
      throw new ForbiddenError('This action requires an authenticated member.');
    }
    return {
      organizationId: ctx.organizationId,
      actor: { userId: ctx.principal.id, label: ctx.principal.label },
    };
  };

  router.post('/orgs/signup', async (req, res) => {
    if (auth === undefined) {
      throw new InvalidTokenError();
    }
    const session = await auth.resolve.execute(bearerTokenFrom(req));
    const input = parseOrThrow(organizationSignupRequestSchema, req.body ?? {});
    const result = await auth.orgSignup.execute(
      { userId: session.profile.userId, label: session.principal.label },
      input,
    );
    container.logger.info('organization_signed_up', {
      userId: session.profile.userId,
      organizationId: result.id,
      approvalStatus: result.approvalStatus,
      correlationId: getCorrelationId(),
    });
    res.status(201).json(result);
  });

  router.get('/orgs/current', orgRead, async (req, res) => {
    const { organizationId } = context(req);
    res.json(await auth!.orgAdmin.getCurrent(organizationId));
  });

  router.post('/orgs/request-go-live', orgWrite, async (req, res) => {
    const { organizationId, actor } = context(req);
    res.json(await auth!.orgAdmin.requestGoLive(organizationId, actor));
  });

  return router;
};
