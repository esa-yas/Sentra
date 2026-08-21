import type {
  AuditProvider,
  Clock,
  CreateInvitationInput,
  CreateMembershipInput,
  IdGenerator,
  InvitationRecord,
  InvitationRepository,
  MembershipRepository,
  OrganizationRecord,
  OrganizationRepository,
  UnitOfWork,
  UserRepository,
} from '@sentra/ports';
import type { Logger } from '@sentra/observability';
import { describe, expect, it } from 'vitest';
import { createInvitationAdmin, type InvitationMailer } from '../auth/invitation-admin';

const NOW = new Date('2026-08-21T00:00:00.000Z');
const clock: Clock = { now: () => NOW, monotonicMs: () => 0 };
const uow = {
  run: (async (fn: (scope: unknown) => unknown) => fn(undefined)) as UnitOfWork['run'],
} as UnitOfWork;
const audit = { record: async () => undefined } as unknown as AuditProvider;
const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

const makeIds = (): IdGenerator => {
  let n = 0;
  return { generate: () => `id_${(n += 1)}` };
};

const organizations = {
  findById: async () =>
    ({ id: 'org_1', legalName: 'Northwind Bank', type: 'BANK' }) as OrganizationRecord,
} as unknown as OrganizationRepository;

const noUsers = {
  findByEmail: async () => null,
  updateDisplayName: async () => ({}) as never,
} as unknown as UserRepository;

function invitationRepo(seed?: Partial<InvitationRecord>) {
  const created: CreateInvitationInput[] = [];
  const statuses: { id: string; status: string }[] = [];
  let record: InvitationRecord | null =
    seed === undefined
      ? null
      : ({
          id: 'inv_1',
          organizationId: 'org_1',
          email: 'invitee@bank.test',
          role: 'ANALYST',
          status: 'PENDING',
          tokenLookup: 'lookup',
          invitedBy: 'user_admin',
          createdAt: NOW,
          expiresAt: new Date(NOW.getTime() + 60_000),
          acceptedAt: null,
          revokedAt: null,
          ...seed,
        } as InvitationRecord);

  const repo = {
    create: async (input: CreateInvitationInput) => {
      created.push(input);
      return {
        ...input,
        status: 'PENDING',
        acceptedAt: null,
        revokedAt: null,
        createdAt: NOW,
      } as unknown as InvitationRecord;
    },
    findByTokenLookup: async () => record,
    findById: async () => record,
    listPendingForEmail: async () =>
      record === null || record.status !== 'PENDING' ? [] : [record],
    listForOrganization: async () => (record === null ? [] : [record]),
    updateStatus: async (id: string, status: string) => {
      statuses.push({ id, status });
      record = record === null ? null : ({ ...record, status } as InvitationRecord);
      return record as InvitationRecord;
    },
  } as unknown as InvitationRepository;
  return { repo, created, statuses };
}

function membershipRepo() {
  const created: CreateMembershipInput[] = [];
  const repo = {
    findByOrganizationAndUser: async () => null,
    create: async (input: CreateMembershipInput) => {
      created.push(input);
      return { id: input.id } as never;
    },
    updateStatus: async () => ({}) as never,
  } as unknown as MembershipRepository;
  return { repo, created };
}

const build = (
  invitations: InvitationRepository,
  memberships: MembershipRepository,
  sendMail: InvitationMailer = async () => true,
) =>
  createInvitationAdmin({
    invitations,
    memberships,
    organizations,
    users: noUsers,
    unitOfWork: uow,
    audit,
    ids: makeIds(),
    clock,
    logger,
    consoleBaseUrl: 'https://console.test',
    sendMail,
  });

const caller = { userId: 'user_1', email: 'invitee@bank.test', label: 'user:user_1' };

describe('invitation admin', () => {
  it('issues an invitation with a hashed token and a shareable accept link', async () => {
    const { repo, created } = invitationRepo();
    const admin = build(repo, membershipRepo().repo);

    const result = await admin.invite('org_1', { userId: 'user_admin', label: 'a' }, {
      email: '  Invitee@Bank.test ',
      role: 'ANALYST',
    });

    expect(result.emailSent).toBe(true);
    expect(result.acceptUrl).toContain('https://console.test/invite?token=');
    // The address is normalised, and only a hash of the token is persisted.
    expect(created[0]?.email).toBe('invitee@bank.test');
    expect(created[0]?.tokenLookup).toHaveLength(64);
    const token = new URL(result.acceptUrl).searchParams.get('token') ?? '';
    expect(created[0]?.tokenLookup).not.toContain(token);
  });

  it('reports when the invitation email could not be sent, instead of implying it was', async () => {
    const { repo } = invitationRepo();
    const admin = build(repo, membershipRepo().repo, async () => false);
    const result = await admin.invite('org_1', { userId: 'a', label: 'a' }, {
      email: 'x@bank.test',
      role: 'ANALYST',
    });
    expect(result.emailSent).toBe(false);
    expect(result.acceptUrl).toContain('/invite?token=');
  });

  it('grants the role from the invitation when the invited address accepts', async () => {
    const { repo, statuses } = invitationRepo({});
    const members = membershipRepo();
    const admin = build(repo, members.repo);

    const result = await admin.accept({ token: 'any-token' }, caller, 'Ada Lovelace');

    expect(result.organizationName).toBe('Northwind Bank');
    expect(members.created[0]?.role).toBe('ANALYST');
    expect(members.created[0]?.organizationId).toBe('org_1');
    expect(members.created[0]?.status).toBe('ACTIVE');
    expect(statuses).toContainEqual({ id: 'inv_1', status: 'ACCEPTED' });
  });

  // A forwarded link must not let a different account join the organization.
  it('refuses acceptance by an address other than the invited one', async () => {
    const { repo } = invitationRepo({});
    const members = membershipRepo();
    const admin = build(repo, members.repo);

    await expect(
      admin.accept({ token: 'any-token' }, { ...caller, email: 'someone.else@evil.test' }, 'Mallory'),
    ).rejects.toThrow(/different email address/i);
    expect(members.created).toHaveLength(0);
  });

  it('refuses an already accepted, revoked, or expired invitation', async () => {
    const accepted = build(invitationRepo({ status: 'ACCEPTED' }).repo, membershipRepo().repo);
    await expect(accepted.accept({ token: 't' }, caller, 'Ada')).rejects.toThrow(/already been accepted/i);

    const revoked = build(invitationRepo({ status: 'REVOKED' }).repo, membershipRepo().repo);
    await expect(revoked.accept({ token: 't' }, caller, 'Ada')).rejects.toThrow(/revoked/i);

    const expired = build(
      invitationRepo({ expiresAt: new Date(NOW.getTime() - 1) }).repo,
      membershipRepo().repo,
    );
    await expect(expired.accept({ token: 't' }, caller, 'Ada')).rejects.toThrow(/expired/i);
  });

  it('previews an invitation without leaking the token or who sent it', async () => {
    const admin = build(invitationRepo({}).repo, membershipRepo().repo);
    const preview = await admin.preview('any-token');
    expect(preview).toEqual({
      email: 'invitee@bank.test',
      role: 'ANALYST',
      organizationName: 'Northwind Bank',
      organizationType: 'BANK',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    expect(Object.keys(preview)).not.toContain('invitedBy');
  });

  // The reported bug: an invited employee who signs in before accepting had no membership, so the
  // console offered them the founder wizard — asking them to create a bank they do not own.
  it('lists a pending invitation for the signed-in address so they are not treated as a founder', async () => {
    const admin = build(invitationRepo({}).repo, membershipRepo().repo);
    const mine = await admin.listMine('  Invitee@Bank.test ');
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({
      id: 'inv_1',
      role: 'ANALYST',
      organizationName: 'Northwind Bank',
    });
  });

  it('does not list expired invitations', async () => {
    const admin = build(
      invitationRepo({ expiresAt: new Date(NOW.getTime() - 1) }).repo,
      membershipRepo().repo,
    );
    expect((await admin.listMine('invitee@bank.test')).items).toHaveLength(0);
  });

  it('accepts by invitation id, still refusing a mismatched address', async () => {
    const members = membershipRepo();
    const admin = build(invitationRepo({}).repo, members.repo);

    const result = await admin.accept({ invitationId: 'inv_1' }, caller, 'Ada Lovelace');
    expect(result.organizationName).toBe('Northwind Bank');
    expect(members.created[0]?.role).toBe('ANALYST');

    const other = membershipRepo();
    const admin2 = build(invitationRepo({}).repo, other.repo);
    await expect(
      admin2.accept({ invitationId: 'inv_1' }, { ...caller, email: 'mallory@evil.test' }, 'M'),
    ).rejects.toThrow(/different email address/i);
    expect(other.created).toHaveLength(0);
  });
});
