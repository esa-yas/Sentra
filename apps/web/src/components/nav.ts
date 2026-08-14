export interface NavItem {
  readonly label: string;
  readonly href: string;
  /** Whether the screen is functional in the current slice or an honest placeholder. */
  readonly status: 'live' | 'planned';
}

/** The MVP navigation, in the order the brief specifies. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', href: '/', status: 'live' },
  { label: 'Live Events', href: '/events', status: 'live' },
  { label: 'Scam Cases', href: '/cases', status: 'live' },
  { label: 'Risk Simulator', href: '/simulator', status: 'live' },
  { label: 'System Flow', href: '/system-flow', status: 'live' },
  { label: 'API Activity', href: '/api-activity', status: 'planned' },
  { label: 'Queues', href: '/queues', status: 'planned' },
  { label: 'Audit Chain', href: '/audit-chain', status: 'planned' },
  { label: 'Integrations', href: '/integrations', status: 'live' },
  { label: 'System Health', href: '/system-health', status: 'live' },
  { label: 'Development Progress', href: '/development', status: 'live' },
];
