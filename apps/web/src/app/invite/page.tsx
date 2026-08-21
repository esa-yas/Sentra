'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import type { InvitationPreview } from '@sentra/contracts';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import { acceptInvitation, previewInvitation } from '@/lib/api';
import {
  AuthBrandMark,
  AuthBrandPanel,
  AuthHeading,
  AuthLayout,
  Field,
  FormError,
  IconBriefcase,
  IconUser,
  LockedValue,
  PasswordField,
  StatusBadge,
  StepProgress,
  SubmitButton,
} from '@/components/auth-ui';

const ROLE_BLURB: Record<string, string> = {
  OWNER: 'Full control, including billing and ownership of the organization.',
  ADMIN: 'Manage members, API keys and partner settings.',
  ANALYST: 'Review scam cases and recommendations.',
  AUDITOR: 'Read-only access to the audit trail and compliance views.',
  OPERATOR: 'Day-to-day monitoring of the decision pipeline.',
};

/**
 * Invitation acceptance.
 *
 * The invited address and the organization are fixed by the invitation record and shown as
 * locked values — the invitee chooses only their display name and password. Two short steps
 * keep it distinct from the founder onboarding wizard without repeating its questions.
 */
function InviteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (token === '') {
      setLoadError('This link is missing its invitation token.');
      return;
    }
    let active = true;
    void previewInvitation(token).then((result) => {
      if (!active) return;
      if (result.data !== undefined) {
        setPreview(result.data);
      } else {
        setLoadError(result.error?.message ?? 'This invitation could not be loaded.');
      }
    });
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (step === 1) {
      setStep(2);
      return;
    }
    if (password !== confirmPassword) {
      setError('Those passwords don’t match.');
      return;
    }
    if (preview === null || !authEnabled) {
      setError('This invitation cannot be accepted right now.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      // The invite mail signs the recipient in, so there is usually already a session; setting
      // the password turns it into an account they can sign back into.
      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token;

      if (accessToken !== undefined) {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
          data: { full_name: fullName.trim(), job_title: jobTitle.trim() },
        });
        if (updateError !== null) {
          setError(updateError.message);
          return;
        }
      } else {
        // No session (link opened in another browser): create the account for the invited
        // address, which must match for acceptance to succeed anyway.
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: preview.email,
          password,
          options: { data: { full_name: fullName.trim(), job_title: jobTitle.trim() } },
        });
        if (signUpError !== null) {
          setError(signUpError.message);
          return;
        }
        if (data.session === null) {
          setDone('confirm');
          return;
        }
        accessToken = data.session.access_token;
      }

      const result = await acceptInvitation({ token, fullName: fullName.trim() }, accessToken);
      if (result.error !== undefined) {
        setError(result.error.message);
        return;
      }
      router.replace('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <AuthBrandPanel
      headline={
        preview === null ? 'You’ve been invited.' : `Join ${preview.organizationName} on Sentra.`
      }
      quote="Your teammates already run scam decisions here. You’ll pick up where they left off — same tenant, same audit trail."
    />
  );

  if (loadError !== null) {
    return (
      <AuthLayout panel={panel}>
        <div className="space-y-5">
          <AuthBrandMark />
          <StatusBadge tone="danger">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          </StatusBadge>
          <AuthHeading title="This invitation can’t be used" subtitle={loadError} />
          <Link
            href="/login"
            className="block w-full rounded-xl bg-[var(--t-accent)] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[var(--t-accent-strong)]"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done === 'confirm') {
    return (
      <AuthLayout panel={panel}>
        <div className="space-y-5">
          <AuthBrandMark />
          <StatusBadge tone="accent">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5 12 14l9-5.5" />
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
            </svg>
          </StatusBadge>
          <AuthHeading
            title="Confirm your email to finish"
            subtitle="We sent a confirmation link to your invited address. Open it, sign in, and you’ll join the organization automatically."
          />
        </div>
      </AuthLayout>
    );
  }

  if (preview === null) {
    return (
      <AuthLayout panel={panel}>
        <div className="space-y-4">
          <AuthBrandMark />
          <AuthHeading title="One moment" subtitle="Checking your invitation…" />
          <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-[var(--t-card-2)]">
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-[var(--t-accent)]" />
          </span>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout panel={panel}>
      <form onSubmit={submit} className="space-y-5">
        <AuthBrandMark />
        <StepProgress current={step} total={2} />

        <div key={step} className="animate-[fadeIn_260ms_ease-out] space-y-5">
          {step === 1 ? (
            <>
              <AuthHeading
                title={`You’re joining ${preview.organizationName}`}
                subtitle="Your invitation fixes the organization and the address it was sent to. Just tell us who you are."
              />
              <LockedValue
                label="Invited email"
                value={preview.email}
                note="Set by your administrator and can’t be changed."
              />
              <LockedValue
                label="Organization"
                value={`${preview.organizationName} · ${preview.role}`}
                note={ROLE_BLURB[preview.role] ?? 'Your access level in this organization.'}
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
                label="Job title"
                icon={<IconBriefcase />}
                type="text"
                maxLength={80}
                placeholder="Fraud Analyst"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </>
          ) : (
            <>
              <AuthHeading
                title="Choose a password"
                subtitle="This is how you’ll sign back in to the console."
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
            </>
          )}
        </div>

        {error !== null && <FormError>{error}</FormError>}

        <SubmitButton busy={busy}>
          {step === 1 ? 'Continue' : `Join ${preview.organizationName}`}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <AuthLayout panel={<AuthBrandPanel headline="You’ve been invited." quote="One moment…" />}>
          <div className="text-sm text-slate-400">Loading…</div>
        </AuthLayout>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
