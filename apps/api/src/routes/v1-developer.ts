import { simulatorEvaluateRequestSchema } from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { Router, type Response } from 'express';
import type { Container } from '../container';
import { parseOrThrow } from '../validation';

/**
 * The public developer API, authenticated by a secret API key (`sk_test_…` / `sk_live_…`) as a
 * bearer token — the surface documented at /docs. Distinct from the partner-ingest edge (which
 * uses OAuth client credentials + signed requests): this is the self-serve developer path a
 * signed-up organization uses with the keys it minted in the console.
 *
 * A TEST key runs the decision engine over the submitted (synthetic) inputs and never reaches any
 * live network; a LIVE key is only issued to an approved organization. Either way the bank decides
 * — the response is an advisory recommendation.
 */
export const createDeveloperApiRouter = (container: Container): Router => {
  const router = Router();
  const auth = container.auth;

  const unauthorized = (res: Response): void => {
    res.status(401).json({
      error: {
        code: 'unauthorized',
        message: 'Provide a valid secret key as a bearer token: Authorization: Bearer sk_test_…',
        correlationId: getCorrelationId(),
      },
    });
  };

  router.post('/evaluate', async (req, res) => {
    const header = req.header('authorization') ?? '';
    const secret = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (auth === undefined || secret === '') {
      unauthorized(res);
      return;
    }
    const key = await auth.apiKeyAdmin.authenticate(secret);
    if (key === null) {
      unauthorized(res);
      return;
    }

    const input = parseOrThrow(simulatorEvaluateRequestSchema, req.body ?? {});
    const output = await container.evaluate.execute(input, {
      correlationId: getCorrelationId(),
      actorLabel: `apikey:${key.keyId}`,
      organizationId: key.organizationId,
      subjectRef: input.subjectRef ?? container.syntheticSubjectRef,
    });
    container.store.recordEvaluation(output);

    res.setHeader('x-sentra-environment', key.environment);
    res.status(200).json(output.recommendation);
  });

  return router;
};
