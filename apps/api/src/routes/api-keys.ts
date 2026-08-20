import { ForbiddenError, PERMISSIONS, createApiKeyRequestSchema } from '@sentra/contracts';
import { Router, type Request } from 'express';
import type { Container } from '../container';
import { createAuthorizer } from '../auth/require-permission';
import { getAuthContext } from '../auth/request-context';
import { parseOrThrow } from '../validation';

/**
 * Developer API key management for the active organization. Reads require PARTNER_READ; minting
 * and revoking require PARTNER_WRITE and are audited. Tenant scope and the acting user come from
 * the authorization context, so a caller can only manage the organization they authenticated
 * against.
 */
export const createApiKeysRouter = (container: Container): Router => {
  const router = Router();
  const apiKeyAdmin = container.auth?.apiKeyAdmin;
  const { requirePermission } = createAuthorizer(container.auth?.resolve);
  const read = requirePermission(PERMISSIONS.PARTNER_READ);
  const write = requirePermission(PERMISSIONS.PARTNER_WRITE);

  const context = (
    req: Request,
  ): { organizationId: string; actor: { userId: string; label: string } } => {
    const ctx = getAuthContext(req);
    if (apiKeyAdmin === undefined || ctx === undefined) {
      throw new ForbiddenError('API key management requires an authenticated member.');
    }
    return {
      organizationId: ctx.organizationId,
      actor: { userId: ctx.principal.id, label: ctx.principal.label },
    };
  };

  router.get('/keys', read, async (req, res) => {
    const { organizationId } = context(req);
    res.json(await apiKeyAdmin!.list(organizationId));
  });

  router.post('/keys', write, async (req, res) => {
    const { organizationId, actor } = context(req);
    const input = parseOrThrow(createApiKeyRequestSchema, req.body ?? {});
    res.status(201).json(await apiKeyAdmin!.create(organizationId, actor, input));
  });

  router.post('/keys/:keyId/revoke', write, async (req, res) => {
    const { organizationId, actor } = context(req);
    res.json(await apiKeyAdmin!.revoke(organizationId, req.params['keyId'] as string, actor));
  });

  return router;
};
