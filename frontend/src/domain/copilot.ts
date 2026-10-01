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
function seguridad(m: MarketRead): number {
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
  capa: 'CAPA1';
}

export function decidirPiloto(doc: MarketRead, col: MarketRead): DecisionPiloto {
  return { ...decidir(doc, col), capa: 'CAPA1' };
}
