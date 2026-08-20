import type {
  ApiKeyRecord,
  ApiKeyRepository,
  AuditProvider,
  Clock,
  CreateApiKeyInput,
  IdGenerator,
  OrganizationRecord,
  OrganizationRepository,
  PasswordHasher,
  SecureRandom,
  UnitOfWork,
} from '@sentra/ports';
import type { OrganizationApprovalStatus } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import { createApiKeyAdmin } from '../auth/api-key-admin';

const clock: Clock = { now: () => new Date('2026-08-20T00:00:00.000Z'), monotonicMs: () => 0 };
const ids: IdGenerator = { generate: () => 'key_1' };
const uow: UnitOfWork = {
  run: (async (fn: (scope: unknown) => unknown) => fn(undefined)) as UnitOfWork['run'],
} as UnitOfWork;
const audit: AuditProvider = { record: async () => undefined } as unknown as AuditProvider;

// Deterministic, distinguishable tokens so the assertions can read the generated key shape.
let seq = 0;
const random: SecureRandom = { token: () => `tok${(seq += 1)}` } as unknown as SecureRandom;
const hasher: PasswordHasher = {
  hash: async (plaintext: string) => `hash:${plaintext}`,
} as unknown as PasswordHasher;

function orgRepo(approvalStatus: OrganizationApprovalStatus): OrganizationRepository {
  return {
    findById: async () => ({ id: 'org_1', approvalStatus } as OrganizationRecord),
    create: async () => ({}) as OrganizationRecord,
    findBySlug: async () => null,
    update: async () => ({}) as OrganizationRecord,
    listByIds: async () => [],
  } as unknown as OrganizationRepository;
}

function keyRepo(): { repo: ApiKeyRepository; created: CreateApiKeyInput[] } {
  const created: CreateApiKeyInput[] = [];
  const byLookup = new Map<string, ApiKeyRecord>();
  const toRecord = (input: CreateApiKeyInput): ApiKeyRecord => ({
    id: input.id,
    organizationId: input.organizationId,
    environment: input.environment,
    name: input.name,
    publishableKey: input.publishableKey,
    secretHash: input.secretHash,
    secretLookup: input.secretLookup,
    secretLast4: input.secretLast4,
    status: 'ACTIVE',
    lastUsedAt: null,
    createdAt: clock.now(),
    createdBy: input.createdBy,
    revokedAt: null,
  });
  const repo = {
    create: async (input: CreateApiKeyInput): Promise<ApiKeyRecord> => {
      created.push(input);
      const record = toRecord(input);
      byLookup.set(input.secretLookup, record);
      return record;
    },
    findById: async () => null,
    findByPublishableKey: async () => null,
    findBySecretLookup: async (lookup: string) => byLookup.get(lookup) ?? null,
    listForOrganization: async () => [],
    revoke: async () => ({}) as ApiKeyRecord,
  } as unknown as ApiKeyRepository;
  return { repo, created };
}

const actor = { userId: 'user_1', label: 'user:user_1' };

describe('api key admin', () => {
  it('mints a sandbox (TEST) key for a sandbox organization', async () => {
    const { repo: apiKeys, created } = keyRepo();
    const admin = createApiKeyAdmin({
      organizations: orgRepo('SANDBOX'),
      apiKeys,
      random,
      hasher,
      audit,
      unitOfWork: uow,
      ids,
      clock,
    });

    const result = await admin.create('org_1', actor, { name: 'Server', environment: 'TEST' });

    expect(result.key.publishableKey.startsWith('pk_test_')).toBe(true);
    expect(result.secretKey.startsWith('sk_test_')).toBe(true);
    expect(result.key.secretLast4).toBe(result.secretKey.slice(-4));
    // The service persists a hash of the secret, never the plaintext itself.
    expect(created[0]?.secretHash).toBe(`hash:${result.secretKey}`);
    expect(created[0]).not.toHaveProperty('secretKey');
  });

  it('refuses a LIVE key while the organization is still in sandbox', async () => {
    const { repo: apiKeys } = keyRepo();
    const admin = createApiKeyAdmin({
      organizations: orgRepo('SANDBOX'),
      apiKeys,
      random,
      hasher,
      audit,
      unitOfWork: uow,
      ids,
      clock,
    });

    await expect(
      admin.create('org_1', actor, { name: 'Prod', environment: 'LIVE' }),
    ).rejects.toThrow(/approved organization/i);
  });

  it('authenticates a freshly minted key and rejects unknown/malformed secrets', async () => {
    const { repo: apiKeys } = keyRepo();
    const admin = createApiKeyAdmin({
      organizations: orgRepo('SANDBOX'),
      apiKeys,
      random,
      hasher,
      audit,
      unitOfWork: uow,
      ids,
      clock,
    });

    const created = await admin.create('org_1', actor, { name: 'Server', environment: 'TEST' });

    const ok = await admin.authenticate(created.secretKey);
    expect(ok).not.toBeNull();
    expect(ok?.organizationId).toBe('org_1');
    expect(ok?.environment).toBe('TEST');

    expect(await admin.authenticate('sk_test_wrong')).toBeNull();
    expect(await admin.authenticate('not-a-key')).toBeNull();
  });

  it('mints a LIVE key once the organization is approved', async () => {
    const { repo: apiKeys } = keyRepo();
    const admin = createApiKeyAdmin({
      organizations: orgRepo('APPROVED'),
      apiKeys,
      random,
      hasher,
      audit,
      unitOfWork: uow,
      ids,
      clock,
    });

    const result = await admin.create('org_1', actor, { name: 'Prod', environment: 'LIVE' });
    expect(result.key.publishableKey.startsWith('pk_live_')).toBe(true);
    expect(result.secretKey.startsWith('sk_live_')).toBe(true);
  });
});
