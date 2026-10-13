// ════════════════════════════════════════════════════════════════════════
// PilotTerminal — cuerpo del Quantum Pilot (v9 · "tres carriles").
//
//   ┌ VEREDICTO (elevado) ─ JUEGA ESTO · ERRORES SEGUIDOS · GOD ─────────────┐
//   ├ ESTADO (base) ─────────────────────────────────┬────────────────────────┤
//   │  carril D.A.N.N.A. │ carril Capa 1 │ carril Escudo │  casilla: docenas      │
//   │  jugada·marcador·escalera cada uno             │  casilla: columnas     │
//   │  categorías (las 9) + GOD                      │  calor reciente        │
//   ├ ACCIONES (elevado) ─ TARGET LOCK · GOD target ─┴────────────────────────┤
//
// Solo presentación: lee los MISMOS selectores del store y recibe por props lo
// que ya recibía QuantumPilot. Ninguna lógica de negocio vive acá. Todas las
// alturas son FIJAS por nivel (theme.ts): nada se mueve entre giros.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { C, FONT_UI, GLASS1, glass2, rgba, neon, PAD_X, W_RIGHT, COL_GAP, LANE_GAP, W_A1, W_A2, laneHeight, bodyHeight, useDensity } from './theme';
import { OrdenTile, RachaTile, GodTile, type GodTileProps } from './CommandRow';
import { LaneReal, LaneCapa1, LaneEscudo } from './Lanes';
import { Rail, type GodTargetProps } from './Rail';
import { ZoneColumn } from './ZoneColumn';
import { CategoryGod, type CategoryGodProps } from './CategoryGod';
import { CalorStrip } from './CalorStrip';

export type { GodTargetProps };

export interface PilotTerminalProps {
  payload: any;
  god: GodTileProps;
  godTarget: GodTargetProps;
  table: Omit<CategoryGodProps, 'payload' | 'godActive' | 'radarScore'> & { godActive: boolean; radarScore: number };
}

const CSS = `
.qp-t *{box-sizing:border-box}
.qp-t{line-height:1.2}
.qp-t button:focus-visible,.qp-t input:focus-visible{outline:2px solid ${C.danna};outline-offset:1px}
.qp-t button:not([aria-disabled="true"]):hover{filter:brightness(1.2)}
@keyframes qpTickOk{0%{transform:scale(1.45);text-shadow:0 0 16px ${C.ok},0 0 4px ${C.ok}}}
@keyframes qpTickErr{0%{transform:scale(1.45);text-shadow:0 0 16px ${C.err},0 0 4px ${C.err}}}
.qp-tick{display:inline-block;transform-origin:50% 60%}
.qp-tick-ok{animation:qpTickOk .75s cubic-bezier(.2,.8,.3,1)}
.qp-tick-err{animation:qpTickErr .75s cubic-bezier(.2,.8,.3,1)}
[data-fx="off"] .qp-tick{animation:none}
@media (prefers-reduced-motion:reduce){.qp-tick{animation:none}}
`;

export function PilotTerminal({ payload, god, godTarget, table }: PilotTerminalProps) {
  const t = useDensity();
  const vars = {
    '--qp-gap': `${t.gap}px`,
    '--qp-lane-head': `${t.laneHead}px`, '--qp-lane-pick': `${t.lanePick}px`, '--qp-lane-note': `${t.laneNote}px`, '--qp-lane-score': `${t.laneScore}px`,
    '--qp-ladder-head': `${t.ladderHead}px`, '--qp-ladder': `${t.ladder}px`, '--qp-ladder-low': `${t.ladderLow}px`,
    '--qp-cat-head': `${t.catHead}px`, '--qp-tbl-row': `${t.tRow}px`,
    '--qp-fs-hero': `${t.fsHero}px`, '--qp-fs-mega': `${t.fsMega}px`, '--qp-fs-pick': `${t.fsPick}px`,
    '--qp-fs-tbl': `${t.fsTbl}px`, '--qp-fs-txt': `${t.fsTxt}px`, '--qp-fs-lbl': `${t.fsLbl}px`, '--qp-fs-val': `${t.fsVal}px`,
  } as React.CSSProperties;
  const hBody = bodyHeight(t);

  return (
    <div className="qp-t" style={{ ...vars, display: 'flex', flexDirection: 'column', gap: t.gap, padding: `${t.pad}px ${PAD_X}px`, fontFamily: FONT_UI, color: C.ink, minHeight: 0 }}>
      <style>{CSS}</style>

      {/* VEREDICTO — superficie elevada */}
      <div data-qp="veredicto" style={{ display: 'grid', gridTemplateColumns: `${W_A1}px ${W_A2}px 1fr`, height: t.hA, position: 'relative', minWidth: 0, ...glass2(C.danna, 1), background: `linear-gradient(115deg, ${rgba(C.danna, 0.27)}, ${rgba(C.capa1, 0.12)} 45%, ${rgba(C.escudo, 0.24)})`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), ${neon(C.danna, 22, 0.32)}` }}>
        <span aria-hidden style={{ position: 'absolute', top: -1, left: 16, right: 16, height: 1, background: `linear-gradient(90deg, transparent, ${C.danna}, ${C.escudo}, transparent)`, boxShadow: neon(C.danna, 8, 0.9) }} />
        <OrdenTile />
        <RachaTile />
        <GodTile {...god} />
      </div>

      {/* ESTADO — superficie base */}
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(0,1fr) ${W_RIGHT}px`, columnGap: COL_GAP, height: hBody }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, minWidth: 0, minHeight: 0 }}>
          <div data-qp="lanes" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: LANE_GAP, height: laneHeight(t) }}>
            <LaneReal payload={payload} />
            <LaneCapa1 />
            <LaneEscudo />
          </div>
          <CategoryGod payload={payload} {...table} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: t.gap, minWidth: 0, minHeight: 0, height: hBody, boxSizing: 'border-box', padding: '4px 6px 2px 6px', ...GLASS1 }}>
          <ZoneColumn />
          <CalorStrip />
        </div>
      </div>

      {/* ACCIONES — superficie elevada */}
      <div style={{ height: t.hRail, minWidth: 0, ...glass2(C.danna, 0.55) }}>
        <Rail god={god} godTarget={godTarget} />
      </div>
    </div>
  );
}
