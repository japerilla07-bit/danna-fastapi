// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel: centro de mando (v2 · jerarquía clara)
// ════════════════════════════════════════════════════════════════════════
//
// Jerarquía visual (pedido de Gunner):
//   1) CONTADOR DE SESIÓN — protagonista, grande arriba de cada mercado.
//   2) ESTÁS AQUÍ — la celda actual como tarjeta destacada, fácil de ubicar,
//      con HUD·ENT grande, estado, y MAPA (histórico) vs HOY (sesión).
//   3) INSTRUCCIÓN por estado.
//   4) CELDAS HOY — lista de celdas visitadas, legible.
//
// Lectura pura del store + la matriz. No decide ni bloquea al motor.
// ════════════════════════════════════════════════════════════════════════

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud, useLastEnt,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useCellReg, useCellRec, type CellRec,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats, cellStatsByKey, labelByKey,
  type Zone, type Market,
} from '@/domain/zoneMatrix';

const STYLE: Record<Zone, { label: string; color: string; glow: string; dim: string }> = {
  SANTUARIO: { label: 'SANTUARIO', color: '#34d399', glow: 'rgba(52,211,153,0.60)', dim: 'rgba(52,211,153,0.15)' },
  VERDE:     { label: 'VERDE',     color: '#10b981', glow: 'rgba(16,185,129,0.50)', dim: 'rgba(16,185,129,0.13)' },
  PROBE:     { label: 'PROBE',     color: '#fbbf24', glow: 'rgba(251,191,36,0.50)', dim: 'rgba(251,191,36,0.13)' },
  TOXICA:    { label: 'TÓXICA',    color: '#f87171', glow: 'rgba(248,113,113,0.50)', dim: 'rgba(248,113,113,0.13)' },
  AGUJERO:   { label: 'AGUJERO',   color: '#ef4444', glow: 'rgba(239,68,68,0.70)',  dim: 'rgba(239,68,68,0.18)' },
  NEUTRA:    { label: 'SIN DATOS', color: '#64748b', glow: 'rgba(100,116,139,0.30)', dim: 'rgba(100,116,139,0.10)' },
};

// Instrucción por estado (Gunner ajusta con sesiones).
const INSTRUCCION: Record<Zone, string> = {
  SANTUARIO: 'Entrá con confianza. Progresión normal.',
  VERDE:     'Operá. Progresión suave.',
  PROBE:     'Esperá 1 error antes de entrar.',
  TOXICA:    'Esperá 2 errores. Sin progresión.',
  AGUJERO:   'No operes esta celda.',
  NEUTRA:    'Sin registro suficiente — a criterio.',
};

// Rango legible corto: "45-49 × 30-34"
const shortRange = (key: string) => labelByKey(key).replace('HUD ', '').replace(' · ENT ', ' × ');

function VisitedRow({ mkt, cKey, rec }: { mkt: Market; cKey: string; rec: CellRec }) {
  const map = cellStatsByKey(cKey, mkt);
  const st = STYLE[map?.estado ?? 'NEUTRA'];
  const alert = map ? rec.maxStreak >= map.maxRun && map.maxRun > 0 : false;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '12px 1fr 64px 60px', gap: 8, alignItems: 'center',
      padding: '5px 8px', borderRadius: 6,
      background: alert ? 'rgba(127,29,29,0.30)' : 'rgba(2,6,23,0.4)',
      border: `1px solid ${alert ? 'rgba(248,113,113,0.4)' : 'rgba(148,163,184,0.10)'}`,
      fontFamily: 'monospace', fontSize: 11,
    }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: st.color, boxShadow: `0 0 6px ${st.glow}` }} />
      <span style={{ color: '#cbd5e1' }}>{shortRange(cKey)}</span>
      <span>
        <span style={{ color: '#4ade80' }}>{rec.hits}</span>
        <span style={{ color: '#475569' }}>/</span>
        <span style={{ color: '#f87171' }}>{rec.misses}</span>
      </span>
      <span style={{ color: alert ? '#f87171' : '#94a3b8', fontWeight: alert ? 800 : 400, textAlign: 'right' }}>
        máx {rec.maxStreak}{alert ? ' ⚠' : ''}
      </span>
    </div>
  );
}

function StatLine({ tag, hits, errs, run, strong }: {
  tag: string; hits: number; errs: number; run: number | string; strong?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '46px 1fr 1fr 1fr', gap: 6, alignItems: 'center',
      fontFamily: 'monospace', fontSize: strong ? 13 : 12, opacity: strong ? 1 : 0.72,
    }}>
      <span style={{ color: '#64748b', fontSize: 9.5, letterSpacing: '0.1em' }}>{tag}</span>
      <span style={{ color: '#4ade80' }}>✓ {hits}</span>
      <span style={{ color: '#f87171' }}>✗ {errs}</span>
      <span style={{ color: '#cbd5e1' }}>máx {run}</span>
    </div>
  );
}

function MarketColumnImpl({ mkt }: { mkt: Market }) {
  const hud = useLastHud();
  const ent = useLastEnt();
  const gHits = useMarketHits(mkt);
  const gMiss = useMarketMisses(mkt);
  const gMax = useMarketMaxStreak(mkt);
  const gCur = useMarketStreak(mkt);
  const reg = useCellReg(mkt);

  const key = cellKeyOf(hud, ent);
  const map = cellStats(hud, ent, mkt);
  const sess = useCellRec(mkt, key);
  const estado: Zone = map?.estado ?? 'NEUTRA';
  const st = STYLE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const gTotal = gHits + gMiss;

  const visited = Object.entries(reg)
    .sort((a, b) => b[1].maxStreak - a[1].maxStreak || b[1].misses - a[1].misses)
    .slice(0, 6);

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 11,
      borderRadius: 12, padding: '13px 14px',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.75) 0%, rgba(2,6,23,0.55) 100%)',
      border: '1px solid rgba(148,163,184,0.14)',
    }}>
      {/* Título */}
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', color: '#e2e8f0' }}>{title}</span>

      {/* 1 · CONTADOR DE SESIÓN — protagonista */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '11px 13px', borderRadius: 10,
        background: 'rgba(2,6,23,0.65)', border: '1px solid rgba(34,211,238,0.22)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 8.5, color: '#22d3ee', letterSpacing: '0.24em', opacity: 0.8 }}>SESIÓN</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>✓{gHits}</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#f87171', lineHeight: 1 }}>✗{gMiss}</span>
          <span style={{ fontSize: 15, color: '#94a3b8', marginLeft: 'auto' }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <div style={{
          fontFamily: 'monospace', fontSize: 11.5, marginTop: 2,
          color: gMax >= 6 ? '#f87171' : gMax >= 4 ? '#fbbf24' : '#94a3b8',
        }}>
          racha máx de errores: <b style={{ color: gMax >= 4 ? undefined : '#cbd5e1' }}>{gMax}</b>
          {gCur > 0 && <span style={{ color: '#fbbf24' }}> · viva {gCur}</span>}
        </div>
      </div>

      {/* 2 · ESTÁS AQUÍ — celda actual destacada */}
      <div style={{
        borderRadius: 10, padding: '10px 12px',
        background: st.dim, border: `1.5px solid ${st.color}`,
        boxShadow: `0 0 20px ${st.dim}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 8.5, color: st.color, letterSpacing: '0.2em', opacity: 0.9 }}>▸ ESTÁS AQUÍ</span>
          <AnimatePresence mode="wait">
            <motion.span key={estado}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: st.color,
                padding: '2px 10px', borderRadius: 999, border: `1px solid ${st.color}`,
                textShadow: `0 0 8px ${st.glow}`,
              }}>
              ● {st.label}
            </motion.span>
          </AnimatePresence>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
            HUD {hud ?? '—'}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
            ENT {ent ?? '—'}
          </span>
          {key && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>celda {shortRange(key)}</span>}
        </div>
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${st.color}30`,
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {map
            ? <StatLine tag="MAPA" hits={map.hits} errs={map.errs} run={map.maxRun} />
            : <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>MAPA · sin datos en esta celda</div>}
          <StatLine tag="HOY" hits={sess?.hits ?? 0} errs={sess?.misses ?? 0} run={sess?.maxStreak ?? 0} strong />
        </div>
      </div>

      {/* 3 · INSTRUCCIÓN */}
      <div style={{ padding: '8px 11px', borderRadius: 8, background: 'rgba(2,6,23,0.5)', borderLeft: `3px solid ${st.color}` }}>
        <span style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.18em' }}>INSTRUCCIÓN</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: st.color, marginTop: 2 }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* 4 · CELDAS HOY */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.18em', paddingLeft: 4 }}>
            CELDAS HOY · {Object.keys(reg).length}
          </span>
          {visited.map(([k, rec]) => <VisitedRow key={k} mkt={mkt} cKey={k} rec={rec} />)}
        </div>
      )}
    </div>
  );
}

const MarketColumn = memo(MarketColumnImpl);

export function MatrixPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 10, color: '#22d3ee', opacity: 0.7, letterSpacing: '0.3em', paddingLeft: 2 }}>
        CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
      </span>
      <div style={{ display: 'flex', gap: 11 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;
