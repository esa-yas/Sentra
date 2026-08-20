'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  OutboxEventView,
  QueueJobView,
  QueueMonitorSummary,
  ProviderHealth,
} from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton, StatCard } from '@/components/ui';
import { providerStateClass } from '@/lib/theme';
import { formatTime, humanizeCode } from '@/lib/format';
import {
  duplicateOutboxDelivery,
  getOutbox,
  getQueueJobs,
  getQueueMonitor,
  replayOutboxEvent,
  retryQueueJob,
  type ApiError,
} from '@/lib/api';

const RECOMMENDATION_QUEUE = 'recommendation-events';

const STATE_LABEL: Record<string, string> = {
  CONNECTED: 'Connected',
  DEGRADED: 'Degraded',
  UNAVAILABLE: 'Unavailable',
  NOT_CONFIGURED: 'Not configured',
};

const outboxStatusClass: Record<string, string> = {
  PENDING: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  PUBLISHING: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  FAILED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  DEAD_LETTER: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const jobStateClass: Record<string, string> = {
  waiting: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  active: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  delayed: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  unknown: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
};

const OUTBOX_STATUS_OPTIONS = ['PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER'];
const JOB_STATE_OPTIONS = ['waiting', 'active', 'delayed', 'completed', 'failed'];

interface Confirming {
  readonly kind: 'retry' | 'replay' | 'duplicate';
  readonly id: string;
  readonly label: string;
}

export default function QueuesPage() {
  const [summary, setSummary] = useState<QueueMonitorSummary | null>(null);
  const [outbox, setOutbox] = useState<OutboxEventView[]>([]);
  const [jobs, setJobs] = useState<QueueJobView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const [outboxFilters, setOutboxFilters] = useState({ status: '', eventType: '', correlationId: '' });
  const [jobFilters, setJobFilters] = useState({ state: '', eventType: '', correlationId: '' });

  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [summaryResult, outboxResult, jobsResult] = await Promise.all([
      getQueueMonitor(),
      getOutbox({
        status: outboxFilters.status || undefined,
        eventType: outboxFilters.eventType || undefined,
        correlationId: outboxFilters.correlationId || undefined,
        limit: 25,
      }),
      getQueueJobs(RECOMMENDATION_QUEUE, {
        state: jobFilters.state || undefined,
        eventType: jobFilters.eventType || undefined,
        correlationId: jobFilters.correlationId || undefined,
        limit: 25,
      }),
    ]);

    if (summaryResult.data !== undefined) {
      setSummary(summaryResult.data);
      setError(null);
    } else if (summaryResult.error !== undefined) {
      setError(summaryResult.error);
    }
    if (outboxResult.data !== undefined) {
      setOutbox(outboxResult.data.items);
    }
    if (jobsResult.data !== undefined) {
      setJobs(jobsResult.data.items);
    }
    setLoading(false);
  }, [outboxFilters, jobFilters]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3500);
    return () => clearInterval(timer);
  }, [load]);

  const runConfirmedAction = async () => {
    if (confirming === null) {
      return;
    }
    const action =
      confirming.kind === 'retry'
        ? retryQueueJob(RECOMMENDATION_QUEUE, confirming.id)
        : confirming.kind === 'replay'
          ? replayOutboxEvent(confirming.id)
          : duplicateOutboxDelivery(confirming.id);
    const result = await action;
    setConfirming(null);
    if (result.data !== undefined) {
      setActionNote(result.data.detail);
    } else if (result.error !== undefined) {
      setActionNote(result.error.message);
    }
    void load();
  };

  const notConfigured = summary !== null && summary.redis.state === 'NOT_CONFIGURED';

  return (
    <>
      <PageHeader
        title="Queue Monitor"
        description="Durable delivery: the transactional outbox, the BullMQ recommendation-events queue, and the idempotent worker. Every payload preview is redacted. Delivery is at-least-once; duplicates are tolerated by the inbox."
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}

      {actionNote !== null && (
        <div className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <div className="flex items-center justify-between gap-4">
            <span>{actionNote}</span>
            <button type="button" onClick={() => setActionNote(null)} className="text-xs text-sky-300 hover:text-sky-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {notConfigured && (
        <div className="mb-4 rounded-lg border border-slate-600/40 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
          Durable delivery is not wired in this provider mode. Start the API in <span className="font-mono">real</span> mode
          (with Redis and the worker running) to populate this screen.
        </div>
      )}

      {loading && summary === null ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : summary === null ? (
        <Panel>
          <EmptyState title="No queue data" description="The API returned no durable-delivery summary." />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <HealthCard health={summary.redis} />
            <HealthCard health={summary.worker} />
            <HealthCard health={summary.publisher} />
            <HealthCard health={summary.queueTransport} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Outbox pending" value={summary.outbox.pending} tone={summary.outbox.pending > 0 ? 'warn' : 'default'} />
            <StatCard label="Claimed" value={summary.outbox.publishing} />
            <StatCard label="Published" value={summary.outbox.published} tone="good" />
            <StatCard label="Failed" value={summary.outbox.failed} tone={summary.outbox.failed > 0 ? 'warn' : 'default'} />
            <StatCard label="Dead letter" value={summary.outbox.deadLetter} tone={summary.outbox.deadLetter > 0 ? 'bad' : 'default'} />
            <StatCard
              label="Oldest pending"
              value={summary.outbox.oldestPendingAgeMs === null ? '—' : formatAge(summary.outbox.oldestPendingAgeMs)}
              hint="age of the oldest un-published outbox row"
            />
          </div>

          <div className="mt-4">
            <Panel title="Queues" description="BullMQ job counts per queue. Delivery is at-least-once.">
              <div className="grid gap-3 md:grid-cols-3">
                {summary.queues.map((queue) => (
                  <div key={queue.name} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-200">{queue.name}</span>
                      <Badge className={providerStateClass[queue.state] ?? providerStateClass.NOT_CONFIGURED}>
                        {queue.paused ? 'Paused' : STATE_LABEL[queue.state] ?? queue.state}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px]">
                      <Count label="wait" value={queue.counts.waiting} />
                      <Count label="active" value={queue.counts.active} />
                      <Count label="delay" value={queue.counts.delayed} />
                      <Count label="done" value={queue.counts.completed} />
                      <Count label="fail" value={queue.counts.failed} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              title={`Outbox events (${outbox.length})`}
              description="Committed with the recommendation, then claimed and published by the publisher."
              actions={
                <button
                  type="button"
                  onClick={() => setOutboxFilters({ status: '', eventType: '', correlationId: '' })}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear filters
                </button>
              }
            >
              <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <FilterSelect label="Status" value={outboxFilters.status} options={OUTBOX_STATUS_OPTIONS} onChange={(v) => setOutboxFilters((f) => ({ ...f, status: v }))} />
                <TextFilter label="Event type" value={outboxFilters.eventType} placeholder="recommendation.issued" onChange={(v) => setOutboxFilters((f) => ({ ...f, eventType: v }))} />
                <TextFilter label="Correlation id" value={outboxFilters.correlationId} placeholder="crl_…" onChange={(v) => setOutboxFilters((f) => ({ ...f, correlationId: v }))} />
              </div>

              {outbox.length === 0 ? (
                <EmptyState title="No outbox events" description="Run a synthetic evaluation to commit a recommendation.issued outbox row." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr className="border-b border-slate-800">
                        <th className="py-2 pr-3 font-medium">Event id</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Attempts</th>
                        <th className="py-2 pr-3 font-medium">Created</th>
                        <th className="py-2 pr-3 font-medium">Published</th>
                        <th className="py-2 pr-3 font-medium">Correlation</th>
                        <th className="py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {outbox.map((event) => (
                        <tr key={event.eventId} className="border-b border-slate-900 align-top hover:bg-slate-900/40">
                          <td className="py-2 pr-3 font-mono text-slate-400" title={event.eventId}>{shorten(event.eventId)}</td>
                          <td className="py-2 pr-3">
                            {humanizeCode(event.eventType)} <span className="text-slate-600">v{event.schemaVersion}</span>
                          </td>
                          <td className="py-2 pr-3"><Badge className={outboxStatusClass[event.status]}>{event.status}</Badge></td>
                          <td className="py-2 pr-3 tabular-nums">{event.attempts}/{event.maxAttempts}</td>
                          <td className="py-2 pr-3 font-mono text-slate-400">{formatTime(event.createdAt)}</td>
                          <td className="py-2 pr-3 font-mono text-slate-400">{event.publishedAt === null ? '—' : formatTime(event.publishedAt)}</td>
                          <td className="py-2 pr-3 font-mono text-sky-300">{event.correlationId}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <ActionButton onClick={() => setConfirming({ kind: 'replay', id: event.eventId, label: `Replay outbox event ${shorten(event.eventId)}` })}>Replay</ActionButton>
                              <ActionButton onClick={() => setConfirming({ kind: 'duplicate', id: event.eventId, label: `Force a duplicate delivery of ${shorten(event.eventId)}` })}>Duplicate</ActionButton>
                            </div>
                            {event.errorSummary !== null && <p className="mt-1 text-[11px] text-red-300">{event.errorSummary}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              title={`Recent jobs · ${RECOMMENDATION_QUEUE} (${jobs.length})`}
              description="Published jobs processed by the idempotent worker."
              actions={
                <button
                  type="button"
                  onClick={() => setJobFilters({ state: '', eventType: '', correlationId: '' })}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear filters
                </button>
              }
            >
              <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <FilterSelect label="State" value={jobFilters.state} options={JOB_STATE_OPTIONS} onChange={(v) => setJobFilters((f) => ({ ...f, state: v }))} />
                <TextFilter label="Event type" value={jobFilters.eventType} placeholder="recommendation.issued" onChange={(v) => setJobFilters((f) => ({ ...f, eventType: v }))} />
                <TextFilter label="Correlation id" value={jobFilters.correlationId} placeholder="crl_…" onChange={(v) => setJobFilters((f) => ({ ...f, correlationId: v }))} />
              </div>

              {jobs.length === 0 ? (
                <EmptyState title="No jobs" description="No BullMQ jobs match. Published outbox events appear here once the publisher runs." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr className="border-b border-slate-800">
                        <th className="py-2 pr-3 font-medium">Job id</th>
                        <th className="py-2 pr-3 font-medium">Event</th>
                        <th className="py-2 pr-3 font-medium">State</th>
                        <th className="py-2 pr-3 font-medium">Attempts</th>
                        <th className="py-2 pr-3 font-medium">Created</th>
                        <th className="py-2 pr-3 font-medium">Finished</th>
                        <th className="py-2 pr-3 font-medium">Correlation</th>
                        <th className="py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {jobs.map((job) => (
                        <tr key={job.id} className="border-b border-slate-900 align-top hover:bg-slate-900/40">
                          <td className="py-2 pr-3 font-mono text-slate-400" title={job.id}>{shorten(job.id)}</td>
                          <td className="py-2 pr-3">
                            {job.eventType === null ? job.name : humanizeCode(job.eventType)}
                            {job.eventVersion !== null && <span className="text-slate-600"> v{job.eventVersion}</span>}
                          </td>
                          <td className="py-2 pr-3"><Badge className={jobStateClass[job.state]}>{job.state}</Badge></td>
                          <td className="py-2 pr-3 tabular-nums">{job.attempts}/{job.maxAttempts}</td>
                          <td className="py-2 pr-3 font-mono text-slate-400">{job.createdAt === null ? '—' : formatTime(job.createdAt)}</td>
                          <td className="py-2 pr-3 font-mono text-slate-400">{job.finishedAt === null ? '—' : formatTime(job.finishedAt)}</td>
                          <td className="py-2 pr-3 font-mono text-sky-300">{job.correlationId ?? '—'}</td>
                          <td className="py-2">
                            {job.state === 'failed' && (
                              <ActionButton onClick={() => setConfirming({ kind: 'retry', id: job.id, label: `Retry job ${shorten(job.id)}` })}>Retry</ActionButton>
                            )}
                            {job.errorSummary !== null && <p className="mt-1 text-[11px] text-red-300">{job.errorSummary}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {confirming !== null && (
        <ConfirmModal
          label={confirming.label}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void runConfirmedAction()}
        />
      )}
    </>
  );
}

function HealthCard({ health }: { health: ProviderHealth }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold text-slate-100">{health.name}</p>
        <Badge className={providerStateClass[health.state] ?? providerStateClass.NOT_CONFIGURED}>
          {STATE_LABEL[health.state] ?? health.state}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-slate-500">{health.implementation}</p>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-slate-900/60 py-1">
      <div className="tabular-nums text-slate-200">{value}</div>
      <div className="text-slate-600">{label}</div>
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 hover:border-sky-500 hover:text-sky-200"
    >
      {children}
    </button>
  );
}

function ConfirmModal({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-100">Confirm development action</h3>
        <p className="mt-2 text-xs text-slate-400">
          {label}. This is a development-only action on a synthetic record. It is disabled in production.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/30">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
      />
    </label>
  );
}

const shorten = (id: string): string => (id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

const formatAge = (ms: number): string => {
  if (ms < 1_000) {
    return `${ms} ms`;
  }
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
};
