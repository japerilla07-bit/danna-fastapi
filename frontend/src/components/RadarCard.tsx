// RadarCard — Indicador circular del Radar.
// Port de app.py L7573-7578:
//   score = decision.mesa_score.score10  (0-10, calculado por el motor)
//   TOP   = decision.primary_bet.label + pick + score_pct

import type { EnginePayload } from '@/types/api';

interface Props {
  payload: EnginePayload | null;
}

export function RadarCard({ payload }: Props) {
  const d   = (payload as any)?.decision ?? {};
  const ms  = d.mesa_score ?? {};
  const pb  = d.primary_bet ?? {};

  // score10 directo del motor — es el radar real
  const score10 = Math.min(10, Math.max(0, Math.round(Number(ms.score10 ?? 0))));

  const cls = score10 >= 7 ? 'good' : score10 >= 4 ? 'mid' : 'bad';

  // TOP info: label + pick + score_pct
  const label    = String(pb.label   ?? pb.bet_key ?? '—');
  const pick     = String(pb.pick    ?? pb.choice  ?? '—');
  const scorePct = Number(pb.score_pct ?? pb.score ?? 0);

  return (
    <div className={`panel radar-card radar-${cls}`}>
      <div className="radar-circle">
        <div className="radar-core" />
        <div className="radar-num">{score10}/10</div>
      </div>
      <div className="radar-label">RADAR</div>
      <div className="radar-info">
        <div className="head">⊙ TOP:</div>
        <div>{label}:</div>
        <div className="pick">{pick}</div>
        {scorePct > 0 && (
          <div className="num">({Math.round(scorePct)}%)</div>
        )}
      </div>
    </div>
  );
}
