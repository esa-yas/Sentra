'use client';

import { useSession } from '@/lib/session';

function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function todayLabel(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return `Today is ${weekday}, ${ordinal(d.getDate())} ${month} ${d.getFullYear()}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The reference's welcome bar: greeting on the left, a control cluster and identity on the right. */
export function DashboardHeader({ onExport }: { onExport?: () => void }) {
  const { user, activeMembership } = useSession();
  const name = user?.displayName ?? 'Operator';
  const role = activeMembership?.role ?? 'Operations';

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-slate-100">Welcome {name}!</h1>
        <p className="mt-1 text-sm text-slate-400">{todayLabel()}</p>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 sm:inline-flex">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path d="M3 9h18M8 2.5v4M16 2.5v4" />
          </svg>
          This session
        </span>

        {onExport !== undefined && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-[var(--t-card-2)] hover:text-slate-100"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
            </svg>
            Export
          </button>
        )}

        <div className="ml-1 flex items-center gap-2.5 border-l border-slate-800 pl-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--t-card-2)] text-xs font-bold text-sky-400">
            {initials(name)}
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-semibold text-slate-100">{name}</p>
            <p className="text-xs capitalize text-slate-500">{role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
