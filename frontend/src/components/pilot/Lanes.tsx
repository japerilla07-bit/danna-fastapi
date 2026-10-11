// TRES CARRILES (nivel 2 · lectura): D.A.N.N.A. · CAPA 1 · ESCUDO.
// Cada carril reúne TODO lo de una voz, de arriba abajo:
//   cabecera + estado · qué juega (docenas / columnas) · nota · marcador · escalera
//   "errores seguidos · llega a N o más" (cada / normal / voy).
// El riel de color a la izquierda recorre el carril entero: es la identidad del panel.
// Mismos selectores del store y mismas fórmulas (domain/rachasFrecuencia) que la v8.

import React, { memo } from 'react';
import {
  useCopHits, useCopMisses, useCopWr, useCopLiveStreak, useCopStreak, useCopRachas, useCopRachasUlt,
  useCapa1Hits, useCapa1Misses, useCapa1Wr, useCapa1LiveStreak, useCapa1Streak, useCapa1Rachas, useCapa1RachasUlt,
  useEscudoHits, useEscudoMisses, useEscudoWr, useEscudoLiveStreak, useEscudoStreak, useEscudoRachas, useEscudoRachasUlt,
  useLiveDecision, useLiveCapa1, useLiveEscudo, useTelemetryStore,
} from '@/store/telemetryStore';
import { toState, pickLabel, type BadgeState } from '@/components/CategoryTable';
import { ERR_NORMAL, filasRacha, RACHA_MAX_LEN, type FilaRacha } from '@/domain/rachasFrecuencia';
import { abrevZonas } from '@/domain/juegaEsto';
import { C, FONT_UI, LANE_STACK_GAP, LANE_PAD_B, LANE_PAD_T, num, rgba, neon, glowText } from './theme';
import { computeJuega } from '@/domain/juegaEsto';
import { Lbl, Txt, Val, Big } from './ui';
import { colorRacha } from './CommandRow';

type LaneId = 'real' | 'capa1' | 'escudo';

// ── Jugada (docenas / columnas) ──────────────────────────────────────────
function PickRow({ etiqueta, texto, color, tid, pri = false, chip, state }: { etiqueta: string; texto: string | null; color: string; tid: string; pri?: boolean; chip?: BadgeState; state?: BadgeState }) {
  const chipColor = chip ? BADGE_COLOR[chip] : C.ink3;
  return (
    <div data-qp={tid} data-state={state} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--qp-lane-pick)', minWidth: 0 }}>
      <span style={{ width: 62, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center' }}>
        <Lbl color={C.ink2}>{etiqueta}</Lbl>
        {pri && <Lbl color={C.warn} style={{ fontWeight: 600, fontSize: 'calc(var(--qp-fs-lbl) - 1px)' }}>▲ prioridad</Lbl>}
        {chip && <span style={{ alignSelf: 'flex-start', fontFamily: FONT_UI, fontSize: 9, fontWeight: 700, color: chipColor, background: `${chipColor}22`, borderRadius: 2, padding: '0 4px', lineHeight: '12px' }}>{BADGE_TXT[chip]}</span>}
      </span>
      <Big size="var(--qp-fs-pick)" weight={600} glow={texto ? 0.65 : 0} color={texto ? color : C.ink4} style={{ whiteSpace: 'nowrap', minWidth: 0 }}>{texto ? abrevZonas(texto) || texto : '—'}</Big>
    </div>
  );
}

const BADGE_COLOR: Record<BadgeState, string> = { bet: C.ok, prb: C.white, wt: C.danna };
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

// ── Marco del carril ─────────────────────────────────────────────────────
function Head({ nombre, sub, color, estado, estadoColor, tid }: { nombre: string; sub: string; color: string; estado?: string; estadoColor?: string; tid: string }) {
  return (
    <div style={{ height: 'var(--qp-lane-head)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) + 2px)', fontWeight: 700, color, whiteSpace: 'nowrap', textShadow: glowText(color, 0.85) }}>{nombre}</span>
        <Lbl color={C.ink3}>{sub}</Lbl>
      </span>
      {estado && estadoColor && (
        <span data-qp={tid} style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-lbl) - 0.5px)', fontWeight: 700, color: estadoColor, background: rgba(estadoColor, 0.14), border: `1px solid ${rgba(estadoColor, 0.5)}`, boxShadow: neon(estadoColor, 8, 0.3), borderRadius: 3, padding: '0 6px', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{estado}</span>
      )}
    </div>
  );
}

function Score({ id, hits, misses, wr, live, peor }: { id: LaneId; hits: number; misses: number; wr: number | null; live: number; peor: number }) {
  const cell = (k: string, tid: string, v: React.ReactNode, c: string) => (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Lbl color={C.ink3}>{k}</Lbl>
      <Big size="var(--qp-fs-val)" color={c} weight={700} glow={c === C.ink ? 0 : 0.6}><span data-k={`${id}-${tid}`}>{v}</span></Big>
    </span>
  );
  return (
    <div data-qp={`score-${id}`} style={{ height: 'var(--qp-lane-score)', display: 'grid', gridTemplateColumns: '38px 34px 52px 28px 1fr', columnGap: 2, alignItems: 'start' }}>
      {cell('aciertos', 'aciertos', hits, C.ok)}
      {cell('errores', 'errores', misses, C.err)}
      {cell('efectividad', 'efectividad', wr !== null ? `${wr.toFixed(0)}%` : '—', C.ink)}
      {cell('racha', 'racha', live, colorRacha(live))}
      {cell('peor racha', 'peor', peor, peor >= 4 ? C.err : C.ink)}
    </div>
  );
}

const labelFila = (len: number) => (len === 1 ? '1 error' : len >= RACHA_MAX_LEN ? '10 o más' : `${len} seguidos`);
const LADDER_COLS = '58px 1fr 1fr 1fr';

function Ladder({ id, color, rows }: { id: LaneId; color: string; rows: FilaRacha[] }) {
  const byLen = (len: number) => rows.find((r) => r.len === len);
  const H: React.CSSProperties = { textAlign: 'right' };
  return (
    <div data-qp={`escalera-${id}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 'var(--qp-ladder-head)', display: 'grid', gridTemplateColumns: LADDER_COLS, columnGap: 4, alignItems: 'center', borderBottom: `1px solid ${color}55` }}>
        <Lbl color={C.ink3}>llega a</Lbl>
        <Lbl color={C.ink3} style={H}>cada</Lbl><Lbl color={C.ink3} style={H}>normal</Lbl><Lbl color={C.ink3} style={H}>voy</Lbl>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: LADDER_COLS, gridTemplateRows: 'repeat(4, var(--qp-ladder)) repeat(6, var(--qp-ladder-low))', columnGap: 4, lineHeight: 1, ...num, fontSize: 'var(--qp-fs-tbl)' }}>
        {Array.from({ length: RACHA_MAX_LEN }, (_, i) => i + 1).map((len) => {
          const f = byLen(len);
          const reached = (f?.c ?? 0) > 0;
          const labelColor = !f ? C.ink4 : !reached ? C.ink3 : len >= 4 ? C.err : len === 3 ? C.white : C.ink2;
          const tid = `esc-${id}-${len}`;
          const colorCada = f ? (f.masSeguido ? C.warn : f.masEspaciado ? C.ok : len >= 4 ? C.err : C.ink) : C.ink4;
          const voyColor = f ? (f.enRacha ? C.err : f.voy >= f.ref ? C.warn : C.ink2) : C.ink4;
          const R = (x: React.ReactNode, c: string, extra?: React.CSSProperties) => <span style={{ textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center', color: c, ...extra }}>{x}</span>;
          return (
            <React.Fragment key={len}>
              <span data-qp={`esc-${len}`} style={{ fontFamily: FONT_UI, color: labelColor, whiteSpace: 'nowrap', alignSelf: 'center', fontSize: len <= 4 ? 'var(--qp-fs-tbl)' : 'calc(var(--qp-fs-tbl) - 1px)' }}>{labelFila(len)}</span>
              {f ? (
                <>
                  <span data-qp={`${tid}-cada`} style={{ textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                    {f.cada !== null ? <b style={{ color: colorCada }}>{f.cada}</b> : <span style={{ color: C.ink3 }}>—</span>}
                    {(f.masSeguido || f.masEspaciado) && <span style={{ color: f.masSeguido ? C.warn : C.ok }}>{f.masSeguido ? '▲' : '▼'}</span>}
                  </span>
                  <span data-qp={`${tid}-normal`} style={{ textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center', color: C.ink3 }}>{f.normal}</span>
                  <span data-qp={`${tid}-voy`} style={{ textAlign: 'right', whiteSpace: 'nowrap', alignSelf: 'center', color: voyColor, fontWeight: f.enRacha ? 800 : 400 }}>{f.enRacha ? 'ahora' : f.voy}</span>
                </>
              ) : (
                <>
                  <span data-qp={`${tid}-cada`} style={{ textAlign: 'right', alignSelf: 'center', color: C.ink4 }}>·</span>{R('', C.ink4)}{R('', C.ink4)}
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function Frame({ id, color, children }: { id: LaneId; color: string; children: React.ReactNode }) {
  return (
    <section
      data-qp={`lane-${id}`}
      aria-label={id === 'real' ? 'D.A.N.N.A.' : id === 'capa1' ? 'Capa 1' : 'Escudo 1'}
      style={{
        position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: LANE_STACK_GAP, boxSizing: 'border-box',
        padding: `${LANE_PAD_T}px 8px ${LANE_PAD_B}px 10px`, borderRadius: 6,
        border: `1px solid ${rgba(color, 0.55)}`, borderLeft: `3px solid ${color}`,
        background: `linear-gradient(180deg, ${rgba(color, 0.27)}, ${rgba(color, 0.08)} 36%, rgba(255,255,255,0.02))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 4px 0 16px -6px ${rgba(color, 0.9)}, ${neon(color, 18, 0.3)}`,
      }}
    >
      <span aria-hidden style={{ position: 'absolute', top: -1, left: 12, right: 12, height: 1, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: neon(color, 6, 0.9) }} />
      {children}
    </section>
  );
}

const Note = ({ children, tid }: { children?: React.ReactNode; tid?: string }) => (
  <div data-qp={tid} style={{ height: 'var(--qp-lane-note)', fontFamily: FONT_UI, fontSize: 'var(--qp-fs-txt)', color: C.ink2, lineHeight: 1.2, minWidth: 0 }}>{children}</div>
);

// ── D.A.N.N.A. (la que ELIGE entre Capa 1 y Escudo) ───────────────────────
// Su jugada es "Juega esto" (la decisión real que puntúa su marcador y su escalera).
// La sugerencia base del motor (BET/WT de la tabla) va aparte, rotulada "Motor base".
const FUENTE_COLOR = { ESCUDO: C.escudo, 'CAPA 1': C.capa1 } as const;

export const LaneReal = memo(function LaneReal({ payload }: { payload: any }) {
  const hits = useCopHits(), misses = useCopMisses(), wr = useCopWr(), live = useCopLiveStreak(), peor = useCopStreak();
  const rachas = useCopRachas(), ult = useCopRachasUlt();
  const d = useLiveDecision();
  const pend = useTelemetryStore((s) => s.pending);
  const j = computeJuega(d, pend);
  const advice: Record<string, any> = payload?.decision?.bet_advice ?? {};
  const sd = toState(advice['docenas']), sc = toState(advice['columnas']);
  const fc = j.fuente ? FUENTE_COLOR[j.fuente] : C.ink2;
  return (
    <Frame id="real" color={C.danna}>
      <Head nombre="D.A.N.N.A." sub="elige la voz" color={C.danna} estado={j.fuente ? `SIGUE ${j.fuente}` : 'ESPERA'} estadoColor={fc} tid="real-estado" />
      {/* Sugerencia base del motor (la misma de la tabla de categorías): grande, porque es una de las tres voces. */}
      <div>
        <MotorRow label="Docenas" state={sd} pick={pickLabel(advice['docenas'])} tid="motor-doc" />
        <MotorRow label="Columnas" state={sc} pick={pickLabel(advice['columnas'])} tid="motor-col" />
      </div>
      {/* Qué mide el marcador de abajo (lo juega D.A.N.N.A., no el motor): se dice con todas las letras. */}
      <Note tid="real-nota">
        <span style={{ color: C.danna, fontWeight: 600 }}>Marcador D.A.N.N.A.</span> = lo que jugó siguiendo a Capa 1 y Escudo
      </Note>
      <Score id="real" hits={hits} misses={misses} wr={wr} live={live} peor={peor} />
      <Ladder id="real" color={C.danna} rows={filasRacha(rachas, ult, live, hits + misses, ERR_NORMAL.real)} />
    </Frame>
  );
});

/** Sugerencia base del motor: jugada grande con su estado BET / PRB / WT. */
function MotorRow({ label, state, pick, tid }: { label: string; state: BadgeState; pick: string; tid: string }) {
  const c = BADGE_COLOR[state];
  return (
    <div data-qp={tid} data-state={state} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--qp-lane-pick)', minWidth: 0 }}>
      <span style={{ width: 62, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center' }}>
        <Lbl color={C.ink2}>{label}</Lbl>
        <span style={{ alignSelf: 'flex-start', fontFamily: FONT_UI, fontSize: 9, fontWeight: 700, color: c, background: rgba(c, 0.16), border: `1px solid ${rgba(c, 0.5)}`, boxShadow: neon(c, 6, 0.4), borderRadius: 2, padding: '0 3px', lineHeight: '11px' }}>{BADGE_TXT[state]}</span>
      </span>
      <Big size="var(--qp-fs-pick)" weight={600} color={C.white} glow={0.65} glowColor={C.danna} style={{ whiteSpace: 'nowrap', minWidth: 0 }}>{abrevZonas(pick) || pick}</Big>
    </div>
  );
}

// ── CAPA 1 · copiloto ────────────────────────────────────────────────────
export const LaneCapa1 = memo(function LaneCapa1() {
  const capa1 = useLiveCapa1();
  const pend = useTelemetryStore((s) => s.pending);
  const hits = useCapa1Hits(), misses = useCapa1Misses(), wr = useCapa1Wr(), live = useCapa1LiveStreak(), peor = useCapa1Streak();
  const rachas = useCapa1Rachas(), ult = useCapa1RachasUlt();
  const entra = capa1.mercado !== null && (capa1.accion === 'ENTRAR' || capa1.accion === 'SUAVE');
  const doc = entra && capa1.mercado === 'doc' ? (pend?.docPick || null) : null;
  const col = entra && capa1.mercado === 'col' ? (pend?.colPick || null) : null;
  const estado = capa1.accion === 'ENTRAR' ? 'ENTRA' : capa1.accion === 'SUAVE' ? 'ENTRA SUAVE' : capa1.accion === 'ESPERAR' ? 'ESPERA' : 'PARA';
  const estadoColor = entra ? C.capa1 : capa1.accion === 'PARAR' ? C.err : C.ink2;
  return (
    <Frame id="capa1" color={C.capa1}>
      <Head nombre="Capa 1" sub="copiloto" color={C.capa1} estado={estado} estadoColor={estadoColor} tid="capa1-estado" />
      <div>
        <PickRow etiqueta="Docenas" texto={doc} color={C.capa1} tid="capa1-doc" />
        <PickRow etiqueta="Columnas" texto={col} color={C.capa1} tid="capa1-col" />
      </div>
      <Note tid="capa1-motivo">{capa1.motivo}</Note>
      <Score id="capa1" hits={hits} misses={misses} wr={wr} live={live} peor={peor} />
      <Ladder id="capa1" color={C.capa1} rows={filasRacha(rachas, ult, live, hits + misses, ERR_NORMAL.capa1)} />
    </Frame>
  );
});

// ── ESCUDO 1 · cobertura ─────────────────────────────────────────────────
export const LaneEscudo = memo(function LaneEscudo() {
  const d = useLiveDecision();
  const escudo = useLiveEscudo();
  const hits = useEscudoHits(), misses = useEscudoMisses(), wr = useEscudoWr(), live = useEscudoLiveStreak(), peor = useEscudoStreak();
  const rachas = useEscudoRachas(), ult = useEscudoRachasUlt();
  const color = escudo.activo ? C.escudo : '#8a74bd';
  const priDoc = d.capa === 'COBERTURA_DOBLE' && d.principal === 'doc';
  const priCol = d.capa === 'COBERTURA_DOBLE' && d.principal === 'col';
  return (
    <Frame id="escudo" color={color}>
      <Head nombre="Escudo 1" sub="cobertura" color={color} estado={escudo.activo ? 'CUBRE' : 'SIN COBERTURA'} estadoColor={escudo.activo ? C.escudo : C.ink2} tid="escudo-estado" />
      <div>
        <PickRow etiqueta="Docenas" texto={escudo.doc ? escudo.doc.zonas.join(' / ') : null} color={C.escudo} tid="escudo-doc" pri={priDoc} />
        <PickRow etiqueta="Columnas" texto={escudo.col ? escudo.col.zonas.join(' / ') : null} color={C.escudo} tid="escudo-col" pri={priCol} />
      </div>
      <Note />
      <Score id="escudo" hits={hits} misses={misses} wr={wr} live={live} peor={peor} />
      <Ladder id="escudo" color={color} rows={filasRacha(rachas, ult, live, hits + misses, ERR_NORMAL.escudo)} />
    </Frame>
  );
});
