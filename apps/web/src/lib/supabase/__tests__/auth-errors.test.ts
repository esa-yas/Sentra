import { describe, expect, it } from 'vitest';
import { friendlyAuthError } from '../auth-errors';

describe('friendlyAuthError', () => {
  // The exact string from the reported screenshot must never reach the user verbatim.
  it('rewrites "Invalid API key" as a server-configuration problem, not the user’s fault', () => {
    const out = friendlyAuthError({ message: 'Invalid API key', status: 401 });
    expect(out).not.toBe('Invalid API key');
    expect(out.toLowerCase()).toContain('misconfigured');
    expect(out).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('explains the email rate limit and what to do', () => {
    const out = friendlyAuthError({
      message: 'email rate limit exceeded',
      code: 'over_email_send_rate_limit',
      status: 429,
    });
    expect(out.toLowerCase()).toContain('wait a few minutes');
  });

  it('turns an existing-account error into a sign-in hint', () => {
    expect(friendlyAuthError({ message: 'User already registered' }).toLowerCase()).toContain(
      'already exists',
    );
  });

  it('flags a weak password', () => {
    expect(
      friendlyAuthError({ message: 'Password should be at least 6 characters', code: 'weak_password' }),
    ).toMatch(/too weak/i);
  });

  it('passes a genuinely useful message through, and never returns an empty string', () => {
    expect(friendlyAuthError({ message: '' })).not.toBe('');
    expect(friendlyAuthError({ message: 'Network request failed' })).toBe('Network request failed');
  });
});
