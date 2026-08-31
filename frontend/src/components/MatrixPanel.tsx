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
  useCellReg, useCellRec, useResetTelemetry,
  useTermoHits, useTermoTotal, useTermoStreak, type CellRec,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats, labelByKey,
  fusedZone, fusedZoneByKey, liveDeviation, currentCellWr, currentCellMaxRun,
  type Zone, type Market,
} from '@/domain/zoneMatrix';
import { decidir, type MarketRead } from '@/domain/copilot';

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
  const estado = fusedZoneByKey(cKey, mkt, rec);
  const st = STYLE[estado];
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
      </span>
      <span style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>
        racha ahora <b style={{ color: rec.streak >= 3 ? '#f87171' : rec.streak >= 1 ? '#fbbf24' : '#4ade80' }}>{rec.streak}</b>
        {' · peor '}
        <b style={{ color: rec.maxStreak >= 4 ? '#f87171' : '#cbd5e1' }}>{rec.maxStreak}</b>
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
  const live = useCellRec(mkt, key);          // racha viva en esta celda, esta sesión
  const estado: Zone = fusedZone(hud, ent, mkt, live);   // estado FUSIONADO (historial + hoy)
  const deviation = liveDeviation(hud, ent, mkt, live);  // 'mejor' | 'peor' | null
  const st = STYLE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const gTotal = gHits + gMiss;
  const termoHits = useTermoHits(mkt, 10);
  const termoTotal = useTermoTotal(mkt, 10);
  const termoStreak = useTermoStreak(mkt, 10);

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

      {/* 0 · TERMÓMETRO EN VIVO — cómo venís en los últimos 10 giros */}
      {(() => {
        const hits = termoHits, total = termoTotal, liveStreak = termoStreak;
        // semáforo: verde 7+/10, amarillo 5-6, rojo <=4 (sobre giros resueltos)
        const ratio = total > 0 ? hits / total : 0;
        const luz = total < 3 ? '#64748b' : ratio >= 0.7 ? '#34d399' : ratio >= 0.5 ? '#fbbf24' : '#f87171';
        const txt = total < 3 ? 'juntando datos…'
          : ratio >= 0.7 ? 'VENÍS BIEN — aprovechá'
          : ratio >= 0.5 ? 'PAREJO'
          : 'MESA DURA — aflojá o rotá';
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 11px', borderRadius: 9,
            background: 'rgba(2,6,23,0.55)', border: `1px solid ${luz}55`,
          }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: luz, boxShadow: `0 0 8px ${luz}`, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.18em' }}>ÚLTIMOS {total} GIROS</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: luz, fontFamily: 'monospace' }}>
                {total > 0 ? `${hits}/${total}` : '—'}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#cbd5e1', marginLeft: 8 }}>{txt}</span>
              </span>
            </div>
            {liveStreak >= 2 && (
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: '#f87171', fontFamily: 'monospace', flexShrink: 0 }}>
                {liveStreak} seguidas ✗
              </span>
            )}
          </div>
        );
      })()}

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {deviation && (
              <span style={{
                fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em',
                color: deviation === 'peor' ? '#f87171' : '#4ade80',
              }}>
                {deviation === 'peor' ? '▼ hoy peor' : '▲ hoy mejor'}
              </span>
            )}
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
              {'  ·  aguanta hasta '}
              <b style={{ color: map.maxRun >= 5 ? '#f87171' : '#e2e8f0' }}>{map.maxRun}</b>
              {' errores'}
              <span style={{ color: '#64748b' }}>{'  '}({map.n} giros)</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, fontFamily: 'monospace' }}>
              sin datos en esta casilla
            </div>
          )}

          {/* HOY EN ESTA CASILLA — siempre visible: lo que llevás hoy en esta celda */}
          <div style={{ marginTop: 7 }}>
            <span style={{ fontSize: 8.5, color: '#64748b', letterSpacing: '0.16em' }}>HOY EN ESTA CASILLA</span>
            <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 3, fontFamily: 'monospace' }}>
              <span style={{ color: '#4ade80' }}>{live?.hits ?? 0} ✓</span>
              {'  '}
              <span style={{ color: '#f87171' }}>{live?.misses ?? 0} ✗</span>
              <span style={{ color: '#64748b' }}>{'  ·  racha ahora '}</span>
              <b style={{ color: (live?.streak ?? 0) >= 3 ? '#f87171' : (live?.streak ?? 0) >= 1 ? '#fbbf24' : '#4ade80' }}>
                {live?.streak ?? 0}
              </b>
            </div>
          </div>

          {/* EN VIVO — racha de errores actual en esta celda vs el techo histórico */}
          {(() => {
            const cur = live?.streak ?? 0;
            const techo = map?.maxRun ?? 0;
            const anomalo = techo > 0 && cur >= techo;
            const cerca = techo > 0 && cur === techo - 1;
            const color = anomalo ? '#f87171' : cerca ? '#fbbf24' : cur > 0 ? '#fbbf24' : '#4ade80';
            return (
              <div style={{
                marginTop: 7, padding: '6px 9px', borderRadius: 7,
                background: anomalo ? 'rgba(127,29,29,0.35)' : 'rgba(2,6,23,0.5)',
                border: `1px solid ${anomalo ? 'rgba(248,113,113,0.6)' : `${st.color}25`}`,
              }}>
                <span style={{ fontSize: 8.5, color: '#64748b', letterSpacing: '0.16em' }}>EN VIVO</span>
                <div style={{ fontSize: 13, marginTop: 2, fontFamily: 'monospace' }}>
                  racha de errores ahora: <b style={{ color }}>{cur}</b>
                  {techo > 0 && <span style={{ color: '#64748b', fontSize: 11 }}>{'  '}/ techo {techo}</span>}
                </div>
                {anomalo && (
                  <div style={{ fontSize: 10.5, color: '#f87171', fontWeight: 700, marginTop: 2 }}>
                    ⚠ igualaste/superaste el techo histórico — anómalo, considerá salir
                  </div>
                )}
              </div>
            );
          })()}
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
// COPILOTO — lee ambos mercados y da UNA decisión de entrada segura
// ────────────────────────────────────────────────────────────────────────

function useMarketRead(mkt: Market): MarketRead {
  const hud = useLastHud();
  const ent = useLastEnt();
  const key = cellKeyOf(hud, ent);
  const live = useCellRec(mkt, key);
  const estado = fusedZone(hud, ent, mkt, live);
  const cellWr = currentCellWr(hud, ent, mkt);
  const cellCeiling = currentCellMaxRun(hud, ent, mkt);
  const termoHits = useTermoHits(mkt, 10);
  const termoTotal = useTermoTotal(mkt, 10);
  const termoStreak = useTermoStreak(mkt, 10);
  return {
    mkt, estado, cellWr, termoHits, termoTotal, termoStreak,
    liveStreak: live?.streak ?? 0, cellCeiling,
  };
}

function Copilot() {
  const doc = useMarketRead('doc');
  const col = useMarketRead('col');
  const d = decidir(doc, col);

  const color = d.nivel === 'ok' ? '#34d399' : d.nivel === 'precaucion' ? '#fbbf24' : '#f87171';
  const glow = d.nivel === 'ok' ? 'rgba(52,211,153,0.45)' : d.nivel === 'precaucion' ? 'rgba(251,191,36,0.45)' : 'rgba(248,113,113,0.5)';

  return (
    <div style={{
      borderRadius: 13, padding: '13px 15px', marginBottom: 2,
      background: `linear-gradient(180deg, ${color}18 0%, rgba(2,6,23,0.6) 100%)`,
      border: `1.5px solid ${color}`, boxShadow: `0 0 24px ${glow}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ fontSize: 8.5, color: '#94a3b8', letterSpacing: '0.24em' }}>COPILOTO · ENTRADA SEGURA</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color, letterSpacing: '0.02em', textShadow: `0 0 10px ${glow}` }}>
            {d.titulo}
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3 }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}


export function MatrixPanel() {
  const resetTelemetry = useResetTelemetry();

  function handleReset() {
    if (window.confirm('¿Resetear el mapa? Borra lo acumulado de esta sesión (contador, casillas y rachas). NO toca la matriz base de tus sesiones.')) {
      resetTelemetry();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2 }}>
        <span style={{ fontSize: 10, color: '#22d3ee', opacity: 0.7, letterSpacing: '0.3em' }}>
          CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
            color: '#94a3b8', cursor: 'pointer',
            background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.28)',
            borderRadius: 6, padding: '4px 10px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#f87171';
            e.currentTarget.style.borderColor = 'rgba(248,113,113,0.55)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.28)';
          }}
        >
          ⟲ RESET MAPA
        </button>
      </div>

      {/* COPILOTO — la decisión de entrada segura, arriba de todo */}
      <Copilot />

      <div style={{ display: 'flex', gap: 11 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;

