// BankrollLedger — Panel de bankroll.
//
// v3 — 100% MANUAL / 100% LOCAL (sep 2026). Corrección explícita de Gunner:
// "EL BANKROLL SOLO DEBE FUNCIONAR PARA LO QUE TE DIGO NO CONECTARLO A NADA
// MAS, QUE EL USUARIO VEA INFORMACION DE SUS SESION" + "dije que queria solo
// saldo inicial y final eso lo debe llenar el usuario".
//
// Qué cambió respecto a v2:
//   - Se ELIMINÓ "STAKE BASE / CONFIGURAR APUESTA": pegaba a api.setStakeBase,
//     una llamada real al backend. Eso violaba la regla de "no conectarlo a
//     nada más" aunque el resto del panel ya fuera local.
//   - Se ELIMINÓ "ACTUAL" y "P&L (SESIÓN)" calculados desde bankroll.current
//     del backend (prop en vivo).
//   - SALDO INICIAL dejó de mandar api.setBankroll(). Ahora es un campo de
//     texto que el usuario llena a mano, igual que MESA.
//   - Se agregó SALDO FINAL, mismo patrón: el usuario lo llena a mano al
//     cerrar la sesión.
//   - El P&L que se ve abajo es una resta LOCAL (saldoFinal − saldoInicial)
//     de los dos valores que el usuario ya escribió acá mismo — no es una
//     llamada a ningún lado, es aritmética de lo que hay en pantalla. Solo
//     aparece cuando ambos campos tienen algo cargado.
//
// Esta misma clave de localStorage (SALDO_INICIAL_KEY / SALDO_FINAL_KEY) es
// la que lee SessionRecorder.tsx al exportar el CSV, así que lo que el
// usuario escribe acá es lo mismo que sale en la fila del CSV.
//
// La prop `bankroll` se sigue recibiendo (para no tener que tocar de nuevo
// Quantumpilot.tsx/AppPage.tsx, que ya la pasan) pero NO se lee en ningún
// lado del render — el panel no depende de ningún dato que venga del motor.

import { useState, useRef } from 'react';

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

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function fmtCOP(v: number): string {
  return '$' + Math.round(Math.abs(v)).toLocaleString('es-CO');
}

// ── Claves de localStorage — puramente informativas, viven solo en este
// navegador. Ninguna pega a un endpoint.
const MESA_KEY = 'danna_mesa_nombre';
const SALDO_INICIAL_KEY = 'danna_saldo_inicial';
const SALDO_FINAL_KEY = 'danna_saldo_final';

function leerNumero(clave: string): number | null {
  try {
    const raw = window.localStorage.getItem(clave);
    if (!raw) return null;
    const n = parseFloat(raw);
    return isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '9px 0',
  borderBottom: '1px solid rgba(148,163,184,0.08)',
  gap: '12px',
};
const labelStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '9.5px',
  letterSpacing: '0.18em',
  color: '#64748b',
  textTransform: 'uppercase',
  fontWeight: 700,
};
const valueStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: '22px',
  lineHeight: 1,
  letterSpacing: '-0.3px',
  whiteSpace: 'nowrap',
  color: '#e2e8f0',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};
const editBtnStyle = (color: string): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${color}40`,
  borderRadius: '2px',
  color,
  fontFamily: MONO,
  fontSize: '9px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  padding: '2px 7px',
  cursor: 'pointer',
  width: 'fit-content',
  transition: 'all 150ms',
  textTransform: 'uppercase',
});

// ── Fila genérica editable (texto libre: MESA) ────────────────────────
function FilaTexto({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  function start() {
    setRaw(value);
    setEditing(true);
    setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0);
  }
  function commit() {
    onSave(raw.trim());
    setEditing(false);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <div style={rowStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span style={labelStyle}>{label}</span>
        {!editing && (
          <button
            onClick={start}
            style={editBtnStyle('#22d3ee')}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ✎ Editar
          </button>
        )}
      </div>
      {editing ? (
        <input
          ref={ref}
          className="bk-edit-input"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          placeholder={placeholder}
          style={{
            width: '60%',
            minWidth: 0,
            textAlign: 'right',
            fontSize: '13px',
            fontFamily: MONO,
            background: 'rgba(34,211,238,0.05)',
            border: '1px solid rgba(34,211,238,0.35)',
            borderRadius: 2,
            color: '#e2e8f0',
            padding: '4px 8px',
            outline: 'none',
          }}
        />
      ) : (
        <span
          style={{
            ...valueStyle,
            fontSize: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: value ? '#e2e8f0' : '#475569',
          }}
        >
          {value || placeholder}
        </span>
      )}
    </div>
  );
}

// ── Fila genérica editable (monto: SALDO INICIAL / FINAL) ─────────────
function FilaSaldo({
  label,
  value,
  onSave,
  color = '#22d3ee',
  lastRow = false,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
  color?: string;
  lastRow?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  function start() {
    setRaw(value != null ? Math.round(value).toString() : '');
    setEditing(true);
    setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0);
  }
  function commit() {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (cleaned === '') {
      onSave(null);
    } else {
      const n = parseFloat(cleaned);
      onSave(isFinite(n) ? n : null);
    }
    setEditing(false);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <div style={{ ...rowStyle, borderBottom: lastRow ? 'none' : rowStyle.borderBottom }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span style={labelStyle}>{label}</span>
        {!editing && (
          <button
            onClick={start}
            style={editBtnStyle(color)}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${color}14`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ✎ {value != null ? 'Editar' : 'Ingresar'} saldo
          </button>
        )}
      </div>
      {editing ? (
        <input
          ref={ref}
          className="bk-edit-input"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          placeholder="0"
          style={{
            width: '55%',
            minWidth: 0,
            textAlign: 'right',
            fontSize: '18px',
            fontFamily: MONO,
            fontVariantNumeric: 'tabular-nums',
            background: `${color}10`,
            border: `1px solid ${color}55`,
            borderRadius: 2,
            color,
            padding: '4px 8px',
            outline: 'none',
            fontWeight: 700,
          }}
        />
      ) : (
        <span style={{ ...valueStyle, fontSize: '20px', color: value != null ? '#e2e8f0' : '#475569' }}>
          {value != null ? fmtCOP(value) : '— sin llenar —'}
        </span>
      )}
    </div>
  );
}

export function BankrollLedger(_props: Props) {
  const [mesa, setMesaState] = useState<string>(() => {
    try { return window.localStorage.getItem(MESA_KEY) ?? ''; } catch { return ''; }
  });
  const [saldoInicial, setSaldoInicialState] = useState<number | null>(() => leerNumero(SALDO_INICIAL_KEY));
  const [saldoFinal, setSaldoFinalState] = useState<number | null>(() => leerNumero(SALDO_FINAL_KEY));

  function setMesa(v: string) {
    setMesaState(v);
    try { window.localStorage.setItem(MESA_KEY, v); } catch { /* cuota llena — no bloquea nada */ }
  }
  function setSaldoInicial(v: number | null) {
    setSaldoInicialState(v);
    try {
      if (v == null) window.localStorage.removeItem(SALDO_INICIAL_KEY);
      else window.localStorage.setItem(SALDO_INICIAL_KEY, String(v));
    } catch { /* cuota llena */ }
  }
  function setSaldoFinal(v: number | null) {
    setSaldoFinalState(v);
    try {
      if (v == null) window.localStorage.removeItem(SALDO_FINAL_KEY);
      else window.localStorage.setItem(SALDO_FINAL_KEY, String(v));
    } catch { /* cuota llena */ }
  }

  const hayPL = saldoInicial != null && saldoFinal != null;
  const pl = hayPL ? (saldoFinal as number) - (saldoInicial as number) : 0;
  const plPos = pl >= 0;

  return (
    <div
      className="panel bk-panel"
      style={{
        background: 'linear-gradient(180deg, rgba(13,18,25,0.9) 0%, rgba(10,14,23,0.95) 100%)',
        border: '1px solid rgba(148,163,184,0.10)',
        borderRadius: 4,
        padding: '12px 14px',
      }}
    >
      <div
        className="panel-head"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 10,
          marginBottom: 4,
          borderBottom: '1px solid rgba(148,163,184,0.10)',
        }}
      >
        <span
          className="icon"
          style={{
            width: 3,
            height: 14,
            background: '#10b981',
            boxShadow: '0 0 6px rgba(16,185,129,0.5)',
            display: 'inline-block',
          }}
        ></span>
        <span
          className="title"
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.22em',
            color: '#10b981',
            fontWeight: 800,
            textTransform: 'uppercase',
          }}
        >
          Bankroll &amp; Ledger
        </span>
        <span
          style={{
            flex: 1,
            height: 1,
            background: 'linear-gradient(90deg, rgba(16,185,129,0.25) 0%, transparent 100%)',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <FilaTexto label="MESA" value={mesa} onSave={setMesa} placeholder="ej. Casino X — mesa 3" />

        <FilaSaldo label="SALDO INICIAL" value={saldoInicial} onSave={setSaldoInicial} color="#22d3ee" />

        <FilaSaldo label="SALDO FINAL" value={saldoFinal} onSave={setSaldoFinal} color="#f59e0b" lastRow={!hayPL} />

        {hayPL && (
          <div style={{ ...rowStyle, borderBottom: 'none', paddingTop: 12, marginTop: 4, borderTop: '1px solid rgba(148,163,184,0.12)' }}>
            <span style={labelStyle}>P&amp;L (FINAL − INICIAL)</span>
            <span
              style={{
                ...valueStyle,
                fontSize: '22px',
                color: plPos ? '#10b981' : '#ef4444',
                textShadow: plPos
                  ? '0 0 10px rgba(16,185,129,0.35)'
                  : '0 0 10px rgba(239,68,68,0.35)',
              }}
            >
              {plPos ? '+' : '−'}{fmtCOP(pl)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
