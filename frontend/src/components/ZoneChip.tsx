// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — ZoneChip v3 (contadores acumulados + zonas puntuales)
// ════════════════════════════════════════════════════════════════════════
//
// Cambios v3:
//   • Drawdown contiguo → CONTADORES ACUMULADOS por mercado
//     (aciertos · errores · WR sesión).
//   • Zonas 3×3 → ZONAS PUNTUALES (20 celdas nombradas de 5×5 puntos).
//   • Nuevo estado AGUJERO NEGRO: banner rojo pulsante prioritario.
//   • Halo Pixi solo en zonas críticas (AGUJERO / TÓXICA).
// ════════════════════════════════════════════════════════════════════════

import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Application, Graphics } from 'pixi.js';
import {
  useCurrentZone,
  useLastHud,
  useLastEnt,
  useMarketHits,
  useMarketMisses,
  useMarketWr,
} from '@/store/telemetryStore';
import {
  currentCellWr,
  currentCellLabel,
  currentCellHint,
  type Zone,
  type Market,
} from '@/domain/zoneMatrix';

// ────────────────────────────────────────────────────────────────────────
// Halo Pixi WebGL
// ────────────────────────────────────────────────────────────────────────

interface HaloProps { color: number; active: boolean; }

const PulsingHalo = memo(function PulsingHalo({ color, active }: HaloProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gRef = useRef<Graphics | null>(null);
  const activeRef = useRef(active);
  const colorRef = useRef(color);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { colorRef.current = color; }, [color]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const app = new Application();
    const width = 340, height = 110;

    (async () => {
      await app.init({
        width, height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (cancelled) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      appRef.current = app;

      const g = new Graphics();
      app.stage.addChild(g);
      gRef.current = g;

      let t = 0;
      app.ticker.add((ticker) => {
        t += ticker.deltaTime * 0.05;
        g.clear();
        if (!activeRef.current) return;
        const pulse = 0.4 + Math.sin(t) * 0.25;
        const cx = width / 2, cy = height / 2;
        g.circle(cx, cy, width * 0.55).fill({ color: colorRef.current, alpha: pulse * 0.08 });
        g.circle(cx, cy, width * 0.35).fill({ color: colorRef.current, alpha: pulse * 0.14 });
        g.circle(cx, cy, width * 0.20).fill({ color: colorRef.current, alpha: pulse * 0.20 });
      });
    })();

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      while (host.firstChild) host.removeChild(host.firstChild);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', overflow: 'hidden', borderRadius: 10,
      }}
    />
  );
});

// ────────────────────────────────────────────────────────────────────────
// Paletas por zona
// ────────────────────────────────────────────────────────────────────────

const STYLE: Record<Zone, {
  bg: string; border: string; text: string;
  label: string; icon: string; glow: string;
  haloColor: number; halo: boolean;
}> = {
  SANTUARIO: {
    bg: 'linear-gradient(180deg, rgba(4,120,87,0.60) 0%, rgba(6,78,59,0.25) 100%)',
    border: 'rgba(52,211,153,0.85)',
    text: '#d1fae5',
    label: 'SANTUARIO · OPERAR',
    icon: '★',
    glow: 'rgba(52,211,153,0.55)',
    haloColor: 0x34d399,
    halo: false,
  },
  VERDE: {
    bg: 'linear-gradient(180deg, rgba(6,78,59,0.50) 0%, rgba(6,78,59,0.18) 100%)',
    border: 'rgba(52,211,153,0.70)',
    text: '#a7f3d0',
    label: 'VERDE · OPERABLE',
    icon: '●',
    glow: 'rgba(52,211,153,0.40)',
    haloColor: 0x10b981,
    halo: false,
  },
  PROBE: {
    bg: 'linear-gradient(180deg, rgba(120,53,15,0.55) 0%, rgba(120,53,15,0.22) 100%)',
    border: 'rgba(251,146,60,0.75)',
    text: '#fed7aa',
    label: 'PROBE · ROTAR',
    icon: '◆',
    glow: 'rgba(251,146,60,0.40)',
    haloColor: 0xfb923c,
    halo: false,
  },
  TOXICA: {
    bg: 'linear-gradient(180deg, rgba(127,29,29,0.60) 0%, rgba(127,29,29,0.25) 100%)',
    border: 'rgba(248,113,113,0.80)',
    text: '#fecaca',
    label: 'TÓXICA · NO OPERAR',
    icon: '✕',
    glow: 'rgba(248,113,113,0.45)',
    haloColor: 0xdc2626,
    halo: true,
  },
  AGUJERO: {
    bg: 'linear-gradient(180deg, rgba(69,10,10,0.75) 0%, rgba(24,3,3,0.45) 100%)',
    border: 'rgba(220,38,38,1)',
    text: '#fecaca',
    label: 'AGUJERO NEGRO · SALIR',
    icon: '⛔',
    glow: 'rgba(220,38,38,0.75)',
    haloColor: 0xdc2626,
    halo: true,
  },
  NEUTRA: {
    bg: 'linear-gradient(180deg, rgba(51,65,85,0.45) 0%, rgba(30,41,59,0.20) 100%)',
    border: 'rgba(148,163,184,0.45)',
    text: '#cbd5e1',
    label: 'NEUTRA · SIN DECISIÓN',
    icon: '·',
    glow: 'rgba(148,163,184,0.25)',
    haloColor: 0x64748b,
    halo: false,
  },
};

// ────────────────────────────────────────────────────────────────────────
// Tarjeta por mercado
// ────────────────────────────────────────────────────────────────────────

interface CardProps {
  market: Market;
  zone: Zone;
  hud: number | null;
  ent: number | null;
  hits: number;
  misses: number;
  wr: number | null;
  cellWr: number | null;
  cellLabel: string | null;
  cellHint: string | null;
}

function MarketCardImpl({
  market, zone, hud, ent, hits, misses, wr, cellWr, cellLabel, cellHint,
}: CardProps) {
  const s = STYLE[zone];
  const title = market === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const total = hits + misses;

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        borderRadius: 10,
        border: `1px solid ${s.border}`,
        background: s.bg,
        padding: '10px 12px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px ${s.glow}`,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <PulsingHalo color={s.haloColor} active={s.halo} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.25em', color: '#e2e8f0' }}>
            {title}
          </span>
          <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            HUD {hud ?? '—'} · ENT {ent ?? '—'}
            {cellWr !== null && <> · {cellWr.toFixed(1)}%</>}
          </span>
        </div>

        {/* Chip zona + label */}
        <AnimatePresence mode="wait">
          <motion.div
            key={zone}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          >
            <span style={{
              fontSize: 22, lineHeight: 1, color: s.text,
              textShadow: `0 0 10px ${s.glow}`,
            }}>
              {s.icon}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 800, color: s.text, letterSpacing: '0.11em',
            }}>
              {s.label}
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Zona nombrada + hint */}
        {cellLabel && (
          <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.35 }}>
            <div style={{ letterSpacing: '0.08em', fontWeight: 600, color: '#cbd5e1' }}>
              {cellLabel}
            </div>
            {cellHint && (
              <div style={{ fontSize: 8.5, marginTop: 1, fontStyle: 'italic', opacity: 0.85 }}>
                {cellHint}
              </div>
            )}
          </div>
        )}

        {/* Contador de sesión */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '5px 8px',
          borderRadius: 6,
          background: 'rgba(15,23,42,0.55)',
          border: '1px solid rgba(148,163,184,0.15)',
          fontFamily: 'monospace',
          fontSize: 10,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: '#4ade80' }}>✓ {hits}</span>
            <span style={{ color: '#f87171' }}>✗ {misses}</span>
            <span style={{ color: '#64748b' }}>· {total}</span>
          </div>
          <span style={{
            fontWeight: 700,
            color: wr === null ? '#64748b' : wr >= 66.67 ? '#4ade80' : wr >= 60 ? '#fbbf24' : '#f87171',
          }}>
            {wr === null ? '—' : `${wr.toFixed(1)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

const MarketCard = memo(MarketCardImpl);

// ────────────────────────────────────────────────────────────────────────
// Componente exportado
// ────────────────────────────────────────────────────────────────────────

export function ZoneChip() {
  const hud = useLastHud();
  const ent = useLastEnt();
  const zoneDoc = useCurrentZone('doc');
  const zoneCol = useCurrentZone('col');
  const hitsDoc = useMarketHits('doc');
  const missesDoc = useMarketMisses('doc');
  const hitsCol = useMarketHits('col');
  const missesCol = useMarketMisses('col');
  const wrDoc = useMarketWr('doc');
  const wrCol = useMarketWr('col');
  const cellWrDoc = currentCellWr(hud, ent, 'doc');
  const cellWrCol = currentCellWr(hud, ent, 'col');
  const cellLabel = currentCellLabel(hud, ent);
  const cellHint = currentCellHint(hud, ent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        className="text-[11px] text-cyan-500/70 px-1"
        style={{ letterSpacing: '0.3em' }}
      >
        LECTURA DE MESA · CAOS · ESTABILIDAD · CONTADOR DE SESIÓN
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <MarketCard
          market="doc"
          zone={zoneDoc}
          hud={hud}
          ent={ent}
          hits={hitsDoc}
          misses={missesDoc}
          wr={wrDoc}
          cellWr={cellWrDoc}
          cellLabel={cellLabel}
          cellHint={cellHint}
        />
        <MarketCard
          market="col"
          zone={zoneCol}
          hud={hud}
          ent={ent}
          hits={hitsCol}
          misses={missesCol}
          wr={wrCol}
          cellWr={cellWrCol}
          cellLabel={cellLabel}
          cellHint={cellHint}
        />
      </div>
    </div>
  );
}
