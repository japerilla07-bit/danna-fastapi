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

// ── CALIBRACIÓN PARA LA VENTANA REAL (oct 2026) ───────────────────────────
// AUDITADO con la sesión del 2026-10-08: el backend (state_routes.py) calcula
// la tabla con window=7, pero los percentiles (_CHAOS_NULL_* en engine.py) están
// tabulados para 14. Con 7 giros el chi2 y sobre todo la R de la rueda salen
// naturalmente más grandes, así que "ORDEN" aparecía el 47% del tiempo con una
// mesa perfectamente justa (49% en la sesión real). Aquí se recalculan los dos
// percentiles con tablas simuladas para 7 giros (400.000 ventanas), a partir
// del chi2 y la R que el backend ya manda. El backend y el motor no se tocan.
const NULL_QS = [1, 5, 10, 25, 50, 75, 90, 95, 99];
const NULL7_CHI2 = [1.0, 2.143, 2.714, 4.143, 6.333, 9.0, 12.143, 14.143, 18.714];
const NULL7_R = [0.0395, 0.0896, 0.1272, 0.2089, 0.3227, 0.4501, 0.57, 0.6411, 0.7703];

function nullPct(value: number, table: number[]): number {
  if (!Number.isFinite(value)) return 50;
  if (value <= table[0]) return NULL_QS[0];
  if (value >= table[table.length - 1]) return 99.5;
  for (let k = 1; k < table.length; k++) {
    if (value <= table[k]) {
      const lo = table[k - 1], hi = table[k];
      return hi <= lo ? NULL_QS[k] : NULL_QS[k - 1] + (NULL_QS[k] - NULL_QS[k - 1]) * (value - lo) / (hi - lo);
    }
  }
  return 99.5;
}

/** Mínimo de giros de UNA zona (de los n de la ventana) para resaltarla: el menor
 *  k tal que, por azar, que ALGUNA de las zonas llegue a k pase ≤15% del tiempo.
 *  n=7 → docena/columna ≥5, color/paridad/rango ≥6. n=14 → ≥8 y ≥10. */
function hotMin(n: number, zones: number): number {
  const p = zones === 3 ? 12 / 37 : 18 / 37;
  const comb = (a: number, b: number) => { let r = 1; for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i; return r; };
  for (let j = 0; j <= n; j++) {
    let tail = 0;
    for (let i = j; i <= n; i++) tail += comb(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i);
    if (zones * tail <= 0.15) return j;
  }
  return n + 1;
}

function axisCls(pct: number) {
  if (pct >= 90) return 'hot';
  if (pct >= 75) return 'warm';
  if (pct < 25) return 'cold';
  return 'mid';
}

/** Fila densa: etiqueta corta + celdas con el conteo visible. */
function Row({ k, labels, counts, n }: { k: string; labels: string[]; counts?: number[]; n: number }) {
  const c = Array.isArray(counts) ? counts : [];
  const max = Math.max(...c, 1);
  return (
    <div className="cx-row">
      <span className="cx-row-k">{k}</span>
      <div className="cx-row-v">
        {labels.map((lb, i) => {
          const v = c[i] ?? 0;
          // AUDITADO (oct 2026): resaltar siempre la celda mayor no decía nada —
          // siempre hay una zona mayor. Ahora solo se resalta si es calor de
          // verdad para el tamaño real de la ventana n: que por azar ALGUNA zona
          // llegue ahí pasa ≤15% del tiempo (n=7: ≥5 docena/columna, ≥6 el resto).
          const isTop = v === max && v >= hotMin(n, labels.length);
          
          // Asignación de colores especiales a las etiquetas
          let colorCls = '';
          if (lb === 'R') colorCls = 'cx-red';
          else if (lb === 'N') colorCls = 'cx-black';
          else if (lb === 'P') colorCls = 'cx-par';
          else if (lb === 'I') colorCls = 'cx-impar';
          else if (lb === 'B') colorCls = 'cx-bajo';
          else if (lb === 'A') colorCls = 'cx-alto';

          return (
            <div
              key={lb}
              className={`cx-cell${isTop ? ' top' : ''} ${colorCls}`}
              title={`${lb}: ${v}`}
            >
              {/* Ahora las etiquetas (D1, C1, R, N...) son explícitamente visibles */}
              <span className="cx-lb">{lb}</span>
              <span className="cx-v">{v}</span>
            </div>
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
  const n = Number(ci.n ?? 0);
  let estado = String(ci.estado ?? 'CALIBRANDO').toUpperCase();
  let panoPct = Number(ci.pano?.pct ?? 50);
  let ruedaPct = Number(ci.rueda?.pct ?? 50);
  // Ventana de 7: se recalculan los percentiles con tablas de 7 (ver arriba).
  if (n === 7 && ci.enabled !== false && ci.pano?.chi2 !== undefined && ci.rueda?.R !== undefined) {
    panoPct = nullPct(Number(ci.pano.chi2), NULL7_CHI2);
    ruedaPct = nullPct(Number(ci.rueda.R), NULL7_R);
    const m = Math.max(panoPct, ruedaPct);
    estado = m < 40 ? 'CAOS' : m >= 95 ? 'ORDEN' : 'MIXTO';
  } else if (estado === 'ORDEN' && Number(ci.score ?? 0) < 95) {
    // Otras ventanas: el backend declara ORDEN con score ≥85 y, como el score es
    // el MAYOR de dos percentiles, sale ~1 de cada 4 giros con mesa justa. ≥95 → ~10%.
    estado = 'MIXTO';
  }
  const cls = ESTADO_CLS[estado] ?? 'cal';

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
        <Row k="DOC" labels={['D1', 'D2', 'D3']} counts={d.docenas?.counts} n={n} />
        <Row k="COL" labels={['C1', 'C2', 'C3']} counts={d.columnas?.counts} n={n} />
        <Row k="CLR" labels={['R', 'N']} counts={d.color?.counts} n={n} />
        <Row k="PAR" labels={['P', 'I']} counts={d.paridad?.counts} n={n} />
        <Row k="RNG" labels={['B', 'A']} counts={d.rango?.counts} n={n} />
      </div>

      <div className="cx-badge">
        CERO {Number(d.cero ?? 0)} · percentil vs mesa justa
      </div>
    </div>
  );
}
