'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser, signUpOrganization } from '@/lib/api';
import {
  clearedPendingOrgMetadata,
  readPendingOrg,
  toPendingOrgMetadata,
  type PendingOrganization,
} from '@/lib/pending-org';
import {
  AuthBrandMark,
  AuthBrandPanel,
  AuthFooterLink,
  AuthHeading,
  AuthLayout,
  Field,
  FormError,
  FormNotice,
  IconBuilding,
  IconGlobe,
  IconMail,
  OrDivider,
  PasswordField,
  SelectField,
  SubmitButton,
} from '@/components/auth-ui';

type OrgType = 'BANK' | 'TELECOM';

/**
 * `account` — nobody is signed in: collect credentials and organization together.
 * `finishing` — signed in with the organization details already captured at signup: create it
 *   without asking again.
 * `organization` — signed in with no organization and nothing stored: ask for the details.
 * `blocked` — signed in, but identity could not be resolved; creating an organization here
 *   could duplicate one that already exists, so the screen refuses rather than guesses.
 */
type Step = 'checking' | 'account' | 'finishing' | 'organization' | 'blocked';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(authEnabled ? 'checking' : 'account');

  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('BANK');
  const [jurisdiction, setJurisdiction] = useState('US');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createOrg = async (
    pending: PendingOrganization,
    token?: string,
  ): Promise<boolean> => {
    const result = await signUpOrganization(
      {
        organizationName: pending.name,
        organizationType: pending.type,
        jurisdiction: pending.jurisdiction,
      },
      token,
    );
    if (result.error !== undefined) {
      setError(result.error.message);
      return false;
    }
    return true;
  };

  // Decide which step this visitor actually needs. Anyone who already belongs to an
  // organization is sent straight to the console — they must never land on "create your
  // organization" just because a session went idle. Anyone who supplied the details at signup
  // has them applied automatically, so confirming an email never means filling the form twice.
  useEffect(() => {
    if (!authEnabled) {
      return;
    }
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;
      if (session === null) {
        setStep('account');
        return;
      }

      const me = await getCurrentUser(session.access_token);
      if (!active) return;

      if (me.data === undefined) {
        setStep(me.status === 401 || me.status === 403 ? 'account' : 'blocked');
        return;
      }
      if (me.data.memberships.length > 0) {
        router.replace('/');
        return;
      }

      const pending = readPendingOrg(session.user.user_metadata);
      if (pending === null) {
        setStep('organization');
        return;
      }

      // The details were captured at signup — finish the job rather than asking again.
      setStep('finishing');
      const created = await createOrg(pending, session.access_token);
      if (!active) return;
      if (created) {
        // Best effort: stop the details being replayed if this user ever returns here.
        await supabase.auth.updateUser({ data: clearedPendingOrgMetadata() }).catch(() => undefined);
        router.replace('/');
        router.refresh();
        return;
      }
      // Creation failed (validation, API down). Fall back to the form, prefilled.
      setOrgName(pending.name);
      setOrgType(pending.type);
      setJurisdiction(pending.jurisdiction);
      setStep('organization');
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!authEnabled) {
        setError('Authentication is not configured, so organizations cannot be created.');
        return;
      }

      const pending: PendingOrganization = {
        name: orgName.trim(),
        type: orgType,
        jurisdiction: (jurisdiction.trim().toUpperCase() || 'US').slice(0, 2),
      };

      // Already signed in (e.g. returned from email confirmation): only the org step is left.
      if (step === 'organization') {
        if (await createOrg(pending)) {
          router.push('/');
          router.refresh();
        }
        return;
      }

      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          // Carried on the account so email confirmation cannot lose them.
          data: toPendingOrgMetadata(pending),
        },
      });
      if (signUpError !== null) {
        setError(signUpError.message);
        return;
      }
      if (data.session !== null) {
        if (await createOrg(pending, data.session.access_token)) {
          await supabase.auth.updateUser({ data: clearedPendingOrgMetadata() }).catch(() => undefined);
          router.push('/');
          router.refresh();
        }
        return;
      }
      setNotice(
        'Account created. Check your email to confirm your address — your organization details are saved, so signing in is all that’s left.',
      );
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

  if (step === 'checking' || step === 'finishing') {
    return (
      <AuthLayout panel={panel}>
        <div className="space-y-4">
          <AuthBrandMark />
          <AuthHeading
            title={step === 'finishing' ? 'Setting up your organization' : 'One moment'}
            subtitle={
              step === 'finishing'
                ? 'Applying the details you gave us when you signed up. This only takes a second.'
                : 'Checking your session…'
            }
          />
          <span
            aria-hidden
            className="block h-1 w-full overflow-hidden rounded-full bg-[var(--t-card-2)]"
          >
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-[var(--t-accent)]" />
          </span>
        </div>
      </AuthLayout>
    );
  }

  if (step === 'blocked') {
    return (
      <AuthLayout panel={panel}>
        <div className="space-y-5">
          <AuthBrandMark />
          <AuthHeading
            title="We couldn’t load your account"
            subtitle="You’re signed in, but we can’t reach the Sentra API to check whether you already have an organization. Try again in a moment rather than creating a duplicate."
          />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-[var(--t-accent)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--t-accent-strong)]"
          >
            Try again
          </button>
          <AuthFooterLink prompt="Need a different account?" href="/login" label="Sign in" />
        </div>
      </AuthLayout>
    );
  }

  const finishing = step === 'organization';

  return (
    <AuthLayout panel={panel}>
      <form onSubmit={submit} className="space-y-5">
        <AuthBrandMark />
        <AuthHeading
          title={finishing ? 'Create your organization' : 'Create your account'}
          subtitle={
            finishing
              ? 'One last step. Your organization starts in sandbox — you can request production access at any time.'
              : 'Start in sandbox with synthetic data. Request production access when you’re ready to go live.'
          }
        />

        <Field
          label="Organization name"
          icon={<IconBuilding />}
          type="text"
          required
          minLength={2}
          maxLength={80}
          placeholder="Acme Bank"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Type"
            icon={<IconBuilding />}
            value={orgType}
            onChange={(value) => setOrgType(value as OrgType)}
          >
            <option value="BANK">Bank</option>
            <option value="TELECOM">Telecom</option>
          </SelectField>
          <Field
            label="Country"
            icon={<IconGlobe />}
            type="text"
            maxLength={2}
            placeholder="US"
            className="uppercase"
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
          />
        </div>

        {!finishing && (
          <>
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
          </>
        )}

        {error !== null && <FormError>{error}</FormError>}
        {notice !== null && <FormNotice>{notice}</FormNotice>}

        <SubmitButton busy={busy}>
          {finishing ? 'Create organization' : 'Create account'}
        </SubmitButton>

        {!finishing && (
          <>
            <OrDivider />
            <AuthFooterLink prompt="Already have an account?" href="/login" label="Sign in" />
          </>
        )}
      </form>
    </AuthLayout>
  );
}
