// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel: centro de mando (v3 · legible)
// ════════════════════════════════════════════════════════════════════════
//
// Dos preguntas, dos lugares:
//   • SESIÓN (arriba, grande) = cómo venís HOY en total por mercado.
//   • CELDA (MAPA) = reputación histórica de la casilla donde estás.
// Se quitó el "HOY por celda" (casi siempre 0/0, no aportaba).
// Celdas visitadas escritas en palabras (estado con nombre + rango + conteo).
//
// Lectura pura del store + la matriz. No decide ni bloquea al motor.
// ════════════════════════════════════════════════════════════════════════

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud, useLastEnt,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useCellReg, type CellRec,
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

const INSTRUCCION: Record<Zone, string> = {
  SANTUARIO: 'Entrá con confianza. Progresión normal.',
  VERDE:     'Operá. Progresión suave.',
  PROBE:     'Esperá 1 error antes de entrar.',
  TOXICA:    'Esperá 2 errores. Sin progresión.',
  AGUJERO:   'No operes esta celda.',
  NEUTRA:    'Sin registro suficiente — a criterio.',
};

// "HUD 50-54 · ENT 25-29" a partir de la clave
const rangeText = (key: string) => labelByKey(key);

// ────────────────────────────────────────────────────────────────────────
// Celda visitada — en palabras
// ────────────────────────────────────────────────────────────────────────

function VisitedRowImpl({ mkt, cKey, rec }: { mkt: Market; cKey: string; rec: CellRec }) {
  const map = cellStatsByKey(cKey, mkt);
  const st = STYLE[map?.estado ?? 'NEUTRA'];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '8px 11px', borderRadius: 8,
      background: 'rgba(2,6,23,0.45)', borderLeft: `3px solid ${st.color}`,
      border: '1px solid rgba(148,163,184,0.10)', borderLeftWidth: 3, borderLeftColor: st.color,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: st.color, letterSpacing: '0.06em' }}>
          {st.label}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
          {rangeText(cKey)}
        </span>
      </div>
      <span style={{ fontSize: 10.5, color: '#cbd5e1' }}>
        <span style={{ color: '#4ade80' }}>{rec.hits} aciertos</span>
        {' · '}
        <span style={{ color: '#f87171' }}>{rec.misses} errores</span>
        {' · peor racha '}
        <span style={{ color: rec.maxStreak >= 4 ? '#f87171' : '#cbd5e1', fontWeight: 700 }}>{rec.maxStreak}</span>
      </span>
    </div>
  );
}
const VisitedRow = memo(VisitedRowImpl);

// ────────────────────────────────────────────────────────────────────────
// Columna de mercado
// ────────────────────────────────────────────────────────────────────────

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
  const estado: Zone = map?.estado ?? 'NEUTRA';
  const st = STYLE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const gTotal = gHits + gMiss;

  const visited = Object.entries(reg)
    .sort((a, b) => b[1].maxStreak - a[1].maxStreak || b[1].misses - a[1].misses)
    .slice(0, 6);

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12,
      borderRadius: 12, padding: '13px 14px',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.75) 0%, rgba(2,6,23,0.55) 100%)',
      border: '1px solid rgba(148,163,184,0.14)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', color: '#e2e8f0' }}>{title}</span>

      {/* 1 · SESIÓN — marcador de la partida */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        padding: '11px 13px', borderRadius: 10,
        background: 'rgba(2,6,23,0.65)', border: '1px solid rgba(34,211,238,0.22)',
      }}>
        <span style={{ fontSize: 9, color: '#22d3ee', letterSpacing: '0.24em', opacity: 0.85 }}>
          CÓMO VENÍS HOY
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>✓ {gHits}</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#f87171', lineHeight: 1 }}>✗ {gMiss}</span>
          <span style={{ fontSize: 16, color: '#94a3b8', marginLeft: 'auto' }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <span style={{
          fontFamily: 'monospace', fontSize: 12,
          color: gMax >= 6 ? '#f87171' : gMax >= 4 ? '#fbbf24' : '#94a3b8',
        }}>
          peor racha de errores hoy: <b style={{ color: gMax >= 4 ? undefined : '#cbd5e1' }}>{gMax}</b>
          {gCur > 0 && <span style={{ color: '#fbbf24' }}> · venís perdiendo {gCur} seguidas</span>}
        </span>
      </div>

      {/* 2 · ESTÁS AQUÍ — celda actual + su reputación (MAPA) */}
      <div style={{
        borderRadius: 10, padding: '11px 13px',
        background: st.dim, border: `1.5px solid ${st.color}`,
        boxShadow: `0 0 20px ${st.dim}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, color: st.color, letterSpacing: '0.2em', opacity: 0.9 }}>▸ ESTÁS AQUÍ</span>
          <AnimatePresence mode="wait">
            <motion.span key={estado}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: st.color,
                padding: '3px 11px', borderRadius: 999, border: `1px solid ${st.color}`,
                textShadow: `0 0 8px ${st.glow}`,
              }}>
              ● {st.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>HUD {hud ?? '—'}</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>ENT {ent ?? '—'}</span>
        </div>

        {/* MAPA — reputación histórica de la celda, en palabras */}
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${st.color}30` }}>
          <span style={{ fontSize: 8.5, color: '#64748b', letterSpacing: '0.16em' }}>
            HISTÓRICO DE ESTA CASILLA
          </span>
          {map ? (
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3, fontFamily: 'monospace' }}>
              acierto <b style={{ color: '#e2e8f0' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              {'  ·  peor racha '}
              <b style={{ color: map.maxRun >= 5 ? '#f87171' : '#e2e8f0' }}>{map.maxRun}</b>
              <span style={{ color: '#64748b' }}>{'  '}({map.n} giros)</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, fontFamily: 'monospace' }}>
              sin datos en esta casilla
            </div>
          )}
        </div>
      </div>

      {/* 3 · INSTRUCCIÓN */}
      <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(2,6,23,0.5)', borderLeft: `3px solid ${st.color}` }}>
        <span style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.18em' }}>QUÉ HACER</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: st.color, marginTop: 2 }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* 4 · CELDAS VISITADAS — en palabras */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 8.5, color: '#64748b', letterSpacing: '0.16em', paddingLeft: 2 }}>
            CASILLAS QUE PASASTE HOY · {Object.keys(reg).length}
          </span>
          {visited.map(([k, rec]) => <VisitedRow key={k} mkt={mkt} cKey={k} rec={rec} />)}
        </div>
      )}
    </div>
  );
}
const MarketColumn = memo(MarketColumnImpl);

// ────────────────────────────────────────────────────────────────────────
// Panel exportado
// ────────────────────────────────────────────────────────────────────────

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
