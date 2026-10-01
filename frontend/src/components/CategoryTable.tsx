// CategoryTable — Tabla de categorías.
//
// Columnas: estado | nombre | pick | W: L: Seq: Max: | AVG
//
// v5 (sep 2026) — REDISEÑO "INSTRUMENT PANEL" (sin cards). Pedido explícito
// de Gunner tras una crítica visual externa: dejar de pensar en cajas (pill
// de color por badge, borde + fondo por panel) y pasar a una única
// superficie de datos — jerarquía por texto/color/posición, color SOLO para
// eventos, y la única fila que "brilla" es la que de verdad está jugándose
// (estado BET). El resto es texto plano. Se sacó la dependencia de
// className="panel"/"panel-head"/"cat-table-inline" (CSS externo que no se
// controla desde acá — mismo criterio que ya se usó en v2 para CategoryRow)
// a favor de estilos inline, igual que el resto del archivo.
//
// v4 (sep 2026) — se había sacado el histograma E1-E7 (los cuadritos chicos
// que marcaban cuántas veces se acertó tras 1/2/3.../7 errores seguidos).
// AVG (el promedio de errores antes de acertar) se queda — es el resumen de
// esa misma info. `errorHist` se sigue recibiendo (alimenta AVG).
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
// v5 — sin pill de fondo en el estado: el color YA es la señal (texto
// BET/PRB/WT coloreado), no hace falta encerrarlo en una cajita. La única
// fila que recibe tratamiento especial es la que está en BET de verdad
// (acento lateral + un lavado de fondo casi imperceptible) — "la decisión
// activa" es lo único que debe destacar, todo lo demás queda discreto.

const STATE_COLOR: Record<BadgeState, string> = {
  bet: '#4ade80',  // verde — evento accionable
  prb: '#fbbf24',  // ámbar — esperar
  wt:  '#64748b',  // gris — sin acción, simplemente está ahí
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
  const stateColor = state === 'bet' && god ? '#f87171' : STATE_COLOR[state];
  const activo = state === 'bet'; // único estado que "brilla" en la fila

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 6px 6px 7px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        borderLeft: `3px solid ${activo ? stateColor : 'transparent'}`,
        background: activo ? `${stateColor}0d` : 'transparent',
      }}
    >
      {/* estado — texto de color, sin cápsula */}
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: stateColor, flexShrink: 0, width: 24 }}>
        {BADGE_TXT[state]}
      </span>

      {/* nombre */}
      <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: 104, flexShrink: 0 }}>
        {label}
      </span>

      {/* pick — se lleva el espacio que sobra */}
      <span
        title={pick}
        style={{
          fontSize: 12.5, fontWeight: 700, color: accent,
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
  inlinePanel?:  boolean;  // true → sin encabezado propio ni wrapper (uso en GodBetPanel, que pone su propio título)
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
      {!inlinePanel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          <span style={{ color: god ? '#f87171' : '#67e8f9', fontSize: 10 }}>◈</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', color: '#cbd5e1' }}>{title}</span>
        </div>
      )}
      {/* encabezado de columnas — mismos anchos que CategoryRow, así queda
          claro qué es cada número sin tener que adivinar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 5px 7px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ width: 24, flexShrink: 0 }} />
        <span style={{ width: 104, flexShrink: 0, fontSize: 8.5, color: '#475569', letterSpacing: '0.1em' }}>CATEGORÍA</span>
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

  if (inlinePanel) return <>{inner}</>;
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{inner}</div>;
}
