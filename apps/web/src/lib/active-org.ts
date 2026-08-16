/**
 * The organization the operator is currently acting on, persisted in localStorage so the API
 * client can attach it (`X-Organization-Id`) without importing React state. A single-org user
 * never needs this — the API resolves their sole membership server-side.
 */
const ACTIVE_ORG_KEY = 'sentra.active-org';

export const readActiveOrg = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
};

export const writeActiveOrg = (organizationId: string): void => {
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
  } catch {
    // Storage unavailable (private mode); the server default still applies.
  }
};

export const clearActiveOrg = (): void => {
  try {
    window.localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    // ignore
  }
};
