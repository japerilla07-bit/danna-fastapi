// ChaosPanel — Dispersión de mesa. Card vertical compacta.
//
// Diseñada para la columna derecha (~200-260px), misma familia visual que
// TableEntropy y RadarCard: título mono en mayúsculas, estado grande, barras
// finas, filas clave/valor densas y badge al pie.
//
// Consume data.chaos_index (engine.compute_chaos_index). Nunca calla.

interface ChaosAxis {
  chi2?: number;
  R?: number;
  pct?: number;
  label?: string;
}

interface ChaosDetalleItem {
  counts: number[];
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
  CAOS: 'good',
  MIXTO: 'mid',
  ORDEN: 'bad',
  CALIBRANDO: 'cal',
};

const ESTADO_SUB: Record<string, string> = {
  CAOS: 'Bola dispersa',
  MIXTO: 'Dispersión normal',
  ORDEN: 'Concentración inusual',
  CALIBRANDO: 'Recopilando',
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function axisCls(pct: number) {
  if (pct >= 90) return 'hot';
  if (pct >= 75) return 'warm';
  if (pct < 25) return 'cold';
  return 'mid';
}

/** Fila densa: etiqueta corta + celdas con el conteo. */
function Row({ k, labels, counts }: { k: string; labels: string[]; counts?: number[] }) {
  const c = Array.isArray(counts) ? counts : [];
  const max = Math.max(...c, 1);
  return (
    <div className="cx-row">
      <span className="cx-row-k">{k}</span>
      <div className="cx-row-v">
        {labels.map((lb, i) => {
          const v = c[i] ?? 0;
          return (
            <span
              key={lb}
              className={`cx-cell${v === max && v > 0 ? ' top' : ''}`}
              title={`${lb}: ${v}`}
            >
              {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Axis({ k, pct }: { k: string; pct: number }) {
  const cls = axisCls(pct);
  return (
    <div className="cx-axis">
      <div className="cx-axis-top">
        <span className="cx-axis-k">{k}</span>
        <span className={`cx-axis-p ${cls}`}>p{Math.round(pct)}</span>
      </div>
      <div className="cx-bar">
        <span className="cx-bar-mid" />
        <span className={`cx-bar-fill ${cls}`} style={{ width: `${clamp(pct, 0, 100)}%` }} />
      </div>
    </div>
  );
}

export function ChaosPanel({ chaosIndex }: Props) {
  const ci = chaosIndex ?? {};
  const estado = String(ci.estado ?? 'CALIBRANDO').toUpperCase();
  const cls = ESTADO_CLS[estado] ?? 'cal';
  const n = Number(ci.n ?? 0);

  const panoPct = Number(ci.pano?.pct ?? 50);
  const ruedaPct = Number(ci.rueda?.pct ?? 50);
  const d = ci.detalle ?? {};

  return (
    <div className={`panel cx-card cx-${cls}`}>
      <div className="cx-head">
        <span className="cx-title">DISPERSIÓN</span>
        <span className="cx-n">{n}</span>
      </div>

      <div className="cx-estado">{estado}</div>
      <div className="cx-sub">{ESTADO_SUB[estado] ?? '—'}</div>

      {/* Ejes apilados — la columna es estrecha, un grid de 2 los rompe */}
      <Axis k="PAÑO" pct={panoPct} />
      <Axis k="RUEDA" pct={ruedaPct} />

      <div className="cx-sep" />

      <div className="cx-rows">
        <Row k="DOC" labels={['D1', 'D2', 'D3']} counts={d.docenas?.counts} />
        <Row k="COL" labels={['C1', 'C2', 'C3']} counts={d.columnas?.counts} />
        <Row k="CLR" labels={['R', 'N']} counts={d.color?.counts} />
        <Row k="PAR" labels={['P', 'I']} counts={d.paridad?.counts} />
        <Row k="RNG" labels={['B', 'A']} counts={d.rango?.counts} />
      </div>

      <div className="cx-badge">
        CERO {Number(d.cero ?? 0)} · percentil vs mesa justa
      </div>
    </div>
  );
}
