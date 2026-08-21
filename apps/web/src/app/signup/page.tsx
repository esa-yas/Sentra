'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
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
  IconMail,
  IconMailSent,
  IconUser,
  PasswordField,
  StatusBadge,
  SubmitButton,
} from '@/components/auth-ui';

/**
 * Account creation only: name, email, password.
 *
 * Everything about the organization is collected after the address is confirmed, in the
 * onboarding flow — a new visitor should not have to answer business questions before they
 * even own an account, and details captured here would be lost while the email is unconfirmed.
 */
export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Someone who is already signed in has no business on the signup form.
  useEffect(() => {
    if (!authEnabled) {
      return;
    }
    let active = true;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active && data.session !== null) {
          router.replace('/');
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Those passwords don’t match.');
      return;
    }
    if (!authEnabled) {
      setError('Authentication is not configured, so accounts cannot be created.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: { full_name: fullName.trim() },
        },
      });
      if (signUpError !== null) {
        setError(signUpError.message);
        return;
      }
      // With email confirmation switched off Supabase returns a session immediately, so the
      // visitor can go straight to onboarding; otherwise we wait for them to confirm.
      if (data.session !== null) {
        router.replace('/onboarding');
        router.refresh();
        return;
      }
      setSentTo(email);
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <AuthBrandPanel
      headline="Join the scam-prevention network."
      quote="New organizations start in sandbox with synthetic data, so you can integrate and test before a single real payment is at stake."
    />
  );

  if (sentTo !== null) {
    return (
      <AuthLayout panel={panel}>
        <div>
          <AuthBrandMark />
          <StatusBadge tone="accent">
            <IconMailSent />
          </StatusBadge>
          <AuthHeading
            title="Check your email"
            subtitle={`We sent a confirmation link to ${sentTo}. Open it to verify your address, then sign in — we’ll walk you through setting up your organization.`}
          />
          <div className="rounded-xl border border-slate-800 bg-[var(--t-card-2)] px-4 py-3 text-xs leading-relaxed text-slate-400">
            Nothing yet? It can take a minute to arrive. Check your spam folder, and make sure the
            address above is right.
          </div>
          <div className="mt-6 space-y-3">
            <AuthFooterLink prompt="Already confirmed?" href="/login" label="Sign in" />
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="w-full text-center text-xs text-slate-500 transition-colors hover:text-slate-300"
            >
              Use a different email address
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout panel={panel}>
      <form onSubmit={submit} className="space-y-5">
        <AuthBrandMark />
        <AuthHeading
          title="Create your account"
          subtitle="Start in sandbox with synthetic data. You’ll set up your organization in a moment."
        />

        <Field
          label="Full name"
          icon={<IconUser />}
          type="text"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          placeholder="Ada Lovelace"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />

        <Field
          label="Work email"
          icon={<IconMail />}
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <PasswordField
          label="Password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <PasswordField
          label="Confirm password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {error !== null && <FormError>{error}</FormError>}

        <SubmitButton busy={busy}>Create account</SubmitButton>

        <AuthFooterLink prompt="Already have an account?" href="/login" label="Sign in" />
      </form>
    </AuthLayout>
  );
}
