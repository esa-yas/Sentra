import {
  assertNoForbiddenFields,
  simulatorEvaluateRequestSchema,
  simulatorScenarioListSchema,
} from '@sentra/contracts';
import { SIMULATOR_SCENARIOS } from '@sentra/core';
import { getCorrelationId } from '@sentra/observability';
import { Router } from 'express';
import type { Container } from '../container';
import { parseOrThrow } from '../validation';

/**
 * The risk decision simulator API. It calls the real decision use case (slide 067) and
 * returns the explainable recommendation plus the flow the console animates. The bank makes
 * the final decision; the response is worded as a recommendation throughout.
 */
export const createSimulatorRouter = (container: Container): Router => {
  const router = Router();

  router.get('/scenarios', (_req, res) => {
    res.json(simulatorScenarioListSchema.parse({ items: SIMULATOR_SCENARIOS }));
  });

  router.post('/evaluate', async (req, res) => {
    // Product boundary first: refuse card/account/credential fields outright (slide 031).
    assertNoForbiddenFields(req.body);

    const input = parseOrThrow(simulatorEvaluateRequestSchema, req.body ?? {});
    const correlationId = getCorrelationId();

    const output = await container.evaluate.execute(input, {
      correlationId,
      actorLabel: 'portal:risk-simulator',
      organizationId: container.syntheticOrganizationId,
      subjectRef: input.subjectRef ?? container.syntheticSubjectRef,
    });

    container.store.recordEvaluation(output);

    res.json({ recommendation: output.recommendation, flow: output.flow });
  });

  return router;
};
