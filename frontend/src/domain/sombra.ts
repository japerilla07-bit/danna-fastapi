// ════════════════════════════════════════════════════════════════════════
// SOMBRA — "seguir a la voz de peor rendimiento en los últimos 12 giros".
//
// MODO SOMBRA (oct 2026): corre EN PARALELO a D.A.N.N.A. y NO cambia lo que
// D.A.N.N.A. juega. Cada giro dice qué habría jugado la regla, se puntúa, y se
// registra para compararla con D.A.N.N.A. cuando haya ~20–30 sesiones nuevas.
//
// LA REGLA (la misma de la simulación de 55 sesiones):
//   · Voces candidatas: D (lo que D.A.N.N.A. juega hoy), E (Escudo solo) y
//     C (Capa 1 sola). El Motor NO entra (con el Motor en el grupo empeora).
//   · Para cada voz se mira su tasa de aciertos en los últimos 12 giros,
//     contando también los giros en que esa voz NO fue la jugada (resultado
//     "virtual": lo que habría pasado de haberla jugado).
//   · Se juega la voz con la tasa MÁS BAJA. Empate → el primero de D, E, C.
//   · Si D.A.N.N.A. no tiene jugada este giro (espera), la sombra tampoco.
//   · Cero = acierto (misma convención de la simulación y de la mesa).
//
// Funciones PURAS, sin estado propio ni imports de la app: el estado lo guarda
// telemetryStore.ts. Solo lectura: ninguna decisión del piloto lo usa.
// ════════════════════════════════════════════════════════════════════════

export type VozSombra = 'D' | 'E' | 'C';
export const VOCES_SOMBRA: readonly VozSombra[] = ['D', 'E', 'C'];
export const SOMBRA_VENTANA = 12;

/** 1 = acierto, 0 = error, null = esa voz no tenía jugada ese giro. */
export type ResSombra = 0 | 1 | null;
/** Últimos SOMBRA_VENTANA giros por voz (el más reciente al final). */
export type SombraHist = Record<VozSombra, ResSombra[]>;
/** Zonas que cada voz juega para un giro ("13-24 / 25-36", "Columna 1"…) o null. */
export type SombraPicks = Record<VozSombra, string | null>;

export const NOMBRE_VOZ: Record<VozSombra, string> = { D: 'D.A.N.N.A.', E: 'Escudo', C: 'Capa 1' };

export function sombraHistVacia(): SombraHist {
  return { D: [], E: [], C: [] };
}

/** Números que cubre un texto de zonas (docenas "1-12", columnas "Columna 2"). */
export function numerosZonas(pick: string | null | undefined): number[] {
  const out = new Set<number>();
  const t = (pick || '').toLowerCase();
  if (/\b1\s*-\s*12\b/.test(t)) for (let n = 1; n <= 12; n++) out.add(n);
  if (/\b13\s*-\s*24\b/.test(t)) for (let n = 13; n <= 24; n++) out.add(n);
  if (/\b25\s*-\s*36\b/.test(t)) for (let n = 25; n <= 36; n++) out.add(n);
  for (const m of t.matchAll(/col(?:umna)?\s*([123])/g)) {
    const c = Number(m[1]);
    for (let n = 1; n <= 36; n++) if (n % 3 === c % 3) out.add(n);
  }
  return [...out];
}

/** Texto de zonas válido o null (vacío / sin zonas reconocibles → null). */
export function zonasValidas(pick: string | null | undefined): string | null {
  return numerosZonas(pick).length > 0 ? (pick as string) : null;
}

/** Acierto con CERO = acierto. null si no había jugada evaluable. */
export function aciertoConCero(pick: string | null | undefined, spin: number): ResSombra {
  const nums = numerosZonas(pick);
  if (nums.length === 0 || !Number.isFinite(spin)) return null;
  return spin === 0 || nums.includes(spin) ? 1 : 0;
}

/** Une las zonas que juega una voz (docenas y/o columnas; acierta si cae en CUALQUIERA). */
function unir(...partes: Array<string | null | undefined>): string | null {
  const xs = partes.map((x) => zonasValidas(x)).filter((x): x is string => x !== null);
  return xs.length ? xs.join(' / ') : null;
}

/** Campos de la decisión que usa la sombra (los mismos que guarda `Pending` en el store). */
export interface FuentesSombra {
  copSug: 'doc' | 'col' | null;
  copPickDocOverride: string | null;
  copPickColOverride: string | null;
  capa1Sug: 'doc' | 'col' | null;
  escudoPickDoc: string | null;
  escudoPickCol: string | null;
}

/**
 * Qué juega cada voz este giro — con exactamente el mismo criterio con que el
 * store puntúa copScore / capa1Score / escudoScore, para que la sombra y los
 * marcadores reales hablen de las mismas jugadas.
 */
export function picksSombra(f: FuentesSombra, docPick: string, colPick: string): SombraPicks {
  return {
    D: unir(
      f.copPickDocOverride ?? (f.copSug === 'doc' ? docPick : null),
      f.copPickColOverride ?? (f.copSug === 'col' ? colPick : null),
    ),
    E: unir(f.escudoPickDoc, f.escudoPickCol),
    C: unir(f.capa1Sug === 'doc' ? docPick : f.capa1Sug === 'col' ? colPick : null),
  };
}

/** Resuelve las jugadas del giro anterior con el número que salió y las anota en la ventana. */
export function sombraAvanzar(h: SombraHist, picksPrev: SombraPicks, spin: number): SombraHist {
  const out = sombraHistVacia();
  for (const v of VOCES_SOMBRA) {
    out[v] = [...h[v], aciertoConCero(picksPrev[v], spin)].slice(-SOMBRA_VENTANA);
  }
  return out;
}

/** Tasa de aciertos de una voz en la ventana, o null si no tiene ningún giro resuelto. */
export function tasaVoz(h: SombraHist, v: VozSombra): number | null {
  const xs = h[v].filter((x): x is 0 | 1 => x !== null);
  if (xs.length === 0) return null;
  return xs.reduce<number>((a, b) => a + b, 0) / xs.length;
}

/**
 * Elige la voz de peor rendimiento entre las que tienen jugada este giro.
 * null = D.A.N.N.A. espera (la sombra también). Sin historial en ninguna → D.
 */
export function sombraElegir(h: SombraHist, picks: SombraPicks): VozSombra | null {
  if (picks.D === null) return null;
  let mejor: VozSombra | null = null;
  let peor = 0;
  for (const v of VOCES_SOMBRA) {
    if (picks[v] === null) continue;
    const t = tasaVoz(h, v);
    if (t === null) continue;
    if (mejor === null || -t > -peor + 1e-12) { mejor = v; peor = t; }
  }
  return mejor ?? 'D';
}
