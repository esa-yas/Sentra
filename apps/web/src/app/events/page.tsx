'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OperationalEvent } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { getEvents, type ApiError } from '@/lib/api';
import { severityClass, statusClass } from '@/lib/theme';
import { formatTime, humanizeCode } from '@/lib/format';

const TYPE_OPTIONS = [
  'telecom.risk_event.received',
  'payment.intent.received',
  'correlation.matched',
  'risk.assessment.completed',
  'decision.recommendation.issued',
];
const SEVERITY_OPTIONS = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUS_OPTIONS = ['RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'];

export default function EventsPage() {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ type: string; severity: string; status: string; provider: string }>(
    { type: '', severity: '', status: '', provider: '' },
  );

  const load = useCallback(async () => {
    const result = await getEvents({
      type: filters.type || undefined,
      severity: filters.severity || undefined,
      status: filters.status || undefined,
      provider: filters.provider || undefined,
      limit: 100,
    });
    if (result.data !== undefined) {
      setEvents(result.data.items);
      setError(null);
    } else if (result.error !== undefined) {
      setError(result.error);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <>
      <PageHeader
        title="Live Events"
        description="Every event carries its correlation id and a redacted payload preview. Secrets, credentials, card numbers, and raw identifiers never appear."
      />

      <Panel
        title="Filters"
        className="mb-4"
        actions={
          <button
            type="button"
            onClick={() => setFilters({ type: '', severity: '', status: '', provider: '' })}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FilterSelect label="Type" value={filters.type} options={TYPE_OPTIONS} render={humanizeCode} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} />
          <FilterSelect label="Severity" value={filters.severity} options={SEVERITY_OPTIONS} onChange={(v) => setFilters((f) => ({ ...f, severity: v }))} />
          <FilterSelect label="Status" value={filters.status} options={STATUS_OPTIONS} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Provider</span>
            <input
              value={filters.provider}
              onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
              placeholder="e.g. core"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
        </div>
      </Panel>

      {error !== null && <div className="mb-4"><ErrorNotice message={error.message} /></div>}

      <Panel title={`Events (${events.length})`}>
        {loading && events.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState title="No events" description="Domain events stream in here as the pipeline processes activity." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 pr-3 font-medium">Severity</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Attempt</th>
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 font-medium">Duration</th>
                  <th className="py-2 font-medium">Correlation</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {events.map((event) => (
                  <ExpandableRow
                    key={event.id}
                    event={event}
                    expanded={expanded === event.id}
                    onToggle={() => setExpanded(expanded === event.id ? null : event.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function ExpandableRow({
  event,
  expanded,
  onToggle,
}: {
  event: OperationalEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-slate-900 hover:bg-slate-900/50">
        <td className="py-2 pr-3 font-mono text-slate-400">{formatTime(event.occurredAt)}</td>
        <td className="py-2 pr-3">{humanizeCode(event.type)}</td>
        <td className="py-2 pr-3 text-slate-400">{event.actor}</td>
        <td className="py-2 pr-3"><Badge className={severityClass[event.severity]}>{event.severity}</Badge></td>
        <td className="py-2 pr-3"><Badge className={statusClass[event.status]}>{event.status}</Badge></td>
        <td className="py-2 pr-3 tabular-nums">{event.attempt}</td>
        <td className="py-2 pr-3 text-slate-400">{event.provider}</td>
        <td className="py-2 pr-3 tabular-nums text-slate-400">{event.durationMs === null ? '—' : `${event.durationMs} ms`}</td>
        <td className="py-2 font-mono text-sky-300">{event.correlationId}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-900 bg-slate-950/60">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>subject: <span className="font-mono text-slate-300">{event.subjectRef ?? '—'}</span></span>
              <span className="text-slate-500">Redacted payload preview:</span>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              {JSON.stringify(event.payloadPreview, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  render,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  render?: (v: string) => string;
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
            {render === undefined ? option : render(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
