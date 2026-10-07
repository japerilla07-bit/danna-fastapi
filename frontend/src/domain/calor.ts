// ════════════════════════════════════════════════════════════════════════
// CALOR RECIENTE (oct 2026) — pedido de Gunner, operación EN VIVO.
//
// "Hay sesiones en las que se calentaron dos docenas, dos columnas, una
// docena, una columna, un color... puede durar 5, 7, 10 giros". Este módulo
// mira SOLO los últimos giros (ventana corta, 7) y dice, para docenas,
// columnas, color, rango (bajo 1-18 / alto 19-36) y paridad (par / impar),
// si algo viene caliente, si se está enfriando, o nada.
//
// Es PURO y de SOLO LECTURA: no toca copilot.ts, ni decisiones, ni el freno.
// Describe lo que viene saliendo; no es una orden de entrada.
//
// CÓMO NACE un calor (el 0 ocupa lugar en la ventana pero no cuenta para
// ninguna zona):
//   · 1 zona caliente  — últimos 7 giros. Docena/columna: una zona con ≥5 de 7
//                        (y sola arriba). Color, rango y paridad (apuestas de
//                        2 opciones): una opción con ≥6 de 7.
//   · 2 zonas calientes — últimos 9 giros (más largo a propósito: con 7 se
//                        prendía casi la mitad del tiempo y la alerta perdía
//                        sentido). Docena/columna: la tercera zona NO salió
//                        en esos 9 — las otras dos se reparten todo.
//
// CÓMO TERMINA (detección de punto de cambio, versión CUSUM — pedido de
// Gunner: "saber cuándo termina el sesgo"): desde que nace el calor se sigue
// cada giro. Si cae DENTRO de las zonas calientes, el "puntaje de fin" baja;
// si cae FUERA, sube. Cuando el puntaje pasa CALOR_FIN_H el calor TERMINÓ:
//   puntaje = max(0, puntaje + log(P_base / P_caliente))     si acierta
//   puntaje = max(0, puntaje + log((1-P_base)/(1-P_caliente))) si falla
// con P_base = lo normal de esa zona y P_caliente = lo que debería seguir
// acertando si el calor fuera real. Un fallo suelto no lo termina; dos fallos
// juntos (o fallos que superan a los aciertos) sí. Se muestra ENFRIANDO cuando
// el puntaje ya va por la mitad.
//
// Es PURO y de SOLO LECTURA. Lleva su estado giro a giro con avanzarCalor() y
// se lee con leerCalor() / resumenVolvio(); detectarCalor(giros) reproduce
// una secuencia completa desde cero (útil para pruebas).

export const CALOR_VENTANA = 7;
export const CALOR_VENTANA_DOS = 9;
/** Umbral del puntaje de fin. Más alto = tarda más en declarar que terminó. */
export const CALOR_FIN_H = 1.0;
/** Cuántos giros se sigue mostrando "terminó" después de que terminó. */
export const CALOR_TERMINO_VISIBLE = 3;

export type MercadoCalor = 'DOCENAS' | 'COLUMNAS' | 'COLOR' | 'RANGO' | 'PARIDAD';
export type EstadoCalor = 'CALIENTE' | 'ENFRIANDO' | 'TERMINO' | 'NORMAL' | 'JUNTANDO';

export interface LecturaCalor {
  mercado: MercadoCalor;
  estado: EstadoCalor;
  /** Zonas calientes (o que acaban de enfriarse). Vacío si NORMAL/JUNTANDO. */
  zonas: string[];
  /** Texto corto: "5 de 7" al nacer, o "lleva 4 (3 de 4)" mientras dura. */
  detalle: string;
  /** Giros que lleva (o duró) el calor, contados desde que nació. */
  duracion?: number;
  /** Cuántos de esos giros cayeron en las zonas calientes. */
  aciertos?: number;
  /** Solo TERMINO: hace cuántos giros terminó. */
  haceGiros?: number;
}

/** Un calor que nació y está esperando ver los siguientes 3 giros. */
interface PendCalor { zonas: number[]; vistos: number; volvio: boolean; }

interface MercadoEstado {
  recientes: number[];       // últimos 9 giros
  total: number;             // giros vistos en la sesión
  ep: { zonas: number[]; en: number; vent: number; n: number; hits: number; S: number } | null;
  esperarEnfriar: boolean;   // tras un fin, no re-prender hasta que la condición se apague una vez
  fin: { zonas: number[]; t: number; dur: number; hits: number } | null;
  pend: PendCalor[];
  tally: { uno: { n: number; vol: number }; dos: { n: number; vol: number } };
}

/** Estado completo del detector, uno por mercado (mismo orden que MERCADOS). */
export type CalorEstado = MercadoEstado[];

/** Resumen de "¿volvió el calor en ≤3 giros?" de la sesión, por mercado. */
export interface ResumenVolvio {
  mercado: MercadoCalor;
  /** calores de 1 zona ya resueltos / cuántos volvieron a salir en ≤3 giros */
  uno: { n: number; vol: number };
  /** ídem para calores de 2 zonas (solo docenas/columnas) */
  dos: { n: number; vol: number };
}

/** Giros que se miran después de que nace un calor para ver si volvió. */
export const CALOR_VUELTA = 3;

const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

interface Mercado {
  nombre: MercadoCalor;
  zonaDe: (n: number) => number | null;   // índice de zona, null si es 0
  nombres: string[];                       // texto por zona
  k: number;                               // cantidad de zonas
  minUna: number;                          // mínimo de una zona para "1 zona caliente"
  permiteDos: boolean;                     // ¿tiene sentido "2 zonas calientes"?
  pBase1: number; pCal1: number;           // 1 zona: lo normal / lo que seguiría acertando si el calor es real
  pBase2: number; pCal2: number;           // 2 zonas
}

const MERCADOS: Mercado[] = [
  {
    nombre: 'DOCENAS',
    zonaDe: (n) => (n === 0 ? null : Math.floor((n - 1) / 12)),
    nombres: ['1-12', '13-24', '25-36'],
    k: 3, minUna: 5, permiteDos: true,
    pBase1: 12 / 37, pCal1: 0.55, pBase2: 24 / 37, pCal2: 0.85,
  },
  {
    nombre: 'COLUMNAS',
    zonaDe: (n) => (n === 0 ? null : (n - 1) % 3),
    nombres: ['Columna 1', 'Columna 2', 'Columna 3'],
    k: 3, minUna: 5, permiteDos: true,
    pBase1: 12 / 37, pCal1: 0.55, pBase2: 24 / 37, pCal2: 0.85,
  },
  {
    nombre: 'COLOR',
    zonaDe: (n) => (n === 0 ? null : ROJOS.has(n) ? 0 : 1),
    nombres: ['ROJO', 'NEGRO'],
    k: 2, minUna: 6, permiteDos: false,
    pBase1: 18 / 37, pCal1: 0.7, pBase2: 18 / 37, pCal2: 0.7,
  },
  {
    nombre: 'RANGO',
    zonaDe: (n) => (n === 0 ? null : n <= 18 ? 0 : 1),
    nombres: ['BAJO 1-18', 'ALTO 19-36'],
    k: 2, minUna: 6, permiteDos: false,
    pBase1: 18 / 37, pCal1: 0.7, pBase2: 18 / 37, pCal2: 0.7,
  },
  {
    nombre: 'PARIDAD',
    zonaDe: (n) => (n === 0 ? null : n % 2 === 1 ? 0 : 1),
    nombres: ['IMPAR', 'PAR'],
    k: 2, minUna: 6, permiteDos: false,
    pBase1: 18 / 37, pCal1: 0.7, pBase2: 18 / 37, pCal2: 0.7,
  },
];

/** ¿Qué zonas están calientes mirando el final de `giros`? [] si ninguna.
 *  Devuelve también cuántos giros miró y cuántos cayeron en las zonas calientes. */
function zonasCalientes(m: Mercado, giros: number[]): { zonas: number[]; vent: number; en: number } {
  const contar = (ventana: number[]) => {
    const cnt = new Array(m.k).fill(0);
    for (const n of ventana) {
      const z = m.zonaDe(n);
      if (z !== null) cnt[z]++;
    }
    return cnt;
  };
  // 1 zona caliente — ventana de 7
  if (giros.length >= CALOR_VENTANA) {
    const cnt = contar(giros.slice(-CALOR_VENTANA));
    const top = Math.max(...cnt);
    const tops = cnt.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0);
    if (top >= m.minUna && tops.length === 1) return { zonas: [tops[0]], vent: CALOR_VENTANA, en: top };
  }
  // 2 zonas calientes — ventana de 9: la tercera zona no salió
  if (m.permiteDos && m.k === 3 && giros.length >= CALOR_VENTANA_DOS) {
    const ventana = giros.slice(-CALOR_VENTANA_DOS);
    const cnt = contar(ventana);
    const ausentes = cnt.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
    if (ausentes.length === 1) {
      const zonas = [0, 1, 2].filter((i) => i !== ausentes[0]);
      return { zonas, vent: CALOR_VENTANA_DOS, en: cnt[zonas[0]] + cnt[zonas[1]] };
    }
  }
  return { zonas: [], vent: 0, en: 0 };
}

export function calorInicial(): CalorEstado {
  return MERCADOS.map((): MercadoEstado => ({
    recientes: [], total: 0, ep: null, esperarEnfriar: false, fin: null, pend: [],
    tally: { uno: { n: 0, vol: 0 }, dos: { n: 0, vol: 0 } },
  }));
}

/** Avanza el detector UN giro. Puro: devuelve un estado nuevo, no muta el anterior.
 *  Se llama una vez por giro real (el número que acaba de salir). */
export function avanzarCalor(estado: CalorEstado, giro: number): CalorEstado {
  return MERCADOS.map((m, idx): MercadoEstado => {
    const prev = estado[idx];
    const recientes = [...prev.recientes, giro].slice(-CALOR_VENTANA_DOS);
    const total = prev.total + 1;
    const zg = m.zonaDe(giro);
    const tally = { uno: { ...prev.tally.uno }, dos: { ...prev.tally.dos } };

    // 1) ¿volvió el calor que nació antes? (los siguientes CALOR_VUELTA giros)
    const pend: PendCalor[] = [];
    for (const p of prev.pend) {
      const vistos = p.vistos + 1;
      const volvio = p.volvio || (zg !== null && p.zonas.includes(zg));
      if (vistos >= CALOR_VUELTA) {
        const t = p.zonas.length === 2 ? tally.dos : tally.uno;
        t.n += 1; if (volvio) t.vol += 1;
      } else pend.push({ zonas: p.zonas, vistos, volvio });
    }

    // 2) seguir el calor activo (CUSUM) o buscar uno nuevo
    let ep = prev.ep ? { ...prev.ep } : null;
    let fin = prev.fin;
    let esperarEnfriar = prev.esperarEnfriar;
    if (total >= CALOR_VENTANA) {
      if (ep) {
        const acierta = zg !== null && ep.zonas.includes(zg);
        const dos = ep.zonas.length === 2;
        const pb = dos ? m.pBase2 : m.pBase1, pc = dos ? m.pCal2 : m.pCal1;
        ep.n += 1; if (acierta) ep.hits += 1;
        ep.S = Math.max(0, ep.S + (acierta ? Math.log(pb / pc) : Math.log((1 - pb) / (1 - pc))));
        if (ep.S >= CALOR_FIN_H) {
          fin = { zonas: ep.zonas, t: total, dur: ep.n, hits: ep.hits };
          ep = null; esperarEnfriar = true;
        }
      } else {
        const hot = zonasCalientes(m, recientes);
        if (hot.zonas.length === 0) esperarEnfriar = false;
        else if (!esperarEnfriar) {
          ep = { zonas: hot.zonas, en: hot.en, vent: hot.vent, n: 0, hits: 0, S: 0 };
          pend.push({ zonas: hot.zonas, vistos: 0, volvio: false });
        }
      }
    }
    return { recientes, total, ep, esperarEnfriar, fin, pend, tally };
  });
}

/** Lo que se muestra: una lectura por mercado. */
export function leerCalor(estado: CalorEstado): LecturaCalor[] {
  return MERCADOS.map((m, idx): LecturaCalor => {
    const e = estado[idx];
    if (e.total < CALOR_VENTANA) {
      return { mercado: m.nombre, estado: 'JUNTANDO', zonas: [], detalle: `${e.total}/${CALOR_VENTANA}` };
    }
    if (e.ep) {
      const enfria = e.ep.S >= CALOR_FIN_H / 2;
      return {
        mercado: m.nombre,
        estado: enfria ? 'ENFRIANDO' : 'CALIENTE',
        zonas: e.ep.zonas.map((z) => m.nombres[z]),
        detalle: e.ep.n === 0 ? `${e.ep.en} de ${e.ep.vent}` : `lleva ${e.ep.n} (${e.ep.hits} de ${e.ep.n})`,
        duracion: e.ep.n, aciertos: e.ep.hits,
      };
    }
    if (e.fin && e.total - e.fin.t < CALOR_TERMINO_VISIBLE) {
      return {
        mercado: m.nombre,
        estado: 'TERMINO',
        zonas: e.fin.zonas.map((z) => m.nombres[z]),
        detalle: `duró ${e.fin.dur} (${e.fin.hits} de ${e.fin.dur})`,
        duracion: e.fin.dur, aciertos: e.fin.hits, haceGiros: e.total - e.fin.t,
      };
    }
    return { mercado: m.nombre, estado: 'NORMAL', zonas: [], detalle: '' };
  });
}

/** "¿Volvió el calor en ≤3 giros?" — tanteador de la sesión, por mercado. */
export function resumenVolvio(estado: CalorEstado): ResumenVolvio[] {
  return MERCADOS.map((m, idx) => ({ mercado: m.nombre, uno: estado[idx].tally.uno, dos: estado[idx].tally.dos }));
}

/** Atajo sin estado: reproduce `giros` (el más nuevo al final) desde cero. */
export function detectarCalor(giros: number[]): LecturaCalor[] {
  return leerCalor(giros.reduce(avanzarCalor, calorInicial()));
}
