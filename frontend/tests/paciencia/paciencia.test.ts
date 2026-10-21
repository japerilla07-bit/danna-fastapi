// Pruebas del MEDIDOR DE PACIENCIA DEL ESCUDO — domain/paciencia.ts. Ejecutar: node tests/run.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pacienciaVacia, pacienciaDecidir, pacienciaResolver, tasaPaciencia, pacienciaVeredicto, mismaPareja,
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
  assert.equal(g.est.S.miss, 0);
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
  assert.equal(tasaPaciencia(e, 'E').hits, 1); // este giro sí cuenta: juegan pareja distinta (S=B, E=A)
});

test('solo cuenta los giros en que juegan pareja DISTINTA; antes del primer error no hay nada que comparar', () => {
  let e = pacienciaVacia();
  for (let i = 0; i < 4; i++) e = giro(e, A, 5).est;   // 4 aciertos seguidos: juegan lo mismo
  assert.equal(tasaPaciencia(e, 'S').n, 0);
  assert.equal(tasaPaciencia(e, 'E').n, 0);
  e = giro(e, A, 30).est;                              // error de los dos, misma pareja: tampoco cuenta
  assert.equal(tasaPaciencia(e, 'S').n, 0);
  const g = giro(e, B, 30);                            // S adopta B (acierta); E sigue en A (falla): SÍ cuenta
  assert.deepEqual(g.jugadas, { S: B, E: A });
  assert.deepEqual([tasaPaciencia(g.est, 'S').hits, tasaPaciencia(g.est, 'S').n], [1, 1]);
  assert.deepEqual([tasaPaciencia(g.est, 'E').hits, tasaPaciencia(g.est, 'E').n], [0, 1]);
});

test('el orden del texto de la pareja no cuenta: "13-24 / 1-12" es la misma pareja que "1-12 / 13-24"', () => {
  assert.equal(mismaPareja('1-12 / 13-24', '13-24 / 1-12'), true);
  assert.equal(mismaPareja('1-12 / 13-24', '1-12 / 25-36'), false);
  assert.equal(mismaPareja(null, null), true);
});

test('la ventana guarda solo los últimos 5 giros comparables', () => {
  let e = pacienciaVacia();
  e = giro(e, A, 30).est;                      // error: queda S sin pareja, E sigue en A con 1 error
  // desde aquí S y E juegan parejas distintas varios giros seguidos
  for (let i = 0; i < 9; i++) e = giro(e, i % 2 ? B : C, 20).est;
  assert.equal(e.S.hist.length, PACIENCIA_VENTANA);
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
