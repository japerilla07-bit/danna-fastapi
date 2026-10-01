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
//
// v3 (sep 2026) — CORRECCIÓN: Gunner probó v2 en vivo — "no es facil leer,
// no hay separacion clara, no hay cian flash no hay micropaneles". Un
// acento lateral solo no separa el panel del resto de la pantalla. Ahora
// ambos estados (inactivo/activo) van en UN micropanel propio (borde +
// fondo sutil, una sola capa — nunca anidado con el de CategoryTable, que
// sigue recibiendo inlinePanel={true} para no duplicar el borde), con
// texto más grande y el glow rojo del estado activo más presente.

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
    // INACTIVO: micropanel apagado — borde gris tenue, sin glow. Separado
    // del resto del panel igual que el activo, solo que sin "energía".
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '9px 12px',
          background: 'rgba(10, 16, 28, 0.45)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(100, 116, 139, 0.22)',
          borderRadius: 8,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#94a3b8' }}>
          <span style={{ opacity: 0.6 }}>⚡</span>
          GOD BET
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', letterSpacing: '0.1em' }}>— INACTIVO</span>
        </span>
        <span style={{ fontSize: 11.5, color: '#7c8aa0' }}>
          Esperando OPTIMAL + Radar ≥7 · Radar actual: <b style={{ color: '#cbd5e1' }}>{radarScore}/10</b>
        </span>
      </div>
    );
  }

  // ACTIVO: micropanel con borde rojo + glow. El único elemento con
  // movimiento es el punto ⚡ — es el evento, no el contenedor.
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '10px 12px',
        background: 'rgba(30, 8, 8, 0.45)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(248, 113, 113, 0.45)',
        borderRadius: 8,
        boxShadow: '0 0 18px rgba(248, 113, 113, 0.14), inset 0 1px 0 rgba(248,113,113,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="animate-pulse" style={{ color: '#f87171', fontSize: 13 }}>⚡</span>
          <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '0.2em', color: '#fca5a5', textShadow: '0 0 12px rgba(248,113,113,0.6)' }}>
            GOD BET — ACTIVO
          </span>
        </span>
        <span style={{ fontSize: 11.5, color: '#fca5a5' }}>
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
