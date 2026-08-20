'use client';

import { useEffect, useState } from 'react';
import { getDevelopmentStatus } from '@/lib/api';
import { SessionMenu } from './SessionMenu';
import { ThemeToggle } from './ThemeToggle';

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
    <header className="flex items-center justify-end gap-4 border-b border-slate-800 bg-slate-900/85 px-6 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">
          env <span className="font-medium text-slate-100">{env}</span>
        </span>
        <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">
          providers <span className="font-medium text-sky-300">{mode}</span>
        </span>
        <ThemeToggle />
        <SessionMenu />
      </div>
    </header>
  );
}
