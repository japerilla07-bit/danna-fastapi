// BITÁCORA — vista de planificación y cierre de la jornada (/app/bitacora).
//
// Capa independiente: no lee ni escribe nada del motor ni del store de telemetría.
//   · Antes de jugar: planificas la jornada (horarios, descansos, comidas).
//   · Después de cada sesión (nunca en vivo): llenas su cierre en unos minutos.
//   · Todo se guarda en el servidor, por usuario (ver sincronizador.ts), con copia en este navegador.

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { C, FONT_NUM, FONT_UI, rgba } from '@/components/pilot/theme';
import { CierreSesion, fmtCOP } from './CierreSesion';
import { LineaDeTiempo } from './LineaDeTiempo';
import { MisJornadas, ResumenDia } from './PanelesJornada';
import type { ItemJornada } from './PanelesJornada';
import { descargarTexto } from './descargar';
import { docPlan, normalizarDoc } from './documento';
import type { DocJornada } from './documento';
import type { OpPlan } from './borrador';
import { cfgPorDefecto, construirPlan, fmtHM, GIRO_OBSERVACION_DEFECTO, reprogramarSesion } from './planner';
import { cierresHuerfanos, csvJornadas, etiquetaEstado, registroVacio, resultadoSesion, resumenJornada } from './registro';
import { crearServicio } from './servicio';
import type { JornadaServidor } from './servicio';
import type { EstadoSync } from './sincronizador';
import type { BloqueCfg, Modalidad, PlanCfg } from './types';
import { useJornada } from './useJornada';

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
.bt-cierre{display:grid;gap:14px;padding:14px;background:${C.bg2};border:1px solid ${C.line2};border-radius:10px}
.bt-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.bt-q{font-size:13.5px;color:${C.ink2};padding:0}
.bt-link{background:none;border:0;padding:0;margin:0;font:inherit;font-size:12px;color:${C.danna};cursor:pointer;text-align:left;text-decoration:underline}
.bt-link:focus-visible{outline:2px solid ${C.danna};outline-offset:2px}
.bt-banner{margin:0 0 14px;padding:12px 14px;border-radius:10px;border:1px solid ${C.line2};background:${C.bg1};font-size:13.5px;display:grid;gap:8px}
.bt-btn[role="radio"][aria-checked="true"]{font-weight:600}
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

const textoEstado = (e: EstadoSync): { texto: string; color: 'ok' | 'warn' | 'err' | 'gris' } => {
  switch (e.tipo) {
    case 'cargando': return { texto: 'Cargando tu jornada…', color: 'warn' };
    case 'nuevo': return { texto: 'Jornada nueva: se guarda en el servidor con el primer cambio', color: 'gris' };
    case 'pendiente': return { texto: 'Cambios sin enviar al servidor…', color: 'warn' };
    case 'guardando': return { texto: 'Guardando en el servidor…', color: 'warn' };
    case 'sincronizado': return { texto: e.guardadoEn ? `Guardado en el servidor a las ${hhmm(e.guardadoEn)}` : 'Guardado en el servidor', color: 'ok' };
    case 'error': return { texto: e.mensaje, color: 'err' };
    case 'sin_servidor': return { texto: e.mensaje, color: 'err' };
    case 'conflicto': return { texto: 'Esta jornada cambió en otra pantalla: elige con cuál te quedas', color: 'err' };
    case 'sin_sesion': return { texto: e.mensaje, color: 'err' };
  }
};
const cierresRegistrados = (d: DocJornada): number => Object.values(d.registros).filter((g) => g.estado !== 'pendiente').length;

export function PlanificadorPage() {
  const { snap, editar, abrir, reintentar, resolver } = useJornada(hoyLocal());
  const doc = snap.doc, cfg = doc.cfg;
  const { plan, descartadas } = useMemo(() => docPlan({ cfg: doc.cfg, ops: doc.ops }), [doc.cfg, doc.ops]);
  const resumen = useMemo(() => resumenJornada(plan, doc.registros), [plan, doc.registros]);
  const huerfanos = useMemo(() => cierresHuerfanos(plan, doc.registros), [plan, doc.registros]);
  const cargando = snap.estado.tipo === 'cargando';

  const [accion, setAccion] = useState<{ n: number; tipo: 'cancelar' | 'reprogramar' | 'cierre' } | null>(null);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [hora, setHora] = useState('');
  const [errorOp, setErrorOp] = useState<string | null>(null);
  const [confirmarReset, setConfirmarReset] = useState(false);
  const [lista, setLista] = useState<JornadaServidor[]>([]);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  // Lista de mis jornadas: se lee del servidor al abrir la pantalla y cuando nace una jornada nueva (su primer guardado).
  // Las demás jornadas no cambian al guardar la actual, y la actual se muestra siempre desde la pantalla.
  const primerGuardado = snap.estado.tipo === 'sincronizado' && snap.version === 1;
  useEffect(() => {
    let vivo = true;
    void crearServicio().listar().then((r) => {
      if (!vivo) return;
      if (r.ok) { setLista(r.data); setErrorLista(null); } else if (r.tipo !== 'sin_sesion') setErrorLista('No se pudo leer la lista de jornadas guardadas.');
    });
    return () => { vivo = false; };
  }, [primerGuardado ? cfg.fecha : '']);

  const cambiarDia = (f: string) => { if (/^\d{4}-\d{2}-\d{2}$/.test(f) && f !== cfg.fecha) { setAccion(null); setErrorOp(null); void abrir(f); } };

  const set = (p: Partial<PlanCfg>) => editar((d) => ({ ...d, cfg: { ...d.cfg, ...p } }));
  const proponer = (c: PlanCfg) => { const s = construirPlan({ ...c, modalidad: 'equilibrada' }).sesiones; return s.length ? s.map((x) => ({ inicio: sinDia(x.inicio) })) : Array.from({ length: Number.isInteger(c.numSesiones) && c.numSesiones > 0 ? Math.min(c.numSesiones, 12) : 1 }, () => ({ inicio: '' })); };
  const cambiarNum = (n: number) => editar((d) => {
    const c = d.cfg; const next: PlanCfg = { ...c, numSesiones: n };
    if (c.modalidad === 'manual' && Number.isInteger(n) && n >= 1 && n <= 12) { const m = [...(c.manuales ?? [])]; while (m.length < n) m.push({ inicio: '' }); next.manuales = m.slice(0, n); }
    return { ...d, cfg: next };
  });
  const cambiarModalidad = (m: Modalidad) => editar((d) => { const c = d.cfg; return { ...d, cfg: { ...c, modalidad: m, desdeHora: m === 'desde' && !c.desdeHora ? c.inicioDisponible : c.desdeHora, manuales: m === 'manual' && !(c.manuales?.length) ? proponer(c) : c.manuales } }; });
  const setBloque = (i: number, p: Partial<BloqueCfg>) => editar((d) => ({ ...d, cfg: { ...d.cfg, bloques: d.cfg.bloques.map((b, k) => (k === i ? { ...b, ...p } : b)) } }));
  const addBloque = (tipo: BloqueCfg['tipo']) => editar((d) => ({ ...d, cfg: { ...d.cfg, bloques: [...d.cfg.bloques, { tipo, inicio: tipo === 'desayuno' ? '07:30' : tipo === 'almuerzo' ? '12:30' : '10:30', duracionMin: tipo === 'almuerzo' ? 60 : 30 }] } }));
  const setManual = (i: number, p: { inicio?: string; duracionMin?: number | undefined }) => editar((d) => ({ ...d, cfg: { ...d.cfg, manuales: (d.cfg.manuales ?? []).map((m, k) => (k === i ? { ...m, ...p } : m)) } }));
  const setLim = (k: keyof NonNullable<PlanCfg['limites']>, v: number | null) => editar((d) => ({ ...d, cfg: { ...d.cfg, limites: { ...(d.cfg.limites ?? {}), [k]: v } } }));
  const pushOp = (op: OpPlan) => editar((d) => ({ ...d, ops: [...d.ops, op] }));

  const ahora = () => new Date().toISOString();
  const confirmarCancelar = (n: number) => { pushOp({ tipo: 'cancelar', n, motivo, ts: ahora() }); setAccion(null); setErrorOp(null); };
  const confirmarReprogramar = (n: number) => {
    const r = reprogramarSesion(plan, n, hora, ahora());
    if (!r.ok) { setErrorOp(r.hallazgos.map((h) => h.mensaje).join(' ')); return; }
    pushOp({ tipo: 'reprogramar', n, hora, ts: ahora() }); setAccion(null); setErrorOp(null);
  };
  const reset = () => { editar((d) => ({ ...d, cfg: cfgPorDefecto(d.cfg.fecha), ops: [] })); setConfirmarReset(false); setAccion(null); setErrorOp(null); };

  // ── Cierre por sesión ──
  const guardarCierre = (n: number, r: ReturnType<typeof registroVacio>) => { editar((d) => ({ ...d, registros: { ...d.registros, [String(n)]: { ...r, n, actualizadoEn: ahora() } } })); setAccion(null); };
  const quitarCierre = (n: number) => { editar((d) => { const { [String(n)]: _x, ...resto } = d.registros; return { ...d, registros: resto }; }); setAccion(null); };
  const saldoAnterior = (n: number): { saldo: number | null; num: number | null } => {
    for (let i = plan.sesiones.length - 1; i >= 0; i--) {
      const s = plan.sesiones[i]; if (s.n >= n || s.estado === 'cancelada') continue;
      const g = doc.registros[String(s.n)]; if (g && g.saldoFinal !== null) return { saldo: g.saldoFinal, num: s.n };
    }
    return { saldo: null, num: null };
  };

  // ── Descargas ──
  const exportActual = () => ({ plan, registros: doc.registros, notasDia: doc.notasDia });
  const descargarDia = () => descargarTexto(`bitacora_${cfg.fecha}.csv`, csvJornadas([exportActual()]), 'text/csv', true);
  const jornadasExport = () => {
    const otras = lista.filter((j) => j.fecha !== cfg.fecha).flatMap((j) => { const d = normalizarDoc(j.doc); return d ? [{ plan: docPlan(d).plan, registros: d.registros, notasDia: d.notasDia }] : []; });
    return [...otras, exportActual()];
  };
  const descargarTodas = () => descargarTexto(`bitacora_todas_${hoyLocal()}.csv`, csvJornadas(jornadasExport()), 'text/csv', true);
  const descargarRespaldo = () => descargarTexto(`bitacora_respaldo_${cfg.fecha}.json`, JSON.stringify({ exportado: ahora(), jornada: doc }, null, 2), 'application/json');
  const items: ItemJornada[] = useMemo(() => {
    const m = new Map<string, DocJornada>();
    for (const j of lista) { const d = normalizarDoc(j.doc); if (d) m.set(j.fecha, d); }
    if (snap.estado.tipo !== 'cargando' && snap.estado.tipo !== 'nuevo') m.set(cfg.fecha, doc);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([fecha, d]) => { const r = resumenJornada(docPlan(d).plan, d.registros); return { fecha, registradas: r.registradas, activas: r.sesionesActivas, resultado: r.resultadoTotal }; });
  }, [lista, doc, cfg.fecha, snap.estado.tipo]);

  const errores = plan.hallazgos.filter((h) => h.nivel === 'error'), avisos = plan.hallazgos.filter((h) => h.nivel === 'aviso');
  const hayActivas = plan.sesiones.some((s) => s.estado !== 'cancelada');
  const stat = (t: string, v: string, col: string = C.ink): ReactNode => (
    <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: C.ink4 }}>{t}</div>
      <div style={{ fontFamily: FONT_NUM, fontSize: 26, fontWeight: 600, lineHeight: '30px', color: col }}>{v}</div>
    </div>
  );
  const est = textoEstado(snap.estado);
  const colEst = est.color === 'ok' ? C.ok : est.color === 'warn' ? C.warn : est.color === 'err' ? C.err : C.ink4;
  const dot: CSSProperties = { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 7, background: colEst, flex: '0 0 auto' };
  const e = snap.estado;

  return (
    <div className="bt-root">
      <style>{CSS}</style>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.line}`, background: rgba(C.bg1, 0.97), position: 'sticky', top: 0, zIndex: 20 }}>
        <Link to="/app" className="bt-btn" style={{ textDecoration: 'none' }} aria-label="Volver a D.A.N.N.A.">← D.A.N.N.A.</Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Bitácora · Jornada y cierre de sesiones</h1>
        <span role="status" aria-live="polite" style={{ marginLeft: 'auto', fontSize: 13, color: est.color === 'err' ? C.err : C.ink2, display: 'inline-flex', alignItems: 'center', maxWidth: 520 }}>
          <span style={dot} aria-hidden />{est.texto}
          {(e.tipo === 'error' || e.tipo === 'sin_servidor') && <button type="button" className="bt-btn" style={{ marginLeft: 10 }} onClick={() => void reintentar()}>Reintentar ahora</button>}
        </span>
      </header>

      <main style={{ maxWidth: 1500, margin: '0 auto', padding: 20 }}>
        {e.tipo === 'conflicto' && (
          <div className="bt-banner" role="alert" style={{ borderColor: C.err, position: 'sticky', top: 74, zIndex: 15 }}>
            <div><strong style={{ color: C.err }}>Esta jornada se modificó desde otra pantalla o dispositivo.</strong> No se ha pisado nada. Elige con cuál versión te quedas:</div>
            <div style={{ color: C.ink3, fontSize: 13 }}>
              Servidor: {e.servidor.doc ? `${cierresRegistrados(e.servidor.doc)} cierre(s) registrado(s)` : 'sin datos'}{e.servidor.actualizado ? `, guardado a las ${hhmm(e.servidor.actualizado)}` : ''} · La tuya (en esta pantalla): {cierresRegistrados(doc)} cierre(s) registrado(s)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="bt-btn bt-prim" disabled={!e.servidor.doc} onClick={() => void resolver('servidor')}>Quedarme con la del servidor</button>
              <button type="button" className="bt-btn bt-peligro" onClick={() => void resolver('mio')}>Quedarme con la mía (reemplaza la del servidor)</button>
            </div>
            <div style={{ color: C.ink4, fontSize: 12.5 }}>La versión que descartes queda en el historial del servidor.</div>
          </div>
        )}
        {e.tipo === 'sin_sesion' && (
          <div className="bt-banner" role="alert" style={{ borderColor: C.err }}>
            <div><strong style={{ color: C.err }}>Tu sesión expiró.</strong> Tus cambios siguen guardados en este navegador. <a href="/login" target="_blank" rel="noopener" style={{ color: C.danna }}>Inicia sesión en otra pestaña</a> y luego recarga esta página: se enviarán solos.</div>
          </div>
        )}
        {snap.recuperado && e.tipo !== 'conflicto' && (
          <div className="bt-banner" role="status" style={{ borderColor: C.warn }}>Recuperé cambios de este navegador que no habían llegado al servidor{e.tipo === 'pendiente' || e.tipo === 'guardando' ? ': se están enviando ahora' : ''}.</div>
        )}
        {snap.avisoBorrador && <div className="bt-banner" role="status" style={{ color: C.warn }}>⚠ {snap.avisoBorrador}</div>}

        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: C.ink3, maxWidth: 900 }}>
          Planifica antes de jugar y llena el cierre de cada sesión cuando termines (nunca en vivo). Todo queda guardado en tu cuenta y no cambia nada del motor.
        </p>
        {cargando ? <div className="bt-card" style={{ color: C.ink3 }}>Cargando tu jornada…</div> : (
        <div className="bt-grid">
          {/* ── Configuración ── */}
          <section className="bt-card" aria-label="Configuración de la jornada">
            <h2 className="bt-h">Jornada</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><Campo etiqueta="Fecha" ayuda="Al cambiarla se abre la jornada de ese día (si ya existe, la ves tal cual)."><input className="bt-in" type="date" value={cfg.fecha} onChange={(ev) => cambiarDia(ev.target.value)} /></Campo></div>
              <Campo etiqueta="Hora de inicio disponible"><input className="bt-in" type="time" value={cfg.inicioDisponible} onChange={(ev) => set({ inicioDisponible: ev.target.value })} /></Campo>
              <Campo etiqueta="Hora límite de finalización" ayuda={plan.cruzaMedianoche ? 'Termina en el día siguiente.' : undefined}><input className="bt-in" type="time" value={cfg.limiteFin} onChange={(ev) => set({ limiteFin: ev.target.value })} /></Campo>
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
                  <Campo etiqueta="Tipo"><select className="bt-in" value={b.tipo} onChange={(ev) => setBloque(i, { tipo: ev.target.value as BloqueCfg['tipo'] })}><option value="desayuno">Desayuno</option><option value="almuerzo">Almuerzo</option><option value="pausa">Otra pausa</option></select></Campo>
                  <Campo etiqueta="Inicio"><input className="bt-in" type="time" value={b.inicio} onChange={(ev) => setBloque(i, { inicio: ev.target.value })} /></Campo>
                  <Campo etiqueta="Min"><Num value={b.duracionMin} min={5} max={480} step={5} aria-label="Duración en minutos" onChange={(v) => setBloque(i, { duracionMin: v })} /></Campo>
                  <button type="button" className="bt-btn bt-peligro" aria-label={`Quitar ${b.tipo}`} onClick={() => editar((d) => ({ ...d, cfg: { ...d.cfg, bloques: d.cfg.bloques.filter((_, k) => k !== i) } }))}>✕</button>
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
            {cfg.modalidad === 'desde' && <div style={{ marginTop: 10 }}><Campo etiqueta="Empezar a partir de"><input className="bt-in" type="time" value={cfg.desdeHora ?? ''} onChange={(ev) => set({ desdeHora: ev.target.value })} /></Campo></div>}
            {cfg.modalidad === 'manual' && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {(cfg.manuales ?? []).map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <Campo etiqueta={`Sesión ${i + 1} · inicio`}><input className="bt-in" type="time" value={m.inicio} onChange={(ev) => setManual(i, { inicio: ev.target.value })} /></Campo>
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
                <textarea className="bt-in" rows={3} value={(cfg.reglasSalida ?? []).join('\n')} onChange={(ev) => set({ reglasSalida: ev.target.value.split('\n') })} />
              </Campo>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {!confirmarReset ? <button type="button" className="bt-btn" onClick={() => setConfirmarReset(true)}>Restablecer el plan</button>
                : (<><span style={{ fontSize: 13, color: C.warn }}>¿Volver al plan por defecto? (los cierres registrados se conservan)</span><button type="button" className="bt-btn bt-peligro" onClick={reset}>Sí, restablecer</button><button type="button" className="bt-btn" onClick={() => setConfirmarReset(false)}>No</button></>)}
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
                    <button type="button" className="bt-btn" onClick={() => editar((x) => ({ ...x, ops: x.ops.filter((o) => o !== d.op) }))}>Quitar</button>
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
                        const g = doc.registros[String(s.n)], cerrada = !!g && g.estado !== 'pendiente';
                        const res = g ? resultadoSesion(g) : null;
                        return [
                          <tr key={s.n}>
                            <td style={{ fontFamily: FONT_NUM, fontSize: 18, fontWeight: 600 }}>S{s.n}</td>
                            <td style={{ textDecoration: cancel ? 'line-through' : 'none', color: cancel ? C.ink4 : C.ink }}>{fmtHM(s.inicio)} – {fmtHM(s.fin)}{s.reprogramadaDesde !== undefined && <div style={{ fontSize: 11.5, color: C.ink4 }}>antes {fmtHM(s.reprogramadaDesde)}</div>}</td>
                            <td>{s.duracionMin} min</td>
                            <td>
                              {cancel ? <span style={{ color: C.ink3 }}>Cancelada{s.motivoCancelacion ? ` · ${s.motivoCancelacion}` : ''}</span> : <span style={{ color: C.danna }}>Planificada</span>}
                              {!cancel && (cerrada
                                ? <div style={{ fontSize: 12.5, color: g!.estado === 'cumplida' ? C.ok : g!.estado === 'parcial' ? C.warn : C.err }}>{etiquetaEstado(g!.estado)}{res !== null && <span style={{ color: res > 0 ? C.ok : res < 0 ? C.err : C.ink2 }}> · {res > 0 ? '+' : ''}{fmtCOP(res)}</span>}</div>
                                : <div style={{ fontSize: 12.5, color: C.ink4 }}>Cierre sin registrar</div>)}
                            </td>
                            <td>
                              {cancel ? null : !abierta ? (
                                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button type="button" className="bt-btn bt-prim" onClick={() => { setAccion({ n: s.n, tipo: 'cierre' }); setErrorOp(null); }}>{cerrada ? 'Editar cierre' : 'Registrar cierre'}</button>
                                  <button type="button" className="bt-btn" onClick={() => { setAccion({ n: s.n, tipo: 'reprogramar' }); setHora(sinDia(s.inicio)); setErrorOp(null); }}>Reprogramar</button>
                                  <button type="button" className="bt-btn" onClick={() => { setAccion({ n: s.n, tipo: 'cancelar' }); setErrorOp(null); }}>Cancelar</button>
                                </span>
                              ) : accion!.tipo === 'cancelar' ? (
                                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <select className="bt-in" style={{ width: 'auto' }} aria-label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
                                  <button type="button" className="bt-btn bt-peligro" onClick={() => confirmarCancelar(s.n)}>Confirmar cancelación</button>
                                  <button type="button" className="bt-btn" onClick={() => setAccion(null)}>Volver</button>
                                </span>
                              ) : accion!.tipo === 'reprogramar' ? (
                                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <input className="bt-in" style={{ width: 120 }} type="time" aria-label="Nueva hora de inicio" value={hora} onChange={(ev) => setHora(ev.target.value)} />
                                  <button type="button" className="bt-btn bt-prim" onClick={() => confirmarReprogramar(s.n)}>Aplicar</button>
                                  <button type="button" className="bt-btn" onClick={() => { setAccion(null); setErrorOp(null); }}>Volver</button>
                                </span>
                              ) : <span style={{ fontSize: 12.5, color: C.ink3 }}>Llenando el cierre…</span>}
                              {abierta && errorOp && <div role="alert" style={{ color: C.err, fontSize: 12.5, marginTop: 6, maxWidth: 360 }}>✕ {errorOp}</div>}
                            </td>
                          </tr>,
                          abierta && accion!.tipo === 'cierre' && (
                            <tr key={`c${s.n}`}><td colSpan={5} style={{ padding: '4px 0 12px' }}>
                              <CierreSesion key={`${cfg.fecha}-${s.n}`} sesion={s} inicial={g ?? registroVacio(s.n)} saldoFinalAnterior={saldoAnterior(s.n).saldo} numAnterior={saldoAnterior(s.n).num}
                                onGuardar={(r) => guardarCierre(s.n, r)} onQuitar={() => quitarCierre(s.n)} onCancelar={() => setAccion(null)} />
                            </td></tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: C.ink4 }}>
                Cancelar una sesión no mueve las demás, no acorta los descansos y no deja una sesión pendiente. Reprogramar conserva la duración: no se prolonga para recuperar tiempo.
              </p>
            </section>

            <ResumenDia resumen={resumen} huerfanos={huerfanos} notasDia={doc.notasDia} onNotas={(t) => editar((d) => ({ ...d, notasDia: t }))}
              onDescargarDia={descargarDia} onDescargarTodas={descargarTodas} onDescargarRespaldo={descargarRespaldo} totalJornadas={items.length} />

            {plan.historial.length > 0 && (
              <section className="bt-card" aria-label="Cambios del plan">
                <h2 className="bt-h">Cambios del plan</h2>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: C.ink2, display: 'grid', gap: 4 }}>
                  {plan.historial.map((ev, i) => <li key={i}>{hhmm(ev.ts)} · sesión {ev.n} {ev.tipo === 'cancelada' ? 'cancelada' : 'reprogramada'} ({ev.detalle})</li>)}
                </ul>
                <div style={{ marginTop: 10 }}><button type="button" className="bt-btn" onClick={() => { editar((d) => ({ ...d, ops: [] })); setAccion(null); setErrorOp(null); }}>Deshacer todos los cambios del plan</button></div>
              </section>
            )}

            <MisJornadas items={items} actual={cfg.fecha} onAbrir={cambiarDia} error={errorLista} />
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
