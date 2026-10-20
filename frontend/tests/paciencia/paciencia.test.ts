// Pruebas del MEDIDOR DE PACIENCIA DEL ESCUDO — domain/paciencia.ts. Ejecutar: node tests/run.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pacienciaVacia, pacienciaDecidir, pacienciaResolver, tasaPaciencia, pacienciaVeredicto,
  PACIENCIA_VENTANA, type PacienciaEstado,
} from '../../src/domain/paciencia';

const A = '1-12 / 13-24', B = '13-24 / 25-36', C = '1-12 / 25-36';

/** Un giro: el Escudo muestra `pick` y sale `spin`. Devuelve el estado nuevo. */
function giro(est: PacienciaEstado, pick: string | null, spin: number) {
  const d = pacienciaDecidir(est, pick);
  return { est: pacienciaResolver(d.est, d.jugadas, spin), jugadas: d.jugadas };
}

test('el primer giro adopta la pareja del Escudo; sin jugada del Escudo nadie juega ni cambia', () => {
  const d = pacienciaDecidir(pacienciaVacia(), A);
  assert.deepEqual(d.jugadas, { S: A, E: A });
  const w = pacienciaDecidir(pacienciaVacia(), null);
  assert.deepEqual(w.jugadas, { S: null, E: null });
  const r = pacienciaResolver(w.est, w.jugadas, 30);
  assert.deepEqual(r, pacienciaVacia());
});

test('mientras acierta se queda con su pareja aunque el Escudo cambie', () => {
  let e = pacienciaVacia();
  e = giro(e, A, 5).est;                       // acierta (5 está en 1-12)
  const g = giro(e, B, 6);                     // el Escudo ya muestra B; S y E siguen en A y vuelven a acertar
  assert.deepEqual(g.jugadas, { S: A, E: A });
  assert.equal(tasaPaciencia(g.est, 'S').hits, 2);
});

test('S cambia tras 1 error; E tras 2', () => {
  let e = pacienciaVacia();
  e = giro(e, A, 30).est;                      // ambos fallan (30 no está en A)
  let g = giro(e, B, 30);                      // S adopta B (acierta); E sigue en A (falla otra vez)
  assert.deepEqual(g.jugadas, { S: B, E: A });
  e = g.est;
  g = giro(e, C, 20);                          // E ya cambió → adopta C; S sigue en B
  assert.deepEqual(g.jugadas, { S: B, E: C });
});

test('cero cuenta como acierto y corta la racha de errores', () => {
  let e = pacienciaVacia();
  e = giro(e, A, 30).est;                      // error 1
  e = giro(e, B, 0).est;                       // cero: acierto para ambos (S ya adoptó B; E sigue en A)
  assert.equal(e.E.miss, 0);
  assert.equal(tasaPaciencia(e, 'E').hits, 1);
});

test('la ventana guarda solo los últimos 5 resultados', () => {
  let e = pacienciaVacia();
  for (let i = 0; i < 9; i++) e = giro(e, A, 5).est;
  assert.equal(e.S.hist.length, PACIENCIA_VENTANA);
  assert.equal(tasaPaciencia(e, 'S').pct, 100);
});

test('veredicto: sin datos, parejo y quién va mejor', () => {
  assert.equal(pacienciaVeredicto(pacienciaVacia()), 'sin datos');
  const mk = (s: number, ee: number): PacienciaEstado => ({
    S: { held: A, miss: 0, hist: [...Array(s).fill(1), ...Array(5 - s).fill(0)] },
    E: { held: A, miss: 0, hist: [...Array(ee).fill(1), ...Array(5 - ee).fill(0)] },
  });
  assert.equal(pacienciaVeredicto(mk(3, 3)), 'parejo');
  assert.equal(pacienciaVeredicto(mk(4, 3)), 'parejo');
  assert.equal(pacienciaVeredicto(mk(4, 2)), 'S');
  assert.equal(pacienciaVeredicto(mk(1, 3)), 'E');
});
