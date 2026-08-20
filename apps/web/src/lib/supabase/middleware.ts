import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Reads the Supabase session on the edge and reports who (if anyone) is signed in.
 *
 * This runs on every navigation, so it must be cheap: it uses `getSession()` (a local cookie
 * read, refreshed only when the token has actually expired) rather than `getUser()` (a network
 * round-trip to Supabase on every request). That is safe here because this check is only a UX
 * gate — it decides whether to bounce an anonymous visitor to /login. The real security boundary
 * is the API, which cryptographically verifies the JWT (JWKS) on every data request, so a forged
 * cookie that slips past this gate still fails at the API. The cookie plumbing follows the
 * @supabase/ssr contract so a rotated token reaches the browser; only the user id is returned.
 */
export const updateSession = async (
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null }> => {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getSession();
  return { response, userId: data.session?.user?.id ?? null };
};
