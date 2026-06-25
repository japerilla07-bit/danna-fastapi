"""
danna_core.processor
=====================
La función principal del motor: run_spin_processing.

Extraído de app.py (migración Sesión B2) — la lógica es IDÉNTICA.
Cambios respecto al original:
  - Recibe `state` como primer parámetro (st.session_state o UserSession)
  - Recibe `engine_instance` como keyword-only
  - Recibe `on_rerun` como callback opcional (en lugar de st.rerun)
  - Recibe `auth_enabled` y `evals_log_path` como params (en lugar de globales)
  - st.error(...) -> _log_error(...)  (solo loguea, no muestra UI)
  - _st_rerun() -> _emit_rerun(on_rerun)  (callback opcional)

Cómo se usa:
  Desde Streamlit (app.py):
    run_spin_processing(
        st.session_state, spin, notes,
        engine_instance=engine_instance,
        on_rerun=_st_rerun,
        auth_enabled=_AUTH_ENABLED,
        evals_log_path=EVALS_LOG_PATH,
    )

  Desde FastAPI (futuro):
    run_spin_processing(
        user_session, spin, notes,
        engine_instance=user_engine_instance,
        on_rerun=None,  # no-op
        auth_enabled=True,
        evals_log_path=None,  # usa default
    )
"""

import os
import json
import copy
import time
import logging
from datetime import datetime, timezone

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

# Motor (mismo módulo que usa app.py)
import engine as engine_module

# Lógica extraída en Sesiones A y B1
from danna_core.helpers import (
    _safe_list_like, len_safe_list_like, _safe_int, _safe_float,
    _safe_text, _coalesce_none, _deep_jsonable, _first_present, _finite,
)
from danna_core.evaluation import (
    _lb_is_hit, _lb_payout_multiplier, _guardian_meta_from_decision,
    _guardian_col_meta_from_decision, _eval_hits_from_payload,
    _extract_eval_hit, _eval_primary_hit, _norm_pick,
    _top_pick_from_analysis, _get_top_from_analysis, _get_top2_group3_from_analysis,
)
from danna_core.suggestion import (
    _build_bet_advice, _choose_primary_bet, _compute_coherence,
    _derive_implied_from_numbers, _baseline_for_bet,
)
from danna_core.bankroll import _mb_compute_settlement, _mb_get_advice
from danna_core.roulette import (
    _color_of_spin, _paridad_of_spin, _rango_of_spin,
    _docena_bucket_of_spin, _docena_bucket_from_pick,
    _col_bucket_of_spin, _col_bucket_from_pick,
    _mb_color_of, _mb_parity_of, _mb_range_of, _mb_dozen_of, _mb_column_of,
)
from danna_core.session_io import _append_jsonl, _eh_keys_for_update
from danna_core.processor_helpers import (
    _get_session_id, _ensure_counters_schema, _mb_state_init,
    _mb_try_auto_liquidate, _mb_apply_settlement,
    sync_engine_models_from_session, _maybe_train_lstm,
    _ensure_error_hist_schema, _update_error_hist_from_counters,
    _lb_settle_open_bets, _ensure_last_suggestion_current,
    _ui_patch_max_conf_status, _auto_settle_bankroll_from_pre_payload,
    _compute_suggestion_payload,
)

# Logger del core
_logger = logging.getLogger("danna_core")

# Path por defecto si no se pasa evals_log_path
_DATA_DIR = os.environ.get("DANNA_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))
_LOG_DIR = os.path.join(_DATA_DIR, "logs")
_DEFAULT_EVALS_LOG_PATH = os.path.join(_LOG_DIR, "evals.jsonl")

# ── Pilot backend (igual que en app.py) ────────────────────────────
# El módulo pilot.py se conserva para: progresión L1→L4, sanciones,
# CCS buckets, level buckets, TQI.
try:
    import pilot as _pilot
    _PILOT_AVAILABLE = True
except Exception as _pilot_import_err:
    _pilot = None
    _PILOT_AVAILABLE = False
    _logger.warning(f"Pilot backend no disponible: {_pilot_import_err}")


# ── Helpers internos ──────────────────────────────────────────────
def _log_error(msg):
    """Reemplazo de st.error() — en el core solo logueamos."""
    _logger.error(msg)


def _emit_rerun(on_rerun):
    """Llama al callback de rerun si existe; si no, no-op."""
    if callable(on_rerun):
        try:
            on_rerun()
        except Exception:
            pass


def _compute_hud_data(decision: dict, state: dict) -> dict:
    """Computa el dict hud_data {state, cond} que is_god_active() espera.

    Replica EXACTAMENTE la fórmula de state_routes._compute_cond:
      cond = mesa_norm*0.40 + entropy_score*0.25 + consec_score*0.25 + wheel_score*0.10
      state ∈ {optimal, caution, abort} según cond y chaos.

    Antes este valor solo se computaba dentro del loop de counters_god
    (cuando había status=BET) y no se persistía. Resultado: las llamadas
    a is_god_active() recibían hud_data={} → fallaban siempre con
    HUD=— y Entropy=0/100 → god_target y _god_active_now siempre False.

    Este helper se llama UNA vez al inicio de run_spin_processing y
    persiste en state["hud_computed"] para todas las lecturas posteriores
    (god_target block, POST-SPIN GOD-STRICT) e idéntico al cómputo que
    hace state_routes.py al servir GET /api/state.
    """
    try:
        d = decision or {}
        ms = d.get("mesa_score") or {}
        score10 = float(ms.get("score10", 5) or 5)
        mesa_norm = score10 / 10.0

        chaos_info = d.get("chaos_info") or {}
        entropy_norm = float(chaos_info.get("entropy_norm", 0.5) or 0.5)
        chaos_raw = bool(chaos_info.get("active", False))
        entropy_score = 1.0 - max(0.0, min(1.0, entropy_norm))

        pilot_st = (state or {}).get("pilot") or {}
        consec = int(pilot_st.get("pilot_consec_errors", 0)
                     or (state or {}).get("consec_losses", 0) or 0)
        consec_score = 1.0 - max(0.0, min(1.0, consec / 7.0))
        chaos_active = chaos_raw and consec >= 4

        wi = (state or {}).get("_wheel_expert_info") or {}
        wscores = wi.get("sector_scores", {}) or {}
        top_wheel = max(wscores.values()) if wscores else 0.25
        wheel_score = max(0.0, min(1.0, (top_wheel - 0.25) / 0.35))

        cond = (mesa_norm * 0.40 + entropy_score * 0.25
                + consec_score * 0.25 + wheel_score * 0.10)
        cond = max(0.0, min(1.0, cond))

        if chaos_active or consec >= 6:
            cond_state = "abort"
        elif cond >= 0.65:
            cond_state = "optimal"
        elif cond >= 0.40:
            cond_state = "caution"
        else:
            cond_state = "abort"

        return {"state": cond_state, "cond": float(cond)}
    except Exception:
        return {"state": "caution", "cond": 0.40}


def run_spin_processing(state, spin: int, notes: str, *, engine_instance=None, on_rerun=None, auth_enabled=False, evals_log_path=None):
    """Procesa un giro de la ruleta. Lógica idéntica al original de app.py."""
    # Default para evals_log_path (igual que EVALS_LOG_PATH del módulo original)
    if evals_log_path is None:
        evals_log_path = _DEFAULT_EVALS_LOG_PATH
    # --- SPIN COUNTER: check if user has spins remaining (Trial limit) ---
    if auth_enabled:
        try:
            _au = state.get("_auth_user", {})
            if isinstance(_au, dict) and _au.get("username"):
                from auth import get_spins_remaining, increment_spin, get_user_info
                _fresh = get_user_info(_au["username"])
                if _fresh:
                    _sr = get_spins_remaining(_fresh)
                    if _sr.get("remaining", 0) <= 0:
                        _log_error("Has agotado tus spins disponibles. Actualiza tu plan para continuar.")
                        return
                    # Increment spin counter
                    increment_spin(_au["username"])
                    state["_auth_spins_remaining"] = max(0, _sr.get("remaining", 0) - 1)
                    # Refresh user in session
                    state["_auth_user"] = _fresh
        except Exception:
            pass

    _ensure_counters_schema(state)
    # --- (E1–E7) snapshot previo para histogramas (solo UI) ---
    prev_counters_for_hist = copy.deepcopy(state.get('counters', {}))
    _ensure_error_hist_schema(state, state.get('counters', {}))


    # ⏱️ Micro-profiler (UI): mide tiempos sin alterar lógica
    perf_on = bool(state.get("ui_perf_enabled", False))
    t0_total = time.perf_counter()
    t_eval_ms = 0.0
    t_settle_ms = 0.0
    t_reg_ms = 0.0
    t_sync_ms = 0.0

    # --- local counter update (blindado, no depende del engine)
    def _update_counters_local(counters: dict, bet_key: str, hit):
        """Actualiza contadores oficiales (misma semántica que siempre).
        Nota: la regla de producto 'contar solo en BET' se aplica fuera de esta función.
        """
        if hit is None:
            return counters
        if not isinstance(counters, dict):
            counters = {}
        base = {"wins": 0, "losses": 0, "consec_errors": 0, "max_consec_errors": 0}
        if bet_key not in counters or not isinstance(counters.get(bet_key), dict):
            counters[bet_key] = dict(base)
        else:
            for kk, vv in base.items():
                counters[bet_key].setdefault(kk, vv)

        c = counters[bet_key]
        if bool(hit) is True:
            c["wins"] = int(c.get("wins", 0)) + 1
            c["consec_errors"] = 0
        else:
            c["losses"] = int(c.get("losses", 0)) + 1
            c["consec_errors"] = int(c.get("consec_errors", 0)) + 1
            c["max_consec_errors"] = max(int(c.get("max_consec_errors", 0)), int(c.get("consec_errors", 0)))
        counters[bet_key] = c
        return counters

    def _update_shadow_counters_local(shadow: dict, bet_key: str, hit):
        """UI-only shadow counters (no afectan counters oficiales).
        Útil para ver WinRate en PROBE/WAIT (ej: Números / Max Conf) sin romper regla 'solo BET'.
        """
        if hit is None:
            return shadow
        if not isinstance(shadow, dict):
            shadow = {}
        base = {"wins": 0, "losses": 0, "consec_errors": 0, "max_consec_errors": 0}
        if bet_key not in shadow or not isinstance(shadow.get(bet_key), dict):
            shadow[bet_key] = dict(base)
        else:
            for kk, vv in base.items():
                shadow[bet_key].setdefault(kk, vv)

        c = shadow[bet_key]
        if bool(hit) is True:
            c["wins"] = int(c.get("wins", 0)) + 1
            c["consec_errors"] = 0
        else:
            c["losses"] = int(c.get("losses", 0)) + 1
            c["consec_errors"] = int(c.get("consec_errors", 0)) + 1
            c["max_consec_errors"] = max(int(c.get("max_consec_errors", 0)), int(c.get("consec_errors", 0)))
        shadow[bet_key] = c
        return shadow

    guardian_core = getattr(engine_module, "_GUARDIAN_CORE", None)
    t_before = getattr(guardian_core, "t", None) if guardian_core is not None else None

    previous_spins = state.get("spins", [])[:]
    previous_len = len(previous_spins)
    last_suggestion = state.get("last_suggestion")

    # --- Gating: NO crear sugerencias ni contar hits antes del umbral mínimo (warmup).
    #     Esto evita: (1) contadores moviéndose sin sugerencias visibles,
    #                (2) evaluación con payloads viejos / snapshot incorrecto,
    #                (3) falsos 'Error/Acierto' durante 'Esperando N spins'.
    min_start = _safe_int(state.get("min_start", 30), 30)
    warmup = int(previous_len) < int(min_start)

    # ✅ Asegurar sugerencia pre-spin (snapshot == previous_len), incluso en warmup.
    # La evaluación (contadores oficiales) sigue bloqueada por warmup más abajo.
    try:
        _ls = _ensure_last_suggestion_current(state, engine_instance=engine_instance)
        last_suggestion = _ls if isinstance(_ls, dict) else state.get("last_suggestion")
    except Exception as e:
        _logger.error(f"No se pudo asegurar sugerencia pre-spin (snapshot={previous_len}): {e}")

    spv = state.get("spins")

    state["spins"] = _safe_list_like(spv)

    last_guardian_result = None
    guardian_pick = None
    guardian_edge = None

    last_guardian_col_result = None
    guardian_col_pick = None
    guardian_col_edge = None
    guardian_col_status = "N/A"

    # ✅ FIX: evitar UnboundLocalError si no se evalúa (snapshot mismatch / sin sugerencia)
    # Valores típicos esperados por la UI: BET/PROBE/WAIT. Usamos 'N/A' cuando no aplica.
    guardian_status = "N/A"

    # Recolecta motivos cuando una categoría NO es evaluable (hit=None)
    # Esto NO afecta el motor ni los contadores; solo auditoría/explicación.
    no_eval_reasons = {}

    # ✅ Evaluación SOLO si existe un payload pre-spin válido (snapshot exacto) y ya pasó warmup.
    #    Regla: si no hay snapshot_spins_count o no coincide con previous_len, NO evaluamos.
    snap_ok = False
    if isinstance(last_suggestion, dict):
        try:
            snap = last_suggestion.get("snapshot_spins_count", None)
            snap_ok = (snap is not None) and (int(snap) == int(previous_len))
        except Exception:
            snap_ok = False

    
    # ✅ Si ya pasó warmup pero NO hay payload pre-spin válido (snapshot mismatch / sin sugerencia),
    #    registramos el motivo en eval_log para que 'no marcó nada' sea auditable.
    if (not warmup) and (not snap_ok):
        try:
            snap_found = None
            if isinstance(last_suggestion, dict):
                snap_found = last_suggestion.get("snapshot_spins_count", None)
            reason = "NO_LAST_SUGGESTION" if not isinstance(last_suggestion, dict) else "SNAPSHOT_MISMATCH"
        except Exception:
            snap_found = None
            reason = "SNAPSHOT_MISMATCH"

        categories_eval = ["primary", "docenas", "columnas", "color", "paridad", "rango", "max_conf", "guardian_docena", "guardian_columna"]
        hits_used = {k: None for k in categories_eval}
        engine_hits = {k: None for k in categories_eval}
        no_eval_reasons.update({k: reason for k in categories_eval})

        try:
            eval_log = state.get("eval_log", [])
            if not isinstance(eval_log, list):
                eval_log = []
            eval_log.append({
                "spin_index": len(state.get("spins", [])),
                "spin": spin,
                "snapshot_spins_count": snap_found,
                "hits_used": hits_used,
                "no_eval_reasons": dict(no_eval_reasons),
                "engine_hits": engine_hits,
                "ts_utc": datetime.now(timezone.utc).isoformat(),
            })
            if len(eval_log) > 5000:
                eval_log = eval_log[-500:]
            state["eval_log"] = eval_log
            
            # Persistir evaluación (JSONL) - no rompe flujo
            try:
                _sid = _get_session_id(state)
                _append_jsonl(evals_log_path, {
                    "type": "evaluation",
                    "ts_utc": datetime.now(timezone.utc).isoformat(),
                    "session_id": _sid,
                    "user_id": str(state.get("user_id", "default")),
                    "table_id": str(state.get("table_id", "mesa_1")),
                    "spin": spin,
                    "prev_snapshot_spins_count": (last_suggestion.get("snapshot_spins_count") if isinstance(last_suggestion, dict) else None),
                    "hits_used": hits_used,
                    "engine_hits": engine_hits,
                    "metrics_bet_only": bool(state.get("metrics_bet_only", True)),
                })
            except Exception:
                pass
        except Exception:
            pass

        # Para feedback inmediato en UI (sin contar como acierto/error)
        state["last_guardian_no_eval"] = {
            "spin": spin,
            "reason": reason,
            "snapshot_expected": int(previous_len),
            "snapshot_found": snap_found,
        }

    if (not warmup) and snap_ok:

        try:
            _t0 = time.perf_counter()
            eval_results = engine_module.evaluate_spin(last_suggestion, spin)
            t_eval_ms = (time.perf_counter() - _t0) * 1000.0
            if not isinstance(eval_results, dict):
                eval_results = {}
        except Exception as e:
            _logger.error(f"Error en evaluate_spin: {e}")
            eval_results = {}

        counters = state.get("counters", {}) or {}

        # FALLBACK hits desde payload si el engine no los trae
        try:
            fallback_hits = _eval_hits_from_payload(last_suggestion, spin) or {}
        except Exception:
            fallback_hits = {}

        # guardian pick/edge desde decision
        try:
            decision_prev = last_suggestion.get("decision", {}) if isinstance(last_suggestion, dict) else {}
            guardian_status, guardian_pick, guardian_edge = _guardian_meta_from_decision(
                decision_prev if isinstance(decision_prev, dict) else {}
            )

            guardian_col_status, guardian_col_pick, guardian_col_edge = _guardian_col_meta_from_decision(
                decision_prev if isinstance(decision_prev, dict) else {}
            )            # Política: el Guardián SIEMPRE está activo (evalúa y cuenta siempre).
            try:
                _g_stt = str(guardian_status).upper().strip() if guardian_status is not None else ""
                _g_act = str((decision_prev or {}).get("final_action", (decision_prev or {}).get("action", "OBSERVE"))).upper().strip()
            except Exception:
                _g_stt, _g_act = "", "OBSERVE"
            guardian_active = True  # siempre activo

            if guardian_pick is not None:
                b_pick = _docena_bucket_from_pick(guardian_pick)
                b_spin = _docena_bucket_of_spin(spin)
                if b_pick is not None and b_spin is not None:
                    fallback_hits["guardian_docena"] = (b_pick == b_spin)
                # Guardian columna: comparar columna pick vs columna outcome
                try:
                    gcol_status, gcol_pick, gcol_edge = _guardian_col_meta_from_decision(decision_prev if isinstance(decision_prev, dict) else {})
                    col_pick = _col_bucket_from_pick(gcol_pick)
                    col_spin = _col_bucket_of_spin(spin)
                    if col_pick is not None and col_spin is not None:
                        fallback_hits["guardian_columna"] = (col_pick == col_spin)
                except Exception:
                    pass
        except Exception:
            pass

        def _hit_with_fallback(bet_key: str, return_both: bool = False):
            """Determina el hit/miss usando:
              - engine_hit: lo que devuelve engine.evaluate_spin
              - manual: cálculo de fallback (UI) para docenas/columnas/guardian_docena
              - ui_hit: lo que se usará para contadores/visualización en la app

            Si return_both=True, devuelve (engine_hit, ui_hit).
            Si return_both=False, devuelve solo ui_hit (comportamiento actual de la UI).
            """
            # 1) Valor base del engine (puede ser True/False/None)
            engine_hit = _extract_eval_hit(eval_results, bet_key)

            # 2) Fallback manual según categoría
            manual = None

            if bet_key in ("docenas", "columnas", "guardian_docena", "guardian_columna"):
                manual = fallback_hits.get(bet_key, None)

            # 3) Si el engine no tiene opinión, usamos manual (si existe)
            if engine_hit is None:
                ui_hit = manual if manual is not None else fallback_hits.get(bet_key, None)
            else:
                # 4) Engine sí opina. Para la UI mantenemos el OR asimétrico:
                #    si engine_hit es False pero manual es True, priorizar True.
                if manual is not None and (engine_hit is False) and (manual is True):
                    ui_hit = True
                else:
                    ui_hit = engine_hit

            # ✅ Guardián: empezar a contar aciertos/errores a partir del spin N configurado.
            if bet_key in ("guardian_docena", "guardian_columna"):
                start_n = int(state.get("guardian_eval_start_spin", 0) or 0)
                if int(previous_len) < start_n:
                    if return_both:
                        return engine_hit, None
                    return None

            # 5) Si NO se pudo evaluar (ui_hit=None), NO forzamos 'False' (eso inventa errores).
            #    En su lugar, registramos un motivo para auditoría/diagnóstico.
            if ui_hit is None:
                suggested_pick = None
                try:
                    sa_local = (last_suggestion or {}).get("suggestion_analysis", {}) or {}
                    decision_local = (last_suggestion or {}).get("decision", {}) or {}

                    if bet_key in ("docenas", "columnas", "color", "paridad", "rango", "max_conf"):
                        suggested_pick = _top_pick_from_analysis(sa_local, bet_key)
                    elif bet_key in ("guardian_docena", "guardian_columna"):
                        # Guardián: preferir pick estructurado del decision; fallback a suggestion_analysis
                        g = None
                        try:
                            if isinstance(decision_local, dict):
                                if bet_key == "guardian_columna":
                                    g = decision_local.get("guardian_columna")
                                    if not isinstance(g, dict):
                                        g = decision_local.get("guardian_columna_state")
                                else:
                                    g = decision_local.get("guardian")
                                    if not isinstance(g, dict):
                                        g = decision_local.get("guardian_state")
                        except Exception:
                            g = None


                        if isinstance(g, dict):
                            suggested_pick = (
                                g.get("pick") or g.get("docena") or g.get("selection") or g.get("label")
                            )
                        if suggested_pick is None and isinstance(decision_local, dict):
                            suggested_pick = (
                                decision_local.get("guardian_suggested")
                                or decision_local.get("apuesta_guardian")
                                or decision_local.get("guardian_docena")
                            )
                        if suggested_pick is None:
                            try:
                                gd = sa_local.get("guardian_docena", {}) if isinstance(sa_local, dict) else {}
                            except Exception:
                                gd = {}
                            if isinstance(gd, dict):
                                suggested_pick = (
                                    gd.get("top_suggestion")
                                    or gd.get("pick")
                                    or gd.get("suggested")
                                    or gd.get("selection")
                                    or gd.get("docena")
                                )
                    elif bet_key == "primary":
                        pb = decision_local.get("primary_bet", {}) if isinstance(decision_local, dict) else {}
                        if isinstance(pb, dict) and pb:
                            suggested_pick = pb.get("pick", pb.get("numbers", None))
                except Exception:
                    suggested_pick = None

                # Motivo base: no hay pick o no se pudo calcular hit contra el spin actual
                no_eval_reasons[bet_key] = "NO_PICK" if suggested_pick is None else "NO_EVAL"

            # 6) Opcionalmente, devolver ambas vistas
            if return_both:
                return engine_hit, ui_hit

            return ui_hit

        bet_keys = ["primary", "docenas", "columnas", "color", "paridad", "rango", "max_conf", "guardian_docena", "guardian_columna"]
        hits_used = {}
        engine_hits = {}
        # decision_local (scope): usado para filtrar métricas "solo BET" sin depender del cierre de _hit_with_fallback
        decision_local = {}
        try:
            if isinstance(last_suggestion, dict):
                _dl = last_suggestion.get("decision", None)
                if isinstance(_dl, dict):
                    decision_local = _dl
        except Exception:
            decision_local = {}

        # ★ FIX FASE 3 HOTFIX: persistir hud_computed para que is_god_active()
        # tenga input válido. Sin esto, el dict {state, cond} llegaba vacío y
        # las condiciones HUD y Entropy fallaban siempre, dejando god_target
        # en 0/0 y _god_active_now en False aunque el HUD visualmente fuera
        # OPTIMAL. Se computa UNA vez por spin, fuera del loop de bets, para
        # que esté disponible tanto en el god_target block como en el
        # POST-SPIN GOD-STRICT (paridad con state_routes.py).
        state["hud_computed"] = _compute_hud_data(decision_local, state)


        for bet_key in bet_keys:
            engine_hit, ui_hit = _hit_with_fallback(bet_key, return_both=True)
            hits_used[bet_key] = ui_hit
            engine_hits[bet_key] = engine_hit
            if ui_hit is None:
                continue

            # UI-only shadow: para max_conf, acumulamos desempeño aunque el status no sea BET,
            # sin tocar contadores oficiales (regla de producto se mantiene).
            if bet_key == "max_conf":
                try:
                    shadow_all = state.get("shadow_counters", {}) or {}
                    shadow_all = _update_shadow_counters_local(shadow_all, "max_conf", ui_hit)
                    state["shadow_counters"] = shadow_all
                except Exception:
                    pass
            # Regla de producto: contar acierto/error SOLO cuando el status final sea BET.
            # PROBE y WAIT no afectan contadores (aunque haya sugerencia).
            _status = "WAIT"
            if bet_key == "primary":
                # La Apuesta Principal no siempre viene dentro de bet_advice; se deriva del gate global
                # (final_action/action) y/o de campos específicos (primary_status/primary/primary_bet).
                _ps = str(decision_local.get("primary_status") or "").upper().strip()
                if (not _ps) and isinstance(decision_local.get("primary"), dict):
                    _ps = str(decision_local["primary"].get("status") or decision_local["primary"].get("action") or "").upper().strip()
                if (not _ps) and isinstance(decision_local.get("primary_bet"), dict):
                    _ps = str(decision_local["primary_bet"].get("status") or decision_local["primary_bet"].get("action") or "").upper().strip()
                # ✅ Fallback crítico: si el engine no expone primary_status, usamos el gate global.
                if not _ps:
                    _ps = str(decision_local.get("final_action") or decision_local.get("action") or "").upper().strip()

                if _ps in ("EXPLOIT", "BET"):
                    _status = "BET"
                elif _ps == "PROBE":
                    _status = "PROBE"
                else:
                    _status = "WAIT"
            else:
                _ad = decision_local.get("bet_advice", {})
                _entry = _ad.get(bet_key, {}) if isinstance(_ad, dict) else {}
                _status = str(_entry.get("status", _entry.get("action", "")) or "").upper().strip()
                if _status in ("EXPLOIT", "BET"):
                    _status = "BET"
                elif _status == "PROBE":
                    _status = "PROBE"
                elif _status in ("WAIT", "OBSERVE"):
                    _status = "WAIT"

            # Si el Guardián está en auto-pausa, forzamos WAIT SOLO para el Guardián.
            if bet_key in ("guardian_docena", "guardian"):
                _gp = decision_local.get("guardian_pause", {})
                if isinstance(_gp, dict) and _gp.get("enabled"):
                    _status = "WAIT"

            if _status != "BET":
                continue

            # ✅ FIX: actualización local única (no engine+local)
            counters = _update_counters_local(counters, bet_key, ui_hit)

            # ── GOD BET: contar por categoría cuando las condiciones están activas ──
            # Condiciones idénticas a app.py L7143:
            #   _god_cond == "optimal" AND mesa_score.score10 >= 7
            # Escribe en state["counters_god"] (separado de counters normales).
            try:
                # Calcular _cond_state inline (mismo cálculo que state_routes.py)
                # Pesos: mesa×0.40 + entropy×0.25 + consec×0.25 + wheel×0.10
                _ms_god = decision_local.get("mesa_score") if isinstance(decision_local, dict) else None
                if not isinstance(_ms_god, dict):
                    _ms_god = (last_suggestion or {}).get("decision", {}).get("mesa_score") or {}
                _s10_god = int(_ms_god.get("score10", 0) or 0) if isinstance(_ms_god, dict) else 0

                # Componentes para _cond_state
                _mesa_norm = _s10_god / 10.0
                _chaos = decision_local.get("chaos_info") if isinstance(decision_local, dict) else {}
                _ent_norm = float((_chaos or {}).get("entropy_norm", 0.5) or 0.5)
                _chaos_raw = bool((_chaos or {}).get("active", False))
                _ent_score = 1.0 - max(0.0, min(1.0, _ent_norm))

                _pilot_st = state.get("pilot") or {}
                _consec = int(_pilot_st.get("pilot_consec_errors", 0)
                              or state.get("consec_losses", 0) or 0)
                _consec_score = 1.0 - max(0.0, min(1.0, _consec / 7.0))
                _chaos_active = _chaos_raw and _consec >= 4

                _wi = state.get("_wheel_expert_info") or {}
                _wscores = (_wi.get("sector_scores", {}) or {})
                _top_wheel = max(_wscores.values()) if _wscores else 0.25
                _wheel_score = max(0.0, min(1.0, (_top_wheel - 0.25) / 0.35))

                _cond_val = (_mesa_norm * 0.40 + _ent_score * 0.25
                             + _consec_score * 0.25 + _wheel_score * 0.10)
                _cond_val = max(0.0, min(1.0, _cond_val))

                if _chaos_active or _consec >= 6:
                    _god_cond = "abort"
                elif _cond_val >= 0.65:
                    _god_cond = "optimal"
                elif _cond_val >= 0.40:
                    _god_cond = "caution"
                else:
                    _god_cond = "abort"

                # Guardar para que state_routes.py lo lea
                state["_cond_state"] = _god_cond
                # ★ FIX BUG SALDO: cachear _cond_val para que el bloque
                # PROGRESSION (líneas ~670+) pueda aplicar GOD-STRICT
                # condición #3 (Table Entropy ≥ 50/100).
                state["_cond_val_cache"] = float(_cond_val)

                _god_active = (_god_cond == "optimal" and _s10_god >= 7)

                try:
                    _logger.info(
                        f"[GOD-CHECK] bet={bet_key} hit={ui_hit} "
                        f"HUD={_god_cond} radar={_s10_god}/10 "
                        f"→ god_active={_god_active} "
                        f"({'CONTADO god_'+bet_key if _god_active else 'SKIP'})"
                    )
                except Exception:
                    pass

                if _god_active:
                    # ★ Escribir en counters_god SEPARADO (no en counters)
                    cg = state.setdefault("counters_god", {})
                    cg = _update_counters_local(cg, f"god_{bet_key}", ui_hit)
                    state["counters_god"] = cg

                    # Buckets CCS por categoría
                    try:
                        _ad_god = decision_local.get("bet_advice", {}) if isinstance(decision_local, dict) else {}
                        _entry_god = _ad_god.get(bet_key, {}) if isinstance(_ad_god, dict) else {}
                        _ccs_god = float(_entry_god.get("conf_score", 0.0) or 0.0)
                        _ccs_pct_god = _ccs_god * 100.0 if _ccs_god <= 1.0 else _ccs_god

                        if _ccs_pct_god < 70:
                            _bk_label = "<70"
                        elif _ccs_pct_god < 75:
                            _bk_label = "70-75"
                        elif _ccs_pct_god < 80:
                            _bk_label = "75-80"
                        elif _ccs_pct_god < 85:
                            _bk_label = "80-85"
                        elif _ccs_pct_god < 90:
                            _bk_label = "85-90"
                        else:
                            _bk_label = "90+"

                        _gb_root = state.setdefault("god_buckets", {})
                        _cat_buckets = _gb_root.setdefault(bet_key, {})
                        _b = _cat_buckets.setdefault(_bk_label, {"go_count": 0, "hits": 0})
                        _b["go_count"] = int(_b.get("go_count", 0)) + 1
                        if bool(ui_hit):
                            _b["hits"] = int(_b.get("hits", 0)) + 1
                    except Exception:
                        pass
            except Exception as _god_err:
                try:
                    _logger.warning(f"GOD tracking error: {_god_err}")
                except Exception:
                    pass

            # MEJORA 3: CUSUM monitor — observe BET result per category
            try:
                if bet_key != "primary":
                    _cusum_result = engine_module.cusum_observe(bet_key, bool(ui_hit))
                    if isinstance(_cusum_result, dict) and _cusum_result.get("alarm"):
                        _logger.warning(f"CUSUM ALARM: {bet_key} hit-rate shifted (S+={_cusum_result.get('S_pos',0):.2f} S-={_cusum_result.get('S_neg',0):.2f})")
            except Exception:
                pass

        state["counters"] = counters
        _update_error_hist_from_counters(state, prev_counters_for_hist, counters)
        last_guardian_result = hits_used.get("guardian_docena", None)

        # ════════════════════════════════════════════════════════════════
        # ★★★ CONTADOR TARGET LOCK (GOD) — dedicado y aislado ★★★
        # ────────────────────────────────────────────────────────────────
        # Cuenta SOLO el PICK que TARGET LOCK mostraba (la apuesta principal
        # del pilot = last_verdict.pick_bet.bet_key del giro anterior), y SOLO
        # cuando GOD estaba ACTIVO. Sin importar la categoría (docenas, color,
        # etc.): suma errores consecutivos cruzando categorías. Acierto resetea.
        #
        # Estructura en state["god_target"]:
        #   { wins, losses, consec_errors, max_consec_errors }
        #
        # No depende de counters_god (por categoría) ni de god_stats. Es un
        # contador propio que evalúa el ui_hit YA calculado por el loop para
        # la bet_key que el usuario vio en TARGET LOCK.
        try:
            _lv_prev = (state.get("pilot") or {}).get("last_verdict") or {}
            _pb_prev = _lv_prev.get("pick_bet") if isinstance(_lv_prev, dict) else None
            _target_bk = None
            if isinstance(_pb_prev, dict):
                _target_bk = str(_pb_prev.get("bet_key") or "").strip().lower() or None

            # Estado GOD del SPIN — usa is_god_active() (las 6 condiciones de
            # Streamlit: HUD, Radar, Entropy, TQI, CCS, Health). Antes solo
            # evaluaba HUD=OPTIMAL y Radar>=7, lo cual hacía que god_target
            # incrementara consec_errors bajo condiciones donde Streamlit no
            # contaría (Entropy/CCS/TQI/Health bajos) → "HUD se bloquea por
            # acumulación de errores" en la UI mientras god_active=false.
            if _PILOT_AVAILABLE:
                _hud_data_gt = state.get("hud_computed") or {}
                # FIX OVERRIDE: la estructura real del state guarda override_bet_key
                # como campo plano en pilot.raw, NO existe pilot.operator_override.
                # is_god_active() bypassea las 6 condiciones si recibe override=True.
                _override_gt = bool((state.get("pilot") or {}).get("override_bet_key"))
                _th_data_gt = state.get("_table_health") if isinstance(state.get("_table_health"), dict) else None
                _god_active_spin, _gt_failed = _pilot.is_god_active(
                    hud_data=_hud_data_gt,
                    decision=decision_local,
                    verdict=_lv_prev,
                    operator_override=_override_gt,
                    table_health=_th_data_gt,
                )
            else:
                # Fallback si el módulo pilot no carga (preserva criterio previo)
                _cond_now = str(state.get("_cond_state", "") or "").strip().lower()
                _ms_now = decision_local.get("mesa_score") if isinstance(decision_local, dict) else None
                if not isinstance(_ms_now, dict):
                    _ms_now = (last_suggestion or {}).get("decision", {}).get("mesa_score") or {}
                _s10_now = int(_ms_now.get("score10", 0) or 0) if isinstance(_ms_now, dict) else 0
                _god_active_spin = (_cond_now == "optimal" and _s10_now >= 7)

            # Solo contar si: GOD activo en este spin + hay una apuesta TARGET
            # + esa apuesta fue evaluable (ui_hit no es None).
            _target_hit = hits_used.get(_target_bk) if _target_bk else None
            if bool(_god_active_spin) and (_target_bk is not None) and (_target_hit is not None):
                _gt = state.setdefault("god_target", {
                    "wins": 0, "losses": 0,
                    "consec_errors": 0, "max_consec_errors": 0,
                })
                if bool(_target_hit):
                    _gt["wins"] = int(_gt.get("wins", 0)) + 1
                    _gt["consec_errors"] = 0
                else:
                    _gt["losses"] = int(_gt.get("losses", 0)) + 1
                    _gt["consec_errors"] = int(_gt.get("consec_errors", 0)) + 1
                    if _gt["consec_errors"] > int(_gt.get("max_consec_errors", 0)):
                        _gt["max_consec_errors"] = _gt["consec_errors"]
                state["god_target"] = _gt
        except Exception as _gt_err:
            try:
                _logger.warning(f"[GOD-TARGET] error: {_gt_err}")
            except Exception:
                pass

        # ════════════════════════════════════════════════════════════════
        # ★ PILOT EVALUATE — DELIBERADAMENTE NO VA AQUÍ.
        # En Streamlit (app.py L8156-8209), pilot.evaluate() corre UNA sola
        # vez al final del flujo del spin (después de append + record_outcome
        # + register_spin). El verdict producido queda en state["pilot"][
        # "last_verdict"] para que el SIGUIENTE spin lo use en record_outcome.
        # El POST-SPIN REGEN más abajo (~L1148) hace esa única evaluación.
        #
        # ANTES (bug): aquí existía un PRE-spin evaluate que sobreescribía
        # state["pilot"]["last_verdict"] ANTES de que record_outcome leyera
        # ese campo en la línea ~1025. Resultado: record_outcome recibía un
        # verdict fresco para ESTE spin en vez del verdict generado en el
        # spin anterior. Eso desincronizaba progresión, override release y
        # contadores. Eliminado en sincronización Fase 3 con Streamlit.
        # ════════════════════════════════════════════════════════════════

        # CUSUM state snapshot for UI
        try:
            state["_cusum_state"] = engine_module.cusum_state_all()
        except Exception:
            pass

        state["last_eval_debug"] = {
            "prev_len": previous_len,
            "spin": spin,
            "eval_results_keys": list(eval_results.keys())[:50],
            "hits_used": hits_used,
                "no_eval_reasons": no_eval_reasons,
                "engine_hits": engine_hits,
        }

        # --- Auditoría: registrar evaluación por spin (para cuadrar contadores vs spins)
        try:
            eval_log = state.get("eval_log", [])
            if not isinstance(eval_log, list):
                eval_log = []
            eval_log.append({
                "spin_index": len(state.get("spins", [])),
                "spin": spin,
                "snapshot_spins_count": (last_suggestion.get("snapshot_spins_count") if isinstance(last_suggestion, dict) else None),
                "hits_used": hits_used,
                "engine_hits": engine_hits,
                "ts_utc": datetime.now(timezone.utc).isoformat(),
            })
            # cap para no crecer infinito
            if len(eval_log) > 5000:
                eval_log = eval_log[-500:]
            state["eval_log"] = eval_log
            
            # Persistir evaluación (JSONL) - no rompe flujo
            try:
                _sid = _get_session_id(state)
                _append_jsonl(evals_log_path, {
                    "type": "evaluation",
                    "ts_utc": datetime.now(timezone.utc).isoformat(),
                    "session_id": _sid,
                    "user_id": str(state.get("user_id", "default")),
                    "table_id": str(state.get("table_id", "mesa_1")),
                    "spin": spin,
                    "prev_snapshot_spins_count": (last_suggestion.get("snapshot_spins_count") if isinstance(last_suggestion, dict) else None),
                    "hits_used": hits_used,
                    "engine_hits": engine_hits,
                    "metrics_bet_only": bool(state.get("metrics_bet_only", True)),
                })
            except Exception:
                pass
        except Exception:
            # No interrumpir flujo por auditoría
            pass

        decision = last_suggestion.get("decision", {}) if isinstance(last_suggestion, dict) else {}
        if not isinstance(decision, dict):
            decision = {"action": "OBSERVE"}

        if decision.get("action") in ("EXPLOIT", "PROBE"):
            # Unificado con el stake del sidebar (sizing_stake_base) — antes leía
            # un "stake_base" legacy distinto que generaba inconsistencia.
            stake_base = float(
                state.get("sizing_stake_base",
                state.get("stake_base", 2500.0))
            )
            stake_amt = stake_base * 4 * float(decision.get("stake_frac", 0.0))
            try:
                loss_state = engine_module.update_loss_state(
                    state.get("consec_losses", 0),
                    state.get("cum_loss", 0.0),
                    last_guardian_result,
                    stake_amt,
                )
                state.update(loss_state)
            except Exception as e:
                _logger.error(f"Error en update_loss_state: {e}")

        log_record = {
            "type": "guardian_docena",
            "action": decision.get("final_action", decision.get("action", "OBSERVE")),
            "stake_frac": decision.get("stake_frac", 0.0),
            "reason": "eval guardian_docena",
        }
        if last_guardian_result is not None:
            log_record["result"] = last_guardian_result
        if not isinstance(state.get("decision_log"), list):
            state["decision_log"] = []
        state["decision_log"].append(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "spin_index": len(state["spins"]),
                "spin": spin,
                "action_record": log_record,
                "consec_losses": state.get("consec_losses", 0),
                "cum_loss": state.get("cum_loss", 0.0),
            }
        )
        state["decision_log"] = state.get("decision_log", [])[-500:]

        # ✅ FIX guardián: si el engine NO actualizó el core, lo actualizamos aquí y forzamos persistencia
        try:
            if guardian_core is not None and guardian_pick is not None and last_guardian_result is not None:
                t_after = getattr(guardian_core, "t", None)
                if t_before is None or t_after == t_before:
                    guardian_core.observe(guardian_pick, bool(last_guardian_result), float(guardian_edge or 0.0))
                if hasattr(guardian_core, "_save_state"):
                    guardian_core._save_state(force=True)
        except Exception as e:
            _logger.error(f"Guardian observe/save failed: {e}")

        # BUG-04 FIX: Guardian Columna observe (was missing)
        try:
            guardian_col_core = getattr(engine_module, "_GUARDIAN_COL_CORE", None)
            last_guardian_col_result = hits_used.get("guardian_columna", None)
            if guardian_col_core is not None and guardian_col_pick is not None and last_guardian_col_result is not None:
                guardian_col_core.observe(
                    guardian_col_pick,
                    bool(last_guardian_col_result),
                    float(guardian_col_edge or 0.0),
                    spin=int(spin),
                )
                if hasattr(guardian_col_core, "_save_state"):
                    guardian_col_core._save_state(force=True)
        except Exception as e:
            _logger.error(f"Guardian Columna observe/save failed: {e}")

    state["last_guardian_result"] = last_guardian_result
    state["last_guardian_status"] = guardian_status
    # 📌 LAST evaluado (para UI: separar NEXT vs LAST)
    try:
        state["last_guardian_eval"] = {
            "spin": int(spin),
            "pick": guardian_pick,
            "edge": None if guardian_edge is None else float(guardian_edge),
            "status": guardian_status,
            "hit": last_guardian_result,
            "snapshot_spins_count": int(previous_len),
            "ts": time.time(),
        }
    except Exception:
        pass

    


# NB online
    if state.get("use_nb", False):
        try:
            res_nb = engine_module.update_nb_model(
                state.get("nb_model"),
                previous_spins,
                spin,
                state.get("window_short", 12),
            )
            if res_nb is not None:
                state["nb_model"] = res_nb
        except Exception as e:
            _logger.error(f"Error en update_nb_model: {e}")

    _maybe_train_lstm(state, state.get("spins", []), engine_instance=engine_instance)


    # ✅ Registrar el spin en la sesión DESPUÉS de evaluar contra la sugerencia pre-spin.
    # 💵 Liquidación automática de bankroll (contra sugerencia pre-spin)
    # ★ FIX BUG SALDO: _auto_settle_bankroll_from_pre_payload pertenecía al
    # sistema del paño MANUAL del Streamlit original (mb_stake_*). En la
    # migración a React esos stakes manuales no se exponen, pero la función
    # seguía descontando en cada spin si bet_advice[cat].status=="BET",
    # causando DOBLE descuento junto con el bloque PROGRESSION (arriba).
    # El descuento real ahora es UNA SOLA fuente: el bloque PROGRESSION,
    # que ya respeta GOD-STRICT. Esta llamada se desactiva (queda comentada
    # para referencia histórica).
    t_settle_ms = 0.0
    try:
        _t0 = time.perf_counter()
        # _auto_settle_bankroll_from_pre_payload(state, outcome=int(spin), pre_payload=last_suggestion, previous_len=previous_len)
        t_settle_ms = (time.perf_counter() - _t0) * 1000.0
    except Exception as _e:
        _logger.error(f"Auto bankroll settlement failed: {_e}")
    #    A partir de aquí, el spin ya puede alimentar drift/checkpoints/register_spin.
    try:
        spv = state.get("spins")
        state["spins"] = _safe_list_like(spv)

        state["spins"].append(spin)
        MAX_SPINS_SESSION = 5000
        if len(state['spins']) > MAX_SPINS_SESSION:
            state['spins'] = state['spins'][-MAX_SPINS_SESSION:]
        # ── D.A.N.N.A. PILOT BOT — registrar outcome del último veredicto ──
        if _PILOT_AVAILABLE:
            try:
                _last_v = (state.get("pilot") or {}).get("last_verdict")
                if _last_v:
                    # Inyectar contexto para que PilotState.get() use state["pilot"]
                    _pilot.set_state_context(state)
                    try:
                        _pilot.record_outcome(int(spin), _last_v)
                    finally:
                        _pilot.clear_state_context()
                # Override consumido
                if state.get("pilot_override_pending"):
                    try:
                        _logger.warning(
                            f"[OVERRIDE] Consumido por spin={spin} → "
                            f"pilot_override_pending={state['pilot_override_pending']!r} borrado"
                        )
                    except Exception:
                        pass
                    state["pilot_override_pending"] = None
            except Exception as _pilot_rec_err:
                _logger.warning(f"Pilot record_outcome falló: {_pilot_rec_err}")
        try:
            _logger.info(f"🌀 Spin registrado | session_id={state.get('_session_id')} table_id={state.get('table_id')} spins_len={len(state.get('spins', []) or [])} spin={int(spin)}")
        except Exception:
            pass
        # ✅ Liquidación LIVE BETS (paño) para este spin
        _lb_settle_open_bets(state, int(spin))
        # Auto-liquidate a pending manual bankroll bet (if any) for this spin
        _mb_try_auto_liquidate(state, int(spin), previous_len)
    except Exception:
        pass

    # checkpoint NB
    current_spins = state.get("spins", [])
    checkpoint_spins = state.get("checkpoint_spins", 50)
    if current_spins and checkpoint_spins > 0 and len(current_spins) % int(checkpoint_spins) == 0:
        try:
            engine_module.save_nb_prior_checkpoint(state.get("nb_model"), config.NB_PRIOR_PATH)
        except Exception as e:
            _logger.error(f"Error en save_nb_prior_checkpoint: {e}")

    # registrar en engine persistente
    try:
        sync_engine_models_from_session(state, engine_instance=engine_instance)

        meta = {
            "session_created_at": state.get("created_at"),
            "notes": notes or "",
            "user_id": str(state.get("user_id", "default")),
            "table_id": str(state.get("table_id", "mesa_1")),
        }

        # Si el usuario configuró replay global, apuntamos el engine hacia esa ruta
        if state.get("global_replay_path"):
            try:
                engine_instance.replay.path = state.get("global_replay_path")
            except Exception:
                pass

        # Historial PRE-spin (antes de este giro) para garantizar flujo Predicción→Decisión→Evaluación
        pre_spin_sequence = previous_spins

        if hasattr(engine_instance, "register_spin"):
            _t0 = time.perf_counter()
            engine_instance.register_spin(
                spin,
                full_spins_for_drift=previous_spins,  # BUG-03 FIX: pre-append for drift
                meta=meta,
                pre_spin_sequence=pre_spin_sequence,
            )
            t_reg_ms = (time.perf_counter() - _t0) * 1000.0

        _t0 = time.perf_counter()
        sync_engine_models_from_session(state, engine_instance=engine_instance)
        t_sync_ms = (time.perf_counter() - _t0) * 1000.0
    except Exception as e:
        _logger.error(f"register_spin failed: {e}")


    # Guardar medición (se muestra en HUD/sidebar). No afecta lógica.
    if perf_on:
        total_ms = (time.perf_counter() - t0_total) * 1000.0
        engine_total = float(t_eval_ms) + float(t_reg_ms) + float(t_sync_ms)
        ui_other = max(0.0, float(total_ms) - float(engine_total))
        state["_perf_last_spin"] = {
            "ts_local": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_ms": float(total_ms),
            "engine_total_ms": float(engine_total),
            "ui_other_ms": float(ui_other),
            "rows": [
                {"name": "engine.evaluate_spin", "ms": float(t_eval_ms)},
                {"name": "bankroll.settle_pre_payload", "ms": float(t_settle_ms)},
                {"name": "engine.register_spin", "ms": float(t_reg_ms)},
                {"name": "engine.sync_models", "ms": float(t_sync_ms)},
            ],
        }

    # ── POST-SPIN REGEN ────────────────────────────────────────────────
    # ANTES (bug): state["last_suggestion"] = None invalidaba el cache,
    # forzando regeneración LAZY en el siguiente GET /api/state. Esa
    # regeneración solo refrescaba el payload del motor; NO el
    # last_verdict del Pilot. Resultado: TARGET LOCK, CCS_pct, pick_bet,
    # all_suggestions mostraban datos del giro N-1 hasta que llegaba el
    # giro N+1. Lag visible de un spin completo.
    #
    # AHORA (fix de raíz): regeneramos EAGER aquí, con el spin ya
    # apendado y el motor ya sincronizado (ocurrió arriba en register_spin
    # y sync_engine_models). Tres pasos:
    #   1. _ensure_last_suggestion_current → regenera el payload del motor
    #      (bet_advice, mesa_score, etc.) y lo persiste en state["last_suggestion"].
    #   2. _pilot.evaluate(decision_enriquecida, spins) → refresca
    #      state["pilot"]["last_verdict"] con la evaluación sobre la
    #      decisión nueva. La decisión se enriquece con los mismos
    #      campos (_hud_cond_state, _sanctioned_categories,
    #      _god_category_stats) que inyecta el bloque PRE-spin (~L685).
    #   3. Reaplicar las 4 condiciones GOD-STRICT al verdict resultante
    #      (HUD=OPTIMAL, Radar≥7, Entropy≥50, CCS≥69) para mantener
    #      coherencia con `god_active` que recomputa state_routes.py
    #      en cada GET /api/state.
    #
    # TODO[Fase3]: el bloque GOD-STRICT está DUPLICADO entre este lugar y
    # las líneas ~736-770 del bloque PRE-spin. En la fase de "una sola
    # fuente de scoring" debe extraerse a un helper compartido
    # (_pilot_evaluate_with_god_strict) y llamarse desde ambos sitios.
    # Por ahora se duplica con propósito de fix mínimo y atómico.
    #
    # Defensivo: si regen falla por cualquier razón NO rompemos el
    # procesamiento del spin — solo loggeamos warning. Peor caso: lag de
    # un spin (mismo comportamiento que tenía la línea original).
    try:
        regen_payload = _ensure_last_suggestion_current(state, engine_instance=engine_instance)
        if _PILOT_AVAILABLE and isinstance(regen_payload, dict):
            _decision_post = regen_payload.get("decision", {}) or {}
            if isinstance(_decision_post, dict):
                _decision_post = dict(_decision_post)

                # Inyectar HUD state (mismos campos que PRE-spin L687-693)
                _hud_post = state.get("hud_computed") or {}
                _hud_cs_post = str(
                    _hud_post.get("state", "") or state.get("_cond_state", "") or ""
                ).upper()
                _hud_cv_post = float(
                    _hud_post.get("cond", 0.0) or state.get("_cond_val_cache", 0.0) or 0.0
                )
                _decision_post["_hud_cond_state"] = _hud_cs_post
                _decision_post["_hud_table_entropy"] = _hud_cv_post
                _decision_post["_hud_entropy_pure"] = _hud_cv_post

                # Inyectar sanciones (mismo source que PRE-spin L695-700)
                _sanc_post = state.get("category_sanctions", {}) or {}
                _decision_post["_sanctioned_categories"] = [
                    _k for _k, _v in _sanc_post.items()
                    if isinstance(_v, dict) and _v.get("active")
                ]

                # Inyectar god_category_stats (mismo source que PRE-spin L702-714)
                _gc_root_post = state.get("counters_god", {}) or {}
                _god_cat_stats_post = {}
                for _bk_g_post in ("color", "paridad", "rango", "docenas", "columnas"):
                    _gc_post = _gc_root_post.get(f"god_{_bk_g_post}", {}) or {}
                    _gw_post = int(_gc_post.get("wins", 0))
                    _gl_post = int(_gc_post.get("losses", 0))
                    _gt_post = _gw_post + _gl_post
                    _god_cat_stats_post[_bk_g_post] = {
                        "wins": _gw_post, "losses": _gl_post,
                        "hit_rate": (_gw_post / _gt_post) if _gt_post > 0 else 0.0,
                    }
                _decision_post["_god_category_stats"] = _god_cat_stats_post

                # Stake base (mismo source que PRE-spin L718-722)
                _ppr_params_post = state.get("pilot") or {}
                _stake_base_post = float(
                    _ppr_params_post.get("stake_base", 2500.0) or 2500.0
                )
                if _stake_base_post <= 0:
                    _stake_base_post = 2500.0
                _pilot_params_post = {"stake_base": _stake_base_post}

                _spins_post = state.get("spins", []) or []

                # Evaluate (refresca state["pilot"]["last_verdict"])
                _pilot.set_state_context(state)
                try:
                    _verdict_post = _pilot.evaluate(
                        _decision_post,
                        _spins_post,
                        _pilot_params_post,
                    )
                finally:
                    _pilot.clear_state_context()

                # Reaplicar GOD-STRICT — usa is_god_active() unificada (6 condiciones
                # de Streamlit: HUD, Radar, Entropy, TQI, CCS, Health). Antes este
                # bloque tenía las 4 condiciones inline duplicadas con el PRE-spin
                # (que ya fue eliminado), creando divergencia vs Streamlit y vs
                # state_routes.py. Ahora hay una sola fuente de verdad.
                if isinstance(_verdict_post, dict) and _verdict_post.get("verdict") == "GO":
                    # FIX OVERRIDE: la estructura real del state guarda override_bet_key
                    # como campo plano en pilot.raw, NO existe pilot.operator_override.
                    # is_god_active() bypassea las 6 condiciones si recibe override=True.
                    _override_post = bool((state.get("pilot") or {}).get("override_bet_key"))
                    _th_data_post = state.get("_table_health") if isinstance(state.get("_table_health"), dict) else None
                    _god_active_post, _god_failed_post = _pilot.is_god_active(
                        hud_data=state.get("hud_computed") or {},
                        decision=_decision_post,
                        verdict=_verdict_post,
                        operator_override=_override_post,
                        table_health=_th_data_post,
                    )

                    if not _god_active_post:
                        _logger.info(
                            f"[GOD-STRICT POST-SPIN] GO → STAND_DOWN. "
                            f"Razones: {_god_failed_post}"
                        )
                        _verdict_post["verdict"] = "STAND_DOWN"
                        _verdict_post["god_blocked"] = True
                        _verdict_post["god_block_reason"] = "GOD: " + " · ".join(_god_failed_post)
                        # Persistir la modificación del verdict en pilot.raw
                        # (set_state_context ya está limpio, pero last_verdict
                        # vive en state["pilot"]["last_verdict"] que ya fue
                        # asignado por _build_verdict; mutamos in-place).
                        _pilot_raw = state.get("pilot") or {}
                        if isinstance(_pilot_raw, dict):
                            _pilot_raw["last_verdict"] = _verdict_post
                    # Marcar el verdict con el flag _god_active_now (paridad con
                    # Streamlit app.py L8362-8370). El frontend / state_routes
                    # pueden leerlo para mostrar el panel GOD correctamente.
                    _verdict_post["_god_active_now"] = bool(_god_active_post)
                    _verdict_post["_god_failed_reasons"] = list(_god_failed_post or [])
    except Exception as _regen_err:
        _logger.warning(f"POST-SPIN REGEN falló: {_regen_err}", exc_info=True)

    _emit_rerun(on_rerun)
