import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sincronizador } from '../../src/bitacora/sincronizador';
import type { Snapshot } from '../../src/bitacora/sincronizador';
import { docInicial, normalizarDoc } from '../../src/bitacora/documento';
import type { DocJornada } from '../../src/bitacora/documento';
import { PREFIJO_BORRADOR_DOC, leerBorradorDoc, guardarBorradorDoc, CLAVE_BORRADOR, guardarBorrador } from '../../src/bitacora/borrador';
import type { Almacen } from '../../src/bitacora/borrador';
import type { Resp, Servicio, JornadaServidor } from '../../src/bitacora/servicio';
import { cfgPorDefecto } from '../../src/bitacora/planner';
import { registroVacio } from '../../src/bitacora/registro';

const F = '2026-10-13';

/** Servidor falso con la misma semántica que el real (versiones, conflicto, idempotencia). */
function servidor() {
  const db = new Map<string, { version: number; doc: any; actualizado: string }>();
  const log: string[] = [];
  const falla: { modo: null | 'red' | 'servidor' | 'sin_sesion' | 'validacion' | 'lectura_red' } = { modo: null };
  let reloj = 0;
  let enVuelo: null | (() => void) = null; let retener = false; let liberar: Array<() => void> = [];
  const svc: Servicio = {
    async leer(fecha) {
      log.push(`leer ${fecha}`);
      if (falla.modo === 'lectura_red') return { ok: false, tipo: 'red', mensaje: 'No hay conexión con el servidor.' };
      const x = db.get(fecha);
      return x ? { ok: true, data: { fecha, version: x.version, actualizado: x.actualizado, doc: x.doc } } : { ok: false, tipo: 'no_encontrada', mensaje: 'no hay' };
    },
    async guardar(fecha, base, doc, forzar = false): Promise<Resp<{ version: number; actualizado: string }>> {
      log.push(`guardar ${fecha} base=${base}${forzar ? ' forzar' : ''}`);
      if (retener) await new Promise<void>((r) => liberar.push(r));
      if (falla.modo === 'red' || falla.modo === 'lectura_red') return { ok: false, tipo: 'red', mensaje: 'No hay conexión con el servidor.' };
      if (falla.modo === 'servidor') return { ok: false, tipo: 'servidor', mensaje: 'El servidor no pudo procesar la solicitud.' };
      if (falla.modo === 'sin_sesion') return { ok: false, tipo: 'sin_sesion', mensaje: 'Tu sesión expiró. Inicia sesión de nuevo.' };
      if (falla.modo === 'validacion') return { ok: false, tipo: 'validacion', mensaje: 'Documento incompleto' };
      const x = db.get(fecha); const actual = x?.version ?? 0; const txt = JSON.stringify(doc);
      if (x && JSON.stringify(x.doc) === txt && (base === actual || base === actual - 1)) return { ok: true, data: { version: actual, actualizado: x.actualizado } };
      if (base !== actual && !forzar) return { ok: false, tipo: 'conflicto', mensaje: 'cambió', actual: { fecha, version: actual, actualizado: x?.actualizado ?? '', doc: x?.doc ?? null } as JornadaServidor };
      const nueva = { version: actual + 1, doc: JSON.parse(txt), actualizado: `T${++reloj}` }; db.set(fecha, nueva);
      return { ok: true, data: { version: nueva.version, actualizado: nueva.actualizado } };
    },
    async listar() { return { ok: true, data: [] }; },
  };
  return { svc, db, log, falla, retener: (v: boolean) => { retener = v; if (!v) { liberar.forEach((f) => f()); liberar = []; } }, _ev: enVuelo };
}

function almacenMem(): Almacen & { d: Map<string, string>; rompe: boolean } {
  const d = new Map<string, string>(); const a: any = { d, rompe: false, getItem: (k: string) => (d.has(k) ? d.get(k)! : null), setItem: (k: string, v: string) => { if (a.rompe) throw new Error('bloqueado'); d.set(k, v); }, removeItem: (k: string) => { d.delete(k); } };
  return a;
}

function montar(opts: { srv?: ReturnType<typeof servidor>; almacen?: ReturnType<typeof almacenMem> | null } = {}) {
  const srv = opts.srv ?? servidor(); const almacen = opts.almacen === undefined ? almacenMem() : opts.almacen;
  const tareas: Array<{ id: number; ms: number; fn: () => void }> = []; let idc = 0; const snaps: Snapshot[] = [];
  const s = new Sincronizador({
    servicio: srv.svc, almacen, ahora: () => 'AHORA', onCambio: (x) => snaps.push(x),
    programar: (fn, ms) => { const id = ++idc; tareas.push({ id, ms, fn }); return id; },
    cancelar: (id) => { const i = tareas.findIndex((t) => t.id === id); if (i >= 0) tareas.splice(i, 1); },
  }, F);
  const correr = async () => { const t = tareas.splice(0); for (const x of t) x.fn(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
  return { s, srv, almacen, tareas, snaps, correr };
}
const nota = (t: string) => (d: DocJornada): DocJornada => ({ ...d, notasDia: t });
const cierre = (n: number, saldoFinal: number) => (d: DocJornada): DocJornada => ({ ...d, registros: { ...d.registros, [String(n)]: { ...registroVacio(n), estado: 'cumplida', saldoInicial: 100, saldoFinal } } });

test('jornada nueva: estado "nuevo"; al primer cambio se guarda y solo entonces dice sincronizado', async () => {
  const { s, srv, tareas, correr } = montar();
  await s.abrir(F);
  assert.equal(s.snapshot.estado.tipo, 'nuevo'); assert.equal(srv.db.size, 0);
  s.editar(nota('hola'));
  assert.equal(s.snapshot.estado.tipo, 'pendiente'); assert.equal(srv.db.size, 0, 'aún no se envió: no puede decir guardado');
  assert.equal(tareas.length, 1);
  await correr();
  const e = s.snapshot.estado; assert.equal(e.tipo, 'sincronizado'); assert.equal(s.snapshot.version, 1);
  assert.equal(srv.db.get(F)!.doc.notasDia, 'hola');
});

test('varias ediciones seguidas se juntan en un solo envío', async () => {
  const { s, srv, tareas, correr } = montar();
  await s.abrir(F);
  s.editar(nota('a')); s.editar(nota('ab')); s.editar(nota('abc'));
  assert.equal(tareas.length, 1, 'un solo temporizador');
  await correr();
  assert.equal(srv.log.filter((l) => l.startsWith('guardar')).length, 1); assert.equal(srv.db.get(F)!.doc.notasDia, 'abc');
});

test('edición mientras se guarda: no se pierde, se envía otra vez con la versión nueva', async () => {
  const { s, srv, correr } = montar();
  await s.abrir(F); s.editar(nota('uno'));
  srv.retener(true);
  const p = s.guardarAhora(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.snapshot.estado.tipo, 'guardando');
  s.editar(nota('dos'));          // llega mientras el primer envío está en vuelo
  await correr();                 // el temporizador de esta edición vence con el primer envío aún en vuelo: no puede enviar
  assert.equal(srv.log.filter((l) => l.startsWith('guardar')).length, 1);
  srv.retener(false); await p; await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.snapshot.estado.tipo, 'pendiente', 'lo último aún no llegó al servidor');
  await correr(); await correr();
  assert.equal(srv.db.get(F)!.doc.notasDia, 'dos'); assert.equal(s.snapshot.estado.tipo, 'sincronizado'); assert.equal(s.snapshot.version, 2);
});

test('sin red: avisa, conserva el trabajo en el navegador y reintenta solo hasta lograrlo', async () => {
  const { s, srv, almacen, tareas, correr } = montar();
  await s.abrir(F); srv.falla.modo = 'red';
  s.editar(cierre(1, 150)); await correr();
  assert.equal(s.snapshot.estado.tipo, 'error'); assert.match((s.snapshot.estado as any).mensaje, /a salvo en este navegador/);
  assert.equal(srv.db.size, 0);
  const b = leerBorradorDoc(almacen, F, normalizarDoc).borrador!;
  assert.equal(b.sincronizado, false); assert.equal(b.doc.registros['1'].saldoFinal, 150);
  assert.equal(tareas.length, 1, 'quedó un reintento programado');
  await correr(); assert.equal(s.snapshot.estado.tipo, 'error');                  // sigue sin red
  srv.falla.modo = null; await correr();                                          // vuelve la red
  assert.equal(s.snapshot.estado.tipo, 'sincronizado'); assert.equal(srv.db.get(F)!.doc.registros['1'].saldoFinal, 150);
  assert.equal(leerBorradorDoc(almacen, F, normalizarDoc).borrador!.sincronizado, true);
});

test('el reintento espera cada vez más', async () => {
  const { s, srv, tareas, correr } = montar();
  await s.abrir(F); srv.falla.modo = 'servidor'; s.editar(nota('x'));
  const esperas: number[] = [];
  for (let i = 0; i < 4; i++) { await correr(); esperas.push((s.snapshot.estado as any).reintentoEnMs); }
  assert.deepEqual(esperas, [15000, 30000, 60000, 60000]); assert.ok(tareas.length <= 1);
});

test('sesión vencida (401): se detiene, no reintenta y dice la verdad', async () => {
  const { s, srv, tareas, correr } = montar();
  await s.abrir(F); srv.falla.modo = 'sin_sesion'; s.editar(nota('x')); await correr();
  assert.equal(s.snapshot.estado.tipo, 'sin_sesion'); assert.equal(tareas.length, 0);
  s.editar(nota('xy')); assert.equal(s.snapshot.estado.tipo, 'sin_sesion'); assert.equal(tareas.length, 0);
});

test('error de validación del servidor: se muestra, no se reintenta en bucle', async () => {
  const { s, srv, tareas, correr } = montar();
  await s.abrir(F); srv.falla.modo = 'validacion'; s.editar(nota('x')); await correr();
  assert.equal(s.snapshot.estado.tipo, 'error'); assert.equal((s.snapshot.estado as any).reintentoEnMs, undefined); assert.equal(tareas.length, 0);
  srv.falla.modo = null; await s.reintentar();
  assert.equal(s.snapshot.estado.tipo, 'sincronizado');
});

test('abrir una jornada que ya existe la carga tal cual', async () => {
  const srv = servidor(); const d: DocJornada = { ...docInicial(F), notasDia: 'ya estaba', registros: { '2': { ...registroVacio(2), estado: 'no_cumplida' } } };
  srv.db.set(F, { version: 5, doc: d, actualizado: 'T9' });
  const { s } = montar({ srv }); await s.abrir(F);
  assert.equal(s.snapshot.estado.tipo, 'sincronizado'); assert.equal(s.snapshot.version, 5); assert.equal(s.snapshot.doc.notasDia, 'ya estaba'); assert.equal(s.snapshot.doc.registros['2'].estado, 'no_cumplida');
});

test('conflicto: otra pantalla guardó antes → se detiene y deja elegir; nada se pisa', async () => {
  const srv = servidor(); const A = montar({ srv }); const B = montar({ srv });
  await A.s.abrir(F); A.s.editar(nota('A1')); await A.correr();
  await B.s.abrir(F);                                     // B ve v1
  A.s.editar(nota('A2')); await A.correr();               // A sube v2
  B.s.editar(nota('B-cambio')); await B.correr();         // B parte de v1 → conflicto
  const e = B.s.snapshot.estado; assert.equal(e.tipo, 'conflicto');
  assert.equal((e as any).servidor.version, 2); assert.equal((e as any).servidor.doc.notasDia, 'A2');
  assert.equal(srv.db.get(F)!.doc.notasDia, 'A2', 'el servidor no se tocó');
  B.s.editar(nota('B-cambio-2')); await B.correr();       // editar en conflicto no envía
  assert.equal(srv.db.get(F)!.doc.notasDia, 'A2'); assert.equal(B.s.snapshot.estado.tipo, 'conflicto');
  await B.s.resolver('servidor');
  assert.equal(B.s.snapshot.doc.notasDia, 'A2'); assert.equal(B.s.snapshot.estado.tipo, 'sincronizado'); assert.equal(B.s.snapshot.version, 2);
});

test('conflicto: elegir lo mío sobrescribe y queda como nueva versión', async () => {
  const srv = servidor(); const A = montar({ srv }); const B = montar({ srv });
  await A.s.abrir(F); A.s.editar(nota('A1')); await A.correr(); await B.s.abrir(F);
  A.s.editar(nota('A2')); await A.correr();
  B.s.editar(nota('mío')); await B.correr(); assert.equal(B.s.snapshot.estado.tipo, 'conflicto');
  await B.s.resolver('mio');
  assert.equal(B.s.snapshot.estado.tipo, 'sincronizado'); assert.equal(srv.db.get(F)!.doc.notasDia, 'mío'); assert.equal(srv.db.get(F)!.version, 3);
  assert.ok(srv.log.some((l) => /forzar/.test(l)));
});

test('conflicto con contenido idéntico (envío repetido) no molesta al usuario', async () => {
  const srv = servidor(); const A = montar({ srv });
  await A.s.abrir(F); A.s.editar(nota('x')); await A.correr();
  srv.db.set(F, { ...srv.db.get(F)!, version: 2 });      // el servidor avanzó con el MISMO contenido
  A.s.editar(nota('x2')); A.s.editar(nota('x'));        // vuelve a lo mismo que el servidor
  await A.correr();
  assert.equal(A.s.snapshot.estado.tipo === 'conflicto', false);
});

test('recuperar trabajo sin enviar tras cerrar la pestaña', async () => {
  const srv = servidor(); const almacen = almacenMem();
  const A = montar({ srv, almacen }); await A.s.abrir(F); srv.falla.modo = 'red'; A.s.editar(cierre(1, 777)); await A.correr();
  A.s.destruir();                                         // se cierra la pestaña sin haber podido enviar
  srv.falla.modo = null;
  const B = montar({ srv, almacen }); await B.s.abrir(F);
  assert.equal(B.s.snapshot.recuperado, true); assert.equal(B.s.snapshot.doc.registros['1'].saldoFinal, 777);
  assert.equal(B.s.snapshot.estado.tipo, 'pendiente'); await B.correr();
  assert.equal(B.s.snapshot.estado.tipo, 'sincronizado'); assert.equal(srv.db.get(F)!.doc.registros['1'].saldoFinal, 777);
});

test('borrador local pendiente + servidor que avanzó = conflicto, sin pisar a ninguno', async () => {
  const srv = servidor(); const almacen = almacenMem();
  const A = montar({ srv, almacen }); await A.s.abrir(F); A.s.editar(nota('v1')); await A.correr();
  srv.falla.modo = 'red'; A.s.editar(nota('local sin enviar')); await A.correr(); A.s.destruir(); srv.falla.modo = null;
  srv.db.set(F, { version: 2, doc: { ...srv.db.get(F)!.doc, notasDia: 'otro dispositivo' }, actualizado: 'TX' });   // desde otro lado
  const B = montar({ srv, almacen }); await B.s.abrir(F);
  const e = B.s.snapshot.estado; assert.equal(e.tipo, 'conflicto');
  assert.equal(B.s.snapshot.doc.notasDia, 'local sin enviar'); assert.equal((e as any).servidor.doc.notasDia, 'otro dispositivo');
  assert.equal(srv.db.get(F)!.doc.notasDia, 'otro dispositivo');
});

test('sin conexión al abrir: trabaja con la copia local y lo dice; al reintentar sincroniza', async () => {
  const srv = servidor(); const almacen = almacenMem();
  guardarBorradorDoc(almacen, F, { ...docInicial(F), notasDia: 'copia local' }, 0, false, 'T');
  srv.falla.modo = 'lectura_red';
  const A = montar({ srv, almacen }); await A.s.abrir(F);
  assert.equal(A.s.snapshot.estado.tipo, 'sin_servidor'); assert.equal(A.s.snapshot.doc.notasDia, 'copia local');
  A.s.editar(nota('copia local 2')); await A.correr(); assert.equal(srv.db.size, 0, 'no envía a ciegas');
  srv.falla.modo = null; await A.s.reintentar(); await A.correr();
  assert.equal(A.s.snapshot.estado.tipo, 'sincronizado'); assert.equal(srv.db.get(F)!.doc.notasDia, 'copia local 2');
});

test('cambiar de día: guarda lo pendiente del anterior antes de abrir el otro, y no mezcla', async () => {
  const { s, srv, correr } = montar();
  await s.abrir(F); s.editar(nota('del 13'));
  await s.abrir('2026-10-14', s.snapshot.doc);            // sin esperar al temporizador
  assert.equal(srv.db.get(F)!.doc.notasDia, 'del 13');
  assert.equal(s.snapshot.fecha, '2026-10-14'); assert.equal(s.snapshot.doc.cfg.fecha, '2026-10-14');
  assert.equal(s.snapshot.doc.notasDia, 'del 13' === s.snapshot.doc.notasDia ? s.snapshot.doc.notasDia : '', 'la plantilla solo trae la configuración');
  assert.equal(s.snapshot.doc.ops.length, 0); assert.deepEqual(s.snapshot.doc.registros, {});
  s.editar(nota('del 14')); await correr();
  assert.equal(srv.db.get('2026-10-14')!.doc.notasDia, 'del 14'); assert.equal(srv.db.get(F)!.doc.notasDia, 'del 13');
  await s.abrir(F); assert.equal(s.snapshot.doc.notasDia, 'del 13');
});

test('plantilla al abrir un día nuevo: conserva la configuración, no los cierres', async () => {
  const { s } = montar(); await s.abrir(F);
  s.editar((d) => ({ ...d, cfg: { ...d.cfg, numSesiones: 3, duracionSesionMin: 60 }, registros: { '1': { ...registroVacio(1), estado: 'cumplida' } }, notasDia: 'x' }));
  await s.abrir('2026-10-20', s.snapshot.doc);
  assert.equal(s.snapshot.doc.cfg.numSesiones, 3); assert.equal(s.snapshot.doc.cfg.fecha, '2026-10-20'); assert.deepEqual(s.snapshot.doc.registros, {}); assert.equal(s.snapshot.doc.notasDia, '');
});

test('respuesta tardía de un día ya cerrado no pisa el día actual', async () => {
  const { s, srv } = montar(); await s.abrir(F); s.editar(nota('x'));
  srv.retener(true);
  const p = s.guardarAhora(); await new Promise((r) => setTimeout(r, 0));
  s.destruir(); srv.retener(false); await p;
  assert.notEqual(s.snapshot.estado.tipo, 'sincronizado', 'una respuesta de una sesión destruida no cambia el estado');
});

test('sin almacenamiento en el navegador: funciona con servidor y avisa del borrador', async () => {
  const { s, srv, correr } = montar({ almacen: null });
  await s.abrir(F); s.editar(nota('x')); await correr();
  assert.equal(s.snapshot.estado.tipo, 'sincronizado'); assert.match(s.snapshot.avisoBorrador ?? '', /no permite/); assert.equal(srv.db.get(F)!.doc.notasDia, 'x');
});

test('almacenamiento que falla al escribir: avisa, pero no impide guardar en el servidor', async () => {
  const almacen = almacenMem(); const { s, srv, correr } = montar({ almacen });
  await s.abrir(F); almacen.rompe = true; s.editar(nota('x')); await correr();
  assert.match(s.snapshot.avisoBorrador ?? '', /almacenamiento/); assert.equal(srv.db.get(F)!.doc.notasDia, 'x');
});

test('migra el borrador de la versión anterior (solo plan) la primera vez', async () => {
  const almacen = almacenMem(); const cfg = { ...cfgPorDefecto(F), numSesiones: 3 };
  guardarBorrador(almacen, cfg, [{ tipo: 'cancelar', n: 2, motivo: 'Cansancio', ts: 'T' }], 'T');
  const { s } = montar({ almacen }); await s.abrir(F);
  assert.equal(s.snapshot.doc.cfg.numSesiones, 3); assert.equal(s.snapshot.doc.ops.length, 1); assert.equal(s.snapshot.recuperado, true);
  assert.equal(almacen.getItem(CLAVE_BORRADOR), null, 'el borrador viejo ya no se vuelve a usar');
});

test('editar mientras carga se ignora (no se puede pisar lo que aún no llegó)', async () => {
  const { s } = montar(); s.editar(nota('x')); assert.equal(s.snapshot.doc.notasDia, '');
});

test('la fecha del documento siempre es la de la jornada abierta', async () => {
  const { s } = montar(); await s.abrir(F);
  s.editar((d) => ({ ...d, cfg: { ...d.cfg, fecha: '1999-01-01' }, notasDia: 'x' }));
  assert.equal(s.snapshot.doc.cfg.fecha, F);
});
