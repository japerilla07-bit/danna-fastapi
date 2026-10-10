// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Store de telemetría (v7: resolución DIFERIDA del pick)
// ════════════════════════════════════════════════════════════════════════
//
// CÓMO SE CUENTA EL ACIERTO (igual que el SessionRecorder → coincide con la
// matriz, que salió de esos CSV):
//   • El acierto NO viene del contador del API (solo se mueve en BET → fallaba).
//   • El pick TOP-2 ("13-24 / 1-12", "Columna 3 / Columna 2") se convierte al
//     conjunto de números que cubre y se compara con el número que salió.
//   • ALINEACIÓN: el pick del giro N es la sugerencia PARA el giro N+1, así que
//     se evalúa contra el spin del giro N+1. Por eso el resultado llega un giro
//     tarde: el store guarda el giro como "pendiente" y lo resuelve cuando
//     entra el número siguiente. Toma CADA sugerencia como apuesta.
//
// El registro (aciertos/errores/racha) se imputa a la celda HUD×ENT del giro
// en que se hizo la sugerencia (el pendiente), no a la del giro que lo resuelve.
//
// Tres capas de conteo, todas de la SESIÓN (se resetean con reset):
//   1) GLOBAL por mercado — aciertos, errores, racha viva y racha máx.
//   2) POR CELDA — cada celda visitada con sus aciertos/errores/racha máx
//      (racha pausada: otra celda no la toca; solo un acierto en la misma
//      celda la reinicia).
//   3) La celda ACTUAL sale del último giro (aún sin resolver).
// ════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { classifyZone, cellKeyOf, fusedZone, currentCellWr, currentCellMaxRun, type Zone, type Market } from '@/domain/zoneMatrix';
import { decidirPiloto, registrarGiroCobertura, resetCobertura, type MarketRead, type DecisionPiloto, type Decision, type EscudoInfo } from '@/domain/copilot';
import { calorInicial, avanzarCalor, type CalorEstado } from '@/domain/calor';

// ────────────────────────────────────────────────────────────────────────
// Resolución de pick (copiado 1:1 del SessionRecorder)
// ────────────────────────────────────────────────────────────────────────

/** Convierte un pick de texto en el conjunto de números que cubre. */
function numerosDe(pick: string): number[] {
  const out = new Set<number>();
  const t = (pick || '').toLowerCase();
  if (/\b1\s*-\s*12\b/.test(t))  for (let n = 1;  n <= 12; n++) out.add(n);
  if (/\b13\s*-\s*24\b/.test(t)) for (let n = 13; n <= 24; n++) out.add(n);
  if (/\b25\s*-\s*36\b/.test(t)) for (let n = 25; n <= 36; n++) out.add(n);
  for (const m of t.matchAll(/col(?:umna)?\s*([123])/g)) {
    const c = Number(m[1]);
    for (let n = 1; n <= 36; n++) if (n % 3 === c % 3) out.add(n);
  }
  return [...out];
}

/** true=acierto, false=error, null=sin pick evaluable. */
function resolvePick(pick: string, spin: number): boolean | null {
  const nums = numerosDe(pick);
  if (nums.length === 0) return null;
  return nums.includes(spin);
}

// ────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────

export interface TelemetrySpin {
  n: number;
  hud: number | null;
  ent: number | null;
  docHit: boolean | null;   // resultado del pick DOC resuelto en este giro
  colHit: boolean | null;   // resultado del pick COL resuelto en este giro
  ts: number;
}

/** Lo que manda el AppPage por giro: estado + pick + número que salió. */
export interface IngestPayload {
  n: number;
  hud: number | null;
  ent: number | null;
  spin: number | null;   // número que salió en ESTE giro (resuelve el pendiente)
  docPick: string;
  colPick: string;
}

/** Giro cuya sugerencia aún no se resolvió (se resuelve con el spin siguiente). */
interface Pending {
  n: number;
  hud: number | null;
  ent: number | null;
  docPick: string;
  colPick: string;
  copSug: 'doc' | 'col' | null;  // qué mercado sugirió el copiloto en este giro (null = esperar/parar)
  // Presentes SOLO cuando la COBERTURA DOBLE (oct 2026, ver copilot.ts) está
  // jugando — el texto de las 2+2 zonas que de verdad se están cubriendo,
  // para puntuar el copiloto contra ESO en vez del pick de mercado único
  // del backend. null en cualquier otro caso (Capa 1 normal).
  copPickDocOverride: string | null;
  copPickColOverride: string | null;
  // ── SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) — ver nota junto a capa1Score/
  //    escudoScore más abajo. Guardan lo que CADA capa sugirió este giro
  //    por su cuenta, para puntuarlas por separado cuando llegue el spin
  //    siguiente — exactamente el mismo patrón que copSug/copPick*Override,
  //    pero sin mezclar una capa con la otra.
  capa1Sug: 'doc' | 'col' | null;
  escudoPickDoc: string | null;
  escudoPickCol: string | null;
}

export interface CellRec {
  hits: number;
  misses: number;
  streak: number;
  maxStreak: number;
}

interface Counters {
  docHits: number; docMisses: number; colHits: number; colMisses: number;
  docStreak: number; docMaxStreak: number; colStreak: number; colMaxStreak: number;
}

// Marcador propio del COPILOTO: aciertos/errores/racha de lo que D.A.N.N.A. sugiere.
interface CopScore {
  hits: number; misses: number; streak: number; maxStreak: number;
}

type CellReg = { doc: Record<string, CellRec>; col: Record<string, CellRec> };

interface TelemetryState {
  history: TelemetrySpin[];
  lastN: number;
  pending: Pending | null;
  counters: Counters;
  cellReg: CellReg;
  copScore: CopScore;
  // FRECUENCIA DE RACHAS EN VIVO (oct 2026) — pedido de Gunner: "que me diga
  // el copiloto / el motor / el escudo viene cometiendo un error cada X giros,
  // dos errores seguidos cada tanto". Por cada marcador (real = copScore,
  // Capa 1 sola, Escudo 1 solo) se guardan las rachas de errores YA CERRADAS:
  // índice = largo de la racha (1..9), el 10 junta 10 o más; el 0 no se usa.
  // "Cada X giros" = giros puntuados de ese marcador ÷ veces que pasó esa
  // racha. Solo lectura: no alimenta ninguna decisión.
  // CALOR RECIENTE (domain/calor.ts): estado del detector de calor/fin de
  // sesgo y del tanteador "¿volvió en ≤3 giros?". Solo lectura: ninguna
  // decisión lo usa.
  calor: CalorEstado;
  copRachas: number[];
  capa1Rachas: number[];
  escudoRachas: number[];
  // "EN QUÉ GIRO VOY" (oct 2026) — pedido de Gunner: si dice "2 seguidos cada
  // 19 giros", saber cuántos giros lleva desde la última vez. Misma forma que
  // los de arriba (índice = largo de la racha, 10 = "10 o más"), pero guarda
  // el N° de giro PUNTUADO de ese marcador en que ocurrió la última racha de
  // ese largo (su último error). 0 = nunca hoy. Solo lectura.
  copRachasUlt: number[];
  capa1RachasUlt: number[];
  escudoRachasUlt: number[];
  // ── SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) ──────────────────────────────
  // Pedido de Gunner: ver la efectividad de la Capa 1 sola y de Escudo 1
  // (COBERTURA) solo, cada uno contra lo que DE VERDAD habría apostado,
  // sin que uno tape al otro cuando los dos coinciden en el mismo giro.
  // copScore (arriba) sigue siendo el marcador real — lo que D.A.N.N.A.
  // efectivamente jugó y que ya alimenta el freno de racha — SIN TOCAR.
  // Estos dos son marcadores PARALELOS, de solo lectura, para comparar.
  capa1Score: CopScore;
  escudoScore: CopScore;
  // FIX (oct 2026) — ver nota completa junto a computeMarketRead() más abajo.
  // La decisión del piloto (Capa1+2) que se usa TANTO para puntuar como para
  // mostrar en pantalla (CopilotOrder la lee de acá en vez de recalcularla).
  liveDecision: DecisionPiloto;
  ingest: (p: IngestPayload) => void;
  reset: () => void;
}

// Cap alto: una sesión son ~500 giros. Con 2000 el history NUNCA se recorta
// durante una sesión, así el marcador del copiloto (peor racha incluida) se
// calcula sobre TODOS los giros y nunca "baja mágicamente" por perder los viejos.
// El reset limpia todo al empezar una mesa nueva.
export const HISTORY_CAP = 2000;

const EMPTY_COUNTERS: Counters = {
  docHits: 0, docMisses: 0, colHits: 0, colMisses: 0,
  docStreak: 0, docMaxStreak: 0, colStreak: 0, colMaxStreak: 0,
};

// ────────────────────────────────────────────────────────────────────────
// FIX (oct 2026) — BUG REAL encontrado por Gunner, reproducido en vivo:
// "el copiloto sugiere algo pero sus contadores están mal... no está
// siguiendo la sugerencia principal". Causa de fondo (no era un bug de
// datos, era de TIMING): la decisión visual del copiloto (CopilotOrder, en
// MatrixPanel.tsx) se calculaba con useMarketRead(), que lee el `history`
// del store — y ese history TODAVÍA NO incluye el giro que acaba de llegar
// en el momento en que CopilotOrder renderiza (el ingest() de ESE giro
// corre en un useEffect de AppPage.tsx, que se ejecuta DESPUÉS de que este
// render ya pintó la pantalla). Mientras tanto, docPick/colPick (el texto
// que se manda a ingest()) SÍ salen frescos del bet_advice del backend en
// ESE MISMO render. Resultado: la decisión que se guardaba en el pendiente
// (vía un ref que escribía CopilotOrder) podía ser la de "un giro atrás" —
// un mercado/zona distinto del que realmente se mostró en pantalla para el
// giro que se estaba puntuando. Con suerte no se notaba (la sugerencia no
// cambia todo el tiempo); en pruebas manuales rápidas, donde sí cambia
// seguido, el desalineamiento se ve clarísimo (exactamente lo que Gunner
// reprodujo).
//
// Fix: la decisión (Capa1+2) se recalcula ACÁ, dentro de ingest(), justo
// después de actualizar el history con el giro que acaba de llegar — con
// la MISMA fórmula exacta que usaba useMarketRead() (ver computeMarketRead
// debajo), pero ya sin depender de en qué momento renderiza un componente.
// Pasa a ser la ÚNICA fuente: se guarda en el pendiente (para puntuar) Y en
// el store como `liveDecision` (para mostrar — CopilotOrder ahora LEE este
// valor en vez de recalcularlo con sus propios hooks). Lo que se ve en
// pantalla y lo que se cuenta son, literalmente, el mismo dato calculado
// una sola vez.
// ────────────────────────────────────────────────────────────────────────
function computeMarketRead(history: TelemetrySpin[], cellReg: CellReg, mkt: Market): MarketRead {
  const last = history[history.length - 1];
  const hud = last ? last.hud : null;
  const ent = last ? last.ent : null;
  const key = cellKeyOf(hud, ent);
  const live = key ? (cellReg[mkt][key] ?? null) : null;
  const ventana = ventanaResuelta(history, mkt, 10);
  let termoStreak = 0;
  for (const r of ventana) { if (!r) termoStreak++; else break; }
  return {
    mkt,
    estado: fusedZone(hud, ent, mkt, live),
    cellWr: currentCellWr(hud, ent, mkt),
    termoHits: ventana.filter((x) => x).length,
    termoTotal: ventana.length,
    termoStreak,
    liveStreak: live?.streak ?? 0,
    cellCeiling: currentCellMaxRun(hud, ent, mkt),
  };
}

// Decisión inicial (sin giros todavía) — misma fórmula, historial vacío.
// Así liveDecision nunca es null/undefined (CopilotOrder no necesita un
// caso especial para el primer render).
function decisionInicial(): DecisionPiloto {
  const vacio: CellReg = { doc: {}, col: {} };
  const doc = computeMarketRead([], vacio, 'doc');
  const col = computeMarketRead([], vacio, 'col');
  return decidirPiloto(doc, col);
}

function bumpCell(reg: Record<string, CellRec>, key: string, hit: boolean): Record<string, CellRec> {
  const prev = reg[key] ?? { hits: 0, misses: 0, streak: 0, maxStreak: 0 };
  let { hits, misses, streak, maxStreak } = prev;
  if (hit) { hits += 1; streak = 0; }
  else { misses += 1; streak += 1; if (streak > maxStreak) maxStreak = streak; }
  return { ...reg, [key]: { hits, misses, streak, maxStreak } };
}

// ────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────
//
// FIX (oct 2026) — el mecanismo viejo (copSugRef/copPickDocRef/copPickColRef,
// refs a nivel módulo que CopilotOrder escribía en su propio render) se dio
// de baja: era la causa del desalineamiento de timing descrito arriba, junto
// a computeMarketRead(). La decisión ahora se calcula adentro de ingest()
// (ver más abajo) y se guarda en `liveDecision`, que es lo único que lee
// CopilotOrder para mostrar en pantalla.

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  history: [],
  lastN: -1,
  pending: null,
  counters: { ...EMPTY_COUNTERS },
  cellReg: { doc: {}, col: {} },
  copScore: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
  calor: calorInicial(),
  copRachas: new Array(11).fill(0),
  capa1Rachas: new Array(11).fill(0),
  escudoRachas: new Array(11).fill(0),
  copRachasUlt: new Array(11).fill(0),
  capa1RachasUlt: new Array(11).fill(0),
  escudoRachasUlt: new Array(11).fill(0),
  capa1Score: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
  escudoScore: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
  liveDecision: decisionInicial(),

  ingest: (p) => {
    const st = get();
    if (p.n === st.lastN) return;                              // mismo giro (re-render)
    if (p.n < st.lastN && st.history.length > 0) return;       // giro viejo

    let counters = st.counters;
    let cellReg = st.cellReg;
    let copScore = st.copScore;
    let copRachas = st.copRachas;
    let capa1Rachas = st.capa1Rachas;
    const calor = (p.spin !== null && Number.isFinite(p.spin))
      ? avanzarCalor(st.calor, Number(p.spin))
      : st.calor;
    let escudoRachas = st.escudoRachas;
    let copRachasUlt = st.copRachasUlt;
    let capa1RachasUlt = st.capa1RachasUlt;
    let escudoRachasUlt = st.escudoRachasUlt;
    let capa1Score = st.capa1Score;
    let escudoScore = st.escudoScore;
    let histResuelto = st.history;   // history con el resultado del pendiente ya escrito

    // ── 1) Resolver el PENDIENTE (giro anterior) con el número de ESTE giro ──
    const pend = st.pending;
    if (pend && p.spin !== null && Number.isFinite(p.spin)) {
      const spin = Number(p.spin);
      const docHit = resolvePick(pend.docPick, spin);
      const colHit = resolvePick(pend.colPick, spin);
      const key = cellKeyOf(pend.hud, pend.ent);

      // ── Marcador del COPILOTO (lo que D.A.N.N.A. REALMENTE sugirió este
      //    giro) — normalmente se resuelve contra copSug (el mercado que
      //    eligió la Capa 1), usando docHit/colHit (el mismo pick de
      //    BACKEND de arriba, que también alimenta counters/cellReg más
      //    abajo). Cuando la COBERTURA DOBLE (oct 2026, ver copilot.ts)
      //    está jugando, pend.copPickDocOverride/colOverride traen el texto
      //    de las 2+2 zonas reales — se resuelve contra ESO en vez del pick
      //    de mercado único, y cuentan las DOS fichas (docenas y columnas).
      const copHitDoc: boolean | null = pend.copPickDocOverride
        ? resolvePick(pend.copPickDocOverride, spin)
        : (pend.copSug === 'doc' ? docHit : null);
      const copHitCol: boolean | null = pend.copPickColOverride
        ? resolvePick(pend.copPickColOverride, spin)
        : (pend.copSug === 'col' ? colHit : null);

      // FIX (oct 2026) — reauditado a pedido de Gunner. Antes esto armaba un
      // array [copHitDoc, copHitCol] y sumaba cada resultado no-null como un
      // evento SEPARADO, en orden fijo (doc primero, col después). Fuera de
      // COBERTURA DOBLE nunca hay dos no-null a la vez, así que no se notaba.
      // Con COBERTURA DOBLE activa, los dos SIEMPRE son no-null (docena y
      // columna se juegan juntas) — y un giro MIXTO (ganó un lado, perdió el
      // otro) quedaba en racha=0 o racha=1 según cuál de los dos se procesara
      // último: un artefacto del orden del código, no un hecho real de la
      // mesa (los dos resultados pasan en el MISMO giro, no uno tras otro).
      //
      // Fix: un giro = UN solo evento para este marcador, en los dos modos.
      // Acierto = ganó AL MENOS un lado (si hay dos jugándose); error =
      // perdieron los dos. Así "racha de errores seguidos" sigue significando
      // "giros seguidos", igual que antes de que existiera la cobertura doble
      // y que el freno de la sección 3.1 del manual (pensado en giros, no en
      // fichas sueltas) — un giro mixto (un lado ganó) corta la racha, no la
      // deja en el aire.
      const copHit: boolean | null =
        copHitDoc !== null && copHitCol !== null ? (copHitDoc || copHitCol) : (copHitDoc ?? copHitCol);

      if (copHit !== null) {
        const cs = { ...st.copScore };
        if (copHit) { cs.hits += 1; cs.streak = 0; }
        else { cs.misses += 1; cs.streak += 1; if (cs.streak > cs.maxStreak) cs.maxStreak = cs.streak; }
        copScore = cs;
        // Una racha de errores se CIERRA cuando llega un acierto: ahí se anota
        // su largo (la racha que venía viva en st.copScore, antes de este giro).
        if (copHit && st.copScore.streak > 0) {
          copRachas = [...copRachas];
          copRachas[Math.min(st.copScore.streak, 10)] += 1;
          // la racha terminó en el giro anterior (su último error): ese es el giro anotado
          copRachasUlt = [...copRachasUlt];
          copRachasUlt[Math.min(st.copScore.streak, 10)] = cs.hits + cs.misses - 1;
        }
      }

      // ── SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) — dos marcadores PARALELOS,
      //    cada uno puntuado contra lo que ESA capa sola habría sugerido,
      //    sin mezclarse con la otra ni con el marcador real de arriba. ──
      //
      // Capa 1 sola: un solo mercado, igual que copSug de siempre.
      const capa1Hit: boolean | null =
        pend.capa1Sug === 'doc' ? docHit : pend.capa1Sug === 'col' ? colHit : null;
      if (capa1Hit !== null) {
        const cs = { ...st.capa1Score };
        if (capa1Hit) { cs.hits += 1; cs.streak = 0; }
        else { cs.misses += 1; cs.streak += 1; if (cs.streak > cs.maxStreak) cs.maxStreak = cs.streak; }
        capa1Score = cs;
        if (capa1Hit && st.capa1Score.streak > 0) {
          capa1Rachas = [...capa1Rachas];
          capa1Rachas[Math.min(st.capa1Score.streak, 10)] += 1;
          capa1RachasUlt = [...capa1RachasUlt];
          capa1RachasUlt[Math.min(st.capa1Score.streak, 10)] = cs.hits + cs.misses - 1;
        }
      }
      // Escudo 1 solo: un giro = un evento. En COBERTURA DOBLE ya llega aquí
      // SOLO el lado `principal` (ver pending, abajo), así que escudoHitDoc o
      // escudoHitCol es null y el acierto es el de ese único mercado.
      const escudoHitDoc: boolean | null = pend.escudoPickDoc ? resolvePick(pend.escudoPickDoc, spin) : null;
      const escudoHitCol: boolean | null = pend.escudoPickCol ? resolvePick(pend.escudoPickCol, spin) : null;
      const escudoHit: boolean | null =
        escudoHitDoc !== null && escudoHitCol !== null ? (escudoHitDoc || escudoHitCol) : (escudoHitDoc ?? escudoHitCol);
      if (escudoHit !== null) {
        const cs = { ...st.escudoScore };
        if (escudoHit) { cs.hits += 1; cs.streak = 0; }
        else { cs.misses += 1; cs.streak += 1; if (cs.streak > cs.maxStreak) cs.maxStreak = cs.streak; }
        escudoScore = cs;
        if (escudoHit && st.escudoScore.streak > 0) {
          escudoRachas = [...escudoRachas];
          escudoRachas[Math.min(st.escudoScore.streak, 10)] += 1;
          escudoRachasUlt = [...escudoRachasUlt];
          escudoRachasUlt[Math.min(st.escudoScore.streak, 10)] = cs.hits + cs.misses - 1;
        }
      }

      // ── Alimentar la ventana de COBERTURA DOBLE con el número real de
      //    este giro — independiente de si se jugó o no, de si acertó o
      //    no. Exactamente una vez por giro real resuelto. ──
      registrarGiroCobertura(spin);

      if (docHit !== null || colHit !== null) {
        const c = { ...counters };
        if (docHit === true)  { c.docHits += 1; c.docStreak = 0; }
        else if (docHit === false) { c.docMisses += 1; c.docStreak += 1; if (c.docStreak > c.docMaxStreak) c.docMaxStreak = c.docStreak; }
        if (colHit === true)  { c.colHits += 1; c.colStreak = 0; }
        else if (colHit === false) { c.colMisses += 1; c.colStreak += 1; if (c.colStreak > c.colMaxStreak) c.colMaxStreak = c.colStreak; }
        counters = c;

        if (key) {
          let doc = cellReg.doc, col = cellReg.col;
          if (docHit !== null) doc = bumpCell(doc, key, docHit);
          if (colHit !== null) col = bumpCell(col, key, colHit);
          if (doc !== cellReg.doc || col !== cellReg.col) cellReg = { doc, col };
        }

        // Escribir el resultado en la fila del PENDIENTE (última del history)
        if (st.history.length > 0) {
          const last = st.history[st.history.length - 1];
          const actualizada: TelemetrySpin = { ...last, docHit, colHit };
          histResuelto = [...st.history.slice(0, -1), actualizada];
        }
      }
    }

    // ── 2) Registrar ESTE giro en history (aún sin resolver → docHit/colHit null) ──
    const spinRow: TelemetrySpin = { n: p.n, hud: p.hud, ent: p.ent, docHit: null, colHit: null, ts: Date.now() };
    const history = histResuelto.length >= HISTORY_CAP
      ? [...histResuelto.slice(1), spinRow]
      : [...histResuelto, spinRow];

    // ── 3) Recalcular la decisión del PILOTO con el history YA actualizado
    //    (incluye el giro que acaba de llegar) — ver nota FIX (oct 2026)
    //    junto a computeMarketRead(), más arriba. Esto reemplaza al viejo
    //    copSugRef/copPickDocRef/copPickColRef: ya no depende de en qué
    //    momento renderizó CopilotOrder, así que no puede desalinearse.
    const docRead = computeMarketRead(history, cellReg, 'doc');
    const colRead = computeMarketRead(history, cellReg, 'col');
    const liveDecision = decidirPiloto(docRead, colRead);

    // ── 4) ESTE giro pasa a ser el nuevo pendiente (con lo que el PILOTO
    //    recién decidió, recalculado arriba — no lo que mostraba un render
    //    viejo) ──
    //
    // FIX (oct 2026) — pedido de Gunner en vivo: contar COBERTURA_DOBLE como
    // un acierto si ganaba CUALQUIERA de los dos mercados (docenas O
    // columnas) era "maquillaje" — inflaba el marcador sin decir la verdad
    // de ninguno de los dos lados en particular. Ahora, cuando la cobertura
    // es DOBLE, el conteo (aciertos/errores/racha — lo que alimenta el
    // freno) sigue SOLO al mercado `principal` (el de mejor rendimiento,
    // mismo criterio que ya calcula decidirPiloto en copilot.ts); el otro
    // lado NO se marca como override, así que no se puntúa — igual que ya
    // pasa en COBERTURA_DOC/COBERTURA_COL, que son de un solo mercado desde
    // siempre. Las DOS zonas se siguen jugando igual (pickDoc/pickCol siguen
    // ahí para mostrar en pantalla); lo único que cambia es a cuál de las
    // dos le hace caso el marcador.
    const suprimirDoc = liveDecision.capa === 'COBERTURA_DOBLE' && liveDecision.principal === 'col';
    const suprimirCol = liveDecision.capa === 'COBERTURA_DOBLE' && liveDecision.principal === 'doc';
    const pending: Pending = {
      n: p.n, hud: p.hud, ent: p.ent, docPick: p.docPick, colPick: p.colPick,
      copSug: liveDecision.mercado,
      copPickDocOverride: suprimirDoc ? null : (liveDecision.pickDoc ?? null),
      copPickColOverride: suprimirCol ? null : (liveDecision.pickCol ?? null),
      // SEPARACIÓN CAPA1/ESCUDO1: lo que CADA capa sugiere por su cuenta,
      // leído de los campos nuevos que ya trae liveDecision (ver copilot.ts).
      //
      // FIX (oct 2026) — auditado con 56 sesiones: el marcador del Escudo
      // contaba la COBERTURA_DOBLE como acierto si ganaba CUALQUIERA de los
      // dos lados (docenas O columnas), o sea 4 zonas a la vez. Gunner juega
      // UN solo mercado por giro (el de la ▲ PRIORIDAD), así que ese marcador
      // no mostraba errores que él sí vivía: en cobertura doble, el 60% de los
      // errores de las Unidas (1.898 de 3.140) salían como acierto del Escudo.
      // Ahora, en COBERTURA_DOBLE, el Escudo puntúa SOLO el mercado `principal`
      // — la misma condición suprimirDoc/suprimirCol del marcador real de
      // arriba. En COBERTURA_DOC / COBERTURA_COL (un solo mercado) no cambia
      // nada. Las zonas que se muestran en pantalla salen de liveDecision.escudo
      // y tampoco cambian: esto solo decide qué lado se puntúa.
      capa1Sug: liveDecision.capa1Decision.mercado,
      escudoPickDoc: liveDecision.escudo.doc && !suprimirDoc ? liveDecision.escudo.doc.zonas.join(' / ') : null,
      escudoPickCol: liveDecision.escudo.col && !suprimirCol ? liveDecision.escudo.col.zonas.join(' / ') : null,
    };

    set({ history, lastN: p.n, pending, counters, cellReg, copScore, calor, copRachas, capa1Rachas, escudoRachas, copRachasUlt, capa1RachasUlt, escudoRachasUlt, capa1Score, escudoScore, liveDecision });
  },

  reset: () => {
    resetCobertura(); // limpia la ventana y apaga la cobertura doble —
                       // ANTES de recalcular decisionInicial(), que la lee.
    set({
      history: [], lastN: -1, pending: null,
      counters: { ...EMPTY_COUNTERS },
      cellReg: { doc: {}, col: {} },
      copScore: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
      calor: calorInicial(),
      copRachas: new Array(11).fill(0),
      capa1Rachas: new Array(11).fill(0),
      escudoRachas: new Array(11).fill(0),
      copRachasUlt: new Array(11).fill(0),
      capa1RachasUlt: new Array(11).fill(0),
      escudoRachasUlt: new Array(11).fill(0),
      capa1Score: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
      escudoScore: { hits: 0, misses: 0, streak: 0, maxStreak: 0 },
      liveDecision: decisionInicial(),
    });
  },
}));

// ════════════════════════════════════════════════════════════════════════
// SELECTORES
// ════════════════════════════════════════════════════════════════════════

export const useLastHud = (): number | null =>
  useTelemetryStore((s) => { const l = s.history[s.history.length - 1]; return l ? l.hud : null; });
export const useLastEnt = (): number | null =>
  useTelemetryStore((s) => { const l = s.history[s.history.length - 1]; return l ? l.ent : null; });

export const useCurrentZone = (mkt: Market): Zone =>
  useTelemetryStore((s) => {
    const l = s.history[s.history.length - 1];
    if (!l) return 'NEUTRA';
    return classifyZone(l.hud, l.ent, mkt);
  });

export const useMarketHits = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docHits : s.counters.colHits);
export const useMarketMisses = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docMisses : s.counters.colMisses);
export const useMarketMaxStreak = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docMaxStreak : s.counters.colMaxStreak);
export const useMarketStreak = (mkt: Market): number =>
  useTelemetryStore((s) => mkt === 'doc' ? s.counters.docStreak : s.counters.colStreak);
export const useMarketWr = (mkt: Market): number | null =>
  useTelemetryStore((s) => {
    const h = mkt === 'doc' ? s.counters.docHits : s.counters.colHits;
    const m = mkt === 'doc' ? s.counters.docMisses : s.counters.colMisses;
    const t = h + m;
    return t > 0 ? (h / t) * 100 : null;
  });

export const useCellReg = (mkt: Market): Record<string, CellRec> =>
  useTelemetryStore((s) => s.cellReg[mkt]);
export const useCellRec = (mkt: Market, key: string | null): CellRec | null =>
  useTelemetryStore((s) => (key ? (s.cellReg[mkt][key] ?? null) : null));

export const useIngestSpin = () => useTelemetryStore((s) => s.ingest);
export const useResetTelemetry = () => useTelemetryStore((s) => s.reset);

// History completo (para recalcular el marcador del copiloto sin depender de timing).
export const useHistory = (): TelemetrySpin[] => useTelemetryStore((s) => s.history);

// ── Decisión del PILOTO (Capa1+2) — ÚNICA fuente, para mostrar Y para
//    puntuar (ver FIX (oct 2026) junto a computeMarketRead() más arriba).
//    CopilotOrder (MatrixPanel.tsx) la lee de acá en vez de recalcularla. ──
export const useLiveDecision = (): DecisionPiloto => useTelemetryStore((s) => s.liveDecision);

// ── Marcador del COPILOTO (lo que sugiere D.A.N.N.A.) ──
export const useCopHits = (): number => useTelemetryStore((s) => s.copScore.hits);
export const useCopMisses = (): number => useTelemetryStore((s) => s.copScore.misses);
export const useCopStreak = (): number => useTelemetryStore((s) => s.copScore.maxStreak);
// FIX (oct 2026) — faltaba exponer la racha VIVA (copScore.streak): solo
// existía useCopStreak(), que a pesar del nombre devuelve maxStreak (la
// peor racha histórica de la sesión), no la racha actual. CopilotScoreboard
// (MatrixPanel.tsx) necesitaba "RACHA AHORA" y, al no tener este selector,
// terminó recalculándolo a mano recorriendo todo el history. copScore YA se
// mantiene correcto en vivo (ver ingest(), más arriba) — solo faltaba este
// selector para leerlo.
export const useCopLiveStreak = (): number => useTelemetryStore((s) => s.copScore.streak);
// Rachas de errores cerradas de hoy, por marcador (índice = largo, 9 = "9 o más"):
// real (copRachas), Capa 1 sola y Escudo 1 solo.
export const useCopRachas = (): number[] => useTelemetryStore((s) => s.copRachas);
export const useCalor = (): CalorEstado => useTelemetryStore((s) => s.calor);
export const useCapa1Rachas = (): number[] => useTelemetryStore((s) => s.capa1Rachas);
export const useEscudoRachas = (): number[] => useTelemetryStore((s) => s.escudoRachas);
// Giro puntuado (de ese marcador) en que pasó por última vez cada largo de racha.
export const useCopRachasUlt = (): number[] => useTelemetryStore((s) => s.copRachasUlt);
export const useCapa1RachasUlt = (): number[] => useTelemetryStore((s) => s.capa1RachasUlt);
export const useEscudoRachasUlt = (): number[] => useTelemetryStore((s) => s.escudoRachasUlt);
export const useCopWr = (): number | null => useTelemetryStore((s) => {
  const t = s.copScore.hits + s.copScore.misses;
  return t > 0 ? (s.copScore.hits / t) * 100 : null;
});

// ── SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) ──────────────────────────────────
// Dos marcadores paralelos al de arriba, cada uno contra lo que ESA capa
// sola habría jugado — para comparar efectividad individual sin que una
// tape a la otra. No reemplazan copScore (el marcador real) en ningún lado.

// Capa 1 (el copiloto solo, sin COBERTURA encima)
export const useCapa1Hits = (): number => useTelemetryStore((s) => s.capa1Score.hits);
export const useCapa1Misses = (): number => useTelemetryStore((s) => s.capa1Score.misses);
export const useCapa1Streak = (): number => useTelemetryStore((s) => s.capa1Score.maxStreak);
export const useCapa1LiveStreak = (): number => useTelemetryStore((s) => s.capa1Score.streak);
export const useCapa1Wr = (): number | null => useTelemetryStore((s) => {
  const t = s.capa1Score.hits + s.capa1Score.misses;
  return t > 0 ? (s.capa1Score.hits / t) * 100 : null;
});
// Sugerencia de la Capa 1 sola, exista o no COBERTURA activa encima.
export const useLiveCapa1 = (): Decision => useTelemetryStore((s) => s.liveDecision.capa1Decision);

// Escudo 1 (COBERTURA solo)
export const useEscudoHits = (): number => useTelemetryStore((s) => s.escudoScore.hits);
export const useEscudoMisses = (): number => useTelemetryStore((s) => s.escudoScore.misses);
export const useEscudoStreak = (): number => useTelemetryStore((s) => s.escudoScore.maxStreak);
export const useEscudoLiveStreak = (): number => useTelemetryStore((s) => s.escudoScore.streak);
export const useEscudoWr = (): number | null => useTelemetryStore((s) => {
  const t = s.escudoScore.hits + s.escudoScore.misses;
  return t > 0 ? (s.escudoScore.hits / t) * 100 : null;
});
// Estado de Escudo 1 solo: activo o no, y en qué zonas.
export const useLiveEscudo = (): EscudoInfo => useTelemetryStore((s) => s.liveDecision.escudo);

// ── Termómetro en vivo: cómo venís en los últimos N giros de un mercado ──
// IMPORTANTE: cada selector devuelve un NÚMERO (primitiva), no un objeto.
// Devolver un objeto nuevo aquí causaría un loop infinito de re-render en zustand.
function ventanaResuelta(history: TelemetrySpin[], mkt: Market, ventana: number): boolean[] {
  const res: boolean[] = [];
  for (let i = history.length - 1; i >= 0 && res.length < ventana; i--) {
    const h = mkt === 'doc' ? history[i].docHit : history[i].colHit;
    if (h !== null && h !== undefined) res.push(h);
  }
  return res; // más reciente primero
}
export function useTermoHits(mkt: Market, ventana = 10): number {
  return useTelemetryStore((s) => ventanaResuelta(s.history, mkt, ventana).filter((x) => x).length);
}
export function useTermoTotal(mkt: Market, ventana = 10): number {
  return useTelemetryStore((s) => ventanaResuelta(s.history, mkt, ventana).length);
}
export function useTermoStreak(mkt: Market, ventana = 10): number {
  return useTelemetryStore((s) => {
    const res = ventanaResuelta(s.history, mkt, ventana);
    let n = 0;
    for (const r of res) { if (!r) n++; else break; }
    return n;
  });
}

if (typeof window !== 'undefined') {
  (window as any).__telemetry = useTelemetryStore;
}
