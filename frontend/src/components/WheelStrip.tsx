// WheelStrip — Strip horizontal del Wheel Expert (debajo del paño).
// Port de app.py L9388-9460.
//
// Recibe wheelInfo directamente desde data.wheel_info del snapshot
// (NO desde payload — wheel_info está en el root del /api/state response).

interface Props {
  wheelInfo: Record<string, any> | null;
}

const SECTOR_COLORS: Record<string, string> = {
  VOISINS: 'voisins',
  TIERS: 'tiers',
  ORPHELINS: 'orphelins',
  ZERO: 'zero',
};

export function WheelStrip({ wheelInfo }: Props) {
  const wi = wheelInfo ?? {};

  if (!wi || Object.keys(wi).length === 0) return null;

  const active = String(wi.active_sector ?? 'VOISINS').toUpperCase();
  const scores = (wi.sector_scores ?? {}) as Record<string, number>;
  const dealer = (wi.dealer_sig ?? {}) as any;
  const scatter = (wi.scatter ?? {}) as any;
  const adaptW = Number(wi.adaptive_w ?? 0);

  const stripCls = SECTOR_COLORS[active] || 'voisins';
  const wCls = adaptW > 0.28 ? 'w-good' : adaptW > 0.18 ? 'w-mid' : 'w-low';

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const sectors = sorted.length > 0
    ? sorted
    : [['VOISINS', 0], ['ZERO', 0], ['ORPHELINS', 0], ['TIERS', 0]] as [string, number][];

  const dealerDetected = !!dealer.detected;
  const dealerNum = dealer.center_num ?? '—';
  const dealerStrength = Number(dealer.strength ?? 0);
  const scConf = Number(scatter.confidence ?? 0);
  const scPeak = Number(scatter.peak_scatter ?? 0);
  const showScatter = scConf > 0.18;

  return (
    <div className={`wheel-strip ${stripCls}`}>
      <div className="wheel-active">
        <span className="lbl">◈ WHEEL</span>
        <span className="name">{active}</span>
        <span className={`w ${wCls}`}>W:{adaptW.toFixed(2)}</span>
      </div>

      <div className="wheel-sectors">
        {sectors.map(([name, val]) => {
          const isTop = String(name).toUpperCase() === active;
          return (
            <div key={name} className={`wheel-sec${isTop ? ' active' : ''}`}>
              <span className="k">{String(name).toUpperCase()}</span>
              <span className="v">{Math.round(Number(val) * 100)}%</span>
            </div>
          );
        })}
      </div>

      {(dealerDetected || showScatter) && (
        <div className="wheel-extras">
          {dealerDetected && (
            <div className="wheel-dealer">
              <span className="lbl">⚡ DEALER</span>
              <span className="val">#{dealerNum}</span>
              <span className="conf">{dealerStrength.toFixed(2)}</span>
            </div>
          )}
          {showScatter && (
            <div className="wheel-scatter">
              <span className="lbl">◈ SCATTER</span>
              <span className="val">+{scPeak}p</span>
              <span className="conf">{scConf.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
