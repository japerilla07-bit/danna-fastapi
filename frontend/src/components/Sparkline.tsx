// ════════════════════════════════════════════════════════════════════════
// Sparkline SVG — línea de tendencia liviana (últimos N valores)
// ════════════════════════════════════════════════════════════════════════
// SVG puro, ~50 líneas, cero dependencias. Memoizado por igualdad de
// referencia del array — como el store devuelve arrays inmutables (via
// useShallow), esto solo re-renderiza cuando cambian los datos.

import { memo } from 'react';

interface Props {
  values: number[];
  min?: number;
  max?: number;
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}

function SparklineImpl({
  values,
  min = 0,
  max = 100,
  width = 220,
  height = 42,
  color = '#22d3ee',
  fillOpacity = 0.15,
}: Props) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} style={{ opacity: 0.4 }}>
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const norm = (v: number) => height - ((v - min) / range) * height;

  const points = values.map((v, i) => `${i * stepX},${norm(v)}`).join(' ');
  const area = `M0,${height} L${points
    .split(' ')
    .join(' L')} L${width},${height} Z`;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spark-grad-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-grad-${color})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* punto final */}
      <circle
        cx={(values.length - 1) * stepX}
        cy={norm(values[values.length - 1])}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

// memo: si el array no cambia por referencia, no re-renderiza.
export const Sparkline = memo(SparklineImpl);
