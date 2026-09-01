import {
  protectionSessionRequestSchema,
  resolveSessionRequestSchema,
  submitAnswersRequestSchema,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router, type Request, type Response } from 'express';
import type { Container } from '../container';
import type { PartnerRequestContext } from '../partner/authenticator';
import { parseOrThrow } from '../validation';

/**
 * The mobile-SDK edge for protection sessions.
 *
 * A bank's app authenticates with a secret key as a bearer token — the same simple model as
 * `/v1/evaluate`, and the right one for an SDK: it ships with a key, not with request-signing
 * material a client should never hold. The heavier partner-ingest edge (OAuth + signed requests)
 * still exists for server-to-server integrations; this is the path an app on a phone uses.
 *
 * Every route reuses the one {@link ProtectionSessionService}, so the SDK, the partner edge and
 * the console all get identical verdicts, copy and learning — there is no second implementation
 * of "what is a scam" to drift.
 */
export const createSdkRouter = (container: Container): Router => {
  const router = Router();

  const fail = (res: Response, status: number, code: string, message: string): void => {
    res.status(status).json({ error: { code, message, correlationId: getCorrelationId() } });
  };

  /// Authenticates the key and hands back the minimal context the service reads. Returns null
  /// (having already answered) when the key is missing, unknown or the runtime lacks a user store.
  const contextFor = async (
    req: Request,
    res: Response,
  ): Promise<PartnerRequestContext | null> => {
    if (container.auth === undefined || container.partner === undefined) {
      fail(res, 503, 'dependency_unavailable',
        'Protection sessions are not available in this provider mode.');
      return null;
    }
    const header = req.header('authorization') ?? '';
    const secret = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (secret === '') {
      fail(res, 401, 'unauthorized',
        'Provide your Sentra key as a bearer token: Authorization: Bearer sk_test_…');
      return null;
    }
    const key = await container.auth.apiKeyAdmin.authenticate(secret);
    if (key === null) {
      fail(res, 401, 'unauthorized', 'That key is not valid.');
      return null;
    }
    // The service reads only the organization, the connection id (for provenance) and a label
    // (for the audit trail). A synthesized context supplies exactly those and nothing more.
    return {
      principal: { kind: 'partner', id: `sdk:${key.organizationId}`, label: 'mobile-sdk' },
      connection: { id: `sdk:${key.organizationId}`, organizationId: key.organizationId },
      keyId: 'sdk',
      nonce: 'sdk',
      rawBody: Buffer.alloc(0),
    } as unknown as PartnerRequestContext;
  };

  router.post('/sdk/protection-sessions', async (req, res, next) => {
    try {
      const context = await contextFor(req, res);
      if (context === null) return;
      const input = parseOrThrow(protectionSessionRequestSchema, req.body ?? {});
      res.status(201).json(await container.partner!.protectionSessions.open(context, input));
    } catch (error) {
      next(error);
    }
  });

  router.post('/sdk/protection-sessions/:sessionId/answers', async (req, res, next) => {
    try {
      const context = await contextFor(req, res);
      if (context === null) return;
      const input = parseOrThrow(submitAnswersRequestSchema, req.body ?? {});
      res.json(
        await container.partner!.protectionSessions.submitAnswers(
          context,
          req.params.sessionId as string,
          input,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/sdk/protection-sessions/:sessionId/resolve', async (req, res, next) => {
    try {
      const context = await contextFor(req, res);
      if (context === null) return;
      const input = parseOrThrow(resolveSessionRequestSchema, req.body ?? {});
      res.json(
        await container.partner!.protectionSessions.resolve(
          context,
          req.params.sessionId as string,
          input,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
};
