import { createHash } from 'node:crypto';

/**
 * Version 1 canonical audit representation.
 *
 * Every implementation that appends to the hash chain — the in-memory fake, the Prisma
 * adapter, and verification tooling — must produce identical `hashSelf` digests for the
 * same logical event. Ordinary `JSON.stringify()` is intentionally not used: key order,
 * null encoding, and numeric forms are all specified here.
 *
 * Digest:
 *   hashSelf = SHA-256( UTF8(version) || UTF8(hashPrev) || canonicalEventBytes )
 *
 * Where `canonicalEventBytes` is UTF-8 text built from ordered fields separated by ASCII
 * unit separator (U+001F). Nested objects in JSON-like fields are serialized with sorted
 * keys at every object level; array order is preserved.
 */
export const AUDIT_CANONICAL_VERSION = 1;

export const AUDIT_HASH_GENESIS = 'GENESIS';

/** Fields that participate in the version-1 canonical event bytes. */
export interface AuditCanonicalEvent {
  readonly chainKey: string;
  readonly sequence: bigint;
  readonly id: string;
  readonly organizationId: string | null;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly actorLabel: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly purpose: string;
  readonly outcome: string;
  readonly correlationId: string;
  readonly requestId: string | null;
  readonly ipHash: string | null;
  readonly userAgentHash: string | null;
  readonly occurredAt: Date;
  readonly dataBefore: Record<string, unknown> | null;
  readonly dataAfter: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown> | null;
}

const FIELD_SEPARATOR = '\u001f';

const encodeNullableString = (value: string | null | undefined): string =>
  value === null || value === undefined ? '' : value;

/** Serializes a JSON-like value into a deterministic, delimiter-safe form. */
export const canonicalizeJsonValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '';
    }
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJsonValue(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${key}:${canonicalizeJsonValue(record[key])}`).join(',')}}`;
  }
  return '';
};

/** Builds the ordered, separator-delimited canonical event text for version 1. */
export const buildCanonicalAuditEventText = (event: AuditCanonicalEvent): string => {
  const fields: readonly string[] = [
    String(AUDIT_CANONICAL_VERSION),
    event.chainKey,
    event.sequence.toString(),
    event.id,
    encodeNullableString(event.organizationId),
    event.actorType,
    encodeNullableString(event.actorId),
    encodeNullableString(event.actorLabel),
    event.action,
    event.resourceType,
    encodeNullableString(event.resourceId),
    event.purpose,
    event.outcome,
    event.correlationId,
    encodeNullableString(event.requestId),
    encodeNullableString(event.ipHash),
    encodeNullableString(event.userAgentHash),
    event.occurredAt.toISOString(),
    canonicalizeJsonValue(event.dataBefore),
    canonicalizeJsonValue(event.dataAfter),
    canonicalizeJsonValue(event.metadata),
  ];

  return fields.join(FIELD_SEPARATOR);
};

export const canonicalAuditEventBytes = (event: AuditCanonicalEvent): Uint8Array =>
  new TextEncoder().encode(buildCanonicalAuditEventText(event));

/**
 * Computes the self hash for one audit event.
 *
 * @param hashPrev - Previous link digest, or {@link AUDIT_HASH_GENESIS} for the chain head.
 */
export const computeAuditHashSelf = (hashPrev: string, event: AuditCanonicalEvent): string => {
  const versionBytes = new TextEncoder().encode(String(AUDIT_CANONICAL_VERSION));
  const hashPrevBytes = new TextEncoder().encode(hashPrev);
  const eventBytes = canonicalAuditEventBytes(event);

  return createHash('sha256').update(versionBytes).update(hashPrevBytes).update(eventBytes).digest('hex');
};

/** Maps a tenant identifier to the chain namespace used in storage and verification. */
export const auditChainKeyFor = (organizationId: string | null): string =>
  organizationId === null ? 'platform' : `org:${organizationId}`;
