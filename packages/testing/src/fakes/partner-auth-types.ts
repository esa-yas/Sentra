import type { PartnerScope, Purpose } from '@sentra/contracts';

export interface FakePartnerConnection {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly organizationId: string;
  readonly organizationType: 'BANK' | 'TELECOM' | 'PLATFORM';
  readonly partnerConnectionId: string;
  readonly scopes: readonly PartnerScope[];
  readonly allowedPurposes: readonly Purpose[];
  readonly ipAllowlist: readonly string[];
  readonly tokenTtlSeconds: number;
}

export interface FakePartnerConnectionRegistrar {
  registerConnection(connection: FakePartnerConnection): void;
}
