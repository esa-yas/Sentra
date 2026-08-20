'use client';

import { useEffect, useRef, useState } from 'react';
import type { DecisionListItem, OperationsSummary } from '@sentra/contracts';
import { AreaChart, MultiRing, VBarChart, type Series } from '@/components/charts';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge, ErrorNotice, KpiCard, KpiNote, Panel, Skeleton } from '@/components/ui';
import { getCases, getSummary, type ApiError } from '@/lib/api';
import { formatMs, formatTime } from '@/lib/format';
import { actionLabel, actionClass, providerStateClass } from '@/lib/theme';

const REFRESH_MS = 4000;
const MAX_SAMPLES = 20;

export default function OverviewPage() {
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [cases, setCases] = useState<DecisionListItem[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [p95Series, setP95Series] = useState<number[]>([]);
  const lastRequests = useRef<number>(-1);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [summaryResult, casesResult] = await Promise.all([getSummary(), getCases()]);
      if (!active) return;
      if (summaryResult.data !== undefined) {
        const next = summaryResult.data;
        setSummary(next);
        setError(null);
        // Sample latency only when new requests were actually handled, so the chart reflects
        // real traffic this session rather than a flat idle line.
        if (next.api.requestsHandled !== lastRequests.current) {
          lastRequests.current = next.api.requestsHandled;
          setP95Series((prev) => [...prev, next.api.p95LatencyMs].slice(-MAX_SAMPLES));
        }
      } else if (summaryResult.error !== undefined) {
        setError(summaryResult.error);
      }
      if (casesResult.data !== undefined) {
        setCases(casesResult.data.items);
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

  const onExport = () => {
    if (summary === null) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentra-overview-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <DashboardHeader onExport={summary === null ? undefined : onExport} />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}

      {loading && summary === null ? (
        <LoadingState />
      ) : summary === null ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total risk events received"
              value={summary.volume.riskEventsReceived}
              color="var(--c-blue)"
              icon={<IconPulse />}
              footer={<KpiNote>Ingested this session</KpiNote>}
            />
            <KpiCard
              label="Total payment intents"
              value={summary.volume.paymentIntentsReceived}
              color="var(--c-orange)"
              icon={<IconCard />}
              footer={<KpiNote>Evaluated by the engine</KpiNote>}
            />
            <KpiCard
              label="Correlated cases"
              value={summary.volume.correlatedCases}
              color="var(--c-purple)"
              icon={<IconLink />}
              footer={<KpiNote>Cross-signal matches</KpiNote>}
            />
            <KpiCard
              label="Confirmed scams"
              value={summary.outcomes.confirmedScams}
              color="var(--c-red)"
              icon={<IconShield />}
              footer={<KpiNote>Flagged this session</KpiNote>}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Case severity" menu>
              <SeverityRing severity={summary.caseSeverity} />
            </Panel>

            <Panel title="Recommendation activity" menu>
              <RecommendationChart volume={summary.volume} />
            </Panel>

            <Panel title="Decision latency" menu>
              <LatencyCard api={summary.api} series={p95Series} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Recent recommendations" menu bodyClassName="px-5 pb-5 pt-4">
              <RecentRecommendations cases={cases} />
            </Panel>

            <Panel title="Provider health" menu bodyClassName="px-5 pb-5 pt-4">
              <ProviderTable providers={summary.providers} />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function SeverityRing({ severity }: { severity: OperationsSummary['caseSeverity'] }) {
  const rings: Series[] = [
    { label: 'Low', value: severity.low, color: 'var(--c-green)' },
    { label: 'Medium', value: severity.medium, color: 'var(--c-yellow)' },
    { label: 'High', value: severity.high, color: 'var(--c-orange)' },
    { label: 'Critical', value: severity.critical, color: 'var(--c-red)' },
  ];
  const total = rings.reduce((s, r) => s + r.value, 0);

  if (total === 0) {
    return <EmptyChart hint="No cases evaluated yet." />;
  }

  return (
    <div className="flex flex-col items-center">
      <MultiRing rings={rings} centerValue={String(total)} centerLabel="Total cases" />
      <div className="mt-4 grid w-full grid-cols-4 gap-2">
        {rings.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: r.color }} />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tabular-nums text-slate-100">{r.value}</p>
              <p className="mt-1 truncate text-[11px] text-slate-500">{r.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationChart({ volume }: { volume: OperationsSummary['volume'] }) {
  const data: Series[] = [
    { label: 'Warn', value: volume.warningsIssued, color: 'var(--c-yellow)' },
    { label: 'Delay', value: volume.paymentsDelayed, color: 'var(--c-orange)' },
    { label: 'Callback', value: volume.callbackRecommendations, color: 'var(--c-blue)' },
    { label: 'Review', value: volume.analystReviewRecommendations, color: 'var(--c-purple)' },
    { label: 'Block', value: volume.blockRecommendations, color: 'var(--c-red)' },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <EmptyChart hint="No recommendations produced yet." />;
  }

  return (
    <div>
      <VBarChart data={data} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d) => (
          <span key={d.label} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LatencyCard({ api, series }: { api: OperationsSummary['api']; series: number[] }) {
  return (
    <div>
      <p className="text-[28px] font-bold leading-none tabular-nums text-slate-100">
        {formatMs(api.p95LatencyMs)}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">
        p95 · {api.requestsHandled} requests handled · p50 {formatMs(api.p50LatencyMs)}
        {api.failedRequests > 0 && <span className="text-red-300"> · {api.failedRequests} failed</span>}
      </p>
      <div className="mt-4">
        <AreaChart values={series} formatValue={(v) => `${Math.round(v * 100) / 100}ms`} />
      </div>
    </div>
  );
}

function RecentRecommendations({ cases }: { cases: DecisionListItem[] }) {
  if (cases.length === 0) {
    return <div className="py-10 text-center text-sm text-slate-500">No recommendations yet.</div>;
  }
  const rows = cases.slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-3 font-medium">S/N</th>
            <th className="pb-2 pr-3 font-medium">Subject</th>
            <th className="pb-2 pr-3 font-medium">Time</th>
            <th className="pb-2 text-right font-medium">Recommendation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={row.decisionId}>
              <td className="py-2.5 pr-3 tabular-nums text-slate-500">{String(i + 1).padStart(2, '0')}</td>
              <td className="py-2.5 pr-3">
                <span className="font-medium text-slate-200">{row.subjectRef}</span>
                <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {row.riskLevel}
                </span>
              </td>
              <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">{formatTime(row.evaluatedAt)}</td>
              <td className="py-2.5 text-right">
                <Badge className={actionClass[row.recommendedAction]}>
                  {actionLabel[row.recommendedAction] ?? row.recommendedAction}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderTable({ providers }: { providers: OperationsSummary['providers'] }) {
  if (providers.length === 0) {
    return <div className="py-10 text-center text-sm text-slate-500">No providers registered.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-3 font-medium">Provider</th>
            <th className="pb-2 pr-3 font-medium">Implementation</th>
            <th className="pb-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {providers.slice(0, 6).map((provider) => (
            <tr key={provider.name}>
              <td className="py-2.5 pr-3 font-medium text-slate-200">{provider.name}</td>
              <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">{provider.implementation}</td>
              <td className="py-2.5 text-right">
                <Badge className={providerStateClass[provider.state]}>{provider.state}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart({ hint }: { hint: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center text-center">
      <p className="text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

function IconPulse() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  );
}
function IconCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a3 3 0 0 0 3 3h1a3 3 0 0 0 0-6" />
      <path d="M15 12a3 3 0 0 0-3-3h-1a3 3 0 0 0 0 6" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
