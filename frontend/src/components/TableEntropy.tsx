// TableEntropy — Card vertical "TABLE ENTROPY".
// Usa data.table_health del backend (port de engine.analyze_table_health).
//
// Estructura de table_health:
//   { status, score (0-100), hit_rate (0-100), trend (lista de valores),
//     color ("green"|"orange"|"red"|"gray"), msg }

interface TableHealth {
  status: string;
  score: number;
  hit_rate: number;
  trend: number[];
  color: string;
  msg: string;
}

interface Props {
  tableHealth: TableHealth | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function TableEntropy({ tableHealth }: Props) {
  const h = tableHealth;

  const score   = clamp(h?.score   ?? 0, 0, 100);
  const hitRate = clamp(h?.hit_rate ?? 0, 0, 100);
  const msg     = h?.msg    ?? 'Recopilando datos...';
  const status  = h?.status ?? 'CALIBRANDO';
  const color   = h?.color  ?? 'gray';
  const trend   = Array.isArray(h?.trend) ? h!.trend : [];

  // Clase CSS basada en color del backend
  const cls =
    color === 'green'  ? 'good' :
    color === 'orange' ? 'mid'  :
    color === 'red'    ? 'bad'  : 'mid';

  // Sparkline SVG desde trend real
  const sparkPoints = trend.length >= 2
    ? trend.map((v, i) => {
        const x = (i / (trend.length - 1)) * 100;
        const y = 28 - (clamp(v, 0, 100) / 100) * 26;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
    : '0,14 100,14';  // línea plana si no hay datos

  return (
    <div className={`panel entropy-card entropy-${cls}`}>
      <div className="entropy-title">TABLE ENTROPY</div>
      <div className="entropy-icon">◎</div>
      <div className="entropy-num">{score}</div>
      <div className="entropy-of">/100</div>

      <div className="entropy-row">
        <span className="k">OPER. EFF</span>
        <span className="v">{hitRate}%</span>
      </div>
      <div className="entropy-row entropy-row-tight">
        <span className="k">PROM</span>
        <span className={`v ${hitRate < 50 ? 'warn' : ''}`}>{hitRate}%</span>
      </div>

      <div className="entropy-sub">{msg}</div>

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

      <div className="entropy-badge">▸ {status}</div>
    </div>
  );
}
