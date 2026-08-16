import {
  AppError,
  PARTNER_SCOPES,
  assertNoForbiddenFields,
  bankOutcomeRequestSchema,
  paymentIntentRequestSchema,
  telecomRiskEventRequestSchema,
  type PartnerScope,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Container } from '../container';
import { parseOrThrow } from '../validation';
import {
  emptySecurityOutcome,
  type PartnerRequestContext,
  type PartnerSecurityOutcome,
} from '../partner/authenticator';
import type { IdempotencyClaimHandle } from '../partner/idempotency';

/**
 * Production partner ingest. Unverified payloads never reach a use case: identification,
 * digest, signature, timestamp, nonce, scope, rate limit and idempotency all run first.
 */
export const createPartnerIngestRouter = (container: Container): Router => {
  const router = Router();

  const write =
    (scope: PartnerScope, handler: (req: Request, context: PartnerRequestContext) => Promise<Record<string, unknown>>) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (container.partner === undefined) {
        res.status(503).json({
          error: {
            code: 'dependency_unavailable',
            message: 'Partner integration is not configured in this provider mode.',
            correlationId: getCorrelationId(),
          },
        });
        return;
      }

      const started = container.clock.monotonicMs();
      const outcome: PartnerSecurityOutcome = emptySecurityOutcome();
      let handle: IdempotencyClaimHandle | undefined;
      const { authenticator, idempotency } = container.partner;

      try {
        assertNoForbiddenFields(req.body);
        const context = await authenticator.authenticate(req, outcome);
        authenticator.requireScope(context, scope);
        await authenticator.rateLimit(context, 'write', outcome);
        handle = await idempotency.claim(req, context, outcome);
        if (handle.kind === 'replay') {
          res.status(handle.status).json(handle.body);
          return;
        }
        const body = await handler(req, context);
        res.status(200).json(body);
        await idempotency.complete(handle, res, body);
      } catch (error) {
        if (handle !== undefined) {
          await idempotency.release(handle).catch(() => undefined);
        }
        if (error instanceof AppError) {
          outcome.errorCode = error.code;
          res.status(error.httpStatus);
        }
        next(error);
      } finally {
        const durationMs = Math.max(0, Math.round(container.clock.monotonicMs() - started));
        await authenticator
          .recordActivity(req, res.statusCode || 500, durationMs, outcome, getCorrelationId())
          .catch(() => undefined);
      }
    };

  router.post(
    '/risk-events',
    write(PARTNER_SCOPES.RISK_EVENTS_WRITE, async (req, context) => {
      const input = parseOrThrow(telecomRiskEventRequestSchema, req.body ?? {});
      return container.partner!.ingest.ingestTelecom(context, input);
    }),
  );

  router.post(
    '/payment-intents',
    write(PARTNER_SCOPES.PAYMENT_INTENTS_WRITE, async (req, context) => {
      const input = parseOrThrow(paymentIntentRequestSchema, req.body ?? {});
      return container.partner!.ingest.ingestPayment(context, input);
    }),
  );

  router.post(
    '/outcomes',
    write(PARTNER_SCOPES.OUTCOMES_WRITE, async (req, context) => {
      const input = parseOrThrow(bankOutcomeRequestSchema, req.body ?? {});
      return container.partner!.ingest.submitOutcome(context, input);
    }),
  );

  router.get('/recommendations/:id', async (req, res, next) => {
    if (container.partner === undefined) {
      res.status(503).json({
        error: {
          code: 'dependency_unavailable',
          message: 'Partner integration is not configured in this provider mode.',
          correlationId: getCorrelationId(),
        },
      });
      return;
    }
    const started = container.clock.monotonicMs();
    const outcome: PartnerSecurityOutcome = emptySecurityOutcome();
    try {
      const context = await container.partner.authenticator.authenticate(req, outcome);
      container.partner.authenticator.requireScope(context, PARTNER_SCOPES.RECOMMENDATIONS_READ);
      await container.partner.authenticator.rateLimit(context, 'read', outcome);
      const recommendation = await container.partner.ingest.findRecommendation(
        context.connection.organizationId,
        req.params.id,
      );
      if (recommendation === null) {
        res.status(404).json({
          error: {
            code: 'not_found',
            message: 'recommendation was not found.',
            correlationId: getCorrelationId(),
          },
        });
        return;
      }
      res.json(recommendation);
    } catch (error) {
      if (error instanceof AppError) {
        outcome.errorCode = error.code;
        res.status(error.httpStatus);
      }
      next(error);
    } finally {
      const durationMs = Math.max(0, Math.round(container.clock.monotonicMs() - started));
      await container.partner.authenticator
        .recordActivity(req, res.statusCode || 500, durationMs, outcome, getCorrelationId())
        .catch(() => undefined);
    }
  });

  router.get('/cases/:id', async (req, res, next) => {
    if (container.partner === undefined) {
      res.status(503).json({
        error: {
          code: 'dependency_unavailable',
          message: 'Partner integration is not configured in this provider mode.',
          correlationId: getCorrelationId(),
        },
      });
      return;
    }
    const started = container.clock.monotonicMs();
    const outcome: PartnerSecurityOutcome = emptySecurityOutcome();
    try {
      const context = await container.partner.authenticator.authenticate(req, outcome);
      container.partner.authenticator.requireScope(context, PARTNER_SCOPES.CASES_READ);
      await container.partner.authenticator.rateLimit(context, 'read', outcome);
      const recommendation = await container.partner.ingest.findLatestRecommendationForCase(
        context.connection.organizationId,
        req.params.id,
      );
      if (recommendation === null) {
        res.status(404).json({
          error: {
            code: 'not_found',
            message: 'case was not found.',
            correlationId: getCorrelationId(),
          },
        });
        return;
      }
      res.json({ caseId: req.params.id, recommendation });
    } catch (error) {
      if (error instanceof AppError) {
        outcome.errorCode = error.code;
        res.status(error.httpStatus);
      }
      next(error);
    } finally {
      const durationMs = Math.max(0, Math.round(container.clock.monotonicMs() - started));
      await container.partner.authenticator
        .recordActivity(req, res.statusCode || 500, durationMs, outcome, getCorrelationId())
        .catch(() => undefined);
    }
  });

  return router;
};
