'use client';

/**
 * Dependency-free SVG charts for the console, styled to the dashboard reference. Every color is
 * passed in as a CSS token string (e.g. `var(--c-purple)`) so charts flip with the theme. They
 * render only measured, session-real values — no smoothing, no invented trend lines.
 */

export type Series = { label: string; value: number; color: string };

/** Concentric proportional rings with a value in the middle (one ring per category). */
export function MultiRing({
  rings,
  size = 210,
  thickness = 13,
  gap = 7,
  centerValue,
  centerLabel,
}: {
  rings: Series[];
  size?: number;
  thickness?: number;
  gap?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const total = rings.reduce((sum, r) => sum + r.value, 0);
  const cx = size / 2;
  const outer = (size - thickness) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {rings.map((r, i) => {
          const radius = outer - i * (thickness + gap);
          if (radius < thickness) {
            return null;
          }
          const circumference = 2 * Math.PI * radius;
          const fraction = total === 0 ? 0 : r.value / total;
          const dash = fraction * circumference;
          return (
            <g key={r.label}>
              <circle
                cx={cx}
                cy={cx}
                r={radius}
                fill="none"
                stroke={r.color}
                strokeOpacity={0.14}
                strokeWidth={thickness}
              />
              {r.value > 0 && (
                <circle
                  cx={cx}
                  cy={cx}
                  r={radius}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={thickness}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                />
              )}
            </g>
          );
        })}
      </g>
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-slate-100 font-bold"
        style={{ fontSize: size * 0.16, fontVariantNumeric: 'tabular-nums' }}
      >
        {centerValue}
      </text>
      <text
        x="50%"
        y="58%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-slate-500"
        style={{ fontSize: size * 0.058 }}
      >
        {centerLabel}
      </text>
    </svg>
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** A vertical bar chart with a labelled y-axis and gridlines. */
export function VBarChart({
  data,
  height = 240,
  formatValue = (v) => String(v),
}: {
  data: Series[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const width = 560;
  const padL = 44;
  const padB = 28;
  const padT = 10;
  const plotW = width - padL;
  const plotH = height - padB - padT;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const ticks = 4;
  const slot = plotW / data.length;
  const barW = Math.min(48, slot * 0.5);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img">
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const y = padT + (plotH * i) / ticks;
        const val = max - (max * i) / ticks;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width} y2={y} stroke="var(--t-line)" strokeDasharray="3 4" />
            <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-slate-500" style={{ fontSize: 10 }}>
              {formatValue(Math.round(val))}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = max === 0 ? 0 : (d.value / max) * plotH;
        const x = padL + slot * i + (slot - barW) / 2;
        const y = padT + plotH - h;
        return (
          <g key={d.label}>
            {d.value > 0 && <rect x={x} y={y} width={barW} height={h} rx={5} fill={d.color} />}
            <text
              x={x + barW / 2}
              y={height - 9}
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 10 }}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A filled area chart with a y-axis and a callout bubble on the latest point. */
export function AreaChart({
  values,
  height = 210,
  color = 'var(--c-purple)',
  formatValue = (v) => String(v),
}: {
  values: number[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const width = 560;
  const padL = 44;
  const padB = 22;
  const padT = 28;

  if (values.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500"
        style={{ height }}
      >
        collecting live samples…
      </div>
    );
  }

  const plotW = width - padL;
  const plotH = height - padB - padT;
  const max = niceMax(Math.max(...values));
  const ticks = 4;
  const stepX = plotW / (values.length - 1);
  const points = values.map((v, i) => {
    const x = padL + i * stepX;
    const y = padT + plotH - (max === 0 ? 0 : (v / max) * plotH);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0]},${padT + plotH} L${padL},${padT + plotH} Z`;
  const [lx, ly] = points[points.length - 1];
  const lastVal = values[values.length - 1];
  const gid = `area-${color.replace(/[^a-z]/gi, '')}`;
  const bubble = formatValue(lastVal);
  const bubbleW = Math.max(52, bubble.length * 7 + 16);
  const bubbleX = Math.min(Math.max(lx - bubbleW / 2, padL), width - bubbleW);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const y = padT + (plotH * i) / ticks;
        const val = max - (max * i) / ticks;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width} y2={y} stroke="var(--t-line)" strokeDasharray="3 4" />
            <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-slate-500" style={{ fontSize: 10 }}>
              {formatValue(Math.round(val))}
            </text>
          </g>
        );
      })}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={lx} y1={ly} x2={lx} y2={padT + plotH} stroke={color} strokeDasharray="3 3" strokeOpacity="0.5" />
      <circle cx={lx} cy={ly} r="4.5" fill={color} stroke="var(--t-card)" strokeWidth="2.5" />
      <g transform={`translate(${bubbleX}, ${Math.max(padT - 20, 2)})`}>
        <rect width={bubbleW} height="20" rx="6" fill={color} />
        <text x={bubbleW / 2} y="14" textAnchor="middle" className="fill-white font-semibold" style={{ fontSize: 11 }}>
          {bubble}
        </text>
      </g>
    </svg>
  );
}
