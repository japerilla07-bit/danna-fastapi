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

// ── TEMA VISUAL GEASS / SHIKON PARA LA TERMINAL ──
const TAG_THEME: Record<string, { color: string; glow: string }> = {
  SYSTEM:   { color: '#00e5ff', glow: 'rgba(0,229,255,0.6)' },   // Cyan
  DANNA:    { color: '#ffdf60', glow: 'rgba(255,223,96,0.6)' },  // Dorado
  GUARDIAN: { color: '#ff1e38', glow: 'rgba(255,30,56,0.8)' },   // Carmesí
  PILOT:    { color: '#00ff9d', glow: 'rgba(0,255,157,0.6)' },   // Jade
  WARN:     { color: '#ff1e38', glow: 'rgba(255,30,56,0.8)' },   // Carmesí
  INFO:     { color: '#94a3b8', glow: 'transparent' },           // Gris
};

const containerStyle: React.CSSProperties = {
  padding: '12px 14px',
  clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
  background: 'linear-gradient(135deg, rgba(10,14,28,0.95) 0%, rgba(3,4,8,0.98) 100%)',
  border: '1px solid rgba(0,229,255,0.25)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,229,255,0.05)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10px',
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  marginBottom: '8px'
};

const bgOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'repeating-linear-gradient(0deg, rgba(0,229,255,0.02) 0px, rgba(0,229,255,0.02) 1px, transparent 1px, transparent 4px)',
  pointerEvents: 'none',
  zIndex: 0,
};

export function WarTerminal({ payload, spins }: Props) {
  const logs = useMemo(() => buildLogsFromPayload(payload, spins), [payload, spins]);

  // Inyección de animación para el cursor de la terminal
  const styleBlock = (
    <style>{`
      @keyframes wt-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      .wt-cursor-blink { animation: wt-blink 1s step-end infinite; }
    `}</style>
  );

  if (logs.length === 0) {
    return (
      <div className="war-terminal" style={containerStyle}>
        {styleBlock}
        <div style={bgOverlay} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: '#5c687a' }}>{nowTs()}</span>
          <span style={{ color: TAG_THEME.SYSTEM.color, textShadow: `0 0 8px ${TAG_THEME.SYSTEM.glow}`, fontWeight: 800 }}>[SYSTEM]</span>
          <span style={{ color: '#cbd5e1' }}>aguardando datos...</span>
          <span className="wt-cursor-blink" style={{ display: 'inline-block', width: '6px', height: '12px', background: TAG_THEME.SYSTEM.color, boxShadow: `0 0 8px ${TAG_THEME.SYSTEM.glow}`, marginTop: '1px' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="war-terminal" style={containerStyle}>
      {styleBlock}
      <div style={bgOverlay} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        {logs.map((l, i) => {
          const t = TAG_THEME[l.tag] || TAG_THEME.INFO;
          const isLast = i === logs.length - 1;
          const isWarning = l.tag === 'GUARDIAN' || l.tag === 'WARN';

          return (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '5px', lineHeight: 1.3 }}>
              {/* Timestamp oscuro */}
              <span style={{ color: '#5c687a', flexShrink: 0 }}>{l.ts}</span>
              
              {/* Tag con neón intenso */}
              <span style={{ color: t.color, textShadow: `0 0 8px ${t.glow}`, fontWeight: 800, flexShrink: 0 }}>
                [{l.tag}]
              </span>
              
              {/* Texto (Si es alerta, se tiñe de rojo, sino gris claro) */}
              <span style={{ 
                color: isWarning ? '#ff1e38' : '#cbd5e1', 
                flex: 1, wordBreak: 'break-word', 
                textShadow: isWarning ? `0 0 8px ${t.glow}` : 'none',
                fontWeight: isWarning ? 700 : 400
              }}>
                {l.text}
              </span>
              
              {/* Cursor palpitante (Solo en la última línea) */}
              {isLast && (
                <span className="wt-cursor-blink" style={{ 
                  display: 'inline-block', width: '6px', height: '11px', 
                  background: t.color, boxShadow: `0 0 8px ${t.glow}`, 
                  flexShrink: 0, marginTop: '2px' 
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
