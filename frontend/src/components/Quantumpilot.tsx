// src/components/Quantumpilot.tsx
// QuantumPilot — Overlay flotante draggable. Cockpit único.
//
// v2 — REDISEÑO COMPLETO (sep 2026). Antes este panel mezclaba dos motores
// de decisión sin avisar cuál era cuál (GOD legacy vs escudo Capa1+2, el que
// está documentado en el manual y el que de verdad corre en cada giro), y
// tenía TRES marcadores de aciertos/errores distintos calculados de formas
// distintas. Se reorganizó así:
//
//   1. Estado + HUD/RADAR/Σp + barra CCS        (igual que antes)
//   2. DECISIÓN   — orden del escudo (CopilotOrder, de MatrixPanel) arriba,
//                   TARGET LOCK de GOD debajo, cada uno rotulado con su
//                   fuente. Son dos motores reales y distintos — no se
//                   fusionan los números, solo se ordenan visualmente juntos.
//   3. MARCADOR   — CopilotScoreboard (escudo) + ERRORES (target de GOD)
//                   lado a lado, en vez de tres cajas sueltas por la app.
//   4. SUGERENCIAS POR CATEGORÍA — CategoryTable completo (antes vivía
//                   aparte en la columna central) + GodBetPanel debajo
//                   (se auto-colapsa a una tira fina cuando GOD no está
//                   activo). Reemplaza al bloque viejo "OTRAS SUGERENCIAS",
//                   que era una versión pobre de lo mismo.
//   5. LECTURA DE ZONA — el detalle por doc/col (termómetro, celda actual,
//                   casillas visitadas) pasa a un acordeón colapsable.
//                   Mismo componente de siempre (ZoneDetailGrid), cero
//                   cambios de lógica — solo se saca del primer plano.
//   6. BANKROLL   — BankrollLedger completo, informativo, vive acá adentro.
//
// Se sacó "EFICIENCIA POR CATEGORÍA" (el grid chico del final): quedó
// redundante contra CategoryTable, que ya trae lo mismo y más completo.
//
// Tracker de override (sin cambios):
//   - Click en TARGET LOCK o en cualquier sugerencia → POST /api/pilot/override
//   - GET /api/pilot/override al montar para sincronizar estado
//   - El backend cuenta wins/losses sobre la apuesta elegida por el usuario.
//
// v3 (rediseño trading) — SOLO VISUAL. Cero cambios de lógica, hooks, fetch,
// prop names, IDs ni conectores.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EnginePayload } from '@/types/api';
import { CopilotOrder, CopilotScoreboard, ZoneDetailGrid, ZoneQuickBadges } from '@/components/MatrixPanel';
import { CategoryTable, toState, pickLabel, type BadgeState } from '@/components/CategoryTable';
import { GodBetPanel } from '@/components/GodBetPanel';
import { BankrollLedger } from '@/components/BankrollLedger';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// ── Tipos ─────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  color:    'COLOR',
  paridad:  'PARIDAD',
  rango:    'RANGO',
  docenas:  'DOCENAS',
  columnas: 'COLUMNAS',
  max_conf: 'NÚMEROS',
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

// ★ FIX build (sep 2026): streak/max_streak eran opcionales acá pero
// CategoryTable.tsx/GodBetPanel.tsx los declaran obligatorios (su propio
// `interface Counter`). Como CounterEntry solo existe para tipar lo que
// se reenvía tal cual a esos dos componentes (nunca se lee .streak adentro
// de este archivo), se alinea 1:1 con su Counter — sin esto tsc rompía el
// build en los props `counters`/`countersGod` de las líneas de abajo.
interface CounterEntry {
  wins: number;
  losses: number;
  streak: number;
  max_streak: number;
  consec_errors: number;
  max_consec_errors: number;
}

interface Bankroll {
  current: number;
  initial: number;
  pnl: number;
  pnl_pct: number;
  /**
   * ★ Stake base configurado (default 2500). Lo expone /api/bankroll.
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
  /** error_hist del state — alimenta CategoryTable y GodBetPanel. Mismo
   *  dato que ya usaba la columna central; se pasa acá para que el cockpit
   *  lo tenga completo sin ir a buscarlo a otro lado. */
  errorHist?: Record<string, any>;
  /** ── (sin usar hoy, se dejan por compat de firma con AppPage) ───────── */
  spinsCount?: number;
  pdHud?: number | null;
  pdEntropy?: number | null;
  pdDocHit?: boolean | null;
  pdColHit?: boolean | null;
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

    const N = 30;
    const nodes = Array.from({ length: N }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
    }));

    const draw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width;
      const H = canvas.height;
      const isAct = activeRef.current;
      const colorBase = isAct ? 'rgba(239, 68, 68' : 'rgba(34, 211, 238';

      for (let i = 0; i < N; i++) {
        nodes[i].x += nodes[i].vx;
        nodes[i].y += nodes[i].vy;
        if (nodes[i].x < 0 || nodes[i].x > W) nodes[i].vx *= -1;
        if (nodes[i].y < 0 || nodes[i].y > H) nodes[i].vy *= -1;

        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.strokeStyle = `${colorBase}, ${0.5 * (1 - dist / 90)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.fillStyle = `${colorBase}, 0.6)`;
        ctx.arc(nodes[i].x, nodes[i].y, 1.1, 0, Math.PI * 2);
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
      className="absolute inset-0 w-full h-full pointer-events-none opacity-20 z-0"
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

// Rótulo chico de sección, reutilizado en todo el cockpit para que cada
// bloque diga de dónde sale el número (evita el "¿cuál marcador miro?").
function SeccionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 0 2px',
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.26em',
        color: '#64748b',
        textTransform: 'uppercase',
        fontWeight: 800,
      }}
    >
      <span style={{ width: 3, height: 11, background: '#22d3ee', boxShadow: '0 0 5px rgba(34,211,238,0.45)' }} />
      <span>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(34,211,238,0.20) 0%, transparent 100%)' }} />
    </div>
  );
}

// Chip DOCENAS/COLUMNAS con pick concreto (1-12, Col 2, etc.) — responde el
// reclamo de Gunner: el veredicto del escudo ("DOCENAS · ENTRÁ") dice QUÉ
// MERCADO, no CUÁL docena/columna específica. Lee bet_advice con la MISMA
// función (toState/pickLabel) que usa CategoryTable, así nunca puede mostrar
// algo distinto de lo que dice la fila "Docenas"/"Columnas" de la tabla.
// Va pegado a CopilotOrder, arriba de todo — cero scroll para verlo.
const BADGE_BG: Record<BadgeState, string> = {
  bet: 'bg-green-600/20 border-green-500/50 text-green-300',
  prb: 'bg-amber-600/20 border-amber-500/50 text-amber-300',
  wt:  'bg-gray-700/25 border-gray-600/40 text-gray-400',
};
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

// (Los BADGE_BG/BADGE_TXT de arriba se dejan por compat — el nuevo
// DocColQuickPick ya no los usa pero los mantengo por si algo externo los
// importara; no rompen nada.)
void BADGE_BG;
void BADGE_TXT;

const QUICK_BG: Record<BadgeState, { bg: string; bd: string; tx: string }> = {
  bet: { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.40)', tx: '#10b981' },
  prb: { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.40)', tx: '#f59e0b' },
  wt:  { bg: 'rgba(100,116,139,0.06)', bd: 'rgba(100,116,139,0.25)', tx: '#64748b' },
};

function DocColQuickPick({ label, state, pick }: { label: string; state: BadgeState; pick: string }) {
  const c = QUICK_BG[state];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 3,
        background: c.bg,
        border: `1px solid ${c.bd}`,
        fontFamily: MONO,
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.14em', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          fontSize: 8.5, fontWeight: 800, padding: '1px 5px', borderRadius: 2,
          background: 'rgba(0,0,0,0.3)', color: c.tx, border: `1px solid ${c.bd}`,
          flexShrink: 0, letterSpacing: '0.06em',
        }}>{state === 'bet' ? 'BET' : state === 'prb' ? 'PRB' : 'WT'}</span>
        <span
          title={pick}
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 150,
          }}
        >
          {pick}
        </span>
      </span>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────

export function QuantumPilot({
  godBet,
  payload,
  counters,
  bankroll,
  errorHist = {},
}: Props) {
  const { pos, onMouseDown } = useDrag({ x: 20, y: 100 });
  const [minimized, setMinimized] = useState(false);

  const [override, setOverride] = useState<OverrideState | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const verdict = godBet.last_verdict;
  const pickBet = verdict?.pick_bet ?? null;
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
  //      primera sugerencia activa como fallback visual.
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

  // ── Click handler para una sugerencia
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

  // ── ERRORES (target de GOD): fuente ÚNICA godBet.god_target — cuenta
  // SOLO el pick que TARGET LOCK muestra, SOLO cuando GOD está activo.
  const godTarget = godBet?.god_target ?? { wins: 0, losses: 0, consec_errors: 0, max_consec_errors: 0 };
  const consecErr = Number(godTarget.consec_errors ?? 0);
  const maxConsecErr = Number(godTarget.max_consec_errors ?? 0);
  const hits = Number(godTarget.wins ?? 0);
  const misses = Number(godTarget.losses ?? 0);
  const errHit = hits > 0 ? misses / hits : misses;

  // ── Minimizado
  if (minimized) {
    return (
      <div
        className="fixed z-50 flex items-center justify-center rounded-full w-12 h-12 cursor-grab active:cursor-grabbing"
        style={{
          left: pos.x,
          top: pos.y,
          background: 'linear-gradient(135deg, #0a0e17 0%, #0d1219 100%)',
          border: godBet.active
            ? '1px solid rgba(239,68,68,0.55)'
            : '1px solid rgba(34,211,238,0.35)',
          boxShadow: godBet.active
            ? '0 0 0 1px rgba(239,68,68,0.10), 0 4px 14px rgba(0,0,0,0.5)'
            : '0 0 0 1px rgba(34,211,238,0.06), 0 4px 14px rgba(0,0,0,0.5)',
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        onClick={() => setMinimized(false)}
      >
        <span
          className={godBet.active ? 'animate-pulse' : ''}
          style={{
            fontSize: 20,
            color: godBet.active ? '#f87171' : '#22d3ee',
          }}
        >
          ⚡
        </span>
      </div>
    );
  }

  const kpiCell: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '8px 12px',
    minWidth: 0,
    borderLeft: '1px solid rgba(148,163,184,0.10)',
    fontFamily: MONO,
  };
  const kpiLabel: React.CSSProperties = {
    fontSize: 8.5,
    color: '#64748b',
    letterSpacing: '0.20em',
    fontWeight: 800,
    textTransform: 'uppercase',
    marginBottom: 3,
  };
  const kpiValue: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };

  // ── Render principal
  return (
    <div
      className="fixed z-50 w-[1200px] max-w-[95vw] max-h-[96vh] rounded-lg overflow-hidden font-mono text-gray-200 select-none flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        background: 'linear-gradient(180deg, #0b1017 0%, #080c14 100%)',
        border: godBet.active
          ? '1px solid rgba(239,68,68,0.45)'
          : '1px solid rgba(148,163,184,0.15)',
        boxShadow: godBet.active
          ? '0 0 0 1px rgba(239,68,68,0.08) inset, 0 12px 40px rgba(0,0,0,0.75)'
          : '0 0 0 1px rgba(34,211,238,0.05) inset, 0 12px 40px rgba(0,0,0,0.75)',
      }}
    >
      <ParticleCanvas active={godBet.active} />

      {/* ═══ Header ═══ */}
      <div
        className="relative z-10 flex items-center justify-between px-4 py-2.5 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        style={{
          background: godBet.active
            ? 'linear-gradient(180deg, rgba(60,15,15,0.55) 0%, rgba(15,8,8,0.30) 100%)'
            : 'linear-gradient(180deg, rgba(15,25,35,0.55) 0%, rgba(8,12,20,0.30) 100%)',
          borderBottom: godBet.active
            ? '1px solid rgba(239,68,68,0.28)'
            : '1px solid rgba(148,163,184,0.12)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={godBet.active ? 'text-red-400 animate-pulse' : 'text-cyan-400'}
            style={{ fontSize: 16 }}
          >
            ⚡
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '0.34em',
              color: godBet.active ? '#fca5a5' : '#67e8f9',
            }}
          >
            QUANTUM PILOT
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              color: '#475569',
              letterSpacing: '0.2em',
              paddingLeft: 6,
              borderLeft: '1px solid rgba(148,163,184,0.15)',
              fontWeight: 700,
            }}
          >
            v2.4 · live
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
            ? 'linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.4) 50%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.35) 50%, transparent 100%)',
        }}
      />

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col p-4 gap-3 pilot-scroll">
        {/* ═══ 1. Estado verdict — barra de KPIs trading ═══ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.9fr 0.8fr 1.5fr',
            background: 'rgba(6,9,17,0.65)',
            border: '1px solid rgba(148,163,184,0.10)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {/* ESTADO */}
          <div
            style={{
              ...kpiCell,
              borderLeft: 'none',
              background: godBet.active
                ? 'linear-gradient(180deg, rgba(60,15,15,0.35) 0%, rgba(20,6,6,0.15) 100%)'
                : 'linear-gradient(180deg, rgba(80,40,8,0.25) 0%, rgba(20,12,4,0.10) 100%)',
            }}
          >
            <span style={kpiLabel}>Estado</span>
            <span
              style={{
                ...kpiValue,
                fontSize: 16,
                letterSpacing: '0.14em',
                color: godBet.active ? '#f87171' : '#f59e0b',
              }}
            >
              {topPick ? 'CON PICK' : 'EN ESPERA'}
            </span>
          </div>

          {/* HUD */}
          <div style={kpiCell}>
            <span style={kpiLabel}>HUD</span>
            <span
              style={{
                ...kpiValue,
                fontSize: 14,
                color: '#67e8f9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {hudState}
            </span>
          </div>

          {/* RADAR */}
          <div style={kpiCell}>
            <span style={kpiLabel}>Radar</span>
            <span
              style={{
                ...kpiValue,
                fontSize: 15,
                color: godBet.radar_score >= 7 ? '#10b981' : '#cbd5e1',
              }}
            >
              {godBet.radar_score}<span style={{ fontSize: 10, color: '#475569', marginLeft: 1 }}>/10</span>
            </span>
          </div>

          {/* SIGMA / grupos */}
          <div
            style={{ ...kpiCell, alignItems: 'flex-end' }}
            title={`Grupos individuales de ${godBet.best_p_key ?? '—'} y su suma`}
          >
            <span style={{ ...kpiLabel, textAlign: 'right', width: '100%' }}>
              {({
                docenas: 'DOC', columnas: 'COL', color: 'CLR',
                paridad: 'PAR', rango: 'RNG',
              } as Record<string, string>)[godBet.best_p_key ?? ''] ?? (godBet.best_p_key ?? 'P').toUpperCase()}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 10,
                color: '#67e8f9',
                lineHeight: 1.35,
                whiteSpace: 'nowrap',
              }}
            >
              {(godBet.best_g1 ?? '—')} {godBet.best_p1 != null ? (godBet.best_p1 * 100).toFixed(1) : '—'}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 10,
                color: '#22d3ee',
                lineHeight: 1.35,
                whiteSpace: 'nowrap',
              }}
            >
              {(godBet.best_g2 ?? '—')} {godBet.best_p2 != null ? (godBet.best_p2 * 100).toFixed(1) : '—'}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 11,
                fontWeight: 900,
                color: '#e2e8f0',
                marginTop: 2,
              }}
            >
              Σ{godBet.best_p_raw != null ? (godBet.best_p_raw * 100).toFixed(1) : '—'}%
            </span>
          </div>
        </div>

        {/* ═══ Mesa CCS bar ═══ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '7px 12px',
            background: 'rgba(6,9,17,0.6)',
            border: '1px solid rgba(148,163,184,0.10)',
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >
          <span style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.24em', fontWeight: 800 }}>MESA</span>
          <div
            style={{
              flex: 1,
              height: 5,
              borderRadius: 1,
              overflow: 'hidden',
              background: 'rgba(15,23,42,0.9)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7)',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, ccsPct)}%`,
                background:
                  ccsPct >= 69
                    ? 'linear-gradient(90deg, #22d3ee 0%, #10b981 100%)'
                    : ccsPct >= 50
                    ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
                    : 'linear-gradient(90deg, #334155 0%, #475569 100%)',
                transition: 'width 400ms ease, background 200ms',
              }}
            />
            {/* tick marks a 50 y 70 */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '70%', width: 1, background: 'rgba(255,255,255,0.20)' }} />
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 13,
              fontWeight: 900,
              color: ccsPct >= 69 ? '#10b981' : ccsPct >= 50 ? '#f59e0b' : '#94a3b8',
              minWidth: 66,
              textAlign: 'right',
            }}
          >
            {ccsPct}/100
          </span>
        </div>

        {/* ═══ DASHBOARD — 3 columnas, todo siempre visible, sin acordeones:
             A) cabina de decisión, B) las 9 categorías, C) zona doc/col.
             Anchos fijos en A y C (su contenido es acotado — números
             chicos, no hace falta más aire) y B flexible entre un mínimo
             y un máximo, para que no se infle con espacio vacío cuando el
             panel es más ancho de lo que su contenido necesita. ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '270px minmax(520px, 580px) 320px', gap: 14, alignItems: 'start' }}>
        <div className="flex flex-col gap-3">

        {/* ═══ 2. DECISIÓN — escudo (en vivo) + GOD (alta precisión) ═══ */}
        <div className="flex flex-col gap-2">
          <SeccionLabel>Decisión</SeccionLabel>
          <CopilotOrder />

          {/* Pick concreto de cada mercado — el escudo dice QUÉ mercado
              (docenas o columnas), esto dice CUÁL docena/columna. Mismo
              bet_advice que lee la fila "Docenas"/"Columnas" de la tabla
              de abajo, sin tener que scrollear hasta ahí para verlo. */}
          {(() => {
            const advice: Record<string, any> = (payload as any)?.decision?.bet_advice ?? {};
            const docState = toState(advice['docenas']);
            const colState = toState(advice['columnas']);
            return (
              <div className="flex flex-col gap-1.5">
                <DocColQuickPick label="DOCENAS" state={docState} pick={pickLabel(advice['docenas'])} />
                <DocColQuickPick label="COLUMNAS" state={colState} pick={pickLabel(advice['columnas'])} />
              </div>
            );
          })()}

          <div style={{ marginTop: 4 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 8.5,
                color: '#64748b',
                letterSpacing: '0.16em',
                fontWeight: 700,
              }}
            >
              GOD · ALTA PRECISIÓN (motor alterno — activa solo con OPTIMAL + Radar ≥7)
            </span>
          </div>

          {topPick ? (
            <button
              onClick={() => handleBetClick(topPick)}
              disabled={loadingKey === topPick.bet_key}
              className="relative w-full flex flex-col p-3.5 rounded text-left transition-all group overflow-hidden"
              style={{
                fontFamily: MONO,
                background:
                  override?.bet_key === topPick.bet_key
                    ? 'linear-gradient(180deg, rgba(120,53,15,0.35) 0%, rgba(40,20,4,0.45) 100%)'
                    : 'linear-gradient(180deg, rgba(8,47,73,0.30) 0%, rgba(10,18,30,0.55) 100%)',
                border:
                  override?.bet_key === topPick.bet_key
                    ? '1px solid rgba(251,191,36,0.60)'
                    : '1px solid rgba(34,211,238,0.28)',
                boxShadow:
                  override?.bet_key === topPick.bet_key
                    ? '0 0 0 1px rgba(251,191,36,0.10) inset, 0 0 14px rgba(251,191,36,0.18)'
                    : '0 0 0 1px rgba(34,211,238,0.06) inset, 0 0 14px rgba(34,211,238,0.08)',
                borderRadius: 4,
              }}
            >
              <span
                className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l"
                style={{
                  borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251,191,36,0.75)' : 'rgba(34,211,238,0.55)',
                }}
              />
              <span
                className="absolute top-1 right-1 w-2.5 h-2.5 border-t border-r"
                style={{
                  borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251,191,36,0.75)' : 'rgba(34,211,238,0.55)',
                }}
              />
              <span
                className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b border-l"
                style={{
                  borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251,191,36,0.75)' : 'rgba(34,211,238,0.55)',
                }}
              />
              <span
                className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r"
                style={{
                  borderColor: override?.bet_key === topPick.bet_key ? 'rgba(251,191,36,0.75)' : 'rgba(34,211,238,0.55)',
                }}
              />

              <div className="flex justify-between items-center mb-2 relative">
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 2,
                    letterSpacing: '0.20em',
                    background: override?.bet_key === topPick.bet_key ? 'rgba(251,191,36,0.15)' : 'rgba(34,211,238,0.10)',
                    color: override?.bet_key === topPick.bet_key ? '#fcd34d' : '#67e8f9',
                    border: override?.bet_key === topPick.bet_key ? '1px solid rgba(251,191,36,0.30)' : '1px solid rgba(34,211,238,0.22)',
                  }}
                >
                  {override?.bet_key === topPick.bet_key ? '◉ TU APUESTA' : 'TARGET LOCK'}
                </span>
                {verdict?.override_forced_go ? (
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 8.5,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 2,
                      letterSpacing: '0.16em',
                      color: '#fde68a',
                      backgroundColor: 'rgba(251,191,36,0.08)',
                      border: '1px solid rgba(251,191,36,0.35)',
                    }}
                    title="Override forzó GO sobre threshold del Pilot (CCS ≥ 60% en mesa CAUTION)"
                  >
                    OVERRIDE FORZADO
                  </span>
                ) : null}
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 16,
                    fontWeight: 900,
                    color:
                      topPick.conf_pct >= 80 ? '#67e8f9'
                      : topPick.conf_pct >= 60 ? '#22d3ee'
                      : topPick.conf_pct >= 40 ? '#fbbf24'
                      : '#94a3b8',
                  }}
                >
                  {topPick.conf_pct}%
                </span>
              </div>
              <div className="flex justify-between items-end mt-1 relative gap-2">
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color: '#64748b',
                    letterSpacing: '0.20em',
                    fontWeight: 700,
                  }}
                >
                  {CAT_LABEL[topPick.bet_key] ?? topPick.bet_key.toUpperCase()}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 20,
                    fontWeight: 900,
                    letterSpacing: '0.02em',
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '65%',
                  }}
                >
                  {topPick.pick_pretty}
                </span>
              </div>
            </button>
          ) : (
            <div
              className="flex items-center justify-center p-3.5 rounded"
              style={{
                background: 'rgba(6,9,17,0.5)',
                border: '1px dashed rgba(100,116,139,0.30)',
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: '#475569',
                  fontWeight: 800,
                  letterSpacing: '0.22em',
                }}
              >
                GOD SIN TARGET — ESPERANDO
              </span>
            </div>
          )}
        </div>

        {/* ═══ 3. MARCADOR — escudo (en vivo) + target de GOD, lado a lado ═══ */}
        <div className="flex flex-col gap-2">
          <SeccionLabel>Marcador</SeccionLabel>
          <CopilotScoreboard />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'rgba(6,9,17,0.65)',
              border: '1px solid rgba(148,163,184,0.10)',
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: '#64748b',
                letterSpacing: '0.20em',
                fontWeight: 800,
              }}
            >
              ERRORES · GOD TARGET
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.12em' }}>CONSEC</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 900,
                    fontSize: 15,
                    color: consecErr > 0 ? '#ef4444' : '#94a3b8',
                  }}
                >
                  {consecErr}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.12em' }}>MÁX</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 900,
                    fontSize: 15,
                    color: '#ffffff',
                  }}
                >
                  {maxConsecErr}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.12em' }}>ERR/HIT</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 900,
                    fontSize: 15,
                    color: '#fb923c',
                  }}
                >
                  {errHit.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        </div>
        {/* ── fin columna A (decisión) / columna B (categorías) — BANKROLL
             ya no cierra acá: Gunner — "el bankroll ahi que da cortado y
             mal ubicado, quedaria mejor debajo de la celda de columns en
             la columna 3". Se movió al final de la columna C (ZONA). ── */}
        <div className="flex flex-col gap-3">

        {/* ═══ 4. SUGERENCIAS POR CATEGORÍA — las 9, siempre visibles,
             sin acordeón. Los picks de DOCENAS/COLUMNAS que importan para
             operar YA están a la izquierda, en DECISIÓN; esto es la lectura
             completa (color, paridad, rango, números, guardianes…). ═══ */}
        <div className="flex flex-col gap-2">
          <SeccionLabel>Sugerencias por categoría (las 9)</SeccionLabel>
          <CategoryTable payload={payload} counters={counters} errorHist={errorHist} />
          <GodBetPanel
            payload={payload}
            counters={counters}
            countersGod={godBet.counters_god ?? {}}
            errorHist={errorHist}
            errorHistGod={errorHist}
            godActive={godBet.active}
            radarScore={godBet.radar_score}
          />
        </div>

        </div>
        {/* ── fin columna B / columna C (zona) — propia columna para que
             "las celdas" nunca queden abajo de la tabla de categorías
             esperando scroll ── */}
        <div className="flex flex-col gap-2">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 1 }}>
            <SeccionLabel>Zona</SeccionLabel>
            <ZoneQuickBadges />
          </div>
          {/* apiladas (doc arriba, col abajo), versión COMPACTA: Gunner —
              "la celda de columnas debe estar por debajo de la de docenas
              mostrando su eficiencia si no no sirve". Con la tarjeta
              completa (MarketColumn) DOCENAS por sí sola ya ocupa casi
              toda la columna y COLUMNAS queda fuera de vista. compact
              usa MarketEfficiencyCell — zona, HUD/ENT, últimos 10, %
              acierto + techo de errores, qué hacer — nada más, para que
              las dos entren sin scroll. */}
          <ZoneDetailGrid direction="column" compact />

          {/* ═══ BANKROLL — reubicado acá (debajo de COLUMNAS), pedido de
               Gunner: antes cerraba la columna A y quedaba cortado/mal
               ubicado. Misma columna angosta que las celdas de zona. ═══ */}
          <div style={{ marginTop: 4 }}>
            <SeccionLabel>Bankroll</SeccionLabel>
          </div>
          <BankrollLedger bankroll={bankroll} />
        </div>

        </div>
        {/* ── fin dashboard 3 columnas ── */}
      </div>
    </div>
  );
}
