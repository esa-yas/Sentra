import { describe, expect, it } from 'vitest';
import {
  clearedPendingOrgMetadata,
  readPendingOrg,
  toPendingOrgMetadata,
} from '../pending-org';

describe('pending organization metadata', () => {
  // The reported bug: details entered at signup were lost when the project required email
  // confirmation, so the user was asked for them again after signing in.
  it('survives a write/read round trip', () => {
    const metadata = toPendingOrgMetadata({ name: 'Acme Bank', type: 'BANK', jurisdiction: 'US' });
    expect(readPendingOrg(metadata)).toEqual({
      name: 'Acme Bank',
      type: 'BANK',
      jurisdiction: 'US',
    });
  });

  it('normalises the jurisdiction and trims the name', () => {
    const metadata = toPendingOrgMetadata({
      name: '  Globex Telecom  ',
      type: 'TELECOM',
      jurisdiction: 'gb',
    });
    // The name is trimmed at the call site; reading must not reintroduce whitespace or case.
    expect(readPendingOrg(metadata)?.jurisdiction).toBe('GB');
    expect(readPendingOrg(metadata)?.name).toBe('Globex Telecom');
  });

  it('defaults a missing jurisdiction rather than failing', () => {
    expect(
      readPendingOrg({ pending_organization_name: 'Acme', pending_organization_type: 'BANK' }),
    ).toEqual({ name: 'Acme', type: 'BANK', jurisdiction: 'US' });
  });

  it('returns null when nothing usable is stored', () => {
    expect(readPendingOrg(null)).toBeNull();
    expect(readPendingOrg(undefined)).toBeNull();
    expect(readPendingOrg({})).toBeNull();
    // A user who signed up before this existed has other metadata but no pending org.
    expect(readPendingOrg({ full_name: 'Someone' })).toBeNull();
    // Incomplete or invalid records must not be replayed.
    expect(readPendingOrg({ pending_organization_name: 'Acme' })).toBeNull();
    expect(
      readPendingOrg({ pending_organization_name: 'Acme', pending_organization_type: 'PLATFORM' }),
    ).toBeNull();
    expect(
      readPendingOrg({ pending_organization_name: '   ', pending_organization_type: 'BANK' }),
    ).toBeNull();
  });

  it('clears every key it wrote, so the details cannot be replayed', () => {
    const written = Object.keys(
      toPendingOrgMetadata({ name: 'Acme', type: 'BANK', jurisdiction: 'US' }),
    );
    const cleared = clearedPendingOrgMetadata();
    expect(Object.keys(cleared).sort()).toEqual(written.sort());
    expect(Object.values(cleared).every((value) => value === null)).toBe(true);
    expect(readPendingOrg(cleared)).toBeNull();
  });
});
