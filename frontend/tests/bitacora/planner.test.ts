import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirPlan, cancelarSesion, reprogramarSesion, validarDistribucion, parseHM, fmtHM, fechaValida, cfgPorDefecto } from '../../src/bitacora/planner';
import type { PlanCfg, Plan } from '../../src/bitacora/types';

const hm = (s: string) => parseHM(s)!;
const cfg = (o: Partial<PlanCfg> = {}): PlanCfg => ({ ...cfgPorDefecto('2026-10-13'), bloques: [], ...o });
const codigos = (p: Plan, nivel?: 'error' | 'aviso') => p.hallazgos.filter((h) => !nivel || h.nivel === nivel).map((h) => h.codigo);
const horas = (p: Plan) => p.sesiones.map((s) => `${fmtHM(s.inicio)}-${fmtHM(s.fin)}`);
const congelar = <T>(o: T): T => { if (o && typeof o === 'object') { Object.values(o as object).forEach(congelar); Object.freeze(o); } return o; };
const LUNES = { inicioDisponible: '09:00', limiteFin: '17:00', numSesiones: 4, duracionSesionMin: 90, descansoMinMin: 30, bloques: [{ tipo: 'almuerzo' as const, inicio: '12:30', duracionMin: 60 }] };

test('horas y fechas', () => {
  assert.equal(parseHM('09:05'), 545); assert.equal(parseHM('9:05'), 545); assert.equal(parseHM('24:00'), null); assert.equal(parseHM('12:60'), null); assert.equal(parseHM('abc'), null); assert.equal(parseHM(undefined), null);
  assert.equal(fmtHM(545), '09:05'); assert.equal(fmtHM(1470), '00:30 (+1)');
  assert.ok(fechaValida('2026-02-28')); assert.ok(!fechaValida('2026-02-30')); assert.ok(!fechaValida('2026-13-01')); assert.ok(!fechaValida('26-10-13'));
});

test('jornada real de 8 h (4×90, descanso 30, almuerzo 60 en el hueco): cabe exacto', () => {
  for (const modalidad of ['concentrada', 'equilibrada'] as const) {
    const p = construirPlan(cfg({ ...LUNES, modalidad }));
    assert.deepEqual(horas(p), ['09:00-10:30', '11:00-12:30', '13:30-15:00', '15:30-17:00'], modalidad);
    assert.equal(p.viable, true); assert.equal(p.tiempoEfectivoMin, 360); assert.equal(p.tiempoTotalMin, 480); assert.equal(p.finPrevisto, hm('17:00'));
    assert.deepEqual(p.descansos.map((d) => d.duracionMin), [30, 60, 30]);
  }
});

test('equilibrada reparte la holgura en descansos iguales; concentrada pega las sesiones al comienzo', () => {
  const e = construirPlan(cfg({ inicioDisponible: '09:00', limiteFin: '19:00', numSesiones: 3, modalidad: 'equilibrada' }));
  assert.deepEqual(horas(e), ['09:00-10:30', '13:15-14:45', '17:30-19:00']);
  assert.equal(e.descansos[0].duracionMin, e.descansos[1].duracionMin);
  const c = construirPlan(cfg({ inicioDisponible: '09:00', limiteFin: '19:00', numSesiones: 3, modalidad: 'concentrada' }));
  assert.deepEqual(horas(c), ['09:00-10:30', '11:00-12:30', '13:00-14:30']);
  assert.equal(c.finPrevisto, hm('14:30'));
});

test('desde una hora posterior', () => {
  const p = construirPlan(cfg({ inicioDisponible: '06:00', limiteFin: '18:00', numSesiones: 2, modalidad: 'desde', desdeHora: '13:00' }));
  assert.deepEqual(horas(p), ['13:00-14:30', '15:00-16:30']);
  for (const d of ['05:00', '18:00', 'xx', undefined]) {
    const q = construirPlan(cfg({ inicioDisponible: '06:00', limiteFin: '18:00', numSesiones: 2, modalidad: 'desde', desdeHora: d as string }));
    assert.ok(codigos(q, 'error').includes('DESDE_INVALIDA'), String(d)); assert.equal(q.viable, false); assert.equal(q.sesiones.length, 0);
  }
});

test('manual: martes (6:00, hueco de 2 h, luego 9:30) es válido', () => {
  const p = construirPlan(cfg({ inicioDisponible: '06:00', limiteFin: '18:00', modalidad: 'manual', numSesiones: 3, manuales: [{ inicio: '06:00' }, { inicio: '09:30' }, { inicio: '11:30' }], bloques: [{ tipo: 'desayuno', inicio: '08:00', duracionMin: 30 }, { tipo: 'almuerzo', inicio: '13:00', duracionMin: 60 }] }));
  assert.equal(p.viable, true, JSON.stringify(p.hallazgos)); assert.deepEqual(horas(p), ['06:00-07:30', '09:30-11:00', '11:30-13:00']);
});

test('manual: solapes, descanso corto, comida protegida, fuera de jornada y horas inválidas se rechazan', () => {
  const m = (lista: string[], extra: Partial<PlanCfg> = {}) => construirPlan(cfg({ inicioDisponible: '06:00', limiteFin: '18:00', modalidad: 'manual', numSesiones: lista.length, bloques: [{ tipo: 'almuerzo', inicio: '12:30', duracionMin: 60 }], manuales: lista.map((x) => ({ inicio: x })), ...extra }));
  assert.ok(codigos(m(['08:00', '09:00']), 'error').includes('SOLAPADAS'));
  assert.ok(codigos(m(['08:00', '09:45']), 'error').includes('DESCANSO_CORTO'));           // 15 min < 30
  assert.ok(codigos(m(['08:00', '10:00']), 'error').length === 0);                          // descanso justo en el mínimo (30 min)
  assert.ok(codigos(m(['08:00', '09:30']), 'error').includes('DESCANSO_CORTO'));            // 0 min de descanso
  assert.ok(codigos(m(['12:00']), 'error').includes('EN_BLOQUE_PROTEGIDO'));
  assert.ok(codigos(m(['05:00']), 'error').includes('FUERA_DE_JORNADA') || codigos(m(['05:00']), 'error').length > 0);
  assert.ok(codigos(m(['17:00']), 'error').includes('FUERA_DE_JORNADA'));                    // termina 18:30 > 18:00
  assert.ok(codigos(m(['25:00']), 'error').includes('HORA_INVALIDA'));
  assert.ok(codigos(m([]), 'error').includes('SIN_SESIONES_MANUALES'));
  assert.ok(codigos(m(['08:00'], { numSesiones: 3 }), 'aviso').includes('NUM_AJUSTADO'));
  assert.equal(m(['08:00', '09:45']).viable, false);
});

test('jornada inviable: avisa cuántas caben y por qué', () => {
  const p = construirPlan(cfg({ inicioDisponible: '09:00', limiteFin: '12:00', numSesiones: 4, modalidad: 'equilibrada' }));
  assert.equal(p.viable, false); assert.ok(codigos(p, 'error').includes('NO_CABEN'));
  assert.equal(p.sesiones.length, 1);
  assert.match(p.hallazgos.find((h) => h.codigo === 'NO_CABEN')!.mensaje, /Solo caben 1 de 4/);
  const q = construirPlan(cfg({ ...LUNES, limiteFin: '16:59' }));   // un minuto menos que lo necesario
  assert.equal(q.viable, false); assert.equal(q.sesiones.length, 3);
});

test('bloques protegidos: superpuestos, inválidos y fuera de jornada', () => {
  const a = construirPlan(cfg({ ...LUNES, bloques: [{ tipo: 'desayuno', inicio: '10:00', duracionMin: 60 }, { tipo: 'almuerzo', inicio: '10:30', duracionMin: 60 }] }));
  assert.ok(codigos(a, 'error').includes('BLOQUES_SUPERPUESTOS')); assert.equal(a.sesiones.length, 0);
  const b = construirPlan(cfg({ ...LUNES, bloques: [{ tipo: 'pausa', inicio: '99:00', duracionMin: 20 }] }));
  assert.ok(codigos(b, 'error').includes('BLOQUE_INVALIDO'));
  const c = construirPlan(cfg({ ...LUNES, limiteFin: '18:00', bloques: [{ tipo: 'desayuno', inicio: '06:00', duracionMin: 30 }, { tipo: 'almuerzo', inicio: '12:30', duracionMin: 60 }] }));
  assert.ok(codigos(c, 'aviso').includes('BLOQUE_FUERA_DE_JORNADA')); assert.equal(c.bloques.length, 1);
  const d = construirPlan(cfg({ ...LUNES, modalidad: 'concentrada', bloques: [{ tipo: 'almuerzo', inicio: '12:30', duracionMin: 60 }, { tipo: 'pausa', nombre: 'Llamada', inicio: '10:40', duracionMin: 20 }] }));
  assert.equal(d.viable, true, 'una pausa que cabe dentro del descanso no cambia el horario');
  assert.deepEqual(horas(d), ['09:00-10:30', '11:00-12:30', '13:30-15:00', '15:30-17:00']);
  const e = construirPlan(cfg({ ...LUNES, modalidad: 'concentrada', bloques: [{ tipo: 'almuerzo', inicio: '12:30', duracionMin: 60 }, { tipo: 'pausa', nombre: 'Llamada', inicio: '10:50', duracionMin: 30 }] }));
  assert.equal(e.viable, false, 'una pausa que empuja las sesiones deja de caber la cuarta');
  assert.ok(codigos(e, 'error').includes('NO_CABEN')); assert.equal(e.sesiones.length, 3);
  assert.ok(e.sesiones.every((x) => e.bloques.every((b) => x.fin <= b.inicio || x.inicio >= b.fin)), 'ninguna sesión pisa una pausa');
});

test('cruce de medianoche: se detecta, se avisa y se calcula', () => {
  const p = construirPlan(cfg({ inicioDisponible: '20:00', limiteFin: '00:30', numSesiones: 2, modalidad: 'concentrada' }));
  assert.equal(p.cruzaMedianoche, true); assert.ok(codigos(p, 'aviso').includes('CRUCE_MEDIANOCHE')); assert.equal(p.viable, true);
  assert.deepEqual(horas(p), ['20:00-21:30', '22:00-23:30']);
  const q = construirPlan(cfg({ inicioDisponible: '20:00', limiteFin: '00:30', numSesiones: 3, modalidad: 'concentrada' }));
  assert.equal(q.viable, false);                              // 3×90 + 2×30 = 330 > 270
  const r = construirPlan(cfg({ inicioDisponible: '21:00', limiteFin: '02:00', numSesiones: 3, modalidad: 'concentrada', bloques: [{ tipo: 'pausa', inicio: '00:00', duracionMin: 30 }] }));
  assert.equal(r.bloques[0].inicio, 1440); assert.ok(r.sesiones.every((s) => s.fin <= r.limite));
  assert.ok(horas(r).some((x) => x.includes('(+1)')));
  assert.ok(codigos(construirPlan(cfg({ inicioDisponible: '09:00', limiteFin: '09:00' })), 'error').includes('LIMITE_IGUAL_INICIO'));
});

test('validación de parámetros', () => {
  const err = (o: Partial<PlanCfg>) => codigos(construirPlan(cfg({ ...LUNES, ...o })), 'error');
  assert.ok(err({ fecha: '2026-02-30' }).includes('FECHA_INVALIDA'));
  assert.ok(err({ inicioDisponible: '9am' }).includes('HORA_INVALIDA')); assert.ok(err({ limiteFin: '' }).includes('HORA_INVALIDA'));
  for (const v of [0, 13, 1.5, NaN]) assert.ok(err({ numSesiones: v }).includes('NUM_SESIONES_INVALIDO'), String(v));
  for (const v of [4, 481, 0, 1.5]) assert.ok(err({ duracionSesionMin: v }).includes('DURACION_INVALIDA'), String(v));
  for (const v of [-1, 241, 2.5]) assert.ok(err({ descansoMinMin: v }).includes('DESCANSO_INVALIDO'), String(v));
  assert.ok(err({ giroObservacion: -1 }).includes('OBSERVACION_INVALIDA'));
  assert.ok(err({ limites: { perdidaJornada: -5 } }).includes('LIMITE_INVALIDO'));
  assert.equal(construirPlan(cfg({ ...LUNES })).cfg.giroObservacion, 80);
  const av = codigos(construirPlan(cfg({ ...LUNES, limites: { perdidaPorSesion: 100, perdidaJornada: 50, metaPorSesion: 100, metaJornada: 50 } })), 'aviso');
  assert.ok(av.includes('LIMITES_INCOHERENTES') && av.includes('METAS_INCOHERENTES'));
});

test('cancelar: no mueve las demás, no comprime descansos y no crea pendientes', () => {
  const p = construirPlan(cfg({ ...LUNES, modalidad: 'concentrada' }));
  const antes = JSON.stringify(p);
  const r = cancelarSesion(p, 2, '2026-10-13T11:00:00Z', 'me sentía cansado');
  assert.equal(JSON.stringify(p), antes, 'el plan original no se muta');
  assert.equal(r.ok, true); const q = r.plan;
  assert.equal(q.sesiones.length, 4, 'no se agrega ninguna sesión');
  assert.deepEqual(q.sesiones.filter((s) => s.n !== 2).map((s) => [s.n, s.inicio, s.fin]), p.sesiones.filter((s) => s.n !== 2).map((s) => [s.n, s.inicio, s.fin]), 'las demás no se mueven');
  assert.equal(q.sesiones[1].estado, 'cancelada'); assert.equal(q.sesiones[1].motivoCancelacion, 'me sentía cansado');
  assert.equal(q.tiempoEfectivoMin, 270); assert.equal(q.finPrevisto, hm('17:00'));
  assert.deepEqual(q.descansos.map((d) => [d.entre[0], d.entre[1], d.duracionMin]), [[1, 3, 180], [3, 4, 30]], 'el hueco queda como descanso; los demás no se acortan');
  assert.equal(q.historial.length, 1); assert.equal(q.historial[0].tipo, 'cancelada');
  assert.equal(q.viable, true);
  const otra = cancelarSesion(q, 2, 'x'); assert.equal(otra.ok, false); assert.equal(otra.plan.historial.length, 1, 'cancelar dos veces no duplica el evento');
  assert.equal(cancelarSesion(q, 9, 'x').ok, false);
});

test('reprogramar: respeta las reglas, conserva la duración y no mueve las demás', () => {
  const p = construirPlan(cfg({ inicioDisponible: '06:00', limiteFin: '20:00', numSesiones: 3, modalidad: 'concentrada', bloques: [{ tipo: 'almuerzo', inicio: '12:30', duracionMin: 60 }] }));
  assert.deepEqual(horas(p), ['06:00-07:30', '08:00-09:30', '10:00-11:30']);
  const ok = reprogramarSesion(p, 3, '14:00', 't1');
  assert.equal(ok.ok, true); const q = ok.plan;
  assert.equal(q.sesiones[2].inicio, hm('14:00')); assert.equal(q.sesiones[2].duracionMin, 90); assert.equal(q.sesiones[2].fin, hm('15:30'));
  assert.equal(q.sesiones[2].reprogramadaDesde, hm('10:00')); assert.equal(q.sesiones[0].inicio, p.sesiones[0].inicio); assert.equal(q.sesiones[1].inicio, p.sesiones[1].inicio);
  const dos = reprogramarSesion(q, 3, '15:00', 't2').plan; assert.equal(dos.sesiones[2].reprogramadaDesde, hm('10:00'), 'conserva la hora original');
  assert.equal(dos.historial.length, 2);
  for (const [hora, cod] of [['08:30', 'SOLAPADAS'], ['09:45', 'DESCANSO_CORTO'], ['12:00', 'EN_BLOQUE_PROTEGIDO'], ['19:00', 'FUERA_DE_JORNADA'], ['05:00', 'FUERA_DE_JORNADA']] as const) {
    const r = reprogramarSesion(p, 3, hora, 't'); assert.equal(r.ok, false, hora); assert.ok(r.hallazgos.some((h) => h.codigo === cod), `${hora} → ${cod}: ${JSON.stringify(r.hallazgos)}`); assert.equal(r.plan, p, 'el plan queda intacto');
  }
  assert.equal(reprogramarSesion(p, 3, 'xx', 't').ok, false); assert.equal(reprogramarSesion(p, 3, '10:00', 't').ok, false);
  const c = cancelarSesion(p, 3, 't').plan; assert.equal(reprogramarSesion(c, 3, '14:00', 't').ok, false, 'una sesión cancelada no se reprograma');
});

test('reprogramar no se bloquea por errores que ya existían en otras sesiones', () => {
  const malo = construirPlan(cfg({ inicioDisponible: '06:00', limiteFin: '18:00', modalidad: 'manual', numSesiones: 3, manuales: [{ inicio: '06:00' }, { inicio: '07:40' }, { inicio: '14:00' }] }));
  assert.equal(malo.viable, false);
  const r = reprogramarSesion(malo, 3, '15:00', 't'); assert.equal(r.ok, true);
});

// ── Propiedades sobre miles de configuraciones aleatorias (PRNG con semilla fija) ──
function prng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const H = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

test('propiedades: ninguna distribución automática rompe las reglas (4 000 configuraciones)', () => {
  const R = prng(20261013); let viables = 0, inviables = 0, cruces = 0;
  for (let i = 0; i < 4000; i++) {
    const ini = Math.floor(R() * 24 * 12) * 5, largo = 60 + Math.floor(R() * 14 * 12) * 5;
    const mod = (['equilibrada', 'concentrada', 'desde'] as const)[Math.floor(R() * 3)];
    const bl = Array.from({ length: Math.floor(R() * 3) }, (_, k) => ({ tipo: (['desayuno', 'almuerzo', 'pausa'] as const)[k % 3], inicio: H(ini + Math.floor(R() * largo)), duracionMin: 10 + Math.floor(R() * 8) * 10 }));
    const c = congelar(cfg({ inicioDisponible: H(ini), limiteFin: H(ini + largo), numSesiones: 1 + Math.floor(R() * 8), duracionSesionMin: 20 + Math.floor(R() * 16) * 10, descansoMinMin: Math.floor(R() * 7) * 10, bloques: bl, modalidad: mod, desdeHora: H(ini + Math.floor(R() * largo)) }));
    const p = construirPlan(c);
    assert.equal(JSON.stringify(construirPlan(c)), JSON.stringify(p), 'determinista');
    if (p.cruzaMedianoche) cruces++;
    // invariantes de lo que SÍ se colocó (aunque el plan no sea viable)
    const dist = validarDistribucion(p.sesiones, p.bloques, p.inicio, p.limite, c.descansoMinMin);
    assert.deepEqual(dist, [], `config ${i}: ${JSON.stringify(c)}`);
    for (const s of p.sesiones) { assert.ok(s.fin <= p.limite && s.inicio >= p.inicio); assert.equal(s.fin - s.inicio, c.duracionSesionMin); }
    for (const d of p.descansos) assert.ok(d.duracionMin >= c.descansoMinMin);
    assert.ok(p.sesiones.length <= c.numSesiones);
    if (p.viable) { viables++; assert.equal(p.sesiones.length, c.numSesiones); assert.equal(p.tiempoEfectivoMin, c.numSesiones * c.duracionSesionMin); assert.ok(p.tiempoTotalMin >= p.tiempoEfectivoMin); }
    else { inviables++; assert.ok(p.hallazgos.some((h) => h.nivel === 'error')); }
  }
  assert.ok(viables > 400 && inviables > 400 && cruces > 100, `cobertura: viables ${viables}, inviables ${inviables}, cruces ${cruces}`);
});

test('propiedades: si la concentrada cabe, la equilibrada también; ambas tienen mismo efectivo', () => {
  const R = prng(7); let n = 0;
  for (let i = 0; i < 1500; i++) {
    const ini = Math.floor(R() * 12 * 12) * 5, largo = 120 + Math.floor(R() * 12 * 12) * 5;
    const base = { inicioDisponible: H(ini), limiteFin: H(ini + largo), numSesiones: 1 + Math.floor(R() * 6), duracionSesionMin: 30 + Math.floor(R() * 10) * 10, descansoMinMin: Math.floor(R() * 5) * 10, bloques: [{ tipo: 'almuerzo' as const, inicio: H(ini + Math.floor(R() * largo)), duracionMin: 30 + Math.floor(R() * 4) * 10 }] };
    const c = construirPlan(cfg({ ...base, modalidad: 'concentrada' })), e = construirPlan(cfg({ ...base, modalidad: 'equilibrada' }));
    if (c.viable) { n++; assert.ok(e.viable, JSON.stringify(base)); assert.equal(e.tiempoEfectivoMin, c.tiempoEfectivoMin); assert.ok(e.finPrevisto! >= c.finPrevisto!); }
  }
  assert.ok(n > 300);
});

test('el plan no muta la configuración recibida y es serializable', () => {
  const c = congelar(cfg({ ...LUNES, modalidad: 'equilibrada', reglasSalida: ['salgo si pierdo el límite'], limites: { perdidaPorSesion: 100000 } }));
  const p = construirPlan(c); assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
  assert.deepEqual(p.cfg.reglasSalida, ['salgo si pierdo el límite']);
});
