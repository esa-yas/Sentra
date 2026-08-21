'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PartnerApiRequestView } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton, Input } from '@/components/ui';
import { formatDateTime, formatMs } from '@/lib/format';
import { getApiActivity, type ApiError } from '@/lib/api';

const CHECK_CLASS: Record<string, string> = {
  PASSED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
  MISSING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  NOT_APPLICABLE: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
};

const STATUS_CLASS = (status: number): string => {
  if (status >= 500) {
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  }
  if (status >= 400) {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
};

export default function ApiActivityPage() {
  const [items, setItems] = useState<PartnerApiRequestView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [redisState, setRedisState] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    endpoint: '',
    method: '',
    status: '',
    correlationId: '',
    environment: '',
  });

  const load = useCallback(async (cursor?: string) => {
    const result = await getApiActivity({
      endpoint: filters.endpoint || undefined,
      method: filters.method || undefined,
      status: filters.status ? Number(filters.status) : undefined,
      correlationId: filters.correlationId || undefined,
      environment: filters.environment || undefined,
      limit: 25,
      cursor,
    });
    if (result.data !== undefined) {
      setItems((current) => (cursor === undefined ? result.data!.items : [...current, ...result.data!.items]));
      setNextCursor(result.data.nextCursor);
      setError(null);
      setDegraded(result.data.detail ?? null);
      setRedisState(result.data.redisState ?? null);
    } else if (result.error !== undefined) {
      setError(result.error);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [filters.endpoint, filters.method, filters.status, filters.correlationId, filters.environment]);

  return (
    <>
      <PageHeader
        title="API Activity"
        description="Safe operational record of partner requests. Signatures, private keys, tokens and full payloads are never stored here."
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}
      {degraded !== null && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {degraded}
        </div>
      )}
      {redisState !== null && redisState !== 'CONNECTED' && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Redis is {redisState}. Signed partner writes fail closed while replay protection and rate limiting cannot run.
        </div>
      )}

      <Panel title="Filters">
        <div className="grid gap-3 md:grid-cols-5">
          {(
            [
              ['endpoint', 'Endpoint'],
              ['method', 'Method'],
              ['status', 'Status'],
              ['correlationId', 'Correlation ID'],
              ['environment', 'Environment'],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={filters[key]}
              onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
              placeholder={key === 'environment' ? 'SANDBOX | PRODUCTION' : ''}
            />
          ))}
        </div>
      </Panel>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No partner requests yet"
            description="Submit a signed sandbox request from Partner Integration, or call POST /v1/risk-events with a sandbox credential."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                {[
                  'Time',
                  'Partner',
                  'Endpoint',
                  'Status',
                  'Duration',
                  'Auth',
                  'Signature',
                  'Replay',
                  'Idempotency',
                  'Rate limit',
                  'Correlation',
                  'Error',
                  'Env',
                ].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-3 py-2 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{formatDateTime(row.occurredAt)}</td>
                  <td className="px-3 py-2">
                    <div>{row.partnerLabel ?? row.partnerConnectionId ?? '—'}</div>
                    <div className="text-[10px] text-slate-500">{row.organizationLabel ?? row.organizationId ?? '—'}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">
                    {row.method} {row.endpoint}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_CLASS(row.statusCode)}>{row.statusCode}</Badge>
                  </td>
                  <td className="px-3 py-2">{formatMs(row.durationMs)}</td>
                  {(['authentication', 'signature', 'replay', 'idempotency', 'rateLimit'] as const).map((field) => (
                    <td key={field} className="px-3 py-2">
                      <Badge className={CHECK_CLASS[row[field]] ?? CHECK_CLASS.NOT_APPLICABLE}>{row[field]}</Badge>
                    </td>
                  ))}
                  <td className="px-3 py-2 font-mono text-[11px] text-sky-300">{row.correlationId}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{row.errorCode ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className="border-slate-600/40 bg-slate-800 text-slate-300">{row.environment}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor !== undefined && (
            <button
              type="button"
              className="w-full border-t border-slate-800 py-2 text-xs text-sky-300"
              onClick={() => void load(nextCursor)}
            >
              Load more
            </button>
          )}
        </div>
      )}
    </>
  );
}
