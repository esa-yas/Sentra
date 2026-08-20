'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DecisionListItem } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { getCases, type ApiError } from '@/lib/api';
import { actionClass, actionLabel, riskLevelClass } from '@/lib/theme';
import { formatDateTime } from '@/lib/format';

export default function CasesPage() {
  const [items, setItems] = useState<DecisionListItem[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getCases();
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
        title="Scam Cases"
        description="Correlated cases produced this session. Each one links a telecom signal and a payment intent to an explainable recommendation and its audit trail."
      />

      {error !== null && <div className="mb-4"><ErrorNotice message={error.message} /></div>}

      <Panel title={`Cases (${items.length})`}>
        {loading && items.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No cases yet"
            description="Cases appear here as the decision engine evaluates incoming risk signals."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-4 font-medium">Evaluated</th>
                  <th className="py-2 pr-4 font-medium">Subject</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">Level</th>
                  <th className="py-2 pr-4 font-medium">Recommendation</th>
                  <th className="py-2 pr-4 font-medium">Correlation</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {items.map((item) => (
                  <tr key={item.decisionId} className="border-b border-slate-800 hover:bg-[var(--t-card-2)]">
                    <td className="py-2 pr-4 text-xs text-slate-400">{formatDateTime(item.evaluatedAt)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{item.subjectRef}</td>
                    <td className="py-2 pr-4 tabular-nums">{item.riskScore}</td>
                    <td className="py-2 pr-4"><Badge className={riskLevelClass[item.riskLevel]}>{item.riskLevel}</Badge></td>
                    <td className="py-2 pr-4">
                      <Badge className={actionClass[item.recommendedAction]}>
                        {actionLabel[item.recommendedAction] ?? item.recommendedAction}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-sky-300">{item.correlationId}</td>
                    <td className="py-2 text-right">
                      <Link href={`/cases/${encodeURIComponent(item.decisionId)}`} className="text-xs text-sky-400 hover:text-sky-300">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
