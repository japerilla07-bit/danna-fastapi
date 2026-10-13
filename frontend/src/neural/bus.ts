// NEURAL INTELLIGENCE LAYER — bus de eventos.
//
// Capa visual DESACOPLADA: este módulo no importa nada de la app (ni store, ni
// dominio, ni React). Quien detecta un evento REAL lo publica; los escenarios
// visuales (engine.ts) lo escuchan. Nada aquí inventa actividad.

/** Paleta semántica (los 4 colores que ya usa la app): cian = informa / cambia
 *  la voz, esmeralda = acierto o GOD activo, ámbar = alerta (racha 3, calor),
 *  rojo = error / racha 4 / calor terminado. */
export type Tone = 'cian' | 'esmeralda' | 'ambar' | 'rojo';
/** Colores de voz (ya existen en la app): solo viajan en las señales carril → veredicto. */
export type ToneVoz = Tone | 'capa1' | 'escudo';

export type NeuralKind = 'spin' | 'hit' | 'miss' | 'streak' | 'streak-clear' | 'calor' | 'voz' | 'god';

export interface NeuralEvent {
  kind: NeuralKind;
  tone: ToneVoz;
  /** Componente que se actualizó: "pilot:<data-qp>" (dentro del Quantum Pilot) o "app:<clave>". */
  target: string;
  /** Texto corto. En 'god' es 'activo' | 'inactivo'. */
  detail?: string;
}

type Listener = (e: NeuralEvent) => void;
const listeners = new Set<Listener>();

export function emitNeural(e: NeuralEvent): void {
  for (const l of listeners) {
    try { l(e); } catch { /* un escenario con error no debe afectar a la app ni a los demás */ }
  }
}

export function onNeural(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Solo para pruebas/medición. */
export const neuralListenerCount = (): number => listeners.size;
