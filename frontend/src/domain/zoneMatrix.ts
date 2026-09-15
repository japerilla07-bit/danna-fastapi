// D.A.N.N.A. — Matriz v9: grilla 10×10 · 81 celdas · 28 sesiones (11250 giros doc)
// Archivo de SOLO DATOS — no toca UI/visual. Reemplaza únicamente frontend/src/domain/zoneMatrix.ts
export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';
export const MIN_N = 6;
export const MIN_SANTUARIO = 30;
export const CELL_SIZE = 10;
interface Cell { dN:number; dH:number; dMx:number; dR:number; cN:number; cH:number; cMx:number; cR:number; }
const GRID: Record<string, Cell> = {
  '1_0': { dN:2, dH:1, dMx:1, dR:1, cN:2, cH:1, cMx:1, cR:1 },
  '1_1': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:2, cMx:1, cR:1 },
  '1_3': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:3, cMx:0, cR:0 },
  '1_4': { dN:6, dH:3, dMx:2, dR:2, cN:6, cH:5, cMx:1, cR:1 },
  '1_5': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '1_6': { dN:6, dH:6, dMx:0, dR:0, cN:6, cH:5, cMx:1, cR:1 },
  '1_7': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:2, cMx:1, cR:2 },
  '1_8': { dN:7, dH:6, dMx:1, dR:1, cN:7, cH:4, cMx:1, cR:3 },
  '1_9': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '2_0': { dN:14, dH:7, dMx:2, dR:6, cN:14, cH:10, cMx:1, cR:4 },
  '2_1': { dN:19, dH:10, dMx:2, dR:8, cN:19, cH:12, cMx:1, cR:7 },
  '2_2': { dN:28, dH:15, dMx:1, dR:13, cN:28, cH:19, cMx:1, cR:9 },
  '2_3': { dN:21, dH:12, dMx:2, dR:8, cN:21, cH:12, cMx:3, cR:7 },
  '2_4': { dN:42, dH:31, dMx:2, dR:8, cN:42, cH:26, cMx:2, cR:14 },
  '2_5': { dN:58, dH:34, dMx:3, dR:15, cN:58, cH:39, cMx:3, cR:12 },
  '2_6': { dN:41, dH:21, dMx:3, dR:14, cN:41, cH:23, cMx:2, cR:16 },
  '2_7': { dN:49, dH:28, dMx:2, dR:18, cN:49, cH:29, cMx:3, cR:13 },
  '2_8': { dN:31, dH:19, dMx:4, dR:7, cN:31, cH:20, cMx:2, cR:9 },
  '2_9': { dN:19, dH:14, dMx:1, dR:5, cN:19, cH:11, cMx:1, cR:8 },
  '3_0': { dN:81, dH:43, dMx:8, dR:23, cN:81, cH:55, cMx:2, cR:20 },
  '3_1': { dN:103, dH:75, dMx:2, dR:23, cN:103, cH:61, cMx:3, cR:29 },
  '3_2': { dN:144, dH:96, dMx:4, dR:38, cN:144, cH:93, cMx:3, cR:34 },
  '3_3': { dN:155, dH:106, dMx:3, dR:36, cN:155, cH:105, cMx:4, cR:37 },
  '3_4': { dN:150, dH:101, dMx:4, dR:37, cN:150, cH:100, cMx:3, cR:34 },
  '3_5': { dN:189, dH:119, dMx:5, dR:43, cN:189, cH:125, cMx:3, cR:43 },
  '3_6': { dN:199, dH:129, dMx:4, dR:48, cN:199, cH:135, cMx:3, cR:49 },
  '3_7': { dN:236, dH:154, dMx:4, dR:56, cN:236, cH:154, cMx:5, cR:53 },
  '3_8': { dN:155, dH:109, dMx:3, dR:34, cN:155, cH:96, cMx:3, cR:42 },
  '3_9': { dN:59, dH:40, dMx:2, dR:16, cN:59, cH:40, cMx:2, cR:14 },
  '4_0': { dN:251, dH:157, dMx:5, dR:69, cN:251, cH:163, cMx:4, cR:64 },
  '4_1': { dN:337, dH:214, dMx:9, dR:83, cN:337, cH:231, cMx:4, cR:75 },
