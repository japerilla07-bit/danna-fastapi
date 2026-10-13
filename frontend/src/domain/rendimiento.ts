// ════════════════════════════════════════════════════════════════════════
// RENDIMIENTO EN VIVO — ¿quién va mejor ahora: Motor, Capa 1, Escudo o D.A.N.N.A.?
//
// Función PURA y de SOLO LECTURA: recibe el registro giro a giro que guarda el
// store y devuelve una lectura. No decide nada, no alimenta ninguna apuesta ni
// ninguna capa. Es el "termómetro" del operador (la bitácora observa y registra,
// nunca decide por el motor).
//
// Reglas:
//  • Ventana MÓVIL de los últimos VENTANA giros de la mesa (los mismos giros para
//    las cuatro voces): lo que pasó hace poco, no el acumulado de la sesión.
//  • Cada voz se mide solo con los giros en que de verdad dio una sugerencia
//    dentro de esa ventana (Capa 1 y Escudo callan cuando dicen ESPERA). El Motor
//    sugiere siempre — docena y columna — y cada una cuenta como un evento: es lo
//    mismo que miden sus celdas de DOCENAS / COLUMNAS.
//  • Una voz con menos de MIN_EVENTOS sugerencias en la ventana NO se califica
//    (con 2 o 3 giros el porcentaje solo es ruido).
//  • Con tan poca muestra, una diferencia chica no es una diferencia: si la
//    mejor y la peor están a menos de UMBRAL_PAREJO, el veredicto es "parejo".
//  • Tendencia (▲/▼): la ventana actual contra la anterior, solo si hay 2 ventanas
//    completas y las dos tienen muestra suficiente.
// ════════════════════════════════════════════════════════════════════════

export type Fuente = 'motor' | 'capa1' | 'escudo' | 'danna';
export const FUENTES: readonly Fuente[] = ['motor', 'capa1', 'escudo', 'danna'];
export const NOMBRE: Record<Fuente, string> = { motor: 'Motor', capa1: 'Capa 1', escudo: 'Escudo', danna: 'D.A.N.N.A.' };

/** Resultado de UN giro ya resuelto, por voz: true = acierto, false = error, null = no sugirió. */
export interface EntradaRend {
  danna: boolean | null;
  capa1: boolean | null;
  escudo: boolean | null;
  motorDoc: boolean | null;
  motorCol: boolean | null;
}

export const VENTANA = 12;
export const MIN_EVENTOS = 4;
export const UMBRAL_PAREJO = 0.17;
export const TOL_GRUPO = 0.07;
export const UMBRAL_TENDENCIA = 0.15;
/** Cuántas entradas conserva el store (2 ventanas + holgura). */
export const CAP_REGISTRO = 60;

export type Tendencia = 'sube' | 'baja' | null;

export interface Medida {
  fuente: Fuente;
  /** aciertos y sugerencias dentro de la ventana */
  hits: number;
  n: number;
  /** 0..1, o null si no llega a MIN_EVENTOS */
  tasa: number | null;
  tendencia: Tendencia;
}

export type Veredicto = 'juntando' | 'parejo' | 'hay';

export interface Lectura {
  /** giros disponibles en el registro (tope VENTANA para mostrar el avance) */
  giros: number;
  veredicto: Veredicto;
  medidas: Medida[];
  mejores: Fuente[];
  peores: Fuente[];
  /** frase lista para mostrar */
  texto: string;
}

function eventos(f: Fuente, e: EntradaRend): boolean[] {
  const v = f === 'motor' ? [e.motorDoc, e.motorCol] : [f === 'capa1' ? e.capa1 : f === 'escudo' ? e.escudo : e.danna];
  return v.filter((x): x is boolean => x === true || x === false);
}

function contar(f: Fuente, tramo: readonly EntradaRend[]): { hits: number; n: number } {
  let hits = 0, n = 0;
  for (const e of tramo) for (const x of eventos(f, e)) { n += 1; if (x) hits += 1; }
  return { hits, n };
}

const tasaDe = (c: { hits: number; n: number }): number | null => (c.n >= MIN_EVENTOS ? c.hits / c.n : null);

/** "A", "A y B", "A, B y C". */
export function unir(fs: readonly Fuente[]): string {
  const n = fs.map((f) => NOMBRE[f]);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}

export function leerRendimiento(log: readonly EntradaRend[]): Lectura {
  const actual = log.slice(-VENTANA);
  const previa = log.length >= VENTANA * 2 ? log.slice(-VENTANA * 2, -VENTANA) : null;

  const medidas: Medida[] = FUENTES.map((fuente) => {
    const c = contar(fuente, actual);
    const tasa = tasaDe(c);
    let tendencia: Tendencia = null;
    if (previa && tasa !== null) {
      const t0 = tasaDe(contar(fuente, previa));
      if (t0 !== null) {
        const d = tasa - t0;
        tendencia = d >= UMBRAL_TENDENCIA ? 'sube' : d <= -UMBRAL_TENDENCIA ? 'baja' : null;
      }
    }
    return { fuente, hits: c.hits, n: c.n, tasa, tendencia };
  });

  const giros = Math.min(log.length, VENTANA);
  const base = { giros, medidas };
  if (log.length < VENTANA) {
    return { ...base, veredicto: 'juntando', mejores: [], peores: [], texto: `Juntando giros ${log.length}/${VENTANA}` };
  }
  const calificadas = medidas.filter((m): m is Medida & { tasa: number } => m.tasa !== null);
  if (calificadas.length < 2) {
    return { ...base, veredicto: 'juntando', mejores: [], peores: [], texto: 'Pocas sugerencias en estos giros para comparar' };
  }
  const maxT = Math.max(...calificadas.map((m) => m.tasa));
  const minT = Math.min(...calificadas.map((m) => m.tasa));
  if (maxT - minT < UMBRAL_PAREJO) {
    return { ...base, veredicto: 'parejo', mejores: [], peores: [], texto: 'Parejo: ninguna se despega' };
  }
  const mejores = calificadas.filter((m) => m.tasa >= maxT - TOL_GRUPO).map((m) => m.fuente);
  const peores = calificadas.filter((m) => m.tasa <= minT + TOL_GRUPO && !mejores.includes(m.fuente)).map((m) => m.fuente);
  return { ...base, veredicto: 'hay', mejores, peores, texto: `Mejor: ${unir(mejores)} · Peor: ${unir(peores)}` };
}

/** Entrada nueva del registro, acotada a CAP_REGISTRO (inmutable). */
export function agregarEntrada(log: readonly EntradaRend[], e: EntradaRend): EntradaRend[] {
  const n = [...log, e];
  return n.length > CAP_REGISTRO ? n.slice(n.length - CAP_REGISTRO) : n;
}
