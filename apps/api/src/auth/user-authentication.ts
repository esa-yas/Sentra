import { InvalidTokenError } from '@sentra/contracts';
import type { Request } from 'express';

/**
 * Extracts the bearer token from the `Authorization` header, or throws
 * {@link InvalidTokenError}. The raw token is never logged; only the verified principal that
 * results from it is surfaced downstream.
 */
export const bearerTokenFrom = (req: Request): string => {
  const header = req.header('authorization');
  if (header === undefined || !/^Bearer\s+/i.test(header)) {
    throw new InvalidTokenError();
  }
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (token === '') {
    throw new InvalidTokenError();
  }
  return token;
};
