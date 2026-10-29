// ════════════════════════════════════════════════════════════════════════
// MODO CICLO (oct 2026) — protocolo de entradas cortas de Gunner.
//
// Lógica PURA, sin React ni red: no lee ni escribe nada del motor, del store
// de telemetría ni de copilot.ts. La pantalla (pages/CicloPage.tsx) le pasa
// cada número que sale y los picks del motor; aquí se decide todo lo demás.
//
// PROTOCOLO (fijado con Gunner y medido sobre 19.764 giros reales):
//   1. Se ingresan los últimos 7 giros. La ventana se lee con la REGLA B
//      (dominancia en 5 reglas, abajo). Si no aprueba, se ingresa el
//      siguiente giro y se vuelve a leer (ventana deslizante).
//   2. Si aprueba, el jugador elige la voz que juega (Propuesta, Motor
//      docenas o Motor columnas) y ENTRA. Un solo mercado por giro.
//   3. Cada giro dentro del ciclo se vuelve a leer la ventana. Con la voz
//      Propuesta (ESTADO DINÁMICO, versión D, oct 2026):
//        · si aciertas (el cero también) → sigues con tu par, nunca transición;
//        · si el mercado que juegas sigue aprobando tu par (aunque el otro
//          mercado gane el desempate) → CONCENTRACIÓN: juegas;
//        · si no lo sostiene (siempre pasa tras un error) → TRANSICIÓN: ese giro
//          NO se apuesta (el ciclo sigue abierto con sus aciertos y errores);
//        · un par nuevo solo se juega cuando la mesa lo aprueba 2 lecturas
//          seguidas (CONFIRMADO);
//        · 7 giros seguidos sin lectura clara → INDETERMINADO: cierra el ciclo
//          (no es reventón) y va a pausa.
//      Medido sobre el corpus: rachas de 4 de 28 a 12, de 3 de 67 a 38.
//      Las voces del motor siguen igual: juegan todos los giros.
//   4. El cero cuenta como ACIERTO. El ciclo cierra en el 2º acierto, o en
//      el 4º error seguido (CORTE = reventón).
//   5. Después de cada ciclo (gane o reviente): pausa de 4 minutos. Al
//      volver se ingresan 7 giros nuevos. Con 4 reventones se cierra el día.
//
// REGLA B — la ventana aprueba un mercado si cumple las 5:
//   · Concentración: zona más salida − zona menos salida ≥ 2 (conteo simple).
//   · Coherencia:    el par del conteo simple = el par ponderado.
//   · Recencia:      la zona de afuera no salió en los últimos 4 giros (V2, oct 2026; antes 3).
//   · Separación:    la zona de afuera salió como máximo 1 vez en los 7.
//   · Indeterminado: con 2 o más ceros en la ventana, o con un cero en los últimos
//                    4 giros (dispersión reciente, V2), no se aprueba nada.
// El par ponderado usa EXACTAMENTE el cálculo de evaluarMercado() de
// copilot.ts (pesos 1-1-1-1-2-3-4, desempate por la zona que salió más
// tarde, luego orden fijo). Si aprueban los dos mercados: gana el de la zona
// de afuera menos salida; si empatan, el de mayor fuerza ponderada; si aún
// empatan, docenas.
//
// VALIDADO: esta lógica, corrida sobre el corpus (79 tramos, 19.764 giros),
// da los mismos ciclos que la simulación de referencia en Python.
// ════════════════════════════════════════════════════════════════════════

export type Mercado = 'doc' | 'col';
export type Zona = 0 | 1 | 2;
export type Voz = 'PROPUESTA' | 'MOTOR_DOC' | 'MOTOR_COL';
export const VOCES: readonly Voz[] = ['PROPUESTA', 'MOTOR_DOC', 'MOTOR_COL'];

export interface Jugada {
  mercado: Mercado;
  zonas: [Zona, Zona]; // ordenadas de menor a mayor
}

export const VENTANA = 7;
// V2 (oct 2026): la zona de afuera y el cero se revisan en los últimos 4 giros.
export const RECENCIA = 4;
export const CORTE_ERRORES = 4;
export const PAUSA_MS = 4 * 60 * 1000;
export const TOPE_REVENTONES_DEFECTO = 4;
// Estado dinámico (versión D): lecturas seguidas para confirmar un par nuevo
// y giros seguidos sin lectura clara antes de cerrar el ciclo.
export const CONFIRMAR_CAMBIO = 2;
export const MAX_QUIETOS = 7;

const PESOS: readonly number[] = [1, 1, 1, 1, 2, 3, 4].map((w) => (w * VENTANA) / 13);

// ── Zonas ────────────────────────────────────────────────────────────────
export function zonaDe(n: number, m: Mercado): Zona | null {
  if (!Number.isInteger(n) || n <= 0 || n > 36) return null;
  return (m === 'doc' ? Math.floor((n - 1) / 12) : (n - 1) % 3) as Zona;
}

/** Acierto de una jugada contra el número que salió. El cero es ACIERTO. */
export function esAcierto(j: Jugada, n: number): boolean {
  if (n === 0) return true;
  const z = zonaDe(n, j.mercado);
  return z !== null && j.zonas.includes(z);
}

const TXT_DOC = ['1-12', '13-24', '25-36'];
export function nombreZona(m: Mercado, z: Zona): string {
  return m === 'doc' ? `D${z + 1}` : `C${z + 1}`;
}
export function textoJugada(j: Jugada | null): string {
  if (!j) return '—';
  return j.zonas.map((z) => nombreZona(j.mercado, z)).join(' + ');
}
export function detalleJugada(j: Jugada | null): string {
  if (!j) return '';
  return j.mercado === 'doc'
    ? j.zonas.map((z) => TXT_DOC[z]).join(' / ')
    : j.zonas.map((z) => `Columna ${z + 1}`).join(' / ');
}
export function mismaJugada(a: Jugada | null, b: Jugada | null): boolean {
  if (!a || !b) return a === b;
  return a.mercado === b.mercado && a.zonas[0] === b.zonas[0] && a.zonas[1] === b.zonas[1];
}
function jugadaDe(m: Mercado, zs: number[]): Jugada {
  const s = [...zs].sort((a, b) => a - b) as Zona[];
  return { mercado: m, zonas: [s[0], s[1]] };
}

/** Convierte el pick de texto del motor ("13-24 / 25-36", "Columna 3 / Columna 1"). */
export function pickMotor(txt: unknown, m: Mercado): Jugada | null {
  const t = String(txt ?? '');
  const zs: number[] = [];
  if (m === 'doc') {
    for (const x of t.matchAll(/(\d+)\s*-\s*(\d+)/g)) {
      const a = Number(x[1]);
      if (a >= 1 && a <= 36) zs.push(Math.floor((a - 1) / 12));
    }
  } else {
    for (const x of t.matchAll(/columna\s*(\d)/gi)) {
      const c = Number(x[1]);
      if (c >= 1 && c <= 3) zs.push(c - 1);
    }
  }
  const u = [...new Set(zs)];
  return u.length === 2 ? jugadaDe(m, u) : null;
}

// ── Lectura de la ventana (REGLA B) ──────────────────────────────────────
export interface LecturaMercado {
  mercado: Mercado;
  conteo: [number, number, number];
  zonas: [Zona, Zona]; // par ponderado (ordenado de menor a mayor)
  excluida: Zona;
  fuerza: number; // parte de la ventana ponderada que cubre el par (0-1)
  ok: boolean;
  motivo: string | null; // primera regla que falló
}

export interface Lectura {
  completa: boolean;
  faltan: number;
  ceros: number;
  aprobado: boolean;
  jugada: Jugada | null;
  doc: LecturaMercado | null;
  col: LecturaMercado | null;
  motivo: string | null; // motivo general cuando no se aprueba
}

function leerMercado(v: number[], m: Mercado): LecturaMercado {
  const len = v.length;
  const cnt = [0, 0, 0];
  const score = [0, 0, 0];
  const last = [-1, -1, -1];
  v.forEach((n, i) => {
    const z = zonaDe(n, m);
    if (z === null) return;
    cnt[z] += 1;
    score[z] += PESOS[PESOS.length - len + i] ?? 1;
    last[z] = i;
  });
  // Orden ponderado: igual que evaluarMercado() de copilot.ts.
  const orden = [0, 1, 2].sort((a, b) => {
    const d = score[b] - score[a];
    if (Math.abs(d) > 1e-9) return d;
    const r = last[b] - last[a];
    if (r !== 0) return r;
    return a - b;
  });
  // Orden por conteo simple (desempate: la que salió más tarde, luego orden fijo).
  const ordenSimple = [0, 1, 2].sort((a, b) => {
    if (cnt[b] !== cnt[a]) return cnt[b] - cnt[a];
    if (last[b] !== last[a]) return last[b] - last[a];
    return a - b;
  });
  const par = [orden[0], orden[1]];
  const excl = orden[2] as Zona;
  const parSimple = [ordenSimple[0], ordenSimple[1]];
  const gap = Math.max(...cnt) - Math.min(...cnt);
  const total = score[0] + score[1] + score[2] || 1;
  const fuerza = (score[par[0]] + score[par[1]]) / total;

  let motivo: string | null = null;
  const nm = (z: number) => nombreZona(m, z as Zona);
  if (gap < 2) motivo = 'sin concentración (reparto parejo)';
  else if (!(parSimple.includes(par[0]) && parSimple.includes(par[1])))
    motivo = 'conteo y recencia no coinciden en el par';
  else if (v.slice(-RECENCIA).some((n) => zonaDe(n, m) === excl))
    motivo = `${nm(excl)} (la de afuera) salió en los últimos ${RECENCIA}`;
  else if (cnt[excl] > 1) motivo = `${nm(excl)} (la de afuera) salió ${cnt[excl]} veces`;

  const j = jugadaDe(m, par);
  return {
    mercado: m,
    conteo: [cnt[0], cnt[1], cnt[2]],
    zonas: j.zonas,
    excluida: excl,
    fuerza,
    ok: motivo === null,
    motivo,
  };
}

/** Lee los últimos 7 giros con la REGLA B. */
export function leerVentana(giros: number[]): Lectura {
  const v = giros.slice(-VENTANA);
  const faltan = Math.max(0, VENTANA - v.length);
  const ceros = v.filter((n) => n === 0).length;
  if (faltan > 0) {
    return { completa: false, faltan, ceros, aprobado: false, jugada: null, doc: null, col: null, motivo: `faltan ${faltan} giro${faltan === 1 ? '' : 's'}` };
  }
  const doc = leerMercado(v, 'doc');
  const col = leerMercado(v, 'col');
  if (ceros >= 2) {
    return { completa: true, faltan, ceros, aprobado: false, jugada: null, doc, col, motivo: `${ceros} ceros en la ventana (indeterminado)` };
  }
  if (v.slice(-RECENCIA).includes(0)) {
    return { completa: true, faltan, ceros, aprobado: false, jugada: null, doc, col, motivo: `cero en los últimos ${RECENCIA} giros (dispersión reciente)` };
  }
  let elegido: LecturaMercado | null = null;
  if (doc.ok && col.ok) {
    const ed = doc.conteo[doc.excluida];
    const ec = col.conteo[col.excluida];
    if (ed !== ec) elegido = ed < ec ? doc : col;
    else elegido = doc.fuerza >= col.fuerza - 1e-9 ? doc : col; // empate exacto → docenas
  } else if (doc.ok) elegido = doc;
  else if (col.ok) elegido = col;
  return {
    completa: true,
    faltan,
    ceros,
    aprobado: elegido !== null,
    jugada: elegido ? { mercado: elegido.mercado, zonas: elegido.zonas } : null,
    doc,
    col,
    motivo: elegido ? null : 'ningún mercado cumple las 5 reglas',
  };
}

// ── Estado del día ───────────────────────────────────────────────────────
export type Fase = 'VENTANA' | 'CICLO' | 'PAUSA' | 'CERRADO';
export type Resultado = 'A' | 'E' | 'N'; // el cero se registra como 'A' (acierto); 'N' = giro sin apuesta (transición)
export type Cierre = 'GANADO' | 'CORTE' | 'INDETERMINADO';
export type EstadoMesa = 'CONCENTRACION' | 'TRANSICION';

// ── Trazabilidad por giro (solo registro: no interviene en ninguna decisión) ──
export type MotivoGiro =
  | 'ACIERTO_SIGUE' // acertó (o cero): sigue con su par
  | 'LECTURA_SOSTIENE' // la lectura completa aprueba el mismo par
  | 'MERCADO_SOSTIENE' // su mercado aprueba el mismo par aunque el otro gane el desempate
  | 'VUELVE_MISMO_PAR' // salía de transición y su mismo par volvió a sostenerse
  | 'CONFIRMADO_NUEVO' // par nuevo aprobado 2 lecturas seguidas: cambia y apuesta
  | 'CANDIDATO_1_DE_2' // aparece otro par, falta confirmarlo: transición
  | 'SIN_LECTURA' // ningún mercado aprueba: transición
  | 'INDETERMINADO_7' // 7 giros seguidos sin apostar: cierra el ciclo
  | 'CIERRE_GANADO'
  | 'CIERRE_CORTE'
  | 'MOTOR_SIGUE' // voz del motor: mantiene su pick
  | 'MOTOR_CAMBIA'; // voz del motor: cambia de pick
export interface TrazaGiro {
  numero: number;
  estado: 'APUESTA' | 'TRANSICION'; // este giro se apostó o no
  resultado: 'ACIERTO' | 'CERO' | 'ERROR' | 'SIN_APUESTA';
  mercado: Mercado | null; // mercado apostado en este giro (null si no se apostó)
  parAnterior: string; // par vigente antes de la decisión de este giro
  parCandidato: string | null; // par en evaluación tras este giro, si existe
  parSiguiente: string; // lo que se apuesta en el próximo giro ('—' = no se apuesta o el ciclo cerró)
  motivo: MotivoGiro; // condición del código que se activó
  motivoLectura: string | null; // la regla que falló en la lectura de la ventana, si no aprobó
  racha: number; // errores seguidos apostados tras este giro
  quietos: number; // giros seguidos sin apostar tras este giro
}

export interface Config {
  topeReventones: number;
  mesa: string;
  crupier: string;
  llegada: number | null; // cómo llega el jugador, 1 a 5
}

export interface MotorSnap {
  doc: Jugada | null;
  col: Jugada | null;
  hud: number | null;
  ent: number | null;
}

export interface Marcador {
  aciertos: number;
  errores: number;
  racha: number;
  peor: number;
}

export interface Ciclo {
  id: number;
  voz: Voz;
  inicio: number; // timestamp ms
  fin: number | null;
  cierre: Cierre | null;
  ventana: number[]; // los 7 giros con los que se entró
  propuesta: Jugada | null; // lo que propuso la Regla B al entrar
  motorDoc: Jugada | null;
  motorCol: Jugada | null;
  hud: number | null;
  ent: number | null;
  mesa: string;
  crupier: string;
  llegada: number | null;
  jugada: Jugada; // lo que se está jugando ahora
  aciertos: number;
  racha: number;
  rachaMax: number;
  errores: number;
  numeros: number[];
  resultados: Resultado[];
  jugadas: string[]; // par jugado en cada giro (para ver los cambios)
  cambios: number;
  // Estado dinámico (opcionales: un ciclo guardado antes no los trae).
  apuesta?: boolean; // ¿se apuesta el PRÓXIMO giro? (false = transición)
  estadoMesa?: EstadoMesa;
  girosEnEstado?: number; // giros que lleva en el estado actual
  motivoEstado?: string; // por qué está en ese estado
  quietos?: number; // giros seguidos sin apostar
  candidato?: Jugada | null; // par nuevo que la mesa está aprobando
  confirmaciones?: number; // lecturas seguidas del candidato
  traza?: TrazaGiro[]; // un registro por giro del ciclo (solo lectura)
}

export interface Estado {
  version: 1;
  dia: string; // YYYY-MM-DD local
  config: Config;
  fase: Fase;
  ventana: number[]; // últimos giros de la ventana actual (máx. 7)
  pausaHasta: number | null;
  ciclo: Ciclo | null;
  ciclos: Ciclo[]; // cerrados hoy
  pendientes: Record<Voz, Jugada | null>; // lo que cada voz juega en el PRÓXIMO giro
  marcadores: Record<Voz, Marcador>;
  aviso: string | null;
  giros: number; // giros ingresados hoy
  siguienteId: number;
  // Disciplina de pausas (opcionales: un estado guardado antes no los trae).
  pausaRota?: boolean; // en la pausa actual entró algún giro
  pausasCumplidas?: number; // pausas que terminaron sin giros dentro
  pausasRotas?: number; // pausas en las que se siguió metiendo giros
}

const marcadorVacio = (): Marcador => ({ aciertos: 0, errores: 0, racha: 0, peor: 0 });

export function estadoInicial(dia: string, config?: Partial<Config>): Estado {
  return {
    version: 1,
    dia,
    config: {
      topeReventones: TOPE_REVENTONES_DEFECTO,
      mesa: '',
      crupier: '',
      llegada: null,
      ...(config ?? {}),
    },
    fase: 'VENTANA',
    ventana: [],
    pausaHasta: null,
    ciclo: null,
    ciclos: [],
    pendientes: { PROPUESTA: null, MOTOR_DOC: null, MOTOR_COL: null },
    marcadores: { PROPUESTA: marcadorVacio(), MOTOR_DOC: marcadorVacio(), MOTOR_COL: marcadorVacio() },
    aviso: 'Ingresa los últimos 7 giros de la mesa.',
    giros: 0,
    siguienteId: 1,
    pausaRota: false,
    pausasCumplidas: 0,
    pausasRotas: 0,
  };
}

export function reventonesHoy(e: Estado): number {
  return e.ciclos.filter((c) => c.cierre === 'CORTE').length;
}

/** Ciclos cerrados en la última hora (para ver el ritmo). */
export function ciclosUltimaHora(e: Estado, ahora: number): number {
  return e.ciclos.filter((c) => c.fin !== null && ahora - c.fin <= 3600_000).length;
}

/** Avanza el reloj: si la pausa terminó, vuelve a pedir 7 giros. */
export function tick(e: Estado, ahora: number): Estado {
  if (e.fase === 'PAUSA' && e.pausaHasta !== null && ahora >= e.pausaHasta) {
    return {
      ...e,
      fase: 'VENTANA',
      ventana: [],
      pausaHasta: null,
      pendientes: { ...e.pendientes, PROPUESTA: null },
      pausasCumplidas: (e.pausasCumplidas ?? 0) + (e.pausaRota ? 0 : 1),
      pausaRota: false,
      aviso: 'Pausa terminada. Ingresa los últimos 7 giros.',
    };
  }
  return e;
}

/** El jugador corta la pausa y empieza ya a leer 7 giros nuevos (la pausa queda como no cumplida). */
export function terminarPausa(e: Estado): Estado {
  if (e.fase !== 'PAUSA') return e;
  return {
    ...e,
    fase: 'VENTANA',
    ventana: [],
    pausaHasta: null,
    pendientes: { ...e.pendientes, PROPUESTA: null },
    pausasRotas: (e.pausasRotas ?? 0) + (e.pausaRota ? 0 : 1),
    pausaRota: false,
    aviso: 'Pausa cortada. Ingresa los últimos 7 giros.',
  };
}

/** ¿Se puede entrar ahora con esta voz? */
export function puedeEntrar(e: Estado, voz: Voz): boolean {
  if (e.fase !== 'VENTANA') return false;
  const l = leerVentana(e.ventana);
  return l.aprobado && e.pendientes[voz] !== null;
}

/** El jugador entra al ciclo con la voz elegida. */
export function entrar(e: Estado, voz: Voz, motor: MotorSnap, ahora: number): Estado {
  if (!puedeEntrar(e, voz)) return e;
  const l = leerVentana(e.ventana);
  const jugada = e.pendientes[voz]!;
  const ciclo: Ciclo = {
    id: e.siguienteId,
    voz,
    inicio: ahora,
    fin: null,
    cierre: null,
    ventana: e.ventana.slice(-VENTANA),
    propuesta: l.jugada,
    motorDoc: motor.doc,
    motorCol: motor.col,
    hud: motor.hud,
    ent: motor.ent,
    mesa: e.config.mesa,
    crupier: e.config.crupier,
    llegada: e.config.llegada,
    jugada,
    aciertos: 0,
    racha: 0,
    rachaMax: 0,
    errores: 0,
    numeros: [],
    resultados: [],
    jugadas: [],
    cambios: 0,
    apuesta: true,
    estadoMesa: 'CONCENTRACION',
    girosEnEstado: 0,
    motivoEstado: 'la mesa aprueba el par',
    quietos: 0,
    candidato: null,
    confirmaciones: 0,
  };
  return {
    ...e,
    fase: 'CICLO',
    ciclo,
    siguienteId: e.siguienteId + 1,
    aviso: `Dentro: ${textoJugada(jugada)}. Cierra en el 2º acierto o en el ${CORTE_ERRORES}º error seguido.`,
  };
}

function actualizarMarcador(m: Marcador, acierto: boolean): Marcador {
  if (acierto) return { ...m, aciertos: m.aciertos + 1, racha: 0 };
  const racha = m.racha + 1;
  return { ...m, errores: m.errores + 1, racha, peor: Math.max(m.peor, racha) };
}

/**
 * Registra un número que salió.
 * `motor` = picks del motor DESPUÉS de procesar este giro (valen para el siguiente).
 */
export function registrarGiro(e0: Estado, numero: number, motor: MotorSnap, ahora: number): Estado {
  if (!Number.isInteger(numero) || numero < 0 || numero > 36) return e0;
  let e = tick(e0, ahora);
  if (e.fase === 'CERRADO') return { ...e, aviso: 'Jornada cerrada. No se registran más giros hoy.' };
  if (e.fase === 'PAUSA') {
    // El giro no entra al ciclo; la pausa queda marcada como no cumplida (una sola vez).
    return {
      ...e,
      aviso: 'Estás en pausa: este giro no cuenta para el ciclo.',
      pausasRotas: (e.pausasRotas ?? 0) + (e.pausaRota ? 0 : 1),
      pausaRota: true,
    };
  }

  // 1) Marcador de cada voz con lo que tenía pendiente para ESTE giro.
  const marcadores = { ...e.marcadores };
  for (const v of VOCES) {
    const p = e.pendientes[v];
    if (p) marcadores[v] = actualizarMarcador(marcadores[v], esAcierto(p, numero));
  }

  // 2) Ventana deslizante.
  const ventana = [...e.ventana, numero].slice(-VENTANA);
  const lectura = leerVentana(ventana);
  let fase: Fase = e.fase;
  let ciclo = e.ciclo;
  let ciclos = e.ciclos;
  let pausaHasta = e.pausaHasta;
  let aviso: string | null = null;
  let ventanaFinal = ventana;

  // 3) Ciclo en curso.
  if (fase === 'CICLO' && ciclo) {
    const jugadaAntes = ciclo.jugada; // trazabilidad
    let motivoGiro: MotivoGiro = 'MOTOR_SIGUE'; // trazabilidad
    let candidatoGiro: Jugada | null = null; // trazabilidad
    let c: Ciclo;
    if (ciclo.apuesta === false) {
      // Giro de TRANSICIÓN: no se apostó; no suma acierto ni error.
      c = {
        ...ciclo,
        numeros: [...ciclo.numeros, numero],
        resultados: [...ciclo.resultados, 'N'],
        jugadas: [...ciclo.jugadas, '—'],
      };
    } else {
      const ok = esAcierto(ciclo.jugada, numero);
      const racha = ok ? 0 : ciclo.racha + 1;
      c = {
        ...ciclo,
        aciertos: ciclo.aciertos + (ok ? 1 : 0),
        errores: ciclo.errores + (ok ? 0 : 1),
        racha,
        rachaMax: Math.max(ciclo.rachaMax, racha),
        numeros: [...ciclo.numeros, numero],
        resultados: [...ciclo.resultados, ok ? 'A' : 'E'],
        jugadas: [...ciclo.jugadas, textoJugada(ciclo.jugada)],
      };
    }
    let cierre: Cierre | null = null;
    if (c.aciertos >= 2) cierre = 'GANADO';
    else if (c.racha >= CORTE_ERRORES) cierre = 'CORTE';
    else if (c.voz === 'PROPUESTA') {
      // ── Estado dinámico: ¿la mesa sostiene lo que juegas? ──
      const d = lectura.aprobado ? lectura.jugada : null;
      const antes = c.estadoMesa ?? 'CONCENTRACION';
      const acerto = ciclo.apuesta !== false && c.resultados[c.resultados.length - 1] === 'A';
      // Sostén por MERCADO: el mercado que juegas sigue aprobando tu mismo par (aunque el otro mercado gane el desempate).
      const lm = c.jugada.mercado === 'doc' ? lectura.doc : lectura.col;
      const ventanaLimpia = lectura.ceros < 2 && !ventana.slice(-RECENCIA).includes(0);
      const sostiene =
        (d !== null && mismaJugada(d, c.jugada)) ||
        (lm !== null && lm.ok && ventanaLimpia && lm.zonas[0] === c.jugada.zonas[0] && lm.zonas[1] === c.jugada.zonas[1]);
      if (acerto) {
        // Acierto (el cero también): sigues con tu par, nunca transición.
        motivoGiro = 'ACIERTO_SIGUE';
        c = { ...c, apuesta: true, estadoMesa: 'CONCENTRACION', motivoEstado: 'acertaste: sigues con tu par', quietos: 0, candidato: null, confirmaciones: 0 };
        aviso = `Acierto: sigues con ${textoJugada(c.jugada)}.`;
      } else if (sostiene) {
        motivoGiro = antes === 'TRANSICION' ? 'VUELVE_MISMO_PAR' : d !== null && mismaJugada(d, c.jugada) ? 'LECTURA_SOSTIENE' : 'MERCADO_SOSTIENE';
        c = { ...c, apuesta: true, estadoMesa: 'CONCENTRACION', motivoEstado: 'la mesa sostiene el par', quietos: 0, candidato: null, confirmaciones: 0 };
        aviso = antes === 'TRANSICION'
          ? `Confirmado: vuelve a jugar ${textoJugada(c.jugada)}.`
          : `Se mantiene: ${textoJugada(c.jugada)}.`;
      } else {
        let candidato: Jugada | null = null;
        let conf = 0;
        if (d) {
          conf = mismaJugada(d, c.candidato ?? null) ? (c.confirmaciones ?? 0) + 1 : 1;
          candidato = d;
        }
        if (d && conf >= CONFIRMAR_CAMBIO) {
          motivoGiro = 'CONFIRMADO_NUEVO';
          c = {
            ...c, jugada: d, cambios: c.cambios + 1, apuesta: true, estadoMesa: 'CONCENTRACION',
            motivoEstado: `${textoJugada(d)} confirmado ${CONFIRMAR_CAMBIO} lecturas seguidas`, quietos: 0, candidato: null, confirmaciones: 0,
          };
          aviso = `Confirmado: ahora ${textoJugada(d)}. Vuelve a jugar.`;
        } else {
          const quietos = (c.quietos ?? 0) + 1;
          const motivo = d
            ? `${textoJugada(d)} aparece, falta confirmarlo (${conf} de ${CONFIRMAR_CAMBIO})`
            : `la mesa no sostiene ${textoJugada(c.jugada)}: ${lectura.motivo ?? 'sin lectura clara'}`;
          c = { ...c, apuesta: false, estadoMesa: 'TRANSICION', motivoEstado: motivo, quietos, candidato, confirmaciones: conf };
          motivoGiro = d ? 'CANDIDATO_1_DE_2' : 'SIN_LECTURA';
          candidatoGiro = candidato;
          if (quietos >= MAX_QUIETOS) cierre = 'INDETERMINADO';
          else aviso = `Transición: no apuestes este giro. ${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.`;
        }
      }
      if (!cierre) c = { ...c, girosEnEstado: c.estadoMesa === antes ? (c.girosEnEstado ?? 0) + 1 : 1 };
    }

    // Trazabilidad: registra lo que el código ya decidió (no cambia nada del ciclo).
    const registrar = (cc: Ciclo, motivo: MotivoGiro, siguiente: Jugada | null): Ciclo => {
      const apostado = ciclo!.apuesta !== false;
      const res = cc.resultados[cc.resultados.length - 1];
      const t: TrazaGiro = {
        numero,
        estado: apostado ? 'APUESTA' : 'TRANSICION',
        resultado: !apostado ? 'SIN_APUESTA' : res === 'A' ? (numero === 0 ? 'CERO' : 'ACIERTO') : 'ERROR',
        mercado: apostado ? jugadaAntes.mercado : null,
        parAnterior: textoJugada(jugadaAntes),
        parCandidato: candidatoGiro ? textoJugada(candidatoGiro) : null,
        parSiguiente: siguiente ? textoJugada(siguiente) : '—',
        motivo,
        motivoLectura: lectura.aprobado ? null : lectura.motivo,
        racha: cc.racha,
        quietos: cc.quietos ?? 0,
      };
      return { ...cc, traza: [...(cc.traza ?? []), t] };
    };
    if (cierre) {
      const motivoCierre: MotivoGiro = cierre === 'GANADO' ? 'CIERRE_GANADO' : cierre === 'CORTE' ? 'CIERRE_CORTE' : 'INDETERMINADO_7';
      c = registrar(c, motivoCierre, null);
      c = { ...c, cierre, fin: ahora };
      ciclos = [...ciclos, c];
      ciclo = null;
      const rev = ciclos.filter((x) => x.cierre === 'CORTE').length;
      ventanaFinal = [];
      if (cierre === 'CORTE' && rev >= e.config.topeReventones) {
        fase = 'CERRADO';
        pausaHasta = null;
        aviso = `Reventón ${rev} de ${e.config.topeReventones}. Jornada cerrada.`;
      } else {
        fase = 'PAUSA';
        pausaHasta = ahora + PAUSA_MS;
        aviso = cierre === 'GANADO'
          ? `Ciclo ganado (${c.errores} error${c.errores === 1 ? '' : 'es'}). Pausa de 4 minutos.`
          : cierre === 'INDETERMINADO'
            ? `Mesa indeterminada ${MAX_QUIETOS} giros seguidos: cierro el ciclo (no es reventón). Pausa de 4 minutos.`
            : `Corte en el ${CORTE_ERRORES}º error. Pausa de 4 minutos.`;
      }
    } else {
      // Sigue el ciclo. La Propuesta ya se actualizó arriba (estado dinámico);
      // las voces del motor siguen su pick giro a giro.
      let nueva: Jugada = c.jugada;
      if (c.voz !== 'PROPUESTA') {
        const m = c.voz === 'MOTOR_DOC' ? motor.doc : motor.col;
        if (m && !mismaJugada(m, c.jugada)) {
          nueva = m;
          aviso = `El motor cambió → ahora ${textoJugada(nueva)}.`;
        } else {
          aviso = `Se mantiene: ${textoJugada(c.jugada)}.`;
        }
      }
      if (c.voz !== 'PROPUESTA') motivoGiro = mismaJugada(nueva, c.jugada) ? 'MOTOR_SIGUE' : 'MOTOR_CAMBIA';
      if (!mismaJugada(nueva, c.jugada)) c = { ...c, jugada: nueva, cambios: c.cambios + 1 };
      c = registrar(c, motivoGiro, c.voz === 'PROPUESTA' && c.apuesta === false ? null : c.jugada);
      ciclo = c;
    }
  } else if (fase === 'VENTANA') {
    aviso = lectura.completa
      ? lectura.aprobado
        ? `APROBADO: ${textoJugada(lectura.jugada)}. Puedes entrar.`
        : `No aprobado: ${lectura.motivo}. Ingresa el siguiente giro.`
      : `Ventana: ${ventana.length}/${VENTANA}.`;
  }

  // 4) Lo que cada voz juega en el PRÓXIMO giro.
  const lecturaFinal = fase === 'VENTANA' || fase === 'CICLO' ? leerVentana(ventanaFinal) : null;
  const pendientes: Record<Voz, Jugada | null> = {
    PROPUESTA:
      fase === 'CICLO' && ciclo && ciclo.voz === 'PROPUESTA'
        ? ciclo.apuesta === false ? null : ciclo.jugada
        : lecturaFinal && lecturaFinal.aprobado ? lecturaFinal.jugada : null,
    MOTOR_DOC: motor.doc,
    MOTOR_COL: motor.col,
  };

  return {
    ...e,
    fase,
    ventana: ventanaFinal,
    pausaHasta,
    ciclo,
    ciclos,
    pendientes,
    marcadores,
    aviso,
    giros: e.giros + 1,
  };
}

/** Actualiza los picks del motor sin registrar giro (cuando llegan tarde del servidor). */
export function actualizarMotor(e: Estado, motor: MotorSnap): Estado {
  return { ...e, pendientes: { ...e.pendientes, MOTOR_DOC: motor.doc, MOTOR_COL: motor.col } };
}

export function cambiarConfig(e: Estado, cfg: Partial<Config>): Estado {
  return { ...e, config: { ...e.config, ...cfg } };
}

// ── Registro para descargar (CSV, separador ;) ───────────────────────────
const NOMBRE_VOZ: Record<Voz, string> = { PROPUESTA: 'Propuesta', MOTOR_DOC: 'Motor docenas', MOTOR_COL: 'Motor columnas' };
export function nombreVoz(v: Voz): string {
  return NOMBRE_VOZ[v];
}

function hora(ts: number | null): string {
  if (ts === null) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function csvCiclos(e: Estado): string {
  const cab = [
    'dia', 'ciclo', 'inicio', 'fin', 'voz', 'mesa', 'crupier', 'llegada', 'ventana', 'propuesta', 'motor_doc', 'motor_col',
    'hud', 'entropia', 'jugada_inicial', 'jugadas', 'numeros', 'resultados', 'errores', 'racha_max', 'cambios', 'cierre',
    'giros_sin_apuesta',
    // Trazabilidad por giro: una lista por columna, alineada con 'numeros' (separador |).
    'traza_estado', 'traza_resultado', 'traza_mercado', 'traza_par_anterior', 'traza_par_candidato',
    'traza_par_siguiente', 'traza_motivo', 'traza_motivo_lectura', 'traza_racha', 'traza_quietos',
  ];
  const lista = (c: Ciclo, f: (t: TrazaGiro) => string | number | null) => (c.traza ?? []).map((t) => String(f(t) ?? '—')).join(' | ');
  const filas = e.ciclos.map((c) => [
    e.dia, c.id, hora(c.inicio), hora(c.fin), NOMBRE_VOZ[c.voz], c.mesa, c.crupier, c.llegada ?? '',
    c.ventana.join(' '), textoJugada(c.propuesta), textoJugada(c.motorDoc), textoJugada(c.motorCol),
    c.hud ?? '', c.ent ?? '', c.jugadas[0] ?? '', c.jugadas.join(' | '), c.numeros.join(' '), c.resultados.join(''),
    c.errores, c.rachaMax, c.cambios, c.cierre ?? '',
    c.resultados.filter((r) => r === 'N').length,
    lista(c, (t) => t.estado), lista(c, (t) => t.resultado), lista(c, (t) => (t.mercado === 'doc' ? 'Docenas' : t.mercado === 'col' ? 'Columnas' : null)),
    lista(c, (t) => t.parAnterior), lista(c, (t) => t.parCandidato), lista(c, (t) => t.parSiguiente), lista(c, (t) => t.motivo),
    lista(c, (t) => t.motivoLectura), lista(c, (t) => t.racha), lista(c, (t) => t.quietos),
  ].map((x) => String(x).replace(/;/g, ',')).join(';'));
  return '﻿' + [cab.join(';'), ...filas].join('\n');
}
