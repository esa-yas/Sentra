import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { requireAuthContext, setAuthContext } from '../auth/request-context';

const req = (): Request => ({}) as Request;

describe('requireAuthContext', () => {
  it('returns the context once the guard has attached one', () => {
    const request = req();
    const principal = { id: 'u1', label: 'user:u1' } as never;
    setAuthContext(request, { principal, organizationId: 'org_1' });
    expect(requireAuthContext(request, true).organizationId).toBe('org_1');
  });

  // The reported confusion: signed-in users were told the action "requires an authenticated
  // member" when the API simply had no user store, sending them hunting through their login.
  it('names the server misconfiguration when auth is not wired at all', () => {
    expect(() => requireAuthContext(req(), false, 'Member administration')).toThrow(
      /in-memory.*provider mode/is,
    );
    expect(() => requireAuthContext(req(), false)).toThrow(/SENTRA_PROVIDER_MODE=real/);
    // It must not blame the caller's session for a server-side gap.
    expect(() => requireAuthContext(req(), false)).not.toThrow(/requires an authenticated member/);
  });

  it('still reports a genuinely unauthenticated caller as such', () => {
    expect(() => requireAuthContext(req(), true, 'Member administration')).toThrow(
      /Member administration requires an authenticated member/,
    );
  });
});
