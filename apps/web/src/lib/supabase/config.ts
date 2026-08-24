/**
 * Public Supabase configuration for the browser and edge middleware.
 *
 * These are the anon/public values only — the service-role key is never referenced here and
 * must never reach the client. `authEnabled` is the single switch the console uses to decide
 * whether to enforce a login gate: when the project is not configured (or still holds the
 * placeholder URL), the console runs open, exactly as it did before human auth existed.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const authEnabled =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  !SUPABASE_URL.includes('your-project');

/**
 * A structural check on the browser Supabase configuration, run before any auth call so a
 * misconfiguration surfaces as a clear message instead of Supabase's opaque "Invalid API key"
 * deep inside a form submit.
 *
 * It catches the two mistakes that actually happen: an anon key that is not a well-formed JWT
 * (truncated, wrong value), and — the classic one — a key whose project `ref` does not match the
 * project in the URL, which happens when the URL and key come from different Supabase projects.
 * Because `NEXT_PUBLIC_*` values are inlined when the dev server starts, a stale server can serve
 * an old key; this check makes that visible rather than letting the user fill the whole form and
 * fail at the end.
 */
export interface AuthConfigProblem {
  readonly summary: string;
  readonly detail: string;
}

const decodeJwtSegment = (segment: string): Record<string, unknown> | null => {
  try {
    const normalised = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalised);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/** Returns null when the configuration looks usable, or a described problem when it does not. */
export const authConfigProblem = (): AuthConfigProblem | null => {
  if (!authEnabled) {
    return null;
  }

  let host: string;
  try {
    host = new URL(SUPABASE_URL).host;
  } catch {
    return {
      summary: 'The Supabase URL is not a valid URL.',
      detail: 'Set NEXT_PUBLIC_SUPABASE_URL to your project URL, then restart the web server.',
    };
  }
  const urlRef = host.split('.')[0] ?? '';

  const segments = SUPABASE_ANON_KEY.split('.');
  const payload = segments.length === 3 ? decodeJwtSegment(segments[1]!) : null;
  if (payload === null) {
    return {
      summary: 'The Supabase anon key is malformed.',
      detail:
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is not a valid key. Copy it again from the Supabase dashboard, then restart the web server — the value is read only at startup.',
    };
  }

  const keyRef = typeof payload['ref'] === 'string' ? (payload['ref'] as string) : '';
  if (keyRef !== '' && urlRef !== '' && keyRef !== urlRef) {
    return {
      summary: 'The Supabase URL and anon key are from different projects.',
      detail: `The URL points at "${urlRef}" but the key belongs to "${keyRef}". Use the URL and anon key from the same project, then restart the web server.`,
    };
  }
  return null;
};
