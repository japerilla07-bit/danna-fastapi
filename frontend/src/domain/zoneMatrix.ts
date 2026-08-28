// D.A.N.N.A. — Matriz v5: RIESGO DE RACHA + acierto · 276 celdas · 14 sesiones
export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';
export const MIN_N = 6;
interface Cell { dN:number; dH:number; dMx:number; dR:number; cN:number; cH:number; cMx:number; cR:number; }
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
  '4_9': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
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
  '5_9': { dN:9, dH:7, dMx:1, dR:2, cN:9, cH:5, cMx:1, cR:4 },
  '5_10': { dN:12, dH:7, dMx:1, dR:5, cN:12, cH:9, cMx:2, cR:2 },
  '5_11': { dN:13, dH:8, dMx:2, dR:4, cN:13, cH:8, cMx:2, cR:4 },
  '5_12': { dN:7, dH:3, dMx:2, dR:3, cN:7, cH:5, cMx:1, cR:2 },
  '5_13': { dN:11, dH:10, dMx:1, dR:1, cN:11, cH:7, cMx:1, cR:4 },
  '5_14': { dN:14, dH:10, dMx:1, dR:4, cN:14, cH:7, cMx:2, cR:5 },
  '5_15': { dN:9, dH:4, dMx:1, dR:5, cN:9, cH:6, cMx:1, cR:3 },
  '5_16': { dN:5, dH:2, dMx:2, dR:2, cN:5, cH:4, cMx:1, cR:1 },
  '5_17': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:6, cMx:0, cR:0 },
  '5_18': { dN:7, dH:5, dMx:1, dR:2, cN:7, cH:5, cMx:1, cR:2 },
  '5_19': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '6_0': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '6_1': { dN:10, dH:6, dMx:1, dR:4, cN:10, cH:7, cMx:1, cR:3 },
  '6_2': { dN:11, dH:10, dMx:1, dR:1, cN:11, cH:5, cMx:2, cR:5 },
  '6_3': { dN:14, dH:10, dMx:2, dR:3, cN:14, cH:8, cMx:2, cR:5 },
  '6_4': { dN:18, dH:10, dMx:1, dR:8, cN:18, cH:12, cMx:1, cR:6 },
  '6_5': { dN:9, dH:9, dMx:0, dR:0, cN:9, cH:6, cMx:1, cR:3 },
  '6_6': { dN:12, dH:9, dMx:1, dR:3, cN:12, cH:8, cMx:1, cR:4 },
  '6_7': { dN:14, dH:10, dMx:2, dR:3, cN:14, cH:9, cMx:1, cR:5 },
  '6_8': { dN:15, dH:12, dMx:1, dR:3, cN:15, cH:11, cMx:1, cR:4 },
  '6_9': { dN:12, dH:11, dMx:1, dR:1, cN:12, cH:9, cMx:1, cR:3 },
  '6_10': { dN:16, dH:9, dMx:2, dR:6, cN:16, cH:10, cMx:2, cR:5 },
  '6_11': { dN:16, dH:11, dMx:2, dR:4, cN:16, cH:9, cMx:3, cR:4 },
  '6_12': { dN:21, dH:11, dMx:2, dR:8, cN:21, cH:15, cMx:1, cR:6 },
  '6_13': { dN:17, dH:14, dMx:2, dR:2, cN:17, cH:11, cMx:2, cR:5 },
  '6_14': { dN:18, dH:10, dMx:2, dR:7, cN:18, cH:16, cMx:1, cR:2 },
  '6_15': { dN:26, dH:15, dMx:3, dR:8, cN:26, cH:16, cMx:2, cR:8 },
  '6_16': { dN:15, dH:12, dMx:1, dR:3, cN:15, cH:9, cMx:3, cR:4 },
  '6_17': { dN:17, dH:14, dMx:1, dR:3, cN:17, cH:11, cMx:2, cR:4 },
  '6_18': { dN:12, dH:8, dMx:1, dR:4, cN:12, cH:11, cMx:1, cR:1 },
  '6_19': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '7_0': { dN:17, dH:14, dMx:1, dR:3, cN:17, cH:10, cMx:1, cR:7 },
  '7_1': { dN:21, dH:7, dMx:3, dR:10, cN:21, cH:14, cMx:1, cR:7 },
  '7_2': { dN:15, dH:12, dMx:1, dR:3, cN:15, cH:13, cMx:1, cR:2 },
  '7_3': { dN:26, dH:16, dMx:2, dR:8, cN:26, cH:14, cMx:2, cR:8 },
  '7_4': { dN:28, dH:22, dMx:1, dR:6, cN:28, cH:16, cMx:1, cR:12 },
  '7_5': { dN:19, dH:11, dMx:2, dR:7, cN:19, cH:12, cMx:2, cR:6 },
  '7_6': { dN:28, dH:19, dMx:3, dR:6, cN:28, cH:16, cMx:3, cR:10 },
  '7_7': { dN:34, dH:24, dMx:2, dR:8, cN:34, cH:27, cMx:2, cR:6 },
  '7_8': { dN:24, dH:16, dMx:2, dR:7, cN:24, cH:16, cMx:1, cR:8 },
  '7_9': { dN:29, dH:19, dMx:2, dR:9, cN:29, cH:18, cMx:2, cR:9 },
  '7_10': { dN:29, dH:17, dMx:3, dR:8, cN:29, cH:19, cMx:2, cR:9 },
  '7_11': { dN:33, dH:20, dMx:3, dR:11, cN:33, cH:23, cMx:2, cR:9 },
  '7_12': { dN:39, dH:26, dMx:2, dR:11, cN:39, cH:25, cMx:3, cR:9 },
  '7_13': { dN:33, dH:21, dMx:3, dR:9, cN:33, cH:23, cMx:2, cR:9 },
  '7_14': { dN:34, dH:23, dMx:2, dR:9, cN:34, cH:21, cMx:2, cR:12 },
  '7_15': { dN:42, dH:31, dMx:2, dR:9, cN:42, cH:25, cMx:4, cR:13 },
  '7_16': { dN:34, dH:22, dMx:2, dR:9, cN:34, cH:21, cMx:2, cR:10 },
  '7_17': { dN:21, dH:13, dMx:3, dR:5, cN:21, cH:12, cMx:4, cR:5 },
  '7_18': { dN:12, dH:10, dMx:1, dR:2, cN:12, cH:9, cMx:1, cR:3 },
  '7_19': { dN:8, dH:7, dMx:1, dR:1, cN:8, cH:3, cMx:2, cR:3 },
  '8_0': { dN:21, dH:15, dMx:1, dR:6, cN:21, cH:15, cMx:2, cR:4 },
  '8_1': { dN:36, dH:21, dMx:3, dR:11, cN:36, cH:22, cMx:3, cR:8 },
  '8_2': { dN:32, dH:25, dMx:2, dR:6, cN:32, cH:26, cMx:1, cR:6 },
  '8_3': { dN:37, dH:25, dMx:2, dR:11, cN:37, cH:28, cMx:3, cR:6 },
  '8_4': { dN:54, dH:36, dMx:3, dR:13, cN:54, cH:42, cMx:2, cR:10 },
  '8_5': { dN:31, dH:21, dMx:2, dR:9, cN:31, cH:21, cMx:3, cR:7 },
  '8_6': { dN:41, dH:31, dMx:2, dR:9, cN:41, cH:31, cMx:4, cR:6 },
  '8_7': { dN:50, dH:35, dMx:2, dR:13, cN:50, cH:30, cMx:3, cR:13 },
  '8_8': { dN:55, dH:39, dMx:2, dR:14, cN:55, cH:40, cMx:4, cR:10 },
  '8_9': { dN:60, dH:31, dMx:3, dR:21, cN:60, cH:36, cMx:4, cR:15 },
  '8_10': { dN:49, dH:32, dMx:3, dR:10, cN:49, cH:33, cMx:3, cR:13 },
  '8_11': { dN:39, dH:24, dMx:4, dR:8, cN:39, cH:30, cMx:2, cR:8 },
  '8_12': { dN:57, dH:34, dMx:3, dR:16, cN:57, cH:42, cMx:2, cR:13 },
  '8_13': { dN:37, dH:19, dMx:4, dR:9, cN:37, cH:18, cMx:3, cR:13 },
  '8_14': { dN:46, dH:30, dMx:2, dR:14, cN:46, cH:27, cMx:2, cR:16 },
  '8_15': { dN:35, dH:23, dMx:2, dR:10, cN:35, cH:22, cMx:3, cR:11 },
  '8_16': { dN:27, dH:23, dMx:1, dR:4, cN:27, cH:20, cMx:2, cR:4 },
  '8_17': { dN:9, dH:1, dMx:2, dR:6, cN:9, cH:5, cMx:1, cR:4 },
  '8_18': { dN:15, dH:7, dMx:2, dR:7, cN:15, cH:9, cMx:2, cR:5 },
  '8_19': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '9_0': { dN:25, dH:18, dMx:2, dR:6, cN:25, cH:17, cMx:2, cR:7 },
  '9_1': { dN:43, dH:26, dMx:2, dR:14, cN:43, cH:28, cMx:2, cR:11 },
  '9_2': { dN:43, dH:23, dMx:4, dR:11, cN:43, cH:28, cMx:3, cR:10 },
  '9_3': { dN:56, dH:40, dMx:2, dR:14, cN:56, cH:33, cMx:4, cR:17 },
  '9_4': { dN:64, dH:45, dMx:2, dR:15, cN:64, cH:45, cMx:2, cR:14 },
  '9_5': { dN:56, dH:44, dMx:3, dR:9, cN:56, cH:41, cMx:3, cR:11 },
  '9_6': { dN:47, dH:36, dMx:2, dR:7, cN:47, cH:28, cMx:3, cR:12 },
  '9_7': { dN:59, dH:37, dMx:3, dR:18, cN:59, cH:34, cMx:3, cR:19 },
  '9_8': { dN:58, dH:32, dMx:4, dR:17, cN:58, cH:29, cMx:4, cR:17 },
  '9_9': { dN:72, dH:49, dMx:2, dR:19, cN:72, cH:46, cMx:2, cR:19 },
  '9_10': { dN:47, dH:34, dMx:2, dR:11, cN:47, cH:31, cMx:2, cR:13 },
  '9_11': { dN:55, dH:38, dMx:4, dR:12, cN:55, cH:33, cMx:5, cR:11 },
  '9_12': { dN:44, dH:29, dMx:4, dR:11, cN:44, cH:29, cMx:3, cR:12 },
  '9_13': { dN:34, dH:25, dMx:2, dR:8, cN:34, cH:25, cMx:1, cR:9 },
  '9_14': { dN:29, dH:20, dMx:2, dR:7, cN:29, cH:16, cMx:2, cR:12 },
  '9_15': { dN:27, dH:19, dMx:2, dR:7, cN:27, cH:16, cMx:3, cR:9 },
  '9_16': { dN:9, dH:4, dMx:2, dR:4, cN:9, cH:7, cMx:1, cR:2 },
  '9_17': { dN:8, dH:4, dMx:1, dR:4, cN:8, cH:5, cMx:1, cR:3 },
  '9_18': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '9_19': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '10_0': { dN:41, dH:26, dMx:2, dR:14, cN:41, cH:31, cMx:2, cR:9 },
  '10_1': { dN:46, dH:29, dMx:3, dR:14, cN:46, cH:36, cMx:2, cR:8 },
  '10_2': { dN:39, dH:24, dMx:3, dR:12, cN:39, cH:21, cMx:3, cR:13 },
  '10_3': { dN:64, dH:45, dMx:3, dR:16, cN:64, cH:46, cMx:3, cR:14 },
  '10_4': { dN:73, dH:48, dMx:4, dR:20, cN:73, cH:44, cMx:5, cR:16 },
  '10_5': { dN:64, dH:43, dMx:3, dR:17, cN:64, cH:39, cMx:3, cR:18 },
  '10_6': { dN:66, dH:42, dMx:3, dR:17, cN:66, cH:48, cMx:2, cR:13 },
  '10_7': { dN:63, dH:38, dMx:2, dR:16, cN:63, cH:43, cMx:3, cR:16 },
  '10_8': { dN:72, dH:41, dMx:5, dR:21, cN:72, cH:36, cMx:5, cR:19 },
  '10_9': { dN:67, dH:48, dMx:3, dR:14, cN:67, cH:40, cMx:5, cR:14 },
  '10_10': { dN:50, dH:38, dMx:2, dR:10, cN:50, cH:37, cMx:2, cR:10 },
  '10_11': { dN:33, dH:23, dMx:3, dR:8, cN:33, cH:17, cMx:3, cR:9 },
  '10_12': { dN:30, dH:20, dMx:2, dR:7, cN:30, cH:18, cMx:3, cR:8 },
  '10_13': { dN:23, dH:12, dMx:2, dR:10, cN:23, cH:18, cMx:2, cR:4 },
  '10_14': { dN:13, dH:7, dMx:2, dR:5, cN:13, cH:12, cMx:1, cR:1 },
  '10_15': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:2, cMx:1, cR:1 },
  '10_17': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '10_18': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '11_0': { dN:68, dH:39, dMx:4, dR:20, cN:68, cH:45, cMx:3, cR:16 },
  '11_1': { dN:74, dH:51, dMx:4, dR:17, cN:74, cH:45, cMx:5, cR:19 },
  '11_2': { dN:50, dH:35, dMx:2, dR:13, cN:50, cH:33, cMx:3, cR:15 },
  '11_3': { dN:65, dH:39, dMx:3, dR:20, cN:65, cH:49, cMx:2, cR:12 },
  '11_4': { dN:95, dH:57, dMx:3, dR:28, cN:95, cH:58, cMx:5, cR:25 },
  '11_5': { dN:72, dH:45, dMx:2, dR:25, cN:72, cH:43, cMx:3, cR:20 },
  '11_6': { dN:62, dH:33, dMx:4, dR:20, cN:62, cH:40, cMx:3, cR:15 },
  '11_7': { dN:45, dH:32, dMx:2, dR:10, cN:45, cH:27, cMx:3, cR:12 },
  '11_8': { dN:56, dH:37, dMx:3, dR:14, cN:56, cH:39, cMx:2, cR:14 },
  '11_9': { dN:39, dH:21, dMx:3, dR:14, cN:39, cH:23, cMx:2, cR:11 },
  '11_10': { dN:19, dH:15, dMx:1, dR:4, cN:19, cH:12, cMx:4, cR:4 },
  '11_11': { dN:12, dH:6, dMx:2, dR:4, cN:12, cH:5, cMx:3, cR:5 },
  '11_12': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '11_13': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '11_14': { dN:5, dH:5, dMx:0, dR:0, cN:5, cH:1, cMx:3, cR:2 },
  '11_16': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '11_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '11_19': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '12_0': { dN:31, dH:20, dMx:2, dR:10, cN:31, cH:18, cMx:2, cR:10 },
  '12_1': { dN:66, dH:48, dMx:2, dR:15, cN:66, cH:46, cMx:2, cR:18 },
  '12_2': { dN:62, dH:38, dMx:3, dR:18, cN:62, cH:43, cMx:2, cR:16 },
  '12_3': { dN:79, dH:52, dMx:2, dR:23, cN:79, cH:51, cMx:3, cR:18 },
  '12_4': { dN:81, dH:55, dMx:3, dR:21, cN:81, cH:49, cMx:4, cR:19 },
  '12_5': { dN:29, dH:21, dMx:2, dR:6, cN:29, cH:22, cMx:2, cR:5 },
  '12_6': { dN:19, dH:13, dMx:1, dR:6, cN:19, cH:14, cMx:1, cR:5 },
  '12_7': { dN:18, dH:10, dMx:2, dR:7, cN:18, cH:11, cMx:1, cR:7 },
  '12_8': { dN:10, dH:6, dMx:2, dR:3, cN:10, cH:7, cMx:1, cR:3 },
  '12_9': { dN:7, dH:4, dMx:1, dR:3, cN:7, cH:4, cMx:1, cR:3 },
  '12_10': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:3, cMx:0, cR:0 },
  '12_11': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '12_12': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:1, cMx:1, cR:3 },
  '12_13': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '12_15': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:2, cMx:1, cR:2 },
  '12_16': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '12_17': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '12_18': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '13_0': { dN:40, dH:27, dMx:2, dR:12, cN:40, cH:24, cMx:3, cR:12 },
  '13_1': { dN:59, dH:36, dMx:3, dR:16, cN:59, cH:35, cMx:4, cR:16 },
  '13_2': { dN:37, dH:25, dMx:2, dR:11, cN:37, cH:23, cMx:3, cR:9 },
  '13_3': { dN:40, dH:26, dMx:2, dR:11, cN:40, cH:22, cMx:3, cR:13 },
  '13_4': { dN:29, dH:16, dMx:2, dR:11, cN:29, cH:17, cMx:2, cR:10 },
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
  '14_0': { dN:28, dH:22, dMx:2, dR:5, cN:28, cH:16, cMx:2, cR:9 },
  '14_1': { dN:37, dH:18, dMx:4, dR:12, cN:37, cH:18, cMx:3, cR:12 },
  '14_2': { dN:21, dH:11, dMx:4, dR:6, cN:21, cH:19, cMx:1, cR:2 },
  '14_3': { dN:26, dH:15, dMx:2, dR:9, cN:26, cH:13, cMx:3, cR:7 },
  '14_4': { dN:22, dH:14, dMx:2, dR:7, cN:22, cH:13, cMx:2, cR:7 },
  '14_5': { dN:23, dH:18, dMx:2, dR:4, cN:23, cH:18, cMx:2, cR:4 },
  '14_6': { dN:14, dH:11, dMx:1, dR:3, cN:14, cH:10, cMx:1, cR:4 },
  '14_7': { dN:10, dH:6, dMx:2, dR:3, cN:10, cH:3, cMx:2, cR:5 },
  '14_8': { dN:11, dH:5, dMx:1, dR:6, cN:11, cH:9, cMx:1, cR:2 },
  '14_9': { dN:10, dH:8, dMx:1, dR:2, cN:10, cH:7, cMx:1, cR:3 },
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
  '15_1': { dN:42, dH:28, dMx:2, dR:12, cN:42, cH:30, cMx:2, cR:10 },
  '15_2': { dN:26, dH:23, dMx:1, dR:3, cN:26, cH:18, cMx:2, cR:7 },
  '15_3': { dN:25, dH:22, dMx:1, dR:3, cN:25, cH:12, cMx:2, cR:9 },
  '15_4': { dN:26, dH:14, dMx:2, dR:9, cN:26, cH:15, cMx:3, cR:8 },
  '15_5': { dN:12, dH:6, dMx:2, dR:5, cN:12, cH:5, cMx:2, cR:5 },
  '15_6': { dN:13, dH:8, dMx:2, dR:4, cN:13, cH:10, cMx:3, cR:1 },
  '15_7': { dN:8, dH:5, dMx:1, dR:3, cN:8, cH:5, cMx:2, cR:2 },
  '15_8': { dN:4, dH:1, dMx:2, dR:2, cN:4, cH:4, cMx:0, cR:0 },
  '15_9': { dN:10, dH:6, dMx:2, dR:3, cN:10, cH:7, cMx:1, cR:3 },
  '15_10': { dN:9, dH:4, dMx:2, dR:4, cN:9, cH:8, cMx:1, cR:1 },
  '15_11': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '15_12': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:3, cMx:1, cR:1 },
  '15_13': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '15_14': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '16_0': { dN:34, dH:25, dMx:2, dR:8, cN:34, cH:22, cMx:2, cR:9 },
  '16_1': { dN:47, dH:27, dMx:4, dR:16, cN:47, cH:30, cMx:3, cR:13 },
  '16_2': { dN:22, dH:15, dMx:1, dR:7, cN:22, cH:18, cMx:1, cR:4 },
  '16_3': { dN:21, dH:12, dMx:2, dR:8, cN:21, cH:14, cMx:1, cR:7 },
  '16_4': { dN:15, dH:9, dMx:1, dR:6, cN:15, cH:13, cMx:1, cR:2 },
  '16_5': { dN:3, dH:0, dMx:2, dR:2, cN:3, cH:3, cMx:0, cR:0 },
  '16_6': { dN:6, dH:3, dMx:1, dR:3, cN:6, cH:3, cMx:1, cR:3 },
  '16_7': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:2, cMx:0, cR:0 },
  '16_8': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '16_9': { dN:6, dH:5, dMx:1, dR:1, cN:6, cH:3, cMx:1, cR:3 },
  '16_10': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '16_11': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
  '16_12': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '17_0': { dN:35, dH:23, dMx:2, dR:10, cN:35, cH:23, cMx:2, cR:11 },
  '17_1': { dN:24, dH:11, dMx:2, dR:11, cN:24, cH:13, cMx:2, cR:9 },
  '17_2': { dN:13, dH:11, dMx:1, dR:2, cN:13, cH:8, cMx:2, cR:4 },
  '17_3': { dN:10, dH:4, dMx:2, dR:5, cN:10, cH:6, cMx:1, cR:4 },
  '17_4': { dN:14, dH:7, dMx:2, dR:6, cN:14, cH:9, cMx:1, cR:5 },
  '17_5': { dN:7, dH:3, dMx:2, dR:3, cN:7, cH:3, cMx:1, cR:4 },
  '17_6': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '17_7': { dN:3, dH:1, dMx:1, dR:2, cN:3, cH:1, cMx:1, cR:2 },
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
  '19_1': { dN:7, dH:4, dMx:1, dR:3, cN:7, cH:3, cMx:1, cR:4 },
  '19_2': { dN:2, dH:0, dMx:1, dR:2, cN:2, cH:1, cMx:1, cR:1 },
  '19_3': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:1, cMx:0, cR:0 },
};
function bucket(v:number):number { const b=Math.floor(v/5); return b<0?0:b>19?19:b; }
function cellAt(h:number|null,e:number|null):Cell|null { if(h===null||e===null)return null; return GRID[`${bucket(h)}_${bucket(e)}`]??null; }
function stateOf(n:number,h:number,mx:number):Zone {
  if(n<MIN_N)return 'NEUTRA'; const p=h/n;
  if(mx>=6)return 'AGUJERO'; if(mx===5)return 'TOXICA';
  if(mx<=3&&p>=0.66)return 'SANTUARIO'; if(mx<=4&&p>=0.60)return 'VERDE';
  if(p>=0.55)return 'PROBE'; return 'TOXICA';
}
export function classifyZone(h:number|null,e:number|null,m:Market):Zone { const c=cellAt(h,e); if(!c)return 'NEUTRA'; return m==='doc'?stateOf(c.dN,c.dH,c.dMx):stateOf(c.cN,c.cH,c.cMx); }
export function currentCellWr(h:number|null,e:number|null,m:Market):number|null { const c=cellAt(h,e); if(!c)return null; const n=m==='doc'?c.dN:c.cN,hh=m==='doc'?c.dH:c.cH; return n>=MIN_N?Math.round(hh/n*1000)/10:null; }
export function currentCellMaxRun(h:number|null,e:number|null,m:Market):number|null { const c=cellAt(h,e); if(!c)return null; const n=m==='doc'?c.dN:c.cN; return n>=MIN_N?(m==='doc'?c.dMx:c.cMx):null; }
export function currentCellN(h:number|null,e:number|null,m:Market):number { const c=cellAt(h,e); if(!c)return 0; return m==='doc'?c.dN:c.cN; }
export interface CellStat { key:string; n:number; hits:number; errs:number; maxRun:number; estado:Zone; }
export function bucketOf(v:number):number { return bucket(v); }
export function cellKeyOf(h:number|null,e:number|null):string|null { if(h===null||e===null)return null; return `${bucket(h)}_${bucket(e)}`; }
export function labelByKey(key:string):string { const [hb,eb]=key.split('_').map(Number); return `HUD ${hb*5}-${hb*5+4} · ENT ${eb*5}-${eb*5+4}`; }
export function cellStatsByKey(key:string,m:Market):CellStat|null { const c=GRID[key]; if(!c)return null; const n=m==='doc'?c.dN:c.cN,h=m==='doc'?c.dH:c.cH,mx=m==='doc'?c.dMx:c.cMx; return {key,n,hits:h,errs:n-h,maxRun:mx,estado:stateOf(n,h,mx)}; }
export function cellStats(h:number|null,e:number|null,m:Market):CellStat|null { const key=cellKeyOf(h,e); return key?cellStatsByKey(key,m):null; }
export function currentCellLabel(h:number|null,e:number|null):string|null { if(h===null||e===null)return null; const hb=bucket(h),eb=bucket(e); return `HUD ${hb*5}-${hb*5+4} · ENT ${eb*5}-${eb*5+4}`; }
export function currentCellHint(h:number|null,e:number|null):string|null {
  const c=cellAt(h,e); if(!c)return 'sin datos en esta celda';
  const seg=(n:number,hh:number,mx:number,l:string)=>n>0?`${l} racha máx ${mx} · acierto ${Math.round(hh/n*100)}% (${n}g)`:'';
  const parts=[seg(c.dN,c.dH,c.dMx,'DOC'),seg(c.cN,c.cH,c.cMx,'COL')].filter(Boolean);
  return parts.join(' · ')+(Math.max(c.dN,c.cN)<MIN_N?' — pocos datos':'');
}

// ════════════════════════════════════════════════════════════════════════
// FUSIÓN EN VIVO — el estado reacciona a la sesión (historial + hoy)
// ════════════════════════════════════════════════════════════════════════
//
// Cada celda arranca con su historial (la matriz). A medida que jugás, tus
// giros de la sesión se fusionan con ese historial y el estado se recalcula
// solo — sin tocar el archivo. Los giros de HOY pesan más (LIVE_WEIGHT) para
// que el estado reaccione a la mesa del momento; pero hace falta un mínimo de
// giros vivos (LIVE_MIN) para que el estado pueda cambiar, así no salta por un
// solo error suelto.
//
// Reacciona, no predice: te dice "esta celda hoy viene bien / mal" con base en
// lo que ya pasó en la sesión. Es tu termómetro en vivo de la mesa actual.

export const LIVE_WEIGHT = 4;   // cada giro de hoy pesa como 4 históricos
export const LIVE_MIN = 2;      // giros vivos mínimos para alterar el estado

export interface LiveRec { hits: number; misses: number; maxStreak: number; }

function fuse(nBase: number, hBase: number, mxBase: number, live: LiveRec | null): Zone {
  const lt = live ? live.hits + live.misses : 0;

  // Sin base: solo mostramos algo si el vivo ya tiene volumen propio.
  if (nBase < MIN_N) {
    if (lt >= MIN_N && live) return stateOf(lt, live.hits, live.maxStreak);
    return 'NEUTRA';
  }
  // Con base pero poco vivo: mandan los históricos (estable).
  if (!live || lt < LIVE_MIN) return stateOf(nBase, hBase, mxBase);

  // Fusión: los giros de hoy pesan LIVE_WEIGHT veces.
  const effN  = nBase + LIVE_WEIGHT * lt;
  const effH  = hBase + LIVE_WEIGHT * live.hits;
  const effMx = Math.max(mxBase, live.maxStreak);
  return stateOf(effN, effH, effMx);
}

/** Estado fusionado (historial + sesión) de la celda de (hud, ent). */
export function fusedZone(hud: number | null, ent: number | null, mkt: Market, live: LiveRec | null): Zone {
  const c = cellAt(hud, ent);
  if (!c) return 'NEUTRA';
  const nBase  = mkt === 'doc' ? c.dN  : c.cN;
  const hBase  = mkt === 'doc' ? c.dH  : c.cH;
  const mxBase = mkt === 'doc' ? c.dMx : c.cMx;
  return fuse(nBase, hBase, mxBase, live);
}

/** Igual, por clave de celda (para la lista de casillas visitadas). */
export function fusedZoneByKey(key: string, mkt: Market, live: LiveRec | null): Zone {
  const c = GRID[key];
  if (!c) return 'NEUTRA';
  const nBase  = mkt === 'doc' ? c.dN  : c.cN;
  const hBase  = mkt === 'doc' ? c.dH  : c.cH;
  const mxBase = mkt === 'doc' ? c.dMx : c.cMx;
  return fuse(nBase, hBase, mxBase, live);
}

/** ¿El estado fusionado se desvió del histórico? (para marcar "cambió en vivo"). */
export function liveDeviation(hud: number | null, ent: number | null, mkt: Market, live: LiveRec | null): 'mejor' | 'peor' | null {
  const c = cellAt(hud, ent);
  if (!c || !live || (live.hits + live.misses) < LIVE_MIN) return null;
  const nBase = mkt === 'doc' ? c.dN : c.cN;
  const hBase = mkt === 'doc' ? c.dH : c.cH;
  const mxBase = mkt === 'doc' ? c.dMx : c.cMx;
  const baseState = stateOf(nBase, hBase, mxBase);
  const fusedState = fusedZone(hud, ent, mkt, live);
  if (baseState === fusedState) return null;
  const rank: Record<Zone, number> = { AGUJERO: 0, TOXICA: 1, PROBE: 2, VERDE: 3, SANTUARIO: 4, NEUTRA: 2 };
  return rank[fusedState] > rank[baseState] ? 'mejor' : 'peor';
}
