// SUGERENCIAS POR CATEGORÍA (las 9) con GOD en la MISMA fila (v8 → v9: mismo
// contenido, composición sin caja). GOD solo se llena cuando está activo.

import React, { memo, useMemo } from 'react';
import type { BadgeState } from '@/components/CategoryTable';
import { buildCategoryRows, type CounterView } from '@/domain/categoryRows';
import { C, FONT_UI, FONT_NUM, LANE_PAD_B, LANE_PAD_T, GLASS1, rgba, neon, glowText, num } from './theme';
import { Lbl } from './ui';

const STATE_COLOR: Record<BadgeState, string> = { bet: C.ok, prb: C.white, wt: C.danna };
const STATE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

// badge · categoría · pick · [W L Sq Mx AVG] · sep · [W L Sq Mx AVG GOD]
const GRID = '30px 116px minmax(0,1fr) repeat(4, 24px) 32px 10px repeat(4, 24px) 34px';

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
  const H: React.CSSProperties = { textAlign: 'right' };
  const HG: React.CSSProperties = { textAlign: 'right', color: C.white };
  return (
    <section aria-label="Sugerencias por categoría" data-qp="categorias" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, padding: `${LANE_PAD_T}px 6px ${LANE_PAD_B}px 6px`, boxSizing: 'border-box', ...GLASS1, ...num }}>
      <div style={{ height: 'var(--qp-cat-head)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderBottom: `1px solid ${C.line2}`, boxSizing: 'border-box', paddingBottom: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, lineHeight: 1.2 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 1px)', fontWeight: 700, color: C.ink }}>Sugerencias por categoría <span style={{ fontWeight: 400, color: C.ink3 }}>(las 9)</span></span>
          <span data-qp="god-estado-tabla" style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1px)', whiteSpace: 'nowrap', color: godActive ? C.white : C.ink3 }}>
            {godActive ? (
              <><b>⚡ GOD BET — ACTIVO</b> (OPTIMAL + Radar ≥7) · Radar actual: <b>{radarScore}/10</b></>
            ) : (
              <><b>⚡ GOD BET — INACTIVO</b> · Esperando OPTIMAL + Radar ≥7 · Radar actual: <b style={{ color: C.ink2 }}>{radarScore}/10</b></>
            )}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 4, alignItems: 'baseline', lineHeight: 1.1 }}>
          <span /><Lbl>categoría</Lbl><Lbl>pick</Lbl>
          <Lbl style={H}>W</Lbl><Lbl style={H}>L</Lbl><Lbl style={H}>SEQ</Lbl><Lbl style={H}>MAX</Lbl><Lbl style={H}>AVG</Lbl>
          <span />
          <Lbl style={HG}>GW</Lbl><Lbl style={HG}>GL</Lbl><Lbl style={HG}>GSQ</Lbl><Lbl style={HG}>GMX</Lbl><Lbl style={HG}>GAVG</Lbl>
        </div>
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
              height: 'var(--qp-tbl-row)', fontSize: 'var(--qp-fs-tbl)', lineHeight: 1, color: C.ink2, boxSizing: 'border-box',
              borderLeft: `2px solid ${activo ? c : 'transparent'}`, paddingLeft: 2,
              background: activo ? `linear-gradient(90deg, ${rgba(c, 0.22)}, ${rgba(c, 0.04)})` : i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent',
              boxShadow: activo ? `inset 2px 0 8px -3px ${rgba(c, 0.8)}` : undefined,
            }}
          >
            <span style={{ fontFamily: FONT_UI, fontSize: 9, fontWeight: 700, color: c, background: rgba(c, 0.14), border: `1px solid ${rgba(c, 0.45)}`, boxShadow: activo ? neon(c, 6, 0.35) : undefined, borderRadius: 2, padding: '0 3px', justifySelf: 'start', lineHeight: '11px', boxSizing: 'border-box' }}>{STATE_TXT[r.state]}</span>
            <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 0.5px)', color: activo ? C.ink : C.ink2, whiteSpace: 'nowrap' }}>{r.label}</span>
            <span style={{ fontFamily: FONT_NUM, fontSize: 'calc(var(--qp-fs-tbl) + 2.5px)', color: activo ? C.white : C.danna, fontWeight: 600, whiteSpace: 'nowrap', textShadow: glowText(activo ? C.white : C.danna, 0.4) }}>{r.pick.replace(/,\s+/g, ',')}</span>
            <Group c={r.normal} />
            <span />
            <Group c={r.god} dim={!godActive} color={C.white} />
          </div>
        );
      })}
    </section>
  );
});
