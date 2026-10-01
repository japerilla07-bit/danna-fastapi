// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel: centro de mando (v5 · instrument panel, sin cards)
// ════════════════════════════════════════════════════════════════════════
//
// v5 (sep 2026) — REDISEÑO COMPLETO DEL LENGUAJE VISUAL. Crítica externa que
// Gunner trajo, resumida: dejar de pensar en "cards" (caja con borde+fondo+
// sombra+radio alrededor de cada dato) y pasar a un "instrument panel" —
// trading terminal / consola, no dashboard de SaaS. Los datos no viven en
// cajas independientes: forman una sola superficie, y la jerarquía sale de
// tipografía/posición/color, no de contenedores. Reglas aplicadas en TODO
// este archivo:
//   - Cero clipPath/border/boxShadow/background decorativo por componente.
//     Lo único que queda son líneas finas de 1px como separador semántico
//     (bandas) y, cuando hace falta marcar "esto es un bloque", un acento
//     lateral de 3px (borderLeft) — nunca una caja completa.
//   - El color indica EVENTOS, no categorías: verde = favorable/activo,
//     ámbar = esperar, rojo = error/peligro, gris = dato neutro. El glow
//     (textShadow) se reserva para la decisión/estado activo, no para cada
//     número de la pantalla — si todo brilla, nada brilla.
//   - Ninguna lógica de datos cambió: mismos hooks, mismas fórmulas, mismas
//     fuentes (telemetryStore, zoneMatrix, copilot). Esto es una reescritura
//     de PRESENTACIÓN únicamente.
//
// (Histórico v4): el monolito `Copilot()` se partió en `CopilotOrder` y
// `CopilotScoreboard` para que QuantumPilot las ubique donde quiera sin
// duplicar el cálculo. `ZoneDetailGrid` expone el par de columnas de
// mercado (doc/col) — completo (`MarketColumn`) o compacto
// (`MarketEfficiencyCell`, para la columna angosta del Quantum Pilot).
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

const FONT_HEAD = "'Rajdhani', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

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
// Celda visitada — en palabras. Sin caja: un punto de color + texto.
// ────────────────────────────────────────────────────────────────────────

function VisitedRowImpl({ mkt, cKey, rec }: { mkt: Market; cKey: string; rec: CellRec }) {
  const estado = fusedZoneByKey(cKey, mkt, rec);
  const st = STYLE[estado];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, boxShadow: `0 0 5px ${st.color}`, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 800, color: st.color, letterSpacing: '0.06em' }}>
          {st.label}
        </span>
        <span style={{ fontSize: 9, color: '#5c687a', fontFamily: FONT_MONO }}>
          {rangeText(cKey)}
        </span>
      </span>
      <span style={{ fontSize: 10, color: '#cbd5e1', fontFamily: FONT_MONO }}>
        <span style={{ color: '#00ff9d' }}>{rec.hits}✓</span>
        {' · '}
        <span style={{ color: '#ff1e38' }}>{rec.misses}✗</span>
        {' · '}
        racha <b style={{ color: rec.streak >= 3 ? '#ff1e38' : rec.streak >= 1 ? '#ffdf60' : '#00ff9d' }}>{rec.streak}</b>
        {' / '}
        <b style={{ color: rec.maxStreak >= 4 ? '#ff1e38' : '#cbd5e1' }}>{rec.maxStreak}</b>
      </span>
    </div>
  );
}
const VisitedRow = memo(VisitedRowImpl);

// ────────────────────────────────────────────────────────────────────────
// Columna de mercado — versión COMPLETA (uso: MatrixPanel() legacy).
// Sin cajas: un acento lateral marca "histórico de la celda" y "qué hacer"
// como los dos bloques lógicos del componente; todo lo demás es texto en
// líneas, separado por el propio salto de línea, no por bordes.
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

  const ratio = termoTotal > 0 ? termoHits / termoTotal : 0;
  const luz = termoTotal < 3 ? '#5c687a' : ratio >= 0.7 ? '#00ff9d' : ratio >= 0.5 ? '#ffdf60' : '#ff1e38';
  const termoTxt = termoTotal < 3 ? 'juntando datos…'
    : ratio >= 0.7 ? 'VENÍS BIEN — aprovechá'
    : ratio >= 0.5 ? 'PAREJO'
    : 'MESA DURA — aflojá o rotá';

  const cur = live?.streak ?? 0;
  const techo = map?.maxRun ?? 0;
  const anomalo = techo > 0 && cur >= techo;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* título + estado actual */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `1px solid ${st.color}30`, paddingBottom: 5 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 800, letterSpacing: '0.2em', color: st.color, textShadow: `0 0 10px ${st.glow}` }}>
          {title}
        </span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: st.color }}>
          {st.label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: '#ffffff' }}>
        HUD {hud ?? '—'} <span style={{ color: '#5c687a' }}>·</span> ENT {ent ?? '—'}
      </div>

      {/* últimos 10 giros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT_MONO, fontSize: 11 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: luz, boxShadow: `0 0 6px ${luz}`, flexShrink: 0 }} />
        <span style={{ color: '#8092b5' }}>ÚLT. {termoTotal || 10}:</span>
        <b style={{ color: luz }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
        <span style={{ color: '#cbd5e1', fontSize: 10 }}>{termoTxt}</span>
        {termoStreak >= 2 && <span style={{ color: '#ff1e38', marginLeft: 'auto', fontWeight: 800 }}>{termoStreak} ✗</span>}
      </div>

      {/* cómo venís hoy (sesión completa) */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 12 }}>
        <span>
          <span style={{ color: '#00ff9d' }}>✓{gHits}</span>{' '}
          <span style={{ color: '#ff1e38' }}>✗{gMiss}</span>
          <span style={{ color: '#5c687a' }}> hoy</span>
        </span>
        <span style={{ color: '#8092b5', fontWeight: 800 }}>{gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}</span>
      </div>
      {gMax >= 4 && (
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#ffdf60', marginTop: -3 }}>
          peor racha hoy: <b>{gMax}</b>
          {gCur > 0 && <span> · ⚠ venís perdiendo {gCur} seguidas</span>}
        </div>
      )}

      {/* histórico de la celda — bloque con acento lateral */}
      <div style={{ borderLeft: `3px solid ${st.color}`, paddingLeft: 9, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700 }}>
          HISTÓRICO DE ESTA CASILLA
        </span>
        {map ? (
          <div style={{ fontSize: 12, color: '#cbd5e1', fontFamily: FONT_MONO }}>
            acierto <b style={{ color: '#ffffff' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
            {'  ·  aguanta hasta '}
            <b style={{ color: map.maxRun >= 5 ? '#ff1e38' : '#ffffff' }}>{map.maxRun}</b>
            {' errores'}
            <span style={{ color: '#5c687a' }}>{'  '}({map.n} giros)</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#5c687a', fontFamily: FONT_MONO }}>sin datos en esta casilla</div>
        )}

        <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700, marginTop: 4 }}>
          HOY EN ESTA CASILLA
        </span>
        <div style={{ fontSize: 12, color: '#cbd5e1', fontFamily: FONT_MONO }}>
          <span style={{ color: '#00ff9d' }}>{live?.hits ?? 0} ✓</span>
          {'  '}
          <span style={{ color: '#ff1e38' }}>{live?.misses ?? 0} ✗</span>
          <span style={{ color: '#5c687a' }}>{'  ·  racha ahora '}</span>
          <b style={{ color: cur >= 3 ? '#ff1e38' : cur >= 1 ? '#ffdf60' : '#00ff9d' }}>{cur}</b>
          {techo > 0 && <span style={{ color: '#5c687a', fontSize: 11 }}>{'  '}/ techo {techo}</span>}
        </div>

        {anomalo && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#ff1e38', fontWeight: 800, marginTop: 2 }}>
            ⚠ igualaste/superaste el techo histórico — anómalo, considerá salir
          </div>
        )}
      </div>

      {/* qué hacer — bloque con acento lateral */}
      <div style={{ borderLeft: `3px solid ${st.color}`, paddingLeft: 9 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#8092b5', letterSpacing: '0.15em', fontWeight: 700 }}>QUÉ HACER</span>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 800, color: st.color }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* casillas visitadas — en palabras */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#5c687a', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 2 }}>
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
// ZONA del Quantum Pilot (320px de ancho, apiladas doc/col). Mismo dato que
// MarketColumn, sin la lista de casillas visitadas ni el detalle extra —
// lo justo para operar en vivo: zona, HUD/ENT, cómo venís hoy, últimos 10,
// eficiencia histórica de la celda, qué hacer. Un único acento lateral
// (el color de la zona actual) marca todo el bloque como una unidad.
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
  const luz = termoTotal < 3 ? '#5c687a' : ratio >= 0.7 ? '#00ff9d' : ratio >= 0.5 ? '#ffdf60' : '#ff1e38';
  // Contador general de la mesa (sesión completa) — Gunner: "me eliminaste
  // el contador general de docenas y columnas que tenian esas card y es
  // necesario visualizar rendimiento".
  const gHits = useMarketHits(mkt);
  const gMiss = useMarketMisses(mkt);
  const gMax = useMarketMaxStreak(mkt);
  const gTotal = gHits + gMiss;

  return (
    <div style={{ borderLeft: `3px solid ${st.color}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 800, letterSpacing: '0.2em', color: st.color, textShadow: `0 0 8px ${st.glow}` }}>
          {title}
        </span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: st.color, whiteSpace: 'nowrap' }}>
          {st.label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#cbd5e1' }}>
        HUD <b style={{ color: '#ffffff' }}>{hud ?? '—'}</b>
        {'  ·  '}
        ENT <b style={{ color: '#ffffff' }}>{ent ?? '—'}</b>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 11 }}>
        <span>
          <span style={{ color: '#00ff9d' }}>✓{gHits}</span>
          {' '}
          <span style={{ color: '#ff1e38' }}>✗{gMiss}</span>
        </span>
        <span style={{ color: '#8092b5', fontWeight: 800 }}>{gTotal ? `${Math.round((gHits / gTotal) * 100)}%` : '—'}</span>
      </div>
      {gMax >= 4 && (
        <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#ffdf60', marginTop: -2 }}>
          peor racha hoy: <b>{gMax}</b>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT_MONO, fontSize: 10.5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: luz, boxShadow: `0 0 6px ${luz}`, flexShrink: 0 }} />
        <span style={{ color: '#8092b5' }}>ÚLT. 10:</span>
        <b style={{ color: luz }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: '#cbd5e1' }}>
        {'eficiencia: '}
        {map ? (
          <>
            <b style={{ color: '#ffffff' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
            {' · techo '}
            <b style={{ color: map.maxRun >= 5 ? '#ff1e38' : '#ffffff' }}>{map.maxRun}</b>
            <span style={{ color: '#5c687a' }}>{' '}({map.n}g)</span>
          </>
        ) : (
          <span style={{ color: '#5c687a' }}>sin datos en esta casilla</span>
        )}
      </div>

      <div style={{ fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 800, color: st.color, marginTop: 1 }}>
        {INSTRUCCION[estado]}
      </div>
    </div>
  );
}
const MarketEfficiencyCell = memo(MarketEfficiencyCellImpl);

// ────────────────────────────────────────────────────────────────────────
// ZoneDetailGrid — el par DOCENAS/COLUMNAS suelto. `compact` cambia entre
// la versión completa (MarketColumn, uso original de MatrixPanel()) y la
// compacta (MarketEfficiencyCell, uso del Quantum Pilot) — mismo dato,
// cero cambios de lógica, solo dos presentaciones según el espacio real
// disponible.
// ────────────────────────────────────────────────────────────────────────

export function ZoneDetailGrid({ direction = 'row', compact = false }: { direction?: 'row' | 'column'; compact?: boolean }) {
  const Cell = compact ? MarketEfficiencyCell : MarketColumn;
  return (
    <div style={{ display: 'flex', flexDirection: direction, gap: compact ? 12 : 20 }}>
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
// independiente — se pueden ubicar en cualquier lugar del layout.
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
 *  juntas, así que no pasa.
 *
 *  v5: sin caja — antes era un polígono con fondo radial, franjas
 *  diagonales decorativas y un ícono SVG de escudo. Ahora es un acento
 *  lateral del color del nivel (verde/ámbar/rojo) + texto; el único glow
 *  real del panel va en el título de la decisión, que es lo único que
 *  debe "brillar". */
export function CopilotOrder() {
  const doc = useMarketRead('doc');
  const col = useMarketRead('col');
  const d = decidirPiloto(doc, col);

  const setCopSug = useSetCopSug();
  setCopSug(d.mercado);

  const color = d.nivel === 'ok' ? '#00ff9d' : d.nivel === 'precaucion' ? '#ffdf60' : '#ff1e38';
  const glow = d.nivel === 'ok' ? 'rgba(0,255,157,0.6)' : d.nivel === 'precaucion' ? 'rgba(255,223,96,0.5)' : 'rgba(255,30,56,0.6)';

  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color, letterSpacing: '0.25em', fontWeight: 800 }}>
        ● ESCUDO (CAPA 1+2) · ENTRADA SEGURA
      </span>

      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 23, fontWeight: 900, color: '#ffffff', letterSpacing: '0.03em', textShadow: `0 0 16px ${glow}`, lineHeight: 1 }}>
            {d.titulo}
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#cbd5e1' }}>{d.motivo}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Marcador ACIERTOS/ERRORES/EFECTIVIDAD/RACHA del escudo — réplica de toda
 *  la sesión vía decidirConEstado() (Capa 1 sola, estado puro, no se
 *  corrompe al recalcularse). Independiente de CopilotOrder.
 *
 *  v5: sin caja alrededor — ya era, de las piezas viejas, la que más se
 *  parecía a un instrumento real (fila de estadísticas con divisores finos
 *  verticales); se le sacó el borde/fondo/sombra exterior y el lavado de
 *  fondo por celda, dejando solo los divisores — que es justo la idea de
 *  "banda" de la crítica.
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
    <div style={{ display: 'flex', flexWrap: 'nowrap' }}>
      {[
        { k: 'ACIERTOS', v: copHits, c: '#00ff9d' },
        { k: 'ERRORES', v: copMisses, c: '#ff1e38' },
        { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#ffffff' },
        { k: 'RACHA AHORA', v: copLive, c: copLive >= 3 ? '#ff1e38' : copLive >= 1 ? '#ffdf60' : '#00ff9d' },
        { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ff1e38' : '#ffdf60' },
      ].map((s, i, arr) => (
        <div key={s.k} style={{
          flex: '1', padding: i === 0 ? '0 10px 0 0' : '0 10px',
          borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#8092b5', letterSpacing: '0.1em', fontWeight: 700 }}>{s.k}</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 900, color: s.c, marginTop: 3 }}>{s.v}</div>
        </div>
      ))}
    </div>
  );
}

/** Par de chips compactos con la zona ACTUAL de cada mercado (doc/col) —
 *  mismo useMarketRead()/fusedZone() que usa CopilotOrder, así nunca puede
 *  mostrar algo distinto de lo que el escudo está viendo en este momento.
 *  v5: sin pill de fondo — punto de color + texto, igual que el resto de
 *  los indicadores de estado de este archivo. */
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
          fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: 700, color: st.color,
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.color, boxShadow: `0 0 4px ${st.color}`, flexShrink: 0 }} />
        {label} {st.label}
      </span>
    );
  };

  return (
    <span style={{ display: 'inline-flex', gap: 10 }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 4, borderBottom: '1px solid rgba(0,229,255,0.15)', paddingBottom: 6 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#00e5ff', opacity: 0.9, letterSpacing: '0.25em', fontWeight: 700, textShadow: '0 0 10px rgba(0,229,255,0.6)' }}>
          CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9.5, fontWeight: 800, letterSpacing: '0.15em',
            color: '#64748b', cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: '1px solid transparent',
            padding: '2px 0',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ff1e38';
            e.currentTarget.style.borderBottomColor = 'rgba(255,30,56,0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.borderBottomColor = 'transparent';
          }}
        >
          ⟲ RESET MAPA
        </button>
      </div>

      {/* COPILOTO — la decisión de entrada segura, arriba de todo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
        <CopilotOrder />
        <CopilotScoreboard />
      </div>

      <ZoneDetailGrid />
    </div>
  );
}

export default MatrixPanel;
