// FONDO DE NODOS (constelaciones cian muy tenues) detrás de todo el panel.
// Puramente decorativo: SVG estático generado UNA vez con semilla fija (siempre
// el mismo dibujo), sin filtros ni blur. Solo los halos "respiran" cambiando la
// opacidad de su capa (se resuelve en el compositor; no repinta el panel) y se
// apaga con prefers-reduced-motion. pointer-events: none.

import React, { memo } from 'react';

const VW = 1060, VH = 700;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Nodo { x: number; y: number; r: number; halo: boolean }
interface Campo { nodos: Nodo[]; lineas: [number, number][]; puntos: Nodo[] }

function construir(): Campo {
  const R = rng(20261011);
  const centros: [number, number][] = [[120, 90], [330, 520], [610, 160], [820, 430], [960, 90], [470, 330], [90, 410], [760, 650], [250, 250]];
  const nodos: Nodo[] = []; const lineas: [number, number][] = [];
  for (const [cx, cy] of centros) {
    const n = 4 + Math.floor(R() * 4); const ini = nodos.length;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = 18 + R() * 105;
      nodos.push({ x: Math.max(8, Math.min(VW - 8, cx + Math.cos(a) * d)), y: Math.max(8, Math.min(VH - 8, cy + Math.sin(a) * d * 0.8)), r: 1 + R() * 1.4, halo: false });
    }
    nodos[ini + Math.floor(R() * n)].halo = true;
    for (let i = ini + 1; i < ini + n; i++) {
      // cada nodo se une con su vecino más cercano ya colocado del mismo grupo (red sin cruces raros)
      let best = ini, bd = Infinity;
      for (let j = ini; j < i; j++) { const dd = (nodos[i].x - nodos[j].x) ** 2 + (nodos[i].y - nodos[j].y) ** 2; if (dd < bd) { bd = dd; best = j; } }
      lineas.push([best, i]);
      if (R() < 0.3 && i - ini > 2) { const j = ini + Math.floor(R() * (i - ini)); if (j !== best) lineas.push([j, i]); }
    }
  }
  const puntos: Nodo[] = Array.from({ length: 16 }, () => ({ x: 10 + R() * (VW - 20), y: 10 + R() * (VH - 20), r: 0.8 + R() * 0.7, halo: false }));
  return { nodos, lineas, puntos };
}

const CAMPO = construir();
const CYAN = '46, 232, 255';

export const NodeField = memo(function NodeField() {
  const { nodos, lineas, puntos } = CAMPO;
  const halos = nodos.filter((n) => n.halo);
  const mitad = Math.ceil(halos.length / 2);
  const base: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 };
  return (
    <>
      <style>{`
        @keyframes qpNodoRespira { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        [data-qp="nodos-halo-a"] { animation: qpNodoRespira 7s ease-in-out infinite; will-change: opacity; }
        [data-qp="nodos-halo-b"] { animation: qpNodoRespira 11s ease-in-out -4s infinite; will-change: opacity; }
        @media (prefers-reduced-motion: reduce) { [data-qp^="nodos-halo"] { animation: none; opacity: 0.7; } }
      `}</style>
      <svg aria-hidden data-qp="nodos" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" style={base}>
        <g stroke={`rgba(${CYAN}, 0.13)`} strokeWidth={0.8} fill="none">
          {lineas.map(([a, b], i) => <line key={i} x1={nodos[a].x} y1={nodos[a].y} x2={nodos[b].x} y2={nodos[b].y} />)}
        </g>
        <g fill={`rgba(${CYAN}, 0.38)`}>
          {nodos.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={n.r} />)}
          {puntos.map((n, i) => <circle key={`p${i}`} cx={n.x} cy={n.y} r={n.r} fill={`rgba(${CYAN}, 0.2)`} />)}
        </g>
      </svg>
      {[halos.slice(0, mitad), halos.slice(mitad)].map((g, k) => (
        <svg key={k} aria-hidden data-qp={k === 0 ? 'nodos-halo-a' : 'nodos-halo-b'} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" style={base}>
          {g.map((n, i) => (
            <g key={i}>
              <circle cx={n.x} cy={n.y} r={8} fill={`rgba(${CYAN}, 0.07)`} />
              <circle cx={n.x} cy={n.y} r={4.5} fill={`rgba(${CYAN}, 0.13)`} />
              <circle cx={n.x} cy={n.y} r={2.2} fill={`rgba(${CYAN}, 0.8)`} />
            </g>
          ))}
        </svg>
      ))}
    </>
  );
});
