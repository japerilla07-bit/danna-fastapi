// BITÁCORA — formulario de cierre de UNA sesión. Se llena al terminarla (unos 5 minutos), nunca en vivo.
// Avisa de datos incompletos pero no los bloquea; solo impide guardar datos imposibles (saldo negativo, hora inválida).

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { C, FONT_NUM, rgba } from '@/components/pilot/theme';
import { fmtHM } from './planner';
import { ESTADOS_CIERRE, MOTIVOS_SALIDA, SENSACIONES, SIGUIO_MOTOR, duracionRealMin, resultadoSesion, validarRegistro } from './registro';
import type { RegistroSesion, SesionPlan, SiguioMotor } from './types';

const sinDia = (m: number) => fmtHM(m).replace(/ \(\+\d\)/, '');
export const fmtCOP = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-CO')}`;
const fmtRes = (n: number): string => `${n > 0 ? '+' : ''}${fmtCOP(n)}`;

interface Props {
  sesion: SesionPlan;
  inicial: RegistroSesion;
  /** Saldo final de la sesión anterior ya registrada: se ofrece como saldo inicial, no se pone solo. */
  saldoFinalAnterior: number | null;
  numAnterior: number | null;
  onGuardar: (r: RegistroSesion) => void;
  onQuitar: () => void;
  onCancelar: () => void;
}

const grupo: CSSProperties = { display: 'grid', gap: 6 };
const fila: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };

export function CierreSesion({ sesion, inicial, saldoFinalAnterior, numAnterior, onGuardar, onQuitar, onCancelar }: Props) {
  const [r, setR] = useState<RegistroSesion>(inicial);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const set = (p: Partial<RegistroSesion>) => setR((x) => ({ ...x, ...p }));
  const hallazgos = useMemo(() => validarRegistro(r, sesion), [r, sesion]);
  const errores = hallazgos.filter((h) => h.nivel === 'error'), avisos = hallazgos.filter((h) => h.nivel === 'aviso');
  const res = resultadoSesion(r), dur = duracionRealMin(r);
  const existe = inicial.estado !== 'pendiente';
  const puede = r.estado !== 'pendiente' && errores.length === 0;
  const saldo = (v: number | null, onChange: (n: number | null) => void, etq: string) => (
    <input className="bt-in" type="number" inputMode="decimal" min={0} step="any" placeholder="Ej. 100000" aria-label={etq} value={v === null ? '' : v}
      onChange={(e) => onChange(e.target.value === '' || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value))} />
  );
  const chip = (activo: boolean, color: string): CSSProperties => ({ borderColor: activo ? color : undefined, background: activo ? rgba(color, 0.14) : undefined, color: activo ? color : undefined });

  return (
    <form className="bt-cierre" aria-label={`Cierre de la sesión ${sesion.n}`} onSubmit={(e) => { e.preventDefault(); if (puede) onGuardar(r); }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Cierre de la sesión {sesion.n} <span style={{ color: C.ink4, fontWeight: 400 }}>· plan {sinDia(sesion.inicio)}–{sinDia(sesion.fin)}</span></div>

      <fieldset style={{ ...grupo, border: 0, padding: 0, margin: 0 }}>
        <legend className="bt-q">¿Cómo terminó la sesión?</legend>
        <div style={fila} role="radiogroup" aria-label="Cómo terminó la sesión">
          {ESTADOS_CIERRE.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={r.estado === e.id} className="bt-btn" style={chip(r.estado === e.id, e.id === 'cumplida' ? C.ok : e.id === 'parcial' ? C.warn : C.err)} onClick={() => set({ estado: e.id })}>{e.etiqueta}</button>
          ))}
        </div>
      </fieldset>

      <div className="bt-cols">
        <label className="bt-lbl"><span>Hora real de inicio</span>
          <input className="bt-in" type="time" value={r.horaInicioReal} onChange={(e) => set({ horaInicioReal: e.target.value })} />
          <button type="button" className="bt-link" onClick={() => set({ horaInicioReal: sinDia(sesion.inicio) })}>Usar la del plan ({sinDia(sesion.inicio)})</button></label>
        <label className="bt-lbl"><span>Hora real de fin</span>
          <input className="bt-in" type="time" value={r.horaFinReal} onChange={(e) => set({ horaFinReal: e.target.value })} />
          <button type="button" className="bt-link" onClick={() => set({ horaFinReal: sinDia(sesion.fin) })}>Usar la del plan ({sinDia(sesion.fin)})</button></label>
        <label className="bt-lbl"><span>Saldo con el que empecé</span>
          {saldo(r.saldoInicial, (n) => set({ saldoInicial: n }), 'Saldo inicial')}
          {saldoFinalAnterior !== null && numAnterior !== null && <button type="button" className="bt-link" onClick={() => set({ saldoInicial: saldoFinalAnterior })}>Usar el final de S{numAnterior} ({fmtCOP(saldoFinalAnterior)})</button>}</label>
        <label className="bt-lbl"><span>Saldo con el que terminé</span>{saldo(r.saldoFinal, (n) => set({ saldoFinal: n }), 'Saldo final')}</label>
      </div>
      <div style={{ ...fila, fontSize: 13.5, color: C.ink2 }} aria-live="polite">
        <span>Resultado: <strong style={{ fontFamily: FONT_NUM, fontSize: 20, color: res === null ? C.ink4 : res > 0 ? C.ok : res < 0 ? C.err : C.ink }}>{res === null ? '—' : fmtRes(res)}</strong></span>
        <span style={{ color: C.ink4 }}>·</span>
        <span>Duración real: <strong>{dur === null ? '—' : `${dur} min`}</strong></span>
      </div>

      <fieldset style={{ ...grupo, border: 0, padding: 0, margin: 0 }}>
        <legend className="bt-q">¿Seguiste las instrucciones del motor?</legend>
        <div style={fila} role="radiogroup" aria-label="Seguiste el motor">
          {SIGUIO_MOTOR.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={r.siguioMotor === m.id} className="bt-btn" style={chip(r.siguioMotor === m.id, C.danna)} onClick={() => set({ siguioMotor: (r.siguioMotor === m.id ? '' : m.id) as SiguioMotor })}>{m.etiqueta}</button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ ...grupo, border: 0, padding: 0, margin: 0 }}>
        <legend className="bt-q">¿Cómo te sentiste en la sesión?</legend>
        <div style={fila} role="radiogroup" aria-label="Cómo te sentiste">
          {SENSACIONES.map((t, i) => (
            <button key={t} type="button" role="radio" aria-checked={r.sensacion === i + 1} className="bt-btn" style={chip(r.sensacion === i + 1, C.danna)} onClick={() => set({ sensacion: r.sensacion === i + 1 ? 0 : i + 1 })}>{i + 1} · {t}</button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ ...grupo, border: 0, padding: 0, margin: 0 }}>
        <legend className="bt-q">¿Te saliste de la mesa antes de lo previsto?</legend>
        <div style={fila} role="radiogroup" aria-label="Saliste de la mesa">
          <button type="button" role="radio" aria-checked={r.saliMesa === false} className="bt-btn" style={chip(r.saliMesa === false, C.danna)} onClick={() => set({ saliMesa: r.saliMesa === false ? null : false, motivoSalida: '', detalleSalida: '' })}>No</button>
          <button type="button" role="radio" aria-checked={r.saliMesa === true} className="bt-btn" style={chip(r.saliMesa === true, C.warn)} onClick={() => set({ saliMesa: r.saliMesa === true ? null : true })}>Sí</button>
        </div>
        {r.saliMesa === true && (
          <div className="bt-cols">
            <label className="bt-lbl"><span>¿Por qué?</span>
              <select className="bt-in" value={r.motivoSalida} onChange={(e) => set({ motivoSalida: e.target.value })}>
                <option value="">Elige un motivo</option>{MOTIVOS_SALIDA.map((m) => <option key={m}>{m}</option>)}
              </select></label>
            <label className="bt-lbl"><span>Detalle (opcional)</span><input className="bt-in" type="text" maxLength={300} value={r.detalleSalida} onChange={(e) => set({ detalleSalida: e.target.value })} /></label>
          </div>
        )}
      </fieldset>

      <label className="bt-lbl"><span className="bt-q">Notas de la sesión (lo que quieras recordar para la retroalimentación)</span>
        <textarea className="bt-in" rows={3} maxLength={5000} value={r.notas} onChange={(e) => set({ notas: e.target.value })} /></label>

      <div role="status" aria-live="polite" style={{ display: 'grid', gap: 4 }}>
        {r.estado === 'pendiente' && <div style={{ color: C.ink3, fontSize: 13 }}>Elige cómo terminó la sesión para poder guardar el cierre.</div>}
        {errores.map((h, i) => <div key={`e${i}`} style={{ color: C.err, fontSize: 13 }}>✕ {h.mensaje}</div>)}
        {avisos.map((h, i) => <div key={`a${i}`} style={{ color: C.warn, fontSize: 13 }}>⚠ {h.mensaje}</div>)}
      </div>

      <div style={fila}>
        <button type="submit" className="bt-btn bt-prim" disabled={!puede}>Guardar cierre</button>
        <button type="button" className="bt-btn" onClick={onCancelar}>Cancelar</button>
        {existe && !confirmarQuitar && <button type="button" className="bt-btn" style={{ marginLeft: 'auto' }} onClick={() => setConfirmarQuitar(true)}>Dejar sin registrar</button>}
        {existe && confirmarQuitar && (
          <span style={{ ...fila, marginLeft: 'auto' }}><span style={{ color: C.warn, fontSize: 13 }}>¿Borrar este cierre?</span>
            <button type="button" className="bt-btn bt-peligro" onClick={onQuitar}>Sí, borrar</button><button type="button" className="bt-btn" onClick={() => setConfirmarQuitar(false)}>No</button></span>
        )}
      </div>
    </form>
  );
}
