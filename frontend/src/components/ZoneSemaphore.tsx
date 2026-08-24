// ZoneSemaphore — Semáforo bifurcado (DOCENAS · COLUMNAS) + Drawdown Tracker.
//
// QUÉ MUESTRA (dos tarjetas gemelas, apaisadas):
//   ┌────────────── DOCENAS ──────────────┐  ┌────────────── COLUMNAS ─────────────┐
//   │  🟢 VERDE          HUD 48 · ENT 22  │  │  🔴 TÓXICA         HUD 48 · ENT 22  │
//   │  celda operable — cumple matriz     │  │  celda fuera de zona segura         │
//   │  drawdown: ■ ■ ■ □ □ □ □   (0/7)    │  │  drawdown: ■ ■ □ □ □   (2/5)        │
//   └─────────────────────────────────────┘  └─────────────────────────────────────┘
//
// Basado en la matriz 6-celdas validada en la auditoría (tabla del docx).
//
// QUÉ NO HACE (regla de Gunner: solo aviso, no bloqueo):
//   - No frena al motor.
//   - No modifica la sugerencia TOP.
//   - El operador sigue decidiendo.
//   - PROBE = celda a ≤5 puntos de cruzar a verde (transición).
//
// Estado por mercado se calcula por celda HUD × ENT. Fuera de rango → TÓXICA.

import { useMemo, useRef } from 'react';

type Zona = 'VERDE' | 'PROBE' | 'TOXICA';
type Mercado = 'doc' | 'col';

interface Props {
  hud: number | null;
  entropy: number | null;
  /** Últimos resultados por mercado, el más reciente al FINAL. isError=true si erró. */
  docHist: { isError: boolean }[];
  colHist: { isError: boolean }[];
}

/**
 * Matriz VERDE validada (auditoría 4036 giros, WR por celda arriba de 66.67%).
 * Cada regla: [ent_min, ent_max, hud_min, hud_max, doc_verde, col_verde].
 */
const REGLAS: Array<[number, number, number, number, boolean, boolean]> = [
  [0, 15, 0, 40, true, true],
  [0, 15, 41, 45, false, true],
  [16, 30, 41, 45, false, true],
  [16, 30, 46, 55, true, false],
  [31, 45, 0, 45, true, true],
  [46, 60, 46, 50, true, false],
  [61, 100, 0, 40, true, false],
  [61, 100, 46, 50, true, true],
];

function esVerde(hud: number, ent: number, mkt: Mercado): boolean {
  for (const [eLo, eHi, hLo, hHi, dOk, cOk] of REGLAS) {
    if (ent >= eLo && ent <= eHi && hud >= hLo && hud <= hHi) {
      return mkt === 'doc' ? dOk : cOk;
    }
  }
  return false;
}

/**
 * PROBE: si moviendo HUD o ENT hasta 5 puntos en cualquier dirección
 * caeríamos en zona verde, es transición → ámbar.
 */
function estaEnProbe(hud: number, ent: number, mkt: Mercado): boolean {
  if (esVerde(hud, ent, mkt)) return false;
  for (let dh = -5; dh <= 5; dh++) {
    for (let de = -5; de <= 5; de++) {
      const h = Math.max(0, Math.min(100, hud + dh));
      const e = Math.max(0, Math.min(100, ent + de));
      if (esVerde(h, e, mkt)) return true;
    }
  }
  return false;
}

function clasificar(hud: number | null, ent: number | null, mkt: Mercado): Zona {
  if (hud === null || ent === null) return 'TOXICA';
  if (esVerde(hud, ent, mkt)) return 'VERDE';
  if (estaEnProbe(hud, ent, mkt)) return 'PROBE';
  return 'TOXICA';
}

/** Racha de errores contigua actual (cortada por el último acierto). */
function rachaActual(hist: { isError: boolean }[]): number {
  let n = 0;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].isError) n++;
    else break;
  }
  return n;
}

const COLORES: Record<Zona, { bg: string; bd: string; tx: string; lbl: string; ico: string }> = {
  VERDE: {
    bg: 'linear-gradient(180deg, rgba(6,78,59,0.35) 0%, rgba(6,78,59,0.15) 100%)',
    bd: 'rgba(52,211,153,0.55)',
    tx: '#a7f3d0',
    lbl: 'VERDE · OPERABLE',
    ico: '🟢',
  },
  PROBE: {
    bg: 'linear-gradient(180deg, rgba(120,53,15,0.35) 0%, rgba(120,53,15,0.15) 100%)',
    bd: 'rgba(251,146,60,0.55)',
    tx: '#fed7aa',
    lbl: 'PROBE · TRANSICIÓN',
    ico: '🟠',
  },
  TOXICA: {
    bg: 'linear-gradient(180deg, rgba(127,29,29,0.4) 0%, rgba(127,29,29,0.18) 100%)',
    bd: 'rgba(248,113,113,0.55)',
    tx: '#fecaca',
    lbl: 'TÓXICA · CAUTELA',
    ico: '🔴',
  },
};

function Tarjeta({
  mkt,
  zona,
  hud,
  ent,
  racha,
  bloques,
}: {
  mkt: Mercado;
  zona: Zona;
  hud: number | null;
  ent: number | null;
  racha: number;
  bloques: number;
}) {
  const c = COLORES[zona];
  const titulo = mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS';
  const rachaPct = Math.min(racha, bloques);

  return (
    <div
      style={{
        flex: 1,
        borderRadius: 10,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px ${c.bd}22`,
        minWidth: 0,
      }}
    >
      {/* Encabezado: mercado + coordenadas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.2em',
            color: '#94a3b8',
          }}
        >
          {titulo}
        </span>
        <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
          HUD {hud ?? '—'} · ENT {ent ?? '—'}
        </span>
      </div>

      {/* Estado grande */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{c.ico}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: c.tx,
            letterSpacing: '0.1em',
          }}
        >
          {c.lbl}
        </span>
      </div>

      {/* Drawdown tracker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 8.5,
            color: '#64748b',
            letterSpacing: '0.15em',
          }}
        >
          <span>DRAWDOWN</span>
          <span style={{ color: racha >= bloques - 1 ? '#f87171' : '#94a3b8' }}>
            {racha}/{bloques}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: bloques }).map((_, i) => {
            const on = i < rachaPct;
            const alerta = i >= bloques - 2 && on;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 2,
                  background: on
                    ? alerta
                      ? 'rgba(248,113,113,0.85)'
                      : 'rgba(251,146,60,0.75)'
                    : 'rgba(148,163,184,0.15)',
                  border: `1px solid ${on ? 'rgba(248,113,113,0.5)' : 'rgba(148,163,184,0.2)'}`,
                  transition: 'background 0.2s',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ZoneSemaphore({ hud, entropy, docHist, colHist }: Props) {
  const zonaDoc = useMemo(() => clasificar(hud, entropy, 'doc'), [hud, entropy]);
  const zonaCol = useMemo(() => clasificar(hud, entropy, 'col'), [hud, entropy]);
  const rDoc = useMemo(() => rachaActual(docHist), [docHist]);
  const rCol = useMemo(() => rachaActual(colHist), [colHist]);
  // evitar warning si no se usa (pero se usa arriba)
  const _u = useRef(null); void _u;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        className="text-[12px] text-cyan-500/70 mb-0.5 px-1"
        style={{ letterSpacing: '0.3em' }}
      >
        SEMÁFORO DE ZONA · SUGERENCIA
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Tarjeta mkt="doc" zona={zonaDoc} hud={hud} ent={entropy} racha={rDoc} bloques={7} />
        <Tarjeta mkt="col" zona={zonaCol} hud={hud} ent={entropy} racha={rCol} bloques={5} />
      </div>
      <span
        style={{
          fontSize: 8.5,
          color: '#64748b',
          letterSpacing: '0.08em',
          padding: '0 4px',
          fontStyle: 'italic',
        }}
      >
        aviso informativo — la zona no predice el próximo giro, es lectura de terreno
      </span>
    </div>
  );
}
