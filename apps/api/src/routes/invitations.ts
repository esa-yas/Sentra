import {
  InvalidTokenError,
  PERMISSIONS,
  ValidationError,
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
} from '@sentra/contracts';
import { Router, type Request } from 'express';
import type { Container } from '../container';
import { createAuthorizer } from '../auth/require-permission';
import { requireAuthContext } from '../auth/request-context';
import { bearerTokenFrom } from '../auth/user-authentication';
import { parseOrThrow } from '../validation';

/**
 * Invitation endpoints.
 *
 * Listing, issuing and revoking are tenant-scoped administration (MEMBER_WRITE). The preview and
 * accept endpoints are different: the invitee is not a member of the organization yet, so they
 * cannot be authorized against it. Preview is unauthenticated but reveals only what the emailed
 * token already implies, and accept requires a valid user token whose email must match the
 * invited address.
 */
export const createInvitationsRouter = (container: Container): Router => {
  const router = Router();
  const auth = container.auth;
  const { requirePermission } = createAuthorizer(container.auth?.resolve);
  const memberRead = requirePermission(PERMISSIONS.MEMBER_READ);
  const memberWrite = requirePermission(PERMISSIONS.MEMBER_WRITE);

  const context = (
    req: Request,
  ): { organizationId: string; actor: { userId: string; label: string } } => {
    const ctx = requireAuthContext(req, auth !== undefined, 'Managing invitations');
    return {
      organizationId: ctx.organizationId,
      actor: { userId: ctx.principal.id, label: ctx.principal.label },
    };
  };

  router.get('/invitations', memberRead, async (req, res) => {
    const { organizationId } = context(req);
    res.json(await auth!.invitationAdmin.list(organizationId));
  });

  router.post('/invitations', memberWrite, async (req, res) => {
    const { organizationId, actor } = context(req);
    const input = parseOrThrow(createInvitationRequestSchema, req.body ?? {});
    res.status(201).json(await auth!.invitationAdmin.invite(organizationId, actor, input));
  });

  router.post('/invitations/:invitationId/revoke', memberWrite, async (req, res) => {
    const { organizationId, actor } = context(req);
    res.json(
      await auth!.invitationAdmin.revoke(
        organizationId,
        req.params['invitationId'] as string,
        actor,
      ),
    );
  });

  // Public: shows the invitee what they were invited to before they sign in.
  router.get('/invitations/preview', async (req, res) => {
    if (auth === undefined) {
      throw new InvalidTokenError();
    }
    const token = req.query['token'];
    if (typeof token !== 'string' || token === '') {
      throw new ValidationError('An invitation token is required.');
    }
    res.json(await auth.invitationAdmin.preview(token));
  });

  // Pending invitations for whoever is signed in. Used to recognise an invited employee who has
  // no membership yet, so they are never shown the create-your-organization flow.
  router.get('/invitations/mine', async (req, res) => {
    if (auth === undefined) {
      throw new InvalidTokenError();
    }
    const session = await auth.resolve.execute(bearerTokenFrom(req));
    res.json(await auth.invitationAdmin.listMine(session.profile.email));
  });

  router.post('/invitations/accept', async (req, res) => {
    if (auth === undefined) {
      throw new InvalidTokenError();
    }
    const session = await auth.resolve.execute(bearerTokenFrom(req));
    const input = parseOrThrow(acceptInvitationRequestSchema, req.body ?? {});
    res.json(
      await auth.invitationAdmin.accept(
        {
          ...(input.token === undefined ? {} : { token: input.token }),
          ...(input.invitationId === undefined ? {} : { invitationId: input.invitationId }),
        },
        {
          userId: session.profile.userId,
          email: session.profile.email,
          label: session.principal.label,
        },
        input.fullName,
      ),
    );
  });

  return router;
};
