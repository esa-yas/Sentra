/**
 * The organization details a visitor fills in during signup, carried on the Supabase user record
 * so they survive email confirmation.
 *
 * When a project requires email confirmation, `signUp` returns no session, so the organization
 * cannot be created yet — the details would otherwise be discarded and the user asked for them a
 * second time after signing in. Storing them as user metadata keeps them with the account (not a
 * browser), so confirming the email on a different device still finishes setup cleanly.
 */
export interface PendingOrganization {
  readonly name: string;
  readonly type: 'BANK' | 'TELECOM';
  readonly jurisdiction: string;
}

export const PENDING_ORG_METADATA = {
  name: 'pending_organization_name',
  type: 'pending_organization_type',
  jurisdiction: 'pending_organization_jurisdiction',
} as const;

/** Shapes the metadata written at signup. */
export const toPendingOrgMetadata = (
  pending: PendingOrganization,
): Record<string, string> => ({
  [PENDING_ORG_METADATA.name]: pending.name,
  [PENDING_ORG_METADATA.type]: pending.type,
  [PENDING_ORG_METADATA.jurisdiction]: pending.jurisdiction,
});

/** Clears the metadata once the organization exists, so it can never be replayed. */
export const clearedPendingOrgMetadata = (): Record<string, null> => ({
  [PENDING_ORG_METADATA.name]: null,
  [PENDING_ORG_METADATA.type]: null,
  [PENDING_ORG_METADATA.jurisdiction]: null,
});

const readString = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
};

/**
 * Reads back the pending organization, or null when nothing usable is stored. Only a complete,
 * valid record is returned — a partial one would fail validation server-side anyway.
 */
export const readPendingOrg = (metadata: unknown): PendingOrganization | null => {
  if (metadata === null || typeof metadata !== 'object') {
    return null;
  }
  const source = metadata as Record<string, unknown>;
  const name = readString(source, PENDING_ORG_METADATA.name);
  const type = readString(source, PENDING_ORG_METADATA.type);
  const jurisdiction = readString(source, PENDING_ORG_METADATA.jurisdiction);
  if (name === null || (type !== 'BANK' && type !== 'TELECOM')) {
    return null;
  }
  return {
    name,
    type,
    jurisdiction: (jurisdiction ?? 'US').toUpperCase().slice(0, 2),
  };
};
