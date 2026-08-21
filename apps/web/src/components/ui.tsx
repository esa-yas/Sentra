import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

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

/**
 * Console form controls.
 *
 * These match the auth screens (same radius, border, focus ring and accent) so a form inside the
 * dashboard does not look like it came from a different product. Kept here rather than imported
 * from `auth-ui` because that module carries the full-screen split layout with it.
 */
const CONTROL_CLASS =
  'w-full rounded-lg border border-slate-700 bg-[var(--t-card-2)] px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--t-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--t-accent)_20%,transparent)] disabled:opacity-60';

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-xs font-medium text-slate-400">{children}</span>;
}

export function Input({
  label,
  className = '',
  ...props
}: { label?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const control = <input {...props} className={`${CONTROL_CLASS} ${className}`} />;
  if (label === undefined) return control;
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      {control}
    </label>
  );
}

export function Select({
  label,
  className = '',
  children,
  ...props
}: { label?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const control = (
    <select {...props} className={`${CONTROL_CLASS} ${className}`}>
      {children}
    </select>
  );
  if (label === undefined) return control;
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      {control}
    </label>
  );
}

const BUTTON_TONES = {
  primary:
    'bg-[var(--t-accent)] text-white hover:bg-[var(--t-accent-strong)] border border-transparent',
  secondary:
    'border border-slate-700 bg-[var(--t-card)] text-slate-200 hover:bg-[var(--t-card-2)]',
  danger: 'border border-red-500/40 bg-transparent text-red-300 hover:bg-red-500/10',
} as const;

export function Button({
  tone = 'secondary',
  size = 'md',
  className = '',
  children,
  ...props
}: {
  tone?: keyof typeof BUTTON_TONES;
  size?: 'sm' | 'md';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizing = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_TONES[tone]} ${sizing} ${className}`}
    >
      {children}
    </button>
  );
}

/** Inline message block. `tone` carries the meaning; the text carries the detail. */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const toneClass = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      {title !== undefined && <p className="text-sm font-semibold">{title}</p>}
      <div className={`text-xs leading-relaxed ${title === undefined ? '' : 'mt-1 opacity-90'}`}>
        {children}
      </div>
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
