'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { resolveAuthRoute } from '@/lib/auth-route';
import { SessionProvider, useSession } from '@/lib/session';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Renders the console shell (sidebar + topbar) around every page except the full-screen
 * login and signup routes, which stand alone. The whole tree is wrapped in the session
 * provider so the nav, topbar, and screens share one resolved identity + active organization.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Public, chrome-less routes: the auth screens (including the email-confirmation landing
  // page under /auth/) and the developer documentation.
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/onboarding' ||
    pathname === '/invite' ||
    pathname === '/docs' ||
    pathname.startsWith('/auth/')
  ) {
    return <>{children}</>;
  }

  return (
    <SessionProvider>
      <OnboardingGate>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 overflow-y-auto px-8 py-7">
              <div className="mx-auto max-w-[1440px]">{children}</div>
            </main>
          </div>
        </div>
      </OnboardingGate>
    </SessionProvider>
  );
}

/**
 * Routes the two states the console cannot render: an expired session, and a brand-new user
 * who has no organization yet.
 *
 * It acts *only* on a successful identity resolution (`status === 'ready'`). An expired or
 * rejected session goes to `/login` — never to onboarding — and a failed `/auth/me` (API down,
 * network blip) does nothing at all, because "we could not ask" must never be mistaken for
 * "this user has no organization". That mistake is what pushed returning operators into the
 * create-organization screen after their session had been idle.
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { authEnabled, status, user, memberships } = useSession();
  const router = useRouter();

  useEffect(() => {
    const destination = resolveAuthRoute({
      authEnabled,
      status,
      hasUser: user !== null,
      membershipCount: memberships.length,
    });
    if (destination !== null) {
      router.replace(destination);
    }
  }, [authEnabled, status, user, memberships.length, router]);

  return <>{children}</>;
}
