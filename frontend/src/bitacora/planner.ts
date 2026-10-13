// BITÁCORA — planificador de jornada (lógica pura).
//
// Propone y valida horarios; NO toca el motor, no lee el reloj, no usa red ni
// almacenamiento. Misma entrada → misma salida. Nunca muta su entrada.
//
// Reglas que garantiza (cada una tiene su prueba en tests/bitacora/planner.test.ts):
//   · ninguna sesión se solapa con otra ni con un bloque protegido (desayuno, almuerzo, pausas);
//   · entre dos sesiones hay siempre, como mínimo, el descanso configurado;
//   · todo cabe dentro de [inicio disponible, límite] o el plan se marca NO viable y se dice por qué;
//   · cruzar la medianoche se detecta y se avisa (no se oculta);
//   · cancelar una sesión NO mueve las demás, NO comprime descansos y NO crea una obligación pendiente;
//   · reprogramar mantiene la duración (no se prolongan sesiones para recuperar tiempo).

import type {
  BloquePlan, Descanso, EventoPlan, Hallazgo, Minutos, Plan, PlanCfg, ResultadoOp, SesionPlan,
} from './types';

export const GIRO_OBSERVACION_DEFECTO = 80;
const DIA = 1440;
const PASO = 5;
const MAX_SESIONES = 12;

// ── Horas y fechas ───────────────────────────────────────────────────────────

/** "HH:MM" estricto (00:00–23:59) → minutos desde la medianoche; null si no es válida. */
export function parseHM(s: unknown): Minutos | null {
  if (typeof s !== 'string') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutos → "HH:MM"; si pasa de la medianoche agrega " (+1)". */
export function fmtHM(m: Minutos): string {
  const dia = Math.floor(m / DIA);
  const r = ((m % DIA) + DIA) % DIA;
  const hh = String(Math.floor(r / 60)).padStart(2, '0'), mm = String(r % 60).padStart(2, '0');
  return `${hh}:${mm}${dia >= 1 ? ` (+${dia})` : ''}`;
}

/** "YYYY-MM-DD" y fecha real del calendario. */
export function fechaValida(s: unknown): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, mo, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(y, mo - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d;
}

const piso5 = (x: number) => Math.floor(x / PASO) * PASO;
const etiqueta = (t: 'desayuno' | 'almuerzo' | 'pausa') => (t === 'desayuno' ? 'Desayuno' : t === 'almuerzo' ? 'Almuerzo' : 'Pausa');
const clave = (h: Hallazgo) => `${h.codigo}|${h.sesion ?? ''}|${h.mensaje}`;

// ── Validación de una distribución concreta (se usa para el plan y para reprogramar) ─────

const CODIGOS_DISTRIBUCION = new Set(['FUERA_DE_JORNADA', 'EN_BLOQUE_PROTEGIDO', 'SOLAPADAS', 'DESCANSO_CORTO']);

export function validarDistribucion(
  sesiones: ReadonlyArray<Pick<SesionPlan, 'n' | 'inicio' | 'fin'>>,
  bloques: ReadonlyArray<BloquePlan>,
  inicio: Minutos,
  limite: Minutos,
  descansoMin: number,
): Hallazgo[] {
  const h: Hallazgo[] = [];
  for (const s of sesiones) {
    if (s.inicio < inicio || s.fin > limite) {
      h.push({ codigo: 'FUERA_DE_JORNADA', nivel: 'error', sesion: s.n, mensaje: `La sesión ${s.n} (${fmtHM(s.inicio)}–${fmtHM(s.fin)}) queda fuera de la jornada (${fmtHM(inicio)}–${fmtHM(limite)}).` });
    }
    for (const b of bloques) {
      if (s.inicio < b.fin && s.fin > b.inicio) {
        h.push({ codigo: 'EN_BLOQUE_PROTEGIDO', nivel: 'error', sesion: s.n, mensaje: `La sesión ${s.n} (${fmtHM(s.inicio)}–${fmtHM(s.fin)}) se solapa con ${b.nombre} (${fmtHM(b.inicio)}–${fmtHM(b.fin)}).` });
      }
    }
  }
  const ord = [...sesiones].sort((a, b) => a.inicio - b.inicio || a.n - b.n);
  for (let i = 1; i < ord.length; i++) {
    const a = ord[i - 1], b = ord[i];
    if (b.inicio < a.fin) {
      h.push({ codigo: 'SOLAPADAS', nivel: 'error', sesion: b.n, mensaje: `Las sesiones ${a.n} y ${b.n} se solapan (${fmtHM(a.inicio)}–${fmtHM(a.fin)} y ${fmtHM(b.inicio)}–${fmtHM(b.fin)}).` });
    } else if (b.inicio - a.fin < descansoMin) {
      h.push({ codigo: 'DESCANSO_CORTO', nivel: 'error', sesion: b.n, mensaje: `Entre las sesiones ${a.n} y ${b.n} hay ${b.inicio - a.fin} min de descanso; el mínimo es ${descansoMin} min.` });
    }
  }
  return h;
}

// ── Colocación automática ───────────────────────────────────────────────────

/** Primer inicio ≥ objetivo que respeta el descanso mínimo y no pisa ningún bloque protegido. */
function colocar(objetivo: Minutos, dur: number, prevFin: Minutos | null, bloques: ReadonlyArray<BloquePlan>, descansoMin: number): Minutos {
  let t = objetivo;
  if (prevFin !== null) t = Math.max(t, prevFin + descansoMin);
  for (;;) {
    const b = bloques.find((x) => t < x.fin && t + dur > x.inicio);
    if (!b) return t;
    t = b.fin;                    // salta el bloque: el descanso mínimo se conserva porque t solo crece
  }
}

/** Sesiones pegadas lo más temprano posible desde `desde`; se detiene al llegar al límite. */
function compacto(n: number, dur: number, desde: Minutos, limite: number, bloques: ReadonlyArray<BloquePlan>, descansoMin: number): Array<{ inicio: Minutos; fin: Minutos }> {
  const out: Array<{ inicio: Minutos; fin: Minutos }> = [];
  let prevFin: Minutos | null = null;
  for (let i = 0; i < n; i++) {
    const t = colocar(desde, dur, prevFin, bloques, descansoMin);
    if (t + dur > limite) break;
    out.push({ inicio: t, fin: t + dur }); prevFin = t + dur;
  }
  return out;
}

/** Reparte la holgura entre los huecos para que los descansos queden parejos. Devuelve null si el reparto no cabe. */
function equilibrado(n: number, dur: number, inicio: Minutos, limite: number, bloques: ReadonlyArray<BloquePlan>, descansoMin: number): Array<{ inicio: Minutos; fin: Minutos }> | null {
  const base = compacto(n, dur, inicio, limite, bloques, descansoMin);
  if (base.length < n) return null;
  if (n === 1) return base;
  const holgura = limite - base[n - 1].fin;
  const out: Array<{ inicio: Minutos; fin: Minutos }> = [];
  let prevFin: Minutos | null = null;
  for (let i = 0; i < n; i++) {
    const t = colocar(base[i].inicio + piso5((holgura * i) / (n - 1)), dur, prevFin, bloques, descansoMin);
    if (t + dur > limite) return null;
    out.push({ inicio: t, fin: t + dur }); prevFin = t + dur;
  }
  return out;
}

// ── Cálculo derivado (descansos, tiempos, viabilidad) ───────────────────────

const activas = (s: ReadonlyArray<SesionPlan>) => s.filter((x) => x.estado !== 'cancelada');

function derivar(p: Omit<Plan, 'descansos' | 'finPrevisto' | 'tiempoEfectivoMin' | 'tiempoTotalMin' | 'viable'>): Plan {
  const act = [...activas(p.sesiones)].sort((a, b) => a.inicio - b.inicio || a.n - b.n);
  const descansos: Descanso[] = [];
  for (let i = 1; i < act.length; i++) {
    descansos.push({ desde: act[i - 1].fin, hasta: act[i].inicio, duracionMin: act[i].inicio - act[i - 1].fin, entre: [act[i - 1].n, act[i].n] });
  }
  const efectivo = act.reduce((a, s) => a + s.duracionMin, 0);
  const fin = act.length ? Math.max(...act.map((s) => s.fin)) : null;
  const total = act.length ? fin! - act[0].inicio : 0;
  return { ...p, descansos, finPrevisto: fin, tiempoEfectivoMin: efectivo, tiempoTotalMin: total, viable: !p.hallazgos.some((h) => h.nivel === 'error') };
}

// ── Construcción del plan ───────────────────────────────────────────────────

export function construirPlan(cfg: PlanCfg): Plan {
  const hall: Hallazgo[] = [];
  const err = (codigo: string, mensaje: string, sesion?: number) => hall.push({ codigo, nivel: 'error', mensaje, sesion });
  const avi = (codigo: string, mensaje: string, sesion?: number) => hall.push({ codigo, nivel: 'aviso', mensaje, sesion });

  if (!fechaValida(cfg.fecha)) err('FECHA_INVALIDA', 'La fecha de la jornada no es válida (usa AAAA-MM-DD).');

  // Ventana de la jornada
  const ini = parseHM(cfg.inicioDisponible), lim0 = parseHM(cfg.limiteFin);
  if (ini === null) err('HORA_INVALIDA', 'La hora de inicio disponible no es válida (HH:MM).');
  if (lim0 === null) err('HORA_INVALIDA', 'La hora límite de finalización no es válida (HH:MM).');
  let inicio = ini ?? 0, limite = lim0 ?? 0, cruza = false;
  if (ini !== null && lim0 !== null) {
    if (lim0 === ini) err('LIMITE_IGUAL_INICIO', 'La hora límite es igual a la de inicio: la jornada no tiene tiempo.');
    else if (lim0 < ini) { limite = lim0 + DIA; cruza = true; avi('CRUCE_MEDIANOCHE', `La jornada cruza la medianoche: termina a las ${fmtHM(limite)}, ya en el día siguiente.`); }
  }
  const ventana = ini !== null && lim0 !== null && limite > inicio;

  // Parámetros numéricos
  const n = cfg.numSesiones, dur = cfg.duracionSesionMin, desc = cfg.descansoMinMin;
  const esManual = cfg.modalidad === 'manual';
  if (!esManual && !(Number.isInteger(n) && n >= 1 && n <= MAX_SESIONES)) err('NUM_SESIONES_INVALIDO', `El número de sesiones debe ser un entero entre 1 y ${MAX_SESIONES}.`);
  if (!(Number.isInteger(dur) && dur >= 5 && dur <= 480)) err('DURACION_INVALIDA', 'La duración de cada sesión debe ser un entero entre 5 y 480 minutos.');
  if (!(Number.isInteger(desc) && desc >= 0 && desc <= 240)) err('DESCANSO_INVALIDO', 'El descanso mínimo debe ser un entero entre 0 y 240 minutos.');
  const go = cfg.giroObservacion;
  if (go !== undefined && !(Number.isInteger(go) && go >= 0 && go <= 1000)) err('OBSERVACION_INVALIDA', 'Los giros de observación deben ser un entero entre 0 y 1000.');

  // Referencias económicas (solo se validan; no se aplican)
  const L = cfg.limites ?? {};
  for (const [k, v] of Object.entries(L)) if (v != null && !(typeof v === 'number' && isFinite(v) && v >= 0)) err('LIMITE_INVALIDO', `El valor de «${k}» debe ser un número mayor o igual a 0.`);
  if (L.perdidaPorSesion != null && L.perdidaJornada != null && L.perdidaJornada < L.perdidaPorSesion) avi('LIMITES_INCOHERENTES', 'El límite de pérdida de la jornada es menor que el de una sola sesión.');
  if (L.metaPorSesion != null && L.metaJornada != null && L.metaJornada < L.metaPorSesion) avi('METAS_INCOHERENTES', 'La meta de la jornada es menor que la de una sola sesión.');

  // Bloques protegidos
  const bloques: BloquePlan[] = [];
  if (ventana) {
    for (const b of cfg.bloques) {
      const nombre = b.nombre?.trim() || etiqueta(b.tipo);
      const s = parseHM(b.inicio);
      if (s === null || !Number.isInteger(b.duracionMin) || b.duracionMin <= 0 || b.duracionMin > 480) { err('BLOQUE_INVALIDO', `${nombre}: hora o duración inválida.`); continue; }
      let puesto = false;
      for (const d of cruza ? [0, DIA] : [0]) {
        const bi = s + d, bf = bi + b.duracionMin;
        if (bi < limite && bf > inicio) { bloques.push({ tipo: b.tipo, nombre, inicio: bi, fin: bf }); puesto = true; break; }
      }
      if (!puesto) avi('BLOQUE_FUERA_DE_JORNADA', `${nombre} (${b.inicio}) cae fuera de la jornada y no afecta el horario.`);
    }
    bloques.sort((a, b) => a.inicio - b.inicio);
    for (let i = 1; i < bloques.length; i++) if (bloques[i].inicio < bloques[i - 1].fin) err('BLOQUES_SUPERPUESTOS', `${bloques[i - 1].nombre} y ${bloques[i].nombre} se solapan.`);
  }

  // Sesiones
  const crudo: Array<{ inicio: Minutos; fin: Minutos }> = [];
  const parametrosOk = !hall.some((h) => h.nivel === 'error');
  if (ventana && parametrosOk) {
    if (esManual) {
      const man = cfg.manuales ?? [];
      if (man.length === 0) err('SIN_SESIONES_MANUALES', 'En modo manual hay que indicar la hora de cada sesión.');
      else if (man.length > MAX_SESIONES) err('NUM_SESIONES_INVALIDO', `Máximo ${MAX_SESIONES} sesiones.`);
      else {
        if (man.length !== n) avi('NUM_AJUSTADO', `Indicaste ${n} sesiones pero ${man.length} horarios manuales: se usan los ${man.length} horarios.`);
        man.forEach((x, i) => {
          const m = parseHM(x.inicio); const d = x.duracionMin ?? dur;
          if (m === null) { err('HORA_INVALIDA', `La hora de la sesión ${i + 1} no es válida (HH:MM).`, i + 1); return; }
          if (!(Number.isInteger(d) && d >= 5 && d <= 480)) { err('DURACION_INVALIDA', `La duración de la sesión ${i + 1} debe ser un entero entre 5 y 480 minutos.`, i + 1); return; }
          const ini2 = cruza && m < inicio ? m + DIA : m;
          crudo.push({ inicio: ini2, fin: ini2 + d });
        });
        crudo.sort((a, b) => a.inicio - b.inicio);
      }
    } else if (cfg.modalidad === 'concentrada') {
      crudo.push(...compacto(n, dur, inicio, limite, bloques, desc));
    } else if (cfg.modalidad === 'desde') {
      const dh = parseHM(cfg.desdeHora);
      const d2 = dh === null ? null : cruza && dh < inicio ? dh + DIA : dh;
      if (d2 === null || d2 < inicio || d2 >= limite) err('DESDE_INVALIDA', 'La hora «desde» debe estar dentro de la jornada.');
      else crudo.push(...compacto(n, dur, d2, limite, bloques, desc));
    } else if (cfg.modalidad === 'equilibrada') {
      crudo.push(...(equilibrado(n, dur, inicio, limite, bloques, desc) ?? compacto(n, dur, inicio, limite, bloques, desc)));
    } else {
      err('MODALIDAD_INVALIDA', 'La modalidad de distribución no es válida.');
    }

    // No cabe: se muestran las que sí caben y se explica cuánto falta
    const automatica = !esManual && (cfg.modalidad === 'concentrada' || cfg.modalidad === 'desde' || cfg.modalidad === 'equilibrada') && !hall.some((h) => h.codigo === 'DESDE_INVALIDA');
    if (automatica && crudo.length < n) {
      const dh = cfg.modalidad === 'desde' ? parseHM(cfg.desdeHora) : null;
      const desde = dh === null ? inicio : cruza && dh < inicio ? dh + DIA : dh;
      const sinLimite = compacto(n, dur, desde, Infinity, bloques, desc);
      const fin = sinLimite.length ? sinLimite[sinLimite.length - 1].fin : inicio;
      err('NO_CABEN', `Solo caben ${crudo.length} de ${n} sesiones de ${dur} min (descanso mínimo ${desc} min y comidas protegidas): terminarían a las ${fmtHM(fin)}, después del límite ${fmtHM(limite)}.`);
    }
  }

  const sesiones: SesionPlan[] = crudo.map((c, i) => ({ n: i + 1, inicio: c.inicio, fin: c.fin, duracionMin: c.fin - c.inicio, estado: 'planificada' }));
  if (ventana && sesiones.length) hall.push(...validarDistribucion(sesiones, bloques, inicio, limite, Number.isInteger(desc) ? desc : 0));

  return derivar({ cfg, inicio, limite, cruzaMedianoche: cruza, sesiones, bloques, hallazgos: hall, historial: [] });
}

// ── Recalcular tras una operación ───────────────────────────────────────────

function recalcular(p: Plan, sesiones: SesionPlan[], historial: EventoPlan[]): Plan {
  const resto = p.hallazgos.filter((h) => !CODIGOS_DISTRIBUCION.has(h.codigo));
  const hall = [...resto, ...validarDistribucion(activas(sesiones), p.bloques, p.inicio, p.limite, p.cfg.descansoMinMin)];
  return derivar({ cfg: p.cfg, inicio: p.inicio, limite: p.limite, cruzaMedianoche: p.cruzaMedianoche, sesiones, bloques: p.bloques, hallazgos: hall, historial });
}

const falla = (plan: Plan, codigo: string, mensaje: string, sesion?: number): ResultadoOp => ({ ok: false, plan, hallazgos: [{ codigo, nivel: 'error', mensaje, sesion }] });

/**
 * Cancela una sesión. No mueve ninguna otra, no comprime descansos y no agrega
 * ninguna sesión pendiente: lo cancelado simplemente deja de contar.
 */
export function cancelarSesion(plan: Plan, n: number, ts: string, motivo = ''): ResultadoOp {
  const s = plan.sesiones.find((x) => x.n === n);
  if (!s) return falla(plan, 'SESION_INEXISTENTE', `No existe la sesión ${n}.`, n);
  if (s.estado === 'cancelada') return falla(plan, 'YA_CANCELADA', `La sesión ${n} ya estaba cancelada.`, n);
  const sesiones = plan.sesiones.map((x) => (x.n === n ? { ...x, estado: 'cancelada' as const, motivoCancelacion: motivo.trim() || undefined } : x));
  const ev: EventoPlan = { tipo: 'cancelada', n, ts, detalle: motivo.trim() || 'sin motivo' };
  return { ok: true, plan: recalcular(plan, sesiones, [...plan.historial, ev]), hallazgos: [] };
}

/**
 * Reprograma una sesión a otra hora. Conserva su duración (no se prolonga) y no
 * mueve las demás. Si la nueva hora rompe alguna regla, el plan queda intacto.
 */
export function reprogramarSesion(plan: Plan, n: number, nuevoInicio: string | Minutos, ts: string): ResultadoOp {
  const s = plan.sesiones.find((x) => x.n === n);
  if (!s) return falla(plan, 'SESION_INEXISTENTE', `No existe la sesión ${n}.`, n);
  if (s.estado === 'cancelada') return falla(plan, 'SESION_CANCELADA', `La sesión ${n} está cancelada; no se puede reprogramar.`, n);
  let m = typeof nuevoInicio === 'string' ? parseHM(nuevoInicio) : nuevoInicio;
  if (m === null || !Number.isFinite(m)) return falla(plan, 'HORA_INVALIDA', 'La nueva hora no es válida (HH:MM).', n);
  if (typeof nuevoInicio === 'string' && plan.cruzaMedianoche && m < plan.inicio) m += DIA;
  if (m === s.inicio) return falla(plan, 'SIN_CAMBIO', `La sesión ${n} ya está a esa hora.`, n);
  const sesiones = plan.sesiones.map((x) => (x.n === n ? { ...x, inicio: m as number, fin: (m as number) + x.duracionMin, reprogramadaDesde: x.reprogramadaDesde ?? x.inicio } : x));
  const antes = new Set(validarDistribucion(activas(plan.sesiones), plan.bloques, plan.inicio, plan.limite, plan.cfg.descansoMinMin).map(clave));
  const nuevos = validarDistribucion(activas(sesiones), plan.bloques, plan.inicio, plan.limite, plan.cfg.descansoMinMin).filter((h) => h.nivel === 'error' && !antes.has(clave(h)));
  if (nuevos.length) return { ok: false, plan, hallazgos: nuevos };
  const ev: EventoPlan = { tipo: 'reprogramada', n, ts, detalle: `${fmtHM(s.inicio)} → ${fmtHM(m)}` };
  return { ok: true, plan: recalcular(plan, sesiones, [...plan.historial, ev]), hallazgos: [] };
}

/** Configuración inicial editable para una fecha (valores típicos; el usuario los ajusta antes de iniciar). */
export function cfgPorDefecto(fecha: string): PlanCfg {
  return {
    fecha, inicioDisponible: '09:00', limiteFin: '17:00', numSesiones: 4, duracionSesionMin: 90, descansoMinMin: 30,
    bloques: [{ tipo: 'almuerzo', inicio: '12:30', duracionMin: 60 }], modalidad: 'equilibrada',
    giroObservacion: GIRO_OBSERVACION_DEFECTO, limites: {}, reglasSalida: [],
  };
}
