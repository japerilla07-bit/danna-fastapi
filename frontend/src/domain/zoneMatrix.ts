// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz v4: grilla data-driven HUD×ENT (celdas 5×5)
// ════════════════════════════════════════════════════════════════════════
//
// GENERADA desde las sesiones reales (269 celdas pobladas de 400).
// Cada celda de 5 puntos de HUD × 5 de ENT guarda el WR MEDIDO por mercado
// y su nº de giros. El estado (SANTUARIO/VERDE/PROBE/TOXICA/AGUJERO) sale
// directo del WR medido; celdas con < 6 giros = NEUTRA (dato casi nulo).
//
// A medida que entren más sesiones se regenera esta tabla y se confirman o
// tumban celdas. Break-even TOP-2 = 66,67%.
//
// Umbrales de estado por WR:
//   SANTUARIO ≥ 73   VERDE ≥ 66,67   PROBE ≥ 60   TOXICA ≥ 50   AGUJERO < 50
//
// El motor apuesta siempre BET; el ZoneChip es solo lectura.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';

/** Giros mínimos en una celda para emitir estado; menos = NEUTRA. */
export const MIN_N = 6;

interface Cell { dWr: number | null; dN: number; cWr: number | null; cN: number; }

// Tabla clave `${hudBucket}_${entBucket}` (bucket = floor(valor / 5), 0..19)
const GRID: Record<string, Cell> = {
  '2_15': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '3_1': { dWr: 0.0, dN: 1, cWr: 0.0, cN: 1 },
  '3_2': { dWr: 100.0, dN: 1, cWr: 0.0, cN: 1 },
  '3_3': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '3_8': { dWr: 0.0, dN: 2, cWr: 50.0, cN: 2 },
  '3_9': { dWr: 66.7, dN: 3, cWr: 100.0, cN: 3 },
  '3_10': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '3_11': { dWr: 100.0, dN: 2, cWr: 100.0, cN: 2 },
  '3_13': { dWr: 100.0, dN: 4, cWr: 75.0, cN: 4 },
  '3_14': { dWr: 100.0, dN: 2, cWr: 0.0, cN: 2 },
  '3_16': { dWr: 100.0, dN: 4, cWr: 50.0, cN: 4 },
  '3_17': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '3_19': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '4_1': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '4_2': { dWr: 33.3, dN: 3, cWr: 33.3, cN: 3 },
  '4_3': { dWr: 66.7, dN: 3, cWr: 100.0, cN: 3 },
  '4_4': { dWr: 100.0, dN: 1, cWr: 0.0, cN: 1 },
  '4_5': { dWr: 60.0, dN: 5, cWr: 60.0, cN: 5 },
  '4_7': { dWr: 25.0, dN: 4, cWr: 25.0, cN: 4 },
  '4_8': { dWr: 100.0, dN: 1, cWr: 0.0, cN: 1 },
  '4_9': { dWr: 50.0, dN: 2, cWr: 100.0, cN: 2 },
  '4_10': { dWr: 50.0, dN: 2, cWr: 50.0, cN: 2 },
  '4_11': { dWr: 50.0, dN: 4, cWr: 75.0, cN: 4 },
  '4_12': { dWr: 100.0, dN: 3, cWr: 0.0, cN: 3 },
  '4_13': { dWr: 0.0, dN: 3, cWr: 33.3, cN: 3 },
  '4_14': { dWr: 50.0, dN: 4, cWr: 50.0, cN: 4 },
  '4_15': { dWr: 33.3, dN: 3, cWr: 66.7, cN: 3 },
  '4_16': { dWr: 40.0, dN: 5, cWr: 80.0, cN: 5 },
  '4_17': { dWr: 28.6, dN: 7, cWr: 42.9, cN: 7 },
  '4_18': { dWr: 66.7, dN: 3, cWr: 66.7, cN: 3 },
  '4_19': { dWr: 100.0, dN: 2, cWr: 0.0, cN: 2 },
  '5_0': { dWr: 50.0, dN: 4, cWr: 75.0, cN: 4 },
  '5_1': { dWr: 60.0, dN: 5, cWr: 60.0, cN: 5 },
  '5_2': { dWr: 0.0, dN: 1, cWr: 0.0, cN: 1 },
  '5_3': { dWr: 60.0, dN: 5, cWr: 80.0, cN: 5 },
  '5_4': { dWr: 50.0, dN: 4, cWr: 75.0, cN: 4 },
  '5_5': { dWr: 50.0, dN: 2, cWr: 100.0, cN: 2 },
  '5_6': { dWr: 33.3, dN: 3, cWr: 33.3, cN: 3 },
  '5_7': { dWr: 66.7, dN: 3, cWr: 100.0, cN: 3 },
  '5_8': { dWr: 100.0, dN: 8, cWr: 87.5, cN: 8 },
  '5_9': { dWr: 75.0, dN: 8, cWr: 62.5, cN: 8 },
  '5_10': { dWr: 54.5, dN: 11, cWr: 72.7, cN: 11 },
  '5_11': { dWr: 61.5, dN: 13, cWr: 61.5, cN: 13 },
  '5_12': { dWr: 75.0, dN: 4, cWr: 75.0, cN: 4 },
  '5_13': { dWr: 90.0, dN: 10, cWr: 60.0, cN: 10 },
  '5_14': { dWr: 63.6, dN: 11, cWr: 45.5, cN: 11 },
  '5_15': { dWr: 42.9, dN: 7, cWr: 71.4, cN: 7 },
  '5_16': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '5_17': { dWr: 83.3, dN: 6, cWr: 100.0, cN: 6 },
  '5_18': { dWr: 83.3, dN: 6, cWr: 83.3, cN: 6 },
  '5_19': { dWr: 66.7, dN: 3, cWr: 33.3, cN: 3 },
  '6_0': { dWr: 100.0, dN: 3, cWr: 66.7, cN: 3 },
  '6_1': { dWr: 66.7, dN: 6, cWr: 50.0, cN: 6 },
  '6_2': { dWr: 90.9, dN: 11, cWr: 45.5, cN: 11 },
  '6_3': { dWr: 69.2, dN: 13, cWr: 61.5, cN: 13 },
  '6_4': { dWr: 56.2, dN: 16, cWr: 68.8, cN: 16 },
  '6_5': { dWr: 100.0, dN: 6, cWr: 66.7, cN: 6 },
  '6_6': { dWr: 81.8, dN: 11, cWr: 63.6, cN: 11 },
  '6_7': { dWr: 83.3, dN: 12, cWr: 58.3, cN: 12 },
  '6_8': { dWr: 81.8, dN: 11, cWr: 63.6, cN: 11 },
  '6_9': { dWr: 87.5, dN: 8, cWr: 75.0, cN: 8 },
  '6_10': { dWr: 56.2, dN: 16, cWr: 62.5, cN: 16 },
  '6_11': { dWr: 66.7, dN: 15, cWr: 53.3, cN: 15 },
  '6_12': { dWr: 50.0, dN: 12, cWr: 75.0, cN: 12 },
  '6_13': { dWr: 78.6, dN: 14, cWr: 71.4, cN: 14 },
  '6_14': { dWr: 60.0, dN: 15, cWr: 86.7, cN: 15 },
  '6_15': { dWr: 50.0, dN: 20, cWr: 60.0, cN: 20 },
  '6_16': { dWr: 76.9, dN: 13, cWr: 53.8, cN: 13 },
  '6_17': { dWr: 83.3, dN: 12, cWr: 58.3, cN: 12 },
  '6_18': { dWr: 63.6, dN: 11, cWr: 90.9, cN: 11 },
  '6_19': { dWr: 33.3, dN: 3, cWr: 66.7, cN: 3 },
  '7_0': { dWr: 80.0, dN: 15, cWr: 53.3, cN: 15 },
  '7_1': { dWr: 43.8, dN: 16, cWr: 62.5, cN: 16 },
  '7_2': { dWr: 85.7, dN: 14, cWr: 85.7, cN: 14 },
  '7_3': { dWr: 56.5, dN: 23, cWr: 52.2, cN: 23 },
  '7_4': { dWr: 78.3, dN: 23, cWr: 60.9, cN: 23 },
  '7_5': { dWr: 61.1, dN: 18, cWr: 61.1, cN: 18 },
  '7_6': { dWr: 60.9, dN: 23, cWr: 56.5, cN: 23 },
  '7_7': { dWr: 68.8, dN: 32, cWr: 78.1, cN: 32 },
  '7_8': { dWr: 66.7, dN: 21, cWr: 61.9, cN: 21 },
  '7_9': { dWr: 65.2, dN: 23, cWr: 65.2, cN: 23 },
  '7_10': { dWr: 55.6, dN: 18, cWr: 61.1, cN: 18 },
  '7_11': { dWr: 56.7, dN: 30, cWr: 73.3, cN: 30 },
  '7_12': { dWr: 67.6, dN: 34, cWr: 64.7, cN: 34 },
  '7_13': { dWr: 67.9, dN: 28, cWr: 71.4, cN: 28 },
  '7_14': { dWr: 72.4, dN: 29, cWr: 58.6, cN: 29 },
  '7_15': { dWr: 73.7, dN: 38, cWr: 60.5, cN: 38 },
  '7_16': { dWr: 74.1, dN: 27, cWr: 70.4, cN: 27 },
  '7_17': { dWr: 60.0, dN: 20, cWr: 60.0, cN: 20 },
  '7_18': { dWr: 87.5, dN: 8, cWr: 87.5, cN: 8 },
  '7_19': { dWr: 80.0, dN: 5, cWr: 40.0, cN: 5 },
  '8_0': { dWr: 60.0, dN: 10, cWr: 100.0, cN: 10 },
  '8_1': { dWr: 48.0, dN: 25, cWr: 60.0, cN: 25 },
  '8_2': { dWr: 79.2, dN: 24, cWr: 75.0, cN: 24 },
  '8_3': { dWr: 66.7, dN: 36, cWr: 75.0, cN: 36 },
  '8_4': { dWr: 65.9, dN: 44, cWr: 77.3, cN: 44 },
  '8_5': { dWr: 69.2, dN: 26, cWr: 76.9, cN: 26 },
  '8_6': { dWr: 81.8, dN: 33, cWr: 84.8, cN: 33 },
  '8_7': { dWr: 68.9, dN: 45, cWr: 62.2, cN: 45 },
  '8_8': { dWr: 69.6, dN: 46, cWr: 76.1, cN: 46 },
  '8_9': { dWr: 51.9, dN: 54, cWr: 59.3, cN: 54 },
  '8_10': { dWr: 65.2, dN: 46, cWr: 69.6, cN: 46 },
  '8_11': { dWr: 60.6, dN: 33, cWr: 81.8, cN: 33 },
  '8_12': { dWr: 57.8, dN: 45, cWr: 73.3, cN: 45 },
  '8_13': { dWr: 57.1, dN: 28, cWr: 39.3, cN: 28 },
  '8_14': { dWr: 67.5, dN: 40, cWr: 62.5, cN: 40 },
  '8_15': { dWr: 64.3, dN: 28, cWr: 64.3, cN: 28 },
  '8_16': { dWr: 87.0, dN: 23, cWr: 73.9, cN: 23 },
  '8_17': { dWr: 14.3, dN: 7, cWr: 42.9, cN: 7 },
  '8_18': { dWr: 41.7, dN: 12, cWr: 66.7, cN: 12 },
  '8_19': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '9_0': { dWr: 73.3, dN: 15, cWr: 66.7, cN: 15 },
  '9_1': { dWr: 60.0, dN: 35, cWr: 68.6, cN: 35 },
  '9_2': { dWr: 57.6, dN: 33, cWr: 57.6, cN: 33 },
  '9_3': { dWr: 72.9, dN: 48, cWr: 56.2, cN: 48 },
  '9_4': { dWr: 74.0, dN: 50, cWr: 70.0, cN: 50 },
  '9_5': { dWr: 81.8, dN: 44, cWr: 70.5, cN: 44 },
  '9_6': { dWr: 73.7, dN: 38, cWr: 65.8, cN: 38 },
  '9_7': { dWr: 65.4, dN: 52, cWr: 57.7, cN: 52 },
  '9_8': { dWr: 56.9, dN: 51, cWr: 49.0, cN: 51 },
  '9_9': { dWr: 68.3, dN: 60, cWr: 63.3, cN: 60 },
  '9_10': { dWr: 69.2, dN: 39, cWr: 64.1, cN: 39 },
  '9_11': { dWr: 69.4, dN: 49, cWr: 61.2, cN: 49 },
  '9_12': { dWr: 68.4, dN: 38, cWr: 65.8, cN: 38 },
  '9_13': { dWr: 74.2, dN: 31, cWr: 71.0, cN: 31 },
  '9_14': { dWr: 69.6, dN: 23, cWr: 60.9, cN: 23 },
  '9_15': { dWr: 72.7, dN: 22, cWr: 54.5, cN: 22 },
  '9_16': { dWr: 50.0, dN: 8, cWr: 75.0, cN: 8 },
  '9_17': { dWr: 57.1, dN: 7, cWr: 71.4, cN: 7 },
  '9_18': { dWr: 50.0, dN: 2, cWr: 100.0, cN: 2 },
  '9_19': { dWr: 100.0, dN: 2, cWr: 50.0, cN: 2 },
  '10_0': { dWr: 62.1, dN: 29, cWr: 65.5, cN: 29 },
  '10_1': { dWr: 62.5, dN: 40, cWr: 80.0, cN: 40 },
  '10_2': { dWr: 67.9, dN: 28, cWr: 53.6, cN: 28 },
  '10_3': { dWr: 67.4, dN: 46, cWr: 71.7, cN: 46 },
  '10_4': { dWr: 66.7, dN: 63, cWr: 58.7, cN: 63 },
  '10_5': { dWr: 64.8, dN: 54, cWr: 61.1, cN: 54 },
  '10_6': { dWr: 61.5, dN: 52, cWr: 69.2, cN: 52 },
  '10_7': { dWr: 58.9, dN: 56, cWr: 67.9, cN: 56 },
  '10_8': { dWr: 63.6, dN: 55, cWr: 45.5, cN: 55 },
  '10_9': { dWr: 71.4, dN: 49, cWr: 59.2, cN: 49 },
  '10_10': { dWr: 74.4, dN: 39, cWr: 76.9, cN: 39 },
  '10_11': { dWr: 65.5, dN: 29, cWr: 51.7, cN: 29 },
  '10_12': { dWr: 65.4, dN: 26, cWr: 65.4, cN: 26 },
  '10_13': { dWr: 52.9, dN: 17, cWr: 76.5, cN: 17 },
  '10_14': { dWr: 55.6, dN: 9, cWr: 100.0, cN: 9 },
  '10_15': { dWr: 33.3, dN: 3, cWr: 66.7, cN: 3 },
  '10_17': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '10_18': { dWr: 50.0, dN: 2, cWr: 50.0, cN: 2 },
  '11_0': { dWr: 60.4, dN: 53, cWr: 71.7, cN: 53 },
  '11_1': { dWr: 70.1, dN: 67, cWr: 59.7, cN: 67 },
  '11_2': { dWr: 72.7, dN: 33, cWr: 66.7, cN: 33 },
  '11_3': { dWr: 62.3, dN: 61, cWr: 75.4, cN: 61 },
  '11_4': { dWr: 63.4, dN: 82, cWr: 62.2, cN: 82 },
  '11_5': { dWr: 65.0, dN: 60, cWr: 60.0, cN: 60 },
  '11_6': { dWr: 56.2, dN: 48, cWr: 58.3, cN: 48 },
  '11_7': { dWr: 75.7, dN: 37, cWr: 59.5, cN: 37 },
  '11_8': { dWr: 67.4, dN: 43, cWr: 74.4, cN: 43 },
  '11_9': { dWr: 48.0, dN: 25, cWr: 60.0, cN: 25 },
  '11_10': { dWr: 76.9, dN: 13, cWr: 76.9, cN: 13 },
  '11_11': { dWr: 33.3, dN: 9, cWr: 44.4, cN: 9 },
  '11_12': { dWr: 100.0, dN: 4, cWr: 75.0, cN: 4 },
  '11_13': { dWr: 50.0, dN: 2, cWr: 50.0, cN: 2 },
  '11_14': { dWr: 100.0, dN: 5, cWr: 20.0, cN: 5 },
  '11_16': { dWr: 100.0, dN: 2, cWr: 50.0, cN: 2 },
  '11_18': { dWr: 100.0, dN: 2, cWr: 50.0, cN: 2 },
  '11_19': { dWr: 0.0, dN: 1, cWr: 0.0, cN: 1 },
  '12_0': { dWr: 66.7, dN: 24, cWr: 58.3, cN: 24 },
  '12_1': { dWr: 71.7, dN: 53, cWr: 69.8, cN: 53 },
  '12_2': { dWr: 60.0, dN: 50, cWr: 72.0, cN: 50 },
  '12_3': { dWr: 68.1, dN: 69, cWr: 63.8, cN: 69 },
  '12_4': { dWr: 69.4, dN: 62, cWr: 58.1, cN: 62 },
  '12_5': { dWr: 81.0, dN: 21, cWr: 90.5, cN: 21 },
  '12_6': { dWr: 66.7, dN: 12, cWr: 58.3, cN: 12 },
  '12_7': { dWr: 69.2, dN: 13, cWr: 61.5, cN: 13 },
  '12_8': { dWr: 60.0, dN: 10, cWr: 70.0, cN: 10 },
  '12_9': { dWr: 66.7, dN: 6, cWr: 66.7, cN: 6 },
  '12_10': { dWr: 66.7, dN: 3, cWr: 100.0, cN: 3 },
  '12_11': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '12_12': { dWr: 66.7, dN: 3, cWr: 33.3, cN: 3 },
  '12_13': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '12_15': { dWr: 66.7, dN: 3, cWr: 33.3, cN: 3 },
  '12_16': { dWr: 50.0, dN: 2, cWr: 50.0, cN: 2 },
  '12_17': { dWr: 100.0, dN: 3, cWr: 66.7, cN: 3 },
  '12_18': { dWr: 100.0, dN: 2, cWr: 100.0, cN: 2 },
  '13_0': { dWr: 65.6, dN: 32, cWr: 65.6, cN: 32 },
  '13_1': { dWr: 60.0, dN: 45, cWr: 60.0, cN: 45 },
  '13_2': { dWr: 70.4, dN: 27, cWr: 63.0, cN: 27 },
  '13_3': { dWr: 70.3, dN: 37, cWr: 56.8, cN: 37 },
  '13_4': { dWr: 57.1, dN: 21, cWr: 66.7, cN: 21 },
  '13_5': { dWr: 75.0, dN: 16, cWr: 50.0, cN: 16 },
  '13_6': { dWr: 80.0, dN: 5, cWr: 40.0, cN: 5 },
  '13_7': { dWr: 66.7, dN: 3, cWr: 66.7, cN: 3 },
  '13_8': { dWr: 83.3, dN: 6, cWr: 50.0, cN: 6 },
  '13_9': { dWr: 60.0, dN: 5, cWr: 60.0, cN: 5 },
  '13_10': { dWr: 80.0, dN: 5, cWr: 60.0, cN: 5 },
  '13_11': { dWr: 100.0, dN: 2, cWr: 0.0, cN: 2 },
  '13_12': { dWr: 100.0, dN: 2, cWr: 100.0, cN: 2 },
  '13_13': { dWr: 0.0, dN: 2, cWr: 100.0, cN: 2 },
  '13_14': { dWr: 40.0, dN: 5, cWr: 60.0, cN: 5 },
  '13_15': { dWr: 100.0, dN: 1, cWr: 0.0, cN: 1 },
  '13_16': { dWr: 0.0, dN: 2, cWr: 50.0, cN: 2 },
  '13_18': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '13_19': { dWr: 0.0, dN: 1, cWr: 0.0, cN: 1 },
  '14_0': { dWr: 77.8, dN: 18, cWr: 50.0, cN: 18 },
  '14_1': { dWr: 51.7, dN: 29, cWr: 55.2, cN: 29 },
  '14_2': { dWr: 52.6, dN: 19, cWr: 89.5, cN: 19 },
  '14_3': { dWr: 54.5, dN: 22, cWr: 54.5, cN: 22 },
  '14_4': { dWr: 57.9, dN: 19, cWr: 57.9, cN: 19 },
  '14_5': { dWr: 73.7, dN: 19, cWr: 84.2, cN: 19 },
  '14_6': { dWr: 75.0, dN: 12, cWr: 66.7, cN: 12 },
  '14_7': { dWr: 50.0, dN: 6, cWr: 33.3, cN: 6 },
  '14_8': { dWr: 50.0, dN: 8, cWr: 87.5, cN: 8 },
  '14_9': { dWr: 77.8, dN: 9, cWr: 66.7, cN: 9 },
  '14_10': { dWr: 100.0, dN: 4, cWr: 100.0, cN: 4 },
  '14_11': { dWr: 100.0, dN: 4, cWr: 75.0, cN: 4 },
  '14_12': { dWr: 100.0, dN: 4, cWr: 75.0, cN: 4 },
  '14_13': { dWr: 66.7, dN: 9, cWr: 55.6, cN: 9 },
  '14_15': { dWr: 50.0, dN: 4, cWr: 75.0, cN: 4 },
  '14_16': { dWr: 33.3, dN: 3, cWr: 66.7, cN: 3 },
  '14_17': { dWr: 33.3, dN: 3, cWr: 100.0, cN: 3 },
  '14_18': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '15_0': { dWr: 60.7, dN: 28, cWr: 53.6, cN: 28 },
  '15_1': { dWr: 64.9, dN: 37, cWr: 75.7, cN: 37 },
  '15_2': { dWr: 85.7, dN: 21, cWr: 76.2, cN: 21 },
  '15_3': { dWr: 86.4, dN: 22, cWr: 54.5, cN: 22 },
  '15_4': { dWr: 61.9, dN: 21, cWr: 61.9, cN: 21 },
  '15_5': { dWr: 55.6, dN: 9, cWr: 33.3, cN: 9 },
  '15_6': { dWr: 63.6, dN: 11, cWr: 72.7, cN: 11 },
  '15_7': { dWr: 62.5, dN: 8, cWr: 62.5, cN: 8 },
  '15_8': { dWr: 25.0, dN: 4, cWr: 100.0, cN: 4 },
  '15_9': { dWr: 75.0, dN: 8, cWr: 62.5, cN: 8 },
  '15_10': { dWr: 57.1, dN: 7, cWr: 85.7, cN: 7 },
  '15_12': { dWr: 100.0, dN: 3, cWr: 66.7, cN: 3 },
  '15_13': { dWr: 100.0, dN: 2, cWr: 50.0, cN: 2 },
  '15_14': { dWr: 100.0, dN: 1, cWr: 0.0, cN: 1 },
  '16_0': { dWr: 69.2, dN: 26, cWr: 69.2, cN: 26 },
  '16_1': { dWr: 58.8, dN: 34, cWr: 64.7, cN: 34 },
  '16_2': { dWr: 71.4, dN: 21, cWr: 81.0, cN: 21 },
  '16_3': { dWr: 57.9, dN: 19, cWr: 68.4, cN: 19 },
  '16_4': { dWr: 61.5, dN: 13, cWr: 84.6, cN: 13 },
  '16_5': { dWr: 0.0, dN: 3, cWr: 100.0, cN: 3 },
  '16_6': { dWr: 50.0, dN: 4, cWr: 75.0, cN: 4 },
  '16_7': { dWr: 50.0, dN: 2, cWr: 100.0, cN: 2 },
  '16_8': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '16_9': { dWr: 66.7, dN: 3, cWr: 33.3, cN: 3 },
  '16_10': { dWr: 100.0, dN: 2, cWr: 50.0, cN: 2 },
  '16_11': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '17_0': { dWr: 58.8, dN: 17, cWr: 64.7, cN: 17 },
  '17_1': { dWr: 55.6, dN: 18, cWr: 50.0, cN: 18 },
  '17_2': { dWr: 81.8, dN: 11, cWr: 63.6, cN: 11 },
  '17_3': { dWr: 44.4, dN: 9, cWr: 55.6, cN: 9 },
  '17_4': { dWr: 50.0, dN: 8, cWr: 62.5, cN: 8 },
  '17_5': { dWr: 50.0, dN: 2, cWr: 50.0, cN: 2 },
  '17_6': { dWr: 50.0, dN: 2, cWr: 50.0, cN: 2 },
  '17_7': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '17_8': { dWr: 0.0, dN: 1, cWr: 0.0, cN: 1 },
  '17_9': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '17_10': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '18_0': { dWr: 56.2, dN: 16, cWr: 62.5, cN: 16 },
  '18_1': { dWr: 72.7, dN: 11, cWr: 27.3, cN: 11 },
  '18_2': { dWr: 28.6, dN: 7, cWr: 57.1, cN: 7 },
  '18_3': { dWr: 40.0, dN: 5, cWr: 100.0, cN: 5 },
  '18_4': { dWr: 50.0, dN: 2, cWr: 0.0, cN: 2 },
  '18_5': { dWr: 100.0, dN: 1, cWr: 100.0, cN: 1 },
  '19_0': { dWr: 88.9, dN: 9, cWr: 55.6, cN: 9 },
  '19_1': { dWr: 60.0, dN: 5, cWr: 40.0, cN: 5 },
  '19_2': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
  '19_3': { dWr: 0.0, dN: 1, cWr: 100.0, cN: 1 },
};

// ────────────────────────────────────────────────────────────────────────
// Lookup
// ────────────────────────────────────────────────────────────────────────

function bucket(v: number): number {
  const b = Math.floor(v / 5);
  return b < 0 ? 0 : b > 19 ? 19 : b;
}

function cellAt(hud: number | null, ent: number | null): Cell | null {
  if (hud === null || ent === null) return null;
  return GRID[`${bucket(hud)}_${bucket(ent)}`] ?? null;
}

function kindFromWr(wr: number | null, n: number): Zone {
  if (wr === null || n < MIN_N) return 'NEUTRA';
  if (wr >= 73) return 'SANTUARIO';
  if (wr >= 66.67) return 'VERDE';
  if (wr >= 60) return 'PROBE';
  if (wr >= 50) return 'TOXICA';
  return 'AGUJERO';
}

// ────────────────────────────────────────────────────────────────────────
// API (misma firma que v3 — ZoneChip y store no cambian)
// ────────────────────────────────────────────────────────────────────────

export function classifyZone(hud: number | null, ent: number | null, mkt: Market): Zone {
  const c = cellAt(hud, ent);
  if (!c) return 'NEUTRA';
  return mkt === 'doc' ? kindFromWr(c.dWr, c.dN) : kindFromWr(c.cWr, c.cN);
}

export function currentCellWr(hud: number | null, ent: number | null, mkt: Market): number | null {
  const c = cellAt(hud, ent);
  if (!c) return null;
  const wr = mkt === 'doc' ? c.dWr : c.cWr;
  const n  = mkt === 'doc' ? c.dN  : c.cN;
  return n >= MIN_N ? wr : null;
}

/** Nº de giros de la celda para el mercado (transparencia de confianza). */
export function currentCellN(hud: number | null, ent: number | null, mkt: Market): number {
  const c = cellAt(hud, ent);
  if (!c) return 0;
  return mkt === 'doc' ? c.dN : c.cN;
}

export function currentCellLabel(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  const hb = bucket(hud), eb = bucket(ent);
  return `HUD ${hb * 5}-${hb * 5 + 4} · ENT ${eb * 5}-${eb * 5 + 4}`;
}

export function currentCellHint(hud: number | null, ent: number | null): string | null {
  const c = cellAt(hud, ent);
  if (!c) return 'sin datos en esta celda';
  const parts: string[] = [];
  if (c.dN > 0) parts.push(`DOC ${c.dWr}% (${c.dN}g)`);
  if (c.cN > 0) parts.push(`COL ${c.cWr}% (${c.cN}g)`);
  const lowN = Math.max(c.dN, c.cN) < MIN_N;
  return parts.join(' · ') + (lowN ? ' — pocos datos' : '');
}
