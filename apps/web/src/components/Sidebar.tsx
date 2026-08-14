'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sm font-bold text-sky-300">
          S
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">Sentra</p>
          <p className="text-[11px] text-slate-500">Operations Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <span>{item.label}</span>
              {item.status === 'planned' && (
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-5 py-3 text-[11px] text-slate-600">
        Version 1a · Slice 1
      </div>
    </aside>
  );
}
