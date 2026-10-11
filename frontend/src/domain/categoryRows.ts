// ════════════════════════════════════════════════════════════════════════
// FILAS DE CATEGORÍAS — vista fusionada CategoryTable + GodBetPanel.
//
// Misma resolución que CategoryTable.tsx (CATEGORIES, topKey por conf_score,
// toState/pickLabel de ese mismo archivo) pero devolviendo, por fila, el
// contador normal Y el de GOD en un solo objeto, para pintar UNA tabla.
// Los contadores se leen con las MISMAS claves: counters[key] y
// countersGod['god_'+key] / errorHistGod['god_'+key]. Solo lectura.
// ════════════════════════════════════════════════════════════════════════

import { toState, pickLabel, type BadgeState, type BetAdviceEntry } from '@/components/CategoryTable';

export interface CounterLike {
  wins?: number; losses?: number; streak?: number; max_streak?: number;
  consec_errors?: number; max_consec_errors?: number;
}
export interface ErrorHistLike { avg_errors?: number; [k: string]: any }

export interface CounterView { w: number; l: number; seq: number; max: number; avg: string }

export interface CategoryRowView {
  key: string;
  label: string;
  state: BadgeState;
  pick: string;
  normal: CounterView;
  god: CounterView;
}

const REAL_KEYS = ['color', 'paridad', 'rango', 'docenas', 'columnas',
                   'max_conf', 'guardian_docena', 'guardian_columna'] as const;

export const CATEGORIES = [
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

function safeInt(v: unknown, def = 0): number {
  const n = Number(v);
  return isFinite(n) ? Math.round(n) : def;
}

export function resolveTopKey(advice: Record<string, any>): string | null {
  let bestKey: string | null = null;
  let bestConf = -1;
  for (const k of REAL_KEYS) {
    const conf = Number((advice[k] as any)?.conf_score ?? -1);
    if (isFinite(conf) && conf > bestConf) { bestConf = conf; bestKey = k; }
  }
  return bestKey;
}

export function counterView(counter: CounterLike | undefined, hist: ErrorHistLike | undefined): CounterView {
  const w = safeInt(counter?.wins);
  const l = safeInt(counter?.losses);
  const seq = safeInt(counter?.consec_errors);
  const max = safeInt(counter?.max_consec_errors);
  const avg = safeInt(hist?.avg_errors ? hist.avg_errors * 10 : 0) / 10;
  return { w, l, seq, max, avg: (w + l) === 0 ? '0.0' : avg.toFixed(1) };
}

export function buildCategoryRows(
  payload: any,
  counters: Record<string, CounterLike>,
  errorHist: Record<string, ErrorHistLike>,
  countersGod: Record<string, CounterLike>,
  errorHistGod: Record<string, ErrorHistLike>,
): CategoryRowView[] {
  const advice: Record<string, BetAdviceEntry> = payload?.decision?.bet_advice ?? {};
  const topKey = resolveTopKey(advice);
  return CATEGORIES.map(({ key, label }) => {
    const resolvedKey = key === 'primary' ? (topKey ?? key) : key;
    const godKey = `god_${key}`;
    return {
      key, label,
      state: toState(advice[resolvedKey]),
      pick: pickLabel(advice[resolvedKey]),
      normal: counterView(counters[key], errorHist[key]),
      god: counterView(countersGod[godKey], errorHistGod[godKey]),
    };
  });
}
