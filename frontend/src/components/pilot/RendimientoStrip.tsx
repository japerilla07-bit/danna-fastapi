// RENDIMIENTO EN VIVO — franja fina arriba del Quantum Pilot.
// Dice, giro a giro, cuál de las cuatro voces (Motor, Capa 1, Escudo, D.A.N.N.A.)
// viene mejor y cuál peor en los ÚLTIMOS 12 giros (ventana móvil, no el acumulado).
// Solo presentación y solo lectura: los números salen de domain/rendimiento.ts, que
// lee el registro del store. No decide nada ni toca ninguna apuesta.

import React, { memo, useMemo } from 'react';
import { useRendLog, usePaciencia } from '@/store/telemetryStore';
import { tasaPaciencia, pacienciaVeredicto, PACIENCIA_VENTANA } from '@/domain/paciencia';
import { leerRendimiento, lineaTendencia, fmtDelta, unir, FUENTES, NOMBRE, VENTANA, type Fuente, type ItemTendencia, type Medida } from '@/domain/rendimiento';
import { C, FONT_UI, FONT_NUM, glowText, rgba } from './theme';

/** Un color por voz. El Motor va en plata para no confundirse con D.A.N.N.A. (cian). */
const COLOR: Record<Fuente, string> = { motor: C.ink2, capa1: C.capa1, escudo: C.escudo, danna: C.danna };

const CSS = `
@keyframes qpRendPulso{0%{opacity:.35;transform:translateY(-1px)}100%{opacity:1;transform:none}}
.qp-rend-pulso{animation:qpRendPulso .6s ease-out}
[data-fx="off"] .qp-rend-pulso{animation:none}
@media (prefers-reduced-motion:reduce){.qp-rend-pulso{animation:none}}
`;

function Chip({ m, rol }: { m: Medida; rol: 'mejor' | 'peor' | null }) {
  const col = COLOR[m.fuente];
  const pct = m.tasa !== null ? `${Math.round(m.tasa * 100)}%` : '—';
  const tono = rol === 'mejor' ? C.ok : rol === 'peor' ? C.err : null;
  const flecha = m.tendencia === 'sube' ? { t: '▲', c: C.ok, d: 'mejorando contra los 12 giros anteriores' } : m.tendencia === 'baja' ? { t: '▼', c: C.err, d: 'empeorando contra los 12 giros anteriores' } : null;
  const detalle = m.n === 0
    ? `${NOMBRE[m.fuente]}: sin sugerencias en los últimos ${VENTANA} giros`
    : `${NOMBRE[m.fuente]}: ${m.hits} aciertos de ${m.n} sugerencias en los últimos ${VENTANA} giros${m.tasa === null ? ' (muy pocas para calificar)' : ''}${flecha ? ` · ${flecha.d}` : ''}`;
  return (
    <span
      data-qp={`rend-${m.fuente}`} data-rol={rol ?? 'ninguno'} title={detalle}
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: FONT_UI, fontSize: 'var(--qp-fs-txt)', borderLeft: `2px solid ${col}`, background: tono ? rgba(tono, 0.14) : 'transparent', boxShadow: tono ? `0 0 10px ${rgba(tono, 0.32)}, inset 0 0 0 1px ${rgba(tono, 0.4)}` : 'none' }}
    >
      <b style={{ color: col, fontWeight: 700 }}>{NOMBRE[m.fuente]}</b>
      <span style={{ fontFamily: FONT_NUM, fontSize: 'calc(var(--qp-fs-txt) + 3px)', fontWeight: 700, color: tono ?? (m.tasa === null ? C.ink4 : C.ink), lineHeight: 1 }}>{pct}</span>
      <span style={{ color: C.ink3, fontSize: 'calc(var(--qp-fs-txt) - 1px)' }}>{m.n > 0 ? `${m.hits}/${m.n}` : '0/0'}</span>
      {flecha && <span aria-label={flecha.d} style={{ color: flecha.c, fontSize: 'calc(var(--qp-fs-txt) - 1px)' }}>{flecha.t}</span>}
    </span>
  );
}

/**
 * MEDIDOR DE PACIENCIA DEL ESCUDO (solo lectura, no cambia lo que se juega): de los últimos
 * 5 giros del Escudo, cuántos habría acertado quien lo sigue al 1.er error ("siguiéndolo") y
 * quien espera 2 errores antes de cambiar ("esperando el error"). En verde el que lleva
 * 2 o más giros de ventaja; parejo = los dos en blanco. Ver domain/paciencia.ts.
 */
const PacienciaChip = memo(function PacienciaChip() {
  const { est } = usePaciencia();
  const a = tasaPaciencia(est, 'S');
  const b = tasaPaciencia(est, 'E');
  const v = pacienciaVeredicto(est);
  const f = (t: { hits: number; n: number }) => (t.n > 0 ? `${t.hits}/${t.n}` : '—');
  const pc = (t: { pct: number | null }) => (t.pct === null ? '—' : `${Math.round(t.pct)}%`);
  const tono = (quien: 'S' | 'E') => (v === quien ? C.ok : C.ink);
  const detalle = `Escudo, últimos ${PACIENCIA_VENTANA} giros con jugada: siguiéndolo al 1.er error ${f(a)} (${pc(a)}) · esperando 2 errores ${f(b)} (${pc(b)}). ${v === 'sin datos' ? 'Todavía pocos giros.' : v === 'parejo' ? 'Parejo.' : v === 'S' ? 'Va mejor siguiéndolo.' : 'Va mejor esperando.'} Solo medición: no cambia lo que se juega.`;
  return (
    <span
      data-qp="rend-paciencia" data-veredicto={v} title={detalle}
      style={{ marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1px)', color: C.ink3 }}
    >
      <b style={{ color: C.escudo, fontWeight: 700 }}>Escudo</b>
      {' siguiéndolo '}<b style={{ fontFamily: FONT_NUM, color: tono('S'), fontWeight: 700 }}>{f(a)}</b>
      {' · esperando el error '}<b style={{ fontFamily: FONT_NUM, color: tono('E'), fontWeight: 700 }}>{f(b)}</b>
    </span>
  );
});

export const RendimientoStrip = memo(function RendimientoStrip({ height }: { height: number }) {
  const log = useRendLog();
  const lec = useMemo(() => leerRendimiento(log), [log]);
  const veredicto = lec.veredicto === 'hay' ? (
    <>
      <span style={{ color: C.ok, textShadow: glowText(C.ok, 0.7), fontWeight: 700 }}>Mejor: {unir(lec.mejores)}</span>
      <span style={{ color: C.ink4 }}> · </span>
      <span style={{ color: C.err, textShadow: glowText(C.err, 0.7), fontWeight: 700 }}>Peor: {unir(lec.peores)}</span>
    </>
  ) : (
    <span style={{ color: lec.veredicto === 'parejo' ? C.ink2 : C.ink3, fontWeight: 600 }}>{lec.texto}</span>
  );

  const tend = useMemo(() => lineaTendencia(lec), [lec]);
  const items = (xs: ItemTendencia[]) => xs.map((x) => `${NOMBRE[x.fuente]} (${fmtDelta(x.delta)})`).join(', ');
  const tendencia = tend.estado === 'hay' ? (
    <>
      {tend.ascenso.length > 0 && <span style={{ color: C.ok, textShadow: glowText(C.ok, 0.7), fontWeight: 700 }}>▲ En ascenso: {items(tend.ascenso)}</span>}
      {tend.ascenso.length > 0 && tend.descenso.length > 0 && <span style={{ color: C.ink4 }}> · </span>}
      {tend.descenso.length > 0 && <span style={{ color: C.err, textShadow: glowText(C.err, 0.7), fontWeight: 700 }}>▼ En descenso: {items(tend.descenso)}</span>}
    </>
  ) : (
    <span style={{ color: C.ink3, fontWeight: 600 }}>{tend.texto}</span>
  );
  const fila: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };

  return (
    <section
      aria-label={`Rendimiento de las cuatro voces en los últimos ${VENTANA} giros`} data-qp="rendimiento" data-veredicto={lec.veredicto} data-tendencia={tend.estado}
      style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '0 8px', minWidth: 0, overflow: 'hidden', border: '1px solid rgba(120,170,255,0.2)', borderRadius: 6, background: 'linear-gradient(90deg, rgba(120,170,255,0.09), rgba(255,255,255,0.02))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09)', boxSizing: 'border-box' }}
    >
      <style>{CSS}</style>
      <div style={{ ...fila, height: 22 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 0.5px)', color: C.ink3, whiteSpace: 'nowrap', flexShrink: 0 }}>{VENTANA} giros</span>
        <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {FUENTES.map((f) => {
            const m = lec.medidas.find((x) => x.fuente === f)!;
            return <Chip key={f} m={m} rol={lec.mejores.includes(f) ? 'mejor' : lec.peores.includes(f) ? 'peor' : null} />;
          })}
        </span>
        <span
          key={lec.texto} className="qp-rend-pulso" data-qp="rend-veredicto" role="status" aria-live="polite"
          style={{ marginLeft: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: FONT_UI, fontSize: 'var(--qp-fs-txt)' }}
        >
          {veredicto}
        </span>
      </div>
      <div style={{ ...fila, height: 14 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1px)', color: C.ink3, whiteSpace: 'nowrap', flexShrink: 0 }}>Viene</span>
        <span
          key={tend.texto} className="qp-rend-pulso" data-qp="rend-tendencia" aria-label={tend.texto}
          style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 0.5px)' }}
        >
          {tendencia}
        </span>
        <PacienciaChip />
      </div>
    </section>
  );
});
