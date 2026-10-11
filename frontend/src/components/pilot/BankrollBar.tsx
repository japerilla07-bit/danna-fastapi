// BANKROLL & LEDGER (nivel 3 — referencia): barra inferior. 100% manual y
// local, EXACTAMENTE las mismas claves de localStorage y la misma regla de
// P&L que BankrollLedger.tsx (que exporta las claves/ayudas). No toca red.

import React, { useRef, useState } from 'react';
import { MESA_KEY, SALDO_INICIAL_KEY, SALDO_FINAL_KEY, fmtCOP, leerNumero } from '@/components/BankrollLedger';
import { C, FONT_MONO, num } from './theme';
import { Lbl } from './ui';

function EditBtn({ onClick, children, color, label }: { onClick: () => void; children: React.ReactNode; color: string; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={{ background: 'transparent', border: `1px solid ${color}66`, borderRadius: 3, color, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.06em', padding: '0 5px', height: 16, minWidth: 20, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function Field({
  label, display, empty, mode, raw, setRaw, editing, start, commit, cancel, color, btn, testId, shrink = false,
}: {
  label: string; display: string; empty: boolean; mode: 'text' | 'money';
  raw: string; setRaw: (v: string) => void; editing: boolean; start: () => void; commit: () => void; cancel: () => void;
  color: string; btn: string; testId: string; shrink?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: shrink ? '0 1 auto' : '0 0 auto' }} data-qp={testId}>
      <Lbl color={C.ink2} style={{ fontSize: 9.5 }}>{label}</Lbl>
      {editing ? (
        <input
          ref={ref} autoFocus aria-label={label}
          inputMode={mode === 'money' ? 'numeric' : 'text'}
          value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder={mode === 'money' ? '0' : 'ej. Casino X — mesa 3'}
          style={{ width: mode === 'money' ? 96 : 150, background: C.bg2, border: `1px solid ${color}`, borderRadius: 3, color: C.ink, fontFamily: FONT_MONO, fontSize: 12, padding: '0 5px', height: 18, textAlign: 'right', outline: 'none' }}
        />
      ) : (
        <>
          <span data-qp={`${testId}-valor`} style={{ ...num, fontSize: 12.5, fontWeight: 700, color: empty ? C.ink3 : C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: mode === 'money' ? 110 : 170, minWidth: 0 }}>{display}</span>
          <EditBtn onClick={start} color={color} label={`${btn} ${label}`}>✎</EditBtn>
        </>
      )}
    </div>
  );
}

export function BankrollBar() {
  const [mesa, setMesaState] = useState<string>(() => { try { return window.localStorage.getItem(MESA_KEY) ?? ''; } catch { return ''; } });
  const [saldoInicial, setSI] = useState<number | null>(() => leerNumero(SALDO_INICIAL_KEY));
  const [saldoFinal, setSF] = useState<number | null>(() => leerNumero(SALDO_FINAL_KEY));
  const [edit, setEdit] = useState<null | 'mesa' | 'si' | 'sf'>(null);
  const [raw, setRaw] = useState('');

  function setMesa(v: string) { setMesaState(v); try { window.localStorage.setItem(MESA_KEY, v); } catch { /* cuota llena */ } }
  function setSaldo(key: string, set: (v: number | null) => void, v: number | null) {
    set(v);
    try { if (v == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(v)); } catch { /* cuota llena */ }
  }
  const parseMoney = (s: string): number | null => {
    const cleaned = s.replace(/[^0-9.]/g, '');
    if (cleaned === '') return null;
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  };
  const commit = () => {
    if (edit === 'mesa') setMesa(raw.trim());
    if (edit === 'si') setSaldo(SALDO_INICIAL_KEY, setSI, parseMoney(raw));
    if (edit === 'sf') setSaldo(SALDO_FINAL_KEY, setSF, parseMoney(raw));
    setEdit(null);
  };
  const cancel = () => setEdit(null);

  const hayPL = saldoInicial != null && saldoFinal != null;
  const pl = hayPL ? (saldoFinal as number) - (saldoInicial as number) : 0;
  const plPos = pl >= 0;

  return (
    <section aria-label="Bankroll y ledger (manual)" data-qp="bankroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flex: 1, minWidth: 0, height: '100%', boxSizing: 'border-box' }}>
      <span aria-hidden="true" style={{ fontSize: 13, flexShrink: 0 }}>💰</span>
      <Field label="MESA" display={mesa || '—'} empty={!mesa} mode="text" raw={raw} setRaw={setRaw}
        editing={edit === 'mesa'} start={() => { setRaw(mesa); setEdit('mesa'); }} commit={commit} cancel={cancel} color={C.danna} btn="EDITAR" testId="bk-mesa" shrink />
      <Field label="SALDO INICIAL" display={saldoInicial != null ? fmtCOP(saldoInicial) : '—'} empty={saldoInicial == null} mode="money" raw={raw} setRaw={setRaw}
        editing={edit === 'si'} start={() => { setRaw(saldoInicial != null ? Math.round(saldoInicial).toString() : ''); setEdit('si'); }} commit={commit} cancel={cancel} color={C.danna} btn={saldoInicial != null ? 'EDITAR' : 'INGRESAR'} testId="bk-si" />
      <Field label="SALDO FINAL" display={saldoFinal != null ? fmtCOP(saldoFinal) : '—'} empty={saldoFinal == null} mode="money" raw={raw} setRaw={setRaw}
        editing={edit === 'sf'} start={() => { setRaw(saldoFinal != null ? Math.round(saldoFinal).toString() : ''); setEdit('sf'); }} commit={commit} cancel={cancel} color={C.white} btn={saldoFinal != null ? 'EDITAR' : 'INGRESAR'} testId="bk-sf" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 150, flexShrink: 0, justifyContent: 'flex-end' }} data-qp="bk-pl">
        <Lbl color={C.ink2} style={{ fontSize: 9.5 }}>P&amp;L (FINAL − INICIAL)</Lbl>
        <span style={{ ...num, fontSize: 14, fontWeight: 800, color: !hayPL ? C.ink4 : plPos ? C.ok : C.err, whiteSpace: 'nowrap' }}>
          {hayPL ? `${plPos ? '+' : '−'}${fmtCOP(pl)}` : '—'}
        </span>
      </div>
    </section>
  );
}
