import type { Permission } from '@sentra/contracts';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  /** Whether the screen is functional in the current slice or an honest placeholder. */
  readonly status: 'live' | 'planned';
  /**
   * Permission required to see this item. Absent means every member sees it. This drives
   * role-aware navigation; the API endpoints enforce the actual authorization. The literals
   * are type-checked against `Permission` (a type-only import, so no runtime contract code is
   * pulled into the browser bundle).
   */
  readonly permission?: Permission;
  /**
   * Restricts the item to members of a PLATFORM organization (the network operator). Customer
   * tenants (banks, telecoms) never see it — partner provisioning is an operator function.
   */
  readonly platformOnly?: boolean;
  /** Opens in a new tab (e.g. the public docs, which render outside the console shell). */
  readonly external?: boolean;
}

/** The MVP navigation, in the order the brief specifies. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', href: '/', status: 'live', permission: 'organization:read' },
  { label: 'Scam Cases', href: '/cases', status: 'live', permission: 'recommendation:read' },
  { label: 'API Keys', href: '/keys', status: 'live', permission: 'partner:read' },
  { label: 'API Activity', href: '/api-activity', status: 'live', permission: 'partner:read', platformOnly: true },
  { label: 'Partners', href: '/partners', status: 'live', permission: 'partner:read', platformOnly: true },
  { label: 'Members', href: '/members', status: 'live', permission: 'member:read' },
  { label: 'Audit Chain', href: '/audit-chain', status: 'live', permission: 'audit:read' },
  { label: 'Organization', href: '/organization', status: 'live', permission: 'organization:read' },
  { label: 'API Docs', href: '/docs', status: 'live', external: true },
];
