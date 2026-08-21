'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Button, EmptyState, Notice, Panel } from '@/components/ui';
import { getAuditEvents, verifyAuditChain, type AuditEventRow, type AuditVerification } from '@/lib/api';

const short = (hash: string): string => (hash.length > 14 ? `${hash.slice(0, 14)}…` : hash);

export default function AuditChainPage() {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<AuditVerification | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAuditEvents({ limit: 50 });
    if (res.ok && res.data !== undefined) {
      setEvents([...res.data.items]);
      setError(null);
    } else {
      setError(res.error?.message ?? 'Could not load the audit chain.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onVerify = async () => {
    setVerifying(true);
    setResult(null);
    const res = await verifyAuditChain();
    setVerifying(false);
    if (res.ok && res.data !== undefined) {
      setResult(res.data);
      setError(null);
    } else {
      setError(res.error?.message ?? 'Verification could not run.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit Chain"
        description="An append-only, hash-linked record of every governed action. Each entry seals the one before it, so tampering — an altered or deleted record — is provable, not just discouraged."
        actions={
          <Button tone="primary" onClick={() => void onVerify()} disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify integrity'}
          </Button>
        }
      />

      {error !== null ? (
        <div className="mb-5">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {result !== null ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3.5 text-sm ${
            result.valid
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {result.valid ? (
            <span>
              <b>Chain verified.</b> Recomputed {result.eventsVerified.toLocaleString()} events
              {result.firstSequence !== null && result.lastSequence !== null
                ? `, sequences ${result.firstSequence}–${result.lastSequence}`
                : ''}
              . Every digest matches its record and its predecessor.
            </span>
          ) : (
            <span>
              <b>Chain integrity broken.</b> The record at sequence {result.brokenAtSequence} does not
              match its recomputed digest — a record was altered or removed after it was written.
            </span>
          )}
          <span className="ml-1 text-[11px] opacity-70">
            checked {new Date(result.verifiedAt).toLocaleString()}
          </span>
        </div>
      ) : null}

      <Panel title="Recorded events" bodyClassName="px-5 pb-5 pt-4">
      {!loading && events.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          description="Entries accrue as the network makes decisions and administrators act."
        />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-800">
              <th className="pb-2 pr-4 font-medium tabular-nums">Seq</th>
              <th className="pb-2 pr-4 font-medium">Action</th>
              <th className="pb-2 pr-4 font-medium">Actor</th>
              <th className="pb-2 pr-4 font-medium">Resource</th>
              <th className="pb-2 pr-4 font-medium">When</th>
              <th className="pb-2 pr-4 font-medium">Digest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td className="py-6 text-center text-slate-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="align-top text-slate-300">
                  <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-slate-400">{event.sequence}</td>
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs text-slate-100">{event.action}</span>
                    <Badge
                      className={`ml-2 ${
                        event.outcome === 'ALLOWED'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {event.outcome}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{event.actorLabel ?? event.actorType}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">
                    {event.resourceType}
                    {event.resourceId !== null ? <span className="text-slate-600"> · {event.resourceId}</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString()}</td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-500" title={event.hashSelf}>
                    {short(event.hashSelf)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
      </Panel>
    </div>
  );
}
