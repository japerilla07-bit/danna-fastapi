// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel: centro de mando de la matriz HUD×ENT
// ════════════════════════════════════════════════════════════════════════
//
// Por mercado (DOCENAS · COLUMNAS):
//   • CONTADOR GLOBAL de sesión — aciertos, errores, racha máx (toma cada
//     sugerencia como apuesta, sin importar estado ni condición del motor).
//   • CELDA ACTUAL — HUD/ENT → celda y estado, con dos filas:
//       MAPA  (histórico de la celda, matriz v5)
//       HOY   (lo que llevás en esa celda esta sesión)
//   • INSTRUCCIÓN — placeholder por estado ("— definir —"), a llenar luego.
//   • CELDAS HOY — cada celda visitada con su ✓/✗ y racha máx propia.
//
// Lectura pura del store + la matriz. No decide ni bloquea al motor.
// ════════════════════════════════════════════════════════════════════════

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud,
  useLastEnt,
  useMarketHits,
  useMarketMisses,
  useMarketMaxStreak,
  useMarketStreak,
  useCellReg,
  useCellRec,
  type CellRec,
} from '@/store/telemetryStore';
import {
  cellKeyOf,
  cellStats,
  cellStatsByKey,
  labelByKey,
  type Zone,
  type Market,
} from '@/domain/zoneMatrix';

// ────────────────────────────────────────────────────────────────────────
// Paleta por estado (ordenada por riesgo de racha)
// ────────────────────────────────────────────────────────────────────────

const STYLE: Record<Zone, { label: string; color: string; glow: string; dim: string }> = {
  SANTUARIO: { label: 'SANTUARIO', color: '#34d399', glow: 'rgba(52,211,153,0.55)', dim: 'rgba(52,211,153,0.14)' },
  VERDE:     { label: 'VERDE',     color: '#10b981', glow: 'rgba(16,185,129,0.45)', dim: 'rgba(16,185,129,0.12)' },
  PROBE:     { label: 'PROBE',     color: '#fb923c', glow: 'rgba(251,146,60,0.45)', dim: 'rgba(251,146,60,0.12)' },
  TOXICA:    { label: 'TÓXICA',    color: '#f87171', glow: 'rgba(248,113,113,0.45)', dim: 'rgba(248,113,113,0.12)' },
  AGUJERO:   { label: 'AGUJERO',   color: '#dc2626', glow: 'rgba(220,38,38,0.65)',  dim: 'rgba(220,38,38,0.16)' },
  NEUTRA:    { label: 'SIN DATOS', color: '#64748b', glow: 'rgba(100,116,139,0.25)', dim: 'rgba(100,116,139,0.10)' },
};

// Instrucción por estado — placeholder. Gunner define las frases luego.
const INSTRUCCION: Record<Zone, string> = {
  SANTUARIO: '— definir —',
  VERDE:     '— definir —',
  PROBE:     '— definir —',
  TOXICA:    '— definir —',
  AGUJERO:   '— definir —',
  NEUTRA:    'Sin datos suficientes en esta celda.',
};

const ORDER: Zone[] = ['AGUJERO', 'TOXICA', 'PROBE', 'VERDE', 'SANTUARIO', 'NEUTRA'];

// ────────────────────────────────────────────────────────────────────────
// Piezas
// ────────────────────────────────────────────────────────────────────────

function StatRow({ label, hits, errs, maxRun, muted }: {
  label: string; hits: number; errs: number; maxRun: number | string; muted?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '52px 1fr 1fr 1fr', gap: 4,
      fontFamily: 'monospace', fontSize: 11, alignItems: 'center',
      opacity: muted ? 0.7 : 1,
    }}>
      <span style={{ color: '#64748b', letterSpacing: '0.08em', fontSize: 9.5 }}>{label}</span>
      <span style={{ color: '#4ade80' }}>✓ {hits}</span>
      <span style={{ color: '#f87171' }}>✗ {errs}</span>
      <span style={{ color: '#cbd5e1' }}>máx {maxRun}</span>
    </div>
  );
}

function VisitedRow({ mkt, cKey, rec }: { mkt: Market; cKey: string; rec: CellRec }) {
  const map = cellStatsByKey(cKey, mkt);
  const st = STYLE[map?.estado ?? 'NEUTRA'];
  // Alerta: la racha de hoy en la celda igualó/superó la histórica
  const alert = map ? rec.maxStreak >= map.maxRun && map.maxRun > 0 : false;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 8, alignItems: 'center',
      padding: '3px 6px', borderRadius: 5,
      background: alert ? 'rgba(127,29,29,0.28)' : 'transparent',
      fontFamily: 'monospace', fontSize: 10,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: st.color, boxShadow: `0 0 6px ${st.glow}` }} />
      <span style={{ color: '#94a3b8' }}>{labelByKey(cKey).replace('HUD ', '').replace(' · ENT ', '×')}</span>
      <span style={{ color: '#cbd5e1' }}>
        <span style={{ color: '#4ade80' }}>{rec.hits}</span>/<span style={{ color: '#f87171' }}>{rec.misses}</span>
      </span>
      <span style={{ color: alert ? '#f87171' : '#64748b', fontWeight: alert ? 700 : 400 }}>
        máx{rec.maxStreak}{alert ? ' ⚠' : ''}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Columna de mercado
// ────────────────────────────────────────────────────────────────────────

function MarketColumnImpl({ mkt }: { mkt: Market }) {
  const hud = useLastHud();
  const ent = useLastEnt();
  const gHits = useMarketHits(mkt);
  const gMiss = useMarketMisses(mkt);
  const gMax  = useMarketMaxStreak(mkt);
  const gCur  = useMarketStreak(mkt);
  const reg   = useCellReg(mkt);

  const key = cellKeyOf(hud, ent);
  const map = cellStats(hud, ent, mkt);            // MAPA de la celda actual
  const sess = useCellRec(mkt, key);               // SESIÓN en la celda actual
  const estado: Zone = map?.estado ?? 'NEUTRA';
  const st = STYLE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';

  // Celdas visitadas, ordenadas por peor racha primero
  const visited = Object.entries(reg)
    .sort((a, b) => b[1].maxStreak - a[1].maxStreak || b[1].misses - a[1].misses)
    .slice(0, 8);

  const gTotal = gHits + gMiss;

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10,
      borderRadius: 12, padding: '12px 13px',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(2,6,23,0.55) 100%)',
      border: `1px solid ${st.color}40`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 22px ${st.dim}`,
    }}>
      {/* Encabezado + estado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.28em', color: '#e2e8f0' }}>{title}</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={estado}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: st.color,
              padding: '3px 9px', borderRadius: 999,
              border: `1px solid ${st.color}`, background: st.dim, textShadow: `0 0 8px ${st.glow}`,
            }}
          >
            ● {st.label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Contador global de sesión */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 11px', borderRadius: 8,
        background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.16)',
      }}>
        <span style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.18em' }}>SESIÓN</span>
        <div style={{ display: 'flex', gap: 14, fontFamily: 'monospace', fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: '#4ade80' }}>✓ {gHits}</span>
          <span style={{ color: '#f87171' }}>✗ {gMiss}</span>
          <span style={{ color: '#94a3b8', fontSize: 12, alignSelf: 'center' }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
          <span style={{
            color: gMax >= 6 ? '#f87171' : gMax >= 4 ? '#fbbf24' : '#cbd5e1',
            fontSize: 12, alignSelf: 'center',
          }}>
            racha máx {gMax}{gCur > 0 ? ` · viva ${gCur}` : ''}
          </span>
        </div>
      </div>

      {/* Celda actual: MAPA vs HOY */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 9.5, color: '#94a3b8', letterSpacing: '0.1em' }}>CELDA ACTUAL</span>
          <span style={{ fontSize: 9.5, color: '#64748b', fontFamily: 'monospace' }}>
            HUD {hud ?? '—'} · ENT {ent ?? '—'}{key ? `  (${labelByKey(key).replace('HUD ', '').replace(' · ENT ', '×')})` : ''}
          </span>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 3,
          padding: '7px 9px', borderRadius: 7,
          background: 'rgba(2,6,23,0.5)', border: `1px solid ${st.color}30`,
        }}>
          {map
            ? <StatRow label="MAPA" hits={map.hits} errs={map.errs} maxRun={map.maxRun} muted />
            : <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>MAPA  sin datos en esta celda</div>}
          <StatRow label="HOY" hits={sess?.hits ?? 0} errs={sess?.misses ?? 0} maxRun={sess?.maxStreak ?? 0} />
        </div>
      </div>

      {/* Instrucción (placeholder por estado) */}
      <div style={{
        padding: '7px 10px', borderRadius: 7,
        background: st.dim, border: `1px solid ${st.color}55`,
      }}>
        <span style={{ fontSize: 8.5, color: '#64748b', letterSpacing: '0.16em' }}>INSTRUCCIÓN</span>
        <div style={{ fontSize: 12, fontWeight: 700, color: st.color, marginTop: 2, letterSpacing: '0.02em' }}>
          {INSTRUCCION[estado]}
        </div>
      </div>

      {/* Celdas visitadas hoy */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 8.5, color: '#64748b', letterSpacing: '0.16em', paddingLeft: 4 }}>
            CELDAS HOY · {Object.keys(reg).length}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#22d3ee', opacity: 0.7, letterSpacing: '0.3em', paddingLeft: 2 }}>
        CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;
