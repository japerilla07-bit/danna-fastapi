// ════════════════════════════════════════════════════════════════════════
// Tokens de diseño del Quantum Pilot (v9 · "tres carriles") — UNA sola fuente.
// Ningún componente del pilot usa colores, fuentes ni medidas sueltas.
//
// Dirección de arte: estación de control técnico. Obsidiana y grafito en TRES
// niveles de superficie con significado:
//   bg2 (elevado)  = lo que RECOMIENDA el motor y lo que PUEDES HACER tú
//   bg1 (base)     = el ESTADO real de la sesión (marcadores, escaleras, zonas)
//   bg0 (fondo)    = el marco del panel
// Color por FUNCIÓN: cian = D.A.N.N.A./motor · azul = Capa 1 · violeta = Escudo ·
// esmeralda = acierto · ámbar = atención · ROJO solo error/riesgo.
//
// Tipografía (las tres ya las carga tu app: index.html / index.css):
//   FONT_UI   Space Grotesk   → títulos y explicaciones (minúscula normal)
//   FONT_NUM  Barlow Condensed→ cifras grandes, jugadas y rótulos pequeños
//   FONT_MONO JetBrains Mono  → SOLO columnas de cifras (tabulares)
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import type React from 'react';

export const FONT_UI = "'Space Grotesk', 'Segoe UI', system-ui, sans-serif";
export const FONT_NUM = "'Barlow Condensed', 'Arial Narrow', 'Segoe UI', sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";

export const C = {
  // superficies
  bg0: '#04060e',
  bg1: '#080c19',
  bg2: '#0d1426',
  bg3: '#18223d',
  line: '#1c2740',
  line2: '#2e4066',
  // texto (contraste ≥ 4,5:1 sobre bg1/bg2 salvo ink4, solo para estados apagados)
  ink: '#f4f8ff',
  ink2: '#c8d3ea',
  ink3: '#a9b8d3',
  ink4: '#8798b6',
  // función
  danna: '#2ee8ff',
  capa1: '#5b9dff',
  escudo: '#c28bff',
  ok: '#24f2a3',
  warn: '#ffc83d',
  err: '#ff4668',
  white: '#ffffff',
} as const;

// ── Cristal y neón (v10) ─────────────────────────────────────────────────
// Todo es ESTÁTICO (gradientes, sombras): sin animaciones ni desenfoque por tarjeta,
// así el panel sigue costando ~0 CPU en reposo. El desenfoque va solo en el cascarón.
/** '#rrggbb' + alfa 0-1 → 'rgba(...)'. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** Resplandor de neón (sombra exterior) de un color. */
export const neon = (hex: string, r = 12, a = 0.35) => `0 0 ${r}px ${rgba(hex, a)}`;
/** Resplandor de cifra/letra. */
export const glowText = (hex: string, a = 0.5) => `0 0 7px ${rgba(hex, a)}, 0 0 18px ${rgba(hex, a * 0.7)}`;
/** Cristal base (ESTADO): vidrio ahumado con borde de luz arriba. */
export const GLASS1: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(120,170,255,0.085), rgba(255,255,255,0.025))',
  border: '1px solid rgba(120,170,255,0.2)',
  borderRadius: 6,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 22px rgba(120,170,255,0.025)',
};
/** Cristal elevado (RECOMENDACIÓN / ACCIONES): teñido con el color de la función. */
export function glass2(hex: string, strength = 1): React.CSSProperties {
  return {
    background: `linear-gradient(180deg, ${rgba(hex, 0.26 * strength)}, ${rgba(hex, 0.08 * strength)} 60%, rgba(255,255,255,0.025))`,
    border: `1px solid ${rgba(hex, 0.6 * strength)}`,
    borderRadius: 6,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), ${neon(hex, 20, 0.28 * strength)}`,
  };
}

/** Tope de errores seguidos que Gunner no quiere pasar. */
export const TOPE_ERRORES = 4;

// ── Retícula horizontal FIJA (el panel mide siempre 1060 px) ─────────────
// 1060 − borde 2 − relleno 2×10 = 1038 útiles.
export const PAD_X = 10;
export const W_RIGHT = 296;       // columna derecha (zonas + calor)
export const COL_GAP = 14;        // entre columna izquierda y derecha
export const LANE_GAP = 16;       // entre carriles
export const W_A1 = 436;          // franja de veredicto: JUEGA ESTO
export const W_A2 = 290;          //                      ERRORES SEGUIDOS
// (A3 = resto)                   //                      GOD

export interface Dens {
  /** relleno vertical exterior y hueco entre franjas */
  pad: number;
  gap: number;
  /** alturas FIJAS (geometría estable: nada salta entre giros) */
  hA: number;       // franja de veredicto
  hRail: number;    // riel de acciones
  laneHead: number;
  lanePick: number; // cada fila de jugada
  laneNote: number;
  laneScore: number;
  ladderHead: number;
  ladder: number;   // filas 1-4 de la escalera
  ladderLow: number;// filas 5-10
  catHead: number;
  tRow: number;     // fila de categorías
  /** fuentes */
  fsHero: number;   // jugada grande (JUEGA ESTO)
  fsMega: number;   // dígito de racha
  fsPick: number;   // jugada de carril
  fsTbl: number;    // columnas de cifras (mono)
  fsTxt: number;    // texto corrido
  fsLbl: number;    // rótulos pequeños
  fsVal: number;    // cifras de marcador
}
export type Density = Dens;

// ESCALA CONTINUA: dos anclas (la más compacta que se lee bien y la más holgada) y
// una interpolación según el alto REAL de la ventana. Así el panel aprovecha todo el
// alto disponible (nada de saltos entre niveles) y el ANCHO no cambia nunca.
// Solo cambian alturas y tamaños de letra; todo se redondea a enteros (letras a 0,5).
export const DENSITY_TIGHT: Dens   = { pad: 6,  gap: 6,  hA: 80,  hRail: 28, laneHead: 18, lanePick: 22, laneNote: 38, laneScore: 26, ladderHead: 12, ladder: 12, ladderLow: 9,  catHead: 29, tRow: 13, fsHero: 26, fsMega: 38, fsPick: 17, fsTbl: 10,   fsTxt: 10.5, fsLbl: 10.5, fsVal: 14 };
export const DENSITY_ROOMY: Dens   = { pad: 10, gap: 10, hA: 108, hRail: 38, laneHead: 24, lanePick: 30, laneNote: 44, laneScore: 38, ladderHead: 15, ladder: 17, ladderLow: 14, catHead: 34, tRow: 18, fsHero: 38, fsMega: 62, fsPick: 24, fsTbl: 11.5, fsTxt: 12,   fsLbl: 12,   fsVal: 18 };

/** Hueco entre los grupos de un carril (cabecera · jugadas · nota · marcador · escalera). */
export const LANE_STACK_GAP = 3;
export const SHELL_HEADER = 28;
/** Franja de RENDIMIENTO EN VIVO (Mejor/Peor de las cuatro voces), arriba del veredicto. Alto fijo. */
export const H_STRIP = 26;
/** Respiro inferior de cada carril y de la tabla: el cuadro tipográfico de la última fila (más alto que su fila) cae DENTRO del bloque. */
export const LANE_PAD_B = 2;
/** Respiro superior de cada carril/tabla (ahora son tarjetas de cristal). */
export const LANE_PAD_T = 4;

/** Alto del carril = suma de sus bloques fijos. */
export function laneHeight(t: Dens): number {
  return t.laneHead + 2 * t.lanePick + t.laneNote + t.laneScore + (t.ladderHead + 4 * t.ladder + 6 * t.ladderLow) + 4 * LANE_STACK_GAP + LANE_PAD_T + LANE_PAD_B;
}
/** Alto de la tabla de categorías (cabecera + 9 filas). */
export function catHeight(t: Dens): number {
  return LANE_PAD_T + t.catHead + 9 * t.tRow + 2 + 2;
}
/** Alto del cuerpo central = carriles + hueco + categorías (la columna derecha usa el mismo). */
export function bodyHeight(t: Dens): number {
  return laneHeight(t) + t.gap + catHeight(t);
}

/** Alto del cascarón (encabezado + cuerpo + borde 2) — las MISMAS cifras que usa PilotTerminal. */
export function shellHeightFor(t: Dens): number {
  return SHELL_HEADER + 2 * t.pad + H_STRIP + t.gap + t.hA + t.gap + bodyHeight(t) + t.gap + t.hRail + 2;
}

const KEYS = Object.keys(DENSITY_TIGHT) as (keyof Dens)[];
const HALF = new Set<keyof Dens>(['fsTbl', 'fsTxt', 'fsLbl']);
function mix(k: number): Dens {
  const o = {} as Dens;
  for (const key of KEYS) {
    const v = DENSITY_TIGHT[key] + k * (DENSITY_ROOMY[key] - DENSITY_TIGHT[key]);
    o[key] = HALF.has(key) ? Math.round(v * 2) / 2 : Math.round(v);
  }
  return o;
}

/** Alto mínimo de ventana con el que cabe el nivel más compacto (el panel mide ≤ 96vh). Por debajo, el cuerpo hace scroll interno. */
export const MIN_VIEWPORT = Math.ceil(shellHeightFor(DENSITY_TIGHT) / 0.96);

const cache = new Map<number, Dens>();
/** Parámetros de densidad para un alto de ventana: el MÁS holgado que cabe sin scroll. */
export function densityForHeight(h: number): Dens {
  const hh = Math.floor(h);
  const hit = cache.get(hh);
  if (hit) return hit;
  const avail = hh * 0.96;
  let k = Math.max(0, Math.min(1, (avail - shellHeightFor(DENSITY_TIGHT)) / (shellHeightFor(DENSITY_ROOMY) - shellHeightFor(DENSITY_TIGHT))));
  let d = mix(k);
  while (k > 0 && shellHeightFor(d) > avail) { k = Math.max(0, k - 0.01); d = mix(k); }
  cache.set(hh, d);
  return d;
}

/** Densidad según el alto REAL de la ventana (se recalcula al redimensionar). */
export function useDensity(): Dens {
  const read = () => densityForHeight(typeof window === 'undefined' ? 700 : window.innerHeight);
  const [d, setD] = useState<Dens>(read);
  useEffect(() => {
    const on = () => setD(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return d;
}

/** Cifras tabulares (columnas). */
export const num: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};

/** Cifras condensadas grandes (jugadas, marcadores, racha). */
export const numDisplay: React.CSSProperties = {
  fontFamily: FONT_NUM,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
  letterSpacing: 0,
};
