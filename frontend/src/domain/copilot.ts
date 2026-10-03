// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — COPILOTO: motor de decisión de entrada segura
// ════════════════════════════════════════════════════════════════════════
//
// FILOSOFÍA (no negociable): el sistema NO predice ni persigue win-rate.
// Su trabajo es proteger el bankroll eligiendo BIEN los tiempos de entrada
// para no quedar expuesto en las rachas peligrosas.
//
// Cruza tres señales reales (comprobadas con datos):
//   1. Estado FUSIONADO de la celda (historial + sesión) por mercado.
//   2. Termómetro en vivo (cómo viene la mesa AHORA, últimos giros).
//   3. Racha viva de la celda vs su techo histórico (peligro inminente).
//
// De eso sale UNA decisión clara: mercado, entrar/esperar, y cuánto exponer.
// No es una bola de cristal: es un copiloto que evita los momentos malos.
// ════════════════════════════════════════════════════════════════════════

import type { Zone, Market } from '@/domain/zoneMatrix';

export type Accion = 'ENTRAR' | 'SUAVE' | 'ESPERAR' | 'PARAR';
export type Exposicion = 'NORMAL' | 'REDUCIDA' | 'MÍNIMA' | 'CERO';

export interface MarketRead {
  mkt: Market;
  estado: Zone;              // estado fusionado (historial + hoy)
  cellWr: number | null;     // % histórico de la celda
  termoHits: number;         // aciertos en la ventana
  termoTotal: number;        // giros resueltos en la ventana
  termoStreak: number;       // errores seguidos ahora en la ventana
  liveStreak: number;        // racha viva en la celda actual
  cellCeiling: number | null;// techo histórico de racha de la celda
}

export interface Decision {
  mercado: Market | null;    // a qué mercado ir (null = ninguno)
  accion: Accion;
  exposicion: Exposicion;
  titulo: string;            // línea principal, clara
  motivo: string;            // por qué, en una frase
  nivel: 'ok' | 'precaucion' | 'alto';  // color semáforo
}

// ── Puntaje de seguridad de un mercado (más alto = más seguro para entrar) ──
// NO mide "va a acertar". Mide "qué tan protegido estás de una racha si entrás".
// Exportada (oct 2026) para que COBERTURA DOBLE pueda marcar cuál de los dos
// mercados tiene mejor rendimiento ahora mismo — ver decidirPiloto() abajo.
export function seguridad(m: MarketRead): number {
  let s = 0;
  // 1. Estado de la celda (lo más importante para evitar rachas)
  const estadoScore: Record<Zone, number> = {
    SANTUARIO: 40, VERDE: 28, PROBE: 10, TOXICA: -20, AGUJERO: -40, NEUTRA: 5,
  };
  s += estadoScore[m.estado];

  // 2. Termómetro en vivo — cómo viene la mesa AHORA (sin la racha, ver punto 3)
  if (m.termoTotal >= 3) {
    const ratio = m.termoHits / m.termoTotal;
    if (ratio >= 0.7) s += 28;         // venís bien
    else if (ratio >= 0.5) s += 11;    // parejo
    else s -= 21;                       // mesa dura ahora
  }

  // 3. Racha viva de la celda — penaliza venir perdiendo AHORA, una sola vez.
  //    Corrección: antes se penalizaba dos veces (termoStreak + racha de celda,
  //    construidas de los mismos giros) y además contra el "techo histórico", que
  //    NO predice el peligro futuro (la ruleta es independiente). Ahora se usa solo
  //    la racha viva real de la celda, que es un hecho del presente.
  if (m.liveStreak >= 3) s -= 25;
  else if (m.liveStreak === 2) s -= 12;
  return s;
}

// Memoria de la secuencia de apuestas: en qué mercado jugó el copiloto la ÚLTIMA
// vez que de verdad entró (NO se actualiza en PARAR/ESPERAR, solo cuando se juega).
// Sirve solo para la regla de "evitar refugio" de abajo.
let ultimoMercadoJugado: Market | null = null;

// Reiniciar al empezar una sesión nueva — AGREGADO oct 2026 al correr la
// validación histórica (ver abajo): hacía falta una forma de poner en cero
// la memoria de "evitar refugio" entre sesiones simuladas, y no existía.
// HALLAZGO: telemetryStore.ts (reset(), botón "RESET MAPA") llama a
// resetCobertura() pero NUNCA llamaba esto — la memoria de "evitar refugio"
// podía arrastrarse de una mesa a la siguiente en la app real. No se tocó
// telemetryStore.ts todavía (no estaba pedido); queda señalado para decidir.
export function resetUltimoMercado(): void {
  ultimoMercadoJugado = null;
}

// ────────────────────────────────────────────────────────────────────────
// decidirConEstado — BUG REAL encontrado y corregido (sep 2026)
// ────────────────────────────────────────────────────────────────────────
//
// Gunner reportó: "hay un error en el contador del escudo, un acierto lo
// cuenta como error y cuando tiene un error lo marca como dos".
//
// Causa: decidir() (como estaba antes) mutaba ultimoMercadoJugado — una
// variable de MÓDULO, compartida — inline, dentro de la misma función que
// además se usa para dos cosas muy distintas:
//   1. La decisión EN VIVO del giro actual (vía decidirPiloto, llamada
//      desde CopilotOrder en cada render — no una vez por giro real, sino
//      una vez por cada re-render de React).
//   2. El marcador del escudo (CopilotScoreboard, en MatrixPanel.tsx), que
//      recalcula TODA la sesión desde el giro 1 cada vez que llega un giro
//      nuevo, llamando a decidir() una vez por cada fila del historial.
//
// Las dos comparten la MISMA variable ultimoMercadoJugado, y ninguna la
// reseteaba a null antes de arrancar. Consecuencia: cada vez que el
// marcador recalculaba el historial completo, el giro 1 de ESE replay no
// arrancaba con "nada jugado todavía" (que es lo correcto — es el inicio
// de la sesión), sino con lo que hubiera quedado de la decisión en vivo o
// del replay anterior. Eso podía hacer que la regla "evitar refugio"
// evaluara un giro histórico contra el mercado equivocado, y el resultado
// de ESE giro (acierto/error) se le atribuía al mercado que no era — un
// acierto de columnas podía contarse como error de docenas, y como el
// replay entero se repite en cada giro nuevo, un mismo error podía quedar
// contado más de una vez entre una pasada y la siguiente. Ya estaba
// marcado como sospecha sin confirmar en la auditoría de código de
// ago/sep 2026 ("podría desalinear unos pocos giros entre el marcador y
// la decisión real"); quedó confirmado con este síntoma real.
//
// Fix: se saca TODA la lógica de decisión a esta función PURA, que recibe
// el "último mercado jugado" como parámetro y devuelve el valor
// actualizado junto con la Decision, en vez de leer/mutar una variable
// compartida. decidir() (abajo) es ahora un wrapper delgado sobre esta
// función para el camino EN VIVO — mismo comportamiento exacto de
// siempre, ni un número de la lógica cambió. El marcador (MatrixPanel.tsx,
// CopilotScoreboard) usa decidirConEstado() directo con SU PROPIA variable
// local, que arranca en null en cada recálculo — así el replay nunca pisa
// la memoria de la decisión en vivo, y da el mismo resultado sin importar
// cuántas veces se vuelva a correr.
export function decidirConEstado(
  doc: MarketRead,
  col: MarketRead,
  ultimoJugado: Market | null
): { decision: Decision; ultimoJugado: Market | null } {
  const sDoc = seguridad(doc);
  const sCol = seguridad(col);
  // Empate: en vez de favorecer siempre docenas, desempata por el mejor WR de celda.
  const docGana = sDoc > sCol || (sDoc === sCol && (doc.cellWr ?? 0) >= (col.cellWr ?? 0));
  const mejor = docGana ? doc : col;
  const mejorS = Math.max(sDoc, sCol);
  const nombre = (mkt: Market) => (mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS');

  // ── PARAR: los dos mercados peligrosos a la vez ──
  if (sDoc < -10 && sCol < -10) {
    return {
      ultimoJugado,
      decision: {
        mercado: null, accion: 'PARAR', exposicion: 'CERO',
        titulo: '✋ ESPERÁ — mesa brava',
        motivo: 'Las dos zonas vienen mal ahora. No es momento de exponer bankroll.',
        nivel: 'alto',
      },
    };
  }

  // ── No hay ningún mercado REALMENTE bueno → esperar (no entrar en "el menos malo") ──
  //    Umbral subido de 10 a 25: entrar solo cuando hay una opción sólida, no la
  //    menos mala de dos flojas. Medido: esas entradas rendían 59% y a veces caían
  //    dentro de rachas; evitarlas corta rachas de 4/6/7 sin perder WR ni volumen.
  if (mejorS < 25) {
    return {
      ultimoJugado,
      decision: {
        mercado: null, accion: 'ESPERAR', exposicion: 'CERO',
        titulo: '⏸ ESPERÁ una mejor',
        motivo: `Ni ${nombre('doc')} ni ${nombre('col')} están en zona sólida. No entres en la menos mala.`,
        nivel: 'precaucion',
      },
    };
  }

  // ── Hay un mercado jugable: graduar la exposición según seguridad ──
  const m = mejor;
  const otro = m.mkt === 'doc' ? col : doc;
  const rota = Math.abs(sDoc - sCol) > 15;

  // EVITAR REFUGIO: si veníamos jugando el OTRO mercado y viene con 2+ errores
  // seguidos, y el copiloto ahora quiere saltar acá, no perseguir el cambio en
  // caliente — esperar un giro. Comprobado sobre 28 sesiones: no baja el techo
  // (las tormentas raras de verdad pasan igual, sigue en 6), pero SÍ baja la
  // racha promedio por sesión — le gana al azar el 78% de las veces, de las
  // mejores cifras que dio cualquier ajuste en todo el proyecto.
  if (ultimoJugado !== null && m.mkt !== ultimoJugado) {
    const venia = ultimoJugado === 'doc' ? doc : col;
    if (venia.termoStreak >= 2) {
      return {
        // No se actualiza ultimoJugado acá: no jugamos, la memoria de la
        // apuesta anterior sigue vigente para el próximo giro.
        ultimoJugado,
        decision: {
          mercado: null, accion: 'ESPERAR', exposicion: 'CERO',
          titulo: '⏸ ESPERÁ — no persigas el cambio',
          motivo: `Venís perdiendo en ${nombre(ultimoJugado)} y el copiloto salta a ${nombre(m.mkt)}. Dejá pasar este giro.`,
          nivel: 'precaucion',
        },
      };
    }
  }

  let accion: Accion, exposicion: Exposicion, nivel: Decision['nivel'];
  if (mejorS >= 45) { accion = 'ENTRAR'; exposicion = 'NORMAL'; nivel = 'ok'; }
  else if (mejorS >= 28) { accion = 'ENTRAR'; exposicion = 'REDUCIDA'; nivel = 'ok'; }
  else { accion = 'SUAVE'; exposicion = 'MÍNIMA'; nivel = 'precaucion'; }

  // Si venís con 2+ errores en esta celda, bajá la mano (racha viva, no techo histórico).
  if (m.liveStreak >= 2) { exposicion = 'MÍNIMA'; nivel = 'precaucion'; }

  const motivoRotacion = rota ? ` (mejor que ${nombre(otro.mkt)} ahora)` : '';
  const expoTxt: Record<Exposicion, string> = {
    NORMAL: 'Progresión normal.', REDUCIDA: 'Progresión suave.',
    MÍNIMA: 'Ficha mínima, sin escalar.', CERO: '',
  };

  return {
    ultimoJugado: m.mkt, // memoria actualizada SOLO ahora que de verdad jugamos
    decision: {
      mercado: m.mkt, accion, exposicion,
      titulo: `▸ ${nombre(m.mkt)} · ${accion === 'ENTRAR' ? 'ENTRÁ' : 'ENTRÁ SUAVE'}`,
      motivo: `Zona ${m.estado.toLowerCase()}${motivoRotacion}. ${expoTxt[exposicion]}`,
      nivel,
    },
  };
}

// ── Decisión final cruzando los dos mercados — camino EN VIVO. ──
// Wrapper delgado sobre decidirConEstado(): lee/actualiza la memoria
// compartida ultimoMercadoJugado para que cualquier código que ya llama
// decidir(doc, col) (ej. decidirPiloto, más abajo) siga funcionando
// exactamente igual que siempre — el comportamiento y la lógica NO
// cambiaron, solo se movió a una función pura reutilizable. Para un
// reproductor histórico (que recalcula muchos giros seguidos y necesita
// su PROPIA memoria, aislada de la decisión en vivo) usar
// decidirConEstado() directo, no esta función — ver nota arriba.
export function decidir(doc: MarketRead, col: MarketRead): Decision {
  const { decision, ultimoJugado } = decidirConEstado(doc, col, ultimoMercadoJugado);
  ultimoMercadoJugado = ultimoJugado;
  return decision;
}

// ════════════════════════════════════════════════════════════════════════
// decidirPiloto — decisión final que ve el operador.
// ════════════════════════════════════════════════════════════════════════
//
// REMOVIDO (oct 2026) — hasta acá esto cruzaba la Capa 1 (seguridad()/
// decidir(), arriba) con una Capa 2: un "escudo" reactivo que se prendía
// solo tras el primer error real de una racha, elegía categoría/zonas de
// los últimos 7 giros reales (con escalón a modo híbrido en el giro 5) y
// apagaba solo al acertar. Gunner lo probó varias sesiones en vivo y lo dio
// de baja: "el escudo numero 2... no sirve". Se sacó por completo —
// ventana de 7 giros, cálculo de temperatura por zona, modo híbrido,
// detección de inestabilidad, y registrarGiroReal()/resetEscudo()/
// estadoEscudo() (las tres funciones que llevaban su estado). La Capa 1
// (decidir(), arriba) vuelve a ser la única fuente de la decisión — ni
// telemetryStore.ts ni ningún componente le pasan ya giros reales a este
// archivo para alimentar nada.
//
// decidirPiloto() se mantiene como el punto de entrada que ya usa
// telemetryStore.ts (ingest(), vía computeMarketRead()), para no tener que
// tocar ese cableado — ahora es un wrapper delgado 1:1 sobre decidir().
export interface DecisionPiloto extends Decision {
  capa: 'CAPA1' | 'COBERTURA_DOC' | 'COBERTURA_COL' | 'COBERTURA_DOBLE';
  // Solo presente el lado que está cubierto — ver sección de abajo.
  pickDoc?: string;
  pickCol?: string;
  // Solo presente con capa === 'COBERTURA_DOBLE': de los dos mercados que se
  // están cubriendo a la vez, cuál tiene mejor rendimiento AHORA (mismo
  // puntaje seguridad() que usa la Capa 1 para elegir mercado) — pedido de
  // Gunner en vivo ("marcar la de mejor rendimiento entre docenas y
  // columnas"), para saber cuál priorizar si solo puede entrar a una.
  principal?: Market;
  // ── SEPARACIÓN CAPA1 / ESCUDO1 (oct 2026) ──────────────────────────────
  // Pedido de Gunner: ver la sugerencia y la efectividad de cada capa por
  // su cuenta, sin que una tape a la otra cuando COBERTURA está activa.
  // Esto NO cambia qué se juega ni cómo se puntúa la plata real — sigue
  // siendo exactamente lo de siempre (mercado/accion/exposicion/capa/
  // pickDoc/pickCol/principal, arriba). Son dos campos de SOLO LECTURA,
  // agregados encima, con datos que esta función ya calculaba por dentro
  // (capa1 se calcula siempre, aunque después la tape COBERTURA) o que ya
  // vivían en el estado del módulo de COBERTURA (coberturaDocActiva, etc.)
  // y no se exponían hacia afuera.
  //
  // capa1Decision: lo que la Capa 1 SOLA habría sugerido este giro, exista
  // o no COBERTURA activa encima.
  capa1Decision: Decision;
  // escudo: estado de COBERTURA (Escudo 1) por su cuenta — activo o no, y
  // en cuáles mercados/zonas, exista o no algo jugable en la Capa 1.
  escudo: EscudoInfo;
}

export interface EscudoInfo {
  activo: boolean;
  doc: { zonas: string[]; excluida: string } | null;
  col: { zonas: string[]; excluida: string } | null;
}

// ════════════════════════════════════════════════════════════════════════
// COBERTURA — activación por distribución marcada, POR MERCADO (oct 2026)
// ════════════════════════════════════════════════════════════════════════
//
// Pedido original de Gunner, el mismo día que se sacó el escudo de Capa 2
// (arriba), tras llegar a una racha de 10 errores sin ningún techo: "algo
// que podemos hacer del 1 es que se active también cuando ve más claridad en
// 2 docenas dominantes y dos columnas dominantes y se mantenga si no se mete
// la otra que está peleando".
//
// CORREGIDO EN CALIENTE (mismo día, mesa en vivo): la primera versión solo
// activaba cuando docenas Y columnas estaban marcadas A LA VEZ (lectura
// literal del pedido original). Gunner la vio no activarse en mesa y
// corrigió: "no pedí eso... dije que se debe activar cuando hay una
// dominancia clara de docenas O columnas... no porque la cobertura no es
// doble". Ahora cada mercado se evalúa y se activa POR SU CUENTA: puede
// cubrir solo docenas, solo columnas, o las dos a la vez si coinciden (ahí
// sí son las 4 fichas de antes). "Doble" quedó como nombre de variable
// nada más, no como condición de entrada.
//
// "Distribución marcada" — regla elegida (no validada todavía contra data
// histórica, a diferencia del escudo que se sacó; mirar cómo se comporta
// en mesa antes de confiarle plata en serio):
//   En la ventana de COBERTURA_WINDOW giros reales, de las 3 zonas de UN
//   mercado, la diferencia entre la más frecuente y la menos frecuente
//   (gap = top1 − top3) tiene que ser ≥ COBERTURA_GAP_MIN. Con ventana 7:
//   4-2-1 → gap 3 (activa), 2-2-1 → gap 1 (no activa), 3-3-1 → gap 2 (activa)
//   — ejemplos que dio Gunner. Si en la mesa se siente mal (activa muy poco /
//   con patrones flojos), el ajuste es este número, nada más.
//
// Una vez un mercado está activo, se queda cubriendo esas mismas 2 zonas —
// no se recalcula giro a giro, eso es "se mantenga" — hasta que SALGA (ver
// abajo). El otro mercado se evalúa totalmente aparte: puede estar cubierto,
// esperando, o ninguno de los dos — las cuatro combinaciones son válidas.
//
// SALIDA — CORREGIDO EN CALIENTE #2 (mesa en vivo, sesión real con CSV de
// evidencia). La primera versión de salida solo miraba si la zona EXCLUIDA
// subía o volvía con fuerza — y se quedó pegada cubriendo un par que ya no
// era el correcto, porque nunca revisaba si una de las dos zonas CUBIERTAS
// se había vuelto la más débil. Caso real (columna, ventana de 7): cuando
// activó cubría C1+C2 (excluía C3). Varios giros después la ventana real
// era C1=1 / C2=4 / C3=2 — es decir, C1 ya era la más débil y lo correcto
// era cubrir C2+C3 — pero como C3 (la excluida original) nunca subió ni
// volvió con fuerza, la cobertura se quedó mal: cubriendo C1+C2 cuando las
// fuertes eran C2 y C3. Eso es exactamente lo que Gunner reportó con
// pantallas y el CSV de la sesión.
//
// Arreglo: en vez de rastrear solo el movimiento de la zona excluida, en
// CADA giro (mientras el mercado está activo) se vuelve a calcular
// distribucionMarcada() sobre la ventana REAL actual — el mismo cálculo que
// se usa para activar — y se compara el par top2 resultante contra el par
// que está cubierto ahora mismo:
//   - Si ya no hay distribución marcada (el gap cayó bajo el mínimo) → se
//     apaga esa cobertura, sin más.
//   - Si sigue habiendo distribución marcada pero el par top2 CAMBIÓ (ya no
//     son las mismas 2 zonas) → se apaga la cobertura vieja y, en el mismo
//     giro, se prende la nueva (el par y la excluida que diga la ventana
//     ahora). Esto cubre los dos casos que pedía Gunner: la excluida que
//     vuelve con fuerza (ahora entra al top2 y desplaza a la que se debilitó)
//     Y el caso nuevo que no estaba cubierto (una de las cubiertas se volvió
//     la débil).
//   - Si el par top2 es el mismo de siempre → sigue activa, sin tocar nada.
// Esto reemplaza por completo las reglas viejas de "subió ≥2" / "volvió 2 de
// 3" — ya no hacen falta: distribucionMarcada() aplicada giro a giro hace lo
// mismo pero sin el punto ciego.
// ════════════════════════════════════════════════════════════════════════

const COBERTURA_WINDOW = 7;
const COBERTURA_GAP_MIN = 2; // top1 − top3 ≥ esto, en la ventana, para considerar la distribución "marcada"

type ZonaDoc = 'd1' | 'd2' | 'd3';
type ZonaCol = 'c1' | 'c2' | 'c3';
const ZONA_DOC_TXT: Record<ZonaDoc, string> = { d1: '1-12', d2: '13-24', d3: '25-36' };
const ZONA_COL_TXT: Record<ZonaCol, string> = { c1: 'Columna 1', c2: 'Columna 2', c3: 'Columna 3' };

function docenaDeNumero(n: number): ZonaDoc | null {
  if (n === 0) return null;
  if (n <= 12) return 'd1';
  if (n <= 24) return 'd2';
  return 'd3';
}
function columnaDeNumero(n: number): ZonaCol | null {
  if (n === 0) return null;
  const m = n % 3;
  if (m === 1) return 'c1';
  if (m === 2) return 'c2';
  return 'c3';
}

function conteoPorZona<T extends string>(ventana: number[], de: (n: number) => T | null, zonas: readonly T[]): Map<T, number> {
  const m = new Map<T, number>(zonas.map((z) => [z, 0] as [T, number]));
  for (const n of ventana) {
    const z = de(n);
    if (z) m.set(z, (m.get(z) ?? 0) + 1);
  }
  return m;
}

function distribucionMarcada<T extends string>(conteo: Map<T, number>): { marcada: boolean; top2: T[]; excluida: T } {
  const ordenado = Array.from(conteo.entries()).sort((a, b) => b[1] - a[1]);
  const gap = ordenado[0][1] - ordenado[2][1];
  return { marcada: gap >= COBERTURA_GAP_MIN, top2: [ordenado[0][0], ordenado[1][0]], excluida: ordenado[2][0] };
}

// Estado propio de esta regla (separado de ultimoMercadoJugado de la Capa 1).
// Ventana compartida (son los mismos giros reales); activación/salida de
// cada mercado es 100% independiente de la del otro.
let coberturaVentana: number[] = [];

let coberturaDocActiva = false;
let coberturaZonasDoc: ZonaDoc[] = [];
let coberturaDocExcluida: ZonaDoc | null = null;

let coberturaColActiva = false;
let coberturaZonasCol: ZonaCol[] = [];
let coberturaColExcluida: ZonaCol | null = null;

// top2 de distribucionMarcada() viene ordenado por conteo, no por nombre de
// zona — para comparar "es el mismo par de antes" hay que ordenar por zona.
function mismoPar<T extends string>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((z, i) => z === sb[i]);
}

// ── Llamar UNA vez por cada giro real (el número que salió), apenas se
//    sabe — independiente de si la Capa 1 jugó o no ese giro. Alimenta la
//    ventana y, para CADA mercado por separado, prende su cobertura cuando
//    corresponde o la apaga cuando hay un cambio significativo (ver arriba). ──
export function registrarGiroCobertura(numero: number): void {
  coberturaVentana.push(numero);
  if (coberturaVentana.length > COBERTURA_WINDOW) coberturaVentana.shift();

  // ── DOCENAS ──
  if (coberturaDocActiva) {
    const conteoDoc = conteoPorZona(coberturaVentana, docenaDeNumero, ['d1', 'd2', 'd3'] as const);
    const d = distribucionMarcada(conteoDoc);
    if (!d.marcada) {
      // Ya no hay distribución marcada en la ventana real → se apaga.
      coberturaDocActiva = false; coberturaZonasDoc = []; coberturaDocExcluida = null;
    } else if (!mismoPar(d.top2, coberturaZonasDoc)) {
      // Sigue marcada, pero el par top2 real CAMBIÓ (una cubierta se debilitó
      // y/o la excluida volvió con fuerza) → se apaga la vieja y se prende
      // la nueva ya mismo, con el par y la excluida que diga la ventana ahora.
      coberturaZonasDoc = d.top2;
      coberturaDocExcluida = d.excluida;
    }
    // si sigue marcada y el par es el mismo, no se toca nada.
  } else if (coberturaVentana.length >= COBERTURA_WINDOW) {
    const conteoDoc = conteoPorZona(coberturaVentana, docenaDeNumero, ['d1', 'd2', 'd3'] as const);
    const d = distribucionMarcada(conteoDoc);
    if (d.marcada) {
      coberturaDocActiva = true;
      coberturaZonasDoc = d.top2;
      coberturaDocExcluida = d.excluida;
    }
  }

  // ── COLUMNAS (mismo patrón, totalmente aparte) ──
  if (coberturaColActiva) {
    const conteoCol = conteoPorZona(coberturaVentana, columnaDeNumero, ['c1', 'c2', 'c3'] as const);
    const c = distribucionMarcada(conteoCol);
    if (!c.marcada) {
      coberturaColActiva = false; coberturaZonasCol = []; coberturaColExcluida = null;
    } else if (!mismoPar(c.top2, coberturaZonasCol)) {
      coberturaZonasCol = c.top2;
      coberturaColExcluida = c.excluida;
    }
  } else if (coberturaVentana.length >= COBERTURA_WINDOW) {
    const conteoCol = conteoPorZona(coberturaVentana, columnaDeNumero, ['c1', 'c2', 'c3'] as const);
    const c = distribucionMarcada(conteoCol);
    if (c.marcada) {
      coberturaColActiva = true;
      coberturaZonasCol = c.top2;
      coberturaColExcluida = c.excluida;
    }
  }
}

// ── Reiniciar al empezar una sesión nueva. ──
export function resetCobertura(): void {
  coberturaVentana = [];
  coberturaDocActiva = false;
  coberturaZonasDoc = [];
  coberturaDocExcluida = null;
  coberturaColActiva = false;
  coberturaZonasCol = [];
  coberturaColExcluida = null;
}

// Estado de Escudo 1 (COBERTURA), leído tal cual está en este instante —
// no decide nada, solo expone lo que ya vive en las variables de módulo de
// arriba para que decidirPiloto() lo pueda mostrar por separado de la Capa 1.
function leerEscudo(): EscudoInfo {
  return {
    activo: coberturaDocActiva || coberturaColActiva,
    doc: coberturaDocActiva
      ? { zonas: coberturaZonasDoc.map((z) => ZONA_DOC_TXT[z]), excluida: ZONA_DOC_TXT[coberturaDocExcluida!] }
      : null,
    col: coberturaColActiva
      ? { zonas: coberturaZonasCol.map((z) => ZONA_COL_TXT[z]), excluida: ZONA_COL_TXT[coberturaColExcluida!] }
      : null,
  };
}

export function decidirPiloto(doc: MarketRead, col: MarketRead): DecisionPiloto {
  const capa1 = decidir(doc, col);
  const escudo = leerEscudo();
  if (!coberturaDocActiva && !coberturaColActiva) return { ...capa1, capa: 'CAPA1', capa1Decision: capa1, escudo };

  const docTxt = coberturaDocActiva ? coberturaZonasDoc.map((z) => ZONA_DOC_TXT[z]).join(' / ') : undefined;
  const colTxt = coberturaColActiva ? coberturaZonasCol.map((z) => ZONA_COL_TXT[z]).join(' / ') : undefined;

  let capa: DecisionPiloto['capa'];
  let titulo: string;
  let motivo: string;
  let principal: Market | undefined;
  if (coberturaDocActiva && coberturaColActiva) {
    capa = 'COBERTURA_DOBLE';
    // Mejor rendimiento AHORA entre los dos — mismo puntaje que decide la
    // Capa 1 (seguridad()), mismo desempate (WR de celda). Pedido de Gunner
    // en vivo: "va a marcar la de mejor rendimiento entre docenas y
    // columnas" — las dos se siguen cubriendo (4 fichas), esto es solo para
    // saber cuál priorizar si tenés que elegir una.
    const sDoc = seguridad(doc);
    const sCol = seguridad(col);
    principal = sDoc > sCol || (sDoc === sCol && (doc.cellWr ?? 0) >= (col.cellWr ?? 0)) ? 'doc' : 'col';
    // El aviso de cuál priorizar NO va metido en esta frase — Gunner en vivo:
    // "ese aviso no sirve, toca que diga solo y que se note". Pasa a ser un
    // elemento propio y grande en la UI (MatrixPanel.tsx, CopilotOrder),
    // leyendo este mismo campo `principal` — ver abajo.
    titulo = `◆ COBERTURA DOBLE · ${coberturaZonasDoc.join('+').toUpperCase()} / ${coberturaZonasCol.join('+').toUpperCase()}`;
    motivo = 'Distribución marcada en los dos mercados a la vez: se cubren 2 docenas y 2 columnas (4 fichas) hasta que salga, en cada una, la zona que quedó afuera.';
  } else if (coberturaDocActiva) {
    capa = 'COBERTURA_DOC';
    titulo = `◆ COBERTURA DOCENAS · ${coberturaZonasDoc.join('+').toUpperCase()}`;
    motivo = 'Distribución marcada en docenas: se cubren 2 zonas (2 fichas) hasta que salga la que quedó afuera.';
  } else {
    capa = 'COBERTURA_COL';
    titulo = `◆ COBERTURA COLUMNAS · ${coberturaZonasCol.join('+').toUpperCase()}`;
    motivo = 'Distribución marcada en columnas: se cubren 2 zonas (2 fichas) hasta que salga la que quedó afuera.';
  }

  return {
    mercado: null,
    accion: 'ENTRAR',
    exposicion: 'REDUCIDA',
    titulo, motivo,
    nivel: 'precaucion',
    capa,
    pickDoc: docTxt,
    pickCol: colTxt,
    principal,
    capa1Decision: capa1,
    escudo,
  };
}
