import { ForbiddenFieldError } from './errors';

/**
 * Fields the platform refuses to accept.
 *
 * Slides 015 and 031 state the boundary plainly: the network evaluates a tokenized
 * payment proposal and never needs payment credentials or raw identifiers. Rejecting
 * these outright — rather than accepting and discarding them — means a partner
 * integration bug cannot quietly turn us into a processor of card data, and it gives the
 * partner immediate feedback during certification.
 */
const FORBIDDEN_FIELD_NAMES: readonly string[] = [
  // Card data
  'pan',
  'cardnumber',
  'cardno',
  'primaryaccountnumber',
  'cvv',
  'cvv2',
  'cvc',
  'cvc2',
  'cid',
  'expirydate',
  'expmonth',
  'expyear',
  'track1',
  'track2',
  'magstripe',
  // Bank credentials and raw account identifiers
  'password',
  'passcode',
  'pin',
  'otp',
  'mfacode',
  'securityanswer',
  'accountnumber',
  'accountno',
  'iban',
  'bban',
  'sortcode',
  'routingnumber',
  'swift',
  'bic',
  // Government and personal identifiers
  'ssn',
  'socialsecuritynumber',
  'nationalinsurancenumber',
  'nino',
  'taxid',
  'passportnumber',
  'driverslicense',
  'dateofbirth',
  'dob',
  // Raw telecom identifiers. Only pairwise, opaque references may be submitted.
  'msisdn',
  'phonenumber',
  'mobilenumber',
  'imsi',
  'imei',
  // Secrets that should never travel in a business payload
  'privatekey',
  'secretkey',
  'clientsecret',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'sessiontoken',
];

const forbiddenFieldSet = new Set(FORBIDDEN_FIELD_NAMES);

/** Normalizes `payee_account_number`, `payeeAccountNumber`, and `PayeeAccountNumber` alike. */
const normalizeFieldName = (name: string): string => name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

/**
 * A field name matches when its normalized form equals a forbidden name or ends with one,
 * so `payerIban` and `beneficiary_account_number` are both caught while `panel` is not.
 */
const isForbiddenFieldName = (name: string): boolean => {
  const normalized = normalizeFieldName(name);
  if (forbiddenFieldSet.has(normalized)) {
    return true;
  }
  for (const forbidden of forbiddenFieldSet) {
    // Require a length difference so a longer legitimate word is not swallowed by a
    // short forbidden name that merely happens to be a suffix.
    if (normalized.length > forbidden.length && normalized.endsWith(forbidden)) {
      return true;
    }
  }
  return false;
};

const LUHN_CANDIDATE = /^\d{13,19}$/;

/** Standard Luhn check, used to spot a card number hiding in an innocuously named field. */
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
  // `sum > 0` rejects an all-zero string, which satisfies the modulus but is not a card.
  return sum > 0 && sum % 10 === 0;
};

const looksLikeCardNumber = (value: string): boolean => {
  const digitsOnly = value.replace(/[\s-]/g, '');
  return LUHN_CANDIDATE.test(digitsOnly) && passesLuhn(digitsOnly);
};

const MAX_INSPECTION_DEPTH = 12;

/**
 * Walks a decoded request body and collects the paths of every field the platform must
 * not receive, by name or by value shape.
 */
export const findForbiddenFields = (payload: unknown): readonly string[] => {
  const offendingPaths: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > MAX_INSPECTION_DEPTH || value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      if (looksLikeCardNumber(value)) {
        offendingPaths.push(path === '' ? '<root>' : path);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(item, `${path}[${index}]`, depth + 1);
      });
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      if (isForbiddenFieldName(key)) {
        offendingPaths.push(childPath);
        // Do not descend: the subtree is already refused, and walking it would only
        // duplicate findings.
        continue;
      }
      walk(nested, childPath, depth + 1);
    }
  };

  walk(payload, '', 0);
  return offendingPaths;
};

/** Throws {@link ForbiddenFieldError} when the payload carries a prohibited field. */
export const assertNoForbiddenFields = (payload: unknown): void => {
  const offendingPaths = findForbiddenFields(payload);
  if (offendingPaths.length > 0) {
    throw new ForbiddenFieldError(offendingPaths);
  }
};
