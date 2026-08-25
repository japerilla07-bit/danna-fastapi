// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz de zonas puntuales (v3)
// ════════════════════════════════════════════════════════════════════════
//
// Reemplaza la matriz 3×3 gruesa (que promediaba santuarios con agujeros
// negros y borraba la señal) por 20 zonas puntuales extraídas de la
// auditoría fina — hojas 2, 3 y 4 del Excel de referencia.
//
// Prioridad de evaluación:
//   1) AGUJEROS NEGROS  ganan siempre (aunque el punto también caiga en
//      un santuario del mismo mercado, prevalece el agujero).
//   2) SANTUARIOS (WR ≥ 73%)  → primera opción para operar.
//   3) VERDES     (WR 67 – 72%) → operar normal.
//   4) PROBE      (WR 60 – 66%) → no operar este mercado; rotar si el
//      OTRO mercado en este mismo punto está VERDE o SANTUARIO.
//   5) TÓXICA     (WR 50 – 59%) → no operar.
//   6) NEUTRA     → punto sin zona nombrada; sin decisión fuerte.
//
// Regla del motor: SIEMPRE emite pick (BET). El semáforo es sugerencia
// visual — el operador decide con la lectura del ZoneChip.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';

// ────────────────────────────────────────────────────────────────────────
// Estructura de una zona nombrada
// ────────────────────────────────────────────────────────────────────────

interface NamedZone {
  /** Rangos inclusivos en HUD y Entropía. */
  hudMin: number; hudMax: number;
  entMin: number; entMax: number;
  /** WR histórico y decisión operativa por mercado. */
  doc: { wr: number; kind: Zone };
  col: { wr: number; kind: Zone };
  label: string;
  /** Diagnóstico corto para mostrar bajo el chip. */
  hint: string;
  /** Prioridad de evaluación — mayor = gana. */
  prio: number;
}

// ────────────────────────────────────────────────────────────────────────
// Zonas nombradas (auditoría — Excel hojas 2, 3, 4)
// ────────────────────────────────────────────────────────────────────────

const ZONES: readonly NamedZone[] = [
  // ── AGUJEROS NEGROS (prioridad máxima 100) ──────────────────────────
  {
    label: 'AGUJERO NEGRO DEFINITIVO',
    hint: 'Un solo punto: HUD 51-55 × ENT 51-55. Salir ya.',
    hudMin: 51, hudMax: 55, entMin: 51, entMax: 55,
    doc: { wr: 50.0, kind: 'AGUJERO' },
    col: { wr: 43.7, kind: 'AGUJERO' },
    prio: 100,
  },
  {
    label: 'MESA MUERTA TÓXICA',
    hint: 'HUD ≤ 25 con ENT ≥ 70. Destrucción total.',
    hudMin: 0, hudMax: 25, entMin: 70, entMax: 100,
    doc: { wr: 32.0, kind: 'AGUJERO' },
    col: { wr: 32.0, kind: 'AGUJERO' },
    prio: 100,
  },
  {
    label: 'AGUJERO NEGRO CENTRAL',
    hint: 'HUD 41-55 × ENT > 40. La trampa más peligrosa.',
    hudMin: 41, hudMax: 55, entMin: 41, entMax: 100,
    doc: { wr: 49.0, kind: 'AGUJERO' },
    col: { wr: 49.0, kind: 'AGUJERO' },
    prio: 90,   // menor que definitivo — si se solapan, gana el chico
  },
  {
    label: 'TRAMPA DE VELOCIDAD',
    hint: 'HUD ≥ 70 × ENT ≤ 10. Orden aparente que quema cuenta.',
    hudMin: 70, hudMax: 100, entMin: 0, entMax: 10,
    doc: { wr: 61.0, kind: 'TOXICA' },
    col: { wr: 62.6, kind: 'TOXICA' },
    prio: 80,
  },

  // ── SANTUARIOS (prioridad 60-70) ────────────────────────────────────
  {
    label: 'SANTUARIO CLÁSICO DOC',
    hint: 'ENT 10-30 × HUD 46-55 — refugio histórico DOC.',
    hudMin: 46, hudMax: 55, entMin: 10, entMax: 30,
    doc: { wr: 79.0, kind: 'SANTUARIO' },
    col: { wr: 60.0, kind: 'PROBE' },
    prio: 70,
  },
  {
    label: 'SANTUARIO COL',
    hint: 'ENT 0-10 × HUD 41-50 — rebotes verticales limpios.',
    hudMin: 41, hudMax: 50, entMin: 0, entMax: 10,
    doc: { wr: 60.0, kind: 'PROBE' },
    col: { wr: 80.5, kind: 'SANTUARIO' },
    prio: 70,
  },
  {
    label: 'CONFLUENCIA MAESTRA',
    hint: 'ENT 56-60 × HUD 46-50 — único punto ambos mercados alto caos.',
    hudMin: 46, hudMax: 50, entMin: 56, entMax: 60,
    doc: { wr: 77.14, kind: 'SANTUARIO' },
    col: { wr: 77.14, kind: 'SANTUARIO' },
    prio: 70,
  },
  {
    label: 'PICO DOC EN CAOS',
    hint: 'ENT 71-80 × HUD 36-40 — fractura de caída libre.',
    hudMin: 36, hudMax: 40, entMin: 71, entMax: 80,
    doc: { wr: 82.0, kind: 'SANTUARIO' },
    col: { wr: 55.0, kind: 'TOXICA' },
    prio: 70,
  },
  {
    label: 'REINO COL EXTREMO',
    hint: 'ENT 81-100 × HUD 26-30 — verticales dominan caos absoluto.',
    hudMin: 26, hudMax: 30, entMin: 81, entMax: 100,
    doc: { wr: 55.0, kind: 'TOXICA' },
    col: { wr: 81.2, kind: 'SANTUARIO' },
    prio: 70,
  },
  {
    label: 'SANTUARIO LENTO',
    hint: 'HUD < 45 × ENT 11-39 — refugio global estable.',
    hudMin: 0, hudMax: 44, entMin: 11, entMax: 39,
    doc: { wr: 68.5, kind: 'VERDE' },
    col: { wr: 71.79, kind: 'SANTUARIO' },
    prio: 60,
  },

  // ── VERDES por bloques finos de la Hoja 4 (prioridad 50) ────────────
  {
    label: 'ESTÁTICA · COL',
    hint: 'ENT 0-5 × HUD 41-50 — inercia alta, rebote vertical.',
    hudMin: 41, hudMax: 50, entMin: 0, entMax: 5,
    doc: { wr: 55.0, kind: 'TOXICA' },
    col: { wr: 80.9, kind: 'SANTUARIO' },
    prio: 55,
  },
  {
    label: 'BAJA · COL',
    hint: 'ENT 6-10 × HUD 46-55 — punto dulce columnas.',
    hudMin: 46, hudMax: 55, entMin: 6, entMax: 10,
    doc: { wr: 60.0, kind: 'PROBE' },
    col: { wr: 78.2, kind: 'SANTUARIO' },
    prio: 55,
  },
  {
    label: 'MEDIA-BAJA · DOC ALTA INERCIA',
    hint: 'ENT 11-15 × HUD 76-80 — altísima inercia favorece DOC.',
    hudMin: 76, hudMax: 80, entMin: 11, entMax: 15,
    doc: { wr: 83.3, kind: 'SANTUARIO' },
    col: { wr: 60.0, kind: 'PROBE' },
    prio: 55,
  },
  {
    label: 'MEDIA-BAJA · COL',
    hint: 'ENT 11-15 × HUD 51-55 — bipolar hacia columnas.',
    hudMin: 51, hudMax: 55, entMin: 11, entMax: 15,
    doc: { wr: 60.0, kind: 'PROBE' },
    col: { wr: 77.2, kind: 'SANTUARIO' },
    prio: 55,
  },
  {
    label: 'MEDIA · DOC (SANTUARIO PRINCIPAL)',
    hint: 'ENT 16-20 × HUD 46-55 — interruptor de luz DOC.',
    hudMin: 46, hudMax: 55, entMin: 16, entMax: 20,
    doc: { wr: 74.6, kind: 'SANTUARIO' },
    col: { wr: 60.0, kind: 'PROBE' },
    prio: 55,
  },
  {
    label: 'ALTA · DOC (SALTO DE ANCLA)',
    hint: 'ENT 21-25 × HUD 46-50 — santuario 51-55 se rompe.',
    hudMin: 46, hudMax: 50, entMin: 21, entMax: 25,
    doc: { wr: 73.6, kind: 'SANTUARIO' },
    col: { wr: 60.0, kind: 'PROBE' },
    prio: 55,
  },
  {
    label: 'LÍMITE MEDIO · DOC PICO',
    hint: 'ENT 26-30 × HUD 46-55 — pico más limpio del sistema.',
    hudMin: 46, hudMax: 55, entMin: 26, entMax: 30,
    doc: { wr: 82.5, kind: 'SANTUARIO' },
    col: { wr: 60.0, kind: 'PROBE' },
    prio: 55,
  },
  {
    label: 'ALTA DISP · CONFLUENCIA',
    hint: 'ENT 31-35 × HUD 41-45 — confluencia maestra.',
    hudMin: 41, hudMax: 45, entMin: 31, entMax: 35,
    doc: { wr: 80.9, kind: 'SANTUARIO' },
    col: { wr: 85.7, kind: 'SANTUARIO' },
    prio: 55,
  },
  {
    label: 'CAOS EXTREMO · DOC ARRIBA',
    hint: 'ENT 36-40 × HUD 56-60 — DOC en extremo alto.',
    hudMin: 56, hudMax: 60, entMin: 36, entMax: 40,
    doc: { wr: 80.0, kind: 'SANTUARIO' },
    col: { wr: 55.0, kind: 'TOXICA' },
    prio: 55,
  },
  {
    label: 'CAOS EXTREMO · COL ABAJO',
    hint: 'ENT 36-40 × HUD 36-40 — COL extremo bajo.',
    hudMin: 36, hudMax: 40, entMin: 36, entMax: 40,
    doc: { wr: 55.0, kind: 'TOXICA' },
    col: { wr: 86.3, kind: 'SANTUARIO' },
    prio: 55,
  },
  {
    label: 'MUY ALTA · HUD 56-60',
    hint: 'ENT 41-45 × HUD 56-60 — HUD alto salva sesión.',
    hudMin: 56, hudMax: 60, entMin: 41, entMax: 45,
    doc: { wr: 75.0, kind: 'SANTUARIO' },
    col: { wr: 70.0, kind: 'VERDE' },
    prio: 55,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Motor de evaluación
// ────────────────────────────────────────────────────────────────────────

/**
 * Busca la zona nombrada de mayor prioridad que contenga (hud, ent).
 * Recorre todas — son sólo ~20, es O(1) práctico.
 */
function findZone(hud: number, ent: number): NamedZone | null {
  let best: NamedZone | null = null;
  for (const z of ZONES) {
    if (hud >= z.hudMin && hud <= z.hudMax && ent >= z.entMin && ent <= z.entMax) {
      if (!best || z.prio > best.prio) best = z;
    }
  }
  return best;
}

/** Clasificación operativa por mercado, con regla PROBE por rotación. */
export function classifyZone(
  hud: number | null,
  ent: number | null,
  mkt: Market
): Zone {
  if (hud === null || ent === null) return 'NEUTRA';
  const z = findZone(hud, ent);
  if (!z) return 'NEUTRA';

  const mine = mkt === 'doc' ? z.doc.kind : z.col.kind;

  // Agujero siempre gana
  if (mine === 'AGUJERO') return 'AGUJERO';

  // Si mi mercado es santuario o verde, listo
  if (mine === 'SANTUARIO' || mine === 'VERDE') return mine;

  // Si mi mercado está en probe/toxica pero el OTRO está verde o santuario
  // → PROBE (sugerencia de rotación)
  const other = mkt === 'doc' ? z.col.kind : z.doc.kind;
  if (other === 'SANTUARIO' || other === 'VERDE') return 'PROBE';

  // Ambos en probe/tóxica → devolver el propio (probe o toxica)
  return mine;
}

/** WR histórico exacto del punto para un mercado. */
export function currentCellWr(
  hud: number | null,
  ent: number | null,
  mkt: Market
): number | null {
  if (hud === null || ent === null) return null;
  const z = findZone(hud, ent);
  if (!z) return null;
  return mkt === 'doc' ? z.doc.wr : z.col.wr;
}

/** Etiqueta de la zona nombrada actual. */
export function currentCellLabel(
  hud: number | null,
  ent: number | null
): string | null {
  if (hud === null || ent === null) return null;
  const z = findZone(hud, ent);
  return z ? z.label : null;
}

/** Diagnóstico corto de la zona nombrada actual. */
export function currentCellHint(
  hud: number | null,
  ent: number | null
): string | null {
  if (hud === null || ent === null) return null;
  const z = findZone(hud, ent);
  return z ? z.hint : null;
}
