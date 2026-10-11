// src/components/Quantumpilot.tsx
// QuantumPilot — Overlay flotante draggable. Cockpit único.
//
// v2 — REDISEÑO COMPLETO (sep 2026). Antes este panel mezclaba dos motores
// de decisión sin avisar cuál era cuál (GOD legacy vs copiloto, el que está
// documentado en el manual y el que de verdad corre en cada giro), y tenía
// TRES marcadores de aciertos/errores distintos calculados de formas
// distintas. Se reorganizó así:
//
//   1. Estado + HUD/RADAR/Σp + barra CCS        (igual que antes)
//   2. DECISIÓN   — orden del copiloto (CopilotOrder, de MatrixPanel) arriba,
//                   TARGET LOCK de GOD debajo, cada uno rotulado con su
//                   fuente. Son dos motores reales y distintos — no se
//                   fusionan los números, solo se ordenan visualmente juntos.
//   3. MARCADOR   — CopilotScoreboard + ERRORES (target de GOD) lado a
//                   lado, en vez de tres cajas sueltas por la app.
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
// v4 (sep 2026) — CORRECCIÓN: Gunner probó v3 en vivo y lo rechazó — "los
// textos son pequeños no es facil leer, no hay separacion clara, no hay
// cian flash no hay micropaneles". v3 interpretó "sin cards" como cero
// contenedores; la corrección en los 5 archivos es MICROPANEL (una sola
// capa de borde+fondo+glow por bloque, nunca anidada) + tamaños de fuente
// más grandes + glow cian reinstalado. En este archivo puntualmente:
//   - La barra ESTADO/HUD/RADAR/Σp y la barra MESA pasan a vivir dentro de
//     UN micropanel cada una (antes eran filas sueltas sin separación real
//     del resto del scroll).
//   - DocColQuickPick y el botón TARGET LOCK pasan de "acento lateral +
//     texto" a micropanel completo (borde + fondo tenue del color de
//     estado) — más fácil de ubicar de un vistazo.
//   - FIX real encontrado al mirar la captura: el pick de COLUMNAS se
//     cortaba con elipsis ("Columna 3 / Colum…") y tapaba la info que el
//     operador necesita para jugar. Se sacó el maxWidth/ellipsis — ahora
//     el texto se ve completo (envuelve si hace falta).
//   - ERRORES · GOD TARGET también pasa a su propio micropanel, igual que
//     CopilotScoreboard en MatrixPanel.tsx.
//   - Band (el separador de sección) recupera el glow cian en el texto.
//
// Tracker de override (sin cambios):
//   - Click en TARGET LOCK o en cualquier sugerencia → POST /api/pilot/override
//   - GET /api/pilot/override al montar para sincronizar estado
//   - El backend cuenta wins/losses sobre la apuesta elegida por el usuario.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EnginePayload } from '@/types/api';
import { PilotTerminal } from '@/components/pilot/PilotTerminal';
import { BankrollBar } from '@/components/pilot/BankrollBar';
import { C as PILOT_C, densityForHeight, shellHeightFor } from '@/components/pilot/theme';
import { useCopLiveStreak } from '@/store/telemetryStore';

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

// Posición inicial vertical: 100 px si la ventana es alta; si es de portátil se
// sube para que el panel (~600 px de alto) quede ENTERO a la vista sin tener
// que arrastrarlo. Solo el arranque — el usuario lo mueve igual que siempre.
function initialY(): number {
  if (typeof window === 'undefined') return 100;
  const alto = shellHeightFor(densityForHeight(window.innerHeight));
  return Math.max(8, Math.min(100, window.innerHeight - alto - 8));
}

// ── Componente principal ─────────────────────────────────────────

export function QuantumPilot({
  godBet,
  payload,
  counters,
  bankroll,
  errorHist = {},
}: Props) {
  const { pos, onMouseDown } = useDrag({ x: 20, y: initialY() });
  const [minimized, setMinimized] = useState(false);
  const copLive = useCopLiveStreak();   // solo para el color del borde (lectura del store)

  const [override, setOverride] = useState<OverrideState | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const verdict = godBet.last_verdict;
  const pickBet = verdict?.pick_bet ?? null;
  const isGo = verdict?.verdict === 'GO';
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
  // v8 (oct 2026) — TERMINAL DE LECTURA RÁPIDA: el cuerpo vive en
  // components/pilot/PilotTerminal.tsx (3 niveles, una pantalla, sin scroll).
  // Acá solo queda el cascarón flotante (drag, minimizar, borde) y la lógica de
  // GOD/override de siempre, pasada por props.
  const radarScore = godBet.radar_score;
  const lockLoading = !!topPick && loadingKey === topPick.bet_key;
  const isOverride = !!topPick && override?.bet_key === topPick.bet_key;

  // Borde ambiente = errores seguidos del marcador real (cian calmado → ámbar
  // a 3 → rojo a 4+). Es lo ÚNICO que cambia el cascarón; GOD ya no pinta todo
  // el panel de rojo (su estado vive en el bloque GOD y en la tabla).
  const borde =
    copLive >= 4 ? 'rgba(255, 77, 99, 0.75)'
    : copLive === 3 ? 'rgba(245, 178, 58, 0.6)'
    : 'rgba(51, 208, 232, 0.28)';

  return (
    <div
      className="fixed z-50 w-[1060px] max-w-[95vw] max-h-[96vh] rounded-lg overflow-hidden select-none flex flex-col"
      data-qp="shell"
      style={{
        left: pos.x,
        top: pos.y,
        background: PILOT_C.bg0,
        color: PILOT_C.ink,
        border: `1px solid ${borde}`,
        boxShadow: '0 10px 36px rgba(0, 0, 0, 0.65)',
      }}
    >
      {/* ═══ Header (arrastrable) ═══ */}
      <div
        className="flex items-center justify-between px-3 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        style={{ height: 28, flexShrink: 0, background: PILOT_C.bg0, borderBottom: `1px solid ${PILOT_C.line}` }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span style={{ color: godBet.active ? PILOT_C.white : PILOT_C.danna, fontSize: 14 }} className={godBet.active ? 'animate-pulse' : ''}>⚡</span>
          <span style={{ fontFamily: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif", fontWeight: 700, fontSize: 13.5, color: PILOT_C.ink }}>Quantum Pilot</span>
        </div>
        {/* BANKROLL & LEDGER — barra de estado en el encabezado (manual, local).
            Sin arrastre: los campos son editables. */}
        <div
          className="flex-1 min-w-0 mx-3 cursor-default"
          style={{ height: '100%' }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <BankrollBar />
        </div>
        <button
          type="button"
          aria-label="Minimizar Quantum Pilot"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized(true)}
          className="px-2 text-lg leading-none transition-colors"
          style={{ color: PILOT_C.ink3 }}
        >
          —
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pilot-scroll" data-qp="body">
        <PilotTerminal
          payload={payload}
          god={{
            active: godBet.active,
            hudState,
            radar: radarScore,
            bestKey: godBet.best_p_key,
            g1: godBet.best_g1, g2: godBet.best_g2,
            p1: godBet.best_p1, p2: godBet.best_p2, pRaw: godBet.best_p_raw,
            topPick: topPick ? { bet_key: topPick.bet_key, pick_pretty: topPick.pick_pretty, conf_pct: topPick.conf_pct } : null,
            catLabel: topPick ? (CAT_LABEL[topPick.bet_key] ?? topPick.bet_key.toUpperCase()) : '',
            isOverride,
            loading: lockLoading,
            forcedGo: !!verdict?.override_forced_go,
            onLock: () => { if (topPick) handleBetClick(topPick); },
          }}
          godTarget={{ hits, misses, consec: consecErr, max: maxConsecErr, errHit }}
          table={{
            counters,
            countersGod: godBet.counters_god ?? {},
            errorHist,
            godActive: godBet.active,
            radarScore,
          }}
        />
      </div>
    </div>
  );
}
