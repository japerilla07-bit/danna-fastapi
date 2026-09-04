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

  // 2. Termómetro en vivo — cómo viene la mesa AHORA
  //    Peso subido (20→28): el PRESENTE debe pesar casi como el histórico, porque
  //    el histórico de celda es ruidoso y "hoy viene mejor" es un hecho real. Esto
  //    hace que el copiloto rote al mercado que viene mejor HOY cuando corresponde,
  //    en vez de quedarse clavado en el de mejor histórico.
  if (m.termoTotal >= 3) {
    const ratio = m.termoHits / m.termoTotal;
    if (ratio >= 0.7) s += 28;         // venís bien
    else if (ratio >= 0.5) s += 11;    // parejo
    else s -= 21;                       // mesa dura ahora
    // racha viva en la ventana = peligro inmediato
    if (m.termoStreak >= 3) s -= 25;
    else if (m.termoStreak === 2) s -= 12;
  }

  // 3. Racha viva de la celda vs su techo — peligro de exceso
  if (m.cellCeiling && m.cellCeiling > 0) {
    if (m.liveStreak >= m.cellCeiling) s -= 30;      // ya superaste lo histórico: anómalo
    else if (m.liveStreak === m.cellCeiling - 1) s -= 12; // al borde del techo
  }
  return s;
}

// ── Decisión final cruzando los dos mercados ──
export function decidir(doc: MarketRead, col: MarketRead): Decision {
  const sDoc = seguridad(doc);
  const sCol = seguridad(col);
  const mejor = sDoc >= sCol ? doc : col;
  const mejorS = Math.max(sDoc, sCol);
  const nombre = (mkt: Market) => (mkt === 'doc' ? 'DOCENAS' : 'COLUMNAS');

  // ── PARAR: los dos mercados peligrosos a la vez ──
  if (sDoc < -10 && sCol < -10) {
    return {
      mercado: null, accion: 'PARAR', exposicion: 'CERO',
      titulo: '✋ ESPERÁ — mesa brava',
      motivo: 'Las dos zonas vienen mal ahora. No es momento de exponer bankroll.',
      nivel: 'alto',
    };
  }

  // ── No hay ningún mercado REALMENTE bueno → esperar (no entrar en "el menos malo") ──
  //    Umbral subido de 10 a 25: entrar solo cuando hay una opción sólida, no la
  //    menos mala de dos flojas. Medido: esas entradas rendían 59% y a veces caían
  //    dentro de rachas; evitarlas corta rachas de 4/6/7 sin perder WR ni volumen.
  if (mejorS < 25) {
    return {
      mercado: null, accion: 'ESPERAR', exposicion: 'CERO',
      titulo: '⏸ ESPERÁ una mejor',
      motivo: `Ni ${nombre('doc')} ni ${nombre('col')} están en zona sólida. No entres en la menos mala.`,
      nivel: 'precaucion',
    };
  }

  // ── Hay un mercado jugable: graduar la exposición según seguridad ──
  const m = mejor;
  const otro = m.mkt === 'doc' ? col : doc;
  const rota = mejor === (sDoc >= sCol ? doc : col) && Math.abs(sDoc - sCol) > 15;

  let accion: Accion, exposicion: Exposicion, nivel: Decision['nivel'];
  if (mejorS >= 45) { accion = 'ENTRAR'; exposicion = 'NORMAL'; nivel = 'ok'; }
  else if (mejorS >= 28) { accion = 'ENTRAR'; exposicion = 'REDUCIDA'; nivel = 'ok'; }
  else { accion = 'SUAVE'; exposicion = 'MÍNIMA'; nivel = 'precaucion'; }

  // Ajuste por peligro inminente: si la racha viva está al borde del techo, frená la mano
  if (m.cellCeiling && m.liveStreak >= m.cellCeiling - 1 && m.cellCeiling > 0) {
    exposicion = 'MÍNIMA'; nivel = 'precaucion';
  }

  const motivoRotacion = rota ? ` (mejor que ${nombre(otro.mkt)} ahora)` : '';
  const expoTxt: Record<Exposicion, string> = {
    NORMAL: 'Progresión normal.', REDUCIDA: 'Progresión suave.',
    MÍNIMA: 'Ficha mínima, sin escalar.', CERO: '',
  };

  return {
    mercado: m.mkt, accion, exposicion,
    titulo: `▸ ${nombre(m.mkt)} · ${accion === 'ENTRAR' ? 'ENTRÁ' : 'ENTRÁ SUAVE'}`,
    motivo: `Zona ${m.estado.toLowerCase()}${motivoRotacion}. ${expoTxt[exposicion]}`,
    nivel,
  };
}
