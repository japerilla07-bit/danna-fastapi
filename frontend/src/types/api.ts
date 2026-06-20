// src/types/api.ts
// ============================================================================
// D.A.N.N.A. — Contrato de tipos entre backend (FastAPI) y frontend (React/TS)
// ----------------------------------------------------------------------------
// Estos tipos se derivan literalmente de los archivos del backend:
//
//   • pilot.py                  → PilotState._fresh(), _build_verdict(),
//                                 evaluate(), MotorReader, set/get_override
//   • api_v2/state_routes.py    → GET /api/state (build del snapshot)
//   • api_v2/spin_routes.py     → POST /api/spin (response)
//   • api_v2/pilot_routes.py    → /api/pilot/override (POST/GET)
//   • api_v2/auth_routes.py     → /api/login, /api/me, /api/logout
//   • danna_core/processor.py   → _update_counters_local() shape contadores
//
// Convenciones:
//   • Campos auditados verbatim contra el .py: sin comentario adicional.
//   • Campos NO auditados (engine.py, helpers de danna_core que no se
//     subieron a esta sesión): marcados con `// no auditado:` y tipados
//     como `unknown` u opcionales, NUNCA como `any`.
//   • Para colecciones del motor con shape variable se usa
//     `Record<string, unknown>` antes que `any` — el consumidor está
//     forzado a hacer narrowing.
//   • Todo lo que viene del backend es readonly por contrato: el frontend
//     no debe mutar el snapshot. Si el cliente quiere mutar, copia.
//
// Reemplazo del legacy `EnginePayload = any`:
//   El antiguo `any` permitía cualquier lectura sin validación. Esto era
//   la raíz estructural por la que rompía el frontend al mover el backend.
//   Ahora `EnginePayload` (alias de `EngineDecision` con metadata) tiene
//   forma conocida en sus campos consumidos; campos del motor que no
//   audité son `unknown` con index signature de escape.
// ============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMITIVOS / DISCRIMINADORES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claves canónicas de las 5 categorías principales + max_conf.
 * Fuente: pilot.py:VALID_BET_KEYS y MotorReader.get_active_suggestions.
 */
export type BetKey =
  | 'color'
  | 'paridad'
  | 'rango'
  | 'docenas'
  | 'columnas'
  | 'max_conf';

/**
 * Claves extendidas que aparecen SOLO en `counters` / `counters_god`.
 * Fuente: processor.py:483 bet_keys = ["primary", "docenas", ...].
 * NOTA: 'primary' es la apuesta principal del MOTOR (gate de final_action),
 * NO la `pick_bet` del Pilot. Son conceptos distintos.
 */
export type CounterKey =
  | BetKey
  | 'primary'
  | 'guardian_docena'
  | 'guardian_columna';

/**
 * Veredicto del Pilot tras evaluar un giro.
 * Fuente: pilot.py:evaluate() — líneas 889-895.
 */
export type VerdictType = 'GO' | 'WAIT' | 'STAND_DOWN';

/**
 * Estado de una sugerencia individual en bet_advice.
 * Fuente: pilot.py:MotorReader.get_active_suggestions() — `allowed_status`
 * y processor.py:535-543 (normalización de status/action).
 */
export type BetStatus = 'BET' | 'PROBE' | 'WAIT' | 'EXPLOIT' | 'OBSERVE';

/**
 * Estado computado del HUD según `_compute_cond` en state_routes.py.
 * Fuente: state_routes.py:192-198 (return states).
 * Lowercase en el response del backend.
 */
export type HudCondState = 'optimal' | 'caution' | 'critical' | 'abort';

/**
 * Estado operacional según el Motor (MotorReader.get_operational_state).
 * Fuente: pilot.py:284-310 (uppercase en return).
 */
export type OpState =
  | 'OPTIMAL'
  | 'CAUTION'
  | 'CRITICAL'
  | 'ABORT'
  | 'UNKNOWN';

/**
 * Eventos de detección de régimen.
 * Fuente: pilot.py:RegimeDetector.update() — valores observados.
 */
export type RegimeEvent =
  | 'REGIME_STARTED'
  | 'REGIME_ENDED'
  | 'REGIME_HOT'
  | 'REGIME_COOL'
  | null;

/**
 * Trend del TQI según _compute_tqi.
 * Fuente: pilot.py — observado en _build_verdict.tqi.trend.
 * Mantenido permisivo como string porque no audité _compute_tqi al detalle.
 */
export type TQITrend = 'rising' | 'falling' | 'stable' | string;


// ─────────────────────────────────────────────────────────────────────────────
// 2. CONTADORES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape EXACTO de cada entrada en `counters` y `counters_god`.
 * Fuente: processor.py:166 base = {"wins":0, "losses":0,
 * "consec_errors":0, "max_consec_errors":0}.
 *
 * `streak` y `max_streak` venían marcados como opcionales en el api.ts
 * legacy. processor.py:_update_counters_local NO los setea, pero se
 * mantienen como opcionales para no romper a consumidores que los
 * lean defensivamente (`c?.streak ?? 0`).
 */
export interface CounterEntry {
  readonly wins: number;
  readonly losses: number;
  readonly consec_errors: number;
  readonly max_consec_errors: number;
  readonly streak?: number;
  readonly max_streak?: number;
}

/**
 * Mapa de contadores. Las claves siguen CounterKey, pero como el dict del
 * backend puede contener claves dinámicas (e.g. "god_color" en counters_god),
 * se mantiene Record<string, ...> con tipo de valor estricto.
 */
export type CountersMap = Readonly<Record<string, CounterEntry>>;


// ─────────────────────────────────────────────────────────────────────────────
// 3. BUCKETS DEL PILOT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una entrada de bucket (CCS o nivel).
 * Fuente: pilot.py:_fresh() — ccs_buckets, level_buckets.
 */
export interface BucketEntry {
  readonly go_count: number;
  readonly hits: number;
}

export type CCSBucketKey = '<70' | '70-75' | '75-80' | '80-85' | '85-90' | '90+';
export type LevelBucketKey = 'L1' | 'L2' | 'L3' | 'L4';

export type CCSBuckets = Readonly<Record<CCSBucketKey, BucketEntry>>;
export type LevelBuckets = Readonly<Record<LevelBucketKey, BucketEntry>>;


// ─────────────────────────────────────────────────────────────────────────────
// 4. PILOT VERDICT (lo que produce pilot.evaluate())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `pick` puede ser string, número, lista de números — depende de bet_key.
 * Fuente: pilot.py:_pretty_pick() y _parse_picks_from_str().
 */
export type PickValue = string | number | readonly (string | number)[] | null;

/**
 * La apuesta elegida por el Pilot.
 * Fuente: pilot.py:_build_verdict() — líneas 985-1003 (`pick_bet = {...}`).
 *
 * NOTA: Es `null` cuando no hay sugerencia (chosen is None), es decir
 * cuando el verdict es STAND_DOWN sin candidatos.
 */
export interface PickBet {
  readonly bet_key: BetKey;
  readonly label: string;
  readonly pick: PickValue;
  readonly pick_pretty: string;
  readonly score_pct: number;          // 0–100
  readonly stake_per_line: number;
  readonly stake_total: number;
  readonly level: number;              // 1..4
  readonly internal_level: number;
  readonly level_authorized: boolean;
  readonly level_reason: string;
  readonly session_hr: number;         // hit-rate de sesión [0,1]
  readonly session_n: number;
  readonly engine_consec_hits: number;
  readonly engine_consec_misses: number;
  readonly p: number;                  // probabilidad del motor
  readonly edge: number;
}

/**
 * Una sugerencia dentro de all_suggestions del verdict.
 * Fuente: pilot.py:_build_verdict() — líneas 1011-1022 (`all_suggestions = [...]`).
 */
export interface AllSuggestionEntry {
  readonly bet_key: BetKey;
  readonly label: string;
  readonly pick_pretty: string;
  readonly score_pct: number;
  readonly session_hr: number;
  readonly session_n: number;
  readonly p: number;
  readonly engine_consec_hits: number;
}

/**
 * Estadísticas de sesión dentro del verdict.
 * Fuente: pilot.py:_build_verdict() — líneas 1027-1041 (`session_stats = {...}`).
 *
 * `pilot_avg_errors = pilot_total_errors / max(1, pilot_total_bets)`.
 * El nombre conserva la convención del backend; semánticamente es una
 * TASA de errores en [0,1], no un promedio de errores acumulados.
 */
export interface SessionStats {
  readonly bets_emitted: number;
  readonly bets_hits: number;
  readonly bets_misses: number;
  readonly hit_rate_pct: number;          // ya en porcentaje (0–100)
  readonly current_streak: number;        // negativo = racha de errores
  readonly profit_session: number;        // PnL del Pilot
  readonly pilot_consec_errors: number;
  readonly pilot_max_consec_errors: number;
  readonly pilot_total_errors: number;
  readonly pilot_total_bets: number;
  readonly pilot_avg_errors: number;      // tasa [0,1] — ver nota arriba
}

/**
 * Estado de Pro Mode en el verdict.
 * Fuente: pilot.py:_build_verdict() — 1042-1046.
 */
export interface ProModeState {
  readonly active: boolean;
  readonly threshold: number;             // [0,1], default 0.72
  readonly blocked: number;
}

/**
 * Estado del filtro GOD histórico en el verdict.
 * Fuente: pilot.py:_build_verdict() — 1047-1052.
 */
export interface GodFilterState {
  readonly active: boolean;
  readonly threshold: number;             // [0,1], default 0.65
  readonly min_n: number;                 // default 8
  readonly blocked: number;
}

/**
 * Estado del operator_override DENTRO del verdict (snapshot).
 * Fuente: pilot.py:_build_verdict() — 1053-1058.
 *
 * Diferente del shape devuelto por GET /api/pilot/override (ver
 * `OperatorOverrideResponse` más abajo), que añade `activated_at`.
 */
export interface OperatorOverrideInVerdict {
  readonly active: boolean;
  readonly bet_key: BetKey | null;
  readonly pick: PickValue;
  readonly count: number;
}

/**
 * Información de régimen.
 * Fuente: pilot.py:RegimeDetector.update() — payload del retorno.
 * No audité TODOS los campos de regime_event_dict; se mantienen como
 * `unknown` salvo los que vimos consumidos.
 */
export interface RegimeInfo {
  readonly event?: RegimeEvent;
  readonly [key: string]: unknown;        // escape: no audité todos los campos
}

/**
 * Componentes del Table Quality Index.
 * Fuente: pilot.py:_compute_tqi() y state_routes.py:374-380.
 */
export interface TQIComponents {
  readonly stability: number;
  readonly performance: number;
  readonly risk: number;
  readonly coherence: number;
}

/**
 * Table Quality Index.
 * Fuente: pilot.py:_compute_tqi() y get_current_tqi() default (1613-1625).
 */
export interface TQI {
  readonly score: number;                 // 0–100
  readonly label: string;                 // p.ej. 'MESA NEUTRAL'
  readonly color: string;                 // hex
  readonly advisory: string;
  readonly components: TQIComponents;
  readonly trend: TQITrend;
  readonly trend_delta: number;
}

/**
 * El veredicto completo del Pilot.
 * Fuente: pilot.py:_build_verdict() — return result.
 *
 * Este es el objeto que el frontend lee como `godBet.last_verdict`. Se
 * EXPORTA tal cual desde state_routes.py:333-342 (sin transformación,
 * con fallback STAND_DOWN si pilot.raw["last_verdict"] está vacío).
 */
export interface PilotVerdict {
  readonly verdict: VerdictType;
  readonly ccs: number;                   // [0,1]
  readonly ccs_pct: number;               // 0–100
  readonly pick_bet: PickBet | null;
  readonly all_suggestions: readonly AllSuggestionEntry[];
  readonly op_state: OpState;
  readonly regime_event: RegimeEvent;
  readonly regime_info: RegimeInfo;
  readonly opinion: string;
  readonly session_stats: SessionStats;
  readonly pro_mode: ProModeState;
  readonly god_filter: GodFilterState;
  readonly operator_override: OperatorOverrideInVerdict;
  readonly n_spins: number;
  readonly tqi: TQI | null;
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. MOTOR / DECISION / ENGINE PAYLOAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una entrada individual de `bet_advice`.
 * Fuente:
 *   • pilot.py:MotorReader.get_active_suggestions() — campos canónicos.
 *   • state_routes.py:261-273 — campos extras consumidos (vector, selection,
 *     top_probability, action).
 *
 * NOTA: el shape del motor admite varios aliases para el mismo concepto
 * (`status` ↔ `action`, `pick` ↔ `vector` ↔ `selection`, `p` ↔
 * `top_probability`). Esos aliases NO los inventamos en el frontend —
 * vienen así desde el motor. Se documentan todos como opcionales.
 */
export interface BetAdviceEntry {
  readonly status?: BetStatus;
  readonly action?: BetStatus;            // alias de status (compat motor)
  readonly label?: string;
  readonly pick?: PickValue;
  readonly vector?: PickValue;            // alias de pick
  readonly selection?: PickValue;         // alias de pick
  readonly p?: number;                    // probabilidad del motor
  readonly top_probability?: number;      // alias de p (compat motor)
  readonly edge?: number;
  readonly conf_score?: number;
  readonly reason?: string;
  // no auditado: el motor puede agregar otros campos contextuales.
  readonly [key: string]: unknown;
}

/**
 * El diccionario completo de bet_advice. Por contrato del motor cada
 * categoría puede estar ausente; el código del Pilot ya maneja ausencias.
 */
export type BetAdvice = Readonly<Partial<Record<BetKey, BetAdviceEntry>>>;

/**
 * Mesa-score (radar) — lo que MotorReader.get_radar lee.
 * Fuente: pilot.py:259-280 y 322-336.
 * Hay 4 aliases para el mismo concepto. Todos opcionales.
 */
export interface MesaScore {
  readonly score10?: number;              // /10 (canónico)
  readonly score?: number;                // /100 (alias)
  readonly score100?: number;             // /100 (alias)
  readonly radar10?: number;              // /10 (alias)
  readonly radar?: number;
  readonly optimal_radar?: number;
  readonly entropy_rel?: number;          // [0,1] — alias en get_entropy_norm
  readonly [key: string]: unknown;
}

/**
 * Info de caos / entropía.
 * Fuente: pilot.py:339-358 y state_routes.py:177-180.
 */
export interface ChaosInfo {
  readonly entropy_norm?: number;
  readonly active?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Estado de drift.
 * Fuente: pilot.py:361-377 y state_routes.py:240-254.
 */
export interface DriftState {
  readonly level?: number;
  readonly drift_level?: number;
  readonly value?: number;
  readonly [key: string]: unknown;
}

/**
 * Info del wheel-expert.
 * Fuente: pilot.py:331-334 y state_routes.py:186-188 — solo se lee
 * sector_scores. El resto se preserva como unknown.
 */
export interface WheelExpertInfo {
  readonly sector_scores?: Readonly<Record<string, number>>;
  readonly [key: string]: unknown;
}

/**
 * Bloque guardian_pause (causa fuerza WAIT del guardián).
 * Fuente: processor.py:546-549.
 */
export interface GuardianPause {
  readonly enabled?: boolean;
  readonly [key: string]: unknown;
}

/**
 * La `decision` del motor. Engloba bet_advice + métricas contextuales.
 * Fuente: agregada de pilot.py:MotorReader.* + state_routes.py + processor.py.
 *
 * Campos con escape `[key: string]: unknown` para todo lo que el motor
 * añade (engine.py + helpers no auditados). El backend NUNCA va a quitar
 * un campo conocido sin que el contrato cambie.
 */
export interface EngineDecision {
  readonly bet_advice?: BetAdvice;
  readonly mesa_score?: MesaScore;
  readonly chaos_info?: ChaosInfo;
  readonly drift_state?: DriftState;
  readonly drift?: DriftState;            // alias
  readonly _hud_cond_state?: string;
  readonly _hud_table_entropy?: number;
  readonly _sanctioned_categories?: readonly string[];
  readonly _god_category_stats?: Readonly<Record<string, {
    readonly wins?: number;
    readonly losses?: number;
    readonly hit_rate?: number;
  }>>;
  readonly _wheel_expert_info?: WheelExpertInfo;
  readonly operational_state?: string | { readonly level?: string; readonly name?: string; readonly state?: string };
  readonly op_state?: string;
  readonly state?: string;
  readonly table_alert?: string | { readonly level?: string; readonly name?: string; readonly state?: string };
  readonly final_action?: string;
  readonly action?: string;
  readonly primary_status?: string;
  readonly primary?: { readonly status?: string; readonly action?: string; readonly [k: string]: unknown };
  /**
   * Apuesta principal del MOTOR (gate de final_action), distinta de
   * `pick_bet` del Pilot. Estructura ampliada según consumo real en
   * HUDTopBar.tsx (campos de confianza: confidence/conf/p/prob/score)
   * y WarTerminal.tsx (label/pick).
   * Fuente: processor.py:468-470 lee `pick`/`numbers`; el resto de
   * campos vienen del motor (engine.py — no auditado al detalle,
   * pero el consumo en el frontend lo confirma).
   */
  readonly primary_bet?: {
    readonly bet_key?: BetKey | string;
    readonly label?: string;
    readonly type?: string;
    readonly pick?: PickValue;
    readonly numbers?: readonly number[];
    readonly status?: string;
    readonly action?: string;
    readonly confidence?: number;
    readonly conf?: number;
    readonly p?: number;
    readonly prob?: number;
    readonly score?: number;
  };
  readonly guardian_pause?: GuardianPause;
  // no auditado: cualquier otro campo añadido por engine.py
  readonly [key: string]: unknown;
}

/**
 * Top-level payload generado por `_ensure_last_suggestion_current`.
 * Wrapper que envuelve a la decisión + metadata. Lo que el state_routes
 * pasa al frontend como `payload`.
 *
 * Fuente: processor.py:78 import _ensure_last_suggestion_current y
 * suggestion.py (no auditado al detalle). Sabemos por uso que tiene al
 * menos `decision`.
 */
export interface EnginePayload {
  readonly decision?: EngineDecision;
  readonly suggestion_analysis?: Readonly<Record<string, unknown>>;
  readonly snapshot_spins_count?: number;
  // no auditado: el wrapper completo del payload (timestamps, IDs, etc.)
  readonly [key: string]: unknown;
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. STATE SNAPSHOT / SLICES DEL /api/state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bankroll calculado en state_routes.py:85-105.
 */
export interface Bankroll {
  readonly current: number;
  readonly initial: number;
  readonly pnl: number;
  readonly pnl_pct: number;
}

/**
 * Bloque sequence en /api/state — state_routes.py:453-457.
 */
export interface SequenceInfo {
  readonly spins: readonly number[];
  readonly count: number;
  readonly last: number | null;
}

/**
 * Stats GOD acumuladas (espejo de pilot.raw bets_*).
 * Fuente: state_routes.py:375-381.
 *
 * `avg_errors` SEMÁNTICAMENTE es bets_misses/bets_emitted (tasa, no
 * promedio). El nombre es heredado del backend.
 */
export interface GodStats {
  readonly wins: number;
  readonly losses: number;
  readonly avg_errors: number;
  readonly consec_errors: number;
  readonly max_consec_errors: number;
}

/**
 * Una sugerencia individual armada por state_routes (scoring custom
 * paralelo al del Pilot — ver fase 3 del audit).
 * Fuente: state_routes.py:284-288.
 */
export interface ActiveBet {
  readonly bet_key: BetKey;
  readonly pick_pretty: string;
  readonly conf_pct: number;              // 0–100
}

/**
 * Bloque interno _hud_computed en state_routes.py:199.
 */
export interface HudComputed {
  readonly state: HudCondState;
  readonly cond: number;                  // [0,1]
}

/**
 * Capital allocation block — state_routes.py:466-473.
 */
export interface StakeSuggestion {
  readonly amount: number;
  readonly level: 'LOCKED' | 'WAIT' | '½x' | '1x' | '2x' | '3x' | string;
  readonly mult: number;
}

export interface CapitalAllocation {
  readonly stake_base: number;
  readonly thrs_low: number;
  readonly thrs_high: number;
  readonly stakes_sug: Readonly<Record<string, StakeSuggestion>>;
  readonly total_exposure: number;
  readonly exp_pct: number;
}

/**
 * Table-health block — state_routes.py:439-444.
 */
export interface TableHealth {
  readonly status: 'CONGRUENTE' | 'OBSERVAR' | 'DESVÍO' | 'CALIBRANDO' | string;
  readonly score: number;                 // 0–100
  readonly hit_rate: number;              // 0–100
  readonly trend: readonly number[];
  readonly color: 'green' | 'orange' | 'red' | 'gray' | string;
  readonly msg: string;
}

/**
 * Bloque _debug del god_bet (solo diagnóstico).
 * Fuente: state_routes.py:384-391.
 */
export interface GodBetDebug {
  readonly hud_cond: HudCondState;
  readonly score10: number;
  readonly table_entropy: number;
  readonly top_ccs: number;
  readonly table_health: number;
  readonly failed: readonly string[];
}

/**
 * God-bet block: lo que el frontend lee como `godBet`.
 * Fuente: state_routes.py:365-392.
 *
 * IMPORTANTE: `god_buckets` ESTÁ pero por hallazgo de la sesión 22/05 no
 * debe usarse para el panel CONFIANZA (usa conf_score del motor ≈100%).
 * Para CONFIANZA, usar `ccs_buckets`. Se mantiene en el tipo por
 * compatibilidad — su deprecación es trabajo de la fase 3 del audit.
 */
export interface GodBetBlock {
  readonly active: boolean;
  readonly cond_state: HudCondState;
  readonly radar_score: number;           // 0–10
  readonly counters_god: CountersMap;
  readonly god_buckets: Readonly<Record<string, BucketEntry>>;  // legacy
  readonly level_buckets: LevelBuckets;
  readonly ccs_buckets: CCSBuckets;
  readonly active_bets: readonly ActiveBet[];
  readonly failed_reasons: readonly string[];
  readonly god_stats: GodStats;
  readonly last_verdict: PilotVerdict;
  readonly _debug?: GodBetDebug;          // opcional: solo cuando viene del backend
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. USUARIO / AUTH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata mínima del usuario en el snapshot de estado.
 * Fuente: state_routes.py:447-451.
 *
 * `plan` se mantiene como string (no enum) porque el backend lo trata
 * como case-insensitive y admite nuevos planes sin migración del frontend.
 */
export interface UserMeta {
  readonly user_id: string;
  readonly plan: string;                  // 'trial' | 'pro' | 'admin' | ...
  readonly spins_used_total: number;
  readonly spins_remaining: number;
}

/**
 * Info completa del usuario — /api/me.
 * Fuente: auth.py:get_user_info() (no auditado al detalle en esta sesión,
 * pero el shape proviene del api.ts original verificado).
 */
export interface UserInfo {
  readonly username: string;
  readonly email: string;
  readonly plan: string;
  readonly plan_name: string;
  readonly plan_expires: string | null;
  readonly status: string;
  readonly subscription_active: boolean;
  readonly spins_used_total: number;
  readonly spins_remaining: number;
}

/**
 * Response de POST /api/login.
 * Fuente: api_v2/auth_routes.py (shape verbatim del legacy api.ts).
 */
export interface LoginResponse {
  readonly success: boolean;
  readonly username: string;
  readonly plan: string;
  readonly status: string;
  readonly message: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// 8. RESPONSES DE TOP-LEVEL (lo que cada endpoint devuelve)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response completo de GET /api/state.
 * Fuente: state_routes.py:446-480 (el dict del return _deep_jsonable).
 *
 * Este es el snapshot maestro consumido por el hook useGameState().
 */
export interface StateSnapshot {
  readonly meta: UserMeta;
  readonly sequence: SequenceInfo;
  readonly bankroll: Bankroll;
  readonly counters: CountersMap;
  readonly counters_god: CountersMap;
  readonly category_sanctions: Readonly<Record<string, unknown>>;
  readonly consec_losses: number;
  readonly drift_active: boolean;
  readonly drift_level: number;
  readonly payload: EnginePayload | null;
  readonly capital_allocation: CapitalAllocation;
  readonly god_bet: GodBetBlock;
  readonly hud_computed: HudComputed;
  readonly wheel_info: WheelExpertInfo;
  readonly error_hist: Readonly<Record<string, unknown>>;
  readonly ledger: readonly Readonly<Record<string, unknown>>[];
  readonly table_health: TableHealth;
}

/**
 * Response de POST /api/spin.
 * Fuente: spin_routes.py:48-55 (Pydantic SpinResponse).
 *
 * NOTA: `state` aquí es el `sess.to_dict()` SERIALIZADO completo, no el
 * snapshot enriquecido de /api/state. El frontend en práctica ignora este
 * `state` y re-invalida la query de ['state'] para hacer un nuevo GET
 * (ver useGameState.ts:onSuccess). Lo tipamos como `unknown`-bag para
 * forzar al consumidor a usar /api/state como fuente de verdad.
 */
export interface SpinResponse {
  readonly success: boolean;
  readonly spin: number;
  readonly spin_index: number;
  readonly spins_total: number;
  readonly spins_remaining: number;
  readonly state: Readonly<Record<string, unknown>>;
  readonly error?: string | null;
}

/**
 * Response de GET /api/session/state — state_routes.py:42-49.
 * Es el state crudo del session_manager (mucho más amplio que el
 * snapshot enriquecido). Tipado como bag de unknown.
 */
export interface SessionStateResponse {
  readonly user_id: string;
  readonly state: Readonly<Record<string, unknown>>;
}

/**
 * Response de POST /api/session/reset — state_routes.py:52-62.
 */
export interface ResetSessionResponse {
  readonly success: boolean;
  readonly user_id: string;
  readonly state: Readonly<Record<string, unknown>>;
}

/**
 * Response de GET /api/sequence — state_routes.py:483-498.
 */
export interface SequenceResponse {
  readonly total: number;
  readonly returned: number;
  readonly spins: readonly number[];
}

/**
 * Estado de operator override que el FRONTEND envía al backend.
 * Es el shape de la mutación local antes de POSTear.
 */
export interface OverrideState {
  readonly bet_key: BetKey;
  readonly pick: PickValue;
}

/**
 * Body que se manda a POST /api/pilot/override.
 * Fuente: pilot_routes.py:OverrideRequest.
 */
export interface OverrideRequest {
  readonly bet_key: BetKey | string;      // backend valida case-insensitive
  readonly pick?: PickValue;
}

/**
 * Shape del objeto `override` devuelto por get_operator_override().
 * Fuente: pilot.py:1586-1598.
 */
export interface OperatorOverrideResponse {
  readonly active: boolean;
  readonly bet_key: BetKey | null;
  readonly pick: PickValue;
  readonly activated_at?: number | null;
  readonly count: number;
}

/**
 * Response de POST /api/pilot/override y POST /api/pilot/override/clear.
 * Fuente: pilot_routes.py:79-99 y 102-117.
 */
export interface OverrideMutationResponse {
  readonly success: boolean;
  readonly override: OperatorOverrideResponse;
}

/**
 * Response de GET /api/pilot/override.
 * Fuente: pilot_routes.py:120-128.
 */
export interface OverrideGetResponse {
  readonly override: OperatorOverrideResponse;
}

/**
 * Response de POST /api/pilot/reset.
 * Fuente: pilot_routes.py:130-150.
 */
export interface PilotResetResponse {
  readonly success: boolean;
  readonly message: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// 9. GUARDS / NARROWERS (opcionales — facilitan el uso en componentes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard: verifica si un valor es un BetKey válido.
 * Usar antes de indexar `bet_advice` con strings dinámicos.
 */
export function isBetKey(value: unknown): value is BetKey {
  return (
    value === 'color' ||
    value === 'paridad' ||
    value === 'rango' ||
    value === 'docenas' ||
    value === 'columnas' ||
    value === 'max_conf'
  );
}

/**
 * Type guard: verifica si el verdict tiene un pick_bet apostable.
 * Útil para colapsar el "TARGET LOCK" en el UI.
 */
export function hasPickBet(
  v: PilotVerdict | null | undefined
): v is PilotVerdict & { pick_bet: PickBet } {
  return !!v && v.verdict === 'GO' && v.pick_bet !== null;
}
