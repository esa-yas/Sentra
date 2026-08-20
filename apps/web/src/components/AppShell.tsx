'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
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

  if (pathname === '/login' || pathname === '/signup' || pathname === '/docs') {
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
 * A signed-in user with no organization yet has nothing to operate, so send them to finish
 * setup at /signup (which, when already authenticated, shows just the create-organization
 * step). Only fires once identity has resolved, so it never flashes during load or in the
 * open demo mode (where auth is disabled and everyone is treated as a member).
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { authEnabled, loading, user, memberships } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (authEnabled && !loading && user !== null && memberships.length === 0) {
      router.replace('/signup');
    }
  }, [authEnabled, loading, user, memberships.length, router]);

  return <>{children}</>;
}
