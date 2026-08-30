// ════════════════════════════════════════════════════════════════════════
// D.A.N.N.A. — Matriz v6: grilla 10×10 · RIESGO DE RACHA + acierto
// ════════════════════════════════════════════════════════════════════════
//
// Bloques de 10 (antes 5). Menos casillas, más giros por casilla → estados
// más confiables (se repiten mejor entre mitades de los datos). Generada de
// 15 sesiones (79 celdas).
//
// Estados (prioridad: evitar tandas largas de error):
// AGUJERO racha máx ≥ 6 TOXICA racha máx = 5, o acierto < 55%
// PROBE acierto 55-59% VERDE racha ≤ 4 y acierto ≥ 60%
// SANTUARIO racha ≤ 3 y acierto ≥ 66% NEUTRA < 6 giros
//
// El motor apuesta siempre BET; el panel es solo lectura.
// ════════════════════════════════════════════════════════════════════════

export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';

export const MIN_N = 6;
export const CELL_SIZE = 10;

interface Cell { dN:number; dH:number; dMx:number; dR:number; cN:number; cH:number; cMx:number; cR:number; }

const GRID: Record<string, Cell> = {
  '1_0': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '1_1': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '1_4': { dN:6, dH:3, dMx:2, dR:2, cN:6, cH:5, cMx:1, cR:1 },
  '1_5': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:3, cMx:0, cR:0 },
  '1_6': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '1_7': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:2, cMx:1, cR:2 },
  '1_8': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:3, cMx:1, cR:2 },
  '1_9': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '2_0': { dN:11, dH:6, dMx:2, dR:4, cN:11, cH:8, cMx:1, cR:3 },
  '2_1': { dN:14, dH:8, dMx:2, dR:5, cN:14, cH:9, cMx:1, cR:5 },
  '2_2': { dN:13, dH:8, dMx:1, dR:5, cN:13, cH:8, cMx:1, cR:5 },
  '2_3': { dN:12, dH:5, dMx:2, dR:6, cN:12, cH:6, cMx:3, cR:4 },
  '2_4': { dN:21, dH:17, dMx:2, dR:3, cN:21, cH:14, cMx:2, cR:6 },
  '2_5': { dN:34, dH:19, dMx:3, dR:9, cN:34, cH:24, cMx:2, cR:7 },
  '2_6': { dN:24, dH:16, dMx:2, dR:7, cN:24, cH:13, cMx:2, cR:9 },
  '2_7': { dN:31, dH:18, dMx:2, dR:11, cN:31, cH:17, cMx:3, cR:8 },
  '2_8': { dN:23, dH:11, dMx:4, dR:7, cN:23, cH:17, cMx:2, cR:5 },
  '2_9': { dN:16, dH:12, dMx:1, dR:4, cN:16, cH:9, cMx:1, cR:7 },
  '3_0': { dN:51, dH:30, dMx:3, dR:16, cN:51, cH:33, cMx:2, cR:13 },
  '3_1': { dN:68, dH:50, dMx:2, dR:15, cN:68, cH:41, cMx:3, cR:19 },
  '3_2': { dN:79, dH:56, dMx:2, dR:21, cN:79, cH:48, cMx:3, cR:20 },
  '3_3': { dN:91, dH:64, dMx:3, dR:20, cN:91, cH:62, cMx:4, cR:21 },
  '3_4': { dN:84, dH:61, dMx:3, dR:21, cN:84, cH:56, cMx:3, cR:20 },
  '3_5': { dN:105, dH:66, dMx:5, dR:23, cN:105, cH:69, cMx:3, cR:22 },
  '3_6': { dN:119, dH:79, dMx:3, dR:27, cN:119, cH:78, cMx:3, cR:29 },
  '3_7': { dN:130, dH:86, dMx:4, dR:26, cN:130, cH:82, cMx:5, cR:31 },
  '3_8': { dN:91, dH:62, dMx:3, dR:20, cN:91, cH:55, cMx:3, cR:25 },
  '3_9': { dN:36, dH:27, dMx:2, dR:8, cN:36, cH:26, cMx:2, cR:7 },
  '4_0': { dN:131, dH:83, dMx:5, dR:36, cN:131, cH:86, cMx:4, cR:34 },
  '4_1': { dN:175, dH:117, dMx:3, dR:43, cN:175, cH:121, cMx:4, cR:38 },
  '4_2': { dN:222, dH:157, dMx:3, dR:46, cN:222, cH:155, cMx:4, cR:47 },
  '4_3': { dN:217, dH:153, dMx:4, dR:48, cN:217, cH:137, cMx:7, cR:51 },
  '4_4': { dN:275, dH:174, dMx:5, dR:71, cN:275, cH:166, cMx:5, cR:69 },
  '4_5': { dN:207, dH:134, dMx:5, dR:47, cN:207, cH:140, cMx:4, cR:48 },
  '4_6': { dN:191, dH:120, dMx:5, dR:42, cN:191, cH:126, cMx:4, cR:45 },
  '4_7': { dN:148, dH:100, dMx:3, dR:32, cN:148, cH:89, cMx:4, cR:38 },
  '4_8': { dN:61, dH:34, dMx:3, dR:19, cN:61, cH:42, cMx:2, cR:16 },
  '4_9': { dN:23, dH:13, dMx:2, dR:9, cN:23, cH:16, cMx:2, cR:6 },
  '5_0': { dN:241, dH:153, dMx:4, dR:63, cN:241, cH:166, cMx:3, cR:53 },
  '5_1': { dN:236, dH:152, dMx:7, dR:59, cN:236, cH:160, cMx:4, cR:57 },
  '5_2': { dN:342, dH:213, dMx:4, dR:91, cN:342, cH:208, cMx:7, cR:78 },
  '5_3': { dN:264, dH:164, dMx:3, dR:67, cN:264, cH:180, cMx:6, cR:59 },
  '5_4': { dN:256, dH:162, dMx:3, dR:61, cN:256, cH:154, cMx:5, cR:58 },
  '5_5': { dN:129, dH:89, dMx:3, dR:28, cN:129, cH:81, cMx:7, cR:27 },
  '5_6': { dN:65, dH:41, dMx:4, dR:17, cN:65, cH:45, cMx:3, cR:14 },
  '5_7': { dN:23, dH:15, dMx:2, dR:5, cN:23, cH:16, cMx:2, cR:6 },
  '5_8': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:3, cMx:1, cR:1 },
  '5_9': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:2, cMx:1, cR:3 },
  '6_0': { dN:213, dH:140, dMx:3, dR:50, cN:213, cH:134, cMx:4, cR:52 },
  '6_1': { dN:231, dH:150, dMx:3, dR:57, cN:231, cH:147, cMx:3, cR:59 },
  '6_2': { dN:168, dH:114, dMx:3, dR:44, cN:168, cH:107, cMx:4, cR:39 },
  '6_3': { dN:48, dH:31, dMx:2, dR:12, cN:48, cH:32, cMx:2, cR:12 },
  '6_4': { dN:30, dH:20, dMx:5, dR:5, cN:30, cH:18, cMx:2, cR:10 },
  '6_5': { dN:14, dH:11, dMx:1, dR:3, cN:14, cH:9, cMx:2, cR:4 },
  '6_6': { dN:10, dH:5, dMx:2, dR:4, cN:10, cH:6, cMx:1, cR:4 },
  '6_7': { dN:10, dH:6, dMx:1, dR:4, cN:10, cH:5, cMx:3, cR:3 },
  '6_8': { dN:8, dH:5, dMx:2, dR:2, cN:8, cH:5, cMx:2, cR:2 },
  '6_9': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '7_0': { dN:158, dH:98, dMx:6, dR:38, cN:158, cH:90, cMx:5, cR:43 },
  '7_1': { dN:105, dH:77, dMx:3, dR:20, cN:105, cH:67, cMx:5, cR:24 },
  '7_2': { dN:84, dH:53, dMx:4, dR:21, cN:84, cH:52, cMx:5, cR:20 },
  '7_3': { dN:47, dH:32, dMx:3, dR:11, cN:47, cH:30, cMx:3, cR:12 },
  '7_4': { dN:37, dH:21, dMx:3, dR:12, cN:37, cH:29, cMx:1, cR:8 },
  '7_5': { dN:21, dH:15, dMx:2, dR:5, cN:21, cH:18, cMx:1, cR:3 },
  '7_6': { dN:20, dH:16, dMx:2, dR:3, cN:20, cH:13, cMx:2, cR:6 },
  '7_7': { dN:9, dH:5, dMx:1, dR:4, cN:9, cH:6, cMx:1, cR:3 },
  '7_8': { dN:7, dH:2, dMx:1, dR:5, cN:7, cH:6, cMx:1, cR:1 },
  '7_9': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '8_0': { dN:157, dH:97, dMx:4, dR:48, cN:157, cH:100, cMx:4, cR:44 },
  '8_1': { dN:69, dH:45, dMx:3, dR:20, cN:69, cH:47, cMx:3, cR:15 },
  '8_2': { dN:41, dH:20, dMx:4, dR:16, cN:41, cH:29, cMx:2, cR:11 },
  '8_3': { dN:16, dH:7, dMx:2, dR:7, cN:16, cH:8, cMx:2, cR:4 },
  '8_4': { dN:11, dH:9, dMx:1, dR:2, cN:11, cH:7, cMx:1, cR:4 },
  '8_5': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:3, cMx:1, cR:1 },
  '8_6': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:0, cMx:1, cR:1 },
  '9_0': { dN:64, dH:42, dMx:5, dR:12, cN:64, cH:34, cMx:3, cR:22 },
  '9_1': { dN:19, dH:7, dMx:4, dR:7, cN:19, cH:14, cMx:2, cR:4 },
  '9_2': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '9_3': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
};

function bucket(v: number): number {
  const b = Math.floor(v / CELL_SIZE);
  return b < 0 ? 0 : b > 9 ? 9 : b;
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
  const n = mkt === 'doc' ? c.dN : c.cN, h = mkt === 'doc' ? c.dH : c.cH;
  return n >= MIN_N ? Math.round(h / n * 1000) / 10 : null;
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

export interface CellStat { key:string; n:number; hits:number; errs:number; maxRun:number; estado:Zone; }
export function bucketOf(v: number): number { return bucket(v); }
export function cellKeyOf(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  return `${bucket(hud)}_${bucket(ent)}`;
}
export function labelByKey(key: string): string {
  const [hb, eb] = key.split('_').map(Number);
  return `HUD ${hb * CELL_SIZE}-${hb * CELL_SIZE + CELL_SIZE - 1} · ENT ${eb * CELL_SIZE}-${eb * CELL_SIZE + CELL_SIZE - 1}`;
}
export function cellStatsByKey(key: string, mkt: Market): CellStat | null {
  const c = GRID[key];
  if (!c) return null;
  const n = mkt === 'doc' ? c.dN : c.cN, h = mkt === 'doc' ? c.dH : c.cH, mx = mkt === 'doc' ? c.dMx : c.cMx;
  return { key, n, hits: h, errs: n - h, maxRun: mx, estado: stateOf(n, h, mx) };
}
export function cellStats(hud: number | null, ent: number | null, mkt: Market): CellStat | null {
  const key = cellKeyOf(hud, ent);
  return key ? cellStatsByKey(key, mkt) : null;
}
export function currentCellLabel(hud: number | null, ent: number | null): string | null {
  if (hud === null || ent === null) return null;
  const hb = bucket(hud), eb = bucket(ent);
  return `HUD ${hb * CELL_SIZE}-${hb * CELL_SIZE + CELL_SIZE - 1} · ENT ${eb * CELL_SIZE}-${eb * CELL_SIZE + CELL_SIZE - 1}`;
}
export function currentCellHint(hud: number | null, ent: number | null): string | null {
  const c = cellAt(hud, ent);
  if (!c) return 'sin datos en esta celda';
  const seg = (n:number,hh:number,mx:number,l:string)=> n>0?`${l} racha máx ${mx} · acierto ${Math.round(hh/n*100)}% (${n}g)`:'';
  const parts=[seg(c.dN,c.dH,c.dMx,'DOC'),seg(c.cN,c.cH,c.cMx,'COL')].filter(Boolean);
  return parts.join(' · ')+(Math.max(c.dN,c.cN)<MIN_N?' — pocos datos':'');
}

// ════════════════════════════════════════════════════════════════════════
// FUSIÓN EN VIVO — el estado reacciona a la sesión (historial + hoy)
// ════════════════════════════════════════════════════════════════════════
export const LIVE_WEIGHT = 4;   // cada giro de hoy pesa como 4 históricos
export const LIVE_MIN = 2;      // giros vivos mínimos para alterar el estado
export interface LiveRec { hits:number; misses:number; maxStreak:number; }

function fuse(nBase:number, hBase:number, mxBase:number, live:LiveRec|null): Zone {
  const lt = live ? live.hits + live.misses : 0;
  if (nBase < MIN_N) {
    if (lt >= MIN_N && live) return stateOf(lt, live.hits, live.maxStreak);
    return 'NEUTRA';
  }
  if (!live || lt < LIVE_MIN) return stateOf(nBase, hBase, mxBase);
  const effN = nBase + LIVE_WEIGHT * lt;
  const effH = hBase + LIVE_WEIGHT * live.hits;
  const effMx = Math.max(mxBase, live.maxStreak);
  return stateOf(effN, effH, effMx);
}
export function fusedZone(hud:number|null, ent:number|null, mkt:Market, live:LiveRec|null): Zone {
  const c = cellAt(hud, ent);
  if (!c) return 'NEUTRA';
  const nBase = mkt==='doc'?c.dN:c.cN, hBase = mkt==='doc'?c.dH:c.cH, mxBase = mkt==='doc'?c.dMx:c.cMx;
  return fuse(nBase, hBase, mxBase, live);
}
export function fusedZoneByKey(key:string, mkt:Market, live:LiveRec|null): Zone {
  const c = GRID[key];
  if (!c) return 'NEUTRA';
  const nBase = mkt==='doc'?c.dN:c.cN, hBase = mkt==='doc'?c.dH:c.cH, mxBase = mkt==='doc'?c.dMx:c.cMx;
  return fuse(nBase, hBase, mxBase, live);
}
export function liveDeviation(hud:number|null, ent:number|null, mkt:Market, live:LiveRec|null): 'mejor'|'peor'|null {
  const c = cellAt(hud, ent);
  if (!c || !live || (live.hits + live.misses) < LIVE_MIN) return null;
  const nBase = mkt==='doc'?c.dN:c.cN, hBase = mkt==='doc'?c.dH:c.cH, mxBase = mkt==='doc'?c.dMx:c.cMx;
  const baseState = stateOf(nBase, hBase, mxBase);
  const fusedState = fusedZone(hud, ent, mkt, live);
  if (baseState === fusedState) return null;
  const rank: Record<Zone, number> = { AGUJERO:0, TOXICA:1, PROBE:2, VERDE:3, SANTUARIO:4, NEUTRA:2 };
  return rank[fusedState] > rank[baseState] ? 'mejor' : 'peor';
}
