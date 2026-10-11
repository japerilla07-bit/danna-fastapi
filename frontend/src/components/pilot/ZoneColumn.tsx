// Columna ZONA (nivel 2 — lectura): una tarjeta por mercado (DOCENAS /
// COLUMNAS) con exactamente los datos de MarketEfficiencyCell (MatrixPanel):
// estado fusionado ▲▼, HUD·ENT, aciertos/errores hoy, racha del mercado, últ.10,
// eficiencia de la casilla, HOY EN ESTA CASILLA y qué hacer.

import React, { memo } from 'react';
import {
  useLastHud, useLastEnt, useCellRec,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useTermoHits, useTermoTotal,
} from '@/store/telemetryStore';
import { cellKeyOf, cellStats, fusedZone, liveDeviation, type Zone, type Market } from '@/domain/zoneMatrix';
import { STYLE, INSTRUCCION } from '@/components/MatrixPanel';
import { C, FONT_HEAD } from './theme';
import { Block, Lbl, Val, Hair } from './ui';
import { colorRacha } from './CommandRow';

export const ZONE_TONE: Record<Zone, string> = {
  SANTUARIO: C.ok, VERDE: C.ok, PROBE: C.white, TOXICA: C.err, AGUJERO: C.err, NEUTRA: C.ink3,
};

/** Luz del termómetro de los últimos 10 (misma regla que MatrixPanel). */
export function luzTermo(hits: number, total: number): string {
  const ratio = total > 0 ? hits / total : 0;
  return total < 3 ? C.ink3 : ratio >= 0.7 ? C.ok : ratio >= 0.5 ? C.warn : C.err;
}

const Line = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, fontSize: 'var(--qp-fs-tbl)', color: C.ink2, whiteSpace: 'nowrap', minHeight: 'var(--qp-row)' }}>{children}</div>
);

const MarketCard = memo(function MarketCard({ mkt }: { mkt: Market }) {
  const hud = useLastHud();
  const ent = useLastEnt();
  const key = cellKeyOf(hud, ent);
  const map = cellStats(hud, ent, mkt);
  const live = useCellRec(mkt, key);
  const estado: Zone = fusedZone(hud, ent, mkt, live);
  const deviation = liveDeviation(hud, ent, mkt, live);
  const tone = ZONE_TONE[estado];
  const title = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const termoHits = useTermoHits(mkt, 10);
  const termoTotal = useTermoTotal(mkt, 10);
  const luz = luzTermo(termoHits, termoTotal);
  const gHits = useMarketHits(mkt);
  const gMiss = useMarketMisses(mkt);
  const gMax = useMarketMaxStreak(mkt);
  const gCur = useMarketStreak(mkt);
  const gTotal = gHits + gMiss;
  const cur = live?.streak ?? 0;

  return (
    <div data-qp={`zona-${mkt}`} data-estado={estado} style={{ display: 'flex', flexDirection: 'column', gap: 1, borderLeft: `3px solid ${tone}`, paddingLeft: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 800, letterSpacing: '0.12em', color: C.ink }}>{title}</span>
        <span data-qp={`zona-${mkt}-estado`} style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 800, letterSpacing: '0.04em', color: tone, whiteSpace: 'nowrap' }}>
          {STYLE[estado].label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>
      <Line>
        <span>HUD <b style={{ color: C.ink }}>{hud ?? '—'}</b> · ENT <b style={{ color: C.ink }}>{ent ?? '—'}</b></span>
        <span>
          <span style={{ color: C.ok }}>✓{gHits}</span> <span style={{ color: C.err }}>✗{gMiss}</span>
          {' '}<b style={{ color: C.ink2 }}>{gTotal ? `${Math.round((gHits / gTotal) * 100)}%` : '—'}</b>
        </span>
      </Line>
      <Line>
        <span>racha actual <b style={{ color: colorRacha(gCur) }}>{gCur}</b> · peor racha <b style={{ color: gMax >= 4 ? C.err : C.ink }}>{gMax}</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: luz }} />
          últ. 10 <b style={{ color: luz }}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</b>
        </span>
      </Line>
      <Line>
        <span>
          eficiencia{' '}
          {map ? (
            <>
              <b style={{ color: C.ink }}>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</b>
              {' · techo '}<b style={{ color: map.maxRun >= 5 ? C.err : C.ink }}>{map.maxRun}</b>
              <span style={{ color: C.ink3 }}> ({map.n}g)</span>
            </>
          ) : (<span style={{ color: C.ink3 }}>sin datos en esta casilla</span>)}
        </span>
      </Line>
      <Line>
        <span>
          <Lbl color={C.ink3}>HOY EN ESTA CASILLA</Lbl>{' '}
          <span style={{ color: C.ok }}>✓{live?.hits ?? 0}</span>{' '}
          <span style={{ color: C.err }}>✗{live?.misses ?? 0}</span>
          {' · racha '}<b style={{ color: colorRacha(cur) }}>{cur}</b>
          {' · peor '}<b style={{ color: (live?.maxStreak ?? 0) >= 4 ? C.err : C.ink }}>{live?.maxStreak ?? 0}</b>
        </span>
      </Line>
      <div data-qp={`zona-${mkt}-instr`} style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: tone, lineHeight: 1.15, minHeight: 17 }}>
        {INSTRUCCION[estado]}
      </div>
    </div>
  );
});

export function ZoneColumn() {
  return (
    <Block label="Zona actual" testId="zona" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--qp-gap)' }}>
      <MarketCard mkt="doc" />
      <Hair />
      <MarketCard mkt="col" />
    </Block>
  );
}
