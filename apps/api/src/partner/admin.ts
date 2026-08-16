import { timingSafeEqual } from 'node:crypto';
import {
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  ACTOR_TYPES,
  ForbiddenError,
  NotFoundError,
  PARTNER_CONNECTION_KINDS,
  PARTNER_ENVIRONMENTS,
  PARTNER_SCOPES,
  PURPOSES,
  RESOURCE_TYPES,
  SIGNING_ALGORITHMS,
  ValidationError,
  scopesAllowedForOrganizationType,
  type CreatePartnerConnectionRequest,
  type IssuedSigningKeyResponse,
  type PartnerConnectionKind,
  type PartnerCredentialResponse,
  type PartnerScope,
} from '@sentra/contracts';
import type { AppConfig } from '@sentra/config';
import { generateEs256KeyPair } from '@sentra/adapters';
import type {
  AuditProvider,
  Clock,
  IdGenerator,
  PartnerConnectionRepository,
  PartnerDirectoryReadModel,
  PartnerSigningKeyRepository,
  PasswordHasher,
  SecureRandom,
  UnitOfWork,
} from '@sentra/ports';
import { getCorrelationId } from '@sentra/observability';

export class PartnerBootstrapRejected extends ForbiddenError {
  public constructor(message: string) {
    super(message);
  }
}

export interface PartnerAdminDeps {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly random: SecureRandom;
  readonly hasher: PasswordHasher;
  readonly connections: PartnerConnectionRepository;
  readonly keys: PartnerSigningKeyRepository;
  readonly directory: PartnerDirectoryReadModel;
  readonly audit: AuditProvider;
  readonly unitOfWork: UnitOfWork;
}

const ONE_TIME_WARNING =
  'This secret and private signing key are shown once and cannot be retrieved again. Store them in a secret manager.' as const;

const KEY_ONCE_WARNING =
  'This private signing key is shown once and cannot be retrieved again. Store it in a secret manager.' as const;

export class PartnerAdmin {
  public constructor(private readonly deps: PartnerAdminDeps) {}

  public assertBootstrapAllowed(presentedToken: string | undefined): void {
    const { enabled, token } = this.deps.config.partnerBootstrap;
    if (this.deps.config.runtime.isProduction || !enabled) {
      throw new PartnerBootstrapRejected(
        'Partner credential administration is disabled. Slice 4B replaces bootstrap with authenticated human administrators.',
      );
    }
    if (token === undefined || token.length === 0 || presentedToken === undefined) {
      throw new PartnerBootstrapRejected('PARTNER_BOOTSTRAP_TOKEN is not configured.');
    }
    const presented = Buffer.from(presentedToken);
    const expected = Buffer.from(token);
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw new PartnerBootstrapRejected('Bootstrap authentication failed.');
    }
  }

  public async createConnection(
    organizationId: string,
    input: CreatePartnerConnectionRequest,
    createdBy: string | null,
  ): Promise<PartnerCredentialResponse> {
    if (input.environment === PARTNER_ENVIRONMENTS.PRODUCTION) {
      throw new ForbiddenError(
        'PRODUCTION partner credentials cannot be issued through the Slice 4A bootstrap. Slice 4B adds authenticated human administrator issuance.',
      );
    }

    const organization = await this.deps.directory.organizationById(organizationId);
    if (organization === null) {
      throw new NotFoundError('organization', organizationId);
    }
    if (organization.status !== 'ACTIVE') {
      throw new ForbiddenError('The organization is not active.');
    }

    const expectedKind: PartnerConnectionKind =
      organization.type === 'TELECOM'
        ? PARTNER_CONNECTION_KINDS.TELECOM_EVENTS
        : PARTNER_CONNECTION_KINDS.BANK_API;
    if (organization.type === 'PLATFORM' || input.kind !== expectedKind) {
      throw new ForbiddenError('The connection kind does not match the organization type.');
    }

    const allowed = new Set(scopesAllowedForOrganizationType(organization.type));
    if (input.scopes.some((scope) => !allowed.has(scope))) {
      throw new ValidationError('One or more scopes are not permitted for this organization type.', {
        allowed: [...allowed],
      });
    }

    const clientSecret = this.deps.random.token(32);
    const clientSecretHash = await this.deps.hasher.hash(clientSecret);
    const pair = await generateEs256KeyPair();
    const kid = `kid_${this.deps.ids.generate().slice(0, 16).toLowerCase()}`;
    const correlationId = getCorrelationId();
    const connectionId = this.deps.ids.generate();
    const now = this.deps.clock.now();

    const connection = await this.deps.unitOfWork.run(async (scope) => {
      const created = await this.deps.connections.create(
        {
          id: connectionId,
          organizationId,
          name: input.name,
          kind: input.kind,
          environment: input.environment,
          clientId: `pc_${this.deps.ids.generate().slice(0, 22).toLowerCase()}`,
          clientSecretHash,
          scopes: input.scopes,
          allowedPurposes: input.allowedPurposes,
          ipAllowlist: input.ipAllowlist,
          tokenTtlSeconds: input.tokenTtlSeconds,
          rotationDueAt: null,
          createdBy,
          source: 'bootstrap',
          correlationId,
        },
        scope,
      );
      await this.deps.keys.register(
        {
          id: this.deps.ids.generate(),
          partnerConnectionId: created.id,
          kid,
          algorithm: SIGNING_ALGORITHMS.ES256,
          publicKeyJwk: pair.publicKeyJwk,
          notBefore: now,
          notAfter: null,
          createdBy,
          correlationId,
        },
        scope,
      );
      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          actorLabel: 'bootstrap:partner-admin',
          action: AUDIT_ACTIONS.PARTNER_CONNECTION_CREATED,
          resourceType: RESOURCE_TYPES.PARTNER_CONNECTION,
          resourceId: created.id,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          dataAfter: {
            kind: created.kind,
            environment: created.environment,
            scopes: created.scopes,
            kid,
          },
          correlationId,
        },
        scope,
      );
      return created;
    });

    const signingKeys = await this.deps.keys.listForConnection(organizationId, connection.id);

    return {
      connection: {
        id: connection.id,
        organizationId: connection.organizationId,
        organizationSlug: organization.slug,
        name: connection.name,
        kind: connection.kind,
        environment: connection.environment,
        clientId: connection.clientId,
        scopes: [...connection.scopes],
        allowedPurposes: [...connection.allowedPurposes],
        ipAllowlist: [...connection.ipAllowlist],
        tokenTtlSeconds: connection.tokenTtlSeconds,
        status: connection.status,
        lastRotatedAt: connection.lastRotatedAt?.toISOString() ?? null,
        lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
        createdAt: connection.createdAt.toISOString(),
        signingKeys: signingKeys.map((key) => ({
          id: key.id,
          kid: key.kid,
          algorithm: key.algorithm,
          status: key.status,
          notBefore: key.notBefore.toISOString(),
          notAfter: key.notAfter?.toISOString() ?? null,
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          createdAt: key.createdAt.toISOString(),
        })),
      },
      clientId: connection.clientId,
      clientSecret,
      signing: {
        kid,
        algorithm: SIGNING_ALGORITHMS.ES256,
        publicKeyJwk: pair.publicKeyJwk,
        privateKeyPem: pair.privateKeyPem,
        privateKeyJwk: pair.privateKeyJwk,
      },
      warning: ONE_TIME_WARNING,
    };
  }

  public async issueKey(
    organizationId: string,
    connectionId: string,
  ): Promise<IssuedSigningKeyResponse> {
    const connection = await this.deps.connections.findById(organizationId, connectionId);
    if (connection === null) {
      throw new NotFoundError('partner connection', connectionId);
    }
    const pair = await generateEs256KeyPair();
    const kid = `kid_${this.deps.ids.generate().slice(0, 16).toLowerCase()}`;
    const correlationId = getCorrelationId();
    const key = await this.deps.unitOfWork.run(async (scope) => {
      const registered = await this.deps.keys.register(
        {
          id: this.deps.ids.generate(),
          partnerConnectionId: connection.id,
          kid,
          algorithm: SIGNING_ALGORITHMS.ES256,
          publicKeyJwk: pair.publicKeyJwk,
          notBefore: this.deps.clock.now(),
          notAfter: null,
          createdBy: 'bootstrap',
          correlationId,
        },
        scope,
      );
      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          actorLabel: 'bootstrap:partner-admin',
          action: AUDIT_ACTIONS.PARTNER_SIGNING_KEY_ROTATED,
          resourceType: RESOURCE_TYPES.PARTNER_SIGNING_KEY,
          resourceId: registered.id,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          metadata: { kid, previousKeysRemainActive: true },
          correlationId,
        },
        scope,
      );
      return registered;
    });

    return {
      id: key.id,
      partnerConnectionId: key.partnerConnectionId,
      kid: key.kid,
      algorithm: key.algorithm,
      status: key.status,
      notBefore: key.notBefore.toISOString(),
      notAfter: key.notAfter?.toISOString() ?? null,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
      publicKeyJwk: pair.publicKeyJwk,
      privateKeyPem: pair.privateKeyPem,
      privateKeyJwk: pair.privateKeyJwk,
      warning: KEY_ONCE_WARNING,
    };
  }

  public async revokeKey(organizationId: string, connectionId: string, kid: string): Promise<void> {
    const keys = await this.deps.keys.listForConnection(organizationId, connectionId);
    const match = keys.find((key) => key.kid === kid);
    if (match === undefined) {
      throw new NotFoundError('signing key', kid);
    }
    const correlationId = getCorrelationId();
    await this.deps.unitOfWork.run(async (scope) => {
      await this.deps.keys.revoke(organizationId, match.id, this.deps.clock.now(), scope);
      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          actorLabel: 'bootstrap:partner-admin',
          action: AUDIT_ACTIONS.PARTNER_SIGNING_KEY_REVOKED,
          resourceType: RESOURCE_TYPES.PARTNER_SIGNING_KEY,
          resourceId: match.id,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          metadata: { kid },
          correlationId,
        },
        scope,
      );
    });
  }

  public async revokeConnection(organizationId: string, connectionId: string): Promise<void> {
    const connection = await this.deps.connections.findById(organizationId, connectionId);
    if (connection === null) {
      throw new NotFoundError('partner connection', connectionId);
    }
    const correlationId = getCorrelationId();
    await this.deps.unitOfWork.run(async (scope) => {
      await this.deps.connections.updateStatus(organizationId, connectionId, 'REVOKED', scope);
      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.SYSTEM,
          actorLabel: 'bootstrap:partner-admin',
          action: AUDIT_ACTIONS.PARTNER_CONNECTION_REVOKED,
          resourceType: RESOURCE_TYPES.PARTNER_CONNECTION,
          resourceId: connectionId,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          correlationId,
        },
        scope,
      );
    });
  }
}

export const defaultScopesForKind = (kind: PartnerConnectionKind): readonly PartnerScope[] => {
  if (kind === PARTNER_CONNECTION_KINDS.TELECOM_EVENTS) {
    return [PARTNER_SCOPES.RISK_EVENTS_WRITE];
  }
  return [
    PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
    PARTNER_SCOPES.RECOMMENDATIONS_READ,
    PARTNER_SCOPES.CASES_READ,
    PARTNER_SCOPES.OUTCOMES_WRITE,
  ];
};

export const defaultPurposes = (): readonly (typeof PURPOSES)[keyof typeof PURPOSES][] => [
  PURPOSES.PROTECT_PAYMENT,
];

export const createPartnerAdmin = (deps: PartnerAdminDeps): PartnerAdmin => new PartnerAdmin(deps);
