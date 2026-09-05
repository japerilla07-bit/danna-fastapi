// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Store de telemetría (v7: resolución DIFERIDA del pick)
// ════════════════════════════════════════════════════════════════════════
//
// CÓMO SE CUENTA EL ACIERTO (igual que el SessionRecorder → coincide con la
// matriz, que salió de esos CSV):
//   • El acierto NO viene del contador del API (solo se mueve en BET → fallaba).
//   • El pick TOP-2 ("13-24 / 1-12", "Columna 3 / Columna 2") se convierte al
//     conjunto de números que cubre y se compara con el número que salió.
//   • ALINEACIÓN: el pick del giro N es la sugerencia PARA el giro N+1, así que
//     se evalúa contra el spin del giro N+1. Por eso el resultado llega un giro
//     tarde: el store guarda el giro como "pendiente" y lo resuelve cuando
//     entra el número siguiente. Toma CADA sugerencia como apuesta.
//
// El registro (aciertos/errores/racha) se imputa a la celda HUD×ENT del giro
// en que se hizo la sugerencia (el pendiente), no a la del giro que lo resuelve.
//
// Tres capas de conteo, todas de la SESIÓN (se resetean con reset):
//   1) GLOBAL por mercado — aciertos, errores, racha viva y racha máx.
//   2) POR CELDA — cada celda visitada con sus aciertos/errores/racha máx
//      (racha pausada: otra celda no la toca; solo un acierto en la misma
//      celda la reinicia).
//   3) La celda ACTUAL sale del último giro (aún sin resolver).
// ════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { classifyZone, cellKeyOf, type Zone, type Market } from '@/domain/zoneMatrix';

// ────────────────────────────────────────────────────────────────────────
// Resolución de pick (copiado 1:1 del SessionRecorder)
// ────────────────────────────────────────────────────────────────────────

/** Convierte un pick de texto en el conjunto de números que cubre. */
function numerosDe(pick: string): number[] {
  const out = new Set<number>();
  const t = (pick || '').toLowerCase();
  if (/\b1\s*-\s*12\b/.test(t))  for (let n = 1;  n <= 12; n++) out.add(n);
  if (/\b13\s*-\s*24\b/.test(t)) for (let n = 13; n <= 24; n++) out.add(n);
  if (/\b25\s*-\s*36\b/.test(t)) for (let n = 25; n <= 36; n++) out.add(n);
  for (const m of t.matchAll(/col(?:umna)?\s*([123])/g)) {
    const c = Number(m[1]);
    for (let n = 1; n <= 36; n++) if (n % 3 === c % 3) out.add(n);
  }
  return [...out];
}

/** true=acierto, false=error, null=sin pick evaluable. */
function resolvePick(pick: string, spin: number): boolean | null {
  const nums = numerosDe(pick);
  if (nums.length === 0) return null;
  return nums.includes(spin);
}

// ────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────

export interface TelemetrySpin {
  n: number;
  hud: number | null;
  ent: number | null;
  docHit: boolean | null;   // resultado del pick DOC resuelto en este giro
  colHit: boolean | null;   // resultado del pick COL resuelto en este giro
  ts: number;
}

/** Lo que manda el AppPage por giro: estado + pick + número que salió. */
export interface IngestPayload {
  n: number;
  hud: number | null;
  ent: number | null;
  spin: number | null;   // número que salió en ESTE giro (resuelve el pendiente)
  docPick: string;
  colPick: string;
}

/** Giro cuya sugerencia aún no se resolvió (se resuelve con el spin siguiente). */
interface Pending {
  n: number;
  hud: number | null;
  ent: number | null;
  docPick: string;
  colPick: string;
  copSug: 'doc' | 'col' | null;  // qué mercado sugirió el copiloto en este giro (null = esperar/parar)
}

export interface CellRec {
  hits: number;
  misses: number;
  streak: number;
  maxStreak: number;
}

interface Counters {
  docHits: number; docMisses: number; colHits: number; colMisses: number;
  docStreak: number; docMaxStreak: number; colStreak: number; colMaxStreak: number;
}

// Marcador propio del COPILOTO: aciertos/errores/racha de lo que D.A.N.N.A. sugiere.
interface CopScore {
  hits: number; misses: number; streak: number; maxStreak: number;
}

type CellReg = { doc: Record<string, CellRec>; col: Record<string, CellRec> };

interface TelemetryState {
  history: TelemetrySpin[];
  lastN: number;
  pending: Pending | null;
  counters: Counters;
  cellReg: CellReg;
  copScore: CopScore;
  ingest: (p: IngestPayload) => void;
  setCopSug: (mkt: 'doc' | 'col' | null) => void;
  reset: () => void;
}

// Cap alto: una sesión son ~500 giros. Con 2000 el history NUNCA se recorta
// durante una sesión, así el marcador del copiloto (peor racha incluida) se
// calcula sobre TODOS los giros y nunca "baja mágicamente" por perder los viejos.
// El reset limpia todo al empezar una mesa nueva.
export const HISTORY_CAP = 2000;

const EMPTY_COUNTERS: Counters = {
  docHits: 0, docMisses: 0, colHits: 0, colMisses: 0,
  docStreak: 0, docMaxStreak: 0, colStreak: 0, colMaxStreak: 0,
};

function bumpCell(reg: Record<string, CellRec>, key: string, hit: boolean): Record<string, CellRec> {
  const prev = reg[key] ?? { hits: 0, misses: 0, streak: 0, maxStreak: 0 };
  let { hits, misses, streak, maxStreak } = prev;
  if (hit) { hits += 1; streak = 0; }
  else { misses += 1; streak += 1; if (streak > maxStreak) maxStreak = streak; }
  return { ...reg, [key]: { hits, misses, streak, maxStreak } };
}

// ────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────

// Sugerencia actual del copiloto (ref sincrónica a nivel módulo). El copiloto la
// escribe en cada render; el ingest la lee en el instante exacto de registrar el
// giro pendiente. Así el marcador cuenta SOLO lo que D.A.N.N.A. mostraba en ese
// giro — si decía "esperar"/"parar" (null), ese giro no se cuenta.
let copSugRef: 'doc' | 'col' | null = null;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  history: [],
  lastN: -1,
  pending: null,
  counters: { ...EMPTY_COUNTERS },
  cellReg: { doc: {}, col: {} },
  copScore: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },

  setCopSug: (mkt) => {
    // ref sincrónica: la sugerencia actual del copiloto, disponible al instante
    // para el ingest, sin depender del timing de un useEffect (evita contar
    // giros donde D.A.N.N.A. decía "esperar").
    copSugRef = mkt;
  },

  ingest: (p) => {
    const st = get();
    if (p.n === st.lastN) return;                              // mismo giro (re-render)
    if (p.n < st.lastN && st.history.length > 0) return;       // giro viejo

    let counters = st.counters;
    let cellReg = st.cellReg;
    let copScore = st.copScore;
    let histResuelto = st.history;   // history con el resultado del pendiente ya escrito

    // ── 1) Resolver el PENDIENTE (giro anterior) con el número de ESTE giro ──
    const pend = st.pending;
    if (pend && p.spin !== null && Number.isFinite(p.spin)) {
      const spin = Number(p.spin);
      const docHit = resolvePick(pend.docPick, spin);
      const colHit = resolvePick(pend.colPick, spin);
      const key = cellKeyOf(pend.hud, pend.ent);

      // ── Marcador del COPILOTO: si D.A.N.N.A. sugirió un mercado ese giro,
      //    ¿acertó? (usa el resultado del mercado que sugirió) ──
      if (pend.copSug) {
        const cop = pend.copSug === 'doc' ? docHit : colHit;
        if (cop !== null) {
          const cs = { ...st.copScore };
          if (cop === true) { cs.hits += 1; cs.streak = 0; }
          else { cs.misses += 1; cs.streak += 1; if (cs.streak > cs.maxStreak) cs.maxStreak = cs.streak; }
          copScore = cs;
        }
      }

      if (docHit !== null || colHit !== null) {
        const c = { ...counters };
        if (docHit === true)  { c.docHits += 1; c.docStreak = 0; }
        else if (docHit === false) { c.docMisses += 1; c.docStreak += 1; if (c.docStreak > c.docMaxStreak) c.docMaxStreak = c.docStreak; }
        if (colHit === true)  { c.colHits += 1; c.colStreak = 0; }
        else if (colHit === false) { c.colMisses += 1; c.colStreak += 1; if (c.colStreak > c.colMaxStreak) c.colMaxStreak = c.colStreak; }
        counters = c;

        if (key) {
          let doc = cellReg.doc, col = cellReg.col;
          if (docHit !== null) doc = bumpCell(doc, key, docHit);
          if (colHit !== null) col = bumpCell(col, key, colHit);
          if (doc !== cellReg.doc || col !== cellReg.col) cellReg = { doc, col };
        }

        // Escribir el resultado en la fila del PENDIENTE (última del history)
        if (st.history.length > 0) {
          const last = st.history[st.history.length - 1];
          const actualizada: TelemetrySpin = { ...last, docHit, colHit };
          histResuelto = [...st.history.slice(0, -1), actualizada];
        }
      }
    }

    // ── 2) Registrar ESTE giro en history (aún sin resolver → docHit/colHit null) ──
    const spinRow: TelemetrySpin = { n: p.n, hud: p.hud, ent: p.ent, docHit: null, colHit: null, ts: Date.now() };
    const history = histResuelto.length >= HISTORY_CAP
      ? [...histResuelto.slice(1), spinRow]
      : [...histResuelto, spinRow];

    // ── 3) ESTE giro pasa a ser el nuevo pendiente (con lo que sugirió el copiloto) ──
    const pending: Pending = { n: p.n, hud: p.hud, ent: p.ent, docPick: p.docPick, colPick: p.colPick, copSug: copSugRef };

    set({ history, lastN: p.n, pending, counters, cellReg, copScore });
  },

  reset: () => {
    set({
      history: [], lastN: -1, pending: null,
      counters: { ...EMPTY_COUNTERS },
      cellReg: { doc: {}, col: {} },
      copScore: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
    });
    copSugRef = null;
  },
}));

// ════════════════════════════════════════════════════════════════════════
// SELECTORES
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

export const useCellReg = (mkt: Market): Record<string, CellRec> =>
  useTelemetryStore((s) => s.cellReg[mkt]);
export const useCellRec = (mkt: Market, key: string | null): CellRec | null =>
  useTelemetryStore((s) => (key ? (s.cellReg[mkt][key] ?? null) : null));

export const useIngestSpin = () => useTelemetryStore((s) => s.ingest);
export const useResetTelemetry = () => useTelemetryStore((s) => s.reset);

// History completo (para recalcular el marcador del copiloto sin depender de timing).
export const useHistory = (): TelemetrySpin[] => useTelemetryStore((s) => s.history);

// ── Marcador del COPILOTO (lo que sugiere D.A.N.N.A.) ──
export const useSetCopSug = () => useTelemetryStore((s) => s.setCopSug);
export const useCopHits = (): number => useTelemetryStore((s) => s.copScore.hits);
export const useCopMisses = (): number => useTelemetryStore((s) => s.copScore.misses);
export const useCopStreak = (): number => useTelemetryStore((s) => s.copScore.maxStreak);
export const useCopWr = (): number | null => useTelemetryStore((s) => {
  const t = s.copScore.hits + s.copScore.misses;
  return t > 0 ? (s.copScore.hits / t) * 100 : null;
});

// ── Termómetro en vivo: cómo venís en los últimos N giros de un mercado ──
// IMPORTANTE: cada selector devuelve un NÚMERO (primitiva), no un objeto.
// Devolver un objeto nuevo aquí causaría un loop infinito de re-render en zustand.
function ventanaResuelta(history: TelemetrySpin[], mkt: Market, ventana: number): boolean[] {
  const res: boolean[] = [];
  for (let i = history.length - 1; i >= 0 && res.length < ventana; i--) {
    const h = mkt === 'doc' ? history[i].docHit : history[i].colHit;
    if (h !== null && h !== undefined) res.push(h);
  }
  return res; // más reciente primero
}
export function useTermoHits(mkt: Market, ventana = 10): number {
  return useTelemetryStore((s) => ventanaResuelta(s.history, mkt, ventana).filter((x) => x).length);
}
export function useTermoTotal(mkt: Market, ventana = 10): number {
  return useTelemetryStore((s) => ventanaResuelta(s.history, mkt, ventana).length);
}
export function useTermoStreak(mkt: Market, ventana = 10): number {
  return useTelemetryStore((s) => {
    const res = ventanaResuelta(s.history, mkt, ventana);
    let n = 0;
    for (const r of res) { if (!r) n++; else break; }
    return n;
  });
}

if (typeof window !== 'undefined') {
  (window as any).__telemetry = useTelemetryStore;
}
