// WarTerminal — Logs del sistema con timestamps + color por tipo.
//
// Tipos de mensaje (port de app.py L828-836):
//   [SYSTEM]   → cyan
//   [DANNA]    → amber
//   [GUARDIAN] → rojo
//   [PILOT]    → verde
//   text       → gris
//
// Por ahora muestra logs derivados del payload del motor.
// En el futuro se puede conectar a un endpoint /api/logs/stream
// (server-sent events) para logs en vivo del backend.

import { useMemo } from 'react';
import type { EnginePayload } from '@/types/api';

interface LogLine {
  ts: string;
  tag: 'SYSTEM' | 'DANNA' | 'GUARDIAN' | 'PILOT' | 'WARN' | 'INFO';
  text: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function nowTs(): string {
  const d = new Date();
  return `[${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}]`;
}

function buildLogsFromPayload(payload: EnginePayload | null, spins: readonly number[]): LogLine[] {
  const lines: LogLine[] = [];
  const lastFew = spins.slice(-5);

  if (lastFew.length > 0) {
    lines.push({
      ts: nowTs(),
      tag: 'SYSTEM',
      text: `Analyzing sequence: ${lastFew.join(', ')}...`,
    });
  }

  const d = payload?.decision ?? {};
  const fa = String(d.final_action ?? d.action ?? 'WAIT').toUpperCase();
  const pb = d.primary_bet ?? {};

  if (fa === 'BET' || fa === 'EXPLOIT') {
    lines.push({
      ts: nowTs(),
      tag: 'DANNA',
      text: `PRIMARY VECTOR — HIT ✓ | ${pb.label ?? '—'}: ${pb.pick ?? '—'}`,
    });
  } else if (fa === 'PROBE') {
    lines.push({
      ts: nowTs(),
      tag: 'DANNA',
      text: `PROBE | ${pb.label ?? '—'}: ${pb.pick ?? '—'} (edge insuficiente)`,
    });
  } else {
    lines.push({
      ts: nowTs(),
      tag: 'INFO',
      text: `WAIT | scanning patterns...`,
    });
  }

  // Mesa info
  const mesa = d.mesa_score ?? {};
  const score10 = mesa.score10;
  if (score10 != null) {
    lines.push({
      ts: nowTs(),
      tag: 'SYSTEM',
      text: `mesa_score=${score10}/10 · ${mesa.label ?? ''}`,
    });
  }

  // Pilot info
  const pilot = (payload as any)?.pilot ?? {};
  if (pilot.target_lock_text) {
    lines.push({
      ts: nowTs(),
      tag: 'PILOT',
      text: pilot.target_lock_text,
    });
  }

  // Drift / consecutivos
  const consec = (payload as any)?.consec_losses ?? d.pilot_consec_errors ?? 0;
  if (consec >= 4) {
    lines.push({
      ts: nowTs(),
      tag: 'GUARDIAN',
      text: `⚠ ${consec} errores consecutivos — reducir exposición`,
    });
  }

  return lines;
}

interface Props {
  payload: EnginePayload | null;
  spins: readonly number[];
}

export function WarTerminal({ payload, spins }: Props) {
  const logs = useMemo(() => buildLogsFromPayload(payload, spins), [payload, spins]);

  if (logs.length === 0) {
    return (
      <div className="war-terminal">
        <div className="wt-line">
          <span className="wt-ts">{nowTs()}</span>
          <span className="wt-sys">[SYSTEM]</span>
          <span className="wt-txt"> aguardando datos...</span>
          <span className="wt-cursor" />
        </div>
      </div>
    );
  }

  return (
    <div className="war-terminal">
      {logs.map((l, i) => {
        const tagCls =
          l.tag === 'SYSTEM' ? 'wt-sys' :
          l.tag === 'DANNA' ? 'wt-eng' :
          l.tag === 'GUARDIAN' ? 'wt-wrn' :
          l.tag === 'PILOT' ? 'wt-dan' :
          l.tag === 'WARN' ? 'wt-wrn' :
          'wt-txt';
        const isLast = i === logs.length - 1;
        return (
          <div key={i} className="wt-line">
            <span className="wt-ts">{l.ts}</span>
            <span className={tagCls}>[{l.tag}]</span>
            <span className="wt-txt"> {l.text}</span>
            {isLast && <span className="wt-cursor" />}
          </div>
        );
      })}
    </div>
  );
}
