import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicio } from '../../src/bitacora/servicio';

const resp = (status: number, cuerpo: unknown) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
const con = (f: (url: string, init?: RequestInit) => Promise<Response>) => crearServicio(f as any, 200);

test('guardar envía base_version, doc y credenciales; devuelve versión', async () => {
  let visto: any;
  const s = con(async (u, i) => { visto = { u, i }; return resp(200, { fecha: '2026-10-13', version: 4, actualizado: 'T' }); });
  const r = await s.guardar('2026-10-13', 3, { cfg: {} }, true);
  assert.deepEqual(r, { ok: true, data: { fecha: '2026-10-13', version: 4, actualizado: 'T' } });
  assert.equal(visto.u, '/api/bitacora/jornadas/2026-10-13'); assert.equal(visto.i.method, 'POST'); assert.equal(visto.i.credentials, 'include');
  assert.deepEqual(JSON.parse(visto.i.body), { base_version: 3, doc: { cfg: {} }, forzar: true });
});

test('cada código de error se traduce a su tipo', async () => {
  const casos: Array<[number, unknown, string]> = [[404, { detail: 'x' }, 'no_encontrada'], [401, { detail: 'x' }, 'sin_sesion'], [403, { detail: 'Cuenta no activa.' }, 'cuenta'], [422, { detail: 'Fecha inválida' }, 'validacion'], [500, undefined, 'servidor'], [502, { detail: 'raro' }, 'servidor']];
  for (const [st, body, tipo] of casos) {
    const r = await con(async () => resp(st, body)).leer('2026-10-13');
    assert.ok(!r.ok && r.tipo === tipo, `${st} → ${tipo}`);
  }
  const v = await con(async () => resp(422, { detail: 'Fecha inválida' })).leer('x'); assert.ok(!v.ok && v.mensaje === 'Fecha inválida');
});

test('409 devuelve lo que hay en el servidor', async () => {
  const r = await con(async () => resp(409, { detail: 'conflicto', actual: { fecha: 'f', version: 7, actualizado: 'T', doc: { a: 1 } } })).guardar('2026-10-13', 1, {});
  assert.ok(!r.ok && r.tipo === 'conflicto' && r.actual?.version === 7);
});

test('sin red, tiempo agotado o cuerpo no JSON: fallo claro, nunca una excepción', async () => {
  const sinRed = await con(async () => { throw new TypeError('Failed to fetch'); }).leer('2026-10-13');
  assert.ok(!sinRed.ok && sinRed.tipo === 'red');
  const lento = await con((_u, i) => new Promise((_res, rej) => { i?.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError'))); })).leer('2026-10-13');
  assert.ok(!lento.ok && lento.tipo === 'red');
  const vacio = await con(async () => new Response('<html>', { status: 200 })).leer('2026-10-13');
  assert.ok(!vacio.ok && vacio.tipo === 'servidor');
});

test('listar devuelve arreglo aun si el servidor responde raro', async () => {
  assert.deepEqual(await con(async () => resp(200, { jornadas: [{ fecha: 'a', version: 1, actualizado: 'T', doc: {} }] })).listar(), { ok: true, data: [{ fecha: 'a', version: 1, actualizado: 'T', doc: {} }] });
  assert.deepEqual(await con(async () => resp(200, { jornadas: 'no' })).listar(), { ok: true, data: [] });
});

test('la fecha se codifica en la URL', async () => {
  let u = ''; await con(async (x) => { u = x; return resp(404, {}); }).leer('../x?y');
  assert.equal(u, '/api/bitacora/jornadas/..%2Fx%3Fy');
});
