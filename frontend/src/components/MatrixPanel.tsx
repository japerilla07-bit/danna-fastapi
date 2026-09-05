// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel · COCKPIT (v4 · cabina)
// ════════════════════════════════════════════════════════════════════════
//
// Reemplazo COMPLETO de MatrixPanel.tsx. Misma lógica que v3, solo cambia
// la cara (presentación):
//   - Lectura pura del store + la matriz. No decide ni bloquea al motor.
//   - Todos los hooks y cálculos se conservan VERBATIM (store, zoneMatrix,
//     copilot.decidir, marcador reconstruido del history).
//   - Estética de cabina, jerarquía por importancia, y el medidor EN VIVO
//     racha/techo como pieza estrella (protege el bankroll).
//
// Exporta { MatrixPanel } y default, igual que el original: ningún otro
// import cambia. ANTES de pegar: guardá una copia del MatrixPanel.tsx
// original por si querés volver atrás.
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

// ── Tokens de cabina (solo pintura) ──────────────────────────────────────
const FONT_NUM = "'JetBrains Mono', ui-monospace, monospace";
const FONT_DISP = "'Rajdhani', 'Chakra Petch', system-ui, sans-serif";
const BG_DEEP = '#05070d';
const INK = '#dbe6f5';
const INK_DIM = '#64748b';
const INK_MUT = '#8092b5';
const ICE = '#5fd0ff';
const clip = (r: number) =>
  `polygon(${r}px 0, 100% 0, 100% calc(100% - ${r}px), calc(100% - ${r}px) 100%, 0 100%, 0 ${r}px)`;

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

// Etiqueta de operabilidad (solo chrome — deriva del estado ya calculado)
const OP: Record<Zone, string> = {
  SANTUARIO: 'OPERAR', VERDE: 'OPERAR', PROBE: 'PROBE',
  TOXICA: 'ESPERAR', AGUJERO: 'NO OPERAR', NEUTRA: 'SIN DATOS',
};

const rangeText = (key: string) => labelByKey(key);

// ── Esquinas de targeting (decorativo, por color de zona) ─────────────────
function Brackets({ color, on }: { color: string; on: boolean }) {
  if (!on) return null;
  const base: React.CSSProperties = { position: 'absolute', width: 13, height: 13, border: `2px solid ${color}`, pointerEvents: 'none', filter: `drop-shadow(0 0 5px ${color})` };
  return (
    <>
      <span style={{ ...base, top: 7, left: 7, borderRight: 'none', borderBottom: 'none' }} />
      <span style={{ ...base, top: 7, right: 7, borderLeft: 'none', borderBottom: 'none' }} />
      <span style={{ ...base, bottom: 7, left: 7, borderRight: 'none', borderTop: 'none' }} />
      <span style={{ ...base, bottom: 7, right: 7, borderLeft: 'none', borderTop: 'none' }} />
    </>
  );
}

// ── Medidor EN VIVO racha vs techo (pieza estrella) ───────────────────────
function StreakGauge({ cur, techo, color }: { cur: number; techo: number; color: string }) {
  const n = Math.max(techo, 1);
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
      {Array.from({ length: n }, (_, i) => {
        const on = i < cur;
        const isCap = i === n - 1;
        return (
          <span key={i} style={{
            flex: 1, height: 13, borderRadius: 3,
            background: on ? color : 'rgba(15,22,34,0.9)',
            border: `1px solid ${on ? color : isCap ? 'rgba(120,150,180,0.5)' : 'rgba(90,120,150,0.22)'}`,
            borderStyle: isCap && !on ? 'dashed' : 'solid',
            boxShadow: on ? `0 0 7px ${color}88` : 'none',
            transition: 'all 250ms',
          }} />
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Celda visitada — en palabras
// ────────────────────────────────────────────────────────────────────────
function VisitedRowImpl({ mkt, cKey, rec }: { mkt: Market; cKey: string; rec: CellRec }) {
  const estado = fusedZoneByKey(cKey, mkt, rec);
  const st = STYLE[estado];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '7px 11px',
      clipPath: 'polygon(7px 0, 100% 0, 100% 100%, 0 100%, 0 7px)',
      background: 'rgba(6,10,20,0.55)',
      borderLeft: `3px solid ${st.color}`, boxShadow: `inset 0 0 12px ${st.dim}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: st.color, letterSpacing: '0.06em' }}>
          {st.label}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: FONT_NUM }}>
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
  // ── DATOS (verbatim del original) ──
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

  const visited = Object.entries(reg)
    .sort((a, b) => b[1].maxStreak - a[1].maxStreak || b[1].misses - a[1].misses)
    .slice(0, 3);

  const operable = estado === 'VERDE' || estado === 'SANTUARIO';

  // ── PRESENTACIÓN ──
  return (
    <div style={{
      flex: 1, minWidth: 0, position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 9,
      padding: '13px 14px',
      clipPath: clip(15),
      background: operable
        ? `linear-gradient(180deg, ${st.color}14 0%, ${BG_DEEP} 62%)`
        : `linear-gradient(180deg, rgba(13,20,36,0.92) 0%, rgba(6,10,20,0.72) 100%)`,
      border: `1px solid ${st.color}${operable ? '77' : '3a'}`,
      boxShadow: operable
        ? `inset 0 0 26px ${st.dim}, 0 0 26px ${st.color}22`
        : `inset 0 0 22px ${st.dim}`,
      filter: operable ? 'none' : 'saturate(0.92)',
    }}>
      <Brackets color={st.color} on={operable} />

      {/* Nombre + operabilidad */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_DISP, fontSize: 17, fontWeight: 700, letterSpacing: '0.22em', color: st.color, textShadow: `0 0 12px ${st.glow}` }}>{title}</span>
        <span style={{
          fontFamily: FONT_NUM, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em',
          padding: '3px 9px', borderRadius: 5, color: operable ? '#04231a' : st.color,
          background: operable ? st.color : `${st.color}22`,
          border: `1px solid ${st.color}${operable ? 'ff' : '55'}`,
        }}>{OP[estado]}</span>
      </div>

      {/* Fila superior: termómetro + cómo venís hoy */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* 0 · TERMÓMETRO EN VIVO (últimos 10 giros) */}
        {(() => {
          const hits = termoHits, total = termoTotal, liveStreak = termoStreak;
          const ratio = total > 0 ? hits / total : 0;
          const luz = total < 3 ? '#64748b' : ratio >= 0.7 ? '#34d399' : ratio >= 0.5 ? '#fbbf24' : '#f87171';
          const txt = total < 3 ? 'juntando datos…'
            : ratio >= 0.7 ? 'VENÍS BIEN — aprovechá'
            : ratio >= 0.5 ? 'PAREJO'
            : 'MESA DURA — aflojá o rotá';
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 11px', clipPath: clip(8),
              background: 'rgba(6,10,20,0.6)', border: `1px solid ${luz}55`,
            }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: luz, boxShadow: `0 0 8px ${luz}`, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 8, color: INK_DIM, letterSpacing: '0.18em' }}>ÚLTIMOS {total} GIROS</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: luz, fontFamily: FONT_NUM }}>
                  {total > 0 ? `${hits}/${total}` : '—'}
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: '#cbd5e1', marginLeft: 8 }}>{txt}</span>
                </span>
              </div>
              {liveStreak >= 2 && (
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: '#f87171', fontFamily: FONT_NUM, flexShrink: 0 }}>
                  {liveStreak} seguidas ✗
                </span>
              )}
            </div>
          );
        })()}

        {/* 1 · SESIÓN — marcador de la partida */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '10px 12px', clipPath: clip(9),
          background: 'rgba(6,10,20,0.62)', border: '1px solid rgba(34,211,238,0.22)',
        }}>
          <span style={{ fontSize: 8.5, color: ICE, letterSpacing: '0.2em', opacity: 0.85 }}>CÓMO VENÍS HOY</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: FONT_NUM }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#2af5b0', lineHeight: 1 }}>✓ {gHits}</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#ff5c6c', lineHeight: 1 }}>✗ {gMiss}</span>
            <span style={{ fontSize: 16, color: INK_MUT, marginLeft: 'auto' }}>
              {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
          <span style={{ fontFamily: FONT_NUM, fontSize: 11.5, color: gMax >= 6 ? '#ff5c6c' : gMax >= 4 ? '#ffc247' : INK_MUT }}>
            peor racha de errores hoy: <b style={{ color: gMax >= 4 ? undefined : '#cbd5e1' }}>{gMax}</b>
            {gCur > 0 && <span style={{ color: '#ffc247' }}> · venís perdiendo {gCur} seguidas</span>}
          </span>
        </div>
      </div>

      {/* 2 · ESTÁS AQUÍ — celda actual + reputación */}
      <div style={{
        padding: '10px 12px', clipPath: clip(9),
        background: st.dim, border: `1px solid ${st.color}`, boxShadow: `0 0 18px ${st.dim}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, color: st.color, letterSpacing: '0.2em', opacity: 0.9 }}>▸ ESTÁS AQUÍ</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {deviation && (
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', color: deviation === 'peor' ? '#f87171' : '#4ade80' }}>
                {deviation === 'peor' ? '▼ hoy peor' : '▲ hoy mejor'}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.span key={estado}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: st.color,
                  padding: '3px 11px', borderRadius: 999, border: `1px solid ${st.color}`, textShadow: `0 0 8px ${st.glow}`,
                }}>
                ● {st.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: FONT_NUM }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>HUD {hud ?? '—'}</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>ENT {ent ?? '—'}</span>
        </div>

        <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${st.color}30` }}>
          <span style={{ fontSize: 8.5, color: INK_DIM, letterSpacing: '0.16em' }}>HISTÓRICO DE ESTA CASILLA</span>
          {map ? (
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3, fontFamily: FONT_NUM }}>
              acierto <b style={{ color: '#e2e8f0' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              {'  ·  aguanta hasta '}
              <b style={{ color: map.maxRun >= 5 ? '#f87171' : '#e2e8f0' }}>{map.maxRun}</b>
              {' errores'}
              <span style={{ color: INK_DIM }}>{'  '}({map.n} giros)</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: INK_DIM, marginTop: 3, fontFamily: FONT_NUM }}>sin datos en esta casilla</div>
          )}

          <div style={{ marginTop: 7 }}>
            <span style={{ fontSize: 8.5, color: INK_DIM, letterSpacing: '0.16em' }}>HOY EN ESTA CASILLA</span>
            <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 3, fontFamily: FONT_NUM }}>
              <span style={{ color: '#4ade80' }}>{live?.hits ?? 0} ✓</span>
              {'  '}
              <span style={{ color: '#f87171' }}>{live?.misses ?? 0} ✗</span>
              <span style={{ color: INK_DIM }}>{'  ·  racha ahora '}</span>
              <b style={{ color: (live?.streak ?? 0) >= 3 ? '#f87171' : (live?.streak ?? 0) >= 1 ? '#fbbf24' : '#4ade80' }}>
                {live?.streak ?? 0}
              </b>
            </div>
          </div>

          {/* EN VIVO — pieza estrella: racha vs techo + medidor */}
          {(() => {
            const cur = live?.streak ?? 0;
            const techo = map?.maxRun ?? 0;
            const anomalo = techo > 0 && cur >= techo;
            const cerca = techo > 0 && cur === techo - 1;
            const color = anomalo ? '#f87171' : cerca ? '#fbbf24' : cur > 0 ? '#fbbf24' : '#4ade80';
            return (
              <div style={{
                marginTop: 7, padding: '8px 10px', borderRadius: 8,
                background: anomalo ? 'rgba(127,29,29,0.35)' : 'rgba(2,6,23,0.55)',
                border: `1px solid ${anomalo ? 'rgba(248,113,113,0.6)' : `${st.color}25`}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 8.5, color: INK_DIM, letterSpacing: '0.16em' }}>EN VIVO · RACHA DE ERRORES</span>
                  <span style={{ fontFamily: FONT_NUM, fontSize: 13 }}>
                    <b style={{ color, fontSize: 17 }}>{cur}</b>
                    {techo > 0 && <span style={{ color: INK_DIM, fontSize: 11 }}>{'  '}/ techo {techo}</span>}
                  </span>
                </div>
                {techo > 0 && <StreakGauge cur={cur} techo={techo} color={color} />}
                {anomalo && (
                  <div style={{ fontSize: 10.5, color: '#f87171', fontWeight: 700, marginTop: 5 }}>
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
        padding: '10px 13px',
        clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)',
        background: st.dim, borderLeft: `3px solid ${st.color}`,
        display: 'flex', alignItems: 'center', gap: 11,
      }}>
        <span style={{ fontFamily: FONT_NUM, fontSize: 8.5, color: INK_MUT, letterSpacing: '0.18em', padding: '3px 7px', borderRadius: 5, background: 'rgba(2,6,23,0.5)', border: `1px solid ${st.color}44`, flexShrink: 0 }}>QUÉ HACER</span>
        <div style={{ fontSize: 14, fontWeight: 700, color: st.color, textShadow: `0 0 8px ${st.glow}` }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* 4 · CELDAS VISITADAS */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 8.5, color: INK_DIM, letterSpacing: '0.16em', paddingLeft: 2 }}>
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

  // MARCADOR reconstruido del history (verbatim del original)
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
      padding: '15px 18px', marginBottom: 4, position: 'relative', overflow: 'hidden',
      clipPath: clip(16),
      background: `linear-gradient(135deg, ${color}22 0%, ${BG_DEEP} 60%)`,
      border: `1.5px solid ${color}`, boxShadow: `0 0 30px ${glow}, inset 0 0 34px ${color}10`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(420px 140px at 0% 0%, ${color}20, transparent 68%)`, pointerEvents: 'none' }} />

      {/* encabezado: bolt + QUANTUM PILOT + escudo entrada segura */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, position: 'relative' }}>
        <span style={{ fontSize: 15, color: '#ffd44d', filter: 'drop-shadow(0 0 6px rgba(255,200,70,0.7))' }}>⚡</span>
        <span style={{ fontFamily: FONT_DISP, fontSize: 13, fontWeight: 700, letterSpacing: '0.36em', color: INK }}>QUANTUM&nbsp;PILOT</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
          </svg>
          <span style={{ fontSize: 8.5, color, letterSpacing: '0.2em', fontWeight: 700 }}>ENTRADA SEGURA</span>
        </span>
      </div>

      {/* orden principal */}
      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }} style={{ position: 'relative' }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 24, fontWeight: 800, color, letterSpacing: '0.01em', textShadow: `0 0 14px ${glow}`, lineHeight: 1.1 }}>
            {d.titulo}
          </div>
          <div style={{ fontSize: 12.5, color: INK_MUT, marginTop: 3 }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>

      {/* MARCADOR PROPIO DE D.A.N.N.A. */}
      <div style={{
        display: 'flex', marginTop: 13, position: 'relative', flexWrap: 'wrap',
        clipPath: clip(8), background: 'rgba(6,10,20,0.6)', border: `1px solid ${color}44`,
      }}>
        {[
          { k: 'ACIERTOS', v: copHits, c: '#2af5b0' },
          { k: 'ERRORES', v: copMisses, c: '#ff5c6c' },
          { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#eaf2ff' },
          { k: 'RACHA AHORA', v: copLive, c: copLive >= 3 ? '#ff5c6c' : copLive >= 1 ? '#ffc247' : '#2af5b0' },
          { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ff5c6c' : '#ffc247' },
        ].map((s, i, arr) => (
          <div key={s.k} style={{ flex: '1 1 20%', minWidth: 64, padding: '9px 11px', borderRight: i < arr.length - 1 ? '1px solid rgba(90,150,220,0.14)' : 'none' }}>
            <div style={{ fontSize: 8.5, color: INK_MUT, letterSpacing: '0.1em' }}>{s.k}</div>
            <div style={{ fontFamily: FONT_NUM, fontSize: 19, fontWeight: 800, color: s.c, marginTop: 2 }}>{s.v}</div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2 }}>
        <span style={{ fontFamily: FONT_NUM, fontSize: 10, color: ICE, opacity: 0.72, letterSpacing: '0.3em' }}>
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
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.55)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(148,163,184,0.28)'; }}
        >
          ⟲ RESET MAPA
        </button>
      </div>

      <Copilot />

      <div style={{ display: 'flex', gap: 11 }}>
        <MarketColumn mkt="doc" />
        <MarketColumn mkt="col" />
      </div>
    </div>
  );
}

export default MatrixPanel;
