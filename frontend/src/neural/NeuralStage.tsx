// Escenario de la capa neural DENTRO del Quantum Pilot (detrás de su contenido).
// Coordenadas relativas al panel: al arrastrarlo, la red y los bordes se mueven con él.

import React, { memo, useEffect, useRef } from 'react';
import { createStage } from './engine';
import { retainNeuralBridge } from './bridge';
import { emitNeural } from './bus';

const DENSAS = [
  '[data-qp="veredicto"]', '[data-qp="lane-real"]', '[data-qp="lane-capa1"]', '[data-qp="lane-escudo"]',
  '[data-qp="categorias"]', '[data-qp="zona"]', '[data-qp="calor"]', '[data-qp="riel"]',
];

export const NeuralStage = memo(function NeuralStage({ godActivo }: { godActivo: boolean }) {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = back.current, f = front.current, shell = b?.parentElement;
    if (!b || !f || !shell) return;
    const soltar = retainNeuralBridge();
    const stage = createStage({
      scope: 'pilot', back: b, front: f, root: () => shell, dense: DENSAS,
      resolve: (t, root) => root.querySelector(`[data-qp="${t.slice(6)}"]`),
    });
    return () => { stage.destroy(); soltar(); };
  }, []);

  // GOD BET no vive en el store (llega por props): su cambio real se publica aquí.
  const prev = useRef(godActivo);
  useEffect(() => {
    if (prev.current === godActivo) return;
    prev.current = godActivo;
    emitNeural({ kind: 'god', tone: godActivo ? 'esmeralda' : 'cian', target: 'pilot:god', detail: godActivo ? 'activo' : 'inactivo' });
  }, [godActivo]);

  const base: React.CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' };
  return (
    <>
      <div ref={back} aria-hidden data-qp="neural-back" style={{ ...base, zIndex: 0 }} />
      <div ref={front} aria-hidden data-qp="neural-front" style={{ ...base, zIndex: 6 }} />
    </>
  );
});
