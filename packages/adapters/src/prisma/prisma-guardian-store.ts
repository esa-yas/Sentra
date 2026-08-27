import type { PrismaClient } from '@sentra/db';
import type { GuardianLinkView, ProtectionPolicyView } from '@sentra/core';

/**
 * Reads and writes the two things guardian routing depends on: the bank's policy and the
 * customer's chosen guardian. Both are small, hot reads on the payment path, so they are kept
 * separate from the session store and fetched together.
 */

export interface UpsertGuardianInput {
  readonly id: string;
  readonly organizationId: string;
  readonly subjectRef: string;
  readonly reviewRoute: 'NONE' | 'BANK' | 'GUARDIAN' | 'GUARDIAN_THEN_BANK';
  readonly guardianLabel: string;
  readonly contactRef: string;
  readonly correlationId: string;
}

export interface GuardianRecord extends GuardianLinkView {
  readonly id: string;
  readonly guardianLabel: string;
  readonly acceptedAt: Date | null;
}

export class PrismaGuardianStore {
  public constructor(private readonly prisma: PrismaClient) {}

  /** The bank's policy, or null when it has never configured one. */
  public async policyFor(organizationId: string): Promise<ProtectionPolicyView | null> {
    const row = await this.prisma.protectionPolicy.findUnique({ where: { organizationId } });
    return row === null
      ? null
      : {
          guardianEnabled: row.guardianEnabled,
          releaseCeiling: Number(row.releaseCeiling),
          overrideScore: row.overrideScore,
          windowSeconds: row.windowSeconds,
        };
  }

  public async guardianFor(
    organizationId: string,
    subjectRef: string,
  ): Promise<GuardianRecord | null> {
    const row = await this.prisma.guardianLink.findUnique({
      where: { organizationId_subjectRef: { organizationId, subjectRef } },
    });
    return row === null
      ? null
      : {
          id: row.id,
          reviewRoute: row.reviewRoute,
          status: row.status,
          guardianLabel: row.guardianLabel,
          acceptedAt: row.acceptedAt,
        };
  }

  /**
   * Names or updates a customer's guardian.
   *
   * Changing who the guardian is resets consent to PENDING: a new person must accept for
   * themselves, and until they do, holds route to the bank. Changing only the routing choice
   * leaves an already-accepted guardian in place.
   */
  public async upsertGuardian(input: UpsertGuardianInput): Promise<GuardianRecord> {
    const existing = await this.prisma.guardianLink.findUnique({
      where: {
        organizationId_subjectRef: {
          organizationId: input.organizationId,
          subjectRef: input.subjectRef,
        },
      },
    });
    const personChanged =
      existing !== null &&
      (existing.contactRef !== input.contactRef || existing.guardianLabel !== input.guardianLabel);

    const row = await this.prisma.guardianLink.upsert({
      where: {
        organizationId_subjectRef: {
          organizationId: input.organizationId,
          subjectRef: input.subjectRef,
        },
      },
      create: {
        id: input.id,
        organizationId: input.organizationId,
        subjectRef: input.subjectRef,
        reviewRoute: input.reviewRoute,
        guardianLabel: input.guardianLabel,
        contactRef: input.contactRef,
        status: 'PENDING',
        correlationId: input.correlationId,
      },
      update: {
        reviewRoute: input.reviewRoute,
        guardianLabel: input.guardianLabel,
        contactRef: input.contactRef,
        ...(personChanged ? { status: 'PENDING' as const, acceptedAt: null } : {}),
      },
    });
    return {
      id: row.id,
      reviewRoute: row.reviewRoute,
      status: row.status,
      guardianLabel: row.guardianLabel,
      acceptedAt: row.acceptedAt,
    };
  }

  /** The guardian accepting the role for themselves — the second half of the consent. */
  public async acceptGuardian(
    organizationId: string,
    subjectRef: string,
    at: Date,
  ): Promise<GuardianRecord | null> {
    const existing = await this.guardianFor(organizationId, subjectRef);
    if (existing === null) {
      return null;
    }
    const row = await this.prisma.guardianLink.update({
      where: { organizationId_subjectRef: { organizationId, subjectRef } },
      data: { status: 'ACTIVE', acceptedAt: at },
    });
    return {
      id: row.id,
      reviewRoute: row.reviewRoute,
      status: row.status,
      guardianLabel: row.guardianLabel,
      acceptedAt: row.acceptedAt,
    };
  }

  public async revokeGuardian(
    organizationId: string,
    subjectRef: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.guardianLink.updateMany({
      where: { organizationId, subjectRef },
      data: { status: 'REVOKED', revokedAt: at },
    });
  }
}

export const createPrismaGuardianStore = (prisma: PrismaClient): PrismaGuardianStore =>
  new PrismaGuardianStore(prisma);
