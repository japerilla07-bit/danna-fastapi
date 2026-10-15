// Pruebas del Escudo (Capa 2 · COBERTURA) — copilot.ts. Ejecutar: node tests/run.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { decidirPiloto, registrarGiroCobertura, resetCobertura, resetUltimoMercado, type MarketRead, type DecisionPiloto } from '../../src/domain/copilot';

const D1 = '1-12', D2 = '13-24', D3 = '25-36';
const lectura = (mkt: 'doc' | 'col', o: Partial<MarketRead> = {}): MarketRead => ({
  mkt, estado: 'NEUTRA', cellWr: null, termoHits: 0, termoTotal: 0, termoStreak: 0, liveStreak: 0, cellCeiling: null, ...o,
});
const decidir = (): DecisionPiloto => decidirPiloto(lectura('doc'), lectura('col'));
const alimentar = (spins: number[]): DecisionPiloto => { spins.forEach(registrarGiroCobertura); return decidir(); };
const docDe = (d: DecisionPiloto) => (d.escudo.doc ? [...d.escudo.doc.zonas].sort() : null);
const colDe = (d: DecisionPiloto) => (d.escudo.col ? [...d.escudo.col.zonas].sort() : null);
// Un número por docena (columnas 2,2,3 → 5=c2, 18=c3, 30=c3); lo que importa en estas pruebas es el mercado docenas.
const d1 = 5, d2 = 18, d3 = 30;

beforeEach(() => { resetCobertura(); resetUltimoMercado(); });

test('ventana incompleta: con 6 giros no se activa, con el 7º sí', () => {
  const d6 = alimentar([d1, d1, d1, d1, d1, d2]);
  assert.equal(d6.escudo.activo, false); assert.equal(d6.capa, 'CAPA1');
  const d7 = alimentar([d1]);
  assert.equal(d7.escudo.doc !== null, true);
});

test('distribuciones de docenas: 4-2-1, 3-3-1, 6-1-0 activan; 3-2-2 y 2-3-2 no', () => {
  assert.deepEqual(docDe(alimentar([d3, d1, d1, d2, d1, d2, d1])), [D1, D2].sort());        // 4-2-1
  resetCobertura();
  assert.deepEqual(docDe(alimentar([d3, d1, d2, d1, d2, d1, d2])), [D1, D2].sort());        // 3-3-1
  resetCobertura();
  assert.deepEqual(docDe(alimentar([d1, d1, d1, d1, d1, d1, d2])), [D1, D2].sort());        // 6-1-0
  resetCobertura();
  assert.equal(alimentar([d1, d2, d3, d1, d2, d3, d1]).escudo.doc, null);                   // 3-2-2 (gap 1)
  resetCobertura();
  assert.equal(alimentar([d1, d2, d3, d2, d1, d3, d2]).escudo.doc, null);                   // 2-3-2 (gap 1)
});

test('empate de conteo: gana la zona que salió más tarde (no el orden fijo d1,d2,d3)', () => {
  // conteos 3-3-1, d1 y d3 empatan en puntaje ponderado; d3 salió en el último giro.
  const d = alimentar([d1, d2, d1, d2, d1, d2, d3]);
  assert.deepEqual(docDe(d), [D2, D3].sort());
  assert.equal(d.escudo.doc!.excluida, D1);
});

test('el cero ocupa lugar en la ventana pero no cuenta en ninguna zona', () => {
  const d = alimentar([d1, d1, 0, d1, d1, d2, d1]);   // 5-1-0 + un cero
  assert.deepEqual(docDe(d), [D1, D2].sort());
  const e = alimentar([0]);                             // el cero empuja al más viejo: ventana 4-1-0 + dos ceros, sigue marcada
  assert.deepEqual(docDe(e), [D1, D2].sort());
});

test('el par cambia dentro de docenas cuando los giros recientes lo desplazan', () => {
  let d = alimentar([d1, d1, d1, d2, d2, d1, d2]);       // 4-3-0 → {d1,d2}
  assert.deepEqual(docDe(d), [D1, D2].sort());
  d = alimentar([d3, d3, d3]);                           // ventana d2,d2,d1,d2,d3,d3,d3 → d3 y d2 pasan al frente
  assert.deepEqual(docDe(d), [D2, D3].sort());
  assert.equal(d.escudo.doc!.excluida, D1);
});

test('el par cambia dentro de columnas', () => {
  const c1 = 1, c2 = 2, c3 = 3;
  let d = alimentar([c1, c1, c1, c2, c2, c1, c2]);       // 4-3-0 → {C1,C2}
  assert.deepEqual(colDe(d), ['Columna 1', 'Columna 2']);
  d = alimentar([c3, c3, c3]);                           // columna 3 entra con fuerza
  assert.deepEqual(colDe(d), ['Columna 2', 'Columna 3']);
});

test('se apaga cuando ya no hay distribución marcada', () => {
  let d = alimentar([d1, d1, d1, d1, d2, d2, d1]);       // 5-2-0 → activa
  assert.deepEqual(docDe(d), [D1, D2].sort());
  d = alimentar([d3, d3, d3]);                           // ventana d1,d2,d2,d1,d3,d3,d3 → 2-2-3 (gap 1) → apagada
  assert.equal(d.escudo.doc, null);
  assert.equal(d.pickDoc, undefined);
});

test('prioridad (cobertura doble): manda el mercado cuyo par cubre más de la ventana, aunque la regla de siempre elija otro', () => {
  // docenas 1-1-1... todo en d1 → par {d1,d2} cubre el 100%; columnas c1:4, c2:2, c3:1 → el par cubre menos → 'doc'
  let d = alimentar([1, 2, 4, 5, 7, 9, 10]);
  assert.equal(d.capa, 'COBERTURA_DOBLE'); assert.equal(d.principal, 'doc');
  // docenas 2-4-1 (par {d2,d3} ≈ 85%) y columnas sin c3 (par {c1,c2} = 100%) → 'col'. Con lecturas iguales la regla de siempre daría 'doc'.
  resetCobertura();
  d = alimentar([13, 14, 1, 2, 25, 13, 14]);
  assert.equal(d.capa, 'COBERTURA_DOBLE'); assert.equal(d.principal, 'col');
  assert.deepEqual(docDe(d), [D2, D3].sort()); assert.deepEqual(colDe(d), ['Columna 1', 'Columna 2']);
});

test('reset de sesión: la ventana vuelve a necesitar 7 giros', () => {
  alimentar([d1, d1, d1, d1, d1, d1, d2]);
  resetCobertura();
  assert.equal(decidir().escudo.activo, false);
  assert.equal(alimentar([d1, d1, d1, d1, d1, d1]).escudo.activo, false);
});

test('determinista: misma secuencia → mismas decisiones', () => {
  const sec = [5, 18, 30, 5, 5, 18, 7, 22, 22, 36, 1, 0, 14, 14, 25, 9, 9, 9, 33, 2];
  const corrida = () => { resetCobertura(); resetUltimoMercado(); return sec.map((n) => { registrarGiroCobertura(n); return JSON.stringify(decidir()); }); };
  assert.deepEqual(corrida(), corrida());
});

// ── Prueba diferencial: oráculo independiente (pesos, desempate, activación, principal) sobre secuencias pseudoaleatorias fijas ──
const PESOS = [1, 1, 1, 1, 2, 3, 4].map((w) => (w * 7) / 13);
const dozen = (n: number) => (n === 0 ? null : n <= 12 ? D1 : n <= 24 ? D2 : D3);
const colm = (n: number) => (n === 0 ? null : n % 3 === 1 ? 'Columna 1' : n % 3 === 2 ? 'Columna 2' : 'Columna 3');
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function leerOraculo(win: number[], f: (n: number) => string | null, zs: string[]) {
  const sc: Record<string, number> = {}, cn: Record<string, number> = {}, last: Record<string, number> = {};
  zs.forEach((z) => { sc[z] = 0; cn[z] = 0; last[z] = -1; });
  win.forEach((n, i) => { const z = f(n); if (z) { sc[z] += PESOS[7 - win.length + i]; cn[z]++; last[z] = i; } });
  const ord = [...zs].sort((a, b) => (Math.abs(sc[b] - sc[a]) > 1e-9 ? sc[b] - sc[a] : last[b] !== last[a] ? last[b] - last[a] : zs.indexOf(a) - zs.indexOf(b)));
  const cs = Object.values(cn);
  const par = (p: string[]) => p.reduce((s, z) => s + sc[z], 0);
  const total = Object.values(sc).reduce((a, b) => a + b, 0) || 1;
  return { top2: [ord[0], ord[1]], marcada: Math.max(...cs) - Math.min(...cs) >= 2, par, total };
}
test('diferencial: 40 secuencias de 120 giros — par, activación y prioridad coinciden con un oráculo independiente', () => {
  let dobles = 0;
  for (let s = 0; s < 40; s++) {
    resetCobertura(); resetUltimoMercado();
    const rnd = mulberry32(1000 + s); const win: number[] = [];
    let actD: string[] | null = null, actC: string[] | null = null;
    for (let t = 0; t < 120; t++) {
      const n = Math.floor(rnd() * 37); registrarGiroCobertura(n);
      win.push(n); if (win.length > 7) win.shift();
      const od = leerOraculo(win, dozen, [D1, D2, D3]); const oc = leerOraculo(win, colm, ['Columna 1', 'Columna 2', 'Columna 3']);
      const paso = (act: string[] | null, o: ReturnType<typeof leerOraculo>) => {
        if (!act) return win.length >= 7 && o.marcada ? o.top2 : null;
        if (!o.marcada) return null;
        return [...act].sort().join() === [...o.top2].sort().join() ? act : o.top2;
      };
      const pd = actD; actD = paso(actD, od); actC = paso(actC, oc);
      const d = decidir();
      const rd = d.escudo.doc ? d.escudo.doc.zonas : null, rc = d.escudo.col ? d.escudo.col.zonas : null;
      const mismo = (a: string[] | null, b: string[] | null, prev: string[] | null, o: ReturnType<typeof leerOraculo>) => {
        if (a === null || b === null) return a === b;
        if ([...a].sort().join() === [...b].sort().join()) return true;
        // casi-empate de puntaje: se acepta el par vigente o el candidato
        return !!prev && Math.abs(o.par(a) - o.par(prev)) < 1e-6 && [...b].sort().join() === [...prev].sort().join();
      };
      assert.ok(mismo(actD, rd, pd, od), `docenas sec ${s} giro ${t}`);
      if (rd && rc) {
        dobles++;
        assert.equal(d.capa, 'COBERTURA_DOBLE');
        const fd = od.par(rd) / od.total, fc = oc.par(rc) / oc.total;
        if (Math.abs(fd - fc) > 1e-6) assert.equal(d.principal, fd > fc ? 'doc' : 'col', `principal sec ${s} giro ${t}`);
        assert.ok(d.principal === 'doc' || d.principal === 'col');
      }
      // coherencia del contrato: lo que se muestra = lo que está activo
      assert.equal(d.pickDoc, rd ? rd.join(' / ') : undefined);
      assert.equal(d.pickCol, rc ? rc.join(' / ') : undefined);
      assert.equal(d.escudo.activo, !!(rd || rc));
      assert.equal(d.capa, rd && rc ? 'COBERTURA_DOBLE' : rd ? 'COBERTURA_DOC' : rc ? 'COBERTURA_COL' : 'CAPA1');
      if (d.capa !== 'COBERTURA_DOBLE') assert.equal(d.principal, undefined);
    }
  }
  assert.ok(dobles > 200, `la prueba debe ejercitar la cobertura doble (${dobles})`);
});

test('la Capa 1 no cambia por el Escudo: capa1Decision es la decisión de decidir() sola', () => {
  const doc = lectura('doc', { estado: 'SANTUARIO', termoHits: 3, termoTotal: 4 });
  const col = lectura('col', { estado: 'TOXICA' });
  const sinEscudo = decidirPiloto(doc, col);
  resetUltimoMercado();
  registrarGiroCobertura(d1); registrarGiroCobertura(d1); registrarGiroCobertura(d1); registrarGiroCobertura(d1); registrarGiroCobertura(d1); registrarGiroCobertura(d1); registrarGiroCobertura(d2);
  resetUltimoMercado();
  const conEscudo = decidirPiloto(doc, col);
  assert.deepEqual(conEscudo.capa1Decision, sinEscudo.capa1Decision);
});
