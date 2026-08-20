'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ApiKeyCreatedResponse, ApiKeyView } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { createApiKey, getApiKeys, revokeApiKey, type ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const envClass: Record<string, string> = {
  TEST: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  LIVE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

export default function ApiKeysPage() {
  const [items, setItems] = useState<ApiKeyView[] | null>(null);
  const [canIssueLive, setCanIssueLive] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<'TEST' | 'LIVE'>('TEST');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<ApiKeyCreatedResponse | null>(null);

  const load = async () => {
    const result = await getApiKeys();
    if (result.data !== undefined) {
      setItems(result.data.items);
      setCanIssueLive(result.data.canIssueLive);
      setError(null);
    } else if (result.error !== undefined) {
      setError(result.error);
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createApiKey({ name: name.trim(), environment });
    setBusy(false);
    if (result.data !== undefined) {
      setRevealed(result.data);
      setName('');
      void load();
    } else if (result.error !== undefined) {
      setError(result.error);
    }
  };

  const onRevoke = async (keyId: string) => {
    const result = await revokeApiKey(keyId);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    void load();
  };

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Publishable and secret key pairs for the Sentra API. Sandbox (test) keys are available now; live keys unlock once your organization is approved for production."
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}

      {revealed !== null && <SecretReveal reveal={revealed} onDismiss={() => setRevealed(null)} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Create a key" className="lg:col-span-1">
          <form onSubmit={onCreate} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Name</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production server"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Environment</span>
              <select
                value={environment}
                onChange={(event) => setEnvironment(event.target.value as 'TEST' | 'LIVE')}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              >
                <option value="TEST">Test (sandbox)</option>
                <option value="LIVE" disabled={!canIssueLive}>
                  Live{canIssueLive ? '' : ' — requires approval'}
                </option>
              </select>
            </label>
            {!canIssueLive && (
              <p className="text-xs text-slate-500">
                Your organization is in sandbox. Request production access to mint live keys.
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </form>
        </Panel>

        <Panel title="Your keys" className="lg:col-span-2" bodyClassName="px-5 pb-5 pt-4">
          {items === null ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No keys yet"
              description="Create a sandbox key to start calling the Sentra API from your test environment."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Env</th>
                    <th className="pb-2 pr-3 font-medium">Publishable key</th>
                    <th className="pb-2 pr-3 font-medium">Secret</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {items.map((key) => (
                    <tr key={key.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-200">{key.name}</p>
                        <p className="text-[11px] text-slate-500">{formatDateTime(key.createdAt)}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge className={envClass[key.environment]}>{key.environment}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-400">{key.publishableKey}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                        sk_…{key.secretLast4}
                      </td>
                      <td className="py-2.5 pr-3">
                        {key.status === 'ACTIVE' ? (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="border-slate-600/40 bg-slate-600/10 text-slate-400">
                            Revoked
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {key.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => onRevoke(key.id)}
                            className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function SecretReveal({
  reveal,
  onDismiss,
}: {
  reveal: ApiKeyCreatedResponse;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be unavailable; the value is still selectable on screen.
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-amber-200">Save your secret key now</h2>
          <p className="mt-1 text-xs text-amber-200/80">{reveal.warning}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/10"
        >
          Done
        </button>
      </div>
      <div className="mt-4 space-y-2">
        <KeyRow label="Publishable key" value={reveal.key.publishableKey} copied={copied} onCopy={copy} />
        <KeyRow label="Secret key" value={reveal.secretKey} copied={copied} onCopy={copy} />
      </div>
    </div>
  );
}

function KeyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{value}</code>
      <button
        type="button"
        onClick={() => onCopy(label, value)}
        className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
      >
        {copied === label ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
