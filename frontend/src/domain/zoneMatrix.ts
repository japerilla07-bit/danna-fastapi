// D.A.N.N.A. — Matriz v6: grilla 10×10 · RIESGO DE RACHA + acierto · 79 celdas · 17 sesiones
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
  '2_0': { dN:12, dH:6, dMx:2, dR:5, cN:12, cH:8, cMx:1, cR:4 },
  '2_1': { dN:16, dH:9, dMx:2, dR:6, cN:16, cH:10, cMx:1, cR:6 },
  '2_2': { dN:15, dH:9, dMx:1, dR:6, cN:15, cH:10, cMx:1, cR:5 },
  '2_3': { dN:13, dH:6, dMx:2, dR:6, cN:13, cH:7, cMx:3, cR:4 },
  '2_4': { dN:22, dH:18, dMx:2, dR:3, cN:22, cH:14, cMx:2, cR:7 },
  '2_5': { dN:37, dH:22, dMx:3, dR:9, cN:37, cH:27, cMx:2, cR:7 },
  '2_6': { dN:25, dH:17, dMx:2, dR:7, cN:25, cH:14, cMx:2, cR:9 },
  '2_7': { dN:31, dH:18, dMx:2, dR:11, cN:31, cH:17, cMx:3, cR:8 },
  '2_8': { dN:23, dH:11, dMx:4, dR:7, cN:23, cH:17, cMx:2, cR:5 },
  '2_9': { dN:16, dH:12, dMx:1, dR:4, cN:16, cH:9, cMx:1, cR:7 },
  '3_0': { dN:52, dH:31, dMx:3, dR:16, cN:52, cH:34, cMx:2, cR:13 },
  '3_1': { dN:71, dH:52, dMx:2, dR:16, cN:71, cH:44, cMx:3, cR:19 },
  '3_2': { dN:85, dH:60, dMx:2, dR:23, cN:85, cH:54, cMx:3, cR:20 },
  '3_3': { dN:96, dH:68, dMx:3, dR:21, cN:96, cH:65, cMx:4, cR:23 },
  '3_4': { dN:89, dH:62, dMx:3, dR:23, cN:89, cH:59, cMx:3, cR:21 },
  '3_5': { dN:110, dH:71, dMx:5, dR:23, cN:110, cH:71, cMx:3, cR:24 },
  '3_6': { dN:124, dH:84, dMx:3, dR:27, cN:124, cH:83, cMx:3, cR:29 },
  '3_7': { dN:136, dH:89, dMx:4, dR:28, cN:136, cH:87, cMx:5, cR:32 },
  '3_8': { dN:95, dH:65, dMx:3, dR:21, cN:95, cH:59, cMx:3, cR:25 },
  '3_9': { dN:40, dH:29, dMx:2, dR:9, cN:40, cH:29, cMx:2, cR:8 },
  '4_0': { dN:153, dH:96, dMx:5, dR:43, cN:153, cH:98, cMx:4, cR:42 },
  '4_1': { dN:203, dH:129, dMx:9, dR:49, cN:203, cH:142, cMx:4, cR:43 },
  '4_2': { dN:244, dH:175, dMx:3, dR:50, cN:244, cH:169, cMx:4, cR:52 },
  '4_3': { dN:230, dH:161, dMx:4, dR:52, cN:230, cH:143, cMx:7, cR:55 },
  '4_4': { dN:293, dH:185, dMx:5, dR:75, cN:293, cH:179, cMx:5, cR:72 },
  '4_5': { dN:229, dH:147, dMx:5, dR:53, cN:229, cH:154, cMx:4, cR:53 },
  '4_6': { dN:204, dH:129, dMx:5, dR:45, cN:204, cH:133, cMx:4, cR:48 },
  '4_7': { dN:163, dH:114, dMx:3, dR:33, cN:163, cH:99, cMx:4, cR:42 },
  '4_8': { dN:67, dH:38, dMx:3, dR:20, cN:67, cH:44, cMx:2, cR:19 },
  '4_9': { dN:24, dH:14, dMx:2, dR:9, cN:24, cH:16, cMx:2, cR:7 },
  '5_0': { dN:273, dH:170, dMx:4, dR:72, cN:273, cH:187, cMx:3, cR:61 },
  '5_1': { dN:271, dH:175, dMx:7, dR:66, cN:271, cH:183, cMx:4, cR:65 },
  '5_2': { dN:384, dH:243, dMx:4, dR:100, cN:384, cH:233, cMx:7, cR:88 },
  '5_3': { dN:307, dH:198, dMx:3, dR:73, cN:307, cH:203, cMx:6, cR:70 },
  '5_4': { dN:291, dH:187, dMx:3, dR:68, cN:291, cH:174, cMx:6, cR:65 },
  '5_5': { dN:149, dH:102, dMx:3, dR:33, cN:149, cH:90, cMx:7, cR:32 },
  '5_6': { dN:72, dH:43, dMx:5, dR:18, cN:72, cH:51, cMx:3, cR:15 },
  '5_7': { dN:29, dH:19, dMx:2, dR:7, cN:29, cH:20, cMx:2, cR:7 },
  '5_8': { dN:4, dH:3, dMx:1, dR:1, cN:4, cH:3, cMx:1, cR:1 },
  '5_9': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:2, cMx:1, cR:3 },
  '6_0': { dN:237, dH:156, dMx:5, dR:54, cN:237, cH:149, cMx:4, cR:58 },
  '6_1': { dN:251, dH:163, dMx:3, dR:63, cN:251, cH:158, cMx:3, cR:66 },
  '6_2': { dN:185, dH:127, dMx:3, dR:47, cN:185, cH:120, cMx:4, cR:43 },
  '6_3': { dN:59, dH:40, dMx:2, dR:14, cN:59, cH:41, cMx:2, cR:14 },
  '6_4': { dN:31, dH:21, dMx:5, dR:5, cN:31, cH:18, cMx:2, cR:11 },
  '6_5': { dN:15, dH:11, dMx:1, dR:4, cN:15, cH:10, cMx:2, cR:4 },
  '6_6': { dN:13, dH:8, dMx:2, dR:4, cN:13, cH:9, cMx:1, cR:4 },
  '6_7': { dN:10, dH:6, dMx:1, dR:4, cN:10, cH:5, cMx:3, cR:3 },
  '6_8': { dN:8, dH:5, dMx:2, dR:2, cN:8, cH:5, cMx:2, cR:2 },
  '6_9': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '7_0': { dN:179, dH:114, dMx:6, dR:43, cN:179, cH:107, cMx:5, cR:47 },
  '7_1': { dN:125, dH:91, dMx:3, dR:24, cN:125, cH:82, cMx:5, cR:27 },
  '7_2': { dN:93, dH:60, dMx:4, dR:23, cN:93, cH:56, cMx:5, cR:22 },
  '7_3': { dN:49, dH:33, dMx:3, dR:12, cN:49, cH:32, cMx:3, cR:12 },
  '7_4': { dN:38, dH:22, dMx:3, dR:12, cN:38, cH:29, cMx:1, cR:9 },
  '7_5': { dN:21, dH:15, dMx:2, dR:5, cN:21, cH:18, cMx:1, cR:3 },
  '7_6': { dN:20, dH:16, dMx:2, dR:3, cN:20, cH:13, cMx:2, cR:6 },
  '7_7': { dN:9, dH:5, dMx:1, dR:4, cN:9, cH:6, cMx:1, cR:3 },
  '7_8': { dN:7, dH:2, dMx:1, dR:5, cN:7, cH:6, cMx:1, cR:1 },
  '7_9': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '8_0': { dN:174, dH:106, dMx:4, dR:53, cN:174, cH:112, cMx:4, cR:47 },
  '8_1': { dN:76, dH:47, dMx:3, dR:23, cN:76, cH:52, cMx:3, cR:17 },
  '8_2': { dN:47, dH:25, dMx:4, dR:17, cN:47, cH:33, cMx:2, cR:13 },
  '8_3': { dN:17, dH:7, dMx:2, dR:8, cN:17, cH:9, cMx:2, cR:4 },
  '8_4': { dN:13, dH:10, dMx:1, dR:3, cN:13, cH:8, cMx:1, cR:5 },
  '8_5': { dN:5, dH:4, dMx:1, dR:1, cN:5, cH:4, cMx:1, cR:1 },
  '8_6': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '9_0': { dN:75, dH:48, dMx:5, dR:16, cN:75, cH:41, cMx:3, cR:26 },
  '9_1': { dN:24, dH:11, dMx:4, dR:8, cN:24, cH:18, cMx:2, cR:5 },
  '9_2': { dN:3, dH:2, dMx:1, dR:1, cN:3, cH:1, cMx:1, cR:2 },
  '9_3': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
};
function bucket(v:number):number { const b=Math.floor(v/CELL_SIZE); return b<0?0:b>9?9:b; }
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
               
