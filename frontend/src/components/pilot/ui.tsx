import React from 'react';
import { C, FONT_MONO, FONT_HEAD, num } from './theme';

/** Rótulo pequeño en MAYÚSCULAS (nunca para un dato accionable). */
export function Lbl({ children, color = C.ink3, style, spacing = '0.1em' }: { children: React.ReactNode; color?: string; style?: React.CSSProperties; spacing?: string }) {
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-lbl)', letterSpacing: spacing, color, fontWeight: 700, whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  );
}

/** Bloque de una sola capa: línea fina + fondo mate. */
export function Block({ children, style, label, testId }: { children: React.ReactNode; style?: React.CSSProperties; label?: string; testId?: string }) {
  return (
    <section
      aria-label={label}
      data-qp={testId}
      style={{
        background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 4,
        padding: 'var(--qp-pad) var(--qp-padx)', minWidth: 0, minHeight: 0, boxSizing: 'border-box', ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Hair({ vertical = false, color = C.line }: { vertical?: boolean; color?: string }) {
  return <div aria-hidden style={vertical ? { width: 1, alignSelf: 'stretch', background: color } : { height: 1, background: color }} />;
}

/** Valor numérico tabular. */
export function Val({ children, color = C.ink, size, weight = 700, style, title }: { children: React.ReactNode; color?: string; size?: number | string; weight?: number; style?: React.CSSProperties; title?: string }) {
  return (
    <span title={title} style={{ ...num, color, fontSize: size ?? 'var(--qp-fs-val)', fontWeight: weight, lineHeight: 1.1, ...style }}>
      {children}
    </span>
  );
}

export const head = (size: number | string, color: string = C.ink, weight = 700): React.CSSProperties => ({
  fontFamily: FONT_HEAD, fontSize: size, color, fontWeight: weight, lineHeight: 1.05, letterSpacing: '0.02em',
});

/** Gauge de errores seguidos contra el tope (4): 4 segmentos. */
export function StreakGauge({ live, tope = 4, h = 8 }: { live: number; tope?: number; h?: number }) {
  const segs = [];
  for (let i = 1; i <= tope; i++) {
    const on = live >= i;
    const col = i >= tope ? C.err : i === tope - 1 ? C.warn : C.white;
    segs.push(
      <span key={i} style={{ flex: 1, height: h, borderRadius: 1, background: on ? col : C.bg3, border: `1px solid ${on ? col : C.line2}`, boxSizing: 'border-box' }} />,
    );
  }
  return <div role="img" aria-label={`${Math.min(live, tope)} de ${tope} errores seguidos`} style={{ display: 'flex', gap: 3, width: '100%' }}>{segs}</div>;
}
