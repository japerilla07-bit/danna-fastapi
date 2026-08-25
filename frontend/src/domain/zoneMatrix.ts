// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz canónica de zonas 3×3 (auditoría 2412 giros)
// ════════════════════════════════════════════════════════════════════════
//
// Cortes canónicos:
//   HUD    → Bajo 0-45   · Medio 46-69   · Alto 70-100
//   ENT    → Baja 0-15   · Media 16-45   · Alta 46-100
//
// 9 celdas físicas de la mesa. Cada celda tiene WR histórico por mercado
// y decisión operativa (VERDE si > 66.67%, ROJO si no). La celda 9 no
// tiene muestra suficiente → estado especial NO_DATA (no operar).
//
// Regla PROBE (transición): una celda es PROBE para un mercado si ese
// mercado está en rojo PERO el otro mercado está verde. Señaliza rotación.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'VERDE' | 'PROBE' | 'TOXICA' | 'NO_DATA';
export type Market = 'doc' | 'col';
export type HudBand = 'ALTO' | 'MEDIO' | 'BAJO';
export type EntBand = 'BAJA' | 'MEDIA' | 'ALTA';

/**
 * Definición de una celda de la matriz.
 * `verdeDoc` / `verdeCol` = true si el WR histórico supera 66.67%.
 * `noData` = true si la muestra es insuficiente para decidir.
 */
interface Cell {
  hud: HudBand;
  ent: EntBand;
  wrDoc: number;
  wrCol: number;
  verdeDoc: boolean;
  verdeCol: boolean;
  noData?: boolean;
  label: string;
  diagnosis: string;
}

/**
 * Matriz completa 3×3 — tal cual la auditoría entregada.
 */
export const CELLS: readonly Cell[] = [
  // 1. HUD Alto + Entropía Baja
  {
    hud: 'ALTO', ent: 'BAJA', wrDoc: 62.61, wrCol: 59.91,
    verdeDoc: false, verdeCol: false,
    label: 'TRAMPA DE VELOCIDAD',
    diagnosis: 'Destrucción total — prohibido operar.',
  },
  // 2. HUD Alto + Entropía Media
  {
    hud: 'ALTO', ent: 'MEDIA', wrDoc: 60.00, wrCol: 67.62,
    verdeDoc: false, verdeCol: true,
    label: 'TRANSICIÓN RÁPIDA',
    diagnosis: 'Exclusivo columnas con precaución.',
  },
  // 3. HUD Alto + Entropía Alta
  {
    hud: 'ALTO', ent: 'ALTA', wrDoc: 58.67, wrCol: 61.33,
    verdeDoc: false, verdeCol: false,
    label: 'CAOS EN ALTA VELOCIDAD',
    diagnosis: 'Zona tóxica crítica — muestra inestable.',
  },
  // 4. HUD Medio + Entropía Baja
  {
    hud: 'MEDIO', ent: 'BAJA', wrDoc: 63.87, wrCol: 67.10,
    verdeDoc: false, verdeCol: true,
    label: 'INERCIA ESTABLE',
    diagnosis: 'Exclusivo columnas — progresiones limpias.',
  },
  // 5. HUD Medio + Entropía Media
  {
    hud: 'MEDIO', ent: 'MEDIA', wrDoc: 65.19, wrCol: 66.35,
    verdeDoc: false, verdeCol: false,
    label: 'ZONA DE TRANSICIÓN',
    diagnosis: 'Sub-óptimo — al borde del umbral.',
  },
  // 6. HUD Medio + Entropía Alta
  {
    hud: 'MEDIO', ent: 'ALTA', wrDoc: 66.88, wrCol: 64.50,
    verdeDoc: true, verdeCol: false,
    label: 'CAOS ESTABLE',
    diagnosis: 'Exclusivo docenas — sectores del cilindro.',
  },
  // 7. HUD Bajo + Entropía Baja
  {
    hud: 'BAJO', ent: 'BAJA', wrDoc: 61.38, wrCol: 64.14,
    verdeDoc: false, verdeCol: false,
    label: 'MESA MUERTA',
    diagnosis: 'Pérdida de inercia — ambos ciegos.',
  },
  // 8. HUD Bajo + Entropía Media  ← EL SANTUARIO
  {
    hud: 'BAJO', ent: 'MEDIA', wrDoc: 66.79, wrCol: 71.79,
    verdeDoc: true, verdeCol: true,
    label: 'SANTUARIO LENTO',
    diagnosis: 'El mejor entorno — rentable en ambos.',
  },
  // 9. HUD Bajo + Entropía Alta  ← SIN DATA
  {
    hud: 'BAJO', ent: 'ALTA', wrDoc: 0, wrCol: 0,
    verdeDoc: false, verdeCol: false, noData: true,
    label: 'DATA INSUFICIENTE',
    diagnosis: 'Sin muestra confiable — mejor no operar.',
  },
] as const;

// ────────────────────────────────────────────────────────────────────────
// Utilidades de bandas
// ────────────────────────────────────────────────────────────────────────

export function hudBand(hud: number): HudBand {
  if (hud >= 70) return 'ALTO';
  if (hud >= 46) return 'MEDIO';
  return 'BAJO';
}

export function entBand(ent: number): EntBand {
  if (ent >= 46) return 'ALTA';
  if (ent >= 16) return 'MEDIA';
  return 'BAJA';
}

/**
 * Encuentra la celda actual dado (hud, ent). Nunca devuelve null si hay
 * ambos valores — las 9 celdas cubren todo el espacio 0-100 × 0-100.
 */
export function findCell(hud: number | null, ent: number | null): Cell | null {
  if (hud === null || ent === null) return null;
  const hb = hudBand(hud);
  const eb = entBand(ent);
  return CELLS.find((c) => c.hud === hb && c.ent === eb) ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Clasificación operativa por mercado
// ────────────────────────────────────────────────────────────────────────

/**
 * Clasifica la zona operativa para un mercado.
 *
 *   NO_DATA → celda sin muestra suficiente (fila 9).
 *   VERDE   → WR > 66.67% para este mercado.
 *   PROBE   → este mercado en rojo, pero el OTRO está verde
 *             (oportunidad de rotación).
 *   TOXICA  → ambos mercados debajo del umbral en esta celda.
 */
export function classifyZone(
  hud: number | null,
  ent: number | null,
  mkt: Market
): Zone {
  const c = findCell(hud, ent);
  if (!c) return 'TOXICA';
  if (c.noData) return 'NO_DATA';
  const mine = mkt === 'doc' ? c.verdeDoc : c.verdeCol;
  const other = mkt === 'doc' ? c.verdeCol : c.verdeDoc;
  if (mine) return 'VERDE';
  if (other) return 'PROBE';
  return 'TOXICA';
}

/**
 * Devuelve el WR histórico de la celda actual para un mercado (0-100).
 * Útil para mostrarlo en el chip: "COL 67,1% — INERCIA ESTABLE".
 */
export function currentCellWr(
  hud: number | null,
  ent: number | null,
  mkt: Market
): number | null {
  const c = findCell(hud, ent);
  if (!c || c.noData) return null;
  return mkt === 'doc' ? c.wrDoc : c.wrCol;
}

/**
 * Etiqueta operativa de la celda actual (p. ej. "SANTUARIO LENTO").
 */
export function currentCellLabel(
  hud: number | null,
  ent: number | null
): string | null {
  const c = findCell(hud, ent);
  return c ? c.label : null;
}

// ────────────────────────────────────────────────────────────────────────
// Capacidad de racha por mercado (drawdown tracker)
// ────────────────────────────────────────────────────────────────────────

export const STREAK_CAP: Record<Market, number> = {
  doc: 7,
  col: 5,
};
