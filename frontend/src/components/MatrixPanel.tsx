// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel · COCKPIT COMPACTO (v5 · sin scroll)
// ════════════════════════════════════════════════════════════════════════
//
// Reemplazo COMPLETO de MatrixPanel.tsx. Misma lógica que v3/v4:
//   - Lectura pura del store + la matriz. No decide ni bloquea al motor.
//   - TODOS los hooks y cálculos se conservan VERBATIM (store, zoneMatrix,
//     copilot.decidir, marcador reconstruido del history).
//
// Cambio de v5: layout COMPACTO para que entre TODO sin scroll. Se fusionan
// termómetro + sesión en cajas chicas, histórico/hoy van dentro del bloque
// de la celda, medidor racha/techo afinado. Se quitó la lista expandida
// "CASILLAS QUE PASASTE HOY" (era la que más altura metía); si la querés de
// vuelta como desplegable, avisá.
//
// Exporta { MatrixPanel } y default. Ningún otro import cambia.
// ════════════════════════════════════════════════════════════════════════

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud, useLastEnt,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useCellReg, useCellRec, useResetTelemetry,
  useTermoHits, useTermoTotal, useTermoStreak, useHistory,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats,
  fusedZone, liveDeviation, currentCellWr, currentCellMaxRun,
  type Zone, type Market,
} from '@/domain/zoneMatrix';
import { decidir, type MarketRead } from '@/domain/copilot';

// ── Tokens de cabina (solo pintura) ──────────────────────────────────────
const FONT_NUM = "'JetBrains Mono', ui-monospace, monospace";
const FONT_DISP = "'Rajdhani', 'Chakra Petch', system-ui, sans-serif";
const BG_DEEP = '#04070d';
const INK_DIM = '#64748b';
const INK_MUT = '#8092b5';
const ICE = '#22d3ee';
const clip = (r: number) =>
  `polygon(${r}px 0, 100% 0, 100% calc(100% - ${r}px), calc(100% - ${r}px) 100%, 0 100%, 0 ${r}px)`;

const STYLE: Record<Zone, { label: string; color: string; glow: string; dim: string }> = {
  SANTUARIO: { label: 'SANTUARIO', color: '#34d399', glow: 'rgba(52,211,153,0.60)', dim: 'rgba(52,211,153,0.13)' },
  VERDE:     { label: 'VERDE',     color: '#10b981', glow: 'rgba(16,185,129,0.50)', dim: 'rgba(16,185,129,0.12)' },
  PROBE:     { label: 'PROBE',     color: '#fbbf24', glow: 'rgba(251,191,36,0.50)', dim: 'rgba(251,191,36,0.12)' },
  TOXICA:    { label: 'TÓXICA',    color: '#f87171', glow: 'rgba(248,113,113,0.50)', dim: 'rgba(248,113,113,0.12)' },
  AGUJERO:   { label: 'AGUJERO',   color: '#ef4444', glow: 'rgba(239,68,68,0.70)',  dim: 'rgba(239,68,68,0.16)' },
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

const OP: Record<Zone, string> = {
  SANTUARIO: 'OPERAR', VERDE: 'OPERAR', PROBE: 'PROBE',
  TOXICA: 'ESPERAR', AGUJERO: 'NO OPERAR', NEUTRA: 'SIN DATOS',
};

// ── Esquinas de targeting ─────────────────────────────────────────────────
function Brackets({ color, on }: { color: string; on: boolean }) {
  if (!on) return null;
  const b: React.CSSProperties = { position: 'absolute', width: 11, height: 11, border: `2px solid ${color}`, pointerEvents: 'none', filter: `drop-shadow(0 0 4px ${color})` };
  return (
    <>
      <span style={{ ...b, top: 6, left: 6, borderRight: 'none', borderBottom: 'none' }} />
      <span style={{ ...b, top: 6, right: 6, borderLeft: 'none', borderBottom: 'none' }} />
    </>
  );
}

// ── Medidor EN VIVO racha vs techo ────────────────────────────────────────
function StreakGauge({ cur, techo, color }: { cur: number; techo: number; color: string }) {
  const n = Math.max(techo, 1);
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
      {Array.from({ length: n }, (_, i) => {
        const on = i < cur;
        const isCap = i === n - 1;
        return (
          <span key={i} style={{
            flex: 1, height: 11, borderRadius: 3,
            background: on ? color : 'rgba(15,22,34,0.9)',
            border: `1px solid ${on ? color : isCap ? 'rgba(120,150,180,0.5)' : 'rgba(90,120,150,0.22)'}`,
            borderStyle: isCap && !on ? 'dashed' : 'solid',
            boxShadow: on ? `0 0 6px ${color}88` : 'none',
            transition: 'all 250ms',
          }} />
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Columna de mercado — COMPACTA
// ────────────────────────────────────────────────────────────────────────
function MarketColumnImpl({ mkt }: { mkt: Market }) {
  // ── DATOS (verbatim) ──
  const hud = useLastHud();
  const ent = useLastEnt();
  const gHits = useMarketHits(mkt);
  const gMiss = useMarketMisses(mkt);
  const gMax = useMarketMaxStreak(mkt);
  const gCur = useMarketStreak(mkt);
  const reg = useCellReg(mkt);

  const key = cellKeyOf(hud, ent);
  const map = cellStats(hud, ent, mkt);
  const live = useCellRec(mkt, key);
  const estado: Zone = fusedZone(hud, ent, mkt, live);
  const deviation = liveDeviation(hud, ent, mkt, live);
  const st = STYLE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const gTotal = gHits + gMiss;
  const termoHits = useTermoHits(mkt, 10);
  const termoTotal = useTermoTotal(mkt, 10);
  const termoStreak = useTermoStreak(mkt, 10);

  // reg se mantiene leído (no se rompe el store); no se lista para ahorrar altura
  void reg; void gCur;

  const operable = estado === 'VERDE' || estado === 'SANTUARIO';

  const ratio = termoTotal > 0 ? termoHits / termoTotal : 0;
  const luz = termoTotal < 3 ? '#64748b' : ratio >= 0.7 ? '#34d399' : ratio >= 0.5 ? '#fbbf24' : '#f87171';
  const termoTxt = termoTotal < 3 ? 'datos…' : ratio >= 0.7 ? 'bien' : ratio >= 0.5 ? 'parejo' : 'dura';

  const cur = live?.streak ?? 0;
  const techo = map?.maxRun ?? 0;
  const anomalo = techo > 0 && cur >= techo;
  const cerca = techo > 0 && cur === techo - 1;
  const liveColor = anomalo ? '#f87171' : cerca ? '#fbbf24' : cur > 0 ? '#fbbf24' : '#4ade80';

  return (
    <div style={{
      flex: 1, minWidth: 0, position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 7,
      padding: '10px 11px', clipPath: clip(12),
      background: operable
        ? `linear-gradient(180deg, ${st.color}14 0%, ${BG_DEEP} 62%)`
        : `linear-gradient(180deg, rgba(13,20,36,0.9) 0%, rgba(6,10,20,0.72) 100%)`,
      border: `1px solid ${st.color}${operable ? '77' : '3a'}`,
      boxShadow: operable ? `inset 0 0 22px ${st.dim}, 0 0 20px ${st.color}1f` : `inset 0 0 20px ${st.dim}`,
    }}>
      <Brackets color={st.color} on={operable} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_DISP, fontSize: 15, fontWeight: 700, letterSpacing: '0.2em', color: st.color, textShadow: `0 0 10px ${st.glow}` }}>{title}</span>
        <span style={{
          fontFamily: FONT_NUM, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          padding: '3px 8px', borderRadius: 5, color: operable ? '#04231a' : st.color,
          background: operable ? st.color : `${st.color}22`, border: `1px solid ${st.color}${operable ? 'ff' : '55'}`,
        }}>{OP[estado]}</span>
      </div>

      {/* ESTÁS AQUÍ — celda + reputación compacto */}
      <div style={{ padding: '8px 10px', borderRadius: 7, background: st.dim, border: `1px solid ${st.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 8.5, letterSpacing: '0.18em', color: st.color, opacity: 0.9 }}>▸ ESTÁS AQUÍ</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {deviation && (
              <span style={{ fontSize: 8.5, fontWeight: 700, color: deviation === 'peor' ? '#f87171' : '#4ade80' }}>
                {deviation === 'peor' ? '▼ hoy peor' : '▲ hoy mejor'}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.span key={estado}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: st.color, padding: '2px 9px', borderRadius: 999, border: `1px solid ${st.color}`, textShadow: `0 0 8px ${st.glow}` }}>
                ● {st.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 3, fontFamily: FONT_NUM }}>
          <b style={{ fontSize: 19, fontWeight: 800, color: '#f1f5f9' }}>HUD {hud ?? '—'}</b>
          <b style={{ fontSize: 19, fontWeight: 800, color: '#f1f5f9' }}>ENT {ent ?? '—'}</b>
        </div>

        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', color: INK_DIM }}>HISTÓRICO DE ESTA CASILLA</span>
          {map ? (
            <div style={{ fontFamily: FONT_NUM, fontSize: 11, color: '#cbd5e1', marginTop: 1 }}>
              acierto <b style={{ color: '#e2e8f0' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              <span style={{ color: INK_DIM }}> · aguanta </span>
              <b style={{ color: map.maxRun >= 5 ? '#f87171' : '#e2e8f0' }}>{map.maxRun}</b>
              <span style={{ color: INK_DIM }}> ({map.n}g)</span>
            </div>
          ) : (
            <div style={{ fontFamily: FONT_NUM, fontSize: 11, color: INK_DIM, marginTop: 1 }}>sin datos</div>
          )}
        </div>

        <div style={{ fontFamily: FONT_NUM, fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', color: INK_DIM }}>HOY </span>
          <span style={{ color: '#4ade80' }}>{live?.hits ?? 0}✓</span>{' '}
          <span style={{ color: '#f87171' }}>{live?.misses ?? 0}✗</span>
          <span style={{ color: INK_DIM }}> · racha </span>
          <b style={{ color: (live?.streak ?? 0) >= 3 ? '#f87171' : (live?.streak ?? 0) >= 1 ? '#fbbf24' : '#4ade80' }}>{live?.streak ?? 0}</b>
        </div>
      </div>

      {/* EN VIVO racha/techo */}
      <div style={{
        padding: '7px 9px', borderRadius: 7,
        background: anomalo ? 'rgba(127,29,29,0.35)' : 'rgba(2,6,23,0.55)',
        border: `1px solid ${anomalo ? 'rgba(248,113,113,0.6)' : `${st.color}25`}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', color: INK_DIM }}>EN VIVO · RACHA ERRORES</span>
          <span style={{ fontFamily: FONT_NUM, fontSize: 12 }}>
            <b style={{ color: liveColor, fontSize: 15 }}>{cur}</b>
            {techo > 0 && <span style={{ color: INK_DIM }}> / techo {techo}</span>}
          </span>
        </div>
        {techo > 0 && <StreakGauge cur={cur} techo={techo} color={liveColor} />}
        {anomalo && <div style={{ fontSize: 9.5, color: '#f87171', fontWeight: 700, marginTop: 4 }}>⚠ igualaste el techo — considerá salir</div>}
      </div>

      {/* mini: termómetro + cómo venís hoy */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(6,10,20,0.6)', border: `1px solid ${luz}44` }}>
          <div style={{ fontSize: 7.5, letterSpacing: '0.12em', color: INK_DIM }}>ÚLTIMOS {termoTotal} GIROS</div>
          <div style={{ fontFamily: FONT_NUM, fontSize: 12, fontWeight: 700, color: luz, marginTop: 1 }}>
            {termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'} <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600 }}>{termoTxt}</span>
            {termoStreak >= 2 && <span style={{ color: '#f87171', fontSize: 9 }}> · {termoStreak}✗</span>}
          </div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(6,10,20,0.6)', border: '1px solid rgba(34,211,238,0.24)' }}>
          <div style={{ fontSize: 7.5, letterSpacing: '0.12em', color: ICE, opacity: 0.85 }}>CÓMO VENÍS HOY</div>
          <div style={{ fontFamily: FONT_NUM, fontSize: 12, fontWeight: 700, marginTop: 1 }}>
            <span style={{ color: '#2af5b0' }}>✓{gHits}</span>{' '}
            <span style={{ color: '#ff5c6c' }}>✗{gMiss}</span>{' '}
            <span style={{ color: INK_MUT, fontSize: 11 }}>{gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}</span>
            <span style={{ color: gMax >= 4 ? '#ffc247' : INK_DIM, fontSize: 10 }}> · peor {gMax}</span>
          </div>
        </div>
      </div>

      {/* QUÉ HACER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 6, background: st.dim, borderLeft: `3px solid ${st.color}` }}>
        <span style={{ fontFamily: FONT_NUM, fontSize: 8, letterSpacing: '0.14em', color: INK_MUT, padding: '3px 6px', borderRadius: 5, background: 'rgba(2,6,23,0.5)', border: `1px solid ${st.color}44`, flexShrink: 0 }}>QUÉ HACER</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: st.color, textShadow: `0 0 8px ${st.glow}`, lineHeight: 1.15 }}>{INSTRUCCION[estado]}</div>
      </div>
    </div>
  );
}
const MarketColumn = memo(MarketColumnImpl);

// ────────────────────────────────────────────────────────────────────────
// COPILOTO
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

  const color = d.nivel === 'ok' ? '#2af5b0' : d.nivel === 'precaucion' ? '#ffc247' : '#ff5c6c';
  const glow = d.nivel === 'ok' ? 'rgba(42,245,176,0.5)' : d.nivel === 'precaucion' ? 'rgba(255,194,71,0.45)' : 'rgba(255,92,108,0.5)';

  return (
    <div style={{
      padding: '12px 15px', marginBottom: 6, position: 'relative', overflow: 'hidden', clipPath: clip(14),
      background: `linear-gradient(135deg, ${color}22 0%, ${BG_DEEP} 60%)`,
      border: `1.4px solid ${color}`, boxShadow: `0 0 26px ${glow}, inset 0 0 30px ${color}10`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(420px 130px at 0% 0%, ${color}20, transparent 68%)`, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <span style={{ fontSize: 8.5, color, letterSpacing: '0.22em', fontWeight: 700 }}>D.A.N.N.A. · ENTRADA SEGURA</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }} style={{ position: 'relative' }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 22, fontWeight: 800, color, letterSpacing: '0.01em', textShadow: `0 0 14px ${glow}`, lineHeight: 1.1 }}>
            {d.titulo}
          </div>
          <div style={{ fontSize: 12.5, color: INK_MUT, marginTop: 2 }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>

      <div style={{ display: 'flex', marginTop: 10, position: 'relative', flexWrap: 'wrap', clipPath: clip(8), background: 'rgba(6,10,20,0.6)', border: `1px solid ${color}44` }}>
        {[
          { k: 'ACIERTOS', v: copHits, c: '#2af5b0' },
          { k: 'ERRORES', v: copMisses, c: '#ff5c6c' },
          { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#eaf2ff' },
          { k: 'RACHA AHORA', v: copLive, c: copLive >= 3 ? '#ff5c6c' : copLive >= 1 ? '#ffc247' : '#2af5b0' },
          { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ff5c6c' : '#ffc247' },
        ].map((s, i, arr) => (
          <div key={s.k} style={{ flex: '1 1 20%', minWidth: 58, padding: '7px 10px', borderRight: i < arr.length - 1 ? '1px solid rgba(90,150,220,0.14)' : 'none' }}>
            <div style={{ fontSize: 8, color: INK_MUT, letterSpacing: '0.08em' }}>{s.k}</div>
            <div style={{ fontFamily: FONT_NUM, fontSize: 18, fontWeight: 800, color: s.c, marginTop: 1 }}>{s.v}</div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2 }}>
        <span style={{ fontFamily: FONT_NUM, fontSize: 9.5, color: ICE, opacity: 0.72, letterSpacing: '0.28em' }}>
          CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', cursor: 'pointer', background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: 6, padding: '4px 9px' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.55)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(148,163,184,0.28)'; }}
        >
          ⟲ RESET MAPA
        </button>
      </div>

      <Copilot />

      <div style={{ display: 'flex', gap: 9 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;
