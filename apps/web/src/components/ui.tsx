import type { ReactNode } from 'react';

/** A titled surface panel. */
export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>
      {(title !== undefined || actions !== undefined) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            {title !== undefined && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {description !== undefined && (
              <p className="mt-1 text-xs text-slate-400">{description}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  synthetic = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  synthetic?: boolean;
}) {
  const toneClass: Record<string, string> = {
    default: 'text-slate-100',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {synthetic && <SyntheticTag />}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</p>
      {hint !== undefined && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
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

export function SyntheticTag({ label = 'Synthetic' }: { label?: string }) {
  return (
    <span
      title="Synthetic demo data — not a validated business figure"
      className="inline-flex items-center rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
    >
      {label}
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
