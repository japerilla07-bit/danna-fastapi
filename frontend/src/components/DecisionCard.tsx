// ════════════════════════════════════════════════════════════════════════
// DecisionCard — tarjeta bifurcada por mercado (DOC · COL)
// ════════════════════════════════════════════════════════════════════════
// Muestra:
//   • Zona actual (VERDE · PROBE · TÓXICA) con transición fluida.
//   • Coordenadas HUD × ENT.
//   • Drawdown tracker segmentado (STREAK_CAP bloques por mercado).
//   • Sugerencia del motor si aplica (topPick).
//
// Optimización:
//   • memo() en el componente → solo re-renderiza cuando cambian sus props.
//   • Selectores del store aíslan cambios: zone→chip, streak→tracker.
//   • Framer Motion transiciona SOLO el chip de zona (color + escala).

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Market, Zone } from '@/domain/zoneMatrix';
import { STREAK_CAP } from '@/domain/zoneMatrix';

interface Props {
  market: Market;
  zone: Zone;
  hud: number | null;
  ent: number | null;
  streak: number;
  suggestion?: {
    label: string;   // p.ej. "COL 1" o "DOC 2"
    conf: number;    // 0-100
  } | null;
}

const ZONE_STYLE: Record<
  Zone,
  { bg: string; border: string; text: string; label: string; icon: string; glow: string }
> = {
  VERDE: {
    bg: 'linear-gradient(180deg, rgba(6,78,59,0.5) 0%, rgba(6,78,59,0.2) 100%)',
    border: 'rgba(52,211,153,0.7)',
    text: '#a7f3d0',
    label: 'VERDE · OPERABLE',
    icon: '●',
    glow: 'rgba(52,211,153,0.35)',
  },
  PROBE: {
    bg: 'linear-gradient(180deg, rgba(120,53,15,0.5) 0%, rgba(120,53,15,0.2) 100%)',
    border: 'rgba(251,146,60,0.7)',
    text: '#fed7aa',
    label: 'PROBE · TRANSICIÓN',
    icon: '◆',
    glow: 'rgba(251,146,60,0.35)',
  },
  TOXICA: {
    bg: 'linear-gradient(180deg, rgba(127,29,29,0.55) 0%, rgba(127,29,29,0.22) 100%)',
    border: 'rgba(248,113,113,0.75)',
    text: '#fecaca',
    label: 'TÓXICA · CAUTELA',
    icon: '✕',
    glow: 'rgba(248,113,113,0.4)',
  },
};

function DecisionCardImpl({ market, zone, hud, ent, streak, suggestion }: Props) {
  const style = ZONE_STYLE[zone];
  const cap = STREAK_CAP[market];
  const title = market === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const filled = Math.min(streak, cap);

  return (
    <div
      style={{
        flex: 1,
        borderRadius: 10,
        border: `1px solid ${style.border}`,
        background: style.bg,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 18px ${style.glow}`,
        minWidth: 0,
      }}
    >
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.25em',
            color: '#e2e8f0',
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 9.5, color: '#94a3b8', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
          HUD {hud ?? '—'} · ENT {ent ?? '—'}
        </span>
      </div>

      {/* Chip de zona con transición Framer */}
      <AnimatePresence mode="wait">
        <motion.div
          key={zone}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span
            style={{
              fontSize: 22,
              lineHeight: 1,
              color: style.text,
              textShadow: `0 0 12px ${style.glow}`,
            }}
          >
            {style.icon}
          </span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 800,
              color: style.text,
              letterSpacing: '0.12em',
            }}
          >
            {style.label}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Sugerencia del motor (opcional) */}
      {suggestion && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 6,
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(148,163,184,0.15)',
          }}
        >
          <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.15em' }}>
            SUGERENCIA
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#67e8f9',
              fontFamily: 'monospace',
            }}
          >
            {suggestion.label} · {suggestion.conf}%
          </span>
        </div>
      )}

      {/* Drawdown tracker segmentado */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            color: '#64748b',
            letterSpacing: '0.18em',
          }}
        >
          <span>DRAWDOWN</span>
          <span
            style={{
              color: streak >= cap - 1 ? '#f87171' : '#94a3b8',
              fontFamily: 'monospace',
            }}
          >
            {streak}/{cap}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: cap }).map((_, i) => {
            const on = i < filled;
            const alert = i >= cap - 2 && on;
            return (
              <motion.div
                key={i}
                animate={{
                  backgroundColor: on
                    ? alert
                      ? 'rgba(248,113,113,0.88)'
                      : 'rgba(251,146,60,0.78)'
                    : 'rgba(148,163,184,0.14)',
                }}
                transition={{ duration: 0.18 }}
                style={{
                  flex: 1,
                  height: 7,
                  borderRadius: 2,
                  border: `1px solid ${
                    on ? 'rgba(248,113,113,0.5)' : 'rgba(148,163,184,0.2)'
                  }`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const DecisionCard = memo(DecisionCardImpl);
