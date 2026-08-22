// PilotDelta — HUD de Conciencia Situacional.
//
// Sustituye al bloque GOD del Quantum Pilot. NO toca el motor: solo lee lo que
// ya llega por /api/state y mantiene en memoria una ventana de los últimos 14
// giros para calcular rangos y deltas.
//
// ── TRES BLOQUES ──────────────────────────────────────────────────────────
//   A · ESTADO DEL MOTOR   W/R de los últimos 14, secuencia A/E, diagnóstico
//   B · ANCLAJE            rango (Max−Min) de HUD y Entropía en 5 giros
//   C · ALERTA DE CHOQUE   Δ contra el giro anterior + acción recomendada
//
// ── AVISO DE CALIBRACIÓN ──────────────────────────────────────────────────
// Los umbrales (ΔEnt > 8, ΔHUD > +5 cruzando 60) se calibraron sobre 125 spins
// en los que "table entrophy" era el paseo +5/−4 de table_health (rango 1-95).
// Si conectas `entropy` a otra fuente, esos umbrales NO transfieren y hay que
// recalibrarlos. Por eso las fuentes se pasan como props explícitas: verifica
// que los números que ves aquí coinciden con los que anotabas en tu Excel.
//
// ── EVIDENCIA DETRÁS DE CADA GATILLO ──────────────────────────────────────
//   ΔEnt > 8 → PAUSA DOCENAS   : superó al 92 % de las pausas aleatorias
//                                equivalentes en drawdown evitado (in-sample)
//   ΔHUD > +5 & HUD > 60 → COL : solo superó al 71 % — dentro del ruido
// El contador de validación al pie mide ambos en vivo para resolverlo.

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Nº de spins de la sesión — dispara el registro de un giro nuevo. */
  spinsCount: number;
  /** Valor de HUD tal como lo anotas en el Excel (columna "valor del hud"). */
  hud: number | null;
  /** Valor de entropía tal como lo anotas (columna "table entrophy"). */
  entropy: number | null;
  /** Resultado del último giro para docenas: true acierto, false error, null n/d. */
  docHit: boolean | null;
  /** Resultado del último giro para columnas. */
  colHit: boolean | null;
  /** Umbrales, por si hay que recalibrar sin tocar el código. */
  thrEnt?: number;
  thrHud?: number;
  thrHudNivel?: number;
}

interface Giro {
  n: number;
  hud: number | null;
  ent: number | null;
  doc: boolean | null;
  col: boolean | null;
  alertaEnt: boolean;
  alertaHud: boolean;
}

const VENTANA = 14;
const VENTANA_ANCLAJE = 5;

function rango(v: number[]): number | null {
  const x = v.filter((n: number) => Number.isFinite(n));
  if (x.length < 2) return null;
  return Math.max(...x) - Math.min(...x);
}

export function PilotDelta({
  spinsCount,
  hud,
  entropy,
  docHit,
  colHit,
  thrEnt = 8,
  thrHud = 5,
  thrHudNivel = 60,
}: Props) {
  const [hist, setHist] = useState<Giro[]>([]);
  const ultimoSpin = useRef<number>(-1);

  // Registra un giro cuando spinsCount avanza (evita duplicar en cada poll)
  useEffect(() => {
    if (spinsCount === ultimoSpin.current) return;
    if (ultimoSpin.current === -1) {
      ultimoSpin.current = spinsCount;
      return; // el primer poll solo fija el punto de partida
    }
    ultimoSpin.current = spinsCount;

    setHist((prev: Giro[]) => {
      const ant = prev[prev.length - 1];
      const dEnt =
        ant && Number.isFinite(ant.ent as number) && Number.isFinite(entropy as number)
          ? Math.abs((entropy as number) - (ant.ent as number))
          : 0;
      const dHudS =
        ant && Number.isFinite(ant.hud as number) && Number.isFinite(hud as number)
          ? (hud as number) - (ant.hud as number)
          : 0;

      const giro: Giro = {
        n: spinsCount,
        hud,
        ent: entropy,
        doc: docHit,
        col: colHit,
        alertaEnt: dEnt > thrEnt,
        alertaHud: dHudS > thrHud && (hud ?? 0) > thrHudNivel,
      };
      return [...prev, giro].slice(-60); // memoria acotada
    });
  }, [spinsCount, hud, entropy, docHit, colHit, thrEnt, thrHud, thrHudNivel]);

  const v14 = hist.slice(-VENTANA);
  const v5 = hist.slice(-VENTANA_ANCLAJE);
  const ant = hist[hist.length - 2];
  const act = hist[hist.length - 1];

  // ── BLOQUE A ── (por mercado: columnas y docenas)
  type EstadoMercado = {
    nEval: number;
    wr: number | null;
    wrCls: string;
    seq: string[];
    mesa: 'LIMPIA' | 'PESADA' | 'TÓXICA' | 'CALIBRANDO';
    mesaCls: string;
  };
  function estadoMercado(sel: (g: Giro) => boolean | null): EstadoMercado {
    const ev = v14.filter((g: Giro) => sel(g) !== null);
    const wr = ev.length ? (ev.filter((g: Giro) => sel(g)).length / ev.length) * 100 : null;
    const wrCls = wr === null ? 'na' : wr > 60 ? 'ok' : wr >= 50 ? 'mid' : 'bad';
    const seq = v14.slice(-6).map((g: Giro) => {
      const r = sel(g);
      return r === null ? '·' : r ? 'A' : 'E';
    });
    const ult5 = v5.map((g: Giro) => sel(g)).filter((x) => x !== null) as boolean[];
    let mesa: EstadoMercado['mesa'] = 'CALIBRANDO';
    if (ult5.length >= 3) {
      let max = 0;
      let c = 0;
      for (const h of ult5) {
        c = h ? 0 : c + 1;
        max = Math.max(max, c);
      }
      mesa = max >= 3 ? 'TÓXICA' : max === 2 ? 'PESADA' : 'LIMPIA';
    }
    const mesaCls = mesa === 'LIMPIA' ? 'ok' : mesa === 'PESADA' ? 'mid' : mesa === 'TÓXICA' ? 'bad' : 'na';
    return { nEval: ev.length, wr, wrCls, seq, mesa, mesaCls };
  }
  const estCol = estadoMercado((g) => g.col);
  const estDoc = estadoMercado((g) => g.doc);

  // ── BLOQUE B ──
  const rHud = rango(v5.map((g: Giro) => g.hud as number));
  const rEnt = rango(v5.map((g: Giro) => g.ent as number));
  const hudAnclado = rHud !== null && rHud <= 10;
  const entAnclado = rEnt !== null && rEnt <= 15;

  // ── BLOQUE C ──
  const dHud = ant && act && act.hud !== null && ant.hud !== null ? act.hud - ant.hud : null;
  const dEnt = ant && act && act.ent !== null && ant.ent !== null ? act.ent - ant.ent : null;
  const alertaEnt = dEnt !== null && Math.abs(dEnt) > thrEnt;
  const alertaHud = dHud !== null && dHud > thrHud && (act?.hud ?? 0) > thrHudNivel;

  // ── VALIDACIÓN EN VIVO ──
  // ¿los giros con alerta fallan más que los que no?
  const conAlertaDoc = hist.filter((g: Giro) => g.alertaEnt && g.doc !== null);
  const sinAlertaDoc = hist.filter((g: Giro) => !g.alertaEnt && g.doc !== null);
  const errCon = conAlertaDoc.length
    ? (conAlertaDoc.filter((g: Giro) => !g.doc).length / conAlertaDoc.length) * 100
    : null;
  const errSin = sinAlertaDoc.length
    ? (sinAlertaDoc.filter((g: Giro) => !g.doc).length / sinAlertaDoc.length) * 100
    : null;

  return (
    <div className="pd">
      {/* ══ A ══ (columnas y docenas por separado) */}
      <div className="pd-block">
        <div className="pd-btitle">
          ESTADO DEL MOTOR · COL {estCol.nEval}/{VENTANA} · DOC {estDoc.nEval}/{VENTANA}
        </div>
        {([['COL', estCol], ['DOC', estDoc]] as [string, EstadoMercado][]).map(
          ([mk, e], idx) => (
            <div key={mk} style={idx > 0 ? { marginTop: 10 } : undefined}>
              <div className="pd-row">
                <span className={`pd-chip pd-${e.wrCls}`}>
                  <span className="pd-k">W/R {mk}</span>
                  <span className="pd-v">{e.wr === null ? '—' : `${e.wr.toFixed(0)}%`}</span>
                </span>
                <span className={`pd-chip pd-${e.mesaCls}`}>
                  <span className="pd-k">MESA {mk}</span>
                  <span className="pd-v">{e.mesa}</span>
                </span>
              </div>
              <div className="pd-seq">
                {e.seq.length === 0 && <span className="pd-seq-x">·</span>}
                {e.seq.map((s: string, i: number) => (
                  <span
                    key={i}
                    className={`pd-seq-x pd-seq-${s === 'A' ? 'a' : s === 'E' ? 'e' : 'n'}`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      {/* ══ B ══ */}
      <div className="pd-block">
        <div className="pd-btitle">ANCLAJE · ÚLTIMOS {VENTANA_ANCLAJE}</div>
        <div className="pd-anc">
          <span className="pd-anc-k">HUD</span>
          <span className="pd-anc-v">{act?.hud ?? '—'}</span>
          <span className={`pd-anc-s ${hudAnclado ? 'ok' : 'bad'}`}>
            {rHud === null ? '—' : hudAnclado ? '⚓ ANCLADO' : '[!] ERRÁTICO'}
          </span>
          <span className="pd-anc-r">±{rHud ?? '—'}</span>
        </div>
        <div className="pd-anc">
          <span className="pd-anc-k">ENT</span>
          <span className="pd-anc-v">{act?.ent ?? '—'}</span>
          <span className={`pd-anc-s ${entAnclado ? 'ok' : 'bad'}`}>
            {rEnt === null ? '—' : entAnclado ? '⚓ ANCLADO' : '[!] ERRÁTICO'}
          </span>
          <span className="pd-anc-r">±{rEnt ?? '—'}</span>
        </div>
      </div>

      {/* ══ C ══ */}
      <div className={`pd-block pd-alert${alertaEnt || alertaHud ? ' on' : ''}`}>
        <div className="pd-btitle">ALERTA DE CHOQUE · Δ vs GIRO ANTERIOR</div>
        <div className="pd-row">
          <span className={`pd-chip ${alertaHud ? 'pd-bad pd-blink' : 'pd-dim'}`}>
            <span className="pd-k">Δ HUD</span>
            <span className="pd-v">{dHud === null ? '—' : `${dHud > 0 ? '+' : ''}${dHud}`}</span>
          </span>
          <span className={`pd-chip ${alertaEnt ? 'pd-bad pd-blink' : 'pd-dim'}`}>
            <span className="pd-k">Δ ENT</span>
            <span className="pd-v">{dEnt === null ? '—' : `${dEnt > 0 ? '+' : ''}${dEnt}`}</span>
          </span>
        </div>
        <div className={`pd-accion ${alertaEnt || alertaHud ? 'bad' : 'ok'}`}>
          {alertaEnt && alertaHud
            ? '🛑 PAUSA DOCENAS Y COLUMNAS'
            : alertaEnt
            ? '🛑 PAUSA DOCENAS'
            : alertaHud
            ? '🛑 PAUSA COLUMNAS'
            : '▸ SIN PICOS — ENTRADA LIBRE'}
        </div>
      </div>

      {/* ══ VALIDACIÓN ══ */}
      <div className="pd-val">
        <span className="pd-val-t">VALIDACIÓN EN VIVO · gatillo ΔEnt</span>
        <div className="pd-val-row">
          <span>
            con alerta: <b>{errCon === null ? '—' : `${errCon.toFixed(0)}%`}</b> err
            <i> (n={conAlertaDoc.length})</i>
          </span>
          <span>
            sin alerta: <b>{errSin === null ? '—' : `${errSin.toFixed(0)}%`}</b> err
            <i> (n={sinAlertaDoc.length})</i>
          </span>
        </div>
        <div className="pd-val-note">
          El gatillo sirve si "con alerta" queda claramente por encima de "sin alerta".
          Se reinicia al recargar la página.
        </div>
      </div>
    </div>
  );
}
