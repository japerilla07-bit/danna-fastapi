// RED DE NODOS VIVA — fondo del panel que REACCIONA al estado real de D.A.N.N.A.
// Solo lectura del store; no toca decisiones, ni frenos, ni cálculos.
//
//   ESPERA            red cian que respira lento y tenue (viva, no llama la atención)
//   SIGUE CAPA 1/ESCUDO  señales de luz del color de esa voz suben desde su carril hasta la banda de veredicto
//   GOD BET activo    toda la red se enciende, señales desde los tres carriles y UN barrido de luz por la banda de veredicto
//   racha 3           red ámbar, señales desde los tres carriles
//   racha 4           red roja, señales rápidas (tu tope)
//
// Rendimiento: el dibujo estático es un SVG generado una vez con semilla fija. Todo lo que se mueve
// (halos que respiran, señales, barrido) anima SOLO opacity/transform → compositor, sin repintar el panel.
// Se apaga con el botón ✦ del encabezado y con prefers-reduced-motion. pointer-events: none.

import React, { memo, useEffect, useRef, useState } from 'react';
import { useLiveDecision, useTelemetryStore } from '@/store/telemetryStore';
import { computeJuega } from '@/domain/juegaEsto';

const VW = 1060, VH = 700;

// Carriles (x en coordenadas del panel, que mide 1060 de ancho): D.A.N.N.A. | Capa 1 | Escudo.
const CARRIL_X = { real: [10, 250], capa1: [258, 495], escudo: [505, 745] } as const;
type CarrilId = keyof typeof CARRIL_X;

const RGB = {
  cian: '46, 232, 255', capa1: '91, 157, 255', escudo: '194, 139, 255', ambar: '255, 200, 61', rojo: '255, 70, 104',
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Nodo { x: number; y: number; r: number; halo: boolean }
interface Campo { nodos: Nodo[]; lineas: [number, number][]; puntos: Nodo[]; ady: number[][]; rutas: Record<CarrilId, number[][]> }

const dist = (a: Nodo, b: Nodo) => Math.hypot(a.x - b.x, a.y - b.y);

function construir(): Campo {
  const R = rng(20261012);
  const nodos: Nodo[] = []; const lineas: [number, number][] = [];
  const grupos: number[][] = [];
  const COLS = 4, FILAS = 3;
  for (let j = 0; j < FILAS; j++) for (let i = 0; i < COLS; i++) {
    const cx = 130 + i * 265 + (R() - 0.5) * 70, cy = 105 + j * 245 + (R() - 0.5) * 60;
    const n = 5 + Math.floor(R() * 4); const ini = nodos.length;
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, d = 14 + R() * 92;
      nodos.push({ x: Math.max(8, Math.min(VW - 8, cx + Math.cos(a) * d)), y: Math.max(8, Math.min(VH - 8, cy + Math.sin(a) * d * 0.78)), r: 1 + R() * 1.4, halo: false });
    }
    nodos[ini + Math.floor(R() * n)].halo = true;
    if (R() < 0.6) nodos[ini + Math.floor(R() * n)].halo = true;
    for (let k = ini + 1; k < ini + n; k++) {
      let best = ini, bd = Infinity;
      for (let m = ini; m < k; m++) { const dd = dist(nodos[k], nodos[m]); if (dd < bd) { bd = dd; best = m; } }
      lineas.push([best, k]);
      if (R() < 0.3 && k - ini > 2) { const m = ini + Math.floor(R() * (k - ini)); if (m !== best) lineas.push([m, k]); }
    }
    grupos.push(Array.from({ length: n }, (_, q) => ini + q));
  }
  // Puentes entre grupos vecinos (derecha y abajo): la red queda conectada y las señales pueden cruzar el panel.
  const puente = (A: number[], B: number[]) => {
    let bi = A[0], bj = B[0], bd = Infinity;
    for (const a of A) for (const b of B) { const dd = dist(nodos[a], nodos[b]); if (dd < bd) { bd = dd; bi = a; bj = b; } }
    lineas.push([bi, bj]);
  };
  for (let j = 0; j < FILAS; j++) for (let i = 0; i < COLS; i++) {
    if (i + 1 < COLS) puente(grupos[j * COLS + i], grupos[j * COLS + i + 1]);
    if (j + 1 < FILAS) puente(grupos[j * COLS + i], grupos[(j + 1) * COLS + i]);
  }
  const puntos: Nodo[] = Array.from({ length: 16 }, () => ({ x: 10 + R() * (VW - 20), y: 10 + R() * (VH - 20), r: 0.8 + R() * 0.7, halo: false }));

  const ady: number[][] = nodos.map(() => []);
  for (const [a, b] of lineas) { ady[a].push(b); ady[b].push(a); }

  // Dijkstra (por distancia) desde un nodo hasta el destino.
  const camino = (src: number, dst: number): number[] => {
    const D = nodos.map(() => Infinity); const prev = nodos.map(() => -1); const hecho = nodos.map(() => false); D[src] = 0;
    for (let it = 0; it < nodos.length; it++) {
      let u = -1; for (let q = 0; q < nodos.length; q++) if (!hecho[q] && (u < 0 || D[q] < D[u])) u = q;
      if (u < 0 || D[u] === Infinity) break; hecho[u] = true; if (u === dst) break;
      for (const v of ady[u]) { const nd = D[u] + dist(nodos[u], nodos[v]); if (nd < D[v]) { D[v] = nd; prev[v] = u; } }
    }
    if (D[dst] === Infinity) return [];
    const out: number[] = []; for (let c = dst; c !== -1; c = prev[c]) out.push(c); return out.reverse();
  };

  // Rutas por carril: nacen abajo, dentro del ancho del carril, y suben hasta la banda de veredicto (arriba).
  const rutas = { real: [], capa1: [], escudo: [] } as Record<CarrilId, number[][]>;
  (Object.keys(CARRIL_X) as CarrilId[]).forEach((id) => {
    const [x0, x1] = CARRIL_X[id]; const cx = (x0 + x1) / 2;
    const starts = nodos.map((n, i) => ({ n, i })).filter(({ n }) => n.y > 330 && n.x >= x0 && n.x <= x1).sort((p, q) => q.n.y - p.n.y);
    const elegidos: { n: Nodo; i: number }[] = [];
    for (const s of starts) if (elegidos.length < 3 && elegidos.every((e) => dist(e.n, s.n) > 70)) elegidos.push(s);
    const tops = nodos.map((n, i) => ({ n, i })).filter(({ n }) => n.y < 125).sort((p, q) => Math.abs(p.n.x - cx) - Math.abs(q.n.x - cx));
    elegidos.forEach((s, k) => {
      const t = tops[Math.min(k, tops.length - 1)]; if (!t) return;
      const c = camino(s.i, t.i); if (c.length >= 3) rutas[id].push(c);
    });
  });
  return { nodos, lineas, puntos, ady, rutas };
}

const CAMPO = construir();

type Modo = 'espera' | 'sigue' | 'god' | 'alerta3' | 'alerta4';
interface Look { rgb: string; carriles: CarrilId[]; velocidad: number; luz: number }

function lookDe(modo: Modo, fuente: 'ESCUDO' | 'CAPA 1' | null): Look {
  switch (modo) {
    case 'alerta4': return { rgb: RGB.rojo, carriles: ['real', 'capa1', 'escudo'], velocidad: 300, luz: 0.24 };
    case 'alerta3': return { rgb: RGB.ambar, carriles: ['real', 'capa1', 'escudo'], velocidad: 210, luz: 0.2 };
    case 'god': return { rgb: RGB.cian, carriles: ['real', 'capa1', 'escudo'], velocidad: 230, luz: 0.24 };
    case 'sigue': return fuente === 'ESCUDO' ? { rgb: RGB.escudo, carriles: ['escudo'], velocidad: 170, luz: 0.18 } : { rgb: RGB.capa1, carriles: ['capa1'], velocidad: 170, luz: 0.18 };
    default: return { rgb: RGB.cian, carriles: [], velocidad: 0, luz: 0.13 };
  }
}

interface Props { fx: boolean; godActivo: boolean; copLive: number }

export const NodeField = memo(function NodeField({ fx, godActivo, copLive }: Props) {
  const { nodos, lineas, puntos, rutas } = CAMPO;
  const halos = nodos.filter((n) => n.halo);
  const mitad = Math.ceil(halos.length / 2);

  // Estado real de D.A.N.N.A. (misma fuente que el chip "SIGUE …" del carril).
  const d = useLiveDecision();
  const pend = useTelemetryStore((s) => s.pending);
  const fuente = computeJuega(d, pend).fuente;
  const modo: Modo = copLive >= 4 ? 'alerta4' : copLive === 3 ? 'alerta3' : godActivo ? 'god' : fuente ? 'sigue' : 'espera';
  const look = lookDe(modo, fuente);

  // Escala: el campo es de 1060×700 y se amplía (nunca se reduce) para cubrir paneles más altos.
  const raiz = useRef<HTMLDivElement>(null);
  const señales = useRef<HTMLDivElement>(null);
  const barrido = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = raiz.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setK(Math.max(1, r.width / VW, r.height / VH)); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const reducir = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anima = fx && !reducir && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

  // Señales: un punto de luz por ruta, recorriendo los nodos del carril hasta la banda de veredicto.
  const claveSenales = `${anima}|${modo}|${fuente}`;
  useEffect(() => {
    const host = señales.current; if (!host) return;
    host.textContent = '';
    if (!anima || look.carriles.length === 0) return;
    const anims: Animation[] = [];
    look.carriles.forEach((id, ci) => {
      rutas[id].forEach((ruta, ri) => {
        const pts = ruta.map((i) => nodos[i]);
        const seg = pts.slice(1).map((p, q) => dist(pts[q], p));
        const L = seg.reduce((a, b) => a + b, 0); const T = L / look.velocidad; const pausa = 1.1 + ri * 0.45;
        const P = T + pausa;
        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:rgb(${look.rgb});box-shadow:0 0 8px 2px rgba(${look.rgb},.75),0 0 18px 5px rgba(${look.rgb},.3);opacity:0;will-change:transform,opacity`;
        host.appendChild(dot);
        const kf: Keyframe[] = [{ offset: 0, opacity: 0, transform: `translate(${pts[0].x}px,${pts[0].y}px)` }];
        let acc = 0; const e = 0.02 / P;
        kf.push({ offset: e, opacity: 1, transform: `translate(${pts[0].x}px,${pts[0].y}px)` });
        pts.slice(1).forEach((p, q) => { acc += seg[q]; kf.push({ offset: Math.min(0.999, e + (acc / L) * (T / P)), opacity: 1, transform: `translate(${p.x}px,${p.y}px)` }); });
        const fin = kf[kf.length - 1].offset as number;
        kf.push({ offset: Math.min(0.9995, fin + e), opacity: 0, transform: `translate(${pts[pts.length - 1].x}px,${pts[pts.length - 1].y}px)` });
        kf.push({ offset: 1, opacity: 0, transform: `translate(${pts[0].x}px,${pts[0].y}px)` });
        anims.push(dot.animate(kf, { duration: P * 1000, iterations: Infinity, easing: 'linear', delay: (ci * 0.35 + ri * 0.5) * 1000 }));
      });
    });
    return () => { anims.forEach((a) => a.cancel()); host.textContent = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSenales]);

  // Barrido único por la banda de veredicto al entrar GOD BET.
  const godPrev = useRef(godActivo);
  useEffect(() => {
    const subio = godActivo && !godPrev.current; godPrev.current = godActivo;
    if (!subio || !anima) return;
    const wrap = barrido.current; const ver = document.querySelector('[data-qp="veredicto"]') as HTMLElement | null; const shell = wrap?.parentElement;
    if (!wrap || !ver || !shell) return;
    const sr = shell.getBoundingClientRect(), vr = ver.getBoundingClientRect();
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;left:0;top:${Math.round(vr.top - sr.top)}px;height:${Math.round(vr.height)}px;width:240px;background:linear-gradient(90deg,transparent,rgba(${RGB.cian},.38) 55%,rgba(255,255,255,.55) 92%,transparent);mix-blend-mode:screen;opacity:0;will-change:transform,opacity`;
    wrap.appendChild(bar);
    const a = bar.animate([
      { opacity: 0, transform: 'translateX(-240px)' }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 },
      { opacity: 0, transform: `translateX(${Math.round(sr.width)}px)` },
    ], { duration: 1300, easing: 'cubic-bezier(.4,0,.2,1)' });
    a.onfinish = () => bar.remove(); a.oncancel = () => bar.remove();
    return () => { a.cancel(); };
  }, [godActivo, anima]);

  const brillo = modo === 'espera' ? 1 : 1.5;
  return (
    <>
      <style>{`
        @keyframes qpNodoRespira { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        [data-qp="nodos-halo-a"] { animation: qpNodoRespira 7s ease-in-out infinite; will-change: opacity; }
        [data-qp="nodos-halo-b"] { animation: qpNodoRespira 11s ease-in-out -4s infinite; will-change: opacity; }
        [data-fx="off"] [data-qp^="nodos-halo"] { animation: none; opacity: 0.7; }
        @media (prefers-reduced-motion: reduce) { [data-qp^="nodos-halo"] { animation: none; opacity: 0.7; } }
      `}</style>
      <div ref={raiz} aria-hidden data-qp="nodos" data-modo={modo} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, ['--nf' as any]: look.rgb }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: VW, height: VH, transform: `translate(-50%, -50%) scale(${k})` }}>
          <svg viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} style={{ position: 'absolute', inset: 0 }}>
            <g style={{ stroke: `rgba(var(--nf), ${look.luz})` }} strokeWidth={0.8} fill="none">
              {lineas.map(([a, b], i) => <line key={i} x1={nodos[a].x} y1={nodos[a].y} x2={nodos[b].x} y2={nodos[b].y} />)}
            </g>
            <g style={{ fill: `rgba(var(--nf), ${0.38 * brillo})` }}>
              {nodos.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={n.r} />)}
              {puntos.map((n, i) => <circle key={`p${i}`} cx={n.x} cy={n.y} r={n.r} style={{ fill: `rgba(var(--nf), ${0.2 * brillo})` }} />)}
            </g>
          </svg>
          {[halos.slice(0, mitad), halos.slice(mitad)].map((g, q) => (
            <svg key={q} data-qp={q === 0 ? 'nodos-halo-a' : 'nodos-halo-b'} viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} style={{ position: 'absolute', inset: 0 }}>
              {g.map((n, i) => (
                <g key={i}>
                  <circle cx={n.x} cy={n.y} r={8} style={{ fill: `rgba(var(--nf), ${0.07 * brillo})` }} />
                  <circle cx={n.x} cy={n.y} r={4.5} style={{ fill: `rgba(var(--nf), ${0.13 * brillo})` }} />
                  <circle cx={n.x} cy={n.y} r={2.2} style={{ fill: `rgba(var(--nf), ${Math.min(1, 0.8 * brillo)})` }} />
                </g>
              ))}
            </svg>
          ))}
          <div ref={señales} data-qp="nodos-senales" style={{ position: 'absolute', inset: 0 }} />
        </div>
      </div>
      <div ref={barrido} aria-hidden data-qp="nodos-barrido" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 6 }} />
    </>
  );
});
