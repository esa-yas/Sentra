import { PROTECTION_VERDICTS, REVIEW_ROUTES, type ProtectionVerdict, type ReviewRoute } from '@sentra/contracts';

/**
 * Where a held payment goes for review.
 *
 * The customer chooses whether a trusted person sees it first, but that choice sits inside limits
 * the bank sets, because it is the bank's licence and the customer's money. Every rule below
 * fails towards the bank: any doubt — no guardian, an unaccepted invitation, an amount over the
 * ceiling, a case too serious for a family member — routes to the fraud desk rather than to
 * someone who cannot carry it.
 *
 * Guardians can be socially engineered too, which is exactly why the ceiling and the override
 * exist: a family member is the right reviewer for "Dad is paying a builder he just met", and the
 * wrong one for a payment matching an active campaign.
 */

export interface ProtectionPolicyView {
  /** The bank can switch guardian review off entirely. */
  readonly guardianEnabled: boolean;
  /** A guardian may release up to this amount; larger holds always go to the bank. */
  readonly releaseCeiling: number;
  /** At or above this score the case skips the guardian. */
  readonly overrideScore: number;
  readonly windowSeconds: number;
}

export interface GuardianLinkView {
  /** The customer's own choice of routing. */
  readonly reviewRoute: ReviewRoute;
  /** Only an accepted guardian is ever routed to — consent on both sides. */
  readonly status: 'PENDING' | 'ACTIVE' | 'REVOKED';
}

export interface ReviewRouteInput {
  readonly verdict: ProtectionVerdict;
  readonly riskScore: number;
  readonly amount: number;
  readonly policy: ProtectionPolicyView;
  /** Null when the customer has never set one up. */
  readonly guardian: GuardianLinkView | null;
}

export interface ReviewRouteDecision {
  readonly route: ReviewRoute;
  /** How long the guardian has before it escalates; 0 when no guardian is involved. */
  readonly windowSeconds: number;
  /** Why this route was chosen, for the audit trail and for explaining it to the customer. */
  readonly reason: string;
}

export const resolveReviewRoute = (input: ReviewRouteInput): ReviewRouteDecision => {
  // Nothing to review unless the advice is actually to hold.
  if (input.verdict !== PROTECTION_VERDICTS.HOLD) {
    return { route: REVIEW_ROUTES.NONE, windowSeconds: 0, reason: 'No hold was advised.' };
  }

  const toBank = (reason: string): ReviewRouteDecision => ({
    route: REVIEW_ROUTES.BANK,
    windowSeconds: 0,
    reason,
  });

  if (!input.policy.guardianEnabled) {
    return toBank('Guardian review is switched off for this organization.');
  }
  if (input.guardian === null) {
    return toBank('No guardian is set up for this customer.');
  }
  if (input.guardian.status !== 'ACTIVE') {
    return toBank('The guardian has not accepted their role yet.');
  }
  if (
    input.guardian.reviewRoute === REVIEW_ROUTES.BANK ||
    input.guardian.reviewRoute === REVIEW_ROUTES.NONE
  ) {
    return toBank('The customer chose bank review.');
  }
  // Too serious for a family member to carry.
  if (input.riskScore >= input.policy.overrideScore) {
    return toBank('This case is above the bank’s guardian override threshold.');
  }
  if (input.amount > input.policy.releaseCeiling) {
    return toBank('The amount is above what a guardian may release.');
  }

  return {
    route: input.guardian.reviewRoute,
    windowSeconds: input.policy.windowSeconds,
    reason: 'Routed to the customer’s guardian.',
  };
};

/** The policy a bank gets before it has configured one. Conservative on purpose. */
export const DEFAULT_PROTECTION_POLICY: ProtectionPolicyView = {
  guardianEnabled: true,
  releaseCeiling: 2000,
  overrideScore: 90,
  windowSeconds: 600,
};
