import type { AuditProvider, Clock, IdGenerator } from '@sentra/ports';
import { describe, expect, it, vi } from 'vitest';
import { createPartnerIngest } from '../partner/ingest';
import type { PartnerRequestContext } from '../partner/authenticator';

const NOW = new Date('2026-08-26T00:00:00.000Z');
const clock: Clock = { now: () => NOW, monotonicMs: () => 0 };
const ids: IdGenerator = { generate: () => 'id_fixed' };
const audit = { recordStandalone: vi.fn(async () => undefined) } as unknown as AuditProvider;

const context = {
  connection: { id: 'conn_1', organizationId: 'telco_1', environment: 'SANDBOX' },
  principal: { label: 'partner:conn_1' },
} as unknown as PartnerRequestContext;

// Only the domain-store methods used by the feedback paths need to exist.
const buildIngest = (domain: Record<string, unknown>) =>
  createPartnerIngest({
    clock,
    ids,
    audit,
    domain: domain as never,
    evaluate: {} as never,
  });

describe('telecom case feedback', () => {
  it('lists pending cases with the bank decision the telecom needs to assess', async () => {
    const ingest = buildIngest({
      listPendingTelecomFeedback: async () => [
        {
          caseId: 'case_1',
          subjectRef: 'sbj_1',
          bankDecision: 'BLOCKED',
          outcomeClassification: 'CONFIRMED_SCAM',
          decidedAt: NOW,
        },
      ],
    });
    const res = await ingest.listPendingFeedback(context);
    expect(res.items).toEqual([
      {
        caseId: 'case_1',
        subjectRef: 'sbj_1',
        bankDecision: 'BLOCKED',
        outcomeClassification: 'CONFIRMED_SCAM',
        decidedAt: NOW.toISOString(),
      },
    ]);
  });

  it('records a telecom assessment and audits it', async () => {
    const recordCaseFeedback = vi.fn(async () => ({ ok: true as const, recordedAt: NOW }));
    const ingest = buildIngest({ recordCaseFeedback });
    const res = await ingest.submitCaseFeedback(context, {
      caseId: 'case_1',
      assessment: 'SCAM',
      note: 'matched a campaign',
    });
    expect(res).toMatchObject({ caseId: 'case_1', assessment: 'SCAM' });
    expect(recordCaseFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'telco_1', caseId: 'case_1', assessment: 'SCAM' }),
    );
    expect(audit.recordStandalone).toHaveBeenCalled();
  });

  // A telecom must not be able to assess a case its signals never contributed to.
  it('refuses feedback on a case that is not the telecom’s', async () => {
    const ingest = buildIngest({
      recordCaseFeedback: async () => ({ ok: false as const, reason: 'CASE_NOT_FOUND' as const }),
    });
    await expect(
      ingest.submitCaseFeedback(context, { caseId: 'other', assessment: 'SCAM' }),
    ).rejects.toThrow(/not one your signals contributed to/i);
  });
});
