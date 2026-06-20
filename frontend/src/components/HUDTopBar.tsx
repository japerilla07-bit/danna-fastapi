// HUDTopBar v2 — Premium cyber.
// Port 1:1 del mockup_v2.html aprobado.
//
// Lógica (extraída de app.py, no cambia):
//   - normAction, fmtCOP, formatPrimaryBetText
//   - estado_txt, hud_state_cls
//   - mission strip con chips por categoría (win rate)
//
// Visual nuevo respecto a v1:
//   - 4 esquinas técnicas tipo "cabina" (corchetes cyan)
//   - Borde con gradient animado (conic-gradient rotando 8s)
//   - Brand con triple gradient (cyan + violeta + magenta) + flow + breathe
//   - Chips con bevel real (gradient 3-stops + inset shadow)
//   - Pills de estado con triple capa de glow (inset + 30px + 60px)
//   - Mission line con strong en cyan + text-shadow

import type { EnginePayload, CountersMap } from '@/types/api';

// ── Helpers (port verbatim de app.py) ─────────────────────────────

function normAction(action: unknown): 'BET' | 'PROBE' | 'WAIT' {
  const a = String(action ?? '').toUpperCase().trim();
  if (a === 'BET' || a === 'EXPLOIT') return 'BET';
  if (a === 'PROBE') return 'PROBE';
  if (a === 'WAIT' || a === 'OBSERVE') return 'WAIT';
  return (a as 'BET' | 'PROBE' | 'WAIT') || 'WAIT';
}

function fmtCOP(v: unknown): string {
  let n: number;
  try {
    n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
    if (!isFinite(n)) n = 0;
  } catch {
    n = 0;
  }
  const us = n.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  return us.replace(/,/g, '.');
}

function formatPrimaryBetText(pb: any): string {
  if (!pb || typeof pb !== 'object' || Object.keys(pb).length === 0) return '—';
  const k = pb.bet_key ?? 'N/D';
  const label = pb.label ?? k;
  if (k === 'max_conf' || pb.type === 'numbers') {
    const nums = Array.isArray(pb.numbers) ? pb.numbers : [];
    if (nums.length > 0) return `${label}: Nums [${nums.join(', ')}]`;
    return `${label}: —`;
  }
  const pick = pb.pick;
  return pick != null ? `${label}: ${pick}` : `${label}: —`;
}

// ── Mission strip data ────────────────────────────────────────────

const MISSION_CATS: Array<[string, string]> = [
  ['Doc', 'docenas'],
  ['Col', 'columnas'],
  ['Clr', 'color'],
  ['Par', 'paridad'],
  ['Rng', 'rango'],
  ['Num', 'max_conf'],
  ['GD', 'guardian_docena'],
  ['GC', 'guardian_columna'],
];

interface MissionChip {
  name: string;
  vtxt: string;
  cls: 'good' | 'mid' | 'bad';
}

function buildMissionData(
  payload: EnginePayload | null,
  counters: CountersMap,
): { line: string; chips: MissionChip[] } {
  const decision = payload?.decision ?? {};
  const pb = decision?.primary_bet ?? {};
  const primaryTxt = formatPrimaryBetText(pb);
  const reason = String(decision?.final_reason ?? decision?.reason ?? '').trim();

  let bestName: string | null = null;
  let bestWr = -1;
  let bestDen = 0;
  const chips: MissionChip[] = [];

  for (const [name, key] of MISSION_CATS) {
    const c = counters?.[key] ?? {};
    const w = Number(c.wins ?? 0);
    const l = Number(c.losses ?? 0);
    const d = w + l;

    let vtxt: string;
    let cls: 'good' | 'mid' | 'bad';

    if (d <= 0) {
      vtxt = '—';
      cls = 'mid';
    } else {
      const wr = w / d;
      vtxt = `${(wr * 100).toFixed(1)}% (${w}/${d})`;
      if (wr >= 0.58) cls = 'good';
      else if (wr >= 0.5) cls = 'mid';
      else cls = 'bad';

      if (d >= 3 && wr > bestWr) {
        bestWr = wr;
        bestName = name;
        bestDen = d;
      }
    }
    chips.push({ name, vtxt, cls });
  }

  const parts: string[] = [];
  if (primaryTxt && primaryTxt !== '—') parts.push(`Principal: ${primaryTxt}`);
  if (reason) parts.push(reason);
  if (bestName && bestDen > 0) parts.push(`Mejor: ${bestName} ${(bestWr * 100).toFixed(1)}%`);
  const line = parts.length > 0 ? parts.join(' · ') : 'Calibrando · señal insuficiente';

  return { line, chips };
}

// ── Componente ────────────────────────────────────────────────────

interface Props {
  payload: EnginePayload | null;
  counters: CountersMap;
  spinsCount: number;
  bankroll: number;
}

export function HUDTopBar({ payload, counters, spinsCount, bankroll }: Props) {
  const decision = payload?.decision ?? {};
  const fa = decision?.final_action ?? decision?.action ?? '';
  const status = normAction(fa);

  const estadoTxt =
    status === 'BET' ? 'EXECUTION ACTIVE'
    : status === 'PROBE' ? 'PROBING RANGE'
    : 'SCANNING...';

  const pb = decision?.primary_bet ?? {};
  const primaryTxt = formatPrimaryBetText(pb);

  let conf: number | null = null;
  for (const k of ['confidence', 'conf', 'p', 'prob', 'score'] as const) {
    if (pb && pb[k] != null) {
      const v = Number(pb[k]);
      if (isFinite(v)) {
        conf = v;
        break;
      }
    }
  }
  const confTxt = conf !== null ? conf.toFixed(3) : '—';

  const brTxt = fmtCOP(bankroll);
  const stateCls = status.toLowerCase();

  const { line, chips } = buildMissionData(payload, counters);

  // Primera palabra hasta ":" en cyan
  const colonIdx = line.indexOf(':');
  const lineHead = colonIdx >= 0 ? line.substring(0, colonIdx + 1) : '';
  const lineRest = colonIdx >= 0 ? line.substring(colonIdx + 1) : line;

  return (
    <div className="hud">
      {/* Esquinas técnicas tipo cabina */}
      <span className="hud-corner hud-corner-tl" />
      <span className="hud-corner hud-corner-tr" />
      <span className="hud-corner hud-corner-bl" />
      <span className="hud-corner hud-corner-br" />

      <div className="hud-row">
        <div className="hud-left">
          <div className="hud-brand">
            <div className="hud-brand-app">D.A.N.N.A</div>
            <div className="hud-brand-sub">Adaptive Neural Engine · 2026</div>
          </div>

          <div className={`hud-chip hud-chip-state hud-state-${stateCls}`}>
            <span className="hud-chip-k">STATUS</span>
            <span className="hud-chip-v">{estadoTxt}</span>
          </div>

          <div className={`hud-chip hud-chip-state hud-state-${stateCls}`}>
            <span className="hud-chip-k">ACTION</span>
            <span className="hud-chip-v">{status}</span>
          </div>

          <div className="hud-chip hud-chip-principal">
            <span className="hud-chip-k">PRIMARY VECTOR</span>
            <span className="hud-chip-v">{primaryTxt}</span>
          </div>
        </div>

        <div className="hud-right">
          <div className="hud-chip hud-chip-stat">
            <span className="hud-chip-k">CONF COEFF</span>
            <span className="hud-chip-v">{confTxt}</span>
          </div>
          <div className="hud-chip hud-chip-stat">
            <span className="hud-chip-k">SEQUENCES</span>
            <span className="hud-chip-v">{spinsCount}</span>
          </div>
          <div className="hud-chip hud-chip-stat">
            <span className="hud-chip-k">CAPITAL POOL</span>
            <span className="hud-chip-v">${brTxt}</span>
          </div>
        </div>
      </div>

      <div className="hud-mission">
        <div className="hud-mission-line">
          {lineHead ? (
            <>
              <strong>{lineHead}</strong>
              {lineRest}
            </>
          ) : (
            line
          )}
        </div>
        <div className="hud-mission-metrics">
          {chips.map((ch) => (
            <div key={ch.name} className={`hud-mini-chip hud-mini-${ch.cls}`}>
              <span className="hud-mini-k">{ch.name}</span>
              <span className="hud-mini-v">{ch.vtxt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
