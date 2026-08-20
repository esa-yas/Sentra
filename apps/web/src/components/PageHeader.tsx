import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{description}</p>
      </div>
      {actions !== undefined && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
