/**
 * Bootstrap fixtures for a local or staging environment.
 *
 * Creates the platform tenant, one synthetic bank, one synthetic telecom, a development
 * operator, and the platform-wide retention defaults. Everything is synthetic: slide 082
 * requires no real partner data before the readiness gates pass, and slide 093 states the
 * first proof carries no production bank data.
 *
 * Deliberately absent:
 *   * Partner credentials. A client secret is shown exactly once, at creation, so
 *     credentials are issued through the API rather than baked into a fixture where they
 *     would end up in a shell history or a CI log.
 *   * Audit events. Seeded rows are bootstrap state, not actions by a principal, and the
 *     hash chain legitimately starts empty. Reproducing the chaining rules here would
 *     invite the seed and the application to drift apart.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

const SOURCE = 'seed';

/**
 * A single synthetic authorized-push-payment scam journey, keyed by a stable correlation id
 * so the whole chain is created exactly once. Every value is obviously synthetic and no raw
 * identifier appears — the subject references are opaque pairwise tokens (slide 041).
 */
const DEMO = {
  correlationId: 'seed-demo-app-scam-0001',
  payerSubjectRef: 'subj_seed_payer_00000000001',
  payeeSubjectRef: 'subj_seed_payee_00000000001',
};

/** Stable, obviously-synthetic tenants so a demo can never be mistaken for production. */
const organizations = [
  {
    slug: 'sentra-platform',
    legalName: 'Sentra Network Operations (Synthetic)',
    type: 'PLATFORM' as const,
    jurisdiction: 'GB',
    defaultCurrency: 'GBP',
  },
  {
    slug: 'bank-sandbox',
    legalName: 'Northwind Bank Sandbox (Synthetic)',
    type: 'BANK' as const,
    jurisdiction: 'GB',
    defaultCurrency: 'GBP',
  },
  {
    slug: 'telco-sandbox',
    legalName: 'Meridian Mobile Sandbox (Synthetic)',
    type: 'TELECOM' as const,
    jurisdiction: 'GB',
    defaultCurrency: 'GBP',
  },
];

/**
 * Platform-wide retention defaults. A tenant may override any of these with its own row
 * for the same resource and purpose. Durations follow the principle of slide 032: evidence
 * expires automatically once its utility window closes.
 */
const retentionPolicies = [
  {
    resourceType: 'telecom_risk_event',
    purpose: 'PROTECT_PAYMENT' as const,
    retentionSeconds: 604_800,
    action: 'DELETE' as const,
    legalBasis: 'Consent for payment protection; evidence value expires with the protection window.',
  },
  {
    resourceType: 'protection_session',
    purpose: 'PROTECT_PAYMENT' as const,
    retentionSeconds: 604_800,
    action: 'DELETE' as const,
    legalBasis: 'Consent for payment protection; sessions are short-lived by design.',
  },
  {
    resourceType: 'payment_intent',
    purpose: 'PROTECT_PAYMENT' as const,
    retentionSeconds: 7_776_000,
    action: 'ANONYMIZE' as const,
    legalBasis: 'Legitimate interest in fraud prevention; retained for dispute and appeal windows.',
  },
  {
    resourceType: 'audit_event',
    purpose: 'AUDIT_COMPLIANCE' as const,
    retentionSeconds: 31_536_000,
    action: 'DELETE' as const,
    legalBasis: 'Regulatory obligation to evidence automated decision-making.',
  },
  {
    resourceType: 'inbox_event',
    purpose: 'SERVICE_OPERATION' as const,
    retentionSeconds: 2_592_000,
    action: 'DELETE' as const,
    legalBasis: 'Operational necessity for duplicate suppression only.',
  },
  {
    resourceType: 'idempotency_key',
    purpose: 'SERVICE_OPERATION' as const,
    retentionSeconds: 86_400,
    action: 'DELETE' as const,
    legalBasis: 'Operational necessity to make partner retries safe.',
  },
  {
    resourceType: 'ai_request',
    purpose: 'PROTECT_PAYMENT' as const,
    retentionSeconds: 2_592_000,
    action: 'DELETE' as const,
    legalBasis: 'Model governance evidence; inputs are redacted before submission.',
  },
];

const DEV_OPERATOR_EMAIL = 'dev-operator@sentra.invalid';

const seed = async (): Promise<void> => {
  const createdOrganizations = new Map<string, string>();

  for (const organization of organizations) {
    const existing = await prisma.organization.findUnique({ where: { slug: organization.slug } });
    const record = await prisma.organization.upsert({
      where: { slug: organization.slug },
      update: { legalName: organization.legalName },
      create: {
        id: existing?.id ?? ulid(),
        slug: organization.slug,
        legalName: organization.legalName,
        type: organization.type,
        jurisdiction: organization.jurisdiction,
        dataResidency: organization.jurisdiction,
        defaultCurrency: organization.defaultCurrency,
        source: SOURCE,
      },
    });
    createdOrganizations.set(organization.slug, record.id);
    process.stdout.write(`organization ${record.slug} -> ${record.id}\n`);
  }

  // A single development operator, made an owner of every synthetic tenant so a local
  // console session can move between them. Real environments invite members individually.
  const operator = await prisma.user.upsert({
    where: { primaryEmail: DEV_OPERATOR_EMAIL },
    update: {},
    create: {
      id: ulid(),
      primaryEmail: DEV_OPERATOR_EMAIL,
      displayName: 'Development Operator',
      source: SOURCE,
    },
  });
  process.stdout.write(`user ${operator.primaryEmail} -> ${operator.id}\n`);

  for (const [slug, organizationId] of createdOrganizations) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: operator.id } },
      update: { role: 'OWNER', status: 'ACTIVE' },
      create: {
        id: ulid(),
        organizationId,
        userId: operator.id,
        role: 'OWNER',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
    process.stdout.write(`membership ${slug} owner -> ${operator.primaryEmail}\n`);
  }

  for (const policy of retentionPolicies) {
    // A platform default has no organization, so the composite unique key uses null.
    const existing = await prisma.retentionPolicy.findFirst({
      where: {
        organizationId: null,
        resourceType: policy.resourceType,
        purpose: policy.purpose,
        version: 1,
      },
    });

    if (existing === null) {
      await prisma.retentionPolicy.create({
        data: {
          id: ulid(),
          organizationId: null,
          resourceType: policy.resourceType,
          purpose: policy.purpose,
          retentionSeconds: policy.retentionSeconds,
          action: policy.action,
          legalBasis: policy.legalBasis,
          createdBy: SOURCE,
        },
      });
    }
    process.stdout.write(
      `retention ${policy.resourceType}/${policy.purpose} -> ${policy.retentionSeconds}s ${policy.action}\n`,
    );
  }

  const bankId = createdOrganizations.get('bank-sandbox');
  const telcoId = createdOrganizations.get('telco-sandbox');
  if (bankId !== undefined && telcoId !== undefined) {
    await seedSyntheticJourney(bankId, telcoId);
  }

  process.stdout.write('\nSeed complete. All tenants and data are synthetic.\n');
  process.stdout.write(
    'Issue partner credentials through POST /v1/organizations/:id/partner-connections so the secret is shown once.\n',
  );
};

/**
 * Seeds one end-to-end synthetic case: consent, a telecom risk signal, a bank payment
 * intent, the correlated case, its risk assessment and recommendation, the bank outcome, a
 * customer notification, and the operational-event trail. Idempotent: the whole chain is
 * guarded by a stable correlation id, and the consent row upserts on its natural key.
 */
const seedSyntheticJourney = async (bankId: string, telcoId: string): Promise<void> => {
  // Consent is keyed by (organization, subjectRef, purpose), so this is safe to re-run.
  await prisma.consentRecord.upsert({
    where: {
      organizationId_subjectRef_purpose: {
        organizationId: bankId,
        subjectRef: DEMO.payerSubjectRef,
        purpose: 'PROTECT_PAYMENT',
      },
    },
    update: { status: 'GRANTED' },
    create: {
      id: ulid(),
      organizationId: bankId,
      subjectRef: DEMO.payerSubjectRef,
      purpose: 'PROTECT_PAYMENT',
      status: 'GRANTED',
      scope: 'telecom-risk-signals:payment-protection',
      source: SOURCE,
      correlationId: DEMO.correlationId,
    },
  });
  process.stdout.write(`consent ${DEMO.payerSubjectRef} -> GRANTED\n`);

  const existingCase = await prisma.correlationCase.findFirst({
    where: { correlationId: DEMO.correlationId },
  });
  if (existingCase !== null) {
    process.stdout.write('synthetic journey already present -> skipping chain\n');
    return;
  }

  const now = Date.now();
  const observedAt = new Date(now - 8 * 60_000);
  const initiatedAt = new Date(now - 2 * 60_000);

  // The whole case is written atomically, mirroring how the application commits a domain
  // change and its dependents in one transaction (slide 034).
  // Remote Supabase latency can exceed Prisma's default interactive-transaction timeout
  // across these sequential writes; keep the transaction and give it a bounded wait.
  await prisma.$transaction(async (tx) => {
    const telecomEvent = await tx.telecomRiskEvent.create({
      data: {
        id: ulid(),
        organizationId: telcoId,
        subjectRef: DEMO.payerSubjectRef,
        purpose: 'PROTECT_PAYMENT',
        eventType: 'suspicious_inbound_call',
        recentSuspiciousCall: true,
        callerReputation: 'KNOWN_BAD',
        callDurationSeconds: 1_420,
        deviceChange: true,
        scamCampaignMatch: true,
        telecomEvidence: 'OK',
        severity: 'HIGH',
        observedAt,
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    const paymentIntent = await tx.paymentIntent.create({
      data: {
        id: ulid(),
        organizationId: bankId,
        subjectRef: DEMO.payerSubjectRef,
        payeeRef: DEMO.payeeSubjectRef,
        purpose: 'PROTECT_PAYMENT',
        amountMinor: BigInt(850_000),
        currency: 'GBP',
        firstTimePayee: true,
        payeeAgeDays: 0,
        paymentVelocity24h: 3,
        deviceChange: true,
        customerVulnerability: true,
        identityVerificationResult: 'NOT_CHECKED',
        previousWarnings: 1,
        channel: 'mobile_app',
        initiatedAt,
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    const correlationCase = await tx.correlationCase.create({
      data: {
        id: ulid(),
        organizationId: bankId,
        subjectRef: DEMO.payerSubjectRef,
        status: 'RECOMMENDED',
        telecomRiskEventId: telecomEvent.id,
        paymentIntentId: paymentIntent.id,
        correlationBasis: 'subject_ref match within 15m window',
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    const contributingSignals = [
      { code: 'SCAM_CAMPAIGN_MATCH', title: 'Matches a known scam campaign', description: 'The telecom signal matched an active campaign pattern.', contribution: 30, category: 'CAMPAIGN' },
      { code: 'RECENT_SUSPICIOUS_CALL', title: 'Recent suspicious call', description: 'A suspicious inbound call preceded the payment.', contribution: 20, category: 'TELECOM' },
      { code: 'LOW_CALLER_REPUTATION', title: 'Low caller reputation', description: 'The caller number has a known-bad reputation.', contribution: 15, category: 'TELECOM' },
      { code: 'NEW_PAYEE', title: 'First-time payee', description: 'The payee has never been paid before.', contribution: 12, category: 'PAYMENT' },
      { code: 'HIGH_VALUE_PAYMENT', title: 'High-value payment', description: 'The amount is high relative to typical activity.', contribution: 11, category: 'PAYMENT' },
    ];
    const evidenceSources = [
      { source: 'telecom-risk-signals', availability: 'OK' },
      { source: 'device-intelligence', availability: 'OK' },
      { source: 'identity-verification', availability: 'UNAVAILABLE', detail: 'Not checked for this synthetic case.' },
    ];

    const assessment = await tx.riskAssessment.create({
      data: {
        id: ulid(),
        organizationId: bankId,
        caseId: correlationCase.id,
        subjectRef: DEMO.payerSubjectRef,
        riskScore: 88,
        riskLevel: 'HIGH',
        uncertainty: new Prisma.Decimal('0.150'),
        reasonCodes: contributingSignals.map((signal) => signal.code),
        contributingSignals,
        rulesTriggered: ['R-APP-CAMPAIGN', 'R-NEW-PAYEE-HIGH-VALUE'],
        evidenceSources,
        missingProviders: ['identity-verification'],
        telecomEvidence: 'OK',
        policyVersion: 'policy-2026.08.1',
        rulesVersion: 'rules-2026.08.1',
        processingTimeMs: 7,
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    const recommendation = await tx.recommendation.create({
      data: {
        id: ulid(),
        organizationId: bankId,
        caseId: correlationCase.id,
        riskAssessmentId: assessment.id,
        subjectRef: DEMO.payerSubjectRef,
        recommendedAction: 'REQUIRE_CALLBACK',
        alternativeActions: ['DELAY', 'REQUIRE_ANALYST_REVIEW'],
        riskScore: 88,
        riskLevel: 'HIGH',
        uncertainty: new Prisma.Decimal('0.150'),
        reasonCodes: contributingSignals.map((signal) => signal.code),
        summary: 'High scam risk: a known-bad caller preceded a first-time high-value transfer. Recommend a customer callback before release.',
        authorityNote: 'Advisory only. The bank makes the final decision on this payment.',
        policyVersion: 'policy-2026.08.1',
        rulesVersion: 'rules-2026.08.1',
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    await tx.bankOutcome.create({
      data: {
        id: ulid(),
        organizationId: bankId,
        caseId: correlationCase.id,
        recommendationId: recommendation.id,
        bankDecision: 'CALLBACK_REQUESTED',
        outcomeClassification: 'CONFIRMED_SCAM',
        reference: 'seed-bank-case-0001',
        outcomeRecordedAt: new Date(now),
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    await tx.notificationRecord.create({
      data: {
        id: ulid(),
        organizationId: bankId,
        caseId: correlationCase.id,
        subjectRef: DEMO.payerSubjectRef,
        channel: 'PUSH',
        notificationType: 'scam_warning',
        status: 'DELIVERED',
        dedupeKey: `warn:${DEMO.correlationId}`,
        sentAt: new Date(now - 60_000),
        deliveredAt: new Date(now - 55_000),
        correlationId: DEMO.correlationId,
        source: SOURCE,
      },
    });

    const operationalEvents = [
      { type: 'telecom.risk_event.received', severity: 'HIGH' as const, provider: 'telecom-partner', subjectRef: DEMO.payerSubjectRef, payloadPreview: { eventType: 'suspicious_inbound_call', callerReputation: 'KNOWN_BAD' } },
      { type: 'payment.intent.received', severity: 'INFO' as const, provider: 'bank-partner', subjectRef: DEMO.payerSubjectRef, payloadPreview: { amountMinor: '850000', currency: 'GBP', firstTimePayee: true } },
      { type: 'correlation.matched', severity: 'INFO' as const, provider: 'core', subjectRef: DEMO.payerSubjectRef, payloadPreview: { basis: 'subject_ref within 15m' } },
      { type: 'risk.assessment.completed', severity: 'HIGH' as const, provider: 'core', subjectRef: DEMO.payerSubjectRef, payloadPreview: { riskScore: 88, riskLevel: 'HIGH' } },
      { type: 'decision.recommendation.issued', severity: 'HIGH' as const, provider: 'core', subjectRef: DEMO.payerSubjectRef, payloadPreview: { recommendedAction: 'REQUIRE_CALLBACK' } },
    ];
    let offset = 8 * 60_000;
    for (const event of operationalEvents) {
      await tx.operationalEvent.create({
        data: {
          id: ulid(),
          organizationId: bankId,
          type: event.type,
          severity: event.severity,
          status: 'COMPLETED',
          actor: event.provider,
          subjectRef: event.subjectRef,
          provider: event.provider,
          durationMs: 6,
          synthetic: true,
          payloadPreview: event.payloadPreview,
          correlationId: DEMO.correlationId,
          occurredAt: new Date(now - offset),
        },
      });
      offset -= 90_000;
    }
  }, {
    maxWait: 10_000,
    timeout: 60_000,
  });

  process.stdout.write(`synthetic journey ${DEMO.correlationId} -> case + assessment + recommendation + outcome + 5 events\n`);
};

seed()
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
