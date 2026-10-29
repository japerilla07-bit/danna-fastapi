// ════════════════════════════════════════════════════════════════════════
// MODO CICLO — pantalla de operación por entradas cortas (/app/ciclo).
//
// Toda la lógica vive en domain/cicloCorto.ts (pura). Esta página solo:
//   · manda cada número al motor por el MISMO camino que la app de siempre
//     (useSpinMutation → POST /api/spin) y lee lo que el motor devuelve
//     (sus picks de docenas y columnas, HUD y entropía) — sin modificar nada;
//   · guarda el día en este navegador y descarga el registro en CSV.
// No usa Quantum, Capa 1, Escudo ni la voz D.A.N.N.A.
// ════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useGameState, useSpinMutation } from '@/hooks/useGameState';
import {
  CORTE_ERRORES,
  VOCES,
  VENTANA,
  actualizarMotor,
  cambiarConfig,
  ciclosUltimaHora,
  csvCiclos,
  detalleJugada,
  entrar,
  estadoInicial,
  leerVentana,
  nombreVoz,
  nombreZona,
  pickMotor,
  puedeEntrar,
  registrarGiro,
  reventonesHoy,
  textoJugada,
  tick,
} from '@/domain/cicloCorto';
import type { Estado, LecturaMercado, MotorSnap, Voz } from '@/domain/cicloCorto';

const CLAVE = 'danna_ciclo_v1';
const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const hoy = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function cargar(): Estado {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) {
      const e = JSON.parse(raw) as Estado;
      if (e && e.version === 1) {
        if (e.dia === hoy()) return e;
        return estadoInicial(hoy(), e.config); // día nuevo: se conserva la configuración
      }
    }
  } catch {
    /* sin almacenamiento: se arranca de cero */
  }
  return estadoInicial(hoy());
}

function guardar(e: Estado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    /* sin almacenamiento */
  }
}

// Lee del estado del motor lo que necesita el Modo Ciclo. HUD y entropía:
// misma fórmula que AppPage.tsx (condCalc / entropyCalc), solo para el registro.
function motorDe(data: any): MotorSnap {
  const dec: any = data?.payload?.decision ?? {};
  const doc = pickMotor(dec?.bet_advice?.docenas?.pick, 'doc');
  const col = pickMotor(dec?.bet_advice?.columnas?.pick, 'col');
  let hud: number | null = null;
  let ent: number | null = null;
  try {
    const score10 = Number(dec?.mesa_score?.score10 ?? 5);
    const ci: any = data?.chaos_index ?? {};
    const pano = Number(ci?.pano?.pct);
    const rueda = Number(ci?.rueda?.pct);
    const consec = Math.max(0, Math.floor(Number(dec?.pilot_consec_errors ?? data?.consec_losses ?? 0)));
    const scores = Object.values(data?.wheel_info?.sector_scores ?? {}) as number[];
    const wheelTop = scores.length > 0 ? Math.max(...scores) : 0.25;
    const entropyScore = Number.isFinite(pano) ? Math.max(0, Math.min(1, pano / 100)) : 0.5;
    const c = (score10 / 10) * 0.4 + entropyScore * 0.25 + (1 - Math.max(0, Math.min(1, consec / 7))) * 0.25
      + Math.max(0, Math.min(1, (wheelTop - 0.25) / 0.35)) * 0.1;
    hud = Math.round(Math.max(0, Math.min(1, c)) * 100);
    if (Number.isFinite(pano) || Number.isFinite(rueda)) {
      const mx = Math.max(Number.isFinite(pano) ? pano : 0, Number.isFinite(rueda) ? rueda : 0);
      ent = Math.round(Math.max(0, Math.min(100, 100 - mx)));
    }
  } catch {
    /* el registro queda sin HUD/entropía */
  }
  return { doc, col, hud, ent };
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function CicloPage() {
  const qc = useQueryClient();
  const stateQuery = useGameState();
  const spinMut = useSpinMutation();
  const [estado, setEstado] = useState<Estado>(cargar);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [voz, setVoz] = useState<Voz>('PROPUESTA');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verConfig, setVerConfig] = useState(false);
  const [confirmarDia, setConfirmarDia] = useState(false);
  const motorRef = useRef<MotorSnap>({ doc: null, col: null, hud: null, ent: null });

  // Guardar cada cambio.
  useEffect(() => guardar(estado), [estado]);

  // Reloj: cronómetro de pausa y cambio de día.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setAhora(t);
      setEstado((e) => (e.dia !== hoy() ? estadoInicial(hoy(), e.config) : tick(e, t)));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Picks del motor cuando llega el estado (al abrir la página o tras un giro).
  useEffect(() => {
    if (!stateQuery.data) return;
    const m = motorDe(stateQuery.data);
    motorRef.current = m;
    setEstado((e) => actualizarMotor(e, m));
  }, [stateQuery.data]);

  const marcar = useCallback(
    (n: number) => {
      if (ocupado) return;
      if (estado.fase === 'PAUSA' || estado.fase === 'CERRADO') return;
      setOcupado(true);
      setError(null);
      const terminar = (m: MotorSnap, aviso?: string) => {
        motorRef.current = m;
        setEstado((e) => {
          const r = registrarGiro(e, n, m, Date.now());
          return aviso ? { ...r, aviso: `${r.aviso ?? ''} ${aviso}`.trim() } : r;
        });
        setOcupado(false);
      };
      spinMut.mutate(
        { spin: n },
        {
          onSuccess: async () => {
            try {
              const data = await qc.fetchQuery({ queryKey: ['state'], queryFn: () => api.getState(), staleTime: 0 });
              terminar(motorDe(data));
            } catch {
              terminar({ ...motorRef.current, doc: null, col: null }, '(El motor no devolvió sus picks).');
            }
          },
          onError: (err: unknown) => {
            setError(`El motor no recibió el ${n}: ${(err as Error)?.message ?? 'error'}. Quedó registrado solo en el ciclo.`);
            terminar({ ...motorRef.current, doc: null, col: null });
          },
        },
      );
    },
    [ocupado, estado.fase, spinMut, qc],
  );

  const lectura = leerVentana(estado.ventana);
  const rev = reventonesHoy(estado);
  const bloqueado = ocupado || estado.fase === 'PAUSA' || estado.fase === 'CERRADO';
  const restante = estado.pausaHasta !== null ? estado.pausaHasta - ahora : 0;
  const c = estado.ciclo;

  function descargar() {
    const blob = new Blob([csvCiclos(estado)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danna_ciclos_${estado.dia}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="cy-root">
      <style>{CSS}</style>
      <div className="cy-wrap">
        {/* ── Encabezado ── */}
        <header className="cy-head">
          <div>
            <div className="cy-brand">D.A.N.N.A.<span>MODO CICLO</span></div>
            <div className="cy-sub">{estado.dia}{estado.config.mesa ? ` · ${estado.config.mesa}` : ''}{estado.config.crupier ? ` · crupier ${estado.config.crupier}` : ''}</div>
          </div>
          <div className="cy-head-btns">
            <button className="cy-btn" onClick={() => setVerConfig((v) => !v)}>{verConfig ? 'Cerrar' : 'Ajustes'}</button>
            <Link to="/app" className="cy-btn">Volver</Link>
          </div>
        </header>

        {/* ── Contadores del día ── */}
        <div className="cy-stats">
          <Stat k="Ciclos hoy" v={String(estado.ciclos.length)} />
          <Stat k="Última hora" v={String(ciclosUltimaHora(estado, ahora))} />
          <Stat k="Reventones" v={`${rev}/${estado.config.topeReventones}`} tono={rev > 0 ? 'warn' : undefined} />
          <Stat k="Giros" v={String(estado.giros)} />
        </div>

        {verConfig && (
          <section className="cy-card cy-config">
            <label>Mesa
              <input className="cy-in" value={estado.config.mesa} placeholder="ej. rápida"
                onChange={(ev) => setEstado((e) => cambiarConfig(e, { mesa: ev.target.value }))} />
            </label>
            <label>Crupier
              <input className="cy-in" value={estado.config.crupier} placeholder="nombre o número"
                onChange={(ev) => setEstado((e) => cambiarConfig(e, { crupier: ev.target.value }))} />
            </label>
            <label>Tope de reventones del día
              <input className="cy-in" type="number" min={1} max={20} value={estado.config.topeReventones}
                onChange={(ev) => setEstado((e) => cambiarConfig(e, { topeReventones: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) }))} />
            </label>
            <div className="cy-lbl">Cómo llegas hoy (1 mal · 5 muy bien)
              <div className="cy-llegada">
                {[1, 2, 3, 4, 5].map((k) => (
                  <button key={k} className="cy-btn" data-on={estado.config.llegada === k ? '1' : '0'}
                    onClick={() => setEstado((e) => cambiarConfig(e, { llegada: k }))}>{k}</button>
                ))}
              </div>
            </div>
            <div className="cy-config-acc">
              <button className="cy-btn" onClick={descargar} disabled={estado.ciclos.length === 0}>Descargar registro (CSV)</button>
              {!confirmarDia ? (
                <button className="cy-btn cy-peligro" onClick={() => setConfirmarDia(true)}>Reiniciar el día</button>
              ) : (
                <button className="cy-btn cy-peligro" onClick={() => { setEstado(estadoInicial(hoy(), estado.config)); setConfirmarDia(false); }}>
                  Confirmar: borrar ciclos de hoy
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Panel principal según la fase ── */}
        {estado.fase === 'PAUSA' && (
          <section className="cy-card cy-main" data-tono="pausa">
            <div className="cy-tag">PAUSA</div>
            <div className="cy-big">{mmss(restante)}</div>
            <p className="cy-msg">{estado.aviso}</p>
            <p className="cy-hint">Al volver, ingresa los últimos {VENTANA} giros que muestra la mesa.</p>
          </section>
        )}

        {estado.fase === 'CERRADO' && (
          <section className="cy-card cy-main" data-tono="err">
            <div className="cy-tag">JORNADA CERRADA</div>
            <p className="cy-msg">{estado.aviso}</p>
            <p className="cy-hint">Mañana arranca un día nuevo solo. Descarga el registro en Ajustes.</p>
          </section>
        )}

        {estado.fase === 'CICLO' && c && (
          <section className="cy-card cy-main" data-tono={c.racha >= 3 ? 'err' : c.racha >= 2 ? 'warn' : 'ok'}>
            <div className="cy-row-sb">
              <div className="cy-tag">CICLO #{c.id} · {nombreVoz(c.voz)}</div>
              <div className="cy-tag-dim">cierra en 2 aciertos o {CORTE_ERRORES} errores seguidos</div>
            </div>
            <div className="cy-jugada">{textoJugada(c.jugada)}</div>
            <div className="cy-detalle">{detalleJugada(c.jugada)}</div>
            <div className="cy-meters">
              <div>
                <div className="cy-mlbl">Aciertos</div>
                <div className="cy-dots">{[0, 1].map((k) => <span key={k} data-on={c.aciertos > k ? 'ok' : ''} />)}</div>
              </div>
              <div>
                <div className="cy-mlbl">Errores seguidos</div>
                <div className="cy-dots">{Array.from({ length: CORTE_ERRORES }, (_, k) => <span key={k} data-on={c.racha > k ? 'err' : ''} />)}</div>
              </div>
            </div>
            {c.numeros.length > 0 && (
              <div className="cy-tira">
                {c.numeros.map((n, k) => (
                  <span key={k} className="cy-chip" data-res={c.resultados[k]}>{n}</span>
                ))}
              </div>
            )}
            <p className="cy-msg">{estado.aviso}</p>
          </section>
        )}

        {estado.fase === 'VENTANA' && (
          <section className="cy-card cy-main" data-tono={lectura.aprobado ? 'ok' : 'idle'}>
            <div className="cy-row-sb">
              <div className="cy-tag">{lectura.completa ? (lectura.aprobado ? 'APROBADO' : 'NO APROBADO') : `VENTANA ${estado.ventana.length}/${VENTANA}`}</div>
              {lectura.completa && lectura.ceros > 0 && <div className="cy-tag-dim">{lectura.ceros} cero{lectura.ceros > 1 ? 's' : ''}</div>}
            </div>
            <div className="cy-tira">
              {Array.from({ length: VENTANA }, (_, k) => {
                const n = estado.ventana[k];
                return n === undefined
                  ? <span key={k} className="cy-chip cy-vacio">·</span>
                  : <span key={k} className="cy-chip" data-color={n === 0 ? 'v' : ROJOS.has(n) ? 'r' : 'n'}>{n}</span>;
              })}
            </div>
            {lectura.completa && lectura.doc && lectura.col && (
              <div className="cy-mercados">
                <LineaMercado l={lectura.doc} elegido={lectura.jugada?.mercado === 'doc'} />
                <LineaMercado l={lectura.col} elegido={lectura.jugada?.mercado === 'col'} />
              </div>
            )}
            {lectura.aprobado && <div className="cy-jugada">{textoJugada(lectura.jugada)}</div>}
            <p className="cy-msg">{estado.aviso}</p>
          </section>
        )}

        {/* ── Voces: misma jerarquía para las tres ── */}
        <section className="cy-card">
          <div className="cy-h">Qué propone cada voz para el próximo giro</div>
          {VOCES.map((v) => {
            const p = estado.pendientes[v];
            const m = estado.marcadores[v];
            const jugando = c?.voz === v;
            const sel = estado.fase === 'VENTANA' && voz === v;
            return (
              <button key={v} className="cy-voz" data-sel={sel ? '1' : '0'} data-jug={jugando ? '1' : '0'}
                disabled={estado.fase !== 'VENTANA'} onClick={() => setVoz(v)}>
                <div className="cy-voz-n">{nombreVoz(v)}{jugando ? ' · jugando' : ''}</div>
                <div className="cy-voz-p">{textoJugada(p)}</div>
                <div className="cy-voz-m">
                  <span className="ok">✓{m.aciertos}</span> <span className="err">✗{m.errores}</span>
                  <span> · racha {m.racha} · peor {m.peor}</span>
                </div>
              </button>
            );
          })}
          {estado.fase === 'VENTANA' && (
            <button className="cy-entrar" disabled={!puedeEntrar(estado, voz) || ocupado}
              onClick={() => setEstado((e) => entrar(e, voz, motorRef.current, Date.now()))}>
              {lectura.aprobado
                ? estado.pendientes[voz] ? `ENTRO con ${nombreVoz(voz)}: ${textoJugada(estado.pendientes[voz])}` : `${nombreVoz(voz)} no tiene pick ahora`
                : 'Sin aprobación: no se entra'}
            </button>
          )}
        </section>

        {error && <div className="cy-error">{error}</div>}

        {/* ── Teclado ── */}
        <section className="cy-card">
          <div className="cy-h">{ocupado ? 'Enviando al motor…' : bloqueado ? 'Teclado bloqueado' : 'Número que salió'}</div>
          <div className="cy-pad">
            <button className="cy-num cy-cero" data-color="v" disabled={bloqueado} onClick={() => marcar(0)}>0</button>
            {Array.from({ length: 36 }, (_, k) => k + 1).map((n) => (
              <button key={n} className="cy-num" data-color={ROJOS.has(n) ? 'r' : 'n'} disabled={bloqueado} onClick={() => marcar(n)}>{n}</button>
            ))}
          </div>
        </section>

        {/* ── Ciclos de hoy ── */}
        {estado.ciclos.length > 0 && (
          <section className="cy-card">
            <div className="cy-h">Ciclos de hoy</div>
            <div className="cy-hist">
              {[...estado.ciclos].reverse().slice(0, 8).map((x) => (
                <div key={x.id} className="cy-hist-row" data-cierre={x.cierre ?? ''}>
                  <span className="cy-hist-id">#{x.id}</span>
                  <span className="cy-hist-j">{x.jugadas[0] ?? '—'}{x.cambios > 0 ? ` (+${x.cambios})` : ''}</span>
                  <span className="cy-hist-r">{x.resultados.join('')}</span>
                  <span className="cy-hist-c">{x.cierre === 'GANADO' ? 'GANADO' : 'CORTE'}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v, tono }: { k: string; v: string; tono?: 'warn' }) {
  return (
    <div className="cy-stat" data-tono={tono ?? ''}>
      <div className="cy-stat-v">{v}</div>
      <div className="cy-stat-k">{k}</div>
    </div>
  );
}

function LineaMercado({ l, elegido }: { l: LecturaMercado; elegido: boolean }) {
  const nombre = l.mercado === 'doc' ? 'Docenas' : 'Columnas';
  return (
    <div className="cy-mkt" data-ok={l.ok ? '1' : '0'} data-sel={elegido ? '1' : '0'}>
      <span className="cy-mkt-n">{nombre}</span>
      <span className="cy-mkt-c">{l.conteo.map((x, z) => `${nombreZona(l.mercado, z as 0 | 1 | 2)}:${x}`).join(' ')}</span>
      <span className="cy-mkt-r">{l.ok ? `ok · ${l.zonas.map((z) => nombreZona(l.mercado, z)).join('+')}` : l.motivo}</span>
    </div>
  );
}

const CSS = `
.cy-root{--bg0:#04060e;--bg1:#0a1020;--bg2:#101a30;--line:#1c2a48;--ink:#e6edf7;--ink2:#a9b6cc;--ink3:#7184a3;
  --cian:#22e3ff;--ok:#2ee59d;--warn:#ffb020;--err:#ff4d6d;--vio:#a78bfa;
  min-height:100vh;background:radial-gradient(900px 420px at 10% -10%,rgba(34,227,255,.10),transparent 60%),
  radial-gradient(700px 420px at 100% 0%,rgba(167,139,250,.08),transparent 60%),var(--bg0);color:var(--ink);
  font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif}
.cy-wrap{max-width:560px;margin:0 auto;padding:14px 16px 40px;display:flex;flex-direction:column;gap:12px}
.cy-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.cy-brand{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:24px;letter-spacing:.06em;color:var(--cian);text-shadow:0 0 14px rgba(34,227,255,.45)}
.cy-brand span{display:block;color:var(--ink2);font-size:13px;letter-spacing:.18em;text-shadow:none;margin-top:1px}
.cy-sub{font-size:12px;color:var(--ink3)}
.cy-head-btns{display:flex;gap:8px}
.cy-btn{background:var(--bg2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none;min-height:36px;display:inline-flex;align-items:center}
.cy-btn[data-on="1"]{border-color:var(--cian);color:var(--cian);box-shadow:0 0 10px rgba(34,227,255,.35)}
.cy-btn:disabled{opacity:.45}
.cy-btn.cy-peligro{border-color:rgba(255,77,109,.6);color:var(--err)}
.cy-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.cy-stat{background:var(--bg1);border:1px solid var(--line);border-radius:10px;padding:8px 6px;text-align:center}
.cy-stat-v{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:24px;line-height:1}
.cy-stat-k{font-size:11px;color:var(--ink3);margin-top:3px}
.cy-stat[data-tono="warn"] .cy-stat-v{color:var(--warn)}
.cy-card{background:linear-gradient(180deg,rgba(16,26,48,.92),rgba(10,16,32,.92));border:1px solid var(--line);border-radius:14px;padding:14px}
.cy-h{font-size:12.5px;color:var(--ink3);margin-bottom:10px;font-weight:600;letter-spacing:.02em}
.cy-main{border-width:1.5px}
.cy-main[data-tono="ok"]{border-color:rgba(46,229,157,.6);box-shadow:0 0 22px rgba(46,229,157,.18)}
.cy-main[data-tono="warn"]{border-color:rgba(255,176,32,.7);box-shadow:0 0 22px rgba(255,176,32,.2)}
.cy-main[data-tono="err"]{border-color:rgba(255,77,109,.75);box-shadow:0 0 24px rgba(255,77,109,.25)}
.cy-main[data-tono="pausa"]{border-color:rgba(167,139,250,.7);box-shadow:0 0 22px rgba(167,139,250,.22);text-align:center}
.cy-row-sb{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.cy-tag{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:18px;letter-spacing:.08em}
.cy-main[data-tono="ok"] .cy-tag{color:var(--ok)}
.cy-main[data-tono="err"] .cy-tag{color:var(--err)}
.cy-main[data-tono="warn"] .cy-tag{color:var(--warn)}
.cy-main[data-tono="pausa"] .cy-tag{color:var(--vio)}
.cy-tag-dim{font-size:11.5px;color:var(--ink3)}
.cy-big{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:64px;line-height:1.05;color:var(--vio);text-shadow:0 0 18px rgba(167,139,250,.5)}
.cy-jugada{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:40px;line-height:1.1;margin-top:6px;color:var(--cian);text-shadow:0 0 16px rgba(34,227,255,.4)}
.cy-detalle{font-size:13px;color:var(--ink2)}
.cy-msg{margin:10px 0 0;font-size:14px;color:var(--ink)}
.cy-hint{margin:6px 0 0;font-size:12.5px;color:var(--ink3)}
.cy-meters{display:flex;gap:22px;margin-top:12px;flex-wrap:wrap}
.cy-mlbl{font-size:11.5px;color:var(--ink3);margin-bottom:5px}
.cy-dots{display:flex;gap:6px}
.cy-dots span{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);background:var(--bg0)}
.cy-dots span[data-on="ok"]{background:var(--ok);border-color:var(--ok);box-shadow:0 0 10px rgba(46,229,157,.6)}
.cy-dots span[data-on="err"]{background:var(--err);border-color:var(--err);box-shadow:0 0 10px rgba(255,77,109,.6)}
.cy-tira{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.cy-chip{min-width:34px;height:30px;padding:0 6px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:18px;border:1px solid var(--line);background:var(--bg0)}
.cy-chip[data-color="r"]{color:#ff6b81}
.cy-chip[data-color="n"]{color:var(--ink)}
.cy-chip[data-color="v"]{color:var(--ok)}
.cy-chip[data-res="A"]{border-color:var(--ok);color:var(--ok)}
.cy-chip[data-res="E"]{border-color:var(--err);color:var(--err)}
.cy-chip.cy-vacio{color:var(--ink3)}
.cy-mercados{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.cy-mkt{display:grid;grid-template-columns:72px 1fr;gap:2px 8px;font-size:12.5px;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--bg0)}
.cy-mkt[data-ok="1"]{border-color:rgba(46,229,157,.45)}
.cy-mkt[data-sel="1"]{box-shadow:0 0 0 1px var(--ok) inset}
.cy-mkt-n{color:var(--ink2);font-weight:600}
.cy-mkt-c{color:var(--ink2);font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px}
.cy-mkt-r{grid-column:1 / -1;color:var(--ink3)}
.cy-mkt[data-ok="1"] .cy-mkt-r{color:var(--ok)}
.cy-voz{width:100%;text-align:left;display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;background:var(--bg0);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px 11px;margin-bottom:7px;font:inherit;cursor:pointer}
.cy-voz:disabled{cursor:default}
.cy-voz[data-sel="1"]{border-color:var(--cian);box-shadow:0 0 12px rgba(34,227,255,.3)}
.cy-voz[data-jug="1"]{border-color:var(--ok);box-shadow:0 0 12px rgba(46,229,157,.3)}
.cy-voz-n{font-size:13px;color:var(--ink2);font-weight:600}
.cy-voz-p{grid-row:span 2;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:24px;color:var(--cian)}
.cy-voz-m{font-size:12px;color:var(--ink3)}
.cy-voz-m .ok{color:var(--ok)} .cy-voz-m .err{color:var(--err)}
.cy-entrar{width:100%;margin-top:4px;min-height:48px;border-radius:10px;border:1px solid var(--ok);background:rgba(46,229,157,.12);color:var(--ok);font:inherit;font-size:15px;font-weight:600;cursor:pointer}
.cy-entrar:disabled{border-color:var(--line);background:var(--bg0);color:var(--ink3);cursor:default}
.cy-pad{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.cy-num{min-height:44px;border-radius:8px;border:1px solid var(--line);background:var(--bg0);color:var(--ink);font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:21px;cursor:pointer}
.cy-num[data-color="r"]{color:#ff6b81;border-color:rgba(255,77,109,.35)}
.cy-num[data-color="v"]{color:var(--ok);border-color:rgba(46,229,157,.45)}
.cy-num:active:not(:disabled){background:var(--bg2)}
.cy-num:disabled{opacity:.35;cursor:default}
.cy-cero{grid-column:1 / -1}
.cy-error{background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.5);color:var(--err);border-radius:10px;padding:10px 12px;font-size:13px}
.cy-config{display:flex;flex-direction:column;gap:10px}
.cy-config label,.cy-lbl{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--ink3)}
.cy-in{background:var(--bg0);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;min-height:38px}
.cy-llegada{display:flex;gap:6px}
.cy-config-acc{display:flex;gap:8px;flex-wrap:wrap}
.cy-hist{display:flex;flex-direction:column;gap:5px}
.cy-hist-row{display:grid;grid-template-columns:34px 1fr auto auto;gap:8px;align-items:center;font-size:13px;padding:6px 8px;border-radius:8px;background:var(--bg0);border:1px solid var(--line)}
.cy-hist-id{color:var(--ink3)}
.cy-hist-r{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--ink2);letter-spacing:.05em}
.cy-hist-c{font-size:11.5px;font-weight:600}
.cy-hist-row[data-cierre="GANADO"] .cy-hist-c{color:var(--ok)}
.cy-hist-row[data-cierre="CORTE"] .cy-hist-c{color:var(--err)}
.cy-btn:focus-visible,.cy-num:focus-visible,.cy-voz:focus-visible,.cy-entrar:focus-visible,.cy-in:focus-visible{outline:2px solid var(--cian);outline-offset:2px}
@media (max-width:380px){.cy-stat-v{font-size:20px}.cy-jugada{font-size:34px}.cy-big{font-size:54px}}
`;

export default CicloPage;
