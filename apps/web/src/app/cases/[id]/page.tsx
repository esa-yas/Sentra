'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { FlowRun } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { RecommendationDetail } from '@/components/RecommendationDetail';
import { CorrelationTag, EmptyState, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { getCase, type ApiError, type CaseDetail } from '@/lib/api';
import { flowStatusClass } from '@/lib/theme';
import { formatMs } from '@/lib/format';

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getCase(id);
      if (!active) {
        return;
      }
      if (result.data !== undefined) {
        setData(result.data);
        setError(null);
      } else if (result.error !== undefined) {
        setError(result.error);
      }
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <>
      <PageHeader
        title="Case detail"
        description="A correlated case: how the signals combined, why the recommendation was made, and the hash-chained audit trail."
        actions={
          data !== null ? (
            <div className="flex items-center gap-3">
              <CorrelationTag correlationId={data.recommendation.correlationId} />
              <Link
                href={`/system-flow?correlationId=${encodeURIComponent(data.recommendation.correlationId)}`}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                View in System Flow
              </Link>
            </div>
          ) : (
            <Link href="/cases" className="text-xs text-slate-400 hover:text-slate-200">← All cases</Link>
          )
        }
      />

      {error !== null && <div className="mb-4"><ErrorNotice message={error.message} /></div>}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-48" />
        </div>
      ) : data === null ? (
        <Panel>
          <EmptyState title="Case not found" description="This case is not in the current operations store." />
        </Panel>
      ) : (
        <div className="space-y-6">
          {data.flow !== null && <CaseTimeline flow={data.flow} />}
          <RecommendationDetail recommendation={data.recommendation} />
        </div>
      )}
    </>
  );
}

function CaseTimeline({ flow }: { flow: FlowRun }) {
  return (
    <Panel title="Timeline" description="The path this case took through the pipeline. Downstream bank stages remain pending until the trust edge.">
      <ol className="relative space-y-4 border-l border-slate-800 pl-6">
        {flow.stages.map((stage) => (
          <li key={stage.stage} className="relative">
            <span
              className={`absolute -left-[27px] mt-1 h-3 w-3 rounded-full border-2 ${
                stage.status === 'COMPLETED'
                  ? 'border-emerald-400 bg-emerald-400'
                  : stage.status === 'FAILED'
                    ? 'border-red-400 bg-red-400'
                    : 'border-slate-600 bg-slate-800'
              }`}
            />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{stage.label}</p>
                <p className="text-xs text-slate-500">{stage.outputSummary}</p>
              </div>
              <div className="text-right">
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] uppercase ${flowStatusClass[stage.status]}`}>
                  {stage.status}
                </span>
                <p className="mt-1 text-xs text-slate-500">{formatMs(stage.durationMs)}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
