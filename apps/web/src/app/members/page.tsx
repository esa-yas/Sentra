'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useSession } from '@/lib/session';
import type { InvitationView } from '@sentra/contracts';
import { Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  createInvitation,
  getInvitations,
  getMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  type MemberRow,
} from '@/lib/api';

const ROLES = ['OWNER', 'ADMIN', 'ANALYST', 'AUDITOR', 'OPERATOR'] as const;

type Role = (typeof ROLES)[number];

export default function MembersPage() {
  const { hasPermission } = useSession();
  const canWrite = hasPermission('member:write');

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('ANALYST');
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  // Set when an invitation was created but no mail could be sent, so the link can be shared.
  const [manualLink, setManualLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, invites] = await Promise.all([getMembers(), getInvitations()]);
    if (res.ok && res.data !== undefined) {
      setMembers([...res.data.items]);
      setError(null);
    } else {
      setError(res.error?.message ?? 'Could not load members.');
    }
    if (invites.data !== undefined) {
      setInvitations([...invites.data.items]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setManualLink(null);
    const res = await createInvitation({ email: email.trim(), role });
    setBusy(false);
    if (res.data !== undefined) {
      setEmail('');
      setError(null);
      // Be explicit when the mail could not go out, rather than implying it did.
      setManualLink(res.data.emailSent ? null : res.data.acceptUrl);
      void load();
    } else {
      setError(res.error?.message ?? 'Could not send the invitation.');
    }
  };

  const onRevokeInvite = async (invitationId: string) => {
    const res = await revokeInvitation(invitationId);
    if (res.error !== undefined) setError(res.error.message);
    void load();
  };

  const onChangeRole = async (membershipId: string, nextRole: string) => {
    const res = await updateMemberRole(membershipId, nextRole);
    if (!res.ok) setError(res.error?.message ?? 'Could not change role.');
    void load();
  };

  const onRemove = async (membershipId: string) => {
    const res = await removeMember(membershipId);
    if (!res.ok) setError(res.error?.message ?? 'Could not remove member.');
    void load();
  };

  return (
    <div>
      <PageHeader
        title="Members"
        description="People with access to this organization. Roles determine what each member can see and do; the API enforces every action."
      />

      {error !== null ? (
        <div className="mb-4 rounded-md border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      {canWrite ? (
        <form
          onSubmit={onAdd}
          className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Email to invite
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@bank.test"
              className="w-72 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      ) : null}

      {manualLink !== null ? (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-200">Invitation created, but no email was sent</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Email delivery isn’t configured, so share this link with them directly. It expires in
            seven days.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-md border border-amber-500/25 bg-[var(--t-card)] px-3 py-2 font-mono text-[11px] text-slate-200">
            {manualLink}
          </code>
        </div>
      ) : null}

      {invitations.filter((invite) => invite.status === 'PENDING').length > 0 ? (
        <div className="mb-6 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--t-card-2)] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Pending invitation</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                {canWrite ? <th className="px-4 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {invitations
                .filter((invite) => invite.status === 'PENDING')
                .map((invite) => (
                  <tr key={invite.id} className="text-slate-300">
                    <td className="px-4 py-2 text-slate-200">{invite.email}</td>
                    <td className="px-4 py-2">
                      <Badge className="border-slate-700 bg-[var(--t-card-2)] text-slate-300">
                        {invite.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {formatDateTime(invite.expiresAt)}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void onRevokeInvite(invite.id)}
                          className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10"
                        >
                          Revoke
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {canWrite ? <th className="px-4 py-2 font-medium" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={4}>
                  No members yet.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="text-slate-300">
                  <td className="px-4 py-2">
                    <div className="text-slate-100">{member.displayName}</div>
                    <div className="text-xs text-slate-500">{member.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    {canWrite ? (
                      <select
                        value={member.role}
                        onChange={(e) => void onChangeRole(member.id, e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs">{member.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">{member.status}</td>
                  {canWrite ? (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void onRemove(member.id)}
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-rose-300 hover:bg-slate-800"
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
