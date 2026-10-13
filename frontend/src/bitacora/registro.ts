// BITÁCORA — cierre por sesión: datos, validación, resumen de la jornada y exportación CSV.
//
// Módulo puro (sin React, sin red, sin reloj): lo que entra es lo que sale.
// La validación AVISA, no bloquea: llenar el cierre en 5 minutos al final no debe
// toparse con una pared; los datos incompletos se guardan y se señalan.

import { fmtHM, parseHM } from './planner';
import type { EstadoCierre, Hallazgo, LimitesRef, Plan, RegistroSesion, SesionPlan, SiguioMotor } from './types';

export const ESTADOS_CIERRE: ReadonlyArray<{ id: EstadoCierre; etiqueta: string }> = [
  { id: 'cumplida', etiqueta: 'La cumplí' },
  { id: 'parcial', etiqueta: 'La cumplí a medias' },
  { id: 'no_cumplida', etiqueta: 'No la cumplí' },
];
export const SIGUIO_MOTOR: ReadonlyArray<{ id: Exclude<SiguioMotor, ''>; etiqueta: string }> = [
  { id: 'si', etiqueta: 'Sí, seguí el motor' },
  { id: 'parcial', etiqueta: 'En parte' },
  { id: 'no', etiqueta: 'No lo seguí' },
];
export const SENSACIONES: ReadonlyArray<string> = ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'];
export const MOTIVOS_SALIDA: ReadonlyArray<string> = [
  'Alcancé la meta', 'Llegué al límite de pérdida', 'Racha en contra', 'Cansancio o tilt',
  'Problema de la mesa o del proveedor', 'Falla de conexión', 'Imprevisto personal', 'Otro',
];
const ETQ_ESTADO: Record<EstadoCierre, string> = { pendiente: 'Sin registrar', cumplida: 'Cumplida', parcial: 'Cumplida a medias', no_cumplida: 'No cumplida' };
const ETQ_MOTOR: Record<SiguioMotor, string> = { '': '', si: 'Sí', parcial: 'En parte', no: 'No' };
export const etiquetaEstado = (e: EstadoCierre): string => ETQ_ESTADO[e] ?? ETQ_ESTADO.pendiente;

export const registroVacio = (n: number): RegistroSesion => ({
  n, estado: 'pendiente', horaInicioReal: '', horaFinReal: '', saldoInicial: null, saldoFinal: null,
  siguioMotor: '', metaCumplida: null, sensacion: 0, saliMesa: null, motivoSalida: '', detalleSalida: '', notas: '', actualizadoEn: '',
});

// ── Lectura defensiva (lo que viene del servidor o del navegador no se da por bueno) ─────
const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const txt = (x: unknown, max = 2000): string => (typeof x === 'string' ? x.slice(0, max) : '');
const numONull = (x: unknown): number | null => (typeof x === 'number' && isFinite(x) ? x : null);

export function normalizarRegistro(raw: unknown, n: number): RegistroSesion {
  const base = registroVacio(n);
  if (!esObj(raw)) return base;
  const estado = raw.estado === 'cumplida' || raw.estado === 'parcial' || raw.estado === 'no_cumplida' ? raw.estado : 'pendiente';
  const motor = raw.siguioMotor === 'si' || raw.siguioMotor === 'parcial' || raw.siguioMotor === 'no' ? raw.siguioMotor : '';
  const sens = typeof raw.sensacion === 'number' && Number.isInteger(raw.sensacion) && raw.sensacion >= 1 && raw.sensacion <= 5 ? raw.sensacion : 0;
  return {
    n, estado, horaInicioReal: txt(raw.horaInicioReal, 5), horaFinReal: txt(raw.horaFinReal, 5),
    saldoInicial: numONull(raw.saldoInicial), saldoFinal: numONull(raw.saldoFinal), siguioMotor: motor, metaCumplida: typeof raw.metaCumplida === 'boolean' ? raw.metaCumplida : null, sensacion: sens,
    saliMesa: typeof raw.saliMesa === 'boolean' ? raw.saliMesa : null, motivoSalida: txt(raw.motivoSalida, 120),
    detalleSalida: txt(raw.detalleSalida), notas: txt(raw.notas, 5000), actualizadoEn: txt(raw.actualizadoEn, 40),
  };
}

export function normalizarRegistros(raw: unknown): Record<string, RegistroSesion> {
  const out: Record<string, RegistroSesion> = {};
  if (!esObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= 99) out[String(n)] = normalizarRegistro(v, n);
  }
  return out;
}

// ── Montos (saldos) ──────────────────────────────────────────────────────────────────
/**
 * Lee un monto escrito a mano. Acepta "100000", "100.000", "142,500", "100,5", "1.234.567,50", "1,234,567.50", "$ 100 000".
 * '' → null (sin dato). Texto que no es un monto → undefined (no se toca el valor guardado).
 */
export function parsearMonto(texto: string): number | null | undefined {
  const t = texto.replace(/[\s$]/g, '');
  if (t === '') return null;
  if (!/^-?[\d.,]+$/.test(t)) return undefined;
  const nPuntos = (t.match(/\./g) ?? []).length, nComas = (t.match(/,/g) ?? []).length;
  const miles = (sep: string) => new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`).test(t);   // 1.234.567 · 142,500
  let n: string;
  if (nPuntos && nComas) {
    // Con los dos signos, el último es el decimal y el otro separa miles: 1.234.567,50 · 1,234,567.50
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    if (t.split(dec).length !== 2) return undefined;
    n = t.split(mil).join('').replace(dec, '.');
  } else if (nComas) {
    // Una coma seguida de exactamente 3 dígitos se lee como separador de miles (142,500 = 142500): en pesos casi nunca hay 3 decimales.
    n = miles(',') ? t.replace(/,/g, '') : nComas === 1 ? t.replace(',', '.') : '';
  } else if (nPuntos) {
    n = miles('.') ? t.replace(/\./g, '') : nPuntos === 1 ? t : '';
  } else n = t;
  if (!/^-?\d+(\.\d+)?$/.test(n)) return undefined;
  const v = Number(n);
  return isFinite(v) ? v : undefined;
}
/** 112500 → "112.500" (formato colombiano). */
export const formatearMonto = (v: number | null): string => (v === null ? '' : v.toLocaleString('es-CO', { maximumFractionDigits: 2 }));

/** Compara el resultado de la sesión con la meta de referencia (si la hay). null = no se puede comparar. */
export function compararMeta(resultado: number | null, meta: number | null | undefined): 'cumple' | 'no_cumple' | null {
  if (resultado === null || meta === null || meta === undefined || !isFinite(meta) || meta <= 0) return null;
  return resultado >= meta ? 'cumple' : 'no_cumple';
}

// ── Cálculos ─────────────────────────────────────────────────────────────────────────
/** Duración real en minutos; si la hora de fin es menor que la de inicio se entiende que cruzó la medianoche. null si falta algún dato. */
export function duracionRealMin(r: Pick<RegistroSesion, 'horaInicioReal' | 'horaFinReal'>): number | null {
  const a = parseHM(r.horaInicioReal), b = parseHM(r.horaFinReal);
  if (a === null || b === null) return null;
  return b >= a ? b - a : b + 1440 - a;
}
/** Resultado = saldo final − saldo inicial (ambos los escribes tú). null si falta alguno. */
export function resultadoSesion(r: Pick<RegistroSesion, 'saldoInicial' | 'saldoFinal'>): number | null {
  return r.saldoInicial === null || r.saldoFinal === null ? null : r.saldoFinal - r.saldoInicial;
}

/** Avisos sobre un cierre. Nunca impiden guardarlo. */
export function validarRegistro(r: RegistroSesion, s?: Pick<SesionPlan, 'duracionMin'>, metaRef?: number | null): Hallazgo[] {
  const h: Hallazgo[] = [];
  const add = (codigo: string, nivel: 'error' | 'aviso', mensaje: string) => h.push({ codigo, nivel, mensaje, sesion: r.n });
  if (r.horaInicioReal && parseHM(r.horaInicioReal) === null) add('HORA_INICIO_INVALIDA', 'error', 'La hora real de inicio no es válida.');
  if (r.horaFinReal && parseHM(r.horaFinReal) === null) add('HORA_FIN_INVALIDA', 'error', 'La hora real de fin no es válida.');
  for (const [campo, v, nombre] of [['SALDO_INICIAL', r.saldoInicial, 'inicial'], ['SALDO_FINAL', r.saldoFinal, 'final']] as const) {
    if (v !== null && v < 0) add(`${campo}_NEGATIVO`, 'error', `El saldo ${nombre} no puede ser negativo.`);
  }
  const d = duracionRealMin(r);
  if (d !== null && d === 0) add('DURACION_CERO', 'aviso', 'La hora de inicio y la de fin son iguales: la sesión dura 0 min.');
  if (d !== null && d > 12 * 60) add('DURACION_LARGA', 'aviso', 'La sesión real dura más de 12 horas; revisa las horas.');
  const cmp = compararMeta(resultadoSesion(r), metaRef);
  if (r.metaCumplida === true && cmp === 'no_cumple') add('META_NO_COINCIDE', 'aviso', `Marcaste que cumpliste la meta, pero el resultado (${formatearMonto(resultadoSesion(r))}) está por debajo de tu meta de referencia (${formatearMonto(metaRef ?? null)}).`);
  if (r.metaCumplida === false && cmp === 'cumple') add('META_NO_COINCIDE', 'aviso', `Marcaste que no cumpliste la meta, pero el resultado (${formatearMonto(resultadoSesion(r))}) alcanza tu meta de referencia (${formatearMonto(metaRef ?? null)}).`);
  if (r.estado !== 'pendiente') {
    const falta: string[] = [];
    if (r.saldoInicial === null) falta.push('saldo inicial');
    if (r.saldoFinal === null) falta.push('saldo final');
    if (!r.horaInicioReal || !r.horaFinReal) falta.push('horas reales');
    if (falta.length) add('CIERRE_INCOMPLETO', 'aviso', `Falta: ${falta.join(', ')}. Se guarda igual, pero no entra completo en los cálculos.`);
    if (r.saliMesa === true && !r.motivoSalida) add('SALIDA_SIN_MOTIVO', 'aviso', 'Dijiste que saliste de la mesa: falta el motivo.');
    if (s && d !== null && d > 0 && d < s.duracionMin * 0.5 && r.estado === 'cumplida') add('CUMPLIDA_MUY_CORTA', 'aviso', `Marcaste "la cumplí" pero duró ${d} min de ${s.duracionMin} planificados.`);
  }
  return h;
}

// ── Resumen de la jornada ────────────────────────────────────────────────────────────
export interface ResumenJornada {
  sesionesActivas: number;
  registradas: number;
  cumplidas: number;
  parciales: number;
  noCumplidas: number;
  pendientes: number;
  /** Suma de (saldo final − inicial) de las sesiones que tienen ambos saldos. */
  resultadoTotal: number | null;
  sesionesConResultado: number;
  tiempoRealMin: number;
  siguioMotor: { si: number; parcial: number; no: number; sinResponder: number };
  salidasDeMesa: number;
  sensacionPromedio: number | null;
  /** Metas por sesión: cumplidas / no cumplidas / sin responder (solo sesiones activas). */
  metas: { si: number; no: number; sinResponder: number };
}

export function resumenJornada(plan: Plan, registros: Record<string, RegistroSesion>): ResumenJornada {
  const activas = plan.sesiones.filter((s) => s.estado !== 'cancelada');
  const r: ResumenJornada = {
    sesionesActivas: activas.length, registradas: 0, cumplidas: 0, parciales: 0, noCumplidas: 0, pendientes: 0,
    resultadoTotal: null, sesionesConResultado: 0, tiempoRealMin: 0, siguioMotor: { si: 0, parcial: 0, no: 0, sinResponder: 0 },
    salidasDeMesa: 0, sensacionPromedio: null, metas: { si: 0, no: 0, sinResponder: 0 },
  };
  let sumaSens = 0, nSens = 0;
  for (const s of activas) {
    const g = registros[String(s.n)];
    // Saldos, horas y meta son datos por sí mismos: cuentan aunque el cierre aún no esté marcado.
    if (g) {
      const res = resultadoSesion(g);
      if (res !== null) { r.resultadoTotal = (r.resultadoTotal ?? 0) + res; r.sesionesConResultado++; }
      const d = duracionRealMin(g); if (d !== null) r.tiempoRealMin += d;
    }
    if (g && g.metaCumplida !== null) { if (g.metaCumplida) r.metas.si++; else r.metas.no++; } else r.metas.sinResponder++;
    if (!g || g.estado === 'pendiente') { r.pendientes++; continue; }
    r.registradas++;
    if (g.estado === 'cumplida') r.cumplidas++; else if (g.estado === 'parcial') r.parciales++; else r.noCumplidas++;
    if (g.siguioMotor) r.siguioMotor[g.siguioMotor]++; else r.siguioMotor.sinResponder++;
    if (g.saliMesa === true) r.salidasDeMesa++;
    if (g.sensacion >= 1) { sumaSens += g.sensacion; nSens++; }
  }
  r.sensacionPromedio = nSens ? sumaSens / nSens : null;
  return r;
}

// ── Exportación CSV ──────────────────────────────────────────────────────────────────
// Separador ";" y BOM UTF-8: así Excel en español (Colombia) lo abre directo, con tildes.
// Pandas / Power BI: delimitador ";" y codificación utf-8-sig.
const SEP = ';';
export const COLUMNAS_CSV = [
  'fecha', 'sesion', 'estado_plan', 'inicio_plan', 'fin_plan', 'duracion_plan_min', 'reprogramada_desde', 'motivo_cancelacion',
  'cierre', 'inicio_real', 'fin_real', 'duracion_real_min', 'saldo_inicial', 'saldo_final', 'resultado', 'meta_cumplida',
  'siguio_motor', 'sensacion_1a5', 'salio_de_mesa', 'motivo_salida', 'detalle_salida', 'notas_sesion',
  'cierre_actualizado', 'limite_perdida_sesion', 'meta_sesion', 'notas_del_dia',
] as const;

/** Escapa un campo. Los textos que empiezan por = + - @ se neutralizan para que Excel no los ejecute como fórmula. */
export function csvCampo(v: string | number | null | undefined, esTexto = false): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (esTexto && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface JornadaExport { plan: Plan; registros: Record<string, RegistroSesion>; notasDia: string }

/** Números de sesión con cierre guardado que ya no existen en el plan (p. ej. bajaste el número de sesiones). */
export function cierresHuerfanos(plan: Plan, registros: Record<string, RegistroSesion>): number[] {
  const hay = new Set(plan.sesiones.map((s) => s.n));
  return Object.values(registros).filter((g) => g.estado !== 'pendiente' && !hay.has(g.n)).map((g) => g.n).sort((a, b) => a - b);
}

export function filasJornada(j: JornadaExport): string[][] {
  const lim: LimitesRef = j.plan.cfg.limites ?? {};
  const base: Array<Pick<SesionPlan, 'n' | 'estado' | 'duracionMin' | 'reprogramadaDesde' | 'motivoCancelacion'> & { inicio?: number; fin?: number; fuera?: boolean }> = [
    ...j.plan.sesiones,
    ...cierresHuerfanos(j.plan, j.registros).map((n) => ({ n, estado: 'planificada' as const, duracionMin: 0, fuera: true })),
  ];
  return base.map((s) => {
    const g = j.registros[String(s.n)] ?? registroVacio(s.n);
    const dur = duracionRealMin(g), res = resultadoSesion(g);
    const t = (v: string) => csvCampo(v, true);
    return [
      csvCampo(j.plan.cfg.fecha), csvCampo(s.n), s.fuera ? 'fuera_del_plan' : s.estado === 'cancelada' ? 'cancelada' : 'planificada',
      s.inicio === undefined ? '' : csvCampo(fmtHM(s.inicio)), s.fin === undefined ? '' : csvCampo(fmtHM(s.fin)), s.fuera ? '' : csvCampo(s.duracionMin),
      s.reprogramadaDesde !== undefined ? csvCampo(fmtHM(s.reprogramadaDesde)) : '', t(s.motivoCancelacion ?? ''),
      csvCampo(g.estado === 'pendiente' ? 'sin registrar' : ETQ_ESTADO[g.estado]), csvCampo(g.horaInicioReal), csvCampo(g.horaFinReal), csvCampo(dur),
      csvCampo(g.saldoInicial), csvCampo(g.saldoFinal), csvCampo(res), g.metaCumplida === null ? '' : g.metaCumplida ? 'sí' : 'no',
      csvCampo(ETQ_MOTOR[g.siguioMotor]), csvCampo(g.sensacion || null),
      g.saliMesa === null ? '' : g.saliMesa ? 'sí' : 'no', t(g.motivoSalida), t(g.detalleSalida), t(g.notas),
      csvCampo(g.actualizadoEn), csvCampo(lim.perdidaPorSesion ?? null), csvCampo(lim.metaPorSesion ?? null), t(j.notasDia),
    ];
  });
}

/** CSV con una fila por sesión y una cabecera. Una o varias jornadas (orden: por fecha ascendente). */
export function csvJornadas(js: ReadonlyArray<JornadaExport>): string {
  const orden = [...js].sort((a, b) => (a.plan.cfg.fecha < b.plan.cfg.fecha ? -1 : a.plan.cfg.fecha > b.plan.cfg.fecha ? 1 : 0));
  const filas = [COLUMNAS_CSV.join(SEP), ...orden.flatMap((j) => filasJornada(j).map((f) => f.join(SEP)))];
  return filas.join('\r\n') + '\r\n';
}
