// CategoryTable — Tabla de categorías con E1-E7 del error_hist real.
//
// Columnas (port de imagen de referencia app.py):
//   badge | nombre | pick | W: L: Seq: Max: | AVG | E1 E2 E3 E4 E5 E6 E7
//
// error_hist[key] = { E1, E2, E3, E4, E5, E6, E7, hits_counted, avg_errors }
// E1-E7 = cuántas veces se acertó después de N errores consecutivos
//   E7 = 7+ errores antes de acertar

import type { EnginePayload } from '@/types/api';

// ── Tipos ─────────────────────────────────────────────────────────

interface Counter {
  wins: number;
  losses: number;
  streak: number;
  max_streak: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface ErrorHist {
  E1: number; E2: number; E3: number; E4: number;
  E5: number; E6: number; E7: number;
  hits_counted?: number;
  avg_errors?: number;
}

interface BetAdviceEntry {
  status?: string;
  final_action?: string;
  action?: string;
  pick?: string;
  selection?: string;
  value?: string;
  label?: string;
}

export type BadgeState = 'bet' | 'prb' | 'wt';
export type { BetAdviceEntry };

// ── Helpers ───────────────────────────────────────────────────────
// Exportados: Quantumpilot.tsx los reusa para el bloque rápido
// "DOCENAS/COLUMNAS" de la sección DECISIÓN — misma lectura exacta que
// esta tabla, sin duplicar la lógica ni arriesgarse a que diverjan.

export function toState(entry: BetAdviceEntry | undefined): BadgeState {
  if (!entry) return 'wt';
  const raw = String(
    entry.status ?? entry.final_action ?? entry.action ?? 'WAIT'
  ).toUpperCase();
  if (raw === 'BET' || raw === 'EXPLOIT') return 'bet';
  if (raw === 'PROBE') return 'prb';
  return 'wt';
}

export function pickLabel(entry: BetAdviceEntry | undefined): string {
  if (!entry) return '—';
  return String(entry.pick ?? entry.selection ?? entry.value ?? entry.label ?? '—');
}

function safeInt(v: unknown, def = 0): number {
  const n = Number(v);
  return isFinite(n) ? Math.round(n) : def;
}

// ── Keys reales del backend (para resolver "primary") ────────────

const REAL_KEYS = ['color', 'paridad', 'rango', 'docenas', 'columnas',
                   'max_conf', 'guardian_docena', 'guardian_columna'] as const;

/** Devuelve la key con mayor conf_score en bet_advice, o null si no hay ninguna. */
function resolveTopKey(advice: Record<string, any>): string | null {
  let bestKey: string | null = null;
  let bestConf = -1;
  for (const k of REAL_KEYS) {
    const conf = Number((advice[k] as any)?.conf_score ?? -1);
    if (isFinite(conf) && conf > bestConf) {
      bestConf = conf;
      bestKey  = k;
    }
  }
  return bestKey;
}

// ── Mapa de categorías (key backend → label UI) ───────────────────

const CATEGORIES = [
  { key: 'primary',          label: 'Principal'         },
  { key: 'docenas',          label: 'Docenas'            },
  { key: 'columnas',         label: 'Columnas'           },
  { key: 'color',            label: 'Color'              },
  { key: 'paridad',          label: 'Paridad'            },
  { key: 'rango',            label: 'Rango'              },
  { key: 'max_conf',         label: 'Números (Top 12)'   },
  { key: 'guardian_docena',  label: 'Guardián (Docena)'  },
  { key: 'guardian_columna', label: 'Guardián (Columna)' },
] as const;

const E_KEYS = ['E1','E2','E3','E4','E5','E6','E7'] as const;

// ── Componente fila ───────────────────────────────────────────────
//
// v2 (sep 2026) — FIX visual: antes dependía de clases CSS externas
// (.cat-row/.cat-pick/.cat-stats/.cat-ehist/…) que en el panel angosto del
// Quantum Pilot (480px) cortaban la fila — el pick, AVG y el histograma
// E1-E7 quedaban fuera de vista, que era justo la queja: "no dice que
// docena que color que numeros". Ahora la fila es autocontenida (sin
// depender de ninguna hoja de estilos externa) y se apila en 3 líneas para
// que nada se recorte sin importar el ancho del contenedor.

const BADGE_STYLE: Record<BadgeState, React.CSSProperties> = {
  bet: { background: 'rgba(34,197,94,0.18)', color: '#86efac', border: '1px solid rgba(34,197,94,0.4)' },
  prb: { background: 'rgba(245,158,11,0.18)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.4)' },
  wt:  { background: 'rgba(100,116,139,0.18)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.35)' },
};
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

interface RowProps {
  label: string;
  state: BadgeState;
  pick: string;
  counter: Counter | undefined;
  errorHist: ErrorHist | undefined;
  god?: boolean;
}

function CategoryRow({ label, state, pick, counter, errorHist, god = false }: RowProps) {
  const w   = safeInt(counter?.wins);
  const l   = safeInt(counter?.losses);
  const seq = safeInt(counter?.consec_errors);
  const max = safeInt(counter?.max_consec_errors);
  const avg = safeInt(errorHist?.avg_errors ? errorHist.avg_errors * 10 : 0) / 10;
  const avgStr = (w + l) === 0 ? '0.0' : avg.toFixed(1);
  const accent = god ? '#fca5a5' : '#67e8f9';
  const borderColor = god ? 'rgba(220,38,38,0.15)' : 'rgba(34,211,238,0.12)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 4px', borderBottom: `1px solid ${borderColor}` }}>
      {/* línea 1: badge + nombre ...... pick (SIEMPRE visible, su propia línea) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              ...BADGE_STYLE[state],
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 4,
              letterSpacing: '0.1em',
              flexShrink: 0,
            }}
          >
            {BADGE_TXT[state]}
          </span>
          <span style={{ fontSize: 11.5, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
        </div>
        <span
          title={pick}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: accent,
            textShadow: `0 0 6px ${god ? 'rgba(248,113,113,0.4)' : 'rgba(34,211,238,0.4)'}`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '55%',
          }}
        >
          {pick}
        </span>
      </div>

      {/* línea 2: W:L:Seq:Max ...... AVG */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 10, color: '#64748b' }}>
        <span style={{ display: 'flex', gap: 8 }}>
          <span>W:<b style={{ color: '#cbd5e1' }}>{w}</b></span>
          <span>L:<b style={{ color: '#cbd5e1' }}>{l}</b></span>
          <span>Seq:<b style={{ color: '#cbd5e1' }}>{seq}</b></span>
          <span>Max:<b style={{ color: '#cbd5e1' }}>{max}</b></span>
        </span>
        <span>AVG:<b style={{ color: '#cbd5e1' }}>{avgStr}</b></span>
      </div>

      {/* línea 3: histograma E1-E7 */}
      <div style={{ display: 'flex', gap: 3 }}>
        {E_KEYS.map((ek) => {
          const val = safeInt(errorHist?.[ek]);
          const hasVal = val > 0;
          return (
            <div
              key={ek}
              title={`${ek}: ${val} vez${val !== 1 ? 'es' : ''}`}
              style={{
                flex: 1,
                height: 16,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                background: hasVal ? (god ? 'rgba(248,113,113,0.22)' : 'rgba(34,211,238,0.18)') : 'rgba(255,255,255,0.04)',
                color: hasVal ? (god ? '#fca5a5' : '#67e8f9') : '#475569',
              }}
            >
              {hasVal ? val : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

interface Props {
  payload:       EnginePayload | null;
  counters:      Record<string, Counter>;
  errorHist?:    Record<string, ErrorHist>;
  god?:          boolean;
  countersGod?:  Record<string, Counter>;
  errorHistGod?: Record<string, ErrorHist>;
  title?:        string;
  inlinePanel?:  boolean;  // true → no renderiza .panel wrapper (uso en GodBetPanel)
}

export function CategoryTable({
  payload,
  counters,
  errorHist = {},
  god = false,
  countersGod = {},
  errorHistGod = {},
  title = 'TABLA DE CATEGORÍAS',
  inlinePanel = false,
}: Props) {
  const advice: Record<string, BetAdviceEntry> =
    (payload as any)?.decision?.bet_advice ?? {};

  // Resuelve cuál es la categoría con mayor conf_score (fila "Principal")
  const topKey = resolveTopKey(advice);

  const rows = CATEGORIES.map(({ key, label }) => {
    // resolvedKey se usa SOLO para advice[] (pick visible + estado BET/PRB/WT).
    // Para "primary" no existe entrada en bet_advice (esa es una key del MOTOR),
    // así que apuntamos a la categoría con mayor conf_score para mostrar el pick.
    //
    // Para counters[] y errorHist[] se usa la KEY REAL del backend:
    //   counters['primary'] / counters['rango'] / etc. existen como keys
    //   independientes en el state (processor.py:_update_counters_local los
    //   llena para cada bet_key en el bucle, incluido 'primary'). Igualmente
    //   counters_god['god_primary'], counters_god['god_rango'], etc.
    //
    // Antes este código mapeaba `counterKey = resolvedKey` cuando key='primary',
    // lo que hacía que la fila "Principal" duplicara los stats de la categoría
    // con mayor conf_score (alias visual). Ahora cada fila lee sus stats
    // independientes — la fila "Principal" refleja el primary REAL del motor.
    const resolvedKey = key === 'primary' ? (topKey ?? key) : key;

    const godKey     = `god_${key}`;
    const counterSrc = god ? countersGod : counters;
    const histSrc    = god ? errorHistGod : errorHist;
    const counterKey = god ? godKey : key;
    const histKey    = god ? godKey : key;

    return {
      key,
      label: god ? `GOD · ${label}` : label,
      state:     toState(advice[resolvedKey]),
      pick:      pickLabel(advice[resolvedKey]),
      counter:   counterSrc[counterKey] as Counter | undefined,
      errorHist: histSrc[histKey] as ErrorHist | undefined,
    };
  });

  const inner = (
    <>
      <div className="panel-head">
        <span className="icon">◈</span>
        <span className="title">{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((row) => (
          <CategoryRow
            key={row.key}
            label={row.label}
            state={row.state}
            pick={row.pick}
            counter={row.counter}
            errorHist={row.errorHist}
            god={god}
          />
        ))}
      </div>
    </>
  );

  if (inlinePanel) return <div className="cat-table-inline">{inner}</div>;
  return <div className="panel">{inner}</div>;
}
