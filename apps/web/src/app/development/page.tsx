'use client';

import { useEffect, useState } from 'react';
import type { DevelopmentStatus } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton, StatCard } from '@/components/ui';
import { getDevelopmentStatus, type ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const CAP_STATE_CLASS: Record<string, string> = {
  IMPLEMENTED: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  SIMULATED: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-300',
  PLANNED: 'border-slate-600/40 bg-slate-700/20 text-slate-400',
};

const MIGRATION_CLASS: Record<string, string> = {
  UP_TO_DATE: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  PENDING: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  UNKNOWN: 'border-slate-600/40 bg-slate-700/20 text-slate-400',
  NOT_APPLICABLE: 'border-slate-600/40 bg-slate-700/20 text-slate-400',
};

export default function DevelopmentPage() {
  const [status, setStatus] = useState<DevelopmentStatus | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getDevelopmentStatus();
      if (!active) {
        return;
      }
      if (result.data !== undefined) {
        setStatus(result.data);
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
  }, []);

  return (
    <>
      <PageHeader
        title="Development Progress"
        description="Real version, environment, and adapter mode from the running service. Verification totals are shown only when recorded by the build, never asserted live."
      />

      {error !== null && <div className="mb-4"><ErrorNotice message={error.message} /></div>}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : status === null ? (
        <Panel>
          <EmptyState title="No status" description="The development-status endpoint returned nothing." />
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Version" value={status.version} hint={`commit ${status.commit}`} />
            <StatCard label="Environment" value={status.environment} />
            <StatCard label="Adapter mode" value={status.providerMode} />
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Migrations</p>
              <div className="mt-2">
                <Badge className={MIGRATION_CLASS[status.migrations.state] ?? MIGRATION_CLASS.UNKNOWN}>
                  {status.migrations.state}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">{status.migrations.detail}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Milestones">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Current</dt>
                  <dd className="text-slate-200">{status.currentMilestone}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Next</dt>
                  <dd className="text-slate-200">{status.nextMilestone}</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Latest recorded verification">
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Recorded at</dt>
                  <dd className="text-slate-200">
                    {status.verification.recordedAt === null ? 'Not recorded' : formatDateTime(status.verification.recordedAt)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Unit tests</dt>
                  <dd className="text-slate-200 tabular-nums">
                    {status.verification.unitTests === null ? '—' : status.verification.unitTests}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">{status.verification.note}</p>
            </Panel>
          </div>

          <Panel title="Capabilities" description="What is real, what is synthetic, and what is planned.">
            <ul className="space-y-2">
              {status.capabilities.map((cap) => (
                <li key={cap.name} className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{cap.name}</p>
                    <p className="text-xs text-slate-500">{cap.detail}</p>
                  </div>
                  <Badge className={CAP_STATE_CLASS[cap.state] ?? CAP_STATE_CLASS.PLANNED}>{cap.state}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
