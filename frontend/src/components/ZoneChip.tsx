// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — ZoneChip · Semáforo bifurcado DOC/COL (pro)
// ════════════════════════════════════════════════════════════════════════
//
// Bloque compacto pero rico visualmente que se inserta ARRIBA del bloque
// TARGET LOCK del Quantumpilot legacy. Autocontenido: solo consume el
// store de telemetría, sin props. No toca ningún flujo del panel viejo.
//
// Anatomía:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ LECTURA DE MESA · CAOS/ESTABILIDAD/ESTADO DEL MOTOR         │
//   ├─────────────────────────────┬────────────────────────────────┤
//   │ DOCENAS                     │  COLUMNAS                      │
//   │ ● VERDE · SANTUARIO LENTO   │  ● VERDE · SANTUARIO LENTO     │
//   │ HUD 30 · ENT 25 · WR 66.8%  │  HUD 30 · ENT 25 · WR 71.8%    │
//   │ ▇▇▇░░░░ 3/7 drawdown        │  ▇▇▇░░ 3/5 drawdown            │
//   └─────────────────────────────┴────────────────────────────────┘
//
// Estados por tarjeta:
//   VERDE   — chip esmeralda con halo suave.
//   PROBE   — chip ámbar, sugiere rotar al otro mercado.
//   TOXICA  — chip rojo con halo Pixi WebGL pulsante (capta la atención).
//   NO_DATA — chip gris con banda diagonal (más severo que TÓXICA).
//
// Rendimiento:
//   • Selectores por primitivas → cero re-renders en cascada.
//   • Halo Pixi montado UNA vez; sólo cambia alpha/color por props.
//   • Framer Motion en el chip principal y en los bloques de drawdown.
// ════════════════════════════════════════════════════════════════════════

import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Application, Graphics } from 'pixi.js';
import {
  useCurrentZone,
  useCurrentStreak,
  useLastHud,
  useLastEnt,
} from '@/store/telemetryStore';
import {
  currentCellWr,
  currentCellLabel,
  STREAK_CAP,
  type Zone,
  type Market,
} from '@/domain/zoneMatrix';

// ────────────────────────────────────────────────────────────────────────
// Halo Pixi WebGL (se enciende en TOXICA y NO_DATA)
// ────────────────────────────────────────────────────────────────────────

interface HaloProps {
  color: number;
  active: boolean;
  width?: number;
  height?: number;
}

const PulsingHalo = memo(function PulsingHalo({
  color,
  active,
  width = 300,
  height = 90,
}: HaloProps) {
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

      // Loop de animación por ticker de Pixi — no dispara React.
      let t = 0;
      app.ticker.add((ticker) => {
        t += ticker.deltaTime * 0.05;
        g.clear();
        if (!activeRef.current) return;
        const pulse = 0.4 + Math.sin(t) * 0.25;
        // Tres círculos concéntricos, mayor a menor
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
  }, [width, height]);

  return (
    <div
      ref={hostRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        borderRadius: 10,
      }}
    />
  );
});

// ────────────────────────────────────────────────────────────────────────
// Paletas por zona
// ────────────────────────────────────────────────────────────────────────

const ZONE_STYLE: Record<Zone, {
  bg: string; border: string; text: string; label: string; icon: string;
  glow: string; haloColor: number; halo: boolean;
}> = {
  VERDE: {
    bg: 'linear-gradient(180deg, rgba(6,78,59,0.55) 0%, rgba(6,78,59,0.20) 100%)',
    border: 'rgba(52,211,153,0.75)',
    text: '#a7f3d0',
    label: 'VERDE · OPERABLE',
    icon: '●',
    glow: 'rgba(52,211,153,0.4)',
    haloColor: 0x10b981,
    halo: false,
  },
  PROBE: {
    bg: 'linear-gradient(180deg, rgba(120,53,15,0.55) 0%, rgba(120,53,15,0.22) 100%)',
    border: 'rgba(251,146,60,0.75)',
    text: '#fed7aa',
    label: 'PROBE · ROTAR',
    icon: '◆',
    glow: 'rgba(251,146,60,0.4)',
    haloColor: 0xfb923c,
    halo: false,
  },
  TOXICA: {
    bg: 'linear-gradient(180deg, rgba(127,29,29,0.6) 0%, rgba(127,29,29,0.25) 100%)',
    border: 'rgba(248,113,113,0.8)',
    text: '#fecaca',
    label: 'TÓXICA · CAUTELA',
    icon: '✕',
    glow: 'rgba(248,113,113,0.45)',
    haloColor: 0xdc2626,
    halo: true,  // ← HALO PIXI ENCENDIDO
  },
  NO_DATA: {
    bg: 'linear-gradient(180deg, rgba(51,65,85,0.65) 0%, rgba(30,41,59,0.35) 100%)',
    border: 'rgba(148,163,184,0.75)',
    text: '#e2e8f0',
    label: 'SIN DATA · NO OPERAR',
    icon: '⛔',
    glow: 'rgba(148,163,184,0.4)',
    haloColor: 0x64748b,
    halo: true,  // ← HALO PIXI ENCENDIDO
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
  streak: number;
  wr: number | null;
  cellLabel: string | null;
}

function MarketCardImpl({ market, zone, hud, ent, streak, wr, cellLabel }: CardProps) {
  const s = ZONE_STYLE[zone];
  const cap = STREAK_CAP[market];
  const filled = Math.min(streak, cap);
  const title = market === 'doc' ? 'DOCENAS' : 'COLUMNAS';

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
        gap: 7,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px ${s.glow}`,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Halo Pixi (solo TOXICA / NO_DATA) */}
      <PulsingHalo color={s.haloColor} active={s.halo} width={340} height={110} />

      {/* Contenido por encima del halo */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {/* Encabezado: mercado + coordenadas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.25em', color: '#e2e8f0',
          }}>
            {title}
          </span>
          <span style={{
            fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', letterSpacing: '0.1em',
          }}>
            HUD {hud ?? '—'} · ENT {ent ?? '—'}
            {wr !== null && <> · {wr.toFixed(1)}%</>}
          </span>
        </div>

        {/* Chip zona + label celda (con transición Framer) */}
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
              fontSize: 20, lineHeight: 1, color: s.text,
              textShadow: `0 0 10px ${s.glow}`,
            }}>
              {s.icon}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 800, color: s.text, letterSpacing: '0.11em',
            }}>
              {s.label}
            </span>
            {cellLabel && (
              <span style={{
                fontSize: 9, color: '#94a3b8', fontStyle: 'italic',
                letterSpacing: '0.08em',
              }}>
                · {cellLabel}
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Drawdown tracker segmentado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 8.5, color: '#64748b', letterSpacing: '0.18em',
          }}>
            <span>DRAWDOWN</span>
            <span style={{
              color: streak >= cap - 1 ? '#f87171' : '#94a3b8',
              fontFamily: 'monospace',
            }}>
              {streak}/{cap}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 2.5 }}>
            {Array.from({ length: cap }).map((_, i) => {
              const on = i < filled;
              const alert = i >= cap - 2 && on;
              return (
                <motion.div
                  key={i}
                  animate={{
                    backgroundColor: on
                      ? alert
                        ? 'rgba(248,113,113,0.9)'
                        : 'rgba(251,146,60,0.78)'
                      : 'rgba(148,163,184,0.14)',
                  }}
                  transition={{ duration: 0.15 }}
                  style={{
                    flex: 1, height: 6, borderRadius: 2,
                    border: `1px solid ${on ? 'rgba(248,113,113,0.5)' : 'rgba(148,163,184,0.18)'}`,
                  }}
                />
              );
            })}
          </div>
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
  const streakDoc = useCurrentStreak('doc');
  const streakCol = useCurrentStreak('col');
  const wrDoc = currentCellWr(hud, ent, 'doc');
  const wrCol = currentCellWr(hud, ent, 'col');
  const cellLabel = currentCellLabel(hud, ent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        className="text-[11px] text-cyan-500/70 px-1"
        style={{ letterSpacing: '0.3em' }}
      >
        LECTURA DE MESA · CAOS · ESTABILIDAD · ESTADO DEL MOTOR
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <MarketCard
          market="doc"
          zone={zoneDoc}
          hud={hud}
          ent={ent}
          streak={streakDoc}
          wr={wrDoc}
          cellLabel={cellLabel}
        />
        <MarketCard
          market="col"
          zone={zoneCol}
          hud={hud}
          ent={ent}
          streak={streakCol}
          wr={wrCol}
          cellLabel={cellLabel}
        />
      </div>
    </div>
  );
}
