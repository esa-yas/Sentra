import {
  AUDIT_HASH_GENESIS,
  computeAuditHashSelf,
  type AuditCanonicalEvent,
} from '@sentra/contracts';
import { ACTOR_TYPES, AUDIT_ACTIONS, AUDIT_OUTCOMES, PURPOSES } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import type { AuditProvider, AuditRecordInput } from '@sentra/ports';
import type { UnitOfWorkContractHarness } from './unit-of-work.contract';

export interface AuditProviderContractHarness extends UnitOfWorkContractHarness {
  readonly audit: AuditProvider;
  readonly listCommittedEvents: () => readonly unknown[];
}

const sampleInput = (): AuditRecordInput => ({
  organizationId: '01ORG_AUDIT_TEST',
  actorType: ACTOR_TYPES.USER,
  actorId: '01USER_1',
  actorLabel: 'operator',
  action: AUDIT_ACTIONS.MEMBER_ADDED,
  resourceType: 'organization_member',
  resourceId: '01MEMBER_1',
  purpose: PURPOSES.PARTNER_ADMINISTRATION,
  outcome: AUDIT_OUTCOMES.ALLOWED,
  occurredAt: new Date('2026-08-11T12:00:00.000Z'),
});

export const describeAuditProviderContract = (
  name: string,
  factory: () => AuditProviderContractHarness,
): void => {
  describe(`${name} AuditProvider`, () => {
    it('does not commit transactional records until the unit of work succeeds', async () => {
      const { audit, uow, listCommittedEvents } = factory();

      await expect(
        uow.run(async (scope) => {
          await audit.record(sampleInput(), scope);
          throw new Error('rollback audit');
        }),
      ).rejects.toThrow('rollback audit');

      expect(listCommittedEvents()).toHaveLength(0);
    });

    it('commits transactional records together with the surrounding unit of work', async () => {
      const { audit, uow, listCommittedEvents } = factory();

      await uow.run(async (scope) => {
        await audit.record(sampleInput(), scope);
      });

      expect(listCommittedEvents()).toHaveLength(1);
    });

    it('commits standalone records immediately', async () => {
      const { audit, listCommittedEvents } = factory();

      await audit.recordStandalone(sampleInput());

      expect(listCommittedEvents()).toHaveLength(1);
    });

    it('returns a hash chain digest for every committed record', async () => {
      const { audit, uow } = factory();

      const recorded = await uow.run(async (scope) => audit.record(sampleInput(), scope));

      expect(recorded.hashPrev).toBeTruthy();
      expect(recorded.hashSelf).toBeTruthy();
      expect(recorded.sequence).toBeGreaterThan(0n);
    });

    it('produces hashSelf from the version-1 canonical bytes', async () => {
      const { audit, uow } = factory();
      const input = sampleInput();

      const recorded = await uow.run(async (scope) => audit.record(input, scope));

      const canonical: AuditCanonicalEvent = {
        chainKey: recorded.chainKey,
        sequence: recorded.sequence,
        id: recorded.id,
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        purpose: input.purpose,
        outcome: input.outcome ?? AUDIT_OUTCOMES.ALLOWED,
        correlationId: '',
        requestId: null,
        ipHash: null,
        userAgentHash: null,
        occurredAt: input.occurredAt ?? new Date('2026-08-11T12:00:00.000Z'),
        dataBefore: input.dataBefore ?? null,
        dataAfter: input.dataAfter ?? null,
        metadata: input.metadata ?? null,
      };

      expect(recorded.hashPrev).toBe(AUDIT_HASH_GENESIS);
      expect(recorded.hashSelf).toBe(computeAuditHashSelf(recorded.hashPrev, canonical));
    });
  });
};
