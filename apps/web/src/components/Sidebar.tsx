'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { NAV_ITEMS } from './nav';

/** Line icons keyed by route, drawn inline to keep the browser bundle free of an icon library. */
function navIcon(href: string): ReactNode {
  const p = (d: string) => <path d={d} />;
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const paths: Record<string, ReactNode> = {
    '/': (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    '/cases': p('M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z'),
    '/keys': (
      <>
        <circle cx="7.5" cy="15.5" r="3.5" />
        <path d="M10 13l6-6M14 5l3 3M18.5 6.5l1.5 1.5" />
      </>
    ),
    '/api-activity': p('M8 6l-5 6 5 6M16 6l5 6-5 6'),
    '/partners': (
      <>
        <rect x="3" y="8" width="8" height="13" rx="1.3" />
        <path d="M11 21h10V4a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v4" />
        <path d="M6 12v0M6 16v0M15 8v0M15 12v0M15 16v0" />
      </>
    ),
    '/members': (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.5M21 20a6 6 0 0 0-4-5.6" />
      </>
    ),
    '/audit-chain': p('M9 12a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3 3 3 0 0 0-3-3M15 12a3 3 0 0 0-3-3h-1a3 3 0 0 0-3 3'),
    '/organization': (
      <>
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
        <path d="M9 9v0M9 13v0M9 17v0M15 9v0M15 13v0M15 17v0" />
      </>
    ),
  };
  return <svg {...common}>{paths[href] ?? <rect x="4" y="4" width="16" height="16" rx="3" />}</svg>;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission, loading, activeMembership, user, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.push('/login');
      router.refresh();
    }
  };
  // Role-aware hiding only applies once an active membership is resolved. While loading, or if
  // no membership resolves, show the full nav — the API remains the real authorization boundary.
  const items = NAV_ITEMS.filter(
    (item) =>
      loading ||
      activeMembership === null ||
      item.permission === undefined ||
      hasPermission(item.permission),
  );

  const slug = activeMembership?.organizationSlug ?? 'operations';
  const orgName = slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const userName = user?.displayName ?? 'Operator';
  const userEmail = user?.email ?? '';
  const initials = userName.trim().slice(0, 2).toUpperCase();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2.5 px-5 py-[18px]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-sm font-bold text-white">
          S
        </div>
        <p className="text-[17px] font-bold tracking-tight text-slate-100">Sentra</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-[var(--t-card-2)] font-semibold text-slate-100'
                  : 'font-medium text-slate-400 hover:bg-[var(--t-card-2)] hover:text-slate-200'
              }`}
            >
              <span className={active ? 'text-sky-400' : 'text-slate-400'}>{navIcon(item.href)}</span>
              <span className="flex-1">{item.label}</span>
              {item.status === 'planned' && (
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 px-3 pb-3 pt-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-[var(--t-card-2)] px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">{userName}</p>
            <p className="truncate text-[11px] text-slate-500">{userEmail || orgName}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-300 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between px-2">
          <span className="text-[11px] text-slate-500">{orgName}</span>
          <span className="text-[11px] text-slate-600">v1a</span>
        </div>
      </div>
    </aside>
  );
}
