// BITÁCORA — documento de una jornada: plan (configuración + cambios) + cierre de cada sesión.
// Es lo que se guarda en el servidor, una vez por usuario y fecha.

import { aplicarOps, normalizarCfg, normalizarOps } from './borrador';
import type { OpPlan } from './borrador';
import { cfgPorDefecto } from './planner';
import { normalizarRegistros } from './registro';
import type { Plan, PlanCfg, RegistroSesion } from './types';

export const VERSION_DOC = 2;

export interface DocJornada {
  v: number;
  cfg: PlanCfg;
  ops: OpPlan[];
  /** Cierre por número de sesión ("1", "2", …). */
  registros: Record<string, RegistroSesion>;
  /** Notas libres del día para la retroalimentación final. */
  notasDia: string;
}

export const docInicial = (fecha: string): DocJornada => ({ v: VERSION_DOC, cfg: cfgPorDefecto(fecha), ops: [], registros: {}, notasDia: '' });

/** Sanea lo que llega del servidor o del navegador. Acepta documentos sin registros (primera versión del borrador). */
export function normalizarDoc(raw: unknown): DocJornada | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const cfg = normalizarCfg(o.cfg);
  if (!cfg) return null;
  return {
    v: VERSION_DOC, cfg, ops: normalizarOps(o.ops), registros: normalizarRegistros(o.registros),
    notasDia: typeof o.notasDia === 'string' ? o.notasDia.slice(0, 10000) : '',
  };
}

export const docPlan = (d: Pick<DocJornada, 'cfg' | 'ops'>): { plan: Plan; descartadas: ReturnType<typeof aplicarOps>['descartadas'] } => aplicarOps(d.cfg, d.ops);

/** Igualdad de contenido (los documentos normalizados tienen orden de claves estable). */
export const docIgual = (a: DocJornada, b: DocJornada): boolean => JSON.stringify(a) === JSON.stringify(b);
