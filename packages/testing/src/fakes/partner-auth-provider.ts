import { InvalidTokenError, PARTNER_SCOPES, PURPOSES, resolveScopePermissions, type Purpose, type RequestPrincipal } from '@sentra/contracts';
import type {
  IssuePartnerTokenInput,
  IssuedPartnerToken,
  PartnerAuthProvider,
} from '@sentra/ports';
import type { Clock } from '@sentra/ports';
import type { FakePartnerConnection, FakePartnerConnectionRegistrar } from './partner-auth-types';
export type { FakePartnerConnection } from './partner-auth-types';

/** Registers a default bank connection for quick test setup. */
export const registerDefaultBankConnection = (
  provider: FakePartnerConnectionRegistrar,
  overrides: Partial<FakePartnerConnection> = {},
): FakePartnerConnection => {
  const connection: FakePartnerConnection = {
    clientId: 'bank_client_test',
    clientSecret: 'test-secret-that-is-long-enough-for-validation',
    organizationId: '01ORG_BANK_SANDBOX',
    organizationType: 'BANK',
    partnerConnectionId: '01PARTNER_CONN_BANK',
    scopes: [PARTNER_SCOPES.PAYMENT_INTENTS_WRITE, PARTNER_SCOPES.RECOMMENDATIONS_READ],
    allowedPurposes: [PURPOSES.PROTECT_PAYMENT],
    ipAllowlist: [],
    tokenTtlSeconds: 300,
    ...overrides,
  };
  provider.registerConnection(connection);
  return connection;
};

interface IssuedTokenRecord {
  readonly tokenId: string;
  readonly clientId: string;
  readonly expiresAtMs: number;
  readonly scopes: IssuedPartnerToken['grantedScopes'];
  readonly purposes: readonly Purpose[];
}

/**
 * Deterministic partner token issuer for tests. Validates credentials, scopes, purposes,
 * and optional IP allowlists before minting a parseable bearer token.
 */
export class FakePartnerAuthProvider implements PartnerAuthProvider {
  private readonly connections = new Map<string, FakePartnerConnection>();
  private readonly tokens = new Map<string, IssuedTokenRecord>();
  private tokenCounter = 0;

  public constructor(private readonly clock: Clock) {}

  public registerConnection(connection: FakePartnerConnection): void {
    this.connections.set(connection.clientId, connection);
  }

  public async issueToken(input: IssuePartnerTokenInput): Promise<IssuedPartnerToken> {
    const connection = this.connections.get(input.clientId);
    if (connection === undefined || connection.clientSecret !== input.clientSecret) {
      throw new InvalidTokenError('Client authentication failed.');
    }

    if (connection.ipAllowlist.length > 0) {
      if (input.clientIp === undefined || !connection.ipAllowlist.includes(input.clientIp)) {
        throw new InvalidTokenError('Client authentication failed.');
      }
    }

    const requestedScopes =
      input.requestedScopes.length === 0 ? connection.scopes : input.requestedScopes;

    const invalidScope = requestedScopes.find((scope) => !connection.scopes.includes(scope));
    if (invalidScope !== undefined) {
      throw new InvalidTokenError('Client authentication failed.');
    }

    const purpose = input.requestedPurpose ?? connection.allowedPurposes[0];
    if (purpose === undefined || !connection.allowedPurposes.includes(purpose)) {
      throw new InvalidTokenError('Client authentication failed.');
    }

    const tokenId = `tok_${++this.tokenCounter}`;
    const expiresAtMs = this.clock.now().getTime() + connection.tokenTtlSeconds * 1000;
    const accessToken = [
      'fake-partner-token',
      tokenId,
      connection.clientId,
      String(expiresAtMs),
      requestedScopes.join(','),
      purpose,
    ].join('.');

    this.tokens.set(accessToken, {
      tokenId,
      clientId: connection.clientId,
      expiresAtMs,
      scopes: requestedScopes,
      purposes: [purpose],
    });

    return {
      accessToken,
      expiresInSeconds: connection.tokenTtlSeconds,
      grantedScopes: requestedScopes,
      tokenId,
      organizationId: connection.organizationId,
      partnerConnectionId: connection.partnerConnectionId,
    };
  }

  public async verifyToken(rawToken: string): Promise<RequestPrincipal> {
    const record = this.tokens.get(rawToken);
    if (record === undefined) {
      throw new InvalidTokenError('The presented token is not valid.');
    }
    if (record.expiresAtMs <= this.clock.now().getTime()) {
      throw new InvalidTokenError('The presented token is not valid.');
    }

    const connection = this.connections.get(record.clientId);
    if (connection === undefined) {
      throw new InvalidTokenError('The presented token is not valid.');
    }

    return {
      kind: 'PARTNER',
      id: connection.partnerConnectionId,
      actorType: 'PARTNER',
      label: connection.clientId,
      organizationId: connection.organizationId,
      organizationType: connection.organizationType,
      partnerConnectionId: connection.partnerConnectionId,
      scopes: record.scopes,
      permissions: resolveScopePermissions(record.scopes),
      purposes: record.purposes,
      tokenId: record.tokenId,
    };
  }

  public async publicJwks(): Promise<{ keys: readonly Record<string, unknown>[] }> {
    return {
      keys: [
        {
          kty: 'RSA',
          kid: 'fake-partner-key-1',
          use: 'sig',
          alg: 'RS256',
          n: 'fake-modulus',
          e: 'AQAB',
        },
      ],
    };
  }
}

export const createFakePartnerAuthProvider = (clock: Clock): FakePartnerAuthProvider =>
  new FakePartnerAuthProvider(clock);
