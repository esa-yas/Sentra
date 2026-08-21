'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  IssuedSigningKeyResponse,
  PartnerCredentialResponse,
  SandboxSignedRequestResult,
} from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  createPartnerConnection,
  getPartners,
  revokePartnerConnection,
  revokePartnerKey,
  rotatePartnerKey,
  runSandboxSignedRequest,
  type ApiError,
} from '@/lib/api';

interface PartnerRow {
  id: string;
  organizationId: string;
  organizationLabel: string;
  name: string;
  kind: string;
  environment: string;
  status: string;
  scopes: string[];
  activeKeyIds: string[];
  keyExpiresAt: string | null;
  lastUsedAt: string | null;
  recentFailures: number;
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  SUSPENDED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  REVOKED: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function PartnersPage() {
  const [items, setItems] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [once, setOnce] = useState<PartnerCredentialResponse | IssuedSigningKeyResponse | null>(null);
  const [sandbox, setSandbox] = useState<SandboxSignedRequestResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await getPartners({ limit: 50 });
    if (result.data !== undefined) {
      setItems(result.data.items as PartnerRow[]);
      setDegraded(result.data.detail ?? null);
      setError(null);
    } else if (result.error !== undefined) {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (kind: 'TELECOM_EVENTS' | 'BANK_API') => {
    setBusy(true);
    const result = await createPartnerConnection({
      name: `${kind === 'TELECOM_EVENTS' ? 'telecom' : 'bank'} sandbox ${Date.now().toString(36)}`,
      kind,
      environment: 'SANDBOX',
      scopes:
        kind === 'TELECOM_EVENTS'
          ? ['risk-events:write']
          : ['payment-intents:write', 'recommendations:read', 'cases:read', 'outcomes:write'],
      allowedPurposes: ['PROTECT_PAYMENT'],
    });
    setBusy(false);
    if (result.data !== undefined) {
      setOnce(result.data);
      await load();
    } else if (result.error !== undefined) {
      setError(result.error);
    }
  };

  return (
    <>
      <PageHeader
        title="Partner Integration"
        description="Sandbox bank and telecom connections. Private keys and client secrets are shown once at issuance and are never stored for later display."
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}
      {degraded !== null && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {degraded}
        </div>
      )}

      {once !== null && (
        <Panel title="One-time credential" description="Copy this now. Sentra will not show it again.">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[11px] text-amber-100">
            {'signing' in once
              ? JSON.stringify(
                  {
                    connectionId: once.connection.id,
                    clientId: once.clientId,
                    clientSecret: once.clientSecret,
                    kid: once.signing.kid,
                    privateKeyJwk: once.signing.privateKeyJwk,
                    warning: once.warning,
                  },
                  null,
                  2,
                )
              : JSON.stringify(
                  {
                    kid: once.kid,
                    privateKeyJwk: once.privateKeyJwk,
                    warning: once.warning,
                  },
                  null,
                  2,
                )}
          </pre>
          <button
            type="button"
            className="mt-3 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
            onClick={() => setOnce(null)}
          >
            I have stored this. Hide it.
          </button>
        </Panel>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void create('TELECOM_EVENTS')}
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200"
        >
          Create sandbox telecom
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void create('BANK_API')}
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200"
        >
          Create sandbox bank
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await runSandboxSignedRequest('TELECOM_EVENTS');
            setBusy(false);
            if (result.data !== undefined) {
              setSandbox(result.data);
              await load();
            } else if (result.error !== undefined) {
              setError(result.error);
            }
          }}
          className="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-200"
        >
          Send signed telecom request
        </button>
      </div>

      {sandbox !== null && (
        <Panel title="Sandbox signed request" description="Private keys are not included. Replay this nonce and it will be rejected.">
          <p className="mb-2 text-xs text-slate-400">
            {sandbox.method} {sandbox.endpoint} → {sandbox.responseStatus} · correlation {sandbox.correlationId} ·
            idempotency {sandbox.idempotencyKey}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
            {sandbox.canonicalString}
          </pre>
          <p className="mt-3 text-xs font-medium text-slate-400">Node.js</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
            {sandbox.nodeExample}
          </pre>
          <p className="mt-3 text-xs font-medium text-slate-400">cURL</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
            {sandbox.curlExample}
          </pre>
        </Panel>
      )}

      {loading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No partner connections"
          description="Create a sandbox telecom or bank connection. Production issuance waits for Slice 4B human administrator authentication."
        />
      ) : (
        <div className="space-y-3">
          {items.map((connection) => (
            <Panel
              key={connection.id}
              title={connection.name}
              description={`${connection.organizationLabel} · ${connection.kind} · ${connection.environment}`}
              actions={
                <div className="flex gap-2">
                  <Badge className={STATUS_CLASS[connection.status] ?? STATUS_CLASS.ACTIVE}>{connection.status}</Badge>
                  {connection.recentFailures > 0 && (
                    <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-200">
                      {connection.recentFailures} recent failures
                    </Badge>
                  )}
                </div>
              }
            >
              <dl className="grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                <div>
                  <dt>Scopes</dt>
                  <dd className="font-mono text-slate-200">{connection.scopes.join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>Active key IDs</dt>
                  <dd className="font-mono text-slate-200">{connection.activeKeyIds.join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>Key expiration</dt>
                  <dd>{connection.keyExpiresAt === null ? 'none' : formatDateTime(connection.keyExpiresAt)}</dd>
                </div>
                <div>
                  <dt>Last used</dt>
                  <dd>{connection.lastUsedAt === null ? 'never' : formatDateTime(connection.lastUsedAt)}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(connection.createdAt)}</dd>
                </div>
              </dl>
              {connection.status === 'ACTIVE' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs"
                    onClick={async () => {
                      const result = await rotatePartnerKey(connection.id);
                      if (result.data !== undefined) {
                        setOnce(result.data);
                        await load();
                      } else if (result.error !== undefined) {
                        setError(result.error);
                      }
                    }}
                  >
                    Rotate key
                  </button>
                  {connection.activeKeyIds.map((kid) => (
                    <button
                      key={kid}
                      type="button"
                      className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200"
                      onClick={async () => {
                        const result = await revokePartnerKey(connection.id, kid);
                        if (result.error !== undefined) {
                          setError(result.error);
                        }
                        await load();
                      }}
                    >
                      Revoke {kid}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-200"
                    onClick={async () => {
                      const result = await revokePartnerConnection(connection.id);
                      if (result.error !== undefined) {
                        setError(result.error);
                      }
                      await load();
                    }}
                  >
                    Revoke connection
                  </button>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
