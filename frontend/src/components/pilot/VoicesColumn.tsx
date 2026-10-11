// Columna VOCES (nivel 2 — lectura): qué sugiere cada capa por su cuenta.
//   CAPA 1 · COPILOTO   — su propia sugerencia + efectividad
//   ESCUDO 1 · COBERTURA — su propia sugerencia + efectividad (▲ PRIORIDAD)
//   MOTOR               — pick de DOCENAS/COLUMNAS del backend (BET/PRB/WT)
// Mismos selectores y mismas condiciones que CopilotOrder (MatrixPanel.tsx).

import React, { memo } from 'react';
import { useLiveDecision, useLiveCapa1, useLiveEscudo, useTelemetryStore } from '@/store/telemetryStore';
import { toState, pickLabel, type BadgeState } from '@/components/CategoryTable';
import { abrevZonas } from '@/domain/juegaEsto';
import { C, FONT_MONO } from './theme';
import { Block, Lbl, head } from './ui';
import { GodTargetStrip, type GodTargetProps } from './ScoreLadder';

function ZoneRow({ etiqueta, zonas, color, pri = false, tid }: { etiqueta: string; zonas: string | null; color: string; pri?: boolean; tid: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }} data-qp={tid} title={zonas ?? undefined}>
      <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
        <Lbl color={C.ink2}>{etiqueta}</Lbl>
        {pri && <Lbl color={C.warn}>▲ PRIORIDAD</Lbl>}
      </span>
      <span style={{ ...head('var(--qp-fs-pick)', zonas ? color : C.ink4, 800), whiteSpace: 'nowrap' }}>
        {zonas ? abrevZonas(zonas) : '—'}
      </span>
    </div>
  );
}

function VoiceHead({ nombre, color, estado, estadoColor, tid }: { nombre: string; color: string; estado: string; estadoColor: string; tid: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <Lbl color={color} style={{ fontSize: 'var(--qp-fs-tbl)', letterSpacing: '0.14em' }}>{nombre}</Lbl>
      <span data-qp={tid} style={{ fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-lbl)', fontWeight: 800, color: estadoColor, border: `1px solid ${estadoColor}77`, borderRadius: 3, padding: '0 6px', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
        {estado}
      </span>
    </div>
  );
}

// ── CAPA 1 ───────────────────────────────────────────────────────────────
export const Capa1Block = memo(function Capa1Block() {
  const capa1 = useLiveCapa1();
  const pend = useTelemetryStore((s) => s.pending);
  const entra = capa1.mercado !== null && (capa1.accion === 'ENTRAR' || capa1.accion === 'SUAVE');
  const doc = entra && capa1.mercado === 'doc' ? (pend?.docPick || null) : null;
  const col = entra && capa1.mercado === 'col' ? (pend?.colPick || null) : null;
  const estado = capa1.accion === 'ENTRAR' ? 'ENTRA' : capa1.accion === 'SUAVE' ? 'ENTRA SUAVE' : capa1.accion === 'ESPERAR' ? 'ESPERA' : 'PARA';
  const estadoColor = entra ? C.capa1 : capa1.accion === 'PARAR' ? C.err : C.ink2;
  return (
    <div style={{ borderLeft: `2px solid ${C.capa1}`, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 3 }} data-qp="capa1">
      <VoiceHead nombre="CAPA 1 · COPILOTO" color={C.capa1} estado={estado} estadoColor={estadoColor} tid="capa1-estado" />
      <div style={{ display: 'flex', gap: 8 }}>
        <ZoneRow etiqueta="DOCENAS" zonas={doc} color={C.capa1} tid="capa1-doc" />
        <ZoneRow etiqueta="COLUMNAS" zonas={col} color={C.capa1} tid="capa1-col" />
      </div>
      <div data-qp="capa1-motivo" style={{ fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-txt)', color: C.ink2, lineHeight: 1.25, minHeight: 'calc(var(--qp-fs-txt) * 2.5)', overflow: 'hidden' }}>
        {capa1.motivo}
      </div>
    </div>
  );
});

// ── ESCUDO 1 ─────────────────────────────────────────────────────────────
export const EscudoBlock = memo(function EscudoBlock() {
  const d = useLiveDecision();
  const escudo = useLiveEscudo();
  const color = escudo.activo ? C.escudo : '#6f5a99';
  const priDoc = d.capa === 'COBERTURA_DOBLE' && d.principal === 'doc';
  const priCol = d.capa === 'COBERTURA_DOBLE' && d.principal === 'col';
  return (
    <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 3 }} data-qp="escudo">
      <VoiceHead nombre="ESCUDO 1 · COBERTURA" color={color} estado={escudo.activo ? 'CUBRE' : 'SIN COBERTURA'} estadoColor={escudo.activo ? C.escudo : C.ink2} tid="escudo-estado" />
      <div style={{ display: 'flex', gap: 8 }}>
        <ZoneRow etiqueta="DOCENAS" zonas={escudo.doc ? escudo.doc.zonas.join(' / ') : null} color={C.escudo} pri={priDoc} tid="escudo-doc" />
        <ZoneRow etiqueta="COLUMNAS" zonas={escudo.col ? escudo.col.zonas.join(' / ') : null} color={C.escudo} pri={priCol} tid="escudo-col" />
      </div>
    </div>
  );
});

// ── MOTOR: pick de DOCENAS / COLUMNAS (bet_advice del backend) ───────────
const BADGE_COLOR: Record<BadgeState, string> = { bet: C.ok, prb: C.white, wt: C.danna };
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

function MotorCell({ label, state, pick, tid }: { label: string; state: BadgeState; pick: string; tid: string }) {
  const c = BADGE_COLOR[state];
  return (
    <div data-qp={tid} data-state={state} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <Lbl color={C.ink2}>{label}</Lbl>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 800, color: c, background: `${c}22`, borderRadius: 2, padding: '0 4px' }}>{BADGE_TXT[state]}</span>
      </span>
      <span style={{ ...head(15, C.white, 800), whiteSpace: 'nowrap' }}>{pick}</span>
    </div>
  );
}

export const MotorPicks = memo(function MotorPicks({ payload }: { payload: any }) {
  const advice: Record<string, any> = payload?.decision?.bet_advice ?? {};
  return (
    <div style={{ borderLeft: `2px solid ${C.danna}`, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 3 }} data-qp="motor">
      <Lbl color={C.danna} style={{ fontSize: 'var(--qp-fs-tbl)', letterSpacing: '0.14em' }}>MOTOR · PICK POR MERCADO</Lbl>
      <div style={{ display: 'flex', gap: 8 }}>
        <MotorCell label="DOCENAS" state={toState(advice['docenas'])} pick={pickLabel(advice['docenas'])} tid="motor-doc" />
        <MotorCell label="COLUMNAS" state={toState(advice['columnas'])} pick={pickLabel(advice['columnas'])} tid="motor-col" />
      </div>
    </div>
  );
});

export function VoicesColumn({ payload, godTarget }: { payload: any; godTarget: GodTargetProps }) {
  return (
    <Block label="Voces: Capa 1, Escudo y Motor" testId="voces" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--qp-gap)' }}>
      <Capa1Block />
      <EscudoBlock />
      <MotorPicks payload={payload} />
      <GodTargetStrip {...godTarget} />
    </Block>
  );
}
