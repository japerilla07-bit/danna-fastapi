// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Store de telemetría (v6: global + registro por celda)
// ════════════════════════════════════════════════════════════════════════
//
// Tres capas de conteo, todas de la SESIÓN de hoy (se resetean al reset):
//   1) GLOBAL por mercado — aciertos, errores, racha actual y racha máx.
//      Toma cada sugerencia como apuesta, sin importar estado ni condición
//      del motor. Es el marcador del día.
//   2) POR CELDA (HUD×ENT) — cada celda visitada guarda sus aciertos,
//      errores y racha máx propia. Regla de racha PAUSADA: un giro en OTRA
//      celda no toca la racha de esta; solo un ACIERTO en la misma celda la
//      reinicia a 0.
//   3) La celda actual sale del último giro (último hud/ent).
//
// El motor apuesta siempre BET; el panel es solo lectura.
// ════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { classifyZone, cellKeyOf, type Zone, type Market } from '@/domain/zoneMatrix';

// ────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────

export interface TelemetrySpin {
  n: number;
  hud: number | null;
  ent: number | null;
  dHud: number | null;
  dEnt: number | null;
  docHit: boolean | null;
  colHit: boolean | null;
  ts: number;
}

export interface IngestPayload {
  n: number;
  hud: number | null;
  ent: number | null;
  docHit: boolean | null;
  colHit: boolean | null;
}

/** Registro de sesión de una celda para un mercado. */
export interface CellRec {
  hits: number;
  misses: number;
  streak: number;     // racha de errores actual EN esta celda (pausada)
  maxStreak: number;  // racha máx de errores vivida hoy en esta celda
}

interface Counters {
  docHits: number; docMisses: number; colHits: number; colMisses: number;
  docStreak: number; docMaxStreak: number; colStreak: number; colMaxStreak: number;
}

/** cellReg[mkt][cellKey] = CellRec */
type CellReg = { doc: Record<string, CellRec>; col: Record<string, CellRec> };

interface TelemetryState {
  history: TelemetrySpin[];
  lastN: number;
  lastSig: string;
  counters: Counters;
  cellReg: CellReg;
  ingest: (p: IngestPayload) => void;
  reset: () => void;
}

export const HISTORY_CAP = 300;

const EMPTY_COUNTERS: Counters = {
  docHits: 0, docMisses: 0, colHits: 0, colMisses: 0,
  docStreak: 0, docMaxStreak: 0, colStreak: 0, colMaxStreak: 0,
};

const sig = (p: IngestPayload) =>
  `${p.n}|${p.hud ?? 'x'}|${p.ent ?? 'x'}|${p.docHit ?? 'x'}|${p.colHit ?? 'x'}`;

// Actualiza el registro de UNA celda de UN mercado con el resultado del giro.
// Devuelve un nuevo objeto cellReg[mkt] (inmutable) con la celda actualizada.
function bumpCell(
  reg: Record<string, CellRec>,
  key: string,
  hit: boolean,
): Record<string, CellRec> {
  const prev = reg[key] ?? { hits: 0, misses: 0, streak: 0, maxStreak: 0 };
  let { hits, misses, streak, maxStreak } = prev;
  if (hit) {
    hits += 1;
    streak = 0;                 // acierto EN esta celda reinicia su racha
  } else {
    misses += 1;
    streak += 1;                // error suma a la racha de esta celda
    if (streak > maxStreak) maxStreak = streak;
  }
  return { ...reg, [key]: { hits, misses, streak, maxStreak } };
}

// ────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  history: [],
  lastN: -1,
  lastSig: '',
  counters: { ...EMPTY_COUNTERS },
  cellReg: { doc: {}, col: {} },

  ingest: (p) => {
    const s = sig(p);
    const st = get();
    if (s === st.lastSig) return;
    if (p.n <= st.lastN && st.history.length > 0) {
      set({ lastSig: s });
      return;
    }

    const prev = st.history[st.history.length - 1];
    const dHud = prev && p.hud !== null && prev.hud !== null ? p.hud - prev.hud : null;
    const dEnt = prev && p.ent !== null && prev.ent !== null ? p.ent - prev.ent : null;

    const spin: TelemetrySpin = {
      n: p.n, hud: p.hud, ent: p.ent, dHud, dEnt,
      docHit: p.docHit, colHit: p.colHit, ts: Date.now(),
    };
    const next = st.history.length >= HISTORY_CAP
      ? [...st.history.slice(1), spin]
      : [...st.history, spin];

    // ── Global por mercado ──
    const c = { ...st.counters };
    if (p.docHit === true)  { c.docHits += 1; c.docStreak = 0; }
    else if (p.docHit === false) { c.docMisses += 1; c.docStreak += 1; if (c.docStreak > c.docMaxStreak) c.docMaxStreak = c.docStreak; }
    if (p.colHit === true)  { c.colHits += 1; c.colStreak = 0; }
    else if (p.colHit === false) { c.colMisses += 1; c.colStreak += 1; if (c.colStreak > c.colMaxStreak) c.colMaxStreak = c.colStreak; }

    // ── Por celda (solo la celda del giro; las demás quedan intactas = pausadas) ──
    const key = cellKeyOf(p.hud, p.ent);
    let cellReg = st.cellReg;
    if (key) {
      let doc = cellReg.doc, col = cellReg.col;
      if (p.docHit !== null) doc = bumpCell(doc, key, p.docHit);
      if (p.colHit !== null) col = bumpCell(col, key, p.colHit);
      if (doc !== cellReg.doc || col !== cellReg.col) cellReg = { doc, col };
    }

    set({ history: next, lastN: p.n, lastSig: s, counters: c, cellReg });
  },

  reset: () =>
    set({
      history: [], lastN: -1, lastSig: '',
      counters: { ...EMPTY_COUNTERS },
      cellReg: { doc: {}, col: {} },
    }),
}));

// ════════════════════════════════════════════════════════════════════════
// SELECTORES (primitivas o referencias estables → sin loops de re-render)
// ════════════════════════════════════════════════════════════════════════

export const useLastHud = (): number | null =>
  useTelemetryStore((s) => { const l = s.history[s.history.length - 1]; return l ? l.hud : null; });

export const useLastEnt = (): number | null =>
  useTelemetryStore((s) => { const l = s.history[s.history.length - 1]; return l ? l.ent : null; });

export const useCurrentZone = (mkt: Market): Zone =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    if (!l) return 'NEUTRA';
    return classifyZone(l.hud, l.ent, mkt);
  });

// ── Global por mercado ──
export const useMarketHits = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docHits : s.counters.colHits);
export const useMarketMisses = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docMisses : s.counters.colMisses);
export const useMarketMaxStreak = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docMaxStreak : s.counters.colMaxStreak);
export const useMarketStreak = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docStreak : s.counters.colStreak);
export const useMarketWr = (mkt: Market): number | null =>
  useTelemetryStore((s) => {
    const h = mkt === 'doc' ? s.counters.docHits : s.counters.colHits;
    const m = mkt === 'doc' ? s.counters.docMisses : s.counters.colMisses;
    const t = h + m;
    return t > 0 ? (h / t) * 100 : null;
  });

// ── Por celda ──
// Referencia estable: cellReg[mkt] solo cambia cuando ingest lo actualiza.
export const useCellReg = (mkt: Market): Record<string, CellRec> =>
  useTelemetryStore((s) => s.cellReg[mkt]);

/** Registro de sesión de una celda concreta (o null si no visitada). */
export const useCellRec = (mkt: Market, key: string | null): CellRec | null =>
  useTelemetryStore((s) => (key ? (s.cellReg[mkt][key] ?? null) : null));

// ── Acciones ──
export const useIngestSpin = () => useTelemetryStore((s) => s.ingest);
export const useResetTelemetry = () => useTelemetryStore((s) => s.reset);

if (typeof window !== 'undefined') {
  (window as any).__telemetry = useTelemetryStore;
}
