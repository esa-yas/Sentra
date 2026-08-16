import { createHash } from 'node:crypto';
import {
  CONTENT_DIGEST_PREFIX,
  DependencyUnavailableError,
  DigestMismatchError,
  ForbiddenError,
  HTTP_HEADERS,
  PARTNER_CHECK_RESULTS,
  PARTNER_SIGNING_HEADERS,
  RateLimitedError,
  ReplayDetectedError,
  SignatureInvalidError,
  TimestampInvalidError,
  UnauthenticatedError,
  buildCanonicalSigningString,
  contentDigestSchema,
  isPartnerPrincipal,
  nonceSchema,
  resolveScopePermissions,
  signingTimestampSchema,
  type PartnerCheckResult,
  type PartnerPrincipal,
  type PartnerScope,
} from '@sentra/contracts';
import { SIGNATURE_FAILURE_REASONS } from '@sentra/ports';
import type { AppConfig } from '@sentra/config';
import type {
  CacheProvider,
  Clock,
  IdGenerator,
  PartnerApiActivityStore,
  PartnerConnectionRecord,
  PartnerConnectionRepository,
  PartnerDirectoryReadModel,
  PartnerSigningKeyRepository,
  SignatureVerifier,
} from '@sentra/ports';
import type { Request } from 'express';
import { requestCanonicalPath } from './path';

const contentDigestOf = (body: Buffer): string =>
  `${CONTENT_DIGEST_PREFIX}${createHash('sha256').update(body).digest('base64url')}`;

export interface PartnerRequestContext {
  readonly principal: PartnerPrincipal;
  readonly connection: PartnerConnectionRecord;
  readonly keyId: string;
  readonly nonce: string;
  readonly rawBody: Buffer;
}

export interface PartnerSecurityOutcome {
  authentication: PartnerCheckResult;
  signature: PartnerCheckResult;
  replay: PartnerCheckResult;
  idempotency: PartnerCheckResult;
  rateLimit: PartnerCheckResult;
  errorCode: string | null;
  organizationId: string | null;
  partnerConnectionId: string | null;
  environment: 'SANDBOX' | 'PRODUCTION' | 'UNKNOWN';
}

export const emptySecurityOutcome = (): PartnerSecurityOutcome => ({
  authentication: PARTNER_CHECK_RESULTS.MISSING,
  signature: PARTNER_CHECK_RESULTS.MISSING,
  replay: PARTNER_CHECK_RESULTS.NOT_APPLICABLE,
  idempotency: PARTNER_CHECK_RESULTS.NOT_APPLICABLE,
  rateLimit: PARTNER_CHECK_RESULTS.NOT_APPLICABLE,
  errorCode: null,
  organizationId: null,
  partnerConnectionId: null,
  environment: 'UNKNOWN',
});

export interface PartnerAuthenticatorDeps {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly cache: CacheProvider;
  readonly connections: PartnerConnectionRepository;
  readonly keys: PartnerSigningKeyRepository;
  readonly signatures: SignatureVerifier;
  readonly directory: PartnerDirectoryReadModel;
  readonly activity: PartnerApiActivityStore;
}

const header = (req: Request, name: string): string | undefined => {
  const value = req.header(name);
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

const rawBodyOf = (req: Request): Buffer => {
  const candidate = (req as Request & { rawBody?: Buffer }).rawBody;
  if (candidate !== undefined) {
    return candidate;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }
  if (req.body === undefined || req.method === 'GET' || req.method === 'HEAD') {
    return Buffer.alloc(0);
  }
  return Buffer.from(JSON.stringify(req.body), 'utf8');
};

export class PartnerAuthenticator {
  public constructor(private readonly deps: PartnerAuthenticatorDeps) {}

  public async authenticate(req: Request, outcome: PartnerSecurityOutcome): Promise<PartnerRequestContext> {
    const partnerId = header(req, PARTNER_SIGNING_HEADERS.PARTNER_ID);
    const keyId = header(req, PARTNER_SIGNING_HEADERS.KEY_ID);
    const timestamp = header(req, PARTNER_SIGNING_HEADERS.TIMESTAMP);
    const nonce = header(req, PARTNER_SIGNING_HEADERS.NONCE);
    const digest = header(req, PARTNER_SIGNING_HEADERS.CONTENT_DIGEST);
    const signature = header(req, PARTNER_SIGNING_HEADERS.SIGNATURE);

    if (
      partnerId === undefined ||
      keyId === undefined ||
      timestamp === undefined ||
      nonce === undefined ||
      digest === undefined ||
      signature === undefined
    ) {
      outcome.authentication = PARTNER_CHECK_RESULTS.MISSING;
      outcome.errorCode = 'unauthenticated';
      throw new UnauthenticatedError('Signed partner authentication headers are required.');
    }

    const nonceParsed = nonceSchema.safeParse(nonce);
    const digestParsed = contentDigestSchema.safeParse(digest);
    const timestampParsed = signingTimestampSchema.safeParse(timestamp);
    if (!nonceParsed.success || !digestParsed.success || !timestampParsed.success) {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.signature = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'unauthenticated';
      throw new UnauthenticatedError('Signed partner authentication headers are malformed.');
    }

    const connection = await this.deps.connections.findByIdUnscoped(partnerId);
    if (connection === null) {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'unauthenticated';
      throw new UnauthenticatedError('The partner connection is not recognised.');
    }

    outcome.organizationId = connection.organizationId;
    outcome.partnerConnectionId = connection.id;
    outcome.environment = connection.environment;

    const organization = await this.deps.directory.organizationById(connection.organizationId);
    if (organization === null || organization.status !== 'ACTIVE') {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'forbidden';
      throw new ForbiddenError('The organization is not permitted to call this API.');
    }

    if (connection.status !== 'ACTIVE') {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'forbidden';
      throw new ForbiddenError('The partner connection is not active.');
    }

    const rawBody = rawBodyOf(req);
    const expectedDigest = contentDigestOf(rawBody);
    if (expectedDigest !== digest || !digest.startsWith(CONTENT_DIGEST_PREFIX)) {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.signature = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'digest_mismatch';
      throw new DigestMismatchError();
    }

    const signedAt = new Date(timestamp);
    const canonical = buildCanonicalSigningString({
      method: req.method,
      path: requestCanonicalPath(req),
      timestamp,
      nonce,
      contentDigest: digest,
      partnerConnectionId: partnerId,
      keyId,
    });

    let verified;
    try {
      verified = await this.deps.signatures.verify({
        organizationId: connection.organizationId,
        partnerConnectionId: connection.id,
        keyId,
        payload: Buffer.from(canonical, 'utf8'),
        signature,
        signedAt,
      });
    } catch {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.signature = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'signature_invalid';
      throw new SignatureInvalidError();
    }

    if (!verified.valid) {
      outcome.authentication = PARTNER_CHECK_RESULTS.FAILED;
      outcome.signature = PARTNER_CHECK_RESULTS.FAILED;
      if (verified.reason === SIGNATURE_FAILURE_REASONS.OUTSIDE_REPLAY_WINDOW) {
        outcome.errorCode = 'timestamp_invalid';
        throw new TimestampInvalidError();
      }
      outcome.errorCode = 'signature_invalid';
      throw new SignatureInvalidError();
    }
    outcome.signature = PARTNER_CHECK_RESULTS.PASSED;

    await this.consumeNonce(connection.id, keyId, nonce, outcome);
    outcome.authentication = PARTNER_CHECK_RESULTS.PASSED;

    const principal: PartnerPrincipal = {
      kind: 'PARTNER',
      actorType: 'PARTNER',
      id: connection.id,
      label: `partner:${connection.name}`,
      organizationId: connection.organizationId,
      organizationType: organization.type,
      partnerConnectionId: connection.id,
      scopes: connection.scopes,
      permissions: resolveScopePermissions(connection.scopes),
      purposes: connection.allowedPurposes,
      tokenId: keyId,
    };

    void this.deps.connections.touchLastUsed(connection.id, this.deps.clock.now()).catch(() => undefined);

    return { principal, connection, keyId, nonce, rawBody };
  }

  public requireScope(context: PartnerRequestContext, scope: PartnerScope): void {
    if (!context.connection.scopes.includes(scope)) {
      throw new ForbiddenError('The partner credential is missing the required scope.', { requiredScope: scope });
    }
    if (context.principal.organizationId !== context.connection.organizationId) {
      throw new ForbiddenError('The partner credential does not match this tenant.');
    }
  }

  public async rateLimit(
    context: PartnerRequestContext,
    endpointClass: 'read' | 'write',
    outcome: PartnerSecurityOutcome,
  ): Promise<void> {
    const window = this.deps.config.rateLimit.windowSeconds;
    const limits = [
      {
        key: `rl:partner:${context.connection.id}`,
        max:
          endpointClass === 'write'
            ? this.deps.config.rateLimit.partnerWriteMaxRequests
            : this.deps.config.rateLimit.maxRequests,
      },
      {
        key: `rl:org:${context.connection.organizationId}`,
        max: this.deps.config.rateLimit.partnerOrgMaxRequests,
      },
      {
        key: `rl:endpoint:${context.connection.id}:${endpointClass}`,
        max: this.deps.config.rateLimit.partnerEndpointMaxRequests,
      },
    ];

    try {
      for (const limit of limits) {
        const result = await this.deps.cache.increment(limit.key, window);
        if (result.count > limit.max) {
          outcome.rateLimit = PARTNER_CHECK_RESULTS.FAILED;
          outcome.errorCode = 'rate_limited';
          throw new RateLimitedError(result.ttlSeconds);
        }
      }
      outcome.rateLimit = PARTNER_CHECK_RESULTS.PASSED;
    } catch (error) {
      if (outcome.rateLimit === PARTNER_CHECK_RESULTS.FAILED) {
        throw error;
      }
      outcome.rateLimit = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'dependency_unavailable';
      throw new DependencyUnavailableError('rate limiter');
    }
  }

  public async recordActivity(
    req: Request,
    statusCode: number,
    durationMs: number,
    outcome: PartnerSecurityOutcome,
    correlationId: string,
  ): Promise<void> {
    await this.deps.activity.record({
      id: this.deps.ids.generate(),
      organizationId: outcome.organizationId,
      partnerConnectionId: outcome.partnerConnectionId,
      endpoint: requestCanonicalPath(req),
      method: req.method,
      statusCode,
      durationMs,
      correlationId,
      authentication: outcome.authentication,
      signature: outcome.signature,
      replay: outcome.replay,
      idempotency: outcome.idempotency,
      rateLimit: outcome.rateLimit,
      errorCode: outcome.errorCode,
      environment: outcome.environment,
      synthetic: outcome.environment !== 'PRODUCTION',
      occurredAt: this.deps.clock.now(),
    });
  }

  private async consumeNonce(
    partnerId: string,
    keyId: string,
    nonce: string,
    outcome: PartnerSecurityOutcome,
  ): Promise<void> {
    const ttl = this.deps.config.signing.replayWindowSeconds;
    const key = `replay:${partnerId}:${keyId}:${nonce}`;
    try {
      const lease = await this.deps.cache.acquireLease(key, ttl);
      if (lease === null) {
        outcome.replay = PARTNER_CHECK_RESULTS.FAILED;
        outcome.errorCode = 'replay_detected';
        throw new ReplayDetectedError();
      }
      outcome.replay = PARTNER_CHECK_RESULTS.PASSED;
    } catch (error) {
      if (outcome.replay === PARTNER_CHECK_RESULTS.FAILED) {
        throw error;
      }
      outcome.replay = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'dependency_unavailable';
      throw new DependencyUnavailableError('replay protection');
    }
  }
}

export const createPartnerAuthenticator = (deps: PartnerAuthenticatorDeps): PartnerAuthenticator =>
  new PartnerAuthenticator(deps);

export const partnerFrom = (req: Request): PartnerRequestContext => {
  const context = (req as Request & { partnerContext?: PartnerRequestContext }).partnerContext;
  if (context === undefined || !isPartnerPrincipal(context.principal)) {
    throw new UnauthenticatedError();
  }
  return context;
};

export { HTTP_HEADERS };
