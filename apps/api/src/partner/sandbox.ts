import {
  PARTNER_CONNECTION_KINDS,
  PARTNER_ENVIRONMENTS,
  PARTNER_SCOPES,
  PARTNER_SIGNING_HEADERS,
  PURPOSES,
  TELECOM_ACTIVE_WINDOW_SECONDS,
  buildCanonicalSigningString,
  canonicalizePath,
  type PartnerConnectionKind,
} from '@sentra/contracts';
import { contentDigestOf, signCanonicalRequest } from '@sentra/adapters';
import { SYNTHETIC_DEMO_SUBJECT_REF } from '@sentra/core';
import type { Clock, IdGenerator } from '@sentra/ports';
import { getCorrelationId } from '@sentra/observability';
import type { Request } from 'express';
import type { PartnerAdmin } from './admin';
import { defaultPurposes, defaultScopesForKind } from './admin';
import {
  emptySecurityOutcome,
  type PartnerAuthenticator,
  type PartnerRequestContext,
} from './authenticator';
import type { PartnerIngest } from './ingest';

export interface SandboxDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly admin: PartnerAdmin;
  readonly ingest: PartnerIngest;
  readonly authenticator: PartnerAuthenticator;
  readonly telecomOrganizationId: string;
  readonly bankOrganizationId: string;
}

/**
 * Development-only signed-request generator. Signing happens on the API process so a
 * browser never receives a production (or even a long-lived) private key. The one-time
 * private JWK is used in memory and discarded; it is not returned to the UI.
 */
export class PartnerSandbox {
  public constructor(private readonly deps: SandboxDeps) {}

  public async run(kind: PartnerConnectionKind): Promise<Record<string, unknown>> {
    const isTelecom = kind === PARTNER_CONNECTION_KINDS.TELECOM_EVENTS;
    const organizationId = isTelecom ? this.deps.telecomOrganizationId : this.deps.bankOrganizationId;
    const endpoint = isTelecom ? '/v1/risk-events' : '/v1/payment-intents';
    const created = await this.deps.admin.createConnection(
      organizationId,
      {
        name: `sandbox ${kind.toLowerCase()} ${this.deps.ids.generate().slice(-6)}`,
        kind,
        environment: PARTNER_ENVIRONMENTS.SANDBOX,
        scopes: [...defaultScopesForKind(kind)],
        allowedPurposes: [...defaultPurposes()],
        ipAllowlist: [],
        tokenTtlSeconds: 300,
      },
      'sandbox-generator',
    );

    const body = isTelecom
      ? {
          subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
          purpose: PURPOSES.PROTECT_PAYMENT,
          eventType: 'scam.risk.v1',
          recentSuspiciousCall: true,
          callerReputation: 'KNOWN_BAD',
          callDurationSeconds: 120,
          activeWindowSeconds: TELECOM_ACTIVE_WINDOW_SECONDS,
          scamCampaignMatch: true,
        }
      : {
          subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
          purpose: PURPOSES.PROTECT_PAYMENT,
          paymentAmount: 2_500,
          currency: 'GBP',
          firstTimePayee: true,
        };

    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    const timestamp = this.deps.clock.now().toISOString();
    const nonce = this.deps.ids.generate();
    const digest = contentDigestOf(raw);
    const canonicalInput = {
      method: 'POST',
      path: canonicalizePath(endpoint),
      timestamp,
      nonce,
      contentDigest: digest,
      partnerConnectionId: created.connection.id,
      keyId: created.signing.kid,
    };
    const canonicalString = buildCanonicalSigningString(canonicalInput);
    const signature = await signCanonicalRequest({
      canonical: canonicalInput,
      privateKeyJwk: created.signing.privateKeyJwk,
      algorithm: created.signing.algorithm,
    });

    const headerMap: Record<string, string> = {
      [PARTNER_SIGNING_HEADERS.TIMESTAMP]: timestamp,
      [PARTNER_SIGNING_HEADERS.NONCE]: nonce,
      [PARTNER_SIGNING_HEADERS.PARTNER_ID]: created.connection.id,
      [PARTNER_SIGNING_HEADERS.KEY_ID]: created.signing.kid,
      [PARTNER_SIGNING_HEADERS.CONTENT_DIGEST]: digest,
      [PARTNER_SIGNING_HEADERS.SIGNATURE]: signature,
      'idempotency-key': `idem_${this.deps.ids.generate()}`,
      'content-type': 'application/json',
    };

    const mockReq = {
      method: 'POST',
      path: endpoint,
      originalUrl: endpoint,
      baseUrl: '',
      url: endpoint,
      body,
      rawBody: raw,
      header: (name: string): string | undefined => headerMap[name.toLowerCase()] ?? headerMap[name],
    } as unknown as Request & { rawBody: Buffer };

    const outcome = emptySecurityOutcome();
    const context: PartnerRequestContext = await this.deps.authenticator.authenticate(mockReq, outcome);
    this.deps.authenticator.requireScope(
      context,
      isTelecom ? PARTNER_SCOPES.RISK_EVENTS_WRITE : PARTNER_SCOPES.PAYMENT_INTENTS_WRITE,
    );

    const responseBody = isTelecom
      ? await this.deps.ingest.ingestTelecom(context, {
          subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
          purpose: PURPOSES.PROTECT_PAYMENT,
          eventType: 'scam.risk.v1',
          recentSuspiciousCall: true,
          callerReputation: 'KNOWN_BAD',
          callDurationSeconds: 120,
          activeWindowSeconds: TELECOM_ACTIVE_WINDOW_SECONDS,
          deviceChange: false,
          accountTakeoverIndicators: false,
          scamCampaignMatch: true,
          telecomEvidence: 'OK',
          severity: 'HIGH',
        })
      : await this.deps.ingest.ingestPayment(context, {
          subjectRef: SYNTHETIC_DEMO_SUBJECT_REF,
          purpose: PURPOSES.PROTECT_PAYMENT,
          paymentAmount: 2_500,
          currency: 'GBP',
          payeeAgeDays: 0,
          firstTimePayee: true,
          paymentVelocity24h: 0,
          deviceChange: false,
          accountTakeoverIndicators: false,
          customerVulnerability: false,
          identityVerificationResult: 'NOT_CHECKED',
          previousWarnings: 0,
        });

    await this.deps.authenticator.recordActivity(mockReq, 200, 1, outcome, getCorrelationId());

    const curlExample = [
      `curl -sS http://localhost:3000${endpoint} \\`,
      `  -H '${PARTNER_SIGNING_HEADERS.TIMESTAMP}: ${timestamp}' \\`,
      `  -H '${PARTNER_SIGNING_HEADERS.NONCE}: ${nonce}' \\`,
      `  -H '${PARTNER_SIGNING_HEADERS.PARTNER_ID}: ${created.connection.id}' \\`,
      `  -H '${PARTNER_SIGNING_HEADERS.KEY_ID}: ${created.signing.kid}' \\`,
      `  -H '${PARTNER_SIGNING_HEADERS.CONTENT_DIGEST}: ${digest}' \\`,
      `  -H '${PARTNER_SIGNING_HEADERS.SIGNATURE}: ${signature}' \\`,
      `  -H 'idempotency-key: ${headerMap['idempotency-key']}' \\`,
      `  -H 'content-type: application/json' \\`,
      `  --data '${JSON.stringify(body)}'`,
    ].join('\n');

    const nodeExample = [
      `import { createHash } from 'node:crypto';`,
      `import { CompactSign, importJWK } from 'jose';`,
      `import { buildCanonicalSigningString } from '@sentra/contracts';`,
      ``,
      `const digest = 'sha-256=' + createHash('sha256').update(rawBody).digest('base64url');`,
      `const canonical = buildCanonicalSigningString({`,
      `  method: 'POST', path: '${endpoint}', timestamp, nonce, contentDigest: digest,`,
      `  partnerConnectionId, keyId,`,
      `});`,
      `const key = await importJWK(privateKeyJwk, 'ES256');`,
      `const signature = await new CompactSign(Buffer.from(canonical, 'utf8'))`,
      `  .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'sentra-sig+v1' })`,
      `  .sign(key);`,
      `// Never embed a production private key in the browser. Use pnpm partner:sign locally.`,
    ].join('\n');

    return {
      kind,
      endpoint,
      method: 'POST',
      canonicalString,
      headers: headerMap,
      body,
      responseStatus: 200,
      responseBody,
      correlationId: getCorrelationId(),
      idempotencyKey: headerMap['idempotency-key'],
      nodeExample,
      curlExample,
      connectionId: created.connection.id,
      organizationId,
    };
  }
}

export const createPartnerSandbox = (deps: SandboxDeps): PartnerSandbox => new PartnerSandbox(deps);
