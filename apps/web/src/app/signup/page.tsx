'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import { signUpOrganization } from '@/lib/api';

type OrgType = 'BANK' | 'TELECOM';

export default function SignupPage() {
  const router = useRouter();
  // null = still checking the session; true = signed in (finish-setup); false = new account.
  const [authed, setAuthed] = useState<boolean | null>(authEnabled ? null : false);

  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('BANK');
  const [jurisdiction, setJurisdiction] = useState('GB');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authEnabled) {
      return;
    }
    void createClient()
      .auth.getSession()
      .then(({ data }) => setAuthed(data.session !== null));
  }, []);

  const createOrg = async (token?: string): Promise<boolean> => {
    const result = await signUpOrganization(
      {
        organizationName: orgName.trim(),
        organizationType: orgType,
        jurisdiction: (jurisdiction.trim().toUpperCase() || 'GB').slice(0, 2),
      },
      token,
    );
    if (result.error !== undefined) {
      setError(result.error.message);
      return false;
    }
    return true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!authEnabled) {
        setError('Authentication is not configured, so organizations cannot be created in demo mode.');
        return;
      }

      // Already signed in (e.g. arrived here after confirming email): just create the org.
      if (authed === true) {
        if (await createOrg()) {
          router.push('/');
          router.refresh();
        }
        return;
      }

      const supabase = createClient();
      const { data, error: signErr } = await supabase.auth.signUp({ email, password });
      if (signErr !== null) {
        setError(signErr.message);
        return;
      }
      if (data.session !== null) {
        if (await createOrg(data.session.access_token)) {
          router.push('/');
          router.refresh();
        }
      } else {
        setNotice(
          'Account created. Confirm your email, then sign in — we’ll finish setting up your organization.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = authed === true;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-[var(--t-shadow)]"
      >
        <div className="space-y-1">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-sm font-bold text-white">
              S
            </span>
            <span className="text-[17px] font-bold tracking-tight text-slate-100">Sentra</span>
          </div>
          <h1 className="text-lg font-semibold text-slate-100">
            {finishSetup ? 'Create your organization' : 'Create your Sentra account'}
          </h1>
          <p className="text-xs text-slate-400">
            {finishSetup
              ? 'Set up your organization to finish. It starts in sandbox — request production access anytime.'
              : 'Organizations start in sandbox and can request production access after review.'}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Organization name</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            placeholder="Acme Bank"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Type</span>
            <select
              value={orgType}
              onChange={(event) => setOrgType(event.target.value as OrgType)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="BANK">Bank</option>
              <option value="TELECOM">Telecom</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Country</span>
            <input
              type="text"
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value)}
              maxLength={2}
              placeholder="GB"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
        </div>

        {!finishSetup && (
          <>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Work email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
          </>
        )}

        {error !== null ? <p className="text-xs text-rose-400">{error}</p> : null}
        {notice !== null ? <p className="text-xs text-emerald-400">{notice}</p> : null}

        <button
          type="submit"
          disabled={busy || authed === null}
          className="w-full rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
        >
          {busy ? 'Please wait…' : finishSetup ? 'Create organization' : 'Create account'}
        </button>

        {!finishSetup && (
          <p className="text-center text-xs text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-sky-400 hover:text-sky-300">
              Sign in
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
