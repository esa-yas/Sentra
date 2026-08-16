import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled } from '@/lib/supabase/config';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Login gate for the Operations Console.
 *
 * When auth is not configured the console runs open (demo mode), so this is a no-op. When it
 * is configured, every non-public route requires a Supabase session; unauthenticated requests
 * are redirected to `/login` (preserving where they were headed), and an already-signed-in
 * user visiting `/login` is sent to the overview. `/auth/*` stays public so the magic-link
 * callback can establish the session. The API proxy (`/api/*`) is excluded — the backend
 * enforces its own authentication.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (!authEnabled) {
    return NextResponse.next();
  }

  const { response, userId } = await updateSession(request);
  const path = request.nextUrl.pathname;
  const isPublic = path === '/login' || path.startsWith('/auth/');

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
