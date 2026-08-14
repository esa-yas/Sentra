import { ComingSoon } from '@/components/ComingSoon';

export default function ApiActivityPage() {
  return (
    <ComingSoon
      title="API Activity"
      slice="Slice 4 — trust edge"
      summary="A developer-facing view of API requests: endpoint, method, status, duration, correlation id, partner identity, auth result, idempotency status, and redacted request/response summaries."
      planned={[
        'Per-request rows with correlation id and redacted request/response summaries',
        'Partner authentication result and idempotency status',
        'Documented sample requests for ingestion, recommendation retrieval, outcome submission, and health',
        'Stable machine-readable error codes surfaced per request',
      ]}
    />
  );
}
