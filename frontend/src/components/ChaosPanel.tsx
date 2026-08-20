// ChaosPanel — Lectura de dispersión de la mesa.
//
// Sustituye a Telemetry.tsx (que mostraba cifras hardcodeadas: LATENCY 8ms,
// CAPACITY 99.97%, TBL MESA_1 — ninguna medía nada real).
//
// Consume data.chaos_index del backend (engine.compute_chaos_index).
// NUNCA calla: siempre hay un estado y dos percentiles.
//
// Qué significan los números:
//   PAÑO  = concentración en docenas/columnas/color/paridad/rango
//   RUEDA = concentración de la bola por sectores físicos
//   El percentil compara contra una mesa perfectamente justa. p90 significa
//   "más concentrada que el 90% de las ventanas normales". No afirma sesgo.

interface ChaosAxis {
  chi2?: number;
  R?: number;
  pct?: number;
  label?: string;
}

interface ChaosDetalleItem {
  counts: number[];
  pct: number[];
}

interface ChaosIndex {
  enabled?: boolean;
  n?: number;
  estado?: string;
  score?: number;
  pano?: ChaosAxis;
  rueda?: ChaosAxis;
  detalle?: {
    docenas?: ChaosDetalleItem;
    columnas?: ChaosDetalleItem;
    color?: ChaosDetalleItem;
    paridad?: ChaosDetalleItem;
    rango?: ChaosDetalleItem;
    cero?: number;
  };
}

interface Props {
  chaosIndex: ChaosIndex | null;
}

const ESTADO_CLS: Record<string, string> = {
  CAOS: 'chaos-caos',
  MIXTO: 'chaos-mixto',
  ORDEN: 'chaos-orden',
  CALIBRANDO: 'chaos-cal',
};

const ESTADO_TXT: Record<string, string> = {
  CAOS: 'Bola dispersa · sin patrón',
  MIXTO: 'Dispersión normal',
  ORDEN: 'Concentración inusual',
  CALIBRANDO: 'Recopilando spins',
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Barra de percentil: izquierda = disperso, derecha = concentrado. */
function PctBar({ pct, label }: { pct: number; label: string }) {
  const p = clamp(pct, 0, 100);
  const cls = p >= 90 ? 'hot' : p >= 75 ? 'warm' : p < 25 ? 'cold' : 'mid';
  return (
    <div className="chaos-bar-wrap">
      <div className="chaos-bar-track">
        {/* marca del 50 = mediana de una mesa justa */}
        <span className="chaos-bar-median" />
        <span className={`chaos-bar-fill ${cls}`} style={{ width: `${p}%` }} />
      </div>
      <div className="chaos-bar-foot">
        <span className="chaos-bar-pct">p{Math.round(p)}</span>
        <span className="chaos-bar-label">{label}</span>
      </div>
    </div>
  );
}

/** Fila de conteos por grupo (docenas, columnas, ...). */
function CountRow({
  name,
  labels,
  counts,
}: {
  name: string;
  labels: string[];
  counts?: number[];
}) {
  const c = Array.isArray(counts) ? counts : [];
  const total = c.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...c, 1);
  return (
    <div className="chaos-row">
      <span className="chaos-row-name">{name}</span>
      <div className="chaos-row-cells">
        {labels.map((lb, i) => {
          const v = c[i] ?? 0;
          const share = (v / total) * 100;
          return (
            <div
              key={lb}
              className={`chaos-cell${v === max && v > 0 ? ' top' : ''}`}
              title={`${lb}: ${v} de ${total} (${share.toFixed(0)}%)`}
            >
              <span className="chaos-cell-k">{lb}</span>
              <span className="chaos-cell-v">{v}</span>
              <span
                className="chaos-cell-bar"
                style={{ height: `${clamp(share, 4, 100)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChaosPanel({ chaosIndex }: Props) {
  const ci = chaosIndex ?? {};
  const estado = String(ci.estado ?? 'CALIBRANDO').toUpperCase();
  const cls = ESTADO_CLS[estado] ?? 'chaos-cal';
  const n = Number(ci.n ?? 0);

  const panoPct = Number(ci.pano?.pct ?? 50);
  const panoLbl = String(ci.pano?.label ?? '—');
  const ruedaPct = Number(ci.rueda?.pct ?? 50);
  const ruedaLbl = String(ci.rueda?.label ?? '—');

  const d = ci.detalle ?? {};
  const cero = Number(d.cero ?? 0);

  return (
    <div className={`panel chaos-panel ${cls}`}>
      <div className="panel-head">
        <span className="icon">◇</span>
        <span className="title">DISPERSIÓN DE MESA</span>
        <span className="chaos-n">últimos {n}</span>
      </div>

      <div className="chaos-verdict">
        <span className="chaos-estado">{estado}</span>
        <span className="chaos-sub">{ESTADO_TXT[estado] ?? '—'}</span>
      </div>

      <div className="chaos-axes">
        <div className="chaos-axis">
          <div className="chaos-axis-head">
            <span className="k">PAÑO</span>
            <span className="v">χ² {Number(ci.pano?.chi2 ?? 0).toFixed(1)}</span>
          </div>
          <PctBar pct={panoPct} label={panoLbl} />
        </div>

        <div className="chaos-axis">
          <div className="chaos-axis-head">
            <span className="k">RUEDA</span>
            <span className="v">R {Number(ci.rueda?.R ?? 0).toFixed(2)}</span>
          </div>
          <PctBar pct={ruedaPct} label={ruedaLbl} />
        </div>
      </div>

      <div className="chaos-detail">
        <CountRow name="Docenas" labels={['D1', 'D2', 'D3']} counts={d.docenas?.counts} />
        <CountRow name="Columnas" labels={['C1', 'C2', 'C3']} counts={d.columnas?.counts} />
        <CountRow name="Color" labels={['Rojo', 'Negro']} counts={d.color?.counts} />
        <CountRow name="Paridad" labels={['Par', 'Impar']} counts={d.paridad?.counts} />
        <CountRow name="Rango" labels={['Bajo', 'Alto']} counts={d.rango?.counts} />
      </div>

      <div className="chaos-foot">
        <span>Cero: {cero}</span>
        <span className="chaos-foot-note">
          Percentil contra mesa justa · no indica sesgo
        </span>
      </div>
    </div>
  );
}
