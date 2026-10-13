import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarEntrada, CAP_REGISTRO, fmtDelta, leerRendimiento, lineaTendencia, unir, VENTANA } from '../../src/domain/rendimiento';
import type { EntradaRend } from '../../src/domain/rendimiento';
import { useTelemetryStore } from '../../src/store/telemetryStore';

const N: EntradaRend = { danna: null, capa1: null, escudo: null, motorDoc: null, motorCol: null };
/** Giro donde cada voz sugirió y acertó (true) / falló (false); lo que no se nombra, no sugirió. */
const g = (o: Partial<EntradaRend>): EntradaRend => ({ ...N, ...o });
const rep = (n: number, e: EntradaRend): EntradaRend[] => Array.from({ length: n }, () => e);
const ok = (f: keyof EntradaRend) => g({ [f]: true });
const no = (f: keyof EntradaRend) => g({ [f]: false });

test('con menos de 12 giros solo junta: no califica a nadie', () => {
  const l = leerRendimiento(rep(7, g({ capa1: true, escudo: false })));
  assert.equal(l.veredicto, 'juntando');
  assert.deepEqual([l.mejores, l.peores], [[], []]);
  assert.match(l.texto, /7\/12/);
  assert.equal(leerRendimiento([]).veredicto, 'juntando');
});

test('mejor y peor: grupos de las voces que van arriba y abajo', () => {
  // 12 giros: Capa 1 y Motor (doc) aciertan casi todo; Escudo y D.A.N.N.A. fallan casi todo.
  const log = [...rep(10, g({ capa1: true, motorDoc: true, escudo: false, danna: false })), ...rep(2, g({ capa1: false, motorDoc: false, escudo: true, danna: true }))];
  const l = leerRendimiento(log);
  assert.equal(l.veredicto, 'hay');
  assert.deepEqual(l.mejores.sort(), ['capa1', 'motor']);
  assert.deepEqual(l.peores.sort(), ['danna', 'escudo']);
  assert.equal(l.texto, 'Mejor: Motor y Capa 1 · Peor: Escudo y D.A.N.N.A.');
});

test('diferencia chica = parejo (no inventa un ganador)', () => {
  // Capa 1: 7/12, Escudo: 6/12 (8 puntos de diferencia) → parejo
  const log = Array.from({ length: 12 }, (_, i) => g({ capa1: i < 7, escudo: i < 6 }));
  const l = leerRendimiento(log);
  assert.equal(l.veredicto, 'parejo');
  assert.deepEqual([l.mejores, l.peores], [[], []]);
});

test('una voz con menos de 4 sugerencias en la ventana no se califica', () => {
  // Escudo solo habló 3 veces (3/3 = 100% sería ruido); Capa 1 12 veces con 50%; Motor 24 eventos al 25%.
  const log = Array.from({ length: 12 }, (_, i) => g({ capa1: i % 2 === 0, escudo: i < 3 ? true : null, motorDoc: i % 4 === 0, motorCol: false }));
  const l = leerRendimiento(log);
  const esc = l.medidas.find((m) => m.fuente === 'escudo')!;
  assert.deepEqual([esc.hits, esc.n, esc.tasa], [3, 3, null]);
  assert.ok(!l.mejores.includes('escudo') && !l.peores.includes('escudo'));
  assert.equal(l.veredicto, 'hay'); // Capa 1 50% contra Motor 12.5%
  assert.deepEqual(l.mejores, ['capa1']);
  assert.deepEqual(l.peores, ['motor']);
});

test('el Motor cuenta docenas y columnas como eventos separados (como sus celdas)', () => {
  const l = leerRendimiento(rep(12, g({ motorDoc: true, motorCol: false })));
  const m = l.medidas.find((x) => x.fuente === 'motor')!;
  assert.deepEqual([m.hits, m.n, m.tasa], [12, 24, 0.5]);
});

test('menos de 2 voces calificadas: no compara', () => {
  const l = leerRendimiento(rep(12, g({ capa1: true })));
  assert.equal(l.veredicto, 'juntando');
  assert.match(l.texto, /Pocas sugerencias/);
});

test('solo cuenta la ventana de los últimos 12 giros', () => {
  const viejo = rep(30, g({ capa1: false, motorDoc: true }));
  const reciente = rep(12, g({ capa1: true, motorDoc: false }));
  const l = leerRendimiento([...viejo, ...reciente]);
  const c1 = l.medidas.find((m) => m.fuente === 'capa1')!;
  assert.deepEqual([c1.hits, c1.n], [12, 12]);
  assert.deepEqual(l.mejores, ['capa1']);
});

test('tendencia: compara contra los 12 anteriores, solo con 2 ventanas completas', () => {
  const antes = rep(12, g({ capa1: false, escudo: true }));
  const ahora = rep(12, g({ capa1: true, escudo: false }));
  const l = leerRendimiento([...antes, ...ahora]);
  assert.equal(l.medidas.find((m) => m.fuente === 'capa1')!.tendencia, 'sube');
  assert.equal(l.medidas.find((m) => m.fuente === 'escudo')!.tendencia, 'baja');
  // con solo 12 giros no hay ventana anterior
  assert.ok(leerRendimiento(ahora).medidas.every((m) => m.tendencia === null));
  // cambio chico: sin flecha
  const l2 = leerRendimiento([...Array.from({ length: 12 }, (_, i) => g({ capa1: i < 7 })), ...Array.from({ length: 12 }, (_, i) => g({ capa1: i < 8 }))]);
  assert.equal(l2.medidas.find((m) => m.fuente === 'capa1')!.tendencia, null);
});

test('empate técnico arriba: la voz que está a 4 puntos de la mejor también va en "Mejor"; a 8 o más, no', () => {
  // Capa 1 12/12 (100%), Motor 23/24 (96%), D.A.N.N.A. 6/12 (50%)
  const log = Array.from({ length: 12 }, (_, i) => g({ capa1: true, motorDoc: true, motorCol: i !== 0, danna: i < 6 }));
  const l = leerRendimiento(log);
  assert.deepEqual(l.mejores.sort(), ['capa1', 'motor']);
  assert.deepEqual(l.peores, ['danna']);
  // Escudo 11/12 (92%) queda a 8 puntos de Capa 1: ya no es "mejor"
  const log2 = Array.from({ length: 12 }, (_, i) => g({ capa1: true, escudo: i !== 0, danna: i < 6 }));
  const l2 = leerRendimiento(log2);
  assert.deepEqual(l2.mejores, ['capa1']);
});

test('ascenso / descenso: dice quién viene subiendo y quién bajando, con los puntos de cambio', () => {
  const antes = rep(12, g({ capa1: false, escudo: true, motorDoc: true, motorCol: true }));
  const ahora = rep(12, g({ capa1: true, escudo: false, motorDoc: true, motorCol: true }));
  const l = leerRendimiento([...antes, ...ahora]);
  assert.deepEqual(l.ascenso, ['capa1']);
  assert.deepEqual(l.descenso, ['escudo']);
  assert.equal(l.conPrevia, true);
  const t = lineaTendencia(l);
  assert.equal(t.estado, 'hay');
  assert.equal(t.texto, 'En ascenso: Capa 1 (+100 pts) · En descenso: Escudo (−100 pts)');
  assert.deepEqual(t.ascenso, [{ fuente: 'capa1', delta: 100 }]);
  // el Motor no se movió: no aparece en ninguna lista
  assert.ok(![...t.ascenso, ...t.descenso].some((x) => x.fuente === 'motor'));
});

test('solo ascenso o solo descenso: la frase trae solo lo que hay', () => {
  const antes = rep(12, g({ capa1: false }));
  const arriba = lineaTendencia(leerRendimiento([...antes, ...rep(12, g({ capa1: true }))]));
  assert.equal(arriba.texto, 'En ascenso: Capa 1 (+100 pts)');
  const abajo = lineaTendencia(leerRendimiento([...rep(12, g({ danna: true })), ...rep(12, g({ danna: false }))]));
  assert.equal(abajo.texto, 'En descenso: D.A.N.N.A. (−100 pts)');
});

test('sin ventana anterior (menos de 24 giros): avisa desde cuándo hay tendencia, sin inventarla', () => {
  const l = leerRendimiento(rep(18, g({ capa1: true, escudo: false })));
  assert.equal(l.conPrevia, false);
  assert.equal(l.total, 18);
  const t = lineaTendencia(l);
  assert.equal(t.estado, 'sin_previa');
  assert.equal(t.texto, 'Tendencia desde el giro 24 (van 18)');
  assert.deepEqual([t.ascenso, t.descenso], [[], []]);
});

test('cambio chico: "sin cambios marcados", pero el delta sí se calcula', () => {
  const l = leerRendimiento([...Array.from({ length: 12 }, (_, i) => g({ capa1: i < 7 })), ...Array.from({ length: 12 }, (_, i) => g({ capa1: i < 8 }))]);
  const t = lineaTendencia(l);
  assert.equal(t.estado, 'quieta');
  assert.match(t.texto, /Sin cambios marcados/);
  assert.equal(l.medidas.find((m) => m.fuente === 'capa1')!.delta, 8); // 7/12 → 8/12 = +8 pts
  assert.equal(fmtDelta(8), '+8 pts'); assert.equal(fmtDelta(-17), '−17 pts'); assert.equal(fmtDelta(0), '+0 pts');
});

test('una voz con muestra insuficiente en alguna ventana no entra en ascenso/descenso', () => {
  // Escudo habló 3 veces antes (no califica) y 12 ahora: sin ventana comparable
  const antes = Array.from({ length: 12 }, (_, i) => g({ escudo: i < 3 ? false : null, capa1: true }));
  const ahora = rep(12, g({ escudo: true, capa1: true }));
  const l = leerRendimiento([...antes, ...ahora]);
  assert.ok(!l.ascenso.includes('escudo') && !l.descenso.includes('escudo'));
  assert.equal(l.medidas.find((m) => m.fuente === 'escudo')!.delta, null);
});

test('es pura: no muta el registro y agregarEntrada lo acota', () => {
  const log = rep(20, ok('capa1'));
  const copia = JSON.stringify(log);
  leerRendimiento(log);
  assert.equal(JSON.stringify(log), copia);
  let r: EntradaRend[] = [];
  for (let i = 0; i < CAP_REGISTRO + 15; i++) r = agregarEntrada(r, g({ capa1: i % 2 === 0 }));
  assert.equal(r.length, CAP_REGISTRO);
  assert.ok(CAP_REGISTRO >= VENTANA * 2);
  const a: EntradaRend[] = []; const b = agregarEntrada(a, no('danna'));
  assert.equal(a.length, 0); assert.equal(b.length, 1);
});

test('store: cada giro resuelto agrega una entrada con lo que acertó el Motor; reset la vacía', () => {
  const s = useTelemetryStore;
  s.getState().reset();
  const ing = (n: number, spin: number) => s.getState().ingest({ n, hud: 50, ent: 50, spin, docPick: '1-12 / 13-24', colPick: 'Columna 1 / Columna 2' });
  ing(1, 17);                                    // primer giro: aún no hay nada que resolver
  assert.equal(s.getState().rendLog.length, 0);
  ing(2, 30);                                    // resuelve el pick del giro 1 contra el 30: docena 25-36 y columna 3 → falla los dos
  assert.deepEqual([s.getState().rendLog[0].motorDoc, s.getState().rendLog[0].motorCol], [false, false]);
  ing(3, 13);                                    // resuelve el pick del giro 2 contra el 13: docena 13-24 y columna 1 → acierta los dos
  assert.deepEqual([s.getState().rendLog[1].motorDoc, s.getState().rendLog[1].motorCol], [true, true]);
  ing(3, 13);                                    // mismo giro (re-render): no duplica
  assert.equal(s.getState().rendLog.length, 2);
  s.getState().reset();
  assert.deepEqual(s.getState().rendLog, []);
});
