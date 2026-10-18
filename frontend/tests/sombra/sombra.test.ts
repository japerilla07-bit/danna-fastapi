// Pruebas del MODO SOMBRA ("seguir al peor, 12 giros") — domain/sombra.ts. Ejecutar: node tests/run.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sombraHistVacia, sombraAvanzar, sombraElegir, picksSombra, aciertoConCero, tasaVoz, SOMBRA_VENTANA,
  type SombraHist, type SombraPicks,
} from '../../src/domain/sombra';

const P = (D: string | null, E: string | null, C: string | null): SombraPicks => ({ D, E, C });
const D1 = '1-12', D2 = '13-24';
// historial armado a mano: arreglo de 0/1/null por voz
const hist = (D: Array<0 | 1 | null>, E: Array<0 | 1 | null>, C: Array<0 | 1 | null>): SombraHist => ({ D, E, C });

test('cero cuenta como acierto; texto sin zonas no se evalúa', () => {
  assert.equal(aciertoConCero(D1, 0), 1);
  assert.equal(aciertoConCero(D1, 5), 1);
  assert.equal(aciertoConCero(D1, 20), 0);
  assert.equal(aciertoConCero('Columna 1 / Columna 3', 4), 1);   // 4 % 3 = 1
  assert.equal(aciertoConCero('Columna 1 / Columna 3', 5), 0);   // 5 % 3 = 2
  assert.equal(aciertoConCero('', 5), null);
  assert.equal(aciertoConCero(null, 5), null);
});

test('elige la voz con la tasa MÁS BAJA de la ventana', () => {
  const h = hist([1, 1, 1, 0], [1, 0, 0, 0], [1, 1, 0, 0]);   // D .75 · E .25 · C .5
  assert.equal(sombraElegir(h, P(D1, D2, D1)), 'E');
});

test('empate → el primero de D, E, C', () => {
  const h = hist([1, 0], [1, 0], [1, 0]);
  assert.equal(sombraElegir(h, P(D1, D2, D1)), 'D');
  assert.equal(sombraElegir(h, P(D1, null, D1)), 'D');
  const h2 = hist([1, 1], [1, 0], [1, 0]);
  assert.equal(sombraElegir(h2, P(D1, D2, D1)), 'E');           // E y C empatan, gana E
});

test('solo compite quien tiene jugada este giro', () => {
  const h = hist([1, 1, 1], [0, 0, 0], [0, 0, 0]);
  assert.equal(sombraElegir(h, P(D1, null, null)), 'D');         // E y C peores pero sin jugada
  assert.equal(sombraElegir(h, P(D1, D2, null)), 'E');
});

test('si D.A.N.N.A. espera, la sombra también (null)', () => {
  assert.equal(sombraElegir(hist([0], [0], [0]), P(null, D2, D1)), null);
});

test('sin historial → D.A.N.N.A.', () => {
  assert.equal(sombraElegir(sombraHistVacia(), P(D1, D2, D1)), 'D');
});

test('la tasa ignora los giros sin jugada (null) y la ventana es de 12', () => {
  assert.equal(tasaVoz(hist([null, null], [], []), 'D'), null);
  assert.equal(tasaVoz(hist([1, null, 0], [], []), 'D'), 0.5);
  let h = sombraHistVacia();
  for (let i = 0; i < 20; i++) h = sombraAvanzar(h, P(D1, D1, D1), i % 2 === 0 ? 5 : 20);   // acierta/falla alternando
  assert.equal(h.D.length, SOMBRA_VENTANA);
});

test('sombraAvanzar resuelve cada voz contra el número que salió', () => {
  const h = sombraAvanzar(sombraHistVacia(), P(D1, D2, null), 5);
  assert.deepEqual(h, { D: [1], E: [0], C: [null] });
});

test('picksSombra: mismas reglas que puntúan copScore / capa1Score / escudoScore', () => {
  // Capa 1 normal (mercado doc, sin overrides ni escudo)
  assert.deepEqual(
    picksSombra({ copSug: 'doc', copPickDocOverride: null, copPickColOverride: null, capa1Sug: 'doc', escudoPickDoc: null, escudoPickCol: null }, D1, 'Columna 2'),
    { D: D1, E: null, C: D1 });
  // COBERTURA con override en columnas: D y E juegan las columnas, Capa 1 sola juega docenas
  assert.deepEqual(
    picksSombra({ copSug: null, copPickDocOverride: null, copPickColOverride: 'Columna 1 / Columna 2', capa1Sug: 'doc', escudoPickDoc: null, escudoPickCol: 'Columna 1 / Columna 2' }, D1, 'Columna 3'),
    { D: 'Columna 1 / Columna 2', E: 'Columna 1 / Columna 2', C: D1 });
  // Todo en espera
  assert.deepEqual(
    picksSombra({ copSug: null, copPickDocOverride: null, copPickColOverride: null, capa1Sug: null, escudoPickDoc: null, escudoPickCol: null }, D1, 'Columna 3'),
    { D: null, E: null, C: null });
});
