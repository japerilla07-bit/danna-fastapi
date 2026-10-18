// Pruebas del DETECTOR DE RÉGIMEN (modo sombra) — domain/regimen.ts. Ejecutar: node tests/run.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonaDe, regimenAvanzar, clasificarRegimen, REGIMEN_KALT } from '../../src/domain/regimen';

const rep = (z: number, k: number) => new Array(k).fill(z);

test('zonaDe: docenas, columnas y cero', () => {
  assert.equal(zonaDe(1, 'doc'), 1); assert.equal(zonaDe(12, 'doc'), 1);
  assert.equal(zonaDe(13, 'doc'), 2); assert.equal(zonaDe(36, 'doc'), 3);
  assert.equal(zonaDe(1, 'col'), 1); assert.equal(zonaDe(2, 'col'), 2); assert.equal(zonaDe(3, 'col'), 3);
  assert.equal(zonaDe(36, 'col'), 3); assert.equal(zonaDe(34, 'col'), 1);
  assert.equal(zonaDe(0, 'doc'), null); assert.equal(zonaDe(0, 'col'), null);
  assert.equal(zonaDe(NaN, 'doc'), null);
});

test('regimenAvanzar: el cero no entra; la ventana se corta en 24', () => {
  let z: number[] = [];
  z = regimenAvanzar(z, 2); z = regimenAvanzar(z, null);
  assert.deepEqual(z, [2]);
  for (let i = 0; i < 40; i++) z = regimenAvanzar(z, (i % 3) + 1);
  assert.equal(z.length, 24);
});

test('Indeterminado con menos de 24 giros sin cero', () => {
  const d = clasificarRegimen(rep(1, 23));
  assert.equal(d.estado, 'Indeterminado'); assert.equal(d.lider, null); assert.equal(d.n, 23);
});

test('Equilibrada: reparto parejo sin alternancia extrema', () => {
  const z = [...rep(1, 4), ...rep(2, 4), ...rep(3, 4), ...rep(1, 4), ...rep(2, 4), ...rep(3, 4)];
  const d = clasificarRegimen(z);
  assert.equal(d.estado, 'Equilibrada');
});

test('Concentración: ventana reciente muy cargada a una zona y la anterior igual', () => {
  const z = [...rep(1, 10), 2, 3, ...rep(1, 10), 2, 3];   // 10/12 en la zona 1 en ambas ventanas
  const d = clasificarRegimen(z);
  assert.equal(d.estado, 'Concentración'); assert.equal(d.lider, 1);
});

test('Cambio brusco: la ventana anterior era de otra zona', () => {
  const z = [...rep(1, 12), ...rep(3, 12)];
  const d = clasificarRegimen(z);
  assert.equal(d.estado, 'Cambio brusco'); assert.equal(d.lider, 3);
});

test('Alternancia: 14+ cambios en las últimas 16 y reparto parejo', () => {
  // las dos ventanas con 4/4/4 y cambio en casi cada giro
  const z = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3];
  const d = clasificarRegimen(z);
  assert.equal(d.cambios, 15); assert.ok(d.cambios! >= REGIMEN_KALT);
  assert.equal(d.estado, 'Alternancia');
});

test('cambios solo se informa con 16 giros o más', () => {
  assert.equal(clasificarRegimen(rep(1, 10)).cambios, null);
  assert.equal(clasificarRegimen([...rep(1, 15), 2]).cambios, 1);
});

test('empate de líder → zona de menor número', () => {
  const z = [...rep(1, 12), ...rep(1, 6), ...rep(2, 6)];
  assert.equal(clasificarRegimen(z).lider, 1);
});
