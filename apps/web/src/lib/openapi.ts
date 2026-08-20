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

## Quickstart

1. **Create an account.** Sign up at the [console](/signup). Your organization starts in **sandbox**.
2. **Grab a sandbox key.** In **API Keys**, create a key pair. You get a **publishable key**
   (\`pk_test_…\`) and a **secret key** (\`sk_test_…\`). The secret is shown once — store it in a
   secret manager.
3. **Make your first call.** Evaluate a payment (see *Evaluate a payment* below). Sandbox runs
   against **synthetic data on an isolated network** — it never touches the live decision network.
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
    { url: 'https://sandbox.api.sentra.example', description: 'Sandbox — synthetic data, isolated network' },
    { url: 'https://api.sentra.example', description: 'Production — live network (requires approval)' },
  ],
  security: [{ secretKey: [] }],
  tags: [
    { name: 'Payments', description: 'Submit a payment for real-time scam-risk evaluation.' },
    { name: 'Risk signals', description: 'Submit scam-risk signals (e.g. suspicious-call indicators from a telecom).' },
    { name: 'Recommendations', description: 'Retrieve the explainable recommendation for a decision.' },
    { name: 'Cases', description: 'Retrieve a correlation case — the joined view across signals.' },
    { name: 'Webhooks', description: 'Receive outcome and case updates as they happen.' },
  ],
  paths: {
    '/v1/payment-intents': {
      post: {
        tags: ['Payments'],
        summary: 'Evaluate a payment',
        operationId: 'evaluatePaymentIntent',
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
        tags: ['Risk signals'],
        summary: 'Submit a risk signal',
        operationId: 'submitRiskEvent',
        description:
          'Submit a scam-risk signal — for example, a telecom reporting a prolonged suspicious call to a subject. Signals are correlated with payment intents to raise or lower risk. Telecom signals must be signed; see *Authentication*.',
        parameters: [
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RiskEvent' },
              example: {
                subjectRef: 'sbj_9f2c1a',
                signal: 'SUSPICIOUS_CALL',
                callerReputation: 'KNOWN_BAD',
                callDurationSeconds: 900,
                observedAt: '2026-08-20T18:40:00.000Z',
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Accepted for correlation.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Accepted' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/recommendations/{id}': {
      get: {
        tags: ['Recommendations'],
        summary: 'Get a recommendation',
        operationId: 'getRecommendation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'dec_7b1f…' }],
        responses: {
          '200': { description: 'The recommendation.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Recommendation' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/cases/{id}': {
      get: {
        tags: ['Cases'],
        summary: 'Get a case',
        operationId: 'getCase',
        description: 'A correlation case is the joined view of the signals and the payment behind one decision.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'case_3a9c…' }],
        responses: {
          '200': { description: 'The case.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Case' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/webhooks': {
      post: {
        tags: ['Webhooks'],
        summary: 'Webhook event (your endpoint)',
        operationId: 'receiveWebhook',
        description:
          'Sentra POSTs events to the HTTPS endpoint you configure in the console. Each request is signed with an HMAC in the `Sentra-Signature` header — verify it before trusting the payload. Respond `2xx` within 5s; we retry with exponential backoff. Subscribe to `recommendation.issued`, `case.updated`, and `outcome.recorded`.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookEvent' } } },
        },
        responses: { '200': { description: 'Acknowledged.' } },
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
