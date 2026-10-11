// TABLA DE CATEGORÍAS (nivel 3 — referencia): las 9 categorías con su
// estado/pick y los contadores NORMALES, más las columnas GOD en la MISMA fila
// (antes: GodBetPanel debajo, otra tabla). GOD solo se llena cuando está
// activo — igual que antes, que sólo dibujaba la tabla GOD con GOD activo.

import React, { memo, useMemo } from 'react';
import type { BadgeState } from '@/components/CategoryTable';
import { buildCategoryRows, type CounterView } from '@/domain/categoryRows';
import { C, FONT_MONO, num } from './theme';
import { Lbl } from './ui';

const STATE_COLOR: Record<BadgeState, string> = { bet: C.ok, prb: C.white, wt: C.danna };
const STATE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

// badge · categoría · pick · [W L Sq Mx AVG] · sep · [W L Sq Mx AVG GOD]
const GRID = '28px 114px minmax(0,1fr) repeat(4, 20px) 28px 8px repeat(4, 20px) 30px';

const Group = ({ c, dim, color }: { c: CounterView; dim?: boolean; color?: string }) => {
  const v = (x: React.ReactNode, strong = false) => (
    <span style={{ textAlign: 'right', color: dim ? C.ink4 : strong ? (color ?? C.ink) : C.ink2 }}>{x}</span>
  );
  return (
    <>
      {v(dim ? '—' : c.w)}{v(dim ? '—' : c.l)}{v(dim ? '—' : c.seq, c.seq > 0)}{v(dim ? '—' : c.max, c.max >= 4)}{v(dim ? '—' : c.avg)}
    </>
  );
};

export interface CategoryGodProps {
  payload: any;
  counters: Record<string, any>;
  countersGod: Record<string, any>;
  errorHist: Record<string, any>;
  godActive: boolean;
  radarScore: number;
}

export const CategoryGod = memo(function CategoryGod({ payload, counters, countersGod, errorHist, godActive, radarScore }: CategoryGodProps) {
  const rows = useMemo(
    () => buildCategoryRows(payload, counters, errorHist, countersGod, errorHist),
    [payload, counters, errorHist, countersGod],
  );
  const H: React.CSSProperties = { fontSize: 9, color: C.ink3, fontWeight: 700, textAlign: 'right', letterSpacing: '0.04em' };
  return (
    <section aria-label="Sugerencias por categoría" data-qp="categorias" style={{ background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 4, padding: '4px var(--qp-padx) 3px', display: 'flex', flexDirection: 'column', minWidth: 0, ...num }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, minHeight: 'var(--qp-row)' }}>
        <Lbl color={C.ink2} style={{ fontSize: 9.5 }}>SUGERENCIAS POR CATEGORÍA (las 9)</Lbl>
        <span data-qp="god-estado-tabla" style={{ fontFamily: FONT_MONO, fontSize: 9.5, whiteSpace: 'nowrap', color: godActive ? C.white : C.ink3 }}>
          {godActive ? (
            <><b style={{ letterSpacing: '0.1em' }}>⚡ GOD BET — ACTIVO</b> (OPTIMAL + Radar ≥7) · Radar actual: <b>{radarScore}/10</b></>
          ) : (
            <><b style={{ letterSpacing: '0.1em' }}>⚡ GOD BET — INACTIVO</b> · Esperando OPTIMAL + Radar ≥7 · Radar actual: <b style={{ color: C.ink2 }}>{radarScore}/10</b></>
          )}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 4, alignItems: 'center', borderBottom: `1px solid ${C.line2}`, paddingBottom: 1 }}>
        <span /><span style={{ ...H, textAlign: 'left' }}>CATEGORÍA</span><span style={{ ...H, textAlign: 'left' }}>PICK</span>
        <span style={H}>W</span><span style={H}>L</span><span style={H}>SEQ</span><span style={H}>MAX</span><span style={H}>AVG</span>
        <span />
        <span style={{ ...H, color: C.white }}>GW</span><span style={{ ...H, color: C.white }}>GL</span><span style={{ ...H, color: C.white }}>GSQ</span><span style={{ ...H, color: C.white }}>GMX</span><span style={{ ...H, color: C.white }}>GAVG</span>
      </div>
      {rows.map((r, i) => {
        const c = STATE_COLOR[r.state];
        const activo = r.state === 'bet';
        return (
          <div
            key={r.key}
            data-qp={`cat-${r.key}`}
            data-state={r.state}
            style={{
              display: 'grid', gridTemplateColumns: GRID, columnGap: 4, alignItems: 'center',
              height: 'var(--qp-trow)', fontSize: 'var(--qp-fs-tbl)', color: C.ink2,
              borderLeft: `2px solid ${activo ? c : 'transparent'}`, paddingLeft: 2,
              background: activo ? `${c}14` : i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, color: c, background: `${c}22`, borderRadius: 2, padding: '0 3px', justifySelf: 'start' }}>{STATE_TXT[r.state]}</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <span title={r.pick} style={{ color: activo ? C.white : C.danna, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pick.replace(/,\s+/g, ',')}</span>
            <Group c={r.normal} />
            <span />
            <Group c={r.god} dim={!godActive} color={C.white} />
          </div>
        );
      })}
    </section>
  );
});
