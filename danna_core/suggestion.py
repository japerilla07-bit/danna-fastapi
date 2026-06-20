"""
danna_core.suggestion
=====================
Cálculo de sugerencias de apuesta, bet advice y coherencia.
Lógica pura sin estado ni UI.

Extraído de app.py (migración Sesión A) — sin cambios de lógica.
"""

import math

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

from danna_core.constants import REDS, EPS
from danna_core.helpers import _safe_float, _safe_list_like, list_safe_list_like
from danna_core.evaluation import (
    _get_top_from_analysis, _get_top2_group3_from_analysis, _norm_pick,
)


def _entropy_from_probs(probs: list) -> float:
    p = np.array(probs, dtype=float)
    p = np.clip(p, EPS, 1.0)
    p = p / (p.sum() + EPS)
    return float(-(p * np.log(p)).sum())

def _approx_entropy_for_category(bet_key: str, top_p: float) -> float:
    if bet_key in ("color", "paridad", "rango"):
        return _entropy_from_probs([top_p, max(0.0, 1.0 - top_p)])
    if bet_key in ("docenas", "columnas"):
        rest = max(0.0, 1.0 - top_p)
        return _entropy_from_probs([top_p, rest / 2.0, rest / 2.0])
    return 0.0

def _baseline_for_bet(bet_key: str, selection_size: int = 1) -> float:
    if bet_key == "max_conf":
        return float(selection_size) / 37.0
    if bet_key in ("docenas", "columnas"):
        # selection_size==2 => cobertura TOP-2 (2 de 3 grupos)
        if int(selection_size or 1) >= 2:
            return 24 / 37.0
        return 12 / 37.0
    if bet_key in ("color", "paridad", "rango"):
        return 18 / 37.0
    return 1 / 37.0

def _derive_implied_from_numbers(nums: list):
    nums = [
        int(x)
        for x in _safe_list_like(nums)
        if isinstance(x, (int, np.integer)) or (isinstance(x, str) and str(x).isdigit())
    ]
    nums = [n for n in nums if 0 <= n <= 36]

    implied = {"color": None, "paridad": None, "rango": None, "docenas": None, "columnas": None}
    if not nums:
        return implied

    implied_color_counts = {}
    implied_parity_counts = {}
    implied_range_counts = {}
    implied_doc_counts = {}
    implied_col_counts = {}

    for n in nums:
        if n == 0:
            # Include 0 explicitly in derived coherence buckets
            implied_color_counts["verde"] = implied_color_counts.get("verde", 0) + 1
            implied_parity_counts["cero"] = implied_parity_counts.get("cero", 0) + 1
            implied_range_counts["cero"] = implied_range_counts.get("cero", 0) + 1
            implied_doc_counts["0"] = implied_doc_counts.get("0", 0) + 1
            implied_col_counts["0"] = implied_col_counts.get("0", 0) + 1
            continue

        # Color
        if n in REDS:
            implied_color_counts["rojo"] = implied_color_counts.get("rojo", 0) + 1
        else:
            implied_color_counts["negro"] = implied_color_counts.get("negro", 0) + 1

        # Paridad
        if n % 2 == 0:
            implied_parity_counts["par"] = implied_parity_counts.get("par", 0) + 1
        else:
            implied_parity_counts["impar"] = implied_parity_counts.get("impar", 0) + 1

        # Rango
        if 1 <= n <= 18:
            implied_range_counts["bajo"] = implied_range_counts.get("bajo", 0) + 1
        else:
            implied_range_counts["alto"] = implied_range_counts.get("alto", 0) + 1

        # Docenas
        if 1 <= n <= 12:
            implied_doc_counts["1"] = implied_doc_counts.get("1", 0) + 1
        elif 13 <= n <= 24:
            implied_doc_counts["2"] = implied_doc_counts.get("2", 0) + 1
        else:
            implied_doc_counts["3"] = implied_doc_counts.get("3", 0) + 1

        # Columnas
        mod = n % 3
        if mod == 0:
            col = "3"
        elif mod == 1:
            col = "1"
        else:
            col = "2"
        implied_col_counts[col] = implied_col_counts.get(col, 0) + 1

    def _unique_max_key(d: dict):
        if not d:
            return None
        mx = max(d.values())
        if mx <= 0:
            return None
        top = [k for k, v in d.items() if v == mx]
        if len(top) != 1:
            return None
        return top[0]

    implied["color"] = _unique_max_key(implied_color_counts)
    implied["paridad"] = _unique_max_key(implied_parity_counts)
    implied["rango"] = _unique_max_key(implied_range_counts)
    implied["docenas"] = _unique_max_key(implied_doc_counts)
    implied["columnas"] = _unique_max_key(implied_col_counts)

    return implied

def _compute_coherence(primary_bet: dict, suggestion_analysis: dict, bet_advice: dict):
    coherent = {"primary": {}, "consistent": [], "inconsistent": [], "neutral": []}
    if not isinstance(primary_bet, dict) or not primary_bet:
        return coherent

    coherent["primary"] = primary_bet
    pk = primary_bet.get("bet_key", None)

    if pk == "max_conf" and primary_bet.get("type") == "numbers":
        implied = _derive_implied_from_numbers(primary_bet.get("numbers", []))
        for k in ["docenas", "columnas", "color", "paridad", "rango"]:
            top_pick, top_p = _get_top_from_analysis(k, suggestion_analysis)
            if top_pick is None:
                coherent["neutral"].append(k)
                continue

            a = bet_advice.get(k, {}) if isinstance(bet_advice, dict) else {}
            status = (a.get("status", "WAIT") if isinstance(a, dict) else "WAIT")
            imp = implied.get(k, None)
            if imp is None:
                coherent["neutral"].append(k)
                continue

            if _norm_pick(top_pick, k) == _norm_pick(imp, k):
                if status in ("BET", "PROBE"):
                    coherent["consistent"].append(k)
                else:
                    coherent["neutral"].append(k)
            else:
                if status in ("BET", "PROBE") or _safe_float(top_p, 0.0) > 0.55:
                    coherent["inconsistent"].append(k)
                else:
                    coherent["neutral"].append(k)

        return coherent

    if isinstance(bet_advice, dict):
        for k, a in bet_advice.items():
            if not isinstance(a, dict):
                continue
            stt = a.get("status", "WAIT")
            if stt in ("BET", "PROBE"):
                coherent["consistent"].append(k)
            elif stt in ("WAIT", "OBSERVE"):
                coherent["inconsistent"].append(k)
            else:
                coherent["neutral"].append(k)
    return coherent

def _choose_primary_bet(suggestion_analysis: dict, cfl_metrics: dict, params: dict):
    risk_penalty_numbers = _safe_float(params.get("risk_penalty_numbers", 0.12), 0.12)
    numbers_need_margin = _safe_float(params.get("numbers_need_margin", 0.008), 0.008)

    H_nums = _safe_float((suggestion_analysis or {}).get("H_numeros", 0.0), 0.0)
    Hmax_nums = float(np.log(37.0))
    Hn = (H_nums / (Hmax_nums + EPS)) if Hmax_nums > 0 else 0.0

    candidates = []

    for k in ["docenas", "columnas", "color", "paridad", "rango"]:
        if k in ("docenas", "columnas"):
            pick, p, opts, _probs = _get_top2_group3_from_analysis(k, suggestion_analysis)
            if pick is None:
                continue
            base = _baseline_for_bet(k, selection_size=2 if len(opts) >= 2 else 1)
        else:
            pick, p = _get_top_from_analysis(k, suggestion_analysis)
            if pick is None:
                continue
            base = _baseline_for_bet(k)

        edge = p - base
        Hk = _approx_entropy_for_category(k, p)
        Hkmax = float(np.log(3.0)) if k in ("docenas", "columnas") else float(np.log(2.0))
        Hk_norm = (Hk / (Hkmax + EPS)) if Hkmax > 0 else 0.0
        score = edge - 0.05 * Hk_norm

        conf = max(0.0, min(1.0, edge / max(EPS, 1.0 - base)))
        candidates.append(
            {
                "bet_key": k,
                "label": k.capitalize(),
                "type": "simple",
                "pick": pick,
                "p": p,
                "baseline": base,
                "edge": edge,
                "conf_score": conf,
                "score": score,
                "reason": f"Edge={edge:+.3f} (p={p:.3f} vs base={base:.3f}) - Hpen={0.05*Hk_norm:.3f}",
            }
        )

    mc = (suggestion_analysis or {}).get("max_conf", {}) if isinstance(suggestion_analysis, dict) else {}
    nums = mc.get("selection", []) if isinstance(mc, dict) else []
    p_win = _safe_float(mc.get("p_win", 0.0), 0.0)

    if nums and isinstance(nums, (list, tuple, np.ndarray)):
        sel = [int(x) for x in list(nums) if isinstance(x, (int, np.integer)) and 0 <= int(x) <= 36]
        if sel:
            base = _baseline_for_bet("max_conf", selection_size=len(sel))
            edge = p_win - base
            score = edge - risk_penalty_numbers * Hn
            if edge < numbers_need_margin:
                score -= (numbers_need_margin - edge)

            conf = max(0.0, min(1.0, edge / max(EPS, 1.0 - base)))
            candidates.append(
                {
                    "bet_key": "max_conf",
                    "label": "Números",
                    "type": "numbers",
                    "pick": sel,
                    "numbers": sel,
                    "p": p_win,
                    "baseline": base,
                    "edge": edge,
                    "conf_score": conf,
                    "score": score,
                    "reason": f"Edge={edge:+.3f} (p={p_win:.3f} vs base={base:.3f}) - NumRisk={risk_penalty_numbers*Hn:.3f}",
                }
            )

    if not candidates:
        return {
            "bet_key": "max_conf",
            "label": "N/D",
            "type": "none",
            "conf_score": 0.0,
            "p": 0.0,
            "edge": 0.0,
            "score": -999,
            "reason": "Sin candidatos",
        }

    return max(candidates, key=lambda d: _safe_float(d.get("score", -999), -999))

def _build_bet_advice(decision_action: str, primary_bet: dict, suggestion_analysis: dict, params: dict):
    probe_conf_th = _safe_float(params.get("probe_conf_th", 0.40), 0.40)
    bet_advice = {}

    def add(k, label, pick, p, conf, status, reason):
        bet_advice[k] = {
            "label": label,
            "pick": pick,
            "p": _safe_float(p, 0.0),
            "conf_score": _safe_float(conf, 0.0),
            "status": status,
            "reason": reason,
        }

    primary_key = (primary_bet or {}).get("bet_key", None)

    def _pick_p_base_for(k: str):
        if k == "max_conf":
            mc = (suggestion_analysis or {}).get("max_conf", {}) if isinstance(suggestion_analysis, dict) else {}
            pick = list_safe_list_like(mc.get("selection", []))
            p = _safe_float(mc.get("p_win", 0.0), 0.0)
            base = _baseline_for_bet("max_conf", len(pick) if isinstance(pick, list) else 1)
            return pick, p, base

        if k in ("docenas", "columnas"):
            pick, p, opts, _probs = _get_top2_group3_from_analysis(k, suggestion_analysis)
            base = _baseline_for_bet(k, selection_size=2 if len(opts) >= 2 else 1)
            return pick, p, base

        pick, p = _get_top_from_analysis(k, suggestion_analysis)
        base = _baseline_for_bet(k)
        return pick, p, base

    if decision_action in ("WAIT", "OBSERVE"):
        for k in ["docenas", "columnas", "color", "paridad", "rango", "max_conf"]:
            pick, p, base = _pick_p_base_for(k)

            edge = p - base
            conf = max(0.0, min(1.0, edge / max(EPS, 1.0 - base)))

            # En WAIT/OBSERVE: siempre WAIT (no se fuerza PROBE/BET), pero el pick debe verse correctamente (TOP-2 en group_3)
            add(k, k.capitalize(), pick, p, conf, "WAIT", "Modo WAIT/OBSERVE")
        return bet_advice

    for k in ["docenas", "columnas", "color", "paridad", "rango", "max_conf"]:
        pick, p, base = _pick_p_base_for(k)

        edge = p - base
        conf = max(0.0, min(1.0, edge / max(EPS, 1.0 - base)))

        if k == primary_key:
            status = "BET" if decision_action == "EXPLOIT" else "PROBE"
            reason = "Apuesta principal"
        else:
            if conf >= probe_conf_th and edge > 0:
                status = "PROBE"
                reason = f"Conf>= {probe_conf_th:.2f} y edge>0"
            else:
                status = "WAIT"
                reason = "No supera umbral"

        add(k, k.capitalize(), pick, p, conf, status, reason)

    return bet_advice
