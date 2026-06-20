// RouletteBoard — Paño + apuestas externas + Wheel strip.
//
// Layout:
//   Fila 1-3: ZERO + 3×12 números + 3 col labels
//   Fila 4: 1ST 12 / 2ND 12 / 3RD 12 (docenas)
//   Fila 5: 1-18 / EVEN / RED / BLACK / ODD / 19-36
//   Fila 6: WHEEL strip
//
// Mapping (corregido por el usuario):
//   Fila TOP    → COL 3
//   Fila MID    → COL 2
//   Fila BOTTOM → COL 1

import type { EnginePayload } from '@/types/api';
import { WheelStrip } from '@/components/WheelStrip';

const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  if (REDS.has(n)) return 'red';
  return 'black';
}

const ROW_TOP = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const ROW_MID = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const ROW_BOT = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

type State = 'bet' | 'probe' | 'wait' | null;

function statusToCls(status: unknown): State {
  if (status == null) return null;
  const s = String(status).toUpperCase().trim();
  if (s === 'BET' || s === 'EXPLOIT') return 'bet';
  if (s === 'PROBE') return 'probe';
  if (s === 'WAIT' || s === 'OBSERVE') return 'wait';
  return null;
}

function pickContains(pick: unknown, ...keywords: string[]): boolean {
  if (pick == null) return false;
  const t = String(pick).toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

interface BoardState {
  red: State; black: State;
  even: State; odd: State;
  low: State; high: State;
  doz1: State; doz2: State; doz3: State;
  col1: State; col2: State; col3: State;
}

function computeBoardStates(payload: EnginePayload | null): BoardState {
  const advice: any = (payload as any)?.decision?.bet_advice ?? {};
  const out: BoardState = {
    red: null, black: null, even: null, odd: null,
    low: null, high: null,
    doz1: null, doz2: null, doz3: null,
    col1: null, col2: null, col3: null,
  };

  const c = advice.color ?? {};
  const cState = statusToCls(c.status ?? c.final_action ?? c.action);
  if (cState) {
    const pick = c.pick ?? c.selection ?? c.value ?? c.label ?? '';
    if (pickContains(pick, 'rojo', 'red')) out.red = cState;
    if (pickContains(pick, 'negro', 'black')) out.black = cState;
  }

  const par = advice.paridad ?? {};
  const parState = statusToCls(par.status ?? par.final_action ?? par.action);
  if (parState) {
    const pick = par.pick ?? par.selection ?? par.value ?? par.label ?? '';
    if (pickContains(pick, 'par') && !pickContains(pick, 'impar')) out.even = parState;
    if (pickContains(pick, 'impar', 'odd')) out.odd = parState;
  }

  const rng = advice.rango ?? {};
  const rngState = statusToCls(rng.status ?? rng.final_action ?? rng.action);
  if (rngState) {
    const pick = rng.pick ?? rng.selection ?? rng.value ?? rng.label ?? '';
    if (pickContains(pick, 'bajo', 'low', '1-18')) out.low = rngState;
    if (pickContains(pick, 'alto', 'high', '19-36')) out.high = rngState;
  }

  const doz = advice.docenas ?? {};
  const dozState = statusToCls(doz.status ?? doz.final_action ?? doz.action);
  if (dozState) {
    const pick = String(doz.pick ?? doz.selection ?? '').toLowerCase();
    if (pick.includes('1-12') || pick.includes('1ra') || pick.includes('docena 1')) out.doz1 = dozState;
    if (pick.includes('13-24') || pick.includes('2da') || pick.includes('docena 2')) out.doz2 = dozState;
    if (pick.includes('25-36') || pick.includes('3ra') || pick.includes('docena 3')) out.doz3 = dozState;
  }

  const col = advice.columnas ?? {};
  const colState = statusToCls(col.status ?? col.final_action ?? col.action);
  if (colState) {
    const pick = String(col.pick ?? col.selection ?? '').toLowerCase();
    if (pick.includes('columna 1') || pick.includes('col 1') || pick.includes('col1')) out.col1 = colState;
    if (pick.includes('columna 2') || pick.includes('col 2') || pick.includes('col2')) out.col2 = colState;
    if (pick.includes('columna 3') || pick.includes('col 3') || pick.includes('col3')) out.col3 = colState;
  }

  return out;
}

function classForState(s: State): string { return s ? ` state-${s}` : ''; }
function badgeForState(s: State): string | null { return s ? s.toUpperCase() : null; }

// ── Componente principal ──────────────────────────────────────────

interface Props {
  payload: EnginePayload | null;
  wheelInfo?: Record<string, any> | null;
  onPick?: (kind: string, value: string | number) => void;
}

export function RouletteBoard({ payload, wheelInfo, onPick }: Props) {
  const s = computeBoardStates(payload);

  const renderCell = (n: number) => {
    const c = colorOf(n);
    return (
      <div
        key={n}
        className={`cell cell-${c}`}
        onClick={() => onPick?.('number', n)}
        title={`Apostar al ${n}`}
      >
        {n}
      </div>
    );
  };

  return (
    <div className="board">
      <div className="board-grid">
        <div
          className="cell cell-zero"
          onClick={() => onPick?.('number', 0)}
          title="Apostar al 0"
        >
          0
        </div>

        {/* Fila TOP → COL 3 */}
        {ROW_TOP.map(renderCell)}
        <div
          className={`col-label${classForState(s.col3)}`}
          onClick={() => onPick?.('column', 3)}
          title="Apostar a Columna 3"
        >
          COL 3
        </div>

        {/* Fila MID → COL 2 */}
        {ROW_MID.map(renderCell)}
        <div
          className={`col-label${classForState(s.col2)}`}
          onClick={() => onPick?.('column', 2)}
          title="Apostar a Columna 2"
        >
          COL 2
        </div>

        {/* Fila BOTTOM → COL 1 */}
        {ROW_BOT.map(renderCell)}
        <div
          className={`col-label${classForState(s.col1)}`}
          onClick={() => onPick?.('column', 1)}
          title="Apostar a Columna 1"
        >
          COL 1
        </div>
      </div>

      <div className="outside-bets">
        <div />
        <OutsideBtn state={s.doz1} onClick={() => onPick?.('dozen', 1)} span={4} label="1ST 12" />
        <OutsideBtn state={s.doz2} onClick={() => onPick?.('dozen', 2)} span={4} label="2ND 12" />
        <OutsideBtn state={s.doz3} onClick={() => onPick?.('dozen', 3)} span={4} label="3RD 12" />
        <div />

        <div />
        <OutsideBtn state={s.low} onClick={() => onPick?.('range', 'low')} span={2} label="1-18" />
        <OutsideBtn state={s.even} onClick={() => onPick?.('parity', 'even')} span={2} label="EVEN" />
        <OutsideBtn state={null} onClick={() => onPick?.('color', 'red')} span={2} label="RED" extraCls="btn-red" ringOnPick={s.red} />
        <OutsideBtn state={null} onClick={() => onPick?.('color', 'black')} span={2} label="BLACK" extraCls="btn-black" ringOnPick={s.black} />
        <OutsideBtn state={s.odd} onClick={() => onPick?.('parity', 'odd')} span={2} label="ODD" />
        <OutsideBtn state={s.high} onClick={() => onPick?.('range', 'high')} span={2} label="19-36" />
        <div />
      </div>

      {/* WHEEL strip */}
      <WheelStrip wheelInfo={wheelInfo ?? null} />
    </div>
  );
}

// ── Subcomponente: botón apuesta externa ──────────────────────────

interface OutsideBtnProps {
  state: State;
  onClick: () => void;
  span: number;
  label: string;
  extraCls?: string;
  ringOnPick?: State;
}

function OutsideBtn({
  state, onClick, span, label, extraCls = '', ringOnPick = null,
}: OutsideBtnProps) {
  const effective = state || ringOnPick;
  const stateCls = classForState(effective);
  const badge = badgeForState(effective);
  return (
    <div
      className={`btn-outside${stateCls} ${extraCls}`.trim()}
      style={{ gridColumn: `span ${span}` }}
      onClick={onClick}
    >
      <span className="btn-outside-lbl">{label}</span>
      {badge && <span className="btn-badge">{badge}</span>}
    </div>
  );
}
