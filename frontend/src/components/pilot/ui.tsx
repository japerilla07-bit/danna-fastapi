import React from 'react';
import { C, FONT_NUM, FONT_UI, num, numDisplay, glowText } from './theme';

/** Rótulo pequeño: condensada, minúscula normal (se lee a distancia sin gritar). */
export function Lbl({ children, color = C.ink3, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <span style={{ fontFamily: FONT_NUM, fontSize: 'var(--qp-fs-lbl)', fontWeight: 500, letterSpacing: '0.01em', color, whiteSpace: 'nowrap', lineHeight: 1.1, ...style }}>
      {children}
    </span>
  );
}

/** Texto corrido / títulos de bloque (Space Grotesk). */
export function Txt({ children, color = C.ink2, size = 'var(--qp-fs-txt)', weight = 400, style }: { children: React.ReactNode; color?: string; size?: number | string; weight?: number; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: FONT_UI, fontSize: size, fontWeight: weight, color, lineHeight: 1.25, ...style }}>{children}</span>;
}

/** Cifra tabular de columna (mono). */
export function Val({ children, color = C.ink, size, weight = 600, style }: { children: React.ReactNode; color?: string; size?: number | string; weight?: number; style?: React.CSSProperties }) {
  return <span style={{ ...num, color, fontSize: size ?? 'var(--qp-fs-tbl)', fontWeight: weight, lineHeight: 1.1, ...style }}>{children}</span>;
}

/** Cifra grande condensada (jugadas, marcadores, racha). */
export function Big({ children, color = C.ink, size, weight = 600, glow = 0, glowColor, style }: { children: React.ReactNode; color?: string; size: number | string; weight?: number; glow?: number; glowColor?: string; style?: React.CSSProperties }) {
  return <span style={{ ...numDisplay, color, fontSize: size, fontWeight: weight, lineHeight: 1, textShadow: glow && (glowColor ?? color).startsWith('#') ? glowText(glowColor ?? color, glow) : undefined, ...style }}>{children}</span>;
}

/** Línea fina (solo donde cambia de grupo de información). */
export function Hair({ vertical = false, color = C.line }: { vertical?: boolean; color?: string }) {
  return <div aria-hidden style={vertical ? { width: 1, alignSelf: 'stretch', background: color } : { height: 1, background: color }} />;
}

/** Gauge de errores seguidos contra el tope (4): 4 segmentos. */
export function StreakGauge({ live, tope = 4, h = 7 }: { live: number; tope?: number; h?: number }) {
  const segs = [];
  for (let i = 1; i <= tope; i++) {
    const on = live >= i;
    const col = i >= tope ? C.err : i === tope - 1 ? C.warn : C.white;
    segs.push(<span key={i} style={{ flex: 1, height: h, borderRadius: 1, background: on ? col : 'rgba(255,255,255,0.05)', boxShadow: on ? `0 0 8px ${col}aa, 0 0 2px ${col}` : 'inset 0 0 0 1px rgba(255,255,255,0.07)' }} />);
  }
  return <div role="img" aria-label={`${Math.min(live, tope)} de ${tope} errores seguidos`} style={{ display: 'flex', gap: 3, width: '100%' }}>{segs}</div>;
}
