import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled } from '@/lib/supabase/config';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Login gate for the Operations Console.
 *
 * The console FAILS CLOSED: nothing internal is reachable without a session. Only `/login`,
 * `/signup`, and the `/auth/*` callback are public. An authenticated user visiting `/login` is
 * sent to the overview. The API proxy (`/api/*`) is excluded here — the backend enforces its
 * own authentication. When auth is not configured (no Supabase), internal routes still redirect
 * to `/login` (which explains the misconfiguration) rather than exposing the dashboard.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === '/login' || path === '/signup' || path === '/docs' || path.startsWith('/auth/');

  // Safety net for email links. Supabase only honours `emailRedirectTo` when the URL is in the
  // project's allow-list; otherwise it falls back to the Site URL and the confirmation lands on
  // some other route carrying `code` or `token_hash`. Forward those to the confirmation screen
  // so the user always sees a result instead of a silent bounce to login.
  if (!path.startsWith('/auth/')) {
    const params = request.nextUrl.searchParams;
    if (params.has('code') || params.has('token_hash') || params.has('error_description')) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/confirm';
      return NextResponse.redirect(url);
    }
  }

  // Fail closed: with no auth backend there is no way to prove a session, so the only thing a
  // visitor may reach is the public surface. This removes the former open "demo mode".
  if (!authEnabled) {
    if (isPublic) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const { response, userId } = await updateSession(request);

  if (userId === null && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (userId !== null && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
