// BankrollLedger — Panel de bankroll.
// Layout VERTICAL: cada valor en su propia fila a ancho completo,
// para que no se corten los números. Permite editar el CAPITAL INICIAL.

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Bankroll {
  current: number;
  initial: number;
  pnl: number;
  pnl_pct: number;
  stake_base?: number;
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

  // ── Stake base (con cuánto apuesta el pilot en L1) ──
  const [editingStake, setEditingStake] = useState(false);
  const [rawStake, setRawStake] = useState('');
  const stakeInputRef = useRef<HTMLInputElement>(null);

  const setMutation = useMutation({
    mutationFn: ({ amount }: { amount: number }) =>
      api.setBankroll(amount, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['state'] });
      setEditing(false);
    },
    onError: () => setEditing(false),
  });

  const stakeMutation = useMutation({
    mutationFn: ({ stakeBase }: { stakeBase: number }) =>
      api.setStakeBase(stakeBase),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['state'] });
      setEditingStake(false);
    },
    onError: () => setEditingStake(false),
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

  // ── Stake base handlers ──
  const stakeBaseVal = Math.round(Number(bankroll.stake_base ?? 2500));

  function startEditStake() {
    setRawStake(stakeBaseVal.toString());
    setEditingStake(true);
    setTimeout(() => { stakeInputRef.current?.focus(); stakeInputRef.current?.select(); }, 0);
  }

  function commitStake() {
    const n = parseFloat(rawStake.replace(/[^0-9.]/g, ''));
    if (isFinite(n) && n > 0 && Math.round(n) !== stakeBaseVal) {
      stakeMutation.mutate({ stakeBase: n });
    } else {
      setEditingStake(false);
    }
  }

  function onKeyStake(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitStake();
    if (e.key === 'Escape') setEditingStake(false);
  }

  const pos = bankroll.pnl >= 0;

  // Estilos inline para layout vertical (no dependen del grid 3-col del CSS
  // que cortaba los números). Usan las variables del tema existentes.
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--panel-bd)',
    gap: '12px',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '1.5px',
    color: 'var(--txt-lo)',
    textTransform: 'uppercase',
  };
  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: '22px',
    lineHeight: 1,
    letterSpacing: '-0.5px',
    whiteSpace: 'nowrap',
    color: 'var(--txt-hi)',
    textAlign: 'right',
  };

  return (
    <div className="panel bk-panel">
      <div className="panel-head">
        <span className="icon" style={{ color: 'var(--green)' }}>💰</span>
        <span className="title">BANKROLL &amp; LEDGER</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* ── INICIAL (editable) ── */}
        <div style={rowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={labelStyle}>INICIAL</span>
            {!editing && (
              <button
                onClick={startEdit}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(0,229,255,0.35)',
                  borderRadius: '6px',
                  color: 'var(--cyan)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '1px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  width: 'fit-content',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cyan)';
                  e.currentTarget.style.background = 'rgba(0,229,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0,229,255,0.35)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ✎ EDITAR SALDO
              </button>
            )}
          </div>
          {editing ? (
            <input
              ref={inputRef}
              className="bk-edit-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
              disabled={setMutation.isPending}
              style={{
                width: '55%',
                minWidth: 0,
                textAlign: 'right',
                fontSize: '22px',
              }}
            />
          ) : (
            <span style={valueStyle}>{fmtCOP(bankroll.initial)}</span>
          )}
        </div>

        {/* ── ACTUAL ── */}
        <div style={rowStyle}>
          <span style={labelStyle}>ACTUAL</span>
          <span style={valueStyle}>{fmtCOP(bankroll.current)}</span>
        </div>

        {/* ── P&L ── */}
        <div style={rowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={labelStyle}>P&amp;L (SESIÓN)</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: pos ? 'var(--green)' : 'var(--red)',
              }}
            >
              ({pos ? '+' : ''}{bankroll.pnl_pct?.toFixed(1)}%)
            </span>
          </div>
          <span
            style={{
              ...valueStyle,
              color: pos ? 'var(--green)' : 'var(--red)',
              textShadow: pos
                ? '0 0 14px rgba(0,255,156,0.45)'
                : '0 0 14px rgba(255,45,79,0.45)',
            }}
          >
            {pos ? '+' : '−'}{fmtCOP(bankroll.pnl)}
          </span>
        </div>

        {/* ── STAKE BASE (editable) — con cuánto apuesta el pilot en L1 ── */}
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={labelStyle}>STAKE BASE</span>
            {!editingStake && (
              <button
                onClick={startEditStake}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,176,32,0.40)',
                  borderRadius: '6px',
                  color: 'var(--amber)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '1px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  width: 'fit-content',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--amber)';
                  e.currentTarget.style.background = 'rgba(255,176,32,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,176,32,0.40)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ✎ CONFIGURAR APUESTA
              </button>
            )}
          </div>
          {editingStake ? (
            <input
              ref={stakeInputRef}
              className="bk-edit-input"
              value={rawStake}
              onChange={(e) => setRawStake(e.target.value)}
              onBlur={commitStake}
              onKeyDown={onKeyStake}
              disabled={stakeMutation.isPending}
              style={{
                width: '55%',
                minWidth: 0,
                textAlign: 'right',
                fontSize: '22px',
                color: 'var(--amber)',
              }}
            />
          ) : (
            <span style={{ ...valueStyle, color: 'var(--amber)' }}>
              {fmtCOP(stakeBaseVal)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
