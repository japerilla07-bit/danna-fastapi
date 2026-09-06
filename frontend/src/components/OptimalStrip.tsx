// OptimalStrip — Indicador de condición operacional.
// Port 1:1 de app.py:
//   - _compute_operational_condition (L7817-7926)
//   - _render_operational_condition  (L7929-7999)
//
// Lógica:
//   - cond = mesa × 0.40 + entropy × 0.25 + consec × 0.25 + wheel × 0.10
//   - entropy_norm sale de decision.chaos (ver FIX abajo)
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
  chaosIndex: any = null,
): OperationalData {
  try {
    const decision = (payload && typeof payload === 'object' && payload.decision) || {};

    // Mesa (40%)
    const ms = (decision.mesa_score && typeof decision.mesa_score === 'object')
      ? decision.mesa_score
      : {};
    const score10 = numFrom(ms, 'score10', 5);
    const mesa_norm = score10 / 10.0;

    // Entropía (25%) — el chip ORDEN.
    //
    // FUENTE PRIMARIA: data.chaos_index, que state_routes calcula directamente
    // con engine.compute_chaos_index() sobre los spins de sesion. Es la unica
    // ruta verificada de punta a punta (es la que alimenta el ChaosPanel, y ese
    // si muestra numeros reales). ORDEN = percentil de concentracion del paño.
    //
    // FUENTE SECUNDARIA: decision.chaos (el motor lo exporta con esa clave en
    // engine.py ~6829, NO como "chaos_info" — ese era el bug que tenian los 7
    // lectores). Se conserva como respaldo, pero depende de que el bloque de
    // caos del motor se ejecute (esta gateado por chaos_enabled), asi que no
    // es fiable como unica fuente.
    //
    // Si ninguna esta disponible -> 0.5 neutro, que es lo que hacia que este
    // chip llevara congelado en 50 permanentemente.
    const _chaos_raw = (decision as any).chaos ?? (decision as any).chaos_info;
    const chaos_info = (_chaos_raw && typeof _chaos_raw === 'object') ? _chaos_raw : {};

    const _panoPct = (chaosIndex && chaosIndex.pano && chaosIndex.pano.pct != null)
      ? Number(chaosIndex.pano.pct)
      : null;

    let entropy_score: number;
    if (_panoPct != null && isFinite(_panoPct)) {
      entropy_score = clamp01(_panoPct / 100.0);          // primaria
    } else {
      entropy_score = 1.0 - clamp01(numFrom(chaos_info, 'entropy_norm', 0.5));
    }
    const chaos_active_raw = !!chaos_info.active;

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

// ── TEMAS GEASS / SHIKON PARA INYECCIÓN VISUAL DIRECTA ──
const STRIP_THEME = {
  optimal: { base: '#00ff9d', glow: 'rgba(0,255,157,0.7)', dim: 'rgba(0,255,157,0.12)' },
  caution: { base: '#ffdf60', glow: 'rgba(255,223,96,0.6)', dim: 'rgba(255,223,96,0.12)' },
  abort:   { base: '#ff1e38', glow: 'rgba(255,30,56,0.7)', dim: 'rgba(255,30,56,0.15)' },
};

const PILLAR_THEME = {
  good: { color: '#00ff9d', bg: 'rgba(0,255,157,0.12)' },
  mid:  { color: '#ffdf60', bg: 'rgba(255,223,96,0.15)' },
  bad:  { color: '#ff1e38', bg: 'rgba(255,30,56,0.18)' },
};

// Color de pillar — port de _pill en app.py L7964-7967
function pillarCls(val: number, goodThr: number = 0.60): 'good' | 'mid' | 'bad' {
  if (val >= goodThr) return 'good';
  if (val >= 0.40)   return 'mid';
  return 'bad';
}

// ── Componente ────────────────────────────────────────────────────

interface Props {
  payload: EnginePayload | null;
  pilotConsec?: number;       // pilot_consec_errors del state
  wheelTopScore?: number;     // top wheel score (default 0.25 → wheel_score=0)
  chaosIndex?: any;           // data.chaos_index — fuente primaria de ORDEN
}

export function OptimalStrip({
  payload,
  pilotConsec = 0,
  wheelTopScore = 0.25,
  chaosIndex = null,
}: Props) {
  const data = computeOperationalCondition(payload, pilotConsec, wheelTopScore, chaosIndex);
  const { state, cond, chaos_active, consec, mesa_norm, entropy_score, consec_score, wheel_score } = data;

  const meta = LABELS[state];
  const theme = STRIP_THEME[state];
  let subContent: React.ReactNode = meta.sub;

  // Override de texto (app.py L7977-7980) con estilos inyectados
  if (chaos_active) {
    subContent = (
      <>
        <span className="strip-danger" style={{ color: '#ff1e38', fontWeight: 800, textShadow: '0 0 10px rgba(255,30,56,0.7)', letterSpacing: '0.05em' }}>⚠ CAOS DETECTADO</span>
        {' '}— suspender ejecución ({consec} consecutivos)
      </>
    );
  } else if (consec >= 4) {
    subContent = (
      <>
        <span className="strip-warn" style={{ color: '#ffdf60', fontWeight: 800, textShadow: '0 0 10px rgba(255,223,96,0.6)', letterSpacing: '0.05em' }}>⚠ {consec} errores consecutivos</span>
        {' '}— reducir exposición urgente
      </>
    );
  } else if (state === 'caution') {
    // Texto split para resaltar "reducir stake a la mitad" en amber
    subContent = (
      <>
        Ruido moderado — <span className="strip-warn" style={{ color: '#ffdf60', fontWeight: 700, textShadow: '0 0 8px rgba(255,223,96,0.5)' }}>reducir stake a la mitad</span>
      </>
    );
  }

  const condDisplay = chaos_active ? '--' : Math.round(cond * 100);
  const condLabel = chaos_active ? 'CAOS' : 'COND';

  return (
    <div className={`strip strip-${state}`} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
      padding: '10px 14px', marginBottom: '8px',
      background: `linear-gradient(90deg, ${theme.dim} 0%, rgba(3,4,8,0.95) 40%, rgba(3,4,8,0.98) 100%)`,
      border: `1px solid ${theme.base}60`,
      boxShadow: `0 8px 24px rgba(0,0,0,0.6), inset 0 0 25px ${theme.dim}, inset 3px 0 0 ${theme.base}`,
      clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      backdropFilter: 'blur(12px)'
    }}>
      <div className="strip-state" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '130px' }}>
        {/* NÚCLEO ROMBOIDAL PULSANTE */}
        <div className="strip-dot" style={{
          width: '12px', height: '12px',
          background: theme.base,
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          boxShadow: `0 0 15px ${theme.base}, 0 0 5px ${theme.base}`,
          animation: state === 'abort' ? 'pulse-fast 1s infinite' : 'none'
        }} />
        <div className="strip-label" style={{ 
          fontFamily: "'Rajdhani', sans-serif", fontSize: '20px', fontWeight: 900, 
          color: theme.base, letterSpacing: '0.15em', textShadow: `0 0 12px ${theme.glow}` 
        }}>
          {meta.label}
        </div>
      </div>

      <div className="strip-sub" style={{ 
        flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: '10.5px', 
        color: '#cbd5e1', lineHeight: 1.3 
      }}>
        {subContent}
      </div>

      <div className="strip-pillars" style={{ display: 'flex', gap: '6px' }}>
        <Pillar name="MESA"  val={mesa_norm}     thr={0.60} />
        <Pillar name="ORDEN" val={entropy_score} thr={0.55} />
        <Pillar name="RACHA" val={consec_score}  thr={0.57} />
        <Pillar name="WHEEL" val={wheel_score}   thr={0.50} />
      </div>

      <div className="strip-score" style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '6px 12px', minWidth: '70px',
        background: 'rgba(0,0,0,0.6)', borderLeft: `1px solid ${theme.base}40`,
        boxShadow: `inset 0 0 15px ${theme.dim}`
      }}>
        <div className="strip-score-num" style={{ 
          fontFamily: "'Rajdhani', sans-serif", fontSize: '28px', fontWeight: 900, lineHeight: 1,
          color: theme.base, textShadow: `0 0 16px ${theme.glow}, 0 0 4px ${theme.base}` 
        }}>
          {condDisplay}
        </div>
        <div className="strip-score-k" style={{ 
          fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 700, 
          color: theme.base, letterSpacing: '0.2em', opacity: 0.8, marginTop: '2px' 
        }}>
          {condLabel}
        </div>
      </div>
    </div>
  );
}

function Pillar({ name, val, thr }: { name: string; val: number; thr: number }) {
  const cls = pillarCls(val, thr);
  const pct = Math.round(val * 100);
  const pTheme = PILLAR_THEME[cls];
  
  return (
    <div className={`pillar pillar-${cls}`} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4px 6px', minWidth: '48px',
      background: 'rgba(2,4,8,0.7)',
      borderBottom: `2px solid ${pTheme.color}`,
      boxShadow: `inset 0 0 15px ${pTheme.bg}`,
      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)'
    }}>
      <span className="pillar-k" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: '#64748b', letterSpacing: '0.15em', fontWeight: 700 }}>{name}</span>
      <span className="pillar-v" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 800, color: pTheme.color, textShadow: `0 0 10px ${pTheme.color}80`, marginTop: '1px' }}>{pct}%</span>
    </div>
  );
}
