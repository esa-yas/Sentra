import { InvalidTokenError } from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router } from 'express';
import type { Container } from '../container';
import { bearerTokenFrom } from '../auth/user-authentication';

/**
 * Portal session endpoints (Slice 4B.1).
 *
 * Authentication happens in Supabase; the server only verifies the resulting JWT and resolves
 * it to a {@link import('@sentra/contracts').UserPrincipal}. `/auth/config` lets the console
 * decide whether to enforce a login gate at all, so the in-memory demo mode (no user store)
 * keeps working without one. Tokens are never logged — only the resolved user id and the
 * shape of their access.
 */
export const createAuthRouter = (container: Container): Router => {
  const router = Router();
  const auth = container.auth;

  // Advertises whether human authentication is wired, so the console only enforces a login
  // gate when there is a user store to authenticate against.
  router.get('/auth/config', (_req, res) => {
    res.json({ enabled: auth !== undefined, providerMode: container.providerMode });
  });

  router.get('/auth/me', async (req, res) => {
    if (auth === undefined) {
      throw new InvalidTokenError();
    }
    const session = await auth.resolve.execute(bearerTokenFrom(req));
    container.logger.info('user_authenticated', {
      userId: session.profile.userId,
      memberships: session.principal.memberships.length,
      provisioned: session.provisioned,
      correlationId: getCorrelationId(),
    });
    res.json({
      user: {
        id: session.profile.userId,
        email: session.profile.email,
        displayName: session.profile.displayName,
      },
      memberships: session.principal.memberships,
      provisioned: session.provisioned,
      providerMode: container.providerMode,
    });
  });

  router.post('/auth/logout', async (req, res) => {
    if (auth !== undefined) {
      try {
        const session = await auth.resolve.execute(bearerTokenFrom(req));
        container.logger.info('user_logout', {
          userId: session.profile.userId,
          correlationId: getCorrelationId(),
        });
      } catch {
        // Logging out with an already-invalid or absent token is not an error.
      }
    }
    res.json({ ok: true });
  });

  return router;
};
