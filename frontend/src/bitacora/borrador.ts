// BITÁCORA — borrador local del plan de jornada.
//
// El plan que editas se conserva también como BORRADOR en este navegador, como red de
// seguridad por si el servidor no responde. (La copia de verdad vive en el servidor, ver
// servicio.ts / sincronizador.ts; las funciones "...Doc" de abajo guardan la jornada completa
// con su estado de sincronización, y las de v1 solo se leen para migrar un borrador anterior.) Reglas:
//   · nunca se dice "guardado" si el almacenamiento falló (se devuelve el error);
//   · el borrador lleva versión de esquema; si no se reconoce, se ignora y se avisa;
//   · lo que se lee del almacenamiento se sanea: un borrador dañado no rompe la pantalla.
//
// Las operaciones del plan (cancelar / reprogramar) se guardan como una lista y se
// reaplican sobre la configuración, de modo que editar la configuración no las pierde.

import { cancelarSesion, cfgPorDefecto, construirPlan, reprogramarSesion } from './planner';
import type { DocJornada } from './documento';
import type { BloqueCfg, LimitesRef, Modalidad, Plan, PlanCfg } from './types';

export const CLAVE_BORRADOR = 'danna_bitacora_borrador_v1';
export const VERSION_BORRADOR = 1;

export type OpPlan =
  | { tipo: 'cancelar'; n: number; motivo: string; ts: string }
  | { tipo: 'reprogramar'; n: number; hora: string; ts: string };

export interface Borrador { v: number; guardadoEn: string; cfg: PlanCfg; ops: OpPlan[] }
export interface Descartada { op: OpPlan; motivo: string }
export type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Plan = configuración + operaciones reaplicadas en orden. Las que ya no se pueden aplicar se devuelven aparte. */
export function aplicarOps(cfg: PlanCfg, ops: ReadonlyArray<OpPlan>): { plan: Plan; descartadas: Descartada[] } {
  let plan = construirPlan(cfg);
  const descartadas: Descartada[] = [];
  for (const op of ops) {
    const r = op.tipo === 'cancelar' ? cancelarSesion(plan, op.n, op.ts, op.motivo) : reprogramarSesion(plan, op.n, op.hora, op.ts);
    if (r.ok) plan = r.plan;
    else descartadas.push({ op, motivo: r.hallazgos[0]?.mensaje ?? 'No se pudo aplicar.' });
  }
  return { plan, descartadas };
}

// ── Saneamiento de lo leído ──────────────────────────────────────────────────
const MODALIDADES: ReadonlySet<string> = new Set(['equilibrada', 'concentrada', 'desde', 'manual']);
const TIPOS: ReadonlySet<string> = new Set(['desayuno', 'almuerzo', 'pausa']);
const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);
/** JSON convierte NaN en null: aquí vuelve a NaN (el planificador lo señala como inválido). */
const num = (x: unknown): number => (typeof x === 'number' ? x : NaN);
const numONull = (x: unknown): number | null => (typeof x === 'number' && isFinite(x) ? x : null);

export function normalizarCfg(raw: unknown): PlanCfg | null {
  if (!esObj(raw)) return null;
  const mod = str(raw.modalidad);
  const lim: LimitesRef = esObj(raw.limites)
    ? { perdidaPorSesion: numONull(raw.limites.perdidaPorSesion), perdidaJornada: numONull(raw.limites.perdidaJornada), metaPorSesion: numONull(raw.limites.metaPorSesion), metaJornada: numONull(raw.limites.metaJornada) }
    : {};
  const bloques: BloqueCfg[] = Array.isArray(raw.bloques)
    ? raw.bloques.filter(esObj).map((b) => ({ tipo: (TIPOS.has(str(b.tipo)) ? str(b.tipo) : 'pausa') as BloqueCfg['tipo'], nombre: str(b.nombre) || undefined, inicio: str(b.inicio), duracionMin: num(b.duracionMin) }))
    : [];
  return {
    fecha: str(raw.fecha), inicioDisponible: str(raw.inicioDisponible), limiteFin: str(raw.limiteFin),
    numSesiones: num(raw.numSesiones), duracionSesionMin: num(raw.duracionSesionMin), descansoMinMin: num(raw.descansoMinMin),
    bloques, modalidad: (MODALIDADES.has(mod) ? mod : 'equilibrada') as Modalidad,
    desdeHora: raw.desdeHora === undefined ? undefined : str(raw.desdeHora),
    manuales: Array.isArray(raw.manuales) ? raw.manuales.filter(esObj).map((m) => ({ inicio: str(m.inicio), duracionMin: typeof m.duracionMin === 'number' ? m.duracionMin : undefined })) : undefined,
    limites: lim,
    reglasSalida: Array.isArray(raw.reglasSalida) ? raw.reglasSalida.filter((r): r is string => typeof r === 'string') : [],
    giroObservacion: raw.giroObservacion === undefined ? undefined : num(raw.giroObservacion),
  };
}

export function normalizarOps(raw: unknown): OpPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: OpPlan[] = [];
  for (const o of raw) {
    if (!esObj(o) || typeof o.n !== 'number' || typeof o.ts !== 'string') continue;
    if (o.tipo === 'cancelar') out.push({ tipo: 'cancelar', n: o.n, motivo: str(o.motivo), ts: o.ts });
    else if (o.tipo === 'reprogramar' && typeof o.hora === 'string') out.push({ tipo: 'reprogramar', n: o.n, hora: o.hora, ts: o.ts });
  }
  return out;
}

/** Almacenamiento del navegador, o null si no se puede ni acceder a él. */
export function almacenNavegador(): Almacen | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

export function leerBorrador(a: Almacen | null): { borrador: Borrador | null; aviso?: string } {
  if (!a) return { borrador: null, aviso: 'Este navegador no permite guardar un borrador.' };
  let txt: string | null;
  try { txt = a.getItem(CLAVE_BORRADOR); } catch { return { borrador: null, aviso: 'No se pudo leer el borrador guardado.' }; }
  if (txt === null) return { borrador: null };
  let o: unknown;
  try { o = JSON.parse(txt); } catch { return { borrador: null, aviso: 'El borrador guardado estaba dañado y se ignoró.' }; }
  if (!esObj(o) || o.v !== VERSION_BORRADOR) return { borrador: null, aviso: 'El borrador guardado es de otra versión y se ignoró.' };
  const cfg = normalizarCfg(o.cfg);
  if (!cfg) return { borrador: null, aviso: 'El borrador guardado estaba incompleto y se ignoró.' };
  return { borrador: { v: VERSION_BORRADOR, guardadoEn: str(o.guardadoEn), cfg, ops: normalizarOps(o.ops) } };
}

export function guardarBorrador(a: Almacen | null, cfg: PlanCfg, ops: ReadonlyArray<OpPlan>, ahora: string): { ok: true; guardadoEn: string } | { ok: false; error: string } {
  if (!a) return { ok: false, error: 'Este navegador no permite guardar un borrador.' };
  try {
    const b: Borrador = { v: VERSION_BORRADOR, guardadoEn: ahora, cfg, ops: [...ops] };
    a.setItem(CLAVE_BORRADOR, JSON.stringify(b));
    // Se relee: solo se afirma "guardado" si lo escrito se puede volver a leer igual.
    if (a.getItem(CLAVE_BORRADOR) === null) return { ok: false, error: 'El navegador no conservó el borrador.' };
    return { ok: true, guardadoEn: ahora };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /quota/i.test(e.name + e.message) ? 'No hay espacio en el almacenamiento del navegador.' : 'No se pudo escribir en el almacenamiento del navegador.' };
  }
}

export function borrarBorrador(a: Almacen | null): void { try { a?.removeItem(CLAVE_BORRADOR); } catch { /* sin almacenamiento */ } }

export const borradorInicial = (fecha: string): { cfg: PlanCfg; ops: OpPlan[] } => ({ cfg: cfgPorDefecto(fecha), ops: [] });


// ── Borrador de la jornada completa (v2): una clave por fecha ────────────────────────
export const PREFIJO_BORRADOR_DOC = 'danna_bitacora_doc_v2:';
export const VERSION_BORRADOR_DOC = 2;

export interface BorradorDoc {
  v: number;
  guardadoEn: string;
  fecha: string;
  /** Versión del servidor sobre la que se partió (0 = la jornada no existía allá). */
  baseVersion: number;
  /** true = esta copia ya está en el servidor; false = hay cambios que aún no llegaron. */
  sincronizado: boolean;
  doc: DocJornada;
}

export function leerBorradorDoc(a: Almacen | null, fecha: string, normalizar: (raw: unknown) => DocJornada | null): { borrador: BorradorDoc | null; aviso?: string } {
  if (!a) return { borrador: null, aviso: 'Este navegador no permite guardar un borrador.' };
  let t: string | null;
  try { t = a.getItem(PREFIJO_BORRADOR_DOC + fecha); } catch { return { borrador: null, aviso: 'No se pudo leer el borrador guardado.' }; }
  if (t === null) return { borrador: null };
  let o: unknown;
  try { o = JSON.parse(t); } catch { return { borrador: null, aviso: 'El borrador de este navegador estaba dañado y se ignoró.' }; }
  if (!esObj(o) || o.v !== VERSION_BORRADOR_DOC || o.fecha !== fecha) return { borrador: null, aviso: 'El borrador de este navegador era de otra versión y se ignoró.' };
  const doc = normalizar(o.doc);
  if (!doc) return { borrador: null, aviso: 'El borrador de este navegador estaba incompleto y se ignoró.' };
  const bv = typeof o.baseVersion === 'number' && Number.isInteger(o.baseVersion) && o.baseVersion >= 0 ? o.baseVersion : 0;
  return { borrador: { v: VERSION_BORRADOR_DOC, guardadoEn: str(o.guardadoEn), fecha, baseVersion: bv, sincronizado: o.sincronizado === true, doc } };
}

export function guardarBorradorDoc(a: Almacen | null, fecha: string, doc: DocJornada, baseVersion: number, sincronizado: boolean, ahora: string): { ok: true } | { ok: false; error: string } {
  if (!a) return { ok: false, error: 'Este navegador no permite guardar un borrador.' };
  try {
    const b: BorradorDoc = { v: VERSION_BORRADOR_DOC, guardadoEn: ahora, fecha, baseVersion, sincronizado, doc };
    a.setItem(PREFIJO_BORRADOR_DOC + fecha, JSON.stringify(b));
    if (a.getItem(PREFIJO_BORRADOR_DOC + fecha) === null) return { ok: false, error: 'El navegador no conservó el borrador.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /quota/i.test(e.name + e.message) ? 'No hay espacio en el almacenamiento del navegador.' : 'No se pudo escribir en el almacenamiento del navegador.' };
  }
}

export function borrarBorradorDoc(a: Almacen | null, fecha: string): void { try { a?.removeItem(PREFIJO_BORRADOR_DOC + fecha); } catch { /* sin almacenamiento */ } }
