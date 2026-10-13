// BITÁCORA — tipos del planificador de jornada.
//
// Módulo INDEPENDIENTE del motor: no importa nada de la app (ni store, ni dominio,
// ni React). La bitácora observa y registra; nunca decide por el motor.
//
// Convención de tiempo: todas las horas internas son MINUTOS desde las 00:00 de la
// fecha de la jornada. Si la jornada cruza la medianoche, las horas posteriores a
// las 00:00 superan 1440 (p. ej. 00:30 del día siguiente = 1470).

export type Minutos = number;

/** Cómo se distribuyen las sesiones dentro de la jornada. */
export type Modalidad = 'equilibrada' | 'concentrada' | 'desde' | 'manual';

/** Bloque protegido: ninguna sesión puede solaparse con él. */
export interface BloqueCfg {
  tipo: 'desayuno' | 'almuerzo' | 'pausa';
  nombre?: string;
  /** "HH:MM" */
  inicio: string;
  duracionMin: number;
}

/** Referencias económicas. Solo se guardan y se muestran: el planificador no las aplica ni las ejecuta. */
export interface LimitesRef {
  perdidaPorSesion?: number | null;
  perdidaJornada?: number | null;
  metaPorSesion?: number | null;
  metaJornada?: number | null;
}

export interface SesionManualCfg {
  /** "HH:MM" */
  inicio: string;
  /** Si falta, se usa la duración general. */
  duracionMin?: number;
}

export interface PlanCfg {
  /** "YYYY-MM-DD" */
  fecha: string;
  /** "HH:MM" — hora en que puedes empezar. */
  inicioDisponible: string;
  /** "HH:MM" — hora límite. Si es menor o igual al inicio se entiende como el día siguiente. */
  limiteFin: string;
  numSesiones: number;
  duracionSesionMin: number;
  /** Descanso mínimo entre sesiones consecutivas (minutos). */
  descansoMinMin: number;
  /** Desayuno, almuerzo y otras pausas: bloques protegidos. */
  bloques: BloqueCfg[];
  modalidad: Modalidad;
  /** Solo 'desde': "HH:MM". */
  desdeHora?: string;
  /** Solo 'manual': una entrada por sesión. */
  manuales?: SesionManualCfg[];
  limites?: LimitesRef;
  /** Reglas de salida definidas por el usuario antes de empezar (texto libre; solo se registran). */
  reglasSalida?: string[];
  /** Giros de observación inicial por sesión (80 por defecto). */
  giroObservacion?: number;
}

export type EstadoPlanSesion = 'planificada' | 'cancelada';

export interface SesionPlan {
  /** Número de sesión dentro de la jornada (1..N). Es su identidad; no cambia al reprogramar. */
  n: number;
  inicio: Minutos;
  fin: Minutos;
  duracionMin: number;
  estado: EstadoPlanSesion;
  /** Hora original, si la sesión fue reprogramada. */
  reprogramadaDesde?: Minutos;
  motivoCancelacion?: string;
}

export interface BloquePlan {
  tipo: BloqueCfg['tipo'];
  nombre: string;
  inicio: Minutos;
  fin: Minutos;
}

export interface Descanso {
  desde: Minutos;
  hasta: Minutos;
  duracionMin: number;
  /** Números de las dos sesiones activas que separa. */
  entre: [number, number];
}

export type Nivel = 'error' | 'aviso';

export interface Hallazgo {
  codigo: string;
  nivel: Nivel;
  mensaje: string;
  sesion?: number;
}

export interface EventoPlan {
  tipo: 'cancelada' | 'reprogramada';
  n: number;
  /** ISO, lo entrega quien llama (el planificador no lee el reloj: es determinista). */
  ts: string;
  detalle: string;
}

export interface Plan {
  cfg: PlanCfg;
  inicio: Minutos;
  limite: Minutos;
  cruzaMedianoche: boolean;
  sesiones: SesionPlan[];
  bloques: BloquePlan[];
  /** Descansos entre sesiones activas, en orden de hora. */
  descansos: Descanso[];
  /** Fin de la última sesión activa; null si no hay ninguna. */
  finPrevisto: Minutos | null;
  /** Suma de las duraciones de las sesiones activas (tiempo efectivo de operación). */
  tiempoEfectivoMin: number;
  /** Desde el inicio de la primera sesión activa hasta el fin de la última (incluye descansos y comidas). */
  tiempoTotalMin: number;
  hallazgos: Hallazgo[];
  /** true solo si no hay hallazgos de nivel 'error'. */
  viable: boolean;
  historial: EventoPlan[];
}

export interface ResultadoOp {
  ok: boolean;
  plan: Plan;
  hallazgos: Hallazgo[];
}
