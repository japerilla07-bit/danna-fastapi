// src/components/GodBetPanel.tsx
// GodBetPanel — Panel GOD BET.
// Activo: misma estructura que CategoryTable pero con borde rojo + icono pulsante.
// Inactivo: solo header sin tabla.

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
    // INACTIVO: strip compacto
    return (
      <div className="panel god-panel inactive bg-gray-900 border border-gray-700 rounded-lg p-3 my-2 opacity-60 transition-opacity duration-300">
        <div className="god-head flex items-center justify-between text-gray-400 font-mono text-sm">
          <div className="flex items-center gap-2">
            <span className="ico opacity-50">⚡</span>
            <span className="god-title font-bold tracking-wider">GOD BET</span>
            <span className="god-badge inactive-badge text-xs px-2 py-0.5 bg-gray-800 rounded">— INACTIVO</span>
          </div>
          <span className="god-info text-xs">
            Esperando OPTIMAL + Radar ≥7 · Radar actual:{' '}
            <span className="em text-gray-300 font-bold">{radarScore}/10</span>
          </span>
        </div>
      </div>
    );
  }

  // ACTIVO: CategoryTable con estilo GOD (borde rojo brillante, mismo grid)
  return (
    <div className="panel god-panel bg-black border-2 border-red-600 rounded-lg p-4 my-2 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all duration-500 animate-pulse-border">
      {/* Header GOD sobre la tabla */}
      <div className="god-head flex items-center justify-between text-white font-mono mb-4">
        <div className="flex items-center gap-3">
          <span className="ico text-red-500 animate-ping">⚡</span>
          <span className="god-title font-black text-lg tracking-widest text-red-100">GOD BET</span>
          <span className="god-badge text-xs px-2 py-1 bg-red-700 text-white rounded font-bold">— ACTIVO</span>
        </div>
        <span className="god-info text-sm text-red-200">
          (OPTIMAL + Radar ≥7) · Radar actual:{' '}
          <span className="em text-white font-black">{radarScore}/10</span>
        </span>
      </div>

      {/* Tabla GOD con mismo grid que CategoryTable */}
      <div className="god-table-wrapper opacity-100 transition-opacity">
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
    </div>
  );
}