// ════════════════════════════════════════════════════════════════════════
// DETECTOR DE RÉGIMEN — MODO SOMBRA (oct 2026).
//
// SOLO OBSERVA Y REGISTRA. Ninguna decisión del piloto (decidirPiloto, Capa 1,
// Escudo, progresión, JUEGA ESTO) lo lee. Describe cómo está la mesa; NO dice
// qué va a salir. En las 55 sesiones del corpus los estados aparecen con la
// misma frecuencia que en mesas barajadas y no anticipan el siguiente giro:
// por eso esta fase es de MEDICIÓN y validación hacia adelante, no de filtro.
//
// Se calcula por separado para DOCENAS y COLUMNAS. El cero no pertenece a
// ninguna zona: se salta (no entra en la ventana).
//
// Estados:
//   · Indeterminado  — menos de 2·W (24) giros sin cero: no hay datos para dos ventanas.
//   · Cambio brusco  — la ventana reciente (12) difiere de la anterior (12)
//                      (chi-cuadrado de homogeneidad ≥ 5,991 → 5 %) Y además cambió
//                      la zona líder o la entropía normalizada se movió > 0,15.
//   · Concentración  — la ventana reciente se aparta del reparto parejo
//                      (chi-cuadrado de bondad de ajuste ≥ 5,991 → 5 %).
//   · Alternancia    — en los últimos 16 giros hubo ≥ 14 cambios de zona en 15
//                      transiciones (cola exacta ≤ 5 % con p = 2/3).
//   · Equilibrada    — ninguno de los anteriores.
// Prioridad: Cambio brusco > Concentración > Alternancia > Equilibrada.
//
// Funciones PURAS, sin imports de la app. El estado lo guarda telemetryStore.ts.
// ════════════════════════════════════════════════════════════════════════

export type EstadoRegimen =
  | 'Concentración' | 'Alternancia' | 'Cambio brusco' | 'Equilibrada' | 'Indeterminado';

export const REGIMEN_W = 12;          // ventana de concentración / de comparación
export const REGIMEN_WA = 16;         // ventana de alternancia (15 transiciones)
export const REGIMEN_CHI = 5.991;     // chi-cuadrado, 2 g.l., 5 %
export const REGIMEN_KALT = 14;       // cambios mínimos de 15 para "Alternancia"
export const REGIMEN_UMBRAL_H = 0.15; // movimiento mínimo de entropía para "Cambio brusco"
const CAP = 2 * REGIMEN_W;

export type Mercado = 'doc' | 'col';

/** Zona (1..3) de un número: docena o columna. Cero / fuera de rango → null. */
export function zonaDe(n: number, m: Mercado): number | null {
  if (!Number.isFinite(n) || n < 1 || n > 36) return null;
  return m === 'doc' ? Math.floor((n - 1) / 12) + 1 : ((n - 1) % 3) + 1;
}

/** Añade una zona a la ventana (máx. 24, la más reciente al final). null = cero: no cambia nada. */
export function regimenAvanzar(zonas: readonly number[], zona: number | null): number[] {
  if (zona === null) return zonas.slice();
  return [...zonas, zona].slice(-CAP);
}

export interface DiagRegimen {
  estado: EstadoRegimen;
  /** Zona más frecuente en la ventana reciente (empate → la de menor número), o null si Indeterminado. */
  lider: number | null;
  /** Giros sin cero disponibles (hasta 24). */
  n: number;
  /** Chi-cuadrado de la ventana reciente contra el reparto parejo (0 si Indeterminado). */
  chiConc: number;
  /** Cambios de zona en los últimos 16 giros (null si aún no hay 16). */
  cambios: number | null;
  /** Chi-cuadrado de homogeneidad entre ventana anterior y reciente (0 si Indeterminado). */
  chiRuptura: number;
  /** Entropía normalizada (0–1) de la ventana reciente, o null. */
  entropia: number | null;
}

function conteo(zs: readonly number[]): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (const z of zs) if (z >= 1 && z <= 3) c[z - 1] += 1;
  return c;
}

function chiBondad(c: readonly number[]): number {
  const e = (c[0] + c[1] + c[2]) / 3;
  if (e === 0) return 0;
  return c.reduce((s, x) => s + (x - e) * (x - e) / e, 0);
}

function chiHomogeneidad(a: readonly number[], b: readonly number[]): number {
  const ta = a[0] + a[1] + a[2];
  const tb = b[0] + b[1] + b[2];
  const t = ta + tb;
  if (ta === 0 || tb === 0) return 0;
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const tot = a[i] + b[i];
    if (tot === 0) continue;
    const ea = (tot * ta) / t;
    const eb = (tot * tb) / t;
    s += (a[i] - ea) * (a[i] - ea) / ea + (b[i] - eb) * (b[i] - eb) / eb;
  }
  return s;
}

function entropiaNorm(c: readonly number[]): number {
  const t = c[0] + c[1] + c[2];
  if (t === 0) return 0;
  let h = 0;
  for (const x of c) if (x > 0) h -= (x / t) * Math.log(x / t);
  return h / Math.log(3);
}

function lider(c: readonly number[]): number {
  let k = 0;
  for (let i = 1; i < 3; i++) if (c[i] > c[k]) k = i;
  return k + 1;
}

/** Diagnóstico del régimen de UN mercado a partir de su ventana de zonas (sin ceros). */
export function clasificarRegimen(zonas: readonly number[]): DiagRegimen {
  const n = zonas.length;
  const cambiosUlt = (() => {
    if (n < REGIMEN_WA) return null;
    const ch = zonas.slice(-REGIMEN_WA);
    let k = 0;
    for (let i = 1; i < ch.length; i++) if (ch[i] !== ch[i - 1]) k += 1;
    return k;
  })();
  if (n < CAP) {
    return { estado: 'Indeterminado', lider: null, n, chiConc: 0, cambios: cambiosUlt, chiRuptura: 0, entropia: null };
  }
  const rec = zonas.slice(-REGIMEN_W);
  const prv = zonas.slice(-CAP, -REGIMEN_W);
  const cr = conteo(rec);
  const cp = conteo(prv);
  const chiConc = chiBondad(cr);
  const chiRuptura = chiHomogeneidad(cp, cr);
  const hr = entropiaNorm(cr);
  const hp = entropiaNorm(cp);
  const cambioLider = lider(cr) !== lider(cp);

  let estado: EstadoRegimen;
  if (chiRuptura >= REGIMEN_CHI && (Math.abs(hr - hp) > REGIMEN_UMBRAL_H || cambioLider)) estado = 'Cambio brusco';
  else if (chiConc >= REGIMEN_CHI) estado = 'Concentración';
  else if (cambiosUlt !== null && cambiosUlt >= REGIMEN_KALT) estado = 'Alternancia';
  else estado = 'Equilibrada';

  return { estado, lider: lider(cr), n, chiConc, cambios: cambiosUlt, chiRuptura, entropia: hr };
}
