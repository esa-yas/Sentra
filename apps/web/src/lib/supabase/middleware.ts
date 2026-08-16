import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session on the edge and reports who (if anyone) is signed in.
 *
 * The cookie plumbing follows the @supabase/ssr contract: cookies written during the refresh
 * are copied onto a fresh response so a rotated token reaches the browser. Only the user id
 * is returned — never the token — and it is used solely to decide whether to gate a route.
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

  const { data } = await supabase.auth.getUser();
  return { response, userId: data.user?.id ?? null };
};
