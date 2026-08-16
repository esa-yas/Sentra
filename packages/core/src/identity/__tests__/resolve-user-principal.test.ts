import {
  ForbiddenError,
  InvalidTokenError,
  MEMBER_ROLES,
  ORGANIZATION_TYPES,
  PERMISSIONS,
} from '@sentra/contracts';
import { createFakeClock, createFakeIdGenerator, createFakeUnitOfWork } from '@sentra/testing';
import type {
  IdentityLinkRecord,
  IdentityLinkRepository,
  MembershipRepository,
  MembershipWithOrganization,
  UserRecord,
  UserRepository,
  UserTokenVerifier,
  VerifiedUserToken,
} from '@sentra/ports';
import { describe, expect, it } from 'vitest';
import { createResolveUserPrincipalUseCase } from '../resolve-user-principal';

const ISSUER = 'https://project.supabase.co/auth/v1';

interface HarnessOptions {
  readonly user?: UserRecord;
  readonly link?: IdentityLinkRecord;
  readonly memberships?: readonly MembershipWithOrganization[];
  readonly verified?: VerifiedUserToken;
}

const buildHarness = (options: HarnessOptions = {}) => {
  const clock = createFakeClock();
  const ids = createFakeIdGenerator();
  const unitOfWork = createFakeUnitOfWork(clock);

  const users = new Map<string, UserRecord>();
  const links = new Map<string, IdentityLinkRecord>();
  const touched = { lastSeen: [] as string[], lastUsed: [] as string[] };
  if (options.user !== undefined) {
    users.set(options.user.id, options.user);
  }
  if (options.link !== undefined) {
    links.set(`${options.link.issuer}|${options.link.subject}`, options.link);
  }

  const userRepo = {
    create: async (input: { id: string; primaryEmail: string; displayName: string }) => {
      const record: UserRecord = {
        id: input.id,
        primaryEmail: input.primaryEmail,
        displayName: input.displayName,
        status: 'ACTIVE',
        mfaEnabled: false,
        lastSeenAt: null,
        createdAt: clock.now(),
      };
      users.set(record.id, record);
      return record;
    },
    findById: async (id: string) => users.get(id) ?? null,
    findByEmail: async (email: string) =>
      [...users.values()].find((user) => user.primaryEmail === email) ?? null,
    touchLastSeen: async (id: string) => {
      touched.lastSeen.push(id);
    },
  } as unknown as UserRepository;

  const identityRepo = {
    create: async (input: { id: string; userId: string; issuer: string; subject: string }) => {
      const record: IdentityLinkRecord = {
        id: input.id,
        userId: input.userId,
        issuer: input.issuer,
        subject: input.subject,
        createdAt: clock.now(),
        lastUsedAt: null,
      };
      links.set(`${record.issuer}|${record.subject}`, record);
      return record;
    },
    findByIssuerAndSubject: async (issuer: string, subject: string) =>
      links.get(`${issuer}|${subject}`) ?? null,
    touchLastUsed: async (id: string) => {
      touched.lastUsed.push(id);
    },
  } as unknown as IdentityLinkRepository;

  const membershipRepo = {
    listActiveForUser: async () => options.memberships ?? [],
  } as unknown as MembershipRepository;

  const verifier: UserTokenVerifier = {
    verify: async (token: string): Promise<VerifiedUserToken> => {
      if (token !== 'valid') {
        throw new InvalidTokenError();
      }
      return (
        options.verified ?? {
          issuer: ISSUER,
          subject: 'sub-1',
          email: 'ops@bank.test',
          expiresAt: new Date(clock.now().getTime() + 3_600_000),
        }
      );
    },
  };

  const useCase = createResolveUserPrincipalUseCase({
    clock,
    ids,
    unitOfWork,
    verifier,
    users: userRepo,
    identities: identityRepo,
    memberships: membershipRepo,
  });

  return { useCase, users, links, touched };
};

const membershipOf = (
  role: (typeof MEMBER_ROLES)[keyof typeof MEMBER_ROLES],
  organizationType: (typeof ORGANIZATION_TYPES)[keyof typeof ORGANIZATION_TYPES],
): MembershipWithOrganization => ({
  id: 'm1',
  organizationId: 'org-1',
  userId: 'user-1',
  role,
  status: 'ACTIVE',
  invitedBy: null,
  createdAt: new Date(),
  activatedAt: new Date(),
  removedAt: null,
  organizationSlug: 'acme-bank',
  organizationType,
  organizationStatus: 'ACTIVE',
});

const activeUser = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: 'user-1',
  primaryEmail: 'admin@bank.test',
  displayName: 'Admin',
  status: 'ACTIVE',
  mfaEnabled: false,
  lastSeenAt: null,
  createdAt: new Date(),
  ...overrides,
});

const linkFor = (userId: string): IdentityLinkRecord => ({
  id: 'link-1',
  userId,
  issuer: ISSUER,
  subject: 'sub-1',
  createdAt: new Date(),
  lastUsedAt: null,
});

describe('createResolveUserPrincipalUseCase', () => {
  it('provisions a new user with no tenant access and a PII-free label', async () => {
    const { useCase, users, touched } = buildHarness();

    const result = await useCase.execute('valid');

    expect(result.provisioned).toBe(true);
    expect(result.principal.kind).toBe('USER');
    expect(result.principal.subject).toBe('sub-1');
    expect(result.principal.memberships).toEqual([]);
    expect(result.principal.label).toBe(`user:${result.principal.id}`);
    expect(result.principal.label).not.toContain('ops@bank.test');
    expect(result.profile.email).toBe('ops@bank.test');
    expect(touched.lastSeen).toContain(result.principal.id);
    expect(users.size).toBe(1);
  });

  it('reuses an existing identity link and maps role to permissions', async () => {
    const { useCase, touched } = buildHarness({
      user: activeUser(),
      link: linkFor('user-1'),
      memberships: [membershipOf(MEMBER_ROLES.ADMIN, ORGANIZATION_TYPES.BANK)],
    });

    const result = await useCase.execute('valid');

    expect(result.provisioned).toBe(false);
    expect(result.principal.id).toBe('user-1');
    expect(result.principal.memberships).toHaveLength(1);
    const membership = result.principal.memberships[0]!;
    expect(membership.role).toBe('ADMIN');
    expect(membership.permissions).toContain(PERMISSIONS.PARTNER_WRITE);
    // A bank admin is not a platform administrator, so cannot create tenants.
    expect(membership.permissions).not.toContain(PERMISSIONS.ORGANIZATION_CREATE);
    expect(touched.lastUsed).toContain('link-1');
  });

  it('grants tenant creation only to a platform owner', async () => {
    const { useCase } = buildHarness({
      user: activeUser(),
      link: linkFor('user-1'),
      memberships: [membershipOf(MEMBER_ROLES.OWNER, ORGANIZATION_TYPES.PLATFORM)],
    });

    const result = await useCase.execute('valid');

    expect(result.principal.memberships[0]!.permissions).toContain(PERMISSIONS.ORGANIZATION_CREATE);
  });

  it('propagates an invalid token as InvalidTokenError before any provisioning', async () => {
    const { useCase, users } = buildHarness();
    await expect(useCase.execute('bad')).rejects.toBeInstanceOf(InvalidTokenError);
    expect(users.size).toBe(0);
  });

  it('refuses a suspended user even with a valid token', async () => {
    const { useCase } = buildHarness({
      user: activeUser({ status: 'SUSPENDED' }),
      link: linkFor('user-1'),
    });
    await expect(useCase.execute('valid')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
