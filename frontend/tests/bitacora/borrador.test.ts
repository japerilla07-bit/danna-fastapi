import { test } from 'node:test';
import assert from 'node:assert/strict';
import { borrarBorradorDoc, guardarBorradorDoc, leerBorradorDoc, PREFIJO_BORRADOR_DOC } from '../../src/bitacora/borrador';
import { docInicial, normalizarDoc } from '../../src/bitacora/documento';
import { aplicarOps, borrarBorrador, borradorInicial, CLAVE_BORRADOR, guardarBorrador, leerBorrador, normalizarCfg } from '../../src/bitacora/borrador';
import type { Almacen, OpPlan } from '../../src/bitacora/borrador';
import { cfgPorDefecto, fmtHM } from '../../src/bitacora/planner';

/** Almacén en memoria, con fallos configurables. */
function memoria(opts: { falla?: 'set' | 'get' | 'olvida' | 'cuota' } = {}): Almacen & { d: Map<string, string> } {
  const d = new Map<string, string>();
  return {
    d,
    getItem: (k) => { if (opts.falla === 'get') throw new Error('bloqueado'); return d.has(k) ? d.get(k)! : null; },
    setItem: (k, v) => {
      if (opts.falla === 'set') throw new Error('bloqueado');
      if (opts.falla === 'cuota') { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }
      if (opts.falla !== 'olvida') d.set(k, v);
    },
    removeItem: (k) => { d.delete(k); },
  };
}
const TS = '2026-10-13T10:00:00.000Z';
const horas = (cfgFecha = '2026-10-13', ops: OpPlan[] = []) => aplicarOps(cfgPorDefecto(cfgFecha), ops).plan.sesiones.map((s) => `${s.estado[0]}${fmtHM(s.inicio)}`);

test('guardar y leer devuelve exactamente lo guardado', () => {
  const a = memoria(); const cfg = cfgPorDefecto('2026-10-13');
  const ops: OpPlan[] = [{ tipo: 'cancelar', n: 2, motivo: 'Cansancio', ts: TS }, { tipo: 'reprogramar', n: 3, hora: '14:00', ts: TS }];
  const r = guardarBorrador(a, cfg, ops, TS);
  assert.deepEqual(r, { ok: true, guardadoEn: TS });
  const l = leerBorrador(a);
  assert.equal(l.aviso, undefined);
  // La configuración se normaliza (límites vacíos = null, undefined = ausente): lo que importa es que el PLAN resultante sea idéntico.
  const sinCfg = (p: ReturnType<typeof aplicarOps>['plan']) => { const { cfg: _c, ...resto } = p; return resto; };
  assert.deepEqual(sinCfg(aplicarOps(l.borrador!.cfg, []).plan), sinCfg(aplicarOps(cfg, []).plan));
  assert.deepEqual(l.borrador?.ops, ops);
});

test('sin borrador previo: null y sin aviso; sin almacenamiento: aviso', () => {
  assert.deepEqual(leerBorrador(memoria()), { borrador: null });
  assert.match(leerBorrador(null).aviso ?? '', /no permite/);
});

test('nunca afirma guardado si el navegador falla (escritura, cuota, no conserva, sin almacén)', () => {
  const cfg = cfgPorDefecto('2026-10-13');
  for (const falla of ['set', 'cuota', 'olvida'] as const) assert.equal(guardarBorrador(memoria({ falla }), cfg, [], TS).ok, false, falla);
  const q = guardarBorrador(memoria({ falla: 'cuota' }), cfg, [], TS);
  assert.ok(!q.ok && /espacio/.test(q.error));
  assert.equal(guardarBorrador(null, cfg, [], TS).ok, false);
});

test('lectura defensiva: JSON dañado, versión ajena, forma incompleta, lectura que lanza', () => {
  const a = memoria();
  a.d.set(CLAVE_BORRADOR, '{no es json'); assert.match(leerBorrador(a).aviso ?? '', /dañado/);
  a.d.set(CLAVE_BORRADOR, JSON.stringify({ v: 99, cfg: {} })); assert.match(leerBorrador(a).aviso ?? '', /otra versión/);
  a.d.set(CLAVE_BORRADOR, JSON.stringify({ v: 1, cfg: 5 })); assert.match(leerBorrador(a).aviso ?? '', /incompleto/);
  a.d.set(CLAVE_BORRADOR, '[]'); assert.ok(leerBorrador(a).borrador === null);
  assert.match(leerBorrador(memoria({ falla: 'get' })).aviso ?? '', /No se pudo leer/);
  for (const x of ['{no es json', '[]']) { a.d.set(CLAVE_BORRADOR, x); assert.equal(leerBorrador(a).borrador, null); }
});

test('un borrador manipulado se sanea y no rompe el plan', () => {
  const a = memoria();
  a.d.set(CLAVE_BORRADOR, JSON.stringify({
    v: 1, guardadoEn: TS,
    cfg: { fecha: 7, inicioDisponible: '09:00', limiteFin: '17:00', numSesiones: 'x', duracionSesionMin: 90, descansoMinMin: 30, bloques: [null, 5, { tipo: 'raro', inicio: 3 }], modalidad: 'inventada', manuales: [1, { inicio: '10:00', duracionMin: 'a' }], limites: 'no', reglasSalida: ['a', 3, null] },
    ops: [null, { tipo: 'cancelar', n: 'x', ts: TS }, { tipo: 'cancelar', n: 1, ts: TS }, { tipo: 'reprogramar', n: 1, ts: TS }, { tipo: 'otra', n: 1, ts: TS }],
  }));
  const { borrador } = leerBorrador(a);
  assert.ok(borrador);
  assert.equal(borrador.cfg.modalidad, 'equilibrada'); assert.deepEqual(borrador.cfg.reglasSalida, ['a']);
  assert.deepEqual(borrador.cfg.limites, {}); assert.equal(borrador.cfg.bloques.length, 1); assert.equal(borrador.cfg.bloques[0].tipo, 'pausa');
  assert.deepEqual(borrador.ops, [{ tipo: 'cancelar', n: 1, motivo: '', ts: TS }]);
  assert.doesNotThrow(() => aplicarOps(borrador.cfg, borrador.ops)); // el planificador lo señala, no lanza
  assert.equal(aplicarOps(borrador.cfg, borrador.ops).plan.viable, false);
});

test('NaN sobrevive al viaje por JSON como dato inválido (no como 0)', () => {
  const a = memoria(); const cfg = { ...cfgPorDefecto('2026-10-13'), numSesiones: NaN };
  assert.ok(guardarBorrador(a, cfg, [], TS).ok);
  const l = leerBorrador(a).borrador!;
  assert.ok(Number.isNaN(l.cfg.numSesiones));
  assert.ok(aplicarOps(l.cfg, []).plan.hallazgos.some((h) => h.codigo === 'NUM_SESIONES_INVALIDO'));
});

test('aplicarOps: reaplica en orden, es determinista y no muta la configuración', () => {
  const cfg = cfgPorDefecto('2026-10-13'); const copia = JSON.stringify(cfg);
  const ops: OpPlan[] = [{ tipo: 'cancelar', n: 2, motivo: 'Imprevisto', ts: TS }, { tipo: 'reprogramar', n: 1, hora: '09:30', ts: TS }];
  const a = aplicarOps(cfg, ops), b = aplicarOps(cfg, ops);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(cfg), copia);
  assert.equal(a.plan.sesiones[1].estado, 'cancelada'); assert.equal(fmtHM(a.plan.sesiones[0].inicio), '09:30'); assert.equal(a.plan.sesiones[0].reprogramadaDesde, 9 * 60);
  assert.equal(a.plan.historial.length, 2); assert.equal(a.descartadas.length, 0);
});

test('aplicarOps: una operación que ya no es posible se descarta con motivo y no daña las demás', () => {
  const cfg = cfgPorDefecto('2026-10-13');
  const ops: OpPlan[] = [{ tipo: 'cancelar', n: 9, motivo: '', ts: TS }, { tipo: 'cancelar', n: 1, motivo: 'Otro', ts: TS }, { tipo: 'cancelar', n: 1, motivo: 'Otro', ts: TS }, { tipo: 'reprogramar', n: 2, hora: '03:00', ts: TS }];
  const r = aplicarOps(cfg, ops);
  assert.equal(r.descartadas.length, 3); assert.ok(r.descartadas.every((d) => d.motivo.length > 5));
  assert.equal(r.plan.sesiones[0].estado, 'cancelada'); assert.equal(r.plan.sesiones[1].estado, 'planificada');
  assert.equal(r.plan.historial.length, 1);
});

test('editar la configuración conserva las operaciones del usuario', () => {
  const ops: OpPlan[] = [{ tipo: 'cancelar', n: 2, motivo: 'Cansancio', ts: TS }];
  const antes = horas('2026-10-13', ops);
  assert.equal(antes[1][0], 'c');
  const cfg2 = { ...cfgPorDefecto('2026-10-13'), limiteFin: '18:00' };
  assert.equal(aplicarOps(cfg2, ops).plan.sesiones[1].estado, 'cancelada');
});

test('borrar y reiniciar', () => {
  const a = memoria(); guardarBorrador(a, cfgPorDefecto('2026-10-13'), [], TS);
  borrarBorrador(a); assert.equal(a.getItem(CLAVE_BORRADOR), null);
  assert.doesNotThrow(() => borrarBorrador(null));
  assert.doesNotThrow(() => borrarBorrador(memoria({ falla: 'get' })));
  const b = borradorInicial('2026-10-14'); assert.equal(b.cfg.fecha, '2026-10-14'); assert.deepEqual(b.ops, []);
});

test('normalizarCfg rechaza lo que no es objeto', () => {
  for (const x of [null, undefined, 3, 'x', []]) assert.equal(normalizarCfg(x), null);
});

test('borrador de la jornada completa: ida y vuelta por fecha, con su estado de sincronización', () => {
  const a = memoria(); const d = { ...docInicial('2026-10-13'), notasDia: 'x', registros: { '1': { n: 1, estado: 'cumplida' as const, horaInicioReal: '09:00', horaFinReal: '10:30', saldoInicial: 1, saldoFinal: 2, siguioMotor: 'si' as const, sensacion: 3, saliMesa: false, motivoSalida: '', detalleSalida: '', notas: 'n', actualizadoEn: TS } } };
  assert.deepEqual(guardarBorradorDoc(a, '2026-10-13', d, 4, false, TS), { ok: true });
  const l = leerBorradorDoc(a, '2026-10-13', normalizarDoc);
  assert.equal(l.aviso, undefined); assert.equal(l.borrador?.baseVersion, 4); assert.equal(l.borrador?.sincronizado, false); assert.equal(l.borrador?.doc.registros['1'].saldoFinal, 2); assert.equal(l.borrador?.doc.notasDia, 'x');
  assert.equal(leerBorradorDoc(a, '2026-10-14', normalizarDoc).borrador, null, 'otro día: otra clave');
  borrarBorradorDoc(a, '2026-10-13'); assert.equal(a.getItem(PREFIJO_BORRADOR_DOC + '2026-10-13'), null);
});

test('borrador de la jornada completa: dañado, ajeno o de otra fecha se ignora con aviso; nunca afirma guardado si falla', () => {
  const a = memoria(); const k = PREFIJO_BORRADOR_DOC + '2026-10-13';
  a.d.set(k, '{roto'); assert.match(leerBorradorDoc(a, '2026-10-13', normalizarDoc).aviso ?? '', /dañado/);
  a.d.set(k, JSON.stringify({ v: 99 })); assert.match(leerBorradorDoc(a, '2026-10-13', normalizarDoc).aviso ?? '', /otra versión/);
  a.d.set(k, JSON.stringify({ v: 2, fecha: '2026-10-20', doc: docInicial('2026-10-20') })); assert.match(leerBorradorDoc(a, '2026-10-13', normalizarDoc).aviso ?? '', /otra versión/);
  a.d.set(k, JSON.stringify({ v: 2, fecha: '2026-10-13', doc: 5 })); assert.match(leerBorradorDoc(a, '2026-10-13', normalizarDoc).aviso ?? '', /incompleto/);
  for (const falla of ['set', 'cuota', 'olvida'] as const) assert.equal(guardarBorradorDoc(memoria({ falla }), '2026-10-13', docInicial('2026-10-13'), 0, false, TS).ok, false, falla);
  assert.equal(guardarBorradorDoc(null, '2026-10-13', docInicial('2026-10-13'), 0, false, TS).ok, false);
  assert.match(leerBorradorDoc(null, '2026-10-13', normalizarDoc).aviso ?? '', /no permite/);
});

test('normalizarDoc acepta documentos antiguos sin cierres y rechaza lo que no es documento', () => {
  const viejo = normalizarDoc({ cfg: docInicial('2026-10-13').cfg, ops: [] });
  assert.deepEqual(viejo?.registros, {}); assert.equal(viejo?.notasDia, '');
  for (const x of [null, 3, 'x', [], {}, { cfg: 5 }]) assert.equal(normalizarDoc(x), null);
});
