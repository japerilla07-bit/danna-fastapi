// ESTADO DE LA CASILLA (columna derecha): una lectura por mercado (docenas /
// columnas) con exactamente los datos de MarketEfficiencyCell (MatrixPanel):
// estado fusionado ▲▼, HUD·ENT, aciertos/errores, racha, últ.10, eficiencia de la
// casilla, HOY EN ESTA CASILLA y qué hacer. Sin cajas: un riel de color por estado.

import React, { memo } from 'react';
import {
  useLastHud, useLastEnt, useCellRec,
  useMarketHits, useMarketMisses, useMarketMaxStreak, useMarketStreak,
  useTermoHits, useTermoTotal,
} from '@/store/telemetryStore';
import { cellKeyOf, cellStats, fusedZone, liveDeviation, type Zone, type Market } from '@/domain/zoneMatrix';
import { STYLE, INSTRUCCION } from '@/components/MatrixPanel';
import { C, FONT_UI, num, rgba, glowText, neon } from './theme';
import { Hair } from './ui';
import { colorRacha } from './CommandRow';

export const ZONE_TONE: Record<Zone, string> = {
  SANTUARIO: C.ok, VERDE: C.ok, PROBE: C.white, TOXICA: C.err, AGUJERO: C.err, NEUTRA: C.ink3,
};

/** Luz del termómetro de los últimos 10 (misma regla que MatrixPanel). */
export function luzTermo(hits: number, total: number): string {
  const ratio = total > 0 ? hits / total : 0;
  return total < 3 ? C.ink3 : ratio >= 0.7 ? C.ok : ratio >= 0.5 ? C.warn : C.err;
}

const Line = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, fontFamily: FONT_UI, fontSize: 'var(--qp-fs-txt)', color: C.ink2, whiteSpace: 'nowrap', minHeight: 'calc(var(--qp-fs-txt) * 1.3)' }}>
    <span>{children}</span>{right}
  </div>
);
const B = ({ c = C.ink, children }: { c?: string; children: React.ReactNode }) => <b style={{ ...num, color: c, fontWeight: 600, fontSize: 'calc(var(--qp-fs-txt) - 0.5px)' }}>{children}</b>;

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
    <div data-qp={`zona-${mkt}`} data-estado={estado} style={{ display: 'flex', flexDirection: 'column', gap: 1, borderLeft: `3px solid ${tone}`, paddingLeft: 8, paddingRight: 2, borderRadius: 4, minWidth: 0, flex: 1, justifyContent: 'space-between', background: `linear-gradient(90deg, ${rgba(tone, 0.2)}, ${rgba(tone, 0.06)} 75%, transparent)`, boxShadow: `inset 4px 0 14px -5px ${rgba(tone, 0.95)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 4px)', fontWeight: 700, color: C.ink }}>{title}</span>
        <span data-qp={`zona-${mkt}-estado`} style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 4px)', fontWeight: 700, color: tone, whiteSpace: 'nowrap', textShadow: glowText(tone.startsWith('#') ? tone : C.ink3, 0.85) }}>
          {STYLE[estado].label}{deviation === 'peor' ? ' ▼' : deviation === 'mejor' ? ' ▲' : ''}
        </span>
      </div>
      <Line right={<span><span style={{ color: C.ok }}>✓<B c={C.ok}>{gHits}</B></span> <span style={{ color: C.err }}>✗<B c={C.err}>{gMiss}</B></span> <B c={C.ink2}>{gTotal ? `${Math.round((gHits / gTotal) * 100)}%` : '—'}</B></span>}>
        HUD <B>{hud ?? '—'}</B> · ENT <B>{ent ?? '—'}</B>
      </Line>
      <Line right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: luz }} />últ. 10 <B c={luz}>{termoTotal > 0 ? `${termoHits}/${termoTotal}` : '—'}</B></span>}>
        racha actual <B c={colorRacha(gCur)}>{gCur}</B> · peor racha <B c={gMax >= 4 ? C.err : C.ink}>{gMax}</B>
      </Line>
      <Line>
        eficiencia{' '}
        {map ? (
          <>
            <B>{map.n ? Math.round((map.hits / map.n) * 100) : 0}%</B>
            {' · techo '}<B c={map.maxRun >= 5 ? C.err : C.ink}>{map.maxRun}</B>
            <span style={{ color: C.ink3 }}> ({map.n}g)</span>
          </>
        ) : (<span style={{ color: C.ink3 }}>sin datos en esta casilla</span>)}
      </Line>
      <Line>
        <span style={{ color: C.ink3 }}>HOY EN ESTA CASILLA</span>{' '}
        <span style={{ color: C.ok }}>✓<B c={C.ok}>{live?.hits ?? 0}</B></span>{' '}
        <span style={{ color: C.err }}>✗<B c={C.err}>{live?.misses ?? 0}</B></span>
        {' · racha '}<B c={colorRacha(cur)}>{cur}</B>
        {' · peor '}<B c={(live?.maxStreak ?? 0) >= 4 ? C.err : C.ink}>{live?.maxStreak ?? 0}</B>
      </Line>
      <div data-qp={`zona-${mkt}-instr`} style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 3px)', fontWeight: 600, color: tone, lineHeight: 1.15, textShadow: glowText(tone.startsWith('#') ? tone : C.ink3, 0.3), minHeight: 'calc(var(--qp-fs-txt) * 1.4)' }}>
        {INSTRUCCION[estado]}
      </div>
    </div>
  );
});

export function ZoneColumn() {
  return (
    <section aria-label="Estado de la casilla actual" data-qp="zona" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--qp-gap)', minHeight: 0, minWidth: 0 }}>
      <MarketCard mkt="doc" />
      <Hair />
      <MarketCard mkt="col" />
    </section>
  );
}
