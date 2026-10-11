// FRANJA DE VEREDICTO (lo primero que se lee): JUEGA ESTO · ERRORES SEGUIDOS · GOD.
// Superficie elevada (bg2): es lo que RECOMIENDA el motor y el estado de riesgo.
// Mismos selectores y mismos cálculos que la v8; solo cambia la composición.

import React, { memo } from 'react';
import { useLiveDecision, useTelemetryStore, useCopLiveStreak, useCopStreak } from '@/store/telemetryStore';
import { computeJuega, abrevZonas } from '@/domain/juegaEsto';
import { useOutcomeTape, TAPE_LEN } from '@/domain/outcomeTape';
import { C, FONT_UI, FONT_NUM, TOPE_ERRORES, rgba, neon, glowText } from './theme';
import { Lbl, Txt, Val, Big, StreakGauge } from './ui';

const COLOR_FUENTE = { ESCUDO: C.escudo, 'CAPA 1': C.capa1 } as const;
const NOMBRE_FUENTE = { ESCUDO: 'Escudo', 'CAPA 1': 'Capa 1' } as const;

const seg: React.CSSProperties = { minWidth: 0, minHeight: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 14px' };

// ── JUEGA ESTO ───────────────────────────────────────────────────────────
export const OrdenTile = memo(function OrdenTile() {
  const d = useLiveDecision();
  const pend = useTelemetryStore((s) => s.pending);
  const j = computeJuega(d, pend);
  const colorF = j.fuente ? COLOR_FUENTE[j.fuente] : C.ink3;
  const nivelColor = d.nivel === 'ok' ? C.ok : d.nivel === 'precaucion' ? C.white : C.err;

  return (
    <section aria-label="Juega esto" data-qp="orden" style={{ ...seg, gap: 'calc(var(--qp-gap) * 0.7)', borderLeft: `3px solid ${j.fuente ? colorF : C.line2}`, boxShadow: j.fuente ? `inset 4px 0 14px -6px ${rgba(colorF, 0.9)}` : undefined, borderRadius: '6px 0 0 6px', background: j.fuente ? `linear-gradient(90deg, ${rgba(colorF, 0.16)}, transparent 70%)` : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ display: 'flex', gap: 7, alignItems: 'baseline', minWidth: 0 }}>
          <Lbl color={C.ink2}>Juega esto</Lbl>
          {j.fuente && (
            <>
              <Txt color={colorF} size="var(--qp-fs-txt)" weight={600} style={{ whiteSpace: 'nowrap' }}>{NOMBRE_FUENTE[j.fuente]}</Txt>
              {j.expo && <Txt color={C.ink2} size="var(--qp-fs-txt)" style={{ whiteSpace: 'nowrap' }}>{j.expo}</Txt>}
            </>
          )}
        </span>
        <Txt color={nivelColor} size="var(--qp-fs-txt)" weight={600} style={{ whiteSpace: 'nowrap' }}>● Entrada segura</Txt>
      </div>

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'stretch', minHeight: 0 }}>
        {j.fuente ? (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {j.partes.map((p) => {
              const on = p.zonas !== null;
              return (
                <div key={p.mkt} data-qp={`orden-${p.mkt}`} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <Lbl color={on ? C.ink2 : C.ink4}>{p.etiqueta[0] + p.etiqueta.slice(1).toLowerCase()}</Lbl>
                    {p.pri && <Lbl color={C.warn} style={{ fontWeight: 600 }}>▲ prioridad</Lbl>}
                  </span>
                  <Big size="var(--qp-fs-hero)" weight={600} color={on ? C.white : C.ink4} glow={on ? 0.55 : 0} glowColor={colorF} style={{ whiteSpace: 'nowrap' }}>
                    {on ? (abrevZonas(p.zonas) || '—') : '—'}
                  </Big>
                </div>
              );
            })}
          </div>
        ) : (
          <span data-qp="orden-espera" style={{ fontFamily: FONT_NUM, fontSize: 'var(--qp-fs-hero)', fontWeight: 600, color: C.ink2, whiteSpace: 'nowrap', lineHeight: 1, textShadow: glowText(C.warn, 0.25) }}>NO APUESTES · ESPERA</span>
        )}
      </div>
    </section>
  );
});

// ── ERRORES SEGUIDOS ─────────────────────────────────────────────────────
export const colorRacha = (live: number) =>
  live >= TOPE_ERRORES ? C.err : live === TOPE_ERRORES - 1 ? C.warn : live >= 1 ? C.white : C.ok;

export const OutcomeTape = memo(function OutcomeTape({ k }: { k: 'real' | 'capa1' | 'escudo' }) {
  const tape = useOutcomeTape(k);
  const pad = TAPE_LEN - tape.length;
  const h = tape.filter((x) => x === 'H').length;
  const m = tape.length - h;
  return (
    <div role="img" aria-label={`últimos ${tape.length} giros puntuados: ${h} aciertos, ${m} errores`} data-qp={`tape-${k}`} data-tape={tape.join('')} style={{ display: 'flex', gap: 2, width: '100%' }}>
      {Array.from({ length: pad }).map((_, i) => (
        <span key={`p${i}`} style={{ flex: 1, height: 6, border: `1px solid ${C.line}`, boxSizing: 'border-box', borderRadius: 1 }} />
      ))}
      {tape.map((o, i) => (
        <span key={i} style={{ flex: 1, height: 6, borderRadius: 1, background: o === 'H' ? C.ok : C.err, opacity: o === 'H' ? 0.55 : 1, boxShadow: o === 'H' ? undefined : neon(C.err, 6, 0.7) }} />
      ))}
    </div>
  );
});

export const RachaTile = memo(function RachaTile() {
  const live = useCopLiveStreak();
  const peor = useCopStreak();
  const col = colorRacha(live);
  return (
    <section aria-label="Errores seguidos D.A.N.N.A." data-qp="racha" style={{ ...seg, gap: 'calc(var(--qp-gap) * 0.6)', borderLeft: `1px solid ${live >= TOPE_ERRORES ? `${C.err}aa` : live === TOPE_ERRORES - 1 ? `${C.warn}88` : C.line2}` }}>
      <Lbl color={C.ink2}>Errores seguidos · D.A.N.N.A.</Lbl>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Big size="var(--qp-fs-mega)" color={col} weight={700} glow={0.7} style={{ minWidth: 34, textAlign: 'center' }}>
          <span data-qp="racha-live">{live}</span>
        </Big>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <StreakGauge live={live} tope={TOPE_ERRORES} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
              <Lbl color={C.ink2}>Peor racha</Lbl>
              <Big size="var(--qp-fs-val)" color={peor >= TOPE_ERRORES ? C.err : C.ink} weight={700}><span data-qp="racha-peor">{peor}</span></Big>
            </span>
            <Lbl color={C.ink3}>Tope {TOPE_ERRORES}</Lbl>
          </div>
        </div>
      </div>
      <OutcomeTape k="real" />
    </section>
  );
});

// ── GOD ──────────────────────────────────────────────────────────────────
export interface GodTileProps {
  active: boolean;
  hudState: string;
  radar: number;
  bestKey?: string;
  g1?: string; g2?: string; p1?: number | null; p2?: number | null; pRaw?: number | null;
  topPick: { bet_key: string; pick_pretty: string; conf_pct: number } | null;
  catLabel: string;
  isOverride: boolean;
  loading: boolean;
  forcedGo: boolean;
  onLock: () => void;
}

const BEST_ABBR: Record<string, string> = { docenas: 'DOC', columnas: 'COL', color: 'CLR', paridad: 'PAR', rango: 'RNG' };

export const GodTile = memo(function GodTile(p: GodTileProps) {
  const abbr = BEST_ABBR[p.bestKey ?? ''] ?? (p.bestKey ?? 'P').toUpperCase();
  const f = (v?: number | null) => (v != null ? (v * 100).toFixed(1) : '—');
  const Stat = ({ k, v, c, tid }: { k: string; v: string; c: string; tid: string }) => (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Lbl>{k}</Lbl>
      <Big size="var(--qp-fs-val)" color={c} weight={700} glow={0.45}><span data-qp={tid}>{v}</span></Big>
    </span>
  );
  return (
    <section aria-label="Motor GOD" data-qp="god" style={{ ...seg, gap: 'calc(var(--qp-gap) * 0.5)', borderLeft: `1px solid ${p.active ? `${C.white}88` : C.line2}` }}>
      <span style={{ fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1px)', color: C.ink3, lineHeight: 1.2 }}>
        GOD · alta precisión (motor alterno — activa solo con OPTIMAL + Radar ≥7)
      </span>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <Stat k="Estado" v={p.topPick ? 'CON PICK' : 'EN ESPERA'} c={p.topPick ? C.ok : C.ink2} tid="god-estado" />
        <Stat k="HUD" v={p.hudState} c={C.danna} tid="god-hud" />
        <Stat k="Radar" v={`${p.radar}/10`} c={p.radar >= 7 ? C.ok : C.ink2} tid="god-radar" />
        {p.forcedGo && (
          <span data-qp="god-forzado" style={{ marginLeft: 'auto', fontFamily: FONT_UI, fontSize: 'calc(var(--qp-fs-txt) - 1px)', fontWeight: 700, color: C.warn, whiteSpace: 'nowrap', alignSelf: 'center' }}>⚠ Override forzado</span>
        )}
      </div>
      <div data-qp="god-bestp" style={{ display: 'flex', gap: 10, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
        <Lbl color={C.ink2}>{abbr}</Lbl>
        <Val color={C.danna}>{p.g1 ?? '—'} {f(p.p1)}</Val>
        <Val color={C.ink2} weight={400}>{p.g2 ?? '—'} {f(p.p2)}</Val>
        <Val color={C.danna} weight={700}>Σ{f(p.pRaw)}%</Val>
      </div>
    </section>
  );
});
