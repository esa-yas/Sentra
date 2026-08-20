import type { RecommendationView } from '@sentra/contracts';
import { Badge, Panel } from './ui';
import { actionClass, actionLabel, providerStateClass, riskLevelClass } from '@/lib/theme';
import { formatDateTime, formatMs, humanizeCode } from '@/lib/format';

/** Renders one explainable recommendation, shown on the case detail screen. */
export function RecommendationDetail({ recommendation }: { recommendation: RecommendationView }) {
  const r = recommendation;
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-950">
              <span className="text-2xl font-bold tabular-nums text-slate-100">{r.riskScore}</span>
              <span className="text-[10px] uppercase text-slate-500">score</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge className={riskLevelClass[r.riskLevel]}>{r.riskLevel}</Badge>
                <Badge className={actionClass[r.recommendedAction]}>
                  {actionLabel[r.recommendedAction] ?? r.recommendedAction}
                </Badge>
              </div>
              <p className="mt-2 max-w-xl text-sm text-slate-200">{r.summary}</p>
              <p className="mt-1 text-xs text-amber-300/90">{r.authorityNote}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
            <dt>Uncertainty</dt>
            <dd className="text-right tabular-nums text-slate-200">{r.uncertainty}</dd>
            <dt>Processing time</dt>
            <dd className="text-right tabular-nums text-slate-200">{formatMs(r.processingTimeMs)}</dd>
            <dt>Policy</dt>
            <dd className="text-right text-slate-200">{r.policyVersion}</dd>
            <dt>Rules</dt>
            <dd className="text-right text-slate-200">{r.rulesVersion}</dd>
            <dt>Model</dt>
            <dd className="text-right text-slate-200">{r.modelVersion ?? 'none (deterministic)'}</dd>
          </dl>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Contributing signals" description="Why this recommendation was made — not just a number.">
          {r.contributingSignals.length === 0 ? (
            <p className="text-sm text-slate-500">No risk signals were triggered.</p>
          ) : (
            <ul className="space-y-3">
              {r.contributingSignals.map((signal) => (
                <li key={signal.code} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">{signal.title}</span>
                    <span className="tabular-nums text-xs text-sky-300">+{signal.contribution}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{signal.description}</p>
                  <span className="mt-2 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                    {signal.category}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Evidence sources">
            <ul className="space-y-2">
              {r.evidenceSources.map((source) => (
                <li key={source.source} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-200">{source.source}</p>
                    {source.detail !== undefined && (
                      <p className="text-xs text-slate-500">{source.detail}</p>
                    )}
                  </div>
                  <Badge className={providerStateClass[source.availability] ?? providerStateClass.NOT_CONFIGURED}>
                    {source.availability}
                  </Badge>
                </li>
              ))}
            </ul>
            {r.missingProviders.length > 0 && (
              <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Missing providers treated fail-neutral (never as zero risk):{' '}
                {r.missingProviders.join(', ')}
              </p>
            )}
          </Panel>

          <Panel title="Rules triggered">
            <div className="flex flex-wrap gap-2">
              {r.rulesTriggered.map((rule) => (
                <span
                  key={rule}
                  className="rounded-md border border-slate-700 bg-slate-800/50 px-2 py-1 font-mono text-xs text-slate-300"
                >
                  {rule}
                </span>
              ))}
            </div>
            {r.alternativeActions.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Alternatives considered:{' '}
                {r.alternativeActions.map((a) => actionLabel[a] ?? a).join(', ')}
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Generated audit events"
        description="Hash-chained on the tenant's audit chain (canonical v1)."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="py-2 pr-4 font-medium">Seq</th>
                <th className="py-2 pr-4 font-medium">Action</th>
                <th className="py-2 pr-4 font-medium">Prev hash</th>
                <th className="py-2 pr-4 font-medium">Self hash</th>
                <th className="py-2 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody className="font-mono text-slate-300">
              {r.auditEvents.map((event) => (
                <tr key={event.id} className="border-b border-slate-900">
                  <td className="py-2 pr-4 tabular-nums">{event.sequence}</td>
                  <td className="py-2 pr-4 font-sans">{humanizeCode(event.action)}</td>
                  <td className="py-2 pr-4 text-slate-500">{event.hashPrev.slice(0, 12)}…</td>
                  <td className="py-2 pr-4 text-sky-300">{event.hashSelf.slice(0, 12)}…</td>
                  <td className="py-2 font-sans text-slate-500">{formatDateTime(event.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
