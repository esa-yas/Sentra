---
marp: true
theme: default
paginate: true
size: 16:9
title: Real-Time Scam Prevention Network — Founder-Aligned Architecture
description: Supabase and Railway MVP using Node.js, Express.js, TypeScript, PostgreSQL, Prisma, Redis, BullMQ, Gemini API, and a GCP-friendly migration path
style: |
  section {
    background: #ffffff;
    color: #111318;
    font-family: "Google Sans", "Aptos", Arial, sans-serif;
    padding: 46px 62px;
    font-size: 20px;
  }
  h1 { color: #111318; font-size: 38px; border-left: 6px solid #3d8dff; padding-left: 18px; }
  h2 { color: #245c9e; font-size: 23px; margin-top: 16px; }
  h3 { color: #157a53; font-size: 18px; margin-top: 12px; }
  strong { color: #111318; }
  code { background: #eef3f8; color: #111318; }
  pre { background: #f7f9fb; border: 1px solid #c8cdd5; border-radius: 10px; }
  table { font-size: 14px; }
  th { background: #eaf3ff; color: #245c9e; }
  td { background: #ffffff; }
  a { color: #245c9e; }
---

> **Current implementation baseline:** Next.js + React + TypeScript; Node.js + Express.js + TypeScript; PostgreSQL on Supabase through Prisma; Redis + BullMQ; Gemini API; Supabase Storage; Docker on Railway; Sentry; GitHub Actions.  
> **Later GCP adapters:** Cloud Run, Cloud SQL for PostgreSQL, Pub/Sub, Cloud Storage, Vertex AI, Cloud Monitoring/Logging, and Terraform.  
> The MVP is one modular monolith. Banks retain final decision authority.

---

# 001 — The Real-Time Scam Prevention Network

## Explanation

Banks see payments. Telecoms see communication. We correlate consented risk signals before money leaves.

## Diagram

~~~mermaid
flowchart LR
  A[Customer protection] --> B[Explainable recommendation]
~~~

### Best practices

- Keep the product promise clearer than the technology.

### Security notes

- Customers opt in and banks retain final authority.

### Possible future improvements

- Add capabilities only after partner evidence justifies them.

<!-- Sources: Internal product and architecture decisions -->

---

# 002 — The gap no participant can close alone

## Explanation

The product is a coordination layer—not another bank fraud model and not a telecom surveillance tool.

- Telecoms see scam-persuasion signals
- Banks see payment intent and account context
- The network joins only the minimum permitted evidence

## Diagram

~~~mermaid
flowchart LR
  N0["Telecom signal"]
  N1["Consent gate"]
  N2["Risk network"]
  N3["Bank decision"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Keep systems of record with each participant.

### Security notes

- Use opaque, pairwise customer references.

### Possible future improvements

- Add more participants without centralizing raw data.

<!-- Sources: Internal product and architecture decisions -->

---

# 003 — A scam looks harmless in isolated systems

## Explanation

Social engineering converts trust into an authorized payment; every local system sees only a fragment.

- A convincing call creates urgency
- The customer initiates a legitimate payment
- Post-payment recovery is slow and uncertain

## Diagram

~~~mermaid
flowchart LR
  N0["Trusted-looking call"]
  N1["Urgency"]
  N2["New payee"]
  N3["Authorization"]
  N4["Loss"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Design around the complete customer journey.

### Security notes

- Do not infer guilt from one weak signal.

### Possible future improvements

- Model multi-channel journeys such as SMS + call + web.

<!-- Sources: Internal product and architecture decisions -->

---

# 004 — The missing capability is timely coordination

## Explanation

Neither party must expose its full dataset to contribute useful, time-bound intelligence.

- Communication context is absent at the bank
- Payment context is absent at the telecom
- A shared risk envelope bridges the moment

## Diagram

~~~mermaid
flowchart LR
  N0["TELECOM<br/>Persuasion evidence"]
  N1["NETWORK<br/>Short-lived correlation"]
  N2["BANK<br/>Payment evidence"]
  N0 --> N1
  N1 --> N2
~~~

### Best practices

- Share evidence derivatives, not source records.

### Security notes

- Enforce purpose and expiry on every event.

### Possible future improvements

- Confidential-computing correlation for sensitive lanes.

<!-- Sources: Internal product and architecture decisions -->

---

# 005 — The intervention window is before authorization

## Explanation

Payment intent is the precise moment when a calm, specific intervention can change the outcome.

- Early warnings lack context
- At intent time, payee and amount are known
- After settlement, prevention becomes recovery

## Diagram

~~~mermaid
flowchart LR
  N0["Contact"]
  N1["Persuasion"]
  N2["Payment intent"]
  N3["Authorization"]
  N4["Settlement"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Keep the synchronous decision path under a strict deadline.

### Security notes

- Return fail-neutral on timeout.

### Possible future improvements

- Pre-authorize safe verification with trusted contacts.

<!-- Sources: Internal product and architecture decisions -->

---

# 006 — One network addresses many scam journeys

## Explanation

The same consent, correlation, policy, and outcome loop supports multiple social-engineering patterns.

- APP and impersonation scams
- Investment, romance, and recovery scams
- Invoice redirection and account takeover

## Diagram

~~~mermaid
flowchart TB
  H["Invoice"]
  N0["Impersonation"] --> H
  N1["Investment"] --> H
  N2["Romance"] --> H
  N3["Recovery"] --> H
  N4["APP fraud"] --> H
~~~

### Best practices

- Use a shared platform with scam-specific policies.

### Security notes

- Separate suspected from confirmed fraud.

### Possible future improvements

- Add marketplace and crypto off-ramp signals.

<!-- Sources: Internal product and architecture decisions -->

---

# 007 — Loss is large; collaboration is already validated

## Explanation

The opportunity is not theoretical: consumers lose billions, while industry programs already prove cross-sector signals can work.

- FTC reported $15.9B in U.S. fraud losses for 2025
- GSMA Scam Signal is live across major U.K. networks
- The startup opportunity is the neutral, bank-grade network layer

## Diagram

~~~mermaid
flowchart LR
  N0["$15.9B: U.S. fraud losses reported for 2025"]
  N1["85%: U.K. mobile coverage cited by GSMA"]
  N2["<1 s: target synchronous response envelope"]
  N0 --> N1
  N1 --> N2
~~~

### Best practices

- Sell measurable prevented loss, not model accuracy alone.

### Security notes

- Pilot metrics must include false positives and complaints.

### Possible future improvements

- Create country-specific economic and policy models.

<!-- Sources: See PowerPoint speaker notes; source keys: ftc, gsma -->

---

# 008 — Every participant gains without losing control

## Explanation

The network compounds value while each participant retains authority over its customer, systems, and decisions.

- Banks reduce preventable fraud loss
- Telecoms disrupt campaigns earlier
- Customers receive help at the moment of risk

## Diagram

~~~mermaid
flowchart TB
  H["Customer trust ↑"]
  N0["Bank loss ↓"] --> H
  N1["Telecom abuse ↓"] --> H
  N2["Campaign insight ↑"] --> H
~~~

### Best practices

- Define a value scorecard per participant.

### Security notes

- Never expose one tenant’s raw evidence to another.

### Possible future improvements

- Revenue share tied to validated prevented loss.

<!-- Sources: Internal product and architecture decisions -->

---

# 009 — Success balances safety, speed, and trust

## Explanation

A successful product prevents loss without making ordinary payments frustrating or opaque.

- Prevented or interrupted scam loss
- Intervention acceptance and added latency
- False positives, opt-outs, appeals, and complaints

## Diagram

~~~mermaid
flowchart LR
  N0["Protection"]
  N1["Experience"]
  N2["Trust"]
  N3["Cost"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Publish a pilot scorecard before launch.

### Security notes

- Alert on disparate impact and intervention spikes.

### Possible future improvements

- Optimize policy per customer risk tolerance.

<!-- Sources: Internal product and architecture decisions -->

---

# 010 — Privacy is a product boundary

## Explanation

The network is useful because it minimizes data—not because it collects every conversation.

- Explicit, granular, reversible opt-in
- Metadata and campaign intelligence first
- Bank retains the final payment decision

## Diagram

~~~mermaid
flowchart LR
  N0["DO<br/>Derived risk signals<br/>Purpose + expiry<br/>Explainable advice"]
  N1["DO NOT<br/>Routine call recording<br/>Universal identity graph<br/>Autonomous blocking"]
  N0 --> N1
~~~

### Best practices

- Make minimization visible in the product.

### Security notes

- Audio requires separate lawful authority and consent.

### Possible future improvements

- Add privacy-preserving aggregation and secure enclaves.

<!-- Sources: See PowerPoint speaker notes; source keys: gdpr -->

---

# 011 — Consent is granular, visible, and reversible

## Explanation

Customers choose which protections apply; consent is a versioned business object, not a hidden checkbox.

- Scope signal types and purpose
- Record policy version, jurisdiction, and expiry
- Revocation stops future processing quickly

## Diagram

~~~mermaid
flowchart LR
  N0["Explain"]
  N1["Opt in"]
  N2["Use"]
  N3["Review"]
  N4["Revoke"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Model consent as an aggregate with history.

### Security notes

- Reject processing when consent is stale or ambiguous.

### Possible future improvements

- Offer consent receipts across bank and telecom apps.

<!-- Sources: See PowerPoint speaker notes; source keys: gdpr -->

---

# 012 — Telecoms can signal risk without conversations

## Explanation

Most pilot value can come from reputation, campaign, and device metadata before any content analysis is considered.

- Number reputation and campaign velocity
- SIM, routing, and call-pattern anomalies
- Optional content analysis only under separate controls

## Diagram

~~~mermaid
flowchart LR
  N0["Optional consented content"]
  N1["Call pattern + routing"]
  N2["SIM + device events"]
  N3["Campaign + number reputation"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Start with the least intrusive feature family.

### Security notes

- Do not create voiceprints by default.

### Possible future improvements

- Federated models trained inside telecom boundaries.

<!-- Sources: Internal product and architecture decisions -->

---

# 013 — Every telecom event is purpose-bound

## Explanation

A signed event carries evidence, confidence, provenance, consent reference, and expiry—without carrying a conversation.

- Opaque subject reference
- Typed indicators with freshness
- Schema version and integrity signature

## Diagram

~~~yaml
type: scam.risk.v1
subject_ref: pairwise_…
risk: 0.81 | confidence: 0.74
indicators: [campaign_velocity, sim_change]
purpose: payment_protection
expires_at: 2026-08-07T…Z
signature: JWS(…)
~~~

### Best practices

- Use CloudEvents plus versioned JSON Schema.

### Security notes

- Verify signature, replay window, and tenant before ingest.

### Possible future improvements

- Add selective disclosure for indicator fields.

<!-- Sources: Internal product and architecture decisions -->

---

# 014 — A signal opens a short-lived protection window

## Explanation

The platform accepts a telecom event only if consent, purpose, freshness, and integrity all pass.

- Validate and normalize the envelope
- Create an expiring protection session
- Wait for a matching bank payment intent

## Diagram

~~~mermaid
flowchart LR
  N0["Telecom"]
  N1["Gateway"]
  N2["Consent"]
  N3["Correlation"]
  N4["Risk cache"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Make protection sessions short-lived and idempotent.

### Security notes

- Quarantine malformed, duplicate, or stale events.

### Possible future improvements

- Dynamically tune windows by campaign behavior.

<!-- Sources: Internal product and architecture decisions -->

---

# 015 — The bank sends intent before it sends money

## Explanation

The platform evaluates a tokenized payment proposal; it does not need payment credentials or authority to move funds.

- Pairwise payer and payee references
- Amount, channel, device, and behavioral context
- Idempotency key plus strict response deadline

## Diagram

~~~mermaid
flowchart LR
  N0["New payee"]
  N1["Risk check"]
  N2["Bank action"]
  N0 --> N1
  N1 --> N2
~~~

### Best practices

- Call the service at payment-intent creation.

### Security notes

- Exclude PAN, CVV, credentials, and raw account numbers.

### Possible future improvements

- Support real-time payment rails and open banking APIs.

<!-- Sources: Internal product and architecture decisions -->

---

# 016 — Correlation avoids a universal identity graph

## Explanation

Deterministic matching serves opted-in customers; campaign intelligence uses privacy-preserving linkage and explicit uncertainty.

- Pairwise identifiers per relationship
- Time-window and campaign linkage
- Uncertain joins never masquerade as facts

## Diagram

~~~mermaid
flowchart TB
  H["Protection session"]
  N0["Bank token"] --> H
  N1["Consent link"] --> H
  N2["Telecom token"] --> H
  N3["Campaign node"] --> H
~~~

### Best practices

- Separate identity matching from campaign graph logic.

### Security notes

- Prevent cross-tenant correlation queries.

### Possible future improvements

- Private-set intersection for eligible use cases.

<!-- Sources: Internal product and architecture decisions -->

---

# 017 — Interventions rise with confidence and impact

## Explanation

Policy selects the least disruptive action that matches risk, uncertainty, amount, and customer context.

- Allow or contextual warning
- Confirmation, delay, callback, or analyst review
- Emergency-block recommendation only at the highest tier

## Diagram

~~~mermaid
flowchart LR
  N0["Allow"]
  N1["Warn"]
  N2["Confirm"]
  N3["Delay / callback"]
  N4["Review / block advice"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Prefer the smallest effective intervention.

### Security notes

- High uncertainty should route to review, not certainty theater.

### Possible future improvements

- Personalize interventions using measured outcomes.

<!-- Sources: Internal product and architecture decisions -->

---

# 018 — The bank always owns the final decision

## Explanation

The platform returns advice with evidence; bank policy and bank systems choose whether and how to act.

- Recommendation is explainable and versioned
- Bank can override, ignore, or escalate
- Outcome records what actually happened

## Diagram

~~~mermaid
flowchart TB
  H["Delay"]
  N0["Allow"] --> H
  N1["Warn"] --> H
  N2["Callback"] --> H
  N3["Review"] --> H
~~~

### Best practices

- Contractually define advisory authority.

### Security notes

- Never expose a payment-execution credential to the platform.

### Possible future improvements

- Policy simulation before every production change.

<!-- Sources: Internal product and architecture decisions -->

---

# 019 — Customer guidance must be calm and specific

## Explanation

A good intervention describes suspicious behavior, offers a safe next step, and preserves access to help and appeal.

- Avoid shaming or panic language
- Explain the strongest reason in plain words
- Offer trusted callback and cancel options

## Diagram

~~~mermaid
flowchart LR
  N0["Why we paused"]
  N1["Verify safely"]
  N2["Choose next step"]
  N0 --> N1
  N1 --> N2
~~~

### Best practices

- Test warnings with real users before launch.

### Security notes

- Do not reveal detection logic scammers can exploit.

### Possible future improvements

- Localize language and accessibility patterns.

<!-- Sources: Internal product and architecture decisions -->

---

# 020 — Outcomes turn interventions into learning

## Explanation

Bank actions, customer choices, later fraud confirmation, and analyst adjudication become governed learning signals.

- Capture action and override reason
- Distinguish suspected from confirmed outcomes
- Retraining never changes policy automatically

## Diagram

~~~mermaid
flowchart LR
  N0["Recommend"]
  N1["Intervene"]
  N2["Observe"]
  N3["Adjudicate"]
  N4["Learn"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Version labels and their provenance.

### Security notes

- Account for intervention bias and delayed truth.

### Possible future improvements

- Causal evaluation of which intervention prevented loss.

<!-- Sources: Internal product and architecture decisions -->

---

# 021 — The bank console makes decisions auditable

## Explanation

Operations teams see one traceable decision timeline, the reasons behind it, and every policy or human override.

- Evidence freshness and reason codes
- Recommendation, bank action, and outcome
- Policy simulation and override history

## Diagram

~~~mermaid
flowchart LR
  N0["Decision timeline"]
  N1["Risk reasons"]
  N2["Policy action"]
  N3["Outcome"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Design for an investigator’s five-minute review.

### Security notes

- Mask identifiers and require case-bound access.

### Possible future improvements

- Counterfactual policy simulation at portfolio scale.

<!-- Sources: Internal product and architecture decisions -->

---

# 022 — The telecom console reveals campaigns

## Explanation

Telecom teams see campaign clusters, number reputation, and signal quality—not individual bank payments.

- Campaign graph and velocity
- Delivery health and event quality
- Actions to disrupt numbers or routes

## Diagram

~~~mermaid
flowchart LR
  N0["Campaign map"]
  N1["Numbers"]
  N2["Signal quality"]
  N3["Disruption"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Keep telecom views campaign-centric.

### Security notes

- No bank payment details cross the lane.

### Possible future improvements

- Share signed campaign indicators across operators.

<!-- Sources: Internal product and architecture decisions -->

---

# 023 — SOC and administration stay separate

## Explanation

Security operations watches attacks and service health; administration manages tenants, policies, and controlled configuration.

- SOC: threats, anomalies, and incidents
- Admin: tenants, roles, policy versions
- Sensitive operations require dual control

## Diagram

~~~mermaid
flowchart LR
  N0["SOC<br/>Threats<br/>Incidents<br/>Service health"]
  N1["ADMIN<br/>Tenants<br/>Policies<br/>Approvals"]
  N0 --> N1
~~~

### Best practices

- Separate duties in both UI and IAM.

### Security notes

- Require step-up authentication for privileged changes.

### Possible future improvements

- Just-in-time access with session recording.

<!-- Sources: Internal product and architecture decisions -->

---

# 024 — The payment path stays short

## Explanation

Validation, correlation, scoring, and recommendation are synchronous; analytics, training, and reporting stay off-path.

- One trace ID across all stages
- Fixed per-stage latency budgets
- Asynchronous work cannot delay payment

## Diagram

~~~mermaid
flowchart LR
  N0["Bank"]
  N1["Gateway"]
  N2["Correlation"]
  N3["Risk"]
  N4["Policy"]
  N5["Bank"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Budget latency by stage, not only end-to-end.

### Security notes

- Signed unavailable responses are safer than ambiguous timeouts.

### Possible future improvements

- Regional decision cells close to payment rails.

<!-- Sources: Internal product and architecture decisions -->

---

# 025 — The platform is a coordination plane

## Explanation

Banks and telecoms keep their systems of record; the platform stores only protection sessions, evidence derivatives, decisions, and outcomes.

- Partner systems remain authoritative
- Owned APIs isolate the platform
- Analytics consumes minimized derived events

## Diagram

~~~mermaid
flowchart LR
  N0["Partner channels + systems of record"]
  N1["Owned API + decision plane"]
  N2["Protection data + event plane"]
  N3["Governed analytics + AI"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Declare system-of-record ownership per aggregate.

### Security notes

- Block direct partner access to internal stores.

### Possible future improvements

- Confidential regional cells for sovereign markets.

<!-- Sources: Internal product and architecture decisions -->

---

# 026 — Modules enforce ownership inside one application

## Explanation

A modular monolith keeps deployment simple while TypeScript module boundaries make ownership, privacy, and testing explicit.

- One Express process and one repository
- Modules own consent, integration, risk, and decisions
- Modules communicate through typed application interfaces

## Diagram

~~~mermaid
flowchart TB
  H["Decisioning"]
  N0["Consent"] --> H
  N1["Integration"] --> H
  N2["Risk"] --> H
  N3["Cases"] --> H
  N4["Intelligence"] --> H
  N5["Governance"] --> H
~~~

### Best practices

- Align module boundaries with business invariants.

### Security notes

- Authorize every module entry point.

### Possible future improvements

- Split a module only when measured scale demands it.

<!-- Sources: Internal product and architecture decisions -->

---

# 027 — Core aggregates own business invariants

## Explanation

ProtectionSession, PaymentIntent, Recommendation, and Outcome form the traceable core of one decision.

- Aggregate state changes are explicit
- Versions bind evidence, model, rule, and policy
- No module writes another module’s tables directly

## Diagram

~~~mermaid
flowchart TB
  H["Recommendation"]
  N0["ProtectionSession"] --> H
  N1["PaymentIntent"] --> H
  N2["Outcome"] --> H
  N3["ConsentReceipt"] --> H
~~~

### Best practices

- Keep aggregates small and transactionally coherent.

### Security notes

- Record who or what caused every transition.

### Possible future improvements

- Event-sourced audit projections where justified.

<!-- Sources: Internal product and architecture decisions -->

---

# 028 — Decisioning is isolated from analytics

## Explanation

A reporting outage must never block a payment recommendation.

- Synchronous lane: request to response
- Asynchronous lane: events, outcomes, learning
- Derived dashboards can be rebuilt

## Diagram

~~~mermaid
flowchart LR
  N0["SYNC LANE<br/>Express → Correlate → Score → Policy"]
  N1["ASYNC LANE<br/>Outbox → BullMQ → Analytics → Training"]
  N0 --> N1
~~~

### Best practices

- Give each lane independent SLOs.

### Security notes

- Do not let BI credentials reach transactional stores.

### Possible future improvements

- Separate regional analytics pipelines by residency.

<!-- Sources: Internal product and architecture decisions -->

---

# 029 — Five trust zones limit blast radius

## Explanation

Partner edge, decision plane, data plane, AI plane, and administration use separate identities and explicit crossings.

- No implicit trust from network location
- One application identity per environment
- Purpose-aware authorization at every boundary

## Diagram

~~~mermaid
flowchart LR
  N0["Administration"]
  N1["AI + analytics"]
  N2["Data plane"]
  N3["Decision plane"]
  N4["Partner edge"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Document allowed flows as architecture policy.

### Security notes

- Deny cross-zone access by default.

### Possible future improvements

- Continuous authorization from device and workload posture.

<!-- Sources: See PowerPoint speaker notes; source keys: nistZt -->

---

# 030 — Partners integrate through stable contracts

## Explanation

Bank and telecom integrations terminate at a company-owned Express API; Supabase, Railway, and GCP remain implementation details.

- REST/JSON with OpenAPI for every partner
- One Express application keeps calls in-process
- OAuth2, signed JWTs, mTLS, and idempotency

## Diagram

~~~mermaid
flowchart LR
  N0["Partner"]
  N1["mTLS edge"]
  N2["OpenAPI"]
  N3["Express API"]
  N4["Adapter"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Generate TypeScript SDKs and contract tests from OpenAPI.

### Security notes

- Bind client identity, tenant, purpose, and replay window.

### Possible future improvements

- Move the same Express container behind GCP networking.

<!-- Sources: See PowerPoint speaker notes; source keys: mtls -->

---

# 031 — PaymentIntent contains only required evidence

## Explanation

The request is deliberately narrow so the network can recommend an intervention without becoming a payment processor.

- Opaque customer, account, and payee references
- Amount, currency, channel, and device context
- Deadline, idempotency key, and schema version

## Diagram

~~~yaml
POST /v1/payment-intents
intent_id: 01J…
payer_ref: bank_pairwise_…
payee_ref: beneficiary_token_…
amount: 2500.00 USD
channel: mobile | device_risk: elevated
deadline_ms: 650 | idempotency_key: …
~~~

### Best practices

- Treat schemas as long-lived public products.

### Security notes

- Never accept PAN, CVV, or bank login secrets.

### Possible future improvements

- Add rail-specific extensions without breaking v1.

<!-- Sources: Internal product and architecture decisions -->

---

# 032 — ScamRiskEvent carries evidence, not content

## Explanation

Typed indicators make telecom evidence useful, explainable, expiring, and safe to correlate.

- Risk type, confidence, provenance, and observed time
- Consent and purpose references
- JWS signature and schema version

## Diagram

~~~yaml
event_type: scam.risk.v1
event_id: 01J… | tenant: telco_a
subject_ref: telco_pairwise_…
indicator: campaign_velocity
observed_at: … | ttl_seconds: 900
consent_ref: consent_… | purpose: protect_payment
signature: detached_JWS
~~~

### Best practices

- Make every indicator independently explainable.

### Security notes

- Expire evidence automatically after its utility window.

### Possible future improvements

- Support portable verifiable credentials for provenance.

<!-- Sources: Internal product and architecture decisions -->

---

# 033 — Recommendation and Outcome close the trace

## Explanation

One decision ID links advice, reasons, bank action, override, and later truth without losing versions.

- Recommendation: action, reasons, uncertainty
- Outcome: bank action, customer choice, fraud status
- Versions: model, features, rules, and policy

## Diagram

~~~mermaid
flowchart LR
  N0["RECOMMENDATION<br/>WARN<br/>3 reason codes<br/>uncertainty 0.18"]
  N1["OUTCOME<br/>CALLBACK<br/>customer cancelled<br/>confirmed scam"]
  N0 --> N1
~~~

### Best practices

- Make every decision reproducible from its versions.

### Security notes

- Outcomes are append-only corrections, not silent rewrites.

### Possible future improvements

- Cryptographic decision receipts for partner disputes.

<!-- Sources: Internal product and architecture decisions -->

---

# 034 — The outbox prevents silent event loss

## Explanation

Business state and its outbox record commit together; publishing and consumption are retried and deduplicated.

- One database transaction
- At-least-once publish with idempotent consumers
- Replay from durable event history

## Diagram

~~~mermaid
flowchart LR
  N0["Domain write"]
  N1["Outbox row"]
  N2["Publisher"]
  N3["Event bus"]
  N4["Consumer inbox"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Assume duplicates and design for replay.

### Security notes

- Sign partner-bound events and validate schemas.

### Possible future improvements

- CDC publisher after event volume warrants it.

<!-- Sources: Internal product and architecture decisions -->

---

# 035 — Failure behavior is designed first

## Explanation

The platform never leaves a bank guessing whether a payment was assessed.

- Timeout returns signed unavailable
- Bank falls back to existing controls
- Bad events are quarantined without blocking valid traffic

## Diagram

~~~mermaid
flowchart TB
  H["Stale → ignore"]
  N0["Valid → advise"] --> H
  N1["Timeout → unavailable"] --> H
  N2["Duplicate → replay"] --> H
  N3["Malformed → quarantine"] --> H
~~~

### Best practices

- Test degraded behavior with the bank before pilot.

### Security notes

- Fail neutral; never silently allow or block.

### Possible future improvements

- Partner-specific fallback playbooks by risk tier.

<!-- Sources: Internal product and architecture decisions -->

---

# 036 — Supabase accelerates—without defining us

## Explanation

Supabase and Railway shorten the pilot; a TypeScript modular monolith owns the product logic and keeps provider integrations replaceable.

- Fast delivery with one familiar language
- Supabase and Railway sit behind adapters
- Partners never integrate with generated database APIs

## Diagram

~~~mermaid
flowchart LR
  N0["SPEED<br/>Supabase + Railway"]
  N1["PORTABILITY<br/>TypeScript application core"]
  N0 --> N1
~~~

### Best practices

- Choose managed services for acceleration, not architecture ownership.

### Security notes

- Use tokenized data and bounded pilot authority.

### Possible future improvements

- Replace adapters capability by capability.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseArch -->

---

# 037 — The MVP is one TypeScript modular monolith

## Explanation

Next.js and partner clients call one Node.js + Express.js API on Railway; only backend adapters call Supabase, Redis, Gemini, and Storage.

- TypeScript modules share one deployable application
- Prisma accesses PostgreSQL as the single writer
- Redis + BullMQ handle background jobs

## Diagram

~~~mermaid
flowchart TB
  H["Express API"]
  N0["Next.js + React"] --> H
  N1["Bank / telecom"] --> H
  N2["Supabase + Prisma"] --> H
  N3["Gemini API"] --> H
  N4["Redis + BullMQ"] --> H
~~~

### Best practices

- Keep provider SDKs inside infrastructure adapters.

### Security notes

- Never expose service-role keys to browsers.

### Possible future improvements

- Move the same Docker container from Railway to Cloud Run.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseArch -->

---

# 038 — Every MVP service has a simple GCP destination

## Explanation

Migration is explicit from the first architecture review; each managed dependency sits behind a small TypeScript interface.

- Railway → Cloud Run; PostgreSQL → Cloud SQL
- Supabase Storage → Cloud Storage
- BullMQ → Pub/Sub; Gemini API → Vertex AI

## Diagram

~~~mermaid
flowchart LR
  N0["Railway + Docker → Google Cloud Run"]
  N1["Supabase PostgreSQL → Cloud SQL PostgreSQL"]
  N2["Redis + BullMQ → Google Cloud Pub/Sub"]
  N3["Supabase Storage → Google Cloud Storage"]
  N4["Gemini API → Vertex AI"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Name each provider adapter in the codebase today.

### Security notes

- Do not copy provider-specific identities into domain IDs.

### Possible future improvements

- Migrate one dependency only when scale or contracts require it.

<!-- Sources: See PowerPoint speaker notes; source keys: cloudSql, storage, cloudRun, pubsub -->

---

# 039 — Postgres is the pilot source of truth

## Explanation

A compact PostgreSQL model accessed through Prisma keeps decisions consistent, typed, queryable, and migratable.

- Prisma schema is the application data contract
- Tenant, consent, session, signal, intent, and outcome
- Stable IDs plus explicit retention metadata

## Diagram

~~~mermaid
flowchart LR
  N0["tenant"]
  N1["consent"]
  N2["protection_session"]
  N3["scam_signal"]
  N4["payment_intent"]
  N5["recommendation"]
  N6["outcome"]
  N7["outbox"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
  N5 --> N6
  N6 --> N7
~~~

### Best practices

- Use Prisma migrations and standard PostgreSQL features.

### Security notes

- No cross-tenant foreign-key shortcuts or shared secrets.

### Possible future improvements

- Move the same schema to Cloud SQL PostgreSQL.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseArch -->

---

# 040 — Tenant isolation is defense in depth

## Explanation

Application authorization and RLS work together; regulated pilots prefer dedicated projects or stronger tenancy boundaries.

- Default-deny row-level policies
- Backend authorization remains authoritative
- Dedicated projects for sensitive pilots where practical

## Diagram

~~~mermaid
flowchart LR
  N0["Dedicated environment / project"]
  N1["Express authorization middleware"]
  N2["Postgres RLS"]
  N3["Tenant-scoped audit records"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Test RLS and backend policy independently.

### Security notes

- Never treat RLS as the only bank-grade control.

### Possible future improvements

- Cell-per-tenant for the highest-residency tier.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseRls, supabaseSecurity -->

---

# 041 — Customer identity remains with the bank

## Explanation

Supabase Auth serves the Next.js customer and operations portals; partner trust uses OIDC, service identity, and pairwise links.

- App-owned principal ID
- identity_link stores issuer + subject
- Bank and telecom machines never share customer passwords

## Diagram

~~~mermaid
flowchart LR
  N0["Bank IdP"]
  N1["OIDC / JWT"]
  N2["Identity adapter"]
  N3["Principal"]
  N4["Pairwise subject"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Verify Supabase JWTs in Express middleware.

### Security notes

- MFA and step-up for privileged platform users.

### Possible future improvements

- Add bank SSO/OIDC behind the same identity interface.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseAuth -->

---

# 042 — Storage is purpose-limited and deletion-aware

## Explanation

Objects use canonical IDs, checksums, classifications, and expiry—not vendor URLs.

- Redacted temporary evidence only
- Raw audio excluded by default
- Database backups do not include Storage object bytes

## Diagram

~~~mermaid
flowchart LR
  N0["Upload"]
  N1["Scan + redact"]
  N2["Classify"]
  N3["Short retention"]
  N4["Delete + prove"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Store object keys and hashes in the domain record.

### Security notes

- Use separate buckets and access policy by purpose.

### Possible future improvements

- Cloud Storage retention locks for regulated evidence.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseStorage, supabaseBackups, storage -->

---

# 043 — Realtime is for screens, not workflows

## Explanation

Supabase Realtime refreshes dashboards; authoritative business events come from committed state and the outbox.

- Dashboard updates are disposable projections
- Payment decisions never depend on a browser subscription
- Durable events are replayable and idempotent

## Diagram

~~~mermaid
flowchart LR
  N0["REALTIME<br/>UI refresh<br/>Presence<br/>Case updates"]
  N1["DURABLE EVENT BUS<br/>Outbox<br/>Replay<br/>Partner outcomes"]
  N0 --> N1
~~~

### Best practices

- Persist first, notify second.

### Security notes

- Do not use Realtime as an audit log.

### Possible future improvements

- Publish committed events through Pub/Sub after migration.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseRealtime, pubsub -->

---

# 044 — Express owns APIs and webhooks

## Explanation

One Express application owns REST APIs and partner webhooks; background work moves to BullMQ workers without splitting the application.

- Routes call application modules, not Supabase directly
- Strict timeout and idempotency
- One Docker image for API and worker processes

## Diagram

~~~mermaid
flowchart LR
  N0["EXPRESS API<br/>REST + webhooks<br/>Synchronous path"]
  N1["BULLMQ WORKER<br/>Retries + schedules<br/>Background jobs"]
  N0 --> N1
~~~

### Best practices

- Keep route handlers thin and modules testable.

### Security notes

- Validate every webhook signature and idempotency key.

### Possible future improvements

- Run the same Docker image on Cloud Run.

<!-- Sources: See PowerPoint speaker notes; source keys: cloudRun -->

---

# 045 — Redis and BullMQ handle MVP background work

## Explanation

BullMQ gives the TypeScript application retries, delayed jobs, rate limits, and repeatable schedules without another backend framework.

- Redis stores queue state, not business truth
- Jobs are idempotent and retry-safe
- The outbox makes later Pub/Sub replay possible

## Diagram

~~~mermaid
flowchart LR
  N0["Postgres outbox"]
  N1["BullMQ"]
  N2["Node worker"]
  N3["Application module"]
  N4["Result"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Use named queues and versioned job payloads.

### Security notes

- Cap retries and isolate high-risk job types.

### Possible future improvements

- Replace the queue adapter with Pub/Sub.

<!-- Sources: See PowerPoint speaker notes; source keys: pubsub -->

---

# 046 — Gemini API starts simple and replaceable

## Explanation

The MVP calls Gemini through one TypeScript AIProvider interface for structured summaries and classification; advanced retrieval waits.

- Schema-validate every model response
- Keep payment decisions in rules and policy
- Store prompt, model, and outcome versions

## Diagram

~~~mermaid
flowchart TB
  H["AIProvider"]
  N0["Application module"] --> H
  N1["Prompt contract"] --> H
  N2["Gemini API"] --> H
  N3["Validated result"] --> H
~~~

### Best practices

- Keep prompts and response schemas in source control.

### Security notes

- Redact sensitive fields before model calls.

### Possible future improvements

- Swap the adapter to Vertex AI without changing core modules.

<!-- Sources: Internal product and architecture decisions -->

---

# 047 — Backups and recovery need two inventories

## Explanation

Database state and Storage objects must be protected, restored, and verified separately.

- PITR for Postgres
- Independent logical export and restore test
- Object manifest, checksums, and lifecycle report

## Diagram

~~~mermaid
flowchart LR
  N0["DATABASE<br/>PITR<br/>logical export<br/>restore drill"]
  N1["OBJECTS<br/>inventory<br/>checksums<br/>retention proof"]
  N0 --> N1
~~~

### Best practices

- Run restore exercises, not backup-checkbox reviews.

### Security notes

- Protect recovery credentials outside the application.

### Possible future improvements

- Cross-region GCP backups with automated verification.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseBackups -->

---

# 048 — Adapters keep vendor code out of core modules

## Explanation

Core TypeScript modules depend on small interfaces; Supabase, Railway, Redis, Gemini, and later GCP SDKs live only in adapters.

- PrismaRepository, QueuePort, AIProvider
- ObjectStore, IdentityProvider, ObservabilityPort
- Contract tests protect every migration adapter

## Diagram

~~~mermaid
flowchart TB
  H["TypeScript modules"]
  N0["Prisma repository"] --> H
  N1["Queue port"] --> H
  N2["AI provider"] --> H
  N3["Supabase/Railway adapters"] --> H
  N4["GCP adapters"] --> H
~~~

### Best practices

- Ban provider SDK imports from core modules.

### Security notes

- Centralize credentials and request signing in adapters.

### Possible future improvements

- Automated architecture-boundary tests in CI.

<!-- Sources: Internal product and architecture decisions -->

---

# 049 — Measured triggers decide when to migrate

## Explanation

Migration starts when product, risk, scale, residency, or recovery evidence—not enthusiasm—crosses a defined threshold.

- Connection and event pressure
- Latency, egress, residency, and private connectivity
- Recovery objectives and contractual bank gates

## Diagram

~~~mermaid
flowchart LR
  N0["Scale"]
  N1["Latency"]
  N2["Residency"]
  N3["Recovery"]
  N4["Contract"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Maintain a funded portability-debt register.

### Security notes

- Migrate critical aggregates before material payment influence.

### Possible future improvements

- Automated readiness score per capability.

<!-- Sources: Internal product and architecture decisions -->

---

# 050 — The application migrates one dependency at a time

## Explanation

The TypeScript application stays intact while runtime, database, queue, storage, AI, and monitoring adapters move to GCP when justified.

- Prototype on Railway + Supabase
- Run the same Docker image on Cloud Run
- Replace managed dependencies one by one

## Diagram

~~~mermaid
flowchart LR
  N0["Railway + Supabase"]
  N1["Docker hardening"]
  N2["Cloud Run"]
  N3["GCP adapters"]
  N4["Enterprise scale"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Move the riskiest capability first, not every capability.

### Security notes

- Keep one authoritative writer during each cutover.

### Possible future improvements

- Automated tenant-by-tenant migration orchestration.

<!-- Sources: Internal product and architecture decisions -->

---

# 051 — Critical state migrates before convenience

## Explanation

Consent, payment decisions, outcomes, durable events, and evidence move before portals, demos, and non-authoritative projections.

- First: consent, intents, recommendations, outcomes
- Then: events, evidence, analytics, and features
- Last: portal auth and convenience workloads

## Diagram

~~~mermaid
flowchart LR
  N0["Consent"]
  N1["Decision state"]
  N2["Outcomes + events"]
  N3["Evidence + AI"]
  N4["Portal convenience"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Rank capabilities by consequence of failure.

### Security notes

- Keep Supabase read-only during the rollback window.

### Possible future improvements

- Retain Supabase for sandboxes and synthetic demos.

<!-- Sources: Internal product and architecture decisions -->

---

# 052 — Database migration preserves one writer

## Explanation

Snapshot, replicate, compare, freeze, drain, and switch; application-level dual writes are avoided.

- Create Cloud SQL schema from Prisma migrations
- Backfill and replicate PostgreSQL changes
- Shadow-read through the new Prisma connection

## Diagram

~~~mermaid
flowchart LR
  N0["Supabase"]
  N1["Snapshot / WAL"]
  N2["Cloud SQL"]
  N3["Verifier"]
  N4["Prisma adapter"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Require primary keys and monitor replication lag.

### Security notes

- Freeze incompatible DDL during the cutover window.

### Possible future improvements

- Reusable migration runbooks and invariant checks.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseReplication, dms, cloudSql -->

---

# 053 — Identity cutover needs a customer plan

## Explanation

Password hashes may migrate, but sessions, JWT issuers, MFA, and provider links need controlled bridging or re-login.

- Shadow-import principals and validate mappings
- Accept old issuer for a bounded bridge window
- Rotate sessions and communicate re-authentication

## Diagram

~~~mermaid
flowchart LR
  N0["Supabase Auth"]
  N1["Express middleware"]
  N2["Identity link"]
  N3["OIDC bridge"]
  N4["Bank SSO later"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Keep application principal IDs stable across issuers.

### Security notes

- Revoke old signing keys after any bridge window.

### Possible future improvements

- Add bank SSO/OIDC without changing core modules.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseAuth -->

---

# 054 — Objects migrate with manifests and checksums

## Explanation

Storage migration copies bytes, metadata, hashes, permissions, and retention state independently from the database.

- Inventory every canonical object ID
- Copy and verify cryptographic checksums
- Reissue signed URLs from the ObjectStore adapter

## Diagram

~~~mermaid
flowchart LR
  N0["Inventory"]
  N1["Copy"]
  N2["Checksum"]
  N3["Policy map"]
  N4["Cloud Storage"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Never store vendor URLs as permanent identifiers.

### Security notes

- Rotate upload and download credentials after cutover.

### Possible future improvements

- Policy-driven tiering and retention locks.

<!-- Sources: See PowerPoint speaker notes; source keys: supabaseStorage, storage -->

---

# 055 — The modular monolith maps cleanly to GCP

## Explanation

The same Node.js + Express.js Docker image moves from Railway to Cloud Run; core TypeScript modules do not change.

- Cloud Run hosts the Express API and worker entry points
- Cloud SQL keeps PostgreSQL and Prisma
- GCP managed services replace only infrastructure adapters

## Diagram

~~~mermaid
flowchart LR
  N0["Railway Docker service → Google Cloud Run"]
  N1["Supabase PostgreSQL → Cloud SQL PostgreSQL"]
  N2["Redis + BullMQ → Google Cloud Pub/Sub"]
  N3["Supabase Storage → Google Cloud Storage"]
  N4["Gemini API + Sentry → Vertex AI + Cloud Monitoring"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Keep one deployable application until scale proves otherwise.

### Security notes

- Use GCP service accounts and private database access later.

### Possible future improvements

- Add separate workers only for measured bottlenecks.

<!-- Sources: See PowerPoint speaker notes; source keys: cloudRun, pubsub, storage, cloudSql -->

---

# 056 — BullMQ now becomes Pub/Sub later

## Explanation

The application keeps one QueuePort: BullMQ handles MVP jobs, while Pub/Sub becomes the enterprise event transport later.

- Job payloads are versioned and idempotent
- The PostgreSQL outbox survives either queue
- Supabase Realtime remains a UI convenience

## Diagram

~~~mermaid
flowchart LR
  N0["NOW<br/>Redis + BullMQ<br/>Jobs + retries"]
  N1["LATER<br/>Google Pub/Sub<br/>Durable events"]
  N0 --> N1
~~~

### Best practices

- Design workers for duplicate and out-of-order delivery.

### Security notes

- Never put secrets or raw call content in job payloads.

### Possible future improvements

- Swap QueuePort implementations without changing modules.

<!-- Sources: See PowerPoint speaker notes; source keys: pubsub -->

---

# 057 — The target GCP deployment stays simple

## Explanation

Enterprise scale still uses one modular application: Cloud Run hosts Express, with managed GCP adapters around it.

- Cloud Run: Node.js + Express.js + TypeScript
- Cloud SQL: PostgreSQL through Prisma
- Pub/Sub, Cloud Storage, Vertex AI, and Cloud Monitoring

## Diagram

~~~mermaid
flowchart TB
  H["Express app"]
  N0["Next.js / partners"] --> H
  N1["Cloud SQL"] --> H
  N2["Pub/Sub"] --> H
  N3["Cloud Storage"] --> H
  N4["Vertex AI"] --> H
  N5["Cloud Monitoring"] --> H
~~~

### Best practices

- Keep the synchronous path inside the Express application.

### Security notes

- Use least-privilege service accounts for every adapter.

### Possible future improvements

- Add regional deployments only when contracts require them.

<!-- Sources: See PowerPoint speaker notes; source keys: cloudRun, cloudSql, pubsub, storage -->

---

# 058 — Cutover stays reversible

## Explanation

The final switch is tenant-scoped, observable, and protected by a read-only rollback copy.

- Shadow-read and compare recommendations
- Freeze writes and drain replication to zero lag
- Switch adapters; monitor; retain rollback window

## Diagram

~~~mermaid
flowchart LR
  N0["Backfill"]
  N1["Replicate"]
  N2["Shadow compare"]
  N3["Freeze + drain"]
  N4["Switch"]
  N5["Rollback window"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Use a feature flag at the adapter boundary.

### Security notes

- Rotate Supabase admin keys after final exit.

### Possible future improvements

- Automated reversible migrations by tenant cohort.

<!-- Sources: See PowerPoint speaker notes; source keys: dms -->

---

# 059 — Railway is the initial runtime, not a lock-in

## Explanation

Railway runs the Dockerized Express application quickly; provider adapters keep the later Cloud Run move operational rather than architectural.

- Use TLS, connection pooling, and database allowlists
- Keep secrets in Railway environment configuration
- Move runtime first; migrate data when bank requirements demand it

## Diagram

~~~mermaid
flowchart LR
  N0["NOW<br/>Railway → Supabase<br/>Redis + Gemini + Sentry"]
  N1["LATER<br/>Cloud Run → Cloud SQL<br/>Pub/Sub + Vertex + Monitoring"]
  N0 --> N1
~~~

### Best practices

- Build and deploy the same Docker image everywhere.

### Security notes

- Never embed provider credentials in the image.

### Possible future improvements

- Use Terraform when the GCP environment is introduced.

<!-- Sources: See PowerPoint speaker notes; source keys: cloudSql, cloudRun -->

---

# 060 — Scale and cost follow measured unit economics

## Explanation

The architecture tracks cost per payment intent, decision, speech minute, event, and retained gigabyte.

- Railway + Supabase minimize early operational work
- Redis/BullMQ and Gemini API keep the MVP familiar
- Adopt GCP services only after product and partner evidence

## Diagram

~~~mermaid
flowchart LR
  N0["$/intent: decision-path unit cost"]
  N1["ms p99: customer-facing latency"]
  N2["RTO/RPO: recovery cost and tier"]
  N0 --> N1
  N1 --> N2
~~~

### Best practices

- Attach architecture thresholds to financial metrics.

### Security notes

- Budget for security evidence and recovery, not compute alone.

### Possible future improvements

- Capacity models per region and participant tier.

<!-- Sources: Internal product and architecture decisions -->

---

# 061 — AI advises; it never owns payment authority

## Explanation

Deterministic validation, rules, policy, and bank control surround every model and LLM.

- Gemini API is never the sole scorer
- Rules produce the primary explainable score
- Policy and the bank choose the intervention

## Diagram

~~~mermaid
flowchart LR
  N0["Bank final action"]
  N1["Policy + workflow"]
  N2["Explainable TypeScript rules"]
  N3["Gemini API assistance"]
  N4["Governed PostgreSQL data"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Use Gemini only where it adds measurable signal.

### Security notes

- No model receives a payment-execution credential.

### Possible future improvements

- Move the AIProvider adapter to Vertex AI later.

<!-- Sources: See PowerPoint speaker notes; source keys: nistAi, aiAct -->

---

# 062 — Risk uses eight explainable feature families

## Explanation

Each feature carries provenance, freshness, missingness, and a version so the final recommendation can be reproduced.

- Telecom, payment, behavior, and device
- Identity, velocity, graph, and customer context
- Missing data remains explicit

## Diagram

~~~mermaid
flowchart TB
  H["Identity"]
  N0["Telecom"] --> H
  N1["Payment"] --> H
  N2["Behavior"] --> H
  N3["Device"] --> H
  N4["Velocity"] --> H
  N5["Graph"] --> H
  N6["Context"] --> H
~~~

### Best practices

- Govern feature definitions like public APIs.

### Security notes

- Tenant-filter every online feature lookup.

### Possible future improvements

- Federated and privacy-preserving features.

<!-- Sources: Internal product and architecture decisions -->

---

# 063 — Speech analysis is optional and ephemeral

## Explanation

Where separately authorized, isolated workers transcribe, redact, classify, and retain derived features rather than raw audio.

- Consent and jurisdiction gate before processing
- Speech-to-Text then PII redaction
- Short retention with lineage to derived indicators

## Diagram

~~~mermaid
flowchart LR
  N0["Consent gate"]
  N1["Ephemeral audio"]
  N2["Speech-to-Text"]
  N3["Redact + classify"]
  N4["Derived features"]
  N5["Delete raw audio"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Metadata-first; content only for bounded cases.

### Security notes

- No routine recording or voice biometric creation.

### Possible future improvements

- On-device or telecom-side feature extraction.

<!-- Sources: See PowerPoint speaker notes; source keys: gdpr, aiAct -->

---

# 064 — Training begins with provenance

## Explanation

The learning pipeline curates minimized data, builds reproducible features, evaluates models, and requires approval before release.

- Outcomes and analyst adjudication create labels
- Dataset, feature, code, and model versions bind together
- Security, bias, drift, and quality gates are mandatory

## Diagram

~~~mermaid
flowchart LR
  N0["Outcomes"]
  N1["Curate"]
  N2["Features"]
  N3["Train"]
  N4["Evaluate"]
  N5["Register"]
  N6["Shadow"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
  N5 --> N6
~~~

### Best practices

- Reproduce every model from an immutable manifest.

### Security notes

- Isolate training identities from production serving.

### Possible future improvements

- Secure clean rooms for participant-contributed learning.

<!-- Sources: See PowerPoint speaker notes; source keys: nistAi -->

---

# 065 — Labels capture type, stage, and outcome

## Explanation

A simple scam/not-scam label hides uncertainty, delayed confirmation, and the effect of the intervention itself.

- Scam type and journey stage
- Intervention, bank action, and customer response
- Suspected, confirmed, recovered, and unknown outcomes

## Diagram

~~~mermaid
flowchart TB
  H["Outcome"]
  N0["Type"] --> H
  N1["Stage"] --> H
  N2["Intervention"] --> H
  N3["Confidence"] --> H
  N4["Provenance"] --> H
~~~

### Best practices

- Keep unknown and disputed labels explicit.

### Security notes

- Restrict sensitive label access and correction rights.

### Possible future improvements

- Causal labels for prevented-but-unobserved loss.

<!-- Sources: Internal product and architecture decisions -->

---

# 066 — Start with one AI provider, not an ML platform

## Explanation

The MVP uses deterministic TypeScript rules plus one Gemini API adapter; advanced models wait until the product has reliable outcome data.

- One AIProvider interface
- Schema-validated Gemini responses
- Rules remain available when AI is slow or unavailable

## Diagram

~~~mermaid
flowchart TB
  H["AIProvider"]
  N0["Risk rules"] --> H
  N1["Prompt contract"] --> H
  N2["Gemini API"] --> H
  N3["Validated JSON"] --> H
  N4["Outcome feedback"] --> H
~~~

### Best practices

- Prefer the smallest reliable AI integration.

### Security notes

- Redact data and test prompt injection.

### Possible future improvements

- Add Vertex AI models only after labels justify them.

<!-- Sources: Internal product and architecture decisions -->

---

# 067 — Risk scoring starts deterministic and explainable

## Explanation

A transparent TypeScript scoring module combines validated signals, rule weights, data quality, and uncertainty before policy selects an action.

- Weights are configuration, not hidden model logic
- High uncertainty increases review
- Gemini can add context but cannot override rules

## Diagram

~~~mermaid
flowchart LR
  N0["Signals"]
  N1["Rules"]
  N2["Weights"]
  N3["AI context"]
  N4["Uncertainty"]
  N5["Action"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Version scoring weights and test them with fixtures.

### Security notes

- Cap any single partner signal’s influence.

### Possible future improvements

- Replace or augment rules only after measured evidence.

<!-- Sources: Internal product and architecture decisions -->

---

# 068 — Rules, policy, workflow, and AI stay distinct

## Explanation

Each layer solves a different problem and can change without silently changing the others.

- Rules identify deterministic facts
- Risk fusion estimates probability and uncertainty
- Policy chooses allowed action; workflow executes the journey

## Diagram

~~~mermaid
flowchart LR
  N0["Workflow: callback / review / delay"]
  N1["Policy: institution action matrix"]
  N2["Risk score: weights + uncertainty"]
  N3["Rules: deterministic facts"]
  N4["Features: governed evidence"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Version and release each layer independently.

### Security notes

- Require approval for action-escalating policy changes.

### Possible future improvements

- Machine-assisted policy simulation, never auto-publish.

<!-- Sources: Internal product and architecture decisions -->

---

# 069 — Every recommendation explains itself

## Explanation

The response shows top reason codes, evidence freshness, uncertainty, and all versions needed to reproduce the recommendation.

- Human-readable reasons with feature provenance
- Model, feature, rule, and policy versions
- Recommended action plus alternatives

## Diagram

~~~yaml
action: REQUIRE_CALLBACK
risk_score: 86
uncertainty: 0.09
reasons: [new_payee, active_scam_campaign]
evidence_age_seconds: 42
rules: rules-17 | ai_assist: gemini-v1
decision_id: 01J…
~~~

### Best practices

- Use stable reason codes and plain-language renderings.

### Security notes

- Do not expose adversarially useful thresholds to customers.

### Possible future improvements

- Partner-specific explanation policy and appeals evidence.

<!-- Sources: Internal product and architecture decisions -->

---

# 070 — Gemini API provides bounded AI assistance

## Explanation

Express calls Gemini through one AIProvider adapter for classification and analyst summaries; the deterministic scorer remains authoritative.

- Redact and minimize the input
- Require schema-valid JSON output
- Timeout or validation failure uses a rule-based fallback

## Diagram

~~~mermaid
flowchart LR
  N0["Express module"]
  N1["Redact"]
  N2["AIProvider"]
  N3["Gemini API"]
  N4["Validate JSON"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Use narrow prompts and typed response schemas.

### Security notes

- Treat model input and output as untrusted.

### Possible future improvements

- Switch the adapter to Vertex AI later.

<!-- Sources: See PowerPoint speaker notes; source keys: nistAi -->

---

# 071 — AI changes stay versioned and reversible

## Explanation

Prompt, schema, rules, and Gemini model versions move through test, shadow, approval, release, and rollback like ordinary application changes.

- Store versions in Git and decision records
- Shadow AI changes before customer exposure
- Track quality, cost, latency, and rollback readiness

## Diagram

~~~mermaid
flowchart LR
  N0["Git change"]
  N1["Automated test"]
  N2["Shadow"]
  N3["Approve"]
  N4["Release"]
  N5["Rollback"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Pre-register promotion and rollback criteria.

### Security notes

- Restrict who can change prompts and scoring rules.

### Possible future improvements

- Use Vertex AI model registry when custom models appear.

<!-- Sources: See PowerPoint speaker notes; source keys: nistAi, aiAct -->

---

# 072 — The threat model includes the whole network

## Explanation

Attackers include scammers, compromised partners, malicious insiders, abusive tenants, suppliers, and model adversaries.

- Event spoofing and replay
- Identity abuse and correlation attacks
- Poisoning, evasion, prompt injection, and data exfiltration

## Diagram

~~~mermaid
flowchart TB
  H["Tenant"]
  N0["Scammer"] --> H
  N1["Partner"] --> H
  N2["Insider"] --> H
  N3["Supplier"] --> H
  N4["Model attack"] --> H
~~~

### Best practices

- Prioritize threats by reachability and blast radius.

### Security notes

- Test compromised-partner scenarios, not only perimeter attacks.

### Possible future improvements

- Automated threat-informed control validation.

<!-- Sources: See PowerPoint speaker notes; source keys: nistZt, nistAi -->

---

# 073 — Zero Trust applies to people and workloads

## Explanation

Every request proves identity, tenant, purpose, role, device or workload context, and permitted action.

- Supabase Auth and JWTs for people
- Separate Railway credentials per environment
- Case-aware and purpose-aware authorization

## Diagram

~~~mermaid
flowchart LR
  N0["Supabase JWT"]
  N1["Express middleware"]
  N2["Policy"]
  N3["Least privilege"]
  N4["Audit"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Authorize the action, not only the endpoint.

### Security notes

- Short-lived tokens and rapid revocation.

### Possible future improvements

- Map the same controls to GCP service accounts later.

<!-- Sources: See PowerPoint speaker notes; source keys: nistZt -->

---

# 074 — Keys, secrets, and evidence stay separate

## Explanation

TLS, PostgreSQL encryption, environment secrets, key rotation, and append-only audit evidence are handled without adding a new security framework.

- TLS/mTLS in transit
- Supabase encryption and restricted database roles
- Railway environment secrets; no values in code or tables

## Diagram

~~~mermaid
flowchart LR
  N0["Append-only audit records"]
  N1["PostgreSQL encryption"]
  N2["Railway secrets"]
  N3["Rotated API keys"]
  N4["Express authorization"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Rotate secrets through rehearsed runbooks.

### Security notes

- Separate production access from application roles.

### Possible future improvements

- Adopt GCP-managed keys and secrets during migration.

<!-- Sources: See PowerPoint speaker notes; source keys: nistZt -->

---

# 075 — Privacy controls are executable

## Explanation

Consent, minimization, access, correction, revocation, retention, deletion, appeal, and proof are implemented as workflows.

- Purpose tags follow every record and event
- Retention jobs delete or anonymize on schedule
- DPIA and policy versions are linked to processing

## Diagram

~~~mermaid
flowchart LR
  N0["Collect less"]
  N1["Use by purpose"]
  N2["Retain briefly"]
  N3["Delete"]
  N4["Prove"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Turn legal requirements into testable controls.

### Security notes

- Prevent re-identification from derived data combinations.

### Possible future improvements

- Privacy budget and automated data-lineage enforcement.

<!-- Sources: See PowerPoint speaker notes; source keys: gdpr, aiAct -->

---

# 076 — Legal lanes remain deliberately separate

## Explanation

Telecom intelligence and financial-information sharing have different authorities; the architecture must not blur them.

- Telecom signals stay under communications/privacy obligations
- Eligible financial institutions may use mechanisms such as 314(b)
- Map GDPR, AI Act, DORA, PCI DSS, ISO 27001, and NIST controls

## Diagram

~~~mermaid
flowchart LR
  N0["TELECOM LANE<br/>Communication-derived indicators<br/>No bank payment details"]
  N1["FINANCIAL LANE<br/>Eligible institution intelligence<br/>No telecom raw content"]
  N0 --> N1
~~~

### Best practices

- Obtain jurisdiction-specific legal analysis before pilots.

### Security notes

- Telecoms are not automatically eligible for 314(b).

### Possible future improvements

- Policy packs per country, rail, and participant type.

<!-- Sources: See PowerPoint speaker notes; source keys: fincen, gdpr, aiAct, dora, pci, iso, nistAi -->

---

# 077 — Sentry connects reliability and risk quality

## Explanation

Sentry links Express requests, Prisma queries, BullMQ jobs, Gemini calls, policy outcomes, latency, and application errors during the MVP.

- Technical SLOs: availability and latency
- Model health: drift, calibration, and missingness
- Product health: prevention, friction, appeals, and cost

## Diagram

~~~mermaid
flowchart TB
  H["Risk quality"]
  N0["Latency"] --> H
  N1["Errors"] --> H
  N2["Cost"] --> H
  N3["Customer impact"] --> H
  N4["Security"] --> H
~~~

### Best practices

- Use one correlation ID across Express and BullMQ.

### Security notes

- Redact identifiers before errors and traces leave the app.

### Possible future improvements

- Move observability adapters to Cloud Monitoring and Logging.

<!-- Sources: Internal product and architecture decisions -->

---

# 078 — Resilience is explicit and rehearsed

## Explanation

Each service tier has an RTO, RPO, degradation mode, regional strategy, and tested recovery procedure.

- Decision API fails neutral within deadline
- Regional compute stays local to the payment path
- Restore, failover, and partner-timeout drills run regularly

## Diagram

~~~mermaid
flowchart LR
  N0["Decision API → multi-zone | seconds | fail-neutral"]
  N1["Transactional store → HA + PITR | bounded RPO"]
  N2["Event plane → replay | idempotent recovery"]
  N3["Analytics → rebuildable | relaxed RTO"]
  N4["AI → fallback models / rules"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Define service tiers before choosing redundancy.

### Security notes

- Recovery credentials are break-glass and audited.

### Possible future improvements

- Multi-region cell failover under partner control.

<!-- Sources: See PowerPoint speaker notes; source keys: cloudSql -->

---

# 079 — Delivery is reproducible before it is fast

## Explanation

A monorepo, signed artifacts, Terraform, and progressive delivery make every environment repeatable and reviewable.

- GitHub Actions → tests → Docker image
- Deploy the same image to Railway
- Terraform provisions GCP only when migration begins

## Diagram

~~~mermaid
flowchart LR
  N0["Commit"]
  N1["Unit + contract"]
  N2["Security scan"]
  N3["Docker image"]
  N4["Railway deploy"]
  N5["Smoke test"]
  N6["Promote"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
  N5 --> N6
~~~

### Best practices

- Make production changes only through GitHub Actions.

### Security notes

- Pin dependencies and scan secrets before deploy.

### Possible future improvements

- Add Terraform + Cloud Run deployment later.

<!-- Sources: Internal product and architecture decisions -->

---

# 080 — Testing covers contracts, scale, and failure

## Explanation

The test strategy validates business invariants, partner compatibility, migration portability, performance, and adversarial behavior.

- Unit, property, contract, and integration tests
- Performance, soak, chaos, and disaster recovery
- Model, privacy, abuse, and prompt-injection tests

## Diagram

~~~mermaid
flowchart LR
  N0["Chaos + DR"]
  N1["Performance + soak"]
  N2["End-to-end + contract"]
  N3["Integration + migration"]
  N4["Unit + property"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Test the fallback path as often as the happy path.

### Security notes

- Use synthetic or minimized fixtures in CI.

### Possible future improvements

- Continuous production verification with safe probes.

<!-- Sources: Internal product and architecture decisions -->

---

# 081 — The team grows around the highest risks

## Explanation

Hiring follows the product’s trust responsibilities: platform, partner integration, security/privacy, AI, reliability, and customer experience.

- Founding: full-stack TypeScript, product, and UI
- Before live pilot: security/privacy and partner integration
- Before scale: reliability, compliance, and AI/data ownership

## Diagram

~~~mermaid
flowchart LR
  N0["0–3 mo<br/>Core product"]
  N1["3–6 mo<br/>Security + ML"]
  N2["6–9 mo<br/>Partner + SRE"]
  N3["9–12 mo<br/>Compliance + SOC"]
  N4["Scale<br/>Regional teams"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Hire for ownership, not a long list of technologies.

### Security notes

- Give security and privacy independent stop authority.

### Possible future improvements

- Participant-facing solution architecture team.

<!-- Sources: Internal product and architecture decisions -->

---

# 082 — Day 1 starts with authority and boundaries

## Explanation

The first deliverable is a pilot charter that defines consent, permitted fields, recommendation authority, failure behavior, and success criteria.

- Select one bank and one telecom design partner
- Use synthetic data until controls and contracts pass
- Write the threat model, data map, and exit plan

## Diagram

~~~mermaid
flowchart LR
  N0["Charter"]
  N1["Data map"]
  N2["Threat model"]
  N3["Contracts"]
  N4["Synthetic sandbox"]
  N5["Approval gate"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Decide what the platform will never collect.

### Security notes

- No real partner data before readiness gates pass.

### Possible future improvements

- Reusable pilot agreement and control evidence pack.

<!-- Sources: Internal product and architecture decisions -->

---

# 083 — Version 1 builds the portable skeleton

## Explanation

Create the TypeScript monorepo, Express modular monolith, Prisma schema, Supabase project, Railway service, CI/CD, Sentry, and synthetic event generator.

- Next.js and Express share types where appropriate
- Prisma, tenant, consent, session, and outbox foundations
- Docker + GitHub Actions deploy to Railway

## Diagram

~~~mermaid
flowchart LR
  N0["TypeScript repo"]
  N1["Express modules"]
  N2["Prisma"]
  N3["Supabase"]
  N4["Railway"]
  N5["Synthetic demo"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Prove one end-to-end synthetic trace.

### Security notes

- Secret scanning and default-deny environments from Day 1.

### Possible future improvements

- GCP adapter contract tests begin before migration.

<!-- Sources: Internal product and architecture decisions -->

---

# 084 — Version 2 ships consent and payment intent

## Explanation

Deliver the customer consent lifecycle, PaymentIntent API, bank sandbox, and first calm warning flow in Next.js.

- OpenAPI sandbox and generated bank SDK
- Versioned consent receipts and revocation
- No AI yet: deterministic synthetic responses

## Diagram

~~~mermaid
flowchart LR
  N0["Consent"]
  N1["PaymentIntent"]
  N2["Bank sandbox"]
  N3["Warning UI"]
  N4["Outcome stub"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Validate UX before model complexity.

### Security notes

- Keep bank credentials and payment data outside the platform.

### Possible future improvements

- Accessibility and localization testing.

<!-- Sources: Internal product and architecture decisions -->

---

# 085 — Version 3 connects the first telecom

## Explanation

Implement signed ScamRiskEvents, consent checks, expiring protection sessions, correlation, and durable outbox delivery.

- Telecom adapter and schema conformance suite
- Signal freshness, replay, and provenance checks
- Metadata-first campaign indicators

## Diagram

~~~mermaid
flowchart LR
  N0["Telecom adapter"]
  N1["Signed event"]
  N2["Consent gate"]
  N3["Session"]
  N4["Correlation"]
  N5["Outbox"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Start with a very small signal catalog.

### Security notes

- Quarantine malformed and cross-tenant events.

### Possible future improvements

- Second telecom adapter validates contract portability.

<!-- Sources: Internal product and architecture decisions -->

---

# 086 — Version 4 completes the deterministic MVP

## Explanation

Rules, policies, recommendations, outcomes, dashboards, and failure behavior create a complete shadow-mode product.

- Policy versioning and simulation
- Bank and telecom dashboards
- Latency, reliability, privacy, and intervention scorecards

## Diagram

~~~mermaid
flowchart LR
  N0["Rules"]
  N1["Policy"]
  N2["Risk advice"]
  N3["Outcome"]
  N4["Dashboards"]
  N5["Shadow test"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Run production-like load with synthetic traffic.

### Security notes

- Dual approval for action-escalating policy changes.

### Possible future improvements

- Analyst case workflow and override analytics.

<!-- Sources: Internal product and architecture decisions -->

---

# 087 — Version 5 adds a governed Gemini integration

## Explanation

Add the AIProvider adapter, Gemini API, prompt and response schemas, redaction, explainability, and silent evaluation—without changing the deterministic scorer.

- Typed Gemini requests and responses
- Prompt/version tracking in Git and PostgreSQL
- Shadow comparison against the deterministic baseline

## Diagram

~~~mermaid
flowchart LR
  N0["AIProvider"]
  N1["Redact"]
  N2["Gemini API"]
  N3["Validate"]
  N4["Reason codes"]
  N5["Silent mode"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Require measurable value over the rule baseline.

### Security notes

- Red-team prompts and data handling before exposure.

### Possible future improvements

- Move the same adapter contract to Vertex AI.

<!-- Sources: Internal product and architecture decisions -->

---

# 088 — Version 6 runs a bounded advisory pilot

## Explanation

One bank and one telecom use the platform for advisory-only interventions under strict limits and weekly governance review.

- Small customer cohort and transaction ceiling
- Fail-neutral responses and rapid kill switch
- Weekly review of loss, friction, bias, and incidents

## Diagram

~~~mermaid
flowchart LR
  N0["Readiness gate"]
  N1["Cohort"]
  N2["Advisory"]
  N3["Weekly review"]
  N4["Kill switch"]
  N5["Learn"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Increase scope only after evidence.

### Security notes

- No autonomous blocking or unreviewed model promotion.

### Possible future improvements

- Migrate critical state to Cloud SQL before expansion.

<!-- Sources: Internal product and architecture decisions -->

---

# 089 — Version 7 adds campaign graph intelligence

## Explanation

Typed, time-bounded graph relationships improve campaign detection and investigation without building a global customer graph.

- Number, device, campaign, and payee relationships
- Every graph contribution is explainable
- Investigator tools surface provenance and expiry

## Diagram

~~~mermaid
flowchart LR
  N0["Typed edges"]
  N1["Campaign clusters"]
  N2["Graph features"]
  N3["Investigation"]
  N4["Explain"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Keep graph edges purpose- and time-bounded.

### Security notes

- Prevent identity inference across tenants.

### Possible future improvements

- Dedicated graph platform only after traversal needs grow.

<!-- Sources: Internal product and architecture decisions -->

---

# 090 — Version 8 proves network effects

## Explanation

A second bank or telecom validates that shared, minimized intelligence improves outcomes without pooling raw participant data.

- Tenant and legal lanes remain isolated
- Measure incremental lift from cross-participant signals
- Establish neutral network governance

## Diagram

~~~mermaid
flowchart LR
  N0["Partner 1"]
  N1["Neutral network"]
  N2["Partner 2"]
  N3["Measured lift"]
  N4["Governance"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Attribute value transparently to each contributor.

### Security notes

- No partner can query another partner’s source evidence.

### Possible future improvements

- Privacy-safe incentive and pricing model.

<!-- Sources: Internal product and architecture decisions -->

---

# 091 — Version 9 moves the modular monolith to GCP

## Explanation

The same Express modular monolith runs on Cloud Run with GCP-managed PostgreSQL, queues, storage, AI, monitoring, recovery, and bank-grade SLAs.

- Cloud Run, Cloud SQL, Pub/Sub, Cloud Storage, Vertex AI
- Cloud Monitoring/Logging and Terraform-managed infrastructure
- Tenant-by-tenant cutover and tested rollback

## Diagram

~~~mermaid
flowchart LR
  N0["Cloud Run"]
  N1["Cloud SQL"]
  N2["Pub/Sub"]
  N3["Cloud Storage"]
  N4["Vertex AI"]
  N5["Monitoring"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
  N4 --> N5
~~~

### Best practices

- Keep Supabase for sandboxes where it still adds value.

### Security notes

- Rotate and remove legacy administrative access.

### Possible future improvements

- Multi-region active cells with sovereignty routing.

<!-- Sources: Internal product and architecture decisions -->

---

# 092 — Version 10 becomes governed network infrastructure

## Explanation

The product supports multiple banks and telecoms, commercial SLAs, policy governance, regional cells, and controlled international expansion.

- Neutral governance and participant rulebook
- Network-wide campaign intelligence with strict lanes
- Scalable onboarding, certification, billing, and support

## Diagram

~~~mermaid
flowchart LR
  N0["Multi-party"]
  N1["Regional cells"]
  N2["Governance"]
  N3["Commercial SLA"]
  N4["Expansion"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
  N3 --> N4
~~~

### Best practices

- Scale trust and governance as deliberately as compute.

### Security notes

- Independent oversight for privacy, AI, and incident response.

### Possible future improvements

- A global safety network with local legal control.

<!-- Sources: Internal product and architecture decisions -->

---

# 093 — The immediate decision: approve Day 1 → Version 2

## Explanation

The fastest credible next step is a portable Supabase-first foundation, a synthetic bank sandbox, and a consented payment-intent experience.

- Choose the first design-partner profile
- Approve data boundaries and success metrics
- Fund a 12-week team to prove the complete synthetic journey

## Diagram

~~~mermaid
flowchart LR
  N0["12 weeks"]
  N1["Portable core"]
  N2["Synthetic proof"]
  N3["Partner-ready"]
  N0 --> N1
  N1 --> N2
  N2 --> N3
~~~

### Best practices

- Build the trust boundary before the model.

### Security notes

- No production bank data in the first proof.

### Possible future improvements

- Enter Version 3 only with a signed telecom design partner.

<!-- Sources: Internal product and architecture decisions -->

---

