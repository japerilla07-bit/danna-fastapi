// PUENTE store → eventos neurales. SOLO LECTURA.
//
// Se suscribe a telemetryStore (zustand) y compara el estado nuevo con el
// anterior. Cada evento sale de un cambio REAL de ese estado:
//   · giro ingerido                          → spin   (cian)     app:seqlog
//   · aciertos/errores de una voz suben       → hit / miss (esmeralda / rojo) en el carril de esa voz
//   · racha viva de D.A.N.N.A. llega a 3 / ≥4  → streak (ámbar / rojo); se rompe → streak-clear (esmeralda)
//   · un mercado del calor cambia de estado   → calor (ámbar caliente, cian enfriando, rojo terminó)
//   · la voz que sigue D.A.N.N.A. cambia      → voz (cian). Mientras la sigue, NeuralStage mantiene el estado 'sigue' (tinte + señales)
//   · Capa 1 pasa a entrar / dejar de entrar  → voz (cian)
// GOD BET no vive en el store (llega por props): lo publica NeuralStage.
//
// Dirección de dependencias: neural → store/domain. El store NO importa neural,
// así que no hay ciclos. No escribe en el store ni duplica estado: solo guarda
// el "estado anterior" que entrega zustand.

import { useTelemetryStore } from '@/store/telemetryStore';
import { leerCalor } from '@/domain/calor';
import { computeJuega } from '@/domain/juegaEsto';
import { emitNeural, type Tone } from './bus';

type Estado = ReturnType<typeof useTelemetryStore.getState>;

const CARRIL = { danna: 'pilot:lane-real', capa1: 'pilot:lane-capa1', escudo: 'pilot:lane-escudo' } as const;

function resultadosPorVoz(p: Estado, s: Estado) {
  const voces = [
    ['danna', p.copScore, s.copScore],
    ['capa1', p.capa1Score, s.capa1Score],
    ['escudo', p.escudoScore, s.escudoScore],
  ] as const;
  for (const [id, a, b] of voces) {
    if (b.hits > a.hits) emitNeural({ kind: 'hit', tone: 'esmeralda', target: CARRIL[id], detail: id });
    else if (b.misses > a.misses) emitNeural({ kind: 'miss', tone: 'rojo', target: CARRIL[id], detail: id });
  }
}

const capa1Entra = (s: Estado): boolean => {
  const c = s.liveDecision.capa1Decision;
  return c.mercado !== null && (c.accion === 'ENTRAR' || c.accion === 'SUAVE');
};

const TONO_CALOR: Partial<Record<string, Tone>> = { CALIENTE: 'ambar', ENFRIANDO: 'cian', TERMINO: 'rojo' };

function diff(p: Estado, s: Estado): void {
  // reinicio de sesión o primer ingreso: no es un evento que mostrar
  if (s.history.length < p.history.length || p.history.length === 0) return;
  const nuevos = s.history.length - p.history.length;

  if (nuevos > 0) emitNeural({ kind: 'spin', tone: 'cian', target: 'app:seqlog', detail: `n=${s.lastN}` });
  // Si entraron varios giros de golpe (recarga / puesta al día) no se atribuye un resultado a cada voz.
  if (nuevos === 1) resultadosPorVoz(p, s);

  // racha viva de D.A.N.N.A. (la misma que pinta el color del borde del panel)
  const a = p.copScore.streak, b = s.copScore.streak;
  if (b !== a) {
    if (b >= 4 && b > a) emitNeural({ kind: 'streak', tone: 'rojo', target: 'pilot:racha', detail: `${b}` });
    else if (b === 3 && a < 3) emitNeural({ kind: 'streak', tone: 'ambar', target: 'pilot:racha', detail: '3' });
    else if (b === 0 && a >= 3) emitNeural({ kind: 'streak-clear', tone: 'esmeralda', target: 'pilot:racha', detail: `${a}→0` });
  }

  // calor: solo transiciones de estado de cada mercado
  if (s.calor !== p.calor) {
    const antes = leerCalor(p.calor), ahora = leerCalor(s.calor);
    for (const l of ahora) {
      const prev = antes.find((x) => x.mercado === l.mercado);
      const tono = TONO_CALOR[l.estado];
      if (prev && prev.estado !== l.estado && tono) emitNeural({ kind: 'calor', tone: tono, target: `pilot:calor-${l.mercado}`, detail: `${prev.estado}→${l.estado}` });
    }
  }

  // voz que sigue D.A.N.N.A. y entrada de Capa 1 (lo que muestran los chips de los carriles)
  if (s.liveDecision !== p.liveDecision) {
    const f0 = computeJuega(p.liveDecision, p.pending).fuente, f1 = computeJuega(s.liveDecision, s.pending).fuente;
    if (f0 !== f1) emitNeural({ kind: 'voz', tone: 'cian', target: CARRIL.danna, detail: `${f0}→${f1}` });
    if (capa1Entra(p) !== capa1Entra(s)) emitNeural({ kind: 'voz', tone: 'cian', target: CARRIL.capa1, detail: capa1Entra(s) ? 'entra' : 'sale' });
  }
}

let refs = 0;
let off: (() => void) | null = null;

/** Arranca el puente (una sola suscripción compartida). Devuelve la función que lo libera. */
export function retainNeuralBridge(): () => void {
  refs++;
  if (refs === 1) off = useTelemetryStore.subscribe((s, p) => diff(p, s));
  let liberado = false;
  return () => {
    if (liberado) return; liberado = true;
    refs--;
    if (refs === 0 && off) { off(); off = null; }
  };
}
