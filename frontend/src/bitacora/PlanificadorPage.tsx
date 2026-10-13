// BITÁCORA — vista de planificación de la jornada (/app/bitacora).
//
// Capa independiente: no lee ni escribe nada del motor, del store de telemetría ni del backend.
// Por ahora el plan se conserva como BORRADOR LOCAL (ver borrador.ts); el guardado en el
// servidor llega en la siguiente fase y esta pantalla lo dirá explícitamente cuando exista.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { C, FONT_NUM, FONT_UI, rgba } from '@/components/pilot/theme';
import { LineaDeTiempo } from './LineaDeTiempo';
import { aplicarOps, almacenNavegador, borradorInicial, borrarBorrador, guardarBorrador, leerBorrador } from './borrador';
import type { OpPlan } from './borrador';
import { construirPlan, fmtHM, GIRO_OBSERVACION_DEFECTO, reprogramarSesion } from './planner';
import type { BloqueCfg, Modalidad, PlanCfg } from './types';

const MODALIDADES: Array<{ id: Modalidad; titulo: string; ayuda: string }> = [
  { id: 'equilibrada', titulo: 'Equilibrada', ayuda: 'Reparte la holgura en descansos iguales.' },
  { id: 'concentrada', titulo: 'Al comienzo', ayuda: 'Sesiones seguidas desde la hora de inicio.' },
  { id: 'desde', titulo: 'Desde una hora', ayuda: 'Sesiones seguidas desde la hora que elijas.' },
  { id: 'manual', titulo: 'Manual', ayuda: 'Tú defines la hora de cada sesión.' },
];
const MOTIVOS = ['Cansancio', 'Imprevisto', 'Mesa no disponible', 'Conexión', 'Otro'];

const hoyLocal = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hhmm = (iso: string): string => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmtDur = (m: number): string => (m <= 0 ? '—' : `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ''}${m % 60 ? `${m % 60} min` : ''}`.trim());
const sinDia = (m: number) => fmtHM(m).replace(/ \(\+\d\)/, '');

const CSS = `
.bt-root{min-height:100vh;background:radial-gradient(1200px 500px at 15% -10%,${rgba(C.danna, 0.09)},transparent 60%),radial-gradient(900px 500px at 100% 0%,${rgba(C.escudo, 0.07)},transparent 60%),${C.bg0};color:${C.ink};font-family:${FONT_UI}}
.bt-grid{display:grid;grid-template-columns:minmax(330px,420px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:980px){.bt-grid{grid-template-columns:1fr}}
.bt-card{background:${C.bg1};border:1px solid ${C.line};border-radius:12px;padding:16px}
.bt-in{background:${C.bg2};border:1px solid ${C.line2};color:${C.ink};border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;width:100%;box-sizing:border-box;min-height:38px}
.bt-in:focus-visible,.bt-btn:focus-visible,.bt-radio:focus-within{outline:2px solid ${C.danna};outline-offset:2px}
.bt-in::-webkit-calendar-picker-indicator{filter:invert(.8)}
.bt-lbl{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:${C.ink3}}
.bt-btn{background:${C.bg2};border:1px solid ${C.line2};color:${C.ink};border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;min-height:34px}
.bt-btn:hover{border-color:${C.danna}}
.bt-btn[disabled]{opacity:.5;cursor:default}
.bt-btn.bt-prim{border-color:${C.danna};color:${C.danna}}
.bt-btn.bt-peligro{border-color:${rgba(C.err, 0.7)};color:${C.err}}
.bt-radio{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid ${C.line2};border-radius:8px;background:${C.bg2};cursor:pointer}
.bt-radio[data-on="1"]{border-color:${C.danna};background:${rgba(C.danna, 0.1)}}
.bt-h{font-size:12.5px;letter-spacing:.02em;color:${C.ink3};margin:0 0 10px;font-weight:600}
table.bt-t{width:100%;border-collapse:collapse;font-size:13.5px}
table.bt-t th{font-weight:500;color:${C.ink4};text-align:left;padding:6px 8px;border-bottom:1px solid ${C.line2};font-size:12px}
table.bt-t td{padding:8px;border-bottom:1px solid ${C.line};vertical-align:top}
`;

function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return <label className="bt-lbl"><span>{etiqueta}</span>{children}{ayuda && <span style={{ color: C.ink4, fontSize: 11.5 }}>{ayuda}</span>}</label>;
}
function Num({ value, onChange, min, max, step = 1, 'aria-label': al }: { value: number | null | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; 'aria-label'?: string }) {
  return <input className="bt-in" type="number" inputMode="numeric" min={min} max={max} step={step} aria-label={al} value={value == null || Number.isNaN(value) ? '' : value} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />;
}
function Opc({ value, onChange, 'aria-label': al }: { value: number | null | undefined; onChange: (v: number | null) => void; 'aria-label'?: string }) {
  return <input className="bt-in" type="number" inputMode="numeric" min={0} step={1000} placeholder="Opcional" aria-label={al} value={value == null ? '' : value} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
}

export function PlanificadorPage() {
  const inicial = useMemo(() => { const { borrador, aviso } = leerBorrador(almacenNavegador()); return { ...(borrador ?? borradorInicial(hoyLocal())), aviso }; }, []);
  const [cfg, setCfg] = useState<PlanCfg>(inicial.cfg);
  const [ops, setOps] = useState<OpPlan[]>(inicial.ops);
  const { plan, descartadas } = useMemo(() => aplicarOps(cfg, ops), [cfg, ops]);
  const [guardado, setGuardado] = useState<{ ok: boolean | null; texto: string }>({ ok: null, texto: 'Borrador sin guardar todavía' });
  const [accion, setAccion] = useState<{ n: number; tipo: 'cancelar' | 'reprogramar' } | null>(null);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [hora, setHora] = useState('');
  const [errorOp, setErrorOp] = useState<string | null>(null);
  const [confirmarReset, setConfirmarReset] = useState(false);
  const primera = useRef(true);

  // Borrador local (solo se dice "guardado" si el navegador lo conservó de verdad)
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    setGuardado({ ok: null, texto: 'Guardando borrador…' });
    const t = window.setTimeout(() => {
      const r = guardarBorrador(almacenNavegador(), cfg, ops, new Date().toISOString());
      setGuardado(r.ok ? { ok: true, texto: `Borrador guardado en este navegador a las ${hhmm(r.guardadoEn)}` } : { ok: false, texto: `No se pudo guardar el borrador: ${r.error}` });
    }, 400);
    return () => window.clearTimeout(t);
  }, [cfg, ops]);

  const set = (p: Partial<PlanCfg>) => setCfg((c) => ({ ...c, ...p }));
  const proponer = (c: PlanCfg) => { const s = construirPlan({ ...c, modalidad: 'equilibrada' }).sesiones; return s.length ? s.map((x) => ({ inicio: sinDia(x.inicio) })) : Array.from({ length: Number.isInteger(c.numSesiones) && c.numSesiones > 0 ? Math.min(c.numSesiones, 12) : 1 }, () => ({ inicio: '' })); };
  const cambiarNum = (n: number) => setCfg((c) => {
    const next: PlanCfg = { ...c, numSesiones: n };
    if (c.modalidad === 'manual' && Number.isInteger(n) && n >= 1 && n <= 12) { const m = [...(c.manuales ?? [])]; while (m.length < n) m.push({ inicio: '' }); next.manuales = m.slice(0, n); }
    return next;
  });
  const cambiarModalidad = (m: Modalidad) => setCfg((c) => ({ ...c, modalidad: m, desdeHora: m === 'desde' && !c.desdeHora ? c.inicioDisponible : c.desdeHora, manuales: m === 'manual' && !(c.manuales?.length) ? proponer(c) : c.manuales }));
  const setBloque = (i: number, p: Partial<BloqueCfg>) => set({ bloques: cfg.bloques.map((b, k) => (k === i ? { ...b, ...p } : b)) });
  const addBloque = (tipo: BloqueCfg['tipo']) => set({ bloques: [...cfg.bloques, { tipo, inicio: tipo === 'desayuno' ? '07:30' : tipo === 'almuerzo' ? '12:30' : '10:30', duracionMin: tipo === 'almuerzo' ? 60 : 30 }] });
  const setManual = (i: number, p: { inicio?: string; duracionMin?: number | undefined }) => set({ manuales: (cfg.manuales ?? []).map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const setLim = (k: keyof NonNullable<PlanCfg['limites']>, v: number | null) => set({ limites: { ...(cfg.limites ?? {}), [k]: v } });

  const ahora = () => new Date().toISOString();
  const confirmarCancelar = (n: number) => { setOps((o) => [...o, { tipo: 'cancelar', n, motivo, ts: ahora() }]); setAccion(null); setErrorOp(null); };
  const confirmarReprogramar = (n: number) => {
    const r = reprogramarSesion(plan, n, hora, ahora());
    if (!r.ok) { setErrorOp(r.hallazgos.map((h) => h.mensaje).join(' ')); return; }
    setOps((o) => [...o, { tipo: 'reprogramar', n, hora, ts: ahora() }]); setAccion(null); setErrorOp(null);
  };
  const reset = () => { borrarBorrador(almacenNavegador()); const b = borradorInicial(hoyLocal()); setCfg(b.cfg); setOps([]); setConfirmarReset(false); setAccion(null); setErrorOp(null); setGuardado({ ok: null, texto: 'Borrador restablecido' }); };

  const errores = plan.hallazgos.filter((h) => h.nivel === 'error'), avisos = plan.hallazgos.filter((h) => h.nivel === 'aviso');
  const hayActivas = plan.sesiones.some((s) => s.estado !== 'cancelada');
  const stat = (t: string, v: string, col: string = C.ink): ReactNode => (
    <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: C.ink4 }}>{t}</div>
      <div style={{ fontFamily: FONT_NUM, fontSize: 26, fontWeight: 600, lineHeight: '30px', color: col }}>{v}</div>
    </div>
  );
  const dot = (ok: boolean | null): CSSProperties => ({ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 7, background: ok === null ? C.warn : ok ? C.ok : C.err });

  return (
    <div className="bt-root">
      <style>{CSS}</style>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.line}`, background: rgba(C.bg1, 0.85) }}>
        <Link to="/app" className="bt-btn" style={{ textDecoration: 'none' }} aria-label="Volver a D.A.N.N.A.">← D.A.N.N.A.</Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Bitácora · Planificador de jornada</h1>
        <span role="status" aria-live="polite" style={{ marginLeft: 'auto', fontSize: 13, color: guardado.ok === false ? C.err : C.ink2 }}><span style={dot(guardado.ok)} aria-hidden />{guardado.texto}</span>
      </header>

      <main style={{ maxWidth: 1500, margin: '0 auto', padding: 20 }}>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: C.ink3, maxWidth: 900 }}>
          Esta pantalla propone y valida horarios; no cambia nada del motor. El plan queda como <strong style={{ color: C.ink2 }}>borrador en este navegador</strong>: todavía no se guarda en el servidor.
        </p>
        <div className="bt-grid">
          {/* ── Configuración ── */}
          <section className="bt-card" aria-label="Configuración de la jornada">
            <h2 className="bt-h">Jornada</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><Campo etiqueta="Fecha"><input className="bt-in" type="date" value={cfg.fecha} onChange={(e) => set({ fecha: e.target.value })} /></Campo></div>
              <Campo etiqueta="Hora de inicio disponible"><input className="bt-in" type="time" value={cfg.inicioDisponible} onChange={(e) => set({ inicioDisponible: e.target.value })} /></Campo>
              <Campo etiqueta="Hora límite de finalización" ayuda={plan.cruzaMedianoche ? 'Termina en el día siguiente.' : undefined}><input className="bt-in" type="time" value={cfg.limiteFin} onChange={(e) => set({ limiteFin: e.target.value })} /></Campo>
              <Campo etiqueta="Número de sesiones" ayuda="De 1 a 12."><Num value={cfg.numSesiones} min={1} max={12} onChange={cambiarNum} /></Campo>
              <Campo etiqueta="Duración de cada sesión (min)"><Num value={cfg.duracionSesionMin} min={5} max={480} step={5} onChange={(v) => set({ duracionSesionMin: v })} /></Campo>
              <Campo etiqueta="Descanso mínimo entre sesiones (min)"><Num value={cfg.descansoMinMin} min={0} max={240} step={5} onChange={(v) => set({ descansoMinMin: v })} /></Campo>
              <Campo etiqueta="Giros de observación inicial" ayuda={`Por defecto ${GIRO_OBSERVACION_DEFECTO}. Solo se registra.`}><Num value={cfg.giroObservacion} min={0} max={1000} onChange={(v) => set({ giroObservacion: v })} /></Campo>
            </div>

            <h2 className="bt-h" style={{ marginTop: 18 }}>Comidas y pausas protegidas</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {cfg.bloques.length === 0 && <div style={{ fontSize: 12.5, color: C.ink4 }}>Sin comidas ni pausas.</div>}
              {cfg.bloques.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.9fr auto', gap: 6, alignItems: 'end' }}>
                  <Campo etiqueta="Tipo"><select className="bt-in" value={b.tipo} onChange={(e) => setBloque(i, { tipo: e.target.value as BloqueCfg['tipo'] })}><option value="desayuno">Desayuno</option><option value="almuerzo">Almuerzo</option><option value="pausa">Otra pausa</option></select></Campo>
                  <Campo etiqueta="Inicio"><input className="bt-in" type="time" value={b.inicio} onChange={(e) => setBloque(i, { inicio: e.target.value })} /></Campo>
                  <Campo etiqueta="Min"><Num value={b.duracionMin} min={5} max={480} step={5} aria-label="Duración en minutos" onChange={(v) => setBloque(i, { duracionMin: v })} /></Campo>
                  <button type="button" className="bt-btn bt-peligro" aria-label={`Quitar ${b.tipo}`} onClick={() => set({ bloques: cfg.bloques.filter((_, k) => k !== i) })}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" className="bt-btn" onClick={() => addBloque('desayuno')}>+ Desayuno</button>
                <button type="button" className="bt-btn" onClick={() => addBloque('almuerzo')}>+ Almuerzo</button>
                <button type="button" className="bt-btn" onClick={() => addBloque('pausa')}>+ Otra pausa</button>
              </div>
            </div>

            <h2 className="bt-h" style={{ marginTop: 18 }}>Distribución</h2>
            <div role="radiogroup" aria-label="Distribución de las sesiones" style={{ display: 'grid', gap: 6 }}>
              {MODALIDADES.map((m) => (
                <label key={m.id} className="bt-radio" data-on={cfg.modalidad === m.id ? 1 : 0}>
                  <input type="radio" name="modalidad" checked={cfg.modalidad === m.id} onChange={() => cambiarModalidad(m.id)} style={{ marginTop: 3 }} />
                  <span><span style={{ fontSize: 14 }}>{m.titulo}</span><br /><span style={{ fontSize: 12, color: C.ink4 }}>{m.ayuda}</span></span>
                </label>
              ))}
            </div>
            {cfg.modalidad === 'desde' && <div style={{ marginTop: 10 }}><Campo etiqueta="Empezar a partir de"><input className="bt-in" type="time" value={cfg.desdeHora ?? ''} onChange={(e) => set({ desdeHora: e.target.value })} /></Campo></div>}
            {cfg.modalidad === 'manual' && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {(cfg.manuales ?? []).map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <Campo etiqueta={`Sesión ${i + 1} · inicio`}><input className="bt-in" type="time" value={m.inicio} onChange={(e) => setManual(i, { inicio: e.target.value })} /></Campo>
                    <Campo etiqueta="Duración (min)" ayuda={m.duracionMin === undefined ? `Usa ${Number.isNaN(cfg.duracionSesionMin) ? '—' : cfg.duracionSesionMin}` : undefined}><Num value={m.duracionMin} min={5} max={480} step={5} aria-label={`Duración de la sesión ${i + 1}`} onChange={(v) => setManual(i, { duracionMin: Number.isNaN(v) ? undefined : v })} /></Campo>
                  </div>
                ))}
                <div><button type="button" className="bt-btn" onClick={() => set({ manuales: proponer(cfg) })}>Proponer horarios equilibrados</button></div>
              </div>
            )}

            <h2 className="bt-h" style={{ marginTop: 18 }}>Referencias económicas (opcionales)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Campo etiqueta="Límite de pérdida por sesión"><Opc value={cfg.limites?.perdidaPorSesion} onChange={(v) => setLim('perdidaPorSesion', v)} /></Campo>
              <Campo etiqueta="Límite de pérdida de la jornada"><Opc value={cfg.limites?.perdidaJornada} onChange={(v) => setLim('perdidaJornada', v)} /></Campo>
              <Campo etiqueta="Meta por sesión"><Opc value={cfg.limites?.metaPorSesion} onChange={(v) => setLim('metaPorSesion', v)} /></Campo>
              <Campo etiqueta="Meta de la jornada"><Opc value={cfg.limites?.metaJornada} onChange={(v) => setLim('metaJornada', v)} /></Campo>
            </div>
            <div style={{ marginTop: 12 }}>
              <Campo etiqueta="Reglas de salida (una por línea)" ayuda="Se registran tal cual; el sistema no las aplica por ti.">
                <textarea className="bt-in" rows={3} value={(cfg.reglasSalida ?? []).join('\n')} onChange={(e) => set({ reglasSalida: e.target.value.split('\n') })} />
              </Campo>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {!confirmarReset ? <button type="button" className="bt-btn" onClick={() => setConfirmarReset(true)}>Restablecer borrador</button>
                : (<><span style={{ fontSize: 13, color: C.warn }}>¿Borrar el borrador?</span><button type="button" className="bt-btn bt-peligro" onClick={reset}>Sí, borrar</button><button type="button" className="bt-btn" onClick={() => setConfirmarReset(false)}>No</button></>)}
            </div>
          </section>

          {/* ── Resultado ── */}
          <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            <section className="bt-card" aria-label="Horario de la jornada">
              <h2 className="bt-h">Horario{plan.viable ? '' : ' (con problemas)'}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
                {stat('Tiempo efectivo de operación', hayActivas ? fmtDur(plan.tiempoEfectivoMin) : '—', C.danna)}
                {stat('Jornada (primera a última sesión)', hayActivas ? fmtDur(plan.tiempoTotalMin) : '—')}
                {stat('Fin previsto', plan.finPrevisto === null ? '—' : fmtHM(plan.finPrevisto), C.ok)}
                {stat('Descansos y comidas', hayActivas ? fmtDur(plan.tiempoTotalMin - plan.tiempoEfectivoMin) : '—', C.ink2)}
              </div>
              <LineaDeTiempo plan={plan} />
              <div role="status" aria-live="polite" style={{ marginTop: 14, display: 'grid', gap: 6 }}>
                {errores.map((h, i) => <div key={`e${i}`} style={{ color: C.err, fontSize: 13.5 }}><span aria-hidden>✕ </span><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Error: </span>{h.mensaje}</div>)}
                {avisos.map((h, i) => <div key={`a${i}`} style={{ color: C.warn, fontSize: 13.5 }}><span aria-hidden>⚠ </span><span style={{ position: 'absolute', left: -9999 }}>Aviso: </span>{h.mensaje}</div>)}
                {plan.viable && <div style={{ color: C.ok, fontSize: 13.5 }}><span aria-hidden>✓ </span>El plan es válido: sin solapes, con los descansos mínimos y sin pisar comidas.</div>}
                {descartadas.map((d, i) => (
                  <div key={`d${i}`} style={{ color: C.ink3, fontSize: 13 }}>
                    Cambio sin aplicar ({d.op.tipo === 'cancelar' ? 'cancelar' : 'reprogramar'} sesión {d.op.n}): {d.motivo}{' '}
                    <button type="button" className="bt-btn" onClick={() => setOps((o) => o.filter((x) => x !== d.op))}>Quitar</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="bt-card" aria-label="Sesiones">
              <h2 className="bt-h">Sesiones</h2>
              {plan.sesiones.length === 0 ? <div style={{ fontSize: 13.5, color: C.ink3 }}>Aún no hay sesiones: corrige los avisos de arriba.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="bt-t">
                    <thead><tr><th>Sesión</th><th>Horario</th><th>Duración</th><th>Estado</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {plan.sesiones.map((s) => {
                        const cancel = s.estado === 'cancelada', abierta = accion?.n === s.n;
                        return (
                          <tr key={s.n}>
                            <td style={{ fontFamily: FONT_NUM, fontSize: 18, fontWeight: 600 }}>S{s.n}</td>
                            <td style={{ textDecoration: cancel ? 'line-through' : 'none', color: cancel ? C.ink4 : C.ink }}>{fmtHM(s.inicio)} – {fmtHM(s.fin)}{s.reprogramadaDesde !== undefined && <div style={{ fontSize: 11.5, color: C.ink4 }}>antes {fmtHM(s.reprogramadaDesde)}</div>}</td>
                            <td>{s.duracionMin} min</td>
                            <td>{cancel ? <span style={{ color: C.ink3 }}>Cancelada{s.motivoCancelacion ? ` · ${s.motivoCancelacion}` : ''}</span> : <span style={{ color: C.danna }}>Planificada</span>}</td>
                            <td>
                              {cancel ? null : !abierta ? (
                                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button type="button" className="bt-btn" onClick={() => { setAccion({ n: s.n, tipo: 'reprogramar' }); setHora(sinDia(s.inicio)); setErrorOp(null); }}>Reprogramar</button>
                                  <button type="button" className="bt-btn" onClick={() => { setAccion({ n: s.n, tipo: 'cancelar' }); setErrorOp(null); }}>Cancelar</button>
                                </span>
                              ) : accion!.tipo === 'cancelar' ? (
                                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <select className="bt-in" style={{ width: 'auto' }} aria-label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
                                  <button type="button" className="bt-btn bt-peligro" onClick={() => confirmarCancelar(s.n)}>Confirmar cancelación</button>
                                  <button type="button" className="bt-btn" onClick={() => setAccion(null)}>Volver</button>
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <input className="bt-in" style={{ width: 120 }} type="time" aria-label="Nueva hora de inicio" value={hora} onChange={(e) => setHora(e.target.value)} />
                                  <button type="button" className="bt-btn bt-prim" onClick={() => confirmarReprogramar(s.n)}>Aplicar</button>
                                  <button type="button" className="bt-btn" onClick={() => { setAccion(null); setErrorOp(null); }}>Volver</button>
                                </span>
                              )}
                              {abierta && errorOp && <div role="alert" style={{ color: C.err, fontSize: 12.5, marginTop: 6, maxWidth: 360 }}>✕ {errorOp}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: C.ink4 }}>
                Cancelar una sesión no mueve las demás, no acorta los descansos y no deja una sesión pendiente. Reprogramar conserva la duración: no se prolonga para recuperar tiempo.
              </p>
            </section>

            {plan.historial.length > 0 && (
              <section className="bt-card" aria-label="Cambios del plan">
                <h2 className="bt-h">Cambios del plan</h2>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: C.ink2, display: 'grid', gap: 4 }}>
                  {plan.historial.map((e, i) => <li key={i}>{hhmm(e.ts)} · sesión {e.n} {e.tipo === 'cancelada' ? 'cancelada' : 'reprogramada'} ({e.detalle})</li>)}
                </ul>
                <div style={{ marginTop: 10 }}><button type="button" className="bt-btn" onClick={() => { setOps([]); setAccion(null); setErrorOp(null); }}>Deshacer todos los cambios</button></div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
