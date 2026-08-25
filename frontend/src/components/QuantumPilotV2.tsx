// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Quantum Pilot V2 (contenedor apaisado)
// ════════════════════════════════════════════════════════════════════════
//
// Reescritura desde cero del panel de decisión. Layout de 3 zonas en Grid:
//
//   ┌─────────── HEADER (drag) ────────────────────┐
//   │  V.HUD %          |         ENTROPY %        │  ← TelemetryHeader
//   ├──────────────────────────────────────────────┤
//   │                                              │
//   │         RADAR CARTESIANO (Pixi WebGL)        │  ← RadarCanvas
//   │                                              │
//   ├──────────────────────────────────────────────┤
//   │   DOCENAS        |         COLUMNAS          │  ← DecisionCards
//   └──────────────────────────────────────────────┘
//
// Arquitectura:
//   • Zustand store centraliza el historial → cada sub-componente se
//     suscribe SOLO a los selectores que necesita (re-renders granulares).
//   • Drag por GPU vía translate3d y useRef → cero re-renders al mover.
//   • RadarCanvas monta Pixi UNA vez; sus updates son mutación local.
//   • DecisionCard y Sparkline son React.memo.
//
// El único trabajo del contenedor es:
//   1. Detectar cambio de spinsCount y llamar `ingest(...)` en el store.
//   2. Renderizar el layout.
//
// No pasa historiales por props → no hay re-render cascada.

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { motion } from 'framer-motion';
import {
  useCurrentZone,
  useCurrentStreak,
  useIngestSpin,
  useLastSpin,
  useRadarTrail,
} from '@/store/telemetryStore';
import { TelemetryHeader } from './TelemetryHeader';
import { RadarCanvas } from './RadarCanvas';
import { DecisionCard } from './DecisionCard';
import type { QuantumV2Props, ActiveBet } from '@/types/quantumV2Types';
import { CAT_LABEL } from '@/types/quantumV2Types';

// ────────────────────────────────────────────────────────────────────────
// Hook de drag por mutación DOM (cero re-renders)
// ────────────────────────────────────────────────────────────────────────

function useDrag(initial: { x: number; y: number }) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const pos = useRef({ ...initial });
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const apply = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  }, []);

  const setNodeRef = useCallback(
    (el: HTMLDivElement | null) => {
      nodeRef.current = el;
      if (el) {
        el.style.willChange = 'transform';
        apply();
      }
    },
    [apply]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      start.current = { x: cx, y: cy };
      posStart.current = { ...pos.current };
      dragging.current = true;
      e.stopPropagation();
    },
    []
  );

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const cx = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      pos.current = {
        x: posStart.current.x + (cx - start.current.x),
        y: posStart.current.y + (cy - start.current.y),
      };
      apply();
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [apply]);

  return { setNodeRef, onMouseDown };
}

// ────────────────────────────────────────────────────────────────────────
// Zona DOC (aislada, se conecta al store con selectores propios)
// ────────────────────────────────────────────────────────────────────────

interface ZoneCardsProps {
  suggestionDoc: ActiveBet | null;
  suggestionCol: ActiveBet | null;
}

const ZoneCards = memo(function ZoneCards({
  suggestionDoc,
  suggestionCol,
}: ZoneCardsProps) {
  const zoneDoc = useCurrentZone('doc');
  const zoneCol = useCurrentZone('col');
  const streakDoc = useCurrentStreak('doc');
  const streakCol = useCurrentStreak('col');
  const last = useLastSpin();

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <DecisionCard
        market="doc"
        zone={zoneDoc}
        hud={last?.hud ?? null}
        ent={last?.ent ?? null}
        streak={streakDoc}
        suggestion={
          suggestionDoc
            ? {
                label: `${CAT_LABEL[suggestionDoc.bet_key] ?? suggestionDoc.bet_key} ${suggestionDoc.pick_pretty}`,
                conf: suggestionDoc.conf_pct,
              }
            : null
        }
      />
      <DecisionCard
        market="col"
        zone={zoneCol}
        hud={last?.hud ?? null}
        ent={last?.ent ?? null}
        streak={streakCol}
        suggestion={
          suggestionCol
            ? {
                label: `${CAT_LABEL[suggestionCol.bet_key] ?? suggestionCol.bet_key} ${suggestionCol.pick_pretty}`,
                conf: suggestionCol.conf_pct,
              }
            : null
        }
      />
    </div>
  );
});

// ────────────────────────────────────────────────────────────────────────
// Radar aislado — se re-renderiza solo cuando cambia el trail
// ────────────────────────────────────────────────────────────────────────

const RadarSection = memo(function RadarSection() {
  const trail = useRadarTrail(6);
  // El radar arranca en DOC por defecto — futura mejora: toggle DOC/COL.
  return <RadarCanvas trail={trail} market="doc" width={640} height={340} />;
});

// ────────────────────────────────────────────────────────────────────────
// Contenedor principal
// ────────────────────────────────────────────────────────────────────────

export function QuantumPilotV2(props: QuantumV2Props) {
  const { spinsCount, hud, entropy, docHit, colHit, godBet } = props;
  const { setNodeRef, onMouseDown } = useDrag({ x: 20, y: 80 });
  const [minimized, setMinimized] = useState(false);

  // Ingesta al store — una sola vez por giro (idempotente adentro del store).
  const ingest = useIngestSpin();
  useEffect(() => {
    ingest({ n: spinsCount, hud, ent: entropy, docHit, colHit });
  }, [spinsCount, hud, entropy, docHit, colHit, ingest]);

  // Extraer sugerencias del motor (para las tarjetas de decisión).
  const suggestionDoc =
    godBet.active_bets?.find((b) => b.bet_key === 'docenas') ?? null;
  const suggestionCol =
    godBet.active_bets?.find((b) => b.bet_key === 'columnas') ?? null;

  // ── Minimizado ─────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div
        ref={setNodeRef}
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 50,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(8,12,22,0.95) 0%, rgba(15,23,42,0.95) 100%)',
          border: `1px solid ${godBet.active ? 'rgba(220,38,38,0.6)' : 'rgba(34,211,238,0.4)'}`,
          boxShadow: godBet.active
            ? '0 0 18px rgba(220,38,38,0.5)'
            : '0 0 18px rgba(34,211,238,0.4)',
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          color: godBet.active ? '#f87171' : '#67e8f9',
        }}
      >
        ⚡
      </div>
    );
  }

  // ── Panel principal (Grid apaisado) ────────────────────────────────
  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 50,
        width: 900,
        maxWidth: '97vw',
        maxHeight: '94vh',
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: 'monospace',
        color: '#e2e8f0',
        userSelect: 'none',
        background:
          'linear-gradient(145deg, rgba(8,12,22,0.96) 0%, rgba(15,23,42,0.93) 50%, rgba(8,12,22,0.96) 100%)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        border: godBet.active
          ? '1px solid rgba(220,38,38,0.5)'
          : '1px solid rgba(34,211,238,0.25)',
        boxShadow: godBet.active
          ? '0 0 0 1px rgba(220,38,38,0.15) inset, 0 0 26px rgba(220,38,38,0.35), 0 8px 32px rgba(0,0,0,0.6)'
          : '0 0 0 1px rgba(34,211,238,0.08) inset, 0 0 26px rgba(34,211,238,0.18), 0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      {/* ── Barra de arrastre (título + minimize) ────────────────── */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(34,211,238,0.12)',
          background:
            'linear-gradient(90deg, rgba(8,47,73,0.55) 0%, rgba(15,23,42,0.35) 100%)',
          cursor: 'grab',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.3em',
            color: '#67e8f9',
            textShadow: '0 0 8px rgba(34,211,238,0.4)',
          }}
        >
          D.A.N.N.A. TERMINAL v2.0
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.2em' }}>
            SPIN #{spinsCount}
          </span>
          <button
            onClick={() => setMinimized(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 16,
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="minimize"
          >
            —
          </button>
        </div>
      </div>

      {/* ── Grid de 3 zonas: TOP / CENTER / BOTTOM ────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          gap: 10,
          padding: 12,
          overflowY: 'auto',
          maxHeight: 'calc(94vh - 46px)',
        }}
      >
        {/* TOP · Telemetría */}
        <TelemetryHeader />

        {/* CENTER · Radar cartesiano */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RadarSection />
        </div>

        {/* BOTTOM · Decisión bifurcada */}
        <ZoneCards
          suggestionDoc={suggestionDoc}
          suggestionCol={suggestionCol}
        />
      </div>
    </motion.div>
  );
}
