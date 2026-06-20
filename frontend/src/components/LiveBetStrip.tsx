// LiveBetStrip — Strip de control sobre el paño LIVE BET.
// Port del bloque app.py L9307-9355.
//
// UI-only por ahora: estado en memoria local. El backend de live bets aún
// no está expuesto en /api/* (es lógica UI que vive en Streamlit session).
// Cuando se conecte, este componente solo cambia los handlers de mutate.
//
// Funcionalidad:
//   - Chip "LIVE BET" muestra la apuesta seleccionada (o "Selecciona en el paño")
//   - Chip "EN JUEGO" cuenta las apuestas confirmadas
//   - Stake input con botones − / +
//   - Botón EXECUTE ORDER (confirma apuesta pending)
//   - Botón PURGE CACHE (limpia apuesta pending)
//   - 6 chips rápidos: +1K, +5K, +10K, +25K, +50K, +100K

import { useState } from 'react';

const CHIPS = [1000, 5000, 10000, 25000, 50000, 100000];

function formatCOP(v: number): string {
  const n = isFinite(v) ? v : 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
    .replace(/,/g, 'X').replace(/\./g, ',').replace(/X/g, '.');
}

interface Props {
  pendingBet: { kind: string; value: string | number } | null;
  openBetsCount: number;
  onExecute: (stake: number) => void;
  onPurge: () => void;
}

export function LiveBetStrip({ pendingBet, openBetsCount, onExecute, onPurge }: Props) {
  const [stake, setStake] = useState<number>(0);
  const [stakeRaw, setStakeRaw] = useState<string>('0,00');

  function commitStake(v: number) {
    const clamped = Math.max(0, isFinite(v) ? v : 0);
    setStake(clamped);
    setStakeRaw(formatCOP(clamped));
  }

  function addChip(v: number) {
    commitStake(stake + v);
  }

  function onStakeBlur() {
    // Parsear "1.500,00" → 1500
    const cleaned = stakeRaw.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    commitStake(isFinite(n) ? n : 0);
  }

  function inc() { commitStake(stake + 1000); }
  function dec() { commitStake(Math.max(0, stake - 1000)); }

  function execute() {
    if (stake <= 0) return;
    onExecute(stake);
    commitStake(0);
  }

  const isPending = !!pendingBet;
  const betLabel = pendingBet
    ? `${pendingBet.kind.toUpperCase()}: ${pendingBet.value}`
    : 'Selecciona en el paño';

  return (
    <>
      <div className="lb-strip">
        <div className="lb-info">
          <div className={`lb-chip${isPending ? ' lb-armed' : ' lb-empty'}`}>
            <span className="lb-chip-k">LIVE BET</span>
            <span className="lb-chip-v">{betLabel}</span>
          </div>
          <div className="lb-chip">
            <span className="lb-chip-k">EN JUEGO</span>
            <span className="lb-chip-v">{openBetsCount}</span>
          </div>
        </div>

        <div className="lb-stake">
          <input
            type="text"
            inputMode="decimal"
            value={stakeRaw}
            onChange={(e) => setStakeRaw(e.target.value)}
            onBlur={onStakeBlur}
            placeholder="0,00"
            aria-label="Stake (COP)"
          />
          <button type="button" className="lb-stake-pm" onClick={dec} title="-1.000">−</button>
          <button type="button" className="lb-stake-pm" onClick={inc} title="+1.000">+</button>
        </div>

        <button
          type="button"
          className="lb-btn lb-execute"
          onClick={execute}
          disabled={!isPending || stake <= 0}
        >
          ⬡ EXECUTE ORDER
        </button>
        <button
          type="button"
          className="lb-btn lb-purge"
          onClick={onPurge}
          disabled={!isPending}
        >
          ✕ PURGE CACHE
        </button>
      </div>

      <div className="lb-chips-bar">
        {CHIPS.map((v) => (
          <button
            key={v}
            type="button"
            className="lb-chip-btn"
            onClick={() => addChip(v)}
            title={`Agregar ${formatCOP(v)} COP`}
          >
            +{v / 1000}K
          </button>
        ))}
      </div>
    </>
  );
}
