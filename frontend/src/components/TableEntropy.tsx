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
//
// AÑADIDO — bloque ESTADO MESA (monitor rodante, DESCRIPTIVO, no predictivo).
// Semáforo por errores en los últimos 30 giros + racha de errores en curso,
// POR MERCADO (columnas y docenas se muestran por separado, no se mezclan).
// Auditado sobre 9 sesiones: dentro de una sesión el error NO se autocorrela-
// ciona ventana-a-ventana (r=-0.07) y la entropía NO predice el error. Este
// semáforo DESCRIBE los últimos 30 giros; NO anticipa el próximo, y NO pausa
// nada. Umbrales contra la distribución real de errores/30 (media 10.2, sd
// 2.7 · p11≈7, p90≈13): VERDE ≤7 · ÁMBAR 8-13 · HOSTIL ≥14.

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

/** Resultado reciente de un mercado, el más nuevo AL FINAL del array. */
export interface MesaResult {
  isError: boolean;   // true = ese mercado falló el giro
  bet?: boolean;      // ¿se apostó? Una PAUSA (false) no resetea la racha. Default: true.
}

/** Un mercado a mostrar en ESTADO MESA (p.ej. COL, DOC). */
export interface MesaMarket {
  label: string;
  results: MesaResult[];
}

interface Props {
  chaosIndex: ChaosIndex | null;
  /** Opcional. Racha reciente — se muestra al pie con su nombre real. */
  tableHealth?: TableHealth | null;
  /**
   * Opcional. Uno o más mercados para el semáforo ESTADO MESA. Cada mercado
   * se muestra por separado (no se mezclan). Un mercado sin giros no aparece;
   * si no se pasa ninguno, el bloque no se renderiza (sin regresión).
   */
  mesaMarkets?: MesaMarket[];
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

// ── ESTADO MESA — semáforo rodante por errores/30 (descriptivo) ──────────
type Mesa = 'VERDE' | 'AMBAR' | 'HOSTIL';
const MESA_FULL = 30;
const MESA_VERDE_MAX = 7;   // inclusive
const MESA_HOSTIL_MIN = 14; // inclusive

/** Reescala los cortes si hay menos de 30 giros, para que "8 de 20" no mienta. */
function classifyMesa(errors: number, window: number): Mesa {
  const k = window > 0 ? window / MESA_FULL : 1;
  if (errors <= MESA_VERDE_MAX * k) return 'VERDE';
  if (errors >= MESA_HOSTIL_MIN * k) return 'HOSTIL';
  return 'AMBAR';
}

const MESA_COLOR: Record<Mesa, string> = {
  VERDE: '#4ade80',
  AMBAR: '#fbbf24',
  HOSTIL: '#f87171',
};

interface MesaCalc {
  label: string;
  mesa: Mesa;
  errors: number;
  window: number;
  streak: number;
}

function computeMesa(m: MesaMarket): MesaCalc {
  const w30 = m.results.slice(-30);
  const errors = w30.reduce((acc, r) => acc + (r.isError ? 1 : 0), 0);
  // Racha en curso: recorre TODO el historial, la pausa (bet=false) ni cuenta
  // ni resetea, solo un ACIERTO jugado reinicia a 0.
  let streak = 0;
  for (const r of m.results) {
    if (r.bet === false) continue;
    if (r.isError) streak++;
    else streak = 0;
  }
  return {
    label: m.label,
    mesa: classifyMesa(errors, w30.length),
    errors,
    window: w30.length,
    streak,
  };
}

export function TableEntropy({ chaosIndex, tableHealth = null, mesaMarkets }: Props) {
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

  // ── ESTADO MESA (rodante, por mercado) — solo mercados con giros ──────────
  const mercados = (Array.isArray(mesaMarkets) ? mesaMarkets : [])
    .filter((m) => Array.isArray(m.results) && m.results.length > 0)
    .map(computeMesa);

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

      {mercados.length > 0 && (
        <>
          {mercados.map((mc, i) => (
            <div
              key={mc.label}
              className={`entropy-row ${i === 0 ? 'entropy-row-sep' : 'entropy-row-tight'}`}
            >
              <span className="k">
                MESA {mc.label}
                {mc.window < 30 ? ` (${mc.window})` : ''}
              </span>
              <span className="v" style={{ color: MESA_COLOR[mc.mesa] }}>
                ● {mc.mesa} · {mc.errors}/{mc.window} · R{mc.streak}
              </span>
            </div>
          ))}
          <div className="entropy-sub">errores/30 + racha · lectura, no pronóstico</div>
        </>
      )}

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
