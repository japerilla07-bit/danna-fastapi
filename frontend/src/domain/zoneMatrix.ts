// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz v5: RIESGO DE RACHA + acierto (grilla HUD×ENT 5×5)
// ════════════════════════════════════════════════════════════════════════
//
// GENERADA desde 13 sesiones (276 celdas de 400).
// El estado se decide por dónde los errores NO se amontonan y además se
// acierta. Por celda: acierto = h/n · racha máx = tanda de errores más larga.
//
// Estados (prioridad: evitar tandas largas):
//   AGUJERO   racha máx ≥ 6      TOXICA  racha máx = 5, o acierto < 55%
//   PROBE     acierto 55-59%     VERDE   racha ≤ 4 y acierto ≥ 60%
//   SANTUARIO racha ≤ 3 y acierto ≥ 66%   NEUTRA  < 6 giros
//
// Se regenera con cada tanda de sesiones nuevas. El motor apuesta siempre
// BET; el panel es solo lectura.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';

export const MIN_N = 6;

interface Cell {
  dN: number; dH: number; dMx: number; dR: number;
  cN: number; cH: number; cMx: number; cR: number;
}

const GRID: Record<string, Cell> = {
  '2_8': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '2_15': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '3_1': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '3_2': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '3_3': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '3_8': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:1, cMx:1, cR:1 },
  '3_9': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '3_10': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '3_11': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '3_13': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '3_14': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '3_15': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '3_16': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:2, cMx:1, cR:2 },
  '3_17': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '3_19': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '4_1': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '4_2': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:1, cMx:1, cR:2 },
  '4_3': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '4_4': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '4_5': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:3, cMx:1, cR:2 },
  '4_7': { dN:5, dH:1, dMx:1, dR:4, cN:5, cH:2, cMx:1, cR:3 },
  '4_8': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '4_9': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '4_10': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:2, cMx:1, cR:1 },
  '4_11': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '4_12': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:0, cMx:2, cR:2 },
  '4_13': { dN:3, dH:0, dMx:1, dR:3, cN:3, cH:1, cMx:1, cR:2 },
  '4_14': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:2, cMx:1, cR:2 },
  '4_15': { dN:4, dH:2, dMx:2, dR:1, cN:4, cH:2, cMx:1, cR:2 },
  '4_16': { dN:5, dH:2, dMx:2, dR:2, cN:5, cH:4, cMx:1, cR:1 },
  '4_17': { dN:7, dH:2, dMx:2, dR:4, cN:7, cH:3, cMx:1, cR:4 },
  '4_18': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:2, cMx:1, cR:1 },
  '4_19': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '5_0': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '5_1': { dN:6, dH:3, dMx:2, dR:2, cN:6, cH:4, cMx:1, cR:2 },
  '5_2': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '5_3': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:4, cMx:1, cR:1 },
  '5_4': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '5_5': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '5_6': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:1, cMx:2, cR:2 },
  '5_7': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '5_8': { dN:8, dH:8, dMx:0, dR:0, cN:8, cH:7, cMx:1, cR:1 },
  '5_9': { dN:8, dH:6, dMx:1, dR:2, cN:8, cH:5, cMx:1, cR:3 },
  '5_10': { dN:11, dH:6, dMx:1, dR:5, cN:11, cH:8, cMx:2, cR:2 },
  '5_11': { dN:13, dH:8, dMx:2, dR:4, cN:13, cH:8, cMx:2, cR:4 },
  '5_12': { dN:7, dH:3, dMx:2, dR:3, cN:7, cH:5, cMx:1, cR:2 },
  '5_13': { dN:10, dH:9, dMx:1, dR:1, cN:10, cH:6, cMx:1, cR:4 },
  '5_14': { dN:12, dH:8, dMx:1, dR:4, cN:12, cH:5, cMx:2, cR:5 },
  '5_15': { dN:9, dH:4, dMx:1, dR:5, cN:9, cH:6, cMx:1, cR:3 },
  '5_16': { dN:4, dH:2, dMx:2, dR:1, cN:4, cH:3, cMx:1, cR:1 },
  '5_17': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:6, cMx:0, cR:0 },
  '5_18': { dN:7, dH:5, dMx:1, dR:2, cN:7, cH:5, cMx:1, cR:2 },
  '5_19': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '6_0': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '6_1': { dN:10, dH:6, dMx:1, dR:4, cN:10, cH:7, cMx:1, cR:3 },
  '6_2': { dN:11, dH:10, dMx:1, dR:1, cN:11, cH:5, cMx:2, cR:5 },
  '6_3': { dN:14, dH:10, dMx:2, dR:3, cN:14, cH:8, cMx:2, cR:5 },
  '6_4': { dN:17, dH:9, dMx:1, dR:8, cN:17, cH:11, cMx:1, cR:6 },
  '6_5': { dN:8, dH:8, dMx:0, dR:0, cN:8, cH:5, cMx:1, cR:3 },
  '6_6': { dN:11, dH:9, dMx:1, dR:2, cN:11, cH:7, cMx:1, cR:4 },
  '6_7': { dN:14, dH:10, dMx:2, dR:3, cN:14, cH:9, cMx:1, cR:5 },
  '6_8': { dN:13, dH:10, dMx:1, dR:3, cN:13, cH:9, cMx:1, cR:4 },
  '6_9': { dN:9, dH:8, dMx:1, dR:1, cN:9, cH:7, cMx:1, cR:2 },
  '6_10': { dN:16, dH:9, dMx:2, dR:6, cN:16, cH:10, cMx:2, cR:5 },
  '6_11': { dN:16, dH:11, dMx:2, dR:4, cN:16, cH:9, cMx:3, cR:4 },
  '6_12': { dN:16, dH:9, dMx:2, dR:6, cN:16, cH:12, cMx:1, cR:4 },
  '6_13': { dN:17, dH:14, dMx:2, dR:2, cN:17, cH:11, cMx:2, cR:5 },
  '6_14': { dN:15, dH:9, dMx:1, dR:6, cN:15, cH:13, cMx:1, cR:2 },
  '6_15': { dN:24, dH:13, dMx:3, dR:8, cN:24, cH:14, cMx:2, cR:8 },
  '6_16': { dN:14, dH:11, dMx:1, dR:3, cN:14, cH:8, cMx:3, cR:4 },
  '6_17': { dN:13, dH:11, dMx:1, dR:2, cN:13, cH:8, cMx:2, cR:3 },
  '6_18': { dN:12, dH:8, dMx:1, dR:4, cN:12, cH:11, cMx:1, cR:1 },
  '6_19': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '7_0': { dN:17, dH:14, dMx:1, dR:3, cN:17, cH:10, cMx:1, cR:7 },
  '7_1': { dN:21, dH:7, dMx:3, dR:10, cN:21, cH:14, cMx:1, cR:7 },
  '7_2': { dN:15, dH:12, dMx:1, dR:3, cN:15, cH:13, cMx:1, cR:2 },
  '7_3': { dN:26, dH:16, dMx:2, dR:8, cN:26, cH:14, cMx:2, cR:8 },
  '7_4': { dN:27, dH:21, dMx:1, dR:6, cN:27, cH:16, cMx:1, cR:11 },
  '7_5': { dN:18, dH:11, dMx:2, dR:6, cN:18, cH:11, cMx:2, cR:6 },
  '7_6': { dN:28, dH:19, dMx:3, dR:6, cN:28, cH:16, cMx:3, cR:10 },
  '7_7': { dN:33, dH:23, dMx:2, dR:8, cN:33, cH:26, cMx:2, cR:6 },
  '7_8': { dN:23, dH:15, dMx:2, dR:7, cN:23, cH:15, cMx:1, cR:8 },
  '7_9': { dN:26, dH:18, dMx:1, dR:8, cN:26, cH:17, cMx:2, cR:7 },
  '7_10': { dN:24, dH:15, dMx:2, dR:7, cN:24, cH:15, cMx:2, cR:8 },
  '7_11': { dN:31, dH:18, dMx:3, dR:11, cN:31, cH:22, cMx:2, cR:8 },
  '7_12': { dN:39, dH:26, dMx:2, dR:11, cN:39, cH:25, cMx:3, cR:9 },
  '7_13': { dN:30, dH:21, dMx:2, dR:8, cN:30, cH:21, cMx:2, cR:8 },
  '7_14': { dN:30, dH:21, dMx:2, dR:7, cN:30, cH:17, cMx:2, cR:12 },
  '7_15': { dN:41, dH:30, dMx:2, dR:9, cN:41, cH:25, cMx:4, cR:12 },
  '7_16': { dN:34, dH:22, dMx:2, dR:9, cN:34, cH:21, cMx:2, cR:10 },
  '7_17': { dN:21, dH:13, dMx:3, dR:5, cN:21, cH:12, cMx:4, cR:5 },
  '7_18': { dN:11, dH:9, dMx:1, dR:2, cN:11, cH:8, cMx:1, cR:3 },
  '7_19': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:2, cMx:2, cR:2 },
  '8_0': { dN:21, dH:15, dMx:1, dR:6, cN:21, cH:15, cMx:2, cR:4 },
  '8_1': { dN:34, dH:19, dMx:3, dR:11, cN:34, cH:20, cMx:3, cR:8 },
  '8_2': { dN:30, dH:23, dMx:2, dR:6, cN:30, cH:24, cMx:1, cR:6 },
  '8_3': { dN:37, dH:25, dMx:2, dR:11, cN:37, cH:28, cMx:3, cR:6 },
  '8_4': { dN:49, dH:33, dMx:3, dR:12, cN:49, cH:38, cMx:2, cR:9 },
  '8_5': { dN:30, dH:21, dMx:2, dR:8, cN:30, cH:21, cMx:3, cR:6 },
  '8_6': { dN:40, dH:30, dMx:2, dR:9, cN:40, cH:30, cMx:4, cR:6 },
  '8_7': { dN:50, dH:35, dMx:2, dR:13, cN:50, cH:30, cMx:3, cR:13 },
  '8_8': { dN:51, dH:36, dMx:2, dR:13, cN:51, cH:40, cMx:2, cR:9 },
  '8_9': { dN:56, dH:29, dMx:3, dR:20, cN:56, cH:34, cMx:4, cR:13 },
  '8_10': { dN:48, dH:31, dMx:3, dR:10, cN:48, cH:32, cMx:3, cR:13 },
  '8_11': { dN:36, dH:23, dMx:4, dR:7, cN:36, cH:29, cMx:1, cR:7 },
  '8_12': { dN:50, dH:29, dMx:3, dR:15, cN:50, cH:36, cMx:2, cR:12 },
  '8_13': { dN:31, dH:18, dMx:3, dR:7, cN:31, cH:13, cMx:3, cR:12 },
  '8_14': { dN:44, dH:29, dMx:2, dR:13, cN:44, cH:27, cMx:2, cR:15 },
  '8_15': { dN:34, dH:22, dMx:2, dR:10, cN:34, cH:22, cMx:3, cR:10 },
  '8_16': { dN:26, dH:22, dMx:1, dR:4, cN:26, cH:19, cMx:2, cR:4 },
  '8_17': { dN:8, dH:1, dMx:2, dR:5, cN:8, cH:4, cMx:1, cR:4 },
  '8_18': { dN:13, dH:6, dMx:2, dR:6, cN:13, cH:8, cMx:2, cR:4 },
  '8_19': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '9_0': { dN:22, dH:16, dMx:2, dR:5, cN:22, cH:15, cMx:2, cR:6 },
  '9_1': { dN:41, dH:26, dMx:2, dR:13, cN:41, cH:28, cMx:2, cR:10 },
  '9_2': { dN:40, dH:23, dMx:4, dR:10, cN:40, cH:25, cMx:3, cR:10 },
  '9_3': { dN:55, dH:39, dMx:2, dR:14, cN:55, cH:33, cMx:4, cR:16 },
  '9_4': { dN:57, dH:41, dMx:2, dR:12, cN:57, cH:40, cMx:2, cR:13 },
  '9_5': { dN:53, dH:42, dMx:3, dR:8, cN:53, cH:39, cMx:3, cR:10 },
  '9_6': { dN:47, dH:36, dMx:2, dR:7, cN:47, cH:28, cMx:3, cR:12 },
  '9_7': { dN:55, dH:35, dMx:3, dR:16, cN:55, cH:32, cMx:3, cR:17 },
  '9_8': { dN:57, dH:31, dMx:4, dR:17, cN:57, cH:28, cMx:4, cR:17 },
  '9_9': { dN:68, dH:47, dMx:2, dR:18, cN:68, cH:44, cMx:2, cR:18 },
  '9_10': { dN:43, dH:30, dMx:2, dR:11, cN:43, cH:27, cMx:2, cR:13 },
  '9_11': { dN:52, dH:36, dMx:4, dR:11, cN:52, cH:32, cMx:5, cR:10 },
  '9_12': { dN:43, dH:29, dMx:4, dR:10, cN:43, cH:28, cMx:3, cR:12 },
  '9_13': { dN:33, dH:24, dMx:2, dR:8, cN:33, cH:24, cMx:1, cR:9 },
  '9_14': { dN:25, dH:18, dMx:2, dR:6, cN:25, cH:14, cMx:1, cR:11 },
  '9_15': { dN:26, dH:18, dMx:2, dR:7, cN:26, cH:16, cMx:3, cR:8 },
  '9_16': { dN:8, dH:4, dMx:2, dR:3, cN:8, cH:6, cMx:1, cR:2 },
  '9_17': { dN:7, dH:4, dMx:1, dR:3, cN:7, cH:5, cMx:1, cR:2 },
  '9_18': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '9_19': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '10_0': { dN:39, dH:25, dMx:2, dR:13, cN:39, cH:29, cMx:2, cR:9 },
  '10_1': { dN:46, dH:29, dMx:3, dR:14, cN:46, cH:36, cMx:2, cR:8 },
  '10_2': { dN:36, dH:22, dMx:3, dR:11, cN:36, cH:20, cMx:3, cR:11 },
  '10_3': { dN:58, dH:40, dMx:3, dR:15, cN:58, cH:42, cMx:3, cR:12 },
  '10_4': { dN:71, dH:46, dMx:4, dR:20, cN:71, cH:43, cMx:5, cR:15 },
  '10_5': { dN:58, dH:39, dMx:3, dR:16, cN:58, cH:35, cMx:3, cR:16 },
  '10_6': { dN:65, dH:41, dMx:3, dR:17, cN:65, cH:47, cMx:2, cR:13 },
  '10_7': { dN:63, dH:38, dMx:2, dR:16, cN:63, cH:43, cMx:3, cR:16 },
  '10_8': { dN:66, dH:37, dMx:5, dR:19, cN:66, cH:31, cMx:5, cR:18 },
  '10_9': { dN:59, dH:41, dMx:3, dR:13, cN:59, cH:36, cMx:5, cR:11 },
  '10_10': { dN:44, dH:33, dMx:2, dR:9, cN:44, cH:33, cMx:2, cR:8 },
  '10_11': { dN:32, dH:22, dMx:3, dR:8, cN:32, cH:17, cMx:3, cR:8 },
  '10_12': { dN:29, dH:19, dMx:2, dR:7, cN:29, cH:18, cMx:3, cR:7 },
  '10_13': { dN:20, dH:10, dMx:2, dR:9, cN:20, cH:15, cMx:2, cR:4 },
  '10_14': { dN:11, dH:5, dMx:2, dR:5, cN:11, cH:10, cMx:1, cR:1 },
  '10_15': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '10_17': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '10_18': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '11_0': { dN:64, dH:37, dMx:4, dR:19, cN:64, cH:42, cMx:3, cR:15 },
  '11_1': { dN:71, dH:49, dMx:4, dR:16, cN:71, cH:43, cMx:5, cR:18 },
  '11_2': { dN:49, dH:35, dMx:2, dR:12, cN:49, cH:32, cMx:3, cR:15 },
  '11_3': { dN:65, dH:39, dMx:3, dR:20, cN:65, cH:49, cMx:2, cR:12 },
  '11_4': { dN:90, dH:56, dMx:2, dR:26, cN:90, cH:55, cMx:5, cR:23 },
  '11_5': { dN:67, dH:43, dMx:2, dR:22, cN:67, cH:41, cMx:3, cR:18 },
  '11_6': { dN:58, dH:31, dMx:4, dR:18, cN:58, cH:36, cMx:3, cR:15 },
  '11_7': { dN:42, dH:31, dMx:2, dR:9, cN:42, cH:25, cMx:3, cR:11 },
  '11_8': { dN:51, dH:33, dMx:3, dR:13, cN:51, cH:37, cMx:2, cR:12 },
  '11_9': { dN:33, dH:17, dMx:3, dR:12, cN:33, cH:20, cMx:2, cR:9 },
  '11_10': { dN:15, dH:11, dMx:1, dR:4, cN:15, cH:12, cMx:1, cR:3 },
  '11_11': { dN:10, dH:4, dMx:2, dR:4, cN:10, cH:4, cMx:3, cR:4 },
  '11_12': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '11_13': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '11_14': { dN:5, dH:5, dMx:0, dR:0, cN:5, cH:1, cMx:3, cR:2 },
  '11_16': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '11_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '11_19': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '12_0': { dN:31, dH:20, dMx:2, dR:10, cN:31, cH:18, cMx:2, cR:10 },
  '12_1': { dN:66, dH:48, dMx:2, dR:15, cN:66, cH:46, cMx:2, cR:18 },
  '12_2': { dN:61, dH:37, dMx:3, dR:18, cN:61, cH:42, cMx:2, cR:16 },
  '12_3': { dN:76, dH:50, dMx:2, dR:22, cN:76, cH:48, cMx:3, cR:18 },
  '12_4': { dN:72, dH:48, dMx:3, dR:19, cN:72, cH:46, cMx:3, cR:16 },
  '12_5': { dN:27, dH:21, dMx:2, dR:5, cN:27, cH:22, cMx:2, cR:4 },
  '12_6': { dN:15, dH:10, dMx:1, dR:5, cN:15, cH:10, cMx:1, cR:5 },
  '12_7': { dN:15, dH:9, dMx:2, dR:5, cN:15, cH:10, cMx:1, cR:5 },
  '12_8': { dN:10, dH:6, dMx:2, dR:3, cN:10, cH:7, cMx:1, cR:3 },
  '12_9': { dN:6, dH:4, dMx:1, dR:2, cN:6, cH:4, cMx:1, cR:2 },
  '12_10': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '12_11': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '12_12': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '12_13': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '12_15': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:2, cMx:1, cR:2 },
  '12_16': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '12_17': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '12_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '13_0': { dN:39, dH:26, dMx:2, dR:12, cN:39, cH:24, cMx:3, cR:11 },
  '13_1': { dN:57, dH:35, dMx:3, dR:15, cN:57, cH:35, cMx:4, cR:15 },
  '13_2': { dN:36, dH:24, dMx:2, dR:11, cN:36, cH:22, cMx:3, cR:9 },
  '13_3': { dN:39, dH:26, dMx:2, dR:10, cN:39, cH:22, cMx:3, cR:12 },
  '13_4': { dN:23, dH:12, dMx:2, dR:9, cN:23, cH:14, cMx:2, cR:8 },
  '13_5': { dN:17, dH:13, dMx:2, dR:3, cN:17, cH:8, cMx:1, cR:9 },
  '13_6': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:2, cMx:2, cR:2 },
  '13_7': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:4, cMx:1, cR:1 },
  '13_8': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:3, cMx:1, cR:3 },
  '13_9': { dN:6, dH:4, dMx:1, dR:2, cN:6, cH:4, cMx:1, cR:2 },
  '13_10': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:4, cMx:2, cR:1 },
  '13_11': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '13_12': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '13_13': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '13_14': { dN:5, dH:2, dMx:2, dR:2, cN:5, cH:3, cMx:2, cR:1 },
  '13_15': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '13_16': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:1, cMx:1, cR:1 },
  '13_17': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '13_18': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '13_19': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '14_0': { dN:27, dH:21, dMx:2, dR:5, cN:27, cH:15, cMx:2, cR:9 },
  '14_1': { dN:35, dH:17, dMx:4, dR:11, cN:35, cH:18, cMx:3, cR:11 },
  '14_2': { dN:20, dH:11, dMx:4, dR:5, cN:20, cH:18, cMx:1, cR:2 },
  '14_3': { dN:25, dH:15, dMx:2, dR:8, cN:25, cH:12, cMx:3, cR:7 },
  '14_4': { dN:21, dH:13, dMx:2, dR:7, cN:21, cH:13, cMx:2, cR:6 },
  '14_5': { dN:22, dH:17, dMx:2, dR:4, cN:22, cH:17, cMx:2, cR:4 },
  '14_6': { dN:13, dH:10, dMx:1, dR:3, cN:13, cH:9, cMx:1, cR:4 },
  '14_7': { dN:9, dH:5, dMx:2, dR:3, cN:9, cH:2, cMx:2, cR:5 },
  '14_8': { dN:9, dH:4, dMx:1, dR:5, cN:9, cH:8, cMx:1, cR:1 },
  '14_9': { dN:9, dH:7, dMx:1, dR:2, cN:9, cH:6, cMx:1, cR:3 },
  '14_10': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:4, cMx:0, cR:0 },
  '14_11': { dN:5, dH:5, dMx:0, dR:0, cN:5, cH:4, cMx:1, cR:1 },
  '14_12': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '14_13': { dN:10, dH:7, dMx:2, dR:2, cN:10, cH:6, cMx:2, cR:3 },
  '14_14': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:3, cMx:0, cR:0 },
  '14_15': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '14_16': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '14_17': { dN:4, dH:1, dMx:1, dR:3, cN:4, cH:4, cMx:0, cR:0 },
  '14_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '15_0': { dN:38, dH:23, dMx:3, dR:8, cN:38, cH:19, cMx:3, cR:13 },
  '15_1': { dN:41, dH:28, dMx:2, dR:11, cN:41, cH:30, cMx:2, cR:9 },
  '15_2': { dN:24, dH:21, dMx:1, dR:3, cN:24, cH:18, cMx:1, cR:6 },
  '15_3': { dN:25, dH:22, dMx:1, dR:3, cN:25, cH:12, cMx:2, cR:9 },
  '15_4': { dN:24, dH:14, dMx:2, dR:8, cN:24, cH:15, cMx:3, cR:7 },
  '15_5': { dN:12, dH:6, dMx:2, dR:5, cN:12, cH:5, cMx:2, cR:5 },
  '15_6': { dN:12, dH:7, dMx:2, dR:4, cN:12, cH:9, cMx:3, cR:1 },
  '15_7': { dN:8, dH:5, dMx:1, dR:3, cN:8, cH:5, cMx:2, cR:2 },
  '15_8': { dN:4, dH:1, dMx:2, dR:2, cN:4, cH:4, cMx:0, cR:0 },
  '15_9': { dN:10, dH:6, dMx:2, dR:3, cN:10, cH:7, cMx:1, cR:3 },
  '15_10': { dN:8, dH:4, dMx:2, dR:3, cN:8, cH:7, cMx:1, cR:1 },
  '15_11': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '15_12': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '15_13': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '15_14': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '16_0': { dN:34, dH:25, dMx:2, dR:8, cN:34, cH:22, cMx:2, cR:9 },
  '16_1': { dN:47, dH:27, dMx:4, dR:16, cN:47, cH:30, cMx:3, cR:13 },
  '16_2': { dN:22, dH:15, dMx:1, dR:7, cN:22, cH:18, cMx:1, cR:4 },
  '16_3': { dN:20, dH:12, dMx:2, dR:7, cN:20, cH:13, cMx:1, cR:7 },
  '16_4': { dN:15, dH:9, dMx:1, dR:6, cN:15, cH:13, cMx:1, cR:2 },
  '16_5': { dN:3, dH:0, dMx:2, dR:2, cN:3, cH:3, cMx:0, cR:0 },
  '16_6': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:3, cMx:1, cR:2 },
  '16_7': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '16_8': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '16_9': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:3, cMx:1, cR:3 },
  '16_10': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '16_11': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '16_12': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '17_0': { dN:34, dH:22, dMx:2, dR:10, cN:34, cH:23, cMx:2, cR:10 },
  '17_1': { dN:22, dH:11, dMx:2, dR:10, cN:22, cH:12, cMx:2, cR:8 },
  '17_2': { dN:13, dH:11, dMx:1, dR:2, cN:13, cH:8, cMx:2, cR:4 },
  '17_3': { dN:10, dH:4, dMx:2, dR:5, cN:10, cH:6, cMx:1, cR:4 },
  '17_4': { dN:14, dH:7, dMx:2, dR:6, cN:14, cH:9, cMx:1, cR:5 },
  '17_5': { dN:6, dH:3, dMx:2, dR:2, cN:6, cH:3, cMx:1, cR:3 },
  '17_6': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '17_7': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:1, cMx:1, cR:1 },
  '17_8': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '17_9': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '17_10': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '18_0': { dN:21, dH:11, dMx:2, dR:7, cN:21, cH:13, cMx:1, cR:8 },
  '18_1': { dN:14, dH:9, dMx:2, dR:4, cN:14, cH:5, cMx:2, cR:7 },
  '18_2': { dN:7, dH:2, dMx:2, dR:4, cN:7, cH:4, cMx:1, cR:3 },
  '18_3': { dN:9, dH:5, dMx:2, dR:3, cN:9, cH:8, cMx:1, cR:1 },
  '18_4': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:0, cMx:1, cR:2 },
  '18_5': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '18_6': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '19_0': { dN:11, dH:10, dMx:1, dR:1, cN:11, cH:6, cMx:2, cR:4 },
  '19_1': { dN:6, dH:3, dMx:1, dR:3, cN:6, cH:3, cMx:1, cR:3 },
  '19_2': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:1, cMx:1, cR:1 },
  '19_3': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
};

function bucket(v: number): number {
  const b = Math.floor(v / 5);
  return b < 0 ? 0 : b > 19 ? 19 : b;
}
function cellAt(hud: number | null, ent: number | null): Cell | null {
  if (hud === null || ent === null) return null;
  return GRID[`${bucket(hud)}_${bucket(ent)}`] ?? null;
}
function stateOf(n: number, h: number, mx: number): Zone {
  if (n < MIN_N) return 'NEUTRA';
  const p = h / n;
  if (mx >= 6) return 'AGUJERO';
  if (mx === 5) return 'TOXICA';
  if (mx <= 3 && p >= 0.66) return 'SANTUARIO';
  if (mx <= 4 && p >= 0.60) return 'VERDE';
  if (p >= 0.55) return 'PROBE';
  return 'TOXICA';
}

export function classifyZone(hud: number | null, ent: number | null, mkt: Market): Zone {
  const c = cellAt(hud, ent);
  if (!c) return 'NEUTRA';
  return mkt === 'doc' ? stateOf(c.dN, c.dH, c.dMx) : stateOf(c.cN, c.cH, c.cMx);
}
export function currentCellWr(hud: number | null, ent: number | null, mkt: Market): number | null {
  const c = cellAt(hud, ent);
  if (!c) return null;
  const n = mkt === 'doc' ? c.dN : c.cN;
  const h = mkt === 'doc' ? c.dH : c.cH;
  return n >= MIN_N ? Math.round((h / n) * 1000) / 10 : null;
}
export function currentCellMaxRun(hud: number | null, ent: number | null, mkt: Market): number | null {
  const c = cellAt(hud, ent);
  if (!c) return null;
  const n = mkt === 'doc' ? c.dN : c.cN;
  return n >= MIN_N ? (mkt === 'doc' ? c.dMx : c.cMx) : null;
}
export function currentCellN(hud: number | null, ent: number | null, mkt: Market): number {
  const c = cellAt(hud, ent);
  if (!c) return 0;
  return mkt === 'doc' ? c.dN : c.cN;
}

export interface CellStat { key: string; n: number; hits: number; errs: number; maxRun: number; estado: Zone; }
export function bucketOf(v: number): number { return bucket(v); }
export function cellKeyOf(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  return `${bucket(hud)}_${bucket(ent)}`;
}
export function labelByKey(key: string): string {
  const [hb, eb] = key.split('_').map(Number);
  return `HUD ${hb * 5}-${hb * 5 + 4} · ENT ${eb * 5}-${eb * 5 + 4}`;
}
export function cellStatsByKey(key: string, mkt: Market): CellStat | null {
  const c = GRID[key];
  if (!c) return null;
  const n  = mkt === 'doc' ? c.dN  : c.cN;
  const h  = mkt === 'doc' ? c.dH  : c.cH;
  const mx = mkt === 'doc' ? c.dMx : c.cMx;
  return { key, n, hits: h, errs: n - h, maxRun: mx, estado: stateOf(n, h, mx) };
}
export function cellStats(hud: number | null, ent: number | null, mkt: Market): CellStat | null {
  const key = cellKeyOf(hud, ent);
  return key ? cellStatsByKey(key, mkt) : null;
}
export function currentCellLabel(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  const hb = bucket(hud), eb = bucket(ent);
  return `HUD ${hb * 5}-${hb * 5 + 4} · ENT ${eb * 5}-${eb * 5 + 4}`;
}
export function currentCellHint(hud: number | null, ent: number | null): string | null {
  const c = cellAt(hud, ent);
  if (!c) return 'sin datos en esta celda';
  const seg = (n: number, h: number, mx: number, lbl: string) =>
    n > 0 ? `${lbl} racha máx ${mx} · acierto ${Math.round((h / n) * 100)}% (${n}g)` : '';
  const parts = [seg(c.dN, c.dH, c.dMx, 'DOC'), seg(c.cN, c.cH, c.cMx, 'COL')].filter(Boolean);
  const lowN = Math.max(c.dN, c.cN) < MIN_N;
  return parts.join(' · ') + (lowN ? ' — pocos datos' : '');
}
