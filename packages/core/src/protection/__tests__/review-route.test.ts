import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROTECTION_POLICY,
  resolveReviewRoute,
  type GuardianLinkView,
  type ReviewRouteInput,
} from '../review-route';

const activeGuardian: GuardianLinkView = { reviewRoute: 'GUARDIAN', status: 'ACTIVE' };

const input = (over: Partial<ReviewRouteInput> = {}): ReviewRouteInput => ({
  verdict: 'HOLD',
  riskScore: 75,
  amount: 500,
  policy: DEFAULT_PROTECTION_POLICY,
  guardian: activeGuardian,
  ...over,
});

describe('review routing', () => {
  it('routes to the guardian the customer chose', () => {
    const decision = resolveReviewRoute(input());
    expect(decision.route).toBe('GUARDIAN');
    expect(decision.windowSeconds).toBe(DEFAULT_PROTECTION_POLICY.windowSeconds);
  });

  it('honours the escalating choice too', () => {
    expect(
      resolveReviewRoute(input({ guardian: { reviewRoute: 'GUARDIAN_THEN_BANK', status: 'ACTIVE' } }))
        .route,
    ).toBe('GUARDIAN_THEN_BANK');
  });

  it('reviews nothing when no hold was advised', () => {
    expect(resolveReviewRoute(input({ verdict: 'WARN' })).route).toBe('NONE');
    expect(resolveReviewRoute(input({ verdict: 'PROCEED' })).route).toBe('NONE');
  });

  // Consent on both sides: a named but unaccepted guardian must never receive a payment.
  it('does not route to a guardian who has not accepted', () => {
    expect(resolveReviewRoute(input({ guardian: { reviewRoute: 'GUARDIAN', status: 'PENDING' } })).route).toBe('BANK');
    expect(resolveReviewRoute(input({ guardian: { reviewRoute: 'GUARDIAN', status: 'REVOKED' } })).route).toBe('BANK');
  });

  it('routes to the bank when there is no guardian at all', () => {
    expect(resolveReviewRoute(input({ guardian: null })).route).toBe('BANK');
  });

  it('respects a customer who chose bank review despite having a guardian', () => {
    expect(resolveReviewRoute(input({ guardian: { reviewRoute: 'BANK', status: 'ACTIVE' } })).route).toBe('BANK');
  });

  it('lets the bank switch guardian review off entirely', () => {
    const policy = { ...DEFAULT_PROTECTION_POLICY, guardianEnabled: false };
    expect(resolveReviewRoute(input({ policy })).route).toBe('BANK');
  });

  // A family member is the wrong reviewer for the most serious cases.
  it('skips the guardian at or above the bank’s override score', () => {
    const policy = { ...DEFAULT_PROTECTION_POLICY, overrideScore: 90 };
    expect(resolveReviewRoute(input({ policy, riskScore: 89 })).route).toBe('GUARDIAN');
    expect(resolveReviewRoute(input({ policy, riskScore: 90 })).route).toBe('BANK');
  });

  it('sends anything above the release ceiling to the bank', () => {
    const policy = { ...DEFAULT_PROTECTION_POLICY, releaseCeiling: 2000 };
    expect(resolveReviewRoute(input({ policy, amount: 2000 })).route).toBe('GUARDIAN');
    expect(resolveReviewRoute(input({ policy, amount: 2000.01 })).route).toBe('BANK');
  });

  it('explains every decision, so it can be audited and told to the customer', () => {
    expect(resolveReviewRoute(input({ guardian: null })).reason).toMatch(/no guardian/i);
    expect(resolveReviewRoute(input({ amount: 99_999 })).reason).toMatch(/above what a guardian/i);
    expect(resolveReviewRoute(input({ riskScore: 99 })).reason).toMatch(/override/i);
  });

  it('gives no guardian window when the bank is reviewing', () => {
    expect(resolveReviewRoute(input({ guardian: null })).windowSeconds).toBe(0);
  });
});
