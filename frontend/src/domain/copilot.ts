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

// ── Decisión final cruzando los dos mercados ──
export function decidir(doc: MarketRead, col: MarketRead): Decision {
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
  const rota = Math.abs(sDoc - sCol) > 15;

  // EVITAR REFUGIO: si veníamos jugando el OTRO mercado y viene con 2+ errores
  // seguidos, y el copiloto ahora quiere saltar acá, no perseguir el cambio en
  // caliente — esperar un giro. Comprobado sobre 28 sesiones: no baja el techo
  // (las tormentas raras de verdad pasan igual, sigue en 6), pero SÍ baja la
  // racha promedio por sesión — le gana al azar el 78% de las veces, de las
  // mejores cifras que dio cualquier ajuste en todo el proyecto.
  if (ultimoMercadoJugado !== null && m.mkt !== ultimoMercadoJugado) {
    const venia = ultimoMercadoJugado === 'doc' ? doc : col;
    if (venia.termoStreak >= 2) {
      return {
        mercado: null, accion: 'ESPERAR', exposicion: 'CERO',
        titulo: '⏸ ESPERÁ — no persigas el cambio',
        motivo: `Venís perdiendo en ${nombre(ultimoMercadoJugado)} y el copiloto salta a ${nombre(m.mkt)}. Dejá pasar este giro.`,
        nivel: 'precaucion',
      };
      // No se actualiza ultimoMercadoJugado acá: no jugamos, la memoria de la
      // apuesta anterior sigue vigente para el próximo giro.
    }
  }

  let accion: Accion, exposicion: Exposicion, nivel: Decision['nivel'];
  if (mejorS >= 45) { accion = 'ENTRAR'; exposicion = 'NORMAL'; nivel = 'ok'; }
  else if (mejorS >= 28) { accion = 'ENTRAR'; exposicion = 'REDUCIDA'; nivel = 'ok'; }
  else { accion = 'SUAVE'; exposicion = 'MÍNIMA'; nivel = 'precaucion'; }

  // Si venís con 2+ errores en esta celda, bajá la mano (racha viva, no techo histórico).
  if (m.liveStreak >= 2) { exposicion = 'MÍNIMA'; nivel = 'precaucion'; }

  ultimoMercadoJugado = m.mkt; // memoria actualizada SOLO ahora que de verdad jugamos

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

// ════════════════════════════════════════════════════════════════════════
// CAPA 2 — ESCUDO REACTIVO DE CORTE DE RACHA
// ════════════════════════════════════════════════════════════════════════
//
// Todo lo de arriba (seguridad, decidir, ultimoMercadoJugado) queda 100%
// INTACTO — la Capa 1 sigue decidiendo exactamente igual que antes, y sigue
// siendo la que usa el marcador propio del panel (llama a decidir() directo).
//
// La Capa 2 es un escudo aparte que se prende SOLO cuando la Capa 1 ya se
// equivocó en un giro jugado (primer error real de una racha) y elige, entre
// docenas y columnas, la categoría "más clara" de los últimos 7 giros reales
// (temperatura por conteo plano, apagando zonas que no aparecen hace más de
// 4 giros), apostando sus 2 zonas más calientes. Si detecta que docenas y
// columnas se turnan sin que ninguna domine (2 cambios de categoría seguidos)
// se declara INESTABLE y no juega ese giro, en vez de apostar a ciegas.
//
// ESCALÓN A MODO HÍBRIDO (giro 5+): si la racha llega a su 5to giro real sin
// cortarse (los primeros 4 intentos con la regla normal no alcanzaron), el
// escudo deja de elegir UNA sola categoría y pasa a cubrir la zona más
// caliente de docenas Y la más caliente de columnas a la vez — sigue siendo
// 2 fichas, no más, solo que ahora una de cada lado en vez de las dos del
// mismo lado. Una vez que una racha entra en modo híbrido se queda así hasta
// que corta (no vuelve al modo normal a mitad de racha).
//
// El escudo se apaga solo (vuelve el control a la Capa 1) en cuanto sus
// propias zonas aciertan — ahí se considera cortada la racha.
//
// VALIDACIÓN (auditada giro a giro, racha por racha, corte contado SOLO
// hasta que aparece un acierto real — no se corta la medición en INESTABLE):
//   - Corpus: 49 sesiones reales, 17,124 giros, 303 rachas reales de Capa1
//     de 3+ errores seguidos.
//   - Regla normal sola (sin escalón): techo de racha = 9 (peor caso real,
//     sesión 270459). 187 rachas se cortan en 1 giro, 72 en 2, 25 en 3,
//     y solo 19 (6.3%) necesitan más de 3.
//   - Con el escalón a híbrido en el giro 5: techo baja de 9 a 6, y el total
//     de giros quemados en TODO el corpus baja de 499 a 490 (mejora neta,
//     no es un trade-off). Comparado racha por racha contra la regla normal:
//     297 de 303 (98%) quedan exactamente igual, 5 mejoran (las 5 peores
//     rachas del corpus, incluida la de 9→5), y solo 1 empeora, por 1 giro.
//   - Se probó también activar el híbrido desde el giro 1 (siempre que el
//     margen esté parejo): ESO SÍ salía caro — 18.8% de las rachas del
//     corpus empeoraban y se quemaban 30 giros extra en total. La clave fue
//     dejar la regla normal trabajar sola en los primeros intentos (ya
//     resuelve bien el 93.7% de los casos) y reservar la cobertura ampliada
//     solo para la cola dura que demuestra, jugando, que lo necesita.
//   - Se comprobó por separado (control con selección de zona al azar, mismo
//     armazón de racha) que elegir la zona por "temperatura" no rinde más
//     que elegir al azar en el acierto giro a giro (~65% ambas, igual que la
//     cobertura matemática pura de apostar 2 de 3 zonas) — lo que realmente
//     corta la racha es la estructura (reactivo + cobertura 2-de-3 +
//     abstención en inestable), no la puntería de la selección.
//
// NOTA DE CABLEADO EN VIVO (importante, no tocar sin entender esto primero):
//   decidirPiloto() es una función PURA — solo lee ventanaReal/escudoActivo/
//   giroDesdeActivacion, nunca los modifica. Toda la cuenta de giros y el
//   cálculo de qué jugar viven en registrarGiroReal(), que el store debe
//   llamar EXACTAMENTE UNA VEZ por giro real resuelto (nunca desde un
//   componente que se re-renderiza). Si decidirPiloto mutara contadores
//   (como en una versión anterior de este archivo, pensada para la
//   simulación offline donde se llama una sola vez por giro), cada
//   re-render de React sin giro nuevo de por medio inflaría
//   giroDesdeActivacion y dispararía el escalón a híbrido antes o después
//   de lo validado arriba — un bug real, encontrado y corregido ANTES de
//   cablear esto al panel en vivo, no visto en la simulación porque ahí
//   decidirPiloto y registrarGiroReal siempre se llamaban 1:1.
// ════════════════════════════════════════════════════════════════════════

export type CategoriaEscudo = 'docenas' | 'columnas';
export type ZonaEscudo = 'd1' | 'd2' | 'd3' | 'c1' | 'c2' | 'c3';

export interface DecisionPiloto extends Decision {
  capa: 'CAPA1' | 'CAPA2_ESCUDO';
  zonasEscudo?: ZonaEscudo[];   // solo cuando la Capa 2 está jugando
  escudoInestable?: boolean;    // true cuando se abstuvo por oscilación doc/col
  escudoHibrido?: boolean;      // true = zonasEscudo trae 1 zona de docenas +
                                 // 1 de columnas (2 mercados a la vez), no el
                                 // top2 de una sola categoría — ver validación
                                 // arriba (racha de 5+ giros sin cortar)
}

// Config final (ver historial arriba) — NO retocar sin volver a medir contra
// las 303 rachas reales de 49 sesiones, el mismo compromiso de "no reajustar
// al ojo" que se viene siguiendo en todo el proyecto D.A.N.N.A.
const ESCUDO_WINDOW = 7;
const ESCUDO_DECAIMIENTO = 1.0;       // plano, sin ponderar por recencia
const ESCUDO_INACTIVIDAD_MAX = 4;     // zona sin aparecer hace >4 giros → temp 0
const ESCUDO_N_ALERTA = 2;            // 2 cambios de categoría seguidos → inestable
const ESCUDO_ESCALAR_EN = 5;          // giro real (desde la falla inicial, inclusive)
                                       // en el que, si la racha sigue sin cortarse,
                                       // se pasa a modo híbrido (ver validación arriba)

// Estado propio de la Capa 2 (separado de ultimoMercadoJugado de la Capa 1).
let ventanaReal: number[] = [];
let escudoActivo = false;
let categoriaEscudoPrev: CategoriaEscudo | null = null;
let cambiosSeguidosEscudo = 0;
let giroDesdeActivacion = 0;   // cuenta giros reales desde que se prendió el
                                // escudo (1 = el giro de la falla inicial);
                                // decide cuándo pasar a modo híbrido.
// Decisión del escudo YA CALCULADA para el giro actual. Se recalcula una sola
// vez por giro real, dentro de registrarGiroReal (ver más abajo) — NUNCA
// dentro de decidirPiloto, que React puede llamar varias veces por el mismo
// giro (cada re-render). Si decidirPiloto mutara contadores como antes, cada
// re-render sin giro nuevo de por medio inflaría giroDesdeActivacion y
// dispararía el modo híbrido antes de tiempo, o de más. decidirPiloto ahora
// solo LEE este caché — es una función pura, segura de llamar las veces que
// sea en un mismo render.
let decisionEscudoCache: DecisionPiloto | null = null;

function docenaDeNumero(n: number): 'd1' | 'd2' | 'd3' | null {
  if (n === 0) return null;
  if (n <= 12) return 'd1';
  if (n <= 24) return 'd2';
  return 'd3';
}

function columnaDeNumero(n: number): 'c1' | 'c2' | 'c3' | null {
  if (n === 0) return null;
  const m = n % 3;
  if (m === 1) return 'c1';
  if (m === 2) return 'c2';
  return 'c3';
}

// OJO — el orden de inserción en los Map de abajo IMPORTA y no es cosmético:
// cuando dos o más zonas empatan en temperatura (muy común, sobre todo tras
// apagar zonas inactivas), el desempate lo decide cuál apareció PRIMERO en la
// ventana (igual que el dict de Python con el que se validaron las 292+467
// rachas reales). Por eso se usa Map (preserva orden de inserción, y volver a
// hacer .set() sobre una clave que ya existe NO la reordena) en vez de un
// objeto plano — un objeto con las 3 claves fijas de entrada rompía el
// desempate y cambiaba resultados reales, encontrado al verificar este
// puerto contra los 460 giros de las fotos antes de entregarlo.
function calcularTemperatura(ventana: number[]): {
  doc: Map<'d1' | 'd2' | 'd3', number>;
  col: Map<'c1' | 'c2' | 'c3', number>;
} {
  const n = ventana.length;
  const tempDoc = new Map<'d1' | 'd2' | 'd3', number>();
  const tempCol = new Map<'c1' | 'c2' | 'c3', number>();
  const ultimaVistaDoc = new Map<'d1' | 'd2' | 'd3', number>();
  const ultimaVistaCol = new Map<'c1' | 'c2' | 'c3', number>();

  ventana.forEach((num, i) => {
    const antiguedad = (n - 1) - i; // 0 = el más reciente de la ventana
    const peso = ESCUDO_DECAIMIENTO ** antiguedad;
    const d = docenaDeNumero(num);
    const c = columnaDeNumero(num);
    if (d) { tempDoc.set(d, (tempDoc.get(d) ?? 0) + peso); ultimaVistaDoc.set(d, antiguedad); }
    if (c) { tempCol.set(c, (tempCol.get(c) ?? 0) + peso); ultimaVistaCol.set(c, antiguedad); }
  });

  ultimaVistaDoc.forEach((ult, zona) => {
    if (ult > ESCUDO_INACTIVIDAD_MAX) tempDoc.set(zona, 0);
  });
  ultimaVistaCol.forEach((ult, zona) => {
    if (ult > ESCUDO_INACTIVIDAD_MAX) tempCol.set(zona, 0);
  });

  (['d1', 'd2', 'd3'] as const).forEach((z) => { if (!tempDoc.has(z)) tempDoc.set(z, 0); });
  (['c1', 'c2', 'c3'] as const).forEach((z) => { if (!tempCol.has(z)) tempCol.set(z, 0); });

  return { doc: tempDoc, col: tempCol };
}

function elegirCategoriaYTop2(ventana: number[]): { categoria: CategoriaEscudo; zonas: ZonaEscudo[] } {
  const { doc, col } = calcularTemperatura(ventana);
  const docOrdenado = (Array.from(doc.entries()) as Array<[ZonaEscudo, number]>).sort((a, b) => b[1] - a[1]);
  const colOrdenado = (Array.from(col.entries()) as Array<[ZonaEscudo, number]>).sort((a, b) => b[1] - a[1]);

  // Margen = 2do lugar menos 3er lugar: qué tan bien excluida queda la zona
  // que NO se juega. Es el corregido (no 1ro-vs-2do) tras el caso real que
  // trajo Gunner (docenas 3-2-2 empatado vs columnas 3-3-1 con hueco claro).
  const margenDoc = docOrdenado[1][1] - docOrdenado[2][1];
  const margenCol = colOrdenado[1][1] - colOrdenado[2][1];

  if (margenDoc >= margenCol) {
    return { categoria: 'docenas', zonas: [docOrdenado[0][0], docOrdenado[1][0]] };
  }
  return { categoria: 'columnas', zonas: [colOrdenado[0][0], colOrdenado[1][0]] };
}

// Modo híbrido (giro 5+ de una racha sin cortar): en vez de elegir UNA
// categoría, se cubre la zona más caliente de docenas y la más caliente de
// columnas a la vez — 2 fichas igual que siempre, una de cada lado.
function elegirZonasHibrido(ventana: number[]): ZonaEscudo[] {
  const { doc, col } = calcularTemperatura(ventana);
  const docOrdenado = (Array.from(doc.entries()) as Array<[ZonaEscudo, number]>).sort((a, b) => b[1] - a[1]);
  const colOrdenado = (Array.from(col.entries()) as Array<[ZonaEscudo, number]>).sort((a, b) => b[1] - a[1]);
  return [docOrdenado[0][0], colOrdenado[0][0]];
}

// ── Calcula (y cachea) qué debe jugar el escudo AHORA, a partir del estado
//    actual (ventanaReal/giroDesdeActivacion/categoriaEscudoPrev). Se llama
//    SOLO desde registrarGiroReal, exactamente una vez por giro real —
//    nunca desde decidirPiloto. null = todavía no hay ventana suficiente
//    (7 giros reales), usar Capa 1 mientras tanto. ──
function calcularDecisionEscudo(): DecisionPiloto | null {
  if (ventanaReal.length < ESCUDO_WINDOW) return null;

  const usarHibrido = giroDesdeActivacion >= ESCUDO_ESCALAR_EN;

  if (usarHibrido) {
    const zonasHibrido = elegirZonasHibrido(ventanaReal);
    // El modo híbrido no participa de la alerta de inestabilidad (no hay una
    // sola categoría que pueda "oscilar": se están cubriendo las dos juntas).
    categoriaEscudoPrev = null;
    cambiosSeguidosEscudo = 0;
    return {
      mercado: null, accion: 'ENTRAR', exposicion: 'REDUCIDA',
      titulo: `🛡 ESCUDO AMPLIADO · ${zonasHibrido[0].toUpperCase()} + ${zonasHibrido[1].toUpperCase()}`,
      motivo: `Racha dura (${ESCUDO_ESCALAR_EN}+ giros sin cortar): se cubre 1 zona de docenas y 1 de columnas a la vez.`,
      nivel: 'precaucion',
      capa: 'CAPA2_ESCUDO',
      zonasEscudo: zonasHibrido,
      escudoHibrido: true,
    };
  }

  const { categoria, zonas } = elegirCategoriaYTop2(ventanaReal);

  if (categoriaEscudoPrev !== null && categoria !== categoriaEscudoPrev) {
    cambiosSeguidosEscudo += 1;
  } else {
    cambiosSeguidosEscudo = 0;
  }
  categoriaEscudoPrev = categoria;

  if (cambiosSeguidosEscudo >= ESCUDO_N_ALERTA) {
    // Docenas y columnas se vienen turnando sin que ninguna domine de
    // verdad: no es "cortar la racha", es apostar a ciegas. Se abstiene.
    cambiosSeguidosEscudo = 0;
    return {
      mercado: null, accion: 'ESPERAR', exposicion: 'CERO',
      titulo: '🛡 ESCUDO INESTABLE — no metas ficha',
      motivo: 'Docenas y columnas se turnan sin que ninguna domine los últimos 7 giros. Dejá pasar.',
      nivel: 'precaucion',
      capa: 'CAPA2_ESCUDO',
      escudoInestable: true,
    };
  }

  const mkt: Market = categoria === 'docenas' ? 'doc' : 'col';
  const nombreCat = categoria === 'docenas' ? 'DOCENAS' : 'COLUMNAS';

  return {
    mercado: mkt, accion: 'ENTRAR', exposicion: 'REDUCIDA',
    titulo: `🛡 ESCUDO ACTIVO · ${nombreCat} (${zonas.join(' + ')})`,
    motivo: 'Cortando racha: las 2 zonas más calientes de los últimos 7 giros reales.',
    nivel: 'precaucion',
    capa: 'CAPA2_ESCUDO',
    zonasEscudo: zonas,
  };
}

// ── Llamar UNA vez por cada giro real, apenas se sabe el número y el
//    resultado de la jugada de ESE giro (si se jugó). Alimenta la ventana de
//    7 giros reales, prende/apaga el escudo, y deja lista la decisión para
//    el próximo giro (decidirPiloto solo la lee, no la calcula). ──
//
//    numero: número real que salió.
//    jugado: true si la Capa 1 (o la Capa 2) puso ficha ese giro
//            (ENTRAR o SUAVE); false si fue ESPERAR/PARAR.
//    acierto: si jugado=true, si esa apuesta ganó o no (irrelevante si
//             jugado=false, poner false).
export function registrarGiroReal(numero: number, jugado: boolean, acierto: boolean): void {
  ventanaReal.push(numero);
  if (ventanaReal.length > ESCUDO_WINDOW) ventanaReal.shift();

  if (!escudoActivo) {
    if (jugado && !acierto) {
      // Primer error real de una racha: se prende el escudo. Esta MISMA falla
      // ya es el giro 1 de la racha.
      escudoActivo = true;
      giroDesdeActivacion = 1;
      decisionEscudoCache = calcularDecisionEscudo();
    }
    return;
  }

  // El escudo ya estaba prendido ANTES de este giro: este giro real es un
  // intento más de la racha — se cuenta SIEMPRE, jugado o no (un giro
  // INESTABLE, sin ficha, también cuenta para el escalón a híbrido).
  giroDesdeActivacion += 1;

  if (jugado && acierto) {
    // La racha se cortó: se apaga el escudo y vuelve el control a la Capa 1.
    escudoActivo = false;
    categoriaEscudoPrev = null;
    cambiosSeguidosEscudo = 0;
    giroDesdeActivacion = 0;
    decisionEscudoCache = null;
    return;
  }

  decisionEscudoCache = calcularDecisionEscudo();
}

// ── Decisión del piloto completo: Capa 1 + escudo de Capa 2 encima. ──
// Esta es la función para conectar en vivo (el store/panel del frontend).
// decidir() queda igual que siempre para quien ya la use (ej. el marcador
// propio del panel). PURA: solo LEE estado, no lo modifica — segura de
// llamar cualquier cantidad de veces en el mismo giro (React puede
// re-renderizar varias veces antes de que llegue el próximo giro real).
export function decidirPiloto(doc: MarketRead, col: MarketRead): DecisionPiloto {
  const capa1 = decidir(doc, col);
  if (!escudoActivo || decisionEscudoCache === null) {
    // Sin racha activa, o racha activa pero la ventana de 7 giros reales
    // todavía no se llenó (arranque de sesión): manda la Capa 1.
    return { ...capa1, capa: 'CAPA1' };
  }
  return decisionEscudoCache;
}

// ── Estado de solo-lectura del escudo, para mostrarlo en el panel si se
//    quiere (ej. un chip "ESCUDO: activo / apagado" junto al marcador). ──
export function estadoEscudo(): {
  activo: boolean;
  ventana: number[];
  categoriaPrev: CategoriaEscudo | null;
  cambiosSeguidos: number;
  giroDesdeActivacion: number;
  enModoHibrido: boolean;
} {
  return {
    activo: escudoActivo,
    ventana: [...ventanaReal],
    categoriaPrev: categoriaEscudoPrev,
    cambiosSeguidos: cambiosSeguidosEscudo,
    giroDesdeActivacion,
    enModoHibrido: escudoActivo && giroDesdeActivacion >= ESCUDO_ESCALAR_EN,
  };
}

// ── Reiniciar el escudo al empezar una sesión nueva. NO toca
//    ultimoMercadoJugado (memoria propia de la Capa 1, ya existente). ──
export function resetEscudo(): void {
  ventanaReal = [];
  escudoActivo = false;
  categoriaEscudoPrev = null;
  cambiosSeguidosEscudo = 0;
  giroDesdeActivacion = 0;
  decisionEscudoCache = null;
}
