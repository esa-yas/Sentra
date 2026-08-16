# Partner request signing (Slice 4A)

Sentra authenticates bank and telecom machine clients with **asymmetric HTTP request
signing**. The partner keeps the private key. Sentra stores only the public JWK, an
Argon2id hash of a one-time client secret (reserved for later OAuth), and metadata.

OAuth2 client-credentials tokens remain in the ports for a later slice. They are **not**
the ingest authentication path in Slice 4A.

## Headers

| Header | Purpose |
| --- | --- |
| `x-sentra-timestamp` | UTC RFC 3339 timestamp ending in `Z` |
| `x-sentra-nonce` | Unique URL-safe nonce, 16–128 characters |
| `x-sentra-partner-id` | Partner connection id |
| `x-sentra-key-id` | Signing key id (`kid`) |
| `x-sentra-content-digest` | `sha-256=<base64url SHA-256 of the raw body>` |
| `x-sentra-signature` | Compact JWS (ES256) over the canonical string |
| `idempotency-key` | Required on write endpoints |
| `x-correlation-id` | Optional; Sentra generates one when absent |

GET requests still send a content digest: the SHA-256 of an **empty** body.

## Canonical string

UTF-8, LF-separated, **no trailing newline**:

```
sentra-signature-v1
{METHOD}
{canonicalPath}
{timestamp}
{nonce}
{contentDigest}
{partnerConnectionId}
{keyId}
```

- Method is upper-case.
- Path has no query or fragment, a single leading slash, and no trailing slash except `/`.
- The digest is computed over the **raw bytes** that will be sent. JSON key reordering or
  whitespace changes the digest and therefore the signature.

The JWS protected header is `{ "alg": "ES256", "kid": "<keyId>", "typ": "sentra-sig+v1" }`.
The JWS payload is the UTF-8 bytes of the canonical string (not JSON).

Allowed algorithms are pinned in `SIGNING_ALLOWED_ALGORITHMS` (default `ES256`). Sentra
rejects `none`, HMAC, RSA, unexpected algorithms, unknown/revoked/expired keys, invalid
signatures, and digest mismatches.

## Replay vs idempotency

These are separate controls.

1. **Replay protection** — Redis `SET NX` of `replay:{partnerId}:{keyId}:{nonce}` with TTL
   `SIGNING_REPLAY_WINDOW_SECONDS`. Redis unavailability **fails closed** on signed writes.
2. **HTTP idempotency** — PostgreSQL `idempotency_keys`, unique on
   `(organizationId, scope, key)`. Scope is `{METHOD} {path} {connectionId}`. The request
   hash is SHA-256 of the raw body.

## Scopes

| Scope | Who | Endpoint |
| --- | --- | --- |
| `risk-events:write` | Telecom | `POST /v1/risk-events` |
| `payment-intents:write` | Bank | `POST /v1/payment-intents` |
| `outcomes:write` | Bank | `POST /v1/outcomes` |
| `recommendations:read` | Bank | `GET /v1/recommendations/:id` |
| `cases:read` | Bank | `GET /v1/cases/:id` |

A telecom credential cannot submit bank outcomes. A bank credential cannot impersonate a
telecom. Every query remains organization-scoped.

The development simulator (`POST /api/simulator/evaluate`) is **not** a partner path.

## Credential administration

`POST /v1/organizations/:organizationId/partner-connections` issues a sandbox connection
and shows the client secret plus private JWK **once**.

This endpoint requires the isolated bootstrap:

```
PARTNER_BOOTSTRAP_ENABLED=true
PARTNER_BOOTSTRAP_TOKEN=<random>
x-sentra-bootstrap-token: <same value>
```

Production **refuses to boot** if bootstrap is enabled. Slice 4B replaces bootstrap with
authenticated human administrators. PRODUCTION environment issuance is refused in 4A.

Development console actions live under `/api/operations/partners/*` and are also refused
in production.

## Local signing CLI

```bash
pnpm partner:sign --key ./private.jwk.json --method POST --path /v1/risk-events \
  --partner-id <id> --key-id <kid> --body ./body.json
```

The CLI never talks to production key material from the browser.

## Frozen test vector

`SIGNING_TEST_VECTOR` in `@sentra/contracts` is a synthetic ES256 key and a known-good
signature for `POST /v1/risk-events`. Reproduce it with the CLI or the Node.js example on
the Partner Integration screen.

## Audit policy

Unauthenticated garbage is written only to `partner_api_requests` (the API Activity
read model). It is **not** appended to the canonical hash-chained audit log.

Authenticated actions — connection create, key rotation, revocation, successful ingest —
are recorded on the canonical audit chain.
