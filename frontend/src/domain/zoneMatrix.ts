// D.A.N.N.A. — Matriz v8: grilla 10×10 · 81 celdas · 24 sesiones (9334 giros doc)
// CONSOLIDADA: SANTUARIO exige MIN_SANTUARIO=30 giros; con 6-29 giros y % de
// santuario, baja a VERDE (el % de pocos giros es ruido). Racha máx del sistema
// sobre 24 sesiones = 6 (1 cada ~500 apuestas). El motor apuesta BET; panel solo lee.
export type Zone = 'SANTUARIO' | 'VERDE' | 'PROBE' | 'TOXICA' | 'AGUJERO' | 'NEUTRA';
export type Market = 'doc' | 'col';
export const MIN_N = 6;
export const MIN_SANTUARIO = 30;
export const CELL_SIZE = 10;
interface Cell { dN:number; dH:number; dMx:number; dR:number; cN:number; cH:number; cMx:number; cR:number; }
const GRID: Record<string, Cell> = {
  '1_0': { dN:1, dH:0, dMx:1, dR:1, cN:1, cH:0, cMx:1, cR:1 },
  '1_1': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:1, cMx:1, cR:1 },
  '1_3': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '1_4': { dN:6, dH:3, dMx:2, dR:2, cN:6, cH:5, cMx:1, cR:1 },
  '1_5': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:3, cMx:1, cR:1 },
  '1_6': { dN:5, dH:5, dMx:0, dR:0, cN:5, cH:4, cMx:1, cR:1 },
  '1_7': { dN:4, dH:4, dMx:0, dR:0, cN:4, cH:2, cMx:1, cR:2 },
  '1_8': { dN:7, dH:6, dMx:1, dR:1, cN:7, cH:4, cMx:1, cR:3 },
  '1_9': { dN:1, dH:1, dMx:0, dR:0, cN:1, cH:1, cMx:0, cR:0 },
  '2_0': { dN:12, dH:6, dMx:2, dR:5, cN:12, cH:8, cMx:1, cR:4 },
  '2_1': { dN:16, dH:9, dMx:2, dR:6, cN:16, cH:10, cMx:1, cR:6 },
  '2_2': { dN:20, dH:10, dMx:1, dR:10, cN:20, cH:13, cMx:1, cR:7 },
  '2_3': { dN:17, dH:9, dMx:2, dR:7, cN:17, cH:10, cMx:3, cR:5 },
  '2_4': { dN:33, dH:27, dMx:2, dR:5, cN:33, cH:21, cMx:2, cR:11 },
  '2_5': { dN:50, dH:27, dMx:3, dR:14, cN:50, cH:34, cMx:3, cR:9 },
  '2_6': { dN:36, dH:20, dMx:3, dR:11, cN:36, cH:20, cMx:2, cR:14 },
  '2_7': { dN:40, dH:22, dMx:2, dR:15, cN:40, cH:22, cMx:3, cR:11 },
  '2_8': { dN:28, dH:16, dMx:4, dR:7, cN:28, cH:19, cMx:2, cR:8 },
  '2_9': { dN:18, dH:13, dMx:1, dR:5, cN:18, cH:10, cMx:1, cR:8 },
  '3_0': { dN:68, dH:36, dMx:8, dR:20, cN:68, cH:46, cMx:2, cR:16 },
  '3_1': { dN:92, dH:66, dMx:2, dR:21, cN:92, cH:55, cMx:3, cR:26 },
  '3_2': { dN:111, dH:75, dMx:2, dR:31, cN:111, cH:69, cMx:3, cR:26 },
  '3_3': { dN:120, dH:85, dMx:3, dR:27, cN:120, cH:81, cMx:4, cR:29 },
  '3_4': { dN:116, dH:80, dMx:4, dR:29, cN:116, cH:81, cMx:3, cR:24 },
  '3_5': { dN:149, dH:96, dMx:5, dR:31, cN:149, cH:98, cMx:3, cR:34 },
  '3_6': { dN:166, dH:108, dMx:4, dR:40, cN:166, cH:113, cMx:3, cR:40 },
  '3_7': { dN:194, dH:126, dMx:4, dR:45, cN:194, cH:129, cMx:5, cR:43 },
  '3_8': { dN:135, dH:95, dMx:3, dR:30, cN:135, cH:83, cMx:3, cR:37 },
  '3_9': { dN:50, dH:35, dMx:2, dR:12, cN:50, cH:34, cMx:2, cR:12 },
  '4_0': { dN:212, dH:132, dMx:5, dR:60, cN:212, cH:136, cMx:4, cR:56 },
  '4_1': { dN:285, dH:183, dMx:9, dR:68, cN:285, cH:200, cMx:4, cR:61 },
  '4_2': { dN:337, dH:242, dMx:3, dR:70, cN:337, cH:236, cMx:4, cR:74 },
  '4_3': { dN:343, dH:241, dMx:5, dR:74, cN:343, cH:215, cMx:7, cR:82 },
  '4_4': { dN:408, dH:269, dMx:5, dR:96, cN:408, cH:259, cMx:5, cR:100 },
  '4_5': { dN:331, dH:208, dMx:5, dR:81, cN:331, cH:227, cMx:4, cR:76 },
  '4_6': { dN:290, dH:190, dMx:5, dR:65, cN:290, cH:190, cMx:4, cR:69 },
  '4_7': { dN:231, dH:154, dMx:3, dR:54, cN:231, cH:134, cMx:4, cR:60 },
  '4_8': { dN:95, dH:53, dMx:3, dR:29, cN:95, cH:62, cMx:2, cR:26 },
  '4_9': { dN:39, dH:27, dMx:2, dR:11, cN:39, cH:26, cMx:2, cR:11 },
  '5_0': { dN:362, dH:219, dMx:4, dR:96, cN:362, cH:236, cMx:4, cR:86 },
  '5_1': { dN:395, dH:264, dMx:7, dR:92, cN:395, cH:262, cMx:4, cR:94 },
  '5_2': { dN:511, dH:332, dMx:4, dR:126, cN:511, cH:311, cMx:7, cR:122 },
  '5_3': { dN:409, dH:267, dMx:3, dR:99, cN:409, cH:268, cMx:8, cR:95 },
  '5_4': { dN:416, dH:276, dMx:3, dR:99, cN:416, cH:255, cMx:6, cR:95 },
  '5_5': { dN:220, dH:145, dMx:3, dR:52, cN:220, cH:130, cMx:7, cR:52 },
  '5_6': { dN:106, dH:59, dMx:5, dR:31, cN:106, cH:73, cMx:3, cR:23 },
  '5_7': { dN:38, dH:19, dMx:4, dR:10, cN:38, cH:26, cMx:2, cR:10 },
  '5_8': { dN:9, dH:8, dMx:1, dR:1, cN:9, cH:8, cMx:1, cR:1 },
  '5_9': { dN:5, dH:3, dMx:1, dR:2, cN:5, cH:2, cMx:1, cR:3 },
  '6_0': { dN:366, dH:237, dMx:5, dR:90, cN:366, cH:235, cMx:4, cR:87 },
  '6_1': { dN:349, dH:228, dMx:3, dR:90, cN:349, cH:226, cMx:3, cR:87 },
  '6_2': { dN:263, dH:175, dMx:4, dR:68, cN:263, cH:169, cMx:4, cR:64 },
  '6_3': { dN:104, dH:76, dMx:2, dR:22, cN:104, cH:73, cMx:3, cR:23 },
  '6_4': { dN:52, dH:33, dMx:5, dR:13, cN:52, cH:34, cMx:3, cR:14 },
  '6_5': { dN:22, dH:15, dMx:1, dR:7, cN:22, cH:16, cMx:2, cR:5 },
  '6_6': { dN:17, dH:11, dMx:2, dR:5, cN:17, cH:11, cMx:1, cR:6 },
  '6_7': { dN:12, dH:8, dMx:1, dR:4, cN:12, cH:7, cMx:3, cR:3 },
  '6_8': { dN:12, dH:9, dMx:2, dR:2, cN:12, cH:9, cMx:2, cR:2 },
  '6_9': { dN:4, dH:2, dMx:1, dR:2, cN:4, cH:3, cMx:1, cR:1 },
  '7_0': { dN:307, dH:195, dMx:6, dR:81, cN:307, cH:199, cMx:5, cR:75 },
  '7_1': { dN:185, dH:130, dMx:3, dR:39, cN:185, cH:125, cMx:5, cR:40 },
  '7_2': { dN:129, dH:86, dMx:4, dR:31, cN:129, cH:83, cMx:5, cR:28 },
  '7_3': { dN:88, dH:52, dMx:3, dR:25, cN:88, cH:56, cMx:3, cR:22 },
  '7_4': { dN:54, dH:34, dMx:3, dR:16, cN:54, cH:37, cMx:2, cR:15 },
  '7_5': { dN:36, dH:25, dMx:2, dR:9, cN:36, cH:30, cMx:2, cR:5 },
  '7_6': { dN:29, dH:22, dMx:2, dR:6, cN:29, cH:21, cMx:2, cR:7 },
  '7_7': { dN:18, dH:10, dMx:1, dR:8, cN:18, cH:11, cMx:1, cR:7 },
  '7_8': { dN:8, dH:3, dMx:1, dR:5, cN:8, cH:6, cMx:1, cR:2 },
  '7_9': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:2, cMx:0, cR:0 },
  '8_0': { dN:281, dH:174, dMx:4, dR:79, cN:281, cH:175, cMx:5, cR:71 },
  '8_1': { dN:111, dH:68, dMx:3, dR:32, cN:111, cH:73, cMx:3, cR:26 },
  '8_2': { dN:80, dH:48, dMx:4, dR:26, cN:80, cH:57, cMx:3, cR:20 },
  '8_3': { dN:31, dH:19, dMx:2, dR:10, cN:31, cH:21, cMx:2, cR:6 },
  '8_4': { dN:20, dH:13, dMx:1, dR:7, cN:20, cH:13, cMx:1, cR:7 },
  '8_5': { dN:10, dH:7, dMx:1, dR:3, cN:10, cH:9, cMx:1, cR:1 },
  '8_6': { dN:2, dH:2, dMx:0, dR:0, cN:2, cH:0, cMx:1, cR:2 },
  '9_0': { dN:144, dH:94, dMx:5, dR:35, cN:144, cH:77, cMx:5, cR:48 },
  '9_1': { dN:39, dH:21, dMx:4, dR:10, cN:39, cH:31, cMx:2, cR:7 },
  '9_2': { dN:10, dH:7, dMx:2, dR:2, cN:10, cH:6, cMx:2, cR:3 },
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
  
