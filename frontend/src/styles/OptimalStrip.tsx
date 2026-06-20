// OptimalStrip — Indicador de condición operacional.
// Port 1:1 de app.py:
//   - _compute_operational_condition (L7817-7926)
//   - _render_operational_condition  (L7929-7999)
//
// Lógica:
//   - cond = mesa × 0.40 + entropy × 0.25 + consec × 0.25 + wheel × 0.10
//   - state: cond ≥ 0.65 → OPTIMAL, ≥ 0.40 → CAUTION, < 0.40 → ABORT
//   - Override: chaos_active OR consec ≥ 6 → ABORT
//   - Override texto: consec ≥ 4 → warning
//
// Visual: port del mockup aprobado (glass + barra lateral + dot pulsante).

import type { EnginePayload } from '@/types/api';

// ── Helpers ───────────────────────────────────────────────────────

function clamp01(v: number): number {
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function numFrom(obj: any, key: string, fallback: number): number {
  if (!obj || typeof obj !== 'object') return fallback;
  const v = obj[key];
  if (v == null) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? n : fallback;
}

// ── Cálculo (port verbatim de _compute_operational_condition) ─────

interface OperationalData {
  state: 'optimal' | 'caution' | 'abort';
  cond: number;
  chaos_active: boolean;
  consec: number;
  mesa_norm: number;
  entropy_score: number;
  consec_score: number;
  wheel_score: number;
}

function computeOperationalCondition(
  payload: EnginePayload | null,
  pilotConsec: number = 0,
  wheelTopScore: number = 0.25,
): OperationalData {
  try {
    const decision = (payload && typeof payload === 'object' && payload.decision) || {};

    // Mesa (40%)
    const ms = (decision.mesa_score && typeof decision.mesa_score === 'object')
      ? decision.mesa_score
      : {};
    const score10 = numFrom(ms, 'score10', 5);
    const mesa_norm = score10 / 10.0;

    // Entropía (25%)
    const chaos_info = (decision.chaos_info && typeof decision.chaos_info === 'object')
      ? decision.chaos_info
      : {};
    const entropy_norm = numFrom(chaos_info, 'entropy_norm', 0.5);
    const chaos_active_raw = !!chaos_info.active;
    const entropy_score = 1.0 - clamp01(entropy_norm);

    // Consecutivos (25%) — usar pilotConsec (no consec_losses del guardián legacy)
    const consec = Math.max(0, Math.floor(pilotConsec));
    const consec_ratio = clamp01(consec / 7.0);
    const consec_score = 1.0 - consec_ratio;

    // Override chaos: si Pilot consec < 4, ignorar chaos del engine
    const chaos_active = chaos_active_raw && consec >= 4;

    // Wheel (10%)
    const wheel_score = clamp01((wheelTopScore - 0.25) / 0.35);

    // COND final
    let cond = mesa_norm * 0.40 + entropy_score * 0.25 + consec_score * 0.25 + wheel_score * 0.10;
    cond = clamp01(cond);

    // Clasificación
    let state: 'optimal' | 'caution' | 'abort';
    if (chaos_active || consec >= 6) {
      state = 'abort';
    } else if (cond >= 0.65) {
      state = 'optimal';
    } else if (cond >= 0.40) {
      state = 'caution';
    } else {
      state = 'abort';
    }

    return {
      state, cond, chaos_active, consec,
      mesa_norm, entropy_score, consec_score, wheel_score,
    };
  } catch {
    // Fallback conservador
    return {
      state: 'caution', cond: 0.40,
      chaos_active: false, consec: 0,
      mesa_norm: 0.5, entropy_score: 0.5,
      consec_score: 1.0, wheel_score: 0.0,
    };
  }
}

// ── Helpers de presentación ───────────────────────────────────────

const LABELS = {
  optimal: { label: 'OPTIMAL', sub: 'Condiciones favorables — operar con stake normal' },
  caution: { label: 'CAUTION', sub: 'Ruido moderado — reducir stake a la mitad' },
  abort:   { label: 'ABORT',   sub: 'No entrar — esperar estabilización de la mesa' },
} as const;

// Color de pillar — port de _pill en app.py L7964-7967
function pillarCls(val: number, goodThr: number = 0.60): 'good' | 'mid' | 'bad' {
  if (val >= goodThr) return 'good';
  if (val >= 0.40)   return 'mid';
  return 'bad';
}

// ── Componente ────────────────────────────────────────────────────

interface Props {
  payload: EnginePayload | null;
  pilotConsec?: number;
  wheelTopScore?: number;
  hudComputed?: { state: string; cond: number } | null;  // del backend (fuente de verdad)
}

export function OptimalStrip({ payload, pilotConsec = 0, wheelTopScore = 0.25, hudComputed = null }: Props) {
  // Si el backend ya calculó el estado (fuente de verdad), usarlo directamente.
  // Esto garantiza que HUD y GOD BET usen exactamente el mismo cálculo.
  const data = (() => {
    if (hudComputed && hudComputed.state) {
      const s = hudComputed.state as 'optimal' | 'caution' | 'abort';
      const computed = computeOperationalCondition(payload, pilotConsec, wheelTopScore);
      return { ...computed, state: s, cond: hudComputed.cond ?? computed.cond };
    }
    return computeOperationalCondition(payload, pilotConsec, wheelTopScore);
  })();
  const { state, cond, chaos_active, consec, mesa_norm, entropy_score, consec_score, wheel_score } = data;

  const meta = LABELS[state];
  let subContent: React.ReactNode = meta.sub;

  // Override de texto (app.py L7977-7980)
  if (chaos_active) {
    subContent = (
      <>
        <span className="strip-danger">⚠ CAOS DETECTADO</span>
        {' '}— suspender ejecución ({consec} consecutivos)
      </>
    );
  } else if (consec >= 4) {
    subContent = (
      <>
        <span className="strip-warn">⚠ {consec} errores consecutivos</span>
        {' '}— reducir exposición urgente
      </>
    );
  } else if (state === 'caution') {
    // Texto split para resaltar "reducir stake a la mitad" en amber
    subContent = (
      <>
        Ruido moderado — <span className="strip-warn">reducir stake a la mitad</span>
      </>
    );
  }

  const condDisplay = chaos_active ? '--' : Math.round(cond * 100);
  const condLabel = chaos_active ? 'CAOS' : 'COND';

  return (
    <div className={`strip strip-${state}`}>
      <div className="strip-state">
        <div className="strip-dot" />
        <div className="strip-label">{meta.label}</div>
      </div>

      <div className="strip-sub">{subContent}</div>

      <div className="strip-pillars">
        <Pillar name="MESA"  val={mesa_norm}     thr={0.60} />
        <Pillar name="ORDEN" val={entropy_score} thr={0.55} />
        <Pillar name="RACHA" val={consec_score}  thr={0.57} />
        <Pillar name="WHEEL" val={wheel_score}   thr={0.50} />
      </div>

      <div className="strip-score">
        <div className="strip-score-num">{condDisplay}</div>
        <div className="strip-score-k">{condLabel}</div>
      </div>
    </div>
  );
}

function Pillar({ name, val, thr }: { name: string; val: number; thr: number }) {
  const cls = pillarCls(val, thr);
  const pct = Math.round(val * 100);
  return (
    <div className={`pillar pillar-${cls}`}>
      <span className="pillar-k">{name}</span>
      <span className="pillar-v">{pct}%</span>
    </div>
  );
}
