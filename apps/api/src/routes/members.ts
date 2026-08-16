import {
  ForbiddenError,
  PERMISSIONS,
  ValidationError,
  addMemberRequestSchema,
  updateMemberRequestSchema,
} from '@sentra/contracts';
import { Router, type Request } from 'express';
import type { Container } from '../container';
import { createAuthorizer } from '../auth/require-permission';
import { getAuthContext } from '../auth/request-context';
import { parseOrThrow } from '../validation';

/**
 * Member administration for the active organization. Reads require MEMBER_READ; every mutation
 * requires MEMBER_WRITE and is audited. Tenant scope and the acting administrator both come
 * from the authorization context the guard attaches, so a caller can only manage the
 * organization they are authenticated against.
 */
export const createMembersRouter = (container: Container): Router => {
  const router = Router();
  const memberAdmin = container.auth?.memberAdmin;
  const { requirePermission } = createAuthorizer(container.auth?.resolve);
  const memberRead = requirePermission(PERMISSIONS.MEMBER_READ);
  const memberWrite = requirePermission(PERMISSIONS.MEMBER_WRITE);

  const context = (req: Request): { organizationId: string; actor: { userId: string; label: string } } => {
    const ctx = getAuthContext(req);
    if (memberAdmin === undefined || ctx === undefined) {
      throw new ForbiddenError('Member administration requires an authenticated administrator.');
    }
    return {
      organizationId: ctx.organizationId,
      actor: { userId: ctx.principal.id, label: ctx.principal.label },
    };
  };

  router.get('/members', memberRead, async (req, res) => {
    const { organizationId } = context(req);
    res.json(await memberAdmin!.list(organizationId));
  });

  router.post('/members', memberWrite, async (req, res) => {
    const { organizationId, actor } = context(req);
    const input = parseOrThrow(addMemberRequestSchema, req.body ?? {});
    if (input.email === undefined) {
      throw new ValidationError('Add members by email; the user must have signed in at least once.');
    }
    const created = await memberAdmin!.addByEmail(organizationId, input.email, input.role, actor);
    res.status(201).json(created);
  });

  router.patch('/members/:membershipId', memberWrite, async (req, res) => {
    const { organizationId, actor } = context(req);
    const input = parseOrThrow(updateMemberRequestSchema, req.body ?? {});
    const updated = await memberAdmin!.changeRole(
      organizationId,
      req.params['membershipId'] as string,
      input.role,
      actor,
    );
    res.json(updated);
  });

  router.delete('/members/:membershipId', memberWrite, async (req, res) => {
    const { organizationId, actor } = context(req);
    await memberAdmin!.remove(organizationId, req.params['membershipId'] as string, actor);
    res.json({ removed: true });
  });

  return router;
};
