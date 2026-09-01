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
  useTermoHits, useTermoTotal, useTermoStreak,
  useSetCopSug, useCopHits, useCopMisses, useCopStreak, useCopWr, type CellRec,
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
      padding: '7px 10px',
      clipPath: 'polygon(7px 0, 100% 0, 100% 100%, 0 100%, 0 7px)',
      background: 'rgba(6,10,20,0.45)',
      borderLeft: `3px solid ${st.color}`, boxShadow: `inset 0 0 12px ${st.dim}`,
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
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9,
      padding: '12px 13px',
      clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
      background: 'linear-gradient(180deg, rgba(13,20,36,0.92) 0%, rgba(6,10,20,0.7) 100%)',
      border: `1px solid ${st.color}44`,
      boxShadow: `inset 0 0 24px ${st.dim}`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.18em', color: st.color, textShadow: `0 0 10px ${st.glow}` }}>{title}</span>

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
            padding: '7px 11px',
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            background: 'rgba(6,10,20,0.55)', border: `1px solid ${luz}55`,
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
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '10px 12px',
        clipPath: 'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)',
        background: 'rgba(6,10,20,0.6)', border: '1px solid rgba(34,211,238,0.22)',
      }}>
        <span style={{ fontSize: 8.5, color: '#22d3ee', letterSpacing: '0.2em', opacity: 0.85 }}>
          CÓMO VENÍS HOY
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: 'monospace' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#2af5b0', lineHeight: 1 }}>✓ {gHits}</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#ff5c6c', lineHeight: 1 }}>✗ {gMiss}</span>
          <span style={{ fontSize: 16, color: '#8092b5', marginLeft: 'auto' }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <span style={{
          fontFamily: 'monospace', fontSize: 11.5,
          color: gMax >= 6 ? '#ff5c6c' : gMax >= 4 ? '#ffc247' : '#8092b5',
        }}>
          peor racha de errores hoy: <b style={{ color: gMax >= 4 ? undefined : '#cbd5e1' }}>{gMax}</b>
          {gCur > 0 && <span style={{ color: '#ffc247' }}> · venís perdiendo {gCur} seguidas</span>}
        </span>
      </div>

      {/* 2 · ESTÁS AQUÍ — celda actual + su reputación (MAPA) */}
      <div style={{
        padding: '10px 12px',
        clipPath: 'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)',
        background: st.dim, border: `1px solid ${st.color}`,
        boxShadow: `0 0 18px ${st.dim}`,
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
      <div style={{
        padding: '9px 12px',
        clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)',
        background: `${st.dim}`, borderLeft: `3px solid ${st.color}`,
      }}>
        <span style={{ fontSize: 8, color: '#8092b5', letterSpacing: '0.18em' }}>QUÉ HACER</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: st.color, marginTop: 2, textShadow: `0 0 8px ${st.glow}` }}>{INSTRUCCION[estado]}</div>
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
  const setCopSug = useSetCopSug();

  // Escribir la sugerencia actual de D.A.N.N.A. de forma SINCRÓNICA en cada render,
  // no con un efecto (que llega tarde). Así el store cuenta exactamente lo que se
  // ve: si D.A.N.N.A. dice esperar/parar (mercado null), ese giro NO se cuenta.
  setCopSug(d.mercado);

  const copHits = useCopHits();
  const copMisses = useCopMisses();
  const copStreak = useCopStreak();
  const copWr = useCopWr();

  const color = d.nivel === 'ok' ? '#2af5b0' : d.nivel === 'precaucion' ? '#ffc247' : '#ff5c6c';
  const glow = d.nivel === 'ok' ? 'rgba(42,245,176,0.5)' : d.nivel === 'precaucion' ? 'rgba(255,194,71,0.45)' : 'rgba(255,92,108,0.5)';
  const clip = 'polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)';

  return (
    <div style={{
      padding: '15px 17px', marginBottom: 4, position: 'relative', overflow: 'hidden',
      clipPath: clip,
      background: `linear-gradient(135deg, ${color}22 0%, rgba(6,10,20,0.85) 58%)`,
      border: `1.5px solid ${color}`, boxShadow: `0 0 30px ${glow}, inset 0 0 34px ${color}10`,
    }}>
      {/* halo de fondo */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(420px 140px at 0% 0%, ${color}20, transparent 68%)`, pointerEvents: 'none' }} />

      {/* encabezado: escudo + nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, position: 'relative' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <span style={{ fontSize: 9, color, letterSpacing: '0.24em', fontWeight: 700 }}>D.A.N.N.A. · ENTRADA SEGURA</span>
      </div>

      {/* orden principal */}
      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }} style={{ position: 'relative' }}>
          <div style={{ fontSize: 23, fontWeight: 800, color, letterSpacing: '0.01em', textShadow: `0 0 14px ${glow}`, lineHeight: 1.1 }}>
            {d.titulo}
          </div>
          <div style={{ fontSize: 12.5, color: '#8092b5', marginTop: 3 }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>

      {/* MARCADOR PROPIO DE D.A.N.N.A. — aciertos/errores/efectividad/racha de lo que sugiere */}
      <div style={{
        display: 'flex', marginTop: 13, position: 'relative',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        background: 'rgba(6,10,20,0.55)', border: `1px solid ${color}44`,
      }}>
        {[
          { k: 'ACIERTOS', v: copHits, c: '#2af5b0' },
          { k: 'ERRORES', v: copMisses, c: '#ff5c6c' },
          { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#eaf2ff' },
          { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ff5c6c' : '#ffc247' },
        ].map((s, i) => (
          <div key={s.k} style={{ flex: 1, padding: '8px 10px', borderRight: i < 3 ? '1px solid rgba(90,150,220,0.14)' : 'none' }}>
            <div style={{ fontSize: 8, color: '#4e5d7e', letterSpacing: '0.12em' }}>{s.k}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 800, color: s.c, marginTop: 1 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


export function MatrixPanel() {
  const resetTelemetry = useResetTelemetry()
