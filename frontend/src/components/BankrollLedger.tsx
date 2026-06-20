// BankrollLedger — Panel de bankroll.
// Solo permite editar el CAPITAL INICIAL (input directo).
// Muestra INICIAL / ACTUAL / P&L.

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Bankroll {
  current: number;
  initial: number;
  pnl: number;
  pnl_pct: number;
}

interface Props {
  bankroll: Bankroll;
}

function fmtCOP(v: number): string {
  return '$' + Math.round(Math.abs(v)).toLocaleString('es-CO');
}

export function BankrollLedger({ bankroll }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const setMutation = useMutation({
    mutationFn: ({ amount }: { amount: number }) =>
      api.setBankroll(amount, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['state'] });
      setEditing(false);
    },
    onError: () => setEditing(false),
  });

  function startEdit() {
    setRaw(Math.round(bankroll.initial).toString());
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }

  function commit() {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (isFinite(n) && n > 0 && Math.round(n) !== Math.round(bankroll.initial)) {
      setMutation.mutate({ amount: n });
    } else {
      setEditing(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  const pos = bankroll.pnl >= 0;

  return (
    <div className="panel bk-panel">
      <div className="panel-head">
        <span className="icon" style={{ color: 'var(--green)' }}>💰</span>
        <span className="title">BANKROLL &amp; LEDGER</span>
      </div>

      <div
        className="bk-stats"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '8px',
          width: '100%',
          minWidth: 0,
        }}
      >
        {/* INICIAL — único campo editable */}
        <div className="bk-stat" style={{ minWidth: 0, overflow: 'hidden' }}>
          <span className="k">INICIAL</span>
          {editing ? (
            <input
              ref={inputRef}
              className="bk-edit-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              disabled={setMutation.isPending}
              style={{ width: '100%', minWidth: 0 }}
            />
          ) : (
            <span
              className="v bk-editable"
              onClick={startEdit}
              title="Click para editar"
              style={{
                fontSize: 'clamp(13px, 1.4vw, 18px)',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {fmtCOP(bankroll.initial)}
            </span>
          )}
          <span className="bk-hint">click para editar</span>
        </div>

        <div className="bk-stat" style={{ minWidth: 0, overflow: 'hidden' }}>
          <span className="k">ACTUAL</span>
          <span
            className="v"
            style={{
              fontSize: 'clamp(13px, 1.4vw, 18px)',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {fmtCOP(bankroll.current)}
          </span>
        </div>

        <div className="bk-stat" style={{ minWidth: 0, overflow: 'hidden' }}>
          <span className="k">P&amp;L</span>
          <span
            className={`v ${pos ? 'positive' : 'negative'}`}
            style={{
              fontSize: 'clamp(13px, 1.4vw, 18px)',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {pos ? '+' : '−'}{fmtCOP(bankroll.pnl)}
          </span>
          <span
            className={`bk-sub ${pos ? 'positive' : 'negative'}`}
            style={{ whiteSpace: 'nowrap', display: 'block' }}
          >
            ({pos ? '+' : ''}{bankroll.pnl_pct?.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}
