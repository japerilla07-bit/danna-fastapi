// ════════════════════════════════════════════════════════════════════════
// JUEGA ESTO — qué se juega de verdad ahora (función PURA).
//
// Misma lógica, línea por línea, que JuegaEsto() de MatrixPanel.tsx: ESCUDO si
// está cubriendo; si no, CAPA 1; o nada si hay que esperar. Se separó en una
// función pura para que la terminal nueva y la prueba de regresión lean
// exactamente lo mismo. Es la decisión real (liveDecision) que puntúa el
// marcador. Solo lectura.
// ════════════════════════════════════════════════════════════════════════

import type { DecisionPiloto } from '@/domain/copilot';

export interface JuegaParte {
  mkt: 'doc' | 'col';
  etiqueta: 'DOCENAS' | 'COLUMNAS';
  zonas: string | null;
  pri: boolean;
}

export interface Juega {
  fuente: 'ESCUDO' | 'CAPA 1' | null;
  expo: string;
  /** siempre [doc, col]; las que no se juegan traen zonas=null */
  partes: JuegaParte[];
  /** texto idéntico al que arma JuegaEsto() en MatrixPanel.tsx */
  texto: string;
}

export function computeJuega(
  d: DecisionPiloto,
  pend: { docPick?: string | null; colPick?: string | null } | null | undefined,
): Juega {
  const juegaEscudo = d.capa !== 'CAPA1';
  const juegaCapa1 = !juegaEscudo && d.mercado !== null && (d.accion === 'ENTRAR' || d.accion === 'SUAVE');
  const fuente = juegaEscudo ? 'ESCUDO' : juegaCapa1 ? 'CAPA 1' : null;

  let texto = 'NO APUESTES · ESPERA';
  const partes: JuegaParte[] = [
    { mkt: 'doc', etiqueta: 'DOCENAS', zonas: null, pri: false },
    { mkt: 'col', etiqueta: 'COLUMNAS', zonas: null, pri: false },
  ];

  if (juegaEscudo) {
    const lista: { t: string; pri: boolean }[] = [];
    if (d.pickDoc) {
      lista.push({ t: `DOCENAS ${d.pickDoc}`, pri: d.capa === 'COBERTURA_DOBLE' && d.principal === 'doc' });
      partes[0] = { ...partes[0], zonas: d.pickDoc, pri: d.capa === 'COBERTURA_DOBLE' && d.principal === 'doc' };
    }
    if (d.pickCol) {
      lista.push({ t: `COLUMNAS ${d.pickCol}`, pri: d.capa === 'COBERTURA_DOBLE' && d.principal === 'col' });
      partes[1] = { ...partes[1], zonas: d.pickCol, pri: d.capa === 'COBERTURA_DOBLE' && d.principal === 'col' };
    }
    lista.sort((x, y) => Number(y.pri) - Number(x.pri));
    texto = lista.map((x) => (x.pri ? `▲ ${x.t}` : x.t)).join('  ·  ');
  } else if (juegaCapa1) {
    const z = d.mercado === 'doc' ? pend?.docPick : pend?.colPick;
    texto = `${d.mercado === 'doc' ? 'DOCENAS' : 'COLUMNAS'}${z ? ` ${z}` : ''}`;
    const i = d.mercado === 'doc' ? 0 : 1;
    partes[i] = { ...partes[i], zonas: z || '', pri: false };
  }
  const expo = d.exposicion === 'REDUCIDA' ? 'progresión suave' : d.exposicion === 'MÍNIMA' ? 'ficha mínima' : '';
  return { fuente, expo, partes, texto };
}

/** "Columna 1 / Columna 3" → "Col 1 / Col 3" — solo abreviatura de presentación
 *  para que quepa en el nivel "vistazo"; el rótulo COLUMNAS/DOCENAS va al lado. */
export function abrevZonas(z: string | null | undefined): string {
  if (!z) return '';
  return z.replace(/Columna\s+/g, 'Col ');
}
