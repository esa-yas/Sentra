'use client';

import Link from 'next/link';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * Presentation shell shared by the sign-in and sign-up screens: a split view with the form on
 * the left and a brand panel on the right. The brand panel is a fixed dark surface in both
 * themes (it is a marketing surface, not console chrome), while the form side follows the
 * theme tokens so it matches the rest of the console.
 */
export function AuthLayout({
  children,
  panel,
}: {
  children: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--t-ground)] lg:p-5">
      <div className="grid min-h-screen grid-cols-1 overflow-hidden bg-[var(--t-card)] lg:min-h-[calc(100vh-2.5rem)] lg:grid-cols-2 lg:rounded-3xl lg:shadow-[var(--t-shadow)]">
        <div className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
        <div className="hidden lg:block">{panel}</div>
      </div>
    </div>
  );
}

/** The Sentra lockup used at the top of each auth form. */
export function AuthBrandMark() {
  return (
    <div className="mb-10 flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--t-accent)] text-base font-bold text-white">
        S
      </span>
      <span className="text-xl font-bold tracking-tight text-slate-100">Sentra</span>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-100">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>
    </div>
  );
}

const FIELD_CLASS =
  'w-full rounded-xl border border-slate-700 bg-[var(--t-card-2)] py-2.5 pl-11 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--t-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--t-accent)_22%,transparent)]';

/** A labelled input with a leading icon. */
export function Field({
  label,
  icon,
  hint,
  ...props
}: { label: string; icon: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-300">
        {label}
        {hint}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input {...props} className={FIELD_CLASS} />
      </span>
    </label>
  );
}

/** A labelled select with a leading icon, styled to match {@link Field}. */
export function SelectField({
  label,
  icon,
  value,
  onChange,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD_CLASS} appearance-none pr-9`}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <IconChevronDown />
        </span>
      </span>
    </label>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordField({
  label,
  hint,
  ...props
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-300">
        {label}
        {hint}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <IconLock />
        </span>
        <input {...props} type={visible ? 'text' : 'password'} className={`${FIELD_CLASS} pr-11`} />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-300"
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      </span>
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-[var(--t-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--t-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

/** Secondary, full-width action rendered under the OR rule. */
export function SecondaryButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-[var(--t-card)] px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-[var(--t-card-2)]"
    >
      {icon}
      {children}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-slate-800" />
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">or</span>
      <span className="h-px flex-1 bg-slate-800" />
    </div>
  );
}

export function AuthFooterLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p className="text-center text-sm text-slate-400">
      {prompt}{' '}
      <Link href={href} className="font-semibold text-[var(--t-accent)] hover:underline">
        {label}
      </Link>
    </p>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
      {children}
    </p>
  );
}

/**
 * The right-hand brand panel.
 *
 * The pull-quote states how the product behaves and is attributed to the decision engine — it is
 * deliberately not a customer testimonial, and the strip along the bottom names capabilities
 * rather than logos, so nothing here implies a customer Sentra does not yet have.
 */
export function AuthBrandPanel({
  headline,
  quote,
}: {
  headline: ReactNode;
  quote: string;
}) {
  return (
    <div
      className="relative flex h-full flex-col justify-between overflow-hidden p-12 xl:p-14"
      style={{
        background:
          'radial-gradient(120% 120% at 100% 0%, #7c5cf0 0%, #4a2fb8 38%, #1b1440 78%, #120e2b 100%)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 70%)' }}
      />

      <h2 className="relative max-w-[15ch] text-[40px] font-bold leading-[1.1] tracking-tight text-white xl:text-[46px]">
        {headline}
      </h2>

      <div className="relative">
        <svg width="42" height="34" viewBox="0 0 42 34" fill="none" className="mb-4 text-white/35">
          <path
            d="M0 34V19.8C0 8.9 5.9 1.3 17.4 0l1.5 5.6C12 7.4 8.6 11.4 8.6 17h8.1v17H0zm25.3 0V19.8C25.3 8.9 31.2 1.3 42.7 0l1.5 5.6C37.3 7.4 33.9 11.4 33.9 17H42v17H25.3z"
            fill="currentColor"
          />
        </svg>
        <p className="max-w-[38ch] text-[19px] font-medium leading-relaxed text-white/90">{quote}</p>
        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white">
            S
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Sentra decision engine</p>
            <p className="text-xs text-white/60">Explainable · advisory · sub-second</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="mb-4 flex items-center gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
            Built for
          </span>
          <span className="h-px flex-1 bg-white/15" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {['Banks', 'Telecoms', 'Payments', 'Consent-first', 'Hash-chained audit'].map((item) => (
            <span
              key={item}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A large status glyph for terminal screens (email sent, verified, failed). */
export function StatusBadge({
  tone,
  children,
}: {
  tone: 'accent' | 'success' | 'danger';
  children: ReactNode;
}) {
  const toneClass = {
    accent: 'bg-[color-mix(in_srgb,var(--t-accent)_14%,transparent)] text-[var(--t-accent)]',
    success: 'bg-emerald-500/10 text-emerald-300',
    danger: 'bg-red-500/10 text-red-300',
  }[tone];
  return (
    <span className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${toneClass}`}>
      {children}
    </span>
  );
}

/** "Step 2 of 3" plus a segmented bar. */
export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--t-accent)]">
          Step {current} of {total}
        </span>
        <span className="text-xs text-slate-500">{Math.round((current / total) * 100)}%</span>
      </div>
      <div className="flex gap-1.5" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              index < current ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-card-2)]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** A selectable card — used instead of a dropdown where the choice deserves explaining. */
export function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-[var(--t-accent)] bg-[color-mix(in_srgb,var(--t-accent)_8%,transparent)]'
          : 'border-slate-700 bg-[var(--t-card-2)] hover:border-slate-600'
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          selected ? 'bg-[var(--t-accent)] text-white' : 'bg-[var(--t-card)] text-slate-400'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-100">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{description}</span>
      </span>
      <span
        className={`mt-1 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-[var(--t-accent)] bg-[var(--t-accent)]' : 'border-slate-600'
        }`}
        style={{ height: '18px', width: '18px' }}
      >
        {selected && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 5 5 9-10" />
          </svg>
        )}
      </span>
    </button>
  );
}

/** Low-emphasis action, e.g. "Back" in a wizard. */
export function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-[var(--t-card-2)]"
    >
      {children}
    </button>
  );
}

/** Read-only value shown where a field would be, for details the user cannot change. */
export function LockedValue({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-[var(--t-card-2)] px-3.5 py-2.5">
        <span className="text-slate-400">
          <IconLock />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{value}</span>
      </div>
      <span className="mt-1.5 block text-xs text-slate-500">{note}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- icons -- */

export function IconMail() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function IconBuilding() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      <path d="M9 9v.01M9 13v.01M9 17v.01M15 9v.01M15 13v.01M15 17v.01" />
    </svg>
  );
}

export function IconGlobe() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function IconBriefcase() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" />
    </svg>
  );
}

export function IconBank() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h18L12 4 3 10zM5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" />
    </svg>
  );
}

export function IconAntenna() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15a8 8 0 0 1 0-11M19 4a8 8 0 0 1 0 11M8 12.5a4 4 0 0 1 0-6M16 6.5a4 4 0 0 1 0 6" />
      <circle cx="12" cy="9.5" r="1.5" />
      <path d="M12 11v9" />
    </svg>
  );
}

export function IconMailSent() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5 12 14l9-5.5" />
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 19l6-5.5M21 19l-6-5.5" />
    </svg>
  );
}

export function IconSparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.2 7.4A17 17 0 0 0 2 13s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M3 3l18 18M9.9 10.1a3 3 0 0 0 4.1 4.2" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
