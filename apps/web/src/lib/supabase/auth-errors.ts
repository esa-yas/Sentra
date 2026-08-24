/**
 * Turns Supabase auth errors into messages a person can act on.
 *
 * Supabase surfaces low-level strings — "Invalid API key", "email rate limit exceeded" — that
 * mean nothing to someone trying to sign up and, worse, point them at the wrong thing (their
 * password, their spelling) when the real cause is configuration or a project quota. Every
 * branch here names the actual cause and what to do about it.
 */
export interface SupabaseLikeError {
  readonly message: string;
  readonly code?: string;
  readonly status?: number;
}

export const friendlyAuthError = (error: SupabaseLikeError): string => {
  const code = error.code ?? '';
  const message = error.message ?? '';
  const lower = message.toLowerCase();

  // Configuration: the key is wrong or the server inlined a stale one. Never blame the user.
  if (lower.includes('invalid api key') || lower.includes('invalid jwt') || error.status === 401) {
    return 'The console can’t reach authentication right now — its Supabase key looks misconfigured. This is a server setup issue, not your details. If you run the console yourself, restart the web server after setting NEXT_PUBLIC_SUPABASE_ANON_KEY; the key is read only at startup.';
  }

  // Project email quota — the built-in Supabase mailer is rate-limited (common while testing).
  if (code === 'over_email_send_rate_limit' || lower.includes('email rate limit')) {
    return 'Too many sign-ups from this project in a short time, so the confirmation email couldn’t be sent. Wait a few minutes and try again. (If you run the console, configure a custom SMTP sender in Supabase to remove this limit.)';
  }
  if (code === 'over_request_rate_limit' || (error.status === 429 && lower.includes('rate'))) {
    return 'Too many attempts in a short time. Please wait a minute and try again.';
  }

  // Ordinary, user-actionable cases.
  if (code === 'user_already_exists' || lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Sign in instead, or use a different email.';
  }
  if (code === 'weak_password' || lower.includes('password should be')) {
    return 'That password is too weak. Use at least 8 characters, mixing letters and numbers.';
  }
  if (code === 'validation_failed' || lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return 'That email address doesn’t look valid. Check it and try again.';
  }
  if (code === 'signup_disabled' || lower.includes('signups not allowed')) {
    return 'New sign-ups are currently disabled for this project.';
  }
  if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) {
    return 'That email or password is incorrect.';
  }
  if (code === 'email_not_confirmed' || lower.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the confirmation link.';
  }

  // Fallback: pass the original through, but only when it is human-readable.
  return message.length > 0 ? message : 'Something went wrong. Please try again.';
};
