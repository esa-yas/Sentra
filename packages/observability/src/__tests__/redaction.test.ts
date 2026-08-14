import { describe, expect, it } from 'vitest';
import { REDACTED, maskEmail, redact, redactString } from '../redaction';

describe('redactString', () => {
  it('removes a JSON web token from free text', () => {
    const message =
      'verification failed for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

    expect(redactString(message)).toBe(`verification failed for ${REDACTED}`);
  });

  it('keeps the authentication scheme but removes the credential', () => {
    // The scheme is useful when diagnosing why a request was rejected; the value is not.
    expect(redactString('header: Bearer abcdef1234567890')).toBe(`header: Bearer ${REDACTED}`);
    expect(redactString('header: Basic dXNlcjpwYXNzd29yZA==')).toBe(`header: Basic ${REDACTED}`);
  });

  it('removes a PostgreSQL connection string with embedded credentials', () => {
    expect(redactString('connect failed: postgresql://user:hunter2@db.example.com:5432/sentra')).toBe(
      `connect failed: ${REDACTED}`,
    );
  });

  it('removes a Redis connection string', () => {
    expect(redactString('rediss://default:secret@cache.example.com:6379')).toBe(REDACTED);
  });

  it('removes a private key block', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADAN\n-----END PRIVATE KEY-----';

    expect(redactString(`key was ${pem}`)).toBe(`key was ${REDACTED}`);
  });

  it('removes a card number that appears in free text', () => {
    expect(redactString('reference 4111111111111111 supplied')).toBe(`reference ${REDACTED} supplied`);
  });

  it('preserves a millisecond timestamp', () => {
    // This value satisfies the Luhn checksum by coincidence, so a checksum-only rule
    // would delete every timestamp in the logs. The prefix constraint keeps it.
    expect(redactString('observedAt=1754870400000')).toBe('observedAt=1754870400000');
  });

  it('preserves an ordinary long identifier', () => {
    expect(redactString('rowCount=1234567890123')).toBe('rowCount=1234567890123');
  });

  it('preserves a long digit run that cannot be a card number', () => {
    // Starts with 9, so it fails the major-industry-identifier test regardless of length.
    expect(redactString('sequence=9876543210987654')).toBe('sequence=9876543210987654');
  });

  it('removes a 15-digit American Express number', () => {
    expect(redactString('card 378282246310005 seen')).toBe(`card ${REDACTED} seen`);
  });

  it('leaves an empty string alone', () => {
    expect(redactString('')).toBe('');
  });
});

describe('maskEmail', () => {
  it('keeps the domain so a tenant remains identifiable', () => {
    expect(maskEmail('ada.lovelace@bank.example')).toBe('a***@bank.example');
  });

  it('redacts a value that is not an email address', () => {
    expect(maskEmail('not-an-email')).toBe(REDACTED);
  });
});

describe('redact', () => {
  it('replaces sensitive fields by name', () => {
    const result = redact({
      clientId: 'sentra_client_abc',
      clientSecret: 'super-secret',
      password: 'hunter2',
      accessToken: 'abc.def.ghi',
    }) as Record<string, unknown>;

    expect(result.clientId).toBe('sentra_client_abc');
    expect(result.clientSecret).toBe(REDACTED);
    expect(result.password).toBe(REDACTED);
    expect(result.accessToken).toBe(REDACTED);
  });

  it('matches a sensitive suffix in a longer field name', () => {
    const result = redact({ partnerClientSecret: 'x', supabaseServiceRoleKey: 'y' }) as Record<string, unknown>;

    expect(result.partnerClientSecret).toBe(REDACTED);
    expect(result.supabaseServiceRoleKey).toBe(REDACTED);
  });

  it('matches field names regardless of casing or separators', () => {
    const result = redact({ client_secret: 'a', 'Client-Secret': 'b', CLIENTSECRET: 'c' }) as Record<
      string,
      unknown
    >;

    expect(Object.values(result)).toEqual([REDACTED, REDACTED, REDACTED]);
  });

  it('partially masks an email address instead of removing it', () => {
    const result = redact({ primaryEmail: 'ada@bank.example' }) as Record<string, unknown>;

    expect(result.primaryEmail).toBe('a***@bank.example');
  });

  it('redacts nested structures and arrays', () => {
    const result = redact({
      members: [{ email: 'ada@bank.example', token: 'abc' }],
      nested: { deeper: { apiKey: 'k' } },
    }) as { members: Array<Record<string, unknown>>; nested: { deeper: Record<string, unknown> } };

    expect(result.members[0]?.email).toBe('a***@bank.example');
    expect(result.members[0]?.token).toBe(REDACTED);
    expect(result.nested.deeper.apiKey).toBe(REDACTED);
  });

  it('does not mutate the input', () => {
    const input = { clientSecret: 'super-secret' };

    redact(input);

    expect(input.clientSecret).toBe('super-secret');
  });

  it('handles a circular reference without recursing forever', () => {
    const input: Record<string, unknown> = { name: 'root' };
    input.self = input;

    const result = redact(input) as Record<string, unknown>;

    expect(result.self).toBe('[circular]');
  });

  it('truncates beyond the depth limit', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 'too deep' } } } } } } } } };

    expect(JSON.stringify(redact(deep))).toContain('[truncated]');
  });

  it('converts an error into a redacted plain object', () => {
    const error = new Error('failed to reach postgresql://user:pw@host:5432/db');

    const result = redact({ error }) as { error: { name: string; message: string } };

    expect(result.error.name).toBe('Error');
    expect(result.error.message).toBe(`failed to reach ${REDACTED}`);
  });

  it('honours additional field names supplied by the caller', () => {
    const result = redact({ payerRef: 'abc' }, { additionalFields: ['payerRef'] }) as Record<string, unknown>;

    expect(result.payerRef).toBe(REDACTED);
  });

  it('serialises a date rather than emitting an empty object', () => {
    const result = redact({ occurredAt: new Date('2026-08-11T00:00:00.000Z') }) as Record<string, unknown>;

    expect(result.occurredAt).toBe('2026-08-11T00:00:00.000Z');
  });

  it('drops functions, which can close over secrets', () => {
    const result = redact({ callback: () => 'x', keep: 1 }) as Record<string, unknown>;

    expect(result.callback).toBeUndefined();
    expect(result.keep).toBe(1);
  });
});
