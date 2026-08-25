// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Store de telemetría del Quantum Pilot V2 (v2.1: sin loops)
// ════════════════════════════════════════════════════════════════════════
//
// Cambios v2.1 (fix Maximum update depth exceeded / React #185):
//   • Selectores por PRIMITIVAS (números, strings, bool) — nunca objetos
//     ni arrays nuevos por render. Esto rompe el ciclo:
//         re-render → useEffect → ingest → re-render.
//   • Arrays derivados (trail, sparkline) cacheados por firma (lastN + len)
//     → devuelven la MISMA referencia mientras los datos no cambian.
//   • ingest idempotente por firma completa — si nada cambió, no muta.
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

interface TelemetryState {
  history: TelemetrySpin[];
  lastN: number;
  lastSig: string;
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

  ingest: (p) => {
    const s = sig(p);
    const st = get();

    // Dedupe fuerte: misma firma → no muto NADA (no dispara re-renders).
    if (s === st.lastSig) return;

    // n retrocedió o repite con historial: sólo actualizamos firma.
    if (p.n <= st.lastN && st.history.length > 0) {
      set({ lastSig: s });
      return;
    }

    const prev = st.history[st.history.length - 1];
    const dHud =
      prev && p.hud !== null && prev.hud !== null ? p.hud - prev.hud : null;
    const dEnt =
      prev && p.ent !== null && prev.ent !== null ? p.ent - prev.ent : null;

    const spin: TelemetrySpin = {
      n: p.n,
      hud: p.hud,
      ent: p.ent,
      dHud,
      dEnt,
      docHit: p.docHit,
      colHit: p.colHit,
      ts: Date.now(),
    };

    const next =
      st.history.length >= HISTORY_CAP
        ? [...st.history.slice(1), spin]
        : [...st.history, spin];

    set({ history: next, lastN: p.n, lastSig: s });
  },

  reset: () => set({ history: [], lastN: -1, lastSig: '' }),
}));

// ════════════════════════════════════════════════════════════════════════
// SELECTORES — devuelven PRIMITIVAS o arrays cacheados (misma ref)
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

export const useLastN = (): number =>
  useTelemetryStore((s) => s.lastN);

export const useCurrentDelta = (metric: 'hud' | 'ent'): number | null =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    if (!l) return null;
    return metric === 'hud' ? l.dHud : l.dEnt;
  });

export const useCurrentZone = (mkt: Market): Zone =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    if (!l) return 'TOXICA';
    return classifyZone(l.hud, l.ent, mkt);
  });

export const useCurrentStreak = (mkt: Market): number =>
  useTelemetryStore((s) => {
    let n = 0;
    for (let i = s.history.length - 1; i >= 0; i--) {
      const r = mkt === 'doc' ? s.history[i].docHit : s.history[i].colHit;
      if (r === null) continue;
      if (r === false) n++;
      else break;
    }
    return n;
  });

// ── Arrays derivados con caché por (lastN + length) ──────────────────

let _trailCache: { key: string; data: Array<{ hud: number; ent: number }> } = {
  key: '',
  data: [],
};

export const useRadarTrail = (n = 5): Array<{ hud: number; ent: number }> =>
  useTelemetryStore((s) => {
    const key = `${s.lastN}:${s.history.length}:${n}`;
    if (_trailCache.key === key) return _trailCache.data;
    const trail: Array<{ hud: number; ent: number }> = [];
    for (let i = s.history.length - 1; i >= 0 && trail.length < n; i--) {
      const g = s.history[i];
      if (g.hud !== null && g.ent !== null) trail.push({ hud: g.hud, ent: g.ent });
    }
    trail.reverse();
    _trailCache = { key, data: trail };
    return trail;
  });

const _sparkCache: Record<string, { key: string; data: number[] }> = {
  hud: { key: '', data: [] },
  ent: { key: '', data: [] },
};

export const useSparkline = (metric: 'hud' | 'ent', n = 30): number[] =>
  useTelemetryStore((s) => {
    const key = `${s.lastN}:${s.history.length}:${n}`;
    const c = _sparkCache[metric];
    if (c.key === key) return c.data;
    const arr: number[] = [];
    const start = Math.max(0, s.history.length - n);
    for (let i = start; i < s.history.length; i++) {
      const v = s.history[i][metric];
      if (v !== null) arr.push(v);
    }
    _sparkCache[metric] = { key, data: arr };
    return arr;
  });

// ── Acciones ──────────────────────────────────────────────────────────

export const useIngestSpin = () => useTelemetryStore((s) => s.ingest);
export const useResetTelemetry = () => useTelemetryStore((s) => s.reset);

// ════════════════════════════════════════════════════════════════════════
// DEBUG · exposición en window (solo dev — inspección desde consola)
// ════════════════════════════════════════════════════════════════════════
// Uso en DevTools:
//   __telemetry.getState().history.slice(-5)   ← ver últimos 5 giros
//   __telemetry.getState().lastN               ← último n registrado
//   __telemetry.getState().reset()             ← limpiar historial
if (typeof window !== 'undefined') {
  (window as any).__telemetry = useTelemetryStore;
}
