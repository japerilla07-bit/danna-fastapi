// War Room — D.A.N.N.A.
// Premium Cyber.
//
// Estado de la migración:
//   ✅ PIEZA 1 — HUD top bar
//   ✅ PIEZA 2 — OPTIMAL state strip
//   ✅ PIEZA 3 — Control de Misión + Live Bet + Paño + Wheel + Entropy + Radar + WarTerminal
//   ⏳ PIEZA 4 — GOD modal flotante + Capital Allocation + Bankroll + Ledger

import { useState } from 'react';
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
import { Telemetry } from '@/components/Telemetry';

import { QuantumPilot } from '@/components/Quantumpilot';
import { SidebarDrawer } from '@/components/SidebarDrawer';

import '@/styles/hud.css';
import '@/styles/optimal-strip.css';
import '@/styles/mission.css';
import '@/styles/quantum-pilot.css';
import '@/styles/sidebar.css';
import '@/styles/app.css';

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
      setOpenBetsCount((c) => c + 1);
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
      <Telemetry />

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

          {/* DERECHA: Table Entropy + Radar */}
          <div className="col-right">
            <TableEntropy tableHealth={(data as any).table_health ?? null} />
            <RadarCard payload={data.payload} />
          </div>

        </div>

      </div>
    </>
  );
}
