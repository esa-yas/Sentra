import { createHash } from 'node:crypto';

/**
 * Sensitive-field redaction, shared by the logger and the Sentry `beforeSend` hook.
 *
 * Slide 077 requires identifiers to be redacted before errors and traces leave the
 * application. One implementation serves both paths deliberately: a redaction rule that
 * exists in the logger but not in the error reporter is a leak waiting to happen.
 *
 * Redaction is applied by field name and by value shape, because a partner or a stack
 * frame can put a secret in a field we never anticipated.
 */

export const REDACTED = '[redacted]';

/** Field names whose value is replaced outright. */
const SENSITIVE_FIELD_NAMES: readonly string[] = [
  'password',
  'passcode',
  'pin',
  'otp',
  'secret',
  'clientsecret',
  'clientsecrethash',
  'apikey',
  'apitoken',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'sessiontoken',
  'privatekey',
  'servicerolekey',
  'anonkey',
  'jwt',
  'signature',
  'hash',
  'pan',
  'cardnumber',
  'cvv',
  'cvc',
  'iban',
  'accountnumber',
  'sortcode',
  'routingnumber',
  'ssn',
  'msisdn',
  'phonenumber',
  'mobilenumber',
  'imsi',
  'imei',
  'dateofbirth',
  'dob',
  'databaseurl',
  'redisurl',
  'dsn',
  'connectionstring',
];

const sensitiveFieldSet = new Set(SENSITIVE_FIELD_NAMES);

/**
 * Field names that are partially preserved because the shape carries diagnostic value.
 * An email domain tells us which tenant a problem belongs to without exposing the person.
 */
const PARTIAL_FIELD_NAMES = new Set(['email', 'primaryemail', 'useremail', 'emailaddress']);

const normalizeFieldName = (name: string): string => name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const isSensitiveFieldName = (name: string): boolean => {
  const normalized = normalizeFieldName(name);
  if (sensitiveFieldSet.has(normalized)) {
    return true;
  }
  for (const sensitive of sensitiveFieldSet) {
    if (normalized.length > sensitive.length && normalized.endsWith(sensitive)) {
      return true;
    }
  }
  return false;
};

/** `ada@bank.example` becomes `a***@bank.example`. */
export const maskEmail = (value: string): string => {
  const atIndex = value.lastIndexOf('@');
  if (atIndex <= 0) {
    return REDACTED;
  }
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  return `${local.slice(0, 1)}***${domain}`;
};

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const POSTGRES_URL_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s"']*/gi;
const REDIS_URL_PATTERN = /\brediss?:\/\/[^\s"']*/gi;
const PEM_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
/**
 * Candidate card numbers: 14 to 19 digits beginning with a real major industry identifier
 * (3 for Amex and Diners, 4 for Visa, 5 for Mastercard, 6 for Discover and UnionPay).
 *
 * Both constraints matter. Length alone would delete every millisecond timestamp in the
 * logs, and a Luhn check alone is not enough either — roughly one in ten arbitrary digit
 * strings satisfies it, so `1754870400000` would vanish as well. Requiring a plausible
 * prefix excludes timestamps, which begin with 1 until the year 2286.
 */
const LONG_DIGIT_RUN = /\b[3-6]\d{13,18}\b/g;

/** Standard Luhn checksum, applied after the shape test above. */
const passesLuhn = (digits: string): boolean => {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    double = !double;
  }
  return sum > 0 && sum % 10 === 0;
};

/**
 * Replaces secret-looking substrings inside free text such as an error message or a
 * stack frame, where we control neither the field name nor the format.
 */
export const redactString = (value: string): string => {
  if (value.length === 0) {
    return value;
  }

  return value
    .replace(PEM_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, (match) => `${match.split(/\s+/)[0]} ${REDACTED}`)
    .replace(POSTGRES_URL_PATTERN, REDACTED)
    .replace(REDIS_URL_PATTERN, REDACTED)
    .replace(LONG_DIGIT_RUN, (match) => (passesLuhn(match) ? REDACTED : match));
};

const MAX_DEPTH = 8;

export interface RedactionOptions {
  /** Extra field names to redact for a specific call site. */
  readonly additionalFields?: readonly string[];
  readonly maxDepth?: number;
}

/**
 * Deep-redacts a structure. Returns a new value; the input is never mutated, so a
 * redacted log line can never corrupt the object the application is still working with.
 */
export const redact = <T>(value: T, options: RedactionOptions = {}): unknown => {
  const extraFields = new Set((options.additionalFields ?? []).map(normalizeFieldName));
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const seen = new WeakSet<object>();

  const walk = (input: unknown, depth: number): unknown => {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return redactString(input);
    }

    if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
      return input;
    }

    if (typeof input === 'function' || typeof input === 'symbol') {
      return undefined;
    }

    if (input instanceof Date) {
      return input.toISOString();
    }

    if (input instanceof Error) {
      return {
        name: input.name,
        message: redactString(input.message),
        ...(input.stack === undefined ? {} : { stack: redactString(input.stack) }),
      };
    }

    if (depth >= maxDepth) {
      return '[truncated]';
    }

    if (typeof input === 'object') {
      if (seen.has(input)) {
        return '[circular]';
      }
      seen.add(input);

      if (Array.isArray(input)) {
        return input.map((item) => walk(item, depth + 1));
      }

      if (input instanceof Map) {
        return '[map]';
      }
      if (input instanceof Set) {
        return '[set]';
      }

      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(input)) {
        const normalized = normalizeFieldName(key);
        if (isSensitiveFieldName(key) || extraFields.has(normalized)) {
          output[key] = REDACTED;
          continue;
        }
        if (PARTIAL_FIELD_NAMES.has(normalized) && typeof nested === 'string') {
          output[key] = maskEmail(nested);
          continue;
        }
        output[key] = walk(nested, depth + 1);
      }
      return output;
    }

    return undefined;
  };

  return walk(value, 0);
};

/**
 * One-way digest for a value we need to correlate but must not store, such as a client
 * IP address in an audit record. Truncated because collision resistance matters less here
 * than keeping the record small and clearly non-reversible in isolation.
 */
export const hashForCorrelation = (value: string, salt: string): string =>
  createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 32);
