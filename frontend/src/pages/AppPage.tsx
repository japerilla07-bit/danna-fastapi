// War Room — D.A.N.N.A.
// Premium Cyber.
//
// Estado de la migración:
//   ✅ PIEZA 1 — HUD top bar
//   ✅ PIEZA 2 — OPTIMAL state strip
//   ✅ PIEZA 3 — Control de Misión + Live Bet + Paño + Wheel + Entropy + Radar + Dispersión + WarTerminal
//   ✅ REGISTRO — SessionRecorder: log por giro + export CSV (col-izquierda)
//   ⏳ PIEZA 4 — GOD modal flotante + Capital Allocation + Bankroll + Ledger

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useGameState } from '@/hooks/useGameState';

import { HUDTopBar } from '@/components/HUDTopBar';
import { OptimalStrip } from '@/components/OptimalStrip';
import { MissionControl } from '@/components/MissionControl';
import { SequenceLog } from '@/components/SequenceLog';
import { WarTerminal } from '@/components/WarTerminal';
import { SessionPanel } from '@/components/SessionPanel';
import { BankrollLedger } from '@/components/BankrollLedger';
import { LiveBetStrip } from '@/components/LiveBetStrip';
import { RouletteBoard } from '@/components/RouletteBoard';
import { TableEntropy } from '@/components/TableEntropy';
import { RadarCard } from '@/components/RadarCard';
import { CategoryTable } from '@/components/CategoryTable';
import { GodBetPanel } from '@/components/GodBetPanel';
import { NeuralBackground } from '@/components/NeuralBackground';
import { ChaosPanel } from '@/components/ChaosPanel';
import { SessionRecorder } from '@/components/SessionRecorder';

import { QuantumPilot } from '@/components/Quantumpilot';
import { SidebarDrawer } from '@/components/SidebarDrawer';

import '@/styles/hud.css';
import '@/styles/optimal-strip.css';
import '@/styles/mission.css';
import '@/styles/quantum-pilot.css';
import '@/styles/sidebar.css';
import '@/styles/app.css';
import '@/styles/chaos-panel.css';
import '@/styles/session-recorder.css';

interface PendingBet {
  kind: string;
  value: string | number;
}

export function AppPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stateQuery = useGameState();

  const [pendingBet, setPendingBet] = useState<PendingBet | null>(null);
  const [openBetsCount, setOpenBetsCount] = useState(0);

  // ── Derivación de acierto/error del ÚLTIMO giro ──────────────────────────
  // El API no expone "el ultimo giro acerto si/no" como campo suelto. Se
  // deduce de como cambian los contadores acumulados entre un giro y el
  // siguiente: si wins sube -> acierto; si losses sube -> error; si ninguno
  // se movio -> null (esa categoria no se evaluo en ese giro).
  // Alimenta a SessionRecorder, que registra el resultado SIEMPRE, sin
  // importar que el paño dijera BET, PROBE o WAIT.
  const prevCnt = useRef<{ d: [number, number]; c: [number, number] } | null>(null);
  const [lastHits, setLastHits] = useState<{ doc: boolean | null; col: boolean | null }>({
    doc: null,
    col: null,
  });
  const spinsCount = stateQuery.data?.sequence?.count ?? 0;
  const countersRaw: any = stateQuery.data?.counters ?? {};

  useEffect(() => {
    const d: [number, number] = [
      Number(countersRaw?.docenas?.wins ?? 0),
      Number(countersRaw?.docenas?.losses ?? 0),
    ];
    const c: [number, number] = [
      Number(countersRaw?.columnas?.wins ?? 0),
      Number(countersRaw?.columnas?.losses ?? 0),
    ];
    const prev = prevCnt.current;
    if (prev) {
      setLastHits({
        doc: d[0] > prev.d[0] ? true : d[1] > prev.d[1] ? false : null,
        col: c[0] > prev.c[0] ? true : c[1] > prev.c[1] ? false : null,
      });
    }
    prevCnt.current = { d, c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinsCount]);

  async function handleLogout() {
    try { await api.logout(); } catch {}
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  function handlePick(kind: string, value: string | number) {
    setPendingBet({ kind, value });
  }

  function handleExecute(stake: number) {
    if (pendingBet && stake > 0) {
      setOpenBetsCount((c: number) => c + 1);
      setPendingBet(null);
    }
  }

  function handlePurge() {
    setPendingBet(null);
  }

  if (stateQuery.isLoading) {
    return (
      <>
        <NeuralBackground />
        <div className="app-loading">
          <div className="app-loading-text">CARGANDO CYBER-GLASS HUD...</div>
        </div>
      </>
    );
  }

  if (stateQuery.isError || !stateQuery.data) {
    return (
      <>
        <NeuralBackground />
        <div className="app-loading">
          <div className="app-error-text">Error cargando estado del motor</div>
        </div>
      </>
    );
  }

  const data = stateQuery.data;

  const pilotConsec =
    (data.payload as any)?.decision?.pilot_consec_errors
    ?? (data as any).consec_losses
    ?? 0;

  const wheelTopScore = (() => {
    const wi = (data as any).wheel_info ?? {};
    const scores = wi.sector_scores ?? {};
    const vals = Object.values(scores) as number[];
    return vals.length > 0 ? Math.max(...vals) : 0.25;
  })();

  return (
    <>
      <NeuralBackground />

      {/* Sidebar drawer (botón hamburguesa) */}
      <SidebarDrawer
        user={user ?? null}
        spinsCount={data.sequence.count}
        onReset={() => {}}
      />

      {/* QUANTUM PILOT overlay (flotante draggable) */}
      <QuantumPilot
        godBet={(data as any).god_bet ?? { active: false, cond_state: 'caution', radar_score: 0, counters_god: {} }}
        payload={data.payload}
        bankroll={data.bankroll}
        counters={(data.counters ?? {}) as any}
      />

      <div className="app-wrap">
        {/* Userbar */}
        <div className="app-userbar">
          <div className="app-user-info">
            <div className="app-user-name">{user?.username}</div>
            <div className="app-user-plan">
              {user?.plan?.toUpperCase()} · {user?.spins_remaining?.toLocaleString()} spins
            </div>
          </div>
          <button onClick={handleLogout} className="app-logout-btn">
            <span className="app-logout-k">SESIÓN</span>
            <span className="app-logout-v">SALIR</span>
          </button>
        </div>

        {/* ═══ PIEZA 1: HUD ═══ */}
        <HUDTopBar
          payload={data.payload}
          counters={data.counters}
          spinsCount={data.sequence.count}
          bankroll={data.bankroll.current}
        />

        {/* ═══ PIEZA 2: OPTIMAL STRIP ═══ */}
        <div className="app-spacer-md" />
        <OptimalStrip
          payload={data.payload}
          pilotConsec={pilotConsec}
          wheelTopScore={wheelTopScore}
          chaosIndex={(data as any).chaos_index ?? null}
          // TODO[Fase1-audit]: OptimalStrip no declara la prop `hudComputed`
          // en su interface Props. Antes pasaba silencioso por el cast
          // `(data as any).hud_computed`. Tres opciones:
          //   (a) Si OptimalStrip debe renderizar HUD: añadir la prop allí
          //       y leer `hudComputed: HudComputed | null`.
          //   (b) Si nunca se usó: borrar esta línea definitivamente.
          //   (c) Dejar comentada hasta verificar OptimalStrip.tsx.
          // Comentada por ahora para destrabar el typecheck — funcional-
          // mente es cero-cambio (la prop se ignoraba en runtime).
          // hudComputed={data.hud_computed ?? null}
        />

        {/* ═══ PIEZA 3: Layout 3 columnas ═══ */}
        <div className="app-spacer-md" />
        <div className="mission-section">

          {/* IZQUIERDA: Control de Misión + Seq Log + War Terminal + Sesión + Bankroll */}
          <div className="col-left">
            <MissionControl />
            <SequenceLog spins={data.sequence.spins} limit={12} />
            <WarTerminal payload={data.payload} spins={data.sequence.spins} />
            <SessionPanel />
            <SessionRecorder
              snap={{
                spinsCount: data.sequence.count,
                spin:
                  Array.isArray(data.sequence.spins) && data.sequence.spins.length > 0
                    ? Number(data.sequence.spins[data.sequence.spins.length - 1])
                    : null,
                hud: (data as any)._debug?.hud_cond ?? null,
                hudState: String((data as any).god_bet?.cond_state ?? ''),
                entropy: (data as any)._debug?.table_entropy ?? null,
                radar: (data.payload as any)?.decision?.mesa_score?.score10 ?? null,
                wheel: (data as any).wheel_info?.adaptive_w ?? null,
                panoPct: (data as any).chaos_index?.pano?.pct ?? null,
                ruedaPct: (data as any).chaos_index?.rueda?.pct ?? null,
                chaosEstado: String((data as any).chaos_index?.estado ?? ''),
                pCat: String((data.payload as any)?.decision?.primary_bet?.bet_key ?? ''),
                p: (data.payload as any)?.decision?.bet_advice?.docenas?.p ?? null,
                p1: (data.payload as any)?.decision?.bet_advice?.docenas?.p1 ?? null,
                p2: (data.payload as any)?.decision?.bet_advice?.docenas?.p2 ?? null,
                docPick: String((data.payload as any)?.decision?.bet_advice?.docenas?.pick ?? ''),
                docState: String((data.payload as any)?.decision?.bet_advice?.docenas?.status ?? ''),
                docHit: lastHits.doc,
                colPick: String((data.payload as any)?.decision?.bet_advice?.columnas?.pick ?? ''),
                colState: String((data.payload as any)?.decision?.bet_advice?.columnas?.status ?? ''),
                colHit: lastHits.col,
                cond: (data as any)._debug?.hud_cond ?? null,
                condState: String((data as any).god_bet?.cond_state ?? ''),
              }}
            />
            <BankrollLedger bankroll={data.bankroll} />
          </div>

          {/* CENTRO: Live Bet + Paño + Wheel + Tabla Categorías + GOD BET */}
          <div className="col-center">
            <LiveBetStrip
              pendingBet={pendingBet}
              openBetsCount={openBetsCount}
              onExecute={handleExecute}
              onPurge={handlePurge}
            />
            <RouletteBoard
              payload={data.payload}
              wheelInfo={(data as any).wheel_info ?? null}
              onPick={handlePick}
            />
            <CategoryTable
              payload={data.payload}
              counters={(data.counters ?? {}) as any}
              errorHist={(data as any).error_hist ?? {}}
            />
            <GodBetPanel
              payload={data.payload}
              counters={(data.counters ?? {}) as any}
              countersGod={((data as any).counters_god ?? {}) as any}
              errorHist={(data as any).error_hist ?? {}}
              errorHistGod={(data as any).error_hist ?? {}}
              godActive={!!((data as any).god_bet?.active)}
              radarScore={(data as any).god_bet?.radar_score ?? 0}
            />
          </div>

          {/* DERECHA: Table Entropy + Radar + Dispersión */}
          <div className="col-right">
            <TableEntropy
              chaosIndex={(data as any).chaos_index ?? null}
              tableHealth={(data as any).table_health ?? null}
            />
            <RadarCard payload={data.payload} />
            <ChaosPanel chaosIndex={(data as any).chaos_index ?? null} />
          </div>

        </div>

      </div>
    </>
  );
}
