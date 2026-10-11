// ════════════════════════════════════════════════════════════════════════
// Tokens de diseño del Quantum Pilot "terminal" — UNA sola fuente.
// Ningún componente del pilot usa colores/tamaños sueltos: todo sale de acá.
//
// Dirección de arte: obsidiana / carbón, líneas finas, acentos por FUNCIÓN
// (no por decoración): cian = D.A.N.N.A./motor, azul = Capa 1, violeta =
// Escudo, esmeralda = acierto/favorable, ámbar = atención, ROJO solo para
// error/riesgo.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import type React from 'react';

export const FONT_HEAD = "'Rajdhani', 'Segoe UI', sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";

export const C = {
  // superficies
  bg0: '#05080d',  // fondo del panel
  bg1: '#0a0f17',  // bloque
  bg2: '#0f1622',  // bloque elevado / cabecera de tabla
  bg3: '#161f2e',  // hover / realce
  line: '#1c2636', // hairline
  line2: '#2a384e',// hairline de énfasis
  // texto
  ink: '#eaf0f8',
  ink2: '#adb9cc',
  ink3: '#8190aa',
  ink4: '#6f7e97',
  // función
  danna: '#33d0e8',   // D.A.N.N.A. / motor / acento general
  capa1: '#4f8bff',   // Capa 1 · Copiloto
  escudo: '#a57cff',  // Escudo 1 · Cobertura
  ok: '#2fd48a',      // acierto / favorable
  warn: '#f5b23a',    // atención (más seguido de lo normal, 3 seguidos)
  err: '#ff4d63',     // error / riesgo
  white: '#f4f8ff',
} as const;

/** Tope de errores seguidos que Gunner no quiere pasar. */
export const TOPE_ERRORES = 4;

export type Density = 'tight' | 'compact' | 'normal' | 'roomy';

export interface Dens {
  /** alto de fila de tabla densa */
  row: number;
  /** alto de fila de la escalera, filas 1-4 / 5-10 */
  ladder: number;
  ladderLow: number;
  /** alto de fila de la tabla MARCADORES */
  scRow: number;
  /** alto de fila de la tabla de CATEGORÍAS */
  tRow: number;
  gap: number;
  pad: number;
  /** alturas FIJAS de cada franja (geometría estable: nada salta entre giros) */
  hCmd: number;
  hMid: number;
  hRef: number;
  /** fuentes */
  fsTbl: number;   // tablas densas
  fsLbl: number;   // rótulos pequeños (MAYÚSCULAS)
  fsTxt: number;   // texto corrido
  fsVal: number;   // valores de lectura rápida
  fsPick: number;  // picks (zonas) de las voces
  fsOrder: number; // ORDEN (héroe)
  fsMega: number;  // dígito de racha
}

// Solo cambian alturas y las fuentes del nivel "vistazo" cuando sobra alto. Las
// tablas densas (fsTbl) NO crecen: su ancho (1060 px, fijo) manda ahí. El ancho
// del panel NUNCA cambia. Los umbrales de MIN_VIEWPORT salen de MEDIR cada nivel (ver
// pruebas): es el alto de ventana mínimo con el que ese nivel cabe sin scroll.
export const DENSITY: Record<Density, Dens> = {
  tight:   { row: 13, ladder: 13, ladderLow: 10, scRow: 13, tRow: 14, gap: 4, pad: 5,  hCmd: 88,  hMid: 236, hRef: 172, fsTbl: 10,   fsLbl: 9,    fsTxt: 10.5, fsVal: 12, fsPick: 15, fsOrder: 24, fsMega: 34 },
  compact: { row: 15, ladder: 14, ladderLow: 11, scRow: 15, tRow: 17, gap: 5, pad: 6,  hCmd: 92,  hMid: 258, hRef: 196, fsTbl: 10.5, fsLbl: 9.5,  fsTxt: 11,   fsVal: 13, fsPick: 17, fsOrder: 27, fsMega: 38 },
  normal:  { row: 17, ladder: 16, ladderLow: 12, scRow: 17, tRow: 18, gap: 7, pad: 8,  hCmd: 100, hMid: 290, hRef: 212, fsTbl: 10.5, fsLbl: 9.5,  fsTxt: 11.5, fsVal: 14, fsPick: 18, fsOrder: 27, fsMega: 40 },
  roomy:   { row: 19, ladder: 18, ladderLow: 14, scRow: 19, tRow: 20, gap: 9, pad: 10, hCmd: 112, hMid: 320, hRef: 232, fsTbl: 10.5, fsLbl: 10,   fsTxt: 12,   fsVal: 15, fsPick: 20, fsOrder: 30, fsMega: 46 },
};

/** Alto del cascarón (encabezado 28 + cuerpo + borde 2) que necesita cada nivel.
 *  Sale de las MISMAS alturas fijas que usa PilotTerminal — no hay números sueltos. */
export const SHELL_HEADER = 28;
export function shellHeightFor(d: Density): number {
  const t = DENSITY[d];
  return SHELL_HEADER + 2 * t.pad + 2 * t.gap + t.hCmd + t.hMid + t.hRef + 2;
}

/** Alto de ventana mínimo (px) con el que cada nivel cabe sin scroll: el panel
 *  mide como máximo 96vh. */
export const MIN_VIEWPORT: Record<Density, number> = {
  tight: 0,
  compact: Math.ceil(shellHeightFor('compact') / 0.96),
  normal: Math.ceil(shellHeightFor('normal') / 0.96),
  roomy: Math.ceil(shellHeightFor('roomy') / 0.96),
};

export function densityForHeight(h: number): Density {
  return h >= MIN_VIEWPORT.roomy ? 'roomy' : h >= MIN_VIEWPORT.normal ? 'normal' : h >= MIN_VIEWPORT.compact ? 'compact' : 'tight';
}

/** Densidad según el alto REAL de la ventana (se recalcula al redimensionar). */
export function useDensity(): Density {
  const read = () => (typeof window === 'undefined' ? 'compact' : densityForHeight(window.innerHeight));
  const [d, setD] = useState<Density>(read);
  useEffect(() => {
    const on = () => setD(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return d;
}

export const num: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};
