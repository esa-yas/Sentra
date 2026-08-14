import { ComingSoon } from '@/components/ComingSoon';

export default function QueuesPage() {
  return (
    <ComingSoon
      title="Queues"
      slice="Slice 3 — durable delivery"
      summary="A BullMQ operations view: queue depth, waiting/active/completed/delayed/retried/failed jobs, dead-letter candidates, attempt counts, next retry time, and job correlation ids."
      planned={[
        'Live queue stats backed by a real Redis + BullMQ adapter',
        'Attempt counts, next-retry times, and dead-letter candidates',
        'Safe development-only actions: retry, replay, controlled duplicate, advance a fake-clock job',
        'Production mutations gated behind explicit permission and audit logging',
      ]}
    />
  );
}
