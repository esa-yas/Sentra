import { describe, expect, it } from 'vitest';
import { assertNoForbiddenFields, findForbiddenFields } from '../deny-list';
import { ForbiddenFieldError } from '../errors';

describe('payload deny-list', () => {
  it('accepts a payment intent built from opaque references', () => {
    const payload = {
      intentId: '01JAYQ4M8Z3K1N9P0QRSTVWXYZ',
      payerRef: 'bank_pairwise_9f2c4d6e8a0b2c4d6e8f0a1b',
      payeeRef: 'beneficiary_token_1a2b3c4d5e6f7a8b9c0d1e2f',
      amountMinor: 250_000,
      currency: 'GBP',
      channel: 'MOBILE',
      deviceRisk: 'ELEVATED',
    };

    expect(findForbiddenFields(payload)).toEqual([]);
    expect(() => {
      assertNoForbiddenFields(payload);
    }).not.toThrow();
  });

  it.each([
    ['pan', { pan: '4111111111111111' }, 'pan'],
    ['cvv', { cvv: '123' }, 'cvv'],
    ['iban', { payerIban: 'GB33BUKB20201555555555' }, 'payerIban'],
    ['snake case account number', { payee_account_number: '12345678' }, 'payee_account_number'],
    ['raw telephone number', { msisdn: '+447700900123' }, 'msisdn'],
    ['credential', { clientSecret: 'super-secret-value' }, 'clientSecret'],
    ['date of birth', { dateOfBirth: '1970-01-01' }, 'dateOfBirth'],
  ])('refuses a payload carrying %s', (_label, payload, expectedPath) => {
    expect(findForbiddenFields(payload)).toContain(expectedPath);
    expect(() => {
      assertNoForbiddenFields(payload);
    }).toThrow(ForbiddenFieldError);
  });

  it('reports the full path of a nested forbidden field', () => {
    const payload = { customer: { contact: { phoneNumber: '+447700900123' } } };

    expect(findForbiddenFields(payload)).toEqual(['customer.contact.phoneNumber']);
  });

  it('reports forbidden fields inside arrays', () => {
    const payload = { payees: [{ label: 'ok' }, { sortCode: '20-20-15' }] };

    expect(findForbiddenFields(payload)).toEqual(['payees[1].sortCode']);
  });

  it('catches a card number hidden behind an innocuous field name', () => {
    // A partner bug could place card data in a free-text field. Name matching alone
    // would miss it, so values are checked with a Luhn test as well.
    const payload = { reference: '4111 1111 1111 1111' };

    expect(findForbiddenFields(payload)).toEqual(['reference']);
  });

  it('does not mistake an ordinary numeric reference for a card number', () => {
    // Fails the Luhn check, so it must be accepted.
    const payload = { reference: '1234567890123' };

    expect(findForbiddenFields(payload)).toEqual([]);
  });

  it('does not mistake a long run of zeros for a card number', () => {
    expect(findForbiddenFields({ reference: '0000000000000' })).toEqual([]);
  });

  it('does not flag a legitimate field whose name merely ends in a short forbidden word', () => {
    // `panel` ends with `pan` but is a different word; suffix matching must not fire.
    expect(findForbiddenFields({ panel: 'review' })).toEqual([]);
  });

  it('terminates on a self-referential payload', () => {
    const payload: Record<string, unknown> = { label: 'root' };
    payload.self = payload;

    expect(() => findForbiddenFields(payload)).not.toThrow();
  });

  it('lists every offending field so a partner can fix them in one pass', () => {
    const payload = { pan: '4111111111111111', cvv: '123', payerIban: 'GB33BUKB20201555555555' };

    expect(findForbiddenFields(payload)).toHaveLength(3);
  });

  it('names the offending paths on the thrown error', () => {
    try {
      assertNoForbiddenFields({ cvv: '123' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenFieldError);
      expect((error as ForbiddenFieldError).details).toEqual({ fieldPaths: ['cvv'] });
      // The message must never echo the offending value back.
      expect((error as ForbiddenFieldError).message).not.toContain('123');
    }
  });
});
