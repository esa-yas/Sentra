'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import {
  AuthBrandMark,
  AuthBrandPanel,
  AuthFooterLink,
  AuthHeading,
  AuthLayout,
  Field,
  FormError,
  FormNotice,
  IconMail,
  IconSparkle,
  OrDivider,
  PasswordField,
  SecondaryButton,
  SubmitButton,
} from '@/components/auth-ui';

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === 'password') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (signInError !== null) {
        // Deliberately generic so the form cannot be used to probe which emails exist.
        setError('Sign-in failed. Check your email and password and try again.');
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (otpError !== null) {
      setError('Could not send the sign-in link. Try again in a moment.');
      return;
    }
    setNotice('Check your email for a sign-in link.');
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <AuthBrandMark />
      <AuthHeading
        title="Welcome back"
        subtitle="Sign in to your operations console to monitor scam decisions and manage your API keys."
      />

      <Field
        label="Email"
        icon={<IconMail />}
        type="email"
        required
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      {mode === 'password' && (
        <PasswordField
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={
            <button
              type="button"
              onClick={() => {
                setMode('magic');
                setError(null);
                setNotice(null);
              }}
              className="text-xs font-medium text-[var(--t-accent)] hover:underline"
            >
              Forgot password?
            </button>
          }
        />
      )}

      {error !== null && <FormError>{error}</FormError>}
      {notice !== null && <FormNotice>{notice}</FormNotice>}

      <SubmitButton busy={busy}>{mode === 'password' ? 'Sign in' : 'Send sign-in link'}</SubmitButton>

      <OrDivider />

      <SecondaryButton
        icon={<IconSparkle />}
        onClick={() => {
          setMode(mode === 'password' ? 'magic' : 'password');
          setError(null);
          setNotice(null);
        }}
      >
        {mode === 'password' ? 'Continue with a magic link' : 'Continue with a password'}
      </SecondaryButton>

      <AuthFooterLink prompt="Don't have an account?" href="/signup" label="Sign up" />
    </form>
  );
}

function AuthNotConfigured() {
  return (
    <div>
      <AuthBrandMark />
      <AuthHeading
        title="Authentication not configured"
        subtitle="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in."
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout
      panel={
        <AuthBrandPanel
          headline="Stop scams before the money leaves."
          quote="Every recommendation arrives with the reason codes behind it — and the bank always makes the final decision."
        />
      }
    >
      {authEnabled ? (
        <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
          <LoginForm />
        </Suspense>
      ) : (
        <AuthNotConfigured />
      )}
    </AuthLayout>
  );
}
