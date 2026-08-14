import { ACTOR_TYPES, AUDIT_ACTIONS, AUDIT_OUTCOMES, PURPOSES } from '@sentra/contracts';
import { AI_TASKS, RISK_INDICATOR_CODES } from '@sentra/ports';
import {
  describeAIProviderContract,
  describeAuditProviderContract,
  describeCacheProviderContract,
  describeClockContract,
  describeIdGeneratorContract,
  describeNotificationProviderContract,
  describePartnerAuthProviderContract,
  describePasswordHasherContract,
  describeQueueProviderContract,
  describeRiskSignalProviderContract,
  describeSecureRandomContract,
  describeSignatureVerifierContract,
  describeStorageProviderContract,
  describeUnitOfWorkContract,
  describeUserTokenVerifierContract,
} from '../contracts';
import {
  createFakeAIProvider,
  createFakeAuditProvider,
  createFakeCacheProvider,
  createFakeClock,
  createFakeIdGenerator,
  createFakeNotificationProvider,
  createFakeOutboxStaging,
  createFakePartnerAuthProvider,
  createFakePasswordHasher,
  createFakeQueueProvider,
  createFakeRiskSignalProvider,
  createFakeSecureRandom,
  createFakeSignatureVerifier,
  createFakeStorageProvider,
  createFakeUnitOfWork,
  createFakeUserTokenVerifier,
  registerDefaultBankConnection,
  type RegisteredUserToken,
} from '../fakes';
import type { FakeQueueProvider } from '../fakes';

const auditSampleInput = () => ({
  organizationId: '01ORG_UOW_AUDIT',
  actorType: ACTOR_TYPES.USER,
  actorId: '01USER_UOW',
  action: AUDIT_ACTIONS.MEMBER_ADDED,
  resourceType: 'organization_member',
  resourceId: '01MEMBER_UOW',
  purpose: PURPOSES.PARTNER_ADMINISTRATION,
  outcome: AUDIT_OUTCOMES.ALLOWED,
  occurredAt: new Date('2026-08-11T12:00:00.000Z'),
});

describeClockContract('Fake', () => createFakeClock());

describeIdGeneratorContract('Fake', () => createFakeIdGenerator());

describeUnitOfWorkContract('Fake', () => {
  const clock = createFakeClock();
  const uow = createFakeUnitOfWork(clock);
  const audit = createFakeAuditProvider({ unitOfWork: uow });
  const outbox = createFakeOutboxStaging(uow);

  return {
    uow,
    read: async (key) => uow.read(key),
    write: async (scope, key, value) => {
      uow.stage(scope, key, value);
    },
    stageAudit: async (scope) => {
      await audit.record(auditSampleInput(), scope);
    },
    listAudit: () => audit.events(),
    stageOutbox: async (scope, eventId) => {
      outbox.stage(scope, eventId);
    },
    listOutbox: () => outbox.events(),
    advanceTime: (ms) => {
      clock.advance(ms);
    },
  };
});

describeAuditProviderContract('Fake', () => {
  const uow = createFakeUnitOfWork();
  const audit = createFakeAuditProvider({ unitOfWork: uow });
  return {
    uow,
    audit,
    read: async (key) => uow.read(key),
    write: async (scope, key, value) => {
      uow.stage(scope, key, value);
    },
    listCommittedEvents: () => audit.events(),
  };
});

describeQueueProviderContract('Fake', () => {
  const clock = createFakeClock();
  const queue = createFakeQueueProvider({ clock });
  return {
    queue,
    now: () => clock.now(),
    advanceTime: (ms) => {
      clock.advance(ms);
    },
    flush: async (queueName: string) => {
      await queue.flush(queueName);
    },
    configureFailure: (messageId, failUntilAttempt) => {
      queue.failUntilAttempt(messageId, failUntilAttempt);
    },
    forceDuplicateDelivery: (messageId) => {
      queue.forceDuplicateDelivery(messageId);
    },
  };
});

describeCacheProviderContract('Fake', () => {
  const clock = createFakeClock();
  const cache = createFakeCacheProvider(clock);
  return {
    cache,
    advanceTime: (seconds: number) => {
      clock.advance(seconds * 1000);
    },
  };
});

describeStorageProviderContract('Fake', () => {
  const clock = createFakeClock();
  const storage = createFakeStorageProvider(clock);
  return {
    storage,
    now: () => clock.now(),
    advanceTime: (seconds: number) => {
      clock.advance(seconds * 1000);
    },
  };
});

describeNotificationProviderContract('Fake', () => {
  const notifications = createFakeNotificationProvider();
  return {
    notifications,
    listDeliveries: () => notifications.deliveries(),
    simulateTransportFailure: (reason: string) => {
      notifications.setFailReason(reason);
    },
    clearTransportFailure: () => {
      notifications.setFailReason(undefined);
    },
  };
});

describeRiskSignalProviderContract('Fake', () => {
  const clock = createFakeClock();
  const riskSignals = createFakeRiskSignalProvider(clock);
  return {
    riskSignals,
    grantConsent: (subjectRef: string) => {
      riskSignals.grantConsent(subjectRef);
    },
    setIndicators: (subjectRef, indicators) => {
      riskSignals.setIndicators(subjectRef, indicators);
    },
    markUnavailable: (reason?: string) => {
      riskSignals.setUnavailable(true, reason);
    },
  };
});

describePartnerAuthProviderContract('Fake', () => {
  const clock = createFakeClock();
  const partnerAuth = createFakePartnerAuthProvider(clock);
  return {
    partnerAuth,
    clock: {
      now: () => clock.now(),
      advance: (ms: number) => {
        clock.advance(ms);
      },
    },
    registerValidClient: () => {
      const connection = registerDefaultBankConnection(partnerAuth);
      return {
        clientId: connection.clientId,
        clientSecret: connection.clientSecret,
        organizationId: connection.organizationId,
        tokenTtlSeconds: connection.tokenTtlSeconds,
      };
    },
  };
});

describeSignatureVerifierContract('Fake', () => {
  const clock = createFakeClock();
  const verifier = createFakeSignatureVerifier();
  const registeredSecrets = new Map<string, string>();

  return {
    verifier,
    registerActiveKey: ({ organizationId, keyId, algorithm }) => {
      const secret = `secret-${organizationId}-${keyId}`;
      registeredSecrets.set(`${organizationId}:${keyId}`, secret);
      verifier.registerKey({
        organizationId,
        kid: keyId,
        algorithm,
        secret,
        status: 'ACTIVE',
        notBefore: new Date(clock.now().getTime() - 60_000),
        notAfter: null,
      });
    },
    sign: ({ organizationId, keyId, payload }) =>
      verifier.sign({ organizationId, keyId, payload }),
    revokeKey: (organizationId, keyId) => {
      const secret = registeredSecrets.get(`${organizationId}:${keyId}`);
      if (secret === undefined) {
        return;
      }
      verifier.registerKey({
        organizationId,
        kid: keyId,
        algorithm: 'ES256',
        secret,
        status: 'REVOKED',
        notBefore: new Date(clock.now().getTime() - 60_000),
        notAfter: null,
      });
    },
  };
});

describeUserTokenVerifierContract('Fake', () => {
  const clock = createFakeClock();
  const expectedIssuer = 'https://auth.sentra.test';
  const expectedAudience = 'sentra-portal';
  const allowedAlgorithms = ['RS256'] as const;
  const verifier = createFakeUserTokenVerifier(clock, {
    expectedIssuer,
    expectedAudience,
    allowedAlgorithms,
  });
  let tokenCounter = 0;

  const registerToken = (overrides: Partial<RegisteredUserToken> = {}): RegisteredUserToken => {
    const nowMs = clock.now().getTime();
    const token: RegisteredUserToken = {
      rawToken: overrides.rawToken ?? `fake-user-token-${++tokenCounter}`,
      issuer: expectedIssuer,
      audience: expectedAudience,
      subject: '01USER_TEST',
      algorithm: allowedAlgorithms[0],
      notBeforeMs: nowMs,
      expiresAtMs: nowMs + 3600_000,
      active: true,
      ...overrides,
    };
    verifier.registerToken(token);
    return token;
  };

  return {
    verifier,
    clock: {
      now: () => clock.now(),
      advance: (ms: number) => {
        clock.advance(ms);
      },
    },
    registerValidToken: () => {
      const token = registerToken();
      return { rawToken: token.rawToken, expiresInSeconds: 3600 };
    },
    registerTokenNotYetValid: () => {
      const token = registerToken({ notBeforeMs: clock.now().getTime() + 60_000 });
      return token.rawToken;
    },
    registerTokenWithIssuer: (issuer: string) => registerToken({ issuer }).rawToken,
    registerTokenWithAudience: (audience: string) => registerToken({ audience }).rawToken,
    registerTokenWithAlgorithm: (algorithm: string) => registerToken({ algorithm }).rawToken,
    rotateToken: (oldToken: string) => {
      const replacement = registerToken();
      verifier.rotateKey(oldToken, replacement);
      return replacement.rawToken;
    },
  };
});

describePasswordHasherContract('Fake', () => createFakePasswordHasher());

describeSecureRandomContract('Fake', () => createFakeSecureRandom());

describeAIProviderContract('Fake', () => {
  const ai = createFakeAIProvider();
  return {
    ai,
    markUnavailable: () => {
      ai.setUnavailable(true);
    },
    markBlocked: () => {
      ai.setBlocked(true);
    },
    markInvalidOutput: () => {
      ai.setInvalidOutput(true);
    },
    setStructuredResponse: (value: unknown) => {
      ai.setResponse(AI_TASKS.CLASSIFY_INDICATORS, value);
    },
  };
});

describe('FakeQueueProvider extras', () => {
  it('tracks scheduled jobs separately from immediate delivery', async () => {
    const queue: FakeQueueProvider = createFakeQueueProvider();
    await queue.schedule('sentra.retention', 'retention.sweep', '0 3 * * *', { schemaVersion: 1 });
    expect(queue.scheduledJobs()).toHaveLength(1);
  });
});

describe('FakeRiskSignalProvider extras', () => {
  it('filters indicators outside the lookback window', async () => {
    const clock = createFakeClock();
    const provider = createFakeRiskSignalProvider(clock);
    const subjectRef = 'pairwise_subject_ref_filter_test';
    provider.grantConsent(subjectRef);
    provider.setIndicators(subjectRef, [
      {
        code: RISK_INDICATOR_CODES.RECENT_SIM_CHANGE,
        confidence: 0.8,
        observedAt: new Date(clock.now().getTime() - 600_000),
        sourceOrganizationId: '01ORG_TELCO',
        consentId: '01CONSENT_OLD',
      },
    ]);

    const result = await provider.query({
      subjectRef,
      organizationId: '01ORG_BANK',
      lookbackSeconds: 120,
      timeoutMs: 200,
      correlationId: 'crl_filter',
    });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.indicators).toHaveLength(0);
    }
  });
});
