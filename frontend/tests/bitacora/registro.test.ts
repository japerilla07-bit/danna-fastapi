import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNAS_CSV, cierresHuerfanos, csvCampo, csvJornadas, duracionRealMin, filasJornada, normalizarRegistro, normalizarRegistros, registroVacio, resultadoSesion, resumenJornada, validarRegistro } from '../../src/bitacora/registro';
import { cancelarSesion, cfgPorDefecto, construirPlan } from '../../src/bitacora/planner';
import type { RegistroSesion } from '../../src/bitacora/types';

const reg = (n: number, o: Partial<RegistroSesion> = {}): RegistroSesion => ({ ...registroVacio(n), ...o });
const plan = () => construirPlan(cfgPorDefecto('2026-10-13'));
const completo = (n: number, o: Partial<RegistroSesion> = {}) => reg(n, { estado: 'cumplida', horaInicioReal: '09:00', horaFinReal: '10:30', saldoInicial: 100000, saldoFinal: 112000, siguioMotor: 'si', sensacion: 4, saliMesa: false, ...o });

test('duración real y resultado', () => {
  assert.equal(duracionRealMin({ horaInicioReal: '09:00', horaFinReal: '10:30' }), 90);
  assert.equal(duracionRealMin({ horaInicioReal: '23:30', horaFinReal: '00:30' }), 60, 'cruza la medianoche');
  assert.equal(duracionRealMin({ horaInicioReal: '09:00', horaFinReal: '' }), null);
  assert.equal(duracionRealMin({ horaInicioReal: 'xx', horaFinReal: '10:00' }), null);
  assert.equal(resultadoSesion({ saldoInicial: 100000, saldoFinal: 87500 }), -12500);
  assert.equal(resultadoSesion({ saldoInicial: 0, saldoFinal: 0 }), 0, 'cero es un dato, no ausencia');
  assert.equal(resultadoSesion({ saldoInicial: 100, saldoFinal: null }), null);
});

test('lectura defensiva: basura se convierte en cierre vacío válido', () => {
  for (const x of [null, undefined, 5, 'x', [], {}]) assert.deepEqual(normalizarRegistro(x, 3), registroVacio(3));
  const r = normalizarRegistro({ estado: 'hackeado', siguioMotor: 9, sensacion: 7, saldoInicial: '5', saldoFinal: NaN, saliMesa: 'si', notas: 5, horaInicioReal: 'abcdefgh' }, 2);
  assert.equal(r.estado, 'pendiente'); assert.equal(r.siguioMotor, ''); assert.equal(r.sensacion, 0); assert.equal(r.saldoInicial, null);
  assert.equal(r.saldoFinal, null); assert.equal(r.saliMesa, null); assert.equal(r.notas, ''); assert.equal(r.horaInicioReal, 'abcde');
  const ok = normalizarRegistro(completo(1), 1); assert.deepEqual(ok, completo(1));
  const m = normalizarRegistros({ '1': completo(1), '0': {}, 'x': {}, '2.5': {}, '100': {}, '3': { estado: 'no_cumplida' } });
  assert.deepEqual(Object.keys(m).sort(), ['1', '3']); assert.equal(m['3'].n, 3);
  assert.deepEqual(normalizarRegistros(null), {}); assert.deepEqual(normalizarRegistros([1]), {});
});

test('validación: avisa pero nunca bloquea; los errores son solo datos imposibles', () => {
  const cod = (r: RegistroSesion, s?: { duracionMin: number }) => validarRegistro(r, s).map((h) => h.codigo);
  assert.deepEqual(cod(completo(1)), []);
  assert.deepEqual(cod(registroVacio(1)), [], 'pendiente no genera avisos');
  assert.ok(cod(reg(1, { estado: 'cumplida' })).includes('CIERRE_INCOMPLETO'));
  assert.ok(cod(completo(1, { saldoFinal: -5 })).includes('SALDO_FINAL_NEGATIVO'));
  assert.ok(cod(completo(1, { saldoInicial: -5 })).includes('SALDO_INICIAL_NEGATIVO'));
  assert.ok(cod(completo(1, { horaFinReal: '25:00' })).includes('HORA_FIN_INVALIDA'));
  assert.ok(cod(completo(1, { horaInicioReal: '9h' })).includes('HORA_INICIO_INVALIDA'));
  assert.ok(cod(completo(1, { saliMesa: true })).includes('SALIDA_SIN_MOTIVO'));
  assert.ok(!cod(completo(1, { saliMesa: true, motivoSalida: 'Cansancio o tilt' })).includes('SALIDA_SIN_MOTIVO'));
  assert.ok(cod(completo(1, { horaFinReal: '09:00' })).includes('DURACION_CERO'));
  assert.ok(cod(completo(1, { horaInicioReal: '08:00', horaFinReal: '23:00' })).includes('DURACION_LARGA'));
  assert.ok(cod(completo(1, { horaFinReal: '09:20' }), { duracionMin: 90 }).includes('CUMPLIDA_MUY_CORTA'));
  assert.ok(!cod(completo(1, { horaFinReal: '09:20', estado: 'parcial' }), { duracionMin: 90 }).includes('CUMPLIDA_MUY_CORTA'));
  const niv = (r: RegistroSesion) => validarRegistro(r).filter((h) => h.nivel === 'error').length;
  assert.equal(niv(completo(1, { saldoFinal: -1 })), 1); assert.equal(niv(reg(1, { estado: 'cumplida' })), 0);
});

test('resumen de la jornada: cuenta solo sesiones activas y no inventa datos', () => {
  const p0 = plan();
  const regs = {
    '1': completo(1),
    '2': completo(2, { estado: 'parcial', saldoInicial: 112000, saldoFinal: 100000, siguioMotor: 'parcial', sensacion: 2, saliMesa: true, motivoSalida: 'Racha en contra' }),
    '3': reg(3, { estado: 'no_cumplida', siguioMotor: 'no' }),   // sin saldos ni horas
  };
  const r = resumenJornada(p0, regs);
  assert.equal(r.sesionesActivas, 4); assert.equal(r.registradas, 3); assert.equal(r.pendientes, 1);
  assert.equal(r.cumplidas, 1); assert.equal(r.parciales, 1); assert.equal(r.noCumplidas, 1);
  assert.equal(r.resultadoTotal, 12000 - 12000); assert.equal(r.sesionesConResultado, 2);
  assert.equal(r.tiempoRealMin, 180);
  assert.deepEqual(r.siguioMotor, { si: 1, parcial: 1, no: 1, sinResponder: 0 });
  assert.equal(r.salidasDeMesa, 1); assert.equal(r.sensacionPromedio, 3);
  // sin ningún dato: totales nulos, no cero inventado
  const v = resumenJornada(p0, {});
  assert.equal(v.resultadoTotal, null); assert.equal(v.sensacionPromedio, null); assert.equal(v.pendientes, 4); assert.equal(v.registradas, 0);
  // una sesión cancelada no cuenta como pendiente ni como registrada
  const pc = cancelarSesion(p0, 2, '2026-10-13T10:00:00Z', 'Cansancio').plan;
  const rc = resumenJornada(pc, { '2': completo(2) });
  assert.equal(rc.sesionesActivas, 3); assert.equal(rc.registradas, 0); assert.equal(rc.pendientes, 3);
});

test('CSV: un campo con ; comillas o saltos de línea no rompe las columnas', () => {
  assert.equal(csvCampo('a;b'), '"a;b"'); assert.equal(csvCampo('di "hola"'), '"di ""hola"""'); assert.equal(csvCampo('l1\nl2'), '"l1\nl2"');
  assert.equal(csvCampo(null), ''); assert.equal(csvCampo(0), '0'); assert.equal(csvCampo(-12500), '-12500');
});

test('CSV: textos que Excel ejecutaría como fórmula quedan neutralizados', () => {
  for (const f of ['=1+1', '+cmd', '-2+3', '@SUMA(A1)', '\tx']) assert.ok(csvCampo(f, true).startsWith("'") || csvCampo(f, true).startsWith('"\''), f);
  assert.equal(csvCampo(-5), '-5', 'los números negativos NO se tocan');
  const p0 = plan();
  const f = filasJornada({ plan: p0, registros: { '1': completo(1, { notas: '=HYPERLINK("http://x")' }) }, notasDia: '@malo' });
  const fila = f[0].join(';');
  assert.ok(!/(^|;)=/.test(fila) && !/(^|;)@/.test(fila));
});

test('CSV: cabecera, una fila por sesión, columnas siempre alineadas, canceladas y vacías incluidas', () => {
  const p0 = cancelarSesion(plan(), 3, '2026-10-13T10:00:00Z', 'Imprevisto; "grave"').plan;
  const csv = csvJornadas([{ plan: p0, registros: { '1': completo(1, { notas: 'buena; con "comillas"\ny salto' }), '2': reg(2, { estado: 'no_cumplida', saliMesa: true, motivoSalida: 'Racha en contra' }) }, notasDia: 'día regular' }]);
  assert.ok(csv.endsWith('\r\n'));
  // contar campos respetando comillas
  const filas: string[][] = []; let campo = '', fila: string[] = [], q = false;
  for (let i = 0; i < csv.length; i++) { const c = csv[i];
    if (q) { if (c === '"') { if (csv[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true; else if (c === ';') { fila.push(campo); campo = ''; } else if (c === '\r') { /* ignora */ } else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; } else campo += c; }
  assert.equal(filas.length, 1 + 4); assert.ok(filas.every((f) => f.length === COLUMNAS_CSV.length), JSON.stringify(filas.map((f) => f.length)));
  assert.deepEqual(filas[0], [...COLUMNAS_CSV]);
  const h = (f: string[], c: (typeof COLUMNAS_CSV)[number]) => f[COLUMNAS_CSV.indexOf(c)];
  assert.equal(h(filas[1], 'sesion'), '1'); assert.equal(h(filas[1], 'resultado'), '12000'); assert.equal(h(filas[1], 'duracion_real_min'), '90');
  assert.equal(h(filas[1], 'notas_sesion'), 'buena; con "comillas"\ny salto'); assert.equal(h(filas[1], 'siguio_motor'), 'Sí'); assert.equal(h(filas[1], 'salio_de_mesa'), 'no');
  assert.equal(h(filas[2], 'cierre'), 'No cumplida'); assert.equal(h(filas[2], 'salio_de_mesa'), 'sí'); assert.equal(h(filas[2], 'resultado'), '');
  assert.equal(h(filas[3], 'estado_plan'), 'cancelada'); assert.equal(h(filas[3], 'motivo_cancelacion'), 'Imprevisto; "grave"'); assert.equal(h(filas[3], 'cierre'), 'sin registrar');
  assert.equal(h(filas[4], 'cierre'), 'sin registrar'); assert.equal(h(filas[1], 'notas_del_dia'), 'día regular'); assert.equal(h(filas[1], 'fecha'), '2026-10-13');
});

test('CSV de varias jornadas: ordena por fecha y no mezcla registros de otro día', () => {
  const a = { plan: construirPlan(cfgPorDefecto('2026-10-14')), registros: { '1': completo(1, { saldoFinal: 1 }) }, notasDia: '' };
  const b = { plan: construirPlan(cfgPorDefecto('2026-10-13')), registros: {}, notasDia: '' };
  const lineas = csvJornadas([a, b]).trim().split('\r\n');
  assert.equal(lineas.length, 1 + 8);
  assert.ok(lineas[1].startsWith('2026-10-13;1;') && lineas[5].startsWith('2026-10-14;1;'));
  assert.ok(lineas[1].includes(';sin registrar;') && lineas[5].includes(';Cumplida;'));
});

test('cierres de sesiones que ya no están en el plan: se avisan y NO se pierden en la descarga', () => {
  const p = construirPlan({ ...cfgPorDefecto('2026-10-13'), numSesiones: 2 });
  const regs = { '1': completo(1), '4': completo(4, { saldoFinal: 5 }), '3': reg(3) /* pendiente: no cuenta */ };
  assert.deepEqual(cierresHuerfanos(p, regs), [4]);
  const f = filasJornada({ plan: p, registros: regs, notasDia: '' });
  assert.equal(f.length, 3); const col = (fila: string[], c: (typeof COLUMNAS_CSV)[number]) => fila[COLUMNAS_CSV.indexOf(c)];
  assert.equal(col(f[2], 'sesion'), '4'); assert.equal(col(f[2], 'estado_plan'), 'fuera_del_plan'); assert.equal(col(f[2], 'saldo_final'), '5'); assert.equal(col(f[2], 'inicio_plan'), '');
  assert.deepEqual(cierresHuerfanos(p, { '1': completo(1) }), []);
});
