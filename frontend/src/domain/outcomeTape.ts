// ════════════════════════════════════════════════════════════════════════
// CINTA DE RESULTADOS — últimos giros puntuados de cada marcador (✓ / ✗).
//
// SOLO LECTURA y SIN tocar telemetryStore.ts: se suscribe al store y, cuando
// el marcador de un motor sube (hits o misses +1), anota si fue acierto o
// error. Es una vista derivada de los MISMOS contadores que ya se muestran
// (copScore / capa1Score / escudoScore); no decide ni puntúa nada.
//
//   - Si hits+misses baja (reset de telemetría) la cinta se vacía.
//   - Si el store sube más de 1 en un solo set (no pasa hoy, ingest suma 1 por
//     giro) se anotan los aciertos y luego los errores — orden irrelevante
//     para el recuento, y la prueba de consistencia lo vigila.
//   - Largo máximo 20; snapshot inmutable → useSyncExternalStore no re-renderiza
//     si nada cambió.
// ════════════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';
import { useTelemetryStore } from '@/store/telemetryStore';

export type TapeKey = 'real' | 'capa1' | 'escudo';
export type Outcome = 'H' | 'M';
export const TAPE_LEN = 20;

interface Score { hits: number; misses: number }

const EMPTY: readonly Outcome[] = Object.freeze([]) as readonly Outcome[];
let tapes: Record<TapeKey, readonly Outcome[]> = { real: EMPTY, capa1: EMPTY, escudo: EMPTY };
const listeners = new Set<() => void>();

function advance(tape: readonly Outcome[], prev: Score, next: Score): readonly Outcome[] {
  const dh = next.hits - prev.hits;
  const dm = next.misses - prev.misses;
  if (dh < 0 || dm < 0) {
    // reset (o retroceso): se vacía y se re-siembra solo desde el valor actual
    return EMPTY;
  }
  if (dh === 0 && dm === 0) return tape;
  const add: Outcome[] = [];
  for (let i = 0; i < dh; i++) add.push('H');
  for (let i = 0; i < dm; i++) add.push('M');
  const merged = tape.concat(add);
  return merged.length > TAPE_LEN ? merged.slice(merged.length - TAPE_LEN) : merged;
}

let started = false;
function start() {
  if (started) return;
  started = true;
  useTelemetryStore.subscribe((s, p) => {
    const next = {
      real: advance(tapes.real, p.copScore, s.copScore),
      capa1: advance(tapes.capa1, p.capa1Score, s.capa1Score),
      escudo: advance(tapes.escudo, p.escudoScore, s.escudoScore),
    };
    if (next.real === tapes.real && next.capa1 === tapes.capa1 && next.escudo === tapes.escudo) return;
    tapes = next;
    listeners.forEach((l) => l());
  });
}
start();

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Últimos ≤20 resultados puntuados del marcador (más viejo → más nuevo). */
export function useOutcomeTape(key: TapeKey): readonly Outcome[] {
  return useSyncExternalStore(subscribe, () => tapes[key], () => EMPTY);
}

/** Solo pruebas. */
export function __getTapes() { return tapes; }
