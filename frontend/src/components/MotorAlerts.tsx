// MotorAlerts.tsx
// Monitor de alarmas del motor — SOLO INFORMACIÓN. No bloquea, no pausa, no
// cambia ninguna decisión. Se enchufa dentro del QuantumPilot, debajo de
// <PilotDelta/>, y se alimenta en vivo con cada giro.
//
// Dos alarmas (hipótesis del operador):
//   · DOCENAS  "Desplome Silencioso"  → HUD < 45  Y  Radar <= 3   (niveles del giro actual)
//   · COLUMNAS "Desgarre Geométrico"  → ΔEnt >= 15 (sube)  O  |ΔHUD| >= 20 (salto en cualquier dirección)
//
// Los Δ se calculan contra el giro ANTERIOR, en el navegador (misma fuente que
// anotas: "valor del hud" y "table entrophy"). En CALIBRANDO hud/entropy llegan
// como null → no se evalúa nada y las alarmas quedan apagadas.
//
// AVISO honesto (para no autoengañarnos): son reglas nuevas con umbrales
// elegidos a mano. La auditoría sobre 9 sesiones no encontró que DOCENAS
// respondan a ningún indicador, ni que el RADAR prediga nada. Esto se muestra
// para OBSERVAR y validar en vivo, no como señal fiable — y NO intenta
// anticipar el próximo giro.

import { useRef } from 'react';

interface Props {
  spinsCount: number;
  hud: number | null;     // "valor del hud" del giro actual (null en CALIBRANDO)
  radar: number;          // godBet.radar_score, escala 0–10
  entropy: number | null; // "table entrophy" del giro actual, 0–100 (null en CALIBRANDO)
  // Umbrales como props para recalibrar sin tocar el componente:
  docHudMax?: number;   // default 45  — HUD por debajo (parte de la alarma docenas)
  docRadarMax?: number; // default 3   — Radar igual o por debajo
  colDEntMin?: number;  // default 15  — ΔEntropía de SUBIDA
  colDHudMin?: number;  // default 20  — |ΔHUD| (salto en cualquier dirección)
}

export function MotorAlerts({
  spinsCount,
  hud,
  radar,
  entropy,
  docHudMax = 45,
  docRadarMax = 3,
  colDEntMin = 15,
  colDHudMin = 20,
}: Props) {
  const hudNum = typeof hud === 'number' ? hud : NaN;
  const entNum = typeof entropy === 'number' ? entropy : NaN;

  // Memoria del giro anterior + últimos Δ. Solo se actualiza cuando ENTRA un
  // giro nuevo CON lecturas válidas; así los Δ no se borran en re-renders ni se
  // ensucian con nulls de calibración.
  const st = useRef<{ n: number; hud: number; ent: number; dHud: number; dEnt: number }>({
    n: -1,
    hud: hudNum,
    ent: entNum,
    dHud: 0,
    dEnt: 0,
  });

  if (st.current.n !== spinsCount && !Number.isNaN(hudNum) && !Number.isNaN(entNum)) {
    const first =
      st.current.n === -1 || Number.isNaN(st.current.hud) || Number.isNaN(st.current.ent);
    st.current = {
      n: spinsCount,
      hud: hudNum,
      ent: entNum,
      dHud: first ? 0 : hudNum - st.current.hud,
      dEnt: first ? 0 : entNum - st.current.ent,
    };
  }
  const dHud = st.current.dHud;
  const dEnt = st.current.dEnt;

  const docAlarm = !Number.isNaN(hudNum) && hudNum < docHudMax && radar <= docRadarMax;
  const colAlarm = dEnt >= colDEntMin || Math.abs(dHud) >= colDHudMin;

  const colReason = colAlarm
    ? [
        dEnt >= colDEntMin ? `ΔEnt +${Math.round(dEnt)}` : null,
        Math.abs(dHud) >= colDHudMin ? `ΔHUD ${dHud >= 0 ? '+' : ''}${Math.round(dHud)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const row = (
    label: string,
    subtitle: string,
    on: boolean,
    detail: string,
  ) => (
    <div
      className="flex items-center justify-between px-2.5 py-1.5 rounded-md"
      style={{
        background: on
          ? 'linear-gradient(90deg, rgba(120, 53, 15, 0.35) 0%, rgba(69, 26, 3, 0.25) 100%)'
          : 'linear-gradient(90deg, rgba(15, 23, 42, 0.5) 0%, rgba(8, 12, 22, 0.35) 100%)',
        border: on ? '1px solid rgba(251, 146, 60, 0.5)' : '1px solid rgba(34, 211, 238, 0.08)',
      }}
    >
      <span className="flex flex-col leading-tight">
        <span
          className="text-[12px] font-bold"
          style={{ letterSpacing: '0.12em', color: on ? '#fdba74' : '#94a3b8' }}
        >
          {label}
        </span>
        <span className="text-[9px] text-gray-500" style={{ letterSpacing: '0.08em' }}>
          {subtitle}
        </span>
      </span>
      <span
        className="text-[11px] font-mono"
        style={{
          color: on ? '#fb923c' : '#475569',
          textShadow: on ? '0 0 6px rgba(251, 146, 60, 0.5)' : 'none',
        }}
      >
        {on ? `▲ ${detail}` : '— tranquila'}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[12px] text-cyan-500/70 px-1"
        style={{ letterSpacing: '0.3em' }}
      >
        MONITOR DE ALARMAS · INFO (no pausa)
      </span>
      {row(
        'DOCENAS',
        'Desplome Silencioso · HUD<45 & Radar≤3',
        docAlarm,
        `HUD ${Number.isNaN(hudNum) ? '—' : Math.round(hudNum)} · RDR ${radar}`,
      )}
      {row(
        'COLUMNAS',
        'Desgarre Geométrico · ΔEnt≥15 o |ΔHUD|≥20',
        colAlarm,
        colReason,
      )}
    </div>
  );
}
