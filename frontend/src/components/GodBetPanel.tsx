// src/components/GodBetPanel.tsx
// GodBetPanel — Panel GOD BET.
//
// v2 (sep 2026) — REDISEÑO "INSTRUMENT PANEL" (sin cards). Antes: inactivo
// era una caja gris con borde+fondo+opacidad, activo una caja negra con
// borde rojo grueso, radio, sombra roja y una clase `animate-pulse-border`
// (CSS externo que no controlamos desde acá). Ahora: inactivo es una sola
// línea apagada, activo es un acento lateral rojo + encabezado con el
// único elemento animado siendo el punto ⚡ (el evento, no el contenedor) —
// mismo criterio que CategoryTable.tsx v5 y MatrixPanel.tsx: el color y el
// glow se reservan para lo que de verdad está pasando ahora, todo lo demás
// es texto plano.

import React from 'react';
import type { EnginePayload } from '@/types/api';
import { CategoryTable } from '@/components/CategoryTable';

interface Counter {
  wins: number;
  losses: number;
  streak: number;
  max_streak: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface Props {
  payload: EnginePayload | null;
  counters: Record<string, Counter>;
  countersGod: Record<string, Counter>;
  errorHist?: Record<string, any>;
  errorHistGod?: Record<string, any>;
  godActive: boolean;
  radarScore: number;
}

export function GodBetPanel({
  payload,
  counters,
  countersGod,
  errorHist = {},
  errorHistGod = {},
  godActive,
  radarScore,
}: Props) {

  if (!godActive) {
    // INACTIVO: una línea apagada, sin caja.
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 2px', opacity: 0.55 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.15em', color: '#64748b' }}>
          <span style={{ opacity: 0.6 }}>⚡</span>
          GOD BET
          <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.1em' }}>— INACTIVO</span>
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          Esperando OPTIMAL + Radar ≥7 · Radar actual: <b style={{ color: '#94a3b8' }}>{radarScore}/10</b>
        </span>
      </div>
    );
  }

  // ACTIVO: acento lateral rojo + CategoryTable en modo GOD. El único
  // elemento con movimiento es el punto ⚡ — es el evento, no la caja.
  return (
    <div style={{ borderLeft: '3px solid #f87171', paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="animate-pulse" style={{ color: '#f87171', fontSize: 12 }}>⚡</span>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', color: '#fca5a5', textShadow: '0 0 10px rgba(248,113,113,0.5)' }}>
            GOD BET — ACTIVO
          </span>
        </span>
        <span style={{ fontSize: 10, color: '#fca5a5' }}>
          (OPTIMAL + Radar ≥7) · Radar actual: <b style={{ color: '#ffffff' }}>{radarScore}/10</b>
        </span>
      </div>

      <CategoryTable
        payload={payload}
        counters={counters}
        god={true}
        countersGod={countersGod}
        errorHist={errorHist}
        errorHistGod={errorHistGod}
        title="CATEGORÍAS GOD (MODO ALTA PRECISIÓN)"
        inlinePanel={true}
      />
    </div>
  );
}
