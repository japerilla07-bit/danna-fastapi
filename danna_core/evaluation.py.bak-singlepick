"""
danna_core.evaluation
=====================
Evaluación de hits/aciertos contra el resultado de un giro.
Lógica pura sin estado ni UI.

Extraído de app.py (migración Sesión A) — sin cambios de lógica.
"""

import re

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

from danna_core.helpers import _safe_float, _safe_list_like
from danna_core.roulette import (
    _color_of_spin, _paridad_of_spin, _rango_of_spin,
    _docena_bucket_of_spin, _docena_bucket_from_pick,
    _col_bucket_of_spin, _col_bucket_from_pick,
)


def _lb_payout_multiplier(bet_key: str) -> float:
    """Return net profit multiplier (not including returning stake)."""
    k = (bet_key or "").lower()
    if k == "numeros":
        return 35.0
    if k in ("docenas", "columnas"):
        return 2.0
    if k in ("color", "paridad", "rango"):
        return 1.0
    return 0.0

def _lb_is_hit(bet: dict, spin_n: int) -> bool:
    """Determine if bet wins for given spin number."""
    try:
        if spin_n is None:
            return False
        n = int(spin_n)
        if n < 0 or n > 36:
            return False
        key = (bet or {}).get("bet_key")
        pick = (bet or {}).get("pick")

        if key == "numeros":
            return int(pick) == n

        if key == "docenas":
            if n == 0:
                return False
            d = int(pick)
            if d == 1:
                return 1 <= n <= 12
            if d == 2:
                return 13 <= n <= 24
            if d == 3:
                return 25 <= n <= 36
            return False

        if key == "columnas":
            if n == 0:
                return False
            c = int(pick)
            if c == 1:
                return n % 3 == 1
            if c == 2:
                return n % 3 == 2
            if c == 3:
                return n % 3 == 0
            return False

        if key == "color":
            if n == 0:
                return False
            red = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
            is_red = n in red
            return (str(pick) == "rojo" and is_red) or (str(pick) == "negro" and (not is_red))

        if key == "paridad":
            if n == 0:
                return False
            return (str(pick) == "par" and n % 2 == 0) or (str(pick) == "impar" and n % 2 == 1)

        if key == "rango":
            if n == 0:
                return False
            return (str(pick) == "1-18" and 1 <= n <= 18) or (str(pick) == "19-36" and 19 <= n <= 36)

    except Exception:
        return False
    return False

def _top_pick_from_analysis(suggestion_analysis: dict, bet_key: str):
    a = (suggestion_analysis or {}).get(bet_key, {})
    if not isinstance(a, dict):
        return None
    if a.get("top_suggestion") is not None:
        return a.get("top_suggestion")
    top2 = _safe_list_like(a.get("top_2_suggestions", []))
    if top2 and isinstance(top2[0], (list, tuple)) and len(top2[0]) >= 1:
        return top2[0][0]
    return None

def _get_top_from_analysis(bet_key: str, suggestion_analysis: dict):
    try:
        a = suggestion_analysis.get(bet_key, {}) if isinstance(suggestion_analysis, dict) else {}
        top2 = a.get("top_2_suggestions", []) if isinstance(a, dict) else []
        if top2 and isinstance(top2[0], (list, tuple)) and len(top2[0]) >= 2:
            return str(top2[0][0]), _safe_float(top2[0][1], 0.0)
        if isinstance(a, dict) and "top_suggestion" in a and "top_probability" in a:
            return str(a["top_suggestion"]), _safe_float(a["top_probability"], 0.0)
    except Exception:
        pass
    return None, 0.0

def _get_top2_group3_from_analysis(bet_key: str, suggestion_analysis: dict):
    """Devuelve TOP-2 para docenas/columnas como un solo evento (A / B) con p_total.

    Retorna:
        pick_str: str o None
        p_total: float
        options: list[str] (1 o 2 elementos)
        probs: list[float] (1 o 2 elementos)
    """
    try:
        a = suggestion_analysis.get(bet_key, {}) if isinstance(suggestion_analysis, dict) else {}
        top2 = a.get("top_2_suggestions", []) if isinstance(a, dict) else []
        if isinstance(top2, (list, tuple)) and len(top2) >= 2:
            o1 = top2[0][0] if isinstance(top2[0], (list, tuple)) and len(top2[0]) >= 2 else None
            o2 = top2[1][0] if isinstance(top2[1], (list, tuple)) and len(top2[1]) >= 2 else None
            p1 = _safe_float(top2[0][1], 0.0) if isinstance(top2[0], (list, tuple)) and len(top2[0]) >= 2 else 0.0
            p2 = _safe_float(top2[1][1], 0.0) if isinstance(top2[1], (list, tuple)) and len(top2[1]) >= 2 else 0.0
            if o1 is not None and o2 is not None:
                pick = f"{str(o1)} / {str(o2)}"
                return pick, float(p1 + p2), [str(o1), str(o2)], [float(p1), float(p2)]
    except Exception:
        pass

    # Fallback: TOP-1
    pick, p = _get_top_from_analysis(bet_key, suggestion_analysis)
    if pick is None:
        return None, 0.0, [], []
    return str(pick), float(_safe_float(p, 0.0)), [str(pick)], [float(_safe_float(p, 0.0))]

def _eval_primary_hit(primary_bet: dict, spin: int):
    """
    Evalúa acierto/error de la apuesta principal (H) contra un spin.
    Devuelve True/False/None (None = no hay info suficiente para contar).
    """
    if not isinstance(primary_bet, dict) or not primary_bet:
        return None

    bet_key = primary_bet.get("bet_key", primary_bet.get("type", None))
    pick = primary_bet.get("pick", None)

    # Números (max_conf / type numbers)
    if bet_key in ("max_conf", "numbers") or primary_bet.get("type") == "numbers":
        nums = primary_bet.get("numbers", primary_bet.get("selection", None))
        if nums is None:
            return None
        try:
            sel = set()
            if isinstance(nums, (list, tuple, np.ndarray)):
                for x in nums:
                    if isinstance(x, (int, np.integer)):
                        xi = int(x)
                        if 0 <= xi <= 36:
                            sel.add(xi)
            return (int(spin) in sel) if sel else None
        except Exception:
            return None

    def _split_parts(x):
        if x is None:
            return []
        if isinstance(x, (list, tuple, set)):
            out = []
            for it in list(x):
                out.extend(_split_parts(it))
            return out
        s = str(x)
        # separadores típicos: "/" "," ";" "|" 
        parts = re.split(r"[\/\|,;]+", s)
        out = []
        for p in parts:
            p = str(p).strip()
            if p:
                out.append(p)
        return out

    # Docenas (soporta TOP-2 "A / B")
    if bet_key in ("docenas", "guardian_docena"):
        b_spin = _docena_bucket_of_spin(spin)
        if b_spin is None:
            return None

        buckets = set()
        for part in _split_parts(pick):
            b = _docena_bucket_from_pick(part)
            if b:
                buckets.add(b)

        if not buckets:
            # fallback legacy (TOP-1)
            b_pick = _docena_bucket_from_pick(pick)
            if b_pick is None:
                return None
            buckets.add(b_pick)

        return bool(b_spin in buckets)

    # Columnas (soporta TOP-2 "Columna X / Columna Y")
    if bet_key in ("columnas", "guardian_columna"):
        b_spin = _col_bucket_of_spin(spin)
        if b_spin is None:
            return None

        buckets = set()
        for part in _split_parts(pick):
            b = _col_bucket_from_pick(part)
            if b:
                buckets.add(b)

        if not buckets:
            b_pick = _col_bucket_from_pick(pick)
            if b_pick is None:
                return None
            buckets.add(b_pick)

        return bool(b_spin in buckets)

    # Simples
    if bet_key == "color":
        if pick is None:
            return None
        return bool(_norm_pick(pick, "color") == _color_of_spin(spin))

    if bet_key == "paridad":
        if pick is None:
            return None
        return bool(_norm_pick(pick, "paridad") == _paridad_of_spin(spin))

    if bet_key == "rango":
        if pick is None:
            return None
        return bool(_norm_pick(pick, "rango") == _rango_of_spin(spin))

    # Desconocido
    return None

def _norm_pick(s: str, bet_key: str):
    """Normaliza picks para comparaciones (coherencia) SIN falsos positivos."""
    if s is None:
        return None
    t = str(s).strip().lower()

    if bet_key == "color":
        if "roj" in t or "red" in t:
            return "rojo"
        if "neg" in t or "black" in t:
            return "negro"
        return t

    if bet_key == "paridad":
        # ojo: "impar" contiene "par", por eso primero impar
        if "impar" in t or "odd" in t:
            return "impar"
        if re.search(r"\bpar\b", t) or "even" in t:
            return "par"
        return t

    if bet_key == "rango":
        if "alt" in t or "high" in t:
            return "alto"
        if "baj" in t or "low" in t:
            return "bajo"
        return t

    if bet_key == "docenas":
        if t in ("1", "2", "3"):
            return t
        if "1-12" in t or "1 a 12" in t or "1 al 12" in t:
            return "1"
        if "13-24" in t or "13 a 24" in t or "13 al 24" in t:
            return "2"
        if "25-36" in t or "25 a 36" in t or "25 al 36" in t:
            return "3"
        m = re.search(r"(docena)\s*([123])\b", t)
        if m:
            return m.group(2)
        return t

    if bet_key in ("columnas", "guardian_columna"):
        if t in ("1", "2", "3"):
            return t
        m = re.search(r"(columna|col)\s*([123])\b", t)
        if m:
            return m.group(2)
        m2 = re.search(r"\bc([123])\b", t)
        if m2:
            return m2.group(1)
        return t

    return t

def _eval_hits_from_payload(last_suggestion: dict, spin: int) -> dict:
    """
    Fallback interno (NO depende del engine):
    Devuelve True/False/None por categoría según el TOP pick del payload.
    None = no hay dato para contar.
    """
    sa = (last_suggestion or {}).get("suggestion_analysis", {}) or {}
    out = {
        "primary": None,
        "docenas": None,
        "columnas": None,
        "color": None,
        "paridad": None,
        "rango": None,
        "max_conf": None,
        "guardian_docena": None,
        "guardian_columna": None,
    }

    # ✅ Docenas/Columnas: si el payload muestra 2 opciones (top_2_suggestions),
    # contar acierto si cae en CUALQUIERA de las opciones (1ra o 2da).
    # Además, si el motor ya eligió un pick explícito (decision.bet_advice.*.pick), también se incluye.
    def _candidate_picks_for(bk: str):
        picks = []
        # 1) Pick explícito recomendado por el motor (si existe)
        try:
            decision0 = (last_suggestion or {}).get("decision", {}) or {}
            if isinstance(decision0, dict):
                ba = decision0.get("bet_advice", {}) or {}
                if isinstance(ba, dict):
                    a0 = ba.get(bk, {}) or {}
                    if isinstance(a0, dict):
                        p0 = a0.get("pick", a0.get("suggested", a0.get("selection", None)))
                        if p0 is not None:
                            if isinstance(p0, (list, tuple, set, np.ndarray)):
                                picks.extend(list(p0))
                            else:
                                picks.append(p0)
        except Exception:
            pass

        # 2) Top-2 del análisis (las 2 que se muestran en la tarjeta)
        try:
            a1 = sa.get(bk, {}) if isinstance(sa, dict) else {}
            top2 = a1.get("top_2_suggestions", []) if isinstance(a1, dict) else []
            if isinstance(top2, (list, tuple)):
                for it in top2[:2]:
                    if isinstance(it, (list, tuple)) and len(it) >= 1:
                        picks.append(it[0])
        except Exception:
            pass

        # 3) Fallback final: top pick
        if not picks:
            try:
                picks.append(_top_pick_from_analysis(sa, bk))
            except Exception:
                pass

        # Unique (preserva orden)
        uniq = []
        seen = set()
        for x in picks:
            if x is None:
                continue
            sx = str(x)
            if sx in seen:
                continue
            seen.add(sx)
            uniq.append(x)
        return uniq

    # --- Docenas (OR sobre picks candidatos) ---
    doc_spin_bucket = _docena_bucket_of_spin(spin)
    if doc_spin_bucket is not None:
        doc_buckets = []
        for p in _candidate_picks_for("docenas"):
            b = _docena_bucket_from_pick(p)
            if b is not None and b not in doc_buckets:
                doc_buckets.append(b)
        if doc_buckets:
            out["docenas"] = (doc_spin_bucket in doc_buckets)

    # --- Columnas (OR sobre picks candidatos) ---
    col_spin_bucket = _col_bucket_of_spin(spin)
    if col_spin_bucket is not None:
        col_buckets = []
        for p in _candidate_picks_for("columnas"):
            b = _col_bucket_from_pick(p)
            if b is not None and b not in col_buckets:
                col_buckets.append(b)
        if col_buckets:
            out["columnas"] = (col_spin_bucket in col_buckets)

    pick_color = _top_pick_from_analysis(sa, "color")
    if pick_color is not None:
        out["color"] = (_norm_pick(pick_color, "color") == _color_of_spin(spin))

    pick_par = _top_pick_from_analysis(sa, "paridad")
    if pick_par is not None:
        out["paridad"] = (_norm_pick(pick_par, "paridad") == _paridad_of_spin(spin))

    pick_rng = _top_pick_from_analysis(sa, "rango")
    if pick_rng is not None:
        out["rango"] = (_norm_pick(pick_rng, "rango") == _rango_of_spin(spin))

    mc = sa.get("max_conf", {}) if isinstance(sa.get("max_conf", {}), dict) else {}
    sel = _safe_list_like(mc.get("selection", []))
    if isinstance(sel, (list, tuple, np.ndarray)) and len(sel) > 0:
        try:
            sel_set = set()
            for x in sel:
                try:
                    xi = int(x)
                except Exception:
                    continue
                if 0 <= xi <= 36:
                    sel_set.add(xi)
            out["max_conf"] = (spin in sel_set) if sel_set else None
        except Exception:
            out["max_conf"] = None

        # --- Primary bet (Hipótesis H) desde decision.primary_bet ---
    try:
        decision = (last_suggestion or {}).get("decision", {}) or {}
        primary_bet = decision.get("primary_bet", {}) if isinstance(decision, dict) else {}
        out["primary"] = _eval_primary_hit(primary_bet, spin)
    except Exception:
        out["primary"] = None

    return out

def _extract_eval_hit(eval_results: dict, bet_key: str):
    """Devuelve True/False/None. None = no hay dato (NO contar)."""
    if not isinstance(eval_results, dict):
        return None

    keys = [
        bet_key,
        f"{bet_key}_hit",
        f"{bet_key}__hit",
        f"{bet_key}_raw",
        f"{bet_key}__raw",
        f"{bet_key}__raw_hit",
    ]
    for k in keys:
        if k not in eval_results:
            continue
        v = eval_results.get(k, None)
        if v is None:
            return None
        if isinstance(v, (bool, np.bool_)):
            return bool(v)
        if isinstance(v, (int, np.integer)) and int(v) in (0, 1):
            return bool(int(v))
        if isinstance(v, str):
            s = v.strip().lower()
            if s in ("true", "t", "yes", "y", "1", "hit", "acierto", "ok"):
                return True
            # "error"/"n/a"/"unknown" no es fallo: es NO EVALUABLE -> None (no contar)
            if s in ("error", "err", "n/a", "na", "unknown", "none", "null", "nan", "-", "exception"):
                return None
            if s in ("false", "f", "no", "n", "0", "miss", "fallo"):
                return False
            return None
        try:
            return bool(v)
        except Exception:
            return None

    return None

def _guardian_meta_from_decision(decision: dict):
    if not isinstance(decision, dict):
        return None, None, None
    g = decision.get("guardian", None)
    if isinstance(g, dict):
        stt = g.get("status", None)
        pick = g.get("pick", g.get("suggested", None))
        edge = g.get("edge", None)
        if stt is not None or pick is not None:
            return stt, pick, edge

    stt = decision.get("guardian_status", None)
    pick = decision.get("guardian_pick", decision.get("guardian_suggested", None))
    edge = decision.get("guardian_edge", None)
    return stt, pick, edge

def _guardian_col_meta_from_decision(decision: dict):
    """Extrae meta del Guardián de Columna desde el schema del engine."""
    if not isinstance(decision, dict):
        return None, None, None

    # Schema preferido: decision["guardian_columna"] o decision["guardian_columna_state"]
    g = decision.get("guardian_columna", None)
    if not isinstance(g, dict):
        g = decision.get("guardian_columna_state", None)
    if isinstance(g, dict):
        stt = g.get("status", g.get("action", None))
        pick = g.get("pick", g.get("suggested", None))
        edge = g.get("edge", None)
        if stt is not None or pick is not None:
            return stt, pick, edge

    # Fallback a bet_advice si existe
    ba = decision.get("bet_advice", None)
    if isinstance(ba, dict):
        g2 = ba.get("guardian_columna", None)
        if isinstance(g2, dict):
            stt = g2.get("status", g2.get("action", None))
            pick = g2.get("pick", g2.get("suggested", None))
            edge = g2.get("edge", None)
            if stt is not None or pick is not None:
                return stt, pick, edge

    return None, None, None
