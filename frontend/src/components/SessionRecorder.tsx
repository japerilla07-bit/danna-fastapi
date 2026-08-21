// SessionRecorder — genera automáticamente el informe que Gunner hacía a mano.
//
// QUÉ HACE
// Captura un snapshot completo en CADA spin y lo persiste en localStorage, de
// modo que sobrevive a recargas de página. Exporta CSV listo para Excel.
//
// CRITERIO CLAVE
// Registra TODA sugerencia como si fuera apuesta, da igual que el paño dijera
// BET, PROBE o WAIT. Si solo se anotan las ejecutadas, lo que se mide es la
// selección del operador, no el motor. El estado (bet/probe/wait) se guarda
// como una columna aparte para poder filtrar después — pero el resultado se
// registra siempre.
//
// NO TOCA EL BACKEND. Solo lee lo que ya llega por /api/state.
//
// LÍMITE HONESTO
// Los valores son los del momento del poll. Si el poll se pierde un giro, esa
// fila no existe. El contador `spin_index` viene de sequence.count, así que un
// salto en esa columna delata un hueco.

import { useEffect, useRef, useState } from 'react';

const CLAVE = 'danna_session_log_v1';

export interface Fila {
  spin_index: number;
  ts: string;
  spin: number | null;

  hud: number | null;
  hud_state: string;
  entropy: number | null;
  radar: number | null;
  wheel: number | null;

  pano_pct: number | null;
  rueda_pct: number | null;
  chaos_estado: string;

  p_cat: string;
  p: number | null;
  p1: number | null;
  p2: number | null;

  doc_pick: string;
  doc_state: string;
  doc_result: string;

  col_pick: string;
  col_state: string;
  col_result: string;

  cond: number | null;
  cond_state: string;

  // derivados — se calculan al registrar, contra la fila anterior
  d_hud: number | null;
  d_ent: number | null;
  gatillo_ent: number;
  gatillo_hud: number;
}

export interface Snapshot {
  spinsCount: number;
  spin: number | null;
  hud: number | null;
  hudState: string;
  entropy: number | null;
  radar: number | null;
  wheel: number | null;
  panoPct: number | null;
  ruedaPct: number | null;
  chaosEstado: string;
  pCat: string;
  p: number | null;
  p1: number | null;
  p2: number | null;
  docPick: string;
  docState: string;
  docHit: boolean | null;
  colPick: string;
  colState: string;
  colHit: boolean | null;
  cond: number | null;
  condState: string;
}

interface Props {
  snap: Snapshot;
  thrEnt?: number;
  thrHud?: number;
  thrHudNivel?: number;
}

function leer(): Fila[] {
  try {
    const raw = window.localStorage.getItem(CLAVE);
    return raw ? (JSON.parse(raw) as Fila[]) : [];
  } catch {
    return [];
  }
}
function guardar(f: Fila[]) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(f));
  } catch {
    /* cuota llena — se sigue en memoria */
  }
}

const COLS: Array<[keyof Fila, string]> = [
  ['spin_index', 'spin_index'],
  ['ts', 'timestamp'],
  ['spin', 'spin'],
  ['hud', 'valor del hud'],
  ['hud_state', 'estado hud'],
  ['entropy', 'table entrophy'],
  ['radar', 'radar'],
  ['wheel', 'wheel'],
  ['pano_pct', 'pano_pct'],
  ['rueda_pct', 'rueda_pct'],
  ['chaos_estado', 'dispersion'],
  ['p_cat', 'p_cat'],
  ['p', 'valor p'],
  ['p1', 'p_1'],
  ['p2', 'p_2'],
  ['doc_pick', 'doc_pick'],
  ['doc_state', 'estado doc'],
  ['doc_result', 'doc_result'],
  ['col_pick', 'col_pick'],
  ['col_state', 'estado col'],
  ['col_result', 'col_result'],
  ['cond', 'cond'],
  ['cond_state', 'cond_state'],
  ['d_hud', 'delta_hud'],
  ['d_ent', 'delta_ent'],
  ['gatillo_ent', 'gatillo_ent'],
  ['gatillo_hud', 'gatillo_hud'],
];

function aCSV(filas: Fila[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = COLS.map(([, t]) => t).join(';');
  const body = filas.map((f) => COLS.map(([k]) => esc(f[k])).join(';'));
  return [head, ...body].join('\n');
}

export function SessionRecorder({ snap, thrEnt = 8, thrHud = 5, thrHudNivel = 60 }: Props) {
  const [filas, setFilas] = useState<Fila[]>(() => leer());
  const ultimo = useRef<number>(-1);

  useEffect(() => {
    if (snap.spinsCount === ultimo.current) return;
    if (ultimo.current === -1) {
      ultimo.current = snap.spinsCount;
      return; // el primer poll solo fija el punto de partida
    }
    ultimo.current = snap.spinsCount;

    setFilas((prev: Fila[]) => {
      const ant = prev[prev.length - 1];
      const dh =
        ant && ant.hud !== null && snap.hud !== null ? snap.hud - ant.hud : null;
      const de =
        ant && ant.entropy !== null && snap.entropy !== null
          ? snap.entropy - ant.entropy
          : null;

      const fila: Fila = {
        spin_index: snap.spinsCount,
        ts: new Date().toISOString(),
        spin: snap.spin,
        hud: snap.hud,
        hud_state: snap.hudState,
        entropy: snap.entropy,
        radar: snap.radar,
        wheel: snap.wheel,
        pano_pct: snap.panoPct,
        rueda_pct: snap.ruedaPct,
        chaos_estado: snap.chaosEstado,
        p_cat: snap.pCat,
        p: snap.p,
        p1: snap.p1,
        p2: snap.p2,
        doc_pick: snap.docPick,
        doc_state: snap.docState,
        // el resultado SIEMPRE, aunque el estado fuera wait o probe
        doc_result: snap.docHit === null ? '' : snap.docHit ? 'acierto' : 'error',
        col_pick: snap.colPick,
        col_state: snap.colState,
        col_result: snap.colHit === null ? '' : snap.colHit ? 'acierto' : 'error',
        cond: snap.cond,
        cond_state: snap.condState,
        d_hud: dh,
        d_ent: de,
        gatillo_ent: de !== null && Math.abs(de) > thrEnt ? 1 : 0,
        gatillo_hud:
          dh !== null && dh > thrHud && (snap.hud ?? 0) > thrHudNivel ? 1 : 0,
      };
      const next = [...prev, fila];
      guardar(next);
      return next;
    });
  }, [snap, thrEnt, thrHud, thrHudNivel]);

  function descargar() {
    const csv = '\uFEFF' + aCSV(filas); // BOM para que Excel lea los acentos
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danna_sesion_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function limpiar() {
    if (!window.confirm(`¿Borrar el registro de ${filas.length} giros? No se puede deshacer.`)) return;
    setFilas([]);
    guardar([]);
    ultimo.current = -1;
  }

  // ── resumen rápido en pantalla ──
  const evDoc = filas.filter((f: Fila) => f.doc_result !== '');
  const evCol = filas.filter((f: Fila) => f.col_result !== '');
  const acDoc = evDoc.filter((f: Fila) => f.doc_result === 'acierto').length;
  const acCol = evCol.filter((f: Fila) => f.col_result === 'acierto').length;
  const conG = evDoc.filter((f: Fila) => f.gatillo_ent === 1);
  const sinG = evDoc.filter((f: Fila) => f.gatillo_ent === 0);
  const errC = conG.length
    ? (conG.filter((f: Fila) => f.doc_result === 'error').length / conG.length) * 100
    : null;
  const errS = sinG.length
    ? (sinG.filter((f: Fila) => f.doc_result === 'error').length / sinG.length) * 100
    : null;

  return (
    <div className="sr">
      <div className="sr-head">
        <span className="sr-title">REGISTRO DE SESIÓN</span>
        <span className="sr-n">{filas.length} giros</span>
      </div>

      <div className="sr-grid">
        <div className="sr-cell">
          <span className="sr-k">DOCENAS</span>
          <span className="sr-v">
            {evDoc.length ? `${((acDoc / evDoc.length) * 100).toFixed(1)}%` : '—'}
          </span>
          <span className="sr-s">{acDoc}/{evDoc.length}</span>
        </div>
        <div className="sr-cell">
          <span className="sr-k">COLUMNAS</span>
          <span className="sr-v">
            {evCol.length ? `${((acCol / evCol.length) * 100).toFixed(1)}%` : '—'}
          </span>
          <span className="sr-s">{acCol}/{evCol.length}</span>
        </div>
      </div>

      <div className="sr-gat">
        <span className="sr-gat-t">GATILLO ΔEnt · error en docenas</span>
        <div className="sr-gat-row">
          <span>
            con alerta <b>{errC === null ? '—' : `${errC.toFixed(0)}%`}</b>
            <i> n={conG.length}</i>
          </span>
          <span>
            sin alerta <b>{errS === null ? '—' : `${errS.toFixed(0)}%`}</b>
            <i> n={sinG.length}</i>
          </span>
        </div>
      </div>

      <div className="sr-btns">
        <button className="sr-btn sr-dl" onClick={descargar} disabled={!filas.length}>
          ⬇ DESCARGAR CSV
        </button>
        <button className="sr-btn sr-rm" onClick={limpiar} disabled={!filas.length}>
          ✕ LIMPIAR
        </button>
      </div>

      <div className="sr-note">
        Registra TODA sugerencia como apuesta, sea BET, PROBE o WAIT. El estado se
        guarda aparte para filtrar después. Persiste al recargar la página.
      </div>
    </div>
  );
}
