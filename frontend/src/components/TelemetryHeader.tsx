// ════════════════════════════════════════════════════════════════════════
// TelemetryHeader — el "V.HUD" y "ENTROPY" grandes de la maqueta
// ════════════════════════════════════════════════════════════════════════
// Dos pantallas superiores con:
//   • Número grande (78.42%)
//   • Delta contra el giro anterior (+12.75%)
//   • Sparkline de tendencia (últimos 30 giros)
//
// Cada uno se suscribe a UN solo selector del store → cambia solo cuando
// cambia su métrica.

import { memo } from 'react';
import { Sparkline } from './Sparkline';
import { useLastSpin, useCurrentDelta, useSparkline } from '@/store/telemetryStore';

// ────────────────────────────────────────────────────────────────────────
// Bloque individual (V.HUD o ENTROPY)
// ────────────────────────────────────────────────────────────────────────

interface BlockProps {
  label: string;
  value: number | null;
  delta: number | null;
  spark: number[];
  color: string;
  glow: string;
}

function TelemetryBlockImpl({ label, value, delta, spark, color, glow }: BlockProps) {
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 16px 12px',
        borderRadius: 8,
        background:
          'linear-gradient(180deg, rgba(2,6,23,0.75) 0%, rgba(15,23,42,0.55) 100%)',
        border: '1px solid rgba(148,163,184,0.12)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 12px ${glow}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
      }}
    >
      {/* Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.3em',
            color,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 8.5,
            color: '#475569',
            fontFamily: 'monospace',
            letterSpacing: '0.15em',
          }}
        >
          0 — 100
        </span>
      </div>

      {/* Número grande + delta */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontSize: 36,
            fontWeight: 700,
            color,
            fontFamily: 'monospace',
            lineHeight: 1,
            textShadow: `0 0 14px ${glow}`,
            letterSpacing: '-0.02em',
          }}
        >
          {value !== null ? value.toFixed(0) : '—'}
          <span style={{ fontSize: 18, opacity: 0.65, marginLeft: 3 }}>%</span>
        </span>
        {delta !== null && (
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#94a3b8',
              letterSpacing: '0.05em',
            }}
          >
            Δ {delta > 0 ? '+' : ''}
            {delta.toFixed(0)}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <div style={{ marginTop: 2 }}>
        <Sparkline
          values={spark}
          min={0}
          max={100}
          width={undefined as any /* fill parent */}
          height={34}
          color={color}
          fillOpacity={0.18}
        />
      </div>
    </div>
  );
}

const TelemetryBlock = memo(TelemetryBlockImpl);

// ────────────────────────────────────────────────────────────────────────
// Header completo — se conecta al store con selectores granulares
// ────────────────────────────────────────────────────────────────────────

export function TelemetryHeader() {
  const last = useLastSpin();
  const dHud = useCurrentDelta('hud');
  const dEnt = useCurrentDelta('ent');
  const sparkHud = useSparkline('hud', 30);
  const sparkEnt = useSparkline('ent', 30);

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <TelemetryBlock
        label="VELOCITY HUD"
        value={last?.hud ?? null}
        delta={dHud}
        spark={sparkHud}
        color="#22d3ee"
        glow="rgba(34,211,238,0.18)"
      />
      <TelemetryBlock
        label="WHEEL ENTROPY"
        value={last?.ent ?? null}
        delta={dEnt}
        spark={sparkEnt}
        color="#f87171"
        glow="rgba(248,113,113,0.16)"
      />
    </div>
  );
}
