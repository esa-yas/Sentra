'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Renders the console shell (sidebar + topbar) around every page except the full-screen
 * login route, which stands alone. The whole tree is wrapped in the session provider so the
 * nav, topbar, and screens share one resolved identity + active organization.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <SessionProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
