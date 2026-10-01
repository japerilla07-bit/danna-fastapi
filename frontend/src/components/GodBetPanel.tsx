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

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

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
      <div
        className="panel god-panel inactive"
        style={{
          background: 'rgba(13,18,25,0.5)',
          border: '1px solid rgba(148,163,184,0.10)',
          borderRadius: 4,
          padding: '8px 12px',
          opacity: 0.65,
          transition: 'opacity 300ms',
          fontFamily: MONO,
        }}
      >
        <div
          className="god-head"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#64748b',
            fontSize: 10.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="ico"
              style={{ opacity: 0.45, fontSize: 13 }}
            >
              ⚡
            </span>
            <span
              className="god-title"
              style={{
                fontWeight: 800,
                letterSpacing: '0.22em',
                color: '#64748b',
                fontSize: 10,
                textTransform: 'uppercase',
              }}
            >
              GOD BET
            </span>
            <span
              className="god-badge inactive-badge"
              style={{
                fontSize: 8.5,
                padding: '1px 6px',
                background: 'rgba(100,116,139,0.12)',
                border: '1px solid rgba(100,116,139,0.25)',
                color: '#64748b',
                borderRadius: 2,
                letterSpacing: '0.14em',
                fontWeight: 700,
              }}
            >
              INACTIVO
            </span>
          </div>
          <span className="god-info" style={{ fontSize: 9.5, color: '#64748b', letterSpacing: '0.05em' }}>
            Esperando OPTIMAL + Radar ≥7 · Radar actual:{' '}
            <span className="em" style={{ color: '#94a3b8', fontWeight: 700 }}>{radarScore}/10</span>
          </span>
        </div>
      </div>
    );
  }

  // ACTIVO: CategoryTable con estilo GOD (borde rojo brillante, mismo grid)
  return (
    <div
      className="panel god-panel"
      style={{
        background: 'linear-gradient(180deg, rgba(20,8,8,0.85) 0%, rgba(13,6,6,0.95) 100%)',
        border: '1px solid rgba(239,68,68,0.45)',
        borderRadius: 4,
        padding: 12,
        margin: '8px 0',
        boxShadow: '0 0 0 1px rgba(239,68,68,0.08) inset, 0 0 18px rgba(239,68,68,0.20)',
        transition: 'all 500ms',
        animation: 'godPulse 2s ease-in-out infinite',
        fontFamily: MONO,
      }}
    >
      {/* Header GOD sobre la tabla */}
      <div
        className="god-head"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fee2e2',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="ico"
            style={{
              fontSize: 15,
              color: '#ef4444',
              animation: 'godPing 1.6s ease-in-out infinite',
              display: 'inline-block',
              textShadow: '0 0 10px rgba(239,68,68,0.7)',
            }}
          >
            ⚡
          </span>
          <span
            className="god-title"
            style={{
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: '0.28em',
              color: '#fecaca',
              textShadow: '0 0 10px rgba(239,68,68,0.4)',
            }}
          >
            GOD BET
          </span>
          <span
            className="god-badge"
            style={{
              fontSize: 8.5,
              padding: '2px 8px',
              background: 'rgba(185,28,28,0.35)',
              color: '#fee2e2',
              border: '1px solid rgba(248,113,113,0.5)',
              borderRadius: 2,
              fontWeight: 800,
              letterSpacing: '0.18em',
            }}
          >
            ACTIVO
          </span>
        </div>
        <span
          className="god-info"
          style={{ fontSize: 9.5, color: '#fca5a5', letterSpacing: '0.05em' }}
        >
          (OPTIMAL + Radar ≥7) · Radar actual:{' '}
          <span className="em" style={{ color: '#ffffff', fontWeight: 800 }}>{radarScore}/10</span>
        </span>
      </div>

      {/* Tabla GOD con mismo grid que CategoryTable */}
      <div className="god-table-wrapper" style={{ opacity: 1, transition: 'opacity 200ms' }}>
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

      <style>{`
        @keyframes godPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.08) inset, 0 0 18px rgba(239,68,68,0.20); }
          50%      { box-shadow: 0 0 0 1px rgba(239,68,68,0.15) inset, 0 0 26px rgba(239,68,68,0.35); }
        }
        @keyframes godPing {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.15); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
