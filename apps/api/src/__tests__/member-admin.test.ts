import { ValidationError } from '@sentra/contracts';
import { createFakeAuditProvider, createFakeClock, createFakeIdGenerator, createFakeUnitOfWork } from '@sentra/testing';
import type {
  MembershipRecord,
  MembershipRepository,
  UserRecord,
  UserRepository,
} from '@sentra/ports';
import { describe, expect, it } from 'vitest';
import { createMemberAdmin } from '../auth/member-admin';

const ORG = 'org-1';
const ACTOR = { userId: 'admin-1', label: 'user:admin-1' };

const buildHarness = (seed: { users?: UserRecord[]; memberships?: MembershipRecord[] } = {}) => {
  const clock = createFakeClock();
  const ids = createFakeIdGenerator();
  const unitOfWork = createFakeUnitOfWork(clock);
  const audit = createFakeAuditProvider({ unitOfWork });

  const users = new Map<string, UserRecord>((seed.users ?? []).map((u) => [u.id, u]));
  const memberships = new Map<string, MembershipRecord>((seed.memberships ?? []).map((m) => [m.id, m]));

  const userRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByEmail: async (email: string) => [...users.values()].find((u) => u.primaryEmail === email) ?? null,
  } as unknown as UserRepository;

  const membershipRepo = {
    create: async (input: MembershipRecord) => {
      const record: MembershipRecord = { ...input, createdAt: clock.now(), removedAt: null };
      memberships.set(record.id, record);
      return record;
    },
    findById: async (id: string) => memberships.get(id) ?? null,
    findByOrganizationAndUser: async (organizationId: string, userId: string) =>
      [...memberships.values()].find((m) => m.organizationId === organizationId && m.userId === userId) ?? null,
    listForOrganization: async (organizationId: string) => ({
      items: [...memberships.values()].filter((m) => m.organizationId === organizationId),
    }),
    updateRole: async (id: string, role: MembershipRecord['role']) => {
      const updated = { ...memberships.get(id)!, role };
      memberships.set(id, updated);
      return updated;
    },
    updateStatus: async (id: string, status: MembershipRecord['status'], at: Date) => {
      const updated = { ...memberships.get(id)!, status, removedAt: status === 'REMOVED' ? at : null };
      memberships.set(id, updated);
      return updated;
    },
    countActiveByRole: async (organizationId: string, role: MembershipRecord['role']) =>
      [...memberships.values()].filter(
        (m) => m.organizationId === organizationId && m.role === role && m.status === 'ACTIVE',
      ).length,
  } as unknown as MembershipRepository;

  const memberAdmin = createMemberAdmin({
    memberships: membershipRepo,
    users: userRepo,
    unitOfWork,
    audit,
    ids,
    clock,
  });
  return { memberAdmin, memberships };
};

const user = (id: string, email: string): UserRecord => ({
  id,
  primaryEmail: email,
  displayName: email.split('@')[0]!,
  status: 'ACTIVE',
  mfaEnabled: false,
  lastSeenAt: null,
  createdAt: new Date(),
});

const membership = (id: string, userId: string, role: MembershipRecord['role']): MembershipRecord => ({
  id,
  organizationId: ORG,
  userId,
  role,
  status: 'ACTIVE',
  invitedBy: null,
  createdAt: new Date(),
  activatedAt: new Date(),
  removedAt: null,
});

describe('MemberAdmin', () => {
  it('lists members with the resolved user email', async () => {
    const { memberAdmin } = buildHarness({
      users: [user('u1', 'owner@bank.test')],
      memberships: [membership('m1', 'u1', 'OWNER')],
    });
    const list = await memberAdmin.list(ORG);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.email).toBe('owner@bank.test');
    expect(list.items[0]!.role).toBe('OWNER');
  });

  it('adds an existing user by email', async () => {
    const { memberAdmin } = buildHarness({ users: [user('u2', 'analyst@bank.test')] });
    const created = await memberAdmin.addByEmail(ORG, 'analyst@bank.test', 'ANALYST', ACTOR);
    expect(created.userId).toBe('u2');
    expect(created.role).toBe('ANALYST');
  });

  it('refuses to add an email that has never signed in', async () => {
    const { memberAdmin } = buildHarness();
    await expect(memberAdmin.addByEmail(ORG, 'nobody@bank.test', 'ANALYST', ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses to demote the last owner', async () => {
    const { memberAdmin } = buildHarness({
      users: [user('u1', 'owner@bank.test')],
      memberships: [membership('m1', 'u1', 'OWNER')],
    });
    await expect(memberAdmin.changeRole(ORG, 'm1', 'ADMIN', ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });

  it('allows demoting an owner when another owner remains', async () => {
    const { memberAdmin } = buildHarness({
      users: [user('u1', 'a@bank.test'), user('u2', 'b@bank.test')],
      memberships: [membership('m1', 'u1', 'OWNER'), membership('m2', 'u2', 'OWNER')],
    });
    const updated = await memberAdmin.changeRole(ORG, 'm1', 'ADMIN', ACTOR);
    expect(updated.role).toBe('ADMIN');
  });

  it('refuses to remove the last owner', async () => {
    const { memberAdmin } = buildHarness({
      users: [user('u1', 'owner@bank.test')],
      memberships: [membership('m1', 'u1', 'OWNER')],
    });
    await expect(memberAdmin.remove(ORG, 'm1', ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });
});
