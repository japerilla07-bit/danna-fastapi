// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Quantum Pilot V2 · Tipos compartidos
// ════════════════════════════════════════════════════════════════════════
//
// Tipos de dominio del Quantum V2. Se extraen aquí para que cada
// sub-componente (Header, TelemetryPanel, RadarCanvas, DecisionCards)
// consuma solo lo que necesita.
// ════════════════════════════════════════════════════════════════════════

import type { EnginePayload } from '@/types/api';

// ────────────────────────────────────────────────────────────────────────
// Categoría del motor
// ────────────────────────────────────────────────────────────────────────

export const GOD_CATS = ['color', 'paridad', 'rango', 'docenas', 'columnas'] as const;
export type GodCat = typeof GOD_CATS[number];

export const CAT_LABEL: Record<string, string> = {
  color:    'COL',
  paridad:  'PAR',
  rango:    'RNG',
  docenas:  'DOC',
  columnas: 'CLM',
  max_conf: 'NUM',
};

// ────────────────────────────────────────────────────────────────────────
// Datos del motor (paralelos al legacy, no rompen compatibilidad)
// ────────────────────────────────────────────────────────────────────────

export interface ActiveBet {
  bet_key: string;
  pick_pretty: string;
  conf_pct: number;
  p_raw?: number;
}

export interface GodStats {
  wins: number;
  losses: number;
  avg_errors: number;
  consec_errors: number;
  max_consec_errors: number;
}

export interface GodTarget {
  wins: number;
  losses: number;
  consec_errors: number;
  max_consec_errors: number;
}

export interface GodBetData {
  active: boolean;
  cond_state: string;
  radar_score: number;
  counters_god: Record<string, any>;
  god_target?: GodTarget;
  active_bets: ActiveBet[];
  best_p_raw?: number;
  best_p_key?: string;
  best_p1?: number;
  best_p2?: number;
  best_g1?: string;
  best_g2?: string;
  god_stats?: GodStats;
  last_verdict?: {
    verdict: 'GO' | 'WAIT' | 'STAND_DOWN';
    ccs_pct: number;
    override_forced_go?: boolean;
    pick_bet: {
      bet_key: string;
      label: string;
      pick: any;
      pick_pretty: string;
      score_pct: number;
      stake_per_line: number;
      stake_total: number;
      level: number;
      level_authorized: boolean;
      session_hr: number;
      session_n: number;
      edge: number;
    } | null;
    session_stats: {
      bets_hits: number;
      bets_misses: number;
      profit_session: number;
      pilot_consec_errors: number;
      pilot_max_consec_errors: number;
    };
  };
}

export interface CounterEntry {
  wins: number;
  losses: number;
  streak?: number;
  max_streak?: number;
  consec_errors: number;
  max_consec_errors: number;
}

export interface Bankroll {
  current: number;
  initial: number;
  pnl: number;
  pnl_pct: number;
  stake_base?: number;
}

export interface OverrideState {
  bet_key: string;
  pick: any;
}

// ────────────────────────────────────────────────────────────────────────
// Props del contenedor Quantum V2
// ────────────────────────────────────────────────────────────────────────

export interface QuantumV2Props {
  godBet: GodBetData;
  payload: EnginePayload | null;
  bankroll: Bankroll;
  counters: Record<string, CounterEntry>;
  spinsCount: number;
  /** HUD del giro actual — de PilotDelta legacy o del engine payload. */
  hud: number | null;
  /** Entropía del giro actual. */
  entropy: number | null;
  /** Último resultado por mercado, para alimentar el store. */
  docHit: boolean | null;
  colHit: boolean | null;
}

// Re-export para conveniencia
export type { EnginePayload };
