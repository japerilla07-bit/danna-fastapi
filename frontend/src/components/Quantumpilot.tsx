// src/components/Quantumpilot.tsx
// QuantumPilot — Overlay flotante draggable.
// Replica la UI del deploy original (Streamlit) sobre React.
//
// Bloques:
//   1. Header verdict (EN ESPERA / GOD ACTIVO) + HUD + RADAR + CCS%
//   2. TARGET LOCK (top pick) — clickeable para marcar como apuesta del usuario
//   3. OTRAS SUGERENCIAS ACTIVAS — lista clickeable
//   4. SALDO + P&L  /  ERRORES (consec · max · err/hit)
//   5. SESIÓN GOD (hits/total + HR%)
//   6. EFICIENCIA POR CATEGORÍA (strip horizontal)
//
// Tracker de override:
//   - Click en TARGET LOCK o en cualquier sugerencia → POST /api/pilot/override
//   - GET /api/pilot/override al montar para sincronizar estado
//   - El backend cuenta wins/losses sobre la apuesta elegida por el usuario.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EnginePayload } from '@/types/api';

// ── Tipos ─────────────────────────────────────────────────────────

const GOD_CATS = ['color', 'paridad', 'rango', 'docenas', 'columnas'] as const;
type GodCat = typeof GOD_CATS[number];

const CAT_LABEL: Record<string, string> = {
  color:    'COLOR',
  paridad:  'PARIDAD',
  rango:    'RANGO',
  docenas:  'DOCENAS',
  columnas: 'COLUMNAS',
  max_conf: 'NÚMEROS',
};

const CAT_SHORT: Record<string, string> = {
  color:    'COL',
  paridad:  'PAR',
  rango:    'RNG',
  docenas:  'DOC',
  columnas: 'CLM',
  max_conf: 'NUM',
};

interface ActiveBet {
  bet_key: string;
  pick_pretty: string;
  conf_pct: number;
}

interface GodStats {
  wins: number;
  losses: number;
  avg_errors: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface GodBetData {
  active: boolean;
  cond_state: string;
  radar_score: number;
  counters_god: Record<string, any>;
  active_bets: ActiveBet[];
  // ★ god_stats viene DIRECTO de pilot.raw → siempre fresco post-record_outcome
  god_stats?: GodStats;
  last_verdict?: {
    verdict: 'GO' | 'WAIT' | 'STAND_DOWN';
    ccs_pct: number;
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

interface CounterEntry {
  wins: number;
  losses: number;
  streak?: number;
  max_streak?: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface Bankroll {
  current: number;
  initial: number;
  pnl: number;
  pnl_pct: number;
}

interface OverrideState {
  bet_key: string;
  pick: any;
}

interface Props {
  godBet: GodBetData;
  payload: EnginePayload | null;
  bankroll: Bankroll;
  counters: Record<string, CounterEntry>;
}

// ── Hook draggable ────────────────────────────────────────────────

function useDrag(initialPos: { x: number; y: number }) {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      dragStart.current = { x: clientX, y: clientY };
      posStart.current = { ...pos };
      e.stopPropagation();
    },
    [pos]
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      setPos({
        x: posStart.current.x + dx,
        y: posStart.current.y + dy,
      });
    };
    const onUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging]);

  return { pos, onMouseDown };
}

// ── Canvas de partículas ──────────────────────────────────────────

function ParticleCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const N = 40;
    const nodes = Array.from({ length: N }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
    }));

    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width;
      const H = canvas.height;
      const isAct = activeRef.current;
      const colorBase = isAct ? 'rgba(220, 38, 38' : 'rgba(100, 116, 139';

      for (let i = 0; i < N; i++) {
        nodes[i].x += nodes[i].vx;
        nodes[i].y += nodes[i].vy;
        if (nodes[i].x < 0 || nodes[i].x > W) nodes[i].vx *= -1;
        if (nodes[i].y < 0 || nodes[i].y > H) nodes[i].vy *= -1;

        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 60) {
            ctx.beginPath();
            ctx.strokeStyle = `${colorBase}, ${1 - dist / 60})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.fillStyle = `${colorBase}, 0.8)`;
        ctx.arc(nodes[i].x, nodes[i].y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-30 z-0"
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────

const fmtPctClass = (pct: number): string => {
  if (pct >= 70) return 'text-green-400';
  if (pct >= 50) return 'text-yellow-400';
  if (pct >= 30) return 'text-orange-400';
  return 'text-red-400';
};

// ── Componente principal ─────────────────────────────────────────

export function QuantumPilot({ godBet, counters }: Props) {
  const { pos, onMouseDown } = useDrag({ x: 20, y: 100 });
  const [minimized, setMinimized] = useState(false);
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const verdict = godBet.last_verdict;
  const pickBet = verdict?.pick_bet ?? null;
  const sessionStats = verdict?.session_stats ?? {
    bets_hits: 0,
    bets_misses: 0,
    profit_session: 0,
    pilot_consec_errors: 0,
    pilot_max_consec_errors: 0,
  };
  const isGo = verdict?.verdict === 'GO';
  const ccsPct = verdict?.ccs_pct ?? 0;
  const hudState = (godBet.cond_state || '').toUpperCase() || 'CALIBRANDO';
  const activeBets = godBet.active_bets || [];

  // ★ TARGET LOCK con prioridad de 3 fuentes:
  //   1. OVERRIDE del usuario — la sugerencia que el operador clickeó
  //      pasa a ser el TARGET inmediatamente (sin esperar al verdict del
  //      siguiente spin). Se busca en active_bets para tomar su conf_pct.
  //   2. PICK_BET del Pilot — comportamiento por defecto cuando el Pilot
  //      tiene una apuesta GO real.
  //   3. PRIMERA SUGERENCIA — si GOD está activo pero el Pilot no emite
  //      pick_bet (verdict ≠ GO, GOD-STRICT veto, etc.), usamos la
  //      primera sugerencia activa como fallback visual. El backend
  //      sigue contando hits/misses por categoría en counters_god, así
  //      que ERRORES y SESIÓN GOD se mueven igual sin disonancia.
  const topPick: ActiveBet | null = (() => {
    if (override?.bet_key) {
      const fromOverride = activeBets.find((b) => b.bet_key === override.bet_key);
      if (fromOverride) return fromOverride;
    }
    if (isGo && pickBet) {
      return {
        bet_key: pickBet.bet_key,
        pick_pretty: pickBet.pick_pretty,
        conf_pct: Math.round(pickBet.score_pct ?? 0),
      };
    }
    if (godBet.active && activeBets.length > 0) {
      return activeBets[0];
    }
    return null;
  })();

  // OTRAS SUGERENCIAS = active_bets del motor (excluyendo la del TARGET LOCK).
  // Estas son info ambient — pueden mostrarse aunque GOD no esté apostando.
  const otherBets = activeBets.filter(
    (b) => !topPick || b.bet_key !== topPick.bet_key
  );

  // ── Sincronizar override desde backend al montar y cuando cambie el verdict
  useEffect(() => {
    let cancelled = false;
    fetch('/api/pilot/override', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const ov = data?.override;
        if (ov && ov.bet_key) {
          setOverride({ bet_key: ov.bet_key, pick: ov.pick });
        } else {
          setOverride(null);
        }
      })
      .catch(() => {
        /* silencioso — si falla, queda en null */
      });
    return () => {
      cancelled = true;
    };
  }, [verdict?.pick_bet?.bet_key, godBet?.god_stats?.wins, godBet?.god_stats?.losses]);

  // ── Acciones de override ──────────────────────────────────────
  const applyOverride = useCallback(async (bet_key: string, pick: any) => {
    setLoadingKey(bet_key);
    // Update optimista
    setOverride({ bet_key, pick });
    try {
      const r = await fetch('/api/pilot/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bet_key, pick }),
      });
      if (!r.ok) {
        // revertir si falló
        setOverride(null);
      }
    } catch {
      setOverride(null);
    } finally {
      setLoadingKey(null);
    }
  }, []);

  const clearOverride = useCallback(async () => {
    setLoadingKey('__clear__');
    setOverride(null);
    try {
      await fetch('/api/pilot/override/clear', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      /* silencioso */
    } finally {
      setLoadingKey(null);
    }
  }, []);

  // ── Click handler para una sugerencia
  const handleBetClick = useCallback(
    (b: ActiveBet) => {
      if (override?.bet_key === b.bet_key) {
        // Click sobre la misma que ya está activa → la liberamos
        clearOverride();
      } else {
        // Picks crudos: para color/paridad pasa string, para docenas/columnas un id
        // El backend acepta `pick` libre — usamos pick_pretty como hint visible
        applyOverride(b.bet_key, b.pick_pretty);
      }
    },
    [override, applyOverride, clearOverride]
  );

  // ── Errores en VIVO desde counters_god ──────────────────────────────
  // ────────────────────────────────────────────────────────────────────
  // Estos contadores ÚNICAMENTE incluyen spins donde el sistema GOD estaba
  // ACTIVO (HUD=OPTIMAL + Radar≥7 + Entropy≥50 + CCS≥69 + Table Health≥50).
  // Cuando GOD no está activo, los valores quedan CONGELADOS — esto es
  // intencional: el panel ERRORES refleja únicamente la calidad de la
  // operación en modo GOD, no la actividad de todos los spins del motor.
  //
  // FUENTE DINÁMICA:
  //   • Si el operador eligió una sugerencia (override activo) → leemos
  //     `counters_god['god_<bet_key>']` de ESA categoría. Así CONSEC/MÁX/
  //     ERR/HIT reflejan los aciertos y errores de TU apuesta seleccionada.
  //   • Si NO hay override activo → leemos `counters_god['god_primary']`
  //     (la apuesta principal del motor, comportamiento por defecto).
  //
  // El backend mantiene un counter por cada categoría en god_{bet_key}
  // (god_color, god_paridad, god_rango, god_docenas, god_columnas,
  // god_max_conf, etc.) — esto NO requiere cambios en backend.
  // Counter ERRORES alineado con TARGET LOCK:
  // topPick ya tiene la logica de 3 fuentes (override -> pickBet -> activeBets[0]).
  // Antes este counter solo usaba override?.bet_key, lo que causaba que CONSEC/MAX
  // mostraran 0 cuando TARGET LOCK caia a fuente 2 o 3.
  // Counter GOD: sigue el pickBet del pilot cuando GOD esta activo.
  // Backend incrementa god_{pickBet.bet_key} en ese caso.
  // TARGET LOCK no afecta este counter.
  const errorCounterKey = (godBet.active && pickBet?.bet_key)
    ? `god_${pickBet.bet_key}`
    : 'god_primary';
  const godPrimary = (godBet?.counters_god ?? {})[errorCounterKey];
  const consecErr = godPrimary?.consec_errors ?? 0;
  const maxConsecErr = godPrimary?.max_consec_errors ?? 0;

  // Sesión GOD (hits acumulados solo en modo GOD activo)
  const godStats = godBet?.god_stats;
  const hits = godStats?.wins ?? sessionStats.bets_hits ?? 0;
  const misses = godStats?.losses ?? sessionStats.bets_misses ?? 0;
  const totalBets = hits + misses;
  const hitRate = totalBets > 0 ? (hits / totalBets) * 100 : 0;

  // ERR/HIT de la misma fuente dinámica (override.bet_key o primary)
  const godPrimaryWins = godPrimary?.wins ?? 0;
  const godPrimaryLosses = godPrimary?.losses ?? 0;
  const errHit = godPrimaryWins > 0
    ? godPrimaryLosses / godPrimaryWins
    : godPrimaryLosses;

  // ── Minimizado
  if (minimized) {
    return (
      <div
        className="fixed z-50 flex items-center justify-center rounded-full w-12 h-12 cursor-grab active:cursor-grabbing"
        style={{
          left: pos.x,
          top: pos.y,
          background:
            'linear-gradient(135deg, rgba(8, 12, 22, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          border: godBet.active
            ? '1px solid rgba(220, 38, 38, 0.6)'
            : '1px solid rgba(34, 211, 238, 0.4)',
          boxShadow: godBet.active
            ? '0 0 18px rgba(220, 38, 38, 0.5), inset 0 1px 0 rgba(248, 113, 113, 0.2)'
            : '0 0 18px rgba(34, 211, 238, 0.4), inset 0 1px 0 rgba(103, 232, 249, 0.2)',
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        onClick={() => setMinimized(false)}
      >
        <span
          className={`text-2xl ${godBet.active ? 'animate-pulse' : ''}`}
          style={{
            color: godBet.active ? '#f87171' : '#67e8f9',
            textShadow: godBet.active
              ? '0 0 10px rgba(248, 113, 113, 0.8)'
              : '0 0 10px rgba(103, 232, 249, 0.8)',
          }}
        >
          ⚡
        </span>
      </div>
    );
  }

  // ── Render principal
  return (
    <div
      className="fixed z-50 w-96 rounded-xl overflow-hidden font-mono text-gray-200 select-none flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        background:
          'linear-gradient(145deg, rgba(8, 12, 22, 0.95) 0%, rgba(15, 23, 42, 0.92) 50%, rgba(8, 12, 22, 0.95) 100%)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        border: godBet.active
          ? '1px solid rgba(220, 38, 38, 0.5)'
          : '1px solid rgba(34, 211, 238, 0.25)',
        boxShadow: godBet.active
          ? '0 0 0 1px rgba(220, 38, 38, 0.15) inset, 0 0 25px rgba(220, 38, 38, 0.35), 0 8px 32px rgba(0, 0, 0, 0.6)'
          : '0 0 0 1px rgba(34, 211, 238, 0.08) inset, 0 0 25px rgba(34, 211, 238, 0.18), 0 8px 32px rgba(0, 0, 0, 0.6)',
      }}
    >
      <ParticleCanvas active={godBet.active} />

      {/* ═══ Header ═══ */}
      <div
        className="relative z-10 flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        style={{
          background: godBet.active
            ? 'linear-gradient(90deg, rgba(127, 29, 29, 0.4) 0%, rgba(69, 10, 10, 0.2) 100%)'
            : 'linear-gradient(90deg, rgba(8, 47, 73, 0.4) 0%, rgba(15, 23, 42, 0.2) 100%)',
          borderBottom: godBet.active
            ? '1px solid rgba(220, 38, 38, 0.3)'
            : '1px solid rgba(34, 211, 238, 0.2)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`text-xl ${godBet.active ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}
            style={{
              textShadow: godBet.active
                ? '0 0 10px rgba(220, 38, 38, 0.8), 0 0 20px rgba(220, 38, 38, 0.4)'
                : '0 0 10px rgba(34, 211, 238, 0.8), 0 0 20px rgba(34, 211, 238, 0.4)',
            }}
          >
            ⚡
          </span>
          <span
            className="font-bold text-[13px]"
            style={{
              letterSpacing: '0.25em',
              color: godBet.active ? '#fca5a5' : '#67e8f9',
              textShadow: godBet.active
                ? '0 0 8px rgba(220, 38, 38, 0.5)'
                : '0 0 8px rgba(34, 211, 238, 0.4)',
            }}
          >
            QUANTUM PILOT
          </span>
        </div>
        <button
          onClick={() => setMinimized(true)}
          className="text-gray-500 hover:text-cyan-300 px-2 text-lg focus:outline-none transition-colors"
        >
          —
        </button>
      </div>

      {/* Scan-line decorativa */}
      <div
        className="relative z-10 h-px w-full"
        style={{
          background: godBet.active
            ? 'linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.6) 50%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.5) 50%, transparent 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col p-4 gap-3">
        {/* ═══ 1. Estado verdict ═══ */}
        <div className="flex items-stretch gap-2">
          <div
            className="flex-1 flex flex-col items-center justify-center py-2.5 rounded-md relative overflow-hidden"
            style={{
              background: godBet.active
                ? 'linear-gradient(135deg, rgba(127, 29, 29, 0.4) 0%, rgba(69, 10, 10, 0.5) 100%)'
                : 'linear-gradient(135deg, rgba(120, 53, 15, 0.3) 0%, rgba(69, 26, 3, 0.4) 100%)',
              border: godBet.active
                ? '1px solid rgba(220, 38, 38, 0.6)'
                : '1px solid rgba(245, 158, 11, 0.5)',
              boxShadow: godBet.active
                ? '0 0 15px rgba(220, 38, 38, 0.25), inset 0 1px 0 rgba(248, 113, 113, 0.2)'
                : '0 0 10px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(252, 211, 77, 0.15)',
            }}
          >
            <span
              className="text-[10px] text-gray-400"
              style={{ letterSpacing: '0.3em' }}
            >
              ESTADO
            </span>
            <span
              className="font-black text-base"
              style={{
                letterSpacing: '0.1em',
                color: godBet.active ? '#f87171' : '#fbbf24',
                textShadow: godBet.active
                  ? '0 0 12px rgba(248, 113, 113, 0.7), 0 0 4px rgba(248, 113, 113, 0.9)'
                  : '0 0 12px rgba(251, 191, 36, 0.6), 0 0 4px rgba(251, 191, 36, 0.8)',
              }}
            >
              {godBet.active ? 'GOD ACTIVO' : 'EN ESPERA'}
            </span>
          </div>
          <div
            className="flex flex-col items-center justify-center px-3 py-2.5 rounded-md min-w-[68px]"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7) 0%, rgba(8, 12, 22, 0.7) 100%)',
              border: '1px solid rgba(34, 211, 238, 0.15)',
              boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.06)',
            }}
          >
            <span className="text-[10px] text-gray-500" style={{ letterSpacing: '0.25em' }}>
              HUD
            </span>
            <span
              className="font-bold text-[11px] truncate max-w-[64px]"
              style={{
                color: '#67e8f9',
                textShadow: '0 0 6px rgba(34, 211, 238, 0.5)',
              }}
            >
              {hudState}
            </span>
          </div>
          <div
            className="flex flex-col items-center justify-center px-3 py-2.5 rounded-md min-w-[60px]"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7) 0%, rgba(8, 12, 22, 0.7) 100%)',
              border: '1px solid rgba(34, 211, 238, 0.15)',
              boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.06)',
            }}
          >
            <span className="text-[10px] text-gray-500" style={{ letterSpacing: '0.25em' }}>
              RADAR
            </span>
            <span
              className="font-black text-base"
              style={{
                color: godBet.radar_score >= 7 ? '#4ade80' : '#cbd5e1',
                textShadow:
                  godBet.radar_score >= 7
                    ? '0 0 8px rgba(74, 222, 128, 0.6)'
                    : '0 0 4px rgba(203, 213, 225, 0.3)',
              }}
            >
              {godBet.radar_score}/10
            </span>
          </div>
        </div>

        {/* ═══ Mesa CCS bar ═══ */}
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-md"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(8, 12, 22, 0.6) 100%)',
            border: '1px solid rgba(34, 211, 238, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.05)',
          }}
        >
          <span className="text-[10px] text-gray-500" style={{ letterSpacing: '0.25em' }}>
            MESA
          </span>
          <div
            className="flex-1 h-2 rounded-full overflow-hidden"
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, ccsPct)}%`,
                background:
                  ccsPct >= 69
                    ? 'linear-gradient(90deg, #22d3ee 0%, #4ade80 100%)'
                    : ccsPct >= 50
                    ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
                    : 'linear-gradient(90deg, #475569 0%, #64748b 100%)',
                boxShadow:
                  ccsPct >= 69
                    ? '0 0 8px rgba(34, 211, 238, 0.6)'
                    : ccsPct >= 50
                    ? '0 0 6px rgba(245, 158, 11, 0.5)'
                    : 'none',
              }}
            />
          </div>
          <span
            className={`text-[11px] font-bold ${fmtPctClass(ccsPct)}`}
            style={{
              textShadow:
                ccsPct >= 69
                  ? '0 0 6px rgba(74, 222, 128, 0.5)'
                  : 'none',
            }}
          >
            {ccsPct}/100
          </span>
        </div>

        {/* ═══ 2. TARGET LOCK (top pick) ═══ */}
        {topPick ? (
          <button
            onClick={() => handleBetClick(topPick)}
            disabled={loadingKey === topPick.bet_key}
            className="relative w-full flex flex-col p-3.5 rounded-md text-left transition-all group overflow-hidden"
            style={{
              background:
                override?.bet_key === topPick.bet_key
                  ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.4) 0%, rgba(69, 26, 3, 0.5) 100%)'
                  : 'linear-gradient(135deg, rgba(8, 47, 73, 0.35) 0%, rgba(15, 23, 42, 0.5) 100%)',
              border:
                override?.bet_key === topPick.bet_key
                  ? '1px solid rgba(251, 191, 36, 0.7)'
                  : '1px solid rgba(34, 211, 238, 0.3)',
              boxShadow:
                override?.bet_key === topPick.bet_key
                  ? '0 0 18px rgba(251, 191, 36, 0.35), inset 0 1px 0 rgba(252, 211, 77, 0.2)'
                  : '0 0 15px rgba(34, 211, 238, 0.18), inset 0 1px 0 rgba(34, 211, 238, 0.1)',
            }}
          >
            {/* Corners de targeting militar */}
            <span
              className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l"
              style={{
                borderColor:
                  override?.bet_key === topPick.bet_key
                    ? 'rgba(251, 191, 36, 0.8)'
                    : 'rgba(103, 232, 249, 0.7)',
              }}
            />
            <span
              className="absolute top-1 right-1 w-2.5 h-2.5 border-t border-r"
              style={{
                borderColor:
                  override?.bet_key === topPick.bet_key
                    ? 'rgba(251, 191, 36, 0.8)'
                    : 'rgba(103, 232, 249, 0.7)',
              }}
            />
            <span
              className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b border-l"
              style={{
                borderColor:
                  override?.bet_key === topPick.bet_key
                    ? 'rgba(251, 191, 36, 0.8)'
                    : 'rgba(103, 232, 249, 0.7)',
              }}
            />
            <span
              className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r"
              style={{
                borderColor:
                  override?.bet_key === topPick.bet_key
                    ? 'rgba(251, 191, 36, 0.8)'
                    : 'rgba(103, 232, 249, 0.7)',
              }}
            />

            <div className="flex justify-between items-center mb-1.5 relative">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{
                  letterSpacing: '0.25em',
                  background:
                    override?.bet_key === topPick.bet_key
                      ? 'rgba(251, 191, 36, 0.2)'
                      : 'rgba(34, 211, 238, 0.15)',
                  color:
                    override?.bet_key === topPick.bet_key ? '#fcd34d' : '#67e8f9',
                  border:
                    override?.bet_key === topPick.bet_key
                      ? '1px solid rgba(251, 191, 36, 0.3)'
                      : '1px solid rgba(34, 211, 238, 0.25)',
                }}
              >
                {override?.bet_key === topPick.bet_key ? '◉ TU APUESTA' : 'TARGET LOCK'}
              </span>
              <span
                className="text-base font-black"
                style={{
                  color:
                    topPick.conf_pct >= 80
                      ? '#67e8f9'
                      : topPick.conf_pct >= 60
                      ? '#22d3ee'
                      : topPick.conf_pct >= 40
                      ? '#fbbf24'
                      : '#94a3b8',
                  textShadow:
                    topPick.conf_pct >= 60
                      ? '0 0 10px rgba(34, 211, 238, 0.6)'
                      : '0 0 4px rgba(148, 163, 184, 0.3)',
                }}
              >
                {topPick.conf_pct}%
              </span>
            </div>
            <div className="flex justify-between items-end mt-1 relative">
              <span
                className="text-[11px] text-gray-500"
                style={{ letterSpacing: '0.25em' }}
              >
                {CAT_LABEL[topPick.bet_key] ?? topPick.bet_key.toUpperCase()}
              </span>
              <span
                className="text-2xl font-black tracking-wider"
                style={{
                  color: '#ffffff',
                  textShadow:
                    override?.bet_key === topPick.bet_key
                      ? '0 0 14px rgba(251, 191, 36, 0.7), 0 0 4px rgba(252, 211, 77, 0.9)'
                      : '0 0 12px rgba(34, 211, 238, 0.5), 0 0 3px rgba(103, 232, 249, 0.8)',
                  letterSpacing: '0.05em',
                }}
              >
                {topPick.pick_pretty}
              </span>
            </div>
          </button>
        ) : (
          <div
            className="flex items-center justify-center p-5 rounded-md"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.5) 0%, rgba(8, 12, 22, 0.5) 100%)',
              border: '1px solid rgba(71, 85, 105, 0.3)',
            }}
          >
            <span
              className="text-[11px] text-gray-600 font-bold"
              style={{ letterSpacing: '0.3em' }}
            >
              SIN TARGET — ESPERANDO
            </span>
          </div>
        )}

        {/* ═══ 3. OTRAS SUGERENCIAS ═══ */}
        <div
          className="flex flex-col rounded-md overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.5) 0%, rgba(8, 12, 22, 0.5) 100%)',
            border: '1px solid rgba(34, 211, 238, 0.12)',
          }}
        >
          <div
            className="px-3 py-2 flex justify-between items-center"
            style={{
              background: 'linear-gradient(90deg, rgba(8, 47, 73, 0.3) 0%, transparent 100%)',
              borderBottom: '1px solid rgba(34, 211, 238, 0.1)',
            }}
          >
            <span
              className="text-[10px] text-cyan-500/80"
              style={{ letterSpacing: '0.25em' }}
            >
              ▼ OTRAS SUGERENCIAS ACTIVAS
            </span>
            {override && (
              <button
                onClick={clearOverride}
                className="text-[10px] hover:opacity-80 transition-opacity"
                style={{
                  color: '#fbbf24',
                  letterSpacing: '0.2em',
                  textShadow: '0 0 6px rgba(251, 191, 36, 0.4)',
                }}
              >
                ✕ liberar
              </button>
            )}
          </div>
          <div className="flex flex-col p-1.5 gap-1">
            {otherBets.length === 0 ? (
              <div className="text-center py-3 text-[11px] text-gray-600 italic">
                — sin BETs activos en este giro —
              </div>
            ) : (
              otherBets.map((b) => {
                const isActive = override?.bet_key === b.bet_key;
                const isLoading = loadingKey === b.bet_key;
                return (
                  <button
                    key={b.bet_key}
                    onClick={() => handleBetClick(b)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left transition-all"
                    style={{
                      background: isActive
                        ? 'linear-gradient(90deg, rgba(120, 53, 15, 0.4) 0%, rgba(69, 26, 3, 0.3) 100%)'
                        : 'linear-gradient(90deg, rgba(15, 23, 42, 0.6) 0%, rgba(8, 12, 22, 0.4) 100%)',
                      border: isActive
                        ? '1px solid rgba(251, 191, 36, 0.5)'
                        : '1px solid rgba(34, 211, 238, 0.08)',
                      boxShadow: isActive
                        ? '0 0 10px rgba(251, 191, 36, 0.25), inset 0 1px 0 rgba(252, 211, 77, 0.15)'
                        : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.border = '1px solid rgba(34, 211, 238, 0.3)';
                        e.currentTarget.style.boxShadow = '0 0 8px rgba(34, 211, 238, 0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.border = '1px solid rgba(34, 211, 238, 0.08)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <span
                      className="text-[11px] font-bold w-10"
                      style={{
                        color: isActive ? '#fcd34d' : '#94a3b8',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {CAT_SHORT[b.bet_key] ?? b.bet_key.slice(0, 3).toUpperCase()}
                    </span>
                    <span
                      className="flex-1 text-[12px] font-bold text-white text-center truncate"
                      style={{
                        textShadow: isActive
                          ? '0 0 6px rgba(251, 191, 36, 0.5)'
                          : '0 0 4px rgba(34, 211, 238, 0.2)',
                      }}
                    >
                      {b.pick_pretty}
                    </span>
                    <span
                      className="text-[11px] font-bold w-12 text-right"
                      style={{
                        color:
                          b.conf_pct >= 80
                            ? '#67e8f9'
                            : b.conf_pct >= 60
                            ? '#22d3ee'
                            : b.conf_pct >= 40
                            ? '#fbbf24'
                            : '#94a3b8',
                        textShadow:
                          b.conf_pct >= 60
                            ? '0 0 6px rgba(34, 211, 238, 0.4)'
                            : 'none',
                      }}
                    >
                      {b.conf_pct}%
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ 4. ERRORES (ancho completo) ═══ */}
        <div
          className="flex items-center justify-between p-3 rounded-md"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(8, 12, 22, 0.6) 100%)',
            border: '1px solid rgba(34, 211, 238, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.04)',
          }}
        >
          <span
            className="text-[10px] text-gray-500"
            style={{ letterSpacing: '0.3em' }}
          >
            ERRORES
          </span>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-gray-500">CONSEC</span>
              <span
                className="font-bold text-base"
                style={{
                  color: consecErr > 0 ? '#f87171' : '#94a3b8',
                  textShadow:
                    consecErr > 0
                      ? '0 0 8px rgba(248, 113, 113, 0.5)'
                      : 'none',
                }}
              >
                {consecErr}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-gray-500">MÁX</span>
              <span
                className="font-bold text-white text-base"
                style={{ textShadow: '0 0 4px rgba(255, 255, 255, 0.3)' }}
              >
                {maxConsecErr}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-gray-500">ERR/HIT</span>
              <span
                className="font-bold text-base"
                style={{
                  color: '#fb923c',
                  textShadow: '0 0 6px rgba(251, 146, 60, 0.4)',
                }}
              >
                {errHit.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ 5. SESIÓN GOD ═══ */}
        <div
          className="flex items-center justify-center gap-3 py-2 rounded-md"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.5) 0%, rgba(8, 12, 22, 0.5) 100%)',
            border: '1px solid rgba(34, 211, 238, 0.12)',
          }}
        >
          <span
            className="text-[10px] text-gray-500"
            style={{ letterSpacing: '0.3em' }}
          >
            SESIÓN GOD
          </span>
          <span
            className="font-bold text-white text-[13px]"
            style={{ textShadow: '0 0 4px rgba(255, 255, 255, 0.3)' }}
          >
            {hits}/{totalBets}
          </span>
          <span
            className="font-black text-[15px]"
            style={{
              color:
                hitRate >= 70
                  ? '#4ade80'
                  : hitRate >= 50
                  ? '#fbbf24'
                  : hitRate >= 30
                  ? '#fb923c'
                  : '#f87171',
              textShadow:
                hitRate >= 50
                  ? '0 0 8px rgba(74, 222, 128, 0.5)'
                  : '0 0 4px rgba(251, 146, 60, 0.3)',
            }}
          >
            {totalBets > 0 ? hitRate.toFixed(0) : '0'}%
          </span>
        </div>

        {/* ═══ 6. EFICIENCIA POR CATEGORÍA ═══ */}
        <div className="flex flex-col">
          <span
            className="text-[10px] text-cyan-500/70 mb-1.5 px-1"
            style={{ letterSpacing: '0.3em' }}
          >
            EFICIENCIA POR CATEGORÍA
          </span>
          <div className="grid grid-cols-5 gap-1.5">
            {GOD_CATS.map((cat) => {
              const c = counters?.[cat];
              const w = c?.wins ?? 0;
              const l = c?.losses ?? 0;
              const n = w + l;
              const hr = n > 0 ? (w / n) * 100 : 0;
              const isOver = override?.bet_key === cat;
              const hrColor =
                n === 0
                  ? '#475569'
                  : hr >= 70
                  ? '#4ade80'
                  : hr >= 50
                  ? '#fbbf24'
                  : hr >= 30
                  ? '#fb923c'
                  : '#f87171';
              return (
                <div
                  key={cat}
                  className="flex flex-col items-center justify-center py-2 rounded-md"
                  style={{
                    background: isOver
                      ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.35) 0%, rgba(69, 26, 3, 0.5) 100%)'
                      : 'linear-gradient(135deg, rgba(15, 23, 42, 0.5) 0%, rgba(8, 12, 22, 0.5) 100%)',
                    border: isOver
                      ? '1px solid rgba(251, 191, 36, 0.5)'
                      : '1px solid rgba(34, 211, 238, 0.1)',
                    boxShadow: isOver
                      ? '0 0 10px rgba(251, 191, 36, 0.25), inset 0 1px 0 rgba(252, 211, 77, 0.15)'
                      : 'inset 0 1px 0 rgba(34, 211, 238, 0.04)',
                  }}
                >
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      color: isOver ? '#fcd34d' : '#94a3b8',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {CAT_SHORT[cat]}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {w}/{n}
                  </span>
                  <span
                    className="text-[12px] font-black"
                    style={{
                      color: hrColor,
                      textShadow:
                        n > 0 && hr >= 50
                          ? `0 0 6px ${hrColor}55`
                          : 'none',
                    }}
                  >
                    {n === 0 ? '—' : `${hr.toFixed(0)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
