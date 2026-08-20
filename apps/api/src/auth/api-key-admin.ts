import {
  ACTOR_TYPES,
  API_KEY_ENVIRONMENTS,
  AUDIT_OUTCOMES,
  NotFoundError,
  ORGANIZATION_APPROVAL_STATUSES,
  PURPOSES,
  ValidationError,
  type ApiKeyCreatedResponse,
  type ApiKeyEnvironment,
  type ApiKeyListResponse,
  type ApiKeyView,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import { createHash } from 'node:crypto';
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  AuditProvider,
  Clock,
  IdGenerator,
  OrganizationRepository,
  PasswordHasher,
  SecureRandom,
  UnitOfWork,
} from '@sentra/ports';

export interface ApiKeyActor {
  readonly userId: string;
  readonly label: string;
}

export interface ApiKeyAdminDeps {
  readonly organizations: OrganizationRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly random: SecureRandom;
  readonly hasher: PasswordHasher;
  readonly audit: AuditProvider;
  readonly unitOfWork: UnitOfWork;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const SECRET_WARNING =
  'This secret key is shown once and cannot be retrieved again. Store it in a secret manager now.';

/** Deterministic lookup value for a secret key — high-entropy input, so SHA-256 is sufficient. */
const secretLookupOf = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** The tenant + environment an authenticated API key resolves to. */
export interface AuthenticatedApiKey {
  readonly keyId: string;
  readonly organizationId: string;
  readonly environment: ApiKeyEnvironment;
}

const toView = (record: ApiKeyRecord): ApiKeyView => ({
  id: record.id,
  name: record.name,
  environment: record.environment,
  publishableKey: record.publishableKey,
  secretLast4: record.secretLast4,
  status: record.status,
  lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  revokedAt: record.revokedAt?.toISOString() ?? null,
});

/**
 * Developer API key administration for one organization.
 *
 * A key is a pair: a public publishable key and a secret. Only the Argon2id hash of the secret is
 * stored; the plaintext is returned exactly once at creation. TEST keys are self-service; LIVE
 * keys are refused unless the organization's approval status is APPROVED — the sandbox/production
 * boundary that keeps unapproved tenants off the live network.
 */
export class ApiKeyAdmin {
  public constructor(private readonly deps: ApiKeyAdminDeps) {}

  public async list(organizationId: string): Promise<ApiKeyListResponse> {
    const [records, organization] = await Promise.all([
      this.deps.apiKeys.listForOrganization(organizationId),
      this.deps.organizations.findById(organizationId),
    ]);
    return {
      items: records.map(toView),
      canIssueLive: organization?.approvalStatus === ORGANIZATION_APPROVAL_STATUSES.APPROVED,
    };
  }

  /**
   * Resolves a bearer secret key (`sk_...`) to its organization and environment, or null when the
   * key is unknown or revoked. Used by the public API edge to authenticate a developer request.
   */
  public async authenticate(secret: string): Promise<AuthenticatedApiKey | null> {
    if (!secret.startsWith('sk_')) {
      return null;
    }
    const record = await this.deps.apiKeys.findBySecretLookup(secretLookupOf(secret));
    if (record === null || record.status !== 'ACTIVE') {
      return null;
    }
    return {
      keyId: record.id,
      organizationId: record.organizationId,
      environment: record.environment,
    };
  }

  public async create(
    organizationId: string,
    actor: ApiKeyActor,
    input: { name: string; environment: ApiKeyEnvironment },
  ): Promise<ApiKeyCreatedResponse> {
    return this.deps.unitOfWork.run(async (scope) => {
      if (input.environment === API_KEY_ENVIRONMENTS.LIVE) {
        const organization = await this.deps.organizations.findById(organizationId, scope);
        if (organization?.approvalStatus !== ORGANIZATION_APPROVAL_STATUSES.APPROVED) {
          throw new ValidationError(
            'Live keys require an approved organization. Request production access first; sandbox keys are available now.',
          );
        }
      }

      const tag = input.environment === API_KEY_ENVIRONMENTS.LIVE ? 'live' : 'test';
      const publishableKey = `pk_${tag}_${this.deps.random.token(18)}`;
      const secretKey = `sk_${tag}_${this.deps.random.token(24)}`;
      const secretHash = await this.deps.hasher.hash(secretKey);
      const correlationId = getCorrelationId();

      const record = await this.deps.apiKeys.create(
        {
          id: this.deps.ids.generate(),
          organizationId,
          environment: input.environment,
          name: input.name,
          publishableKey,
          secretHash,
          secretLookup: secretLookupOf(secretKey),
          secretLast4: secretKey.slice(-4),
          createdBy: actor.userId,
          correlationId,
        },
        scope,
      );

      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.USER,
          actorId: actor.userId,
          actorLabel: actor.label,
          action: 'api_key.created',
          resourceType: 'api_key',
          resourceId: record.id,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          occurredAt: this.deps.clock.now(),
          correlationId,
        },
        scope,
      );

      return { key: toView(record), secretKey, warning: SECRET_WARNING };
    });
  }

  public async revoke(
    organizationId: string,
    keyId: string,
    actor: ApiKeyActor,
  ): Promise<ApiKeyView> {
    return this.deps.unitOfWork.run(async (scope) => {
      const existing = await this.deps.apiKeys.findById(keyId, scope);
      if (existing === null || existing.organizationId !== organizationId) {
        throw new NotFoundError('api_key', keyId);
      }
      const revoked = await this.deps.apiKeys.revoke(keyId, this.deps.clock.now(), scope);
      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.USER,
          actorId: actor.userId,
          actorLabel: actor.label,
          action: 'api_key.revoked',
          resourceType: 'api_key',
          resourceId: keyId,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          occurredAt: this.deps.clock.now(),
          correlationId: getCorrelationId(),
        },
        scope,
      );
      return toView(revoked);
    });
  }
}

export const createApiKeyAdmin = (deps: ApiKeyAdminDeps): ApiKeyAdmin => new ApiKeyAdmin(deps);
