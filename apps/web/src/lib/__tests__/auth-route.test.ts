import { describe, expect, it } from 'vitest';
import { resolveAuthRoute } from '../auth-route';

const base = { authEnabled: true, hasUser: true, membershipCount: 1 } as const;

describe('resolveAuthRoute', () => {
  it('keeps a resolved member on the page they asked for', () => {
    expect(resolveAuthRoute({ ...base, status: 'ready' })).toBeNull();
  });

  it('sends an expired or rejected session to the login page, never to onboarding', () => {
    expect(resolveAuthRoute({ ...base, status: 'unauthenticated' })).toBe('/login');
    expect(
      resolveAuthRoute({ ...base, status: 'unauthenticated', hasUser: false, membershipCount: 0 }),
    ).toBe('/login');
  });

  it('sends a genuinely new user to onboarding', () => {
    expect(resolveAuthRoute({ ...base, status: 'ready', membershipCount: 0 })).toBe('/onboarding');
  });

  // The reported bug: after an idle session the console pushed established operators onto the
  // create-organization screen. A failed or in-flight identity lookup reports zero memberships
  // simply because nothing was resolved, and must not be read as "no organization".
  it('never routes to onboarding while identity is unresolved', () => {
    expect(resolveAuthRoute({ ...base, status: 'error', membershipCount: 0 })).toBeNull();
    expect(resolveAuthRoute({ ...base, status: 'error', hasUser: false, membershipCount: 0 })).toBeNull();
    expect(resolveAuthRoute({ ...base, status: 'loading', membershipCount: 0 })).toBeNull();
    expect(
      resolveAuthRoute({ ...base, status: 'loading', hasUser: false, membershipCount: 0 }),
    ).toBeNull();
  });

  it('does nothing when auth is not configured', () => {
    expect(
      resolveAuthRoute({ authEnabled: false, status: 'ready', hasUser: false, membershipCount: 0 }),
    ).toBeNull();
  });
});
