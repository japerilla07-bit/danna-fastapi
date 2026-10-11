// Fila de MANDO (nivel 1 — vistazo): ORDEN · RACHA · GOD.
// Lo que el operador lee sin buscar: qué juega, cuántos errores seguidos lleva
// contra el tope, y el estado del motor GOD con su TARGET LOCK.

import React, { memo } from 'react';
import { useLiveDecision, useTelemetryStore, useCopLiveStreak, useCopStreak } from '@/store/telemetryStore';
import { computeJuega, abrevZonas } from '@/domain/juegaEsto';
import { useOutcomeTape, TAPE_LEN } from '@/domain/outcomeTape';
import { C, FONT_MONO, TOPE_ERRORES } from './theme';
import { Block, Lbl, Val, head, StreakGauge } from './ui';

const COLOR_FUENTE = { ESCUDO: C.escudo, 'CAPA 1': C.capa1 } as const;

// ── ORDEN ────────────────────────────────────────────────────────────────
export const OrdenTile = memo(function OrdenTile() {
  const d = useLiveDecision();
  const pend = useTelemetryStore((s) => s.pending);
  const j = computeJuega(d, pend);
  const colorF = j.fuente ? COLOR_FUENTE[j.fuente] : C.ink3;
  const nivelColor = d.nivel === 'ok' ? C.ok : d.nivel === 'precaucion' ? C.white : C.err;

  return (
    <Block
      label="Orden de juego"
      testId="orden"
      style={{ display: 'flex', flexDirection: 'column', gap: 4, borderColor: j.fuente ? `${colorF}99` : C.line, background: j.fuente ? `${colorF}0f` : C.bg1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Lbl color={C.ink2} spacing="0.05em">
          JUEGA ESTO{j.fuente ? <span style={{ color: colorF }}> · {j.fuente}{j.expo ? ` · ${j.expo}` : ''}</span> : null}
        </Lbl>
        <Lbl color={nivelColor} spacing="0.05em">● ENTRADA SEGURA</Lbl>
      </div>

      <div aria-live="polite" style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch' }}>
        {j.fuente ? (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {j.partes.map((p) => {
              const on = p.zonas !== null;
              return (
                <div
                  key={p.mkt}
                  data-qp={`orden-${p.mkt}`}
                  title={p.zonas ?? undefined}
                  style={{
                    minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    borderLeft: `3px solid ${on ? colorF : C.line}`, paddingLeft: 8,
                  }}
                >
                  <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <Lbl color={on ? C.ink2 : C.ink4}>{p.etiqueta}</Lbl>
                    {p.pri && <Lbl color={C.warn}>▲ PRIORIDAD</Lbl>}
                  </span>
                  <span style={{ ...head('var(--qp-fs-order)', on ? C.ink : C.ink4, 800), whiteSpace: 'nowrap' }}>
                    {on ? (abrevZonas(p.zonas) || '—') : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', borderLeft: `3px solid ${C.line2}`, paddingLeft: 8 }}>
            <span data-qp="orden-espera" style={{ ...head('var(--qp-fs-order)', C.ink2, 800), whiteSpace: 'nowrap' }}>NO APUESTES · ESPERA</span>
          </div>
        )}
      </div>
    </Block>
  );
});

// ── RACHA ────────────────────────────────────────────────────────────────
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
        <span key={i} style={{ flex: 1, height: 6, borderRadius: 1, background: o === 'H' ? C.ok : C.err, opacity: o === 'H' ? 0.55 : 1 }} />
      ))}
    </div>
  );
});

export const RachaTile = memo(function RachaTile() {
  const live = useCopLiveStreak();
  const peor = useCopStreak();
  const col = colorRacha(live);
  return (
    <Block label="Errores seguidos D.A.N.N.A." testId="racha" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 3, borderColor: live >= TOPE_ERRORES ? `${C.err}aa` : live === TOPE_ERRORES - 1 ? `${C.warn}88` : C.line }}>
      <Lbl color={C.ink2}>ERRORES SEGUIDOS · D.A.N.N.A.</Lbl>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Val size="var(--qp-fs-mega)" color={col} weight={800} style={{ minWidth: 36, textAlign: 'center' }}>
          <span data-qp="racha-live">{live}</span>
        </Val>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <StreakGauge live={live} tope={TOPE_ERRORES} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Lbl color={C.ink2}>PEOR RACHA <Val size="var(--qp-fs-val)" color={peor >= TOPE_ERRORES ? C.err : C.ink} style={{ marginLeft: 3 }}><span data-qp="racha-peor">{peor}</span></Val></Lbl>
            <Lbl color={C.ink3}>TOPE {TOPE_ERRORES}</Lbl>
          </div>
        </div>
      </div>
      <OutcomeTape k="real" />
    </Block>
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
  const confColor = !p.topPick ? C.ink3 : p.topPick.conf_pct >= 80 ? C.danna : p.topPick.conf_pct >= 60 ? C.danna : p.topPick.conf_pct >= 40 ? C.white : C.ink3;
  const f = (v?: number | null) => (v != null ? (v * 100).toFixed(1) : '—');
  return (
    <Block label="Motor GOD" testId="god" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 2, borderColor: p.active ? `${C.white}99` : C.line }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.ink3, letterSpacing: 0, whiteSpace: 'nowrap', fontWeight: 600 }}>
        GOD · ALTA PRECISIÓN (motor alterno — activa solo con OPTIMAL + Radar ≥7)
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
          <Lbl>ESTADO</Lbl>
          <Val color={p.topPick ? C.ok : C.ink2} size="var(--qp-fs-val)"><span data-qp="god-estado">{p.topPick ? 'CON PICK' : 'EN ESPERA'}</span></Val>
        </span>
        <span style={{ display: 'flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
          <Lbl>HUD</Lbl>
          <Val color={C.danna} size="var(--qp-fs-val)"><span data-qp="god-hud">{p.hudState}</span></Val>
        </span>
        <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
          <Lbl>RADAR</Lbl>
          <Val color={p.radar >= 7 ? C.ok : C.ink2} size="var(--qp-fs-val)"><span data-qp="god-radar">{p.radar}/10</span></Val>
        </span>
        {p.forcedGo && (
          <span data-qp="god-forzado" title="Override forzó GO sobre threshold del Pilot (CCS ≥ 60% en mesa CAUTION)" style={{ marginLeft: 'auto', fontFamily: FONT_MONO, fontSize: 9, fontWeight: 800, color: C.white, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>⚠ OVERRIDE FORZADO</span>
        )}
      </div>
      <div title={`Grupos individuales de ${p.bestKey ?? '—'} y su suma`} data-qp="god-bestp" style={{ display: 'flex', gap: 8, alignItems: 'baseline', whiteSpace: 'nowrap', fontFamily: FONT_MONO, fontSize: 'var(--qp-fs-tbl)' }}>
        <Lbl>{abbr}</Lbl>
        <span style={{ color: C.danna }}>{p.g1 ?? '—'} {f(p.p1)}</span>
        <span style={{ color: C.ink2 }}>{p.g2 ?? '—'} {f(p.p2)}</span>
        <span style={{ color: C.danna, fontWeight: 700 }}>Σ{f(p.pRaw)}%</span>
      </div>

      {p.topPick ? (
        <button
          type="button"
          onClick={() => { if (!p.loading) p.onLock(); }}
          aria-disabled={p.loading || undefined}
          data-qp="target-lock"
          aria-pressed={p.isOverride}
          aria-label={`${p.isOverride ? 'Tu apuesta' : 'Target lock'}: ${p.catLabel} ${p.topPick.pick_pretty}, confianza ${p.topPick.conf_pct}%. Pulsa para ${p.isOverride ? 'quitar' : 'fijar'} la apuesta.`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
            minHeight: 28, height: 28, padding: '0 8px', borderRadius: 3, cursor: p.loading ? 'wait' : 'pointer',
            border: `1px solid ${p.isOverride ? `${C.white}88` : `${C.danna}66`}`,
            background: p.isOverride ? `${C.white}12` : `${C.danna}12`, color: C.ink,
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
            <Lbl color={p.isOverride ? C.white : C.danna}>{p.isOverride ? '◉ TU APUESTA' : 'TARGET LOCK'}</Lbl>
            <Lbl color={C.ink3}>{p.catLabel}</Lbl>
          </span>
          <span data-qp="target-pick" style={{ ...head(20, C.white, 800), flex: 1, minWidth: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>{p.topPick.pick_pretty}</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
            <Val size={18} color={confColor} weight={800}><span data-qp="target-conf">{p.topPick.conf_pct}%</span></Val>
          </span>
        </button>
      ) : (
        <div style={{ minHeight: 28, height: 28, display: 'flex', alignItems: 'center', padding: '0 8px', border: `1px dashed ${C.line2}`, borderRadius: 3 }}>
          <Lbl color={C.ink3}>GOD SIN TARGET — ESPERANDO</Lbl>
        </div>
      )}
    </Block>
  );
});
