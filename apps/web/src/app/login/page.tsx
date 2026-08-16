'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';

type Mode = 'password' | 'magic';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError !== null) {
      // Deliberately generic so the form cannot be used to probe which emails exist.
      setError('Sign-in failed. Check your email and password and try again.');
      return;
    }
    router.push(next);
    router.refresh();
  };

  const sendMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (otpError !== null) {
      setError('Could not send the magic link. Try again in a moment.');
      return;
    }
    setNotice('Check your email for a sign-in link.');
  };

  return (
    <form
      onSubmit={mode === 'password' ? signInWithPassword : sendMagicLink}
      className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-6"
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-slate-100">Sign in to Sentra</h1>
        <p className="text-xs text-slate-400">Operations Console — authorized personnel only.</p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-slate-400">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
        />
      </label>

      {mode === 'password' ? (
        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
        </label>
      ) : null}

      {error !== null ? <p className="text-xs text-rose-400">{error}</p> : null}
      {notice !== null ? <p className="text-xs text-emerald-400">{notice}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
      >
        {busy ? 'Please wait…' : mode === 'password' ? 'Sign in' : 'Send magic link'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'magic' : 'password');
          setError(null);
          setNotice(null);
        }}
        className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
      >
        {mode === 'password' ? 'Use a magic link instead' : 'Use a password instead'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  if (!authEnabled) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 px-4">
        <div className="max-w-sm rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-100">Authentication not configured</h1>
          <p className="mt-2 text-xs text-slate-400">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
            The console is currently running in open demo mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 px-4">
      <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
