/**
 * The Sentra public API specification (OpenAPI 3.1), rendered by the Scalar reference at /docs.
 *
 * This is the developer-facing contract. It is intentionally hand-authored (rather than derived
 * from the internal Zod schemas) so the public surface can be curated and documented independently
 * of internal routes. Everything here is real for the v1 sandbox; production is gated on approval.
 */
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Sentra API',
    version: '1.0.0',
    description: `
Sentra is a privacy-first, real-time scam-prevention network. Banks and telecoms exchange
**consented risk signals** so an authorized push-payment (APP) scam can be caught in the seconds
before money leaves an account.

You send a payment as it happens; Sentra returns an **explainable recommendation** — a risk score,
a risk level, the reason codes behind it, and a recommended action (allow, warn, delay, require a
callback, or recommend a block). **The bank always makes the final decision.** Sentra advises.

---

## Two kinds of integration

The API is asymmetric by design — a bank and a telecom see different halves of a scam and use
different endpoints. Your key's scopes decide which half you get.

| | **Banks & payment providers** | **Telecoms** |
|---|---|---|
| You have | The payment | The network signal (SIM swap, suspicious call, porting) |
| You call | \`POST /v1/evaluate\`, \`/v1/payment-intents\`, \`/v1/outcomes\` | \`POST /v1/risk-events\` |
| You read | \`/v1/recommendations/{id}\`, \`/v1/cases/{id}\` | \`/v1/cases/{id}\` (incl. the bank's decision), \`/v1/case-feedback/pending\` |
| You submit | The final decision on a payment | Whether a case was a scam (\`/v1/case-feedback\`) |

A telecom never sees a payment amount, and a bank never sees a phone number: each side sends only
its own consented, risk-relevant fields, correlated by a shared \`subjectRef\`. When a bank records
a decision on a case a telecom's signal touched, Sentra calls that telecom back with just the
case id, the decision, and the classification, so the telecom can confirm whether it was a scam.

---

## Quickstart

1. **Create an account.** Sign up at the [console](/signup). Your organization starts in **sandbox**.
2. **Grab a sandbox key.** In **API Keys**, create a key pair. You get a **publishable key**
   (\`pk_test_…\`) and a **secret key** (\`sk_test_…\`). The secret is shown once — store it in a
   secret manager.
3. **Make your first call.** Evaluate a payment (see *Evaluate a payment* below) — you can run it
   right here with **Send**, using your \`sk_test_\` key. Sandbox runs against **synthetic data on
   an isolated network** — it never touches the live decision network.
4. **Go live.** When you're ready, request production access from **Organization → Request
   production access**. After our team approves you, live keys (\`pk_live_…\` / \`sk_live_…\`)
   unlock and your traffic reaches the real network.

## Authentication

Authenticate every request with your **secret key** as a bearer token:

\`\`\`
Authorization: Bearer sk_test_9f2c…
\`\`\`

Never expose a secret key in a browser, mobile app, or public repository. If a key leaks, revoke
it in the console and create a new one. Publishable keys (\`pk_…\`) identify your organization and
are safe to embed.

## Sandbox vs. production

| | Sandbox | Production |
|---|---|---|
| Keys | \`pk_test_\` / \`sk_test_\` | \`pk_live_\` / \`sk_live_\` |
| Data | Synthetic only | Real, consented signals |
| Network | Isolated | Live decision network |
| Availability | Immediately, self-serve | After approval |

## Idempotency

Safely retry any \`POST\` by sending an **\`Idempotency-Key\`** header (a unique value you generate,
e.g. a UUID). Sentra returns the original response for a repeated key, so a network retry never
double-submits a payment.

## Rate limits

Sandbox is limited to protect shared infrastructure; production limits are set per organization
during onboarding. When you exceed a limit you receive \`429\` with a \`Retry-After\` header. Back
off and retry.

## Errors

Errors use standard HTTP status codes and a consistent JSON body:

\`\`\`json
{ "error": { "code": "validation_error", "message": "paymentAmount must be positive.", "correlationId": "crl_…" } }
\`\`\`

Every response carries an \`x-correlation-id\` header — include it when you contact support.
`,
    contact: { name: 'Sentra Developer Support', email: 'developers@sentra.example' },
  },
  servers: [
    { url: '/', description: 'Sandbox — this origin, proxied to the Sentra API (synthetic data)' },
  ],
  security: [{ secretKey: [] }],
  tags: [
    { name: 'Banks', description: 'For banks and payment providers: evaluate payments, read recommendations, and record the final decision.' },
    { name: 'Telecoms', description: 'For telecoms: share network risk signals and confirm whether the cases they touched were scams.' },
  ],
  paths: {
    '/v1/evaluate': {
      post: {
        tags: ['Banks'],
        summary: 'Evaluate a payment',
        operationId: 'evaluatePayment',
        description:
          'Submit a payment intent as it happens and receive an explainable scam-risk recommendation. This is the core endpoint. No card numbers, account numbers, or credentials are ever accepted — send only the risk-relevant, consented fields below.',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', example: '5f2b0e9a-6c1a-4e2b-9f3d-8a7c1b2d3e4f' },
            description: 'A unique value so a retry never double-submits.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentIntent' },
              example: {
                paymentAmount: 8400,
                currency: 'GBP',
                firstTimePayee: true,
                payeeAgeDays: 0,
                paymentVelocity24h: 2,
                recentSuspiciousCall: true,
                callDurationSeconds: 900,
                subjectRef: 'sbj_9f2c1a',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'The explainable recommendation. The bank decides; Sentra advises.',
            headers: { 'x-correlation-id': { schema: { type: 'string' }, description: 'Trace id for this decision.' } },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Recommendation' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/risk-events': {
      post: {
        tags: ['Telecoms'],
        summary: 'Share a network risk signal',
        operationId: 'ingestRiskEvent',
        description:
          'Telecoms only. Report a network signal (a SIM swap, a suspicious call in progress, number porting, a device change) about a subject, keyed by a shared `subjectRef`. Sentra correlates it with any payment a bank evaluates for the same subject. You never send a phone number or a payment amount — only the consented, risk-relevant fields below.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TelecomRiskEvent' },
              example: {
                subjectRef: 'sbj_9f2c1a',
                recentSuspiciousCall: true,
                callDurationSeconds: 900,
                callerReputation: 'SUSPECT',
                deviceChange: true,
                severity: 'HIGH',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'The signal was accepted and correlated.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RiskEventAck' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/payment-intents': {
      post: {
        tags: ['Banks'],
        summary: 'Submit a payment intent',
        operationId: 'ingestPaymentIntent',
        description:
          'Banks only. The full partner ingest form of a payment, richer than `/v1/evaluate`: it is stored, correlated with telecom signals for the same `subjectRef`, and produces a case you can later record an outcome against.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentIntentFull' },
              example: {
                subjectRef: 'sbj_9f2c1a',
                paymentAmount: 8400,
                currency: 'GBP',
                firstTimePayee: true,
                payeeAgeDays: 0,
                paymentVelocity24h: 2,
              },
            },
          },
        },
        responses: {
          '201': { description: 'Accepted and correlated into a case.' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/outcomes': {
      post: {
        tags: ['Banks'],
        summary: 'Record the final decision on a case',
        operationId: 'submitOutcome',
        description:
          "Banks only. After you act on a recommendation, tell Sentra what you decided and — once known — how the case turned out. Recording an outcome is what notifies the telecom whose signal touched the case: Sentra calls them back with the case id, your decision, and the classification so they can confirm whether it was a scam. This feedback is what keeps the network's accuracy honest.",
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BankOutcome' },
              example: {
                caseId: '01J9Z3K7M2Q84B5C6D7E8F9G0H',
                bankDecision: 'BLOCKED',
                outcomeClassification: 'CONFIRMED_SCAM',
                reference: 'case-2026-0042',
              },
            },
          },
        },
        responses: {
          '200': { description: 'The outcome was recorded and the telecom callback queued.' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/recommendations/{id}': {
      get: {
        tags: ['Banks'],
        summary: 'Read a recommendation',
        operationId: 'getRecommendation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The recommendation id.' }],
        responses: {
          '200': { description: 'The explainable recommendation.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Recommendation' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/cases/{id}': {
      get: {
        tags: ['Banks', 'Telecoms'],
        summary: 'Read a case',
        operationId: 'getCase',
        description:
          "Read the current state of a correlated case: the latest recommendation and whether a bank decision has been recorded. Telecoms read the decision itself — and the list of cases awaiting them — from `/v1/case-feedback/pending`, then confirm the outcome with `/v1/case-feedback`.",
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The case id.' }],
        responses: {
          '200': { description: 'The case, including the bank decision when available.', content: { 'application/json': { schema: { $ref: '#/components/schemas/CaseView' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/case-feedback/pending': {
      get: {
        tags: ['Telecoms'],
        summary: 'Cases awaiting your feedback',
        operationId: 'listPendingCaseFeedback',
        description:
          'Telecoms only. Lists cases your signals contributed to where a bank has now recorded a decision, so you can confirm whether each was a scam. This is the pull side of the callback: poll it, or receive the same information by webhook once callbacks are configured.',
        responses: {
          '200': { description: 'Cases waiting on your assessment.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PendingFeedbackList' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/case-feedback': {
      post: {
        tags: ['Telecoms'],
        summary: 'Confirm whether a case was a scam',
        operationId: 'submitCaseFeedback',
        description:
          'Telecoms only. Report your assessment of a case your signal touched — scam, legitimate, or unclear — after seeing the bank decision. This closes the loop and improves the network for everyone.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CaseFeedback' },
              example: { caseId: '01J9Z3K7M2Q84B5C6D7E8F9G0H', assessment: 'SCAM', note: 'Matched an active SIM-swap campaign.' },
            },
          },
        },
        responses: {
          '200': { description: 'Your assessment was recorded.' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      secretKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'Your secret key (`sk_test_…` in sandbox, `sk_live_…` in production) as a bearer token.',
      },
    },
    responses: {
      ValidationError: {
        description: 'The request failed validation.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'validation_error', message: 'paymentAmount must be positive.', correlationId: 'crl_…' } } } },
      },
      Unauthorized: {
        description: 'Missing or invalid key.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'unauthorized', message: 'Provide a valid secret key as a bearer token.' } } } },
      },
      NotFound: {
        description: 'No such resource.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'not_found', message: 'No recommendation with that id.' } } } },
      },
      RateLimited: {
        description: 'Too many requests. Back off and retry after `Retry-After` seconds.',
        headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait.' } },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    schemas: {
      PaymentIntent: {
        type: 'object',
        required: ['paymentAmount', 'currency'],
        description: 'A payment as it happens. Risk-relevant, consented fields only — never card/account numbers or credentials.',
        properties: {
          paymentAmount: { type: 'number', minimum: 0, description: 'Amount in the currency’s major unit.', example: 8400 },
          currency: { type: 'string', minLength: 3, maxLength: 3, description: 'ISO 4217.', example: 'GBP' },
          firstTimePayee: { type: 'boolean', description: 'Is this the first payment to this payee?', example: true },
          payeeAgeDays: { type: 'integer', minimum: 0, description: 'Days since the payee was added.', example: 0 },
          paymentVelocity24h: { type: 'integer', minimum: 0, description: 'Payments to this payee in the last 24h.', example: 2 },
          recentSuspiciousCall: { type: 'boolean', description: 'A suspicious call was observed near this payment.', example: true },
          callDurationSeconds: { type: 'integer', minimum: 0, description: 'Duration of that call, in seconds.', example: 900 },
          subjectRef: { type: 'string', description: 'Your opaque reference for the payer. Never a real identifier.', example: 'sbj_9f2c1a' },
        },
      },
      Recommendation: {
        type: 'object',
        description: 'Explainable, advisory. The bank decides.',
        properties: {
          decisionId: { type: 'string', example: 'dec_7b1f…' },
          correlationId: { type: 'string', example: 'crl_8cbb2400…' },
          riskScore: { type: 'integer', minimum: 0, maximum: 100, example: 88 },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], example: 'CRITICAL' },
          recommendedAction: {
            type: 'string',
            enum: ['ALLOW', 'WARN', 'DELAY', 'REQUIRE_CALLBACK', 'REQUIRE_ANALYST_REVIEW', 'BLOCK_RECOMMENDED'],
            example: 'BLOCK_RECOMMENDED',
          },
          reasonCodes: { type: 'array', items: { type: 'string' }, example: ['FIRST_TIME_PAYEE', 'SUSPICIOUS_CALL_OVERLAP', 'HIGH_VALUE'] },
          summary: { type: 'string', example: 'High-value first payment during a prolonged suspicious call.' },
          authorityNote: { type: 'string', example: 'Advisory only — the bank makes the final decision.' },
          processingTimeMs: { type: 'number', example: 42 },
          evaluatedAt: { type: 'string', format: 'date-time' },
        },
      },
      TelecomRiskEvent: {
        type: 'object',
        required: ['subjectRef'],
        description: 'A network risk signal from a telecom. No phone numbers, no payment data — consented, risk-relevant fields only, correlated by subjectRef.',
        properties: {
          subjectRef: { type: 'string', description: 'Shared, pseudonymous subject reference. The only link between a telecom signal and a bank payment.', example: 'sbj_9f2c1a' },
          eventType: { type: 'string', default: 'scam.risk.v1', example: 'scam.risk.v1' },
          recentSuspiciousCall: { type: 'boolean', default: false, description: 'A suspicious call is in progress or just ended.', example: true },
          callerReputation: { type: 'string', enum: ['UNKNOWN', 'TRUSTED', 'SUSPECT', 'KNOWN_BAD'], default: 'UNKNOWN', example: 'SUSPECT' },
          callDurationSeconds: { type: 'integer', minimum: 0, maximum: 86400, default: 0, example: 900 },
          deviceChange: { type: 'boolean', default: false, description: 'A new device appeared on the account.', example: true },
          accountTakeoverIndicators: { type: 'boolean', default: false, example: false },
          scamCampaignMatch: { type: 'boolean', default: false, description: 'Matches a known active scam campaign.', example: false },
          severity: { type: 'string', enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'INFO', example: 'HIGH' },
          observedAt: { type: 'string', format: 'date-time', description: 'When the signal was observed. Defaults to receipt time.' },
        },
      },
      RiskEventAck: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'rsk_5f2b…' },
          subjectRef: { type: 'string', example: 'sbj_9f2c1a' },
          correlationId: { type: 'string', example: 'crl_8cbb2400…' },
          receivedAt: { type: 'string', format: 'date-time' },
          synthetic: { type: 'boolean', description: 'True in sandbox.', example: true },
        },
      },
      PaymentIntentFull: {
        type: 'object',
        required: ['subjectRef', 'paymentAmount'],
        description: 'The partner-ingest form of a payment. Correlated with telecom signals for the same subjectRef.',
        properties: {
          subjectRef: { type: 'string', example: 'sbj_9f2c1a' },
          paymentAmount: { type: 'number', minimum: 0, example: 8400 },
          currency: { type: 'string', minLength: 3, maxLength: 3, default: 'GBP', example: 'GBP' },
          firstTimePayee: { type: 'boolean', default: false, example: true },
          payeeAgeDays: { type: 'integer', minimum: 0, default: 0, example: 0 },
          paymentVelocity24h: { type: 'integer', minimum: 0, default: 0, example: 2 },
          deviceChange: { type: 'boolean', default: false },
          accountTakeoverIndicators: { type: 'boolean', default: false },
          customerVulnerability: { type: 'boolean', default: false },
          identityVerificationResult: { type: 'string', enum: ['PASS', 'FAIL', 'NOT_CHECKED'], default: 'NOT_CHECKED' },
          previousWarnings: { type: 'integer', minimum: 0, default: 0 },
          initiatedAt: { type: 'string', format: 'date-time' },
        },
      },
      BankOutcome: {
        type: 'object',
        required: ['caseId', 'bankDecision'],
        description: 'A bank\'s decision on a case, and how it turned out. Recording this triggers the telecom callback.',
        properties: {
          caseId: { type: 'string', description: 'The correlated case this decision is for.', example: '01J9Z3K7M2Q84B5C6D7E8F9G0H' },
          recommendationId: { type: 'string', description: 'Optional — the recommendation you acted on.', example: 'dec_7b1f…' },
          bankDecision: { type: 'string', enum: ['ALLOWED', 'DELAYED', 'BLOCKED', 'CALLBACK_REQUESTED', 'UNDER_REVIEW'], example: 'BLOCKED' },
          outcomeClassification: { type: 'string', enum: ['PENDING', 'CONFIRMED_SCAM', 'FALSE_POSITIVE', 'LEGITIMATE', 'UNKNOWN'], default: 'PENDING', example: 'CONFIRMED_SCAM' },
          reference: { type: 'string', description: 'Your own case reference (letters, digits, . _ : -).', example: 'case-2026-0042' },
        },
      },
      CaseView: {
        type: 'object',
        description: 'A correlated case: the latest recommendation and whether a bank decision has been recorded. The decision value itself reaches telecoms via /v1/case-feedback/pending.',
        properties: {
          decisionId: { type: 'string', example: 'dec_7b1f…' },
          correlationId: { type: 'string', example: 'crl_8cbb2400…' },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          recommendedAction: { type: 'string', example: 'BLOCK_RECOMMENDED' },
          reasonCodes: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string', example: 'Bank outcome recorded.' },
        },
      },
      PendingFeedbackList: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                caseId: { type: 'string', example: '01J9Z3K7M2Q84B5C6D7E8F9G0H' },
                bankDecision: { type: 'string', enum: ['ALLOWED', 'DELAYED', 'BLOCKED', 'CALLBACK_REQUESTED', 'UNDER_REVIEW'], example: 'BLOCKED' },
                outcomeClassification: { type: 'string', enum: ['PENDING', 'CONFIRMED_SCAM', 'FALSE_POSITIVE', 'LEGITIMATE', 'UNKNOWN'], example: 'CONFIRMED_SCAM' },
                decidedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      CaseFeedback: {
        type: 'object',
        required: ['caseId', 'assessment'],
        description: 'A telecom\'s confirmation of whether a case was a scam.',
        properties: {
          caseId: { type: 'string', example: '01J9Z3K7M2Q84B5C6D7E8F9G0H' },
          assessment: { type: 'string', enum: ['SCAM', 'LEGITIMATE', 'UNCLEAR'], example: 'SCAM' },
          note: { type: 'string', maxLength: 280, description: 'Optional short context.', example: 'Matched an active SIM-swap campaign.' },
        },
      },
      RiskEvent: {
        type: 'object',
        required: ['subjectRef', 'signal'],
        properties: {
          subjectRef: { type: 'string', example: 'sbj_9f2c1a' },
          signal: { type: 'string', enum: ['SUSPICIOUS_CALL', 'SIM_SWAP', 'PORT_OUT', 'DEVICE_CHANGE'], example: 'SUSPICIOUS_CALL' },
          callerReputation: { type: 'string', enum: ['UNKNOWN', 'KNOWN_GOOD', 'KNOWN_BAD'], example: 'KNOWN_BAD' },
          callDurationSeconds: { type: 'integer', minimum: 0, example: 900 },
          observedAt: { type: 'string', format: 'date-time' },
        },
      },
      Case: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'case_3a9c…' },
          status: { type: 'string', enum: ['OPEN', 'RESOLVED'], example: 'OPEN' },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          recommendation: { $ref: '#/components/schemas/Recommendation' },
        },
      },
      WebhookEvent: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'evt_1a2b…' },
          type: { type: 'string', enum: ['recommendation.issued', 'case.updated', 'outcome.recorded'], example: 'recommendation.issued' },
          createdAt: { type: 'string', format: 'date-time' },
          data: { type: 'object', additionalProperties: true },
        },
      },
      Accepted: {
        type: 'object',
        properties: {
          accepted: { type: 'boolean', example: true },
          correlationId: { type: 'string', example: 'crl_8cbb2400…' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'validation_error' },
              message: { type: 'string', example: 'paymentAmount must be positive.' },
              correlationId: { type: 'string', example: 'crl_…' },
            },
          },
        },
      },
    },
  },
};
