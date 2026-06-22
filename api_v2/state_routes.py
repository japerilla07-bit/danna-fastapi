"""
State routes — Lectura del estado de sesion
=============================================
Endpoints de solo-lectura para el dashboard React.

    GET  /api/session/state    — State crudo (todas las claves de la sesion)
    POST /api/session/reset    — Reset completo (RESET MESA)
    GET  /api/state            — Snapshot enriquecido (HUD, radar, top pick, ...)
    GET  /api/sequence         — Lista de spins (con paginacion opcional)
    GET  /api/admin/sessions   — Lista sesiones activas (solo admin)
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Cookie, Depends, Query

from auth import get_user_info, get_spins_remaining
from core.jwt_utils import decode_token
from core.auth_helpers import require_active_user
from core.session_manager import session_manager
from core.engine_pool import engine_pool
from danna_core.processor_helpers import _ensure_last_suggestion_current
from danna_core.helpers import _deep_jsonable

log = logging.getLogger("state_routes")
router = APIRouter(prefix="/api", tags=["state"])




@router.get("/session/state")
def get_session_state(user: dict = Depends(require_active_user)):
    sess = session_manager.get(user["username"])
    return {
        "user_id": user["username"],
        "state": _deep_jsonable(sess.to_dict()),
    }


@router.post("/session/reset")
def reset_session(user: dict = Depends(require_active_user)):
    username = user["username"]
    sess = session_manager.reset(username)
    engine_pool.evict(username)
    return {
        "success": True,
        "user_id": username,
        "state": _deep_jsonable(sess.to_dict()),
    }


@router.get("/state")
def get_state_snapshot(user: dict = Depends(require_active_user)):
    username = user["username"]
    sess = session_manager.get(username)

    user_engine = engine_pool.get(username, models={
        "nb_model": sess.get("nb_model"),
        "lstm_model": sess.get("lstm_model"),
        "scaler": sess.get("lstm_scaler"),
    })

    try:
        payload = _ensure_last_suggestion_current(sess, engine_instance=user_engine)
    except Exception as e:
        log.warning(f"No pude generar payload para '{username}': {e}")
        payload = None

    spins_info = get_spins_remaining(user)

    # ── BANKROLL ──
    _pilot_sess = sess.get("pilot") or {}
    _profit_sess = float(_pilot_sess.get("profit_session", 0.0) or 0.0)
    _br_initial = float(sess.get("bankroll_initial", 0.0) or 0.0)
    _br_current = float(sess.get("bankroll", 0.0) or 0.0)
    if _br_initial <= 0:
        if _br_current == 0 and _profit_sess == 0:
            _br_initial = 100000.0
            sess["bankroll_initial"] = _br_initial
            sess["bankroll"] = _br_initial
            _br_current = _br_initial
        else:
            _br_initial = max(_br_current - _profit_sess, _br_current, 100000.0)
            sess["bankroll_initial"] = _br_initial
    _br_real = _br_initial + _profit_sess if _profit_sess != 0.0 else _br_current
    bankroll = {
        "current":  _br_real,
        "initial":  _br_initial,
        "pnl":      _br_real - _br_initial,
        "pnl_pct":  ((_br_real - _br_initial) / _br_initial * 100.0) if _br_initial > 0 else 0.0,
    }

    spins_list = sess.get("spins", []) or []

    # ── CAPITAL ALLOCATION (stakes sugeridos) ──
    def _finite(v, default=0.0):
        try:
            v = float(v)
            return v if v == v and v not in (float('inf'), float('-inf')) else default
        except Exception:
            return default

    def _compute_stakes(payload_now, sess_state, bankroll_amt):
        try:
            decision = (payload_now or {}).get("decision", {}) or {}
            advice = decision.get("bet_advice", {}) or {}
            counters_loc = sess_state.get("counters", {}) or {}
            bankroll_actual = max(0.0, _finite(bankroll_amt, 0.0))
            stake_base_default = bankroll_actual * 0.01
            stake_base = max(0.0, _finite(sess_state.get("sizing_stake_base", stake_base_default), stake_base_default))
            thr_low = min(max(_finite(sess_state.get("sizing_thr_low", 0.40), 0.40), 0.0), 1.0)
            thr_high = min(max(_finite(sess_state.get("sizing_thr_high", 0.65), 0.65), 0.0), 1.0)
            if thr_high < thr_low:
                thr_low, thr_high = thr_high, thr_low
            suggestions = {}
            for key, data in (advice or {}).items():
                data = data or {}
                status = data.get("status", "WAIT")
                conf = min(max(_finite(data.get("conf_score", 0.0), 0.0), 0.0), 1.0)
                try:
                    c_err = int(((counters_loc.get(key, {}) or {}).get("consec_errors", 0)) or 0)
                except Exception:
                    c_err = 0
                if c_err >= 3:
                    suggestions[key] = {"amount": 0.0, "level": "LOCKED", "mult": 0}
                    continue
                if status == "WAIT":
                    suggestions[key] = {"amount": 0.0, "level": "WAIT", "mult": 0}
                elif status == "PROBE":
                    suggestions[key] = {"amount": stake_base * 0.5, "level": "½x", "mult": 0.5}
                elif status in ("BET", "EXPLOIT"):
                    if conf < thr_low:
                        suggestions[key] = {"amount": stake_base * 1.0, "level": "1x", "mult": 1}
                    elif conf <= thr_high:
                        suggestions[key] = {"amount": stake_base * 2.0, "level": "2x", "mult": 2}
                    else:
                        suggestions[key] = {"amount": stake_base * 3.0, "level": "3x", "mult": 3}
                else:
                    suggestions[key] = {"amount": 0.0, "level": "WAIT", "mult": 0}
                amt = max(0.0, _finite(suggestions[key].get("amount", 0.0), 0.0))
                suggestions[key]["amount"] = round(amt / 500.0) * 500.0
            return suggestions, stake_base, thr_low, thr_high
        except Exception as e:
            log.warning(f"compute_stakes falló: {e}")
            return {}, 0.0, 0.40, 0.65

    try:
        stakes_sug, stake_base_val, thr_low_val, thr_high_val = _compute_stakes(payload, sess, bankroll["current"])
        total_exposure = sum(s.get("amount", 0.0) for s in stakes_sug.values())
        exp_pct = (total_exposure / bankroll["current"] * 100.0) if bankroll["current"] > 0 else 0.0
    except Exception as e:
        log.warning(f"Capital allocation compute falló: {e}")
        stakes_sug, stake_base_val, thr_low_val, thr_high_val = {}, 0.0, 0.40, 0.65
        total_exposure, exp_pct = 0.0, 0.0

    # ── COND STATE ──
    def _compute_cond(payload_d: dict, sess_d: dict) -> dict:
        try:
            decision = (payload_d or {}).get("decision", {}) or {}
            ms        = decision.get("mesa_score") or {}
            score10   = float(ms.get("score10", 5) or 5)
            mesa_norm = score10 / 10.0
            chaos_info     = decision.get("chaos_info") or {}
            entropy_norm   = float(chaos_info.get("entropy_norm", 0.5) or 0.5)
            chaos_raw      = bool(chaos_info.get("active", False))
            entropy_score  = 1.0 - max(0.0, min(1.0, entropy_norm))
            pilot_st  = sess_d.get("pilot") or {}
            consec    = int(pilot_st.get("pilot_consec_errors", 0) or sess_d.get("consec_losses", 0) or 0)
            consec_score = 1.0 - max(0.0, min(1.0, consec / 7.0))
            chaos_active = chaos_raw and consec >= 4
            wi           = sess_d.get("_wheel_expert_info") or {}
            wscores      = wi.get("sector_scores", {}) or {}
            top_wheel    = max(wscores.values()) if wscores else 0.25
            wheel_score  = max(0.0, min(1.0, (top_wheel - 0.25) / 0.35))
            cond = (mesa_norm * 0.40 + entropy_score * 0.25 + consec_score * 0.25 + wheel_score * 0.10)
            cond = max(0.0, min(1.0, cond))
            if chaos_active or consec >= 6:
                state = "abort"
            elif cond >= 0.65:
                state = "optimal"
            elif cond >= 0.40:
                state = "caution"
            else:
                state = "abort"
            return {"state": state, "cond": cond}
        except Exception:
            return {"state": "caution", "cond": 0.40}

    _hud_computed   = _compute_cond(payload, sess)
    _god_cond_state = _hud_computed.get("state", "caution")
    _hud_cond_value = float(_hud_computed.get("cond", 0.40))

    # ── ACTIVE BETS (para UI, otras sugerencias) ──
    def _format_pick_for_god(bk: str, pick_raw) -> str:
        if pick_raw is None:
            return "—"
        s = str(pick_raw).strip()
        if not s or s == "None":
            return "—"
        return s.upper()

    _god_active_bets = []
    try:
        _ba = (payload or {}).get("decision", {}).get("bet_advice", {}) or {}
        _decision = (payload or {}).get("decision", {}) or {}
        _counters_loc = sess.get("counters", {}) or {}
        _W = {"w_engine_conf": 0.25, "w_motor_prob": 0.15, "w_session_hr": 0.20,
              "w_max_consec": 0.15, "w_op_state": 0.15, "w_mesa_radar": 0.10,
              "p_drift": 0.15, "p_pilot_streak": 0.15}
        _ms_dec = _decision.get("mesa_score", {}) or {}
        _score10_for_mr = 5.0
        for _k in ("score10", "radar10", "radar"):
            _v = _ms_dec.get(_k)
            if _v is not None:
                try:
                    _score10_for_mr = float(_v)
                    break
                except Exception:
                    pass
        _c_mesa  = min(1.0, max(0.0, _score10_for_mr / 10.0))
        _c_radar = min(1.0, max(0.0, _score10_for_mr / 10.0))
        _c_mr    = (_c_mesa + _c_radar) / 2.0
        _op_st = (sess.get("_cond_state", "") or _god_cond_state or "").upper().strip()
        _c_op = {"OPTIMAL": 1.0, "CAUTION": 0.55, "CRITICAL": 0.10}.get(_op_st, 0.50)
        _drift_level = 0.0
        _ds = _decision.get("drift_state") or _decision.get("drift") or {}
        if isinstance(_ds, dict):
            for _k in ("level", "drift_level", "value"):
                _v = _ds.get(_k)
                if _v is not None:
                    try:
                        _drift_level = min(1.0, max(0.0, float(_v)))
                        break
                    except Exception:
                        pass
        if _drift_level == 0.0:
            try:
                _drift_level = min(1.0, max(0.0, float(sess.get("drift_level", 0.0) or 0.0)))
            except Exception:
                _drift_level = 0.0
        _pilot_st = sess.get("pilot", {}) or {}
        _cur_streak = int(_pilot_st.get("current_streak", 0) or -int(sess.get("consec_losses", 0) or 0))
        _streak_factor = 1.0 if _cur_streak >= -1 else max(0.4, 1.0 + (_cur_streak + 1) * 0.20)
        _p_streak = 1.0 - _streak_factor

        for _bk in ("color", "paridad", "rango", "docenas", "columnas"):
            _entry = _ba.get(_bk, {}) or {}
            _st = str(_entry.get("status") or _entry.get("action") or "").upper().strip()
            if _st not in ("BET", "EXPLOIT"):
                continue
            _pick_raw = _entry.get("pick") or _entry.get("vector") or _entry.get("selection") or "—"
            _conf_raw = float(_entry.get("conf_score", 0.0) or 0.0)
            _c_engine = min(1.0, max(0.0, _conf_raw))
            _p_win = float(_entry.get("p", _entry.get("top_probability", 0.0)) or 0.0)
            _baseline = 24.0 / 37.0 if _bk in ("docenas", "columnas") else 18.0 / 37.0
            _c_prob = 0.0 if _p_win <= _baseline else min(1.0, (_p_win - _baseline) / 0.20)
            _c_cnt = _counters_loc.get(_bk, {}) or {}
            _wins = int(_c_cnt.get("wins", 0) or 0)
            _loss = int(_c_cnt.get("losses", 0) or 0)
            _n_hr = _wins + _loss
            _c_hr = 0.5 if _n_hr == 0 else (_wins / _n_hr)
            _consec = int(_c_cnt.get("consec_errors", 0) or 0)
            _c_max = {0: 1.0, 1: 0.85, 2: 0.65, 3: 0.40}.get(_consec, 0.15)
            _score = (_W["w_engine_conf"] * _c_engine + _W["w_motor_prob"] * _c_prob +
                      _W["w_session_hr"] * _c_hr + _W["w_max_consec"] * _c_max +
                      _W["w_op_state"] * _c_op + _W["w_mesa_radar"] * _c_mr -
                      _W["p_drift"] * _drift_level - _W["p_pilot_streak"] * _p_streak)
            _score = max(0.0, min(1.0, _score))
            _conf_pct = int(round(_score * 100))
            _god_active_bets.append({
                "bet_key": _bk,
                "pick_pretty": _format_pick_for_god(_bk, _pick_raw),
                "conf_pct": _conf_pct,
            })

        # ★ FIX DE COHERENCIA TARGET LOCK ↔ RECORD_OUTCOME ★
        # ─────────────────────────────────────────────────────────────────
        # El TOP de _god_active_bets se renderiza como TARGET LOCK en el
        # frontend. record_outcome del Pilot SIEMPRE evalúa usando
        # verdict.pick_bet.bet_key. Si el TOP de active_bets (scoring custom
        # de state_routes) y el pick_bet del Pilot (ConfidenceScorer) eligen
        # categorías diferentes, el usuario ve una categoría y el sistema
        # cuenta otra. Solución: forzar que el bet_key del pick_bet del
        # verdict sea el PRIMERO de la lista.
        _pilot_raw_early = sess.get("pilot") or {}
        _lv_early = _pilot_raw_early.get("last_verdict") if isinstance(_pilot_raw_early, dict) else None
        _pick_bet_early = None
        if isinstance(_lv_early, dict):
            _pick_bet_early = _lv_early.get("pick_bet")

        if isinstance(_pick_bet_early, dict) and _pick_bet_early.get("bet_key"):
            _pilot_bk = str(_pick_bet_early.get("bet_key", "")).lower().strip()
            _pilot_pick_pretty = str(_pick_bet_early.get("pick_pretty") or _pick_bet_early.get("pick") or "—")
            try:
                _pilot_conf_pct = int(round(float(_pick_bet_early.get("score_pct", 0) or 0)))
            except Exception:
                _pilot_conf_pct = 0

            # Quitar cualquier ocurrencia existente del bet_key del Pilot
            _god_active_bets = [
                b for b in _god_active_bets
                if str(b.get("bet_key", "")).lower().strip() != _pilot_bk
            ]
            # Ordenar el resto por conf_pct descendente
            _god_active_bets.sort(key=lambda x: -x.get("conf_pct", 0.0))
            # Insertar el pick_bet del Pilot AL INICIO (TARGET LOCK)
            _god_active_bets.insert(0, {
                "bet_key": _pilot_bk,
                "pick_pretty": _pilot_pick_pretty,
                "conf_pct": _pilot_conf_pct,
            })
        else:
            # Sin pick_bet del Pilot: ordenar normal por conf_pct
            _god_active_bets.sort(key=lambda x: -x.get("conf_pct", 0.0))
    except Exception as _e:
        log.warning(f"active_bets compute falló: {_e}")
        _god_active_bets = []

    # ★ Fuente de verdad: last_verdict del pilot
    _pilot_raw = sess.get("pilot") or {}
    last_verdict = _pilot_raw.get("last_verdict") if isinstance(_pilot_raw, dict) else None
    if not last_verdict or not isinstance(last_verdict, dict):
        last_verdict = {
            "verdict": "STAND_DOWN",
            "ccs_pct": 0,
            "pick_bet": None,
            "session_stats": {"bets_hits": 0, "bets_misses": 0, "profit_session": 0.0}
        }

    # ── GOD BET (solo indicador visual) ──
    _ms_god = (payload or {}).get("decision", {}).get("mesa_score", {}) or {}
    god_score10 = int(_ms_god.get("score10", 0) or 0)

    _god_failed = []
    if _god_cond_state != "optimal":
        _god_failed.append(f"HUD={_god_cond_state.upper()}")
    if god_score10 < 7:
        _god_failed.append(f"Radar={god_score10}/10")
    _table_entropy_pct = int(round(_hud_cond_value * 100))
    if _table_entropy_pct < 50:
        _god_failed.append(f"Entropy={_table_entropy_pct}/100")
    _top_ccs = last_verdict.get("ccs_pct", 0)
    if _top_ccs < 69:
        _god_failed.append(f"CCS={_top_ccs}/100")
    _th_cached = sess.get("_table_health", None) or {}
    _table_health_score = int(_th_cached.get("score", 0) or 0)
    if _table_health_score > 0 and _table_health_score < 50:
        _god_failed.append(f"Health={_table_health_score}/100")
    god_active = len(_god_failed) == 0

    god_bet_block = {
        "active": god_active,
        "cond_state": _god_cond_state,
        "radar_score": god_score10,
        "counters_god": sess.get("counters_god", {}) or {},
        "god_buckets": sess.get("god_buckets", {}) or {},
        "level_buckets": _pilot_raw.get("level_buckets", {}) or {},
        "ccs_buckets": _pilot_raw.get("ccs_buckets", {}) or {},
        "active_bets": _god_active_bets,
        "failed_reasons": _god_failed,
        "god_stats": {
            "wins": _pilot_raw.get("bets_hits", 0),
            "losses": _pilot_raw.get("bets_misses", 0),
            "avg_errors": (_pilot_raw.get("bets_misses", 0) / max(1, _pilot_raw.get("bets_emitted", 0))),
            "consec_errors": _pilot_raw.get("pilot_consec_errors", 0),
            "max_consec_errors": _pilot_raw.get("pilot_max_consec_errors", 0),
        },
        # ★ ÚNICA FUENTE DE VERDAD para el frontend
        "last_verdict": _deep_jsonable(last_verdict),
        "_debug": {
            "hud_cond": _god_cond_state,
            "score10": god_score10,
            "table_entropy": _table_entropy_pct,
            "top_ccs": _top_ccs,
            "table_health": _table_health_score,
            "failed": _god_failed,
        },
    }

    # ── OTROS CAMPOS ──
    wheel_info_block = sess.get("_wheel_expert_info", {}) or {}
    error_hist_block = sess.get("error_hist", {}) or {}
    decision_log = sess.get("decision_log", []) or []
    ledger_block = list(decision_log[-20:]) if isinstance(decision_log, list) else []

    _table_health_cached = sess.get("_table_health", None)
    if isinstance(_table_health_cached, dict) and _table_health_cached.get("score", 0) > 0:
        table_health_block = _table_health_cached
    else:
        try:
            _th_history = []
            _th_eval = sess.get("eval_log", None)
            if isinstance(_th_eval, list) and _th_eval:
                for _the in _th_eval[-300:]:
                    if not isinstance(_the, dict):
                        continue
                    _thhu = _the.get("hits_used", None)
                    if not isinstance(_thhu, dict):
                        continue
                    _thv = _thhu.get("primary", None)
                    if _thv is None:
                        continue
                    _th_history.append({"won": bool(_thv), "result": "WIN" if bool(_thv) else "LOSS", "net": 1 if bool(_thv) else -1})
            if len(_th_history) >= 3:
                window = 15
                recent = _th_history[-window:]
                score_trend = []
                current_val = 50.0
                hits = 0
                for entry in recent:
                    if entry.get("won", False):
                        hits += 1
                        current_val = min(100, current_val + 5)
                    else:
                        current_val = max(0, current_val - 4)
                    score_trend.append(int(current_val))
                final_score = score_trend[-1]
                hit_rate = int((hits / len(recent)) * 100)
                if final_score >= 65:
                    s, c, m = "CONGRUENTE", "green", "Patrones Claros"
                elif final_score >= 40:
                    s, c, m = "OBSERVAR", "orange", "Patrones Cambiantes"
                else:
                    s, c, m = "DESVÍO", "red", "Ruido Elevado"
                table_health_block = {"status": s, "score": final_score, "hit_rate": hit_rate, "trend": score_trend, "color": c, "msg": m}
            else:
                table_health_block = {"status": "CALIBRANDO", "score": 50, "hit_rate": 0, "trend": [50] * 15, "color": "gray", "msg": "Recopilando datos..."}
        except Exception as _the:
            log.warning(f"table_health recalc falló: {_the}")
            table_health_block = {"status": "CALIBRANDO", "score": 50, "hit_rate": 0, "trend": [50] * 15, "color": "gray", "msg": "Recopilando datos..."}

    return _deep_jsonable({
        "meta": {
            "user_id": username,
            "plan": user.get("plan", "trial"),
            "spins_used_total": int(user.get("spins_used_total", 0)),
            "spins_remaining": int(spins_info.get("remaining", 0)),
        },
        "sequence": {
            "spins": spins_list,
            "count": len(spins_list),
            "last": spins_list[-1] if spins_list else None,
        },
        "bankroll": bankroll,
        "counters": sess.get("counters", {}),
        "counters_god": sess.get("counters_god", {}),
        "category_sanctions": sess.get("category_sanctions", {}),
        "consec_losses": int(sess.get("consec_losses", 0)),
        "drift_active": bool(sess.get("drift_active", False)),
        "drift_level": float(sess.get("drift_level", 0.0)),
        "payload": payload,
        "capital_allocation": {
            "stake_base": float(stake_base_val),
            "thrs_low": float(thr_low_val),
            "thrs_high": float(thr_high_val),
            "stakes_sug": stakes_sug,
            "total_exposure": float(total_exposure),
            "exp_pct": float(exp_pct),
        },
        "god_bet": god_bet_block,
        "hud_computed": _hud_computed,
        "wheel_info": wheel_info_block,
        "error_hist": error_hist_block,
        "ledger": ledger_block,
        "table_health": table_health_block,
    })


@router.get("/sequence")
def get_sequence(
    user: dict = Depends(require_active_user),
    limit: int = Query(0, ge=0, le=5000, description="0 = todos"),
):
    sess = session_manager.get(user["username"])
    spins = list(sess.get("spins", []) or [])
    total = len(spins)
    if limit > 0 and total > limit:
        spins = spins[-limit:]
    return {
        "total": total,
        "returned": len(spins),
        "spins": spins,
    }


@router.get("/admin/sessions")
def list_active_sessions(user: dict = Depends(require_active_user)):
    if user.get("plan") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")
    return {
        "active_sessions": session_manager.list_active(),
        "active_engines": engine_pool.list_active(),
    }