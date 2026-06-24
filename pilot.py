# pilot.py — D.A.N.N.A. PILOT BOT (v2 — copiloto, no competidor)
# =================================================================
# (el encabezado se mantiene igual)
# =================================================================

from __future__ import annotations
from collections import deque
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import logging
import contextvars
import streamlit as st

_logger = logging.getLogger("danna.pilot")

# ============================================================
#   CONFIG POR DEFECTO
# ============================================================

DEFAULT_PARAMS = {
    "w_engine_conf":    0.25,
    "w_motor_prob":     0.15,
    "w_session_hr":     0.20,
    "w_max_consec":     0.15,
    "w_op_state":       0.15,
    "w_mesa_radar":     0.10,
    "p_drift":          0.15,
    "p_pilot_streak":   0.15,
    "thr_go":           0.58,
    "thr_wait":         0.42,
    "thr_go_caution":   0.62,
    "thr_go_critical":  1.01,
    "regime_min_bets":     5,
    "regime_hot_consec":   3,
    "regime_cool_consec":  3,
    "regime_track_window": 10,
    "max_progression_level": 4,
    "stake_base":            2500,
    "progression_doc_col":   3,
    "progression_simple":    2,
    "consume_status": ("BET", "PROBE"),
}

# ── Context override para FastAPI ──────────────────────────────
# ANTES: _state_ctx era un global de módulo, COMPARTIDO por todas las
# peticiones del proceso. Con workers>1, threadpools o cualquier await
# en la cadena de procesamiento, dos usuarios concurrentes se pisaban el
# contexto → el Piloto evaluaba un giro con el estado de otro usuario.
#
# AHORA: ContextVar aísla el valor por petición async / hilo de forma
# automática. La API pública (set/clear) se mantiene idéntica, así que
# processor.py NO necesita cambiar.
_state_ctx_var: contextvars.ContextVar = contextvars.ContextVar(
    "danna_pilot_state_ctx", default=None
)

def set_state_context(d: dict):
    """Fija el contexto de estado para ESTA petición. Devuelve un token
    (opcional) para restaurar el valor anterior con clear_state_context(token)."""
    return _state_ctx_var.set(d)

def clear_state_context(token=None) -> None:
    """Limpia el contexto de ESTA petición. Si se pasa el token devuelto por
    set_state_context() restaura el valor previo (re-entrante); si no, lo
    deja en None. Compatible con la llamada actual clear_state_context()."""
    try:
        if token is not None:
            _state_ctx_var.reset(token)
        else:
            _state_ctx_var.set(None)
    except Exception:
        _state_ctx_var.set(None)

def _get_state_ctx():
    """Lee el contexto de estado de ESTA petición (o None bajo Streamlit)."""
    return _state_ctx_var.get()

class PilotState:
    # (todo el contenido de PilotState se mantiene exactamente igual que en tu versión)
    # No lo repito por brevedad, pero debe estar idéntico al original.
    # Solo añado los métodos que ya tenías.
    @staticmethod
    def get() -> "PilotState":
        _ctx = _get_state_ctx()
        if _ctx is not None:
            if "pilot" not in _ctx:
                _ctx["pilot"] = PilotState._fresh()
            return PilotState(_ctx["pilot"])
        if "pilot" not in st.session_state:
            st.session_state["pilot"] = PilotState._fresh()
        return PilotState(st.session_state["pilot"])

    @staticmethod
    def _fresh() -> dict:
        return {
            "session_started_at": datetime.utcnow().isoformat(),
            "bets_emitted": 0,
            "bets_hits": 0,
            "bets_misses": 0,
            "current_streak": 0,
            "max_consec_misses_pilot": 0,
            "engine_track": {
                "docenas":   deque(maxlen=20),
                "columnas":  deque(maxlen=20),
                "color":     deque(maxlen=20),
                "paridad":   deque(maxlen=20),
                "rango":     deque(maxlen=20),
                "max_conf":  deque(maxlen=20),
            },
            "active_regime": None,
            "regime_history": deque(maxlen=20),
            "progression_level": 1,
            "progression_loss": 0.0,
            "progression_started_in_bet": None,
            "last_stake_total": 0.0,
            "last_bet_key": None,
            "profit_session": 0.0,
            "pilot_consec_errors": 0,
            "pilot_max_consec_errors": 0,
            "pilot_total_errors": 0,
            "pilot_total_bets": 0,
            "last_verdict": None,
            "last_processed_spin_count": 0,
            "ccs_buckets": {
                "70-75": {"go_count": 0, "hits": 0},
                "75-80": {"go_count": 0, "hits": 0},
                "80-85": {"go_count": 0, "hits": 0},
                "85-90": {"go_count": 0, "hits": 0},
                "90+":   {"go_count": 0, "hits": 0},
                "<70":   {"go_count": 0, "hits": 0},
            },
            "level_buckets": {
                "L1": {"go_count": 0, "hits": 0},
                "L2": {"go_count": 0, "hits": 0},
                "L3": {"go_count": 0, "hits": 0},
                "L4": {"go_count": 0, "hits": 0},
            },
            "pro_mode_active": False,
            "pro_mode_threshold": 0.72,
            "pro_mode_blocked": 0,
            "god_filter_active": False,
            "god_filter_threshold": 0.65,
            "god_filter_min_n": 8,
            "god_filter_blocked": 0,
            "tqi_history": [],
            "override_bet_key": None,
            "override_pick": None,
            "override_activated_at": None,
            "override_count": 0,
        }

    def __init__(self, raw: dict):
        self._raw = raw

    @property
    def raw(self) -> dict:
        return self._raw

    def hit_rate(self) -> float:
        n = self._raw["bets_hits"] + self._raw["bets_misses"]
        return self._raw["bets_hits"] / n if n > 0 else 0.0

    def streak_factor(self) -> float:
        s = self._raw["current_streak"]
        if s >= -1:
            return 1.0
        return max(0.4, 1.0 + (s + 1) * 0.20)

    def engine_hit_rate(self, bet_key: str) -> Tuple[float, int]:
        d = self._raw["engine_track"].get(bet_key)
        if not d or len(d) == 0:
            return 0.5, 0
        return sum(d) / len(d), len(d)

    def engine_consec_hits(self, bet_key: str) -> int:
        d = self._raw["engine_track"].get(bet_key)
        if not d:
            return 0
        c = 0
        for x in reversed(d):
            if x == 1:
                c += 1
            else:
                break
        return c

    def engine_consec_misses(self, bet_key: str) -> int:
        d = self._raw["engine_track"].get(bet_key)
        if not d:
            return 0
        c = 0
        for x in reversed(d):
            if x == 0:
                c += 1
            else:
                break
        return c

    def record_pilot_outcome(self, hit: bool):
        self._raw["bets_emitted"] += 1
        if hit:
            self._raw["bets_hits"] += 1
            self._raw["current_streak"] = max(1, self._raw["current_streak"] + 1)
        else:
            self._raw["bets_misses"] += 1
            self._raw["current_streak"] = min(-1, self._raw["current_streak"] - 1)
            cur = max(0, -self._raw["current_streak"])
            if cur > self._raw["max_consec_misses_pilot"]:
                self._raw["max_consec_misses_pilot"] = cur

    def record_engine_outcome(self, bet_key: str, hit: bool):
        d = self._raw["engine_track"].get(bet_key)
        if d is not None:
            d.append(1 if hit else 0)


# ============================================================
#   EXTRACTORES (MotorReader) — igual que tu versión
# ============================================================
class MotorReader:
    # (mantén tu implementación exacta, no la cambio)
    @staticmethod
    def get_bet_advice(decision: dict) -> Dict[str, Dict[str, Any]]:
        if not isinstance(decision, dict):
            return {}
        ba = decision.get("bet_advice", {})
        return ba if isinstance(ba, dict) else {}

    @staticmethod
    def get_active_suggestions(decision: dict, allowed_status=("BET", "PROBE")) -> List[Dict[str, Any]]:
        ba = MotorReader.get_bet_advice(decision)
        out = []
        for bk in ("docenas", "columnas", "color", "paridad", "rango"):
            data = ba.get(bk)
            if not isinstance(data, dict):
                continue
            status = str(data.get("status", "WAIT")).upper()
            if status not in allowed_status:
                continue
            out.append({
                "bet_key": bk,
                "label": data.get("label", bk.upper()),
                "status": status,
                "p": float(data.get("p", 0.0) or 0.0),
                "edge": float(data.get("edge", 0.0) or 0.0),
                "conf_score": float(data.get("conf_score", 0.0) or 0.0),
                "pick": data.get("pick"),
                "reason": data.get("reason", ""),
            })
        return out

    @staticmethod
    def get_mesa_score(decision: dict) -> float:
        if not isinstance(decision, dict):
            return 0.5
        ms = decision.get("mesa_score", {})
        if isinstance(ms, dict):
            for k, div in [("score10", 10.0), ("score", 100.0), ("score100", 100.0)]:
                v = ms.get(k)
                if v is not None:
                    try:
                        return float(min(1.0, max(0.0, float(v) / div)))
                    except Exception:
                        pass
        return 0.5

    @staticmethod
    def get_radar(decision: dict) -> float:
        if not isinstance(decision, dict):
            return 0.5
        ms = decision.get("mesa_score", {})
        if isinstance(ms, dict):
            for k in ("score10", "radar10", "radar", "optimal_radar"):
                v = ms.get(k)
                if v is not None:
                    try:
                        return float(min(1.0, max(0.0, float(v) / 10.0)))
                    except Exception:
                        pass
        return 0.5

    @staticmethod
    def get_operational_state(decision: dict) -> str:
        if not isinstance(decision, dict):
            return "UNKNOWN"
        hud = decision.get("_hud_cond_state")
        if isinstance(hud, str) and hud.strip():
            u = hud.strip().upper()
            if "ABORT" in u: return "ABORT"
            if "CAUTION" in u: return "CAUTION"
            if "OPTIMAL" in u: return "OPTIMAL"
            if "CRITICAL" in u: return "CRITICAL"
        for k in ("operational_state", "op_state", "state", "table_alert"):
            v = decision.get(k)
            if isinstance(v, dict):
                v = v.get("level") or v.get("name") or v.get("state")
            if isinstance(v, str):
                u = v.upper()
                if "ABORT" in u: return "ABORT"
                for tag in ("OPTIMAL", "CAUTION", "CRITICAL"):
                    if tag in u: return tag
                if "OK" in u or "GREEN" in u: return "OPTIMAL"
                if "WARN" in u or "YELLOW" in u: return "CAUTION"
                if "STOP" in u or "BLOCK" in u: return "ABORT"
                if "RED" in u: return "CRITICAL"
        action = str(decision.get("final_action") or decision.get("action") or "").upper()
        if action == "BET": return "OPTIMAL"
        if action == "PROBE": return "CAUTION"
        return "UNKNOWN"

    @staticmethod
    def get_table_entropy_score(decision: dict, consec_losses: int = 0) -> float:
        hud_te = decision.get("_hud_table_entropy")
        if hud_te is not None:
            try:
                val = float(hud_te)
                if val > 1.0:
                    val = val / 100.0
                return max(0.0, min(1.0, val))
            except Exception:
                pass
        ms = decision.get("mesa_score", {})
        score10 = float(ms.get("score10", 5) or 5)
        mesa_norm = score10 / 10.0
        ci = decision.get("chaos_info", {})
        entropy_norm = float(ci.get("entropy_norm", 0.5) or 0.5)
        entropy_score = 1.0 - max(0.0, min(1.0, entropy_norm))
        consec_ratio = max(0.0, min(1.0, consec_losses / 7.0))
        consec_score = 1.0 - consec_ratio
        wi = decision.get("_wheel_expert_info", {})
        ws = wi.get("sector_scores", {}) if isinstance(wi, dict) else {}
        top_wheel = max(ws.values()) if ws else 0.25
        wheel_score = max(0.0, min(1.0, (float(top_wheel) - 0.25) / 0.35))
        cond = (mesa_norm * 0.40 + entropy_score * 0.25 + consec_score * 0.25 + wheel_score * 0.10)
        return max(0.0, min(1.0, cond))

    @staticmethod
    def get_entropy_norm(decision: dict) -> float:
        if not isinstance(decision, dict):
            return 0.5
        ci = decision.get("chaos_info", {})
        if isinstance(ci, dict):
            v = ci.get("entropy_norm")
            if v is not None:
                try:
                    return float(min(1.0, max(0.0, float(v))))
                except Exception:
                    pass
        ms = decision.get("mesa_score", {})
        if isinstance(ms, dict):
            v = ms.get("entropy_rel")
            if v is not None:
                try:
                    return float(min(1.0, max(0.0, float(v))))
                except Exception:
                    pass
        return 0.5

    @staticmethod
    def get_drift_level(decision: dict) -> float:
        if isinstance(decision, dict):
            ds = decision.get("drift_state") or decision.get("drift") or {}
            if isinstance(ds, dict):
                for k in ("level", "drift_level", "value"):
                    v = ds.get(k)
                    if v is not None:
                        try:
                            return float(min(1.0, max(0.0, float(v))))
                        except Exception:
                            pass
        try:
            _ctx = _get_state_ctx()
            _src = _ctx if _ctx is not None else st.session_state
            return float(min(1.0, max(0.0, float(_src.get("drift_level", 0.0)))))
        except Exception:
            return 0.0

    @staticmethod
    def get_session_counters() -> Dict[str, Dict[str, int]]:
        _ctx = _get_state_ctx()
        _src = _ctx if _ctx is not None else st.session_state
        c = _src.get("counters", {})
        return c if isinstance(c, dict) else {}


# ============================================================
#   CONFIDENCE SCORER (igual)
# ============================================================
class ConfidenceScorer:
    # (tu implementación exacta, no la cambio)
    @staticmethod
    def _normalize_engine_conf(conf_score: float) -> float:
        return float(min(1.0, max(0.0, conf_score)))

    @staticmethod
    def _normalize_motor_prob(p: float, bet_key: str) -> float:
        baseline = 24.0 / 37.0 if bet_key in ("docenas", "columnas") else 18.0 / 37.0
        if p <= baseline:
            return 0.0
        return float(min(1.0, (p - baseline) / 0.20))

    @staticmethod
    def _session_hr(counters: Dict[str, Dict[str, int]], bet_key: str) -> Tuple[float, int]:
        bk_map = {"docenas": "docenas", "columnas": "columnas", "color": "color", "paridad": "paridad", "rango": "rango"}
        c_key = bk_map.get(bet_key, bet_key)
        c = counters.get(c_key, {})
        wins = int(c.get("wins", 0) or 0)
        losses = int(c.get("losses", 0) or 0)
        n = wins + losses
        if n == 0:
            return 0.5, 0
        return wins / n, n

    @staticmethod
    def _max_consec_factor(counters: Dict[str, Dict[str, int]], bet_key: str) -> float:
        bk_map = {"docenas": "docenas", "columnas": "columnas", "color": "color", "paridad": "paridad", "rango": "rango"}
        c_key = bk_map.get(bet_key, bet_key)
        c = counters.get(c_key, {})
        consec = int(c.get("consec_errors", 0) or 0)
        factors = {0: 1.0, 1: 0.85, 2: 0.65, 3: 0.40}
        return factors.get(consec, 0.15)

    @staticmethod
    def _op_state_factor(state: str) -> float:
        return {"OPTIMAL": 1.0, "CAUTION": 0.55, "CRITICAL": 0.10, "UNKNOWN": 0.50}.get(state, 0.50)

    @classmethod
    def score_suggestion(cls,
                         suggestion: Dict[str, Any],
                         decision: dict,
                         counters: Dict[str, Dict[str, int]],
                         pilot: PilotState,
                         params: dict) -> Dict[str, Any]:
        bk = suggestion["bet_key"]
        c_engine = cls._normalize_engine_conf(suggestion["conf_score"])
        c_prob = cls._normalize_motor_prob(suggestion["p"], bk)
        c_hr, n_hr = cls._session_hr(counters, bk)
        c_max = cls._max_consec_factor(counters, bk)
        op_state = MotorReader.get_operational_state(decision)
        c_op = cls._op_state_factor(op_state)
        c_mesa = MotorReader.get_mesa_score(decision)
        c_radar = MotorReader.get_radar(decision)
        c_mr = (c_mesa + c_radar) / 2.0
        p_drift = MotorReader.get_drift_level(decision)
        p_streak = 1.0 - pilot.streak_factor()
        engine_track_hr, engine_track_n = pilot.engine_hit_rate(bk)
        engine_consec_hits = pilot.engine_consec_hits(bk)
        engine_consec_misses = pilot.engine_consec_misses(bk)
        score = (
            params["w_engine_conf"]   * c_engine
            + params["w_motor_prob"]  * c_prob
            + params["w_session_hr"]  * c_hr
            + params["w_max_consec"]  * c_max
            + params["w_op_state"]    * c_op
            + params["w_mesa_radar"]  * c_mr
            - params["p_drift"]       * p_drift
            - params["p_pilot_streak"]* p_streak
        )
        if engine_consec_hits >= 2:
            score += min(0.10, 0.04 * engine_consec_hits)
        if engine_consec_misses >= 2:
            score -= min(0.15, 0.05 * engine_consec_misses)
        score = float(max(0.0, min(1.0, score)))
        return {
            "bet_key": bk,
            "score": score,
            "score_pct": int(round(score * 100)),
            "label": suggestion["label"],
            "status": suggestion["status"],
            "pick": suggestion["pick"],
            "p": suggestion["p"],
            "edge": suggestion["edge"],
            "engine_conf_score": suggestion["conf_score"],
            "session_hr": c_hr,
            "session_n": n_hr,
            "max_consec_factor": c_max,
            "op_state": op_state,
            "engine_track_hr": engine_track_hr,
            "engine_track_n": engine_track_n,
            "engine_consec_hits": engine_consec_hits,
            "engine_consec_misses": engine_consec_misses,
            "components": {
                "engine_conf": c_engine,
                "motor_prob": c_prob,
                "session_hr": c_hr,
                "max_consec": c_max,
                "op_state": c_op,
                "mesa_radar": c_mr,
            },
            "penalties": {
                "drift": p_drift,
                "pilot_streak": p_streak,
            },
        }


# ============================================================
#   REGIME DETECTOR (igual)
# ============================================================
class RegimeDetector:
    @staticmethod
    def update(pilot: PilotState, params: dict) -> Optional[Dict[str, Any]]:
        hot_threshold = int(params.get("regime_hot_consec", 3))
        cool_threshold = int(params.get("regime_cool_consec", 3))
        active = pilot.raw.get("active_regime")
        if active:
            bk = active["bet_key"]
            misses = pilot.engine_consec_misses(bk)
            if misses >= cool_threshold:
                pilot.raw["regime_history"].append({
                    "bet_key": bk,
                    "ended_at_spin": pilot.raw.get("last_processed_spin_count", 0),
                    "reason": f"{misses} fallos consecutivos del motor en {bk}",
                })
                pilot.raw["active_regime"] = None
                return {"event": "REGIME_ENDED", "bet_key": bk, "reason": f"{misses} fallos seguidos del motor"}
            consec_hits = pilot.engine_consec_hits(bk)
            return {"event": "REGIME_ACTIVE", "bet_key": bk, "consec_hits": active.get("max_consec_hits_observed", consec_hits)}
        for bk in ("docenas", "columnas", "color", "paridad", "rango"):
            consec = pilot.engine_consec_hits(bk)
            if consec >= hot_threshold:
                pilot.raw["active_regime"] = {
                    "bet_key": bk,
                    "started_at_spin": pilot.raw.get("last_processed_spin_count", 0),
                    "consec_hits_at_start": consec,
                    "max_consec_hits_observed": consec,
                }
                return {"event": "REGIME_STARTED", "bet_key": bk, "consec_hits": consec}
        return None


# ============================================================
#   BANKROLL GUARDIAN (igual)
# ============================================================
class BankrollGuardian:
    @staticmethod
    def n_lines_for_pick(bet_key: str, pick: Any) -> int:
        if bet_key not in ("docenas", "columnas"):
            return 1
        if isinstance(pick, (list, tuple)):
            return len(pick) if len(pick) > 0 else 1
        if isinstance(pick, str):
            try:
                nums = _parse_picks_from_str(pick, bet_key)
                if nums:
                    return len(nums)
            except Exception:
                pass
        return 1

    @staticmethod
    def base_stake_total(bet_key: str, pick: Any, params: dict) -> float:
        base = float(params.get("stake_base", 1000))
        n_lines = BankrollGuardian.n_lines_for_pick(bet_key, pick)
        return base * n_lines

    @staticmethod
    def stake_total_for_pick(level: int, bet_key: str, pick: Any,
                              last_stake_total: float, params: dict,
                              last_bet_key: Optional[str] = None) -> Tuple[float, float]:
        n_lines = BankrollGuardian.n_lines_for_pick(bet_key, pick)
        if level <= 1 or last_stake_total <= 0:
            stake_total = BankrollGuardian.base_stake_total(bet_key, pick, params)
        else:
            new_is_double = bet_key in ("docenas", "columnas")
            last_was_double = last_bet_key in ("docenas", "columnas") if last_bet_key else new_is_double
            mult_simple = float(params.get("progression_simple", 2))
            mult_double = float(params.get("progression_doc_col", 3))
            if last_was_double and new_is_double:
                mult = mult_double
            elif last_was_double and not new_is_double:
                mult = mult_simple
            elif (not last_was_double) and (not new_is_double):
                mult = mult_simple
            else:
                mult = mult_simple * mult_double
            stake_total = float(last_stake_total) * mult
        stake_per_line = stake_total / n_lines if n_lines > 0 else stake_total
        return stake_per_line, stake_total

    @staticmethod
    def authorize(level: int, score: float, op_state: str, params: dict) -> Tuple[bool, str]:
        max_lvl = int(params.get("max_progression_level", 4))
        if level > max_lvl:
            return False, f"Nivel {level} > techo personal ({max_lvl})"
        if level == 1:
            return True, "Nivel base"
        if op_state == "CRITICAL":
            return False, "Estado CRITICAL"
        if op_state == "ABORT":
            return False, "Estado ABORT"
        return True, f"Nivel {level} autorizado"


# ============================================================
#   TQI (igual)
# ============================================================
def _compute_tqi(decision: dict, spins: List[int], pilot: PilotState) -> dict:
    god_conditions_score = 50.0
    try:
        hud_state = str(decision.get("_hud_cond_state", "") or "").upper()
        if hud_state == "OPTIMAL":
            hud_score = 100.0
        elif hud_state == "CAUTION":
            hud_score = 50.0
        else:
            hud_score = 0.0
        ms = decision.get("mesa_score", {})
        radar_10 = float(ms.get("score10", 5.0) or 5.0)
        if radar_10 >= 7.0:
            radar_score = 100.0
        elif radar_10 >= 5.0:
            radar_score = 50.0 + (radar_10 - 5.0) * 25.0
        else:
            radar_score = max(0.0, radar_10 * 10.0)
        entropy_pct = float(decision.get("_hud_table_entropy", 0.0) or 0.0) * 100.0
        if entropy_pct >= 50.0:
            entropy_tqi = 100.0
        elif entropy_pct >= 30.0:
            entropy_tqi = 50.0 + (entropy_pct - 30.0) * 2.5
        else:
            entropy_tqi = max(0.0, entropy_pct * 1.66)
        god_conditions_score = (hud_score * 0.40 + radar_score * 0.35 + entropy_tqi * 0.25)
    except Exception:
        pass

    risk_score = 95.0
    try:
        consec_now = int(pilot.raw.get("pilot_consec_errors", 0))
        max_consec = int(pilot.raw.get("pilot_max_consec_errors", 0))
        worst_cat_consec = 0
        try:
            _ctx = _get_state_ctx()
            _sanc_src = _ctx if _ctx is not None else st.session_state
            sanctions = _sanc_src.get("category_sanctions", {}) or {}
            for cat, info in sanctions.items():
                if isinstance(info, dict) and info.get("active"):
                    worst_cat_consec = max(worst_cat_consec, int(info.get("consec_errors", 0)))
        except Exception:
            pass
        worst_consec = max(consec_now, worst_cat_consec)
        if worst_consec == 0:
            risk_score = 95.0
        elif worst_consec == 1:
            risk_score = 80.0
        elif worst_consec == 2:
            risk_score = 60.0
        elif worst_consec == 3:
            risk_score = 40.0
        else:
            risk_score = max(15.0, 40.0 - (worst_consec - 3) * 8.0)
        if max_consec >= 5:
            risk_score *= 0.85
        elif max_consec >= 4:
            risk_score *= 0.92
    except Exception:
        pass

    performance_score = 70.0
    try:
        ccs_buckets = pilot.raw.get("ccs_buckets", {}) or {}
        total_go = sum(int(b.get("go_count", 0)) for b in ccs_buckets.values())
        total_hits = sum(int(b.get("hits", 0)) for b in ccs_buckets.values())
        global_hr = (total_hits / total_go) if total_go > 0 else 0.0
        hist = pilot.raw.get("tqi_history", []) or []
        recent_results = [h.get("_pilot_hit") for h in hist[-15:] if h.get("_pilot_hit") is not None]
        if len(recent_results) >= 5:
            recent_hr = sum(1 for r in recent_results if r) / len(recent_results)
            performance_score = max(20.0, min(100.0, recent_hr * 130.0 + 5.0))
        elif total_go >= 5:
            performance_score = max(20.0, min(100.0, global_hr * 130.0 + 5.0))
    except Exception:
        pass

    coherence_score = 60.0
    try:
        bet_advice = decision.get("bet_advice", {}) if isinstance(decision, dict) else {}
        if isinstance(bet_advice, dict):
            n_bet_high_conf = 0
            n_bet_total = 0
            for cat, info in bet_advice.items():
                if not isinstance(info, dict):
                    continue
                status = str(info.get("status", "")).upper()
                if status in ("BET", "EXPLOIT"):
                    n_bet_total += 1
                    conf = float(info.get("conf_score", 0.0) or 0.0)
                    if conf >= 0.60:
                        n_bet_high_conf += 1
            if n_bet_total == 0:
                coherence_score = 55.0
            elif n_bet_high_conf == 0:
                coherence_score = 50.0
            elif n_bet_high_conf == 1:
                coherence_score = 70.0
            elif n_bet_high_conf == 2:
                coherence_score = 85.0
            elif n_bet_high_conf >= 3:
                coherence_score = 95.0
    except Exception:
        pass

    final_score = (god_conditions_score * 0.70 + risk_score * 0.15 + performance_score * 0.10 + coherence_score * 0.05)
    final_score = max(0.0, min(100.0, final_score))

    if final_score >= 80:
        label = "MESA EXCELENTE"; color = "#00d26a"; advisory = "Entrar con confianza"
    elif final_score >= 65:
        label = "MESA SALUDABLE"; color = "#5fe6d0"; advisory = "Operar normal"
    elif final_score >= 50:
        label = "MESA DUDOSA"; color = "#f5a623"; advisory = "Bajar agresividad"
    elif final_score >= 35:
        label = "MESA DETERIORADA"; color = "#ff7755"; advisory = "Solo PRO+GOD intersección"
    else:
        label = "MESA TÓXICA"; color = "#f8312f"; advisory = "Considerar parar sesión"

    trend = "stable"
    trend_delta = 0
    try:
        hist = pilot.raw.get("tqi_history", []) or []
        if len(hist) >= 5:
            old_score = float(hist[-5].get("score", final_score))
            trend_delta = int(round(final_score - old_score))
            if trend_delta >= 8:
                trend = "rising"
            elif trend_delta <= -8:
                trend = "falling"
            else:
                trend = "stable"
    except Exception:
        pass

    return {
        "score": int(round(final_score)),
        "label": label,
        "color": color,
        "advisory": advisory,
        "components": {
            "stability": int(round(god_conditions_score)),
            "performance": int(round(performance_score)),
            "risk": int(round(risk_score)),
            "coherence": int(round(coherence_score)),
        },
        "trend": trend,
        "trend_delta": trend_delta,
    }


def _record_tqi(pilot: PilotState, tqi: dict, decision: dict, spins_count: int):
    try:
        hist = pilot.raw.get("tqi_history", []) or []
        mesa = decision.get("mesa_score", {}) if isinstance(decision, dict) else {}
        chaos = decision.get("chaos_info", {}) if isinstance(decision, dict) else {}
        op_state = str(decision.get("_hud_cond_state", "") or "").upper()
        if not op_state:
            op_state = str(decision.get("operational_state", "") or "").upper()
        entry = {
            "spin_idx": int(spins_count),
            "score": int(tqi.get("score", 0)),
            "_mesa_radar": float(mesa.get("score10", 5.0) if isinstance(mesa, dict) else 5.0),
            "_entropy": float(chaos.get("entropy_norm", 0.5) if isinstance(chaos, dict) else 0.5),
            "_op_state": op_state or "UNKNOWN",
            "_pilot_hit": None,
        }
        hist.append(entry)
        if len(hist) > 60:
            hist = hist[-60:]
        pilot.raw["tqi_history"] = hist
    except Exception:
        pass


# ============================================================
#   API PRINCIPAL evaluate (con corrección en el GOD-STRICT)
# ============================================================
def evaluate(decision: dict, spins: List[int],
             params: Optional[dict] = None) -> Dict[str, Any]:
    p = dict(DEFAULT_PARAMS)
    if params:
        p.update(params)

    pilot = PilotState.get()

    regime_event_dict = RegimeDetector.update(pilot, p)
    regime_event = regime_event_dict.get("event") if regime_event_dict else None

    op_state = MotorReader.get_operational_state(decision)
    mesa = MotorReader.get_mesa_score(decision)
    radar = MotorReader.get_radar(decision)
    drift = MotorReader.get_drift_level(decision)
    entropy_norm = MotorReader.get_entropy_norm(decision)

    suggestions = MotorReader.get_active_suggestions(decision, allowed_status=p["consume_status"])
    counters = MotorReader.get_session_counters()

    if not suggestions:
        opinion = _build_opinion_no_suggestion(op_state, mesa, radar, drift, regime_event_dict)
        _result = _build_verdict(
            verdict="STAND_DOWN",
            chosen=None,
            all_scored=[],
            pilot=pilot,
            op_state=op_state,
            regime_event=regime_event,
            regime_event_dict=regime_event_dict,
            opinion=opinion,
            params=p,
            spins_count=len(spins),
        )
        try:
            _tqi = _compute_tqi(decision, spins, pilot)
            _result["tqi"] = _tqi
            _record_tqi(pilot, _tqi, decision, len(spins))
        except Exception as _tqi_err:
            _logger.warning(f"TQI compute falló: {_tqi_err}")
            _result["tqi"] = None
        pilot.raw["last_verdict"] = _result
        return _result

    scored_all = [ConfidenceScorer.score_suggestion(s, decision, counters, pilot, p)
                  for s in suggestions]

    sanctioned_set = set()
    sc_raw = decision.get("_sanctioned_categories") if isinstance(decision, dict) else None
    if isinstance(sc_raw, (list, tuple, set)):
        sanctioned_set = {str(x).strip().lower() for x in sc_raw}

    if sanctioned_set:
        scored = [x for x in scored_all if str(x.get("bet_key", "")).lower() not in sanctioned_set]
        if not scored:
            _logger.info(f"[PILOT] Todas las sugerencias sancionadas ({sanctioned_set}). STAND_DOWN forzado.")
            scored = scored_all
    else:
        scored = scored_all

    scored.sort(key=lambda x: -x["score"])

    override_bk = pilot.raw.get("override_bet_key")
    chosen_default = scored[0]
    chosen = chosen_default

    if override_bk:
        ovr_match = None
        for s in scored:
            if str(s.get("bet_key", "")).lower() == str(override_bk).lower():
                ovr_match = s
                break
        if ovr_match is not None and str(ovr_match.get("bet_key", "")).lower() not in sanctioned_set:
            chosen = ovr_match
            ovr_pick = pilot.raw.get("override_pick")
            if ovr_pick is not None:
                chosen = dict(chosen)
                chosen["pick"] = ovr_pick
                try:
                    chosen["pick_pretty"] = _pretty_pick(chosen["bet_key"], ovr_pick)
                except Exception:
                    pass
            _logger.info(f"[OVERRIDE] Aplicando elección del operador: {chosen.get('bet_key', '?').upper()}")
        else:
            _logger.info(f"[OVERRIDE] {override_bk.upper()} ya no está en sugerencias. Liberando override.")
            pilot.raw["override_bet_key"] = None
            pilot.raw["override_pick"] = None
            pilot.raw["override_activated_at"] = None

    chosen_score = chosen["score"]

    all_sanctioned = bool(sanctioned_set) and all(
        str(x.get("bet_key", "")).lower() in sanctioned_set for x in scored_all
    )

    veto_reasons = []
    if op_state == "ABORT":
        veto_reasons.append("HUD ABORT")
    elif op_state == "CRITICAL":
        veto_reasons.append("HUD CRITICAL")
    if all_sanctioned:
        veto_reasons.append("Todas las categorías sancionadas")
    veto_active = bool(veto_reasons)

    thr_go = p["thr_go"]
    thr_wait = p["thr_wait"]
    if op_state == "CAUTION":
        thr_go = p["thr_go_caution"]
    if op_state == "CRITICAL":
        thr_go = p["thr_go_critical"]

    if veto_active:
        verdict = "STAND_DOWN"
    elif chosen_score >= thr_go:
        verdict = "GO"
    elif chosen_score >= thr_wait:
        verdict = "WAIT"
    else:
        verdict = "STAND_DOWN"

    if regime_event == "REGIME_ENDED":
        cur_progression = int(pilot.raw.get("progression_level", 1))
        if cur_progression <= 1:
            verdict = "STAND_DOWN"
        else:
            _logger.info(f"[PROGRESSION] REGIME_ENDED ignorado (level={cur_progression}). Manteniendo progresión.")

    # Modo PRO
    pro_mode_active = bool(pilot.raw.get("pro_mode_active", False))
    pro_mode_blocked_now = False
    is_god_active_for_pro = (op_state == "OPTIMAL" and radar >= 0.70)
    if pro_mode_active and verdict == "GO" and chosen is not None and not is_god_active_for_pro:
        pro_thr = float(pilot.raw.get("pro_mode_threshold", 0.72))
        if chosen_score < pro_thr:
            verdict = "STAND_DOWN"
            pro_mode_blocked_now = True
            pilot.raw["pro_mode_blocked"] = int(pilot.raw.get("pro_mode_blocked", 0)) + 1
            _logger.info(f"[PRO-MODE] BLOQUEADO GO {chosen_score*100:.0f}% < {pro_thr*100:.0f}%")

    # Filtro GOD histórico
    god_filter_active = bool(pilot.raw.get("god_filter_active", False))
    god_filter_blocked_now = False
    god_filter_reason = ""
    if god_filter_active and verdict == "GO" and chosen is not None and not pro_mode_blocked_now:
        gf_thr = float(pilot.raw.get("god_filter_threshold", 0.65))
        gf_min_n = int(pilot.raw.get("god_filter_min_n", 8))
        chosen_bk = str(chosen.get("bet_key", "")).lower()
        god_stats = decision.get("_god_category_stats", {}) if isinstance(decision, dict) else {}
        if isinstance(god_stats, dict) and chosen_bk in god_stats:
            cat_data = god_stats[chosen_bk] or {}
            cat_n = int(cat_data.get("wins", 0)) + int(cat_data.get("losses", 0))
            cat_hr = float(cat_data.get("hit_rate", 0.0))
            if cat_n >= gf_min_n and cat_hr < gf_thr:
                verdict = "STAND_DOWN"
                god_filter_blocked_now = True
                god_filter_reason = f"{chosen_bk.upper()} hit-rate GOD {cat_hr*100:.0f}% < {gf_thr*100:.0f}% (n={cat_n})"
                pilot.raw["god_filter_blocked"] = int(pilot.raw.get("god_filter_blocked", 0)) + 1
                _logger.info(f"[GOD-FILTER] BLOQUEADO GO en {chosen_bk}: {god_filter_reason}")

    if veto_active:
        opinion = "🛑 VETO: " + " · ".join(veto_reasons) + ". No apuestes."
    elif pro_mode_blocked_now:
        pro_thr_pct = int(float(pilot.raw.get("pro_mode_threshold", 0.72)) * 100)
        score_pct = int(chosen_score * 100) if chosen else 0
        opinion = f"⭐ MODO PRO: GO al {score_pct}% bloqueado (umbral {pro_thr_pct}%). Esperando confianza superior."
    elif god_filter_blocked_now:
        opinion = f"⛨ FILTRO GOD: {god_filter_reason}. Esa categoría no rinde lo suficiente en esta mesa."
    else:
        opinion = _build_opinion(verdict, chosen, op_state, mesa, radar, drift, regime_event_dict, scored)

    pilot.raw["last_evaluated_spin_count"] = len(spins)
    _result = _build_verdict(
        verdict=verdict,
        chosen=chosen,
        all_scored=scored,
        pilot=pilot,
        op_state=op_state,
        regime_event=regime_event,
        regime_event_dict=regime_event_dict,
        opinion=opinion,
        params=p,
        spins_count=len(spins),
    )
    try:
        _tqi = _compute_tqi(decision, spins, pilot)
        _result["tqi"] = _tqi
        _record_tqi(pilot, _tqi, decision, len(spins))
    except Exception as _tqi_err:
        _logger.warning(f"TQI compute falló: {_tqi_err}")
        _result["tqi"] = None
    pilot.raw["last_verdict"] = _result
    return _result


def _build_verdict(verdict, chosen, all_scored, pilot, op_state,
                   regime_event, regime_event_dict, opinion, params, spins_count):
    if chosen is None:
        pick_bet = None
        ccs = 0.0
    else:
        level = pilot.raw["progression_level"]
        auth_ok, auth_reason = BankrollGuardian.authorize(level, chosen["score"], op_state, params)
        if not auth_ok and level > 1:
            verdict = "STAND_DOWN"
        last_stake_total = float(pilot.raw.get("last_stake_total", 0.0))
        last_bet_key = pilot.raw.get("last_bet_key")
        stake_per, stake_total = BankrollGuardian.stake_total_for_pick(
            level, chosen["bet_key"], chosen["pick"], last_stake_total, params, last_bet_key=last_bet_key)
        pick_bet = {
            "bet_key": chosen["bet_key"],
            "label": chosen["label"],
            "pick": chosen["pick"],
            "pick_pretty": _pretty_pick(chosen["bet_key"], chosen["pick"]),
            "score_pct": chosen["score_pct"],
            "stake_per_line": stake_per,
            "stake_total": stake_total,
            "level": level,
            "internal_level": level,
            "level_authorized": auth_ok,
            "level_reason": auth_reason,
            "session_hr": chosen["session_hr"],
            "session_n": chosen["session_n"],
            "engine_consec_hits": chosen["engine_consec_hits"],
            "engine_consec_misses": chosen["engine_consec_misses"],
            "p": chosen["p"],
            "edge": chosen["edge"],
        }
        ccs = chosen["score"]

    result = {
        "verdict": verdict,
        "ccs": ccs,
        "ccs_pct": int(round(ccs * 100)),
        "pick_bet": pick_bet,
        "all_suggestions": [
            {
                "bet_key": s["bet_key"],
                "label": s["label"],
                "pick_pretty": _pretty_pick(s["bet_key"], s["pick"]),
                "score_pct": s["score_pct"],
                "session_hr": s["session_hr"],
                "session_n": s["session_n"],
                "p": s["p"],
                "engine_consec_hits": s["engine_consec_hits"],
            } for s in all_scored
        ],
        "op_state": op_state,
        "regime_event": regime_event,
        "regime_info": regime_event_dict or {},
        "opinion": opinion,
        "session_stats": {
            "bets_emitted": pilot.raw["bets_emitted"],
            "bets_hits": pilot.raw["bets_hits"],
            "bets_misses": pilot.raw["bets_misses"],
            "hit_rate_pct": pilot.hit_rate() * 100.0,
            "current_streak": pilot.raw["current_streak"],
            "profit_session": pilot.raw["profit_session"],
            "pilot_consec_errors": int(pilot.raw.get("pilot_consec_errors", 0)),
            "pilot_max_consec_errors": int(pilot.raw.get("pilot_max_consec_errors", 0)),
            "pilot_total_errors": int(pilot.raw.get("pilot_total_errors", 0)),
            "pilot_total_bets": int(pilot.raw.get("pilot_total_bets", 0)),
            "pilot_avg_errors": (
                float(pilot.raw.get("pilot_total_errors", 0)) / max(1, int(pilot.raw.get("pilot_total_bets", 0)))
            ),
        },
        "pro_mode": {
            "active": bool(pilot.raw.get("pro_mode_active", False)),
            "threshold": float(pilot.raw.get("pro_mode_threshold", 0.72)),
            "blocked": int(pilot.raw.get("pro_mode_blocked", 0)),
        },
        "god_filter": {
            "active": bool(pilot.raw.get("god_filter_active", False)),
            "threshold": float(pilot.raw.get("god_filter_threshold", 0.65)),
            "min_n": int(pilot.raw.get("god_filter_min_n", 8)),
            "blocked": int(pilot.raw.get("god_filter_blocked", 0)),
        },
        "operator_override": {
            "active": bool(pilot.raw.get("override_bet_key")),
            "bet_key": pilot.raw.get("override_bet_key"),
            "pick": pilot.raw.get("override_pick"),
            "count": int(pilot.raw.get("override_count", 0)),
        },
        "n_spins": spins_count,
    }
    pilot.raw["last_verdict"] = result
    return result


# ============================================================
#   FORMATO HUMANO (pretty_pick y parseo)
# ============================================================
def _docena_from_range(lo: int, hi: int) -> Optional[int]:
    if 1 <= lo <= 12 and hi <= 12:
        return 1
    if 13 <= lo <= 24 and hi <= 24:
        return 2
    if 25 <= lo <= 36 and hi <= 36:
        return 3
    return None


def _parse_picks_from_str(pick_str: str, bet_key: str) -> List[int]:
    """Convierte cualquier string de pick del motor a lista de números (1,2,3)."""
    if not isinstance(pick_str, str):
        return []
    s = pick_str.strip().lower()
    import re
    
    # Eliminar palabras "columna", "docena", "d", "c" y normalizar
    s = re.sub(r'\bcolumna\s*\d+\b', lambda m: m.group().split()[-1], s)
    s = re.sub(r'\bdocena\s*\d+\b', lambda m: m.group().split()[-1], s)
    s = re.sub(r'\b[dDcC](\d)\b', r'\1', s)
    
    # Separar por /, +, , (pero no el guion de rangos)
    parts = re.split(r'[ /+,]+', s)
    out = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            try:
                a, b = map(int, part.split('-'))
                if bet_key == "docenas":
                    if a >= 1 and b <= 12:
                        out.append(1)
                    elif a >= 13 and b <= 24:
                        out.append(2)
                    elif a >= 25 and b <= 36:
                        out.append(3)
                    else:
                        for n in range(a, b+1):
                            if 1 <= n <= 3 and n not in out:
                                out.append(n)
                elif bet_key == "columnas":
                    for n in range(a, b+1):
                        if 1 <= n <= 3 and n not in out:
                            out.append(n)
            except:
                pass
        else:
            try:
                n = int(part)
                if 1 <= n <= 3:
                    if n not in out:
                        out.append(n)
                elif bet_key == "docenas" and 1 <= n <= 36:
                    d = 1 if n <= 12 else 2 if n <= 24 else 3
                    if d not in out:
                        out.append(d)
                elif bet_key == "columnas" and 1 <= n <= 36:
                    col = 1 if n % 3 == 1 else 2 if n % 3 == 2 else 3
                    if col not in out:
                        out.append(col)
            except:
                pass
    return out


def _pretty_pick(bet_key: str, pick: Any) -> str:
    if pick is None:
        return "—"
    if bet_key in ("docenas", "columnas"):
        prefix = "D" if bet_key == "docenas" else "C"
        if isinstance(pick, (list, tuple)):
            nums = []
            for x in pick:
                try:
                    n = int(x)
                    if 1 <= n <= 3:
                        nums.append(n)
                except Exception:
                    continue
            if nums:
                return " + ".join(f"{prefix}{n}" for n in sorted(nums))
            return "—"
        if isinstance(pick, str):
            nums = _parse_picks_from_str(pick, bet_key)
            if nums:
                return " + ".join(f"{prefix}{n}" for n in sorted(nums))
            return "—"
        try:
            n = int(pick)
            if 1 <= n <= 3:
                return f"{prefix}{n}"
            if bet_key == "docenas":
                if 1 <= n <= 12: return "D1"
                if 13 <= n <= 24: return "D2"
                if 25 <= n <= 36: return "D3"
            if bet_key == "columnas":
                c1 = {1,4,7,10,13,16,19,22,25,28,31,34}
                c2 = {2,5,8,11,14,17,20,23,26,29,32,35}
                c3 = {3,6,9,12,15,18,21,24,27,30,33,36}
                if n in c1: return "C1"
                if n in c2: return "C2"
                if n in c3: return "C3"
        except Exception:
            pass
        return "—"
    if bet_key == "color":
        if isinstance(pick, str):
            v = pick.lower()
            if "rojo" in v or "red" in v: return "ROJO"
            if "negro" in v or "black" in v: return "NEGRO"
        return str(pick).upper()
    if bet_key == "paridad":
        if isinstance(pick, str):
            v = pick.lower()
            if "par" in v and "imp" not in v: return "PAR"
            if "imp" in v: return "IMPAR"
        return str(pick).upper()
    if bet_key == "rango":
        if isinstance(pick, str):
            v = pick.lower()
            if "baj" in v or "1-18" in v: return "1-18 (BAJO)"
            if "alt" in v or "19" in v or "alto" in v: return "19-36 (ALTO)"
        return str(pick).upper()
    return str(pick)


def _build_opinion(verdict, chosen, op_state, mesa, radar, drift, regime_event_dict, all_scored):
    if regime_event_dict and regime_event_dict.get("event") == "REGIME_STARTED":
        bk = regime_event_dict["bet_key"]
        return f"⚡ Sesgo iniciando en {bk.upper()} ({regime_event_dict['consec_hits']} hits seguidos del motor). Aprovecha."
    if regime_event_dict and regime_event_dict.get("event") == "REGIME_ENDED":
        bk = regime_event_dict["bet_key"]
        return f"⛔ Sesgo de {bk.upper()} terminado. {regime_event_dict.get('reason','')}. Sal o resetea."
    mesa_pct = int(mesa * 100)
    radar10 = int(radar * 10)
    if verdict == "STAND_DOWN":
        if op_state == "CRITICAL":
            return "🛑 Mesa CRÍTICA. No apuestes."
        if not chosen:
            return f"Motor sin sugerencias activas. Mesa {mesa_pct}%, radar {radar10}/10. Espera."
        return f"Mejor opción ({chosen['label']}) tiene confianza baja ({chosen['score_pct']}%). Espera."
    if verdict == "WAIT":
        return f"Cerca pero no aún. Mesa {mesa_pct}%, radar {radar10}/10. Mejor opción {chosen['score_pct']}%."
    parts = []
    if op_state == "OPTIMAL":
        parts.append("Motor en OPTIMAL")
    elif op_state == "CAUTION":
        parts.append(f"Mesa {mesa_pct}% (caution) pero")
    n_high = sum(1 for s in all_scored if s["score_pct"] >= 60)
    if n_high >= 2:
        parts.append(f"{n_high} sugerencias convergiendo")
    if chosen and chosen["session_n"] >= 3 and chosen["session_hr"] >= 0.65:
        parts.append(f"{chosen['label']} viene {chosen['session_hr']*100:.0f}% en sesión")
    if chosen and chosen["engine_consec_hits"] >= 2:
        parts.append(f"motor en racha ({chosen['engine_consec_hits']} hits seguidos)")
    if not parts:
        parts.append("señales alineadas")
    return "✓ " + ", ".join(parts) + "."


def _build_opinion_no_suggestion(op_state, mesa, radar, drift, regime_event_dict):
    if regime_event_dict and regime_event_dict.get("event") == "REGIME_ENDED":
        return f"⛔ Sesgo terminado. {regime_event_dict.get('reason','')}."
    if op_state == "CRITICAL":
        return "🛑 Mesa CRÍTICA. Motor en bloqueo."
    if op_state == "CAUTION":
        return f"⚠ Motor en CAUTION. Mesa {int(mesa*100)}%, radar {int(radar*10)}/10. Sin sugerencias activas."
    return f"Motor sin sugerencias. Mesa {int(mesa*100)}%, radar {int(radar*10)}/10. Esperando."


# ============================================================
#   RECORD OUTCOME (CORREGIDO: uso de _check_hit robusto)
# ============================================================
def record_outcome(spin_result: int, last_verdict: dict):
    pilot = PilotState.get()
    try:
        _spins_src = _get_state_ctx()
        if _spins_src is None:
            import streamlit as _st
            _spins_src = _st.session_state
        spin_count_now = len(_spins_src.get("spins", []))
    except Exception:
        spin_count_now = pilot.raw.get("last_processed_spin_count", 0) + 1

    last_processed = int(pilot.raw.get("last_processed_spin_count", 0))
    if spin_count_now <= last_processed:
        _logger.info(f"[GUARD] record_outcome IGNORADO: spin {spin_count_now} ya procesado (last_processed={last_processed})")
        return

    pilot.raw["last_processed_spin_count"] = spin_count_now

    # 1) engine_track
    if isinstance(last_verdict, dict):
        all_sugs = last_verdict.get("all_suggestions") or []
        for s in all_sugs:
            bk = s.get("bet_key")
            pick = _extract_pick_for_match(s)
            hit = _check_hit(spin_result, bk, pick)
            pilot.record_engine_outcome(bk, hit)

    # 2) Pilot outcome
    if not isinstance(last_verdict, dict):
        return
    if last_verdict.get("verdict") != "GO":
        return
    pick_bet = last_verdict.get("pick_bet")
    if not isinstance(pick_bet, dict):
        return

    bk = pick_bet.get("bet_key")
    pick = pick_bet.get("pick")
    hit = _check_hit(spin_result, bk, pick)

    _logger.info(f"[RECORD-OUTCOME] spin={spin_result} bk={bk} pick={pick!r} pick_pretty={pick_bet.get('pick_pretty')!r} → hit={hit}")

    pilot.record_pilot_outcome(hit)

    # Actualizar TQI history
    try:
        hist = pilot.raw.get("tqi_history", []) or []
        if hist:
            hist[-1]["_pilot_hit"] = bool(hit)
            pilot.raw["tqi_history"] = hist
    except Exception:
        pass

    # CCS BUCKETS
    try:
        ccs_pct = last_verdict.get("ccs_pct")
        if ccs_pct is None:
            score = float(pick_bet.get("score", 0.0) or 0.0)
            ccs_pct = score * 100.0
        ccs_pct = float(ccs_pct)
        if ccs_pct < 70:
            bucket = "<70"
        elif ccs_pct < 75:
            bucket = "70-75"
        elif ccs_pct < 80:
            bucket = "75-80"
        elif ccs_pct < 85:
            bucket = "80-85"
        elif ccs_pct < 90:
            bucket = "85-90"
        else:
            bucket = "90+"
        buckets = pilot.raw.setdefault("ccs_buckets", {})
        b = buckets.setdefault(bucket, {"go_count": 0, "hits": 0})
        b["go_count"] = int(b.get("go_count", 0)) + 1
        if hit:
            b["hits"] = int(b.get("hits", 0)) + 1
        _logger.info(f"[CCS-TRACK] GO {ccs_pct:.0f}% bucket={bucket} bet={bk} → {'HIT' if hit else 'MISS'} (bucket: {b['hits']}/{b['go_count']})")
    except Exception as _e:
        _logger.warning(f"[CCS-TRACK] error: {_e}")

    # LEVEL BUCKETS
    try:
        current_level = int(pilot.raw.get("progression_level", 1))
        level_key = f"L{min(max(current_level, 1), 4)}"
        level_buckets = pilot.raw.setdefault("level_buckets", {})
        lb = level_buckets.setdefault(level_key, {"go_count": 0, "hits": 0})
        lb["go_count"] = int(lb.get("go_count", 0)) + 1
        if hit:
            lb["hits"] = int(lb.get("hits", 0)) + 1
        _logger.info(f"[LEVEL-TRACK] {level_key} → {'HIT' if hit else 'MISS'} (level: {lb['hits']}/{lb['go_count']})")
    except Exception as _e:
        _logger.warning(f"[LEVEL-TRACK] error: {_e}")

    # Contadores de errores del Pilot
    pilot.raw["pilot_total_bets"] = int(pilot.raw.get("pilot_total_bets", 0)) + 1
    if hit:
        pilot.raw["pilot_consec_errors"] = 0
    else:
        new_consec = int(pilot.raw.get("pilot_consec_errors", 0)) + 1
        pilot.raw["pilot_consec_errors"] = new_consec
        if new_consec > int(pilot.raw.get("pilot_max_consec_errors", 0)):
            pilot.raw["pilot_max_consec_errors"] = new_consec
        pilot.raw["pilot_total_errors"] = int(pilot.raw.get("pilot_total_errors", 0)) + 1

    # Profit simulado
    stake_per = float(pick_bet.get("stake_per_line", 0.0))
    stake_total = float(pick_bet.get("stake_total", 0.0))
    if bk in ("docenas", "columnas"):
        n_lines = stake_total / stake_per if stake_per > 0 else 1
        if hit:
            if n_lines >= 2:
                pilot.raw["profit_session"] += stake_per
            else:
                pilot.raw["profit_session"] += stake_per * 2
        else:
            pilot.raw["profit_session"] -= stake_total
    elif bk in ("color", "paridad", "rango"):
        if hit:
            pilot.raw["profit_session"] += stake_total
        else:
            pilot.raw["profit_session"] -= stake_total

    # PROGRESIÓN
    if hit:
        pilot.raw["progression_level"] = 1
        pilot.raw["progression_loss"] = 0.0
        pilot.raw["progression_started_in_bet"] = None
        pilot.raw["last_stake_total"] = 0.0
        pilot.raw["last_bet_key"] = None
        if pilot.raw.get("override_bet_key"):
            _logger.info(f"[OVERRIDE] HIT en {bk.upper()} → liberando override")
            pilot.raw["override_bet_key"] = None
            pilot.raw["override_pick"] = None
            pilot.raw["override_activated_at"] = None
    else:
        pilot.raw["progression_loss"] += stake_total
        pilot.raw["last_stake_total"] = float(stake_total)
        pilot.raw["last_bet_key"] = bk
        max_lvl = 4
        cur_lvl = int(pilot.raw.get("progression_level", 1))
        if cur_lvl < max_lvl:
            pilot.raw["progression_level"] = cur_lvl + 1
            pilot.raw["progression_started_in_bet"] = bk
        else:
            pilot.raw["progression_level"] = 1
            pilot.raw["last_stake_total"] = 0.0
            pilot.raw["last_bet_key"] = None
            pilot.raw["progression_started_in_bet"] = None
            if pilot.raw.get("override_bet_key"):
                _logger.info(f"[OVERRIDE] MISS en L4 con {bk.upper()} → liberando override")
                pilot.raw["override_bet_key"] = None
                pilot.raw["override_pick"] = None
                pilot.raw["override_activated_at"] = None


def _extract_pick_for_match(s: Dict[str, Any]) -> Any:
    pp = s.get("pick_pretty", "")
    bk = s.get("bet_key", "")
    if bk in ("docenas", "columnas"):
        return _parse_picks_from_str(pp, bk)
    if bk == "color":
        if "ROJO" in pp.upper(): return "rojo"
        if "NEGRO" in pp.upper(): return "negro"
        return pp.lower()
    if bk == "paridad":
        if "IMPAR" in pp.upper(): return "impar"
        if "PAR" in pp.upper(): return "par"
        return pp.lower()
    if bk == "rango":
        if "BAJO" in pp.upper() or "1-18" in pp: return "bajo"
        if "ALTO" in pp.upper() or "19" in pp: return "alto"
        return pp.lower()
    return None


def _check_hit(spin: int, bet_key: str, pick: Any) -> bool:
    if spin == 0:
        return False
    n = int(spin)
    
    if bet_key in ("docenas", "columnas"):
        if pick is None:
            return False
        if isinstance(pick, (list, tuple)):
            picks = [int(x) for x in pick if x is not None]
        elif isinstance(pick, str):
            picks = _parse_picks_from_str(pick, bet_key)
        else:
            try:
                picks = [int(pick)]
            except:
                return False
        if bet_key == "docenas":
            target = 1 if 1 <= n <= 12 else 2 if 13 <= n <= 24 else 3
            return target in picks
        elif bet_key == "columnas":
            col = 1 if n % 3 == 1 else 2 if n % 3 == 2 else 3
            return col in picks
    
    if bet_key == "color":
        reds = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}
        is_red = n in reds
        v = str(pick).lower() if pick else ""
        if "rojo" in v or "red" in v:
            return is_red
        if "negro" in v or "black" in v:
            return not is_red
        return False
    if bet_key == "paridad":
        is_even = (n % 2 == 0)
        v = str(pick).lower() if pick else ""
        if v == "par" or "even" in v:
            return is_even
        if "imp" in v or "odd" in v:
            return not is_even
        return False
    if bet_key == "rango":
        is_low = (1 <= n <= 18)
        v = str(pick).lower() if pick else ""
        if "baj" in v or "1-18" in v or "low" in v:
            return is_low
        if "alt" in v or "19" in v or "high" in v:
            return not is_low
        return False
    return False


def is_god_active(hud_data: dict, decision: dict, verdict: dict = None,
                  operator_override: bool = False, table_health: dict = None):
    """ÚNICA fuente de verdad para 'estamos en GOD ahora'.

    Reglas GOD (las 6 deben cumplirse simultáneamente):
      1) HUD == OPTIMAL
      2) Radar (mesa_score.score10) ≥ 7/10
      3) Table Entropy (hud_data.cond × 100) ≥ 50/100
      4) TQI / Mesa Saludable (verdict.tqi.score) ≥ 70/100
      5) CCS del TOP PICK ≥ 69%
      6) Table Health (medidor lateral, analyze_table_health) ≥ 50/100

    Si operator_override=True, retorna (True, []) sin chequear nada.
    El operador asumió responsabilidad de su lectura visual.

    Returns:
        (active: bool, failed_reasons: list[str])
    """
    if operator_override:
        return True, []

    failed = []

    # 1) HUD == OPTIMAL
    hud_state = str((hud_data or {}).get("state", "")).strip().lower()
    if hud_state != "optimal":
        failed.append(f"HUD={hud_state.upper() or '—'}")

    # 2) Radar ≥ 7/10
    try:
        _ms = (decision or {}).get("mesa_score") or {}
        _s10 = float(_ms.get("score10", 0.0) or 0.0)
        radar = _s10 / 10.0 if _s10 > 1.0 else float(_s10)
    except Exception:
        radar = 0.0
    if radar < 0.70:
        failed.append(f"Radar={int(round(radar*10))}/10")

    # 3) Table Entropy ≥ 50/100 (cond compuesto del HUD)
    try:
        table_entropy = float((hud_data or {}).get("cond", 0.0) or 0.0)
    except Exception:
        table_entropy = 0.0
    if table_entropy < 0.50:
        failed.append(f"Entropy={int(round(table_entropy*100))}/100")

    # 4) TQI ≥ 70/100
    tqi = 0
    try:
        if isinstance(verdict, dict):
            _tqi_d = verdict.get("tqi") or {}
            if isinstance(_tqi_d, dict):
                tqi = int(_tqi_d.get("score", 0) or 0)
    except Exception:
        tqi = 0
    if tqi < 70:
        failed.append(f"Mesa={tqi}/100")

    # 5) CCS del TOP PICK ≥ 69%
    #    El "TARGET LOCK" visual de la card representa la convicción real
    #    de la apuesta principal. Si el CCS es bajo (< 69%), la mesa puede
    #    cumplir HUD/Radar/Entropy/TQI pero el pick no tiene fuerza
    #    estadística suficiente. Bloqueamos GOD en ese caso.
    top_ccs = 0
    try:
        if isinstance(verdict, dict):
            _pb = verdict.get("pick_bet") or {}
            if isinstance(_pb, dict):
                # score viene 0..1; score_pct viene 0..100
                if "score_pct" in _pb:
                    top_ccs = int(round(float(_pb.get("score_pct", 0.0) or 0.0)))
                else:
                    top_ccs = int(round(float(_pb.get("score", 0.0) or 0.0) * 100.0))
    except Exception:
        top_ccs = 0
    if top_ccs < 69:
        failed.append(f"CCS={top_ccs}/100")

    # 6) Table Health ≥ 50/100
    #    El medidor "TABLE ENTROPY" lateral (analyze_table_health del engine).
    #    Refleja la racha reciente real: arranca 50, +5 win / -4 loss en
    #    los últimos 15 spins. Si está bajo 50, la mesa viene perdedora
    #    y NO se debe operar aunque las otras condiciones se cumplan.
    th_score = 50
    try:
        if isinstance(table_health, dict):
            th_score = int(float(table_health.get("score", 50) or 50))
    except Exception:
        th_score = 50
    if th_score < 50:
        failed.append(f"Health={th_score}/100")

    return (len(failed) == 0), failed


def reset_pilot():
    st.session_state["pilot"] = PilotState._fresh()


def get_ccs_buckets() -> dict:
    try:
        pilot = PilotState.get()
        raw = pilot.raw.get("ccs_buckets", {}) or {}
        order = ["<70", "70-75", "75-80", "80-85", "85-90", "90+"]
        return {k: {"go_count": int(raw.get(k, {}).get("go_count", 0)),
                    "hits": int(raw.get(k, {}).get("hits", 0)),
                    "hit_rate": (int(raw.get(k, {}).get("hits", 0)) / int(raw.get(k, {}).get("go_count", 0))) if int(raw.get(k, {}).get("go_count", 0)) > 0 else 0.0}
                for k in order}
    except Exception:
        return {}


def get_level_buckets() -> dict:
    try:
        pilot = PilotState.get()
        raw = pilot.raw.get("level_buckets", {}) or {}
        return {k: {"go_count": int(raw.get(k, {}).get("go_count", 0)),
                    "hits": int(raw.get(k, {}).get("hits", 0)),
                    "hit_rate": (int(raw.get(k, {}).get("hits", 0)) / int(raw.get(k, {}).get("go_count", 0))) if int(raw.get(k, {}).get("go_count", 0)) > 0 else 0.0}
                for k in ("L1", "L2", "L3", "L4")}
    except Exception:
        return {}


def get_pro_mode() -> dict:
    try:
        pilot = PilotState.get()
        return {
            "active": bool(pilot.raw.get("pro_mode_active", False)),
            "threshold": float(pilot.raw.get("pro_mode_threshold", 0.72)),
            "blocked": int(pilot.raw.get("pro_mode_blocked", 0)),
        }
    except Exception:
        return {"active": False, "threshold": 0.72, "blocked": 0}


def set_pro_mode(active: bool = None, threshold: float = None) -> dict:
    try:
        pilot = PilotState.get()
        if active is not None:
            pilot.raw["pro_mode_active"] = bool(active)
        if threshold is not None:
            t = float(threshold)
            t = max(0.50, min(0.95, t))
            pilot.raw["pro_mode_threshold"] = t
        return get_pro_mode()
    except Exception:
        return {"active": False, "threshold": 0.72, "blocked": 0}


def get_god_filter() -> dict:
    try:
        pilot = PilotState.get()
        return {
            "active": bool(pilot.raw.get("god_filter_active", False)),
            "threshold": float(pilot.raw.get("god_filter_threshold", 0.65)),
            "min_n": int(pilot.raw.get("god_filter_min_n", 8)),
            "blocked": int(pilot.raw.get("god_filter_blocked", 0)),
        }
    except Exception:
        return {"active": False, "threshold": 0.65, "min_n": 8, "blocked": 0}


def set_god_filter(active: bool = None, threshold: float = None, min_n: int = None) -> dict:
    try:
        pilot = PilotState.get()
        if active is not None:
            pilot.raw["god_filter_active"] = bool(active)
        if threshold is not None:
            t = float(threshold)
            t = max(0.50, min(0.85, t))
            pilot.raw["god_filter_threshold"] = t
        if min_n is not None:
            n = int(min_n)
            n = max(3, min(50, n))
            pilot.raw["god_filter_min_n"] = n
        return get_god_filter()
    except Exception:
        return {"active": False, "threshold": 0.65, "min_n": 8, "blocked": 0}


def set_operator_override(bet_key: str, pick=None) -> dict:
    try:
        pilot = PilotState.get()
        bk = str(bet_key or "").lower().strip()
        if not bk:
            return get_operator_override()
        pilot.raw["override_bet_key"] = bk
        pilot.raw["override_pick"] = pick
        pilot.raw["override_activated_at"] = pilot.raw.get("last_processed_spin_count", 0)
        pilot.raw["override_count"] = int(pilot.raw.get("override_count", 0)) + 1
        _logger.info(f"[OVERRIDE] Operador activó override en {bk.upper()} (pick={pick})")
        return get_operator_override()
    except Exception:
        return {"active": False, "bet_key": None, "pick": None}


def clear_operator_override() -> dict:
    try:
        pilot = PilotState.get()
        pilot.raw["override_bet_key"] = None
        pilot.raw["override_pick"] = None
        pilot.raw["override_activated_at"] = None
        _logger.info("[OVERRIDE] Operador liberó override manualmente")
        return get_operator_override()
    except Exception:
        return {"active": False, "bet_key": None, "pick": None}


def get_operator_override() -> dict:
    try:
        pilot = PilotState.get()
        bk = pilot.raw.get("override_bet_key")
        return {
            "active": bool(bk),
            "bet_key": bk,
            "pick": pilot.raw.get("override_pick"),
            "activated_at": pilot.raw.get("override_activated_at"),
            "count": int(pilot.raw.get("override_count", 0)),
        }
    except Exception:
        return {"active": False, "bet_key": None, "pick": None}


def get_tqi_history(n_recent: int = 30) -> list:
    try:
        pilot = PilotState.get()
        hist = pilot.raw.get("tqi_history", []) or []
        return [{"spin_idx": int(h.get("spin_idx", 0)),
                 "score": int(h.get("score", 0)),
                 "hit": h.get("_pilot_hit")}
                for h in hist[-int(n_recent):]]
    except Exception:
        return []


def get_current_tqi() -> dict:
    try:
        pilot = PilotState.get()
        last_verdict = pilot.raw.get("last_verdict") or {}
        if isinstance(last_verdict, dict):
            tqi = last_verdict.get("tqi")
            if isinstance(tqi, dict):
                return tqi
        return {"score": 60, "label": "MESA NEUTRAL", "color": "#8a94a6",
                "advisory": "Sin datos suficientes",
                "components": {"stability": 50, "performance": 50,
                               "risk": 70, "coherence": 50},
                "trend": "stable", "trend_delta": 0}
    except Exception:
        return {"score": 60, "label": "MESA NEUTRAL", "color": "#8a94a6",
                "advisory": "Error al calcular",
                "components": {}, "trend": "stable", "trend_delta": 0}