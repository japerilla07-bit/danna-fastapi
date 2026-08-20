// TableEntropy — Card vertical "TABLE ENTROPY".
//
// REFORMULADA. Antes esta card consumía data.table_health, que es un paseo
// +5 por acierto / −4 por fallo sobre los últimos 15 resultados. Eso es un
// termómetro de racha reciente, no entropía: con 73% de aciertos marcaba 89
// y etiquetaba "Patrones Claros", cuando 11 aciertos de 15 ocurre el 35% de
// las veces en una mesa perfectamente normal (baseline TOP-2 = 64.9%).
//
// Ahora consume data.chaos_index (engine.compute_chaos_index), que sí mide
// dispersión de la bola sobre la ventana operativa:
//   PAÑO  = χ² de docenas + columnas + color + paridad + rango
//   RUEDA = concentración circular por sectores físicos
// Cada eje se expresa como percentil contra una mesa justa (300k sims).
//
// El dato de racha reciente NO se pierde: baja al pie de la card con su
// nombre real, EFICACIA 15.

interface ChaosAxis {
  chi2?: number;
  R?: number;
  pct?: number;
  label?: string;
}

interface ChaosIndex {
  enabled?: boolean;
  n?: number;
  estado?: string;
  score?: number;
  pano?: ChaosAxis;
  rueda?: ChaosAxis;
}

interface TableHealth {
  score: number;
  hit_rate: number;
  trend: number[];
}

interface Props {
  chaosIndex: ChaosIndex | null;
  /** Opcional. Racha reciente — se muestra al pie con su nombre real. */
  tableHealth?: TableHealth | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** ENTROPÍA = lo contrario de concentración. 100 = bola totalmente dispersa. */
function entropyFromPct(pct: number): number {
  return Math.round(clamp(100 - pct, 0, 100));
}

const ESTADO_MSG: Record<string, string> = {
  CAOS: 'Bola dispersa · sin estructura',
  MIXTO: 'Dispersión dentro de lo normal',
  ORDEN: 'Concentración inusual',
  CALIBRANDO: 'Recopilando spins',
};

export function TableEntropy({ chaosIndex, tableHealth = null }: Props) {
  const ci = chaosIndex ?? {};
  const estado = String(ci.estado ?? 'CALIBRANDO').toUpperCase();
  const n = Number(ci.n ?? 0);

  const panoPct = Number(ci.pano?.pct ?? 50);
  const ruedaPct = Number(ci.rueda?.pct ?? 50);

  // Entropía global = la del eje MENOS disperso (el que más estructura muestra).
  const entropia = entropyFromPct(Math.max(panoPct, ruedaPct));

  // Verde = disperso (caos). Ámbar = concentrado (orden). Gris = calibrando.
  const cls =
    estado === 'CALIBRANDO' ? 'mid'
    : estado === 'CAOS' ? 'good'
    : estado === 'ORDEN' ? 'bad'
    : 'mid';

  const trend = Array.isArray(tableHealth?.trend) ? tableHealth!.trend : [];
  const sparkPoints =
    trend.length >= 2
      ? trend
          .map((v, i) => {
            const x = (i / (trend.length - 1)) * 100;
            const y = 28 - (clamp(v, 0, 100) / 100) * 26;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '0,14 100,14';

  return (
    <div className={`panel entropy-card entropy-${cls}`}>
      <div className="entropy-title">TABLE ENTROPY</div>
      <div className="entropy-icon">◎</div>
      <div className="entropy-num">{entropia}</div>
      <div className="entropy-of">/100</div>

      <div className="entropy-row">
        <span className="k">PAÑO</span>
        <span className="v">{entropyFromPct(panoPct)}</span>
      </div>
      <div className="entropy-row entropy-row-tight">
        <span className="k">RUEDA</span>
        <span className="v">{entropyFromPct(ruedaPct)}</span>
      </div>

      <div className="entropy-sub">{ESTADO_MSG[estado] ?? '—'}</div>

      {tableHealth && (
        <>
          <div className="entropy-row entropy-row-sep">
            <span className="k">EFICACIA 15</span>
            <span className={`v ${Number(tableHealth.hit_rate) < 65 ? 'warn' : ''}`}>
              {Math.round(Number(tableHealth.hit_rate ?? 0))}%
            </span>
          </div>
          <div className="entropy-spark">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none">
              <polyline
                points={sparkPoints}
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </>
      )}

      <div className="entropy-badge">▸ {estado} · {n} SPINS</div>
    </div>
  );
}
