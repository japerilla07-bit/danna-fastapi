// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel: centro de mando (v4 · piezas sueltas para Quantum)
// ════════════════════════════════════════════════════════════════════════
//
// v4: el antiguo monolito `Copilot()` (header + orden + marcador, todo junto)
// se partió en dos piezas exportadas por separado — `CopilotOrder` y
// `CopilotScoreboard` — para que QuantumPilot las pueda ubicar donde quiera
// en el rediseño del cockpit (la orden pegada a TARGET LOCK, el marcador
// pegado a ERRORES) sin duplicar el cálculo. `MatrixPanel()` (el export
// original) se dejó funcionando EXACTAMENTE igual que antes, solo que ahora
// por dentro arma las dos piezas — así cualquier lugar que todavía lo use
// no se entera del cambio.
//
// También se agrega `ZoneDetailGrid` — el par de `MarketColumn` (doc/col)
// que antes vivía pegado adentro de `MatrixPanel()`, ahora exportado suelto
// para que Quantum lo pueda meter en un acordeón colapsable. Es el MISMO
// componente, sin tocar su lógica.
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
  useTermoHits, useTermoTotal, useTermoStreak, useHistory, useSetCopSug, type CellRec,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats, labelByKey,
  fusedZone, fusedZoneByKey, liveDeviation, currentCellWr, currentCellMaxRun,
  type Zone, type Market,
} from '@/domain/zoneMatrix';
// decidirConEstado() = Capa 1 sola, versión PURA (recibe el "último mercado
// jugado" por parámetro en vez de leer una variable compartida). La usa el
// marcador de abajo (CopilotScoreboard), que reconstruye TODA la sesión
// desde history con su PROPIA memoria local — así nunca se desalinea con la
// decisión en vivo (bug real, corregido sep 2026: ver nota en
// CopilotScoreboard). decidirPiloto() = Capa 1 + Capa 2 (el escudo), función
// pura de lectura — es la que manda en la ORDEN en vivo.
import { decidirPiloto, decidirConEstado, type MarketRead } from '@/domain/copilot';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const DISPLAY = "'Rajdhani', 'Inter', system-ui, sans-serif";

// ── PALETA "GEASS / SHIKON" DIRECTA EN EL COMPONENTE ──
// (rediseño trading: mismo mapa de colores por zona, glow reducido)
const STYLE: Record<Zone, { label: string; color: string; glow: string; dim: string }> = {
  SANTUARIO: { label: 'SANTUARIO', color: '#10b981', glow: 'rgba(16,185,129,0.55)', dim: 'rgba(16,185,129,0.10)' },
  VERDE:     { label: 'VERDE',     color: '#22c55e', glow: 'rgba(34,197,94,0.45)',  dim: 'rgba(34,197,94,0.08)'  },
  PROBE:     { label: 'PROBE',     color: '#f59e0b', glow: 'rgba(245,158,11,0.45)', dim: 'rgba(245,158,11,0.08)' },
  TOXICA:    { label: 'TÓXICA',    color: '#ef4444', glow: 'rgba(239,68,68,0.55)',  dim: 'rgba(239,68,68,0.10)'  },
  AGUJERO:   { label: 'AGUJERO',   color: '#dc2626', glow: 'rgba(220,38,38,0.65)',  dim: 'rgba(220,38,38,0.14)'  },
  NEUTRA:    { label: 'SIN DATOS', color: '#64748b', glow: 'rgba(100,116,139,0.30)', dim: 'rgba(100,116,139,0.06)'},
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
      padding: '5px 10px',
      background: 'rgba(13,18,25,0.7)',
      borderLeft: `2px solid ${st.color}`,
      borderRadius: 2,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: st.color, letterSpacing: '0.10em' }}>
          {st.label}
        </span>
        <span style={{ fontSize: 9, color: '#64748b', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
          {rangeText(cKey)}
        </span>
      </div>
      <span style={{ fontSize: 9.5, color: '#cbd5e1', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: '#10b981' }}>{rec.hits}✓</span>
        {' · '}
        <span style={{ color: '#ef4444' }}>{rec.misses}✗</span>
        {' · '}
        <span style={{ color: '#64748b' }}>
          racha <b style={{ color: rec.streak >= 3 ? '#ef4444' : rec.streak >= 1 ? '#f59e0b' : '#10b981' }}>{rec.streak}</b>
          {' / '}
          <b style={{ color: rec.maxStreak >= 4 ? '#ef4444' : '#cbd5e1' }}>{rec.maxStreak}</b>
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

  const cellBase: React.CSSProperties = {
    padding: '8px 10px',
    background: 'rgba(6,9,17,0.6)',
    border: '1px solid rgba(148,163,184,0.08)',
    borderRadius: 3,
  };

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 12px',
      background: 'linear-gradient(180deg, rgba(13,18,25,0.95) 0%, rgba(6,9,17,0.98) 100%)',
      border: `1px solid ${st.color}55`,
      borderRadius: 4,
      boxShadow: `inset 0 1px 0 ${st.color}20, 0 4px 12px rgba(0,0,0,0.4)`,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: st.color }}>
        {title}
      </span>

      {/* Fila superior: termómetro + cómo venís hoy, lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'stretch' }}>

      {/* 0 · TERMÓMETRO EN VIVO — cómo venís en los últimos 10 giros */}
      {(() => {
        const hits = termoHits, total = termoTotal, liveStreak = termoStreak;
        // semáforo: verde 7+/10, amarillo 5-6, rojo <=4 (sobre giros resueltos)
        const ratio = total > 0 ? hits / total : 0;
        const luz = total < 3 ? '#64748b' : ratio >= 0.7 ? '#10b981' : ratio >= 0.5 ? '#f59e0b' : '#ef4444';
        const txt = total < 3 ? 'juntando datos…'
          : ratio >= 0.7 ? 'VENÍS BIEN — aprovechá'
          : ratio >= 0.5 ? 'PAREJO'
          : 'MESA DURA — aflojá o rotá';
        return (
          <div style={{
            ...cellBase,
            border: `1px solid ${luz}40`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: luz, boxShadow: `0 0 5px ${luz}`, flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 8, color: '#64748b', letterSpacing: '0.14em', fontWeight: 700 }}>ÚLTIMOS {total} GIROS</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: luz, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                {total > 0 ? `${hits}/${total}` : '—'}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#cbd5e1', lineHeight: 1.1 }}>{txt}</span>
              {liveStreak >= 2 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', fontFamily: MONO, marginLeft: 'auto' }}>
                  {liveStreak} ✗
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* 1 · SESIÓN — marcador de la partida */}
      <div style={{
        ...cellBase,
        border: '1px solid rgba(34,211,238,0.20)',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#22d3ee', letterSpacing: '0.14em', fontWeight: 700 }}>
          CÓMO VENÍS HOY
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: MONO, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 10, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#10b981', lineHeight: 1 }}>✓{gHits}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>✗{gMiss}</span>
          </div>
          <span style={{ fontSize: 14, color: '#94a3b8', fontFamily: MONO, fontWeight: 800 }}>
            {gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <span style={{
          fontFamily: MONO, fontSize: 9,
          color: gMax >= 6 ? '#ef4444' : gMax >= 4 ? '#f59e0b' : '#64748b',
          marginTop: 6, lineHeight: 1.3, display: 'block'
        }}>
          peor racha de errores hoy: <b style={{ color: gMax >= 4 ? undefined : '#cbd5e1' }}>{gMax}</b>
          {gCur > 0 && <span style={{ color: '#f59e0b', display: 'block', marginTop: 2 }}>⚠ venís perdiendo {gCur} seguidas</span>}
        </span>
      </div>
      </div>{/* cierre grilla superior */}

      {/* 2 · ESTÁS AQUÍ — celda actual + su reputación (MAPA) */}
      <div style={{
        padding: '10px 12px',
        background: `radial-gradient(circle at top left, ${st.dim} 0%, rgba(6,9,17,0.9) 80%)`,
        border: `1px solid ${st.color}60`,
        borderRadius: 3,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: st.color, letterSpacing: '0.16em', fontWeight: 700 }}>▸ ESTÁS AQUÍ</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {deviation && (
              <span style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
                color: deviation === 'peor' ? '#ef4444' : '#10b981',
              }}>
                {deviation === 'peor' ? '▼ hoy peor' : '▲ hoy mejor'}
              </span>
            )}
            <AnimatePresence mode="wait">
              <motion.span key={estado}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: st.color,
                  padding: '3px 10px',
                  borderRadius: 2,
                  border: `1px solid ${st.color}80`,
                  background: 'rgba(0,0,0,0.4)',
                }}>
                {st.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>HUD {hud ?? '—'}</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>ENT {ent ?? '—'}</span>
        </div>

        {/* MAPA — reputación histórica de la celda, en palabras */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${st.color}30`, position: 'relative' }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#64748b', letterSpacing: '0.14em', fontWeight: 700 }}>
            HISTÓRICO DE ESTA CASILLA
          </span>
          {map ? (
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 3, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
              acierto <b style={{ color: '#ffffff' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              {'  ·  aguanta hasta '}
              <b style={{ color: map.maxRun >= 5 ? '#ef4444' : '#ffffff' }}>{map.maxRun}</b>
              {' errores'}
              <span style={{ color: '#64748b' }}>{'  '}({map.n} giros)</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontFamily: MONO }}>
              sin datos en esta casilla
            </div>
          )}

          {/* HOY EN ESTA CASILLA — siempre visible: lo que llevás hoy en esta celda */}
          <div style={{ marginTop: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 8, color: '#64748b', letterSpacing: '0.14em', fontWeight: 700 }}>HOY EN ESTA CASILLA</span>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 3, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: '#10b981' }}>{live?.hits ?? 0} ✓</span>
              {'  '}
              <span style={{ color: '#ef4444' }}>{live?.misses ?? 0} ✗</span>
              <span style={{ color: '#64748b' }}>{'  ·  racha ahora '}</span>
              <b style={{ color: (live?.streak ?? 0) >= 3 ? '#ef4444' : (live?.streak ?? 0) >= 1 ? '#f59e0b' : '#10b981' }}>
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
            const color = anomalo ? '#ef4444' : cerca ? '#f59e0b' : cur > 0 ? '#f59e0b' : '#10b981';
            return (
              <div style={{
                marginTop: 6, padding: '6px 10px',
                background: anomalo ? 'rgba(220,38,38,0.10)' : 'rgba(0,0,0,0.4)',
                border: `1px solid ${anomalo ? 'rgba(220,38,38,0.55)' : 'rgba(148,163,184,0.08)'}`,
                borderRadius: 2,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: '#64748b', letterSpacing: '0.14em', fontWeight: 700 }}>EN VIVO</span>
                  <div style={{ fontSize: 12, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                    racha de errores ahora: <b style={{ color }}>{cur}</b>
                    {techo > 0 && <span style={{ color: '#64748b', fontSize: 10.5 }}>{'  '}/ techo {techo}</span>}
                  </div>
                </div>
                {anomalo && (
                  <div style={{ fontFamily: MONO, fontSize: 9, color: '#ef4444', fontWeight: 800, marginTop: 4 }}>
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
        background: `linear-gradient(90deg, ${st.dim} 0%, rgba(6,10,20,0.05) 100%)`,
        borderLeft: `3px solid ${st.color}`,
        borderRadius: '0 2px 2px 0',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#94a3b8', letterSpacing: '0.14em', fontWeight: 700 }}>QUÉ HACER</span>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: st.color, marginTop: 3 }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* 4 · CELDAS VISITADAS — en palabras */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#64748b', letterSpacing: '0.14em', paddingLeft: 2, fontWeight: 700 }}>
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
// MarketEfficiencyCell — versión COMPACTA de MarketColumn, para la columna
// ZONA del Quantum Pilot (320px de ancho, apiladas doc/col). MarketColumn
// (arriba) trae termómetro + "cómo venís hoy" + celda actual con histórico
// + caja "EN VIVO" duplicada + lista de casillas visitadas — de punta a
// punta es alta, y apiladas las dos (doc y col) la segunda queda fuera de
// vista, justo la queja de Gunner: "la celda de columnas debe estar por
// debajo de la de docenas mostrando su eficiencia si no no sirve". Esta
// versión deja SOLO lo que hace falta para operar en vivo: zona actual,
// HUD/ENT, cómo venís en los últimos 10 giros, eficiencia histórica de la
// celda (acierto % + techo de errores) y qué hacer. Se sacan del todo la
// lista "casillas que pasaste hoy" y la caja "EN VIVO" repetida — ese
// detalle completo sigue disponible en MatrixPanel() (uso no-compacto).
// ────────────────────────────────────────────────────────────────────────

function MarketEfficiencyCellImpl({ mkt }: { mkt: Market }) {
  const hud = useLastHud();
  const ent = useLastEnt();
  const key = cellKeyOf(hud, ent);
  const map = cellStats(hud, ent, mkt);
  const live = useCellRec(mkt, key);
  const estado: Zone = fusedZone(hud, ent, mkt, live);
  const deviation = liveDeviation(hud, ent, mkt, live);
  const st = STYLE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const termoHits = useTermoHits(mkt, 10);
  const termoTotal = useTermoTotal(mkt, 10);
  const ratio = termoTotal > 0 ? termoHits / termoTotal : 0;
  const luz = termoTotal < 3 ? '#64748b' : ratio >= 0.7 ? '#10b981' : ratio >= 0.5 ? '#f59e0b' : '#ef4444';
  // Contador general de la mesa (sesión completa) — el que traía la card
  // grande ("CÓMO VENÍS HOY") y que se había caído en la versión compacta.
  // Gunner: "me eliminaste el contador general de docenas y columnas que
  // tenian esas card y es necesario visualizar rendimiento".
  const gHits = useMarketHits(mkt);
  const gMiss = useMarketMisses(mkt);
  const gMax = useMarketMaxStreak(mkt);
  const gTotal = gHits + gMiss;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      padding: '9px 11px',
      background: 'linear-gradient(180deg, rgba(13,18,25,0.95) 0%, rgba(6,9,17,0.98) 100%)',
      border: `1px solid ${st.color}55`,
      borderRadius: 4,
      boxShadow: `inset 0 1px 0 ${st.color}20, 0 4px 12px rgba(0,0,0,0.4)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: st.color }}>
          {title}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.10em', color: st.color,
          padding: '2px 7px',
          border: `1px solid ${st.color}80`,
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 2,
          whiteSpace: 'nowrap',
        }}>
          {st.label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 10.5, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
        HUD <b style={{ color: '#ffffff' }}>{hud ?? '—'}</b>
        {'  ·  '}
        ENT <b style={{ color: '#ffffff' }}>{ent ?? '—'}</b>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
        <span>
          <span style={{ color: '#10b981' }}>✓{gHits}</span>
          {' '}
          <span style={{ color: '#ef4444' }}>✗{gMiss}</span>
        </span>
        <span style={{ color: '#94a3b8', fontWeight: 800 }}>{gTotal ? `${Math.round((gHits / gTotal) * 100)}%` : '—'}</span>
      </div>
      {gMax >= 4 && (
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: '#f59e0b', marginTop: -2 }}>
          peor racha hoy: <b>{gMax}</b>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 10 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: luz, boxShadow: `0 0 4px ${luz}`, flexShrink: 0 }} />
        <span style={{ color: '#94a3b8' }}>ÚLT. 10:</span>
        <b style={{ color: luz, fontVariantNumeric: 'tabular-nums' }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 10, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
        {'eficiencia: '}
        {map ? (
          <>
            <b style={{ color: '#ffffff' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
            {' · techo '}
            <b style={{ color: map.maxRun >= 5 ? '#ef4444' : '#ffffff' }}>{map.maxRun}</b>
            <span style={{ color: '#64748b' }}>{' '}({map.n}g)</span>
          </>
        ) : (
          <span style={{ color: '#64748b' }}>sin datos en esta casilla</span>
        )}
      </div>

      <div style={{
        marginTop: 1, padding: '5px 8px',
        borderLeft: `3px solid ${st.color}`,
        background: `${st.color}10`,
        fontFamily: MONO, fontSize: 11, fontWeight: 700, color: st.color,
        lineHeight: 1.25,
        borderRadius: '0 2px 2px 0',
      }}>
        {INSTRUCCION[estado]}
      </div>
    </div>
  );
}
const MarketEfficiencyCell = memo(MarketEfficiencyCellImpl);

// ────────────────────────────────────────────────────────────────────────
// ZoneDetailGrid — el par DOCENAS/COLUMNAS suelto. `compact` cambia entre
// la tarjeta completa (MarketColumn, uso original de MatrixPanel()) y la
// tarjeta chica (MarketEfficiencyCell, uso del Quantum Pilot) — mismo dato,
// cero cambios de lógica, solo dos presentaciones según el espacio real
// disponible.
// ────────────────────────────────────────────────────────────────────────

export function ZoneDetailGrid({ direction = 'row', compact = false }: { direction?: 'row' | 'column'; compact?: boolean }) {
  const Cell = compact ? MarketEfficiencyCell : MarketColumn;
  return (
    <div style={{ display: 'flex', flexDirection: direction, gap: compact ? 8 : 10 }}>
      <Cell mkt="doc" />
      <Cell mkt="col" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// COPILOTO — lee ambos mercados y da UNA decisión de entrada segura
//
// v4: partido en dos piezas exportadas — CopilotOrder (header + orden,
// dueño de avisarle al store qué sugiere el piloto) y CopilotScoreboard
// (el marcador ACIERTOS/ERRORES/EFECTIVIDAD/RACHA, réplica de toda la
// sesión vía decidirConEstado() Capa 1, con memoria propia). Cada una es
// independiente — se pueden
// ubicar en cualquier lugar del layout.
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

/** Header + orden del escudo ("ENTRADA SEGURA"). Es la ÚNICA pieza que le
 *  avisa al store qué mercado sugiere el piloto ahora mismo — si en algún
 *  momento se usa CopilotScoreboard sin esta pieza en el mismo árbol, el
 *  store deja de recibir la sugerencia en vivo. Quantum las usa siempre
 *  juntas, así que no pasa. */
export function CopilotOrder() {
  const doc = useMarketRead('doc');
  const col = useMarketRead('col');
  const d = decidirPiloto(doc, col);

  const setCopSug = useSetCopSug();
  setCopSug(d.mercado);

  const color = d.nivel === 'ok' ? '#10b981' : d.nivel === 'precaucion' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      padding: '12px 14px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${color}10 0%, rgba(6,9,17,0.95) 100%)`,
      border: `1px solid ${color}80`,
      borderRadius: 4,
      boxShadow: `inset 0 1px 0 ${color}40`,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.008) 0px, rgba(255,255,255,0.008) 1px, transparent 1px, transparent 8px)',
        pointerEvents: 'none'
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <span style={{ fontFamily: MONO, fontSize: 9, color, letterSpacing: '0.22em', fontWeight: 800 }}>ESCUDO (CAPA 1+2) · ENTRADA SEGURA</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em', lineHeight: 1.05 }}>
            {d.titulo}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: '#94a3b8', maxWidth: '50%', textAlign: 'right', fontWeight: 600, lineHeight: 1.3 }}>{d.motivo}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Marcador ACIERTOS/ERRORES/EFECTIVIDAD/RACHA del escudo — réplica de toda
 *  la sesión vía decidirConEstado() (Capa 1 sola, estado puro, no se
 *  corrompe al recalcularse). Independiente de CopilotOrder.
 *
 *  FIX (sep 2026) — bug real reportado por Gunner: "un acierto lo cuenta
 *  como error y cuando tiene un error lo marca como dos". Antes este loop
 *  llamaba a decidir(doc, col) directo, que lee/muta la variable de MÓDULO
 *  ultimoMercadoJugado de copilot.ts — la MISMA que usa la decisión en vivo
 *  (vía decidirPiloto, en CopilotOrder). Como ninguno de los dos reseteaba
 *  esa memoria antes de arrancar, cada vez que este marcador recalculaba
 *  TODA la sesión desde el giro 1 (pasa en cada giro nuevo), el primer giro
 *  del replay heredaba lo que hubiera dejado la decisión en vivo (o el
 *  replay anterior) en vez de arrancar sin memoria — la regla "evitar
 *  refugio" podía terminar evaluando un giro contra el mercado equivocado,
 *  contando el acierto de un mercado como error del otro, y el resultado
 *  cambiaba entre una pasada y la siguiente para el mismo giro. Ya estaba
 *  marcado como sospecha sin confirmar en la auditoría de código; quedó
 *  confirmado con este síntoma. Ahora se usa decidirConEstado() con
 *  `ultimoLocal`, una memoria PROPIA de este replay que arranca en null en
 *  cada recálculo — nunca toca ni depende de la memoria de la decisión en
 *  vivo, así que da el mismo resultado sin importar cuántas veces se corra
 *  ni en qué orden rendericen los componentes. */
export function CopilotScoreboard() {
  const history = useHistory();
  const { copHits, copMisses, copStreak, copLive } = useMemo(() => {
    const termo: Record<Market, number[]> = { doc: [], col: [] };
    const cellReg: Record<Market, Record<string, { h: number; m: number; streak: number; mx: number }>> = { doc: {}, col: {} };
    let hits = 0, misses = 0, streak = 0, maxStreak = 0;
    // Memoria de "último mercado jugado" PROPIA de este replay — nunca la
    // de copilot.ts. Arranca en null en CADA recálculo: un replay desde el
    // giro 1 de la sesión siempre empieza sin nada jugado todavía, sea la
    // primera vez que corre este useMemo o la enésima.
    let ultimoLocal: Market | null = null;

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
      const { decision, ultimoJugado } = decidirConEstado(readMkt('doc'), readMkt('col'), ultimoLocal);
      ultimoLocal = ultimoJugado;
      const sug = decision.mercado;

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

  return (
    <div style={{
      display: 'flex', position: 'relative', flexWrap: 'nowrap',
      background: 'rgba(6,9,17,0.7)',
      border: '1px solid rgba(34,211,238,0.20)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {[
        { k: 'ACIERTOS', v: copHits, c: '#10b981' },
        { k: 'ERRORES', v: copMisses, c: '#ef4444' },
        { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#ffffff' },
        { k: 'RACHA AHORA', v: copLive, c: copLive >= 3 ? '#ef4444' : copLive >= 1 ? '#f59e0b' : '#10b981' },
        { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ef4444' : '#f59e0b' },
      ].map((s, i, arr) => (
        <div key={s.k} style={{
          flex: '1', padding: '8px 10px',
          borderRight: i < arr.length - 1 ? '1px solid rgba(148,163,184,0.08)' : 'none',
        }}>
          <div style={{ fontFamily: MONO, fontSize: 7.5, color: '#64748b', letterSpacing: '0.14em', fontWeight: 700 }}>{s.k}</div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: s.c, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
        </div>
      ))}
    </div>
  );
}

/** Par de chips compactos con la zona ACTUAL de cada mercado (doc/col) —
 *  mismo useMarketRead()/fusedZone() que usa CopilotOrder, así nunca puede
 *  mostrar algo distinto de lo que el escudo está viendo en este momento.
 *  Pensado para el header de un acordeón colapsado (LECTURA DE ZONA en
 *  Quantum): así "las dos celdas actuales" se ven sin tener que abrir nada. */
export function ZoneQuickBadges() {
  const doc = useMarketRead('doc');
  const col = useMarketRead('col');

  const chip = (label: string, read: MarketRead) => {
    const st = STYLE[read.estado];
    return (
      <span
        key={label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
          padding: '2px 7px', borderRadius: 2,
          color: st.color, border: `1px solid ${st.color}55`, background: `${st.color}10`,
        }}
      >
        {label}: {st.label}
      </span>
    );
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {chip('DOC', doc)}
      {chip('COL', col)}
    </span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: '#22d3ee', letterSpacing: '0.22em', fontWeight: 800 }}>
          CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{
            fontFamily: MONO,
            fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em',
            color: '#94a3b8', cursor: 'pointer',
            background: 'rgba(13,18,25,0.9)',
            border: '1px solid rgba(148,163,184,0.30)',
            borderRadius: 2,
            padding: '5px 12px',
            transition: 'all 0.2s ease',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ef4444';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.30)';
          }}
        >
          ⟲ reset mapa
        </button>
      </div>

      {/* COPILOTO — la decisión de entrada segura, arriba de todo */}
      <div style={{ marginBottom: 6 }}>
        <CopilotOrder />
        <div style={{ marginTop: 10 }}>
          <CopilotScoreboard />
        </div>
      </div>

      <ZoneDetailGrid />
    </div>
  );
}

export default MatrixPanel;
