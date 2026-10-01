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
// v6 (sep 2026) — CORRECCIÓN sobre v5: Gunner probó v5 en vivo y la rechazó
// — "los textos son pequeños no es facil leer, no hay separacion clara, no
// hay cian flash no hay micropaneles". v5 interpretó "sin cards" como CERO
// contenedores, y eso quedó ilegible bajo presión real de mesa. Corrección:
// - MICROPANEL: la tabla entera (no cada fila — eso volvería a ser "cards
//   dentro de cards") vuelve a tener UN borde cian visible + fondo sutil +
//   radio chico. Una sola capa, nada anidado.
// - Tamaños de fuente subidos en todo dato que se lee para operar (pick,
//   nombre de categoría, stats) — ya no es "letra de letra chica de excel".
// - Separadores reales: el borde entre header y filas, y entre filas, sube
//   de opacidad a algo que se ve de verdad sin gritar.
// - Glow cian reinstalado en el header y en el pick de la fila activa — el
//   "flash" que le daba identidad a la app y que v5 le había sacado casi
//   entero.
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

// v7 (oct 2026) — rediseño cockpit, dos pedidos puntuales de Gunner sobre
// el prototipo:
//   1. "Blanco neón en vez de naranja" — PRB deja de ser ámbar.
//   2. Badges tipo píldora para el estado + zebra striping muy sutil en las
//      filas, para seguir W/L/SEQ/MAX horizontalmente sin más altura.
const STATE_COLOR: Record<BadgeState, string> = {
  bet: '#4ade80',  // verde — evento accionable
  prb: '#f4f8ff',  // blanco neón — esperar (antes ámbar)
  wt:  '#67e8f9',  // cian — sin acción, simplemente está ahí
};
const BADGE_BG: Record<BadgeState, string> = {
  bet: 'rgba(74,222,128,0.14)',
  prb: 'rgba(244,248,255,0.12)',
  wt:  'rgba(34,211,238,0.12)',
};
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

interface RowProps {
  label: string;
  state: BadgeState;
  pick: string;
  counter: Counter | undefined;
  errorHist: ErrorHist | undefined;
  god?: boolean;
  zebra?: boolean;
}

function CategoryRow({ label, state, pick, counter, errorHist, god = false, zebra = false }: RowProps) {
  const w   = safeInt(counter?.wins);
  const l   = safeInt(counter?.losses);
  const seq = safeInt(counter?.consec_errors);
  const max = safeInt(counter?.max_consec_errors);
  const avg = safeInt(errorHist?.avg_errors ? errorHist.avg_errors * 10 : 0) / 10;
  const avgStr = (w + l) === 0 ? '0.0' : avg.toFixed(1);
  const accent = god ? '#fca5a5' : '#67e8f9';
  const stateColor = state === 'bet' && god ? '#f87171' : STATE_COLOR[state];
  const stateBg = state === 'bet' && god ? 'rgba(248,113,113,0.16)' : BADGE_BG[state];
  const activo = state === 'bet'; // único estado que "brilla" en la fila

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 7px 7px 9px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderLeft: `4px solid ${activo ? stateColor : 'transparent'}`,
        // la fila activa (BET) manda sobre la cebra — es el único realce
        // que debe notarse de verdad.
        background: activo ? `${stateColor}18` : zebra ? 'rgba(255,255,255,0.02)' : 'transparent',
      }}
    >
      {/* estado — badge tipo píldora con fondo semitransparente */}
      <span style={{ flexShrink: 0, width: 28 }}>
        <span
          style={{
            display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
            color: stateColor, background: stateBg, borderRadius: 4, padding: '2px 6px',
          }}
        >
          {BADGE_TXT[state]}
        </span>
      </span>

      {/* nombre */}
      <span style={{ fontSize: 12.5, color: '#a8b7cc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: 98, flexShrink: 0 }}>
        {label}
      </span>

      {/* pick — se lleva el espacio que sobra. Glow cian cuando la fila está
          activa (BET) — es el único dato "jugándose ahora" en esta tabla. */}
      <span
        title={pick}
        style={{
          fontSize: 14.5, fontWeight: 800, color: accent,
          textShadow: activo ? `0 0 8px ${stateColor}99` : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: '1 1 auto', minWidth: 40,
        }}
      >
        {pick}
      </span>

      {/* stats — nunca se recortan */}
      <span style={{ display: 'flex', gap: 8, fontSize: 11, color: '#7c8aa0', flexShrink: 0, whiteSpace: 'nowrap' }}>
        <span>W:<b style={{ color: '#e2e8f0' }}>{w}</b></span>
        <span>L:<b style={{ color: '#e2e8f0' }}>{l}</b></span>
        <span>Sq:<b style={{ color: '#e2e8f0' }}>{seq}</b></span>
        <span>Mx:<b style={{ color: '#e2e8f0' }}>{max}</b></span>
      </span>

      <span style={{ fontSize: 11, color: '#7c8aa0', flexShrink: 0, whiteSpace: 'nowrap', width: 50 }}>
        AVG:<b style={{ color: '#e2e8f0' }}>{avgStr}</b>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 8 }}>
          <span style={{ color: god ? '#f87171' : '#22d3ee', fontSize: 11, textShadow: god ? '0 0 8px rgba(248,113,113,0.6)' : '0 0 8px rgba(34,211,238,0.6)' }}>◈</span>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: '#e2e8f0', textShadow: god ? '0 0 10px rgba(248,113,113,0.35)' : '0 0 10px rgba(34,211,238,0.35)' }}>{title}</span>
        </div>
      )}
      {/* encabezado de columnas — mismos anchos que CategoryRow, así queda
          claro qué es cada número sin tener que adivinar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 7px 6px 9px', borderBottom: '1px solid rgba(34,211,238,0.18)' }}>
        <span style={{ width: 23, flexShrink: 0 }} />
        <span style={{ width: 98, flexShrink: 0, fontSize: 9.5, color: '#64748b', letterSpacing: '0.1em', fontWeight: 700 }}>CATEGORÍA</span>
        <span style={{ flex: '1 1 auto', minWidth: 40, fontSize: 9.5, color: '#64748b', letterSpacing: '0.1em', fontWeight: 700 }}>PICK</span>
        <span style={{ flexShrink: 0, fontSize: 9.5, color: '#64748b', letterSpacing: '0.1em', fontWeight: 700, width: 112 }}>W / L / SEQ / MAX</span>
        <span style={{ width: 50, flexShrink: 0, fontSize: 9.5, color: '#64748b', letterSpacing: '0.1em', fontWeight: 700 }}>AVG</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((row, i) => (
          <CategoryRow
            key={row.key}
            label={row.label}
            state={row.state}
            pick={row.pick}
            counter={row.counter}
            errorHist={row.errorHist}
            god={god}
            zebra={i % 2 === 1}
          />
        ))}
      </div>
    </>
  );

  // inlinePanel=true (uso dentro de GodBetPanel) → sin micropanel propio,
  // GodBetPanel ya pone el suyo — evita "caja dentro de caja".
  if (inlinePanel) return <>{inner}</>;
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'rgba(10, 16, 28, 0.55)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(34, 211, 238, 0.25)',
        borderRadius: 8,
        boxShadow: '0 0 16px rgba(34, 211, 238, 0.08), inset 0 1px 0 rgba(34,211,238,0.05)',
        padding: '10px 10px 2px',
      }}
    >
      {inner}
    </div>
  );
}
