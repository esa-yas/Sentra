import type { PartnerScope } from '@sentra/contracts';
import { PARTNER_SCOPES } from '@sentra/contracts';
import type { PartnerScope as PrismaPartnerScope } from '@prisma/client';

const TO_PRISMA: Readonly<Record<PartnerScope, PrismaPartnerScope>> = {
  [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE]: 'PAYMENT_INTENTS_WRITE',
  [PARTNER_SCOPES.RISK_EVENTS_WRITE]: 'RISK_EVENTS_WRITE',
  [PARTNER_SCOPES.RECOMMENDATIONS_READ]: 'RECOMMENDATIONS_READ',
  [PARTNER_SCOPES.CASES_READ]: 'CASES_READ',
  [PARTNER_SCOPES.OUTCOMES_WRITE]: 'OUTCOMES_WRITE',
};

const FROM_PRISMA: Readonly<Record<PrismaPartnerScope, PartnerScope>> = {
  PAYMENT_INTENTS_WRITE: PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
  RISK_EVENTS_WRITE: PARTNER_SCOPES.RISK_EVENTS_WRITE,
  RECOMMENDATIONS_READ: PARTNER_SCOPES.RECOMMENDATIONS_READ,
  CASES_READ: PARTNER_SCOPES.CASES_READ,
  OUTCOMES_WRITE: PARTNER_SCOPES.OUTCOMES_WRITE,
};

export const toPrismaScopes = (scopes: readonly PartnerScope[]): PrismaPartnerScope[] =>
  scopes.map((scope) => TO_PRISMA[scope]);

export const fromPrismaScopes = (scopes: readonly PrismaPartnerScope[]): PartnerScope[] =>
  scopes.map((scope) => FROM_PRISMA[scope]);
