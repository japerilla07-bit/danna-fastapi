// ════════════════════════════════════════════════════════════════════════
// CICLO PANEL — copiloto de ciclo (oct 2026). Reemplaza al Quantum Pilot en
// la pantalla principal (AppPage.tsx).
//
// · NO tiene teclado: toma cada giro que entra por Control de Misión, leyendo
//   data.sequence (mismo estado del motor que ya usa la pantalla).
// · Toda la lógica vive en domain/cicloCorto.ts (pura y validada contra el
//   corpus): ventana de 7, Regla B, 3 voces, cierre en el 2º acierto, corte en
//   el 4º error seguido, pausa de 4 minutos, tope de reventones del día.
//   Estado dinámico (versión D): en transición avisa «No apuestes» y el giro
//   queda marcado «·» (sin apuesta); 7 giros sin lectura clara cierran el ciclo.
// · Del motor SOLO lee (picks de docenas/columnas, HUD y entropía para el
//   registro). No modifica nada del motor ni del store de telemetría.
// · Flotante y arrastrable como el Quantum; se puede minimizar.
// ════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as RMouseEvent, TouchEvent as RTouchEvent } from 'react';
import {
  CORTE_ERRORES,
  MAX_QUIETOS,
  PAUSA_MS,
  VENTANA,
  actualizarMotor,
  cambiarConfig,
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
  terminarPausa,
  jugarIgual,
  mismaJugada,
  textoJugada,
  tick,
} from '@/domain/cicloCorto';
import type { Ciclo, Estado, Jugada, Lectura, LecturaMercado, MotorSnap, Voz } from '@/domain/cicloCorto';

const CLAVE = 'danna_ciclo_v1';
const CLAVE_UI = 'danna_ciclo_ui_v1';
const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const hoy = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function leerJSON<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function guardarJSON(clave: string, v: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
}

function cargarEstado(): Estado {
  const e = leerJSON<Estado>(CLAVE);
  if (e && e.version === 1) return e.dia === hoy() ? e : estadoInicial(hoy(), e.config);
  return estadoInicial(hoy());
}

interface PrefsUI {
  x: number;
  y: number;
  voz: boolean;
  avisarPausa: boolean;
  min: boolean;
}
function cargarUI(): PrefsUI {
  const p = leerJSON<Partial<PrefsUI>>(CLAVE_UI) ?? {};
  return {
    x: typeof p.x === 'number' ? p.x : 76,
    y: typeof p.y === 'number' ? p.y : 10,
    voz: p.voz !== false,
    avisarPausa: p.avisarPausa !== false,
    min: p.min === true,
  };
}

// Lo que el Modo Ciclo lee del motor. HUD y entropía: misma fórmula que
// AppPage.tsx (condCalc / entropyCalc), solo para el registro.
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

// ── Voz ──────────────────────────────────────────────────────────────────
function hablar(texto: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-CO';
    const v = s.getVoices().find((x) => x.lang.toLowerCase().startsWith('es'));
    if (v) u.voice = v;
    u.rate = 1.02;
    s.speak(u);
  } catch {
    /* sin voz en este navegador */
  }
}
function pitido() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* sin audio */
  }
}
const NUM_TXT = ['uno', 'dos', 'tres'];
function jugadaHablada(j: Jugada | null): string {
  if (!j) return '';
  return `${j.mercado === 'doc' ? 'docenas' : 'columnas'} ${NUM_TXT[j.zonas[0]]} y ${NUM_TXT[j.zonas[1]]}`;
}

// ── Textos del copiloto ──────────────────────────────────────────────────
const NOMBRE_MKT = { doc: 'Docenas', col: 'Columnas' } as const;
const REGLAS_TXT =
  'Las 5 reglas: 1) una zona sale al menos 2 veces más que la menos salida; 2) el conteo y lo más reciente señalan el mismo par; ' +
  '3) la zona de afuera no salió en los últimos 4 giros; 4) la de afuera salió como máximo 1 vez en los 7; 5) menos de 2 ceros en la ventana y ningún cero en los últimos 4. ' +
  'Dentro del ciclo: si la mesa deja de sostener tu par, es transición y no apuestas ese giro; un par nuevo se juega solo cuando la mesa lo aprueba 2 veces seguidas; 7 giros sin lectura clara cierran el ciclo.';

const MARCA_RES = { A: '✓', E: '✗', N: '·' } as const;
function tiraTexto(c: Ciclo): string {
  return c.numeros.map((n, i) => `${n} ${MARCA_RES[c.resultados[i] ?? 'E']}`).join(' · ');
}
function textoCierre(c: Ciclo): string {
  return c.cierre === 'GANADO' ? 'Ganado.' : c.cierre === 'INDETERMINADO' ? 'Cerrado: mesa indeterminada (no es reventón).' : `Cortado en el ${CORTE_ERRORES}º error.`;
}

function chatDe(e: Estado, l: Lectura, extra: string[]): string[] {
  const out: string[] = [];
  if (e.fase === 'VENTANA') {
    if (!l.completa) {
      if (e.ventana.length === 0) out.push('Ingresa los últimos 7 giros en Control de Misión y leo la mesa.');
      else out.push(`Llevo ${e.ventana.length} de los 7 giros: ${e.ventana.join(' · ')}.`);
      out.push('Cuando tenga los 7 te digo si la mesa marca algo. Si no marca, no te propongo nada.');
    } else {
      out.push(`Leí ${e.ventana.join(' · ')}.`);
      if (l.aprobado && l.jugada) {
        const lm = l.jugada.mercado === 'doc' ? l.doc! : l.col!;
        const pref = l.jugada.mercado === 'doc' ? 'D' : 'C';
        out.push(`${NOMBRE_MKT[l.jugada.mercado]} cumple las 5 reglas: ${pref}${lm.zonas[0] + 1} y ${pref}${lm.zonas[1] + 1} se llevan la ventana y ${pref}${lm.excluida + 1} no aparece en los últimos 4.`);
        out.push(`Te propongo ${textoJugada(l.jugada)}. El motor ve ${textoJugada(e.pendientes.MOTOR_DOC)} en docenas y ${textoJugada(e.pendientes.MOTOR_COL)} en columnas. Elige con qué entras, o toca «Paso esta». Mientras no toques nada, los giros no cuentan para ningún ciclo.`);
      } else if (l.motivo && l.motivo.startsWith('cero en')) {
        out.push('Salió un cero en los últimos 4 giros: la mesa está dispersa, no la doy por buena.');
        out.push('Mete el siguiente giro y vuelvo a mirar.');
      } else if (l.ceros >= 2) {
        out.push(`Hay ${l.ceros} ceros en la ventana: no la doy por buena.`);
        out.push('Mete el siguiente giro y vuelvo a mirar.');
      } else {
        out.push(`Docenas: ${l.doc?.motivo ?? 'cumple'}. Columnas: ${l.col?.motivo ?? 'cumple'}.`);
        out.push('Mi lectura: aquí no hay dominancia. Mete el siguiente giro y vuelvo a mirar.');
      }
      if (!l.aprobado) out.push('Si aun así quieres entrar, los botones del motor siguen abiertos: la decisión es tuya.');
    }
  } else if (e.fase === 'CICLO' && e.ciclo) {
    const c = e.ciclo;
    out.push(c.numeros.length === 0
      ? `Ciclo #${c.id} con ${nombreVoz(c.voz)}: ${textoJugada(c.jugada)}. Cierra en 2 aciertos o en ${CORTE_ERRORES} errores seguidos.`
      : `Ciclo #${c.id}: ${tiraTexto(c)}.`);
    if (e.aviso && c.numeros.length > 0) out.push(e.aviso);
    if (c.apuesta === false) out.push(`Llevo ${c.quietos ?? 0} de ${MAX_QUIETOS} giros sin lectura clara. Tus errores y aciertos quedan guardados; espera a que confirme.`);
    else if (c.resultados[c.resultados.length - 1] === 'A' && l.doc && l.col) {
      const lm = (x: LecturaMercado) => (x.ok ? `cumple ${textoJugada({ mercado: x.mercado, zonas: x.zonas })}` : x.motivo);
      out.push(`Mesa ahora · Docenas: ${lm(l.doc)} · Columnas: ${lm(l.col)}. Sigo con ${textoJugada(c.jugada)}; si prefieres otra, escógela abajo.`);
    }
    else if (c.racha === CORTE_ERRORES - 1) out.push('Van 3 errores seguidos. Si llega el cuarto, corto el ciclo y nos vamos a pausa.');
    else if (c.racha === 2) out.push('Van 2 errores seguidos. Calma: el corte está en el cuarto.');
  } else if (e.fase === 'PAUSA') {
    const c = e.ciclos[e.ciclos.length - 1];
    if (c) out.push(`Ciclo #${c.id} cerrado: ${tiraTexto(c)}. ${textoCierre(c)}`);
    out.push('Ahora 4 minutos fuera. Esa pausa es la que mantiene bajas las rachas por hora.');
    out.push(e.pausaRota
      ? 'Entraron giros durante la pausa: no cuentan para el ciclo y esta pausa queda como no cumplida.'
      : 'Cuando vuelvas, mete los últimos 7 giros en Control de Misión y leo de nuevo.');
  } else if (e.fase === 'CERRADO') {
    out.push(`Reventón ${reventonesHoy(e)} de ${e.config.topeReventones}. Hasta aquí llegamos hoy.`);
    out.push('No abro más ciclos. Te dejo el registro para revisarlo con calma.');
  }
  return [...out, ...extra].slice(-4);
}

// ── Componente ───────────────────────────────────────────────────────────
export function CicloPanel({ data }: { data: any }) {
  const [estado, setEstado] = useState<Estado>(cargarEstado);
  const [ui, setUi] = useState<PrefsUI>(cargarUI);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [verAjustes, setVerAjustes] = useState(false);
  const [confirmarDia, setConfirmarDia] = useState(false);
  const [explicar, setExplicar] = useState(false);
  const [pasadoEn, setPasadoEn] = useState<number | null>(null);
  const motorRef = useRef<MotorSnap>({ doc: null, col: null, hud: null, ent: null });
  const conteoRef = useRef<number | null>(null);
  const habladoRef = useRef<string>('');
  const shellRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => guardarJSON(CLAVE, estado), [estado]);
  useEffect(() => guardarJSON(CLAVE_UI, ui), [ui]);

  // Reloj: cronómetro de pausa y cambio de día.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setAhora(t);
      setEstado((e) => (e.dia !== hoy() ? estadoInicial(hoy(), e.config) : tick(e, t)));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Giros nuevos: llegan por Control de Misión → data.sequence crece.
  const count = Number(data?.sequence?.count ?? 0);
  useEffect(() => {
    const m = motorDe(data);
    motorRef.current = m;
    const spins: number[] = Array.isArray(data?.sequence?.spins) ? data.sequence.spins.map((x: unknown) => Number(x)) : [];
    const prev = conteoRef.current;
    conteoRef.current = count;
    if (prev === null || count <= prev) {
      // Primera carga o sesión del motor reiniciada: solo se actualizan los picks.
      setEstado((e) => actualizarMotor(e, m));
      return;
    }
    const nuevos = spins.slice(-(count - prev)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 36);
    setEstado((e) => {
      let r = e;
      // La entrada es SIEMPRE manual: el ciclo arranca solo cuando tocas una voz.
      for (const n of nuevos) r = registrarGiro(r, n, m, Date.now());
      return r;
    });
    setExplicar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, data]);

  const lectura = leerVentana(estado.ventana);
  const c = estado.ciclo;
  const rev = reventonesHoy(estado);
  const ultimo = estado.ciclos[estado.ciclos.length - 1] ?? null;

  // Voz: anuncia los momentos que importan, una sola vez cada uno.
  useEffect(() => {
    let clave = '';
    let texto = '';
    if (estado.fase === 'VENTANA' && lectura.aprobado && lectura.jugada) {
      clave = `ap-${estado.giros}`;
      texto = `Aprobado. Propuesta: ${jugadaHablada(lectura.jugada)}.`;
    } else if (estado.fase === 'VENTANA' && lectura.completa) {
      clave = `na-${estado.giros}`;
      texto = 'Sin señal. No entres.';
    } else if (estado.fase === 'CICLO' && c && c.numeros.length === 0) {
      clave = `in-${c.id}`;
      texto = `Dentro con ${jugadaHablada(c.jugada)}.`;
    } else if (estado.fase === 'CICLO' && c && c.numeros.length > 0) {
      clave = `ci-${c.id}-${c.numeros.length}`;
      const res = c.resultados[c.resultados.length - 1];
      texto = res === 'N' ? ''
        : res === 'A'
          ? (c.aciertos === 1 ? 'Acierto. Falta uno.' : 'Acierto.')
          : c.racha === CORTE_ERRORES - 1 ? 'Error. Tres seguidos. Uno más y corto.'
            : c.racha === 1 ? 'Error.' : `Error. ${c.racha} seguidos.`;
      const previa = c.jugadas[c.jugadas.length - 1];
      const cambio = c.jugadas.length > 0 && previa !== '—' && previa !== textoJugada(c.jugada);
      if (c.apuesta === false) texto += ' Transición. No apuestes este giro.';
      else if (cambio) texto += ` Confirmado. Ahora ${jugadaHablada(c.jugada)}.`;
      else if (res === 'N') texto = `Confirmado. Juega ${jugadaHablada(c.jugada)}.`;
      texto = texto.trim();
    } else if (estado.fase === 'PAUSA' && ultimo) {
      clave = `pa-${ultimo.id}`;
      texto = ultimo.cierre === 'GANADO' ? 'Ciclo ganado. Pausa de cuatro minutos.'
        : ultimo.cierre === 'INDETERMINADO' ? 'Mesa indeterminada. Cierro el ciclo. Pausa de cuatro minutos.'
          : 'Corte en el cuarto error. Pausa de cuatro minutos.';
    } else if (estado.fase === 'CERRADO') {
      clave = `cerrado-${estado.dia}`;
      texto = 'Jornada cerrada. Hasta aquí llegamos hoy.';
    }
    if (!clave || clave === habladoRef.current) return;
    habladoRef.current = clave;
    if (ui.voz && texto) hablar(texto);
  }, [estado, lectura.aprobado, lectura.jugada, c, ultimo, ui.voz, ui.avisarPausa]);

  useEffect(() => {
    if (estado.fase === 'VENTANA' && habladoRef.current.startsWith('pa-')) {
      habladoRef.current = 'vuelta';
      if (ui.avisarPausa) {
        pitido();
        if (ui.voz) hablar('Pausa terminada. Ingresa los últimos siete giros.');
      }
    }
  }, [estado.fase, ui.avisarPausa, ui.voz]);

  // ── Arrastre (igual que el Quantum) ──
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const empezarArrastre = useCallback((e: RMouseEvent | RTouchEvent) => {
    const p = 'touches' in e ? e.touches[0] : (e as RMouseEvent);
    arrastre.current = { x: p.clientX, y: p.clientY, px: ui.x, py: ui.y };
    setArrastrando(true);
  }, [ui.x, ui.y]);
  useEffect(() => {
    if (!arrastrando) return;
    const mover = (ev: MouseEvent | TouchEvent) => {
      const a = arrastre.current;
      if (!a) return;
      const p = 'touches' in ev ? ev.touches[0] : (ev as MouseEvent);
      const x = Math.max(-600, Math.min(window.innerWidth - 80, a.px + p.clientX - a.x));
      const y = Math.max(0, Math.min(window.innerHeight - 60, a.py + p.clientY - a.y));
      setUi((u) => ({ ...u, x, y }));
    };
    const soltar = () => setArrastrando(false);
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    window.addEventListener('touchmove', mover, { passive: false });
    window.addEventListener('touchend', soltar);
    return () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      window.removeEventListener('touchmove', mover);
      window.removeEventListener('touchend', soltar);
    };
  }, [arrastrando]);
  const noArrastrar = (e: RMouseEvent | RTouchEvent) => e.stopPropagation();

  // ── Tamaño: el panel se achica solo para caber entero en la pantalla, sin scroll ──
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ajustar = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      if (!h || !w) return;
      const s = Math.max(0.5, Math.min(1, (window.innerHeight - 12) / h, (window.innerWidth - 12) / w));
      setEscala(Math.round(s * 1000) / 1000);
      setUi((u) => {
        const y = Math.max(0, Math.min(u.y, window.innerHeight - h * s - 6));
        const x = Math.max(-w * s + 120, Math.min(u.x, window.innerWidth - 120));
        return y === u.y && x === u.x ? u : { ...u, x, y };
      });
    };
    ajustar();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null;
    ro?.observe(el);
    window.addEventListener('resize', ajustar);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', ajustar);
    };
  }, [ui.min]);

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

  // ── Datos de pantalla según la fase ──
  const tema = (() => {
    if (estado.fase === 'PAUSA') return { fase: 'PAUSA', chip: 'cp-oro', halo: 'rgba(29,78,216,0.22)', sombra: 'rgba(29,78,216,0.28)', sub: '4 minutos fuera de la mesa' };
    if (estado.fase === 'CERRADO') return { fase: 'DÍA CERRADO', chip: 'cp-rojo', halo: 'rgba(200,16,46,0.28)', sombra: 'rgba(200,16,46,0.34)', sub: 'tope de reventones alcanzado' };
    if (estado.fase === 'CICLO' && c) {
      const sub = c.apuesta === false ? `transición · no apuestes · errores seguidos ${c.racha}` : c.racha >= CORTE_ERRORES - 1 ? `${c.racha} errores seguidos · uno más y corta` : c.racha === 2 ? '2 errores seguidos' : `aciertos ${c.aciertos} de 2`;
      return c.racha >= 2
        ? { fase: `CICLO #${c.id}`, chip: 'cp-rojo', halo: 'rgba(200,16,46,0.30)', sombra: 'rgba(200,16,46,0.36)', sub }
        : { fase: `CICLO #${c.id}`, chip: 'cp-oro', halo: 'rgba(212,160,23,0.32)', sombra: 'rgba(184,134,11,0.36)', sub };
    }
    if (!lectura.completa) return { fase: 'LEYENDO', chip: 'cp-oro', halo: 'rgba(29,78,216,0.18)', sombra: 'rgba(29,78,216,0.24)', sub: `faltan ${lectura.faltan} giro${lectura.faltan === 1 ? '' : 's'}` };
    if (lectura.aprobado) return { fase: 'APROBADO', chip: 'cp-oro', halo: 'rgba(212,160,23,0.32)', sombra: 'rgba(184,134,11,0.36)', sub: 'entras en el próximo giro' };
    return { fase: 'SIN SEÑAL', chip: 'cp-oro', halo: 'rgba(245,184,0,0.28)', sombra: 'rgba(245,184,0,0.32)', sub: 'mira el siguiente giro' };
  })();

  const total = estado.ciclos.length;
  const limpios = estado.ciclos.filter((x) => x.cierre === 'GANADO' && x.rachaMax <= 2).length;
  const pc = estado.pausasCumplidas ?? 0;
  const pr = estado.pausasRotas ?? 0;
  const badges = [
    { ico: '✓', k: 'ciclos limpios', v: total ? `${limpios}/${total}` : '0', cls: 'cp-oro' },
    { ico: 'II', k: 'pausas cumplidas', v: pc + pr ? `${pc}/${pc + pr}` : '0', cls: 'cp-oro' },
    { ico: '!', k: 'reventones', v: `${rev}/${estado.config.topeReventones}`, cls: 'cp-rojo' },
  ];

  const extra: string[] = [];
  if (explicar) extra.push(REGLAS_TXT);
  if (pasadoEn !== null && pasadoEn === estado.giros && estado.fase === 'VENTANA') extra.push('Listo, pasas esta. Sigo leyendo con el siguiente giro.');
  const chat = chatDe(estado, lectura, extra);
  const pasado = pasadoEn !== null && pasadoEn === estado.giros;

  const ventanaMarca = estado.fase === 'CICLO' && c ? c.jugada : estado.fase === 'VENTANA' && lectura.aprobado ? lectura.jugada : null;
  const chips = Array.from({ length: VENTANA }, (_, i) => estado.ventana[i]);
  const restante = estado.pausaHasta !== null ? Math.max(0, estado.pausaHasta - ahora) : 0;
  const reloj = `${Math.floor(Math.ceil(restante / 1000) / 60)}:${String(Math.ceil(restante / 1000) % 60).padStart(2, '0')}`;
  const ring = `${Math.round((restante / PAUSA_MS) * 465)} 465`;

  // ── Minimizado ──
  if (ui.min) {
    return (
      <>
        <style>{CSS}</style>
        <button
          type="button"
          className={`cp-min ${tema.chip}`}
          style={{ left: ui.x, top: ui.y }}
          aria-label={`Abrir copiloto de ciclo (${tema.fase.toLowerCase()})`}
          onMouseDown={empezarArrastre}
          onTouchStart={empezarArrastre}
          onClick={() => setUi((u) => ({ ...u, min: false }))}
        >
          {estado.fase === 'PAUSA' ? reloj : estado.fase === 'CICLO' && c ? `${c.aciertos}·${c.racha}` : 'D'}
        </button>
      </>
    );
  }

  return (
    <div ref={shellRef} className="cp-shell" style={{ left: ui.x, top: ui.y, transform: `scale(${escala})`, transformOrigin: 'top left', boxShadow: `0 30px 70px rgba(15,20,38,0.22), 0 4px 14px rgba(15,20,38,0.08), 0 0 0 4px ${tema.halo}` }}>
      <style>{CSS}</style>

      {/* Cabecera (arrastrable) */}
      <div className="cp-head" onMouseDown={empezarArrastre} onTouchStart={empezarArrastre}>
        <div className="cp-orbe" />
        <div className="cp-brand">
          <span className="cp-brand-1">D.A.N.N.A. <span>copiloto de ciclo</span></span>
          <span className="cp-brand-2">Propone, explica y tú decides · los giros entran por Control de Misión</span>
        </div>
        <div className="cp-grow" />
        {badges.map((b) => (
          <div key={b.k} className="cp-badge">
            <span className={`cp-badge-ico ${b.cls}`}>{b.ico}</span>
            <span className="cp-badge-t"><b>{b.v}</b><span>{b.k}</span></span>
          </div>
        ))}
        <button type="button" className="cp-voz" data-on={ui.voz ? '1' : '0'} aria-pressed={ui.voz}
          aria-label="Leer la propuesta en voz alta" onMouseDown={noArrastrar} onTouchStart={noArrastrar}
          onClick={() => setUi((u) => ({ ...u, voz: !u.voz }))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          {ui.voz ? 'Voz activa' : 'Voz apagada'}
        </button>
        <button type="button" className="cp-icon" aria-label="Ajustes" aria-expanded={verAjustes}
          onMouseDown={noArrastrar} onTouchStart={noArrastrar} onClick={() => setVerAjustes((v) => !v)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
        <button type="button" className="cp-icon" aria-label="Minimizar el copiloto"
          onMouseDown={noArrastrar} onTouchStart={noArrastrar} onClick={() => setUi((u) => ({ ...u, min: true }))}>—</button>
      </div>

      {verAjustes && (
        <div className="cp-ajustes">
          <label>Mesa<input className="cp-in" value={estado.config.mesa} placeholder="ej. rápida"
            onChange={(ev) => setEstado((e) => cambiarConfig(e, { mesa: ev.target.value }))} /></label>
          <label>Crupier<input className="cp-in" value={estado.config.crupier} placeholder="nombre o número"
            onChange={(ev) => setEstado((e) => cambiarConfig(e, { crupier: ev.target.value }))} /></label>
          <label>Tope de reventones del día<input className="cp-in" type="number" min={1} max={20} value={estado.config.topeReventones}
            onChange={(ev) => setEstado((e) => cambiarConfig(e, { topeReventones: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) }))} /></label>
          <div className="cp-lbl">Cómo llegas hoy (1 mal · 5 muy bien)
            <div className="cp-row">
              {[1, 2, 3, 4, 5].map((k) => (
                <button key={k} type="button" className="cp-btn" data-on={estado.config.llegada === k ? '1' : '0'}
                  onClick={() => setEstado((e) => cambiarConfig(e, { llegada: k }))}>{k}</button>
              ))}
            </div>
          </div>
          <label className="cp-check"><input type="checkbox" checked={ui.avisarPausa}
            onChange={(ev) => setUi((u) => ({ ...u, avisarPausa: ev.target.checked }))} /> Avisar con sonido cuando termine la pausa</label>
          <div className="cp-row">
            <button type="button" className="cp-btn" onClick={descargar} disabled={estado.ciclos.length === 0}>Descargar registro (CSV)</button>
            {!confirmarDia
              ? <button type="button" className="cp-btn cp-peligro" onClick={() => setConfirmarDia(true)}>Reiniciar el día</button>
              : <button type="button" className="cp-btn cp-peligro" onClick={() => { setEstado(estadoInicial(hoy(), estado.config)); setConfirmarDia(false); }}>Confirmar: borrar ciclos de hoy</button>}
          </div>
        </div>
      )}

      <div className="cp-body">
        {/* Izquierda */}
        <div className="cp-col">
          <div className="cp-persp">
            <div className="cp-holo"
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5;
                const py = (e.clientY - r.top) / r.height - 0.5;
                setTilt({ x: Math.round(-py * 80) / 10, y: Math.round(px * 100) / 10 });
              }}
              onMouseLeave={() => setTilt({ x: 0, y: 0 })}
              style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, boxShadow: `0 22px 44px rgba(15,20,38,0.12), 0 10px 30px ${tema.sombra}` }}>
              <div className="cp-row">
                <span className={`cp-chip ${tema.chip}`} data-claro={tema.chip === 'cp-oro' ? '1' : '0'}>{tema.fase}</span>
                <span className="cp-sub">{tema.sub}</span>
              </div>

              {estado.fase === 'PAUSA' ? (
                <div className="cp-pausa">
                  <div className="cp-ring">
                    <svg width="170" height="170" viewBox="0 0 170 170" aria-hidden="true">
                      <circle cx="85" cy="85" r="74" fill="none" stroke="#e8ebf4" strokeWidth="10" />
                      <circle cx="85" cy="85" r="74" fill="none" stroke="#1d4ed8" strokeWidth="10" strokeLinecap="round" strokeDasharray={ring} transform="rotate(-90 85 85)" />
                    </svg>
                    <span><b>{reloj}</b><small>para volver</small></span>
                  </div>
                  <div className="cp-pausa-t">
                    <span className="cp-pausa-h">{ultimo ? `Ciclo #${ultimo.id} ${ultimo.cierre === 'GANADO' ? 'ganado' : ultimo.cierre === 'INDETERMINADO' ? 'cerrado: mesa indeterminada' : 'cortado'}` : 'Pausa'}</span>
                    <span>Fuera de la mesa 4 minutos. La pausa es parte del sistema: es la que mantiene bajas las rachas por hora.</span>
                  </div>
                </div>
              ) : estado.fase === 'CERRADO' ? (
                <div className="cp-hero">
                  <span className="cp-rojo-txt cp-cerrado">Hasta aquí hoy</span>
                  <span className="cp-det">{rev} de {estado.config.topeReventones} reventones. El copiloto no abre más ciclos hoy; mañana arranca solo.</span>
                </div>
              ) : estado.fase === 'CICLO' && c ? (
                <div className="cp-hero">
                  <span className="cp-lab">Juegas con {nombreVoz(c.voz)}{c.cambios > 0 ? ` · cambió ${c.cambios} ${c.cambios === 1 ? 'vez' : 'veces'}` : ''}</span>
                  {c.apuesta === false ? (
                    <>
                      <span className="cp-big" style={{ color: '#8a6500' }}>No apuestes</span>
                      <span className="cp-det">Transición · {c.motivoEstado ?? 'la mesa no sostiene el par'} · {c.quietos ?? 0} de {MAX_QUIETOS} sin lectura clara</span>
                    </>
                  ) : (
                    <>
                      <span className="cp-oro-txt cp-big" style={{ textShadow: `0 6px 24px ${tema.sombra}` }}>{textoJugada(c.jugada)}</span>
                      <span className="cp-det">{detalleJugada(c.jugada)}{c.cambios > 0 && c.jugadas[0] ? ` · venías con ${c.jugadas[0]}` : ''}</span>
                    </>
                  )}
                  {c.voz === 'PROPUESTA' && c.estadoMesa && (
                    <span className="cp-estado" data-estado={c.estadoMesa}>
                      {c.estadoMesa === 'TRANSICION' ? 'Transición' : 'Concentración'} · {c.girosEnEstado ?? 0} giro{(c.girosEnEstado ?? 0) === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              ) : lectura.aprobado ? (
                <div className="cp-hero">
                  <span className="cp-lab">Mi propuesta</span>
                  <span className="cp-oro-txt cp-big" style={{ textShadow: `0 6px 24px ${tema.sombra}` }}>{textoJugada(lectura.jugada)}</span>
                  <span className="cp-det">{detalleJugada(lectura.jugada)} · el cero también te cuenta como acierto</span>
                </div>
              ) : lectura.completa ? (
                <div className="cp-hero">
                  <span className="cp-lab">La mesa no muestra dominancia</span>
                  <span className="cp-big" style={{ color: '#8a6500' }}>No entres</span>
                  <span className="cp-det">{lectura.ceros >= 2 ? `${lectura.ceros} ceros en la ventana.` : lectura.motivo && lectura.motivo.startsWith('cero en') ? 'Cero en los últimos 4 giros: dispersión reciente.' : 'Ningún mercado cumple las 5 reglas.'}</span>
                </div>
              ) : (
                <div className="cp-hero">
                  <span className="cp-lab">Armando la lectura</span>
                  <span className="cp-big" style={{ color: '#0f1426' }}>{estado.ventana.length} de 7</span>
                  <span className="cp-det">Sigue metiendo los giros en Control de Misión.</span>
                </div>
              )}

              <div className="cp-grow" />

              {(estado.fase === 'CICLO' || (estado.fase === 'VENTANA' && lectura.aprobado)) && (
                <div className="cp-orbes">
                  <div className="cp-orbes-g">
                    <span className="cp-mini">Aciertos para cerrar</span>
                    <div className="cp-row">
                      {[0, 1].map((k) => <span key={k} className={`cp-orbe-h ${c && c.aciertos > k ? 'cp-oro on' : ''}`} />)}
                    </div>
                  </div>
                  <div className="cp-sep" />
                  <div className="cp-orbes-g">
                    <span className="cp-mini">Errores seguidos · corte en {CORTE_ERRORES}</span>
                    <div className="cp-row">
                      {Array.from({ length: CORTE_ERRORES }, (_, k) => <span key={k} className={`cp-orbe-e ${c && c.racha > k ? 'cp-rojo on' : ''}`} />)}
                    </div>
                  </div>
                  <div className="cp-grow" />
                  {c && (
                    <div className="cp-row cp-tira">
                      {c.numeros.slice(-6).map((n, k, arr) => {
                        const res = c.resultados[c.resultados.length - arr.length + k] ?? 'E';
                        return (
                          <span key={k} className="cp-tira-i">
                            <span className="cp-num" data-color={n === 0 ? 'v' : ROJOS.has(n) ? 'r' : 'n'} data-res={res}>{n}</span>
                            <span className="cp-marca" data-res={res}>{MARCA_RES[res]}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Ventana */}
          <div className="cp-card">
            <div className="cp-card-h">
              <span>Lo que leyó en los últimos 7 giros</span>
              <span className="cp-nota">{estado.fase === 'PAUSA' ? 'se vació al cerrar el ciclo' : estado.fase === 'CERRADO' ? 'cerrada hasta mañana' : lectura.ceros > 0 ? `${lectura.ceros} cero${lectura.ceros > 1 ? 's' : ''}` : ventanaMarca ? `con aro dorado: lo que cubre ${textoJugada(ventanaMarca)}` : 'sin ceros'}</span>
            </div>
            <div className="cp-ventana">
              {chips.map((n, i) => {
                if (n === undefined) return <div key={i} className="cp-ficha cp-falta" style={{ animationDelay: `${i * 0.35}s` }}><b>·</b><small>falta</small></div>;
                const dentro = !!ventanaMarca && (n === 0 || ventanaMarca.zonas.includes((ventanaMarca.mercado === 'doc' ? Math.floor((n - 1) / 12) : (n - 1) % 3) as 0 | 1 | 2));
                return (
                  <div key={i} className="cp-ficha" data-color={n === 0 ? 'v' : ROJOS.has(n) ? 'r' : 'n'} data-dentro={dentro ? '1' : '0'} style={{ animationDelay: `${i * 0.35}s` }}>
                    <b>{n}</b>
                    <small>{n === 0 ? 'cero' : `D${Math.floor((n - 1) / 12) + 1} · C${((n - 1) % 3) + 1}`}</small>
                  </div>
                );
              })}
            </div>
            {lectura.completa && lectura.doc && lectura.col && estado.fase !== 'PAUSA' && estado.fase !== 'CERRADO' && (
              <div className="cp-mercados">
                <Mercado l={lectura.doc} frenoCero={lectura.ceros >= 2 || (lectura.motivo ?? '').startsWith('cero en')} />
                <Mercado l={lectura.col} frenoCero={lectura.ceros >= 2 || (lectura.motivo ?? '').startsWith('cero en')} />
              </div>
            )}
          </div>
        </div>

        {/* Derecha: conversación */}
        <div className="cp-chat">
          <div className="cp-card-h">
            <span>Conversación</span>
            <span className="cp-nota">D.A.N.N.A. propone, no manda</span>
          </div>
          <div className="cp-msgs" aria-live="polite">
            {chat.map((t, i) => (
              <div key={`${estado.giros}-${i}-${t.length}`} className="cp-msg" style={{ animationDelay: `${i * 0.2}s` }}>
                <span className="cp-msg-av" />
                <div className="cp-msg-t">{t}</div>
              </div>
            ))}
          </div>
          <div className="cp-replies">
            {estado.fase === 'VENTANA' && lectura.completa && !pasado && (
              <>
                {((lectura.aprobado ? ['PROPUESTA', 'MOTOR_DOC', 'MOTOR_COL'] : ['MOTOR_DOC', 'MOTOR_COL']) as Voz[]).map((v) => {
                  const p = estado.pendientes[v];
                  const m = estado.marcadores[v];
                  const prim = v === 'PROPUESTA';
                  return (
                    <button key={v} type="button" className={`cp-reply ${prim ? 'cp-prim' : ''}`} disabled={!puedeEntrar(estado, v)}
                      onClick={() => setEstado((e) => entrar(e, v, motorRef.current, Date.now()))}>
                      <span className="cp-reply-t">{prim ? 'Entro con mi propuesta' : lectura.aprobado ? 'Entro con el motor' : 'Entro con el motor (sin aprobación)'}</span>
                      <span className="cp-reply-p">{textoJugada(p)}</span>
                      <span className="cp-reply-s">{nombreVoz(v)} · ✓{m.aciertos} ✗{m.errores} · peor {m.peor}</span>
                    </button>
                  );
                })}
                {lectura.aprobado && (
                  <button type="button" className="cp-reply cp-mute" onClick={() => setPasadoEn(estado.giros)}>
                    <span className="cp-reply-t">Paso esta</span>
                    <span className="cp-reply-s">no entro, sigo leyendo</span>
                  </button>
                )}
              </>
            )}
            {estado.fase === 'VENTANA' && lectura.completa && !lectura.aprobado && (
              <button type="button" className="cp-reply cp-mute" aria-pressed={explicar} onClick={() => setExplicar((x) => !x)}>
                <span className="cp-reply-t">{explicar ? 'Ocultar las 5 reglas' : '¿Por qué no?'}</span>
                <span className="cp-reply-s">ver las 5 reglas de la lectura</span>
              </button>
            )}
            {estado.fase === 'CICLO' && c && c.voz === 'PROPUESTA' && opcionesTransicion(estado, lectura).map((o) => (
              <button key={o.clave} type="button" className="cp-reply" onClick={() => setEstado((e) => jugarIgual(e, o.jugada))}>
                <span className="cp-reply-t">{c.apuesta === false ? 'Juego igual' : 'Cambio a'} · {o.fuente}</span>
                <span className="cp-reply-p">{textoJugada(o.jugada)}</span>
                <span className="cp-reply-s">{c.apuesta === false ? 'solo el próximo giro · lo recomendado es esperar' : `solo el próximo giro · si no tocas, sigues con ${textoJugada(c.jugada)}`}</span>
              </button>
            ))}
            {estado.fase === 'CICLO' && c && (
              <button type="button" className="cp-reply cp-mute"
                onClick={() => hablar(`${c.apuesta === false ? 'Transición. No apuestes este giro' : `Juegas ${jugadaHablada(c.jugada)}`}. Aciertos ${c.aciertos} de 2. Errores seguidos ${c.racha} de ${CORTE_ERRORES}.`)}>
                <span className="cp-reply-t">Leer el estado en voz alta</span>
                <span className="cp-reply-s">aciertos {c.aciertos} de 2 · errores {c.racha} de {CORTE_ERRORES}</span>
              </button>
            )}
            {estado.fase === 'PAUSA' && (
              <button type="button" className="cp-reply cp-prim" onClick={() => setEstado((e) => terminarPausa(e))}>
                <span className="cp-reply-t">Iniciar ciclo nuevo ya</span>
                <span className="cp-reply-s">corta la pausa · queda como pausa no cumplida</span>
              </button>
            )}
            {estado.fase === 'PAUSA' && (
              <button type="button" className="cp-reply" aria-pressed={ui.avisarPausa} onClick={() => setUi((u) => ({ ...u, avisarPausa: !u.avisarPausa }))}>
                <span className="cp-reply-t">{ui.avisarPausa ? 'Te aviso cuando termine' : 'Avísame cuando termine'}</span>
                <span className="cp-reply-s">{ui.avisarPausa ? 'con sonido y voz · toca para quitarlo' : 'con sonido y voz'}</span>
              </button>
            )}
            {estado.fase === 'CERRADO' && (
              <button type="button" className="cp-reply" onClick={descargar} disabled={estado.ciclos.length === 0}>
                <span className="cp-reply-t">Descargar el registro del día</span>
                <span className="cp-reply-p">CSV</span>
                <span className="cp-reply-s">para entrenar el modelo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tu día */}
      <div className="cp-dia">
        <span className="cp-dia-h">Tu día</span>
        {estado.ciclos.length === 0 && <span className="cp-nota">Todavía no hay ciclos hoy.</span>}
        {estado.ciclos.slice(-6).map((x) => (
          <span key={x.id} className="cp-dia-i" data-tipo={x.cierre === 'CORTE' ? 'corte' : x.cierre === 'INDETERMINADO' ? 'indet' : x.rachaMax >= 3 ? 'duro' : 'limpio'}>
            <span className="cp-mono">{x.resultados.join(' ')}</span>#{x.id} {x.cierre === 'CORTE' ? 'corte' : x.cierre === 'INDETERMINADO' ? 'indeterminado' : 'ganado'}
          </span>
        ))}
        {estado.fase === 'CICLO' && c && <span className="cp-nota">en juego: #{c.id}</span>}
        <div className="cp-grow" />
        <span className="cp-mono cp-cont">{estado.giros} giros · {estado.ciclos.length} ciclo{estado.ciclos.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

/** Opciones para jugar igual en transición (sin repetir la misma jugada). */
function opcionesTransicion(e: Estado, l: Lectura): { clave: string; fuente: string; jugada: Jugada }[] {
  const c = e.ciclo;
  if (!c) return [];
  const out: { clave: string; fuente: string; jugada: Jugada }[] = [];
  const enJuego = c.apuesta !== false; // en concentración no se ofrece el par que ya juegas
  const add = (fuente: string, j: Jugada | null | undefined) => {
    if (!j || out.some((o) => o.clave === textoJugada(j))) return;
    if (enJuego && mismaJugada(j, c.jugada)) return;
    out.push({ clave: textoJugada(j), fuente, jugada: j });
  };
  add('mi par', c.jugada);
  add('el par que aparece', c.candidato ?? null);
  if (l.doc && l.doc.ok) add('docenas cumple', { mercado: 'doc', zonas: l.doc.zonas });
  if (l.col && l.col.ok) add('columnas cumple', { mercado: 'col', zonas: l.col.zonas });
  add('motor docenas', e.pendientes.MOTOR_DOC);
  add('motor columnas', e.pendientes.MOTOR_COL);
  return out;
}

function Mercado({ l, frenoCero = false }: { l: LecturaMercado; frenoCero?: boolean }) {
  const pref = l.mercado === 'doc' ? 'D' : 'C';
  const frenado = l.ok && frenoCero;
  return (
    <div className="cp-mkt" data-ok={frenado ? 'freno' : l.ok ? '1' : '0'}>
      <div className="cp-barras">
        {l.conteo.map((n, z) => (
          <div key={z} className="cp-barra" data-on={l.ok && l.zonas.includes(z as 0 | 1 | 2) ? '1' : '0'} style={{ height: Math.max(4, Math.round((n / 7) * 38)) }} />
        ))}
      </div>
      <div className="cp-mkt-t">
        <span className="cp-mkt-n">{l.mercado === 'doc' ? 'Docenas' : 'Columnas'} <span className="cp-mono">{l.conteo.map((n, z) => `${nombreZona(l.mercado, z as 0 | 1 | 2)}:${n}`).join(' ')}</span></span>
        <span className="cp-mkt-r">{frenado ? `Cumple sus 4 reglas · ${pref}${l.zonas[0] + 1} + ${pref}${l.zonas[1] + 1} · frenado por el cero` : l.ok ? `Cumple las 5 reglas · ${pref}${l.zonas[0] + 1} + ${pref}${l.zonas[1] + 1}` : l.motivo}</span>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
@property --cp-ang{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes cp-girar{to{--cp-ang:360deg}}
@keyframes cp-flotar{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes cp-latido{0%,100%{box-shadow:0 0 0 0 rgba(245,184,0,.65)}70%{box-shadow:0 0 0 13px rgba(245,184,0,0)}}
@keyframes cp-entrar{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cp-oro{background:linear-gradient(135deg,#9a7400 0%,#d4a017 20%,#fff1a8 40%,#e0b52e 58%,#a87c05 78%,#f2d36b 100%)}
.cp-rojo{background:linear-gradient(135deg,#5c0012 0%,#b3122e 22%,#ff7088 42%,#c8102e 60%,#6b0016 80%,#e0314f 100%)}
.cp-oro-txt{background:linear-gradient(180deg,#f2d36b 0%,#c99a06 35%,#7a5800 62%,#d4a017 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 10px rgba(184,134,11,.35));text-shadow:none!important}
.cp-rojo-txt{background:linear-gradient(180deg,#ff7088 0%,#c8102e 38%,#6b0016 66%,#e0314f 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 10px rgba(200,16,46,.35))}
.cp-shell{position:fixed;z-index:60;width:1040px;box-sizing:border-box;padding:14px;border-radius:26px;background:#fff;border:1px solid #e3e8f2;border-top:6px solid #c99a06;display:flex;flex-direction:column;gap:12px;font-family:'Sora','Segoe UI',sans-serif;color:#0f1426;user-select:none}
.cp-shell button{font:inherit}
.cp-shell button:focus-visible,.cp-shell input:focus-visible,.cp-min:focus-visible{outline:2px solid #1d4ed8;outline-offset:3px}
.cp-min{position:fixed;z-index:60;min-width:54px;height:54px;padding:0 12px;border-radius:999px;border:1px solid #8a6500;color:#1f1500;font:800 15px 'JetBrains Mono',monospace;cursor:grab;box-shadow:0 10px 26px rgba(15,20,38,.3),inset 0 1px 0 rgba(255,255,255,.7)}
.cp-min.cp-rojo{color:#fff;border-color:#5c0012}
.cp-head{min-height:50px;display:flex;align-items:center;gap:10px;cursor:grab}
.cp-orbe{width:38px;height:38px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 32% 28%,#fffbe0,#f5d76e 30%,#b8860b 62%,#5c4300 100%);animation:cp-latido 2.4s ease-out infinite}
.cp-brand{display:flex;flex-direction:column;line-height:1.15;min-width:0;flex:1 1 auto}
.cp-brand-1,.cp-brand-2{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-brand-1{font-size:17px;font-weight:800;letter-spacing:.04em}
.cp-brand-1 span{font-weight:500;color:#475069}
.cp-brand-2{font-size:12px;color:#5e6886}
.cp-grow{flex-grow:1}
.cp-badge{display:flex;align-items:center;gap:7px;padding:5px 10px 5px 6px;border-radius:999px;background:#f6f8fc;border:1px solid #e3e8f2;flex-shrink:0}
.cp-badge-ico{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
.cp-badge-t{display:flex;flex-direction:column;line-height:1.05}
.cp-badge-t b{font:700 15px 'JetBrains Mono',monospace}
.cp-badge-t span{font-size:11px;color:#5e6886}
.cp-voz{flex-shrink:0;white-space:nowrap;height:44px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;background:#fff;border:1px solid #d4dae8;color:#475069}
.cp-voz[data-on="1"]{background:#fff8db;border:1.5px solid #d99a00;color:#7a4f00}
.cp-icon{flex-shrink:0;width:44px;height:44px;border-radius:12px;background:#f6f8fc;border:1px solid #e3e8f2;color:#475069;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px}
.cp-ajustes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px;border-radius:16px;background:#f6f8fc;border:1px solid #e3e8f2;user-select:text}
.cp-ajustes label,.cp-lbl{display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:#475069}
.cp-ajustes .cp-check{flex-direction:row;align-items:center;gap:8px;grid-column:span 2}
.cp-in{background:#fff;border:1px solid #d4dae8;color:#0f1426;border-radius:10px;padding:8px 10px;font:inherit;font-size:14px;min-height:40px}
.cp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cp-btn{min-height:40px;padding:0 14px;border-radius:10px;background:#fff;border:1px solid #d4dae8;color:#0f1426;cursor:pointer;font-size:13px}
.cp-btn[data-on="1"]{background:#fff8db;border:1.5px solid #c99a06;color:#6b4e00;font-weight:700}
.cp-btn:disabled{opacity:.45;cursor:default}
.cp-peligro{border-color:#e7a3b1;color:#b3122e}
.cp-body{display:grid;grid-template-columns:minmax(0,1.32fr) minmax(0,1fr);gap:16px}
.cp-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.cp-persp{perspective:1000px}
.cp-holo{position:relative;isolation:isolate;min-height:272px;box-sizing:border-box;padding:20px 22px;border-radius:22px;background:linear-gradient(150deg,#fff,#f4f7fd);transition:transform .18s ease-out;display:flex;flex-direction:column;gap:10px;overflow:hidden}
.cp-holo::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:2px;background:conic-gradient(from var(--cp-ang),#fff1a8,#d4a017,#7a5800,#e0314f,#6b0016,#ff7088,#d4a017,#fff1a8);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:cp-girar 7s linear infinite;z-index:-1}
.cp-chip{padding:6px 14px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.14em;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.6)}
.cp-chip[data-claro="1"]{color:#2b1d00}
.cp-sub{font-size:13px;color:#475069}
.cp-hero{display:flex;flex-direction:column;gap:4px}
.cp-lab{font-size:13px;color:#5e6886}
.cp-big{font-size:64px;font-weight:800;line-height:1.05;letter-spacing:-.01em}
.cp-det{font-size:15px;color:#475069}
.cp-cerrado{font-size:54px;font-weight:800;line-height:1.05}
.cp-pausa{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.cp-ring{position:relative;width:170px;height:170px;flex-shrink:0;margin:-8px 0}
.cp-ring>span{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cp-ring b{font:700 40px 'JetBrains Mono',monospace;color:#1e3a8a}
.cp-ring small{font-size:12px;color:#5e6886}
.cp-pausa-t{display:flex;flex-direction:column;gap:8px;max-width:320px;font-size:15px;color:#475069}
.cp-pausa-h{font-size:34px;font-weight:800;line-height:1.05;color:#0f1426}
.cp-orbes{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:#f6f8fc;border:1px solid #e3e8f2}
.cp-orbes-g{display:flex;flex-direction:column;gap:6px}
.cp-mini{font-size:11.5px;color:#475069}
.cp-sep{width:1px;align-self:stretch;background:#e3e8f2}
.cp-orbe-h{width:32px;height:32px;border-radius:50%;background:#fff;border:2px solid #d4dae8;box-sizing:border-box}
.cp-orbe-e{width:32px;height:32px;border-radius:9px;transform:rotate(45deg) scale(.78);background:#fff;border:2px solid #d4dae8;box-sizing:border-box}
.cp-orbe-h.on{background:linear-gradient(135deg,#7a5800,#d4a017 25%,#fff1a8 45%,#c99a06 65%,#7a5800);border:0;box-shadow:0 0 16px #d4a017,0 6px 14px rgba(212,160,23,.4),inset 0 1px 0 rgba(255,255,255,.6)}
.cp-orbe-e.on{background:linear-gradient(135deg,#4a000e,#b3122e 25%,#ff7088 45%,#c8102e 65%,#5c0012);border:0;box-shadow:0 0 16px #c8102e,0 6px 14px rgba(200,16,46,.4),inset 0 1px 0 rgba(255,255,255,.6)}
.cp-tira{gap:6px}
.cp-tira-i{display:flex;flex-direction:column;align-items:center;gap:3px}
.cp-num{min-width:32px;height:32px;padding:0 4px;box-sizing:border-box;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 13px 'JetBrains Mono',monospace;color:#fff}
.cp-num[data-color="r"]{background:#d1213b}.cp-num[data-color="n"]{background:#16181f}.cp-num[data-color="v"]{background:#0f8a4c}
.cp-num[data-res="A"]{box-shadow:0 0 0 2px #fff,0 0 0 4px #d4a017,0 0 14px rgba(212,160,23,.65)}
.cp-num[data-res="E"]{box-shadow:0 0 0 2px #fff,0 0 0 4px #c8102e,0 0 14px rgba(200,16,46,.55)}
.cp-marca{font-size:12px;font-weight:800}
.cp-marca[data-res="A"]{color:#8a6500}.cp-marca[data-res="E"]{color:#b3122e}
.cp-num[data-res="N"]{opacity:.45;box-shadow:0 0 0 2px #fff,0 0 0 4px #c9cfdc}
.cp-marca[data-res="N"]{color:#9aa3b5}
.cp-estado{align-self:flex-start;margin-top:4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.cp-estado[data-estado="CONCENTRACION"]{color:#6b4e00;background:linear-gradient(135deg,#fff8db,#fde9a0);border:1px solid #c99a06}
.cp-estado[data-estado="TRANSICION"]{color:#8b0a1f;background:linear-gradient(135deg,#fff0f2,#ffd3da);border:1px solid #c8102e}
.cp-card{padding:14px 16px;border-radius:20px;background:#fff;border:1px solid #e3e8f2;box-shadow:0 14px 30px rgba(15,20,38,.08);display:flex;flex-direction:column;gap:12px}
.cp-card-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;font-weight:600;color:#1e2640}
.cp-nota{font-size:12px;font-weight:400;color:#5e6886}
.cp-ventana{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
.cp-ficha{height:56px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#fff;animation:cp-flotar 4.5s ease-in-out infinite;box-shadow:0 10px 18px rgba(15,20,38,.18)}
.cp-ficha b{font-size:22px;font-weight:800;line-height:1}
.cp-ficha small{font:11px 'JetBrains Mono',monospace;color:rgba(255,255,255,.85)}
.cp-ficha[data-color="r"]{background:linear-gradient(160deg,#d1213b,#b81a32)}
.cp-ficha[data-color="n"]{background:linear-gradient(160deg,#16181f,#2a2d38)}
.cp-ficha[data-color="v"]{background:linear-gradient(160deg,#0f8a4c,#0b6e3c)}
.cp-ficha[data-dentro="1"]{box-shadow:0 10px 18px rgba(15,20,38,.18),0 0 0 3px #fff,0 0 0 6px #f5b800,0 0 20px rgba(245,184,0,.65)}
.cp-ficha.cp-falta{background:#f6f8fc;border:1.5px dashed #cdd4e4;color:#9aa3bd;box-shadow:none}
.cp-ficha.cp-falta small{color:#7a84a3}
.cp-mercados{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cp-mkt{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:#f6f8fc;border:1px solid #e3e8f2}
.cp-mkt[data-ok="1"]{border:1.5px solid #00c27f;background:#e8fcf4;box-shadow:0 0 18px rgba(0,214,143,.25)}
.cp-barras{display:flex;align-items:flex-end;gap:5px;height:38px}
.cp-barra{width:14px;border-radius:4px;background:#c3cadb}
.cp-barra[data-on="1"]{background:#00c27f;box-shadow:0 0 12px rgba(0,214,143,.7)}
.cp-mkt-t{display:flex;flex-direction:column;gap:2px;min-width:0}
.cp-mkt-n{font-size:13px;font-weight:700}
.cp-mkt-r{font-size:12px;font-weight:600;color:#475069}
.cp-mkt[data-ok="1"] .cp-mkt-r{color:#00875a}
.cp-mkt[data-ok="freno"]{border:1.5px solid #d4a017;background:#fff8db;box-shadow:0 0 14px rgba(212,160,23,.22)}
.cp-mkt[data-ok="freno"] .cp-mkt-r{color:#8a6500}
.cp-mkt[data-ok="freno"] .cp-barra[data-on="1"]{background:linear-gradient(180deg,#f5d76e,#b8860b);box-shadow:0 0 10px rgba(212,160,23,.55)}
.cp-mono{font-family:'JetBrains Mono',monospace;font-weight:500;color:#475069}
.cp-chat{min-width:0;padding:16px;border-radius:22px;background:#f6f8fc;border:1px solid #e3e8f2;display:flex;flex-direction:column;gap:12px}
.cp-msgs{flex-grow:1;display:flex;flex-direction:column;gap:10px;min-height:120px}
.cp-msg{display:flex;gap:10px;align-items:flex-start;animation:cp-entrar .45s ease both}
.cp-msg-av{width:26px;height:26px;margin-top:2px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 32% 28%,#fffbe0,#f5d76e 30%,#b8860b 62%,#5c4300 100%)}
.cp-msg-t{padding:10px 13px;border-radius:4px 16px 16px 16px;background:#fff;border:1px solid #e3e8f2;box-shadow:0 4px 12px rgba(15,20,38,.05);font-size:14.5px;line-height:1.45;color:#0f1426;user-select:text}
.cp-replies{display:flex;flex-direction:column;gap:8px}
.cp-reply{width:100%;min-height:48px;padding:8px 14px;border-radius:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 10px;text-align:left;cursor:pointer;background:#fff;border:1px solid #d4dae8;color:#0f1426;box-shadow:0 6px 14px rgba(15,20,38,.06)}
.cp-reply:disabled{opacity:.45;cursor:default}
.cp-reply-t{grid-column:1;font-size:14px;font-weight:700}
.cp-reply-p{grid-row:span 2;font-size:22px;font-weight:800;color:#1d4ed8}
.cp-reply-s{grid-column:1;font:11.5px 'JetBrains Mono',monospace;color:#5e6886}
.cp-reply-p{grid-column:2;grid-row:1 / span 2}
.cp-reply.cp-prim{background:linear-gradient(135deg,#c99a06,#f5d76e 28%,#fff1a8 48%,#e0b52e 68%,#b8860b);border:1px solid #8a6500;color:#1f1500;box-shadow:0 10px 24px rgba(184,134,11,.40),inset 0 1px 0 rgba(255,255,255,.75)}
.cp-reply.cp-prim .cp-reply-p{color:#1f1500}
.cp-reply.cp-prim .cp-reply-s{color:#3d2b00}
.cp-reply.cp-mute{background:transparent;border:1px dashed #cdd4e4;color:#475069;box-shadow:none}
.cp-dia{min-height:54px;box-sizing:border-box;padding:8px 16px;border-radius:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#f6f8fc;border:1px solid #e3e8f2}
.cp-dia-h{font-size:12.5px;font-weight:700;color:#1e2640}
.cp-dia-i{height:34px;padding:0 12px;border-radius:10px;display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700}
.cp-dia-i[data-tipo="limpio"]{background:linear-gradient(135deg,#fff8db,#fde9a0);border:1.5px solid #c99a06;color:#6b4e00}
.cp-dia-i[data-tipo="indet"]{background:#f1f3f8;border:1.5px dashed #9aa3b5;color:#4a5368}
.cp-dia-i[data-tipo="duro"]{background:linear-gradient(135deg,#fff0f2,#ffd3da);border:1.5px solid #c8102e;color:#8b0a1f}
.cp-dia-i[data-tipo="corte"]{color:#fff;border:1px solid #5c0012;background:linear-gradient(135deg,#5c0012,#b3122e 30%,#e0314f 55%,#8b0a1f)}
.cp-dia-i[data-tipo="corte"] .cp-mono{color:#fff}
.cp-cont{font-size:13px}

`;

export default CicloPanel;
