// Escenario de la capa neural a nivel de PÁGINA: reemplaza a NeuralBackground en
// AppPage (aquel generaba paquetes de luz al azar; este solo anima eventos reales).
// Fijo, detrás de todo (z 0), sin capturar el puntero.

import React, { memo, useEffect, useRef } from 'react';
import { createStage } from './engine';
import { retainNeuralBridge } from './bridge';

const DENSAS = ['.panel', '.hud', '.strip', '.lb-strip', '.app-userbar', '[data-neural-dense]'];

const RESOLVE: Record<string, string> = { 'app:seqlog': '.seqlog-grid' };

export const NeuralLayer = memo(function NeuralLayer() {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = back.current, f = front.current;
    if (!b || !f) return;
    const soltar = retainNeuralBridge();
    const stage = createStage({
      scope: 'page', back: b, front: f, root: () => document, dense: DENSAS,
      resolve: (t, root) => {
        const sel = RESOLVE[t]; const el = sel ? (root as Document).querySelector(sel) : null;
        return el ? (el.closest('.panel') ?? el) : null;       // el borde se dibuja sobre el panel completo
      },
    });
    return () => { stage.destroy(); soltar(); };
  }, []);

  const fijo: React.CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' };
  return (
    <>
      <div ref={back} aria-hidden data-neural="page-back" style={{ ...fijo, zIndex: 0 }} />
      <div ref={front} aria-hidden data-neural="page-front" style={{ ...fijo, zIndex: 40 }} />
    </>
  );
});
