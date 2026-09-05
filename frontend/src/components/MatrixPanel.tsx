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
      display: 'flex', flexDirection: 'column', gap: 1,
      padding: '3px 8px',
      clipPath: 'polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)',
      background: 'rgba(6,10,20,0.45)',
      borderLeft: `3px solid ${st.color}`, boxShadow: `inset 0 0 12px ${st.dim}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: st.color, letterSpacing: '0.06em' }}>
          {st.label}
        </span>
        <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
          {rangeText(cKey)}
        </span>
      </div>
      <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>
        <span style={{ color: '#4ade80' }}>{rec.hits}✓</span>
        {' · '}
        <span style={{ color: '#f87171' }}>{rec.misses}✗</span>
        {' · '}
        <span style={{ color: '#94a3b8' }}>
          racha <b style={{ color: rec.streak >= 3 ? '#f87171' : rec.streak >= 1 ? '#fbbf24' : '#4ade80' }}>{rec.streak}</b>
          {' / '}
          <b style={{ color: rec.maxStreak >= 4 ? '#f87171' : '#cbd5e1' }}>{rec.maxStreak}</b>
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
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5,
      padding: '6px 8px',
      clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      background: 'linear-gradient(180deg, rgba(13,20,36,0.92) 0%, rgba(6,10,20,0.7) 100%)',
      border: `1px solid ${st.color}44`,
      boxShadow: `inset 0 0 24px ${st.dim}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: st.color, textShadow: `0 0 10px ${st.glow}` }}>{title}</span>

      {/* Fila superior: termómetro + cómo venís hoy, lado a lado (menos altura) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
      {/* 0 · TERMÓMETRO EN VIVO — cómo venís en los últimos 10 giros */}
      {(() => {
        const hits = termoHits, total = termoTotal, liveStreak = termoStreak;
        // semáforo: verde 7+/10, amarillo 5-6, rojo <=4 (sobre giros resueltos)
        const ratio = total > 0 ? hits / total : 0;
        const luz = total < 3 ? '#64748b' : ratio >= 0.7 ? '#34d399' : ratio >= 0.5 ? '#fbbf24' : '#f87171';
        const txt = total < 3 ? 'datos…'
          : ratio >= 0.7 ? 'BIEN'
          : ratio >= 0.5 ? 'PAREJO'
          : 'DURA';
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 6px',
            clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
            background: 'rgba(6,10,20,0.55)', border: `1px solid ${luz}55`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: luz, boxShadow: `0 0 8px ${luz}`, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 7.5, color: '#64748b', letterSpacing: '0.1em' }}>ÚLTIMOS {total}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: luz, fontFamily: 'monospace' }}>
                {total > 0 ? `${hits}/${total}` : '—'}
                <span style={{ fontSize: 9.5, fontWeight: 600, color: '#cbd5e1', marginLeft: 6 }}>{txt}</span>
              </span>
            </div>
            {liveStreak >= 2 && (
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#f87171', fontFamily: 'monospace', flexShrink: 0 }}>
                {liveStreak} ✗
              </span>
            )}
          </div>
        );
      })()}

      {/* 1 · SESIÓN — marcador de la partida */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '4px 8px',
        clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        background: 'rgba(6,10,20,0.6)', border: '1px solid rgba(34,211,238,0.22)',
      }}>
        <span style={{ fontSize: 7.5, color: '#22d3ee', letterSpacing: '0.1em', opacity: 0.85 }}>
          SESIÓN HOY
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#2af5b0', lineHeight: 1 }}>✓{gHits}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#ff5c6c', lineHeight: 1 }}>✗{gMiss}</span>
          <span style={{ fontSize: 13, color: '#8092b5', marginLeft: 'auto' }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
      </div>
      </div>{/* cierre grilla superior */}

      {/* 2 · ESTÁS AQUÍ — celda actual + su reputación (MAPA) */}
      <div style={{
        padding: '6px 8px',
        clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
        background: st.dim, border: `1px solid ${st.color}`,
        boxShadow: `0 0 18px ${st.dim}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 8.5, color: st.color, letterSpacing: '0.1em', opacity: 0.9 }}>▸ AQUÍ</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {deviation && (
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
                color: deviation === 'peor' ? '#f87171' : '#4ade80',
              }}>
                {deviation === 'peor' ? '▼ peor' : '▲ mejor'}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.span key={estado}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: st.color,
                  padding: '2px 8px', borderRadius: 999, border: `1px solid ${st.color}`,
                  textShadow: `0 0 8px ${st.glow}`,
                }}>
                ● {st.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>H:{hud ?? '—'}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>E:{ent ?? '—'}</span>
        </div>

        {/* MAPA — reputación histórica de la celda, en palabras */}
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${st.color}30` }}>
          <span style={{ fontSize: 7.5, color: '#64748b', letterSpacing: '0.1em' }}>
            HISTÓRICO DE CASILLA
          </span>
          {map ? (
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2, fontFamily: 'monospace' }}>
              acierto <b style={{ color: '#e2e8f0' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              {' · soporta '}
              <b style={{ color: map.maxRun >= 5 ? '#f87171' : '#e2e8f0' }}>{map.maxRun}</b>
              {' err'}
              <span style={{ color: '#64748b' }}>{' '}({map.n})</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
              sin datos en esta casilla
            </div>
          )}

          {/* HOY EN ESTA CASILLA — siempre visible: lo que llevás hoy en esta celda */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: '#cbd5e1', fontFamily: 'monospace' }}>
              <span style={{ color: '#64748b', fontSize: 7.5, letterSpacing: '0.1em' }}>HOY: </span>
              <span style={{ color: '#4ade80' }}>{live?.hits ?? 0} ✓</span>
              {' '}
              <span style={{ color: '#f87171' }}>{live?.misses ?? 0} ✗</span>
              <span style={{ color: '#64748b' }}>{' · racha '}</span>
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
                marginTop: 3, padding: '3px 6px', borderRadius: 4,
                background: anomalo ? 'rgba(127,29,29,0.35)' : 'rgba(2,6,23,0.5)',
                border: `1px solid ${anomalo ? 'rgba(248,113,113,0.6)' : `${st.color}25`}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 7.5, color: '#64748b', letterSpacing: '0.1em' }}>EN VIVO</span>
                  <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    racha: <b style={{ color }}>{cur}</b>
                    {techo > 0 && <span style={{ color: '#64748b', fontSize: 10 }}>/{techo}</span>}
                  </div>
                </div>
                {anomalo && (
                  <div style={{ fontSize: 9, color: '#f87171', fontWeight: 700, marginTop: 1 }}>
                    ⚠ techo superado — considerá salir
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 3 · INSTRUCCIÓN */}
      <div style={{
        padding: '4px 8px',
        clipPath: 'polygon(6px 0, 100% 0, 100% 100%, 0 100%, 0 6px)',
        background: `${st.dim}`, borderLeft: `3px solid ${st.color}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: st.color, textShadow: `0 0 8px ${st.glow}` }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* 4 · CELDAS VISITADAS — en palabras */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 7.5, color: '#64748b', letterSpacing: '0.1em', paddingLeft: 2 }}>
            PASASTE HOY · {Object.keys(reg).length}
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

  // MARCADOR de D.A.N.N.A. calculado desde el history (determinístico, sin timing).
  // Recorre cada giro resuelto, reconstruye qué habría sugerido D.A.N.N.A. en ESE
  // giro, y cuenta SOLO si sugirió entrar (no cuenta esperar/parar).
  const history = useHistory();
  const { copHits, copMisses, copStreak, copLive } = useMemo(() => {
    // reconstruir estado en vivo giro a giro
    const termo: Record<Market, number[]> = { doc: [], col: [] };
    const cellReg: Record<Market, Record<string, { h: number; m: number; streak: number; mx: number }>> = { doc: {}, col: {} };
    let hits = 0, misses = 0, streak = 0, maxStreak = 0;

    for (const row of history) {
      // El store ya guardó el resultado del pick de ESTE giro en docHit/colHit de
      // esta misma fila. Así que: reconstruyo qué sugirió D.A.N.N.A. en este giro
      // (con el estado ANTES de contar este giro) y lo resuelvo con el resultado
      // de esta misma fila. Alineación correcta, sin diferir.
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

      // resolver la sugerencia con el resultado de ESTA fila (mismo giro)
      if (sug) {
        const res = sug === 'doc' ? row.docHit : row.colHit;
        if (res !== null && res !== undefined) {
          if (res) { hits++; streak = 0; }
          else { misses++; streak++; if (streak > maxStreak) maxStreak = streak; }
        }
      }

      // avanzar el estado en vivo con el resultado de este giro
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

  const color = d.nivel === 'ok' ? '#2af5b0' : d.nivel === 'precaucion' ? '#ffc247' : '#ff5c6c';
  const glow = d.nivel === 'ok' ? 'rgba(42,245,176,0.5)' : d.nivel === 'precaucion' ? 'rgba(255,194,71,0.45)' : 'rgba(255,92,108,0.5)';
  const clip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

  return (
    <div style={{
      padding: '8px 10px', marginBottom: 2, position: 'relative', overflow: 'hidden',
      clipPath: clip,
      background: `linear-gradient(135deg, ${color}22 0%, rgba(6,10,20,0.85) 58%)`,
      border: `1px solid ${color}`, boxShadow: `0 0 20px ${glow}, inset 0 0 24px ${color}10`,
    }}>
      {/* halo de fondo */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(420px 140px at 0% 0%, ${color}20, transparent 68%)`, pointerEvents: 'none' }} />

      {/* encabezado: escudo + nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <span style={{ fontSize: 8, color, letterSpacing: '0.2em', fontWeight: 700 }}>D.A.N.N.A. · ENTRADA SEGURA</span>
      </div>

      {/* orden principal */}
      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color, letterSpacing: '0.01em', textShadow: `0 0 10px ${glow}`, lineHeight: 1 }}>
            {d.titulo}
          </div>
          <div style={{ fontSize: 10, color: '#8092b5', maxWidth: '50%', textAlign: 'right' }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>

      {/* MARCADOR PROPIO DE D.A.N.N.A. — aciertos/errores/efectividad/racha */}
      <div style={{
        display: 'flex', marginTop: 6, position: 'relative', flexWrap: 'nowrap',
        clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        background: 'rgba(6,10,20,0.55)', border: `1px solid ${color}44`,
      }}>
        {[
          { k: 'ACIERTOS', v: copHits, c: '#2af5b0' },
          { k: 'ERRORES', v: copMisses, c: '#ff5c6c' },
          { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#eaf2ff' },
          { k: 'RACHA', v: copLive, c: copLive >= 3 ? '#ff5c6c' : copLive >= 1 ? '#ffc247' : '#2af5b0' },
          { k: 'PEOR', v: copStreak, c: copStreak >= 4 ? '#ff5c6c' : '#ffc247' },
        ].map((s, i, arr) => (
          <div key={s.k} style={{ flex: '1', padding: '4px 6px', borderRight: i < arr.length - 1 ? '1px solid rgba(90,150,220,0.14)' : 'none' }}>
            <div style={{ fontSize: 7.5, color: '#8092b5', letterSpacing: '0.05em' }}>{s.k}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: s.c, marginTop: 1 }}>{s.v}</div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2 }}>
        <span style={{ fontSize: 9, color: '#22d3ee', opacity: 0.7, letterSpacing: '0.2em' }}>
          MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{
            fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em',
            color: '#94a3b8', cursor: 'pointer',
            background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.28)',
            borderRadius: 4, padding: '3px 8px',
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
          ⟲ RESET
        </button>
      </div>

      {/* COPILOTO — la decisión de entrada segura, arriba de todo */}
      <Copilot />

      <div style={{ display: 'flex', gap: 6 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;
