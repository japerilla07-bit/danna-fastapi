// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Store de telemetría del Quantum Pilot V2
// ════════════════════════════════════════════════════════════════════════
//
// Client-state dedicado al semáforo bifurcado + drawdown tracker + puntos
// del radar cartesiano. NO gestiona server-state (eso vive en useGameState
// / TanStack Query). Este store guarda solo lo derivado y agregado que
// alimenta la UI del Quantum V2.
//
// Diseño:
//   • Los updates son push-por-giro: al detectar un giro nuevo (spinsCount
//     ↑), el AppPage llama a `ingestSpin({...})` una única vez.
//   • Los componentes se suscriben con selectores granulares — así el
//     semáforo se re-renderiza cuando cambia hud/ent, el drawdown solo
//     cuando cambia su racha, y el radar solo cuando llega un giro nuevo.
//   • Toda derivación (zona, racha, sparkline) es pura y testeable.
//
// Referencias del sistema (matriz validada en 4.036 giros de auditoría):
//   Ver frontend/src/domain/zoneMatrix.ts para la matriz canónica.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { classifyZone, type Zone, type Market } from '@/domain/zoneMatrix';

// ────────────────────────────────────────────────────────────────────────
// Tipos de dominio
// ────────────────────────────────────────────────────────────────────────

/**
 * Un giro registrado en la telemetría. Se guarda lo mínimo indispensable
 * para el radar (hud, ent) y el drawdown (resultados por mercado).
 */
export interface TelemetrySpin {
  /** Índice de giro dentro de la sesión (viene de `sequence.count`). */
  n: number;
  hud: number | null;
  ent: number | null;
  /** Delta contra el giro anterior; null en el primero. */
  dHud: number | null;
  dEnt: number | null;
  /** Resultado del motor por mercado; null si no aplicó. */
  docHit: boolean | null;
  colHit: boolean | null;
  /** Timestamp de ingesta local (ms). */
  ts: number;
}

/** Payload que llega desde AppPage por giro. */
export interface IngestPayload {
  n: number;
  hud: number | null;
  ent: number | null;
  docHit: boolean | null;
  colHit: boolean | null;
}

// ────────────────────────────────────────────────────────────────────────
// Estado del store
// ────────────────────────────────────────────────────────────────────────

interface TelemetryState {
  /** Historial rodante — se limita a HISTORY_CAP giros. */
  history: TelemetrySpin[];
  /** Último giro procesado, para deduplicar. */
  lastN: number;

  // ── acciones ──
  /** Registra un giro (idempotente por n). */
  ingest: (p: IngestPayload) => void;
  /** Limpia todo (cambio de sesión, reset manual). */
  reset: () => void;
}

/**
 * Máximo de giros a retener en memoria. 300 = suficiente para 4 sesiones
 * consecutivas típicas (~70 giros c/u) sin explotar el heap ni ralentizar
 * los selectores derivados.
 */
export const HISTORY_CAP = 300;

// ────────────────────────────────────────────────────────────────────────
// Implementación del store
// ────────────────────────────────────────────────────────────────────────

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  history: [],
  lastN: -1,

  ingest: (p) => {
    // Idempotencia estricta: si ya vimos este n, no hacemos nada.
    // Evita duplicados por re-renders del AppPage.
    if (p.n === get().lastN) return;

    const prev = get().history[get().history.length - 1];
    const dHud = prev && p.hud !== null && prev.hud !== null ? p.hud - prev.hud : null;
    const dEnt = prev && p.ent !== null && prev.ent !== null ? p.ent - prev.ent : null;

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

    set((s) => {
      const next = s.history.length >= HISTORY_CAP
        ? [...s.history.slice(1), spin]
        : [...s.history, spin];
      return { history: next, lastN: p.n };
    });
  },

  reset: () => set({ history: [], lastN: -1 }),
}));

// ════════════════════════════════════════════════════════════════════════
// SELECTORES DERIVADOS
// ════════════════════════════════════════════════════════════════════════
// Cada selector es un hook independiente. Los componentes se suscriben
// SOLO al selector que necesitan → un cambio en el historial únicamente
// re-renderiza a quien depende de esa vista derivada.
// ════════════════════════════════════════════════════════════════════════

/** Último giro registrado, o null si el historial está vacío. */
export const useLastSpin = (): TelemetrySpin | null =>
  useTelemetryStore((s) => s.history[s.history.length - 1] ?? null);

/**
 * Zona actual para un mercado (VERDE/PROBE/TOXICA). Recalcula solo cuando
 * cambia el último giro. Puro derivado, sin memoización manual.
 */
export const useCurrentZone = (mkt: Market): Zone =>
  useTelemetryStore((s) => {
    const last = s.history[s.history.length - 1];
    if (!last) return 'TOXICA';
    return classifyZone(last.hud, last.ent, mkt);
  });

/**
 * Racha de errores contigua ACTUAL para un mercado. Corta al primer
 * acierto o al primer null (giro sin resultado).
 */
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

/**
 * Últimos N giros con coordenadas válidas — insumo del radar cartesiano.
 * Devuelve una tupla estable por longitud para que useShallow evite re-renders.
 */
export const useRadarTrail = (n = 5) =>
  useTelemetryStore(
    useShallow((s) => {
      const trail: Array<{ hud: number; ent: number }> = [];
      for (let i = s.history.length - 1; i >= 0 && trail.length < n; i--) {
        const g = s.history[i];
        if (g.hud !== null && g.ent !== null) trail.push({ hud: g.hud, ent: g.ent });
      }
      return trail.reverse();
    })
  );

/**
 * Sparkline de HUD o Entropía — últimos N valores para el gráfico top.
 * Devuelve solo los números, no los objetos completos.
 */
export const useSparkline = (metric: 'hud' | 'ent', n = 30): number[] =>
  useTelemetryStore(
    useShallow((s) => {
      const arr: number[] = [];
      for (let i = Math.max(0, s.history.length - n); i < s.history.length; i++) {
        const v = s.history[i][metric];
        if (v !== null) arr.push(v);
      }
      return arr;
    })
  );

/**
 * Delta actual (Δ contra el giro anterior) — para mostrar arriba de HUD/ENT.
 */
export const useCurrentDelta = (metric: 'hud' | 'ent'): number | null =>
  useTelemetryStore((s) => {
    const last = s.history[s.history.length - 1];
    if (!last) return null;
    return metric === 'hud' ? last.dHud : last.dEnt;
  });

/**
 * Acción de ingesta — el AppPage la llama en su efecto de spinsCount.
 */
export const useIngestSpin = () => useTelemetryStore((s) => s.ingest);

/**
 * Acción de reset — para cuando cambia de sesión (opcional, futuro).
 */
export const useResetTelemetry = () => useTelemetryStore((s) => s.reset);
