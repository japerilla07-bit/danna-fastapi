// BITÁCORA — línea de tiempo del plan (a escala). Solo presenta; no calcula nada propio.
// La tabla de sesiones de la página es el equivalente textual (accesible) de este dibujo.

import { C, FONT_NUM, FONT_UI, rgba } from '@/components/pilot/theme';
import { fmtHM } from './planner';
import type { Plan } from './types';

export function LineaDeTiempo({ plan }: { plan: Plan }) {
  const span = plan.limite - plan.inicio;
  if (!(span > 0)) return null;
  const pct = (m: number) => `${(((m - plan.inicio) / span) * 100).toFixed(3)}%`;
  const ancho = (a: number, b: number) => `${(((b - a) / span) * 100).toFixed(3)}%`;
  const primeraHora = Math.ceil(plan.inicio / 60) * 60;
  const horas: number[] = [];
  for (let m = primeraHora; m <= plan.limite; m += 60) horas.push(m);
  const paso = horas.length > 14 ? 2 : 1;

  return (
    <div role="img" aria-label={`Línea de tiempo de la jornada de ${fmtHM(plan.inicio)} a ${fmtHM(plan.limite)}`} style={{ position: 'relative', height: 132, margin: '4px 6px 0', userSelect: 'none' }}>
      {/* eje */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 108, height: 1, background: C.line2 }} />
      {horas.map((m, i) => i % paso === 0 && (
        <div key={m} style={{ position: 'absolute', left: pct(m), top: 0, bottom: 0, width: 0 }}>
          <div style={{ position: 'absolute', top: 0, bottom: 24, borderLeft: `1px dashed ${rgba(C.line2, 0.55)}` }} />
          <div style={{ position: 'absolute', top: 112, transform: 'translateX(-50%)', fontFamily: FONT_UI, fontSize: 11.5, color: C.ink4, whiteSpace: 'nowrap' }}>{fmtHM(m).replace(/ \(\+\d\)/, '')}</div>
        </div>
      ))}
      {/* comidas y pausas protegidas */}
      {plan.bloques.map((b, i) => {
        const a = Math.max(b.inicio, plan.inicio), z = Math.min(b.fin, plan.limite);
        return (
          <div key={`b${i}`} title={`${b.nombre} ${fmtHM(b.inicio)}–${fmtHM(b.fin)}`} style={{ position: 'absolute', left: pct(a), width: ancho(a, z), top: 6, height: 26, borderRadius: 6, overflow: 'hidden', border: `1px solid ${rgba(C.warn, 0.7)}`, background: `repeating-linear-gradient(135deg, ${rgba(C.warn, 0.2)} 0 6px, ${rgba(C.warn, 0.06)} 6px 12px)`, color: C.warn, fontFamily: FONT_UI, fontSize: 11.5, lineHeight: '24px', padding: '0 6px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{b.nombre}</div>
        );
      })}
      {/* sesiones */}
      {plan.sesiones.map((s) => {
        const cancel = s.estado === 'cancelada';
        return (
          <div key={s.n} title={`Sesión ${s.n} ${fmtHM(s.inicio)}–${fmtHM(s.fin)}${cancel ? ' (cancelada)' : ''}`} style={{ position: 'absolute', left: pct(s.inicio), width: ancho(s.inicio, s.fin), top: 40, height: 44, borderRadius: 8, boxSizing: 'border-box', overflow: 'hidden', padding: '3px 8px', border: `1.5px ${cancel ? 'dashed' : 'solid'} ${cancel ? C.ink4 : C.danna}`, background: cancel ? 'transparent' : `linear-gradient(180deg, ${rgba(C.danna, 0.2)}, ${rgba(C.danna, 0.08)})`, boxShadow: cancel ? 'none' : `0 0 10px ${rgba(C.danna, 0.22)}`, color: cancel ? C.ink4 : C.ink, whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: FONT_NUM, fontSize: 18, fontWeight: 700, lineHeight: '20px', textDecoration: cancel ? 'line-through' : 'none' }}>S{s.n}</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: cancel ? C.ink4 : C.ink2 }}>{fmtHM(s.inicio).replace(/ \(\+\d\)/, '')}–{fmtHM(s.fin).replace(/ \(\+\d\)/, '')}</div>
          </div>
        );
      })}
      {/* descansos entre sesiones activas */}
      {plan.descansos.map((d, i) => (
        <div key={`d${i}`} title={`Descanso ${d.duracionMin} min entre S${d.entre[0]} y S${d.entre[1]}`} style={{ position: 'absolute', left: pct(d.desde), width: ancho(d.desde, d.hasta), top: 88, height: 16, overflow: 'hidden', textAlign: 'center', fontFamily: FONT_UI, fontSize: 11.5, color: C.ink3, borderBottom: `2px solid ${rgba(C.ok, 0.55)}`, whiteSpace: 'nowrap' }}>{d.duracionMin} min</div>
      ))}
    </div>
  );
}
