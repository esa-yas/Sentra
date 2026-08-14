'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { OperationsSummary } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, ErrorNotice, Panel, Skeleton, StatCard, SyntheticTag } from '@/components/ui';
import { getSummary, type ApiError } from '@/lib/api';
import { formatDateTime, formatMs } from '@/lib/format';
import { providerStateClass } from '@/lib/theme';

const REFRESH_MS = 4000;

export default function OverviewPage() {
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getSummary();
      if (!active) {
        return;
      }
      if (result.data !== undefined) {
        setSummary(result.data);
        setError(null);
      } else if (result.error !== undefined) {
        setError(result.error);
      }
      setLoading(false);
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Operations Overview"
        description="Live rollup of the synthetic scam-prevention pipeline. Metrics are measured from this session unless tagged synthetic."
        actions={
          <Link
            href="/simulator"
            className="rounded-lg bg-sky-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Run a scenario
          </Link>
        }
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}

      {loading && summary === null ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : summary === null ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Risk events received" value={summary.volume.riskEventsReceived} />
            <StatCard label="Payment intents" value={summary.volume.paymentIntentsReceived} />
            <StatCard label="Correlated cases" value={summary.volume.correlatedCases} />
            <StatCard
              label="Confirmed scams"
              value={summary.outcomes.confirmedScams}
              synthetic
              hint="No bank feedback loop yet"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="Warnings issued" value={summary.volume.warningsIssued} tone="warn" />
            <StatCard label="Payments delayed" value={summary.volume.paymentsDelayed} tone="warn" />
            <StatCard label="Callback recs" value={summary.volume.callbackRecommendations} />
            <StatCard label="Analyst-review recs" value={summary.volume.analystReviewRecommendations} />
            <StatCard label="Block recommended" value={summary.volume.blockRecommendations} tone="bad" />
          </div>

          {summary.volume.paymentIntentsReceived === 0 && (
            <Panel>
              <div className="text-center text-sm text-slate-400">
                No cases yet this session.{' '}
                <Link href="/simulator" className="text-sky-400 hover:underline">
                  Run a synthetic scenario
                </Link>{' '}
                to populate the dashboard, live events, and system flow.
              </div>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Case severity" description="Measured distribution of this session's recommendations.">
              <SeverityBars severity={summary.caseSeverity} />
            </Panel>

            <Panel title="API latency" description="Measured across handled requests this session.">
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Requests handled" value={summary.api.requestsHandled} />
                <StatCard label="Failed requests" value={summary.api.failedRequests} tone={summary.api.failedRequests > 0 ? 'bad' : 'good'} />
                <StatCard label="p50 latency" value={formatMs(summary.api.p50LatencyMs)} />
                <StatCard label="p95 latency" value={formatMs(summary.api.p95LatencyMs)} />
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              title="Queue depth"
              description="Durable delivery arrives in Slice 3."
              actions={<SyntheticTag />}
              className="lg:col-span-1"
            >
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Depth" value={summary.queue.depth} />
                <StatCard label="Failed jobs" value={summary.queue.failedJobs} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{summary.queue.note}</p>
            </Panel>

            <Panel title="Provider health" className="lg:col-span-2">
              <ul className="divide-y divide-slate-800">
                {summary.providers.map((provider) => (
                  <li key={provider.name} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm text-slate-200">{provider.name}</p>
                      <p className="text-xs text-slate-500">{provider.implementation}</p>
                    </div>
                    <Badge className={providerStateClass[provider.state]}>{provider.state}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <p className="text-xs text-slate-600">
            Generated {formatDateTime(summary.generatedAt)} · provider mode {summary.providerMode} ·
            environment {summary.environment}
          </p>
        </div>
      )}
    </>
  );
}

function SeverityBars({ severity }: { severity: OperationsSummary['caseSeverity'] }) {
  const rows: { label: string; value: number; bar: string }[] = [
    { label: 'Low', value: severity.low, bar: 'bg-emerald-500' },
    { label: 'Medium', value: severity.medium, bar: 'bg-amber-500' },
    { label: 'High', value: severity.high, bar: 'bg-orange-500' },
    { label: 'Critical', value: severity.critical, bar: 'bg-red-500' },
  ];
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (total === 0) {
    return <p className="text-sm text-slate-500">No cases evaluated yet.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full ${row.bar}`}
              style={{ width: `${total === 0 ? 0 : Math.round((row.value / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
