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

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud, useLastEnt,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useCellReg, useCellRec, useResetTelemetry,
  useTermoHits, useTermoTotal, useTermoStreak, useHistory, type CellRec,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats, labelByKey,
  fusedZone, fusedZoneByKey, liveDeviation, currentCellWr, currentCellMaxRun,
  type Zone, type Market,
} from '@/domain/zoneMatrix';
import { decidir, type MarketRead } from '@/domain/copilot';

// ── PALETA "GEASS / SHIKON" DIRECTA EN EL COMPONENTE ──
const STYLE: Record<Zone, { label: string; color: string; glow: string; dim: string }> = {
  SANTUARIO: { label: 'SANTUARIO', color: '#00ff9d', glow: 'rgba(0,255,157,0.85)', dim: 'rgba(0,255,157,0.15)' },
  VERDE:     { label: 'VERDE',     color: '#10e57b', glow: 'rgba(16,229,123,0.70)', dim: 'rgba(16,229,123,0.12)' },
  PROBE:     { label: 'PROBE',     color: '#ffdf60', glow: 'rgba(255,223,96,0.60)', dim: 'rgba(255,223,96,0.10)' },
  TOXICA:    { label: 'TÓXICA',    color: '#ff1e38', glow: 'rgba(255,30,56,0.75)',  dim: 'rgba(255,30,56,0.15)' },
  AGUJERO:   { label: 'AGUJERO',   color: '#d90b2c', glow: 'rgba(217,11,44,0.90)',  dim: 'rgba(217,11,44,0.25)' },
  NEUTRA:    { label: 'SIN DATOS', color: '#5c687a', glow: 'rgba(92,104,122,0.40)', dim: 'rgba(92,104,122,0.10)' },
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
      display: 'flex', flexDirection: 'column', gap: 1,
      padding: '5px 10px',
      clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
      background: 'linear-gradient(90deg, rgba(10,13,26,0.9) 0%, rgba(2,4,8,0.5) 100%)',
      borderLeft: `3px solid ${st.color}`, 
      boxShadow: `inset 0 0 18px ${st.dim}, 0 4px 6px rgba(0,0,0,0.5)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, fontWeight: 800, color: st.color, letterSpacing: '0.08em', textShadow: `0 0 8px ${st.glow}` }}>
          {st.label}
        </span>
        <span style={{ fontSize: 9.5, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
          {rangeText(cKey)}
        </span>
      </div>
      <span style={{ fontSize: 10, color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace" }}>
        <span style={{ color: '#00ff9d', textShadow: '0 0 6px rgba(0,255,157,0.5)' }}>{rec.hits}✓</span>
        {' · '}
        <span style={{ color: '#ff1e38', textShadow: '0 0 6px rgba(255,30,56,0.5)' }}>{rec.misses}✗</span>
        {' · '}
        <span style={{ color: '#5c687a' }}>
          racha <b style={{ color: rec.streak >= 3 ? '#ff1e38' : rec.streak >= 1 ? '#ffdf60' : '#00ff9d' }}>{rec.streak}</b>
          {' / '}
          <b style={{ color: rec.maxStreak >= 4 ? '#ff1e38' : '#cbd5e1' }}>{rec.maxStreak}</b>
        </span>
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
    .slice(0, 3);

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 12px',
      clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
      background: 'linear-gradient(180deg, rgba(10,14,28,0.95) 0%, rgba(3,4,8,0.98) 100%)',
      border: `1px solid ${st.color}55`,
      boxShadow: `0 12px 40px rgba(0,0,0,0.8), inset 0 0 40px ${st.dim}, inset 0 2px 0 ${st.color}40`,
    }}>
      <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: '0.25em', color: st.color, textShadow: `0 0 16px ${st.glow}, 0 0 4px ${st.color}` }}>
        {title}
      </span>

      {/* Fila superior: termómetro + cómo venís hoy, lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'stretch' }}>
      
      {/* 0 · TERMÓMETRO EN VIVO — cómo venís en los últimos 10 giros */}
      {(() => {
        const hits = termoHits, total = termoTotal, liveStreak = termoStreak;
        // semáforo: verde 7+/10, amarillo 5-6, rojo <=4 (sobre giros resueltos)
        const ratio = total > 0 ? hits / total : 0;
        const luz = total < 3 ? '#5c687a' : ratio >= 0.7 ? '#00ff9d' : ratio >= 0.5 ? '#ffdf60' : '#ff1e38';
        const txt = total < 3 ? 'juntando datos…'
          : ratio >= 0.7 ? 'VENÍS BIEN — aprovechá'
          : ratio >= 0.5 ? 'PAREJO'
          : 'MESA DURA — aflojá o rotá';
        return (
          <div style={{
            display: 'flex', flexDirection: 'column',
            padding: '8px 10px',
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            background: 'rgba(2,4,8,0.7)', 
            border: `1px solid ${luz}50`,
            boxShadow: `inset 0 0 15px ${luz}15`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', background: luz, boxShadow: `0 0 12px ${luz}, 0 0 4px ${luz}`, flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700 }}>ÚLTIMOS {total} GIROS</span>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: luz, fontFamily: "'JetBrains Mono', monospace", textShadow: `0 0 12px ${luz}90` }}>
                {total > 0 ? `${hits}/${total}` : '—'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', lineHeight: 1.1 }}>{txt}</span>
              {liveStreak >= 2 && (
                <span style={{ fontSize: 11, fontWeight: 800, color: '#ff1e38', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 10px rgba(255,30,56,0.8)', marginLeft: 'auto' }}>
                  {liveStreak} ✗
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* 1 · SESIÓN — marcador de la partida */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        padding: '8px 10px',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        background: 'rgba(2,4,8,0.7)', 
        border: '1px solid rgba(0,229,255,0.3)',
        boxShadow: 'inset 0 0 15px rgba(0,229,255,0.1)',
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#00e5ff', letterSpacing: '0.15em', fontWeight: 700, opacity: 0.9 }}>
          CÓMO VENÍS HOY
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: "'Rajdhani', sans-serif", marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#00ff9d', lineHeight: 1, textShadow: '0 0 14px rgba(0,255,157,0.7)' }}>✓{gHits}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#ff1e38', lineHeight: 1, textShadow: '0 0 14px rgba(255,30,56,0.7)' }}>✗{gMiss}</span>
          </div>
          <span style={{ fontSize: 15, color: '#8092b5', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: gMax >= 6 ? '#ff1e38' : gMax >= 4 ? '#ffdf60' : '#8092b5',
          marginTop: 6, lineHeight: 1.3, display: 'block'
        }}>
          peor racha de errores hoy: <b style={{ color: gMax >= 4 ? undefined : '#cbd5e1' }}>{gMax}</b>
          {gCur > 0 && <span style={{ color: '#ffdf60', display: 'block', marginTop: 2, textShadow: '0 0 8px rgba(255,223,96,0.5)' }}>⚠ venís perdiendo {gCur} seguidas</span>}
        </span>
      </div>
      </div>{/* cierre grilla superior */}

      {/* 2 · ESTÁS AQUÍ — celda actual + su reputación (MAPA) */}
      <div style={{
        padding: '10px 12px',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        background: `radial-gradient(circle at center, ${st.dim} 0%, rgba(3,4,8,0.8) 100%)`, 
        border: `1px solid ${st.color}70`,
        boxShadow: `0 6px 16px rgba(0,0,0,0.5), inset 0 0 25px ${st.dim}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: st.color, letterSpacing: '0.15em', fontWeight: 700, textShadow: `0 0 8px ${st.glow}` }}>▸ ESTÁS AQUÍ</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {deviation && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
                color: deviation === 'peor' ? '#ff1e38' : '#00ff9d',
                textShadow: `0 0 6px ${deviation === 'peor' ? 'rgba(255,30,56,0.5)' : 'rgba(0,255,157,0.5)'}`
              }}>
                {deviation === 'peor' ? '▼ hoy peor' : '▲ hoy mejor'}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.span key={estado}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: '0.15em', color: st.color,
                  padding: '3px 12px', 
                  clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
                  border: `1px solid ${st.color}90`,
                  background: 'rgba(0,0,0,0.5)',
                  textShadow: `0 0 12px ${st.glow}, 0 0 4px ${st.color}`,
                  boxShadow: `inset 0 0 12px ${st.dim}`,
                }}>
                {st.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: "'Rajdhani', sans-serif" }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#ffffff', lineHeight: 1, textShadow: `0 0 15px ${st.glow}` }}>HUD {hud ?? '—'}</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#ffffff', lineHeight: 1, textShadow: `0 0 15px ${st.glow}` }}>ENT {ent ?? '—'}</span>
        </div>

        {/* MAPA — reputación histórica de la celda, en palabras */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${st.color}40`, position: 'relative' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700 }}>
            HISTÓRICO DE ESTA CASILLA
          </span>
          {map ? (
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
              acierto <b style={{ color: '#ffffff', textShadow: '0 0 6px rgba(255,255,255,0.5)' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              {'  ·  aguanta hasta '}
              <b style={{ color: map.maxRun >= 5 ? '#ff1e38' : '#ffffff', textShadow: map.maxRun >= 5 ? '0 0 8px rgba(255,30,56,0.6)' : 'none' }}>{map.maxRun}</b>
              {' errores'}
              <span style={{ color: '#5c687a' }}>{'  '}({map.n} giros)</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#5c687a', marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
              sin datos en esta casilla
            </div>
          )}

          {/* HOY EN ESTA CASILLA — siempre visible: lo que llevás hoy en esta celda */}
          <div style={{ marginTop: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700 }}>HOY EN ESTA CASILLA</span>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: '#00ff9d', textShadow: '0 0 6px rgba(0,255,157,0.5)' }}>{live?.hits ?? 0} ✓</span>
              {'  '}
              <span style={{ color: '#ff1e38', textShadow: '0 0 6px rgba(255,30,56,0.5)' }}>{live?.misses ?? 0} ✗</span>
              <span style={{ color: '#5c687a' }}>{'  ·  racha ahora '}</span>
              <b style={{ color: (live?.streak ?? 0) >= 3 ? '#ff1e38' : (live?.streak ?? 0) >= 1 ? '#ffdf60' : '#00ff9d' }}>
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
            const color = anomalo ? '#ff1e38' : cerca ? '#ffdf60' : cur > 0 ? '#ffdf60' : '#00ff9d';
            return (
              <div style={{
                marginTop: 6, padding: '6px 10px',
                clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
                background: anomalo ? 'rgba(217,11,44,0.15)' : 'rgba(0,0,0,0.5)',
                border: `1px solid ${anomalo ? 'rgba(217,11,44,0.7)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: anomalo ? 'inset 0 0 15px rgba(217,11,44,0.2)' : 'inset 0 2px 6px rgba(0,0,0,0.8)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700 }}>EN VIVO</span>
                  <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                    racha de errores ahora: <b style={{ color, textShadow: `0 0 10px ${color}` }}>{cur}</b>
                    {techo > 0 && <span style={{ color: '#5c687a', fontSize: 11 }}>{'  '}/ techo {techo}</span>}
                  </div>
                </div>
                {anomalo && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: '#ff1e38', fontWeight: 800, marginTop: 4, textShadow: '0 0 8px rgba(255,30,56,0.6)' }}>
                    ⚠ igualaste/superaste el techo histórico — anómalo, considerá salir
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 3 · INSTRUCCIÓN */}
      <div style={{
        padding: '8px 12px',
        clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)',
        background: `linear-gradient(90deg, ${st.dim} 0%, rgba(6,10,20,0.1) 100%)`, 
        borderLeft: `4px solid ${st.color}`,
        boxShadow: `inset 0 2px 10px rgba(0,0,0,0.5)`,
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#8092b5', letterSpacing: '0.15em', fontWeight: 700 }}>QUÉ HACER</span>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 800, color: st.color, textShadow: `0 0 12px ${st.glow}, 0 0 2px ${st.color}`, marginTop: 2 }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* 4 · CELDAS VISITADAS — en palabras */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', paddingLeft: 2, fontWeight: 700 }}>
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
// (Transformado en el "Ojo de Comando" / Reactor Principal)
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

  const history = useHistory();
  const { copHits, copMisses, copStreak, copLive } = useMemo(() => {
    const termo: Record<Market, number[]> = { doc: [], col: [] };
    const cellReg: Record<Market, Record<string, { h: number; m: number; streak: number; mx: number }>> = { doc: {}, col: {} };
    let hits = 0, misses = 0, streak = 0, maxStreak = 0;

    for (const row of history) {
      const key = cellKeyOf(row.hud, row.ent);
      const readMkt = (mkt: Market): MarketRead => {
        const liveRaw = key ? cellReg[mkt][key] : undefined;
        const liveObj = liveRaw ? { hits: liveRaw.h, misses: liveRaw.m, maxStreak: liveRaw.mx } : null;
        const estado = fusedZone(row.hud, row.ent, mkt, liveObj);
        const t = termo[mkt].slice(-10);
        const th = t.filter((x) => x === 1).length;
        let ts = 0;
        for (let i = t.length - 1; i >= 0; i--) { if (t[i] === 0) ts++; else break; }
        return {
          mkt, estado, cellWr: currentCellWr(row.hud, row.ent, mkt),
          termoHits: th, termoTotal: t.length, termoStreak: ts,
          liveStreak: liveRaw?.streak ?? 0, cellCeiling: currentCellMaxRun(row.hud, row.ent, mkt),
        };
      };
      const sug = decidir(readMkt('doc'), readMkt('col')).mercado;

      if (sug) {
        const res = sug === 'doc' ? row.docHit : row.colHit;
        if (res !== null && res !== undefined) {
          if (res) { hits++; streak = 0; }
          else { misses++; streak++; if (streak > maxStreak) maxStreak = streak; }
        }
      }

      (['doc', 'col'] as Market[]).forEach((mkt) => {
        const r = mkt === 'doc' ? row.docHit : row.colHit;
        if (r === null || r === undefined) return;
        termo[mkt].push(r ? 1 : 0);
        if (key) {
          const c = cellReg[mkt][key] ?? { h: 0, m: 0, streak: 0, mx: 0 };
          if (r) { c.h++; c.streak = 0; } else { c.m++; c.streak++; if (c.streak > c.mx) c.mx = c.streak; }
          cellReg[mkt][key] = c;
        }
      });
    }
    return { copHits: hits, copMisses: misses, copStreak: maxStreak, copLive: streak };
  }, [history]);

  const copWr = (copHits + copMisses) > 0 ? (copHits / (copHits + copMisses)) * 100 : null;

  // Tonos intensos Geass/Shikon
  const color = d.nivel === 'ok' ? '#00ff9d' : d.nivel === 'precaucion' ? '#ffdf60' : '#ff1e38';
  const glow = d.nivel === 'ok' ? 'rgba(0,255,157,0.7)' : d.nivel === 'precaucion' ? 'rgba(255,223,96,0.6)' : 'rgba(255,30,56,0.7)';
  const clip = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';

  return (
    <div style={{
      padding: '12px 14px', marginBottom: 6, position: 'relative', overflow: 'hidden',
      clipPath: clip,
      // Efecto Reactor/Ojo: Gradiente radial desde el centro superior hacia la oscuridad
      background: `radial-gradient(circle at 50% 0%, ${color}35 0%, rgba(3,4,8,0.95) 80%)`,
      border: `1px solid ${color}90`, 
      boxShadow: `0 12px 30px rgba(0,0,0,0.8), inset 0 0 50px ${color}20, inset 0 2px 0 ${color}`,
    }}>
      
      {/* Patrón de líneas traseras para dar textura tecno-mágica */}
      <div style={{ 
        position: 'absolute', inset: 0, 
        background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 2px, transparent 2px, transparent 10px)', 
        pointerEvents: 'none' 
      }} />

      {/* encabezado: escudo + nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, position: 'relative' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color, letterSpacing: '0.25em', fontWeight: 800, textShadow: `0 0 10px ${color}` }}>D.A.N.N.A. · ENTRADA SEGURA</span>
      </div>

      {/* orden principal */}
      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, scale: 0.98, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 24, fontWeight: 900, color: '#ffffff', letterSpacing: '0.04em', textShadow: `0 0 20px ${glow}, 0 0 8px ${color}`, lineHeight: 1 }}>
            {d.titulo}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#cbd5e1', maxWidth: '50%', textAlign: 'right', fontWeight: 600 }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>

      {/* MARCADOR PROPIO DE D.A.N.N.A. — aciertos/errores/efectividad/racha */}
      <div style={{
        display: 'flex', marginTop: 10, position: 'relative', flexWrap: 'nowrap',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        background: 'rgba(2,4,8,0.7)', 
        border: `1px solid ${color}40`,
        boxShadow: `inset 0 4px 15px rgba(0,0,0,0.8), 0 2px 0 ${color}20`,
      }}>
        {[
          { k: 'ACIERTOS', v: copHits, c: '#00ff9d' },
          { k: 'ERRORES', v: copMisses, c: '#ff1e38' },
          { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#ffffff' },
          { k: 'RACHA AHORA', v: copLive, c: copLive >= 3 ? '#ff1e38' : copLive >= 1 ? '#ffdf60' : '#00ff9d' },
          { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ff1e38' : '#ffdf60' },
        ].map((s, i, arr) => (
          <div key={s.k} style={{ 
            flex: '1', padding: '8px 10px', 
            borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)'
          }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#8092b5', letterSpacing: '0.1em', fontWeight: 700 }}>{s.k}</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 900, color: s.c, marginTop: 4, textShadow: `0 0 12px ${s.c}80` }}>{s.v}</div>
          </div>
        ))}
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#00e5ff', opacity: 0.9, letterSpacing: '0.25em', fontWeight: 700, textShadow: '0 0 10px rgba(0,229,255,0.6)' }}>
          CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5, fontWeight: 800, letterSpacing: '0.15em',
            color: '#94a3b8', cursor: 'pointer',
            clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            background: 'linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(2,6,23,1) 100%)', 
            border: '1px solid rgba(148,163,184,0.4)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
            padding: '5px 12px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ff1e38';
            e.currentTarget.style.borderColor = 'rgba(255,30,56,0.8)';
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(255,30,56,0.3), inset 0 1px 0 rgba(255,255,255,0.2)';
            e.currentTarget.style.textShadow = '0 0 8px rgba(255,30,56,0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.4)';
            e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)';
            e.currentTarget.style.textShadow = 'none';
          }}
        >
          ⟲ RESET MAPA
        </button>
      </div>

      {/* COPILOTO — la decisión de entrada segura, arriba de todo */}
      <Copilot />

      <div style={{ display: 'flex', gap: 10 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;
