'use client';

import { useEffect, useState } from 'react';
import { getDevelopmentStatus } from '@/lib/api';
import { SessionMenu } from './SessionMenu';

/** Environment + provider-mode banner. Reminds operators that all data is synthetic. */
export function Topbar() {
  const [env, setEnv] = useState<string>('…');
  const [mode, setMode] = useState<string>('…');

  useEffect(() => {
    let active = true;
    void getDevelopmentStatus().then((result) => {
      if (active && result.data !== undefined) {
        setEnv(result.data.environment);
        setMode(result.data.providerMode);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2 text-xs text-amber-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
        Synthetic demonstration data only — no real customer, payment, or telecom data.
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
          env: <span className="font-medium text-slate-100">{env}</span>
        </span>
        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
          providers: <span className="font-medium text-sky-300">{mode}</span>
        </span>
        <SessionMenu />
      </div>
    </header>
  );
}
