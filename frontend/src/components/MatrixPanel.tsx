// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — MatrixPanel: centro de mando (v6 · instrument panel + micropaneles)
// ════════════════════════════════════════════════════════════════════════
//
// v5 (sep 2026) — REDISEÑO COMPLETO DEL LENGUAJE VISUAL. Crítica externa que
// Gunner trajo, resumida: dejar de pensar en "cards" (caja con borde+fondo+
// sombra+radio alrededor de cada dato) y pasar a un "instrument panel" —
// trading terminal / consola, no dashboard de SaaS. v5 interpretó eso como
// CERO contenedores — y Gunner lo probó en vivo y lo rechazó: "los textos
// son pequeños no es facil leer, no hay separacion clara, no hay cian flash
// no hay micropaneles".
//
// v6 (sep 2026) — CORRECCIÓN. La idea correcta no es "cero cajas", es UNA
// sola capa de contenedor por bloque lógico — un micropanel (borde cian/
// color-de-estado + fondo sutil + radio chico), nunca anidado dentro de
// otro micropanel. Reglas de v6:
//   - Cada bloque que el operador necesita leer como unidad (CopilotOrder,
//     CopilotScoreboard, cada celda DOCENAS/COLUMNAS) va en UN micropanel.
//     Un acento lateral (borderLeft) adentro de ese micropanel para marcar
//     un sub-bloque sigue estando bien — eso no es "caja dentro de caja",
//     es una línea, no un segundo contenedor con su propio fondo.
//   - Tamaños de fuente subidos en todo dato que se lee para operar — nada
//     de letra de 8-10px en datos accionables; eso queda solo para los
//     micro-labels de encabezado (ej. "HISTÓRICO DE ESTA CASILLA").
//   - El glow cian/color vuelve a estar presente en títulos y bordes de
//     micropanel, no solo en la decisión activa — es la identidad visual
//     de la app ("cian flash"), no un lujo a recortar.
//   - El color sigue indicando EVENTOS, no categorías: verde = favorable/
//     activo, ámbar = esperar, rojo = error/peligro, gris = neutro.
//   - Ninguna lógica de datos cambió: mismos hooks, mismas fórmulas, mismas
//     fuentes (telemetryStore, zoneMatrix, copilot). Esto sigue siendo una
//     reescritura de PRESENTACIÓN únicamente.
//
// (Histórico v4): el monolito `Copilot()` se partió en `CopilotOrder` y
// `CopilotScoreboard` para que QuantumPilot las ubique donde quiera sin
// duplicar el cálculo. `ZoneDetailGrid` expone el par de columnas de
// mercado (doc/col) — completo (`MarketColumn`) o compacto
// (`MarketEfficiencyCell`, para la columna angosta del Quantum Pilot).
//
// Lectura pura del store + la matriz. No decide ni bloquea al motor.
// ════════════════════════════════════════════════════════════════════════

import { memo, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud, useLastEnt,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useCellReg, useCellRec, useResetTelemetry,
  useTermoHits, useTermoTotal, useTermoStreak, useLiveDecision, type CellRec,
  useCopHits, useCopMisses, useCopWr, useCopLiveStreak, useCopStreak, useCopRachas, useCapa1Rachas, useEscudoRachas, useCopRachasUlt, useCapa1RachasUlt, useEscudoRachasUlt, useCalor, useTelemetryStore,
  // SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) — ver nota en CopilotOrder abajo.
  useLiveCapa1, useLiveEscudo,
  useCapa1Hits, useCapa1Misses, useCapa1Wr, useCapa1LiveStreak, useCapa1Streak,
  useEscudoHits, useEscudoMisses, useEscudoWr, useEscudoLiveStreak, useEscudoStreak,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats, labelByKey,
  fusedZone, fusedZoneByKey, liveDeviation, currentCellWr, currentCellMaxRun,
  type Zone, type Market,
} from '@/domain/zoneMatrix';
// decidirPiloto() = Capa 1, función pura de lectura.
//
// Historial de bugs reales encontrados en este cálculo (dejar las notas,
// ayudan a no repetir el mismo error dos veces):
//
// FIX #1 (oct 2026) — Gunner: "los errores tampoco salen en el contador del
// copiloto". CopilotScoreboard reconstruía el historial a mano con
// decidirConEstado() en vez de leer el marcador real. Se corrigió leyendo
// `copScore` directo del store.
//
// FIX #2 (oct 2026) — Gunner, con reproducción en vivo: "no está siguiendo
// la sugerencia principal". decidirPiloto() ya NO se llama desde acá
// (CopilotOrder, abajo): se mudó adentro de telemetryStore.ts → ingest()
// (ver la nota junto a computeMarketRead() ahí) porque calcularla en el
// render de este componente quedaba un giro desalineada del pick que de
// verdad se mandaba a puntuar. CopilotOrder ahora LEE la decisión ya
// calculada con `useLiveDecision()` — no la recalcula.
//
// REMOVIDO (oct 2026) — existió una Capa 2 ("escudo", reactiva, zonas de
// los últimos 7 giros) encima de esto. Gunner la probó en vivo y la dio de
// baja: "el escudo numero 2... no sirve". Se sacó por completo de
// copilot.ts — decidirPiloto() hoy es 1:1 con la Capa 1.
import type { MarketRead } from '@/domain/copilot';
import { leerCalor, resumenVolvio, CALOR_VENTANA, CALOR_VENTANA_DOS, CALOR_VUELTA, type LecturaCalor } from '@/domain/calor';

const FONT_HEAD = "'Rajdhani', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

// ── PALETA "GEASS / SHIKON" DIRECTA EN EL COMPONENTE ──
// v7 (oct 2026) — rediseño cockpit: Gunner pidió sacar el naranja/ámbar como
// acento en toda la app ("preferiría meter un blanco neón en vez de un
// naranja"). PROBE pasa de ámbar (#ffdf60) a blanco neón — mismo criterio
// que el nivel "precaución" de CopilotOrder, que usa esta misma semántica
// (esperar/no hay entrada sólida todavía). SANTUARIO/VERDE/TÓXICA/AGUJERO/
// NEUTRA quedan igual — no hubo pedido de tocarlos.
const STYLE: Record<Zone, { label: string; color: string; glow: string; dim: string }> = {
  SANTUARIO: { label: 'SANTUARIO', color: '#00ff9d', glow: 'rgba(0,255,157,0.85)', dim: 'rgba(0,255,157,0.15)' },
  VERDE:     { label: 'VERDE',     color: '#10e57b', glow: 'rgba(16,229,123,0.70)', dim: 'rgba(16,229,123,0.12)' },
  PROBE:     { label: 'PROBE',     color: '#f4f8ff', glow: 'rgba(244,248,255,0.55)', dim: 'rgba(244,248,255,0.12)' },
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

// Fondo de micropanel a partir de un color de acento — una sola capa,
// usado en todos los bloques de este archivo (CopilotOrder, Scoreboard,
// celdas de zona). `glow` opcional sube la intensidad del halo para el
// bloque que de verdad está "pasando ahora".
//
// v7 (oct 2026) — rediseño cockpit: se agrega backdrop-filter (blur real)
// para que el fondo semitransparente sea GLASSMORPHISM de verdad y no solo
// una capa oscura plana — pedido explícito de Gunner sobre el prototipo
// ("Profundidad con Paneles y Glassmorphism"). Cero cambio de lógica, es
// una propiedad CSS más en el mismo objeto de siempre.
function microPanel(accent: string, glowStrength = 0.14): React.CSSProperties {
  return {
    border: `1px solid ${accent}66`,
    background: 'rgba(10, 16, 28, 0.55)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 8,
    boxShadow: `0 0 16px ${accent}${Math.round(glowStrength * 255).toString(16).padStart(2, '0')}, inset 0 1px 0 ${accent}14`,
  };
}

// Versión "desnuda" del mismo bloque — sin borde/fondo/glow propio, solo el
// padding/estructura. Se usa cuando VARIOS bloques se agrupan dentro de UNA
// sola tarjeta exterior (p. ej. ZONA o MARCADOR en el cockpit de
// Quantumpilot.tsx) — así se evita anidar micropaneles ("caja dentro de
// caja"), que es justo lo que v6 corrigió. `tint` opcional pinta un lavado
// de fondo muy sutil para marcar el sub-bloque por tono en vez de con una
// línea divisoria.
function bareBlock(tint?: string): React.CSSProperties {
  return tint ? { background: tint } : {};
}

// ────────────────────────────────────────────────────────────────────────
// Celda visitada — fila simple con separador fino (vive DENTRO del
// micropanel de MarketColumn, así que se queda sin su propio contenedor).
// ────────────────────────────────────────────────────────────────────────

function VisitedRowImpl({ mkt, cKey, rec }: { mkt: Market; cKey: string; rec: CellRec }) {
  const estado = fusedZoneByKey(cKey, mkt, rec);
  const st = STYLE[estado];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, boxShadow: `0 0 6px ${st.color}`, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 800, color: st.color, letterSpacing: '0.06em' }}>
          {st.label}
        </span>
        <span style={{ fontSize: 10.5, color: '#7c8aa0', fontFamily: FONT_MONO }}>
          {rangeText(cKey)}
        </span>
      </span>
      <span style={{ fontSize: 11.5, color: '#cbd5e1', fontFamily: FONT_MONO }}>
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
// v6: UN micropanel para toda la celda (borde del color de zona + fondo +
// glow); adentro, acentos laterales siguen marcando "histórico" y "qué
// hacer" como sub-bloques — eso es una línea, no una segunda caja.
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
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, padding: '12px 13px', ...microPanel(st.color) }}>
      {/* título + estado actual */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `1px solid ${st.color}40`, paddingBottom: 6 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 800, letterSpacing: '0.2em', color: st.color, textShadow: `0 0 10px ${st.glow}` }}>
          {title}
        </span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', color: st.color, textShadow: `0 0 8px ${st.glow}` }}>
          {st.label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: '#ffffff' }}>
        HUD {hud ?? '—'} <span style={{ color: '#5c687a' }}>·</span> ENT {ent ?? '—'}
      </div>

      {/* últimos 10 giros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT_MONO, fontSize: 12.5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: luz, boxShadow: `0 0 7px ${luz}`, flexShrink: 0 }} />
        <span style={{ color: '#8092b5' }}>ÚLT. {termoTotal || 10}:</span>
        <b style={{ color: luz }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
        <span style={{ color: '#cbd5e1', fontSize: 11.5 }}>{termoTxt}</span>
        {termoStreak >= 2 && <span style={{ color: '#ff1e38', marginLeft: 'auto', fontWeight: 800 }}>{termoStreak} ✗</span>}
      </div>

      {/* cómo venís hoy (sesión completa) */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 13.5 }}>
        <span>
          <span style={{ color: '#00ff9d' }}>✓{gHits}</span>{' '}
          <span style={{ color: '#ff1e38' }}>✗{gMiss}</span>
          <span style={{ color: '#5c687a' }}> hoy</span>
        </span>
        <span style={{ color: '#8092b5', fontWeight: 800 }}>{gTotal ? `${((gHits / gTotal) * 100).toFixed(0)}%` : '—'}</span>
      </div>
      {/* racha actual / peor racha del MERCADO (sesión completa) — SIEMPRE
          visibles, no condicionadas a ningún umbral. Gunner, oct 2026:
          "eso lo omitiste y eso no lo podemos quitar de ahí" — antes estaban
          las dos metidas dentro de un `gMax >= 4`, así que por debajo de 4
          no se veía ninguna. No confundir con "racha ahora" de la CASILLA
          puntual (HOY EN ESTA CASILLA, más abajo) — esto es del mercado
          entero (doc o col) en toda la sesión. */}
      <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: '#cbd5e1', marginTop: -4 }}>
        racha actual: <b style={{ color: gCur >= 3 ? '#ff1e38' : gCur >= 1 ? '#ffdf60' : '#00ff9d' }}>{gCur}</b>
        {'  ·  '}
        peor racha hoy: <b style={{ color: gMax >= 4 ? '#ff1e38' : '#cbd5e1' }}>{gMax}</b>
      </div>

      {/* histórico de la celda — sub-bloque con acento lateral (línea, no
          una segunda caja) dentro del micropanel */}
      <div style={{ borderLeft: `3px solid ${st.color}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.15em', fontWeight: 700 }}>
          HISTÓRICO DE ESTA CASILLA
        </span>
        {map ? (
          <div style={{ fontSize: 13.5, color: '#cbd5e1', fontFamily: FONT_MONO }}>
            acierto <b style={{ color: '#ffffff' }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
            {'  ·  aguanta hasta '}
            <b style={{ color: map.maxRun >= 5 ? '#ff1e38' : '#ffffff' }}>{map.maxRun}</b>
            {' errores'}
            <span style={{ color: '#5c687a' }}>{'  '}({map.n} giros)</span>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: '#5c687a', fontFamily: FONT_MONO }}>sin datos en esta casilla</div>
        )}

        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.15em', fontWeight: 700, marginTop: 5 }}>
          HOY EN ESTA CASILLA
        </span>
        <div style={{ fontSize: 13.5, color: '#cbd5e1', fontFamily: FONT_MONO }}>
          <span style={{ color: '#00ff9d' }}>{live?.hits ?? 0} ✓</span>
          {'  '}
          <span style={{ color: '#ff1e38' }}>{live?.misses ?? 0} ✗</span>
          <span style={{ color: '#5c687a' }}>{'  ·  racha ahora '}</span>
          <b style={{ color: cur >= 3 ? '#ff1e38' : cur >= 1 ? '#ffdf60' : '#00ff9d' }}>{cur}</b>
          {techo > 0 && <span style={{ color: '#5c687a', fontSize: 12.5 }}>{'  '}/ techo {techo}</span>}
        </div>

        {anomalo && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#ff1e38', fontWeight: 800, marginTop: 2 }}>
            ⚠ igualaste/superaste el techo histórico — anómalo, considerá salir
          </div>
        )}
      </div>

      {/* qué hacer — sub-bloque con acento lateral */}
      <div style={{ borderLeft: `3px solid ${st.color}`, paddingLeft: 10 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.15em', fontWeight: 700 }}>QUÉ HACER</span>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 800, color: st.color, textShadow: `0 0 8px ${st.glow}` }}>{INSTRUCCION[estado]}</div>
      </div>

      {/* casillas visitadas */}
      {visited.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 2 }}>
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
// ZONA del Quantum Pilot (320px de ancho, apiladas doc/col). v6: también en
// UN micropanel propio (antes solo tenía el acento lateral, sin separación
// real del resto de la columna).
// ────────────────────────────────────────────────────────────────────────

function MarketEfficiencyCellImpl({ mkt, bare = false }: { mkt: Market; bare?: boolean }) {
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
  const gCur = useMarketStreak(mkt);
  const gTotal = gHits + gMiss;

  // v7 (oct 2026) — jerarquía tipográfica pedida por Gunner sobre el
  // prototipo: títulos/valores principales (HUD, ENT) en blanco bold, texto
  // secundario (labels "HUD"/"ENT", "últ. 10") en gris regular, y line-height
  // 1.4-1.5 en "QUÉ HACER" para que no se sienta aplastado en la columna
  // angosta. El color de estado (st.color) se mantiene en título/badge/
  // instrucción — es la señal de zona de toda la app, no algo a aplanar.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '13px 13px', ...(bare ? bareBlock() : microPanel(st.color)) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${st.color}35`, paddingBottom: 5 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 800, letterSpacing: '0.2em', color: '#ffffff', textShadow: `0 0 9px ${st.glow}` }}>
          {title}
        </span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 800, letterSpacing: '0.06em', color: st.color, whiteSpace: 'nowrap', textShadow: `0 0 7px ${st.glow}` }}>
          {st.label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: '#8392a8', fontWeight: 400 }}>
        HUD <b style={{ color: '#ffffff', fontWeight: 700 }}>{hud ?? '—'}</b>
        {'  ·  '}
        ENT <b style={{ color: '#ffffff', fontWeight: 700 }}>{ent ?? '—'}</b>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 14 }}>
        <span>
          <span style={{ color: '#00ff9d' }}>✓{gHits}</span>
          {' '}
          <span style={{ color: '#ff1e38' }}>✗{gMiss}</span>
        </span>
        <span style={{ color: '#8092b5', fontWeight: 800 }}>{gTotal ? `${Math.round((gHits / gTotal) * 100)}%` : '—'}</span>
      </div>
      {/* racha actual / peor racha del MERCADO — SIEMPRE visibles (Gunner,
          oct 2026: "eso lo omitiste y eso no lo podemos quitar de ahí").
          Antes esta versión compacta no tenía "racha actual" en ningún
          lado, y "peor racha" solo aparecía con gMax >= 4. */}
      <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#8392a8', marginTop: -2 }}>
        racha actual <b style={{ color: gCur >= 3 ? '#ff1e38' : gCur >= 1 ? '#f4f8ff' : '#00ff9d' }}>{gCur}</b>
        {'  ·  '}
        peor racha <b style={{ color: gMax >= 4 ? '#ff1e38' : '#f4f8ff' }}>{gMax}</b>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT_MONO, fontSize: 13 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: luz, boxShadow: `0 0 6px ${luz}`, flexShrink: 0 }} />
        <span style={{ color: '#8092b5', fontWeight: 400 }}>últ. 10:</span>
        <b style={{ color: luz }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: '#8392a8', fontWeight: 400 }}>
        {'eficiencia '}
        {map ? (
          <>
            <b style={{ color: '#ffffff', fontWeight: 700 }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
            {' · techo '}
            <b style={{ color: map.maxRun >= 5 ? '#ff1e38' : '#ffffff', fontWeight: 700 }}>{map.maxRun}</b>
            <span style={{ color: '#5c687a' }}>{' '}({map.n}g)</span>
          </>
        ) : (
          <span style={{ color: '#5c687a' }}>sin datos en esta casilla</span>
        )}
      </div>

      {/* FIX (oct 2026) — Gunner: "las celdas no están mostrando las rachas
          actual de aciertos y errores de la celda al día de hoy". Esta versión
          compacta (la de la columna ZONA) solo traía lo del MERCADO entero y lo
          HISTÓRICO de la casilla; lo de HOY en la casilla puntual (aciertos,
          errores, racha ahora y peor racha de esta HUD×ENT en la sesión) solo
          existía en la versión completa (MarketColumn). Mismo dato (`live`,
          que ya se leía arriba para el estado de zona) y mismo formato. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8092b5', letterSpacing: '0.12em', fontWeight: 700 }}>
          HOY EN ESTA CASILLA
        </span>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: '#8392a8' }}>
          <span style={{ color: '#00ff9d' }}>✓{live?.hits ?? 0}</span>
          {' '}
          <span style={{ color: '#ff1e38' }}>✗{live?.misses ?? 0}</span>
          {'  ·  racha '}
          <b style={{ color: (live?.streak ?? 0) >= 3 ? '#ff1e38' : (live?.streak ?? 0) >= 1 ? '#f4f8ff' : '#00ff9d' }}>{live?.streak ?? 0}</b>
          {'  ·  peor '}
          <b style={{ color: (live?.maxStreak ?? 0) >= 4 ? '#ff1e38' : '#f4f8ff' }}>{live?.maxStreak ?? 0}</b>
        </div>
      </div>

      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: st.color, marginTop: 1, lineHeight: 1.5, textShadow: `0 0 5px ${st.glow}` }}>
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

export function ZoneDetailGrid({
  direction = 'row',
  compact = false,
  grouped = false,
}: {
  direction?: 'row' | 'column';
  compact?: boolean;
  /** v7 (oct 2026): true → DOCENAS y COLUMNAS comparten UNA sola tarjeta
   *  glass (en vez de dos micropaneles separados), divididas por un lavado
   *  de fondo tonal — pedido explícito de Gunner sobre el prototipo
   *  ("envuelve ZONA en su propio contenedor"). Solo tiene efecto con
   *  compact=true; con la versión completa (MarketColumn, uso de
   *  MatrixPanel() standalone) se ignora — esas celdas son demasiado
   *  grandes para compartir tarjeta sin verse apretadas. */
  grouped?: boolean;
}) {
  if (compact && grouped) {
    return (
      <div style={{ display: 'flex', flexDirection: direction, ...microPanel('#5c687a', 0.06), padding: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1 }}>
          <MarketEfficiencyCell mkt="doc" bare />
        </div>
        <div style={{ width: direction === 'row' ? 1 : '100%', height: direction === 'row' ? '100%' : 1, background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)' }}>
          <MarketEfficiencyCell mkt="col" bare />
        </div>
      </div>
    );
  }
  const Cell = compact ? MarketEfficiencyCell : MarketColumn;
  return (
    <div style={{ display: 'flex', flexDirection: direction, gap: compact ? 12 : 16 }}>
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
// (el marcador ACIERTOS/ERRORES/EFECTIVIDAD/RACHA). Cada una es
// independiente — se pueden ubicar en cualquier lugar del layout.
// v7 (oct 2026): CopilotScoreboard dejó de recalcular el marcador a mano —
// ahora lee copScore directo del store, que ya lo mantiene correcto en
// vivo. Ver su propio comentario más abajo para el detalle del bug.
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

/** % de error NORMAL de cada marcador, medido en TODAS las sesiones guardadas
 *  (59 sesiones, 18.647 giros; pasadas giro a giro por este mismo store):
 *    D.A.N.N.A. real: 34,89% de error en 18.122 giros puntuados
 *    Capa 1:          33,48% de error en 14.079
 *    Escudo:          34,90% de error en 16.909
 *  De acá sale el "normal" de cada "cada X giros": 1 / ((1-q)² · qᴸ) para una
 *  racha de largo L. AUDITADO (oct 2026): esa fórmula con estos q cae pegada a
 *  lo que de verdad pasó en las 59 sesiones (1 error cada ~6,8 · 2 seguidos
 *  cada ~19 · 3 cada ~55 · 4 cada ~170 giros), así que "normal" ya es dato real.
 *  El Escudo traía 0,22 — era de cuando su marcador contaba la cobertura doble
 *  como acierto si ganaba CUALQUIERA de los dos mercados (4 zonas). Desde que
 *  puntúa solo el mercado de la ▲ PRIORIDAD su error real es 34,9%, y con 0,22
 *  el "normal" salía absurdo (4 seguidos "normal 702", 7 seguidos "normal
 *  65895"). Se afina cuando entren sesiones nuevas. */
const ERR_NORMAL = { real: 0.3489, capa1: 0.3348, escudo: 0.349 };

/** FRECUENCIA DE RACHAS EN VIVO (oct 2026) — pedido de Gunner: "que me diga
 *  el copiloto, el motor, el escudo viene cometiendo un error cada X giros,
 *  dos errores cada tanto". Para UN marcador (real, Capa 1 o Escudo 1) muestra,
 *  por cada largo de racha (1 error, 2 seguidos, 3 … 10), CADA CUÁNTOS GIROS se
 *  repite: giros puntuados de ese marcador ÷ veces que pasó esa racha.
 *  Solo lectura — no cambia ninguna decisión ni el freno.
 *
 *  FIX (oct 2026) — Gunner: "llegué a racha de 4 y no sale nada". La tabla solo
 *  contaba rachas CERRADAS (una racha se cierra cuando llega un acierto), así
 *  que una racha de 4 en curso no aparecía hasta terminar — justo la que más
 *  importa. Ahora la racha en curso cuenta desde el momento en que ocurre (fila
 *  marcada "ahora") y, si crece, pasa a la fila siguiente. Filas 1 a 4 siempre
 *  visibles (4 es el tope que Gunner quiere no pasar); 5 a 10 aparecen cuando
 *  ya pasaron o están pasando (10 = "10 o más").
 *
 *  "voy" = en qué giro va: cuántos giros puntuados de este marcador pasaron
 *  desde la última vez que ocurrió esa racha (o desde que empezó la sesión, si
 *  hoy no ha pasado). Informa; no predice — las rachas son independientes. */
function RachasFrecuencia({ rachas, ult, live, scored, titulo, q }: {
  rachas: number[]; ult: number[]; live: number; scored: number; titulo: string; q: number;
}) {
  const MAX_LEN = 10;
  const liveLen = Math.min(live, MAX_LEN);
  const filas: { len: number; c: number; enCurso: boolean }[] = [];
  for (let len = 1; len <= MAX_LEN; len++) {
    const enCurso = live > 0 && liveLen === len;
    const c = (rachas[len] ?? 0) + (enCurso ? 1 : 0);   // cerradas + la que está en curso
    if (len > 4 && c === 0) continue;
    filas.push({ len, c, enCurso });
  }
  // FIX (oct 2026) — Gunner: "los errores seguidos están cortados en la tercera
  // columna". Cada racha era UN texto largo con nowrap en una columna de ~200px
  // útiles y el contenedor recortaba el "normal" y la flecha. Ahora es TABLA de
  // columnas fijas (racha · cada · normal · voy), con encabezado.
  const H: React.CSSProperties = { fontSize: 9.5, color: '#7d8aa0', textAlign: 'right' };
  return (
    <div style={{ marginTop: 5 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: '#b4c0da', letterSpacing: '0.1em', fontWeight: 800 }}>
        {titulo}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 38px 38px 36px', columnGap: 5, rowGap: 1, maxWidth: 290, marginTop: 3, fontFamily: FONT_MONO, fontSize: 11.5 }}>
        <span style={{ fontSize: 9.5, color: '#7d8aa0' }}>racha</span>
        <span style={H} title="cada cuántos giros pasa hoy">cada</span>
        <span style={H} title="cada cuántos giros pasa en promedio en todas las sesiones guardadas">normal</span>
        <span style={H} title="giros que lleva desde la última vez que pasó (o desde que empezó la sesión si hoy no ha pasado)">voy</span>
        {filas.map(({ len, c, enCurso }) => {
          const cada = c > 0 ? Math.max(1, Math.round(scored / c)) : null;
          // "Normal" = cada cuántos giros pasa esa racha en las sesiones guardadas
          // (a partir del % de error de esta capa: ERR_NORMAL). Solo se marca
          // más seguido / más espaciado con ≥80 giros puntuados y ≥2 veces (antes es ruido).
          const normal = len >= MAX_LEN ? null : Math.round(1 / (Math.pow(1 - q, 2) * Math.pow(q, len)));
          const confiable = scored >= 80 && c >= 2;
          const masSeguido = cada !== null && normal !== null && confiable && cada < normal * 0.7;
          const masEspaciado = cada !== null && normal !== null && confiable && cada > normal * 1.5;
          const sinDatos = c === 0;
          const color = sinDatos ? '#6b778c' : len >= 4 ? '#ff1e38' : len === 3 ? '#f4f8ff' : '#b4c0d4';
          const colorCada = masSeguido ? '#ff9f1a' : masEspaciado ? '#00ff9d' : (len >= 4 ? '#ff1e38' : '#ffffff');
          // voy: giros desde la última vez (o desde el inicio si no ha pasado hoy)
          const voy = enCurso ? 0 : c > 0 ? Math.max(0, scored - (ult[len] ?? 0)) : scored;
          const ref = cada ?? normal;
          const voyColor = enCurso ? '#ff1e38' : ref !== null && voy >= ref ? '#ffdf60' : '#cbd5e1';
          return (
            <Fragment key={len}>
              <span style={{ color, whiteSpace: 'nowrap' }}>
                {len === 1 ? '1 error' : len >= MAX_LEN ? '10+ seg.' : `${len} seguidos`}
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {cada !== null ? <b style={{ color: colorCada }}>{cada}</b> : <span style={{ color: '#6b778c' }}>—</span>}
                {(masSeguido || masEspaciado) && (
                  <span
                    style={{ color: masSeguido ? '#ff9f1a' : '#00ff9d' }}
                    title={masSeguido ? 'pasa más seguido de lo normal' : 'pasa más espaciado de lo normal'}
                  >
                    {masSeguido ? '▲' : '▼'}
                  </span>
                )}
              </span>
              <span style={{ opacity: 0.75, textAlign: 'right' }}>{normal !== null ? normal : '—'}</span>
              <span
                style={{ textAlign: 'right', color: voyColor, fontWeight: enCurso ? 800 : 400, whiteSpace: 'nowrap' }}
                title={enCurso ? 'racha en curso: todavía no cerró' : sinDatos ? 'giros desde que empezó la sesión sin que pase' : 'giros desde la última vez que pasó'}
              >
                {enCurso ? 'ahora' : voy}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** CALOR RECIENTE (oct 2026) — pedido de Gunner, operación en vivo: "hay
 *  sesiones en las que se calentaron dos docenas, dos columnas, una docena,
 *  una columna, un color... puede durar 5, 7, 10 giros". Lee SOLO los últimos
 *  7 giros (domain/calor.ts) y muestra, por mercado, qué viene caliente, qué
 *  se está enfriando y cuánto. Solo lectura: describe lo que viene saliendo,
 *  no cambia ninguna decisión ni el freno. */
function CalorReciente() {
  const calor = useCalor();
  const lecturas: LecturaCalor[] = leerCalor(calor);
  const volvio = resumenVolvio(calor);
  const COLOR_CALIENTE = '#ff9f1a';   // ámbar vivo
  const COLOR_ENFRIA = '#7fb3d5';     // azul hielo
  const COLOR_FIN = '#ff5d73';        // rosa rojizo — el sesgo terminó
  return (
    <div style={{ marginTop: 6 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.12em', fontWeight: 700 }}>
        CALOR RECIENTE · lo que viene saliendo (últimos {CALOR_VENTANA}-{CALOR_VENTANA_DOS})
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
        {lecturas.map((l, i) => {
          const caliente = l.estado === 'CALIENTE';
          const enfria = l.estado === 'ENFRIANDO';
          const termino = l.estado === 'TERMINO';
          const corto = l.estado === 'CORTO';   // terminó antes de 4 giros: no llegó a ser calor
          const c = caliente ? COLOR_CALIENTE : enfria ? COLOR_ENFRIA : termino ? COLOR_FIN : corto ? '#6b7a90' : '#5c687a';
          return (
            <div key={l.mercado} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: i < lecturas.length - 1 ? '1px solid rgba(255,255,255,0.055)' : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: caliente ? `0 0 6px ${c}` : 'none' }} />
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#8092b5', letterSpacing: '0.1em' }}>{l.mercado}</span>
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: c, textAlign: 'right' }}>
                {l.estado === 'JUNTANDO' ? `juntando giros ${l.detalle}`
                  : l.estado === 'NORMAL' ? '—'
                  : <>
                      {caliente ? '🔥 ' : enfria ? '❄ ' : corto ? '○ ' : '✖ '}{l.zonas.join(' + ')}
                      <span style={{ opacity: 0.8, fontWeight: 400 }}>
                        {' · '}{termino ? 'TERMINÓ' : enfria ? 'enfriando' : ''}{termino || enfria ? ' · ' : ''}{l.detalle}
                      </span>
                    </>}
              </span>
            </div>
          );
        })}
      </div>
      {/* ¿VOLVIÓ EL CALOR? — pedido de Gunner: "si sale 2 o 3 giros después
          (máximo 3) y cuántas veces sucede eso en la sesión". Cada vez que
          nace un calor se miran los siguientes 3 giros; si la zona caliente
          (o alguna de las dos) salió al menos una vez, "volvió". Tanteador de
          LA SESIÓN, por mercado (1 zona / 2 zonas). Referencia de azar al lado
          para leerlo bien: una zona suelta sale en ≤3 giros ~7 de cada 10 aunque
          no pase nada raro; con 2 zonas, casi siempre. */}
      <div style={{ marginTop: 5 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.12em', fontWeight: 700 }}>
          ¿VOLVIÓ EN ≤{CALOR_VUELTA} GIROS? hoy · por azar vuelven ~7 de 10 (1 zona docena/col.), ~9 de 10 (2 zonas) y ~8-9 de 10 (color/rango/paridad)
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 2 }}>
          {volvio.every((v) => v.uno.n === 0 && v.dos.n === 0) ? (
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#5c687a' }}>— todavía sin calores resueltos</span>
          ) : volvio.map((v) => (
            <span key={v.mercado} style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#8a97ab', whiteSpace: 'nowrap' }}>
              {v.mercado}{' '}
              <b style={{ color: '#ffffff' }}>{v.uno.n ? `${v.uno.vol}/${v.uno.n}` : '—'}</b>
              {(v.mercado === 'DOCENAS' || v.mercado === 'COLUMNAS') && (
                <span style={{ opacity: 0.8 }}> · 2 zonas <b style={{ color: '#ffffff' }}>{v.dos.n ? `${v.dos.vol}/${v.dos.n}` : '—'}</b></span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Header + orden del copiloto ("ENTRADA SEGURA").
 *
 *  FIX (oct 2026) — BUG REAL reportado por Gunner y reproducido en vivo:
 *  "el copiloto sugiere algo pero sus contadores están mal... no está
 *  siguiendo la sugerencia principal". Causa: este componente calculaba la
 *  decisión con useMarketRead() (doc/col) + decidirPiloto() EN SU PROPIO
 *  RENDER, y después la escribía a un ref a nivel módulo para que el store
 *  la leyera al puntuar. Pero ese render ocurre ANTES de que el giro que
 *  acaba de llegar se ingiera al store (el ingest corre en un useEffect de
 *  AppPage.tsx, después del commit) — así que la decisión podía quedar un
 *  giro más vieja que el pick que de verdad se mandó a puntuar, y lo que se
 *  veía en pantalla no coincidía con lo que se contaba.
 *
 *  Fix: la decisión ahora se calcula UNA sola vez, adentro de
 *  telemetryStore.ts → ingest() (ver su nota junto a computeMarketRead()),
 *  justo después de actualizar el historial — y acá se LEE con
 *  useLiveDecision() en vez de recalcularse. Lo que este componente muestra
 *  y lo que el marcador cuenta son ahora, literalmente, el mismo dato. */
export function CopilotOrder({
  hero = false,
  bare = false,
}: {
  /** v7 (oct 2026): true → tratamiento "héroe" (título grande, el elemento
   *  dominante del cockpit) — pedido explícito de Gunner sobre el
   *  prototipo ("el panel central de ESPERÁ"). false = tamaño de siempre,
   *  usado por MatrixPanel() standalone, sin tocar ese layout. */
  hero?: boolean;
  /** true → sin micropanel propio (lo pone el contenedor padre, para que
   *  DECISIÓN sea UNA sola tarjeta en vez de anidar cajas) */
  bare?: boolean;
}) {
  const d = useLiveDecision();

  // ── SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) ────────────────────────────────
  // Pedido de Gunner: ver la sugerencia y la efectividad de cada capa por su
  // cuenta, en la MISMA card, sin que una tape a la otra cuando COBERTURA
  // está activa. Lo de arriba (d.titulo/d.motivo/d.nivel) sigue siendo la
  // decisión REAL combinada — lo que de verdad se juega — sin tocar. Esto
  // es solo lectura extra, debajo, en dos sub-bloques con acento lateral
  // (no son micropaneles nuevos, es la regla v6 de "una línea adentro del
  // mismo contenedor").
  const capa1 = useLiveCapa1();
  const escudo = useLiveEscudo();
  const capa1Hits = useCapa1Hits(), capa1Misses = useCapa1Misses(), capa1Wr = useCapa1Wr();
  const capa1Live = useCapa1LiveStreak(), capa1Peor = useCapa1Streak();
  const escudoHits = useEscudoHits(), escudoMisses = useEscudoMisses(), escudoWr = useEscudoWr();
  const escudoLive = useEscudoLiveStreak(), escudoPeor = useEscudoStreak();
  const capa1Rachas = useCapa1Rachas(), escudoRachas = useEscudoRachas();
  const capa1Ult = useCapa1RachasUlt(), escudoUlt = useEscudoRachasUlt();

  // v7: "precaución" pasa de ámbar a blanco neón — Gunner: "preferiría
  // meter un blanco neón en vez de un naranja". ok/peligro quedan iguales.
  const color = d.nivel === 'ok' ? '#00ff9d' : d.nivel === 'precaucion' ? '#f4f8ff' : '#ff1e38';
  const glow = d.nivel === 'ok' ? 'rgba(0,255,157,0.6)' : d.nivel === 'precaucion' ? 'rgba(244,248,255,0.55)' : 'rgba(255,30,56,0.6)';
  // CAPA 1 / ESCUDO 1 (oct 2026) — Gunner: "que los hiciera diferenciar más
  // fácil, podrían ser un azul neón y un violeta neón". Color de IDENTIDAD
  // fijo por bloque (no por estado/nivel) — así siempre se reconoce cuál es
  // cuál de un vistazo, sea lo que sea que estén diciendo en ese momento.
  const colorCapa1 = '#2f8cff';   // azul neón — Capa 1 · Copiloto
  const colorEscudo = escudo.activo ? '#b026ff' : '#5e3380'; // violeta neón — Escudo 1 · Cobertura (apagado si no hay nada activo)

  // Tamaños ÚNICOS para los dos bloques (Capa 1 y Escudo 1) — antes cada uno
  // tenía su propio tamaño y no se leían parejos. Todo sale de acá.
  const FS_LABEL = hero ? 12 : 11.5;   // título del bloque
  const FS_FILA = hero ? 12 : 11.5;    // DOCENAS / COLUMNAS
  const FS_PICK = hero ? 18 : 16;    // zonas a jugar
  const FS_TXT = hero ? 12 : 11.5;     // motivo
  const FS_STAT = hero ? 12.5 : 12;    // aciertos / errores / efectividad / rachas
  const COL_ETQ = '#b4c0da';         // etiquetas (antes #8092b5, muy tenue)

  // Zonas que el motor trae para cada mercado (las mismas que ya se puntúan
  // contra Capa 1: pending.docPick / colPick). Solo lectura.
  const pend = useTelemetryStore((st) => st.pending);

  // Fila de estadísticas — con las palabras completas (efectividad, errores…).
  const miniStats = (hits: number, misses: number, wr: number | null, live: number, peor: number) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 5 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_STAT, color: COL_ETQ }}>
        aciertos <b style={{ color: '#00ff9d' }}>{hits}</b>
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_STAT, color: COL_ETQ }}>
        errores <b style={{ color: '#ff5d73' }}>{misses}</b>
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_STAT, color: COL_ETQ }}>
        efectividad <b style={{ color: '#ffffff' }}>{wr !== null ? `${wr.toFixed(0)}%` : '—'}</b>
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_STAT, color: COL_ETQ }}>
        racha <b style={{ color: live >= 3 ? '#ff5d73' : live >= 1 ? '#f4f8ff' : '#00ff9d' }}>{live}</b>
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_STAT, color: COL_ETQ }}>
        peor racha <b style={{ color: peor >= 4 ? '#ff5d73' : '#e2e8f0' }}>{peor}</b>
      </span>
    </div>
  );

  // Fila DOCENAS / COLUMNAS — idéntica en Capa 1 y en Escudo 1.
  const filaZona = (label: string, zonas: string | null, acento: string, borde: boolean, prioridad = false) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '3px 0', borderBottom: borde ? '1px solid rgba(255,255,255,0.055)' : 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: zonas ? acento : '#3a4150', boxShadow: zonas ? `0 0 6px ${acento}` : 'none' }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: FS_FILA, color: COL_ETQ, letterSpacing: '0.08em' }}>{label}</span>
        {prioridad && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 800, color: '#ffb300', letterSpacing: '0.08em', textShadow: '0 0 8px rgba(255,179,0,0.7)' }}>
            ▲ PRIORIDAD
          </span>
        )}
      </span>
      <span style={{ fontFamily: FONT_HEAD, fontSize: FS_PICK, fontWeight: 900, color: zonas ? acento : '#6b778c', textAlign: 'right', lineHeight: 1.2 }}>
        {zonas ?? '—'}
      </span>
    </div>
  );

  // Encabezado de bloque: nombre a la izquierda, estado a la derecha.
  const encabezado = (nombre: string, acento: string, estado: string, estadoColor: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_LABEL, color: acento, letterSpacing: '0.16em', fontWeight: 800 }}>
        {nombre}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: FS_LABEL - 1, fontWeight: 800, color: estadoColor, letterSpacing: '0.08em', border: `1px solid ${estadoColor}66`, borderRadius: 4, padding: '1px 7px' }}>
        {estado}
      </span>
    </div>
  );

  // ── Capa 1: qué sugiere (mercado + zonas) ──
  const capa1Entra = capa1.mercado !== null && (capa1.accion === 'ENTRAR' || capa1.accion === 'SUAVE');
  const capa1Doc = capa1Entra && capa1.mercado === 'doc' ? (pend?.docPick || null) : null;
  const capa1Col = capa1Entra && capa1.mercado === 'col' ? (pend?.colPick || null) : null;
  const capa1Estado = capa1.accion === 'ENTRAR' ? 'ENTRA' : capa1.accion === 'SUAVE' ? 'ENTRA SUAVE' : capa1.accion === 'ESPERAR' ? 'ESPERA' : 'PARA';
  const capa1EstadoColor = capa1Entra ? colorCapa1 : capa1.accion === 'PARAR' ? '#ff5d73' : '#aab4c6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: hero ? 9 : 6, padding: hero ? '4px 2px' : '12px 14px', ...(bare ? bareBlock() : microPanel(color, 0.18)) }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: hero ? 12 : 10.5, color, letterSpacing: '0.25em', fontWeight: 800, textShadow: `0 0 8px ${glow}` }}>
        ● D.A.N.N.A. · ENTRADA SEGURA
      </span>

      {/* ── CAPA 1 y ESCUDO 1: dos bloques con EXACTAMENTE el mismo formato
          (encabezado + DOCENAS/COLUMNAS + motivo + estadísticas + errores
          seguidos), mismos tamaños. Lo de arriba es lo que se juega; esto es
          lo que sugiere cada capa por su cuenta. ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: hero ? 12 : 9 }}>
        <AnimatePresence mode="wait">
          <motion.div key={`${capa1.titulo}-${capa1Doc}-${capa1Col}`}
            initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ borderLeft: `2px solid ${colorCapa1}`, paddingLeft: 10 }}>
            {encabezado('CAPA 1 · COPILOTO', colorCapa1, capa1Estado, capa1EstadoColor)}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
              {filaZona('DOCENAS', capa1Doc, colorCapa1, true)}
              {filaZona('COLUMNAS', capa1Col, colorCapa1, false)}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: FS_TXT, color: '#aab4c6', marginTop: 3, lineHeight: 1.35 }}>
              {capa1.motivo}
            </div>
            {miniStats(capa1Hits, capa1Misses, capa1Wr, capa1Live, capa1Peor)}
            <RachasFrecuencia rachas={capa1Rachas} ult={capa1Ult} live={capa1Live} scored={capa1Hits + capa1Misses} titulo="ERRORES SEGUIDOS · CAPA 1" q={ERR_NORMAL.capa1} />
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div key={`${escudo.activo}-${escudo.doc?.zonas.join()}-${escudo.col?.zonas.join()}`}
            initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ borderLeft: `2px solid ${colorEscudo}`, paddingLeft: 10 }}>
            {encabezado('ESCUDO 1 · COBERTURA', colorEscudo, escudo.activo ? 'CUBRE' : 'SIN COBERTURA', escudo.activo ? '#b026ff' : '#aab4c6')}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
              {(['doc', 'col'] as const).map((mkt, i) => {
                const info = mkt === 'doc' ? escudo.doc : escudo.col;
                const esPrioridad = d.capa === 'COBERTURA_DOBLE' && d.principal === mkt;
                return (
                  <div key={mkt}>
                    {filaZona(mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS', info ? info.zonas.join(' / ') : null, colorEscudo, i === 0, esPrioridad)}
                  </div>
                );
              })}
            </div>
            {/* oct 2026 — se quitó el texto "Distribución marcada en …" (d.motivo)
                de este bloque: Gunner, "no es útil". */}
            {miniStats(escudoHits, escudoMisses, escudoWr, escudoLive, escudoPeor)}
            <RachasFrecuencia rachas={escudoRachas} ult={escudoUlt} live={escudoLive} scored={escudoHits + escudoMisses} titulo="ERRORES SEGUIDOS · ESCUDO" q={ERR_NORMAL.escudo} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** JUEGA ESTO — una sola línea, chica, arriba del marcador (tercera columna):
 *  qué se juega de verdad ahora. ESCUDO si está cubriendo; si no, CAPA 1; o
 *  nada si hay que esperar. Es la misma decisión real (liveDecision) que ya
 *  puntúa el marcador — acá solo se muestra, con las zonas. Solo lectura. */
function JuegaEsto() {
  const d = useLiveDecision();
  const pend = useTelemetryStore((st) => st.pending);
  const juegaEscudo = d.capa !== 'CAPA1';
  const juegaCapa1 = !juegaEscudo && d.mercado !== null && (d.accion === 'ENTRAR' || d.accion === 'SUAVE');
  const colorJuega = juegaEscudo ? '#b026ff' : juegaCapa1 ? '#2f8cff' : '#cbd5e1';
  const nombre = juegaEscudo ? 'ESCUDO' : juegaCapa1 ? 'CAPA 1' : null;
  let texto = 'NO APUESTES · ESPERA';
  if (juegaEscudo) {
    const partes: { t: string; pri: boolean }[] = [];
    if (d.pickDoc) partes.push({ t: `DOCENAS ${d.pickDoc}`, pri: d.capa === 'COBERTURA_DOBLE' && d.principal === 'doc' });
    if (d.pickCol) partes.push({ t: `COLUMNAS ${d.pickCol}`, pri: d.capa === 'COBERTURA_DOBLE' && d.principal === 'col' });
    partes.sort((x, y) => Number(y.pri) - Number(x.pri));
    texto = partes.map((x) => (x.pri ? `▲ ${x.t}` : x.t)).join('  ·  ');
  } else if (juegaCapa1) {
    const z = d.mercado === 'doc' ? pend?.docPick : pend?.colPick;
    texto = `${d.mercado === 'doc' ? 'DOCENAS' : 'COLUMNAS'}${z ? ` ${z}` : ''}`;
  }
  const expo = d.exposicion === 'REDUCIDA' ? 'progresión suave' : d.exposicion === 'MÍNIMA' ? 'ficha mínima' : '';
  return (
    <div style={{ border: `1px solid ${colorJuega}77`, background: `${colorJuega}12`, borderRadius: 6, padding: '5px 8px' }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.12em', fontWeight: 800, color: '#cbd5e1' }}>
        JUEGA ESTO{nombre ? <span style={{ color: colorJuega }}> · {nombre}{expo ? ` · ${expo}` : ''}</span> : null}
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 900, color: colorJuega, lineHeight: 1.2, marginTop: 1 }}>
        {texto}
      </div>
    </div>
  );
}

/** Marcador ACIERTOS/ERRORES/EFECTIVIDAD/RACHA del copiloto.
 *
 *  v6: UN micropanel (borde cian + fondo + glow) — v5 lo había dejado como
 *  fila suelta y Gunner la reclamó sin separación del resto.
 *
 *  FIX (oct 2026) — bug real reportado por Gunner: "los errores tampoco
 *  salen en el contador del copiloto". Causa: este componente recalculaba
 *  TODO el historial a mano llamando a decidirConEstado(), en vez de leer
 *  el contador real. El store (telemetryStore.ts) YA lleva el contador
 *  correcto en vivo: `copScore`, incrementado una vez por giro resuelto
 *  dentro de ingest() (ver su nota junto a computeMarketRead()), así que
 *  nunca queda un giro desalineado del pick que se puntúa. Esta pieza solo
 *  lee `copScore` — cero lógica nueva, cero replay. */
export function CopilotScoreboard({ bare = false }: { bare?: boolean } = {}) {
  const copHits = useCopHits();
  const copMisses = useCopMisses();
  const copWr = useCopWr();
  const copLive = useCopLiveStreak();
  const copStreak = useCopStreak(); // peor racha de la sesión (maxStreak)
  const copRachas = useCopRachas(); // frecuencia de rachas cerradas hoy (idx = largo, 10 = 10+)
  const copUlt = useCopRachasUlt(); // giro en que pasó por última vez cada largo

  // v7 (oct 2026): glow reservado para lo crítico/accionable (ACIERTOS,
  // ERRORES, RACHA AHORA — lo que está pasando ahora mismo), apagado en lo
  // descriptivo/histórico (EFECTIVIDAD es un cálculo, PEOR RACHA es un
  // récord pasado) — pedido explícito de Gunner sobre el prototipo.
  const STATS = [
    { k: 'ACIERTOS', v: copHits, c: '#00ff9d', glow: true },
    { k: 'ERRORES', v: copMisses, c: '#ff1e38', glow: true },
    { k: 'EFECTIVIDAD', v: copWr !== null ? `${copWr.toFixed(0)}%` : '—', c: '#ffffff', glow: false },
    { k: 'RACHA AHORA', v: copLive, c: copLive >= 3 ? '#ff1e38' : copLive >= 1 ? '#f4f8ff' : '#00ff9d', glow: true },
    { k: 'PEOR RACHA', v: copStreak, c: copStreak >= 4 ? '#ff1e38' : '#cbd5e1', glow: false },
  ];

  // FIX (oct 2026) — Gunner: "esta cortado". `flexWrap: 'nowrap'` + 5 stats
  // en una sola fila asumía una columna ancha; en el rail angosto del
  // cockpit (280px) RACHA AHORA/PEOR RACHA no entraban y el contenedor
  // nuevo (con overflow:hidden, por las esquinas redondeadas de la tarjeta
  // glass) las cortaba a la mitad en vez de solo apretarlas. Pasa a grid
  // con auto-fit: nunca desborda, envuelve a 2 filas (3+2) cuando el ancho
  // no alcanza, sin tocar ningún dato ni cálculo.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(68px, 1fr))', gap: '10px 4px', padding: '10px 8px', ...(bare ? bareBlock() : microPanel('#22d3ee', 0.1)) }}>
      <div style={{ gridColumn: '1 / -1', padding: '0 6px' }}>
        <JuegaEsto />
      </div>
      {STATS.map((s) => (
        <div key={s.k} style={{ padding: '0 6px', minWidth: 0 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#b4c0da', letterSpacing: '0.08em', fontWeight: 800, whiteSpace: 'nowrap' }}>{s.k}</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 23, fontWeight: 900, color: s.c, marginTop: 3, textShadow: s.glow ? `0 0 8px ${s.c}80` : 'none' }}>{s.v}</div>
        </div>
      ))}
      {/* FRECUENCIA DE RACHAS del marcador REAL (lo que D.A.N.N.A. de verdad
          jugó) — mismo formato que en CAPA 1 y ESCUDO 1, ver RachasFrecuencia. */}
      <div style={{ gridColumn: '1 / -1', padding: '2px 6px 0' }}>
        <RachasFrecuencia rachas={copRachas} ult={copUlt} live={copLive} scored={copHits + copMisses} titulo="ERRORES SEGUIDOS · D.A.N.N.A." q={ERR_NORMAL.real} />
      </div>
      <div style={{ gridColumn: '1 / -1', padding: '2px 6px 0' }}>
        <CalorReciente />
      </div>
    </div>
  );
}

/** Par de chips con la zona ACTUAL de cada mercado (doc/col) — mismo
 *  useMarketRead()/fusedZone() que usa internamente ingest() en
 *  telemetryStore.ts (vía computeMarketRead(), misma fórmula exacta) para
 *  calcular la decisión del piloto, así nunca puede mostrar algo distinto
 *  de lo que el copiloto está viendo en este momento.
 *  v6: vuelven a ser micro-chips con borde + fondo (pedido explícito de
 *  Gunner: "no hay micropaneles") — livianos, una sola capa, sin el pill
 *  pesado de las versiones viejas. */
export function ZoneQuickBadges() {
  const doc = useMarketRead('doc');
  const col = useMarketRead('col');

  const chip = (label: string, read: MarketRead) => {
    const st = STYLE[read.estado];
    return (
      <span
        key={label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 700, color: st.color,
          padding: '3px 8px',
          border: `1px solid ${st.color}55`,
          borderRadius: 5,
          background: `${st.color}14`,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, boxShadow: `0 0 5px ${st.color}`, flexShrink: 0 }} />
        {label} {st.label}
      </span>
    );
  };

  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 4, borderBottom: '1px solid rgba(34,211,238,0.25)', paddingBottom: 7 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#22d3ee', letterSpacing: '0.25em', fontWeight: 700, textShadow: '0 0 12px rgba(34,211,238,0.7)' }}>
          CENTRO DE MANDO · MATRIZ HUD × ENTROPÍA
        </span>
        <button
          onClick={handleReset}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.15em',
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CopilotOrder />
        <CopilotScoreboard />
      </div>

      <ZoneDetailGrid />
    </div>
  );
}

export default MatrixPanel;
