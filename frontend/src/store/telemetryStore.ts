// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Store de telemetría (v3.1: contadores + racha de errores)
// ════════════════════════════════════════════════════════════════════════
//
// Cambios v3:
//   • Rachas contiguas → REEMPLAZADAS por contadores acumulados por
//     mercado (hits, misses). No dependen de que los giros lleguen sin
//     nulls entre medio. Fácil de leer, coincide con lo que ves en mesa.
//   • Selectores por primitivas → cero loops de re-render.
//   • Ingesta idempotente por firma.
// Cambios v3.1:
//   • Racha de errores SEGUIDOS por mercado (actual) + su MÁXIMO de sesión.
//     Regla: acierto → racha = 0; error → racha += 1 (y actualiza máx);
//     null (ese mercado no se evaluó) → NO toca la racha.
//
// Regla del motor: apuesta siempre (BET forzado). El semáforo del
// ZoneChip es solo lectura visual — no bloquea al motor.
// ════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { classifyZone, type Zone, type Market } from '@/domain/zoneMatrix';

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

interface Counters {
  docHits: number;
  docMisses: number;
  colHits: number;
  colMisses: number;
  // Racha de errores SEGUIDOS (actual) + máximo de sesión, por mercado
  docStreak: number;
  docMaxStreak: number;
  colStreak: number;
  colMaxStreak: number;
}

const EMPTY_COUNTERS: Counters = {
  docHits: 0, docMisses: 0, colHits: 0, colMisses: 0,
  docStreak: 0, docMaxStreak: 0, colStreak: 0, colMaxStreak: 0,
};

interface TelemetryState {
  history: TelemetrySpin[];
  lastN: number;
  lastSig: string;
  counters: Counters;
  ingest: (p: IngestPayload) => void;
  reset: () => void;
}

export const HISTORY_CAP = 300;

const sig = (p: IngestPayload) =>
  `${p.n}|${p.hud ?? 'x'}|${p.ent ?? 'x'}|${p.docHit ?? 'x'}|${p.colHit ?? 'x'}`;

// ────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  history: [],
  lastN: -1,
  lastSig: '',
  counters: { ...EMPTY_COUNTERS },

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

    // ── Contadores acumulados + racha de errores seguidos ──
    const c = { ...st.counters };

    if (p.docHit === true) {
      c.docHits += 1;
      c.docStreak = 0;                       // acierto corta la racha
    } else if (p.docHit === false) {
      c.docMisses += 1;
      c.docStreak += 1;                      // error suma a la racha
      if (c.docStreak > c.docMaxStreak) c.docMaxStreak = c.docStreak;
    }
    // p.docHit === null → mercado no evaluado: la racha NO se toca.

    if (p.colHit === true) {
      c.colHits += 1;
      c.colStreak = 0;
    } else if (p.colHit === false) {
      c.colMisses += 1;
      c.colStreak += 1;
      if (c.colStreak > c.colMaxStreak) c.colMaxStreak = c.colStreak;
    }

    set({ history: next, lastN: p.n, lastSig: s, counters: c });
  },

  reset: () =>
    set({
      history: [],
      lastN: -1,
      lastSig: '',
      counters: { ...EMPTY_COUNTERS },
    }),
}));

// ════════════════════════════════════════════════════════════════════════
// SELECTORES por primitivas o arrays cacheados
// ════════════════════════════════════════════════════════════════════════

export const useLastHud = (): number | null =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    return l ? l.hud : null;
  });

export const useLastEnt = (): number | null =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    return l ? l.ent : null;
  });

export const useCurrentDelta = (metric: 'hud' | 'ent'): number | null =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    if (!l) return null;
    return metric === 'hud' ? l.dHud : l.dEnt;
  });

export const useCurrentZone = (mkt: Market): Zone =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    if (!l) return 'NEUTRA';
    return classifyZone(l.hud, l.ent, mkt);
  });

// ── Contadores acumulados (reemplaza rachas contiguas) ──────────────

export const useMarketHits = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docHits : s.counters.colHits);

export const useMarketMisses = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docMisses : s.counters.colMisses);

export const useMarketWr = (mkt: Market): number | null =>
  useTelemetryStore((s) => {
    const h = mkt === 'doc' ? s.counters.docHits : s.counters.colHits;
    const m = mkt === 'doc' ? s.counters.docMisses : s.counters.colMisses;
    const t = h + m;
    return t > 0 ? (h / t) * 100 : null;
  });

// ── Racha de errores seguidos: actual + máximo de sesión ────────────

export const useMarketStreak = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docStreak : s.counters.colStreak);

export const useMarketMaxStreak = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docMaxStreak : s.counters.colMaxStreak);

// ── Acciones ─────────────────────────────────────────────────────────

export const useIngestSpin = () => useTelemetryStore((s) => s.ingest);
export const useResetTelemetry = () => useTelemetryStore((s) => s.reset);

// ── DEBUG · exposición en window (solo dev) ──────────────────────────
if (typeof window !== 'undefined') {
  (window as any).__telemetry = useTelemetryStore;
}
