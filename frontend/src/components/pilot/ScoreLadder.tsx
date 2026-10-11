// Columna MARCADOR (nivel 2 — lectura): marcador D.A.N.N.A. + escalera
// "ERRORES SEGUIDOS · LLEGA A N O MÁS" de los TRES marcadores en UNA tabla
// (D.A.N.N.A. · CAPA 1 · ESCUDO) + GOD TARGET.
// Fórmulas: domain/rachasFrecuencia.ts (idénticas a MatrixPanel.RachasFrecuencia).

import React, { memo } from 'react';
import {
  useCopHits, useCopMisses, useCopWr, useCopLiveStreak, useCopStreak, useCopRachas, useCopRachasUlt,
  useCapa1Hits, useCapa1Misses, useCapa1Wr, useCapa1LiveStreak, useCapa1Streak, useCapa1Rachas, useCapa1RachasUlt,
  useEscudoHits, useEscudoMisses, useEscudoWr, useEscudoLiveStreak, useEscudoStreak, useEscudoRachas, useEscudoRachasUlt,
} from '@/store/telemetryStore';
import { ERR_NORMAL, filasRacha, RACHA_MAX_LEN, type FilaRacha } from '@/domain/rachasFrecuencia';
import { C, FONT_MONO, num } from './theme';
import { Block, Lbl, Val } from './ui';
import { colorRacha } from './CommandRow';

const labelFila = (len: number) => (len === 1 ? '1 error' : len >= RACHA_MAX_LEN ? '10 o más' : `${len} seguidos`);

const COLS = '56px repeat(9, minmax(0, 1fr))';
const MARCADORES = [
  { id: 'real', nombre: 'D.A.N.N.A.', color: C.danna },
  { id: 'capa1', nombre: 'CAPA 1', color: C.capa1 },
  { id: 'escudo', nombre: 'ESCUDO', color: C.escudo },
] as const;

const Cell = memo(function Cell({ f, mid, tid }: { f: FilaRacha | undefined; mid: string; tid: string }) {
  const R = (s: React.ReactNode, color: string, extra?: React.CSSProperties) => (
    <span style={{ textAlign: 'right', color, whiteSpace: 'nowrap', alignSelf: 'center', ...extra }}>{s}</span>
  );
  if (!f) {
    return (<>{R('·', C.ink4)}{R('', C.ink4)}{R('', C.ink4)}</>);
  }
  const colorCada = f.masSeguido ? C.warn : f.masEspaciado ? C.ok : (f.len >= 4 ? C.err : C.ink);
  const voyColor = f.enRacha ? C.err : f.voy >= f.ref ? C.warn : C.ink2;
  return (
    <>
      <span data-qp={`${tid}-cada`} style={{ textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center' }}>
        {f.cada !== null ? <b style={{ color: colorCada }}>{f.cada}</b> : <span style={{ color: C.ink3 }}>—</span>}
        {(f.masSeguido || f.masEspaciado) && <span style={{ color: f.masSeguido ? C.warn : C.ok }}>{f.masSeguido ? '▲' : '▼'}</span>}
      </span>
      {R(f.normal, C.ink3, { fontWeight: 400 })}
      <span data-qp={`${tid}-voy`} style={{ textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center', color: voyColor, fontWeight: f.enRacha ? 800 : 400 }}>{f.enRacha ? 'ahora' : f.voy}</span>
    </>
  );
});

export const Ladder = memo(function Ladder() {
  const copLive = useCopLiveStreak(), cop = { r: useCopRachas(), u: useCopRachasUlt(), s: useCopHits() + useCopMisses() };
  const c1Live = useCapa1LiveStreak(), c1 = { r: useCapa1Rachas(), u: useCapa1RachasUlt(), s: useCapa1Hits() + useCapa1Misses() };
  const esLive = useEscudoLiveStreak(), es = { r: useEscudoRachas(), u: useEscudoRachasUlt(), s: useEscudoHits() + useEscudoMisses() };

  const sets = [
    { m: MARCADORES[0], rows: filasRacha(cop.r, cop.u, copLive, cop.s, ERR_NORMAL.real) },
    { m: MARCADORES[1], rows: filasRacha(c1.r, c1.u, c1Live, c1.s, ERR_NORMAL.capa1) },
    { m: MARCADORES[2], rows: filasRacha(es.r, es.u, esLive, es.s, ERR_NORMAL.escudo) },
  ];
  const byLen = (i: number, len: number) => sets[i].rows.find((r) => r.len === len);
  const H: React.CSSProperties = { fontSize: 9, color: C.ink3, textAlign: 'right', fontWeight: 600 };

  return (
    <div data-qp="escalera" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: FONT_MONO, ...num }}>
      <Lbl color={C.ink2}>ERRORES SEGUIDOS · LLEGA A N O MÁS</Lbl>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 4 }}>
        <span />
        {MARCADORES.map((m) => (
          <span key={m.id} style={{ gridColumn: 'span 3', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', color: m.color, borderBottom: `1px solid ${m.color}66`, textAlign: 'center', marginBottom: 1 }}>{m.nombre}</span>
        ))}
        <span style={{ fontSize: 9, color: C.ink3, fontWeight: 600 }}>llega a</span>
        {MARCADORES.map((m) => (
          <React.Fragment key={m.id}>
            <span style={H}>cada</span><span style={H}>normal</span><span style={H}>voy</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gridTemplateRows: 'repeat(4, var(--qp-ladder)) repeat(6, var(--qp-ladder-low))', columnGap: 4, fontSize: 10, lineHeight: 1 }}>
        {Array.from({ length: RACHA_MAX_LEN }, (_, i) => i + 1).map((len) => {
          const rowsAny = sets.some((_, i) => byLen(i, len));
          const reached = sets.some((s) => (s.rows.find((r) => r.len === len)?.c ?? 0) > 0);
          const labelColor = !rowsAny ? C.ink4 : !reached ? C.ink3 : len >= 4 ? C.err : len === 3 ? C.white : C.ink2;
          return (
            <React.Fragment key={len}>
              <span data-qp={`esc-${len}`} style={{ color: labelColor, whiteSpace: 'nowrap', alignSelf: 'center', fontSize: len <= 4 ? 10 : 9 }}>{labelFila(len)}</span>
              {sets.map((s, i) => (
                <div key={s.m.id} style={{ display: 'contents' }}>
                  <Cell f={byLen(i, len)} mid={s.m.id} tid={`esc-${s.m.id}-${len}`} />
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
});

const Tile = ({ k, v, c }: { k: string; v: React.ReactNode; c: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
    <Lbl color={C.ink2}>{k}</Lbl>
    <Val color={c} size="var(--qp-fs-val)"><span data-k={k}>{v}</span></Val>
  </div>
);

export interface GodTargetProps { hits: number; misses: number; consec: number; max: number; errHit: number }

// MARCADORES: los tres marcadores en UNA tabla (antes: marcador D.A.N.N.A. + dos
// tiras sueltas dentro de Capa 1 y Escudo). Mismos selectores, misma regla de
// color de racha. Se compara de un vistazo leyendo por columna.
const SC_COLS = '70px 50px 44px 66px 40px 1fr';
export const Scoreboard = memo(function Scoreboard() {
  const rows = [
    { id: 'real', nombre: 'D.A.N.N.A.', color: C.danna, hits: useCopHits(), misses: useCopMisses(), wr: useCopWr(), live: useCopLiveStreak(), peor: useCopStreak() },
    { id: 'capa1', nombre: 'CAPA 1', color: C.capa1, hits: useCapa1Hits(), misses: useCapa1Misses(), wr: useCapa1Wr(), live: useCapa1LiveStreak(), peor: useCapa1Streak() },
    { id: 'escudo', nombre: 'ESCUDO', color: C.escudo, hits: useEscudoHits(), misses: useEscudoMisses(), wr: useEscudoWr(), live: useEscudoLiveStreak(), peor: useEscudoStreak() },
  ];
  const H: React.CSSProperties = { fontSize: 9, color: C.ink2, fontWeight: 700, textAlign: 'right', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const R = (k: string, v: React.ReactNode, color: string) => (
    <span data-k={k} style={{ textAlign: 'right', color, fontWeight: 700, fontSize: 'var(--qp-fs-val)', whiteSpace: 'nowrap' }}>{v}</span>
  );
  return (
    <div data-qp="marcador" style={{ display: 'grid', gridTemplateColumns: SC_COLS, gridAutoRows: 'var(--qp-sc-row)', columnGap: 4, alignItems: 'center', lineHeight: 1, ...num }}>
      <span />
      <span style={H}>ACIERTOS</span><span style={H}>ERRORES</span><span style={H}>EFECTIVIDAD</span><span style={H}>RACHA</span><span style={H}>PEOR RACHA</span>
      {rows.map((r) => (
        <React.Fragment key={r.id}>
          <span style={{ fontSize: 10, fontWeight: 800, color: r.color, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{r.nombre}</span>
          {R(`${r.id}-aciertos`, r.hits, C.ok)}
          {R(`${r.id}-errores`, r.misses, C.err)}
          {R(`${r.id}-efectividad`, r.wr !== null ? `${r.wr.toFixed(0)}%` : '—', C.ink)}
          {R(`${r.id}-racha`, r.live, colorRacha(r.live))}
          {R(`${r.id}-peor`, r.peor, r.peor >= 4 ? C.err : C.ink)}
        </React.Fragment>
      ))}
    </div>
  );
});

export const GodTargetStrip = memo(function GodTargetStrip(p: GodTargetProps) {
  return (
    <div data-qp="god-target" style={{ display: 'flex', flexDirection: 'column', gap: 1, borderLeft: `2px solid ${C.white}55`, paddingLeft: 8 }}>
      <Lbl color={C.ink3}>GOD TARGET</Lbl>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        <Tile k="ACIERTOS" v={p.hits} c={C.ok} />
        <Tile k="ERRORES" v={p.misses} c={C.err} />
        <Tile k="CONSEC" v={p.consec} c={p.consec > 0 ? C.err : C.ink2} />
        <Tile k="MÁX" v={p.max} c={C.ink} />
        <Tile k="ERR/HIT" v={p.errHit.toFixed(1)} c={C.err} />
      </div>
    </div>
  );
});

export function ScoreColumn() {
  return (
    <Block label="Marcador y errores seguidos" testId="marcador-col" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--qp-gap)' }}>
      <Scoreboard />
      <Ladder />
    </Block>
  );
}
