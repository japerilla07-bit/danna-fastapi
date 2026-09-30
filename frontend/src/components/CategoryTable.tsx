// CategoryTable — Tabla de categorías.
//
// Columnas: badge | nombre | pick | W: L: Seq: Max: | AVG
//
// v4 (sep 2026) — se sacó el histograma E1-E7 (los cuadritos chicos que
// marcaban cuántas veces se acertó tras 1/2/3.../7 errores seguidos).
// Pedido explícito de Gunner: "podemos eliminar los cuadros pequeños que
// marcan cuantas veces cada error". AVG (el promedio de errores antes de
// acertar) se queda — es el resumen de esa misma info; el desglose
// giro-a-giro no se usaba para operar en vivo. `errorHist` se sigue
// recibiendo (alimenta AVG), solo dejó de leerse fila E1-E7.
//
// error_hist[key] = { E1, E2, E3, E4, E5, E6, E7, hits_counted, avg_errors }

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

// ── Componente fila ───────────────────────────────────────────────
//
// v3 (sep 2026) — REORGANIZACIÓN COMPLETA. El Quantum Pilot pasó a un
// layout de 2 columnas mucho más ancho (ver Quantumpilot.tsx), así que
// esta fila vuelve a ser DE UNA SOLA LÍNEA — como una fila de tabla real —
// en vez de apilarse en 3 (eso era el parche para el panel de 480px que
// ya no existe). Autocontenida igual que v2, sin depender de CSS externo.
// Orden de columnas, de izquierda a derecha: badge · nombre · pick ·
// W:L:Seq:Max · AVG (el histograma E1-E7 que iba después se sacó en v4).
// Todo visible siempre, nada se oculta — nombre/pick truncan primero (son
// texto), los números nunca.

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
  const borderColor = god ? 'rgba(220,38,38,0.12)' : 'rgba(34,211,238,0.10)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderBottom: `1px solid ${borderColor}` }}>
      {/* badge */}
      <span
        style={{
          ...BADGE_STYLE[state],
          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
          letterSpacing: '0.08em', flexShrink: 0, width: 26, textAlign: 'center',
        }}
      >
        {BADGE_TXT[state]}
      </span>

      {/* nombre */}
      <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: 108, flexShrink: 0 }}>
        {label}
      </span>

      {/* pick — se lleva el espacio que sobra */}
      <span
        title={pick}
        style={{
          fontSize: 12.5, fontWeight: 700, color: accent,
          textShadow: `0 0 6px ${god ? 'rgba(248,113,113,0.35)' : 'rgba(34,211,238,0.35)'}`,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: '1 1 auto', minWidth: 40,
        }}
      >
        {pick}
      </span>

      {/* stats — nunca se recortan */}
      <span style={{ display: 'flex', gap: 7, fontSize: 9.5, color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>
        <span>W:<b style={{ color: '#cbd5e1' }}>{w}</b></span>
        <span>L:<b style={{ color: '#cbd5e1' }}>{l}</b></span>
        <span>Sq:<b style={{ color: '#cbd5e1' }}>{seq}</b></span>
        <span>Mx:<b style={{ color: '#cbd5e1' }}>{max}</b></span>
      </span>

      <span style={{ fontSize: 9.5, color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap', width: 52 }}>
        AVG:<b style={{ color: '#cbd5e1' }}>{avgStr}</b>
      </span>
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
      {/* encabezado de columnas — mismos anchos que CategoryRow, así queda
          claro qué es cada número sin tener que adivinar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 4px 5px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ width: 26, flexShrink: 0 }} />
        <span style={{ width: 108, flexShrink: 0, fontSize: 8.5, color: '#475569', letterSpacing: '0.1em' }}>CATEGORÍA</span>
        <span style={{ flex: '1 1 auto', minWidth: 40, fontSize: 8.5, color: '#475569', letterSpacing: '0.1em' }}>PICK</span>
        <span style={{ flexShrink: 0, fontSize: 8.5, color: '#475569', letterSpacing: '0.1em', width: 116 }}>W / L / SEQ / MAX</span>
        <span style={{ width: 52, flexShrink: 0, fontSize: 8.5, color: '#475569', letterSpacing: '0.1em' }}>AVG</span>
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
