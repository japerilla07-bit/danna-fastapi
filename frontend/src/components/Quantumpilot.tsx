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
// v3 (sep 2026) — REDISEÑO "INSTRUMENT PANEL" (sin cards), mismo pase que
// MatrixPanel.tsx/CategoryTable.tsx/GodBetPanel.tsx/BankrollLedger.tsx.
// Lo que cambió es SOLO presentación — cero lógica nueva, cero cambio de
// props, cero cambio de comportamiento de click/override:
//   - La fila "ESTADO/HUD/RADAR/Σp" eran 4 cajas con fondo en gradiente,
//     borde y sombra cada una. Ahora es UNA barra de instrumento con
//     divisores finos de 1px — el mismo patrón que ya usaba
//     CopilotScoreboard (MatrixPanel.tsx) — así todo el panel habla un solo
//     idioma visual.
//   - "MESA" (barra CCS) perdió la caja alrededor; la barra en sí (el
//     gauge) se mantiene — un medidor es exactamente lo que corresponde en
//     un instrument panel, lo que sobraba era el marco.
//   - DocColQuickPick (pick de docenas/columnas) y el botón TARGET LOCK de
//     GOD perdieron el fondo en pill/gradiente, el borde y los corner-
//     brackets decorativos. Quedan como acento lateral + texto — el único
//     glow real del panel sigue siendo el pick activo de TARGET LOCK (ahí
//     sí hay algo "pasando ahora"), no cada número de la pantalla.
//   - "ERRORES · GOD TARGET" era una fila en caja; ahora es una segunda
//     barra de instrumento igual a CopilotScoreboard (CONSEC / MÁX /
//     ERR/HIT con divisores), para no mezclar dos lenguajes visuales en la
//     misma columna.
//   - SeccionLabel pasó a ser una "banda": el mismo texto rotulador de
//     siempre + una línea fina debajo, marcando el corte entre secciones
//     en vez de dejar todo flotando en el mismo espacio.
//   - La grilla de 3 columnas (260px / 545-600px / 320px), el acordeón-less
//     layout, CategoryTable/GodBetPanel/ZoneDetailGrid/BankrollLedger y
//     TODA la lógica de abajo (useDrag, ParticleCanvas, override, topPick,
//     fetch de /api/pilot/override) quedan intactos.
//
// Tracker de override (sin cambios):
//   - Click en TARGET LOCK o en cualquier sugerencia → POST /api/pilot/override
//   - GET /api/pilot/override al montar para sincronizar estado
//   - El backend cuenta wins/losses sobre la apuesta elegida por el usuario.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EnginePayload } from '@/types/api';
import { CopilotOrder, CopilotScoreboard, ZoneDetailGrid, ZoneQuickBadges } from '@/components/MatrixPanel';
import { CategoryTable, toState, pickLabel, type BadgeState } from '@/components/CategoryTable';
import { GodBetPanel } from '@/components/GodBetPanel';
import { BankrollLedger } from '@/components/BankrollLedger';

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

// Banda de sección: rótulo + línea fina debajo, reutilizada en todo el
// cockpit para que cada bloque diga de dónde sale el número (evita el
// "¿cuál marcador miro?") y marque el corte con la sección siguiente sin
// meter una caja — es la idea de "banda" de la crítica de Gunner, aplicada
// como el separador estándar de todo el panel. `right` es para contenido
// extra alineado a la derecha del rótulo (p. ej. los chips de ZONA).
function Band({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(34, 211, 238, 0.15)', paddingBottom: 4,
      }}
    >
      <span className="text-[11px] text-cyan-500/70" style={{ letterSpacing: '0.3em' }}>{children}</span>
      {right}
    </div>
  );
}

// Pick concreto de DOCENAS/COLUMNAS (1-12, Col 2, etc.) — responde el
// reclamo de Gunner: el veredicto del escudo ("DOCENAS · ENTRÁ") dice QUÉ
// MERCADO, no CUÁL docena/columna específica. Lee bet_advice con la MISMA
// función (toState/pickLabel) que usa CategoryTable, así nunca puede mostrar
// algo distinto de lo que dice la fila "Docenas"/"Columnas" de la tabla.
// Va pegado a CopilotOrder, arriba de todo — cero scroll para verlo.
//
// v3: sin pill de fondo — acento lateral del color de estado + texto, igual
// que el resto de los bloques de estado de este rediseño. El badge BET/PRB/
// WT pasa de chip con fondo a texto plano del mismo color.
const BADGE_COLOR: Record<BadgeState, string> = { bet: '#4ade80', prb: '#fbbf24', wt: '#6b7280' };
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

function DocColQuickPick({ label, state, pick }: { label: string; state: BadgeState; pick: string }) {
  const color = BADGE_COLOR[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderLeft: `3px solid ${color}`, paddingLeft: 9 }}>
      <span className="text-[10px] font-bold text-gray-400 shrink-0" style={{ letterSpacing: '0.15em' }}>{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-[9px] font-bold shrink-0" style={{ color, letterSpacing: '0.1em' }}>{BADGE_TXT[state]}</span>
        <span
          title={pick}
          className="text-[13px] font-black text-white"
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}
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
      className="fixed z-50 w-[1200px] max-w-[95vw] max-h-[96vh] rounded-xl overflow-hidden font-mono text-gray-200 select-none flex flex-col"
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
            className="font-bold text-[15px]"
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

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col p-4 gap-3 pilot-scroll">
        {/* ═══ 1. Estado verdict — una sola barra de instrumento, divisores
             finos en vez de 4 cajas sueltas. Mismo patrón que
             CopilotScoreboard (MatrixPanel.tsx). ═══ */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(34, 211, 238, 0.12)', paddingBottom: 8 }}>
          <div style={{ flex: 1, paddingRight: 12, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="text-[11px] text-gray-500" style={{ letterSpacing: '0.25em' }}>ESTADO</span>
            <span
              className="font-black text-base"
              style={{
                letterSpacing: '0.08em', marginTop: 2,
                color: godBet.active ? '#f87171' : '#fbbf24',
                textShadow: godBet.active
                  ? '0 0 10px rgba(248, 113, 113, 0.6)'
                  : '0 0 10px rgba(251, 191, 36, 0.5)',
              }}
            >
              {topPick ? 'CON PICK' : 'EN ESPERA'}
            </span>
          </div>
          <div style={{ padding: '0 12px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 64 }}>
            <span className="text-[11px] text-gray-500" style={{ letterSpacing: '0.2em' }}>HUD</span>
            <span className="font-bold text-[13px] truncate" style={{ color: '#67e8f9', marginTop: 2 }}>{hudState}</span>
          </div>
          <div style={{ padding: '0 12px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 54 }}>
            <span className="text-[11px] text-gray-500" style={{ letterSpacing: '0.2em' }}>RADAR</span>
            <span className="font-black text-base" style={{ color: godBet.radar_score >= 7 ? '#4ade80' : '#cbd5e1', marginTop: 2 }}>
              {godBet.radar_score}/10
            </span>
          </div>
          <div
            style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 90 }}
            title={`Grupos individuales de ${godBet.best_p_key ?? '—'} y su suma`}
          >
            <span className="text-[10px] text-gray-500" style={{ letterSpacing: '0.12em' }}>
              {({
                docenas: 'DOC', columnas: 'COL', color: 'CLR',
                paridad: 'PAR', rango: 'RNG',
              } as Record<string, string>)[godBet.best_p_key ?? ''] ?? (godBet.best_p_key ?? 'P').toUpperCase()}
            </span>
            <span className="text-[11px] font-mono text-cyan-400 leading-tight">
              {(godBet.best_g1 ?? '—')} {godBet.best_p1 != null ? (godBet.best_p1 * 100).toFixed(1) : '—'}
            </span>
            <span className="text-[11px] font-mono text-cyan-500 leading-tight">
              {(godBet.best_g2 ?? '—')} {godBet.best_p2 != null ? (godBet.best_p2 * 100).toFixed(1) : '—'}
            </span>
            <span className="font-black text-xs font-mono" style={{ color: '#67e8f9' }}>
              Σ{godBet.best_p_raw != null ? (godBet.best_p_raw * 100).toFixed(1) : '—'}%
            </span>
          </div>
        </div>

        {/* ═══ Mesa CCS bar — el gauge se mantiene (es un medidor real, no
             una card); lo que se sacó fue el marco alrededor. ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="text-[11px] text-gray-500" style={{ letterSpacing: '0.2em' }}>MESA</span>
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(15, 23, 42, 0.8)' }}
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
              }}
            />
          </div>
          <span className={`text-[13px] font-bold ${fmtPctClass(ccsPct)}`}>{ccsPct}/100</span>
        </div>

        {/* ═══ DASHBOARD — 3 columnas, todo siempre visible, sin acordeones:
             A) cabina de decisión, B) las 9 categorías, C) zona doc/col.
             Anchos fijos en A y C (su contenido es acotado — números
             chicos, no hace falta más aire) y B flexible entre un mínimo
             y un máximo, para que no se infle con espacio vacío cuando el
             panel es más ancho de lo que su contenido necesita. ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(545px, 600px) 320px', gap: 14, alignItems: 'start' }}>
        <div className="flex flex-col gap-3">

        {/* ═══ 2. DECISIÓN — escudo (en vivo) + GOD (alta precisión) ═══ */}
        <div className="flex flex-col gap-1.5">
          <Band>DECISIÓN</Band>
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

          <div className="mt-1">
            <span className="text-[10px] text-gray-500 px-1" style={{ letterSpacing: '0.2em' }}>
              GOD · ALTA PRECISIÓN (motor alterno — activa solo con OPTIMAL + Radar ≥7)
            </span>
          </div>

          {/* v3: sin caja/corner-brackets — acento lateral del color activo
              (ámbar = override del operador, cian = target normal del motor)
              + texto. El glow grande en el pick (pick_pretty) es el único
              glow fuerte de esta columna: es la decisión en curso. */}
          {topPick ? (
            <button
              onClick={() => handleBetClick(topPick)}
              disabled={loadingKey === topPick.bet_key}
              className="w-full text-left transition-all"
              style={{
                background: 'none',
                border: 'none',
                borderLeft: override?.bet_key === topPick.bet_key ? '3px solid #fbbf24' : '3px solid #22d3ee',
                paddingLeft: 11,
                cursor: 'pointer',
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <span
                  className="text-[12px] font-bold"
                  style={{ letterSpacing: '0.2em', color: override?.bet_key === topPick.bet_key ? '#fcd34d' : '#67e8f9' }}
                >
                  {override?.bet_key === topPick.bet_key ? '◉ TU APUESTA' : 'TARGET LOCK'}
                </span>
                {verdict?.override_forced_go ? (
                  <span
                    className="text-[9.5px] font-bold"
                    style={{ letterSpacing: '0.15em', color: '#fde68a' }}
                    title="Override forzó GO sobre threshold del Pilot (CCS ≥ 60% en mesa CAUTION)"
                  >
                    ⚠ OVERRIDE FORZADO
                  </span>
                ) : null}
                <span
                  className="text-base font-black"
                  style={{
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
              <div className="flex justify-between items-end">
                <span className="text-[13px] text-gray-500" style={{ letterSpacing: '0.2em' }}>
                  {CAT_LABEL[topPick.bet_key] ?? topPick.bet_key.toUpperCase()}
                </span>
                <span
                  className="text-2xl font-black tracking-wider"
                  style={{
                    color: '#ffffff',
                    textShadow:
                      override?.bet_key === topPick.bet_key
                        ? '0 0 14px rgba(251, 191, 36, 0.7)'
                        : '0 0 12px rgba(34, 211, 238, 0.5)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {topPick.pick_pretty}
                </span>
              </div>
            </button>
          ) : (
            <div style={{ borderLeft: '3px solid #475569', paddingLeft: 11, padding: '2px 0 2px 11px' }}>
              <span className="text-[12px] text-gray-600 font-bold" style={{ letterSpacing: '0.2em' }}>
                GOD SIN TARGET — ESPERANDO
              </span>
            </div>
          )}
        </div>

        {/* ═══ 3. MARCADOR — escudo (en vivo) + target de GOD, lado a lado.
             v3: la fila ERRORES pasa a ser una segunda barra de instrumento
             (mismos divisores de CopilotScoreboard), en vez de una caja con
             fondo propio — las dos filas de esta columna hablan el mismo
             idioma visual ahora. ═══ */}
        <div className="flex flex-col gap-1.5">
          <Band>MARCADOR</Band>
          <CopilotScoreboard />
          <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
            <span className="text-[10px] text-gray-500" style={{ letterSpacing: '0.15em', minWidth: 110 }}>
              GOD TARGET
            </span>
            <div style={{ display: 'flex', flex: 1 }}>
              <div style={{ flex: 1, padding: '0 10px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[9px] text-gray-500" style={{ letterSpacing: '0.1em' }}>CONSEC</div>
                <div className="font-bold text-sm" style={{ color: consecErr > 0 ? '#f87171' : '#94a3b8' }}>{consecErr}</div>
              </div>
              <div style={{ flex: 1, padding: '0 10px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[9px] text-gray-500" style={{ letterSpacing: '0.1em' }}>MÁX</div>
                <div className="font-bold text-sm text-white">{maxConsecErr}</div>
              </div>
              <div style={{ flex: 1, padding: '0 10px' }}>
                <div className="text-[9px] text-gray-500" style={{ letterSpacing: '0.1em' }}>ERR/HIT</div>
                <div className="font-bold text-sm" style={{ color: '#fb923c' }}>{errHit.toFixed(1)}</div>
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
        <div className="flex flex-col gap-1.5">
          <Band>SUGERENCIAS POR CATEGORÍA (las 9)</Band>
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
        <div className="flex flex-col gap-1.5">
          <Band right={<ZoneQuickBadges />}>ZONA</Band>
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
          <Band>BANKROLL</Band>
          <BankrollLedger bankroll={bankroll} />
        </div>

        </div>
        {/* ── fin dashboard 3 columnas ── */}
      </div>
    </div>
  );
}
