/**
 * Presentation-only styling maps. Colour is used with restraint: red/orange for real risk
 * or failure, green for verified-healthy, neutral slate for everything else. These are UI
 * concerns and live here, never in the shared contracts.
 */
export const riskLevelClass: Record<string, string> = {
  LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CRITICAL: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const severityClass: Record<string, string> = {
  INFO: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CRITICAL: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const actionClass: Record<string, string> = {
  ALLOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  WARN: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  DELAY: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  REQUIRE_CALLBACK: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  REQUIRE_ANALYST_REVIEW: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  BLOCK_RECOMMENDED: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const providerStateClass: Record<string, string> = {
  CONNECTED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DEGRADED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  UNAVAILABLE: 'bg-red-500/15 text-red-300 border-red-500/30',
  NOT_CONFIGURED: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
};

export const statusClass: Record<string, string> = {
  RECEIVED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  PROCESSING: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
  RETRYING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

export const flowStatusClass: Record<string, string> = {
  COMPLETED: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  SKIPPED: 'border-slate-600/50 bg-slate-700/20 text-slate-400',
  PENDING: 'border-slate-700/60 bg-slate-800/40 text-slate-500',
  FAILED: 'border-red-500/50 bg-red-500/10 text-red-200',
};

export const actionLabel: Record<string, string> = {
  ALLOW: 'Allow',
  WARN: 'Warn',
  DELAY: 'Delay',
  REQUIRE_CALLBACK: 'Require callback',
  REQUIRE_ANALYST_REVIEW: 'Require analyst review',
  BLOCK_RECOMMENDED: 'Block recommended',
};
