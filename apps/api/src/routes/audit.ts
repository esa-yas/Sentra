import { ForbiddenError, PERMISSIONS, auditEventQuerySchema } from '@sentra/contracts';
import { Router, type Request } from 'express';
import type { Container } from '../container';
import { createAuthorizer } from '../auth/require-permission';
import { getAuthContext } from '../auth/request-context';
import { parseOrThrow } from '../validation';

/**
 * Audit chain reads for the active organization. Listing requires AUDIT_READ; recomputing the
 * hash chain requires AUDIT_VERIFY. Both are scoped to the caller's organization via the
 * authorization context, so an auditor can only ever inspect their own tenant's timeline.
 */
export const createAuditRouter = (container: Container): Router => {
  const router = Router();
  const auditRead = container.auditRead;
  const { requirePermission } = createAuthorizer(container.auth?.resolve);

  const organizationId = (req: Request): string => {
    const ctx = getAuthContext(req);
    if (auditRead === undefined || ctx === undefined) {
      throw new ForbiddenError('Audit access requires an authenticated member of the organization.');
    }
    return ctx.organizationId;
  };

  router.get('/audit/events', requirePermission(PERMISSIONS.AUDIT_READ), async (req, res) => {
    const org = organizationId(req);
    const query = parseOrThrow(auditEventQuerySchema, req.query);
    res.json(await auditRead!.listEvents(org, query));
  });

  router.post('/audit/verify', requirePermission(PERMISSIONS.AUDIT_VERIFY), async (req, res) => {
    const org = organizationId(req);
    res.json(await auditRead!.verifyChain(org));
  });

  return router;
};
