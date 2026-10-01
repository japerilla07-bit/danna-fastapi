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

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLastHud, useLastEnt,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useCellReg, useCellRec, useResetTelemetry,
  useTermoHits, useTermoTotal, useTermoStreak, useSetCopSug, type CellRec,
  useCopHits, useCopMisses, useCopWr, useCopLiveStreak, useCopStreak,
} from '@/store/telemetryStore';
import {
  cellKeyOf, cellStats, labelByKey,
  fusedZone, fusedZoneByKey, liveDeviation, currentCellWr, currentCellMaxRun,
  type Zone, type Market,
} from '@/domain/zoneMatrix';
// decidirPiloto() = Capa 1 + Capa 2 (el escudo), función pura de lectura —
// es la que manda en la ORDEN en vivo (CopilotOrder, abajo).
//
// FIX (oct 2026) — Gunner: "los errores tampoco salen en el contador del
// copiloto... ni normal ni con escudo". decidirConEstado() (Capa 1 SOLA) ya
// NO se usa en este archivo: CopilotScoreboard la usaba para reconstruir
// todo el historial a mano, lo que SOLO replicaba Capa 1 — cuando el escudo
// (Capa 2) estaba activo, lo que de verdad se jugó (decidirPiloto, Capa1+2)
// nunca se replayeaba, así que el marcador contaba una decisión hipotética
// distinta a la real. El store (telemetryStore.ts) YA llevaba el contador
// correcto en vivo (`copScore`, incrementado una vez por giro resuelto a
// partir de `copSug` — que desde que CopilotOrder llama a decidirPiloto()
// en vez de decidir() SÍ incluye Capa1+2) pero CopilotScoreboard no lo leía.
// Ahora lee `copScore` directo vía los selectores del store — cero replay,
// cero riesgo de desalinearse del escudo real.
import { decidirPiloto, type MarketRead } from '@/domain/copilot';

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
      {gMax >= 4 && (
        <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: '#ffdf60', marginTop: -4 }}>
          peor racha hoy: <b>{gMax}</b>
          {gCur > 0 && <span> · ⚠ venís perdiendo {gCur} seguidas</span>}
        </div>
      )}

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
  const gTotal = gHits + gMiss;

  // v7 (oct 2026) — jerarquía tipográfica pedida por Gunner sobre el
  // prototipo: títulos/valores principales (HUD, ENT) en blanco bold, texto
  // secundario (labels "HUD"/"ENT", "últ. 10") en gris regular, y line-height
  // 1.4-1.5 en "QUÉ HACER" para que no se sienta aplastado en la columna
  // angosta. El color de estado (st.color) se mantiene en título/badge/
  // instrucción — es la señal de zona de toda la app, no algo a aplanar.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 12px', ...(bare ? bareBlock() : microPanel(st.color)) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${st.color}35`, paddingBottom: 5 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 800, letterSpacing: '0.2em', color: '#ffffff', textShadow: `0 0 9px ${st.glow}` }}>
          {title}
        </span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', color: st.color, whiteSpace: 'nowrap', textShadow: `0 0 7px ${st.glow}` }}>
          {st.label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: '#8392a8', fontWeight: 400 }}>
        HUD <b style={{ color: '#ffffff', fontWeight: 700 }}>{hud ?? '—'}</b>
        {'  ·  '}
        ENT <b style={{ color: '#ffffff', fontWeight: 700 }}>{ent ?? '—'}</b>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 12.5 }}>
        <span>
          <span style={{ color: '#00ff9d' }}>✓{gHits}</span>
          {' '}
          <span style={{ color: '#ff1e38' }}>✗{gMiss}</span>
        </span>
        <span style={{ color: '#8092b5', fontWeight: 800 }}>{gTotal ? `${Math.round((gHits / gTotal) * 100)}%` : '—'}</span>
      </div>
      {gMax >= 4 && (
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#f4f8ff', marginTop: -2 }}>
          peor racha hoy: <b>{gMax}</b>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT_MONO, fontSize: 12 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: luz, boxShadow: `0 0 6px ${luz}`, flexShrink: 0 }} />
        <span style={{ color: '#8092b5', fontWeight: 400 }}>últ. 10:</span>
        <b style={{ color: luz }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#8392a8', fontWeight: 400 }}>
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

      <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: st.color, marginTop: 1, lineHeight: 1.5, textShadow: `0 0 5px ${st.glow}` }}>
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
// v7 (oct 2026): CopilotScoreboard dejó de recalcular el marcador a mano
// (solo Capa 1, ignoraba el escudo) — ahora lee copScore directo del store,
// que ya lo mantiene correcto en vivo con Capa1+2. Ver su propio comentario
// más abajo para el detalle del bug.
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
 *  v6: UN micropanel (borde + fondo + glow del color de nivel) para todo el
 *  bloque — v5 lo había dejado solo con acento lateral y perdió separación
 *  del resto de la columna. El glow grande en el título sigue siendo el
 *  más fuerte del panel: es la decisión jugándose ahora. */
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
  const doc = useMarketRead('doc');
  const col = useMarketRead('col');
  const d = decidirPiloto(doc, col);

  const setCopSug = useSetCopSug();
  setCopSug(d.mercado);

  // v7: "precaución" pasa de ámbar a blanco neón — Gunner: "preferiría
  // meter un blanco neón en vez de un naranja". ok/peligro quedan iguales.
  const color = d.nivel === 'ok' ? '#00ff9d' : d.nivel === 'precaucion' ? '#f4f8ff' : '#ff1e38';
  const glow = d.nivel === 'ok' ? 'rgba(0,255,157,0.6)' : d.nivel === 'precaucion' ? 'rgba(244,248,255,0.55)' : 'rgba(255,30,56,0.6)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: hero ? 9 : 6, padding: hero ? '4px 2px' : '12px 14px', ...(bare ? bareBlock() : microPanel(color, 0.18)) }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: hero ? 11 : 10.5, color, letterSpacing: '0.25em', fontWeight: 800, textShadow: `0 0 8px ${glow}` }}>
        ● ESCUDO (CAPA 1+2) · ENTRADA SEGURA
      </span>

      <AnimatePresence mode="wait">
        <motion.div key={d.titulo}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ display: 'flex', flexDirection: 'column', gap: hero ? 7 : 4 }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: hero ? 52 : 25, fontWeight: 900, color: '#ffffff', letterSpacing: '0.01em', textShadow: `0 0 ${hero ? 34 : 18}px ${glow}`, lineHeight: 1 }}>
            {d.titulo}
          </span>
          {/* texto secundario — siempre gris mate, sin glow (pedido
              explícito de Gunner, exactamente este texto fue su ejemplo:
              "Ni DOCENAS ni COLUMNAS..."). */}
          <span style={{ fontFamily: FONT_MONO, fontSize: hero ? 14.5 : 12.5, color: '#8a97ab', maxWidth: hero ? 460 : undefined, lineHeight: 1.5 }}>{d.motivo}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Marcador ACIERTOS/ERRORES/EFECTIVIDAD/RACHA del escudo.
 *
 *  v6: UN micropanel (borde cian + fondo + glow) — v5 lo había dejado como
 *  fila suelta y Gunner la reclamó sin separación del resto.
 *
 *  FIX (oct 2026) — bug real reportado por Gunner: "los errores tampoco
 *  salen en el contador del copiloto... ni normal ni con escudo". Esto NO
 *  es el mismo bug de sep 2026 (ya corregido, ver historial de copilot.ts) —
 *  es uno distinto, más profundo: este componente recalculaba TODO el
 *  historial llamando a decidirConEstado(), que es **Capa 1 sola**. Cuando
 *  el escudo (Capa 2, en copilot.ts) estaba o había estado activo, la
 *  decisión que de verdad se jugó (decidirPiloto, Capa1+2, la que ve el
 *  operador en CopilotOrder) nunca entraba en este cálculo — el marcador
 *  contaba aciertos/errores de una decisión hipotética distinta a la real.
 *  El store (telemetryStore.ts) YA lleva el contador correcto en vivo:
 *  `copScore`, incrementado una vez por giro resuelto a partir de
 *  `pend.copSug` — y `copSug` es exactamente lo que CopilotOrder escribe en
 *  cada render (`setCopSug(d.mercado)` con `d = decidirPiloto(...)`), así
 *  que YA incluye Capa1+2. Solo faltaba leerlo acá en vez de reinventar el
 *  cálculo — cero lógica nueva, cero replay, cero forma de desalinearse del
 *  escudo real. */
export function CopilotScoreboard({ bare = false }: { bare?: boolean } = {}) {
  const copHits = useCopHits();
  const copMisses = useCopMisses();
  const copWr = useCopWr();
  const copLive = useCopLiveStreak();
  const copStreak = useCopStreak(); // peor racha de la sesión (maxStreak)

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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))', gap: '10px 4px', padding: '10px 8px', ...(bare ? bareBlock() : microPanel('#22d3ee', 0.1)) }}>
      {STATS.map((s) => (
        <div key={s.k} style={{ padding: '0 6px', minWidth: 0 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8092b5', letterSpacing: '0.1em', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.k}</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 21, fontWeight: 900, color: s.c, marginTop: 3, textShadow: s.glow ? `0 0 8px ${s.c}80` : 'none' }}>{s.v}</div>
        </div>
      ))}
    </div>
  );
}

/** Par de chips con la zona ACTUAL de cada mercado (doc/col) — mismo
 *  useMarketRead()/fusedZone() que usa CopilotOrder, así nunca puede
 *  mostrar algo distinto de lo que el escudo está viendo en este momento.
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
