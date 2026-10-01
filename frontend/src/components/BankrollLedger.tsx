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
//
// v4 (sep 2026) — REDISEÑO "INSTRUMENT PANEL": se sacó className="panel
// bk-panel"/"panel-head" (CSS externo que impone borde+fondo+radio, mismo
// criterio que CategoryTable.tsx v5 y GodBetPanel.tsx) a favor de un
// encabezado de texto plano. Las filas (FilaTexto/FilaSaldo) no cambiaron —
// ya eran líneas simples con un borde inferior, sin caja, desde la v3.

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
const editBtnStyle = (color: string): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${color}59`,
  borderRadius: '6px',
  color,
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '1px',
  padding: '2px 8px',
  cursor: 'pointer',
  width: 'fit-content',
  transition: 'all 150ms',
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span style={labelStyle}>{label}</span>
        {!editing && (
          <button
            onClick={start}
            style={editBtnStyle('var(--cyan)')}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,229,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ✎ EDITAR
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
          style={{ width: '60%', minWidth: 0, textAlign: 'right', fontSize: '15px' }}
        />
      ) : (
        <span
          style={{
            ...valueStyle,
            fontSize: '15px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: value ? 'var(--txt-hi)' : 'var(--txt-lo)',
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
  color = 'var(--cyan)',
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span style={labelStyle}>{label}</span>
        {!editing && (
          <button
            onClick={start}
            style={editBtnStyle(color)}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${color}14`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ✎ {value != null ? 'EDITAR' : 'INGRESAR'} SALDO
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
          style={{ width: '55%', minWidth: 0, textAlign: 'right', fontSize: '22px', color }}
        />
      ) : (
        <span style={{ ...valueStyle, color: value != null ? 'var(--txt-hi)' : 'var(--txt-lo)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
        <span style={{ color: 'var(--green)', fontSize: 11 }}>💰</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', color: 'var(--txt-hi)' }}>BANKROLL &amp; LEDGER</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <FilaTexto label="MESA" value={mesa} onSave={setMesa} placeholder="ej. Casino X — mesa 3" />

        <FilaSaldo label="SALDO INICIAL" value={saldoInicial} onSave={setSaldoInicial} color="var(--cyan)" />

        <FilaSaldo label="SALDO FINAL" value={saldoFinal} onSave={setSaldoFinal} color="var(--amber)" lastRow={!hayPL} />

        {hayPL && (
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={labelStyle}>P&amp;L (FINAL − INICIAL)</span>
            <span
              style={{
                ...valueStyle,
                color: plPos ? 'var(--green)' : 'var(--red)',
                textShadow: plPos
                  ? '0 0 14px rgba(0,255,156,0.45)'
                  : '0 0 14px rgba(255,45,79,0.45)',
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
