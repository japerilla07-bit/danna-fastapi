// ════════════════════════════════════════════════════════════════════════
// PilotTerminal — cuerpo del Quantum Pilot (v8 · terminal de lectura rápida).
//
// Tres niveles, una sola pantalla, SIN scroll:
//   1. VISTAZO  (fila de mando): ORDEN · RACHA vs tope · GOD / TARGET LOCK
//   2. LECTURA  (fila media):    VOCES · ZONA · MARCADOR+ESCALERA
//   3. REFERENCIA (abajo):       CATEGORÍAS+GOD · CALOR · BANKROLL
//
// Solo presentación: lee los MISMOS selectores del store y recibe por props lo
// que ya recibía QuantumPilot. Ninguna lógica de negocio vive acá.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { C, DENSITY, FONT_MONO, useDensity } from './theme';
import { OrdenTile, RachaTile, GodTile, type GodTileProps } from './CommandRow';
import { VoicesColumn } from './VoicesColumn';
import { ZoneColumn } from './ZoneColumn';
import { ScoreColumn, type GodTargetProps } from './ScoreLadder';
import { CategoryGod, type CategoryGodProps } from './CategoryGod';
import { CalorStrip } from './CalorStrip';

export interface PilotTerminalProps {
  payload: any;
  god: GodTileProps;
  godTarget: GodTargetProps;
  table: Omit<CategoryGodProps, 'payload' | 'godActive' | 'radarScore'> & { godActive: boolean; radarScore: number };
}

// Márgenes/huecos HORIZONTALES fijos: el ancho útil de cada columna es el mismo en
// todos los niveles de densidad (solo cambia lo vertical).
const COL_PAD = 6;
const COL_GAP = 5;

const CSS = `
.qp-t *{box-sizing:border-box}
.qp-t button:focus-visible,.qp-t input:focus-visible{outline:2px solid ${C.danna};outline-offset:1px}
.qp-t button:not(:disabled):hover{filter:brightness(1.18)}
`;

export function PilotTerminal({ payload, god, godTarget, table }: PilotTerminalProps) {
  const dens = DENSITY[useDensity()];
  const vars = {
    '--qp-row': `${dens.row}px`, '--qp-ladder': `${dens.ladder}px`, '--qp-ladder-low': `${dens.ladderLow}px`,
    '--qp-sc-row': `${dens.scRow}px`, '--qp-trow': `${dens.tRow}px`, '--qp-gap': `${dens.gap}px`, '--qp-pad': `${dens.pad}px`, '--qp-padx': `${COL_PAD}px`,
    '--qp-fs-tbl': `${dens.fsTbl}px`, '--qp-fs-lbl': `${dens.fsLbl}px`, '--qp-fs-txt': `${dens.fsTxt}px`,
    '--qp-fs-val': `${dens.fsVal}px`, '--qp-fs-pick': `${dens.fsPick}px`, '--qp-fs-order': `${dens.fsOrder}px`, '--qp-fs-mega': `${dens.fsMega}px`,
  } as React.CSSProperties;

  return (
    <div className="qp-t" style={{ ...vars, display: 'flex', flexDirection: 'column', gap: dens.gap, padding: `${dens.pad}px ${COL_PAD}px`, fontFamily: FONT_MONO, color: C.ink, minHeight: 0 }}>
      <style>{CSS}</style>

      {/* 1 · VISTAZO */}
      <div style={{ display: 'grid', gridTemplateColumns: '368px 232px 1fr', columnGap: COL_GAP, height: dens.hCmd }}>
        <OrdenTile />
        <RachaTile />
        <GodTile {...god} />
      </div>

      {/* 2 · LECTURA */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 336px 1fr', columnGap: COL_GAP, height: dens.hMid }}>
        <VoicesColumn payload={payload} godTarget={godTarget} />
        <ZoneColumn />
        <ScoreColumn />
      </div>

      {/* 3 · REFERENCIA */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 372px', columnGap: COL_GAP, height: dens.hRef }}>
        <CategoryGod payload={payload} {...table} />
        <CalorStrip />
      </div>
    </div>
  );
}
