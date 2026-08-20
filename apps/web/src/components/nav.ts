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
}

/** The MVP navigation, in the order the brief specifies. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', href: '/', status: 'live', permission: 'organization:read' },
  { label: 'Scam Cases', href: '/cases', status: 'live', permission: 'recommendation:read' },
  { label: 'API Activity', href: '/api-activity', status: 'live', permission: 'partner:read' },
  { label: 'Partners', href: '/partners', status: 'live', permission: 'partner:read' },
  { label: 'Members', href: '/members', status: 'live', permission: 'member:read' },
  { label: 'Audit Chain', href: '/audit-chain', status: 'live', permission: 'audit:read' },
];
