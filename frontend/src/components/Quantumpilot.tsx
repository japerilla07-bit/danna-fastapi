// src/components/Quantumpilot.tsx
// QuantumPilot — Overlay flotante draggable.
// Replica la UI del deploy original (Streamlit) sobre React.
//
// Bloques:
//   1. Header verdict (CON PICK / EN ESPERA) + HUD + RADAR + CCS%
//   2. TARGET LOCK (top pick) — clickeable para marcar como apuesta del usuario
//   3. OTRAS SUGERENCIAS ACTIVAS — lista clickeable
//   4. SALDO + P&L  /  ERRORES (consec · max · err/hit)
//   5. CONCIENCIA SITUACIONAL — PilotDelta (W/R 14, anclaje, Δ)
//      (PROGRESIÓN L1→L4 eliminada)
//   6. EFICIENCIA POR CATEGORÍA (strip horizontal)
//
// Tracker de override:
//   - Click en TARGET LOCK o en cualquier sugerencia → POST /api/pilot/override
//   - GET /api/pilot/override al montar para sincronizar estado
//   - El backend cuenta wins/losses sobre la apuesta elegida por el usuario.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EnginePayload } from '@/types/api';

// ── Tipos ─────────────────────────────────────────────────────────

import { PilotDelta } from '@/components/PilotDelta';
import '@/styles/pilot-delta.css';
import { MotorAlerts } from '@/components/MotorAlerts';
import { RadarMap } from '@/components/RadarMap';

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
  p_raw?: number;   // VALIDACION: p crudo del ensemble (0-1), aditivo
}

interface GodStats {
  wins: number;
  losses: number;
  avg_errors: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface GodTarget {
  wins: number;
  losses: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface GodBetData {
  active: boolean;
  cond_state: string;
  radar_score: number;
  counters_god: Record<string, any>;
  god_target?: GodTarget;
  active_bets: ActiveBet[];
  best_p_raw?: number;   // VALIDACION: mejor p crudo del ensemble, siempre presente
  best_p_key?: string;   // categoria del mejor p
  best_p1?: number;      // grupo individual mas fuerte (rango real)
  best_p2?: number;      // segundo grupo
  best_g1?: string;      // etiqueta del grupo 1
  best_g2?: string;      // etiqueta del grupo 2
  // ★ god_stats viene DIRECTO de pilot.raw → siempre fresco post-record_outcome
  god_stats?: GodStats;
  last_verdict?: {
    verdict: 'GO' | 'WAIT' | 'STAND_DOWN';
    ccs_pct: number;
    /**
     * ★ True cuando el operador activó override con CCS≥60% y el motor sin
     * override habría dado WAIT. Backend lo estampa en pilot.py (Opción C).
     * El HUD muestra un badge "OVERRIDE FORZADO" cuando es true.
     */
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
  /**
   * ★ Stake base configurado (default 2500). Lo expone /api/bankroll y se
   * usa para proyectar la ladder L1-L4 del panel PROGRESIÓN.
   */
  stake_base?: number;
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
  /** ── PilotDelta (sustituye al bloque SESIÓN GOD) ────────────────────── */
  /** Nº de giros de la sesión — dispara el registro de una fila nueva. */
  spinsCount?: number;
  /** HUD tal como se anota en el Excel (el COND ×100). */
  pdHud?: number | null;
  /** Entropía tal como se anota (la card TABLE ENTROPY). */
  pdEntropy?: number | null;
  /** Resultado del último giro en docenas / columnas. */
  pdDocHit?: boolean | null;
  pdColHit?: boolean | null;
}

/* FASE 1: Refactorización de useDrag para rendimiento. */
// ── Hook draggable ────────────────────────────────────────────────

function useDrag(initialPos: { x: number; y: number }, targetRef: React.RefObject<HTMLDivElement>) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: initialPos.x, y: initialPos.y });

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      dragStart.current = { x: clientX, y: clientY };
      if (targetRef.current) {
         const transform = targetRef.current.style.transform;
         if(transform) {
             const match = transform.match(/translate3d\((.+)px,\s*(.+)px/);
             if(match) {
                 posStart.current = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
             }
         }
      }
      e.stopPropagation();
    },
    [targetRef]
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      
      const newX = posStart.current.x + dx;
      const newY = posStart.current.y + dy;

      if (targetRef.current) {
        targetRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
      }
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
  }, [isDragging, targetRef]);

  return { onMouseDown, initialPos };
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

export function QuantumPilot({
  godBet,
  payload,
  counters,
  bankroll,
  spinsCount = 0,
  pdHud = null,
  pdEntropy = null,
  pdDocHit = null,
  pdColHit = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { onMouseDown, initialPos } = useDrag({ x: 20, y: 100 }, containerRef);

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
        p_raw: (pickBet as any).p_raw,
      };
    }
    if (godBet.active && activeBets.length > 0) {
      return activeBets[0];
    }
    return null;
  })();

  const { otherBets, otherSrc } = (() => {
    const pl: any = payload ?? {};
    const rutas: Array<[string, any]> = [
      ['decision.bet_advice', pl?.decision?.bet_advice],
      ['bet_advice', pl?.bet_advice],
      ['decision.advice', pl?.decision?.advice],
      ['payload.decision.bet_advice', pl?.payload?.decision?.bet_advice],
    ];
    let adv: any = null;
    let src = 'no encontrado';
    for (const [nombre, val] of rutas) {
      if (val && typeof val === 'object' && Object.keys(val).length > 0) {
        adv = val;
        src = nombre;
        break;
      }
    }
    if (!adv) return { otherBets: [] as any[], otherSrc: src };

    const filas = Object.keys(adv)
      .map((k: string) => {
        const a: any = adv[k] ?? {};
        const raw = a.pick ?? a.selection ?? a.value ?? null;
        const pk = Array.isArray(raw) ? raw.join(', ') : (raw === null ? '' : String(raw));
        const pr = Number(a.p ?? a.prob ?? a.conf_score ?? 0);
        return {
          bet_key: k,
          label: String(a.label ?? k),
          pick: raw,
          pick_pretty: pk,
          p: pr,
          conf_pct: Math.round(pr * 100),
          status: String(a.status ?? a.final_action ?? 'WAIT').toUpperCase(),
        };
      })
      .filter((b) => b.pick_pretty !== '' && b.pick_pretty !== '—')
      .sort((a, b) => b.p - a.p);
    return { otherBets: filas as any[], otherSrc: `${src} · ${filas.length}` };
  })();

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
        /* silencioso */
      });
    return () => {
      cancelled = true;
    };
  }, [verdict?.pick_bet?.bet_key, godBet?.god_stats?.wins, godBet?.god_stats?.losses]);

  const applyOverride = useCallback(async (bet_key: string, pick: any) => {
    setLoadingKey(bet_key);
    setOverride({ bet_key, pick });
    try {
      const r = await fetch('/api/pilot/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bet_key, pick }),
      });
      if (!r.ok) {
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

  const handleBetClick = useCallback(
    (b: ActiveBet) => {
      if (override?.bet_key === b.bet_key) {
        clearOverride();
      } else {
        applyOverride(b.bet_key, b.pick_pretty);
      }
    },
    [override, applyOverride, clearOverride]
  );

  const godTarget = godBet?.god_target ?? { wins: 0, losses: 0, consec_errors: 0, max_consec_errors: 0 };
  const consecErr = Number(godTarget.consec_errors ?? 0);
  const maxConsecErr = Number(godTarget.max_consec_errors ?? 0);
  const hits = Number(godTarget.wins ?? 0);
  const misses = Number(godTarget.losses ?? 0);
  const errHit = hits > 0 ? misses / hits : misses;

  if (minimized) {
    return (
      <div
        ref={containerRef}
        className="fixed z-50 flex items-center justify-center rounded-full w-12 h-12 cursor-grab active:cursor-grabbing"
        style={{
          transform: `translate3d(${initialPos.x}px, ${initialPos.y}px, 0)`,
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

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-[860px] max-w-[95vw] max-h-[92vh] rounded-xl overflow-hidden font-mono text-gray-200 select-none flex flex-col"
      style={{
        transform: `translate3d(${initialPos.x}px, ${initialPos.y}px, 0)`,
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
        className="relative z-10 flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing shrink-0"
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
          <span className="flex flex-col leading-none">
            <span
              className="font-bold text-[15px]"
              style={{
                letterSpacing: '0.25em',
                color: godBet.active ? '#fca5a5' : '#67e8f9',
                textShadow: godBet.active
                  ? '0 0 8px rgba(220, 38, 38, 0.5)'
                  : '0 0 8px rgba(34, 211, 238, 0.4)',
              }}
            >
              QUANTUM PILOT v2.0
            </span>
            <span
              className="text-[9px] text-gray-500 mt-0.5"
              style={{ letterSpacing: '0.18em' }}
            >
              LECTURA DE MESA · NO PREDICE EL PRÓXIMO GIRO
            </span>
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
        className="relative z-10 h-px w-full shrink-0"
        style={{
          background: godBet.active
            ? 'linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.6) 50%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.5) 50%, transparent 100%)',
        }}
      />

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col p-4 gap-3 pilot-scroll">
        
        {/* ═══ 1. ZONA TOP: Telemetría ═══ */}
        <div className="flex items-stretch gap-2 shrink-0">
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
              className="text-[12px] text-gray-400"
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
              {topPick ? 'CON PICK' : 'EN ESPERA'}
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
            <span className="text-[12px] text-gray-500" style={{ letterSpacing: '0.25em' }}>
              HUD
            </span>
            <span
              className="font-bold text-[13px] truncate max-w-[64px]"
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
            <span className="text-[12px] text-gray-500" style={{ letterSpacing: '0.25em' }}>
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
          <div
            className="flex flex-col items-center justify-center px-3 py-2 rounded-md min-w-[82px]"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7) 0%, rgba(8, 12, 22, 0.7) 100%)',
              border: '1px solid rgba(34, 211, 238, 0.15)',
              boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.06)',
            }}
            title={`Grupos individuales de ${godBet.best_p_key ?? '—'} y su suma`}
          >
            <span className="text-[11px] text-gray-500" style={{ letterSpacing: '0.15em' }}>
              {({
                docenas: 'DOC', columnas: 'COL', color: 'CLR',
                paridad: 'PAR', rango: 'RNG',
              } as Record<string, string>)[godBet.best_p_key ?? ''] ?? (godBet.best_p_key ?? 'P').toUpperCase()}
            </span>
            <span className="text-[12px] font-mono text-cyan-400 leading-tight">
              {(godBet.best_g1 ?? '—')} {godBet.best_p1 != null ? (godBet.best_p1 * 100).toFixed(1) : '—'}
            </span>
            <span className="text-[12px] font-mono text-cyan-500 leading-tight">
              {(godBet.best_g2 ?? '—')} {godBet.best_p2 != null ? (godBet.best_p2 * 100).toFixed(1) : '—'}
            </span>
            <span
              className="font-black text-xs font-mono mt-0.5"
              style={{ color: '#67e8f9', textShadow: '0 0 6px rgba(34, 211, 238, 0.4)' }}
            >
              Σ{godBet.best_p_raw != null ? (godBet.best_p_raw * 100).toFixed(1) : '—'}%
            </span>
          </div>
        </div>

        {/* ═══ Mesa CCS bar ═══ */}
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-md shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(8, 12, 22, 0.6) 100%)',
            border: '1px solid rgba(34, 211, 238, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.05)',
          }}
        >
          <span className="text-[12px] text-gray-500" style={{ letterSpacing: '0.25em' }}>
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
            className={`text-[13px] font-bold ${fmtPctClass(ccsPct)}`}
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

        {/* ═══ FASE 3: CENTER CANVAS (RADAR MAP ACTIVO) ═══ */}
        <div className="w-full h-[220px] rounded-md border border-[rgba(34,211,238,0.3)] bg-[rgba(8,12,22,0.8)] relative flex flex-col items-center justify-center overflow-hidden shadow-[inset_0_0_20px_rgba(34,211,238,0.1)] shrink-0 my-2">
             <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900 to-transparent"></div>
             
             {/* El RadarMap importado se inyecta aquí. Se alimenta directo del hud y entropy que llegan por Props */}
             <div className="w-full h-full absolute inset-0 z-10">
                 <RadarMap 
                    spinsCount={spinsCount} 
                    hud={pdHud} 
                    entropy={pdEntropy} 
                 />
             </div>
        </div>

        {/* ═══ 2. TARGET LOCK (top pick) ═══ */}
        <div className="shrink-0">
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
              style={{ borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251, 191, 36, 0.8)' : 'rgba(103, 232, 249, 0.7)' }}
            />
            <span
              className="absolute top-1 right-1 w-2.5 h-2.5 border-t border-r"
              style={{ borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251, 191, 36, 0.8)' : 'rgba(103, 232, 249, 0.7)' }}
            />
            <span
              className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b border-l"
              style={{ borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251, 191, 36, 0.8)' : 'rgba(103, 232, 249, 0.7)' }}
            />
            <span
              className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r"
              style={{ borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251, 191, 36, 0.8)' : 'rgba(103, 232, 249, 0.7)' }}
            />

            <div className="flex justify-between items-center mb-1.5 relative">
              <span
                className="text-[12px] font-bold px-2 py-0.5 rounded"
                style={{
                  letterSpacing: '0.25em',
                  background: override?.bet_key === topPick.bet_key ? 'rgba(251, 191, 36, 0.2)' : 'rgba(34, 211, 238, 0.15)',
                  color: override?.bet_key === topPick.bet_key ? '#fcd34d' : '#67e8f9',
                  border: override?.bet_key === topPick.bet_key ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(34, 211, 238, 0.25)',
                }}
              >
                {override?.bet_key === topPick.bet_key ? '◉ TU APUESTA' : '▸ SUGERENCIA TOP'}
              </span>
              {verdict?.override_forced_go ? (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    letterSpacing: '0.2em',
                    color: '#fde68a',
                    backgroundColor: 'rgba(251, 191, 36, 0.12)',
                    border: '1px solid rgba(251, 191, 36, 0.4)',
                    textShadow: '0 0 6px rgba(251, 191, 36, 0.45)',
                  }}
                  title="Override forzó GO sobre threshold del Pilot"
                >
                  OVERRIDE FORZADO
                </span>
              ) : null}
              <span
                className="text-base font-black"
                style={{
                  color: topPick.conf_pct >= 80 ? '#67e8f9' : topPick.conf_pct >= 60 ? '#22d3ee' : topPick.conf_pct >= 40 ? '#fbbf24' : '#94a3b8',
                  textShadow: topPick.conf_pct >= 60 ? '0 0 10px rgba(34, 211, 238, 0.6)' : '0 0 4px rgba(148, 163, 184, 0.3)',
                }}
              >
                {topPick.conf_pct}%
              </span>
            </div>
            <div className="flex justify-between items-end mt-1 relative">
              <span
                className="text-[13px] text-gray-500"
                style={{ letterSpacing: '0.25em' }}
              >
                {CAT_LABEL[topPick.bet_key] ?? topPick.bet_key.toUpperCase()}
              </span>
              <span
                className="text-2xl font-black tracking-wider"
                style={{
                  color: '#ffffff',
                  textShadow: override?.bet_key === topPick.bet_key ? '0 0 14px rgba(251, 191, 36, 0.7), 0 0 4px rgba(252, 211, 77, 0.9)' : '0 0 12px rgba(34, 211, 238, 0.5), 0 0 3px rgba(103, 232, 249, 0.8)',
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
              className="text-[13px] text-gray-600 font-bold"
              style={{ letterSpacing: '0.3em' }}
            >
              SIN TARGET — ESPERANDO
            </span>
          </div>
        )}
        </div>

        {/* ═══ 3. OTRAS SUGERENCIAS ═══ */}
        <div
          className="flex flex-col rounded-md overflow-hidden shrink-0"
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
              className="text-[12px] text-cyan-500/80"
              style={{ letterSpacing: '0.25em' }}
            >
              ▼ SUGERENCIAS DEL PAÑO
            </span>
            <span className="text-[11px] text-gray-600" style={{ letterSpacing: '0.05em' }}>
              {otherSrc}
            </span>
            {override && (
              <button
                onClick={clearOverride}
                className="text-[12px] hover:opacity-80 transition-opacity"
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
              <div className="text-center py-3 text-[13px] text-gray-600 italic">
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
                  >
                    <span
                      className="text-[13px] font-bold w-10"
                      style={{
                        color: isActive ? '#fcd34d' : '#94a3b8',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {CAT_SHORT[b.bet_key] ?? b.bet_key.slice(0, 3).toUpperCase()}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        letterSpacing: '0.08em',
                        background: b.status === 'BET' ? 'rgba(34, 197, 94, 0.18)' : b.status === 'PROBE' ? 'rgba(251, 191, 36, 0.18)' : 'rgba(100, 116, 139, 0.18)',
                        color: b.status === 'BET' ? '#4ade80' : b.status === 'PROBE' ? '#fbbf24' : '#94a3b8',
                      }}
                    >
                      {b.status}
                    </span>
                    <span
                      className="flex-1 text-[14px] font-bold text-white text-center truncate"
                      style={{
                        textShadow: isActive ? '0 0 6px rgba(251, 191, 36, 0.5)' : '0 0 4px rgba(34, 211, 238, 0.2)',
                      }}
                    >
                      {b.pick_pretty}
                    </span>
                    <span
                      className="text-[13px] font-bold w-12 text-right"
                      style={{
                        color: b.conf_pct >= 80 ? '#67e8f9' : b.conf_pct >= 60 ? '#22d3ee' : b.conf_pct >= 40 ? '#fbbf24' : '#94a3b8',
                        textShadow: b.conf_pct >= 60 ? '0 0 6px rgba(34, 211, 238, 0.4)' : 'none',
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

        {/* ═══ 4. ERRORES ═══ */}
        <div
          className="flex items-center justify-between p-3 rounded-md shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(8, 12, 22, 0.6) 100%)',
            border: '1px solid rgba(34, 211, 238, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.04)',
          }}
        >
          <span
            className="text-[12px] text-gray-500"
            style={{ letterSpacing: '0.3em' }}
          >
            ERRORES
          </span>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] text-gray-500">CONSEC</span>
              <span
                className="font-bold text-base"
                style={{
                  color: consecErr > 0 ? '#f87171' : '#94a3b8',
                  textShadow: consecErr > 0 ? '0 0 8px rgba(248, 113, 113, 0.5)' : 'none',
                }}
              >
                {consecErr}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] text-gray-500">MÁX</span>
              <span
                className="font-bold text-white text-base"
                style={{ textShadow: '0 0 4px rgba(255, 255, 255, 0.3)' }}
              >
                {maxConsecErr}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] text-gray-500">ERR/HIT</span>
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

        {/* ═══ 5. CONCIENCIA SITUACIONAL ═══ */}
        <PilotDelta
          spinsCount={spinsCount}
          hud={pdHud}
          entropy={pdEntropy}
          docHit={pdDocHit}
          colHit={pdColHit}
        />

        <MotorAlerts
          spinsCount={spinsCount}
          hud={pdHud}
          radar={godBet.radar_score}
          entropy={pdEntropy}
        />

        {/* ═══ 6. EFICIENCIA POR CATEGORÍA ═══ */}
        <div className="flex flex-col shrink-0 mb-4">
          <span
            className="text-[12px] text-cyan-500/70 mb-1.5 px-1"
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
                    className="text-[12px] font-bold"
                    style={{
                      color: isOver ? '#fcd34d' : '#94a3b8',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {CAT_SHORT[cat]}
                  </span>
                  <span className="text-[12px] text-gray-500">
                    {w}/{n}
                  </span>
                  <span
                    className="text-[14px] font-black"
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