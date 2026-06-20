"""
danna_core.processor_helpers
=============================
Funciones de procesamiento que necesitan el `state` de la sesión.
Extraídas de app.py (migración Sesión B1) — la lógica es IDÉNTICA, solo
cambió la firma: ahora reciben `state` como primer parámetro en lugar de
leer `st.session_state` global.

`state` es un dict-like: puede ser st.session_state (Streamlit) o una
UserSession (FastAPI). Ambos soportan get/setdefault/__getitem__/__setitem__.

Las funciones que necesitan el motor reciben `engine_instance` como
keyword-only. Las que mostraban UI (toast) reciben callbacks opcionales.
"""

import os
import uuid
import logging
from datetime import datetime, timezone

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

# Motor (mismo módulo que usa app.py)
import engine as engine_module

# Funciones puras extraídas en Sesión A
from danna_core.helpers import (
    _safe_list_like, len_safe_list_like, _safe_int, _safe_float,
    _safe_text, _coalesce_none, _deep_jsonable, _first_present, _finite,
)
from danna_core.evaluation import (
    _lb_is_hit, _lb_payout_multiplier, _guardian_meta_from_decision,
)
from danna_core.suggestion import (
    _build_bet_advice, _choose_primary_bet, _compute_coherence,
)
from danna_core.bankroll import _mb_compute_settlement, _mb_get_advice
from danna_core.roulette import (
    _mb_color_of, _mb_parity_of, _mb_range_of, _mb_dozen_of, _mb_column_of,
)
from danna_core.session_io import _append_jsonl, _eh_keys_for_update

# Logger propio del core
_logger = logging.getLogger("danna_core")

# Path de logs derivado de DANNA_DATA_DIR (mismo criterio que app.py)
_DATA_DIR = os.environ.get("DANNA_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))
_LOG_DIR = os.path.join(_DATA_DIR, "logs")
DECISIONS_LOG_PATH = os.path.join(_LOG_DIR, "decisions.jsonl")


# ── Helpers internos ──────────────────────────────────────────────
def _log_error(msg):
    """Reemplazo de st.error() — en el core solo logueamos."""
    _logger.error(msg)


def _emit_toast(on_toast, msg, icon=None):
    """Emite un toast si hay callback; si no, no-op."""
    if callable(on_toast):
        try:
            on_toast(msg, icon=icon)
        except Exception:
            pass


def _get_session_id(state) -> str:
    try:
        sid = state.get("_session_id")
        if not sid:
            sid = uuid.uuid4().hex
            state["_session_id"] = sid
        return str(sid)
    except Exception:
        return "session"


def _ensure_counters_schema(state):
    base = {"wins": 0, "losses": 0, "consec_errors": 0, "max_consec_errors": 0}
    counters = state.get("counters", {}) or {}
    for k in ["primary", "docenas", "columnas", "color", "paridad", "rango", "max_conf", "guardian_docena", "guardian_columna"]:
        if k not in counters or not isinstance(counters.get(k, None), dict):
            counters[k] = dict(base)
        else:
            for kk, vv in base.items():
                counters[k].setdefault(kk, vv)
    state["counters"] = counters


def _mb_state_init(state):
    ss = state
    ss.setdefault("manual_bankroll_initial", 0.0)
    ss.setdefault("manual_balance", 0.0)
    ss.setdefault("manual_pnl", 0.0)
    ss.setdefault("manual_roi", 0.0)
    ss.setdefault("manual_history", [])
    ss.setdefault("manual_pending_bet", None)
    ss.setdefault("manual_last_outcome", None)

    # UX defaults
    ss.setdefault("manual_stake_total", 0.0)
    ss.setdefault("manual_include_probe", False)
    ss.setdefault("manual_include_zero", False)


def _mb_try_auto_liquidate(state, outcome: int, previous_len: int):
    """Auto-liquidate if a pending manual bet was confirmed for the just-registered spin."""
    _mb_state_init(state)
    ss = state
    if not bool(ss.get("manual_auto_liquidate", True)):
        return None
    pending = ss.get("manual_pending_bet")
    if not pending:
        return None
    snap = pending.get("snapshot_spins_count")
    if snap is None or int(snap) != int(previous_len):
        return None
    try:
        return _mb_apply_settlement(state, int(outcome), source="AUTO")
    except Exception:
        return None


def _mb_apply_settlement(state, outcome: int, *, source: str = "AUTO"):
    """Apply settlement to manual bankroll, append to history, and clear pending bet.

    Returns a dict with settlement info, or None if nothing was settled.
    """
    _mb_state_init(state)
    ss = state
    pending = ss.get("manual_pending_bet")
    if not pending:
        return None

    settlement = _mb_compute_settlement(pending, int(outcome))
    stake_total = float(settlement["stake_total"])
    payout_total = float(settlement["payout_total"])
    net = float(settlement["net"])

    # Initialize balance from bankroll_initial if needed
    if float(ss.get("manual_balance", 0.0) or 0.0) == 0.0 and float(ss.get("manual_bankroll_initial", 0.0) or 0.0) > 0:
        ss["manual_balance"] = float(ss.get("manual_bankroll_initial", 0.0) or 0.0)

    ss["manual_balance"] = float(ss.get("manual_balance", 0.0) or 0.0) + net

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "outcome": int(outcome),
        "stake_total": stake_total,
        "payout_total": payout_total,
        "net": net,
        "balance_after": float(ss["manual_balance"]),
        "planned_snapshot_spins_count": (pending or {}).get("snapshot_spins_count"),
        "bets": (pending or {}).get("bets", {}),
    }
    hist = ss.get("manual_history", [])
    if not isinstance(hist, list):
        hist = []
    hist.append(entry)
    ss["manual_history"] = hist

    ss["manual_last_outcome"] = int(outcome)
    ss["manual_pending_bet"] = None
    return {"entry": entry, "settlement": settlement}


def sync_engine_models_from_session(state, engine_instance=None):
    """Sincroniza NB/LSTM/Scaler y pesos del engine -> session_state."""
    try:
        if hasattr(engine_instance, "set_models"):
            engine_instance.set_models(
                nb_model=state.get("nb_model"),
                lstm_model=state.get("lstm_model"),
                scaler=state.get("lstm_scaler"),
            )
        if hasattr(engine_instance, "weights"):
            state["ensemble_weights"] = np.array(engine_instance.weights, dtype=float)
    except Exception as e:
        _logger.error(f"sync_engine_models_from_session: {e}")


def _maybe_train_lstm(state, spins: list, *, engine_instance=None, on_toast=None):
    try:
        n = len(spins)
        # ★ FIX defaults conservadores: trigger 200 (no 150) e interval 300
        # (no 150). Cada retrain causa caída temporal de eficiencia (~20-40
        # spins) porque el LSTM nuevo desbalancea el ensemble hasta que se
        # reajustan los pesos. Reduciendo la frecuencia minimizamos esas
        # ventanas problemáticas.
        trigger = int(state.get("lstm_train_trigger", 200))
        interval = int(state.get("lstm_retrain_interval", 300))
        last_train = int(state.get("lstm_last_train_spin", 0))
        if n < trigger:
            return
        if (n - last_train) < interval:
            return

        seq_len = int(state.get("lstm_sequence_len", 15))
        existing = state.get("lstm_model", None)
        res = engine_module.train_lstm_model_live_v2(
            spins=spins,
            seq_len=seq_len,
            existing_model=existing,
            epochs=10 if existing is None else 5,
            verbose=0,
        )
        if res and res.get("success"):
            state["lstm_model"] = res.get("model")
            state["lstm_scaler"] = res.get("scaler")
            state["lstm_last_train_spin"] = n
            sync_engine_models_from_session(state, engine_instance=engine_instance)
            _emit_toast(on_toast, "🧠 LSTM actualizado", icon="🧠")
    except Exception as e:
        _logger.error(f"LSTM live train failed: {e}")


def _ensure_error_hist_schema(state, counters: dict):
    """
    Mantiene un histograma de 'errores antes de acertar' por categoría.
    - E1..E6: número de veces que se acertó después de 1..6 errores consecutivos
    - E7:     número de veces que se acertó después de 7+ errores consecutivos
    NO toca el motor. Se deriva 100% de state["counters"].
    """
    try:
        if "error_hist" not in state or not isinstance(state["error_hist"], dict):
            state["error_hist"] = {}
        if "_prev_counters_for_hist" not in state or not isinstance(state["_prev_counters_for_hist"], dict):
            state["_prev_counters_for_hist"] = {}

        base_keys = []
        if isinstance(counters, dict):
            base_keys = list(counters.keys())

        # Garantizar también para categorías que app pinta aunque counters falte temporalmente
        default_keys = [
            "primary", "principal",
            "docenas", "columnas",
            "color", "paridad", "rango",
            "max_conf", "numeros",
            "guardian_docena", "guardian_columna",
        ]

        for k in base_keys:
            if k not in state["error_hist"] or not isinstance(state["error_hist"][k], dict):
                state["error_hist"][k] = {
                    "E1": 0, "E2": 0, "E3": 0, "E4": 0, "E5": 0, "E6": 0, "E7": 0,
                    "hits_counted": 0,
                    "avg_errors": 0.0,
                }

        for k in default_keys:
            if k not in state["error_hist"] or not isinstance(state["error_hist"][k], dict):
                state["error_hist"][k] = {
                    "E1": 0, "E2": 0, "E3": 0, "E4": 0, "E5": 0, "E6": 0, "E7": 0,
                    "hits_counted": 0,
                    "avg_errors": 0.0,
                }
    except Exception:
        # no romper la app por un panel visual
        pass


def _update_error_hist_from_counters(state, prev_counters: dict, new_counters: dict):
    """
    Actualiza histogramas cuando detecta un nuevo acierto (wins incrementa).
    Bucket = consec_errors PREVIO al acierto:
        1..6 -> E1..E6
        >=7  -> E7
    Nota: Se actualiza tanto la clave canónica (primary/max_conf) como su alias UI (principal/numeros).
    """
    try:
        if not isinstance(new_counters, dict):
            return
        _ensure_error_hist_schema(state, new_counters)

        for bet_key, cur in new_counters.items():
            prev = (prev_counters or {}).get(bet_key, {}) if isinstance(prev_counters, dict) else {}
            try:
                w_prev = int((prev or {}).get("wins", 0))
                w_cur = int((cur or {}).get("wins", 0))
            except Exception:
                continue

            if w_cur <= w_prev:
                continue  # no hubo acierto nuevo

            # Errores consecutivos *antes* de acertar: vienen del estado previo
            try:
                k = int((prev or {}).get("consec_errors", 0))
            except Exception:
                k = 0

            # Si acertó sin errores previos, no afecta E1..E7 (por definición)
            if k <= 0:
                continue

            bucket = "E7" if k >= 7 else f"E{k}"

            for _ehk in _eh_keys_for_update(bet_key):
                eh = state.get("error_hist", {}).get(_ehk)
                if not isinstance(eh, dict):
                    continue

                eh[bucket] = int(eh.get(bucket, 0)) + 1
                eh["hits_counted"] = int(eh.get("hits_counted", 0)) + 1

                # recomputar promedio (ponderado) usando E1..E6 y E7 como 7
                total = 0
                weighted = 0
                for i in range(1, 7):
                    c = int(eh.get(f"E{i}", 0))
                    total += c
                    weighted += i * c
                c7 = int(eh.get("E7", 0))
                total += c7
                weighted += 7 * c7

                eh["avg_errors"] = float(weighted / total) if total > 0 else 0.0
                state["error_hist"][_ehk] = eh
    except Exception:
        pass


def _lb_settle_open_bets(state, spin_n: int):
    """Settle all open bets for the spin number. Updates bankroll + history. Clears open bets."""
    ob = state.get("live_open_bets", [])
    if not isinstance(ob, list) or not ob:
        return

    try:
        n = int(spin_n)
    except Exception:
        return

    bal = float(state.get("mb_bankroll_balance", 0.0) or 0.0)
    settled = []
    total_delta = 0.0

    for bet in list(ob):
        stake = float((bet or {}).get("stake", 0.0) or 0.0)
        key = (bet or {}).get("bet_key")
        hit = _lb_is_hit(bet, n)

        if hit:
            mult = _lb_payout_multiplier(str(key))
            win_profit = stake * mult
            payout = stake + win_profit
            bal += payout
            total_delta += win_profit
            settled.append({"bet": bet, "hit": True, "profit": win_profit, "payout": payout, "spin": n})
        else:
            total_delta -= stake
            settled.append({"bet": bet, "hit": False, "profit": -stake, "payout": 0.0, "spin": n})

    state["mb_bankroll_balance"] = bal
    state["bankroll"] = float(state.get("mb_bankroll_balance", 0.0) or 0.0)

    # Append to history
    hist = state.get("mb_history", [])
    if not isinstance(hist, list):
        hist = []
    hist.append({
        "ts": datetime.now().isoformat(timespec="seconds"),
        "spin": n,
        "delta": total_delta,
        "settled": settled,
        "type": "LIVE_BETS",
    })
    state["mb_history"] = hist

    # Toast summary
    try:
        wins = sum(1 for x in settled if x.get("hit"))
        losses = sum(1 for x in settled if not x.get("hit"))
        _icon = "✅" if total_delta >= 0 else "⚠️"
        state["_toast_pending"] = {"msg": f"LIVE BETS | Spin {n} | +{wins}/-{losses} | Δ {total_delta:,.0f} COP", "icon": _icon}
    except Exception:
        pass

    state["live_open_bets"] = []


def _ensure_last_suggestion_current(state, *, engine_instance=None):
    """Garantiza que header y dashboard lean el MISMO payload (pre-spin).

    Cambio clave (UI-only): también generamos payload durante warmup (spins < min_start),
    para que el operador vea picks/estados desde el inicio. La evaluación (contadores oficiales)
    sigue bloqueada por warmup en run_spin_processing().
    """
    spins = _safe_list_like(state.get("spins", []))
    total = len(spins)
    min_start = _safe_int(state.get("min_start", 30), 30)

    if total <= 0:
        state["last_suggestion"] = None
        return None

    last = state.get("last_suggestion")
    try:
        if isinstance(last, dict) and int(last.get("snapshot_spins_count", -1)) == int(total):
            return last
    except Exception:
        pass

    try:
        payload = _compute_suggestion_payload(state, spins, engine_instance=engine_instance)
        # Hardening: eliminate numpy arrays/scalars before any UI logic that may use "or"/truthiness.
        payload = _deep_jsonable(payload)
        payload = _ui_patch_max_conf_status(state, payload)

        # Marcar warmup para UI (sin afectar motor)
        warmup = int(total) < int(min_start)
        if isinstance(payload, dict):
            payload["_warmup"] = bool(warmup)
            payload.setdefault("snapshot_spins_count", int(total))

            if warmup:
                # Forzar acción global WAIT (solo UI) para evitar que el HUD sugiera BET antes del umbral.
                try:
                    dec = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
                    if isinstance(dec, dict):
                        dec["final_action"] = "WAIT"
                        # Mantener razón existente pero agregar warmup
                        _fr_raw = _coalesce_none(dec.get("final_reason", None), dec.get("reason", None), "")
                        fr = _safe_text(_fr_raw, "")
                        dec["final_reason"] = (fr + " | " if fr else "") + f"WARMUP {total}/{min_start}"
                        payload["decision"] = dec
                except Exception:
                    pass
        payload = _deep_jsonable(payload)


        state["last_suggestion"] = payload
        # Persistir decisión (sin alterar el payload)
        try:
            _sid = _get_session_id(state)
            _append_jsonl(DECISIONS_LOG_PATH, {
                "type": "decision",
                "ts_utc": datetime.now(timezone.utc).isoformat(),
                "session_id": _sid,
                "user_id": str(state.get("user_id", "default")),
                "table_id": str(state.get("table_id", "mesa_1")),
                "wheel_enabled": bool(state.get("wheel_enabled", False)),
                "wheel_shadow_only": bool(state.get("wheel_shadow_only", True)),
                "wheel_weight": _safe_float(state.get("wheel_weight", 0.0), 0.0),
                "wheel_radius": _safe_int(state.get("wheel_radius", 2), 2),
                "wheel_window": _safe_int(state.get("wheel_window", 60), 60),
                "wheel_decay": _safe_float(state.get("wheel_decay", 0.75), 0.75),
                "snapshot_spins_count": int(payload.get("snapshot_spins_count", len(spins))) if isinstance(payload, dict) else len(spins),
                "decision": payload.get("decision", {}) if isinstance(payload, dict) else {},
            })
        except Exception:
            pass

        return payload
    except Exception as e:
        _logger.error(f"ensure_last_suggestion_current failed: {e}")
        return last


def _ui_patch_max_conf_status(state, payload: dict) -> dict:
    """UI-only: asegura que max_conf tenga status WAIT/PROBE/BET (no INFO).

    - No toca parámetros del motor.
    - No altera contadores oficiales (que siguen siendo 'solo BET').
    - Puede usar 'shadow_counters' (UI-only) para mostrar desempeño y evitar quedarse congelado en WAIT.
    """
    if not isinstance(payload, dict):
        return payload

    decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
    if not isinstance(decision, dict):
        return payload

    # Gate de mesa (si existe): en CAOS/COOLDOWN degradamos a WAIT por seguridad operativa.
    gate = ""
    try:
        ms = decision.get("mesa_score") if isinstance(decision.get("mesa_score"), dict) else None
        if ms is None:
            ms = decision.get("mesa") if isinstance(decision.get("mesa"), dict) else None
        if isinstance(ms, dict):
            gate = str(ms.get("gate") or ms.get("mode") or "").upper().strip()
    except Exception:
        gate = ""

    bet_advice = decision.get("bet_advice") if isinstance(decision.get("bet_advice"), dict) else {}
    if not isinstance(bet_advice, dict):
        bet_advice = {}

    entry = bet_advice.get("max_conf")
    if not isinstance(entry, dict):
        entry = {}

    # --- Pick / números (para saber si hay señal)
    pick_obj = _first_present(entry.get("pick"), entry.get("numbers"), entry.get("selection"), entry.get("nums"))
    if pick_obj is None:
        try:
            sa = payload.get("suggestion_analysis", None)
            if not isinstance(sa, dict):
                sa = {}
            mc = sa.get("max_conf", {}) if isinstance(sa, dict) else {}
            pick_obj = mc.get("selection", None)
        except Exception:
            pick_obj = None

    has_pick = False
    if isinstance(pick_obj, (list, tuple, np.ndarray)):
        has_pick = len(pick_obj) > 0
    elif isinstance(pick_obj, str):
        has_pick = bool(pick_obj.strip())

    # --- Desempeño: oficial (solo BET) y sombra (UI-only)
    wr = None
    d = 0
    try:
        c_all = state.get("counters", {}) or {}
        c = (c_all.get("max_conf", {}) if isinstance(c_all, dict) else {}) or {}
        w = int(c.get("wins", 0) or 0)
        l = int(c.get("losses", 0) or 0)
        d = w + l
        wr = (w / d) if d > 0 else None
    except Exception:
        wr, d = None, 0

    swr = None
    sd = 0
    try:
        sh_all = state.get("shadow_counters", {}) or {}
        sh = (sh_all.get("max_conf", {}) if isinstance(sh_all, dict) else {}) or {}
        sw = int(sh.get("wins", 0) or 0)
        sl = int(sh.get("losses", 0) or 0)
        sd = sw + sl
        swr = (sw / sd) if sd > 0 else None
    except Exception:
        swr, sd = None, 0

    eff_wr = wr if wr is not None else swr
    eff_d = d if d > 0 else sd

    # --- Status base: respetar si el motor ya trae uno útil
    cur_status = str(entry.get("status") or entry.get("action") or "").upper().strip()
    if cur_status in ("EXPLOIT", "BET"):
        status = "BET"
    elif cur_status == "PROBE":
        status = "PROBE"
    elif cur_status in ("WAIT", "OBSERVE"):
        status = "WAIT"
    else:
        # Derivación UI: evitar INFO; mantener conservador.
        if gate in ("CHAOS", "COOLDOWN"):
            status = "WAIT"
        else:
            if (eff_wr is None) and has_pick:
                # Sin evidencia, pero hay señal -> PROBE (no INFO)
                status = "PROBE"
            elif (eff_wr is not None) and (eff_d >= 30) and (eff_wr >= 0.40):
                status = "BET"
            elif (eff_wr is not None) and (eff_d >= 10) and (eff_wr >= 0.34):
                status = "PROBE"
            else:
                status = "WAIT"

    # Gate final
    if gate in ("CHAOS", "COOLDOWN"):
        status = "WAIT"

    entry["status"] = status
    if has_pick and ("pick" not in entry):
        entry["pick"] = pick_obj

    bet_advice["max_conf"] = entry
    decision["bet_advice"] = bet_advice
    payload["decision"] = decision
    return payload


def _auto_settle_bankroll_from_pre_payload(state, *, outcome: int, pre_payload: dict, previous_len: int):
    """Liquida PnL automáticamente contra la sugerencia pre-spin (last_suggestion) y
    actualiza state['bankroll'].

    - Usa stakes por categoría (mb_stake_*)
    - Respeta estados BET/PROBE/WAIT según toggles mb_include_probe/mb_include_wait
    - Guarda auditoría en mb_history y bankroll_history
    - Deja un toast pendiente (_toast_pending) para mostrarse tras st.rerun()
    """
    ss = state

    if not isinstance(pre_payload, dict):
        return None

    # Solo liquidar si el snapshot coincide con el largo previo (pre-spin)
    try:
        snap = int(pre_payload.get("snapshot_spins_count", -1))
        prev = int(previous_len)
    except Exception:
        return None
    if snap != prev:
        return None

    decision = pre_payload.get("decision") if isinstance(pre_payload.get("decision"), dict) else {}
    if not decision:
        return None

    # Toggles
    include_probe = bool(ss.get("mb_include_probe", False))
    include_wait = bool(ss.get("mb_include_wait", False))
    include_cero = bool(ss.get("mb_include_cero", False))

    # Formatter robusto
    _fmt = globals().get("_format_cop", None) or globals().get("_mb_fmt_cop", None)
    def _fmt_cop(x):
        try:
            return _fmt(x) if callable(_fmt) else str(x)
        except Exception:
            return str(x)

    def _effective(stake: float, status: str) -> float:
        s = float(stake or 0.0)
        stt = str(status or "").upper().strip()
        if s <= 0:
            return 0.0
        if stt in ("BET", "EXPLOIT"):
            return s
        if stt == "PROBE" and include_probe:
            return s
        if stt == "WAIT" and include_wait:
            return s
        return 0.0

    def _normalize_choices(pick):
        if pick is None:
            return []
        if isinstance(pick, (list, tuple)):
            out = []
            for x in pick:
                if x is None:
                    continue
                if isinstance(x, (list, tuple)):
                    out.extend([str(y).strip() for y in x if y is not None and str(y).strip()])
                else:
                    sx = str(x).strip()
                    if sx:
                        out.append(sx)
            return out
        s = str(pick).strip()
        if not s:
            return []
        # Permitir "A / B" o "A,B"
        if " / " in s:
            return [x.strip() for x in s.split("/") if x.strip()]
        if "/" in s:
            return [x.strip() for x in s.split("/") if x.strip()]
        if "," in s:
            return [x.strip() for x in s.split(",") if x.strip()]
        return [s]

    def _pick_status_from_bet_advice(cat: str):
        info = _mb_get_advice(decision, cat) if callable(globals().get("_mb_get_advice", None)) else {}
        status = (info.get("status") or info.get("action") or info.get("advice") or "WAIT")
        picks = info.get("picks", None)
        if picks is None:
            picks = info.get("pick", None)
        if picks is None:
            picks = info.get("choices", None)
        return str(status).upper(), picks

    def _guardian_pick_status():
        g = decision.get("guardian") if isinstance(decision.get("guardian"), dict) else {}
        if not g:
            # fallback a bet_advice si existe
            ba = decision.get("bet_advice", {}) if isinstance(decision.get("bet_advice"), dict) else {}
            g2 = ba.get("guardian_docena") if isinstance(ba.get("guardian_docena"), dict) else {}
            g = g2 if g2 else {}
        status = (g.get("status") or g.get("action") or g.get("advice") or "WAIT")
        pick = g.get("pick")
        if pick is None:
            pick = g.get("picks") or g.get("choice") or g.get("top")
        return str(status).upper(), pick

    def _guardian_col_pick_status():
        g = decision.get("guardian_columna") if isinstance(decision.get("guardian_columna"), dict) else {}
        if not g:
            # fallback a guardian_columna_state si existe
            g2 = decision.get("guardian_columna_state") if isinstance(decision.get("guardian_columna_state"), dict) else {}
            if g2:
                g = g2
        if not g:
            # fallback a bet_advice si existe
            ba = decision.get("bet_advice", {}) if isinstance(decision.get("bet_advice"), dict) else {}
            g3 = ba.get("guardian_columna") if isinstance(ba.get("guardian_columna"), dict) else {}
            g = g3 if g3 else {}
        status = (g.get("status") or g.get("action") or g.get("advice") or "WAIT")
        pick = g.get("pick")
        if pick is None:
            pick = g.get("picks") or g.get("choice") or g.get("top")
        return str(status).upper(), pick


    def _primary_pick_status():
        pb = decision.get("primary_bet") if isinstance(decision.get("primary_bet"), dict) else {}
        cat = pb.get("category") or pb.get("key") or pb.get("bet_key") or ""
        pick = pb.get("pick")
        if pick is None:
            pick = pb.get("picks") or pb.get("choice") or pb.get("options")
        # status: intentar final_action / pb.status
        stt = decision.get("final_action") or pb.get("status") or pb.get("action") or ""
        if not stt:
            # fallback: si la primary es una categoría, tomar su status
            if cat in ("docenas","columnas","color","paridad","rango","guardian_docena","guardian_columna"):
                stt = _pick_status_from_bet_advice(cat)[0] if cat != "guardian_docena" else _guardian_pick_status()[0]
        return str(cat).strip(), str(stt or "WAIT").upper(), pick

    def _net_even(stake: float, hit: bool) -> float:
        s = float(stake or 0.0)
        return (s if hit else -s) if s > 0 else 0.0

    def _net_2to1_split(stake_total: float, hit: bool, n_choices: int) -> float:
        s = float(stake_total or 0.0)
        if s <= 0:
            return 0.0
        if not hit:
            return -s
        n = max(1, int(n_choices or 1))
        stake_each = s / n
        # payout_total = 3 * stake_each (solo un leg gana); net = payout_total - stake_total
        return (3.0 * stake_each) - s

    def _net_35to1(stake: float, hit: bool) -> float:
        s = float(stake or 0.0)
        if s <= 0:
            return 0.0
        return (35.0 * s) if hit else (-s)

    try:
        outcome_i = int(outcome)
    except Exception:
        return None

    breakdown = {}
    stake_total = 0.0
    net_total = 0.0

    # Categorías estándar
    for cat, stake_key in [
        ("docenas", "mb_stake_docenas"),
        ("columnas", "mb_stake_columnas"),
        ("color", "mb_stake_color"),
        ("paridad", "mb_stake_paridad"),
        ("rango", "mb_stake_rango"),
        ("max_conf", "mb_stake_max_conf"),
    ]:
        status, pick = _pick_status_from_bet_advice(cat)
        stv = _effective(ss.get(stake_key, 0.0), status)
        if stv <= 0:
            continue

        if cat == "docenas":
            choices = _normalize_choices(pick)[:3]
            # Si viene en formato pick único, igual sirve
            outcome_lbl = _mb_dozen_of(outcome_i) if callable(globals().get("_mb_dozen_of", None)) else None
            hit = bool(outcome_lbl and (outcome_lbl in [str(x) for x in choices]))
            net = _net_2to1_split(stv, hit, len(choices) or 1)
        elif cat == "columnas":
            choices = _normalize_choices(pick)[:3]
            outcome_lbl = _mb_column_of(outcome_i) if callable(globals().get("_mb_column_of", None)) else None
            hit = bool(outcome_lbl and (outcome_lbl in [str(x) for x in choices]))
            net = _net_2to1_split(stv, hit, len(choices) or 1)
        elif cat == "color":
            outcome_lbl = _mb_color_of(outcome_i) if callable(globals().get("_mb_color_of", None)) else None
            hit = bool(outcome_lbl and str(pick).lower().startswith(str(outcome_lbl).lower()[:2]))
            net = _net_even(stv, hit)
        elif cat == "paridad":
            outcome_lbl = _mb_parity_of(outcome_i) if callable(globals().get("_mb_parity_of", None)) else None
            hit = bool(outcome_lbl and str(pick).lower().startswith(str(outcome_lbl).lower()[:2]))
            net = _net_even(stv, hit)
        elif cat == "max_conf":
            # Números (straight-up). stake_total se reparte entre N números.
            choices_raw = _normalize_choices(pick)
            # Convertir a ints cuando se pueda
            choices = []
            for _x in choices_raw:
                try:
                    choices.append(int(str(_x).strip()))
                except Exception:
                    continue
            choices = [c for c in choices if 0 <= c <= 36]
            n = max(1, len(choices))
            hit = bool(outcome_i in choices)
            stake_each = float(stv) / float(n)
            # Net: (36 - n) * stake_each si hit; si no, -stake_total
            net = ((36.0 - float(n)) * stake_each) if hit else (-float(stv))
        else:  # rango
            outcome_lbl = _mb_range_of(outcome_i) if callable(globals().get("_mb_range_of", None)) else None
            hit = bool(outcome_lbl and str(pick).lower().startswith(str(outcome_lbl).lower()[:2]))
            net = _net_even(stv, hit)

        stake_total += float(stv)
        net_total += float(net)
        breakdown[cat] = {"status": status, "pick": pick, "stake": float(stv), "hit": bool(hit), "net": float(net)}

    # Guardián docena (pago 2:1)
    g_status, g_pick = _guardian_pick_status()
    g_stake = _effective(ss.get("mb_stake_guardian_docena", 0.0), g_status)
    if g_stake > 0:
        g_choices = _normalize_choices(g_pick)[:1]
        out_d = _mb_dozen_of(outcome_i) if callable(globals().get("_mb_dozen_of", None)) else None
        hit_g = bool(out_d and g_choices and (out_d == str(g_choices[0])))
        net_g = _net_2to1_split(g_stake, hit_g, 1)
        stake_total += float(g_stake)
        net_total += float(net_g)
        breakdown["guardian_docena"] = {"status": g_status, "pick": g_pick, "stake": float(g_stake), "hit": bool(hit_g), "net": float(net_g)}


    # Guardián columna (pago 2:1)
    gc_status, gc_pick = _guardian_col_pick_status()
    gc_stake = _effective(ss.get("mb_stake_guardian_columna", 0.0), gc_status)
    if gc_stake > 0:
        gc_choices = _normalize_choices(gc_pick)[:1]
        out_c = _mb_column_of(outcome_i) if callable(globals().get("_mb_column_of", None)) else None
        hit_gc = bool(out_c and gc_choices and (out_c == str(gc_choices[0])))
        net_gc = _net_2to1_split(gc_stake, hit_gc, 1)
        stake_total += float(gc_stake)
        net_total += float(net_gc)
        breakdown["guardian_columna"] = {"status": gc_status, "pick": gc_pick, "stake": float(gc_stake), "hit": bool(hit_gc), "net": float(net_gc)}

    # Número 0 (35:1)
    zero_stake = float(ss.get("mb_stake_cero", 0.0) or 0.0) if include_cero else 0.0
    if zero_stake > 0:
        hit0 = (outcome_i == 0)
        net0 = _net_35to1(zero_stake, hit0)
        stake_total += float(zero_stake)
        net_total += float(net0)
        breakdown["cero"] = {"status": "BET", "pick": 0, "stake": float(zero_stake), "hit": bool(hit0), "net": float(net0)}

    # Apuesta principal (opcional)
    pb_cat, pb_status, pb_pick = _primary_pick_status()
    pb_stake = _effective(ss.get("mb_stake_primary", 0.0), pb_status)
    if pb_stake > 0 and pb_cat:
        hitp = False
        netp = 0.0
        if pb_cat in ("docenas", "columnas"):
            choices = _normalize_choices(pb_pick)[:3]
            if pb_cat == "docenas":
                out_lbl = _mb_dozen_of(outcome_i) if callable(globals().get("_mb_dozen_of", None)) else None
            else:
                out_lbl = _mb_column_of(outcome_i) if callable(globals().get("_mb_column_of", None)) else None
            hitp = bool(out_lbl and (out_lbl in [str(x) for x in choices]))
            netp = _net_2to1_split(pb_stake, hitp, len(choices) or 1)
        elif pb_cat in ("color", "paridad", "rango"):
            if pb_cat == "color":
                out_lbl = _mb_color_of(outcome_i) if callable(globals().get("_mb_color_of", None)) else None
            elif pb_cat == "paridad":
                out_lbl = _mb_parity_of(outcome_i) if callable(globals().get("_mb_parity_of", None)) else None
            else:
                out_lbl = _mb_range_of(outcome_i) if callable(globals().get("_mb_range_of", None)) else None
            hitp = bool(out_lbl and str(pb_pick).lower().startswith(str(out_lbl).lower()[:2]))
            netp = _net_even(pb_stake, hitp)
        elif pb_cat in ("guardian_docena", "guardian"):
            out_lbl = _mb_dozen_of(outcome_i) if callable(globals().get("_mb_dozen_of", None)) else None
            pb_choices = _normalize_choices(pb_pick)[:1]
            hitp = bool(out_lbl and pb_choices and out_lbl == str(pb_choices[0]))
            netp = _net_2to1_split(pb_stake, hitp, 1)
        else:
            # categoría no soportada
            hitp = False
            netp = 0.0

        stake_total += float(pb_stake)
        net_total += float(netp)
        breakdown["primary"] = {"status": pb_status, "pick": pb_pick, "stake": float(pb_stake), "hit": bool(hitp), "net": float(netp), "category": pb_cat}

    if stake_total <= 0:
        return None

    # Actualizar bankroll principal y sincronizar panel legacy
    ss["bankroll"] = float(ss.get("bankroll", 0.0) or 0.0) + float(net_total or 0.0)
    ss["mb_bankroll_balance"] = float(ss.get("bankroll", 0.0) or 0.0)

    # Auditoría
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "outcome": int(outcome_i),
        "stake_total": float(stake_total),
        "net": float(net_total),
        "balance_after": float(ss.get("bankroll", 0.0) or 0.0),
        "snapshot_spins_count": int(prev),
        "breakdown": breakdown,
    }
    try:
        ss.get("bankroll_history", []).append(entry)
    except Exception:
        ss["bankroll_history"] = [entry]

    try:
        ss.get("mb_history", []).append(entry)
    except Exception:
        ss["mb_history"] = [entry]

    # Toast pendiente (se muestra en el siguiente rerun)
    if float(net_total) > 0:
        msg = f"Ganaste {_fmt_cop(abs(net_total))}"
        icon = "💰"
    elif float(net_total) < 0:
        msg = f"Perdiste {_fmt_cop(abs(net_total))}"
        icon = "🧯"
    else:
        msg = "PnL: 0"
        icon = "🧾"

    msg += f" | Bankroll: {_fmt_cop(ss.get('bankroll', 0.0))}"
    ss["_toast_pending"] = {"msg": msg, "icon": icon}

    return entry


def _compute_suggestion_payload(state, spins: list, engine_instance=None):
    _ensure_counters_schema(state)
    sync_engine_models_from_session(state, engine_instance=engine_instance)

    total = len(spins)

    param_keys = [
        "alpha_dir",
        "decay_lambda",
        "window_long",
        "window_short",
        "lstm_sequence_len",
        "L_max",
        "M_pause",
        "probe_frac",
        "conf_threshold",
        "p_min_ci",
        "H_cut",
        "cfl_H_cut_doccol",
        "cfl_H_cut_simples",
        "bias_zscore_threshold",
        "risk_penalty_numbers",
        "numbers_need_margin",
        "probe_conf_th",
        "exploit_conf_th",
        "mesa_score_min_spins",
        "mesa_score_window",
        "mesa_score_update_every",
        "mesa_score_bias_z_thr",
        "risk_bet_only",
        "risk_max_consec_bet_losses",
        "risk_cooldown_spins",

        # Contexto mesa/usuario
        "user_id",
        "table_id",

        # WheelExpert (FASE 1)
        "wheel_enabled",
        "wheel_shadow_only",
        "wheel_weight",
        "wheel_radius",
        "wheel_window",
        "wheel_decay",

    ]
    params = {k: state.get(k, None) for k in param_keys}

    defaults = {
        "alpha_dir": 1.0,
        "decay_lambda": 0.03,
        "window_long": 100,
        "window_short": 12,
        "lstm_sequence_len": 15,
        "L_max": 2,
        "M_pause": 4,
        "probe_frac": 0.25,
        "conf_threshold": 0.44,
        "p_min_ci": 0.30,
        "H_cut": 5.10,
        "cfl_H_cut_doccol": 1.585,
        "cfl_H_cut_simples": 1.00,
        "bias_zscore_threshold": 2.0,
        "risk_penalty_numbers": 0.12,
        "numbers_need_margin": 0.008,  # WheelExpert: umbral alcanzable en vivo
        "probe_conf_th": 0.06,
        "exploit_conf_th": 0.15,
        "mesa_score_min_spins": 30,
        "mesa_score_window": 60,
        "mesa_score_update_every": 1,
        "mesa_score_bias_z_thr": 2.0,
        "risk_bet_only": True,
        "risk_max_consec_bet_losses": 2,
        "risk_cooldown_spins": 3,

        # Contexto mesa/usuario
        "user_id": "default",
        "table_id": "mesa_1",

        # Wheel defaults (FASE 1)
        "wheel_enabled": True,
        "wheel_shadow_only": False,
        "wheel_weight": 0.0,  # peso manejado por EnsembleVoter
        "wheel_radius": 2,
        "wheel_window": 60,
        "wheel_decay": 0.75,

    }
    for k in param_keys:
        if params.get(k) is None:
            params[k] = defaults.get(k, 0)

    # Session scoping for risk circuit (per session / per reset)
    params['session_id'] = _get_session_id(state)
    params['spins_len'] = len_safe_list_like(state.get('spins', []))
    # Reflect params into engine
    try:
        if hasattr(engine_instance, "params") and isinstance(engine_instance.params, dict):
            for kk in [
                "alpha_dir", "decay_lambda", "window_long", "window_short", "lstm_sequence_len",
                "user_id", "table_id", "session_id", "spins_len",
                "wheel_enabled", "wheel_shadow_only", "wheel_weight", "wheel_radius", "wheel_window", "wheel_decay",
            ]:
                if kk in params:
                    engine_instance.params[kk] = params[kk]
            if hasattr(engine_instance, "em") and hasattr(engine_instance.em, "params"):
                engine_instance.em.params.update(engine_instance.params)
    except Exception as e:
        _log_error(f"Error crítico sincronizando parámetros del motor: {e}")

    # Quick docena diag
    docana = {}
    try:
        if hasattr(engine_module, "analyze_recent_docena") and total > 0:
            docana = engine_module.analyze_recent_docena(spins, window=30)
    except Exception as e:
        _logger.error(f"Error en analyze_recent_docena: {e}")
    state["docana_analysis"] = docana

    # Ensemble
    if hasattr(engine_instance, "predict_next"):
        p_fused = engine_instance.predict_next(spins)
    else:
        p_fused = engine_module.run_ensemble(spins, {}, params, state.get("ensemble_weights", np.ones(4) / 4))

    # Bias adjust
    try:
        z = engine_module.detect_bias_zscore(spins)
    except Exception:
        z = np.zeros(37)

    try:
        p_fused_adj = engine_module.amplify_by_bias(p_fused, z, params["bias_zscore_threshold"])
    except Exception:
        p_fused_adj = p_fused

    # Categorize
    # WheelExpert info para refuerzo de categorias
    try:
        _wheel_info_now = engine_module.get_wheel_expert_info(spins, params=params)
    except Exception:
        _wheel_info_now = {}
    suggestion_analysis, cfl_metrics = engine_module.analyze_bet_categories(
        p_fused_adj, wheel_info=_wheel_info_now
    )
    # Guardar wheel_info en session_state para UI
    state["_wheel_expert_info"] = _wheel_info_now

    # Entropía números
    try:
        H_numeros = engine_module._shannon_entropy(p_fused_adj)
    except Exception:
        H_numeros = 0.0
    suggestion_analysis["H_numeros"] = H_numeros

    # guarda p_fused para coherence/advice en engine.get_decision
    try:
        p_arr = np.array(p_fused_adj, dtype=float)
        if p_arr.size == 37:
            p_arr = p_arr / (p_arr.sum() + 1e-12)
            suggestion_analysis["_p_fused"] = p_arr.tolist()
    except Exception:
        pass

    # FIX CLAVE: asegurar baseline/edge/conf por categoría si faltan
    EPS_LOCAL = 1e-12

    def _baseline(bet_key: str, selection_size: int = 1) -> float:
        if bet_key == "max_conf":
            return float(selection_size) / 37.0
        if bet_key in ("docenas", "columnas"):
            return 12.0 / 37.0
        if bet_key in ("color", "paridad", "rango"):
            return 18.0 / 37.0
        return 1.0 / 37.0

    def _conf_from_p(p: float, base: float) -> float:
        try:
            p = float(p)
            base = float(base)
            edge = p - base
            if edge <= 0:
                return 0.0
            return float(np.clip(edge / max(EPS_LOCAL, 1.0 - base), 0.0, 1.0))
        except Exception:
            return 0.0

    def _ensure_cat_metrics(cat_key: str):
        a = suggestion_analysis.get(cat_key, {})
        if not isinstance(a, dict):
            a = {}
            suggestion_analysis[cat_key] = a

        top2 = _safe_list_like(a.get("top_2_suggestions", []))
        if top2 and isinstance(top2[0], (list, tuple)) and len(top2[0]) >= 2:
            top_name = top2[0][0]
            top_p = float(top2[0][1])
            a.setdefault("top_suggestion", top_name)
            a.setdefault("top_probability", top_p)
        else:
            top_p = float(a.get("top_probability", 0.0))

        base = float(a.get("baseline_p", _baseline(cat_key)))
        edge = float(a.get("edge", top_p - base))
        conf = float(a.get("conf_score", _conf_from_p(top_p, base)))

        a["baseline_p"] = base
        a["edge"] = edge
        a["conf_score"] = conf
        a.setdefault("label", cat_key.capitalize())

    for k in ["docenas", "columnas", "color", "paridad", "rango"]:
        try:
            _ensure_cat_metrics(k)
        except Exception:
            pass

    # max_conf (números)
    try:
        mc = suggestion_analysis.get("max_conf", {})
        if not isinstance(mc, dict):
            mc = {}
            suggestion_analysis["max_conf"] = mc

        sel = _safe_list_like(mc.get("selection", []))
        k_sel = len(sel) if isinstance(sel, (list, tuple, np.ndarray)) else 0
        p_win = float(mc.get("p_win", mc.get("top_probability", 0.0)))
        base = float(mc.get("baseline_p", _baseline("max_conf", k_sel if k_sel > 0 else 1)))
        edge = float(mc.get("edge", p_win - base))
        conf = float(mc.get("conf_score", _conf_from_p(p_win, base)))

        mc["label"] = mc.get("label", "Max Confianza (Números)")
        mc["baseline_p"] = base
        mc["edge"] = edge
        mc["conf_score"] = conf
        mc["p_win"] = p_win
    except Exception:
        pass

    # Decision
    try:
        decision, pause_update = engine_module.get_decision(
            suggestion_analysis,
            cfl_metrics,
            spins,
            params,
            state.get("consec_losses", 0),
            state.get("pause_until_spin", 0),
        )
    except Exception as e:
        decision, pause_update = {"action": "OBSERVE", "reason": f"error: {e}"}, {}

    # DIAGNOSTIC: log edges/statuses to console so operator can see what the engine produces
    # Compact log: only when BET (reduces noise for multi-user)
    try:
        _diag_fa = decision.get("final_action", decision.get("action", "?")) if isinstance(decision, dict) else "?"
        if _diag_fa in ("BET", "EXPLOIT"):
            _diag_pb = decision.get("primary_bet", {}) if isinstance(decision, dict) else {}
            _logger.info(f"BET | spins={total} | {_diag_pb.get('bet_key','?')} edge={_diag_pb.get('edge',0):.4f} | user={state.get('user_id','?')}")
    except Exception:
        pass

    if isinstance(pause_update, dict) and "pause_until_spin" in pause_update:
        state["pause_until_spin"] = pause_update["pause_until_spin"]

        # guardian auto pause (DESHABILITADO): el RiskControl BET-only ya gestiona rachas por categoría.
    # Mantener este bloque activo estaba pausando el motor completo por resultados en WAIT/PROBE.
    if isinstance(decision, dict):
        decision["guardian_pause"] = {"enabled": False, "meta": {"reason": "disabled"}}

    if not isinstance(decision, dict):
        decision = {"action": "OBSERVE", "reason": "decision inválida"}

    # fallback primary / advice / coherence
    if not decision.get("primary_bet"):
        decision["primary_bet"] = _choose_primary_bet(suggestion_analysis, cfl_metrics, params)
    if not decision.get("bet_advice"):
        decision["bet_advice"] = _build_bet_advice(
            decision.get("final_action", decision.get("action", "OBSERVE")),
            decision.get("primary_bet", {}),
            suggestion_analysis,
            params
        )
    if not decision.get("coherence"):
        decision["coherence"] = _compute_coherence(
            decision.get("primary_bet", {}),
            suggestion_analysis,
            decision.get("bet_advice", {})
        )

    # Inyecta guardian en bet_advice
    try:
        g_status, g_pick, g_edge = _guardian_meta_from_decision(decision)
        # FIX FASE 1 (#2): conf_score real de guardian_docena (desde suggestion_analysis del motor)
        _gd = suggestion_analysis.get("guardian_docena", {}) if isinstance(suggestion_analysis, dict) else {}
        _gd_conf_raw = _gd.get("conf_score", None)
        if isinstance(decision.get("bet_advice"), dict) and (g_status or g_pick):
            decision["bet_advice"]["guardian_docena"] = {
                "label": "Apuesta Guardián (Docena)",
                "pick": g_pick,
                "p": _safe_float(decision.get("guardian_p", decision.get("guardian_prob", None)), 0.0),
                "conf_score": float(_finite(_gd_conf_raw, 0.0)),
                "status": g_status,
                "reason": f"Guardián{'' if g_edge is None else f' (edge={_safe_float(g_edge):+.3f})'}",
            }
    except Exception:
        pass

    suggestion_analysis["_coherence"] = {
        "primary_bet": decision.get("primary_bet", {}),
        "consistent": decision.get("coherence", {}).get("consistent", []),
        "inconsistent": decision.get("coherence", {}).get("inconsistent", []),
    }
    # --- Mesa Score: única fuente de verdad desde el engine ---
    # Nota: el engine puede empacar mesa_score como decision["mesa_score"], decision["mesa"] o decision["table_alert"].
    # Aquí NO recalculamos ni pisamos valores; solo normalizamos alias y persistimos para UI.
    try:
        mesa_score = None
        if isinstance(decision, dict):
            mesa_score = _first_present(decision.get("mesa_score"), decision.get("mesa"), decision.get("table_alert"))
            if isinstance(mesa_score, dict):
                decision.setdefault("mesa_score", mesa_score)
                decision.setdefault("mesa", mesa_score)
                state["mesa_score_last"] = mesa_score
                # Accumulate mesa scores for session average
                try:
                    _ms_val = mesa_score.get("score", None)
                    if _ms_val is not None:
                        _ms_val = float(_ms_val)
                        _ms_hist = state.get("_mesa_score_history", [])
                        if not isinstance(_ms_hist, list):
                            _ms_hist = []
                        _ms_hist.append(_ms_val)
                        if len(_ms_hist) > 5000:
                            _ms_hist = _ms_hist[-5000:]
                        state["_mesa_score_history"] = _ms_hist
                        state["_mesa_score_avg"] = sum(_ms_hist) / len(_ms_hist)
                except Exception:
                    pass
            else:
                mesa_score = None
    except Exception:
        mesa_score = None

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "suggestion_analysis": suggestion_analysis,
        "cfl_metrics": cfl_metrics,
        "decision": decision,
        "snapshot_spins_count": len(spins),
        "params": params,
        "H_numeros": H_numeros,
    }
    return payload
