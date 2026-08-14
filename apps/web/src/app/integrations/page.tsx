'use client';

import { useEffect, useState } from 'react';
import type { ProviderHealth } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { getIntegrations, type ApiError } from '@/lib/api';
import { providerStateClass } from '@/lib/theme';
import { formatDateTime, formatMs } from '@/lib/format';

const STATE_LABEL: Record<string, string> = {
  CONNECTED: 'Connected',
  DEGRADED: 'Degraded',
  UNAVAILABLE: 'Unavailable',
  NOT_CONFIGURED: 'Not configured',
};

export default function IntegrationsPage() {
  const [items, setItems] = useState<ProviderHealth[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getIntegrations();
      if (!active) {
        return;
      }
      if (result.data !== undefined) {
        setItems(result.data.items);
        setError(null);
      } else if (result.error !== undefined) {
        setError(result.error);
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
        title="Integrations"
        description="Connection state for every dependency and provider. In-memory dev adapters are wired in Slice 1; real providers land in later slices. Credentials are never exposed."
      />

      {error !== null && <div className="mb-4"><ErrorNotice message={error.message} /></div>}

      {loading && items.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState title="No integrations reported" description="The API returned no provider health rollups." />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((provider) => (
            <div key={provider.name} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{provider.name}</p>
                  <p className="text-xs text-slate-500">{provider.kind}</p>
                </div>
                <Badge className={providerStateClass[provider.state] ?? providerStateClass.NOT_CONFIGURED}>
                  {STATE_LABEL[provider.state] ?? provider.state}
                </Badge>
              </div>
              <dl className="mt-4 space-y-1.5 text-xs">
                <Row label="Implementation" value={provider.implementation} />
                <Row label="Latency" value={formatMs(provider.latencyMs)} />
                <Row label="Last success" value={formatDateTime(provider.lastSuccessAt ?? '')} />
                <Row label="Last failure" value={formatDateTime(provider.lastFailureAt ?? '')} />
              </dl>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-300">{value}</dd>
    </div>
  );
}
