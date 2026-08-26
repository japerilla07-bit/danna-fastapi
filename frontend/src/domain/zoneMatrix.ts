// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz v5: RIESGO DE RACHA + acierto (grilla HUD×ENT 5×5)
// ════════════════════════════════════════════════════════════════════════
//
// GENERADA desde las sesiones reales (269 celdas de 400).
// El estado NO se decide por win-rate contra break-even. Se decide por lo
// que importa: dónde los errores NO se amontonan en tandas y además se
// acierta. Métrica por celda:
//   • acierto = h / n
//   • racha máx = la tanda de errores más larga vivida al operar esa celda
//   • nº de rachas de error
//
// Estados (prioridad: evitar tandas largas):
//   AGUJERO   racha máx ≥ 6   (se amontona feo — salir)
//   TOXICA    racha máx = 5, o acierto < 55%
//   PROBE     acierto 55-59%  (flojo)
//   VERDE     racha máx ≤ 4 y acierto ≥ 60%
//   SANTUARIO racha máx ≤ 3 y acierto ≥ 66%  (errores sueltos + acierta)
//   NEUTRA    < 6 giros (dato casi nulo)
//
// Se regenera con cada tanda de sesiones nuevas: confirma o tumba celdas.
// El motor apuesta siempre BET; el ZoneChip es solo lectura.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';

export const MIN_N = 6;

interface Cell {
  dN: number; dH: number; dMx: number; dR: number;
  cN: number; cH: number; cMx: number; cR: number;
}

// clave `${hudBucket}_${entBucket}` (bucket = floor(valor/5), 0..19)
const GRID: Record<string, Cell> = {
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
  '3_16': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:2, cMx:1, cR:2 },
  '3_17': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '3_19': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '4_1': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '4_2': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:1, cMx:1, cR:2 },
  '4_3': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '4_4': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '4_5': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:3, cMx:1, cR:2 },
  '4_7': { dN:4, dH:1, dMx:1, dR:3, cN:4, cH:1, cMx:1, cR:3 },
  '4_8': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '4_9': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '4_10': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '4_11': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '4_12': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:0, cMx:2, cR:2 },
  '4_13': { dN:3, dH:0, dMx:1, dR:3, cN:3, cH:1, cMx:1, cR:2 },
  '4_14': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:2, cMx:1, cR:2 },
  '4_15': { dN:3, dH:1, dMx:2, dR:1, cN:3, cH:2, cMx:1, cR:1 },
  '4_16': { dN:5, dH:2, dMx:2, dR:2, cN:5, cH:4, cMx:1, cR:1 },
  '4_17': { dN:7, dH:2, dMx:2, dR:4, cN:7, cH:3, cMx:1, cR:4 },
  '4_18': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:2, cMx:1, cR:1 },
  '4_19': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '5_0': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '5_1': { dN:5, dH:3, dMx:2, dR:1, cN:5, cH:3, cMx:1, cR:2 },
  '5_2': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '5_3': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:4, cMx:1, cR:1 },
  '5_4': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '5_5': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '5_6': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:1, cMx:2, cR:1 },
  '5_7': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '5_8': { dN:8, dH:8, dMx:0, dR:0, cN:8, cH:7, cMx:1, cR:1 },
  '5_9': { dN:8, dH:6, dMx:1, dR:2, cN:8, cH:5, cMx:1, cR:3 },
  '5_10': { dN:11, dH:6, dMx:1, dR:5, cN:11, cH:8, cMx:2, cR:2 },
  '5_11': { dN:13, dH:8, dMx:2, dR:4, cN:13, cH:8, cMx:2, cR:4 },
  '5_12': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:3, cMx:1, cR:1 },
  '5_13': { dN:10, dH:9, dMx:1, dR:1, cN:10, cH:6, cMx:1, cR:4 },
  '5_14': { dN:11, dH:7, dMx:1, dR:4, cN:11, cH:5, cMx:2, cR:4 },
  '5_15': { dN:7, dH:3, dMx:1, dR:4, cN:7, cH:5, cMx:1, cR:2 },
  '5_16': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '5_17': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:6, cMx:0, cR:0 },
  '5_18': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:5, cMx:1, cR:1 },
  '5_19': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '6_0': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '6_1': { dN:6, dH:4, dMx:1, dR:2, cN:6, cH:3, cMx:1, cR:3 },
  '6_2': { dN:11, dH:10, dMx:1, dR:1, cN:11, cH:5, cMx:2, cR:5 },
  '6_3': { dN:13, dH:9, dMx:2, dR:3, cN:13, cH:8, cMx:2, cR:4 },
  '6_4': { dN:16, dH:9, dMx:1, dR:7, cN:16, cH:11, cMx:1, cR:5 },
  '6_5': { dN:6, dH:6, dMx:0, dR:0, cN:6, cH:4, cMx:1, cR:2 },
  '6_6': { dN:11, dH:9, dMx:1, dR:2, cN:11, cH:7, cMx:1, cR:4 },
  '6_7': { dN:12, dH:10, dMx:1, dR:2, cN:12, cH:7, cMx:1, cR:5 },
  '6_8': { dN:11, dH:9, dMx:1, dR:2, cN:11, cH:7, cMx:1, cR:4 },
  '6_9': { dN:8, dH:7, dMx:1, dR:1, cN:8, cH:6, cMx:1, cR:2 },
  '6_10': { dN:16, dH:9, dMx:2, dR:6, cN:16, cH:10, cMx:2, cR:5 },
  '6_11': { dN:15, dH:10, dMx:2, dR:4, cN:15, cH:8, cMx:3, cR:4 },
  '6_12': { dN:12, dH:6, dMx:2, dR:5, cN:12, cH:9, cMx:1, cR:3 },
  '6_13': { dN:14, dH:11, dMx:2, dR:2, cN:14, cH:10, cMx:1, cR:4 },
  '6_14': { dN:15, dH:9, dMx:1, dR:6, cN:15, cH:13, cMx:1, cR:2 },
  '6_15': { dN:20, dH:10, dMx:3, dR:7, cN:20, cH:12, cMx:2, cR:7 },
  '6_16': { dN:13, dH:10, dMx:1, dR:3, cN:13, cH:7, cMx:3, cR:4 },
  '6_17': { dN:12, dH:10, dMx:1, dR:2, cN:12, cH:7, cMx:2, cR:3 },
  '6_18': { dN:11, dH:7, dMx:1, dR:4, cN:11, cH:10, cMx:1, cR:1 },
  '6_19': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '7_0': { dN:15, dH:12, dMx:1, dR:3, cN:15, cH:8, cMx:1, cR:7 },
  '7_1': { dN:16, dH:7, dMx:2, dR:8, cN:16, cH:10, cMx:1, cR:6 },
  '7_2': { dN:14, dH:12, dMx:1, dR:2, cN:14, cH:12, cMx:1, cR:2 },
  '7_3': { dN:23, dH:13, dMx:2, dR:8, cN:23, cH:12, cMx:2, cR:7 },
  '7_4': { dN:23, dH:18, dMx:1, dR:5, cN:23, cH:14, cMx:1, cR:9 },
  '7_5': { dN:18, dH:11, dMx:2, dR:6, cN:18, cH:11, cMx:2, cR:6 },
  '7_6': { dN:23, dH:14, dMx:3, dR:6, cN:23, cH:13, cMx:3, cR:8 },
  '7_7': { dN:32, dH:22, dMx:2, dR:8, cN:32, cH:25, cMx:2, cR:6 },
  '7_8': { dN:21, dH:14, dMx:2, dR:6, cN:21, cH:13, cMx:1, cR:8 },
  '7_9': { dN:23, dH:15, dMx:1, dR:8, cN:23, cH:15, cMx:2, cR:6 },
  '7_10': { dN:18, dH:10, dMx:2, dR:6, cN:18, cH:11, cMx:2, cR:6 },
  '7_11': { dN:30, dH:17, dMx:3, dR:11, cN:30, cH:22, cMx:2, cR:7 },
  '7_12': { dN:34, dH:23, dMx:2, dR:9, cN:34, cH:22, cMx:3, cR:8 },
  '7_13': { dN:28, dH:19, dMx:2, dR:8, cN:28, cH:20, cMx:2, cR:7 },
  '7_14': { dN:29, dH:21, dMx:2, dR:6, cN:29, cH:17, cMx:2, cR:11 },
  '7_15': { dN:38, dH:28, dMx:2, dR:8, cN:38, cH:23, cMx:4, cR:11 },
  '7_16': { dN:27, dH:20, dMx:2, dR:6, cN:27, cH:19, cMx:2, cR:7 },
  '7_17': { dN:20, dH:12, dMx:3, dR:5, cN:20, cH:12, cMx:4, cR:4 },
  '7_18': { dN:8, dH:7, dMx:1, dR:1, cN:8, cH:7, cMx:1, cR:1 },
  '7_19': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:2, cMx:2, cR:2 },
  '8_0': { dN:10, dH:6, dMx:1, dR:4, cN:10, cH:10, cMx:0, cR:0 },
  '8_1': { dN:25, dH:12, dMx:3, dR:9, cN:25, cH:15, cMx:3, cR:5 },
  '8_2': { dN:24, dH:19, dMx:2, dR:4, cN:24, cH:18, cMx:1, cR:6 },
  '8_3': { dN:36, dH:24, dMx:2, dR:11, cN:36, cH:27, cMx:3, cR:6 },
  '8_4': { dN:44, dH:29, dMx:3, dR:11, cN:44, cH:34, cMx:2, cR:8 },
  '8_5': { dN:26, dH:18, dMx:2, dR:7, cN:26, cH:20, cMx:2, cR:5 },
  '8_6': { dN:33, dH:27, dMx:1, dR:6, cN:33, cH:28, cMx:2, cR:4 },
  '8_7': { dN:45, dH:31, dMx:2, dR:12, cN:45, cH:28, cMx:3, cR:11 },
  '8_8': { dN:46, dH:32, dMx:2, dR:12, cN:46, cH:35, cMx:2, cR:9 },
  '8_9': { dN:54, dH:28, dMx:3, dR:19, cN:54, cH:32, cMx:4, cR:13 },
  '8_10': { dN:46, dH:30, dMx:3, dR:9, cN:46, cH:32, cMx:3, cR:11 },
  '8_11': { dN:33, dH:20, dMx:4, dR:7, cN:33, cH:27, cMx:1, cR:6 },
  '8_12': { dN:45, dH:26, dMx:3, dR:13, cN:45, cH:33, cMx:2, cR:10 },
  '8_13': { dN:28, dH:16, dMx:3, dR:6, cN:28, cH:11, cMx:3, cR:11 },
  '8_14': { dN:40, dH:27, dMx:2, dR:11, cN:40, cH:25, cMx:2, cR:13 },
  '8_15': { dN:28, dH:18, dMx:2, dR:8, cN:28, cH:18, cMx:3, cR:8 },
  '8_16': { dN:23, dH:20, dMx:1, dR:3, cN:23, cH:17, cMx:2, cR:3 },
  '8_17': { dN:7, dH:1, dMx:2, dR:4, cN:7, cH:3, cMx:1, cR:4 },
  '8_18': { dN:12, dH:5, dMx:2, dR:6, cN:12, cH:8, cMx:2, cR:3 },
  '8_19': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '9_0': { dN:15, dH:11, dMx:1, dR:4, cN:15, cH:10, cMx:2, cR:4 },
  '9_1': { dN:35, dH:21, dMx:2, dR:12, cN:35, cH:24, cMx:2, cR:8 },
  '9_2': { dN:33, dH:19, dMx:4, dR:8, cN:33, cH:19, cMx:3, cR:9 },
  '9_3': { dN:48, dH:35, dMx:2, dR:12, cN:48, cH:27, cMx:4, cR:15 },
  '9_4': { dN:50, dH:37, dMx:2, dR:10, cN:50, cH:35, cMx:2, cR:11 },
  '9_5': { dN:44, dH:36, dMx:3, dR:6, cN:44, cH:31, cMx:3, cR:9 },
  '9_6': { dN:38, dH:28, dMx:2, dR:6, cN:38, cH:25, cMx:3, cR:9 },
  '9_7': { dN:52, dH:34, dMx:3, dR:15, cN:52, cH:30, cMx:3, cR:16 },
  '9_8': { dN:51, dH:29, dMx:4, dR:15, cN:51, cH:25, cMx:4, cR:15 },
  '9_9': { dN:60, dH:41, dMx:2, dR:16, cN:60, cH:38, cMx:2, cR:17 },
  '9_10': { dN:39, dH:27, dMx:2, dR:10, cN:39, cH:25, cMx:2, cR:12 },
  '9_11': { dN:49, dH:34, dMx:4, dR:10, cN:49, cH:30, cMx:5, cR:9 },
  '9_12': { dN:38, dH:26, dMx:4, dR:8, cN:38, cH:25, cMx:3, cR:10 },
  '9_13': { dN:31, dH:23, dMx:2, dR:7, cN:31, cH:22, cMx:1, cR:9 },
  '9_14': { dN:23, dH:16, dMx:2, dR:6, cN:23, cH:14, cMx:1, cR:9 },
  '9_15': { dN:22, dH:16, dMx:1, dR:6, cN:22, cH:12, cMx:3, cR:8 },
  '9_16': { dN:8, dH:4, dMx:2, dR:3, cN:8, cH:6, cMx:1, cR:2 },
  '9_17': { dN:7, dH:4, dMx:1, dR:3, cN:7, cH:5, cMx:1, cR:2 },
  '9_18': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '9_19': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '10_0': { dN:29, dH:18, dMx:2, dR:10, cN:29, cH:19, cMx:2, cR:9 },
  '10_1': { dN:40, dH:25, dMx:3, dR:12, cN:40, cH:32, cMx:2, cR:6 },
  '10_2': { dN:28, dH:19, dMx:2, dR:8, cN:28, cH:15, cMx:3, cR:9 },
  '10_3': { dN:46, dH:31, dMx:3, dR:12, cN:46, cH:33, cMx:3, cR:9 },
  '10_4': { dN:63, dH:42, dMx:2, dR:19, cN:63, cH:37, cMx:5, cR:13 },
  '10_5': { dN:54, dH:35, dMx:3, dR:16, cN:54, cH:33, cMx:3, cR:14 },
  '10_6': { dN:52, dH:32, dMx:3, dR:13, cN:52, cH:36, cMx:2, cR:11 },
  '10_7': { dN:56, dH:33, dMx:2, dR:15, cN:56, cH:38, cMx:3, cR:14 },
  '10_8': { dN:55, dH:35, dMx:3, dR:15, cN:55, cH:25, cMx:5, cR:15 },
  '10_9': { dN:49, dH:35, dMx:2, dR:11, cN:49, cH:29, cMx:5, cR:9 },
  '10_10': { dN:39, dH:29, dMx:2, dR:8, cN:39, cH:30, cMx:2, cR:6 },
  '10_11': { dN:29, dH:19, dMx:3, dR:8, cN:29, cH:15, cMx:3, cR:7 },
  '10_12': { dN:26, dH:17, dMx:2, dR:6, cN:26, cH:17, cMx:3, cR:6 },
  '10_13': { dN:17, dH:9, dMx:2, dR:7, cN:17, cH:13, cMx:2, cR:3 },
  '10_14': { dN:9, dH:5, dMx:1, dR:4, cN:9, cH:9, cMx:0, cR:0 },
  '10_15': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '10_17': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '10_18': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '11_0': { dN:53, dH:32, dMx:4, dR:15, cN:53, cH:38, cMx:2, cR:12 },
  '11_1': { dN:67, dH:47, dMx:4, dR:14, cN:67, cH:40, cMx:5, cR:17 },
  '11_2': { dN:33, dH:24, dMx:2, dR:7, cN:33, cH:22, cMx:1, cR:11 },
  '11_3': { dN:61, dH:38, dMx:3, dR:18, cN:61, cH:46, cMx:2, cR:11 },
  '11_4': { dN:82, dH:52, dMx:2, dR:23, cN:82, cH:51, cMx:5, cR:20 },
  '11_5': { dN:60, dH:39, dMx:2, dR:19, cN:60, cH:36, cMx:3, cR:16 },
  '11_6': { dN:48, dH:27, dMx:4, dR:14, cN:48, cH:28, cMx:3, cR:13 },
  '11_7': { dN:37, dH:28, dMx:2, dR:7, cN:37, cH:22, cMx:3, cR:9 },
  '11_8': { dN:43, dH:29, dMx:3, dR:11, cN:43, cH:32, cMx:2, cR:9 },
  '11_9': { dN:25, dH:12, dMx:3, dR:10, cN:25, cH:15, cMx:2, cR:6 },
  '11_10': { dN:13, dH:10, dMx:1, dR:3, cN:13, cH:10, cMx:1, cR:3 },
  '11_11': { dN:9, dH:3, dMx:2, dR:4, cN:9, cH:4, cMx:3, cR:3 },
  '11_12': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '11_13': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '11_14': { dN:5, dH:5, dMx:0, dR:0, cN:5, cH:1, cMx:3, cR:2 },
  '11_16': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '11_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '11_19': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '12_0': { dN:24, dH:16, dMx:1, dR:8, cN:24, cH:14, cMx:2, cR:8 },
  '12_1': { dN:53, dH:38, dMx:2, dR:12, cN:53, cH:37, cMx:2, cR:15 },
  '12_2': { dN:50, dH:30, dMx:3, dR:14, cN:50, cH:36, cMx:2, cR:12 },
  '12_3': { dN:69, dH:47, dMx:2, dR:19, cN:69, cH:44, cMx:3, cR:16 },
  '12_4': { dN:62, dH:43, dMx:3, dR:16, cN:62, cH:36, cMx:3, cR:16 },
  '12_5': { dN:21, dH:17, dMx:1, dR:4, cN:21, cH:19, cMx:1, cR:2 },
  '12_6': { dN:12, dH:8, dMx:1, dR:4, cN:12, cH:7, cMx:1, cR:5 },
  '12_7': { dN:13, dH:9, dMx:1, dR:4, cN:13, cH:8, cMx:1, cR:5 },
  '12_8': { dN:10, dH:6, dMx:2, dR:3, cN:10, cH:7, cMx:1, cR:3 },
  '12_9': { dN:6, dH:4, dMx:1, dR:2, cN:6, cH:4, cMx:1, cR:2 },
  '12_10': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '12_11': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '12_12': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '12_13': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '12_15': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '12_16': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '12_17': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '12_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '13_0': { dN:32, dH:21, dMx:2, dR:10, cN:32, cH:21, cMx:2, cR:9 },
  '13_1': { dN:45, dH:27, dMx:3, dR:13, cN:45, cH:27, cMx:4, cR:11 },
  '13_2': { dN:27, dH:19, dMx:1, dR:8, cN:27, cH:17, cMx:3, cR:7 },
  '13_3': { dN:37, dH:26, dMx:2, dR:9, cN:37, cH:21, cMx:3, cR:11 },
  '13_4': { dN:21, dH:12, dMx:2, dR:8, cN:21, cH:14, cMx:1, cR:7 },
  '13_5': { dN:16, dH:12, dMx:2, dR:3, cN:16, cH:8, cMx:1, cR:8 },
  '13_6': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:2, cMx:2, cR:2 },
  '13_7': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:2, cMx:1, cR:1 },
  '13_8': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:3, cMx:1, cR:3 },
  '13_9': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:3, cMx:1, cR:2 },
  '13_10': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:3, cMx:2, cR:1 },
  '13_11': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '13_12': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '13_13': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:2, cMx:0, cR:0 },
  '13_14': { dN:5, dH:2, dMx:2, dR:2, cN:5, cH:3, cMx:2, cR:1 },
  '13_15': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '13_16': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:1, cMx:1, cR:1 },
  '13_18': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '13_19': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '14_0': { dN:18, dH:14, dMx:2, dR:3, cN:18, cH:9, cMx:2, cR:7 },
  '14_1': { dN:29, dH:15, dMx:4, dR:9, cN:29, cH:16, cMx:3, cR:8 },
  '14_2': { dN:19, dH:10, dMx:4, dR:5, cN:19, cH:17, cMx:1, cR:2 },
  '14_3': { dN:22, dH:12, dMx:2, dR:8, cN:22, cH:12, cMx:3, cR:6 },
  '14_4': { dN:19, dH:11, dMx:2, dR:7, cN:19, cH:11, cMx:2, cR:6 },
  '14_5': { dN:19, dH:14, dMx:2, dR:4, cN:19, cH:16, cMx:1, cR:3 },
  '14_6': { dN:12, dH:9, dMx:1, dR:3, cN:12, cH:8, cMx:1, cR:4 },
  '14_7': { dN:6, dH:3, dMx:2, dR:2, cN:6, cH:2, cMx:2, cR:3 },
  '14_8': { dN:8, dH:4, dMx:1, dR:4, cN:8, cH:7, cMx:1, cR:1 },
  '14_9': { dN:9, dH:7, dMx:1, dR:2, cN:9, cH:6, cMx:1, cR:3 },
  '14_10': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:4, cMx:0, cR:0 },
  '14_11': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '14_12': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '14_13': { dN:9, dH:6, dMx:2, dR:2, cN:9, cH:5, cMx:2, cR:3 },
  '14_15': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '14_16': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '14_17': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:3, cMx:0, cR:0 },
  '14_18': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '15_0': { dN:28, dH:17, dMx:3, dR:6, cN:28, cH:15, cMx:3, cR:10 },
  '15_1': { dN:37, dH:24, dMx:2, dR:11, cN:37, cH:28, cMx:2, cR:8 },
  '15_2': { dN:21, dH:18, dMx:1, dR:3, cN:21, cH:16, cMx:1, cR:5 },
  '15_3': { dN:22, dH:19, dMx:1, dR:3, cN:22, cH:12, cMx:2, cR:7 },
  '15_4': { dN:21, dH:13, dMx:2, dR:7, cN:21, cH:13, cMx:3, cR:6 },
  '15_5': { dN:9, dH:5, dMx:2, dR:3, cN:9, cH:3, cMx:2, cR:4 },
  '15_6': { dN:11, dH:7, dMx:2, dR:3, cN:11, cH:8, cMx:3, cR:1 },
  '15_7': { dN:8, dH:5, dMx:1, dR:3, cN:8, cH:5, cMx:2, cR:2 },
  '15_8': { dN:4, dH:1, dMx:2, dR:2, cN:4, cH:4, cMx:0, cR:0 },
  '15_9': { dN:8, dH:6, dMx:1, dR:2, cN:8, cH:5, cMx:1, cR:3 },
  '15_10': { dN:7, dH:4, dMx:2, dR:2, cN:7, cH:6, cMx:1, cR:1 },
  '15_12': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '15_13': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '15_14': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '16_0': { dN:26, dH:18, dMx:2, dR:7, cN:26, cH:18, cMx:2, cR:6 },
  '16_1': { dN:34, dH:20, dMx:4, dR:11, cN:34, cH:22, cMx:3, cR:9 },
  '16_2': { dN:21, dH:15, dMx:1, dR:6, cN:21, cH:17, cMx:1, cR:4 },
  '16_3': { dN:19, dH:11, dMx:2, dR:7, cN:19, cH:13, cMx:1, cR:6 },
  '16_4': { dN:13, dH:8, dMx:1, dR:5, cN:13, cH:11, cMx:1, cR:2 },
  '16_5': { dN:3, dH:0, dMx:2, dR:2, cN:3, cH:3, cMx:0, cR:0 },
  '16_6': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '16_7': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '16_8': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '16_9': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '16_10': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '16_11': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '17_0': { dN:17, dH:10, dMx:2, dR:6, cN:17, cH:11, cMx:2, cR:5 },
  '17_1': { dN:18, dH:10, dMx:1, dR:8, cN:18, cH:9, cMx:2, cR:7 },
  '17_2': { dN:11, dH:9, dMx:1, dR:2, cN:11, cH:7, cMx:2, cR:3 },
  '17_3': { dN:9, dH:4, dMx:2, dR:4, cN:9, cH:5, cMx:1, cR:4 },
  '17_4': { dN:8, dH:4, dMx:1, dR:4, cN:8, cH:5, cMx:1, cR:3 },
  '17_5': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '17_6': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '17_7': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '17_8': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '17_9': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '17_10': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '18_0': { dN:16, dH:9, dMx:2, dR:5, cN:16, cH:10, cMx:1, cR:6 },
  '18_1': { dN:11, dH:8, dMx:1, dR:3, cN:11, cH:3, cMx:2, cR:6 },
  '18_2': { dN:7, dH:2, dMx:2, dR:4, cN:7, cH:4, cMx:1, cR:3 },
  '18_3': { dN:5, dH:2, dMx:2, dR:2, cN:5, cH:5, cMx:0, cR:0 },
  '18_4': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:0, cMx:1, cR:2 },
  '18_5': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '19_0': { dN:9, dH:8, dMx:1, dR:1, cN:9, cH:5, cMx:2, cR:3 },
  '19_1': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:2, cMx:1, cR:3 },
  '19_2': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
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

// Estado por riesgo de racha + acierto
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

// ── API (misma firma que antes — ZoneChip y store no cambian) ──────────

export function classifyZone(hud: number | null, ent: number | null, mkt: Market): Zone {
  const c = cellAt(hud, ent);
  if (!c) return 'NEUTRA';
  return mkt === 'doc' ? stateOf(c.dN, c.dH, c.dMx) : stateOf(c.cN, c.cH, c.cMx);
}

/** Acierto medido de la celda (%). */
export function currentCellWr(hud: number | null, ent: number | null, mkt: Market): number | null {
  const c = cellAt(hud, ent);
  if (!c) return null;
  const n = mkt === 'doc' ? c.dN : c.cN;
  const h = mkt === 'doc' ? c.dH : c.cH;
  return n >= MIN_N ? Math.round((h / n) * 1000) / 10 : null;
}

/** Racha de errores más larga vivida en la celda (lo que de verdad importa). */
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

export function currentCellLabel(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  const hb = bucket(hud), eb = bucket(ent);
  return `HUD ${hb * 5}-${hb * 5 + 4} · ENT ${eb * 5}-${eb * 5 + 4}`;
}

/** Hint con lo tuyo: racha máx y acierto por mercado. */
export function currentCellHint(hud: number | null, ent: number | null): string | null {
  const c = cellAt(hud, ent);
  if (!c) return 'sin datos en esta celda';
  const seg = (n: number, h: number, mx: number, lbl: string) =>
    n > 0 ? `${lbl} racha máx ${mx} · acierto ${Math.round((h / n) * 100)}% (${n}g)` : '';
  const parts = [seg(c.dN, c.dH, c.dMx, 'DOC'), seg(c.cN, c.cH, c.cMx, 'COL')].filter(Boolean);
  const lowN = Math.max(c.dN, c.cN) < MIN_N;
  return parts.join(' · ') + (lowN ? ' — pocos datos' : '');
}

// ════════════════════════════════════════════════════════════════════════
// v6 — API para el panel de control (MatrixPanel)
// ════════════════════════════════════════════════════════════════════════

export interface CellStat {
  key: string;
  n: number;        // giros históricos en la celda (MAPA)
  hits: number;     // aciertos históricos
  errs: number;     // errores históricos
  maxRun: number;   // racha máx de errores histórica
  estado: Zone;
}

/** Bucket 0..19 de un valor (público, para derivar la celda en el store/panel). */
export function bucketOf(v: number): number {
  return bucket(v);
}

/** Clave `${hb}_${eb}` de la celda para (hud, ent), o null si falta dato. */
export function cellKeyOf(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  return `${bucket(hud)}_${bucket(ent)}`;
}

/** Etiqueta legible de una celda por su clave: "HUD 50-54 · ENT 40-44". */
export function labelByKey(key: string): string {
  const [hb, eb] = key.split('_').map(Number);
  return `HUD ${hb * 5}-${hb * 5 + 4} · ENT ${eb * 5}-${eb * 5 + 4}`;
}

/** Histórico (MAPA) de una celda por clave, para un mercado. */
export function cellStatsByKey(key: string, mkt: Market): CellStat | null {
  const c = GRID[key];
  if (!c) return null;
  const n  = mkt === 'doc' ? c.dN  : c.cN;
  const h  = mkt === 'doc' ? c.dH  : c.cH;
  const mx = mkt === 'doc' ? c.dMx : c.cMx;
  return { key, n, hits: h, errs: n - h, maxRun: mx, estado: stateOf(n, h, mx) };
}

/** Histórico (MAPA) de la celda de (hud, ent) para un mercado. */
export function cellStats(hud: number | null, ent: number | null, mkt: Market): CellStat | null {
  const key = cellKeyOf(hud, ent);
  return key ? cellStatsByKey(key, mkt) : null;
}
