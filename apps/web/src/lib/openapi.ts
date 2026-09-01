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

## Mobile SDK (Flutter)

A bank with its own app embeds the Sentra SDK and gets scam protection at the moment of a
transfer with **one call** — no scam logic, no copy, no screens to build. The engine returns
the verdict, the wording and the questions; the SDK renders them.

**Install:**

\`\`\`yaml
dependencies:
  sentra_sdk: ^0.1.0
\`\`\`

**Initialise once** with the secret key your organization minted in the console:

\`\`\`dart
final client = SentraClient(
  apiBaseUrl: 'https://api.sentra.example',
  secretKey: 'sk_test_…', // sk_live_… once approved
);
\`\`\`

**Protect a payment** — call this the instant the customer confirms a transfer, before you move
the money:

\`\`\`dart
final result = await SentraGuard(client: client).protectPayment(
  context,
  subjectRef: customerRef,   // a stable pseudonym, never an account number
  amount: amount,
  currency: 'USD',
  payeeLabel: payee.displayName,
  firstTimePayee: payee.isNew,
  onPhoneCall: device.isOnACall,
  callerUnknown: !device.callerInContacts,
);

if (result.allowed) {
  await bank.transfer(...);   // nothing wrong, or the customer chose to send
} else {
  // result.outcome is cancelled or held; the money stays put.
  showHeld(result.caseReference);
}
\`\`\`

Under the hood the SDK runs three calls — **open** the session, **submit** the customer's
answers, **resolve** the outcome — documented under the *Bank SDK* tag below. If Sentra can't be
reached the SDK **fails open** (the payment proceeds), because a scam-check outage must never
lock a customer out of their own bank.

## Connecting a customer's account

Protection turns on when a customer links their bank inside the **Sentra app** — an OAuth-style,
redirect-based handoff in which Sentra never sees a banking credential:

1. In the Sentra app the customer picks their bank. Sentra opens the **bank's own** authorization
   screen (a deep link, or a hosted page) with a redirect URI and state.
2. The bank shows what Sentra will and won't be able to see, and the customer approves **in the
   bank**, with whatever it uses for a sensitive action (biometrics, passcode).
3. The bank redirects back to Sentra with a one-time **code**; Sentra exchanges it
   server-to-server for the credentials it uses to open protection sessions.
4. The bank stores that the account is linked and shows "Protected by Sentra" in its settings.

A reference implementation of both sides ships in the Sentra demo apps.

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
    { name: 'Bank SDK', description: 'For the bank\'s app: run a protection session at the transfer-confirmation screen, ask the customer a question or two, and report how it ended.' },
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
    '/v1/sdk/protection-sessions': {
      post: {
        tags: ['Bank SDK'],
        summary: 'Open a protection session',
        operationId: 'openProtectionSession',
        description:
          'Called by the Sentra SDK on the transfer-confirmation screen, before money moves. The response carries everything the screen renders — the verdict, the customer-facing copy, and the questions worth asking this particular customer — so the wording and thresholds improve for every bank without any of them shipping an app release. If Sentra cannot be reached, fail open and let the payment proceed: a scam check must never block a legitimate payment.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProtectionSessionRequest' },
              example: {
                subjectRef: 'sbj_9f2c1a',
                amount: 8400,
                currency: 'GBP',
                payeeLabel: 'J. Smith',
                firstTimePayee: true,
                onPhoneCall: true,
                callerUnknown: true,
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'The verdict, what to show, and what to ask.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProtectionSessionResponse' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/sdk/protection-sessions/{sessionId}/answers': {
      post: {
        tags: ['Bank SDK'],
        summary: 'Submit the customer’s answers',
        operationId: 'submitProtectionAnswers',
        description:
          'Send back the options the customer chose. The SDK never interprets an answer — the engine decides what each one means, so the meaning can be retuned server-side. The response is a revised verdict and revised copy.',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['answers'],
                properties: {
                  answers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { questionId: { type: 'string' }, optionId: { type: 'string' } },
                    },
                  },
                },
              },
              example: { answers: [{ questionId: 'asked_to_pay', optionId: 'yes' }] },
            },
          },
        },
        responses: {
          '200': { description: 'The revised verdict, copy, and where to route a hold.' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/sdk/protection-sessions/{sessionId}/resolve': {
      post: {
        tags: ['Bank SDK'],
        summary: 'Report how the payment ended',
        operationId: 'resolveProtectionSession',
        description:
          'Always call this. It is the only moment the engine receives a fact rather than an inference, and therefore the only moment it learns: the signals on the session are credited against the outcome, so signals that keep accompanying confirmed scams count for more next time. Omit `confirmedScam` while it is genuinely unknown — a guess teaches the wrong thing.',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['outcome'],
                properties: {
                  outcome: { type: 'string', enum: ['SENT', 'ABANDONED', 'HELD', 'BLOCKED'] },
                  confirmedScam: { type: 'boolean', description: 'Once known. Omit while unknown.' },
                },
              },
              example: { outcome: 'ABANDONED', confirmedScam: true },
            },
          },
        },
        responses: {
          '200': { description: 'Recorded.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/risk-events': {
      post: {
        tags: ['Telecoms'],
        summary: 'Share a network risk signal',
        operationId: 'ingestRiskEvent',
        description:
          'Telecoms only. Report a network signal — a suspicious call **in progress**, a SIM swap, number porting, a device change — about a subject, keyed by a shared `subjectRef`. **Emit the moment the call starts, not after it ends:** the signal is live for 5 minutes (see `activeWindowSeconds`), and only a payment made while it is live has its score raised. A signal that arrives after the call, once the payment is already through, is too late. You never send a phone number or a payment amount — only the consented, risk-relevant fields below.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TelecomRiskEvent' },
              example: {
                subjectRef: 'sbj_9f2c1a',
                recentSuspiciousCall: true,
                callDurationSeconds: 180,
                callerReputation: 'SUSPECT',
                deviceChange: true,
                severity: 'HIGH',
                activeWindowSeconds: 300,
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
      ProtectionSessionRequest: {
        type: 'object',
        required: ['subjectRef', 'amount'],
        description: 'The payment as the customer is about to confirm it. Risk-relevant fields only — never card or account numbers.',
        properties: {
          subjectRef: { type: 'string', description: 'Shared pseudonymous customer reference; the join with any telecom signal.', example: 'sbj_9f2c1a' },
          amount: { type: 'number', minimum: 0, example: 8400 },
          currency: { type: 'string', minLength: 3, maxLength: 3, default: 'GBP' },
          payeeLabel: { type: 'string', description: 'Display name only, so the warning can say who the money is going to.', example: 'J. Smith' },
          firstTimePayee: { type: 'boolean', default: false },
          payeeAgeDays: { type: 'integer', minimum: 0, default: 0 },
          paymentVelocity24h: { type: 'integer', minimum: 0, default: 0 },
          onPhoneCall: { type: 'boolean', default: false, description: 'The device reports an active call — the strongest live signal there is.' },
          callerUnknown: { type: 'boolean', default: false, description: 'That call is with a number not in the customer’s contacts.' },
          deviceChange: { type: 'boolean', default: false },
          previousWarnings: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      ProtectionSessionResponse: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          verdict: { type: 'string', enum: ['PROCEED', 'WARN', 'HOLD'], example: 'HOLD' },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          riskScore: { type: 'integer', minimum: 0, maximum: 100, description: 'Shown to the bank, never to the customer.' },
          display: { $ref: '#/components/schemas/CustomerDisplay' },
          questions: { type: 'array', items: { $ref: '#/components/schemas/PollQuestion' } },
          caseReference: { type: 'string', description: 'Short reference the customer can quote to the bank.', example: 'AC-02361' },
          correlationId: { type: 'string' },
        },
      },
      CustomerDisplay: {
        type: 'object',
        description: 'Everything the screen renders. Owned by the engine so the wording improves for every bank at once.',
        properties: {
          tone: { type: 'string', enum: ['INFO', 'CAUTION', 'STOP'], example: 'STOP' },
          headline: { type: 'string', example: 'Stop — this looks like a scam' },
          body: { type: 'string' },
          reasons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'RECENT_SUSPICIOUS_CALL' },
                title: { type: 'string', example: 'A suspicious call is happening right now' },
                detail: { type: 'string' },
              },
            },
          },
          continueLabel: { type: 'string', description: 'Absent when the advice is to hold — there is no “send anyway”.' },
          cancelLabel: { type: 'string', example: 'Cancel this payment' },
          footnote: { type: 'string' },
        },
      },
      PollQuestion: {
        type: 'object',
        description: 'A question chosen from the reasons that actually fired. At most three are ever returned.',
        properties: {
          id: { type: 'string', example: 'asked_to_pay' },
          prompt: { type: 'string', example: 'Did someone contact you and ask you to make this payment?' },
          helper: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } } },
          },
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
          callDurationSeconds: { type: 'integer', minimum: 0, maximum: 86400, default: 0, description: 'Call length so far, in seconds — send while the call is ongoing, not only its final length.', example: 180 },
          activeWindowSeconds: { type: 'integer', minimum: 30, maximum: 300, default: 300, description: 'How long this signal stays live for correlation. Capped at 5 minutes; a call is only useful while it overlaps the payment.', example: 300 },
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
