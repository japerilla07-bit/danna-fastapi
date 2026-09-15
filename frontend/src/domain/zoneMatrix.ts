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
  '4_2': { dN:403, dH:282, dMx:3, dR:87, cN:403, cH:281, cMx:4, cR:87 },
  '4_3': { dN:391, dH:277, dMx:5, dR:85, cN:391, cH:246, cMx:7, cR:93 },
  '4_4': { dN:501, dH:324, dMx:5, dR:122, cN:501, cH:320, cMx:5, cR:128 },
  '4_5': { dN:422, dH:271, dMx:5, dR:101, cN:422, cH:280, cMx:4, cR:100 },
  '4_6': { dN:364, dH:234, dMx:5, dR:84, cN:364, cH:241, cMx:5, cR:83 },
  '4_7': { dN:274, dH:181, dMx:3, dR:65, cN:274, cH:159, cMx:4, cR:75 },
  '4_8': { dN:120, dH:74, dMx:3, dR:33, cN:120, cH:82, cMx:2, cR:30 },
  '4_9': { dN:44, dH:29, dMx:2, dR:14, cN:44, cH:29, cMx:2, cR:13 },
  '5_0': { dN:428, dH:254, dMx:5, dR:113, cN:428, cH:275, cMx:4, cR:104 },
  '5_1': { dN:479, dH:324, dMx:7, dR:111, cN:479, cH:305, cMx:6, cR:115 },
  '5_2': { dN:613, dH:408, dMx:4, dR:144, cN:613, cH:376, cMx:7, cR:143 },
  '5_3': { dN:493, dH:310, dMx:3, dR:126, cN:493, cH:322, cMx:8, cR:113 },
  '5_4': { dN:490, dH:325, dMx:4, dR:114, cN:490, cH:299, cMx:6, cR:111 },
  '5_5': { dN:257, dH:168, dMx:3, dR:62, cN:257, cH:152, cMx:7, cR:62 },
  '5_6': { dN:136, dH:77, dMx:5, dR:39, cN:136, cH:91, cMx:5, cR:31 },
  '5_7': { dN:48, dH:23, dMx:4, dR:14, cN:48, cH:32, cMx:2, cR:13 },
  '5_8': { dN:10, dH:9, dMx:1, dR:1, cN:10, cH:9, cMx:1, cR:1 },
  '5_9': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:2, cMx:1, cR:3 },
  '6_0': { dN:440, dH:285, dMx:5, dR:105, cN:440, cH:288, cMx:5, cR:103 },
  '6_1': { dN:418, dH:273, dMx:3, dR:107, cN:418, cH:267, cMx:4, cR:104 },
  '6_2': { dN:319, dH:213, dMx:4, dR:82, cN:319, cH:206, cMx:4, cR:77 },
  '6_3': { dN:135, dH:97, dMx:2, dR:31, cN:135, cH:86, cMx:3, cR:33 },
  '6_4': { dN:66, dH:42, dMx:5, dR:17, cN:66, cH:43, cMx:3, cR:18 },
  '6_5': { dN:25, dH:18, dMx:1, dR:7, cN:25, cH:17, cMx:2, cR:7 },
  '6_6': { dN:22, dH:15, dMx:2, dR:6, cN:22, cH:14, cMx:1, cR:8 },
  '6_7': { dN:15, dH:11, dMx:1, dR:4, cN:15, cH:9, cMx:3, cR:4 },
  '6_8': { dN:14, dH:11, dMx:2, dR:2, cN:14, cH:11, cMx:2, cR:2 },
  '6_9': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '7_0': { dN:363, dH:232, dMx:6, dR:93, cN:363, cH:235, cMx:5, cR:87 },
  '7_1': { dN:213, dH:154, dMx:3, dR:43, cN:213, cH:149, cMx:5, cR:44 },
  '7_2': { dN:161, dH:110, dMx:4, dR:37, cN:161, cH:110, cMx:5, cR:33 },
  '7_3': { dN:100, dH:59, dMx:3, dR:30, cN:100, cH:65, cMx:3, cR:24 },
  '7_4': { dN:65, dH:43, dMx:3, dR:18, cN:65, cH:43, cMx:3, cR:17 },
  '7_5': { dN:38, dH:26, dMx:2, dR:10, cN:38, cH:32, cMx:2, cR:5 },
  '7_6': { dN:36, dH:27, dMx:2, dR:8, cN:36, cH:27, cMx:2, cR:8 },
  '7_7': { dN:27, dH:18, dMx:1, dR:9, cN:27, cH:18, cMx:1, cR:9 },
  '7_8': { dN:11, dH:4, dMx:1, dR:7, cN:11, cH:9, cMx:1, cR:2 },
  '7_9': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '8_0': { dN:333, dH:208, dMx:4, dR:91, cN:333, cH:212, cMx:5, cR:84 },
  '8_1': { dN:142, dH:87, dMx:4, dR:39, cN:142, cH:96, cMx:3, cR:31 },
  '8_2': { dN:94, dH:56, dMx:4, dR:31, cN:94, cH:69, cMx:3, cR:22 },
  '8_3': { dN:38, dH:24, dMx:2, dR:11, cN:38, cH:27, cMx:2, cR:7 },
  '8_4': { dN:25, dH:18, dMx:1, dR:7, cN:25, cH:17, cMx:1, cR:8 },
  '8_5': { dN:12, dH:9, dMx:1, dR:3, cN:12, cH:11, cMx:1, cR:1 },
  '8_6': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '9_0': { dN:172, dH:117, dMx:5, dR:39, cN:172, cH:98, cMx:5, cR:53 },
  '9_1': { dN:44, dH:26, dMx:4, dR:10, cN:44, cH:35, cMx:2, cR:8 },
  '9_2': { dN:14, dH:10, dMx:2, dR:3, cN:14, cH:9, cMx:2, cR:4 },
  '9_3': { dN:3, dH:3, dMx:0, dR:0, cN:3, cH:3, cMx:0, cR:0 },
  '10_0': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
};
function bucket(v:number):number { const b=Math.floor(v/CELL_SIZE); return b<0?0:b>9?9:b; }
function cellAt(h:number|null,e:number|null):Cell|null { if(h===null||e===null)return null; return GRID[`${bucket(h)}_${bucket(e)}`]??null; }
function stateOf(n:number,h:number,mx:number):Zone {
  if(n<MIN_N)return 'NEUTRA'; const p=h/n;
  if(mx>=6)return 'AGUJERO'; if(mx===5)return 'TOXICA';
  if(mx<=3&&p>=0.66){ return n>=MIN_SANTUARIO ? 'SANTUARIO' : 'VERDE'; }
  if(mx<=4&&p>=0.60)return 'VERDE';
  if(p>=0.55)return 'PROBE'; return 'TOXICA';
}
export function classifyZone(h:number|null,e:number|null,m:Market):Zone { const c=cellAt(h,e); if(!c)return 'NEUTRA'; return m==='doc'?stateOf(c.dN,c.dH,c.dMx):stateOf(c.cN,c.cH,c.cMx); }
export function currentCellWr(h:number|null,e:number|null,m:Market):number|null { const c=cellAt(h,e); if(!c)return null; const n=m==='doc'?c.dN:c.cN,hh=m==='doc'?c.dH:c.cH; return n>=MIN_N?Math.round(hh/n*1000)/10:null; }
export function currentCellMaxRun(h:number|null,e:number|null,m:Market):number|null { const c=cellAt(h,e); if(!c)return null; const n=m==='doc'?c.dN:c.cN; return n>=MIN_N?(m==='doc'?c.dMx:c.cMx):null; }
export function currentCellN(h:number|null,e:number|null,m:Market):number { const c=cellAt(h,e); if(!c)return 0; return m==='doc'?c.dN:c.cN; }
export interface CellStat { key:string; n:number; hits:number; errs:number; maxRun:number; estado:Zone; }
export function bucketOf(v:number):number { return bucket(v); }
export function cellKeyOf(h:number|null,e:number|null):string|null { if(h===null||e===null)return null; return `${bucket(h)}_${bucket(e)}`; }
export function labelByKey(key:string):string { const [hb,eb]=key.split('_').map(Number); return `HUD ${hb*CELL_SIZE}-${hb*CELL_SIZE+CELL_SIZE-1} · ENT ${eb*CELL_SIZE}-${eb*CELL_SIZE+CELL_SIZE-1}`; }
export function cellStatsByKey(key:string,m:Market):CellStat|null { const c=GRID[key]; if(!c)return null; const n=m==='doc'?c.dN:c.cN,h=m==='doc'?c.dH:c.cH,mx=m==='doc'?c.dMx:c.cMx; return {key,n,hits:h,errs:n-h,maxRun:mx,estado:stateOf(n,h,mx)}; }
export function cellStats(h:number|null,e:number|null,m:Market):CellStat|null { const key=cellKeyOf(h,e); return key?cellStatsByKey(key,m):null; }
export function currentCellLabel(h:number|null,e:number|null):string|null { if(h===null||e===null)return null; const hb=bucket(h),eb=bucket(e); return `HUD ${hb*CELL_SIZE}-${hb*CELL_SIZE+CELL_SIZE-1} · ENT ${eb*CELL_SIZE}-${eb*CELL_SIZE+CELL_SIZE-1}`; }
export function currentCellHint(h:number|null,e:number|null):string|null {
  const c=cellAt(h,e); if(!c)return 'sin datos en esta celda';
  const seg=(n:number,hh:number,mx:number,l:string)=>n>0?`${l} racha máx ${mx} · acierto ${Math.round(hh/n*100)}% (${n}g)`:'';
  const parts=[seg(c.dN,c.dH,c.dMx,'DOC'),seg(c.cN,c.cH,c.cMx,'COL')].filter(Boolean);
  return parts.join(' · ')+(Math.max(c.dN,c.cN)<MIN_N?' — pocos datos':'');
}
export const LIVE_WEIGHT=4; export const LIVE_MIN=2;
export interface LiveRec { hits:number; misses:number; maxStreak:number; }
function fuse(nBase:number,hBase:number,mxBase:number,live:LiveRec|null):Zone {
  const lt=live?live.hits+live.misses:0;
  if(nBase<MIN_N){ if(lt>=MIN_N&&live)return stateOf(lt,live.hits,live.maxStreak); return 'NEUTRA'; }
  if(!live||lt<LIVE_MIN)return stateOf(nBase,hBase,mxBase);
  return stateOf(nBase+LIVE_WEIGHT*lt,hBase+LIVE_WEIGHT*live.hits,Math.max(mxBase,live.maxStreak));
}
export function fusedZone(h:number|null,e:number|null,m:Market,live:LiveRec|null):Zone { const c=cellAt(h,e); if(!c)return 'NEUTRA'; const nB=m==='doc'?c.dN:c.cN,hB=m==='doc'?c.dH:c.cH,mxB=m==='doc'?c.dMx:c.cMx; return fuse(nB,hB,mxB,live); }
export function fusedZoneByKey(key:string,m:Market,live:LiveRec|null):Zone { const c=GRID[key]; if(!c)return 'NEUTRA'; const nB=m==='doc'?c.dN:c.cN,hB=m==='doc'?c.dH:c.cH,mxB=m==='doc'?c.dMx:c.cMx; return fuse(nB,hB,mxB,live); }
export function liveDeviation(h:number|null,e:number|null,m:Market,live:LiveRec|null):'mejor'|'peor'|null {
  const c=cellAt(h,e); if(!c||!live||(live.hits+live.misses)<LIVE_MIN)return null;
  const nB=m==='doc'?c.dN:c.cN,hB=m==='doc'?c.dH:c.cH,mxB=m==='doc'?c.dMx:c.cMx;
  const bs=stateOf(nB,hB,mxB),fs=fusedZone(h,e,m,live); if(bs===fs)return null;
  const rank:Record<Zone,number>={AGUJERO:0,TOXICA:1,PROBE:2,VERDE:3,SANTUARIO:4,NEUTRA:2};
  return rank[fs]>rank[bs]?'mejor':'peor';
}
