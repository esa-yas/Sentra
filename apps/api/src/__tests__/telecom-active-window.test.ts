import type { AuditProvider, Clock, IdGenerator } from '@sentra/ports';
import { describe, expect, it, vi } from 'vitest';
import { createPartnerIngest } from '../partner/ingest';
import type { PartnerRequestContext } from '../partner/authenticator';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const clock: Clock = { now: () => NOW, monotonicMs: () => 0 };
const ids: IdGenerator = { generate: () => 'id_1' };
const audit = { recordStandalone: vi.fn(async () => undefined) } as unknown as AuditProvider;
const context = {
  connection: { id: 'conn_1', organizationId: 'telco_1', environment: 'SANDBOX' },
  principal: { label: 'partner:conn_1' },
} as unknown as PartnerRequestContext;

const build = (persistTelecomEvent: (input: unknown) => Promise<unknown>) =>
  createPartnerIngest({
    clock,
    ids,
    audit,
    domain: { persistTelecomEvent } as never,
    evaluate: {} as never,
  });

// The full request the schema would produce (defaults already applied upstream).
const req = (over: Record<string, unknown> = {}) => ({
  subjectRef: 'sbj_1',
  purpose: 'PROTECT_PAYMENT' as const,
  eventType: 'scam.risk.v1',
  recentSuspiciousCall: true,
  callerReputation: 'SUSPECT' as const,
  callDurationSeconds: 120,
  deviceChange: false,
  accountTakeoverIndicators: false,
  scamCampaignMatch: false,
  telecomEvidence: 'OK' as const,
  severity: 'HIGH' as const,
  activeWindowSeconds: 300,
  ...over,
});

describe('telecom risk event active window', () => {
  it('stamps expiresAt at observedAt + the active window (default 5 minutes)', async () => {
    const persist = vi.fn(async () => ({ receivedAt: NOW }));
    await build(persist).ingestTelecom(context, req());
    const arg = persist.mock.calls[0]![0] as { observedAt: Date; expiresAt: Date };
    expect(arg.expiresAt.getTime() - arg.observedAt.getTime()).toBe(300_000);
  });

  it('honours a shorter window when the telecom sends one', async () => {
    const persist = vi.fn(async () => ({ receivedAt: NOW }));
    await build(persist).ingestTelecom(context, req({ activeWindowSeconds: 60 }));
    const arg = persist.mock.calls[0]![0] as { observedAt: Date; expiresAt: Date };
    expect(arg.expiresAt.getTime() - arg.observedAt.getTime()).toBe(60_000);
  });

  it('measures the window from an explicit observedAt, not receipt time', async () => {
    const persist = vi.fn(async () => ({ receivedAt: NOW }));
    const observed = '2026-08-26T11:58:00.000Z';
    await build(persist).ingestTelecom(context, req({ observedAt: observed }));
    const arg = persist.mock.calls[0]![0] as { observedAt: Date; expiresAt: Date };
    expect(arg.observedAt.toISOString()).toBe(observed);
    expect(arg.expiresAt.toISOString()).toBe('2026-08-26T12:03:00.000Z');
  });
});
