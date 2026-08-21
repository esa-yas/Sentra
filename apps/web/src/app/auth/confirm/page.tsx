'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthBrandMark, AuthBrandPanel, AuthHeading, AuthLayout } from '@/components/auth-ui';

const REDIRECT_SECONDS = 4;

/**
 * Landing page for the "confirm your email" button in the Supabase signup mail.
 *
 * Supabase verifies the token on its own endpoint *before* redirecting here, so by the time
 * this renders the address is already confirmed and this screen only has to report it and move
 * the user on to sign in. A failed or expired link comes back with an `error` parameter, which
 * is reported as a failure rather than a false success.
 */
function ConfirmContent() {
  const router = useRouter();
  const params = useSearchParams();
  const failure = params.get('error_description') ?? params.get('error');
  const [remaining, setRemaining] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (failure !== null) {
      return;
    }
    const tick = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    const timer = setTimeout(() => router.replace('/login'), REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [failure, router]);

  if (failure !== null) {
    return (
      <div className="space-y-6">
        <AuthBrandMark />
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        </span>
        <AuthHeading
          title="This link didn’t work"
          subtitle="Confirmation links expire after a short while and can only be used once. Sign in to have a new one sent, or sign up again if you never finished."
        />
        <Link
          href="/login"
          className="block w-full rounded-xl bg-[var(--t-accent)] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--t-accent-strong)]"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AuthBrandMark />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      </span>
      <AuthHeading
        title="Email verified"
        subtitle="Your address is confirmed. Sign in to finish setting up — we’ve kept the organization details you entered."
      />
      <Link
        href="/login"
        className="block w-full rounded-xl bg-[var(--t-accent)] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--t-accent-strong)]"
      >
        Continue to sign in
      </Link>
      <p className="text-center text-xs text-slate-500" aria-live="polite">
        {remaining > 0
          ? `Redirecting to sign in in ${remaining}s…`
          : 'Redirecting to sign in…'}
      </p>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <AuthLayout
      panel={
        <AuthBrandPanel
          headline="You’re one step from the console."
          quote="New organizations start in sandbox with synthetic data, so you can integrate and test before a single real payment is at stake."
        />
      }
    >
      <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
        <ConfirmContent />
      </Suspense>
    </AuthLayout>
  );
}
