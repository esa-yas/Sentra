import { canonicalizePath } from '@sentra/contracts';

/**
 * Path bound into the signature. Uses the original request URL so a router mount such as
 * `/v1` cannot change what the partner signed.
 */
export const requestCanonicalPath = (req: {
  readonly originalUrl?: string;
  readonly url?: string;
  readonly baseUrl?: string;
  readonly path: string;
}): string => {
  const combined = `${req.baseUrl ?? ''}${req.path}`;
  const raw = req.originalUrl ?? (combined.length > 0 ? combined : req.url) ?? req.path;
  return canonicalizePath(String(raw).split('?')[0] ?? '/');
};
