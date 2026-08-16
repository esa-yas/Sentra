'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse, ReadinessResponse } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton, StatCard } from '@/components/ui';
import { getHealth, getReadiness, type ApiError } from '@/lib/api';

const HEALTH_TONE: Record<string, 'good' | 'warn' | 'bad'> = {
  ok: 'good',
  degraded: 'warn',
  unavailable: 'bad',
};

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [h, r] = await Promise.all([getHealth(), getReadiness()]);
      if (!active) {
        return;
      }
      if (h.data !== undefined) {
        setHealth(h.data);
      }
      if (r.data !== undefined) {
        setReadiness(r.data);
        setError(null);
      } else if (r.error !== undefined) {
        setError(r.error);
      }
      setLoading(false);
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <PageHeader
        title="System Health"
        description="Live liveness and readiness of the Sentra API, read from the real /health and /ready endpoints."
      />

      {error !== null && <div className="mb-4"><ErrorNotice message={error.message} /></div>}

      {loading && health === null ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : health === null ? (
        <Panel>
          <EmptyState title="API unreachable" description="Could not read the health endpoint. Is the API running?" />
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Status" value={health.status} tone={HEALTH_TONE[health.status] ?? 'warn'} />
            <StatCard label="Service" value={health.service} hint={`Version ${health.version}`} />
            <StatCard label="Uptime" value={`${Math.round(health.uptimeSeconds)}s`} />
          </div>

          <Panel title="Readiness dependencies" description="Reported by /ready. API readiness requires PostgreSQL; Redis, the queue, and the worker are surfaced on Integrations so a Redis outage never makes the read-only console unavailable.">
            {readiness === null || readiness.dependencies.length === 0 ? (
              <EmptyState title="No dependencies" description="The readiness probe reported no external dependencies." />
            ) : (
              <ul className="space-y-2">
                {readiness.dependencies.map((dep) => (
                  <li key={dep.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
                    <span className="text-sm text-slate-200">{dep.name}</span>
                    <div className="flex items-center gap-3">
                      {dep.latencyMs !== undefined && (
                        <span className="text-xs text-slate-500">{dep.latencyMs} ms</span>
                      )}
                      <Badge
                        className={
                          dep.status === 'ok'
                            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                            : 'border-red-500/30 bg-red-500/15 text-red-300'
                        }
                      >
                        {dep.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
