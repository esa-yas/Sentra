import { ComingSoon } from '@/components/ComingSoon';

export default function AuditChainPage() {
  return (
    <ComingSoon
      title="Audit Chain"
      slice="Slice 2 — persistence"
      summary="A dedicated audit-chain viewer with a real 'Verify chain' operation. Hash-chained audit events already appear on the Risk Simulator and case detail today; this screen adds chain-wide navigation and verification once the events are persisted."
      planned={[
        'Chain id, sequence, event type, actor, purpose, timestamp, previous/current hash',
        'A Verify chain operation calling the real canonical v1 verification logic',
        'Distinct results: valid chain, broken link, missing record, hash mismatch, and verification duration',
        'No second hash algorithm in the frontend — verification runs server-side',
      ]}
    />
  );
}
