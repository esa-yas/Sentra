'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser, signUpOrganization } from '@/lib/api';
import {
  AuthBrandMark,
  AuthBrandPanel,
  AuthHeading,
  AuthLayout,
  ChoiceCard,
  Field,
  FormError,
  GhostButton,
  IconAntenna,
  IconBank,
  IconBriefcase,
  IconGlobe,
  IconBuilding,
  IconUser,
  SelectField,
  StepProgress,
  SubmitButton,
} from '@/components/auth-ui';

type OrgType = 'BANK' | 'TELECOM';

const TOTAL_STEPS = 3;

/** Kept on the Supabase user record; no schema change needed for profile answers. */
const PROFILE_METADATA = {
  fullName: 'full_name',
  jobTitle: 'job_title',
  useCase: 'primary_use_case',
  volume: 'monthly_payment_volume',
} as const;

const USE_CASES = [
  { value: '', label: 'Select one…' },
  { value: 'app-scams', label: 'Authorized payment scams (Zelle, P2P, wire)' },
  { value: 'account-takeover', label: 'Account takeover' },
  { value: 'sim-swap', label: 'SIM-swap and telecom signals' },
  { value: 'evaluating', label: 'Still evaluating' },
];

const VOLUMES = [
  { value: '', label: 'Select one…' },
  { value: '<10k', label: 'Under 10,000 / month' },
  { value: '10k-100k', label: '10,000 – 100,000 / month' },
  { value: '100k-1m', label: '100,000 – 1 million / month' },
  { value: '1m+', label: 'Over 1 million / month' },
  { value: 'unknown', label: 'Not sure yet' },
];

const PANELS = [
  {
    headline: 'Welcome to Sentra.',
    quote: 'A few quick questions so the console arrives set up the way your team works.',
  },
  {
    headline: 'Your organization, your tenant.',
    quote: 'Every organization gets its own isolated tenant, its own keys, and its own hash-chained audit trail.',
  },
  {
    headline: 'Sandbox first, always.',
    quote: 'New organizations start in sandbox with synthetic data, so you can integrate and test before a single real payment is at stake.',
  },
];

/**
 * First-run setup for a signed-in user who does not belong to an organization yet.
 *
 * Split into three short steps rather than one long form: who they are, the organization to
 * create, and how they intend to use the network. Only the organization step feeds the API —
 * the profile answers are stored on the Supabase user, so nothing here needs a migration.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);

  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('BANK');
  const [jurisdiction, setJurisdiction] = useState('US');
  const [useCase, setUseCase] = useState('');
  const [volume, setVolume] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Anyone who already has an organization is finished here; anyone signed out belongs at login.
  useEffect(() => {
    if (!authEnabled) {
      router.replace('/login');
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await createClient().auth.getSession();
      const session = data.session;
      if (!active) return;
      if (session === null) {
        router.replace('/login');
        return;
      }
      const metadata = session.user.user_metadata as Record<string, unknown> | null;
      const storedName = metadata?.[PROFILE_METADATA.fullName];
      if (typeof storedName === 'string') {
        setFullName(storedName);
      }

      const me = await getCurrentUser(session.access_token);
      if (!active) return;
      if (me.data !== undefined && me.data.memberships.length > 0) {
        router.replace('/');
        return;
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await signUpOrganization({
        organizationName: orgName.trim(),
        organizationType: orgType,
        jurisdiction: (jurisdiction.trim().toUpperCase() || 'US').slice(0, 2),
      });
      if (result.error !== undefined) {
        setError(result.error.message);
        return;
      }
      // Best effort — the organization already exists, so a metadata failure must not block entry.
      await createClient()
        .auth.updateUser({
          data: {
            [PROFILE_METADATA.fullName]: fullName.trim(),
            [PROFILE_METADATA.jobTitle]: jobTitle.trim(),
            [PROFILE_METADATA.useCase]: useCase,
            [PROFILE_METADATA.volume]: volume,
          },
        })
        .catch(() => undefined);
      router.replace('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    void finish();
  };

  const panel = <AuthBrandPanel {...PANELS[step - 1]} />;

  if (!ready) {
    return (
      <AuthLayout panel={panel}>
        <div className="space-y-4">
          <AuthBrandMark />
          <AuthHeading title="One moment" subtitle="Getting your account ready…" />
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
        <StepProgress current={step} total={TOTAL_STEPS} />

        {/* The key remounts on step change so each step animates in rather than swapping. */}
        <div key={step} className="animate-[fadeIn_260ms_ease-out] space-y-5">
          {step === 1 && (
            <>
              <AuthHeading
                title="First, about you"
                subtitle="This is how your teammates will see you in the console."
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
                placeholder="Head of Fraud"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </>
          )}

          {step === 2 && (
            <>
              <AuthHeading
                title="Your organization"
                subtitle="This creates your tenant. Everything you send stays isolated to it."
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
              <div className="space-y-2.5">
                <span className="block text-sm font-medium text-slate-300">Organization type</span>
                <ChoiceCard
                  selected={orgType === 'BANK'}
                  onSelect={() => setOrgType('BANK')}
                  icon={<IconBank />}
                  title="Bank or payments provider"
                  description="You move money and decide whether a payment goes through."
                />
                <ChoiceCard
                  selected={orgType === 'TELECOM'}
                  onSelect={() => setOrgType('TELECOM')}
                  icon={<IconAntenna />}
                  title="Telecom"
                  description="You observe call and SIM signals that help spot a scam in progress."
                />
              </div>
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
            </>
          )}

          {step === 3 && (
            <>
              <AuthHeading
                title="How will you use Sentra?"
                subtitle="Optional, and only used to tune what we show you first."
              />
              <SelectField
                label="Primary use case"
                icon={<IconBriefcase />}
                value={useCase}
                onChange={setUseCase}
              >
                {USE_CASES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Expected payment volume"
                icon={<IconGlobe />}
                value={volume}
                onChange={setVolume}
              >
                {VOLUMES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <div className="rounded-xl border border-slate-800 bg-[var(--t-card-2)] px-4 py-3 text-xs leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">{orgName || 'Your organization'}</span>{' '}
                will be created in <span className="font-semibold text-slate-300">sandbox</span>. You
                can request production access from the Organization page whenever you’re ready.
              </div>
            </>
          )}
        </div>

        {error !== null && <FormError>{error}</FormError>}

        <div className="flex gap-3">
          {step > 1 && <GhostButton onClick={() => setStep(step - 1)}>Back</GhostButton>}
          <span className="flex-1">
            <SubmitButton busy={busy}>
              {step === TOTAL_STEPS ? 'Create organization' : 'Continue'}
            </SubmitButton>
          </span>
        </div>
      </form>
    </AuthLayout>
  );
}
