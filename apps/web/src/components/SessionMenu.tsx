'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';

/**
 * Topbar identity controls: the active organization (a selector when the operator belongs to
 * more than one), the signed-in user, and sign-out. Renders nothing in demo mode or before a
 * session resolves. The active org drives which tenant's data the console requests.
 */
export function SessionMenu() {
  const router = useRouter();
  const { authEnabled, user, memberships, activeOrgId, setActiveOrgId, signOut } = useSession();
  const [busy, setBusy] = useState(false);

  if (!authEnabled || user === null) {
    return null;
  }

  const onSignOut = async () => {
    setBusy(true);
    await signOut();
    router.push('/login');
    router.refresh();
  };

  const orgControl =
    memberships.length > 1 ? (
      <select
        value={activeOrgId ?? ''}
        onChange={(event) => {
          setActiveOrgId(event.target.value);
          router.refresh();
        }}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none"
        aria-label="Active organization"
      >
        {memberships.map((membership) => (
          <option key={membership.organizationId} value={membership.organizationId}>
            {membership.organizationSlug} · {membership.role.toLowerCase()}
          </option>
        ))}
      </select>
    ) : memberships.length === 1 ? (
      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-400">
        {memberships[0]!.organizationSlug} · {memberships[0]!.role.toLowerCase()}
      </span>
    ) : (
      <span className="rounded-md border border-amber-700/50 bg-amber-900/20 px-2 py-1 text-amber-300">
        no organization
      </span>
    );

  return (
    <div className="flex items-center gap-2 text-xs">
      {orgControl}
      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
        {user.email}
      </span>
      <button
        type="button"
        onClick={() => void onSignOut()}
        disabled={busy}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-60"
      >
        Sign out
      </button>
    </div>
  );
}
