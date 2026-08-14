import { AI_RESULT_STATUSES, AI_TASKS, type AIProvider } from '@sentra/ports';
import { PURPOSES } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';

export interface AIProviderContractHarness {
  readonly ai: AIProvider;
  readonly markUnavailable: () => void;
  readonly markBlocked: () => void;
  readonly markInvalidOutput: () => void;
  readonly setStructuredResponse: (value: unknown) => void;
}

export const describeAIProviderContract = (name: string, factory: () => AIProviderContractHarness): void => {
  describe(`${name} AIProvider`, () => {
    const baseRequest = () => ({
      task: AI_TASKS.CLASSIFY_INDICATORS,
      purpose: PURPOSES.PROTECT_PAYMENT,
      promptVersion: 'classify.v1',
      input: { indicators: ['RECENT_SIM_CHANGE'] },
      responseSchemaVersion: '1',
      timeoutMs: 250,
      correlationId: 'crl_ai_contract',
      organizationId: '01ORG_BANK',
      validate: (candidate: unknown) => {
        if (
          typeof candidate === 'object' &&
          candidate !== null &&
          Array.isArray((candidate as { indicators?: unknown }).indicators)
        ) {
          return { ok: true as const, value: candidate as { indicators: string[] } };
        }
        return { ok: false as const, problems: ['indicators must be an array'] };
      },
    });

    it('returns structured output when validation succeeds', async () => {
      const { ai, setStructuredResponse } = factory();
      setStructuredResponse({ indicators: ['RECENT_SIM_CHANGE'] });

      const result = await ai.execute(baseRequest());

      expect(result.status).toBe(AI_RESULT_STATUSES.OK);
      if (result.status === AI_RESULT_STATUSES.OK) {
        expect(result.value).toEqual({ indicators: ['RECENT_SIM_CHANGE'] });
      }
    });

    it('returns TIMEOUT when the deadline is zero', async () => {
      const { ai } = factory();
      const result = await ai.execute({ ...baseRequest(), timeoutMs: 0 });
      expect(result.status).toBe(AI_RESULT_STATUSES.TIMEOUT);
    });

    it('returns ERROR when the provider is unavailable', async () => {
      const { ai, markUnavailable } = factory();
      markUnavailable();
      const result = await ai.execute(baseRequest());
      expect(result.status).toBe(AI_RESULT_STATUSES.ERROR);
    });

    it('returns INVALID_OUTPUT when validation fails', async () => {
      const { ai, markInvalidOutput } = factory();
      markInvalidOutput();
      const result = await ai.execute(baseRequest());
      expect(result.status).toBe(AI_RESULT_STATUSES.INVALID_OUTPUT);
    });

    it('returns BLOCKED when input is refused before transmission', async () => {
      const { ai, markBlocked } = factory();
      markBlocked();
      const result = await ai.execute(baseRequest());
      expect(result.status).toBe(AI_RESULT_STATUSES.BLOCKED);
    });
  });
};
