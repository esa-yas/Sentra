import type {
  AuditProvider,
  Clock,
  CreateMembershipInput,
  CreateOrganizationInput,
  IdGenerator,
  MembershipRepository,
  OrganizationRecord,
  OrganizationRepository,
  UnitOfWork,
} from '@sentra/ports';
import { describe, expect, it } from 'vitest';
import { createOrgSignup } from '../auth/org-signup';

const clock: Clock = {
  now: () => new Date('2026-08-20T00:00:00.000Z'),
  monotonicMs: () => 0,
};

const makeIds = (): IdGenerator => {
  let n = 0;
  return { generate: () => `id_${(n += 1)}` };
};

const passthroughUnitOfWork: UnitOfWork = {
  // The signup service only needs run() to invoke its body with a scope; a real transaction
  // is exercised by integration tests against Postgres.
  run: (async (fn: (scope: unknown) => unknown) => fn(undefined)) as UnitOfWork['run'],
} as UnitOfWork;

const noopAudit: AuditProvider = {
  record: async () => undefined,
} as unknown as AuditProvider;

function orgRepo(existingSlugs: Set<string>): {
  repo: OrganizationRepository;
  created: CreateOrganizationInput[];
} {
  const created: CreateOrganizationInput[] = [];
  const repo = {
    create: async (input: CreateOrganizationInput): Promise<OrganizationRecord> => {
      created.push(input);
      return {
        id: input.id,
        slug: input.slug,
        legalName: input.legalName,
        type: input.type,
        status: 'ACTIVE',
        jurisdiction: input.jurisdiction,
        dataResidency: input.dataResidency,
        defaultCurrency: input.defaultCurrency,
        createdAt: clock.now(),
        updatedAt: clock.now(),
        createdBy: input.createdBy,
        source: input.source,
      };
    },
    findBySlug: async (slug: string): Promise<OrganizationRecord | null> =>
      existingSlugs.has(slug) ? ({ slug } as OrganizationRecord) : null,
    findById: async () => null,
    update: async () => ({}) as OrganizationRecord,
    listByIds: async () => [],
  } as unknown as OrganizationRepository;
  return { repo, created };
}

function membershipRepo(): { repo: MembershipRepository; created: CreateMembershipInput[] } {
  const created: CreateMembershipInput[] = [];
  const repo = {
    create: async (input: CreateMembershipInput) => {
      created.push(input);
      return { id: input.id } as never;
    },
  } as unknown as MembershipRepository;
  return { repo, created };
}

describe('organization signup', () => {
  it('creates a SANDBOX organization with the caller as OWNER', async () => {
    const { repo: organizations, created: orgs } = orgRepo(new Set());
    const { repo: memberships, created: members } = membershipRepo();
    const signup = createOrgSignup({
      organizations,
      memberships,
      unitOfWork: passthroughUnitOfWork,
      audit: noopAudit,
      ids: makeIds(),
      clock,
    });

    const result = await signup.execute(
      { userId: 'user_1', label: 'user:user_1' },
      { organizationName: 'Acme Bank', organizationType: 'BANK', jurisdiction: 'gb' },
    );

    expect(result.approvalStatus).toBe('SANDBOX');
    expect(result.role).toBe('OWNER');
    expect(result.slug).toBe('acme-bank');
    expect(result.type).toBe('BANK');

    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.source).toBe('console-signup');
    expect(orgs[0]?.createdBy).toBe('user_1');
    expect(orgs[0]?.jurisdiction).toBe('GB');
    expect(orgs[0]?.defaultCurrency).toBe('GBP');

    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('OWNER');
    expect(members[0]?.status).toBe('ACTIVE');
    expect(members[0]?.userId).toBe('user_1');
  });

  it('derives a distinct slug when the natural one is taken', async () => {
    const { repo: organizations, created: orgs } = orgRepo(new Set(['acme-bank']));
    const { repo: memberships } = membershipRepo();
    const signup = createOrgSignup({
      organizations,
      memberships,
      unitOfWork: passthroughUnitOfWork,
      audit: noopAudit,
      ids: makeIds(),
      clock,
    });

    const result = await signup.execute(
      { userId: 'user_2', label: 'user:user_2' },
      { organizationName: 'Acme Bank', organizationType: 'TELECOM', jurisdiction: 'US' },
    );

    expect(result.slug).not.toBe('acme-bank');
    expect(result.slug.startsWith('acme-bank-')).toBe(true);
    expect(orgs[0]?.defaultCurrency).toBe('USD');
  });
});
