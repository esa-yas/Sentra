import type { ReactNode } from 'react';

/** Decorative three-dot affordance shown on dashboard cards (matches the reference). */
export function CardMenu() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800/70"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
      </svg>
    </span>
  );
}

/** A titled surface panel. Set `menu` for the reference's ⋮ affordance. */
export function Panel({
  title,
  description,
  actions,
  menu = false,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  menu?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = title !== undefined || actions !== undefined || menu;
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900 shadow-[var(--t-shadow)] ${className}`}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            {title !== undefined && (
              <h2 className="text-base font-bold tracking-tight text-slate-100">{title}</h2>
            )}
            {description !== undefined && (
              <p className="mt-1 text-xs text-slate-400">{description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {menu && <CardMenu />}
          </div>
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * A dashboard KPI tile: a soft-tinted icon square, a large number, a label, and a footnote
 * line for honest context (measured this session — never a fabricated quarter-over-quarter delta).
 */
export function KpiCard({
  label,
  value,
  icon,
  color = 'var(--c-purple)',
  footer,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color?: string;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-[var(--t-shadow)]">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          {icon}
        </span>
        <span className="text-[28px] font-bold leading-none tabular-nums text-slate-100">{value}</span>
      </div>
      <p className="mt-3.5 text-sm text-slate-400">{label}</p>
      {footer !== undefined && (
        <div className="mt-3.5 border-t border-slate-800 pt-3 text-xs">{footer}</div>
      )}
    </div>
  );
}

/** A small footnote for a KpiCard. `tone` colors the leading marker; text stays honest. */
export function KpiNote({ tone = 'neutral', children }: { tone?: 'up' | 'neutral'; children: ReactNode }) {
  if (tone === 'up') {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-300">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M17 7H9M17 7v8" />
        </svg>
        <span className="text-slate-400">{children}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      <span className="text-slate-400">{children}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  icon?: ReactNode;
}) {
  const toneClass: Record<string, string> = {
    default: 'text-slate-100',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
  };
  const iconTone: Record<string, string> = {
    default: 'bg-sky-500/10 text-sky-300',
    good: 'bg-emerald-500/10 text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-300',
    bad: 'bg-red-500/10 text-red-300',
  };
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-[var(--t-shadow)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {icon !== undefined && (
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconTone[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-2.5 text-[26px] font-semibold leading-none tabular-nums ${toneClass[tone]}`}>
        {value}
      </p>
      {hint !== undefined && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-800 ${className}`} />;
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

export function CorrelationTag({ correlationId }: { correlationId: string | null }) {
  if (correlationId === null || correlationId === '') {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 font-mono text-[11px] text-sky-300">
      <span className="text-slate-500">correlation</span>
      {correlationId}
    </span>
  );
}
