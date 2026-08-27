import type { Prisma, PrismaClient } from '@sentra/db';
import type { SignalStat } from '@sentra/core';

/**
 * Persistence for protection sessions and the evidence they leave behind.
 *
 * Two responsibilities that belong together: the session record (what was advised, what the
 * customer answered, how it ended) and the running per-signal tallies the engine reads back as
 * learning. Keeping them in one store means a resolution updates both in a single transaction —
 * a session can never be marked resolved without its evidence being counted.
 */

export interface CreateProtectionSessionInput {
  readonly id: string;
  readonly organizationId: string;
  readonly subjectRef: string;
  readonly caseReference: string;
  readonly amount: number;
  readonly currency: string;
  readonly verdict: 'PROCEED' | 'WARN' | 'HOLD';
  readonly riskScore: number;
  readonly riskLevel: string;
  readonly reasonCodes: readonly string[];
  readonly correlationId: string;
  readonly source: string;
}

export interface StoredAnswer {
  readonly questionId: string;
  readonly optionId: string;
  readonly signal: string;
}

export interface ProtectionSessionRow {
  readonly id: string;
  readonly organizationId: string;
  readonly subjectRef: string;
  readonly caseReference: string;
  readonly amount: number;
  readonly currency: string;
  readonly verdict: 'PROCEED' | 'WARN' | 'HOLD';
  readonly riskScore: number;
  readonly riskLevel: string;
  readonly reasonCodes: readonly string[];
  readonly answers: readonly StoredAnswer[];
  readonly outcome: string | null;
  readonly confirmedScam: boolean | null;
  readonly createdAt: Date;
}

const toRow = (row: {
  id: string;
  organizationId: string;
  subjectRef: string;
  caseReference: string;
  amount: Prisma.Decimal;
  currency: string;
  verdict: string;
  riskScore: number;
  riskLevel: string;
  reasonCodes: string[];
  answers: Prisma.JsonValue | null;
  outcome: string | null;
  confirmedScam: boolean | null;
  createdAt: Date;
}): ProtectionSessionRow => ({
  id: row.id,
  organizationId: row.organizationId,
  subjectRef: row.subjectRef,
  caseReference: row.caseReference,
  amount: Number(row.amount),
  currency: row.currency,
  verdict: row.verdict as 'PROCEED' | 'WARN' | 'HOLD',
  riskScore: row.riskScore,
  riskLevel: row.riskLevel,
  reasonCodes: row.reasonCodes,
  answers: Array.isArray(row.answers) ? (row.answers as unknown as StoredAnswer[]) : [],
  outcome: row.outcome,
  confirmedScam: row.confirmedScam,
  createdAt: row.createdAt,
});

export class PrismaProtectionSessionStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateProtectionSessionInput): Promise<void> {
    await this.prisma.protectionSession.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        subjectRef: input.subjectRef,
        caseReference: input.caseReference,
        amount: input.amount,
        currency: input.currency,
        verdict: input.verdict,
        riskScore: input.riskScore,
        riskLevel: input.riskLevel,
        reasonCodes: [...input.reasonCodes],
        correlationId: input.correlationId,
        source: input.source,
      },
    });
  }

  public async find(
    organizationId: string,
    sessionId: string,
  ): Promise<ProtectionSessionRow | null> {
    const row = await this.prisma.protectionSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    return row === null ? null : toRow(row);
  }

  /** Records the customer's answers and the verdict they produced. */
  public async recordAnswers(
    sessionId: string,
    answers: readonly StoredAnswer[],
    verdict: 'PROCEED' | 'WARN' | 'HOLD',
    riskScore: number,
  ): Promise<void> {
    await this.prisma.protectionSession.update({
      where: { id: sessionId },
      data: {
        answers: answers as unknown as Prisma.InputJsonValue,
        verdict,
        riskScore,
      },
    });
  }

  /**
   * Closes a session and counts what it taught us.
   *
   * Every signal on the session gets an observation; those on a confirmed scam also get a scam
   * count. Both the tenant's own tally and the network-wide one are updated, so a bank benefits
   * from the network without its own evidence being diluted. Done in one transaction: evidence
   * that is counted twice, or not at all, would quietly corrupt every future score.
   */
  public async resolve(
    sessionId: string,
    organizationId: string,
    outcome: 'SENT' | 'ABANDONED' | 'HELD' | 'BLOCKED',
    confirmedScam: boolean | undefined,
    signalKeys: readonly string[],
    resolvedAt: Date,
    idFor: (scope: string, key: string) => string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.protectionSession.update({
        where: { id: sessionId },
        data: {
          outcome,
          ...(confirmedScam === undefined ? {} : { confirmedScam }),
          resolvedAt,
        },
      });

      // Only a real label teaches anything; an unresolved case is not evidence of innocence.
      if (confirmedScam === undefined) {
        return;
      }
      const scamIncrement = confirmedScam ? 1 : 0;
      for (const signalKey of signalKeys) {
        // Two scopes: this tenant's own evidence, and the network-wide tally (organizationId null).
        // Prisma cannot upsert on a composite key whose column is nullable, so read then write.
        for (const scope of [organizationId, null]) {
          const existing = await tx.signalOutcomeStat.findFirst({
            where: { organizationId: scope, signalKey },
            select: { id: true },
          });
          if (existing === null) {
            await tx.signalOutcomeStat.create({
              data: {
                id: idFor(scope ?? 'network', signalKey),
                organizationId: scope,
                signalKey,
                observedCount: 1,
                scamCount: scamIncrement,
              },
            });
            continue;
          }
          await tx.signalOutcomeStat.update({
            where: { id: existing.id },
            data: {
              observedCount: { increment: 1 },
              scamCount: { increment: scamIncrement },
            },
          });
        }
      }
    });
  }

  /**
   * The evidence for a set of signals, preferring the tenant's own tally and falling back to the
   * network-wide one. A bank with its own history is scored on it; a new bank still benefits from
   * everyone else's.
   */
  public async statsFor(
    organizationId: string,
    signalKeys: readonly string[],
  ): Promise<Map<string, SignalStat>> {
    if (signalKeys.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.signalOutcomeStat.findMany({
      where: {
        signalKey: { in: [...signalKeys] },
        OR: [{ organizationId }, { organizationId: null }],
      },
    });
    const stats = new Map<string, SignalStat>();
    for (const row of rows) {
      const existing = stats.get(row.signalKey);
      // Tenant rows win over network rows.
      if (existing === undefined || row.organizationId === organizationId) {
        stats.set(row.signalKey, {
          signalKey: row.signalKey,
          observedCount: row.observedCount,
          scamCount: row.scamCount,
        });
      }
    }
    return stats;
  }
}

export const createPrismaProtectionSessionStore = (
  prisma: PrismaClient,
): PrismaProtectionSessionStore => new PrismaProtectionSessionStore(prisma);
