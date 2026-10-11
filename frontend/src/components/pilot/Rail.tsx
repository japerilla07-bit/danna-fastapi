// RIEL DE ACCIONES (abajo): lo que TÚ puedes hacer. TARGET LOCK (fija o quita tu
// apuesta, mismo override de siempre) y el marcador de TARGET LOCK de GOD.
// Se separa a propósito de lo que recomienda el motor (franja de veredicto).

import React, { memo } from 'react';
import { C, FONT_UI, rgba, neon } from './theme';
import { Lbl, Big } from './ui';
import type { GodTileProps } from './CommandRow';

export interface GodTargetProps { hits: number; misses: number; consec: number; max: number; errHit: number }

const Stat = ({ k, v, c, tid }: { k: string; v: React.ReactNode; c: string; tid: string }) => (
  <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
    <Lbl color={C.ink2}>{k}</Lbl>
    <Big size="var(--qp-fs-val)" color={c} weight={700}><span data-qp={tid}>{v}</span></Big>
  </span>
);

export const Rail = memo(function Rail({ god, godTarget }: { god: GodTileProps; godTarget: GodTargetProps }) {
  const p = god;
  const confColor = !p.topPick ? C.ink3 : p.topPick.conf_pct >= 60 ? C.danna : p.topPick.conf_pct >= 40 ? C.white : C.ink3;
  return (
    <div data-qp="riel" style={{ display: 'flex', alignItems: 'center', gap: 18, height: '100%', boxSizing: 'border-box', padding: '0 10px', minWidth: 0 }}>
      {p.topPick ? (
        <button
          type="button"
          onClick={() => { if (!p.loading) p.onLock(); }}
          aria-disabled={p.loading || undefined}
          data-qp="target-lock"
          aria-pressed={p.isOverride}
          aria-label={`${p.isOverride ? 'Tu apuesta' : 'Target lock'}: ${p.catLabel} ${p.topPick.pick_pretty}, confianza ${p.topPick.conf_pct}%. Pulsa para ${p.isOverride ? 'quitar' : 'fijar'} la apuesta.`}
          style={{
            flex: '0 0 456px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', boxSizing: 'border-box',
            height: 'calc(100% - 8px)', padding: '0 12px', borderRadius: 3, cursor: p.loading ? 'wait' : 'pointer',
            border: `1px solid ${p.isOverride ? rgba(C.white, 0.7) : rgba(C.danna, 0.7)}`,
            background: `linear-gradient(180deg, ${rgba(p.isOverride ? C.white : C.danna, 0.22)}, ${rgba(p.isOverride ? C.white : C.danna, 0.07)})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), ${neon(p.isOverride ? C.white : C.danna, 14, 0.38)}`, color: C.ink,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
            <Lbl color={p.isOverride ? C.white : C.danna} style={{ fontWeight: 700 }}>{p.isOverride ? '◉ Tu apuesta' : 'Target lock'}</Lbl>
            <Lbl color={C.ink2}>{p.catLabel}</Lbl>
          </span>
          <Big size="var(--qp-fs-pick)" color={C.white} weight={700} glow={0.5} glowColor={C.danna} style={{ flex: 1, minWidth: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span data-qp="target-pick">{p.topPick.pick_pretty}</span>
          </Big>
          <Big size="var(--qp-fs-pick)" color={confColor} weight={700} glow={0.6}><span data-qp="target-conf">{p.topPick.conf_pct}%</span></Big>
        </button>
      ) : (
        <div style={{ flex: '0 0 456px', height: 'calc(100% - 8px)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: '0 12px', border: `1px dashed ${C.line2}`, borderRadius: 3 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 'var(--qp-fs-txt)', color: C.ink3 }}>GOD sin target — esperando</span>
        </div>
      )}

      <div data-qp="god-target" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <Lbl color={C.ink3} style={{ fontWeight: 600 }}>GOD target</Lbl>
        <Stat k="Aciertos" v={godTarget.hits} c={C.ok} tid="god-target-aciertos" />
        <Stat k="Errores" v={godTarget.misses} c={C.err} tid="god-target-errores" />
        <Stat k="Consec" v={godTarget.consec} c={godTarget.consec > 0 ? C.err : C.ink2} tid="god-target-consec" />
        <Stat k="Máx" v={godTarget.max} c={C.ink} tid="god-target-max" />
        <Stat k="Err/hit" v={godTarget.errHit.toFixed(1)} c={C.err} tid="god-target-errhit" />
      </div>
    </div>
  );
});
