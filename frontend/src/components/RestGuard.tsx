// RestGuard — Freno de DESCANSO cuando la mesa viene pegando.
//
// QUÉ HACE: cuando detecta un tramo feo reciente (racha de errores o muchos
// errores en la ventana), te manda a descansar N giros con un aviso grande.
// Se alimenta del historial de columnas (mismo `colHist` que ya arma AppPage).
//
// QUÉ NO HACE, y hay que tenerlo claro: NO predice el próximo giro. La mesa no
// se pone buena después de mala, vuelve a lo NORMAL (~66% acierto) por
// regresión a la media. El valor del descanso es sacarte del peor tramo de la
// excursión y del reflejo de perseguir — no acertar el momento de reentrada.
//
// Cadencia (medida sobre 9 sesiones de columnas, ~358 giros c/u): con
// racha≥4 O ≥8/12 dispara ~4 veces por sesión. Todo es prop-configurable.

import { useEffect, useRef, useState } from 'react';

interface Props {
  spinsCount: number;
  /** Historial reciente de columnas, el más nuevo AL FINAL. */
  results: { isError: boolean }[];
  restSpins?: number;   // giros de descanso (default 6, rango sano 5–7)
  streakTrig?: number;  // racha de errores que dispara (default 4)
  rollWin?: number;     // ventana rodante (default 12)
  hardCount?: number;   // errores en la ventana que disparan (default 8)
}

export function RestGuard({
  spinsCount,
  results,
  restSpins = 6,
  streakTrig = 4,
  rollWin = 12,
  hardCount = 8,
}: Props) {
  const [left, setLeft] = useState(0);      // giros de descanso restantes (0 = operando)
  const [streak, setStreak] = useState(0);
  const [rollErr, setRollErr] = useState(0);
  const armed = useRef(true);               // puede volver a disparar
  const lastSpin = useRef(-1);

  useEffect(() => {
    if (spinsCount === lastSpin.current) return;
    const first = lastSpin.current === -1;
    lastSpin.current = spinsCount;

    // Métricas del tramo reciente (racha corregida: acierto reinicia).
    let s = 0;
    for (const r of results) s = r.isError ? s + 1 : 0;
    const win = results.slice(-rollWin);
    const re = win.filter((r) => r.isError).length;
    setStreak(s);
    setRollErr(re);

    if (first) return;

    const hard = s >= streakTrig || (win.length >= rollWin && re >= hardCount);

    setLeft((prev) => {
      if (prev > 0) {
        const nl = prev - 1;
        if (nl <= 0) {
          armed.current = false; // fin del descanso: no re-disparar hasta que calme
          return 0;
        }
        return nl;
      }
      if (!hard) {
        armed.current = true; // mesa calmada → re-armar
        return 0;
      }
      if (hard && armed.current) {
        armed.current = false;
        return restSpins;
      }
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinsCount]);

  const resting = left > 0;
  const shown = Math.min(results.length, rollWin);

  const wrap: React.CSSProperties = {
    position: 'fixed',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 7000,
    fontFamily: 'monospace',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    pointerEvents: 'auto',
  };

  if (!resting) {
    // Chip discreto de estado — no molesta mientras operás.
    return (
      <div
        style={{
          ...wrap,
          padding: '4px 10px',
          fontSize: 10,
          letterSpacing: '0.08em',
          background: 'rgba(10,16,26,0.75)',
          border: '1px solid rgba(148,163,184,0.25)',
          color: '#94a3b8',
          backdropFilter: 'blur(6px)',
        }}
      >
        RACHA {streak} · {rollErr}/{shown} err (12)
      </div>
    );
  }

  return (
    <div
      style={{
        ...wrap,
        flexDirection: 'column',
        padding: '10px 18px',
        background: 'linear-gradient(180deg, rgba(127,29,29,0.95) 0%, rgba(69,10,10,0.95) 100%)',
        border: '1px solid rgba(248,113,113,0.7)',
        boxShadow: '0 0 24px rgba(220,38,38,0.4)',
        color: '#fecaca',
        backdropFilter: 'blur(8px)',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.1em' }}>
        🔴 DESCANSÁ · quedan {left} giros
      </span>
      <span style={{ fontSize: 9, opacity: 0.8, letterSpacing: '0.04em', maxWidth: 260 }}>
        la mesa viene pegando — no persigas. es un break de disciplina, no predice el próximo giro.
      </span>
      <button
        onClick={() => {
          setLeft(0);
          armed.current = false;
        }}
        style={{
          marginTop: 2,
          fontSize: 10,
          padding: '3px 10px',
          borderRadius: 6,
          cursor: 'pointer',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid rgba(254,202,202,0.4)',
          color: '#fecaca',
          fontFamily: 'monospace',
          letterSpacing: '0.1em',
        }}
      >
        reanudar igual
      </button>
    </div>
  );
}
