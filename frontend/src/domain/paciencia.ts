// ════════════════════════════════════════════════════════════════════════
// PACIENCIA DEL ESCUDO — ¿conviene seguir al Escudo al 1.er error o esperar 2?
//
// MEDIDOR EN MODO SOMBRA (oct 2026): corre EN PARALELO y NO cambia lo que
// D.A.N.N.A. juega. Dos jugadores virtuales siguen al Escudo así:
//   · S "1 error"  : juega su pareja; al FALLAR una vez adopta la pareja nueva
//                    que muestra el Escudo en ese momento. Mientras acierta, se queda.
//   · E "2 errores": igual, pero adopta la pareja nueva del Escudo solo tras
//                    DOS errores seguidos.
// Cada uno acumula sus aciertos en los últimos 5 giros; la franja del Quantum
// Pilot compara los dos. Cero = acierto (como se juega: el cero siempre cubierto).
// Solo juegan en giros donde el Escudo tiene jugada; si el Escudo no juega,
// el estado no cambia (como en la simulación de 56 sesiones).
//
// Es DESCRIPTIVO: muestra cómo viene esta mesa con cada manera de seguir al
// Escudo. En 56 sesiones, en promedio, cambiar al 1.er error dio menos rachas
// largas que esperar 2 (4+: 96 vs 123); pero quién iba mejor en una ventana de
// giros NO anticipa quién irá mejor en la siguiente (correlación ≈ 0).
//
// Funciones PURAS; el estado lo guarda telemetryStore.ts. Solo lectura.
// ════════════════════════════════════════════════════════════════════════

import { aciertoConCero, type ResSombra } from '@/domain/sombra';

export type PolPaciencia = 'S' | 'E';
export const POLS_PACIENCIA: readonly PolPaciencia[] = ['S', 'E'];
export const PACIENCIA_VENTANA = 5;
/** Errores seguidos que cada jugador espera antes de adoptar la pareja nueva del Escudo. */
export const PACIENCIA_ERRORES: Record<PolPaciencia, number> = { S: 1, E: 2 };
/** Diferencia mínima (en giros acertados de la ventana) para decir que uno va mejor. */
export const PACIENCIA_UMBRAL = 2;
/** Mínimo de giros resueltos por jugador para comparar (= la ventana completa). */
export const PACIENCIA_MIN = 5;

export interface PolEstado {
  /** Pareja que está jugando (texto de zonas) o null si aún no adoptó ninguna. */
  held: string | null;
  /** Errores seguidos con la pareja actual. */
  miss: number;
  /** Últimos PACIENCIA_VENTANA resultados (1 acierto, 0 error). */
  hist: Array<0 | 1>;
}
export type PacienciaEstado = Record<PolPaciencia, PolEstado>;
/** Pareja que cada jugador juega este giro (null = Escudo sin jugada). */
export type PacienciaJugadas = Record<PolPaciencia, string | null>;

export function pacienciaVacia(): PacienciaEstado {
  return { S: { held: null, miss: 0, hist: [] }, E: { held: null, miss: 0, hist: [] } };
}
export function jugadasVacias(): PacienciaJugadas {
  return { S: null, E: null };
}

/**
 * Qué juega cada jugador este giro, dado lo que muestra el Escudo (texto de zonas o null).
 * Si el jugador no tiene pareja, adopta la del Escudo. Si el Escudo no juega, nadie juega.
 */
export function pacienciaDecidir(
  est: PacienciaEstado,
  escudoPick: string | null,
): { est: PacienciaEstado; jugadas: PacienciaJugadas } {
  if (escudoPick === null) return { est, jugadas: jugadasVacias() };
  const out = pacienciaVacia();
  const jugadas = jugadasVacias();
  for (const p of POLS_PACIENCIA) {
    const held = est[p].held ?? escudoPick;
    out[p] = { ...est[p], held };
    jugadas[p] = held;
  }
  return { est: out, jugadas };
}

/** Resuelve las jugadas del giro anterior con el número que salió y actualiza cada jugador. */
export function pacienciaResolver(est: PacienciaEstado, jugadasPrev: PacienciaJugadas, spin: number): PacienciaEstado {
  const out = pacienciaVacia();
  for (const p of POLS_PACIENCIA) {
    const s = est[p];
    const r: ResSombra = aciertoConCero(jugadasPrev[p], spin);
    if (r === null) { out[p] = s; continue; }
    const hist = [...s.hist, r].slice(-PACIENCIA_VENTANA);
    if (r === 1) { out[p] = { held: s.held, miss: 0, hist }; continue; }
    const miss = s.miss + 1;
    // tras el error N-ésimo seguido deja la pareja: en la próxima jugada adopta la del Escudo
    out[p] = miss >= PACIENCIA_ERRORES[p] ? { held: null, miss: 0, hist } : { held: s.held, miss, hist };
  }
  return out;
}

export interface TasaPaciencia { hits: number; n: number; pct: number | null }
export function tasaPaciencia(est: PacienciaEstado, p: PolPaciencia): TasaPaciencia {
  const h = est[p].hist;
  const hits = h.reduce<number>((a, b) => a + b, 0);
  return { hits, n: h.length, pct: h.length ? (100 * hits) / h.length : null };
}

/** 'S' / 'E' si uno viene claramente mejor, 'parejo' si no, 'sin datos' si falta muestra. */
export function pacienciaVeredicto(est: PacienciaEstado): PolPaciencia | 'parejo' | 'sin datos' {
  const a = tasaPaciencia(est, 'S');
  const b = tasaPaciencia(est, 'E');
  if (a.n < PACIENCIA_MIN || b.n < PACIENCIA_MIN) return 'sin datos';
  // comparar sobre la misma ventana: giros acertados de cada uno (ambos juegan los mismos giros)
  const d = a.hits - b.hits;
  if (d >= PACIENCIA_UMBRAL) return 'S';
  if (d <= -PACIENCIA_UMBRAL) return 'E';
  return 'parejo';
}
