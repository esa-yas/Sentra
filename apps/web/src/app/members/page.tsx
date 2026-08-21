'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useSession } from '@/lib/session';
import type { InvitationView } from '@sentra/contracts';
import { Badge, Button, EmptyState, Input, Notice, Panel, Select } from '@/components/ui';
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
        <div className="mb-5">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {canWrite ? (
        <Panel title="Invite a teammate" description="They’ll get an email with a link to join this organization." className="mb-5">
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <Input
                label="Email to invite"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@bank.test"
              />
            </div>
            <div className="w-40">
              <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" tone="primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send invitation'}
            </Button>
          </form>
        </Panel>
      ) : null}

      {manualLink !== null ? (
        <div className="mb-5">
          <Notice tone="warn" title="Invitation created, but no email was sent">
            Email delivery isn’t configured, so share this link with them directly. It expires in
            seven days.
            <code className="mt-2.5 block overflow-x-auto rounded-lg border border-amber-500/25 bg-[var(--t-card)] px-3 py-2 font-mono text-[11px] text-slate-200">
              {manualLink}
            </code>
          </Notice>
        </div>
      ) : null}

      {invitations.filter((invite) => invite.status === 'PENDING').length > 0 ? (
        <Panel title="Pending invitations" className="mb-5" bodyClassName="px-5 pb-5 pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Expires</th>
                  {canWrite ? <th className="pb-2 font-medium" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invitations
                  .filter((invite) => invite.status === 'PENDING')
                  .map((invite) => (
                    <tr key={invite.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-200">{invite.email}</td>
                      <td className="py-2.5 pr-4">
                        <Badge className="border-slate-700 bg-[var(--t-card-2)] text-slate-300">
                          {invite.role}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">
                        {formatDateTime(invite.expiresAt)}
                      </td>
                      {canWrite ? (
                        <td className="py-2.5 text-right">
                          <Button tone="danger" size="sm" onClick={() => void onRevokeInvite(invite.id)}>
                            Revoke
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel title="Members" bodyClassName="px-5 pb-5 pt-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : members.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Invite a teammate above to give them access to this organization."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Member</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  {canWrite ? <th className="pb-2 font-medium" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-slate-200">{member.displayName}</div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </td>
                    <td className="py-2.5 pr-4">
                      {canWrite ? (
                        <Select
                          className="w-36 py-1 text-xs"
                          value={member.role}
                          onChange={(e) => void onChangeRole(member.id, e.target.value)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-slate-300">{member.role}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        className={
                          member.status === 'ACTIVE'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700 bg-[var(--t-card-2)] text-slate-400'
                        }
                      >
                        {member.status}
                      </Badge>
                    </td>
                    {canWrite ? (
                      <td className="py-2.5 text-right">
                        <Button tone="danger" size="sm" onClick={() => void onRemove(member.id)}>
                          Remove
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
