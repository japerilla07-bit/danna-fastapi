// Escenario de la capa neural DENTRO del Quantum Pilot, en modo "solo bordes":
// la red viva del panel (nodos, señales, barrido GOD, tinte por estado) la dibuja NodeField;
// aquí solo se publican los bordes luminosos de acierto / error / racha / calor / GOD / voz.
// Coordenadas relativas al panel: al arrastrarlo, los bordes se mueven con él.

import React, { memo, useEffect, useRef } from 'react';
import { createStage, type EstadoRed, type Stage } from './engine';
import { retainNeuralBridge } from './bridge';
import { emitNeural } from './bus';
import { useLiveDecision, useTelemetryStore } from '@/store/telemetryStore';
import { computeJuega } from '@/domain/juegaEsto';

const DENSAS = [
  '[data-qp="veredicto"]', '[data-qp="lane-real"]', '[data-qp="lane-capa1"]', '[data-qp="lane-escudo"]',
  '[data-qp="categorias"]', '[data-qp="zona"]', '[data-qp="calor"]', '[data-qp="riel"]',
];

export const NeuralStage = memo(function NeuralStage({ godActivo, copLive }: { godActivo: boolean; copLive: number }) {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  // Estado real de D.A.N.N.A. (solo lectura del store, la misma fuente del chip "SIGUE …" del carril).
  // Prioridad: racha 4 > racha 3 > GOD BET > sigue Capa 1/Escudo > espera.
  const d = useLiveDecision();
  const pend = useTelemetryStore((s) => s.pending);
  const fuente = computeJuega(d, pend).fuente;
  const estado: EstadoRed = copLive >= 4 ? 'alerta4' : copLive === 3 ? 'alerta3' : godActivo ? 'god'
    : fuente === 'CAPA 1' ? 'sigue-capa1' : fuente === 'ESCUDO' ? 'sigue-escudo' : 'espera';
  const estadoRef = useRef(estado); estadoRef.current = estado;

  useEffect(() => {
    const b = back.current, f = front.current, shell = b?.parentElement;
    if (!b || !f || !shell) return;
    const soltar = retainNeuralBridge();
    const stage = createStage({
      scope: 'pilot', soloBordes: true, back: b, front: f, root: () => shell, dense: DENSAS,
      resolve: (t, root) => root.querySelector(`[data-qp="${t.slice(6)}"]`),
    });
    stageRef.current = stage; stage.setEstado(estadoRef.current);
    return () => { stageRef.current = null; stage.destroy(); soltar(); };
  }, []);

  // El tinte de la red sigue al estado real (racha / GOD BET); la transición es de 1,2 s.
  useEffect(() => { stageRef.current?.setEstado(estado); }, [estado]);

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
