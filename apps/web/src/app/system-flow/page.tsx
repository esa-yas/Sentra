'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FlowRun, FlowStageResult, OutboxEventView } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, CorrelationTag, EmptyState, Panel } from '@/components/ui';
import { getEvents, getFlow, getLatestFlow, getOutbox } from '@/lib/api';
import { flowStatusClass } from '@/lib/theme';
import { formatMs } from '@/lib/format';

export default function SystemFlowPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading flow…</div>}>
      <SystemFlowInner />
    </Suspense>
  );
}

function SystemFlowInner() {
  const params = useSearchParams();
  const correlationId = params.get('correlationId');

  const [flow, setFlow] = useState<FlowRun | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = correlationId !== null ? await getFlow(correlationId) : await getLatestFlow();
      if (active && result.data !== undefined) {
        setFlow(result.data);
      }
    };
    void load();
    // When pinned to a correlation id, the flow is immutable; otherwise poll for new runs.
    if (correlationId === null) {
      const timer = setInterval(() => void load(), 4000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }
    return () => {
      active = false;
    };
  }, [correlationId]);

  const completedCount = useMemo(
    () => (flow?.stages ?? []).filter((s) => s.status === 'COMPLETED').length,
    [flow],
  );

  // Animate the pipeline lighting up stage by stage whenever a new run loads.
  useEffect(() => {
    if (flow === null || flow.decisionId === '') {
      setRevealed(flow?.stages.length ?? 0);
      return;
    }
    setRevealed(0);
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setRevealed(current);
      if (current >= flow.stages.length) {
        clearInterval(timer);
      }
    }, 220);
    return () => clearInterval(timer);
  }, [flow]);

  const selectedStage = flow?.stages.find((s) => s.stage === selected) ?? null;

  return (
    <>
      <PageHeader
        title="System Flow"
        description="Follow one synthetic telecom signal and payment intent through the end-to-end pipeline. Downstream bank stages are pending until the trust edge (Slice 4)."
        actions={flow !== null ? <CorrelationTag correlationId={flow.correlationId} /> : undefined}
      />

      {flow === null ? (
        <EmptyState title="Loading" description="Fetching the latest synthetic run." />
      ) : flow.decisionId === '' ? (
        <Panel>
          <EmptyState
            title="No run yet"
            description="Run a scenario in the Risk Simulator to watch the pipeline light up here."
          />
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Panel title="Pipeline" description={`${completedCount} of ${flow.stages.length} stages completed for this run.`}>
            <ol className="space-y-2">
              {flow.stages.map((stage, index) => {
                const visible = index < revealed;
                const isSelected = stage.stage === selected;
                return (
                  <li key={stage.stage}>
                    <button
                      type="button"
                      onClick={() => setSelected(stage.stage)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all duration-300 ${
                        flowStatusClass[stage.status]
                      } ${visible ? 'opacity-100' : 'opacity-30'} ${
                        isSelected ? 'ring-2 ring-sky-500/60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs tabular-nums">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{stage.label}</p>
                          <p className="text-xs opacity-70">{stage.module}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wide">{stage.status}</span>
                        <p className="text-xs opacity-70">{formatMs(stage.durationMs)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel title="Stage detail">
            {selectedStage === null ? (
              <p className="text-sm text-slate-500">Select a stage to inspect its module, inputs, outputs, and failure behaviour.</p>
            ) : (
              <StageDetail stage={selectedStage} />
            )}
          </Panel>

          <div className="lg:col-span-2">
            <DeliveryPanel correlationId={flow.correlationId} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Durable-delivery trail for the selected case. Every state is derived from real persisted
 * data — the outbox row status and the worker's delivery operational event — never a
 * hardcoded animation.
 */
function DeliveryPanel({ correlationId }: { correlationId: string }) {
  const [event, setEvent] = useState<OutboxEventView | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [outboxResult, eventsResult] = await Promise.all([
        getOutbox({ correlationId, limit: 5 }),
        getEvents({ type: 'notification.dispatched', limit: 200 }),
      ]);
      if (!active) {
        return;
      }
      const match = outboxResult.data?.items.find((item) => item.eventType === 'recommendation.issued') ?? null;
      setEvent(match);
      setConfigured(outboxResult.ok);
      const done = (eventsResult.data?.items ?? []).some(
        (item) => item.correlationId === correlationId && item.provider === 'worker.recommendation-events',
      );
      setDelivered(done);
    };
    void load();
    const timer = setInterval(() => void load(), 3500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [correlationId]);

  const status = event?.status ?? null;
  const failed = status === 'FAILED' || status === 'DEAD_LETTER';

  const stages: { label: string; module: string; done: boolean; failed?: boolean }[] = [
    { label: 'Recommendation persisted', module: 'core/decision → PostgreSQL', done: event !== null },
    { label: 'Outbox pending', module: 'transactional outbox (committed)', done: event !== null },
    {
      label: 'Outbox claimed',
      module: 'publisher · FOR UPDATE SKIP LOCKED',
      done: status === 'PUBLISHING' || status === 'PUBLISHED' || event?.claimedAt != null,
      failed,
    },
    { label: 'BullMQ published', module: 'recommendation-events queue', done: status === 'PUBLISHED' },
    { label: 'Worker processing', module: 'BullMQ consumer (idempotent)', done: status === 'PUBLISHED' },
    { label: 'Consumer completed', module: 'inbox-guarded delivery record', done: delivered },
  ];

  return (
    <Panel
      title="Durable delivery"
      description="At-least-once delivery of the recommendation.issued event. State reflects the real outbox row and the worker's delivery record."
    >
      {!configured ? (
        <EmptyState title="Not available" description="Durable delivery is not wired in this provider mode." />
      ) : event === null ? (
        <EmptyState
          title="No outbox event yet"
          description="This run has no recommendation.issued outbox row. In real mode a synthetic evaluation commits one."
        />
      ) : (
        <ol className="grid gap-2 md:grid-cols-3">
          {stages.map((stage, index) => {
            const state = stage.failed === true ? 'FAILED' : stage.done ? 'COMPLETED' : 'PENDING';
            return (
              <li
                key={stage.label}
                className={`rounded-lg border px-4 py-3 ${flowStatusClass[state]}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] tabular-nums">
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium">{stage.label}</p>
                </div>
                <p className="mt-1 text-xs opacity-70">{stage.module}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide">{state}</p>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function StageDetail({ stage }: { stage: FlowStageResult }) {
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Status</span>
        <Badge className={flowStatusClass[stage.status]}>{stage.status}</Badge>
      </div>
      <Row label="Module" value={stage.module} mono />
      <Row label="Duration" value={formatMs(stage.durationMs)} />
      <Row label="Correlation" value={stage.correlationId} mono />
      <Row label="Input" value={stage.inputSummary} />
      <Row label="Output" value={stage.outputSummary} />
      <Row label="Failure behaviour" value={stage.failureBehavior} />
      <Row label="Audit event" value={stage.relatedAuditEventId ?? '—'} mono />
    </dl>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-slate-200 ${mono ? 'break-all font-mono text-xs' : 'text-sm'}`}>{value}</dd>
    </div>
  );
}
