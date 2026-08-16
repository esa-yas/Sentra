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
