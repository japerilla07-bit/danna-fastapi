"""
danna_core.bankroll
===================
Cálculo de settlement (liquidación) de apuestas y bankroll.
Lógica pura sin estado ni UI.

Extraído de app.py (migración Sesión A) — sin cambios de lógica.
"""

from danna_core.helpers import _safe_list_like
from danna_core.roulette import _mb_column_of, _mb_dozen_of


def _mb_get_advice(decision: dict, cat: str) -> dict:
    if not isinstance(decision, dict):
        return {}
    ba = decision.get("bet_advice", {}) or {}
    if isinstance(ba, dict):
        info = ba.get(cat, {}) or {}
        return info if isinstance(info, dict) else {}
    return {}

def _mb_compute_settlement(pending: dict, outcome: int) -> dict:
    """Compute stake_total, payout_total and net (payout_total - stake_total) plus leg breakdown.

    Conventions:
    - Even-money bets pay 1:1 (gross return = 2x stake on hit).
    - Dozens/columns pay 2:1 (gross return = 3x stake_on_winner on hit).
    - Single number (0) pays 35:1 (gross return = 36x stake on hit).
    - For split bets (two dozens/columns), 'stake_total' is split equally across selections.
    """
    bets = (pending or {}).get("bets", {}) if isinstance(pending, dict) else {}
    legs = []
    stake_total = 0.0
    payout_total = 0.0

    def _add_leg(name: str, stake: float, hit: bool, payout_ratio: float):
        nonlocal stake_total, payout_total, legs
        stake = float(stake or 0.0)
        if stake <= 0:
            return
        stake_total += stake
        gross = stake * (payout_ratio + 1.0) if hit else 0.0
        payout_total += gross
        legs.append({
            "bet": name,
            "stake": stake,
            "hit": bool(hit),
            "payout_ratio": float(payout_ratio),
            "gross": gross,
        })

    # Docenas / Columnas (split, max 2)
    outcome_dozen = _mb_dozen_of(outcome)
    outcome_col = _mb_column_of(outcome)

    def _split_legs(cat_name: str, key: str, outcome_label):
        data = bets.get(key, {})
        if not isinstance(data, dict):
            return
        total = float(data.get("stake_total", 0.0) or 0.0)
        choices = _safe_list_like(data.get("choices", []))
        if total <= 0 or not choices:
            return
        choices = list(choices)[:2]
        stake_each = total / max(len(choices), 1)
        for ch in choices:
            hit = (outcome_label is not None) and (str(ch) == str(outcome_label))
            _add_leg(f"{cat_name}: {ch}", stake_each, hit, 2.0)

    _split_legs("Docenas", "docenas", outcome_dozen)
    _split_legs("Columnas", "columnas", outcome_col)

    # Even-money bets
    for key, label_fn in [("color", _mb_color_of), ("paridad", _mb_parity_of), ("rango", _mb_range_of)]:
        data = bets.get(key, {})
        if not isinstance(data, dict):
            continue
        stake = float(data.get("stake", 0.0) or 0.0)
        pick = data.get("pick")
        if stake <= 0 or not pick:
            continue
        actual = label_fn(outcome)
        hit = (actual is not None) and (str(pick) == str(actual))
        _add_leg(f"{key.capitalize()}: {pick}", stake, hit, 1.0)

    # Zero (single number 0)
    data0 = bets.get("cero", {}) if isinstance(bets.get("cero"), dict) else {}
    stake0 = float(data0.get("stake", 0.0) or 0.0)
    if stake0 > 0:
        _add_leg("Número: 0", stake0, int(outcome) == 0, 35.0)

    net = payout_total - stake_total
    return {"stake_total": stake_total, "payout_total": payout_total, "net": net, "legs": legs}
