import { z } from 'zod';

/**
 * Every domain identifier is a ULID: lexicographically sortable by creation time, which
 * keeps audit and outbox reads naturally ordered, and free of any provider-specific
 * encoding. Slide 038 warns against copying provider identities into domain IDs.
 */
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const ulidSchema = z.string().regex(ULID_PATTERN, 'Must be a Crockford base32 ULID.');

export const isUlid = (value: string): boolean => ULID_PATTERN.test(value);

/**
 * A correlation ID threads one logical operation through Express, Prisma, BullMQ, and
 * Sentry (slide 077). We accept a caller-supplied value so a partner can join its own
 * trace to ours, but constrain the character set so it is safe to log and to use as a
 * queue or cache key.
 */
export const correlationIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Must contain only unreserved URL characters.');

/**
 * An opaque, pairwise subject reference. Slide 002 requires pairwise references and
 * slide 016 forbids a universal identity graph, so the platform never accepts a raw
 * telephone number or account number as a subject. The minimum length makes a plain
 * national telephone number structurally invalid here.
 */
export const subjectRefSchema = z
  .string()
  .min(24)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Must be an opaque pairwise reference, not a raw identifier.');

/**
 * Idempotency keys are partner-chosen. We only constrain length and character set; the
 * uniqueness guarantee is enforced per organization and per route scope in the database.
 */
export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Must contain only unreserved URL characters.');

/** Monotonic integers exchanged as strings, because a chain sequence may exceed 2^53. */
export const sequenceSchema = z.string().regex(/^\d+$/, 'Must be a non-negative integer string.');
