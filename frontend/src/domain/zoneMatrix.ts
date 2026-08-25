// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz canónica de zonas (dominio puro)
// ════════════════════════════════════════════════════════════════════════
//
// Este módulo NO importa React. Es dominio puro, testeable con unit tests
// sin montar componentes. La matriz proviene de la auditoría forense sobre
// 4.036 giros de columnas y docenas (11 sesiones agregadas):
//
//   • Regla estricta: una celda es OPERABLE si su WR histórico > 66,67%.
//   • Las celdas se derivan del cruce de bandas HUD × Entropía.
//   • Cada celda tiene resultado independiente para DOC y COL.
//
// Complejidad: `classifyZone` es O(1) — recorre la matriz una vez sin
// loops anidados. No requiere memoización.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'VERDE' | 'PROBE' | 'TOXICA';
export type Market = 'doc' | 'col';

/**
 * Regla de matriz.
 * [entMin, entMax, hudMin, hudMax, verdeDoc, verdeCol]
 * Rangos inclusivos en ambos extremos.
 */
type Rule = readonly [number, number, number, number, boolean, boolean];

/**
 * Matriz validada por auditoría (4036 giros). Cada regla se corresponde
 * con una fila del semáforo estricto documentado.
 */
const MATRIX: readonly Rule[] = [
  //  entMin entMax  hudMin hudMax  DOC   COL
  [    0,    15,     0,    40,   true,  true ],
  [    0,    15,    41,    45,   false, true ],
  [   16,    30,    41,    45,   false, true ],
  [   16,    30,    46,    55,   true,  false],
  [   31,    45,     0,    45,   true,  true ],
  [   46,    60,    46,    50,   true,  false],
  [   61,   100,     0,    40,   true,  false],
  [   61,   100,    46,    50,   true,  true ],
] as const;

/**
 * Devuelve true si (hud, ent) cae en una celda operable para el mercado
 * indicado. Recorre la matriz linealmente — O(8) → constante.
 */
export function isGreen(hud: number, ent: number, mkt: Market): boolean {
  for (const [eLo, eHi, hLo, hHi, dOk, cOk] of MATRIX) {
    if (ent >= eLo && ent <= eHi && hud >= hLo && hud <= hHi) {
      return mkt === 'doc' ? dOk : cOk;
    }
  }
  return false;
}

/**
 * Clasifica la zona de un giro para un mercado.
 *
 *   VERDE  → celda operable para este mercado.
 *   PROBE  → celda operable para el OTRO mercado (indica transición;
 *            el operador podría considerar rotar de mercado).
 *   TOXICA → fuera de zonas operables para ambos mercados.
 *
 * El diseño PROBE = "operable en el otro" viene del hallazgo estructural
 * de que los errores DOC/COL no coinciden (~12,8% de solape). Cuando un
 * mercado entra en tóxica y el otro no, hay oportunidad de rotación —
 * y ese es exactamente el semáforo ámbar.
 */
export function classifyZone(
  hud: number | null,
  ent: number | null,
  mkt: Market
): Zone {
  if (hud === null || ent === null) return 'TOXICA';
  if (isGreen(hud, ent, mkt)) return 'VERDE';
  const other: Market = mkt === 'doc' ? 'col' : 'doc';
  if (isGreen(hud, ent, other)) return 'PROBE';
  return 'TOXICA';
}

/**
 * Exposición de la matriz para el radar cartesiano.
 * Devuelve todas las celdas verdes para pintarlas como polígonos de fondo.
 */
export function greenCellsFor(mkt: Market): Array<{
  entMin: number; entMax: number;
  hudMin: number; hudMax: number;
}> {
  return MATRIX
    .filter(([, , , , dOk, cOk]) => (mkt === 'doc' ? dOk : cOk))
    .map(([eLo, eHi, hLo, hHi]) => ({
      entMin: eLo, entMax: eHi, hudMin: hLo, hudMax: hHi,
    }));
}

/**
 * Zonas tóxicas conocidas — útiles para pintar bandas rojas de advertencia.
 * Se computan como complemento de las verdes en bandas cardinales.
 */
export const TOXIC_BANDS = {
  /** Trampa de velocidad: HUD≥70 y Ent≤10. WR col 60,7%. */
  velocityTrap: { hudMin: 70, hudMax: 100, entMin: 0, entMax: 10 },
  /** Fricción total: HUD≥90. WR col 56,6% (peor celda del tablero). */
  totalFriction: { hudMin: 90, hudMax: 100, entMin: 0, entMax: 100 },
  /** Franja central bajo alta entropía. */
  centralChaos: { hudMin: 46, hudMax: 55, entMin: 50, entMax: 100 },
} as const;

/**
 * Capacidad de racha por mercado (semáforo estricto).
 * Documental: en la auditoría, con el filtro estricto, DOC toleró rachas
 * de 3-4 y COL solo llegó a 3. El drawdown tracker usa estas capacidades.
 */
export const STREAK_CAP: Record<Market, number> = {
  doc: 7,
  col: 5,
};
