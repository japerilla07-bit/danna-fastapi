// ════════════════════════════════════════════════════════════════════════
// FRECUENCIA DE RACHAS — cálculo PURO de la escalera "LLEGA A N O MÁS".
//
// Extraído tal cual de MatrixPanel.tsx → RachasFrecuencia (oct 2026) para que
// la tabla vieja (MatrixPanel) y la terminal nueva del Quantum Pilot lean
// EXACTAMENTE la misma fórmula. Cero lógica nueva: las mismas líneas, movidas.
// Solo lectura — no cambia ninguna decisión ni el freno.
//
// % de error NORMAL de cada marcador, medido en TODAS las sesiones guardadas
// (59 sesiones, 18.647 giros; pasadas giro a giro por el mismo store):
//   D.A.N.N.A. real: 34,89% de error en 18.122 giros puntuados
//   Capa 1:          33,48% de error en 14.079
//   Escudo:          34,90% de error en 16.909
// De acá sale el "normal" de cada "cada X giros": 1 / ((1-q) · qᴺ) para una
// racha que LLEGA a N errores seguidos (o más). Ver nota larga en MatrixPanel.
// ════════════════════════════════════════════════════════════════════════

export const ERR_NORMAL = { real: 0.3489, capa1: 0.3348, escudo: 0.349 };

export const RACHA_MAX_LEN = 10;

export interface FilaRacha {
  len: number;
  /** veces que la racha llegó a este largo (o más) hoy */
  c: number;
  /** cada cuántos giros pasa hoy (null si nunca llegó) */
  cada: number | null;
  /** cada cuántos giros pasa por azar con el % de error de este marcador */
  normal: number;
  confiable: boolean;
  masSeguido: boolean;
  masEspaciado: boolean;
  sinDatos: boolean;
  /** la racha de AHORA ya llegó a este largo */
  enRacha: boolean;
  /** giros desde la última vez que llegó (0 si enRacha) */
  voy: number;
  ref: number;
}

/** Largos visibles: 1 a 4 siempre (4 es el tope), 5 a 10 cuando ya llegaron. */
export function largosVisibles(rachas: number[]): number[] {
  const largos: number[] = [];
  for (let len = 1; len <= RACHA_MAX_LEN; len++) {
    if (len <= 4 || (rachas[len] ?? 0) > 0) largos.push(len);
  }
  return largos;
}

export function calcFilaRacha(
  len: number, rachas: number[], ult: number[], live: number, scored: number, q: number,
): FilaRacha {
  const c = rachas[len] ?? 0;
  const cada = c > 0 ? Math.max(1, Math.round(scored / c)) : null;
  // "Normal" = cada cuántos giros la racha llega a N o más por azar: una racha
  // de ≥N empieza tras un acierto y sigue con N errores → 1 / ((1-q) · qᴺ).
  // Solo se marca más seguido / más espaciado con ≥80 giros puntuados y ≥2
  // veces (antes es ruido).
  const normal = Math.round(1 / ((1 - q) * Math.pow(q, len)));
  const confiable = scored >= 80 && c >= 2;
  const masSeguido = cada !== null && confiable && cada < normal * 0.7;
  const masEspaciado = cada !== null && confiable && cada > normal * 1.5;
  const sinDatos = c === 0;
  // la racha de AHORA ya llegó a este largo → "ahora"; si no, giros desde la
  // última vez (o desde el inicio de la sesión si hoy no ha llegado)
  const enRacha = live >= len;
  const voy = enRacha ? 0 : c > 0 ? Math.max(0, scored - (ult[len] ?? 0)) : scored;
  const ref = cada ?? normal;
  return { len, c, cada, normal, confiable, masSeguido, masEspaciado, sinDatos, enRacha, voy, ref };
}

export function filasRacha(
  rachas: number[], ult: number[], live: number, scored: number, q: number,
): FilaRacha[] {
  return largosVisibles(rachas).map((len) => calcFilaRacha(len, rachas, ult, live, scored, q));
}
