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
        borderBottom: '1px solid rgba(34, 211, 238, 0.3)', paddingBottom: 5,
      }}
    >
      <span
        className="text-[12px] font-bold"
        style={{ letterSpacing: '0.3em', color: '#22d3ee', textShadow: '0 0 9px rgba(34,211,238,0.6)' }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

// Micropanel genérico — borde + fondo sutil + glow, UNA sola capa. Mismo
// criterio que microPanel() en MatrixPanel.tsx, replicado acá porque este
// archivo no importa estilos de ese módulo.
//
// v7 (oct 2026) — rediseño cockpit: backdrop-filter real (glassmorphism),
// mismo cambio que en MatrixPanel.tsx — pedido explícito de Gunner sobre el
// prototipo. Cero cambio de lógica.
function microPanel(accent: string, glowStrength = 0.14): React.CSSProperties {
  const alphaHex = Math.round(glowStrength * 255).toString(16).padStart(2, '0');
  return {
    border: `1px solid ${accent}66`,
    background: 'rgba(10, 16, 28, 0.55)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: 10,
    boxShadow: `0 0 16px ${accent}${alphaHex}, inset 0 1px 0 ${accent}14`,
  };
}

// Pick concreto de DOCENAS/COLUMNAS (1-12, Col 2, etc.) — responde el
// reclamo de Gunner: el veredicto del copiloto ("DOCENAS · ENTRÁ") dice QUÉ
// MERCADO, no CUÁL docena/columna específica. Lee bet_advice con la MISMA
// función (toState/pickLabel) que usa CategoryTable, así nunca puede mostrar
// algo distinto de lo que dice la fila "Docenas"/"Columnas" de la tabla.
// Va pegado a CopilotOrder, arriba de todo — cero scroll para verlo.
//
// v4: micropanel completo (borde + fondo del color de estado) en vez de
// solo acento lateral — más fácil de ubicar de un vistazo. FIX real: el
// pick se cortaba con elipsis (maxWidth:150) y tapaba la segunda columna/
// docena sugerida — eso es información que el operador necesita para
// jugar, nunca se debe ocultar. Ahora el texto se ve completo, envuelve en
// dos líneas si hace falta en vez de truncarse.
// v7 (oct 2026): PRB deja de ser ámbar (blanco neón, mismo criterio que en
// CategoryTable.tsx/MatrixPanel.tsx). WT pasa de gris a cian — ya no hace
// falta reservar el gris para "sin acción": ahora el color vive en el fondo
// de la píldora, no en todo el bloque.
const BADGE_COLOR: Record<BadgeState, string> = { bet: '#4ade80', prb: '#f4f8ff', wt: '#67e8f9' };
const BADGE_BG: Record<BadgeState, string> = {
  bet: 'rgba(74,222,128,0.14)', prb: 'rgba(244,248,255,0.12)', wt: 'rgba(34,211,238,0.12)',
};
const BADGE_TXT: Record<BadgeState, string> = { bet: 'BET', prb: 'PRB', wt: 'WT' };

// v7: pasa de micropanel propio a FILA dentro de la tarjeta DECISIÓN (ver
// el nuevo render más abajo) — Gunner pidió que ZONA/DECISIÓN/MARCADOR/
// BANKROLL/tabla sean, cada uno, UNA sola tarjeta; DOCENAS y COLUMNAS viven
// ahora como dos filas de esa tarjeta, separadas por una línea fina en vez
// de ser dos cajas propias dentro de otra caja.
function DocColQuickPick({ label, state, pick, last = false }: { label: string; state: BadgeState; pick: string; last?: boolean }) {
  const color = BADGE_COLOR[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 2px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.055)' }}>
      <span className="flex items-center gap-2 shrink-0">
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="text-[13.5px] text-gray-400" style={{ letterSpacing: '0.1em' }}>{label}</span>
      </span>
      <span className="flex items-center gap-2 min-w-0" style={{ justifyContent: 'flex-end' }}>
        <span
          style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color,
            background: BADGE_BG[state], borderRadius: 4, padding: '3px 7px', flexShrink: 0,
          }}
        >
          {BADGE_TXT[state]}
        </span>
        <span
          title={pick}
          className="font-black text-white"
          style={{ fontSize: 19, whiteSpace: 'normal', overflowWrap: 'break-word', textAlign: 'right', lineHeight: 1.25 }}
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
      className="fixed z-50 w-[1060px] max-w-[95vw] max-h-[96vh] rounded-xl overflow-hidden font-mono text-gray-200 select-none flex flex-col"
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
        {/* ═══ 1. Estado verdict — UN micropanel con divisores internos,
             igual que CopilotScoreboard (MatrixPanel.tsx). v4: antes era
             una fila suelta sin separación real del resto del scroll. ═══ */}
        <div style={{ display: 'flex', alignItems: 'stretch', padding: '10px 4px', ...microPanel('#22d3ee', 0.1) }}>
          <div style={{ flex: 1, padding: '0 14px', borderRight: '1px solid rgba(34,211,238,0.2)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="text-[11.5px] text-gray-400" style={{ letterSpacing: '0.25em' }}>ESTADO</span>
            <span
              className="font-black text-lg"
              style={{
                letterSpacing: '0.08em', marginTop: 3,
                color: godBet.active ? '#f87171' : '#f4f8ff',
                textShadow: godBet.active
                  ? '0 0 12px rgba(248, 113, 113, 0.7)'
                  : '0 0 12px rgba(244, 248, 255, 0.55)',
              }}
            >
              {topPick ? 'CON PICK' : 'EN ESPERA'}
            </span>
          </div>
          <div style={{ padding: '0 14px', borderRight: '1px solid rgba(34,211,238,0.2)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 72 }}>
            <span className="text-[11.5px] text-gray-400" style={{ letterSpacing: '0.2em' }}>HUD</span>
            <span className="font-bold text-[15px] truncate" style={{ color: '#67e8f9', marginTop: 3, textShadow: '0 0 7px rgba(103,232,249,0.5)' }}>{hudState}</span>
          </div>
          <div style={{ padding: '0 14px', borderRight: '1px solid rgba(34,211,238,0.2)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 58 }}>
            <span className="text-[11.5px] text-gray-400" style={{ letterSpacing: '0.2em' }}>RADAR</span>
            <span className="font-black text-lg" style={{ color: godBet.radar_score >= 7 ? '#4ade80' : '#cbd5e1', marginTop: 3 }}>
              {godBet.radar_score}/10
            </span>
          </div>
          <div
            style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 96 }}
            title={`Grupos individuales de ${godBet.best_p_key ?? '—'} y su suma`}
          >
            <span className="text-[10.5px] text-gray-400" style={{ letterSpacing: '0.12em' }}>
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
            <span className="font-black text-sm font-mono" style={{ color: '#67e8f9', textShadow: '0 0 7px rgba(103,232,249,0.5)' }}>
              Σ{godBet.best_p_raw != null ? (godBet.best_p_raw * 100).toFixed(1) : '—'}%
            </span>
          </div>
        </div>

        {/* ═══ Mesa CCS bar — micropanel propio, el gauge en sí se mantiene
             como estaba (es un medidor real, no una card). ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', ...microPanel('#22d3ee', 0.08) }}>
          <span className="text-[11.5px] text-gray-400" style={{ letterSpacing: '0.2em' }}>MESA</span>
          <div
            className="flex-1 h-2 rounded-full overflow-hidden"
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
                    ? 'linear-gradient(90deg, #a8b7cc 0%, #f4f8ff 100%)'
                    : 'linear-gradient(90deg, #475569 0%, #64748b 100%)',
                boxShadow: ccsPct >= 50 ? '0 0 8px rgba(34,211,238,0.5)' : 'none',
              }}
            />
          </div>
          <span className={`text-[14px] font-bold ${fmtPctClass(ccsPct)}`}>{ccsPct}/100</span>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
             v7 (oct 2026) — REDISEÑO COCKPIT COMPLETO. Gunner: "olvida lo
             que tenemos empieza de cero investiga busca y encuentra la
             mejor interfaz". Se validó layout + paleta + tipografía sobre
             un prototipo interactivo (Artifact) antes de tocar este
             archivo — layout aprobado:
               ZONA (rail izq.) | DECISIÓN (centro, héroe) | MARCADOR +
               BANKROLL (rail der.) — las tres, UNA tarjeta glass cada una.
               SUGERENCIAS POR CATEGORÍA pasa a franja de ancho completo
               debajo (antes era la columna central B, angosta y con la
               tabla comprimida).
             Reglas de layout (feedback puntual de Gunner sobre el
             prototipo, aplicadas acá):
               1. Glassmorphism real (microPanel() ya trae backdrop-filter
                  desde este mismo pase — ver arriba).
               2. Blanco neón en vez de naranja/ámbar en toda la columna
                  DECISIÓN/MARCADOR (ver TARGET LOCK, GOD TARGET, badges).
               3. Glow reservado a lo crítico: el pick activo, P&L,
                  aciertos/errores — el resto queda mate.
               4. MARCADOR + GOD TARGET comparten UNA tarjeta, separados por
                  tono (no por línea) — mismo criterio que ZONA
                  (ZoneDetailGrid `grouped`).
               5. Badges + zebra en la tabla — ver CategoryTable.tsx.
             DECISIÓN es la única sección que NO se volvió una tarjeta
             externa nueva: CopilotOrder/DocColQuickPick/TARGET LOCK ya eran
             3-4 micropaneles independientes (arquitectura que v6 fijó a
             propósito — "nunca anidar"). En vez de meterlos dentro de una
             quinta caja (lo que duplicaría bordes), CopilotOrder pasa a
             `bare` + `hero` y las demás piezas se aplanan a filas — el
             resultado visual es UNA tarjeta (igual al prototipo), sin cajas
             anidadas en el código. ═══════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '264px 1fr 236px', gap: 14, alignItems: 'start' }}>

        {/* ── COLUMNA IZQUIERDA: ZONA — ahora rail, UNA tarjeta (antes
             columna C, dos micropaneles sueltos). ── */}
        <div className="flex flex-col gap-1.5">
          <Band right={<ZoneQuickBadges />}>ZONA</Band>
          <ZoneDetailGrid direction="column" compact grouped />
        </div>

        {/* ── COLUMNA CENTRAL: DECISIÓN — tratamiento héroe. UNA tarjeta
             (microPanel acá, bare+hero en CopilotOrder adentro). ── */}
        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 4, ...microPanel('#67e8f9', 0.06) }}>
          <Band>DECISIÓN</Band>
          <div style={{ marginTop: 10 }}>
            <CopilotOrder hero bare />
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 0 2px' }} />

          {/* Pick concreto de cada mercado — el copiloto dice QUÉ mercado
              (docenas o columnas), esto dice CUÁL docena/columna. Mismo
              bet_advice que lee la fila "Docenas"/"Columnas" de la tabla
              de abajo, sin tener que scrollear hasta ahí para verlo.
              v7: pasan de 2 micropaneles propios a 2 filas de esta misma
              tarjeta, separadas por una línea fina. */}
          {(() => {
            const advice: Record<string, any> = (payload as any)?.decision?.bet_advice ?? {};
            const docState = toState(advice['docenas']);
            const colState = toState(advice['columnas']);
            return (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <DocColQuickPick label="DOCENAS" state={docState} pick={pickLabel(advice['docenas'])} />
                <DocColQuickPick label="COLUMNAS" state={colState} pick={pickLabel(advice['columnas'])} last />
              </div>
            );
          })()}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0 10px' }} />

          <span className="text-[10px] text-gray-500" style={{ letterSpacing: '0.2em' }}>
            GOD · ALTA PRECISIÓN (motor alterno — activa solo con OPTIMAL + Radar ≥7)
          </span>

          {/* v7: deja de tener microPanel() propio (eso anidaría una caja
              dentro de la tarjeta DECISIÓN) — pasa a borde + lavado de
              fondo tenue, sin boxShadow de halo exterior. El glow fuerte
              sigue siendo el del pick (pick_pretty): es la decisión en
              curso, el dato más crítico de todo el panel. Blanco neón en
              vez de ámbar para el estado "override del operador" (antes
              #fbbf24/#fcd34d/#fde68a). */}
          {topPick ? (
            <button
              onClick={() => handleBetClick(topPick)}
              disabled={loadingKey === topPick.bet_key}
              className="w-full text-left transition-all"
              style={{
                padding: '15px 16px',
                marginTop: 8,
                borderRadius: 8,
                border: `1px solid ${override?.bet_key === topPick.bet_key ? 'rgba(244,248,255,0.35)' : 'rgba(34,211,238,0.35)'}`,
                background: override?.bet_key === topPick.bet_key ? 'rgba(244,248,255,0.07)' : 'rgba(34,211,238,0.07)',
                cursor: 'pointer',
              }}
            >
              <div className="flex justify-between items-center mb-1.5">
                <span
                  className="text-[14px] font-bold"
                  style={{ letterSpacing: '0.2em', color: override?.bet_key === topPick.bet_key ? '#f4f8ff' : '#67e8f9' }}
                >
                  {override?.bet_key === topPick.bet_key ? '◉ TU APUESTA' : 'TARGET LOCK'}
                </span>
                {verdict?.override_forced_go ? (
                  <span
                    className="text-[10.5px] font-bold"
                    style={{ letterSpacing: '0.15em', color: '#f4f8ff' }}
                    title="Override forzó GO sobre threshold del Pilot (CCS ≥ 60% en mesa CAUTION)"
                  >
                    ⚠ OVERRIDE FORZADO
                  </span>
                ) : null}
                <span
                  className="text-xl font-black"
                  style={{
                    color:
                      topPick.conf_pct >= 80 ? '#67e8f9'
                        : topPick.conf_pct >= 60 ? '#22d3ee'
                        : topPick.conf_pct >= 40 ? '#f4f8ff'
                        : '#94a3b8',
                  }}
                >
                  {topPick.conf_pct}%
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[15px] text-gray-400" style={{ letterSpacing: '0.2em' }}>
                  {CAT_LABEL[topPick.bet_key] ?? topPick.bet_key.toUpperCase()}
                </span>
                <span
                  className="text-3xl font-black tracking-wider"
                  style={{
                    color: '#ffffff',
                    textShadow:
                      override?.bet_key === topPick.bet_key
                        ? '0 0 16px rgba(244, 248, 255, 0.75)'
                        : '0 0 14px rgba(34, 211, 238, 0.6)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {topPick.pick_pretty}
                </span>
              </div>
            </button>
          ) : (
            <div style={{ padding: '10px 2px', marginTop: 8 }}>
              <span className="text-[12.5px] text-gray-500 font-bold" style={{ letterSpacing: '0.2em' }}>
                GOD SIN TARGET — ESPERANDO
              </span>
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA: MARCADOR + GOD TARGET (UNA tarjeta,
             agrupados por tono — v7, antes 2 micropaneles con línea entre
             medio) y BANKROLL (tarjeta propia, ya trae su glass). ── */}
        <div className="flex flex-col gap-3.5">
          <div style={{ padding: 0, overflow: 'hidden', ...microPanel('#22d3ee', 0.07) }}>
            <div style={{ padding: '12px 4px 0' }}>
              <CopilotScoreboard bare />
            </div>
            {/* GOD TARGET — mismo contenedor que MARCADOR, separado por un
                lavado de fondo (tono), no por una línea.
                FIX (oct 2026) — Gunner: "los contadores de errores estan
                mal no marca los errores ni aciertos que son". Antes este
                bloque solo mostraba derivados (CONSEC/MÁX/ERR·HIT) y nunca
                el conteo real de aciertos/errores de GOD — `hits`/`misses`
                ya se calculaban arriba (de godTarget.wins/losses) pero no
                se pintaban en ningún lado. Ahora ACIERTOS/ERRORES van
                primero, mismo lenguaje visual que MARCADOR (verde/rojo), y
                CONSEC/MÁX/ERR·HIT quedan como detalle al lado. Mismo grid
                auto-fit que CopilotScoreboard — nunca corta, envuelve a 2
                filas si no entra. */}
            <div style={{ padding: '12px 10px 14px', marginTop: 8, background: 'rgba(255,255,255,0.025)' }}>
              <span className="text-[10.5px] text-gray-500" style={{ letterSpacing: '0.2em' }}>GOD TARGET</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))', gap: '10px 4px', marginTop: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="text-[10px] text-gray-500" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>ACIERTOS</div>
                  <div className="font-bold text-lg" style={{ color: '#00ff9d' }}>{hits}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="text-[10px] text-gray-500" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>ERRORES</div>
                  <div className="font-bold text-lg" style={{ color: '#ff3b56' }}>{misses}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="text-[10px] text-gray-500" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>CONSEC</div>
                  <div className="font-bold text-lg" style={{ color: consecErr > 0 ? '#ff6b7f' : '#94a3b8' }}>{consecErr}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="text-[10px] text-gray-500" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>MÁX</div>
                  <div className="font-bold text-lg text-white">{maxConsecErr}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="text-[10px] text-gray-500" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>ERR/HIT</div>
                  <div className="font-bold text-lg" style={{ color: '#ff6b7f' }}>{errHit.toFixed(1)}</div>
                </div>
              </div>
            </div>
          </div>

          <BankrollLedger bankroll={bankroll} />
        </div>

        </div>
        {/* ── fin grilla de 3 columnas ── */}

        {/* ═══ SUGERENCIAS POR CATEGORÍA — ahora franja de ancho completo
             (antes columna central angosta, 545-600px). Los picks de
             DOCENAS/COLUMNAS que importan para operar ya están en DECISIÓN;
             esto es la lectura completa (color, paridad, rango, números,
             guardianes…), con más aire para leer W/L/SEQ/MAX sin recortes. ═══ */}
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
      </div>
    </div>
  );
}
