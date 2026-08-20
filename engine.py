#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engine.py (D.A.N.N.A / GunnerMLEngine): consolidado, compatible con API y mas seguro.

- Funciones a nivel de modulo esperadas por app.py/state: run_ensemble, adjust_ensemble_weights, analyse_bet_categories, get_decision, evaluate_spin, drift_monitor_check, etc.
- Nucleo de ponderación adaptativa (AdaptiveWeightCore) como fuente persistente de información veraz.
- Bufer de repeticion global opcional (JSONL de solo anexion) para aprendizaje entre sesiones.
- NB / LSTM opcional (degradación gradual si sklearn/tensorflow no están disponibles).

"""

from __future__ import annotations

# --- Decision Schema Contract (frozen) ---
SCHEMA_VERSION = "decision_schema_v1"
ENGINE_VERSION = "D.A.N.N.A-engine-2026.01.06-primary-balancedgate-v5"


import os
import math
import json
import re
import time
import logging
import copy
from typing import List, Dict, Tuple, Optional, Any
from datetime import datetime, timezone
from collections import deque, Counter
import threading

import numpy as np

# -----------------------------------------------------------------------------

# ----------------------------------------------------------------------------
# Mesa Radar helpers (module-level, used by IronMan radar only)
# ----------------------------------------------------------------------------
REDS_EU = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}
def color_of(n: Optional[int]) -> Optional[str]:
    """Return 'RED'/'BLACK'/'ZERO' for European roulette."""
    if n is None:
        return None
    if n == 0:
        return 'ZERO'
    if 1 <= n <= 36:
        return 'RED' if n in REDS_EU else 'BLACK'
    return None

def parity_of(n: Optional[int]) -> Optional[str]:
    """Return 'EVEN'/'ODD'/'ZERO'."""
    if n is None:
        return None
    if n == 0:
        return 'ZERO'
    if 1 <= n <= 36:
        return 'EVEN' if (n % 2 == 0) else 'ODD'
    return None

def range_of(n: Optional[int]) -> Optional[str]:
    """Return 'LOW'/'HIGH'/'ZERO' (1-18 / 19-36)."""
    if n is None:
        return None
    if n == 0:
        return 'ZERO'
    if 1 <= n <= 18:
        return 'LOW'
    if 19 <= n <= 36:
        return 'HIGH'
    return None

# Config loading (module preferred; safe fallback)
# -----------------------------------------------------------------------------
def _edge_thresholds_for_shared(bet_key: str, params: dict) -> tuple[float, float]:
    """Return (exploit_edge, probe_edge) thresholds for a bet category.

    Centralized thresholds to avoid duplicated helpers inside get_decision/_bet_advice_from_analysis.
    """
    params = params or {}
    if bet_key in ("color", "paridad", "rango"):
        # Live-balanced: 0.020 gives action every ~15-20 spins while filtering noise
        exploit = float(params.get("exploit_edge_simple", 0.021))
        probe = float(params.get("probe_edge_simple", 0.010))
    elif bet_key in ("docenas", "columnas"):
        # Live-balanced: 0.020 for TOP-2 — reachable within 60 spins
        exploit = float(params.get("exploit_edge_group3", 0.021))
        probe = float(params.get("probe_edge_group3", 0.010))
    elif bet_key == "guardian_docena":
        # Backtest-proven star: 0.010 → PnL +372u, HR 34.90%. Payout 2:1 makes low threshold profitable
        exploit = float(params.get("exploit_edge_guardian", 0.010))
        probe = float(params.get("probe_edge_guardian", 0.005))
    elif bet_key == "guardian_columna":
        # Same logic as guardian_docena — payout 2:1 with low threshold
        exploit = float(params.get("exploit_edge_guardian_col", 0.010))
        probe = float(params.get("probe_edge_guardian_col", 0.005))
        # WheelExpert: reducir umbral si sector confirma columna del guardian
        try:
            _whi2 = params.get('_wheel_info') or {}
            if isinstance(_whi2, dict) and _whi2:
                _wa3   = str(_whi2.get('active_sector','') or '')
                _ws3   = _whi2.get('sector_scores',{}) or {}
                _wt3   = max(_ws3.values()) if _ws3 else 0.0
                _sc3   = _SECTOR_COMP.get(_wa3, {})
                _c_max = max(['C1','C2','C3'], key=lambda c: _sc3.get(c,0))
                _c_map = {'C1':'Columna 1','C2':'Columna 2','C3':'Columna 3'}
                _wheel_col = _c_map.get(_c_max,'')
                _pick_col  = str(self.state.get('last_pick_norm','') or '')
                if _wheel_col and _pick_col == _wheel_col and _wt3 > 0.30:
                    _red3 = float(np.clip((_wt3-0.25)*0.8, 0.0, 0.35))
                    exploit = exploit * (1.0 - _red3)
                    probe   = probe   * (1.0 - _red3)
        except Exception:
            pass
    else:
        exploit = float(params.get("exploit_edge_numbers", float(params.get("numbers_need_margin", 0.013))))
        probe = float(params.get("probe_edge_numbers", float(params.get("numbers_need_margin_probe", 0.006))))
    return exploit, probe

try:
    import config as config_module  # type: ignore
    config = config_module
except Exception:
    config = None


def _cfg(name: str, default=None):
    # 1. Try module-level config (legacy)
    if config is not None and hasattr(config, name):
        try:
            return getattr(config, name)
        except Exception:
            pass
    # 2. Fallback to environment variable
    env_val = os.environ.get(name)
    if env_val is not None:
        return env_val
    return default


EPS = float(_cfg("EPS", 1e-12))

def _extract_governor_meta(container: Any) -> Any:
    """Best-effort extraction of governor/controller metadata from a dict-like container.

    This helper avoids NameError/static-analysis issues by not assuming any specific variable name
    exists in the caller's scope.
    """
    try:
        if isinstance(container, dict):
            return container.get("_governor") or container.get("governor") or container.get("governor_meta")
    except Exception:
        return None
    return None


def _conf_edge(edge: float, exploit_edge: float, eps: float = EPS) -> float:
    """Confidence proxy from edge vs exploit threshold.
    Returns a clipped ratio in [0,1]. Used only for UI/telemetry; does not change decisions."""
    try:
        if exploit_edge <= eps:
            return 0.0
        r = float(edge) / float(exploit_edge)
        if r < 0.0:
            return 0.0
        if r > 1.0:
            return 1.0
        return r
    except Exception:
        return 0.0


# -----------------------------------------------------------------------------
# Logger
# -----------------------------------------------------------------------------
def _setup_logger(name="divine_engine", level=logging.INFO):
    lg = logging.getLogger(name)
    if not lg.handlers:
        ch = logging.StreamHandler()
        fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
        ch.setFormatter(logging.Formatter(fmt))
        lg.addHandler(ch)
    lg.setLevel(level)
    return lg



def _parse_log_level(v, default=logging.INFO):
    """Parse LOG_LEVEL supporting ints and strings like 'INFO' or '20'."""
    try:
        if v is None:
            return default
        if isinstance(v, int):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return default
            if s.lstrip('-').isdigit():
                return int(s)
            lvl = getattr(logging, s.upper(), None)
            return lvl if isinstance(lvl, int) else default
        return int(v)
    except Exception:
        return default
logger = _setup_logger("divine_engine", level=_parse_log_level(_cfg("LOG_LEVEL", logging.INFO), logging.INFO))

def _atomic_json_write(path: str, payload: dict):
    """Best-effort atomic JSON write with retries (Windows-friendly).
    - Writes to a unique temp file next to the target and replaces atomically.
    - Retries a few times to mitigate transient file locks (e.g., antivirus / Streamlit reruns).
    """
    try:
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)

        tmp = f"{path}.tmp.{os.getpid()}.{int(time.time()*1e6)}"
        last_err = None
        for i in range(6):
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                    try:
                        f.flush()
                        os.fsync(f.fileno())
                    except Exception:
                        pass
                os.replace(tmp, path)
                return
            except Exception as e:
                last_err = e
                try:
                    time.sleep(0.03 * (i + 1))
                except Exception:
                    pass
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        logger.debug(f"atomic_json_write failed for {path}: {last_err}")
    except Exception as e:
        logger.debug(f"atomic_json_write failed for {path}: {e}")



# -----------------------------------------------------------------------------
# Precomputed sets and maps from config (with safe defaults)
# -----------------------------------------------------------------------------
ALL_NUMS = np.array(_cfg("ALL_NUMS", list(range(37))), dtype=int)

RED_SET = set(_cfg("RED", {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}))
BLACK_SET = set(_cfg("BLACK", {n for n in range(1, 37) if n not in RED_SET}))
PAR_SET = set(_cfg("PAR", {n for n in range(1, 37) if n % 2 == 0}))
IMPAR_SET = set(_cfg("IMPAR", {n for n in range(1, 37) if n % 2 == 1}))

DOZENS = _cfg(
    "DOZENS",
    {
        "1-12": list(range(1, 13)),
        "13-24": list(range(13, 25)),
        "25-36": list(range(25, 37)),
    },
)
COLUMNS = _cfg(
    "COLUMNS",
    {
        "Columna 1": [n for n in range(1, 37) if (n - 1) % 3 == 0],
        "Columna 2": [n for n in range(1, 37) if (n - 1) % 3 == 1],
        "Columna 3": [n for n in range(1, 37) if (n - 1) % 3 == 2],
    },
)
DOZEN_NAME_TO_IDX = _cfg("DOZEN_NAME_TO_IDX", {"1-12": 1, "13-24": 2, "25-36": 3})
COLUMN_NAME_TO_IDX = _cfg("COLUMN_NAME_TO_IDX", {"Columna 1": 1, "Columna 2": 2, "Columna 3": 3})



# -----------------------------------------------------------------------------
# FASE 1 — WheelExpert PREMIUM: modelo físico completo de rueda europea
# Aporta a: números, docenas, columnas, color, paridad, rango, guardianes
# Compite como modelo real en el ensemble (no shadow por defecto)
# -----------------------------------------------------------------------------

EU_WHEEL_ORDER: List[int] = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8,
    23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12,
    35, 3, 26
]
_EU_WHEEL_INDEX: Dict[int, int] = {n: i for i, n in enumerate(EU_WHEEL_ORDER)}

_WHEEL_SECTORS: Dict[str, List[int]] = {
    "voisins":   [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
    "tiers":     [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
    "orphelins": [17, 34, 6, 1, 20, 14, 31, 9],
    "zero":      [12, 35, 3, 26, 0, 32, 15],
}

_REDS: set = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}

def _sector_composition(nums: List[int]) -> Dict[str, Any]:
    n = len(nums)
    if n == 0: return {}
    d: Dict[str,float] = {"D1":0,"D2":0,"D3":0,"C1":0,"C2":0,"C3":0,
                           "rojo":0,"negro":0,"verde":0,"par":0,"impar":0,"bajo":0,"alto":0}
    for x in nums:
        if x == 0: d["verde"] += 1; continue
        if 1  <= x <= 12: d["D1"] += 1
        elif 13 <= x <= 24: d["D2"] += 1
        else: d["D3"] += 1
        if x % 3 == 1: d["C1"] += 1
        elif x % 3 == 2: d["C2"] += 1
        else: d["C3"] += 1
        if x in _REDS: d["rojo"] += 1
        else: d["negro"] += 1
        if x % 2 == 0: d["par"] += 1
        else: d["impar"] += 1
        if x <= 18: d["bajo"] += 1
        else: d["alto"] += 1
    return {k: v/n for k, v in d.items()}

_SECTOR_COMP: Dict[str, Dict[str, float]] = {
    s: _sector_composition(nums) for s, nums in _WHEEL_SECTORS.items()
}


class WheelExpertPremium:
    """
    Motor fisico premium de rueda europea.
    Submodelos: SectorDetector, DealerSignature, ScatterModel, SectorComposer, EnsembleVoter.
    Produce p_wheel(n) para competir en ensemble + info extendida para todas las categorias.
    """
    def __init__(self) -> None:
        self._hit_history: deque = deque(maxlen=200)
        self._weight: float = 0.22
        self._weight_min: float = 0.05
        self._weight_max: float = 0.50
        self._eta: float = 0.10

    # 1. SectorDetector
    def _detect_sector_scores(self, spins: List[int], window: int=20, decay: float=0.78) -> Dict[str,float]:
        scores: Dict[str,float] = {s: 0.0 for s in _WHEEL_SECTORS}
        recent = list(spins[-window:])
        for t, n in enumerate(reversed(recent)):
            try:
                idx = _EU_WHEEL_INDEX.get(int(n))
                if idx is None: continue
            except Exception: continue
            w_t = decay ** float(t)
            for sector, nums in _WHEEL_SECTORS.items():
                for s_num in nums:
                    s_idx = _EU_WHEEL_INDEX.get(s_num, -1)
                    dist  = abs(idx - s_idx) % 37
                    dist  = min(dist, 37 - dist)
                    w_d   = max(0.0, 1.0 - dist / 6.0)
                    scores[sector] += w_t * w_d
        total = sum(scores.values()) + 1e-12
        return {s: v/total for s, v in scores.items()}

    # 2. DealerSignature
    def _dealer_signature(self, spins: List[int], sig_window: int=8) -> Dict[str,Any]:
        recent = [_EU_WHEEL_INDEX.get(int(n), -1) for n in spins[-sig_window:]
                  if isinstance(n,(int,float)) and _EU_WHEEL_INDEX.get(int(n)) is not None]
        if len(recent) < 3:
            return {"detected": False, "strength": 0.0, "center_idx": None, "center_num": None}
        arr    = np.array(recent, dtype=float)
        angles = arr * (2*math.pi/37)
        mean_x = float(np.mean(np.cos(angles)))
        mean_y = float(np.mean(np.sin(angles)))
        R      = math.sqrt(mean_x**2 + mean_y**2)
        detected     = R > 0.38
        center_angle = math.atan2(mean_y, mean_x) % (2*math.pi)
        center_idx   = int(round(center_angle/(2*math.pi)*37)) % 37
        return {"detected": detected, "strength": float(np.clip(R,0,1)),
                "center_idx": center_idx, "center_num": EU_WHEEL_ORDER[center_idx]}

    # 3. ScatterModel
    def _scatter_model(self, spins: List[int], scatter_window: int=30) -> Dict[str,Any]:
        if len(spins) < 4:
            return {"peak_scatter":0,"confidence":0.0,"histogram":{}}
        recent = [int(n) for n in spins[-scatter_window:]
                  if isinstance(n,(int,float)) and _EU_WHEEL_INDEX.get(int(n)) is not None]
        if len(recent) < 3:
            return {"peak_scatter":0,"confidence":0.0,"histogram":{}}
        distances: List[int] = []
        for i in range(1, len(recent)):
            a = _EU_WHEEL_INDEX.get(recent[i-1], -1)
            b = _EU_WHEEL_INDEX.get(recent[i],   -1)
            if a < 0 or b < 0: continue
            distances.append((b-a) % 37)
        if not distances:
            return {"peak_scatter":0,"confidence":0.0,"histogram":{}}
        hist: Dict[int,int] = {}
        for d in distances: hist[d] = hist.get(d,0)+1
        peak   = max(hist, key=lambda x: hist[x])
        conf   = float(hist[peak]/max(len(distances),1))
        return {"peak_scatter": int(peak), "confidence": conf,
                "histogram": {str(k):v for k,v in sorted(hist.items())}}

    # 4. SectorComposer
    def _compose_p_vector(self, sector_scores: Dict[str,float], dealer_sig: Dict[str,Any],
                          scatter: Dict[str,Any], spins: List[int], radius: int=3,
                          params: Optional[Dict[str,Any]]=None) -> np.ndarray:
        params = params or {}
        p = np.zeros(37, dtype=float)
        for sector, score in sector_scores.items():
            if score <= 0: continue
            for num in _WHEEL_SECTORS[sector]: p[int(num)] += score
        if bool(dealer_sig.get("detected")) and dealer_sig.get("center_idx") is not None:
            strength = float(dealer_sig["strength"])
            c_idx    = int(dealer_sig["center_idx"])
            for d in range(-radius, radius+1):
                j  = (c_idx+d) % 37
                nn = EU_WHEEL_ORDER[j]
                w_d = max(0.0, 1.0 - abs(d)/(radius+1))
                p[int(nn)] += strength * 0.35 * w_d
        sc_conf = float(scatter.get("confidence",0.0))
        sc_peak = int(scatter.get("peak_scatter",0))
        if sc_conf > 0.22 and len(spins) >= 2 and sc_peak > 0:
            try:
                last_idx = _EU_WHEEL_INDEX.get(int(spins[-1]), -1)
                if last_idx >= 0:
                    pred_idx = (last_idx + sc_peak) % 37
                    for d in range(-2, 3):
                        j  = (pred_idx+d) % 37
                        nn = EU_WHEEL_ORDER[j]
                        w_d = max(0.0, 1.0 - abs(d)/3.0)
                        p[int(nn)] += sc_conf * 0.28 * w_d
            except Exception: pass
        ss = float(p.sum())
        return (p/(ss+EPS)) if ss > 0 else uniform_probs()

    # 5. EnsembleVoter
    def register_outcome(self, predicted_sector: str, actual: int) -> None:
        actual_sectors = [s for s, nums in _WHEEL_SECTORS.items() if actual in nums]
        hit = predicted_sector in actual_sectors
        self._hit_history.append(hit)
        if len(self._hit_history) >= 10:
            recent_hr = float(sum(list(self._hit_history)[-20:])) / min(20, len(self._hit_history))
            expected  = sum(len(v) for v in _WHEEL_SECTORS.values()) / (4*37)
            edge  = recent_hr - expected
            delta = self._eta * edge
            self._weight = float(np.clip(self._weight+delta, self._weight_min, self._weight_max))

    def adaptive_weight(self) -> float:
        return float(self._weight)

    def compute(self, spins: List[int], params: Optional[Dict[str,Any]]=None) -> Dict[str,Any]:
        params = params or {}
        s = _clean_spins(spins)
        if len(s) < 2:
            return {"p_wheel": uniform_probs(), "active_sector": "unknown",
                    "sector_scores": {k: 0.25 for k in _WHEEL_SECTORS},
                    "dealer_sig": {"detected": False, "strength": 0.0},
                    "scatter": {"peak_scatter": 0, "confidence": 0.0},
                    "sector_comp": {}, "adaptive_w": self._weight}
        window = int(params.get("wheel_window", 20))
        decay  = float(params.get("wheel_decay", 0.78))
        radius = int(params.get("wheel_radius", 3))
        sig_w  = int(params.get("wheel_sig_window", 8))
        scat_w = int(params.get("wheel_scatter_window", 30))
        sector_scores = self._detect_sector_scores(s, window=window, decay=decay)
        active_sector = max(sector_scores, key=lambda x: sector_scores[x])
        dealer_sig    = self._dealer_signature(s, sig_window=sig_w)
        scatter       = self._scatter_model(s, scatter_window=scat_w)
        p_wheel       = self._compose_p_vector(sector_scores, dealer_sig, scatter, s,
                                               radius=radius, params=params)
        sector_comp   = _SECTOR_COMP.get(active_sector, {})
        return {"p_wheel": p_wheel, "active_sector": active_sector,
                "sector_scores": sector_scores, "dealer_sig": dealer_sig,
                "scatter": scatter, "sector_comp": sector_comp,
                "adaptive_w": self._weight}


_WHEEL_EXPERT = WheelExpertPremium()


def compute_p_wheel(spins: List[int], params: Optional[Dict[str,Any]]=None) -> np.ndarray:
    """Compatibilidad backward."""
    return _WHEEL_EXPERT.compute(spins, params=params)["p_wheel"]


def get_wheel_expert_info(spins: List[int], params: Optional[Dict[str,Any]]=None) -> Dict[str,Any]:
    """API extendida: info completa del WheelExpert para ensemble y analisis."""
    return _WHEEL_EXPERT.compute(spins, params=params)


# FASE 2 — Guardián como shaping G(n) (sin re-llamar suggest)
# -----------------------------------------------------------------------------
def guardian_shaping_vector(params: Optional[Dict[str, Any]] = None) -> np.ndarray:
    """Construye un vector G(n) usando el estado del Guardián (ewma_edge/hit, last_pick, miss_streak).
    No muta estado (no llama suggest()).
    """
    if params is None:
        params = {}
    enabled = bool(params.get("guardian_shaping_enabled", True))
    if not enabled:
        return np.ones(37, dtype=float)

    strength = float(params.get("guardian_shaping_strength", 1.12))
    strength = float(np.clip(strength, 1.00, 1.35))

    edge_w = float(params.get("guardian_shape_edge_w", 0.60))
    hit_w = float(params.get("guardian_shape_hit_w", 0.03))
    miss_pen = float(params.get("guardian_shape_miss_penalty", 0.006))

    # si viene en mala racha, suavizamos shaping para no "empecinarse"
    miss = int(getattr(_GUARDIAN_CORE, "miss_streak", 0) or 0)
    soft = 1.0 / (1.0 + miss_pen * float(max(0, miss)))
    eff = 1.0 + (strength - 1.0) * soft

    g = np.ones(37, dtype=float)

    try:
        ew_edge = getattr(_GUARDIAN_CORE, "ewma_edge", {}) or {}
        ew_hit = getattr(_GUARDIAN_CORE, "ewma_hit", {}) or {}
    except Exception:
        ew_edge, ew_hit = {}, {}

    # score por docena (pequeño y estable)
    doc_mult: Dict[str, float] = {}
    for name in ("1-12", "13-24", "25-36"):
        e = float(ew_edge.get(name, 0.0) or 0.0)     # típico [-0.05, +0.05]
        h = float(ew_hit.get(name, 0.5) or 0.5)      # [0..1]
        score = (edge_w * (e * 12.0)) + (hit_w * (h - 0.5) * 2.0)  # escala suave
        mult = 1.0 + (eff - 1.0) * float(np.clip(score, -0.20, 0.25))
        # clamp para no distorsionar demasiado
        mult = float(np.clip(mult, 0.88, 1.18))
        doc_mult[name] = mult

    for name, nums in DOZENS.items():
        mult = float(doc_mult.get(name, 1.0))
        for n in nums:
            if 0 <= int(n) <= 36:
                g[int(n)] *= mult

    # normalizar para que el promedio sea ~1
    gm = float(g.mean()) if g.size else 1.0
    if gm <= 0:
        return np.ones(37, dtype=float)
    return g / gm
BET_CATEGORIES = _cfg(
    "BET_CATEGORIES",
    {
        "docenas": {"label": "Docenas", "type": "group_3", "groups": DOZENS},
        "columnas": {"label": "Columnas", "type": "group_3", "groups": COLUMNS},
        "color": {"label": "Color", "type": "group_2", "groups": {"Rojo": list(RED_SET), "Negro": list(BLACK_SET)}},
        "paridad": {"label": "Paridad", "type": "group_2", "groups": {"Par": list(PAR_SET), "Impar": list(IMPAR_SET)}},
        "rango": {
            "label": "Rango",
            "type": "group_2",
            "groups": {"Bajo (1-18)": list(range(1, 19)), "Alto (19-36)": list(range(19, 37))},
        },
        "guardian_docena": {"label": "Apuesta Guardián (Docena)", "type": "special", "groups": {}},
        "max_conf": {"label": "Números (Top 12)", "type": "special", "groups": {}},
        "simple": {"label": "Simple (Legacy)", "type": "special", "groups": {}},
    },
)

# Build index map once for fast sum (precomputed arrays of indices)
_CATEGORY_INDEX_MAP: Dict[str, Dict[str, np.ndarray]] = {}
for key, cat in (BET_CATEGORIES or {}).items():
    groups = (cat or {}).get("groups", {}) if isinstance(cat, dict) else {}
    try:
        _CATEGORY_INDEX_MAP[key] = {name: np.array(nums, dtype=int) for name, nums in (groups or {}).items()}
    except Exception:
        _CATEGORY_INDEX_MAP[key] = {}

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def uniform_probs(n: int = 37) -> np.ndarray:
    arr = np.ones(n, dtype=float)
    return arr / float(arr.sum())


def _clean_spins(spins: Optional[List[int]]) -> List[int]:
    if not spins:
        return []
    out: List[int] = []
    for x in spins:
        try:
            xi = int(x)
        except Exception:
            continue
        if 0 <= xi < 37:
            out.append(xi)
    return out


def _sum_over_indices(p: np.ndarray, idxs) -> float:
    if idxs is None:
        return 0.0
    try:
        if isinstance(idxs, (int, np.integer)):
            idxs = [int(idxs)]
        idxs_arr = np.array(idxs, dtype=int)
        if idxs_arr.size == 0:
            return 0.0
        idxs_clipped = idxs_arr[(idxs_arr >= 0) & (idxs_arr < p.size)]
        if idxs_clipped.size == 0:
            return 0.0
        return float(np.sum(p[idxs_clipped]))
    except Exception:
        return 0.0


def _shannon_entropy(probs: np.ndarray) -> float:
    probs = np.asarray(probs, dtype=float)
    s = probs.sum()
    if s <= 0:
        return 0.0
    probs = probs / s
    probs = probs[probs > 0]
    if probs.size == 0:
        return 0.0
    return -float(np.sum(probs * np.log2(probs)))


def docena_of(n: int) -> int:
    try:
        n = int(n)
        if n == 0:
            return 0
        if 1 <= n <= 12:
            return 1
        if 13 <= n <= 24:
            return 2
        if 25 <= n <= 36:
            return 3
    except Exception:
        pass
    return 0


def columna_of(n: int) -> int:
    try:
        n = int(n)
        if n == 0:
            return 0
        return ((n - 1) % 3) + 1
    except Exception:
        pass
    return 0


def _get_prev_mesa_score(last_suggestion: dict):
    """Return prior mesa_score from last_suggestion (canonical: 'mesa_score', alias: 'mesa').

    This keeps a single source of truth internally while preserving backward-compatible payloads.
    """
    if not isinstance(last_suggestion, dict):
        return None
    ms = last_suggestion.get("mesa_score", None)
    if ms is None:
        ms = last_suggestion.get("mesa", None)
    return ms


def _attach_mesa_score(payload: dict, mesa_score: dict) -> dict:
    """Attach canonical mesa_score plus backward-compatible alias key ('mesa')."""
    if not isinstance(payload, dict):
        return payload
    payload["mesa_score"] = mesa_score
    payload["mesa"] = mesa_score
    return payload



def _hmax_groups(k: int) -> float:
    k = int(k)
    if k <= 1:
        return 0.0
    return float(math.log(k, 2))


def _hmax_numbers() -> float:
    return float(math.log(37, 2))


def _ev_group(p: float, k_groups: int) -> float:
    """
    EV per 1 unit stake for:
      - k_groups=2 : even money (1:1) => EV = 2p - 1
      - k_groups=3 : dozen/column (2:1) => EV = 3p - 1
    """
    p = float(p)
    if k_groups == 2:
        return 2.0 * p - 1.0
    if k_groups == 3:
        return 3.0 * p - 1.0
    return 0.0


def _ev_group3_top2(p: float) -> float:
    """EV per 1 unit *total* stake when betting two group_3 options (e.g., 2 dozens/2 columns).

    Betting 1 unit on each of two options (total stake=2):
      - win: +1 net (get 3 back on the winning stake)
      - lose: -2 net
    EV per total stake unit => (3p - 2) / 2 = 1.5p - 1
    Break-even at p = 2/3 ≈ 0.6667
    """
    p = float(p)
    return 1.5 * p - 1.0

def _kelly_group3_top2(p_total: float) -> float:
    """Calcula la fracción de Kelly para una apuesta a 2 docenas/columnas con blindaje."""
    denom = 2.0 * (1.0 - float(p_total))
    if abs(denom) < 1e-9:
        return 0.0
    k = (3.0 * float(p_total) - 2.0) / denom
    return max(0.0, min(float(k), 1.0))



def _confidence_score(top_p: float, k_groups: int, entropy: float) -> float:
    """
    Confidence in [0,1] combining:
    - how far top_p is above uniform (1/k_groups)
    - how low entropy is vs max entropy log2(k_groups)
    """
    k = max(2, int(k_groups))
    uniform = 1.0 / k
    top_p = float(top_p)
    conf_raw = (top_p - uniform) / max(EPS, 1.0 - uniform)
    conf_raw = float(np.clip(conf_raw, 0.0, 1.0))

    H = float(entropy)
    Hmax = _hmax_groups(k)
    cert = 0.0
    if Hmax > 0:
        cert = 1.0 - (H / Hmax)
    cert = float(np.clip(cert, 0.0, 1.0))

    return float(np.clip(0.65 * conf_raw + 0.35 * cert, 0.0, 1.0))


def _confidence_score_numbers(p_win: float, k_sel: int, H_nums: float) -> float:
    """
    Confidence in [0,1] for betting a set of k numbers with total winning probability p_win.
    """
    p_win = float(p_win)
    k = max(1, int(k_sel))
    baseline = k / 37.0
    conf_raw = (p_win - baseline) / max(EPS, 1.0 - baseline)
    conf_raw = float(np.clip(conf_raw, 0.0, 1.0))

    H = float(H_nums)
    Hmax = _hmax_numbers()
    cert = 0.0
    if Hmax > 0:
        cert = 1.0 - (H / Hmax)
    cert = float(np.clip(cert, 0.0, 1.0))

    return float(np.clip(0.7 * conf_raw + 0.3 * cert, 0.0, 1.0))


# -----------------------------------------------------------------------------
# Predictive modules
# -----------------------------------------------------------------------------

class IncrementalMarkov:
    def __init__(self):
        self.T = np.zeros((37, 37), dtype=float)
        self.row_sums = np.ones(37, dtype=float)
        self.last_spin = None

    def update(self, new_spin: int):
        if self.last_spin is not None:
            prev = int(self.last_spin)
            curr = int(new_spin)
            self.T[prev, curr] += 1.0
            self.row_sums[prev] += 1.0
        self.last_spin = int(new_spin)

    def predict(self) -> np.ndarray:
        if self.last_spin is None:
            return uniform_probs()
        row = self.T[int(self.last_spin), :]
        rs = float(self.row_sums[int(self.last_spin)])
        if rs <= 0 or (not np.isfinite(rs)):
            return uniform_probs()
        p = row / rs
        ss = float(p.sum())
        if ss <= 1e-9 or (not np.isfinite(ss)) or (not np.isfinite(p).all()):
            return uniform_probs()
        return p / ss


class IncrementalFreqDecay:
    def __init__(self, lam: float = 0.03, alpha_dir: float = 1.0):
        self.alpha = 1.0 - math.exp(-float(lam))
        self.alpha_dir = float(alpha_dir)
        self.ewma = np.ones(37, dtype=float) * (1.0 / 37.0)

    def update(self, spin: int):
        one_hot = np.zeros(37, dtype=float)
        one_hot[int(spin)] = 1.0
        self.ewma = (1.0 - self.alpha) * self.ewma + self.alpha * one_hot

    def predict(self) -> np.ndarray:
        p = self.ewma + self.alpha_dir / 37.0
        ss = float(p.sum())
        if ss <= 1e-9 or (not np.isfinite(ss)) or (not np.isfinite(p).all()):
            return uniform_probs()
        return p / ss

def compute_p_freq_decay(spins: List[int], alpha: float, lam: float, window: Optional[int] = None) -> np.ndarray:
    s = _clean_spins(spins)
    if len(s) == 0:
        post = np.ones(37, dtype=float) * float(max(alpha, EPS))
        return post / (post.sum() + EPS)

    lam = float(lam) if lam is not None else 0.0
    lam = abs(lam)
    recent = s[-window:] if window is not None else s
    n = len(recent)
    if n == 0:
        post = np.ones(37, dtype=float) * float(max(alpha, EPS))
        return post / (post.sum() + EPS)

    weights = np.exp(-lam * np.arange(n)[::-1].astype(float))
    weights = weights / (weights.sum() + EPS)
    bins = np.bincount(np.array(recent, dtype=int), weights=weights, minlength=37).astype(float)
    post = bins + float(max(alpha, EPS))
    ssum = float(post.sum())
    return (post / ssum) if ssum > 0 else uniform_probs()


# Markov (order 1..2)
def _build_markov(spins: List[int], order: int = 1) -> Optional[np.ndarray]:
    s = _clean_spins(spins)
    if order == 1:
        if len(s) < 2:
            return None
        T = np.zeros((37, 37), dtype=float)
        a = np.array(s[:-1], dtype=int)
        b = np.array(s[1:], dtype=int)
        np.add.at(T, (a, b), 1.0)
        row = T.sum(axis=1, keepdims=True)
        row[row == 0] = 1.0
        return T / row
    if order == 2:
        if len(s) < 3:
            return None
        T = np.zeros((37, 37, 37), dtype=float)
        for a, b, c in zip(s[:-2], s[1:-1], s[2:]):
            T[int(a), int(b), int(c)] += 1.0
        row = T.sum(axis=2, keepdims=True)
        row[row == 0] = 1.0
        return T / row
    return None


def _select_markov_order(spins, min_data=50):
    s = _clean_spins(spins)
    if len(s) < min_data:
        return 1
    return 2 if len(s) >= 5000 else 1


def compute_p_markov(spins: List[int]) -> np.ndarray:
    s = _clean_spins(spins)
    if len(s) < 2:
        return uniform_probs()
    order = _select_markov_order(s, min_data=30)
    T = _build_markov(s, order)
    if T is None:
        return uniform_probs()
    if order == 1:
        prev = int(s[-1])
        probs = np.array(T[prev, :], dtype=float)
    else:
        if len(s) < 2:
            return uniform_probs()
        p1 = int(s[-1])
        p2 = int(s[-2])
        probs = np.array(T[p2, p1, :], dtype=float)
        ss = float(probs.sum())
        if ss <= 1e-9:
            # Fallback explícito a order 1 si la transición no ha sido observada
            T1 = _build_markov(s, 1)
            if T1 is None:
                return uniform_probs()
            prev = int(s[-1])
            probs = np.array(T1[prev, :], dtype=float)
    ss = float(probs.sum())
    return (probs / ss) if ss > 0 else uniform_probs()


# Naive Bayes helpers (sklearn optional)
def _featurize_counts_single(spins: List[int], window: Optional[int]) -> np.ndarray:
    s = _clean_spins(spins)
    if window is not None:
        s = s[-int(window):]
    if len(s) == 0:
        return np.zeros((1, 37), dtype=int)
    counts = np.bincount(np.array(s, dtype=int), minlength=37)[:37].astype(int)
    return counts.reshape(1, -1)


def compute_p_nb(spins: List[int], window: int, nb_model) -> np.ndarray:
    if nb_model is None or len(spins or []) < 2:
        return uniform_probs()
    counts = _featurize_counts_single(spins, window)
    try:
        if not hasattr(nb_model, "classes_"):
            return uniform_probs()
        probs = nb_model.predict_proba(counts)[0]
    except Exception:
        return uniform_probs()

    probs_full = np.zeros(37, dtype=float)
    classes = getattr(nb_model, "classes_", None)
    if classes is None:
        if len(probs) == 37:
            probs_full = np.array(probs, dtype=float)
        else:
            return uniform_probs()
    else:
        class_map = {int(c): float(p) for c, p in zip(classes, probs)}
        for i in range(37):
            probs_full[i] = class_map.get(i, 0.0)

    ss = float(probs_full.sum())
    return (probs_full / ss) if ss > 0 else uniform_probs()


def update_nb_model(nb_model, spins_before: List[int], new_spin: int, window: int):
    if nb_model is None:
        return None
    feats = _featurize_counts_single(spins_before, window)
    y = np.array([int(new_spin)], dtype=int)

    try:
        if not hasattr(nb_model, "classes_"):
            nb_model.partial_fit(feats, y, classes=np.arange(37))
        else:
            nb_model.partial_fit(feats, y)
    except Exception:
        logger.debug("update_nb_model: partial_fit failed", exc_info=True)
    return nb_model


def save_nb_prior_checkpoint(nb_model, path: str):
    if nb_model is None:
        return
    try:
        import joblib  # type: ignore

        prior_data = {}
        for attr in ("class_log_prior_", "feature_log_prob_", "class_count_", "classes_"):
            if hasattr(nb_model, attr):
                prior_data[attr] = getattr(nb_model, attr)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(prior_data, path)
    except Exception:
        logger.debug("save_nb_prior_checkpoint failed", exc_info=True)


def save_nb_model_checkpoint(nb_model, path: str):
    if nb_model is None:
        return
    try:
        import joblib  # type: ignore

        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(nb_model, path)
    except Exception:
        logger.debug("save_nb_model_checkpoint failed", exc_info=True)


# ---- LSTM core (tensorflow optional) ----
class AdaptiveLSTMCore:
    def __init__(self, sequence_len: int = 15, hidden_units: int = 64):
        self.sequence_len = int(sequence_len)
        self.hidden_units = int(hidden_units)
        self.model = None
        self.scaler = None
        self.last_trained_on = 0

    @staticmethod
    def _get_features_for_spin(n: int, prev_n: int) -> List[float]:
        n = int(n) if n is not None else 0
        prev_n = int(prev_n) if prev_n is not None else 0
        angle = 2.0 * math.pi * (n / 37.0)
        sin_feat = math.sin(angle)
        cos_feat = math.cos(angle)
        return [
            float(n),
            sin_feat,
            cos_feat,
            1.0 if n in RED_SET else 0.0,
            1.0 if n in BLACK_SET else 0.0,
            1.0 if n in PAR_SET else 0.0,
            1.0 if n in IMPAR_SET else 0.0,
            1.0 if docena_of(n) == 1 else 0.0,
            1.0 if docena_of(n) == 2 else 0.0,
            1.0 if docena_of(n) == 3 else 0.0,
            1.0 if columna_of(n) == 1 else 0.0,
            1.0 if columna_of(n) == 2 else 0.0,
            1.0 if columna_of(n) == 3 else 0.0,
            float(n - prev_n),
        ]

    def _prepare(self, spins: List[int]):
        from sklearn.preprocessing import MinMaxScaler  # type: ignore

        scaler = MinMaxScaler(feature_range=(0, 1))
        s = _clean_spins(spins)
        NUM_FEATURES = 14

        if len(s) == 0:
            return np.zeros((0, self.sequence_len, NUM_FEATURES)), np.zeros((0, 37)), scaler

        feats = [self._get_features_for_spin(s[0], 0)]
        for i in range(1, len(s)):
            feats.append(self._get_features_for_spin(s[i], s[i - 1]))
        feats_arr = np.array(feats, dtype=float)

        try:
            scaler.fit(feats_arr)
            feats_scaled = scaler.transform(feats_arr)
        except Exception:
            feats_scaled = feats_arr

        X, y = [], []
        max_i = len(feats_scaled) - self.sequence_len
        for i in range(max_i):
            X.append(feats_scaled[i : i + self.sequence_len])
            y.append(s[i + self.sequence_len])

        if len(X) == 0:
            return np.zeros((0, self.sequence_len, NUM_FEATURES)), np.zeros((0, 37)), scaler

        from tensorflow.keras.utils import to_categorical  # type: ignore

        X_out = np.array(X, dtype=float).reshape(len(X), self.sequence_len, NUM_FEATURES)
        y_out = to_categorical(np.array(y), num_classes=37)
        return X_out, y_out, scaler

    def _create_model(self):
        from tensorflow.keras.models import Sequential  # type: ignore
        from tensorflow.keras.layers import LSTM, Dense, Dropout, Input  # type: ignore

        NUM_FEATURES = 14
        model = Sequential()
        model.add(Input(shape=(self.sequence_len, NUM_FEATURES)))
        model.add(LSTM(self.hidden_units, return_sequences=True))
        model.add(Dropout(0.2))
        model.add(LSTM(self.hidden_units))
        model.add(Dropout(0.2))
        model.add(Dense(32, activation="relu"))
        model.add(Dense(37, activation="softmax"))
        model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
        return model

    def train(self, spins: List[int], epochs: int = 15, batch_size: int = 32, validation_split: float = 0.1, verbose: int = 0) -> dict:
        try:
            X, y, scaler = self._prepare(spins)
            if X.size == 0:
                return {"success": False, "message": "Datos insuficientes para LSTM."}
            model = self._create_model()
            from tensorflow.keras.callbacks import EarlyStopping  # type: ignore

            es = EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True, verbose=0)
            model.fit(X, y, epochs=epochs, batch_size=batch_size, validation_split=validation_split, verbose=verbose, callbacks=[es])
            self.model = model
            self.scaler = scaler
            self.last_trained_on = len(spins)
            return {"success": True, "model": model, "scaler": scaler, "message": "LSTM entrenado"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def fine_tune(self, spins: List[int], epochs: int = 5, batch_size: int = 32, verbose: int = 0) -> dict:
        try:
            if self.model is None:
                return self.train(spins, epochs=epochs, batch_size=batch_size, validation_split=0.1, verbose=verbose)
            X, y, scaler = self._prepare(spins)
            if X.size == 0:
                return {"success": False, "message": "Datos insuficientes para fine-tune."}
            self.scaler = scaler
            self.model.fit(X, y, epochs=epochs, batch_size=batch_size, validation_split=0.1, verbose=verbose)
            self.last_trained_on = len(spins)
            return {"success": True, "model": self.model, "scaler": self.scaler, "message": "LSTM re-entrenado"}
        except Exception as e:
            return {"success": False, "message": str(e)}


def train_lstm_model_live_v2(
    spins: List[int],
    seq_len: int,
    existing_model: Optional[Any] = None,
    epochs: Optional[int] = None,
    batch_size: int = 32,
    validation_split: float = 0.1,
    patience: int = 3,
    verbose: int = 0,
) -> dict:
    try:
        core = AdaptiveLSTMCore(sequence_len=int(seq_len))
        if isinstance(existing_model, AdaptiveLSTMCore):
            core = existing_model
        elif isinstance(existing_model, dict):
            core.model = existing_model.get("model")
            core.scaler = existing_model.get("scaler")
        elif existing_model is not None:
            core.model = existing_model

        if core.model is None:
            if epochs is None:
                epochs = 15
            return core.train(spins, epochs=int(epochs), batch_size=batch_size, validation_split=validation_split, verbose=verbose)
        else:
            if epochs is None:
                epochs = 5
            return core.fine_tune(spins, epochs=int(epochs), batch_size=batch_size, verbose=verbose)
    except Exception as e:
        return {"success": False, "model": None, "scaler": None, "message": str(e)}


def compute_p_lstm_v2(spins: List[int], model: Optional[Any] = None, scaler: Optional[Any] = None, seq_len: int = 12) -> np.ndarray:
    if model is None or scaler is None:
        return uniform_probs()

    s = _clean_spins(spins)
    recent = s[-(seq_len + 1) :]
    if len(recent) < 2:
        return uniform_probs()

    NUM_FEATURES = 14
    feats = []
    if len(recent) <= seq_len and len(recent) > 0:
        feats.append(AdaptiveLSTMCore._get_features_for_spin(recent[0], 0))
    for i in range(1, len(recent)):
        feats.append(AdaptiveLSTMCore._get_features_for_spin(recent[i], recent[i - 1]))
    feats = feats[-seq_len:]
    feats_np = np.array(feats, dtype=float)
    if feats_np.ndim == 1:
        feats_np = feats_np.reshape(1, -1)

    if feats_np.shape[1] != NUM_FEATURES:
        return uniform_probs()

    try:
        feats_scaled = scaler.transform(feats_np)
    except Exception:
        feats_scaled = feats_np

    if feats_scaled.shape[0] != seq_len:
        if feats_scaled.shape[0] > seq_len:
            feats_scaled = feats_scaled[-seq_len:]
        else:
            return uniform_probs()

    X = feats_scaled.reshape(1, seq_len, NUM_FEATURES)

    try:
        preds = model.predict(X, verbose=0)
        preds = np.array(preds)
        preds = preds[0] if preds.ndim > 1 else preds
    except Exception:
        return uniform_probs()

    preds = np.nan_to_num(preds, nan=1e-9, posinf=1e-9, neginf=1e-9)
    preds = np.maximum(preds, 1e-12)
    if preds.size != 37:
        tmp = np.ones(37, dtype=float) * 1e-9
        tmp[: min(preds.size, 37)] = preds[: min(preds.size, 37)]
        preds = tmp

    ss = float(preds.sum())
    return (preds / ss) if ss > 0 else uniform_probs()


# -----------------------------------------------------------------------------
# Guardian Docena Core (agile, anti-sticky, stateful, engine-owned)
# -----------------------------------------------------------------------------
class GuardianDocenaCore:
    """Guardián Docena (solo docenas, independiente del gate global).

    Nota: Este módulo NO debe bloquear ni castigar otras categorías (primary/docenas/columnas/etc.).
    Su salida se reporta como una apuesta adicional con su propio status (WAIT/PROBE/BET).
    """

    def __init__(self, persist: bool = True, save_every: int = 1):
        self.persist = bool(persist)
        self.save_every = max(1, int(save_every or 1))

        # Estado interno (solo para esta apuesta)
        self.step = 0
        self.last_pick_norm = None  # '1-12' | '13-24' | '25-36'
        self.last_edge = 0.0
        self.last_hit = None
        self.last_spin = None
        self.last_token = None

        # EWMA por pick (hit-rate y edge)
        self.ewma_hit = {"1-12": 0.5, "13-24": 0.5, "25-36": 0.5}
        self.ewma_edge = {"1-12": 0.0, "13-24": 0.0, "25-36": 0.0}

        self.miss_streak = 0
        self.cooldown_left = 0

        # anti-flip (evita cambiar pick por ruido)
        self.last_switch_step = 0

        # Persistencia
        try:
            base_dir = os.path.dirname(__file__)
        except Exception:
            base_dir = "."
        self.state_path = os.path.join(base_dir, "guardianes_docena_state.json")

        if self.persist:
            self._load_state()

    @staticmethod
    def _normalize_pick(pick) -> str:
        if pick is None:
            return ""
        s = str(pick).strip()
        # Acepta variantes comunes
        mapping = {
            "1": "1-12", "docena 1": "1-12", "primera": "1-12", "1-12": "1-12",
            "2": "13-24", "docena 2": "13-24", "segunda": "13-24", "13-24": "13-24",
            "3": "25-36", "docena 3": "25-36", "tercera": "25-36", "25-36": "25-36",
        }
        key = s.lower()
        return mapping.get(key, s)

    def _state_payload(self) -> dict:
        return {
            "v": 1,
            "step": self.step,
            "last_pick_norm": self.last_pick_norm,
            "last_edge": self.last_edge,
            "last_hit": self.last_hit,
            "last_spin": self.last_spin,
            "miss_streak": self.miss_streak,
            "cooldown_left": self.cooldown_left,
            "last_switch_step": self.last_switch_step,
            "ewma_hit": self.ewma_hit,
            "ewma_edge": self.ewma_edge,
            "last_token": self.last_token,
        }

    def _save_state(self, force: bool = False) -> None:
        if not self.persist:
            return
        if (not force) and (self.step % self.save_every != 0):
            return

        # Guardado robusto en Windows:
        # - escribe a tmp único
        # - fsync
        # - os.replace con reintentos (WinError 5 ocurre si el destino está bloqueado por otro proceso)
        try:
            import time as _time
            import os as _os
            import json as _json

            state_dir = _os.path.dirname(self.state_path) or "."
            try:
                _os.makedirs(state_dir, exist_ok=True)
            except Exception:
                pass

            tmp = f"{self.state_path}.tmp.{_os.getpid()}"
            payload = self._state_payload()

            with open(tmp, "w", encoding="utf-8") as f:
                _json.dump(payload, f, ensure_ascii=False, indent=2)
                try:
                    f.flush()
                    _os.fsync(f.fileno())
                except Exception:
                    pass

            last_err = None
            for _ in range(6):  # ~0.8s total
                try:
                    _os.replace(tmp, self.state_path)
                    last_err = None
                    break
                except PermissionError as e:
                    last_err = e
                    _time.sleep(0.15)
                except OSError as e:
                    # Otros OSError: intentamos igual un par de veces
                    last_err = e
                    _time.sleep(0.15)

            if last_err is not None:
                # Fallback: dejamos tmp como backup y registramos warning
                try:
                    logger.warning(f"GuardianDocenaCore: no se pudo guardar estado (lock). Se dejó backup: {tmp} | err={last_err}")
                except Exception:
                    pass
        except Exception as e:
            try:
                logger.warning(f"GuardianDocenaCore: no se pudo guardar estado: {e}")
            except Exception:
                pass

    def _load_state(self) -> None:
        try:
            if not os.path.exists(self.state_path):
                return
            with open(self.state_path, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
            self.step = int(data.get("step", self.step) or 0)
            self.last_pick_norm = data.get("last_pick_norm", self.last_pick_norm)
            self.last_edge = float(data.get("last_edge", self.last_edge) or 0.0)
            self.last_hit = data.get("last_hit", self.last_hit)
            self.last_spin = data.get("last_spin", self.last_spin)
            self.miss_streak = int(data.get("miss_streak", self.miss_streak) or 0)
            self.cooldown_left = int(data.get("cooldown_left", self.cooldown_left) or 0)
            self.last_switch_step = int(data.get("last_switch_step", self.last_switch_step) or 0)
            eh = data.get("ewma_hit", {})
            ee = data.get("ewma_edge", {})
            if isinstance(eh, dict):
                for k in self.ewma_hit:
                    if k in eh:
                        self.ewma_hit[k] = float(eh[k])
            if isinstance(ee, dict):
                for k in self.ewma_edge:
                    if k in ee:
                        self.ewma_edge[k] = float(ee[k])
            self.last_token = data.get("last_token", self.last_token)
        except Exception as e:
            try:
                logger.warning(f"GuardianDocenaCore: no se pudo cargar estado: {e}")
            except Exception:
                pass

    def _ewma_update(self, pick_norm: str, hit: bool, edge: float, alpha: float = 0.15) -> None:
        try:
            x = 1.0 if bool(hit) else 0.0
            self.ewma_hit[pick_norm] = (1 - alpha) * float(self.ewma_hit.get(pick_norm, 0.5)) + alpha * x
            self.ewma_edge[pick_norm] = (1 - alpha) * float(self.ewma_edge.get(pick_norm, 0.0)) + alpha * float(edge or 0.0)
        except Exception:
            pass

    def observe(self, pick_norm: str, hit: bool, edge: float, token: str = "") -> None:
        """Actualiza estado tras evaluar un spin.

        token se usa para evitar doble conteo (p.ej. snapshot_spins_count:spin).
        """
        if token and (token == self.last_token):
            return
        self.last_token = token

        pn = self._normalize_pick(pick_norm)
        self.last_pick_norm = pn
        self.last_edge = float(edge or 0.0)
        self.last_hit = bool(hit) if hit is not None else None

        # Extrae spin del token si viene como "<count>:<spin>"
        if token and ":" in token:
            try:
                self.last_spin = int(str(token).split(":")[-1])
            except Exception:
                pass

        # rachas / cooldown (solo para el guardián)
        if hit is True:
            self.miss_streak = 0
            self.cooldown_left = max(0, self.cooldown_left - 1)
        elif hit is False:
            self.miss_streak += 1
            # cooldown suave si encadena fallos
            if self.miss_streak >= 3:
                self.cooldown_left = max(self.cooldown_left, 2)
                self.miss_streak = 0
        else:
            # no evaluable
            self.cooldown_left = max(0, self.cooldown_left - 1)

        self._ewma_update(pn, bool(hit), float(edge or 0.0))
        self._save_state(force=False)

    def register_result(self, pick_norm: str, hit: bool, edge: float, token: str = "") -> None:
        # Alias histórico
        self.observe(pick_norm, hit, edge, token=token)

    def suggest(self, doc_probs: dict, meta_extra: dict = None, params: dict = None) -> dict:
        """Devuelve sugerencia del guardián (docena) con status propio WAIT/PROBE/BET."""
        self.step += 1
        meta_extra = meta_extra or {}
        params = params or {}

        _meta_src = meta_extra

        # Prob baseline (europea): 12/37
        baseline_p = float(params.get("baseline_docena_p", 12.0 / 37.0))

        # Normaliza probs
        probs = {"1-12": 0.0, "13-24": 0.0, "25-36": 0.0}
        if isinstance(doc_probs, dict):
            for k, v in doc_probs.items():
                nk = self._normalize_pick(k)
                if nk in probs:
                    try:
                        probs[nk] = float(v)
                    except Exception:
                        pass

        # Si viene sin señal usable, WAIT
        if sum(probs.values()) <= 1e-9:
            return {
                "label": "Apuesta Guardián (Docena)",
                "type": "guardian",
                "pick": None,
                "top_suggestion": None,
                "top_probability": 0.0,
                "top_2_suggestions": [],
                "baseline_p": baseline_p,
                "edge": 0.0,
                "status": "WAIT",
                "reason": "sin señal",
                "suggested": False,
            }

        # Ordena top2
        ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
        top1, p1 = ranked[0]
        top2, p2 = ranked[1]
        top2_list = [[top1, float(p1)], [top2, float(p2)]]

        # Anti-flip: no cambiar pick muy seguido a menos que haya ventaja clara
        dwell = int(params.get("guardian_dwell_spins", 2))
        switch_bonus = float(params.get("guardian_switch_bonus", 0.02))
        chosen = top1
        if self.last_pick_norm and self.last_pick_norm != top1:
            since = self.step - int(self.last_switch_step or 0)
            # si acabamos de cambiar, mantenemos el anterior salvo mejora fuerte
            if since < dwell:
                if (p1 - probs.get(self.last_pick_norm, 0.0)) < switch_bonus:
                    chosen = self.last_pick_norm
            # si sí cambiamos, registra
        if chosen != self.last_pick_norm:
            self.last_switch_step = self.step
            self.last_pick_norm = chosen

        chosen_p = float(probs.get(chosen, 0.0))
        edge = chosen_p - baseline_p

        exploit_edge = float(params.get("guardian_exploit_edge", 0.01))
        probe_edge = float(params.get("guardian_probe_edge", 0.004))
        # WheelExpert: si sector activo coincide con pick del guardian, reducir umbral
        try:
            _whi = params.get('_wheel_info') or {}
            if isinstance(_whi, dict) and _whi:
                _wa2 = str(_whi.get('active_sector','') or '')
                _ws2 = _whi.get('sector_scores',{}) or {}
                _wt2 = max(_ws2.values()) if _ws2 else 0.0
                _sc2 = _SECTOR_COMP.get(_wa2, {})
                # Docena dominante en el sector
                _d_max = max(['D1','D2','D3'], key=lambda d: _sc2.get(d,0))
                _d_map = {'D1':'1-12','D2':'13-24','D3':'25-36'}
                _wheel_doc = _d_map.get(_d_max,'')
                _pick_norm2 = str(self.state.get('last_pick_norm','') or '')
                if _wheel_doc and _pick_norm2 == _wheel_doc and _wt2 > 0.30:
                    # Sector confirma al guardian: bajar umbral un 25%
                    _reduction = float(np.clip((_wt2-0.25)*0.8, 0.0, 0.35))
                    exploit_edge = exploit_edge * (1.0 - _reduction)
                    probe_edge   = probe_edge   * (1.0 - _reduction)
        except Exception:
            pass

        if self.cooldown_left > 0:
            status = "WAIT"
            reason = f"cooldown({self.cooldown_left})"
        else:
            if edge >= exploit_edge:
                status = "BET"
                reason = f"edge={edge:+.3f}>=ex"  # exploit
            elif edge >= probe_edge:
                status = "PROBE"
                reason = f"edge={edge:+.3f}>=pr"
            else:
                status = "WAIT"
                reason = f"edge={edge:+.3f}<pr"

        return {
            "label": "Apuesta Guardián (Docena)",
            "type": "guardian",
            "pick": chosen,
            "top_suggestion": chosen,
            "top_probability": chosen_p,
            "top_2_suggestions": top2_list,
            "baseline_p": baseline_p,
            "edge": edge,
            "status": status,
            "reason": reason,
            "suggested": status in ("BET", "PROBE"),
            "last": {
                "spin": self.last_spin,
                "pick": self.last_pick_norm,
                "edge": self.last_edge,
                "hit": self.last_hit,
                "ewma_hit": float(self.ewma_hit.get(chosen, 0.5)),
            },
        }

class GuardianColumnaCore:
    """Guardián Columna (solo columnas, independiente del gate global).

    Nota: Este módulo NO debe bloquear ni castigar otras categorías (primary/docenas/columnas/etc.).
    Su salida se reporta como una apuesta adicional con su propio status (WAIT/PROBE/BET).
    """

    def __init__(self, persist: bool = True, save_every: int = 1):
        self.persist = bool(persist)
        self.save_every = max(1, int(save_every or 1))

        # Estado interno (solo para esta apuesta)
        self.step = 0
        self.last_pick_norm = None  # 'Columna 1' | 'Columna 2' | 'Columna 3'
        self.last_edge = 0.0
        self.last_hit = None
        self.last_spin = None

        self.miss_streak = 0
        self.cooldown_left = 0

        # EWMA por opción (hit-rate, edge)
        self.ewma_hit = {"Columna 1": 0.5, "Columna 2": 0.5, "Columna 3": 0.5}
        self.ewma_edge = {"Columna 1": 0.0, "Columna 2": 0.0, "Columna 3": 0.0}

        self._last_token = None
        self._save_counter = 0

        self.state_path = os.path.join(_cfg("MODEL_DIR", "."), "guardianes_columna_state.json")

        if self.persist:
            self._load_state()

    def _load_state(self):
        try:
            if os.path.exists(self.state_path):
                with open(self.state_path, "r", encoding="utf-8") as f:
                    s = json.load(f)
                if isinstance(s, dict):
                    self.step = int(s.get("step", self.step) or 0)
                    self.last_pick_norm = s.get("last_pick_norm", self.last_pick_norm)
                    self.last_edge = float(s.get("last_edge", self.last_edge) or 0.0)
                    self.last_hit = s.get("last_hit", self.last_hit)
                    self.last_spin = s.get("last_spin", self.last_spin)
                    self.miss_streak = int(s.get("miss_streak", self.miss_streak) or 0)
                    self.cooldown_left = int(s.get("cooldown_left", self.cooldown_left) or 0)
                    ew_hit = s.get("ewma_hit", None)
                    ew_edge = s.get("ewma_edge", None)
                    if isinstance(ew_hit, dict):
                        for k in self.ewma_hit.keys():
                            if k in ew_hit:
                                self.ewma_hit[k] = float(ew_hit.get(k, self.ewma_hit[k]) or self.ewma_hit[k])
                    if isinstance(ew_edge, dict):
                        for k in self.ewma_edge.keys():
                            if k in ew_edge:
                                self.ewma_edge[k] = float(ew_edge.get(k, self.ewma_edge[k]) or self.ewma_edge[k])
        except Exception:
            pass

    def _save_state(self, force: bool = False):
        if not self.persist:
            return
        self._save_counter += 1
        if (not force) and (self._save_counter % self.save_every != 0):
            return
        try:
            payload = {
                "v": 1,
                "step": self.step,
                "last_pick_norm": self.last_pick_norm,
                "last_edge": self.last_edge,
                "last_hit": self.last_hit,
                "last_spin": self.last_spin,
                "miss_streak": self.miss_streak,
                "cooldown_left": self.cooldown_left,
                "ewma_hit": self.ewma_hit,
                "ewma_edge": self.ewma_edge,
            }
            _atomic_json_write(self.state_path, payload)
        except Exception:
            pass

    def _norm_pick(self, pick: Any) -> str:
        s = str(pick or "").strip().lower()
        if not s:
            return ""
        # normaliza variantes comunes
        s = s.replace("col.", "col ").replace("columna", "columna ")
        s = re.sub(r"\s+", " ", s).strip()
        # extrae columna 1/2/3
        m = re.search(r"columna\D*([123])", s)
        if m:
            return f"Columna {m.group(1)}"
        m = re.search(r"\bcol\s*([123])\b", s)
        if m:
            return f"Columna {m.group(1)}"
        # token '1'/'2'/'3'
        m = re.search(r"\b([123])\b", s)
        if m:
            return f"Columna {m.group(1)}"
        # fallback
        if "c1" in s:
            return "Columna 1"
        if "c2" in s:
            return "Columna 2"
        if "c3" in s:
            return "Columna 3"
        return str(pick).strip()

    def observe(self, pick: Any, hit: Optional[bool], edge: float, token: Optional[str] = None, spin: Optional[int] = None):
        """Registra resultado del último pick (si el token no está repetido)."""
        if token is not None and token == self._last_token:
            return
        self._last_token = token

        pick_norm = self._norm_pick(pick)
        if not pick_norm:
            return

        self.last_pick_norm = pick_norm
        self.last_hit = hit
        self.last_spin = spin
        self.last_edge = float(edge or 0.0)

        # EWMA hit/edge
        alpha = 0.20
        try:
            prev_h = float(self.ewma_hit.get(pick_norm, 0.5))
            if hit is True:
                new_h = (1 - alpha) * prev_h + alpha * 1.0
            elif hit is False:
                new_h = (1 - alpha) * prev_h + alpha * 0.0
            else:
                new_h = prev_h
            self.ewma_hit[pick_norm] = float(np.clip(new_h, 0.0, 1.0))
        except Exception:
            pass
        try:
            prev_e = float(self.ewma_edge.get(pick_norm, 0.0))
            new_e = (1 - alpha) * prev_e + alpha * float(edge or 0.0)
            self.ewma_edge[pick_norm] = float(new_e)
        except Exception:
            pass

        # rachas / cooldown
        if hit is False:
            self.miss_streak += 1
        elif hit is True:
            self.miss_streak = 0

        if self.cooldown_left > 0:
            self.cooldown_left = max(0, self.cooldown_left - 1)

        # cooldown si racha larga
        cd_after = int(_cfg("GUARDIAN_COL_COOLDOWN_AFTER", 3))
        cd_len = int(_cfg("GUARDIAN_COL_COOLDOWN_LEN", 2))
        if self.miss_streak >= cd_after:
            self.cooldown_left = max(self.cooldown_left, cd_len)
            self.miss_streak = 0

        self._save_state()

    def suggest(self, col_probs: dict, params: dict = None, meta_extra: dict = None) -> dict:
        """Devuelve sugerencia del guardián (columna) con status propio WAIT/PROBE/BET."""
        self.step += 1
        params = params or {}
        meta_extra = meta_extra or {}

        baseline_p = float(params.get("baseline_columna_p", 12.0 / 37.0))

        probs = {"Columna 1": 0.0, "Columna 2": 0.0, "Columna 3": 0.0}
        if isinstance(col_probs, dict):
            for k, v in col_probs.items():
                kk = self._norm_pick(k)
                if kk in probs:
                    try:
                        probs[kk] = float(v or 0.0)
                    except Exception:
                        pass

        s = float(sum(probs.values()))
        if s > 0:
            probs = {k: float(v / s) for k, v in probs.items()}
        else:
            probs = {"Columna 1": 1 / 3, "Columna 2": 1 / 3, "Columna 3": 1 / 3}

        # elige top
        ordered = sorted(probs.items(), key=lambda kv: float(kv[1]), reverse=True)
        chosen = ordered[0][0]
        top2 = [k for k, _ in ordered[:2]]

        chosen_p = float(probs.get(chosen, 0.0))
        edge = chosen_p - baseline_p

        exploit_edge = float(params.get("guardian_exploit_edge", params.get("exploit_edge_group3", 0.015)))
        probe_edge = float(params.get("guardian_probe_edge", params.get("probe_edge_group3", 0.008)))

        if self.cooldown_left > 0:
            status = "WAIT"
            reason = f"cooldown({self.cooldown_left})"
        else:
            if edge >= exploit_edge:
                status = "BET"
                reason = f"edge={edge:+.3f}>=ex"
            elif edge >= probe_edge:
                status = "PROBE"
                reason = f"edge={edge:+.3f}>=pr"
            else:
                status = "WAIT"
                reason = f"edge={edge:+.3f}<pr"

        self.last_pick_norm = chosen
        self.last_edge = float(edge)

        conf_edge = _conf_edge(edge, exploit_edge)
        confidence_pct = round(float(conf_edge) * 100.0, 1)

        return {
            "label": "GUARDIAN COLUMNA",
            "type": "guardian",
            "pick": chosen,
            "top_suggestion": chosen,
            "top_probability": chosen_p,
            "top_2_suggestions": top2,
            "baseline_p": baseline_p,
            "edge": edge,
            "status": status,
            "reason": reason,
            "suggested": status in ("BET", "PROBE"),
            "conf_score": conf_edge,
            "confidence_pct": confidence_pct,
            "guardian_meta": {
                "params": {"guardian_exploit_edge": exploit_edge, "guardian_probe_edge": probe_edge},
                "extra": meta_extra,
            },
            "last": {
                "pick": self.last_pick_norm,
                "edge": self.last_edge,
                "hit": self.last_hit,
                "ewma_hit": float(self.ewma_hit.get(chosen, 0.5)),
            },
        }



_GUARDIAN_CORE = GuardianDocenaCore(persist=True, save_every=1)
_GUARDIAN_COL_CORE = GuardianColumnaCore(persist=True, save_every=1)

def _doc_probs_from_p(p: np.ndarray) -> Dict[str, float]:
    p = np.array(p, dtype=float)
    if p.size != 37 or float(p.sum()) <= 0:
        p = uniform_probs()
    p = p / (p.sum() + EPS)
    out = {}
    for name, nums in DOZENS.items():
        out[name] = float(np.sum(p[np.array(nums, dtype=int)]))
    s = float(sum(out.values()))
    if s > 0:
        out = {k: float(v / s) for k, v in out.items()}
    return out


def _blend_doc_probs(doc_long: Dict[str, float], doc_short: Dict[str, float], mix_long: float) -> Dict[str, float]:
    ml = float(np.clip(mix_long, 0.0, 1.0))
    out = {}
    for k in ("1-12", "13-24", "25-36"):
        out[k] = ml * float(doc_long.get(k, 0.0)) + (1.0 - ml) * float(doc_short.get(k, 0.0))
    s = float(sum(out.values()))
    if s > 0:
        out = {k: float(v / s) for k, v in out.items()}
    else:
        out = {"1-12": 1 / 3, "13-24": 1 / 3, "25-36": 1 / 3}
    
    return out
def _col_probs_from_p(p: np.ndarray) -> Dict[str, float]:
    p = np.array(p, dtype=float)
    if p.size != 37 or float(p.sum()) <= 0:
        p = uniform_probs()
    p = p / (p.sum() + EPS)
    out = {}
    for name, nums in COLUMNS.items():
        # restringe a 3 columnas estándar si el dict fue custom
        if str(name).strip().lower() not in ("columna 1", "columna 2", "columna 3", "c1", "c2", "c3"):
            continue
        try:
            out[name if name.startswith("Columna") else f"Columna {str(name).strip()[-1]}"] = float(np.sum(p[np.array(nums, dtype=int)]))
        except Exception:
            pass
    # fallback si por algún motivo no se pobló
    if not out:
        out = {
            "Columna 1": float(np.sum(p[np.array(COLUMNS.get("Columna 1", []), dtype=int)])),
            "Columna 2": float(np.sum(p[np.array(COLUMNS.get("Columna 2", []), dtype=int)])),
            "Columna 3": float(np.sum(p[np.array(COLUMNS.get("Columna 3", []), dtype=int)])),
        }
    s = float(sum(out.values()))
    if s > 0:
        out = {k: float(v / s) for k, v in out.items()}
    else:
        out = {"Columna 1": 1 / 3, "Columna 2": 1 / 3, "Columna 3": 1 / 3}
    return out


def _blend_col_probs(col_long: Dict[str, float], col_short: Dict[str, float], mix_long: float) -> Dict[str, float]:
    ml = float(np.clip(mix_long, 0.0, 1.0))
    out = {}
    for k in ("Columna 1", "Columna 2", "Columna 3"):
        out[k] = ml * float(col_long.get(k, 0.0)) + (1.0 - ml) * float(col_short.get(k, 0.0))
    s = float(sum(out.values()))
    if s > 0:
        out = {k: float(v / s) for k, v in out.items()}
    else:
        out = {"Columna 1": 1 / 3, "Columna 2": 1 / 3, "Columna 3": 1 / 3}
    return out




# -----------------------------------------------------------------------------
# Optional Global Replay Buffer (cross-session learning)
# -----------------------------------------------------------------------------
class GlobalReplayBuffer:
    """
    Append-only spin store, independent of the app DB. Safe and simple.
    It lets the engine learn across sessions if app calls `append_spin` / `register_spin`.
    """

    def __init__(self, path: str, maxlen: int = 200_000):
        self.path = path
        self.maxlen = int(maxlen)
        self._cache: deque[int] = deque(maxlen=self.maxlen)
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        self._loaded = True
        if not self.path or not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        s = int(rec.get("spin"))
                        if 0 <= s <= 36:
                            self._cache.append(s)
                    except Exception:
                        continue
        except Exception:
            logger.debug("GlobalReplayBuffer.load failed", exc_info=True)

    def append(self, spin: int, meta: Optional[dict] = None):
        try:
            s = int(spin)
            if not (0 <= s <= 36):
                return
        except Exception:
            return
        self._cache.append(s)
        try:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            rec = {"ts": datetime.now(timezone.utc).isoformat(), "spin": s, "meta": meta or {}}
            fd = os.open(self.path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o644)
            try:
                # Atomic append (single OS-level write) to prevent interleaving/truncation
                data = (json.dumps(rec) + "\n").encode("utf-8")
                n = os.write(fd, data)
                if n != len(data):
                    # Best-effort: complete remaining bytes (should be rare for regular files)
                    mv = memoryview(data)
                    off = n
                    while off < len(data):
                        off += os.write(fd, mv[off:])
                os.fsync(fd)
            finally:
                os.close(fd)
        except Exception:
            logger.debug("GlobalReplayBuffer.append failed", exc_info=True)

    def spins(self) -> List[int]:
        self.load()
        return list(self._cache)


# -----------------------------------------------------------------------------
# Adaptive weights core (ONE source of truth for weights)
# -----------------------------------------------------------------------------
class AdaptiveWeightCore:
    """
    Exponentiated-gradient weights based on log-loss of each model's probability on the actual number.
    Persisted to JSON.

    This is intentionally simple and stable: one place computes & owns weights.
    """

    def __init__(
        self,
        model_names: List[str],
        eta: float = 0.5,
        min_weight: float = 1e-6,
        state_path: str = "ensemble_state.json",
        persist: bool = True,
        drift_threshold: float = 0.45,
        drift_reset_frac: float = 0.5,
        save_interval: int = 200,
    ):
        self.model_names = list(model_names)
        self.eta = float(eta)
        self.min_weight = float(min_weight)
        self.state_path = str(state_path)
        self.persist = bool(persist)

        self.drift_threshold = float(drift_threshold)
        self.drift_reset_frac = float(drift_reset_frac)
        self.save_interval = int(save_interval)

        self._weights = np.ones(len(self.model_names), dtype=float) / max(1, len(self.model_names))
        self._loss_hist = {m: deque(maxlen=500) for m in self.model_names}
        self._total = 0
        self._last_save_total = 0
        self._last_update_ts: Optional[float] = None

        if self.persist:
            self._load()

    def _prob_loss(self, p: float) -> float:
        p = float(p)
        p = max(p, 1e-12)
        return -math.log(p)

    def get_weights(self) -> Dict[str, float]:
        w = np.array(self._weights, dtype=float)
        s = float(w.sum())
        if s <= 0:
            w = np.ones_like(w) / len(w)
        else:
            w = w / s
        return {m: float(wi) for m, wi in zip(self.model_names, w)}

    def set_weights(self, weights: Dict[str, float]):
        arr = np.zeros(len(self.model_names), dtype=float)
        for i, m in enumerate(self.model_names):
            arr[i] = float(weights.get(m, 0.0))
        s = float(arr.sum())
        if s <= 0:
            arr = np.ones_like(arr) / len(arr)
        else:
            arr = arr / s
        self._weights = arr
        if self.persist:
            self._save(force=True)

    def maybe_drift_reset(self, drift_level: float):
        try:
            d = float(drift_level)
        except Exception:
            return
        if d >= self.drift_threshold:
            frac = float(np.clip(self.drift_reset_frac, 0.0, 1.0))
            uni = np.ones_like(self._weights) / len(self._weights)
            self._weights = (1 - frac) * self._weights + frac * uni
            self._weights = self._weights / (self._weights.sum() + EPS)

    def register_prediction(
        self,
        model_probs: Dict[str, List[float]],
        actual: int,
        drift_level: float = 0.0,
        context: Optional[dict] = None,
    ):
        if actual is None:
            return
        try:
            a = int(actual)
        except Exception:
            return
        if not (0 <= a <= 36):
            return

        losses: Dict[str, float] = {}
        for m in self.model_names:
            probs = model_probs.get(m)
            if probs is None:
                p = 1.0 / 37.0
            else:
                try:
                    p = float(probs[a])
                except Exception:
                    p = 1.0 / 37.0
            losses[m] = self._prob_loss(p)

        w = np.array(self._weights, dtype=float)
        for i, m in enumerate(self.model_names):
            w[i] = w[i] * math.exp(-self.eta * float(losses.get(m, 0.0)))
        w = np.maximum(w, self.min_weight)
        w = w / (w.sum() + EPS)
        self._weights = w

        self.maybe_drift_reset(drift_level)

        for m, loss in losses.items():
            self._loss_hist[m].append(float(loss))

        self._total += 1
        self._last_update_ts = time.time()

        if self.persist and (self._total - self._last_save_total) >= self.save_interval:
            self._save(force=False)


    def recent_avg_logloss(self, window: int = 60) -> Dict[str, float]:
        """Average log-loss per model over the most recent `window` updates.

        This is used by lightweight online controllers (e.g., LSTM trust gating) without changing core learning.
        """
        try:
            w = int(window) if window is not None else 0
        except Exception:
            w = 0
        out: Dict[str, float] = {}
        for m in self.model_names:
            h = list(self._loss_hist.get(m, []))
            if not h:
                out[m] = float("nan")
                continue
            tail = h[-w:] if (w and w > 0) else h
            out[m] = float(np.mean(tail)) if tail else float("nan")
        return out


    def summary(self) -> dict:
        avg_loss = {}
        for m in self.model_names:
            h = list(self._loss_hist.get(m, []))
            avg_loss[m] = float(np.mean(h)) if h else float("nan")
        return {
            "weights": self.get_weights(),
            "avg_logloss": avg_loss,
            "total_records": int(self._total),
            "last_update_ts": self._last_update_ts,
        }

    def _save(self, force: bool = False):
        try:
            os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
            payload = {
                "weights": self._weights.tolist(),
                "loss_hist": {m: list(self._loss_hist[m]) for m in self.model_names},
                "total": self._total,
                "last_update_ts": self._last_update_ts,
            }
            tmp = self.state_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, self.state_path)
            self._last_save_total = self._total
        except Exception:
            logger.debug("AdaptiveWeightCore._save failed", exc_info=True)

    def _load(self):
        try:
            if not os.path.exists(self.state_path):
                return
            with open(self.state_path, "r", encoding="utf-8") as fh:
                payload = json.load(fh) or {}
            w = payload.get("weights")
            if isinstance(w, list) and len(w) == len(self.model_names):
                arr = np.array(w, dtype=float)
                s = float(arr.sum())
                self._weights = (arr / s) if s > 0 else (np.ones_like(arr) / len(arr))
            lh = payload.get("loss_hist", {}) or {}
            for m in self.model_names:
                seq = lh.get(m, [])
                if isinstance(seq, list):
                    self._loss_hist[m].clear()
                    for x in seq[-500:]:
                        try:
                            self._loss_hist[m].append(float(x))
                        except Exception:
                            continue
            self._total = int(payload.get("total", 0))
            self._last_update_ts = payload.get("last_update_ts", None)
            self._last_save_total = self._total
        except Exception:
            logger.debug("AdaptiveWeightCore._load failed (ignored)", exc_info=True)



# -----------------------------------------------------------------------------
# MetaLearner (Shadow + Blend activation support)
# -----------------------------------------------------------------------------
_LAST_META_TELEMETRY: Dict[str, Any] = {}

def _entropy_norm(p: np.ndarray) -> float:
    try:
        p = np.array(p, dtype=float)
        if p.size != 37 or float(p.sum()) <= 0:
            return 1.0
        H = float(_shannon_entropy(p / (p.sum() + EPS)))
        Hmax = math.log2(37.0)
        return float(np.clip(H / (Hmax + 1e-12), 0.0, 1.0))
    except Exception:
        return 1.0

def _js_divergence(p: np.ndarray, q: np.ndarray) -> float:
    """Jensen-Shannon divergence (base-e), bounded in [0, ln(2)] for distributions."""
    try:
        p = np.array(p, dtype=float); q = np.array(q, dtype=float)
        if p.size != 37 or q.size != 37:
            return 0.0
        p = np.clip(p, 1e-12, 1.0); q = np.clip(q, 1e-12, 1.0)
        p = p / (p.sum() + EPS); q = q / (q.sum() + EPS)
        m = 0.5 * (p + q)
        kl_pm = float(np.sum(p * (np.log(p) - np.log(m))))
        kl_qm = float(np.sum(q * (np.log(q) - np.log(m))))
        js = 0.5 * (kl_pm + kl_qm)
        return float(max(0.0, js))
    except Exception:
        return 0.0

def _estimate_drift_js(spins: List[int], recent: int = 60, longw: int = 240) -> float:
    """Simple drift proxy: JS divergence between recent and long-run empirical distributions."""
    try:
        s = _clean_spins(spins)
        if len(s) < max(20, recent + 5):
            return 0.0
        r = s[-int(recent):]
        l = s[-int(longw):] if len(s) >= longw else s
        cr = np.bincount(np.array(r, dtype=int), minlength=37).astype(float)
        cl = np.bincount(np.array(l, dtype=int), minlength=37).astype(float)
        pr = cr / (cr.sum() + EPS)
        pl = cl / (cl.sum() + EPS)
        js = _js_divergence(pr, pl)
        # Normalize by ln(2) to map roughly to [0,1]
        return float(np.clip(js / math.log(2.0), 0.0, 1.0))
    except Exception:
        return 0.0


class MetaShadowLearner:
    """
    Lightweight online meta-learner that suggests ensemble weights (w_meta) given model probability outputs.
    - Shadow mode: learns & persists, can be blended gradually (Entrega 5).
    - Updates use a softmax classifier over models, targeting the model with the best log-loss on the realized outcome.
    """

    def __init__(
        self,
        model_names: List[str],
        state_path: str,
        params: Optional[dict] = None,
        persist: bool = True,
    ):
        self.model_names = list(model_names)
        self.params = params or {}
        self.state_path = str(state_path)
        self.persist = bool(persist)

        self.lr = float(self.params.get("meta_lr", 0.05))
        self.l2 = float(self.params.get("meta_l2", 1e-4))
        self.temp = float(self.params.get("meta_temp", 1.0))
        self.save_interval = int(self.params.get("meta_save_interval", 100))

        self.freeze_entropy_norm = float(self.params.get("meta_freeze_entropy_norm", 0.999995))
        self.freeze_drift_level = float(self.params.get("meta_freeze_drift_level", 0.45))

        # Feature dimension (keep stable for persistence)
        self.dim = 6
        self.theta = {m: np.zeros(self.dim, dtype=float) for m in self.model_names}
        self.total = 0
        self.last_save_total = 0
        self.is_frozen = False
        self.freeze_reason = None
        self.freeze_chaos = None
        self.freeze_drift = None
        self._stable_thaw_count = 0


        if self.persist:
            self._load()

    def _load(self):
        try:
            if not os.path.exists(self.state_path):
                return
            with open(self.state_path, "r", encoding="utf-8") as f:
                payload = json.load(f)

            th = payload.get("theta", {})
            for m in self.model_names:
                vec = th.get(m, None)
                if isinstance(vec, list) and len(vec) == self.dim:
                    self.theta[m] = np.array(vec, dtype=float)

            self.total = int(payload.get("total", 0))
            self.last_save_total = int(payload.get("last_save_total", self.total))

            self.is_frozen = bool(payload.get("is_frozen", False))
            self.freeze_reason = payload.get("freeze_reason", None)
            self.freeze_chaos = payload.get("freeze_chaos", None)
            self.freeze_drift = payload.get("freeze_drift", None)
            self._stable_thaw_count = int(payload.get("stable_thaw_count", 0) or 0)

        except Exception:
            logger.debug("MetaShadowLearner._load failed (ignored)", exc_info=True)


    def _save(self, force: bool = False):
        try:
            if not self.persist:
                return
            if (not force) and ((self.total - self.last_save_total) < self.save_interval):
                return
            os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
            payload = {
                "theta": {m: self.theta[m].tolist() for m in self.model_names},
                "total": int(self.total),
                "last_save_total": int(self.total),
                "is_frozen": bool(self.is_frozen),
                "freeze_reason": self.freeze_reason,
                "freeze_chaos": self.freeze_chaos,
                "freeze_drift": self.freeze_drift,
                "stable_thaw_count": int(getattr(self, "_stable_thaw_count", 0)),
                "ts": time.time(),
            }
            _atomic_json_write(self.state_path, payload)
            self.last_save_total = int(self.total)
        except Exception:
            logger.debug("MetaShadowLearner._save failed (ignored)", exc_info=True)

    def _features(self, p_m: np.ndarray, p_ref: np.ndarray) -> np.ndarray:
        p_m = np.array(p_m, dtype=float)
        if p_m.size != 37 or float(p_m.sum()) <= 0:
            p_m = uniform_probs()
        else:
            p_m = p_m / (p_m.sum() + EPS)

        p_ref = np.array(p_ref, dtype=float)
        if p_ref.size != 37 or float(p_ref.sum()) <= 0:
            p_ref = uniform_probs()
        else:
            p_ref = p_ref / (p_ref.sum() + EPS)

        ent = _entropy_norm(p_m)
        mx = float(np.max(p_m))
        top3 = float(np.sum(np.sort(p_m)[-3:]))
        agree = 1.0 - float(np.clip(_js_divergence(p_m, p_ref) / math.log(2.0), 0.0, 1.0))
        # [bias, maxprob, top3mass, certainty(1-ent), agreement, bias2]
        return np.array([1.0, mx, top3, (1.0 - ent), agree, 1.0], dtype=float)

    def _softmax(self, scores: np.ndarray) -> np.ndarray:
        t = max(float(self.temp), 1e-6)
        z = scores / t
        z = z - float(np.max(z))
        e = np.exp(z)
        s = float(np.sum(e))
        return (e / s) if s > 0 else (np.ones_like(e) / len(e))

    def suggest(self, model_probs: Dict[str, np.ndarray], p_ref: np.ndarray) -> Tuple[np.ndarray, dict]:
        feats = []
        scores = []
        for m in self.model_names:
            pm = model_probs.get(m, None)
            if pm is None:
                pm = uniform_probs()
            f = self._features(pm, p_ref)
            feats.append(f)
            scores.append(float(np.dot(self.theta[m], f)))
        scores = np.array(scores, dtype=float)
        w = self._softmax(scores)
        info = {
            "enabled": True,
            "is_frozen": bool(self.is_frozen),
            "freeze_reason": self.freeze_reason,
            "scores": scores.tolist(),
        }
        return w, info

    def observe(self, model_probs: Dict[str, np.ndarray], p_ref: np.ndarray, actual: int, drift_level: float, chaos_level: float):
        # Defensive: only learn on valid outcomes
        try:
            a = int(actual)
        except Exception:
            return
        if not (0 <= a <= 36):
            return

        # Dynamic thresholds (read current params each call so runtime overrides work)
        freeze_ent = float(self.params.get("meta_freeze_entropy_norm", getattr(self, "freeze_entropy_norm", 0.999995)))
        freeze_drift = float(self.params.get("meta_freeze_drift_level", getattr(self, "freeze_drift_level", 0.45)))

        thaw_ent = float(self.params.get("meta_thaw_entropy_norm", 0.999995))
        thaw_drift = float(self.params.get("meta_thaw_drift_level", 0.35))
        thaw_window = int(self.params.get("meta_thaw_window", 10))

        # Force unfreeze / ignore persisted freeze (recovery & tests)
        if bool(self.params.get("meta_force_unfreeze", False)) or bool(self.params.get("meta_ignore_persist_freeze", False)):
            if getattr(self, "is_frozen", False):
                self.is_frozen = False
                self.freeze_reason = None
                self.freeze_chaos = None
                self.freeze_drift = None
                self._stable_thaw_count = 0
                self._save(force=True)

        # If frozen, allow auto-thaw when system stabilizes
        if getattr(self, "is_frozen", False):
            if (float(chaos_level) <= thaw_ent) and (float(drift_level) <= thaw_drift):
                self._stable_thaw_count = int(getattr(self, "_stable_thaw_count", 0)) + 1
                if self._stable_thaw_count >= thaw_window:
                    self.is_frozen = False
                    self.freeze_reason = None
                    self.freeze_chaos = None
                    self.freeze_drift = None
                    self._stable_thaw_count = 0
                    self._save(force=True)
                else:
                    return
            else:
                self._stable_thaw_count = 0
                return

        # Freeze logic (kill-switch for learning) — can be disabled by setting thresholds > 1.0 in params
        if (float(chaos_level) >= freeze_ent) or (float(drift_level) >= freeze_drift):
            self.is_frozen = True
            self.freeze_reason = f"freeze: chaos={float(chaos_level):.3f} drift={float(drift_level):.3f}"
            self.freeze_chaos = float(chaos_level)
            self.freeze_drift = float(drift_level)
            self._stable_thaw_count = 0
            self._save(force=True)
            return

        # Target: model with best log-loss on actual (max probability assigned to realized outcome)
        best_m = None
        best_p = -1.0
        for m in self.model_names:
            pm = model_probs.get(m, None)
            if pm is None or not isinstance(pm, np.ndarray) or pm.size != 37:
                continue
            p = float(pm[a])
            if p > best_p:
                best_p = p
                best_m = m
        if best_m is None:
            return

        # Build features/scores and update theta via softmax cross-entropy
        feats = {m: self._features(model_probs.get(m, uniform_probs()), p_ref) for m in self.model_names}
        scores = np.array([float(np.dot(self.theta[m], feats[m])) for m in self.model_names], dtype=float)
        w = self._softmax(scores)

        for i, m in enumerate(self.model_names):
            y = 1.0 if m == best_m else 0.0
            grad = (y - float(w[i])) * feats[m] - self.l2 * self.theta[m]
            self.theta[m] = self.theta[m] + self.lr * grad

        self.total += 1
        self._save(force=False)




class EnsembleManager:
    def __init__(self, models: Dict[str, Any], params: Optional[Dict[str, Any]] = None, weight_core: Optional[AdaptiveWeightCore] = None):
        self.models = models or {}
        self.params = params or {}
        self.model_names = ["freq", "markov", "nb", "lstm"]

        if weight_core is None:
            model_dir = _cfg("MODEL_DIR", ".")
            state_path = os.path.join(model_dir, _cfg("ADAPTIVE_STATE_FILE", "weights_state.json"))
            weight_core = AdaptiveWeightCore(
                model_names=self.model_names,
                eta=float(self.params.get("adaptive_eta", 0.5)),
                state_path=state_path,
                persist=bool(self.params.get("adaptive_persist", True)),
                drift_threshold=float(self.params.get("adaptive_drift_threshold", 0.45)),
                drift_reset_frac=float(self.params.get("adaptive_drift_reset_frac", 0.5)),
                save_interval=int(self.params.get("adaptive_save_interval", 200)),
            )
        self.weight_core = weight_core

        # --- Meta-learner (shadow) for weight suggestions (Entrega 4/5) ---
        try:
            if bool(self.params.get("meta_shadow_enabled", False)):
                _md = self.params.get("_user_model_dir", _cfg("MODEL_DIR", "."))
                _mp = os.path.join(_md, _cfg("META_SHADOW_STATE_FILE", "meta_shadow_state.json"))
                self.meta_shadow = MetaShadowLearner(
                    model_names=self.model_names,
                    state_path=_mp,
                    params=self.params,
                    persist=bool(self.params.get("meta_shadow_persist", True)),
                )
            else:
                self.meta_shadow = None
        except Exception:
            logger.debug("MetaShadowLearner init failed (ignored)", exc_info=True)
            self.meta_shadow = None

        self.memory = deque(maxlen=int(self.params.get("memory_size", 2000)))
        self._spins_since_retrain = 0
        self.retrain_every = int(self.params.get("retrain_every", 800))

        # LSTM controller (auto; no user intervention):
        # - Evaluation window W (default 60 spins)
        # - Retrain interval N (default 150 spins)
        self.lstm_eval_window = int(self.params.get("lstm_eval_window", 60))
        self.lstm_retrain_interval = int(self.params.get("lstm_retrain_interval", 150))
        self._lstm_since_retrain = 0
        self._lstm_last_train_spins = 0
        self._lstm_train_lock = threading.Lock()
        self._lstm_train_inflight = False
        self._lstm_train_thread = None

        # LSTM trust multiplier (computed from recent log-loss; applied to weights only at inference-time)
        self._lstm_trust_enabled = bool(self.params.get("lstm_trust_enabled", True))
        self._lstm_trust_mult = float(self.params.get("lstm_trust_init_mult", 1.0))
        self._lstm_trust_alpha = float(self.params.get("lstm_trust_alpha", 0.15))
        self._lstm_trust_min = float(self.params.get("lstm_trust_min_mult", 0.2))
        self._lstm_trust_max = float(self.params.get("lstm_trust_max_mult", 1.4))
        self._lstm_trust_temp = float(self.params.get("lstm_trust_temp", 0.06))
        self._last_lstm_ctl: Optional[Dict[str, Any]] = None

        self._last_model_probs: Optional[Dict[str, np.ndarray]] = None
        self._last_context: Optional[Dict[str, Any]] = None

    def update_memory(self, spin: int):
        try:
            self.memory.append(int(spin))
        except Exception:
            pass
        self._spins_since_retrain += 1

        # LSTM async retrain scheduler (separate from full retrain to avoid UI freezes)
        try:
            self._lstm_since_retrain += 1
            if self._lstm_since_retrain >= max(1, int(self.lstm_retrain_interval)):
                self._lstm_since_retrain = 0
                if bool(self.params.get("lstm_async_train", True)):
                    spins_snapshot = list(self.memory)
                    self._maybe_schedule_lstm_retrain(spins_snapshot, force=True)
        except Exception:
            pass
    def _lstm_train_job(self, spins_snapshot: List[int], seq_len: int, epochs: int) -> None:
        try:
            existing = self.models.get("lstm")
            res = train_lstm_model_live_v2(
                spins_snapshot,
                int(seq_len),
                existing_model=existing,
                epochs=int(epochs),
                verbose=0,
            )
            if res.get("success"):
                with self._lstm_train_lock:
                    self.models["lstm"] = res.get("model")
                    self.models["scaler"] = res.get("scaler")
                    self._lstm_last_train_spins = int(len(spins_snapshot))
        except Exception:
            logger.debug("async LSTM train job failed", exc_info=True)
        finally:
            try:
                with self._lstm_train_lock:
                    self._lstm_train_inflight = False
            except Exception:
                self._lstm_train_inflight = False

    def _maybe_schedule_lstm_retrain(self, spins_snapshot: List[int], force: bool = False) -> bool:
        """Schedule an LSTM retrain in a background thread (non-blocking)."""
        if not bool(self.params.get("lstm_async_train", True)):
            return False
        try:
            seq_len = int(self.params.get("lstm_sequence_len", 15))
        except Exception:
            seq_len = 15
        if not spins_snapshot or len(spins_snapshot) < (seq_len + 6):
            return False

        interval = max(10, int(self.lstm_retrain_interval or 150))
        if (not force) and ((len(spins_snapshot) - int(self._lstm_last_train_spins)) < interval):
            return False

        with self._lstm_train_lock:
            if self._lstm_train_inflight:
                return False
            self._lstm_train_inflight = True

        try:
            epochs = int(self.params.get("lstm_retrain_epochs", 10))
        except Exception:
            epochs = 10

        t = threading.Thread(
            target=self._lstm_train_job,
            args=(list(spins_snapshot), int(seq_len), int(epochs)),
            daemon=True,
            name="danna_lstm_retrain",
        )
        self._lstm_train_thread = t
        t.start()
        return True

    def _compute_lstm_trust_info(self) -> Dict[str, Any]:
        """Compute and update an LSTM trust multiplier from recent per-model log-loss.

        This keeps LSTM 'in shadow' automatically when it underperforms, and increases influence when it helps.
        The user does not need to toggle anything.
        """
        info: Dict[str, Any] = {
            "enabled": bool(self._lstm_trust_enabled),
            "window": int(self.lstm_eval_window),
            "mult": float(self._lstm_trust_mult),
            "improvement_vs_best_other": None,
        }
        if not bool(self._lstm_trust_enabled):
            return info
        try:
            win = max(10, int(self.lstm_eval_window or 60))
            losses = self.weight_core.recent_avg_logloss(window=win)
            lstm_loss = float(losses.get("lstm", float("nan")))
            others = []
            for m in ("freq", "markov", "nb"):
                v = float(losses.get(m, float("nan")))
                if not (math.isnan(v) or math.isinf(v)):
                    others.append(v)
            if math.isnan(lstm_loss) or math.isinf(lstm_loss) or (not others):
                return info

            best_other = float(min(others))
            improvement = float(best_other - lstm_loss)  # >0 => LSTM better
            info["improvement_vs_best_other"] = improvement
            info["lstm_loss"] = lstm_loss
            info["best_other_loss"] = best_other

            temp = float(self._lstm_trust_temp) if float(self._lstm_trust_temp) > 0 else 0.06
            x = max(-20.0, min(20.0, improvement / max(temp, 1e-6)))
            sig = 1.0 / (1.0 + math.exp(-x))
            target = float(self._lstm_trust_min) + (float(self._lstm_trust_max) - float(self._lstm_trust_min)) * sig

            alpha = float(self._lstm_trust_alpha)
            alpha = max(0.01, min(0.50, alpha))
            self._lstm_trust_mult = (1.0 - alpha) * float(self._lstm_trust_mult) + alpha * float(target)
            self._lstm_trust_mult = float(max(self._lstm_trust_min, min(self._lstm_trust_mult, self._lstm_trust_max)))

            info["mult"] = float(self._lstm_trust_mult)
            info["target_mult"] = float(target)
        except Exception:
            logger.debug("LSTM trust controller failed (ignored)", exc_info=True)
        return info

    @staticmethod
    def _apply_lstm_trust(w_actual: np.ndarray, mult: float) -> np.ndarray:
        try:
            w = np.array(w_actual, dtype=float)
            if w.size >= 4 and float(w.sum()) > 0:
                w[3] = float(w[3]) * float(mult)
                w = np.maximum(w, 0.0)
                s = float(w.sum())
                return (w / s) if s > 0 else w_actual
            return w_actual
        except Exception:
            return w_actual

    def _compute_all_model_probs(self, spins: List[int]) -> Dict[str, np.ndarray]:
        _inc_markov = getattr(self, 'inc_markov', None)
        _inc_freq   = getattr(self, 'inc_freq', None)
        if _inc_markov is not None and _inc_markov.last_spin is None and spins:
            for _sp in spins:
                _inc_markov.update(int(_sp))
                _inc_freq.update(int(_sp))

        if _inc_freq is not None:
            p_freq = _inc_freq.predict()
        else:
            p_freq = compute_p_freq_decay(spins, alpha=float(self.params.get('alpha_dir',1.0)), lam=float(self.params.get('decay_lambda',0.03)))

        if _inc_markov is not None:
            p_mark = _inc_markov.predict()
        else:
            p_mark = compute_p_markov(spins)
        p_nb = compute_p_nb(spins, int(self.params.get("window_short", 12)), self.models.get("nb"))
        with self._lstm_train_lock:
            _lstm = self.models.get("lstm")
            _scaler = self.models.get("scaler")
        p_lstm = compute_p_lstm_v2(spins, _lstm, _scaler, int(self.params.get("lstm_sequence_len", 15)))
        return {"freq": p_freq, "markov": p_mark, "nb": p_nb, "lstm": p_lstm}

    def weights_array(self) -> np.ndarray:
        w = self.weight_core.get_weights()
        arr = np.array([w.get(m, 0.0) for m in self.model_names], dtype=float)
        s = float(arr.sum())
        return (arr / s) if s > 0 else (np.ones(len(self.model_names)) / len(self.model_names))

    def combine(self, spins: List[int], weights: Optional[np.ndarray] = None) -> np.ndarray:
        model_probs = self._compute_all_model_probs(spins)

        # --- Pesos base actuales (w_actual) ---
        if weights is None:
            w_actual = self.weights_array()
        else:
            w_actual = np.array(weights, dtype=float)
            if w_actual.size != 4 or float(w_actual.sum()) <= 0:
                w_actual = self.weights_array()
            else:
                w_actual = w_actual / (w_actual.sum() + EPS)

        
        # --- LSTM trust controller (auto; no manual toggles) ---
        try:
            lstm_ctl = self._compute_lstm_trust_info()
            self._last_lstm_ctl = lstm_ctl
            if bool(lstm_ctl.get("enabled")):
                w_actual = self._apply_lstm_trust(w_actual, mult=float(lstm_ctl.get("mult", 1.0)))
        except Exception:
            self._last_lstm_ctl = None
# --- Referencia preliminar (para features/meta) usando w_actual ---
        try:
            p_ref = (w_actual[0] * model_probs.get("freq", uniform_probs())
                     + w_actual[1] * model_probs.get("markov", uniform_probs())
                     + w_actual[2] * model_probs.get("nb", uniform_probs())
                     + w_actual[3] * model_probs.get("lstm", uniform_probs()))
            sref = float(p_ref.sum())
            p_ref = (p_ref / sref) if sref > 0 else uniform_probs()
        except Exception:
            p_ref = uniform_probs()

        # --- Meta-learner: pesos sugeridos (w_meta) ---
        meta_info = {"enabled": False, "is_frozen": False, "freeze_reason": None}
        try:
            if bool(self.params.get("meta_shadow_enabled", True)) and (self.meta_shadow is not None):
                w_meta, meta_info = self.meta_shadow.suggest(model_probs=model_probs, p_ref=p_ref)
            else:
                w_meta = np.array(w_actual, dtype=float)
        except Exception:
            logger.debug("meta_shadow.suggest failed", exc_info=True)
            w_meta = np.array(w_actual, dtype=float)

        # --- Lambda schedule (warmup/ramp) ---
        try:
            step = int(self.weight_core.summary().get("total_records", len(spins or [])))
        except Exception:
            step = int(len(spins or []))

        warmup = int(self.params.get("meta_lambda_warmup", 60))
        lam1 = float(self.params.get("meta_lambda_seg1", 0.05))
        seg1 = int(self.params.get("meta_lambda_seg1_spins", 50))
        lam2 = float(self.params.get("meta_lambda_seg2", 0.10))
        seg2 = int(self.params.get("meta_lambda_seg2_spins", 50))
        lam3 = float(self.params.get("meta_lambda_seg3", 0.20))
        seg3 = int(self.params.get("meta_lambda_seg3_spins", 100))
        lam_max = float(self.params.get("meta_lambda_max", 0.40))

        if step <= warmup:
            lam = 0.0
        else:
            t = int(step - warmup)
            if t <= seg1:
                lam = lam1
            elif t <= (seg1 + seg2):
                lam = lam2
            elif t <= (seg1 + seg2 + seg3):
                lam = lam3
            else:
                lam = lam_max
        lam = float(np.clip(lam, 0.0, lam_max))

        if not bool(self.params.get("meta_blend_enabled", True)):
            lam = 0.0

        # --- Drift proxy (JS divergence recent vs long) ---
        drift_level = float(_estimate_drift_js(
            spins,
            recent=int(self.params.get("meta_drift_recent", 60)),
            longw=int(self.params.get("meta_drift_long", 240)),
        ))

        # --- Auto-thaw: allow meta to recover based on stability even if observe() isn't called ---
        try:
            if bool(meta_info.get("is_frozen", False)) and (self.meta_shadow is not None):
                thaw_ent = float(self.params.get("meta_thaw_entropy_norm", 0.999995))
                thaw_drift = float(self.params.get("meta_thaw_drift_level", 0.35))
                thaw_window = int(self.params.get("meta_thaw_window", 10))
                chaos_ref = float(_entropy_norm(p_ref))
                if (chaos_ref <= thaw_ent) and (drift_level <= thaw_drift):
                    self.meta_shadow._stable_thaw_count = int(getattr(self.meta_shadow, "_stable_thaw_count", 0)) + 1
                    if int(getattr(self.meta_shadow, "_stable_thaw_count", 0)) >= thaw_window:
                        self.meta_shadow.is_frozen = False
                        self.meta_shadow.freeze_reason = None
                        self.meta_shadow.freeze_chaos = None
                        self.meta_shadow.freeze_drift = None
                        self.meta_shadow._stable_thaw_count = 0
                        if hasattr(self.meta_shadow, "_save"):
                            self.meta_shadow._save(force=True)
                        # refresh suggestion after thaw
                        w_meta, meta_info = self.meta_shadow.suggest(model_probs=model_probs, p_ref=p_ref)
                else:
                    self.meta_shadow._stable_thaw_count = 0
        except Exception:
            pass

        # --- Blend + clamps ---
        w_min = float(self.params.get("meta_w_min", 0.05))
        w_max = float(self.params.get("meta_w_max", 0.70))
        w_final = (1.0 - lam) * np.array(w_actual, dtype=float) + lam * np.array(w_meta, dtype=float)
        w_final = np.clip(w_final, w_min, w_max)
        w_final = w_final / (float(w_final.sum()) + EPS)

        # --- Compute fused probs with blended weights ---
        p_comb = (w_final[0] * model_probs.get("freq", uniform_probs())
                  + w_final[1] * model_probs.get("markov", uniform_probs())
                  + w_final[2] * model_probs.get("nb", uniform_probs())
                  + w_final[3] * model_probs.get("lstm", uniform_probs()))

        ss = float(p_comb.sum())
        p_norm = (p_comb / ss) if ss > 0 else uniform_probs()

        # --- Kill-switch: caos/drift o meta congelado -> lambda=0 y recompute ---
        chaos_level = float(_entropy_norm(p_norm))
        freeze_reason = None
        if bool(meta_info.get("is_frozen", False)):
            freeze_reason = str(meta_info.get("freeze_reason", "meta frozen"))
        else:
            drift_cut = float(self.params.get("meta_kill_drift_level", 0.45))
            chaos_cut = float(self.params.get("meta_kill_entropy_norm", 0.999995))
            if (drift_level >= drift_cut) or (chaos_level >= chaos_cut):
                freeze_reason = f"kill-switch: chaos={chaos_level:.3f} drift={drift_level:.3f}"

        if freeze_reason is not None:
            lam = 0.0
            w_final = np.array(w_actual, dtype=float)
            w_final = np.clip(w_final, w_min, w_max)
            w_final = w_final / (float(w_final.sum()) + EPS)
            p_comb = (w_final[0] * model_probs.get("freq", uniform_probs())
                      + w_final[1] * model_probs.get("markov", uniform_probs())
                      + w_final[2] * model_probs.get("nb", uniform_probs())
                      + w_final[3] * model_probs.get("lstm", uniform_probs()))
            ss = float(p_comb.sum())
            p_norm = (p_comb / ss) if ss > 0 else uniform_probs()
            chaos_level = float(_entropy_norm(p_norm))

        # --- Telemetría (visible en decision vía analysis) ---
        try:
            global _LAST_META_TELEMETRY
            _LAST_META_TELEMETRY = {
                "enabled": bool(self.params.get("meta_blend_enabled", True)) and bool(self.params.get("meta_shadow_enabled", True)),
                "lambda": float(lam),
                "step": int(step),
                "w_actual": [float(x) for x in np.array(w_actual, dtype=float).tolist()],
                "w_meta": [float(x) for x in np.array(w_meta, dtype=float).tolist()],
                "w_final": [float(x) for x in np.array(w_final, dtype=float).tolist()],
                "drift_level": float(drift_level),
                "chaos_entropy_norm": float(chaos_level),
                "freeze_reason": freeze_reason,
            }
        except Exception:
            pass

# --- FASE 1: WheelExpert PREMIUM -- modelo real en ensemble ---
        try:
            wheel_enabled = bool(self.params.get("wheel_enabled", True))
            if wheel_enabled:
                _wheel_result = get_wheel_expert_info(spins, params=self.params)
                p_wheel       = _wheel_result["p_wheel"]
                model_probs["wheel"] = p_wheel
                # Peso adaptativo del WheelExpert (aprendido) o manual desde params
                _wheel_adaptive_w = float(_wheel_result.get("adaptive_w", 0.22))
                wheel_w = float(self.params.get("wheel_weight", _wheel_adaptive_w))
                wheel_w = float(np.clip(wheel_w, 0.05, 0.50))
                # Siempre activo: mezclar con p_norm
                if isinstance(p_wheel, np.ndarray) and p_wheel.shape == p_norm.shape:
                    p_norm = (1.0 - wheel_w) * p_norm + wheel_w * p_wheel
                    p_norm = p_norm / max(float(p_norm.sum()), 1e-12)
                # Guardar info extendida para uso en analisis (sector_comp, scatter, etc.)
                self._last_wheel_info = _wheel_result
        except Exception:
            logger.debug("wheel integration failed", exc_info=True)
            self._last_wheel_info = {}

        # --- FASE 2: Guardian shaping sobre P_mix -> P_final ---
        try:
            if bool(self.params.get("guardian_shaping_enabled", True)):
                g = guardian_shaping_vector(params=self.params)
                if isinstance(g, np.ndarray) and g.size == 37 and float(g.sum()) > 0:
                    p_norm = p_norm * g
                    s2 = float(p_norm.sum())
                    p_norm = (p_norm / s2) if s2 > 0 else uniform_probs()
        except Exception:
            logger.debug("guardian shaping failed", exc_info=True)
        try:
            ctx = {
                "H_nums": float(_shannon_entropy(p_norm)),
                "top5": list(np.argsort(p_norm)[-5:][::-1]),
                "ts": datetime.now(timezone.utc).isoformat(),
                "n_spins": int(len(spins or [])),
                "lstm_ctl": self._last_lstm_ctl,
            }
            safe_model_probs = {}
            for k, v in model_probs.items():
                arr = np.array(v, dtype=float)
                if arr.size != 37:
                    arr = uniform_probs()
                safe_model_probs[k] = arr
            self._last_model_probs = safe_model_probs
            self._last_context = ctx
        except Exception:
            self._last_model_probs = None
            self._last_context = None

        if bool(self.params.get("enable_noise", False)):
            try:
                entropy = -np.sum(p_norm * np.log(p_norm + 1e-12))
                target_entropy = float(np.log(len(p_norm)) * float(self.params.get("noise_entropy_frac", 0.7)))
                if entropy < target_entropy:
                    sigma = float(self.params.get("noise_sigma", 0.005))
                    noise = np.random.normal(0.0, sigma, size=len(p_norm))
                    p_norm = np.clip(p_norm + noise, 0, 1)
                    p_norm = p_norm / (p_norm.sum() + EPS)
            except Exception:
                pass

        return p_norm

    def scheduled_retrain_check(self) -> bool:
        return (self._spins_since_retrain >= self.retrain_every) and (len(self.memory) >= self.retrain_every)

    def retrain_models_from_memory(self):
        spins_list = list(self.memory)
        logger.info("EnsembleManager.retrain_models_from_memory: retraining with %d spins", len(spins_list))

        try:
            from sklearn.naive_bayes import MultinomialNB  # type: ignore
        except Exception:
            MultinomialNB = None

        if MultinomialNB is not None:
            try:
                nb_new = MultinomialNB(alpha=float(self.params.get("nb_alpha", 0.01)))
                X_nb, y_nb = [], []
                window_short = int(self.params.get("window_short", 12))
                for i in range(1, len(spins_list)):
                    start = max(0, i - window_short)
                    hist = spins_list[start:i]
                    if not hist:
                        continue
                    feats = _featurize_counts_single(hist, None)
                    X_nb.append(feats[0])
                    y_nb.append(int(spins_list[i]))
                if len(X_nb) > 20:
                    X_nb_arr = np.array(X_nb, dtype=int)
                    y_nb_arr = np.array(y_nb, dtype=int)
                    nb_new.partial_fit(X_nb_arr, y_nb_arr, classes=np.arange(37))
                    self.models["nb"] = nb_new
            except Exception:
                logger.debug("retrain NB failed", exc_info=True)

        try:
            if bool(self.params.get("lstm_async_train", True)):
                # Non-blocking: keep current model for inference while retraining runs in background.
                self._maybe_schedule_lstm_retrain(spins_list, force=True)
            else:
                res = train_lstm_model_live_v2(
                    spins_list,
                    int(self.params.get("lstm_sequence_len", 15)),
                    existing_model=self.models.get("lstm"),
                    epochs=int(self.params.get("lstm_retrain_epochs", 10)),
                    verbose=0,
                )
                if res.get("success"):
                    self.models["lstm"] = res.get("model")
                    self.models["scaler"] = res.get("scaler")
                    self._lstm_last_train_spins = int(len(spins_list))
        except Exception:
            logger.debug("retrain LSTM failed", exc_info=True)

    def register_last_prediction(self, actual: int, full_spins_for_drift: Optional[List[int]] = None) -> Dict[str, Any]:
        try:
            a = int(actual)
        except Exception:
            return {"success": False, "message": "actual invalid"}

        spins_before = list(self.memory)
        self.update_memory(a)

        # Online learning (NB): disabled here — app.py calls update_nb_model explicitly.
        # Keeping both active caused double partial_fit per spin.
        try:
            if isinstance(getattr(self, "models", None), dict) and self.models.get("nb") is not None:
                if bool(self.params.get("nb_online_in_engine", False)):
                    self.models["nb"] = update_nb_model(
                        self.models.get("nb"),
                        spins_before,
                        a,
                        int(self.params.get("window_short", 12)),
                    )
        except Exception:
            logger.debug("nb_online update failed", exc_info=True)

        try:
            if self.scheduled_retrain_check():
                self._spins_since_retrain = 0
                self.retrain_models_from_memory()
        except Exception:
            logger.debug("scheduled retrain failed", exc_info=True)

        drift_level = 0.0
        try:
            if full_spins_for_drift:
                drift_level = float(calculate_drift_level(full_spins_for_drift, window=200))
        except Exception:
            drift_level = 0.0

        if self._last_model_probs is not None:
            try:
                probs_lists = {k: v.tolist() for k, v in self._last_model_probs.items()}
                self.weight_core.register_prediction(probs_lists, a, drift_level=drift_level, context=self._last_context)
                # --- Meta-learner shadow observe (Entrega 4/5) ---
                try:
                    if (self.meta_shadow is not None) and bool(self.params.get("meta_shadow_enabled", True)):
                        w_act = self.weights_array()
                        p_ref = (w_act[0] * np.array(self._last_model_probs.get("freq", uniform_probs()), dtype=float)
                                 + w_act[1] * np.array(self._last_model_probs.get("markov", uniform_probs()), dtype=float)
                                 + w_act[2] * np.array(self._last_model_probs.get("nb", uniform_probs()), dtype=float)
                                 + w_act[3] * np.array(self._last_model_probs.get("lstm", uniform_probs()), dtype=float))
                        ss = float(p_ref.sum())
                        p_ref = (p_ref / ss) if ss > 0 else uniform_probs()
                        chaos_level = float(_entropy_norm(p_ref))
                        self.meta_shadow.observe(
                            model_probs=self._last_model_probs,
                            p_ref=p_ref,
                            actual=a,
                            drift_level=float(drift_level),
                            chaos_level=chaos_level,
                        )
                except Exception:
                    logger.debug("meta_shadow.observe failed", exc_info=True)

                summary = self.weight_core.summary()
            except Exception:
                logger.debug("weight_core.register_prediction failed", exc_info=True)
                summary = {}
        else:
            summary = self.weight_core.summary()

        self._last_model_probs = None
        self._last_context = None
        return {"success": True, "adaptive_summary": summary, "drift_level": drift_level}


# -----------------------------------------------------------------------------
# Functional API (compatibility with app.py)
# -----------------------------------------------------------------------------
def adjust_ensemble_weights(current_weights: np.ndarray, spins: List[int], models: dict, params: dict) -> Tuple[np.ndarray, dict]:
    """
    Kept for compatibility with older app.py variants.
    IMPORTANT: In the "professional" pipeline we prefer AdaptiveWeightCore updates via register_spin().
    """
    spins = _clean_spins(spins)
    em = EnsembleManager(models=models, params=params)
    em.inc_markov = IncrementalMarkov()
    em.inc_freq   = IncrementalFreqDecay()
    model_probs = em._compute_all_model_probs(spins)

    def _perf(p: np.ndarray, window: int) -> float:
        if not spins:
            return 0.0
        w = max(1, int(window))
        recent = spins[-w:]
        if not recent:
            return 0.0
        idxs = np.clip(np.array(recent, dtype=int), 0, 36)
        return float(np.sum(p[idxs])) / len(recent)

    w_long = int(params.get("window_long", 100))
    perfs = (
        np.array(
            [
                _perf(model_probs["freq"], w_long),
                _perf(model_probs["markov"], w_long),
                _perf(model_probs["nb"], w_long),
                _perf(model_probs["lstm"], w_long),
            ],
            dtype=float,
        )
        + EPS
    )

    sens = float(params.get("sens", 8.0))
    exps = np.exp(sens * (perfs - perfs.max()))
    new_w = exps / (exps.sum() + EPS)

    try:
        w0 = np.array(current_weights, dtype=float)
        if w0.size != 4 or float(w0.sum()) <= 0:
            w0 = np.ones(4, dtype=float) / 4.0
        else:
            w0 = w0 / (w0.sum() + EPS)
    except Exception:
        w0 = np.ones(4, dtype=float) / 4.0

    alpha = float(params.get("ema_alpha", 0.25))
    blended = alpha * new_w + (1 - alpha) * w0
    blended = blended / (blended.sum() + EPS)

    history_entry = {"ts": datetime.now(timezone.utc).isoformat(), "perf": perfs.tolist(), "weights": blended.tolist()}
    return blended, history_entry


# -----------------------------------------------------------------------------
# Engine pool (keeps one engine per user_id for multi-tenant isolation)
# -----------------------------------------------------------------------------
_ENGINE_POOL: Dict[str, "GunnerMLEngine"] = {}
_ENGINE_POOL_LOCK = threading.Lock()
# Legacy single-user alias
_ENGINE_SINGLETON: Optional["GunnerMLEngine"] = None
_ENGINE_SINGLETON_LOCK = _ENGINE_POOL_LOCK


def _get_engine_singleton(models: Optional[dict] = None, params: Optional[dict] = None) -> "GunnerMLEngine":
    """Return an engine instance, isolated per user_id when available.

    Multi-tenant: if params contains 'user_id', each user gets their own engine
    with their own MODEL_DIR subfolder (models_v3_17R/{user_id}/).
    Single-user: if no user_id, uses 'default' (backward compatible).
    """
    global _ENGINE_SINGLETON

    user_id = "default"
    if isinstance(params, dict):
        user_id = str(params.get("user_id", "default") or "default").strip().lower()
        if not user_id:
            user_id = "default"

    with _ENGINE_POOL_LOCK:
        if user_id in _ENGINE_POOL:
            eng = _ENGINE_POOL[user_id]
        else:
            # Create user-specific MODEL_DIR
            base_model_dir = _cfg("MODEL_DIR", ".")
            if user_id != "default":
                user_model_dir = os.path.join(base_model_dir, user_id)
            else:
                user_model_dir = base_model_dir
            os.makedirs(user_model_dir, exist_ok=True)

            # SEED: If user folder is empty, copy pre-trained state from seed folder.
            # The seed folder (models_v3_17R/_seed/) contains baseline weights, replay
            # buffer, and guardian states so new users start with a warm engine.
            # To create the seed: copy your trained files to models_v3_17R/_seed/
            try:
                seed_dir = os.path.join(base_model_dir, "_seed")
                if os.path.isdir(seed_dir) and user_id != "default":
                    # Only seed if user folder has no weights yet
                    user_weights = os.path.join(user_model_dir, "weights_state.json")
                    if not os.path.exists(user_weights):
                        import shutil
                        seed_files = [
                            "weights_state.json",
                            "meta_shadow_state.json",
                            "global_spins.jsonl",
                            "guardianes_docena_state.json",
                            "guardianes_columna_state.json",
                            "risk_state.json",
                        ]
                        copied = 0
                        for sf in seed_files:
                            src = os.path.join(seed_dir, sf)
                            if os.path.exists(src):
                                shutil.copy2(src, os.path.join(user_model_dir, sf))
                                copied += 1
                        if copied > 0:
                            logger.info(f"SEED: Copied {copied} pre-trained files to new user '{user_id}'")
            except Exception:
                logger.debug("Seed copy failed (non-fatal)", exc_info=True)

            # Override MODEL_DIR in config for this engine instance
            user_params = dict(params or {})
            user_params["_user_model_dir"] = user_model_dir

            eng = GunnerMLEngine(params=user_params, model_dir=user_model_dir)
            _ENGINE_POOL[user_id] = eng
            logger.info(f"Engine created for user '{user_id}' → {user_model_dir}")

        # Keep params in sync (best-effort, without breaking app.py contract)
        try:
            if params is not None and isinstance(params, dict):
                eng.params.update(params)
                try:
                    if hasattr(eng, 'em') and eng.em is not None:
                        if hasattr(eng.em, 'params') and isinstance(eng.em.params, dict):
                            eng.em.params.update(params)
                        if hasattr(eng.em, 'meta_shadow') and eng.em.meta_shadow is not None:
                            if hasattr(eng.em.meta_shadow, 'params') and isinstance(eng.em.meta_shadow.params, dict):
                                eng.em.meta_shadow.params.update(params)
                except Exception:
                    pass
        except Exception:
            pass

        # Keep models in sync (best-effort)
        try:
            if models is not None and isinstance(models, dict):
                eng.set_models(models)
        except Exception:
            pass

        # Legacy alias (last used engine)
        _ENGINE_SINGLETON = eng
        return eng


def run_ensemble(spins: List[int], models: dict, params: dict, weights: np.ndarray) -> np.ndarray:
    """Legacy wrapper expected by app.py; now stateful via singleton."""
    eng = _get_engine_singleton(models=models, params=params)
    return eng.em.combine(spins, weights=weights)


def hybrid_predictor(spins: List[int], models: Dict[str, Any], params: Dict[str, Any], weights: Optional[np.ndarray] = None) -> np.ndarray:
    """Legacy wrapper; kept for compatibility."""
    eng = _get_engine_singleton(models=models, params=params)
    return eng.em.combine(spins, weights=weights)


# -----------------------------------------------------------------------------
# Drift / bias utilities (compatibility)
# -----------------------------------------------------------------------------
def detect_bias_zscore(spins: List[int], params: dict = None) -> np.ndarray:
    params = params or {}
    s = _clean_spins(spins)
    window = int(params.get('bias_window', 500))
    s = s[-min(len(s), window):]
    if len(s) == 0:
        return np.zeros(37)
    counts = np.bincount(np.array(s, dtype=int), minlength=37).astype(float)
    mean = float(counts.mean())
    std = float(counts.std(ddof=0))
    if std <= 0:
        std = 1.0
    return (counts - mean) / std




def amplify_by_bias(p: np.ndarray, z: np.ndarray, z_threshold: float = 2.0) -> np.ndarray:
    """Ajuste suave de la distribución por señal de sesgo (z-scores).
    Se usa SOLO como refinamiento (no cambia el contrato ni fuerza BET).
    Si no hay sesgo significativo, retorna p sin cambios.

    Args:
        p: distribución base (shape [37]) normalizada.
        z: z-scores (shape [37]) alineados con 0..36.
        z_threshold: umbral a partir del cual se considera sesgo.

    Returns:
        p ajustada y re-normalizada.
    """
    try:
        p = np.asarray(p, dtype=float)
        z = np.asarray(z, dtype=float)
        if p.ndim != 1 or p.size != 37:
            return p
        if z.ndim != 1 or z.size != 37:
            return p
        if not np.isfinite(p).all() or p.sum() <= 0:
            return p
        # Si no hay sesgo significativo, no tocar.
        if float(np.nanmax(np.abs(z))) < float(z_threshold):
            return p
        # Boost suave solo para z positivos por encima del umbral.
        boost = np.clip(z - float(z_threshold), 0.0, 10.0)
        w = 1.0 + 0.15 * boost  # 15% por unidad sobre el umbral (suave)
        p_adj = p * w
        s = float(p_adj.sum())
        return p_adj / s if s > 0 else p
    except Exception:
        return p


def update_counters(counters: dict, bet_key: str, hit) -> dict:
    """Actualiza contadores por categoría. Esperado por app.py.

    Schema por categoría:
        wins, losses, consec_errors, max_consec_errors

    Nota: este helper NO decide BET/WAIT; solo cuenta cuando hit es evaluable.
    """
    if counters is None or not isinstance(counters, dict):
        counters = {}
    if bet_key not in counters or not isinstance(counters.get(bet_key), dict):
        counters[bet_key] = {"wins": 0, "losses": 0, "consec_errors": 0, "max_consec_errors": 0}
    c = counters[bet_key]
    for k in ("wins", "losses", "consec_errors", "max_consec_errors"):
        c.setdefault(k, 0)

    # Normalización de hit
    if hit is None:
        return counters
    h = bool(hit)

    if h:
        c["wins"] = int(c.get("wins", 0)) + 1
        c["consec_errors"] = 0
    else:
        c["losses"] = int(c.get("losses", 0)) + 1
        c["consec_errors"] = int(c.get("consec_errors", 0)) + 1
        c["max_consec_errors"] = max(int(c.get("max_consec_errors", 0)), int(c.get("consec_errors", 0)))

    counters[bet_key] = c
    return counters


def update_loss_state(consec_losses: int, cum_loss: float, last_result, stake_amt: float) -> dict:
    """Helper esperado por app.py para tracking simple de rachas/pérdida acumulada.

    - Si last_result es False: suma pérdida y aumenta racha.
    - Si last_result es True: resetea racha.
    - Si last_result es None: no cambia.

    Retorna un dict apto para st.session_state.update().
    """
    try:
        consec_losses = int(consec_losses or 0)
    except Exception:
        consec_losses = 0
    try:
        cum_loss = float(cum_loss or 0.0)
    except Exception:
        cum_loss = 0.0
    try:
        stake_amt = float(stake_amt or 0.0)
    except Exception:
        stake_amt = 0.0

    if last_result is True:
        consec_losses = 0
    elif last_result is False:
        consec_losses += 1
        cum_loss += max(0.0, stake_amt)

    return {"consec_losses": consec_losses, "cum_loss": cum_loss}



def calculate_drift_level(spins: List[int], window: int = 200) -> float:
    try:
        s = _clean_spins(spins)
        n = len(s)
        if n == 0:
            return 0.0
        z = detect_bias_zscore(s)
        mean_abs_z = float(np.mean(np.abs(z)))

        w_short = min(max(window // 4, 5), n)
        w_long = min(window, n)

        try:
            p_short = compute_p_freq_decay(s[-w_short:], alpha=1.0, lam=0.03, window=w_short)
            p_long = compute_p_freq_decay(s[-w_long:], alpha=1.0, lam=0.03, window=w_long)
            H_short = _shannon_entropy(p_short)
            H_long = _shannon_entropy(p_long)
            delta_H = float(max(0.0, H_long - H_short))
        except Exception:
            delta_H = 0.0

        z_norm = float(np.clip(mean_abs_z / 3.0, 0.0, 1.0))
        dH_norm = float(np.clip(delta_H / 2.0, 0.0, 1.0))
        return float(np.clip(0.7 * z_norm + 0.3 * dH_norm, 0.0, 1.0))
    except Exception:
        return 0.0


def drift_monitor_check(counters: dict, spins: List[int]):
    """
    Drift monitor used both for UI diagnostics and decision gating.

    Returns:
      {
        status: "no_data"|"normal"|"warning"|"critical",
        level: float,
        zmax: float,
        hot_numbers: [int...],
        cold_numbers: [int...],
        reason: str,
        thresholds: {...},
        windows: {...},
      }
    """
    thresholds = {
        "warn": 0.25,
        "critical": 0.45,
    }
    windows = {
        "drift_window": 200,
        "z_recent": 60,
        "z_base": 200,
        "min_spins": 10,
    }

    try:
        s = _clean_spins(spins)
    except Exception:
        s = []

    if len(s) < int(windows["min_spins"]):
        return {
            "status": "no_data",
            "level": 0.0,
            "zmax": 0.0,
            "hot_numbers": [],
            "cold_numbers": [],
            "reason": "No hay spins suficientes",
            "thresholds": thresholds,
            "windows": windows,
        }

    # --- Drift level (distribution change) ---
    try:
        dl = float(calculate_drift_level(s, window=int(windows["drift_window"])))
    except Exception:
        dl = 0.0

    if dl < thresholds["warn"]:
        status = "normal"
        reason = f"Drift level {dl:.3f} < warn_th {thresholds['warn']}"
    elif dl < thresholds["critical"]:
        status = "warning"
        reason = f"Drift approaching critical: {dl:.3f}"
    else:
        status = "critical"
        reason = f"Drift exceeded: {dl:.3f}"

    # --- Z-score (hot/cold) diagnostics: compare recent window vs base window ---
    try:
        recent_n = int(min(int(windows["z_recent"]), len(s)))
        if len(s) == 0 or recent_n < 5:
            hot_numbers, cold_numbers, zmax = [], [], 0.0
            return {
                "status": status,
                "level": float(dl),
                "zmax": 0.0,
                "hot_numbers": [],
                "cold_numbers": [],
                "reason": reason,
                "thresholds": thresholds,
                "windows": windows,
                "recent_n": int(recent_n),
            }

        base_n = int(min(int(windows["z_base"]), len(s)))
        recent = s[-recent_n:]
        base = s[-base_n:]

        # counts
        rc = np.bincount(np.array(recent, dtype=int), minlength=37)[:37].astype(float)
        bc = np.bincount(np.array(base, dtype=int), minlength=37)[:37].astype(float)

        # Laplace smoothing to avoid zeros in very short bases
        bc_s = bc + 1.0
        p_base = bc_s / (bc_s.sum() + EPS)

        exp = p_base * float(recent_n)
        var = float(recent_n) * p_base * (1.0 - p_base) + 1e-9
        z = (rc - exp) / np.sqrt(var)

        # hot/cold lists
        hot_idx = np.argsort(-z)[:6].tolist()
        cold_idx = np.argsort(z)[:6].tolist()

        # filter: keep only meaningful extremes (optional), but always return ordered ints 0..36
        hot_numbers = [int(i) for i in hot_idx]
        cold_numbers = [int(i) for i in cold_idx]
        zmax = float(np.max(np.abs(z))) if z.size else 0.0
    except Exception:
        hot_numbers, cold_numbers, zmax = [], [], 0.0

    return {
        "status": status,
        "level": float(dl),
        "zmax": float(zmax),
        "hot_numbers": hot_numbers,
        "cold_numbers": cold_numbers,
        "reason": reason,
        "thresholds": thresholds,
        "windows": windows,
    }


# -----------------------------------------------------------------------------
# Bet analysis + Coherence
# -----------------------------------------------------------------------------
def _get_group_nums(cat_key: str, group_name: str) -> List[int]:
    try:
        cat = (BET_CATEGORIES or {}).get(cat_key, {}) or {}
        groups = cat.get("groups", {}) or {}
        nums = groups.get(group_name, [])
        return [int(x) for x in nums if 0 <= int(x) <= 36]
    except Exception:
        return []


def analyze_bet_categories(p_fused: np.ndarray, wheel_info=None) -> Tuple[dict, dict]:
    """
    Returns analysis + cfl_metrics per bet category.
    wheel_info: output of get_wheel_expert_info() -- boosts active sector nums in p_fused.
    """
    analysis: Dict[str, Any] = {}
    cfl_group_2 = []
    cfl_group_3 = []

    p_fused = np.array(p_fused, dtype=float)
    if p_fused.size != 37 or float(p_fused.sum()) <= 0:
        p_fused = uniform_probs()

    # WheelExpert: extraer variables para voto directo por categoria
    _wheel_vote_weight: float = 0.0      # peso del voto wheel en cada categoria
    _wheel_sector_comp: Dict[str,float] = {}  # composicion del sector activo
    _wheel_active:      str = ''
    _wheel_top_score:   float = 0.0
    if isinstance(wheel_info, dict) and wheel_info:
        try:
            _wheel_active    = str(wheel_info.get('active_sector', '') or '')
            _wheel_scores    = wheel_info.get('sector_scores', {}) or {}
            _wheel_top_score = max(_wheel_scores.values()) if _wheel_scores else 0.0
            _wheel_sector_comp = _SECTOR_COMP.get(_wheel_active, {})
            _dealer_s        = wheel_info.get('dealer_sig', {}) or {}
            _dealer_str      = float(_dealer_s.get('strength', 0.0) or 0.0)
            _scatter_s       = wheel_info.get('scatter', {}) or {}
            _scatter_conf    = float(_scatter_s.get('confidence', 0.0) or 0.0)
            # Peso del voto wheel: combinacion de sector_score + dealer + scatter
            # Solo activo si el sector es suficientemente dominante
            if _wheel_active in _WHEEL_SECTORS and _wheel_top_score > 0.28:
                _base_w = float(np.clip((_wheel_top_score - 0.25) * 1.6, 0.0, 0.35))
                _sig_bonus = _dealer_str * 0.12 if _dealer_s.get('detected') else 0.0
                _scat_bonus = _scatter_conf * 0.08 if _scatter_conf > 0.20 else 0.0
                _wheel_vote_weight = float(np.clip(_base_w + _sig_bonus + _scat_bonus, 0.0, 0.45))
                # Boost p_fused para numeros (mantener para max_conf)
                boost = float(np.clip(1.0 + (_wheel_top_score - 0.25) * 1.8, 1.0, 1.65))
                for _wn in _WHEEL_SECTORS[_wheel_active]:
                    p_fused[int(_wn)] *= boost
                _ss = float(p_fused.sum())
                if _ss > 0: p_fused = p_fused / _ss
        except Exception:
            pass

    for key, cat in (BET_CATEGORIES or {}).items():
        if not isinstance(cat, dict):
            continue
        if cat.get("type") == "special":
            continue

        group_map = _CATEGORY_INDEX_MAP.get(key, {})
        group_probs = {name: float(_sum_over_indices(p_fused, idxs)) for name, idxs in (group_map or {}).items()}

        # WheelExpert: voto directo por categoria usando composicion del sector activo
        if _wheel_vote_weight > 0.0 and _wheel_sector_comp and group_probs:
            try:
                # Mapear sector_comp al espacio de esta categoria
                _wv: Dict[str,float] = {}
                if key == 'docenas':
                    _wv = {'1-12': _wheel_sector_comp.get('D1',0),
                           '13-24': _wheel_sector_comp.get('D2',0),
                           '25-36': _wheel_sector_comp.get('D3',0)}
                elif key == 'columnas':
                    _wv = {'C1': _wheel_sector_comp.get('C1',0),
                           'C2': _wheel_sector_comp.get('C2',0),
                           'C3': _wheel_sector_comp.get('C3',0)}
                elif key == 'color':
                    _wv = {'rojo': _wheel_sector_comp.get('rojo',0),
                           'negro': _wheel_sector_comp.get('negro',0)}
                elif key == 'paridad':
                    _wv = {'par': _wheel_sector_comp.get('par',0),
                           'impar': _wheel_sector_comp.get('impar',0)}
                elif key == 'rango':
                    _wv = {'1-18': _wheel_sector_comp.get('bajo',0),
                           '19-36': _wheel_sector_comp.get('alto',0)}
                # Solo mezclar si los nombres coinciden con group_probs
                _shared = set(_wv.keys()) & set(group_probs.keys())
                if _shared:
                    # Normalizar voto wheel
                    _wv_sum = sum(_wv.values()) + 1e-12
                    _wv_norm = {k: v/_wv_sum for k,v in _wv.items() if k in group_probs}
                    # Solo aplicar si el voto wheel tiene opinion fuerte (no uniforme)
                    _wv_vals = list(_wv_norm.values())
                    _wv_spread = max(_wv_vals) - min(_wv_vals) if _wv_vals else 0.0
                    if _wv_spread > 0.06:  # wheel tiene opinion real
                        _w = _wheel_vote_weight
                        for gk in group_probs:
                            if gk in _wv_norm:
                                group_probs[gk] = (1.0-_w)*group_probs[gk] + _w*_wv_norm[gk]
                        # Re-normalizar
                        _gp_sum = sum(group_probs.values()) + 1e-12
                        group_probs = {k: v/_gp_sum for k,v in group_probs.items()}
            except Exception:
                pass

        probs_vec = np.array(list(group_probs.values()), dtype=float) if group_probs else np.array([], dtype=float)
        H = _shannon_entropy(probs_vec) if probs_vec.size else 0.0
        top_sug = sorted(group_probs.items(), key=lambda x: x[1], reverse=True)

        k_groups = 2 if cat.get("type") == "group_2" else 3
        top_name = top_sug[0][0] if top_sug else None
        top_p = float(top_sug[0][1]) if top_sug else 0.0
        nums = _get_group_nums(key, top_name) if top_name else []
        baseline_p = (len(nums) / 37.0) if nums else (1.0 / k_groups)

        ev = _ev_group(top_p, k_groups=k_groups)
        conf_score = _confidence_score(top_p, k_groups=k_groups, entropy=H)
        edge = float(top_p - baseline_p)

        analysis[key] = {
            "label": cat.get("label", key),
            "type": cat.get("type"),
            "entropy": float(H),
            "probabilities": group_probs,
            "top_suggestion": top_name,
            "top_probability": float(top_p),
            "top_2_suggestions": top_sug[:2],
            "baseline_p": float(baseline_p),
            "edge": float(edge),
            "ev": float(ev),
            "conf_score": float(conf_score),
            "top_numbers": nums,
        }
        if cat.get("type") == "group_2":
            cfl_group_2.append(float(H))
        elif cat.get("type") == "group_3":
            cfl_group_3.append(float(H))

    cfl_metrics = {
        "H_doc": analysis.get("docenas", {}).get("entropy", 1.58),
        "H_col": analysis.get("columnas", {}).get("entropy", 1.58),
        "H_color": analysis.get("color", {}).get("entropy", 1.0),
        "H_parity": analysis.get("paridad", {}).get("entropy", 1.0),
        "H_range": analysis.get("rango", {}).get("entropy", 1.0),
        "max_H_doccol": max(cfl_group_3) if cfl_group_3 else 1.58,
        "avg_H_simples": float(np.mean(cfl_group_2)) if cfl_group_2 else 1.0,
    }

    top_doc_name = analysis.get("docenas", {}).get("top_suggestion")
    top_col_name = analysis.get("columnas", {}).get("top_suggestion")

    # --- Selección Numérica (antes: intersección docena/columna o TOP-3). ---
    # Objetivo operativo: sugerir un "set" de 12 números (más usable en vivo) sin romper el contrato.
    # - Si hay docena+columna dominantes, usamos su intersección como "núcleo" (4 nums) y completamos hasta 12
    #   con los números de mayor probabilidad restante.
    # - Por defecto evitamos incluir el 0 (ya existe cobertura opcional en la UI). Solo se agrega si faltan números.
    MAX_CONF_K = 12

    selection: List[int] = []
    if top_doc_name and top_col_name:
        try:
            doc_nums = set(int(x) for x in (DOZENS.get(top_doc_name, []) or []))
            col_nums = set(int(x) for x in (COLUMNS.get(top_col_name, []) or []))
            selection = sorted(list(doc_nums & col_nums))
        except Exception:
            selection = []

    # WheelExpert: si hay sector activo, priorizar sus numeros en la seleccion
    _wheel_sector_nums: set = set()
    if isinstance(wheel_info, dict) and wheel_info:
        try:
            _wa = str(wheel_info.get('active_sector', '') or '')
            _ws = wheel_info.get('sector_scores', {}) or {}
            _dealer_sig_info = wheel_info.get('dealer_sig', {}) or {}
            _wsc = float(_dealer_sig_info.get('strength', 0.0)) if _dealer_sig_info else 0.0
            _top_sc2 = max(_ws.values()) if _ws else 0.0
            # Solo priorizar si el sector es suficientemente dominante
            if _wa in _WHEEL_SECTORS and _top_sc2 > 0.28:
                _wheel_sector_nums = set(_WHEEL_SECTORS[_wa])
                # Tambien agregar scatter prediction si hay dealer signature
                _scatter = wheel_info.get('scatter', {})
                _sc_conf = float(_scatter.get('confidence', 0.0) if isinstance(_scatter, dict) else 0.0)
        except Exception:
            pass

    # Ranking global por probabilidad (excluye 0 por defecto)
    try:
        ranked = list(np.argsort(p_fused)[::-1])
    except Exception:
        ranked = list(range(36, -1, -1))

    # Completar hasta 12: priorizar sector WheelExpert, luego top prob
    sel_set = set(int(x) for x in selection if isinstance(x, (int, np.integer)) and 0 <= int(x) <= 36 and int(x) != 0)
    # Primero: agregar numeros del sector wheel (ordenados por p_fused)
    if _wheel_sector_nums:
        wheel_ranked = sorted(_wheel_sector_nums, key=lambda n: float(p_fused[int(n)]) if 0<=int(n)<37 else 0.0, reverse=True)
        for wn in wheel_ranked:
            if len(sel_set) >= MAX_CONF_K: break
            if int(wn) != 0 and 0 <= int(wn) <= 36:
                sel_set.add(int(wn))
    # Luego: completar con top prob global
    for idx in ranked:
        try:
            ii = int(idx)
        except Exception:
            continue
        if ii == 0:
            continue
        if ii < 0 or ii > 36:
            continue
        if ii in sel_set:
            continue
        sel_set.add(ii)
        if len(sel_set) >= MAX_CONF_K:
            break

    # Si por cualquier razón aún faltan, permitimos 0 como último recurso
    if len(sel_set) < MAX_CONF_K:
        sel_set.add(0)

    # Orden final: por probabilidad descendente para mostrarlo "como ranking"
    selection = sorted(list(sel_set), key=lambda i: float(p_fused[int(i)]) if 0 <= int(i) < len(p_fused) else 0.0, reverse=True)[:MAX_CONF_K]

    p_win = float(np.sum(p_fused[[int(s) for s in selection]])) if selection else 0.0
    k = max(1, len(selection))
    ev = (36.0 / k) * p_win - 1.0

    H_nums = float(_shannon_entropy(p_fused))
    baseline_p = k / 37.0
    edge = float(p_win - baseline_p)
    conf_score = _confidence_score_numbers(p_win, k_sel=k, H_nums=H_nums)

    analysis["max_conf"] = {
        "label": "Selección Numérica",
        "selection": selection,
        "confidence": round(conf_score * 100.0, 1),
        "conf_score": float(conf_score),
        "p_win": p_win,
        "ev": float(ev),
        "baseline_p": float(baseline_p),
        "edge": float(edge),
        "docena": top_doc_name,
        "columna": top_col_name,
    }
    analysis["H_numeros"] = H_nums
    analysis["_p_fused"] = p_fused.tolist()

    # --- Meta telemetry (Entrega 5): inject last meta blend info (if any) ---
    try:
        if isinstance(_LAST_META_TELEMETRY, dict) and _LAST_META_TELEMETRY:
            analysis["meta_shadow"] = dict(_LAST_META_TELEMETRY)
    except Exception:
        pass

    return analysis, cfl_metrics


def _select_primary_bet(analysis: dict, params: dict) -> dict:
    """Selecciona la hipótesis / apuesta principal H a partir del análisis derivado de P_final(n).

    Principios (modo "profesional"):
      - Prioriza EVENTOS (docenas/columnas/color/paridad/rango) sobre "números" (max_conf).
      - Score payout-aware usando EV por categoría (ya viene en analysis[key]["ev"]).
      - Penaliza incertidumbre (entropía) y riesgo (números / apuestas más volátiles).
      - Evita cambios erráticos: usa margen de empate para preferir estabilidad.

    Retorna un dict compacto con:
      bet_key, label, type, group, numbers, p, baseline_p, edge, ev, entropy, conf_score, score, confidence_pct
    """
    EPS_LOCAL = 1e-12

    if not isinstance(analysis, dict):
        return {"bet_key": "docenas", "label": "Docenas", "type": "group", "conf_score": 0.0, "confidence_pct": 0.0}

    # --- Risk: keys in cooldown (BET-only circuit breaker) ---
    disabled_keys = set()
    try:
        _rk = analysis.get("_risk_disabled_keys", None)
        if isinstance(_rk, (list, tuple, set)):
            disabled_keys = {str(x) for x in _rk}
    except Exception:
        disabled_keys = set()

    def _safe_float(x, default=0.0):
        try:
            if x is None:
                return default
            return float(x)
        except Exception:
            return default

    def _clip01(x: float) -> float:
        try:
            x = float(x)
        except Exception:
            return 0.0
        if x < 0.0:
            return 0.0
        if x > 1.0:
            return 1.0
        return x

    # --- Config / pesos del selector ---
    allow_numbers = bool(params.get("primary_allow_numbers", False))
    allow_guardian = bool(params.get("primary_allow_guardian", False))  # por defecto NO
    use_group3_top2 = bool(params.get("primary_group3_top2", True))


    # Ponderación del score (payout-aware => EV tiene prioridad)
    w_ev = _safe_float(params.get("primary_w_ev", 1.00), 1.00)
    w_conf = _safe_float(params.get("primary_w_conf", 0.55), 0.55)
    w_ent = _safe_float(params.get("primary_w_entropy", 0.20), 0.20)

    min_ev = _safe_float(params.get("primary_min_ev", 0.00), 0.00)          # EV mínimo para considerar BET "limpio"
    min_conf = _safe_float(params.get("primary_min_conf", 0.00), 0.00)      # no bloquea; solo afecta score
    tie_margin = _safe_float(params.get("primary_tie_margin", 0.02), 0.02)  # margen para desempate

    # Penalizaciones de riesgo por tipo
    risk_penalty = {
        "max_conf": _safe_float(params.get("risk_penalty_numbers", 0.12), 0.12),
        "docenas": _safe_float(params.get("risk_penalty_group3", 0.05), 0.05),
        "columnas": _safe_float(params.get("risk_penalty_group3", 0.05), 0.05),
        "color": _safe_float(params.get("risk_penalty_group2", 0.03), 0.03),
        "paridad": _safe_float(params.get("risk_penalty_group2", 0.03), 0.03),
        "rango": _safe_float(params.get("risk_penalty_group2", 0.03), 0.03),
        "guardian_docena": _safe_float(params.get("risk_penalty_group3", 0.05), 0.05),
    }

    def _entropy_norm(key: str, H: float) -> float:
        # Normaliza entropía a [0,1] usando máximos teóricos (log2(K))
        if key in ("docenas", "columnas", "guardian_docena"):
            Hmax = 1.585  # log2(3)
        elif key in ("color", "paridad", "rango"):
            Hmax = 1.0    # log2(2)
        else:
            Hmax = 1.0
        return float(_clip01(H / max(EPS_LOCAL, Hmax)))

    candidates = []

    def _push_candidate(key: str, a: dict):
        if not isinstance(a, dict):
            return

        entropy = _safe_float(a.get("entropy", 0.0), 0.0)

        # Default: top-1.
        top_name = a.get("top_suggestion", None)
        top_p = _safe_float(a.get("top_probability", 0.0), 0.0)
        top_numbers = a.get("top_numbers", []) or []
        top_options = None  # for docenas/columnas top-2

        # IMPORTANT: Docenas/Columnas in this engine are wagered as TOP-2 (2 opciones) when available.
        # This aligns evaluation/backtest with the real staking rule: bet the two best suggestions.
        if use_group3_top2 and key in ("docenas", "columnas"):
            top2 = a.get("top_2_suggestions", None)
            if isinstance(top2, list) and len(top2) >= 2:
                try:
                    g1, p1 = top2[0][0], float(top2[0][1])
                    g2, p2 = top2[1][0], float(top2[1][1])
                    top_options = [str(g1), str(g2)]
                    top_name = f"{top_options[0]} / {top_options[1]}"
                    top_p = float(p1 + p2)
                    if key == "docenas":
                        top_numbers = sorted(set(DOZENS.get(top_options[0], []) + DOZENS.get(top_options[1], [])))
                    else:
                        top_numbers = sorted(set(COLUMNS.get(top_options[0], []) + COLUMNS.get(top_options[1], [])))
                except Exception:
                    top_options = None

        # Baseline derived from the actual covered numbers (single option => 12/37, top-2 => 24/37).
        baseline_p = float(len(top_numbers) / 37.0) if top_numbers else _safe_float(a.get("baseline_p", 0.0), 0.0)
        edge = float(top_p - baseline_p)

        # EV: for top-2 group_3, use the correct split-stake EV; otherwise keep existing.
        if top_options is not None and key in ("docenas", "columnas"):
            ev = float(_ev_group3_top2(top_p))
        else:
            ev = _safe_float(a.get("ev", 0.0), 0.0)
        # FIX FASE 1 (#5): Kelly fracción blindada para top-2 group_3 (solo metadata; NO altera decisión)
        kelly_frac = None
        if top_options is not None and key in ("docenas", "columnas"):
            try:
                kelly_frac = float(_kelly_group3_top2(top_p))
            except Exception:
                kelly_frac = 0.0
        conf = _safe_float(a.get("conf_score", None), None)

        if conf is None or conf <= 0:
            # fallback: fracción del exceso de probabilidad vs baseline
            conf = _clip01(max(0.0, edge) / max(EPS_LOCAL, 1.0 - baseline_p))

        # Score payout-aware: EV manda; conf ayuda; entropía castiga.
        ent_n = _entropy_norm(key, entropy)
        score = (w_ev * ev) + (w_conf * max(conf, min_conf)) - (w_ent * ent_n) - risk_penalty.get(key, 0.05)

        # Preferir como "principal" las categorías que ya están listas para PROBE/BET (edge thresholds).
        # ✅ IMPORTANTE: usar los mismos umbrales que el resto del engine (función centralizada),
        # para evitar que la principal quede "activa" aquí pero luego termine en WAIT en la decisión final.
        try:
            ex, pr = _edge_thresholds_for_shared(key, params)
            if (edge >= ex):
                status_rank = 2
                status_label = "BET"
            elif (edge >= pr):
                status_rank = 1
                status_label = "PROBE"
            else:
                status_rank = 0
                status_label = "WAIT"
            score += float(params.get("primary_status_bonus", 0.22)) * float(status_rank)
        except Exception:
            status_rank = 0
            status_label = "WAIT"
        cand = {
            "bet_key": key,
            "label": a.get("label", key.capitalize()),
            "type": a.get("type", "group"),
            "group": top_name,
            "numbers": top_numbers,
            "options": top_options,
            "p": float(top_p),
            "baseline_p": float(baseline_p),
            "edge": float(edge),
            "ev": float(ev),
            "entropy": float(entropy),
            "conf_score": float(conf),
            "status_rank": int(status_rank),
            "status": str(status_label),
            "score": float(score),
        }
        if kelly_frac is not None:
            cand["kelly_frac"] = float(kelly_frac)
        candidates.append(cand)

    # --- 1) Eventos base (SIEMPRE) ---
    for key in ("docenas", "columnas", "color", "paridad", "rango"):
        if key in disabled_keys:
            continue
        _push_candidate(key, analysis.get(key, {}) or {})

    # --- 2) Guardian (opcional, normalmente NO como H principal) ---
    if allow_guardian and ("guardian_docena" not in disabled_keys):
        _push_candidate("guardian_docena", analysis.get("guardian_docena", {}) or {})

    # --- 3) Números (opcional y muy restringido) ---
    if allow_numbers:
        mc = analysis.get("max_conf", {}) or {}
        if isinstance(mc, dict) and ("max_conf" not in disabled_keys):
            _push_candidate("max_conf", mc)

    if not candidates:
        return {"bet_key": "docenas", "label": "Docenas", "type": "group", "conf_score": 0.0, "confidence_pct": 0.0}

    # Ordenar por score desc, luego por EV desc, luego por conf desc
    # Ordenar por: (1) probabilidad de BET/PROBE (status_rank), (2) score, (3) EV, (4) conf
    candidates.sort(key=lambda d: (int(d.get("status_rank", 0)),
                                   float(d.get("score", -1e9)),
                                   float(d.get("ev", -1e9)),
                                   float(d.get("conf_score", -1e9))), reverse=True)

    best = candidates[0]

    # Si el mejor no cumple EV mínimo, igual lo dejamos como H (para coherencia),
    # pero su baja EV se reflejará en baja confianza y el gate de mesa tenderá a WAIT.
    # Evita que "números" desplace eventos salvo que tenga ventaja REAL.
    if best.get("bet_key") == "max_conf":
        # requiere ventaja material vs el mejor evento
        events = [c for c in candidates if c.get("bet_key") in ("docenas", "columnas", "color", "paridad", "rango")]
        if events:
            top_event = events[0]
            if float(best.get("score", 0.0)) - float(top_event.get("score", 0.0)) < tie_margin:
                best = top_event


    # Empate cercano: selector balanceado (NO sesga a docenas/columnas).
    # Regla: si hay alternativas dentro de tie_margin, se mantiene el mayor score.
    # Si el ganador es group_3 (docenas/columnas) pero un group_2 (color/paridad/rango)
    # está dentro del margen, permitimos que el group_2 sea H *solo* si no sacrifica EV
    # de forma material. Esto evita quedar "clavado" en docenas/columnas por empates.
    if len(candidates) > 1 and float(tie_margin) > 0.0:
        try:
            best_score = float(best.get("score", 0.0))
        except Exception:
            best_score = 0.0

        try:
            best_rank = int(best.get("status_rank", 0))
        except Exception:
            best_rank = 0

        near = []
        for c in candidates[1:]:
            try:
                if int(c.get("status_rank", 0)) != best_rank:
                    continue
                if (best_score - float(c.get("score", 0.0))) <= float(tie_margin):
                    near.append(c)
            except Exception:
                continue

        if near:
            best_key = str(best.get("bet_key", ""))

            # Caso principal: ganador group_3 => permitir competición real de group_2 dentro del margen.
            if best_key in ("docenas", "columnas"):
                group2 = [c for c in near if c.get("bet_key") in ("color", "paridad", "rango")]
                if group2:
                    group2.sort(key=lambda d: (float(d.get("score", -1e9)),
                                               float(d.get("ev", -1e9)),
                                               float(d.get("conf_score", -1e9))), reverse=True)
                    alt = group2[0]

                    # No alternar si el EV cae claramente (protección rentabilidad).
                    try:
                        ev_gap = float(best.get("ev", 0.0)) - float(alt.get("ev", 0.0))
                    except Exception:
                        ev_gap = 0.0

                    # Margen conservador: solo alterna si el gap de EV es despreciable.
                    # (usa tie_margin como escala, sin introducir parámetros nuevos)
                    if ev_gap <= max(0.0, 0.25 * float(tie_margin)):
                        best = alt

    best["confidence_pct"] = round(float(best.get("conf_score", 0.0)) * 100.0, 1)
    # Telemetría de candidatos (debug): no rompe contrato, solo extra
    try:
        analysis["_primary_candidates"] = candidates[:8]
    except Exception:
        pass
    return best

def _coherence_from_primary(p_fused: np.ndarray, primary_nums: List[int], analysis: dict) -> dict:
    """FASE 3 — Coherencia total vía condicionales P(E|H).

    - H se representa como un conjunto de números (primary_nums).
    - Para cada apuesta E (docenas/columnas/color/paridad/rango/guardian_docena/max_conf) calcula:
        P(E∩H), P(H), P(E|H) = P(E∩H)/P(H)
    - Si P(E∩H)=0 => contradicción (prohibido sugerir).
    - Clasifica cond_status BET/PROBE/WAIT por umbrales sobre P(E|H).
    """
    try:
        H = set(int(x) for x in (primary_nums or []) if 0 <= int(x) <= 36)
    except Exception:
        H = set()

    p = np.array(p_fused, dtype=float)
    if p.size != 37 or float(p.sum()) <= 0:
        p = uniform_probs()
    else:
        p = p / (p.sum() + EPS)

    if not H:
        return {"consistent": [], "inconsistent": [], "neutral": [], "details": {}, "primary_mass": 0.0}

    H_mass = float(np.sum(p[list(H)])) if H else 0.0
    if H_mass <= 0:
        H_mass = 1e-12

    # Umbrales (por defecto conservadores)
    cond_bet = float(0.62)
    cond_probe = float(0.55)
    try:
        # params puede venir incrustado en analysis bajo 'params' o no; mantenemos defaults si no existe
        if isinstance(analysis, dict) and isinstance(analysis.get("_params", None), dict):
            ap = analysis.get("_params", {}) or {}
            cond_bet = float(ap.get("cond_bet_threshold", cond_bet))
            cond_probe = float(ap.get("cond_probe_threshold", cond_probe))
    except Exception:
        pass
    # sanity
    cond_bet = float(np.clip(cond_bet, 0.50, 0.90))
    cond_probe = float(np.clip(cond_probe, 0.45, cond_bet))

    keys = ["docenas", "columnas", "color", "paridad", "rango", "guardian_docena", "max_conf"]
    details: Dict[str, Any] = {}
    consistent: List[str] = []
    inconsistent: List[str] = []
    neutral: List[str] = []

    for key in keys:
        a = analysis.get(key, {}) if isinstance(analysis, dict) else {}
        if not isinstance(a, dict):
            neutral.append(key)
            continue

        pick = a.get("top_suggestion", None)
        nums = a.get("top_numbers", None)

        # max_conf usa selection como números
        if key == "max_conf":
            nums = a.get("selection", a.get("numbers", [])) or []
            pick = pick if pick is not None else "max_conf"

        try:
            S = set(int(x) for x in (nums or []) if 0 <= int(x) <= 36)
        except Exception:
            S = set()

        if not S:
            neutral.append(key)
            details[key] = {
                "pick": pick,
                "p_given_primary": 0.0,
                "p_inter": 0.0,
                "p_set": 0.0,
                "contradiction": False,
                "cond_status": "WAIT",
            }
            continue

        inter = list(H & S)
        p_inter = float(np.sum(p[inter])) if inter else 0.0
        p_set = float(np.sum(p[list(S)])) if S else 0.0
        contradiction = (len(inter) == 0)

        p_given = float(p_inter / H_mass) if H_mass > 0 else 0.0

        if contradiction:
            cond_status = "WAIT"
        elif p_given >= cond_bet:
            cond_status = "BET"
        elif p_given >= cond_probe:
            cond_status = "PROBE"
        else:
            cond_status = "WAIT"

        details[key] = {
            "pick": pick,
            "p_given_primary": float(p_given),
            "p_inter": float(p_inter),
            "p_set": float(p_set),
            "contradiction": bool(contradiction),
            "cond_status": cond_status,
        }

        if contradiction:
            inconsistent.append(key)
        elif cond_status in ("BET", "PROBE"):
            consistent.append(key)
        else:
            inconsistent.append(key)

    return {
        "consistent": consistent,
        "inconsistent": inconsistent,
        "neutral": neutral,
        "details": details,
        "primary_mass": float(H_mass),
    }


def _bet_advice_from_analysis(analysis: dict, params: dict, coherence: dict) -> dict:
    """
    Profesional:
    - Status BET/PROBE/WAIT basado en EDGE vs (exploit_edge/probe_edge) por tipo de apuesta.
    - Confianza (conf_score) = clip(edge / exploit_edge, 0..1) cuando edge>0.
    - Coherencia: si es inconsistente con la apuesta principal -> WAIT (excepto guardian_docena y max_conf).
    - Mantiene compatibilidad de llaves esperadas por app.py/UI.
    """
    advice: Dict[str, Any] = {}

    if not isinstance(analysis, dict):
        return advice
    if params is None:
        params = {}
    if coherence is None:
        coherence = {}

    EPS_LOCAL = 1e-12

    def _baseline_for(bet_key: str, selection_size: int = 1) -> float:
        if bet_key == "max_conf":
            return float(max(1, int(selection_size))) / 37.0
        if bet_key in ("docenas", "columnas", "guardian_docena", "guardian_columna"):
            return 12.0 / 37.0
        if bet_key in ("color", "paridad", "rango"):
            return 18.0 / 37.0
        return 1.0 / 37.0

    def _edge_thresholds_for(bet_key: str) -> Tuple[float, float]:
        return _edge_thresholds_for_shared(bet_key, params)

    def _conf_from_edge(edge: float, exploit_edge: float) -> float:
        edge = float(edge)
        exploit_edge = float(exploit_edge)
        if edge <= 0.0 or exploit_edge <= EPS_LOCAL:
            return 0.0
        return float(np.clip(edge / exploit_edge, 0.0, 1.0))

    def _top_prob_from_cat(a: dict) -> float:
        if not isinstance(a, dict):
            return 0.0
        try:
            return float(a.get("top_probability", 0.0) or 0.0)
        except Exception:
            return 0.0

    inconsistent = set((coherence or {}).get("inconsistent", []) or [])

    # --- Guardian: si el engine ya trae status/reason, se respeta tal cual ---
    g = analysis.get("guardian_docena", None)
    if isinstance(g, dict) and ("status" in g and "reason" in g):
        advice["guardian_docena"] = {
            "label": g.get("label", "Apuesta Guardián (Docena)"),
            "status": g.get("status", "WAIT"),
            "reason": g.get("reason", ""),
            "p": float(g.get("top_probability", 0.0)),
            "ev": float(g.get("ev", 0.0)),
            "baseline_p": float(g.get("baseline_p", _baseline_for("guardian_docena"))),
            "edge": float(g.get("edge", 0.0)),
            "conf_score": float(g.get("conf_score", 0.0)),  # ya viene edge/exploit en tu guardián
            "confidence_pct": float(g.get("confidence_pct", 0.0)),
            "exploit_edge": float(g.get("guardian_meta", {}).get("params", {}).get("guardian_exploit_edge", params.get("exploit_edge_group3", 0.015))),
            "probe_edge": float(g.get("guardian_meta", {}).get("params", {}).get("guardian_probe_edge", params.get("probe_edge_group3", 0.008))),
            "pick": g.get("top_suggestion", None),
        }

    # --- Guardian Columna (paralelo a guardian_docena) ---
    gc = analysis.get("guardian_columna", None)
    if isinstance(gc, dict) and ("status" in gc and "reason" in gc):
        advice["guardian_columna"] = {
            "label": gc.get("label", "GUARDIAN COLUMNA"),
            "status": gc.get("status", "WAIT"),
            "reason": gc.get("reason", ""),
            "p": float(gc.get("top_probability", 0.0)),
            "ev": float(gc.get("ev", 0.0)),
            "baseline_p": float(gc.get("baseline_p", _baseline_for("guardian_columna"))),
            "edge": float(gc.get("edge", 0.0)),
            "conf_score": float(gc.get("conf_score", 0.0)),
            "confidence_pct": float(gc.get("confidence_pct", 0.0)),
            "exploit_edge": float(gc.get("guardian_meta", {}).get("params", {}).get("guardian_exploit_edge", params.get("exploit_edge_group3", 0.015))),
            "probe_edge": float(gc.get("guardian_meta", {}).get("params", {}).get("guardian_probe_edge", params.get("probe_edge_group3", 0.008))),
            "pick": gc.get("pick", gc.get("top_suggestion", None)),
            "top_suggestion": gc.get("top_suggestion", gc.get("pick", None)),
            "top_2_suggestions": gc.get("top_2_suggestions", []),
            "guardian_meta": gc.get("guardian_meta", {}),
        }


    # --- Resto categorías estándar + max_conf ---
    for key in ["docenas", "columnas", "color", "paridad", "rango", "max_conf"]:
        a = analysis.get(key, {}) or {}
        if not isinstance(a, dict):
            continue

        if key == "max_conf":
            sel = a.get("selection", []) or []
            k_sel = len(sel) if isinstance(sel, (list, tuple, np.ndarray)) else 1
            try:
                p = float(a.get("p_win", a.get("top_probability", 0.0)) or 0.0)
            except Exception:
                p = 0.0
            pick = sel if isinstance(sel, list) else []
            label = a.get("label", "Números (Top 12)")
            base = float(a.get("baseline_p", _baseline_for("max_conf", k_sel)) or _baseline_for("max_conf", k_sel))
        else:
            # Default: top-1.
            p = _top_prob_from_cat(a)
            pick = a.get("top_suggestion", None)
            label = a.get("label", key)
            edge_override = None  # recompute when using TOP-2 group_3

            # Docenas/Columnas are wagered as TOP-2 when available (2 opciones).
            # Use p_total = p1+p2 and baseline=24/37 to classify BET/PROBE/WAIT.
            if key in ("docenas", "columnas"):
                top2 = a.get("top_2_suggestions", None)
                if isinstance(top2, list) and len(top2) >= 2:
                    try:
                        g1, p1 = top2[0][0], float(top2[0][1])
                        g2, p2 = top2[1][0], float(top2[1][1])
                        pick = f"{g1} / {g2}"
                        p = float(p1 + p2)
                        base = 24.0 / 37.0
                        edge_override = float(p - base)  # ensure edge matches TOP-2 p_total
                    except Exception:
                        base = float(a.get("baseline_p", _baseline_for(key)) or _baseline_for(key))
                else:
                    base = float(a.get("baseline_p", _baseline_for(key)) or _baseline_for(key))
            else:
                base = float(a.get("baseline_p", _baseline_for(key)) or _baseline_for(key))

        edge = float(edge_override) if (edge_override is not None) else float(a.get("edge", p - base) or (p - base))
        exploit_edge, probe_edge = _edge_thresholds_for(key)
        conf_edge = _conf_from_edge(edge, exploit_edge)
        ev_out = float(_ev_group3_top2(p)) if (key in ("docenas", "columnas") and isinstance(pick, str) and " / " in pick) else float(a.get("ev", 0.0) or 0.0)

                # coherencia: si inconsistente, NO se bloquea totalmente.
        # - Puede degradas BET->PROBE
        # - PROBE se permite
        # - WAIT se queda WAIT
        conf_probe_min = float(params.get("probe_conf_min", 0.52))
        conf_exploit_min = float(params.get("exploit_conf_min", 0.62))
        # Reglas base (edge vs baseline) + umbrales específicos por categoría.
        # Para guardian_docena añadimos umbrales mínimos de probabilidad para evitar BET "permanente".
        if edge <= 0.0:
            status = "WAIT"
            reason = f"Edge<=0 (p={p:.3f} base={base:.3f})"
        else:
            # Payout-aware gating for group_3 TOP-2 (docenas/columnas): you bet 1u+1u.
            # Break-even p_cover = 2/3. Use explicit p thresholds rather than edge thresholds.
            if key in ("docenas", "columnas") and isinstance(pick, str) and " / " in pick:
                # TOP-2 (docenas/columnas) en vivo: combinar EDGE con umbral mínimo de probabilidad de cobertura
                # para evitar BET ruidosos que disparan rachas de error.
                #
                # EV por 2 unidades (1u+1u): EV = 3p - 2  => break-even p=2/3≈0.6667
                p_bet_min = float(params.get("doccol_top2_p_bet_min", 0.667))
                p_probe_min = float(params.get("doccol_top2_p_probe_min", 0.655))
                p_bet_min = float(np.clip(p_bet_min, 0.60, 0.85))
                p_probe_min = float(np.clip(p_probe_min, 0.55, p_bet_min))

                ev2 = float(_ev_group3_top2(p))
                if (edge >= exploit_edge) and (p >= p_bet_min):
                    status = "BET"
                    reason = f"TOP-2 fuerte (p={p:.3f}>= {p_bet_min:.3f}, edge={edge:+.3f} conf={conf_edge:.3f}) | EV={ev2:+.3f}/u"
                elif (edge >= probe_edge) and (p >= p_probe_min):
                    status = "PROBE"
                    reason = f"TOP-2 media (p={p:.3f}>= {p_probe_min:.3f}, edge={edge:+.3f} conf={conf_edge:.3f}) | EV={ev2:+.3f}/u"
                else:
                    status = "WAIT"
                    reason = f"TOP-2 sin señal (p={p:.3f} edge={edge:+.3f}) | EV={ev2:+.3f}/u"
            elif key == "guardian_docena":
                p_bet_min = float(params.get("guardian_p_bet_min", 0.385))
                p_probe_min = float(params.get("guardian_p_probe_min", 0.360))

                if (edge >= exploit_edge and p >= p_bet_min) or (conf_edge >= conf_exploit_min and p >= p_bet_min):
                    status = "BET"
                    reason = f"Guardían fuerte (p={p:.3f} edge={edge:+.3f} conf={conf_edge:.3f})"
                elif (edge >= probe_edge and p >= p_probe_min) or (conf_edge >= conf_probe_min and p >= p_probe_min):
                    status = "PROBE"
                    reason = f"Guardían media (p={p:.3f} edge={edge:+.3f} conf={conf_edge:.3f})"
                else:
                    status = "WAIT"
                    reason = f"Guardían sin señal (p={p:.3f} edge={edge:+.3f})"
            else:
                if (edge >= exploit_edge):
                    status = "BET"
                    reason = f"Edge/Conf fuerte (edge={edge:+.3f}, conf={conf_edge:.3f})"
                    if edge < exploit_edge:
                        reason += f" | Conf alta (>= {conf_exploit_min:.3f})"
                elif (edge >= probe_edge):
                    status = "PROBE"
                    reason = f"Edge/Conf media (edge={edge:+.3f}, conf={conf_edge:.3f})"
                    if edge < probe_edge:
                        reason += f" | Conf suficiente (>= {conf_probe_min:.3f})"
                else:
                    status = "WAIT"
        # Aplicar coherencia DESPUÉS de calcular status por edge
        if (key in inconsistent) and (key not in ("max_conf", "guardian_docena", "guardian_columna")) and not (
            key in ("docenas", "columnas") and isinstance(pick, str) and (" / " in pick)
        ):
            if status == "BET":
                status = "PROBE"
                reason = "Inconsistente con la apuesta principal (degradado a PROBE)"
            elif status == "PROBE":
                reason = "Inconsistente con la apuesta principal (PROBE permitido)"
            else:
                # WAIT se queda WAIT, pero mantenemos el reason de edge
                reason = f"{reason} | Inconsistente con la apuesta principal"


        # --- Shadow-only modes (controlado por params)
        # Por defecto, "max_conf" (Números Top-K) puede marcar WAIT/PROBE/BET como las demás categorías,
        # pero NO debe forzar la apuesta principal ni afectar coherencia (ya se excluye arriba).
        # Si quieres dejarlo solo informativo, usa params["numbers_mode"]="shadow".
        if key == "max_conf" and str(params.get("numbers_mode", "live")).lower() in ("shadow","info","off"):
            status = "INFO"
            reason = "Solo informativo (numbers_mode=shadow)"
        elif key == "guardian_docena":
            status = "MONITOR"
            reason = (f"MONITOR (no afecta otras apuestas) | {reason}" if reason else "MONITOR (no afecta otras apuestas)")

        advice[key] = {
            "label": label,
            "status": status,
            "reason": reason,
            "p": float(p),
            "ev": float(ev_out),
            "baseline_p": float(base),
            "edge": float(edge),

            # ✅ Confianza PRO (alineada con get_decision)
            "conf_score": float(conf_edge),
            "confidence_pct": round(float(conf_edge) * 100.0, 1),
            "exploit_edge": float(exploit_edge),
            "probe_edge": float(probe_edge),

            "pick": pick,
        }

        # --- MEJORA 1: Kelly Generalizado ---
        try:
            if key in ("color", "paridad", "rango"):
                _kelly_type = "simple"
            elif key in ("docenas", "columnas") and isinstance(pick, str) and " / " in pick:
                _kelly_type = "group3_top2"
            elif key in ("docenas", "columnas"):
                _kelly_type = "group3_top1"
            elif key in ("guardian_docena", "guardian_columna"):
                _kelly_type = "group3_top1"
            elif key == "max_conf":
                _kelly_type = "numbers_12"
            else:
                _kelly_type = "simple"

            _kelly_f = kelly_fraction_generalized(float(p), _kelly_type)
            advice[key]["kelly_frac"] = round(float(_kelly_f), 4)
            advice[key]["kelly_type"] = _kelly_type
        except Exception:
            advice[key]["kelly_frac"] = 0.0

        # --- MEJORA 2: Bayesian Edge CI ---
        try:
            # Estimate counts from p and total spins available in analysis
            _total_spins = int(a.get("total_spins", a.get("n", 0)) or 0)
            if _total_spins <= 0:
                # Fallback: estimate from the analysis dict
                _total_spins = int(sum(float(x[1]) for x in a.get("top_2_suggestions", []) if isinstance(x, (list,tuple)) and len(x)>=2) * 37 / 24) if a.get("top_2_suggestions") else 0
            if _total_spins > 0:
                # Approximate group count from probability × total
                _est_count = float(p) * _total_spins
                _est_rest = _total_spins - _est_count
                _bci = bayesian_edge_ci(
                    counts=[_est_count, _est_rest],
                    group_idx=0,
                    baseline=float(base),
                    alpha=1.0,
                    ci_level=0.95,
                )
            else:
                _bci = {"significant": False, "edge_ci_lower": 0.0}
            advice[key]["bayesian_significant"] = bool(_bci.get("significant", False))
            advice[key]["edge_ci_lower"] = round(float(_bci.get("edge_ci_lower", 0.0)), 4)
        except Exception:
            advice[key]["bayesian_significant"] = False
            advice[key]["edge_ci_lower"] = 0.0

        # If Docenas/Columnas are TOP-2, expose options/selection and covered numbers (24 nums).
        if key in ("docenas", "columnas") and isinstance(pick, str) and " / " in pick:
            opts = [s.strip() for s in pick.split("/")][:2]
            if len(opts) == 2:
                advice[key]["options"] = opts
                advice[key]["selection"] = " / ".join(opts)
                # IDs numéricos para evaluación robusta (evita parseo frágil de strings)
                try:
                    if key == "docenas":
                        ids = [int(DOZEN_NAME_TO_IDX.get(opts[0], 0)), int(DOZEN_NAME_TO_IDX.get(opts[1], 0))]
                    else:
                        ids = [int(COLUMN_NAME_TO_IDX.get(opts[0], 0)), int(COLUMN_NAME_TO_IDX.get(opts[1], 0))]
                    ids = [i for i in ids if i in (1, 2, 3)]
                    if ids:
                        advice[key]["selection_ids"] = ids
                        advice[key]["pick_ids"] = ids  # alias
                except Exception:
                    pass
                if key == "docenas":
                    advice[key]["numbers"] = sorted(set(DOZENS.get(opts[0], []) + DOZENS.get(opts[1], [])))
                else:
                    advice[key]["numbers"] = sorted(set(COLUMNS.get(opts[0], []) + COLUMNS.get(opts[1], [])))

        # --- FASE 3: adjuntar condicionales P(E|H) y bloquear contradicciones ---
        try:
            dets = (coherence.get("details", {}) or {}) if isinstance(coherence, dict) else {}
            det = dets.get(key, {}) if isinstance(dets, dict) else {}
            if isinstance(det, dict):
                pgh = float(det.get("p_given_primary", 0.0) or 0.0)
                contr = bool(det.get("contradiction", False))
                cst = det.get("cond_status", None)

                advice[key]["p_given_H"] = pgh
                advice[key]["cond_status"] = cst
                advice[key]["contradiction"] = contr

                # Regla dura: contradicción => WAIT (prohibido sugerir)
                if contr and key not in ("max_conf",):
                    advice[key]["status"] = "WAIT"
                    advice[key]["reason"] = "Contradicción con la hipótesis principal (P(E∩H)=0)"
                else:
                    # gating suave por cond_status
                    if (cst == "WAIT") and key not in ("max_conf", "guardian_docena", "guardian_columna") and not (
                        key in ("docenas", "columnas") and isinstance(advice[key].get("pick"), str) and (" / " in advice[key].get("pick"))
                    ):
                        advice[key]["status"] = "WAIT"
                        advice[key]["reason"] = f"No consistente con H (P(E|H)={pgh:.3f})"
                    elif (cst == "PROBE") and key not in ("max_conf", "guardian_docena", "guardian_columna") and not (
                        key in ("docenas", "columnas") and isinstance(advice[key].get("pick"), str) and (" / " in advice[key].get("pick"))
                    ):
                        advice[key]["status"] = "PROBE"
                        advice[key]["reason"] = "Consistencia media con H (degradado a PROBE)"
        except Exception:
            pass

    return advice



# -----------------------------------------------------------------------------
# Decision layer (primary bet across ALL bet types)
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# MesaScore + Per-table profiles (user_id/table_id)
# -----------------------------------------------------------------------------

def _mesa_score_insufficient(n_total: int, window: int, min_spins: int, update_every: int, updated: bool = True) -> dict:
    # Keep the exact key set used by the historical INSUFFICIENT return (UI relies on this being compact).
    return {
"enabled": True,
"score": None,
"raw": None,
"score10": 1,
"trend": "FLAT",
"ui_color": "RED",
"label": "Buscando patrón… (recopilando datos)",
"iron_state": "DEAD",
"iron_text": "Buscando patrón…",
"iron_detail": "Recopilando datos",
"grade": "N/A",
"verdict": "INSUFFICIENT",
"n_total": int(n_total),
"window": int(window),
"min_spins": int(min_spins),
"update_every": int(update_every),
"updated": bool(updated),
"components": {"A": None, "B": None, "C": None, "D": None, "E": None},
"notes": [f"Insuficientes spins ({int(n_total)}/{int(min_spins)})."],
}


def _mesa_score_error(n_total: int, window: int, min_spins: int, update_every: int, exc: Exception = None, updated: bool = True) -> dict:
    # Keep the exact key set used by the historical mesa_score returns; UI expects stable keys.
    msg = "mesa_score_error"
    try:
        if exc is not None:
            msg = f"mesa_score_error: {type(exc).__name__}"
    except Exception:
        pass
    return {
        "enabled": True,
        "score": None,
        "grade": "N/A",
        "verdict": "ERROR",
        "n_total": int(n_total),
        "window": int(window),
        "min_spins": int(min_spins),
        "update_every": int(update_every),
        "updated": bool(updated),
        "components": {"A": None, "B": None, "C": None, "D": None, "E": None},
        "notes": [msg],
    }


def _table_alert_unknown(raw_action: str, mesa_score: dict, drift_state: dict, reasons: list = None) -> dict:
    mesa_score = mesa_score if isinstance(mesa_score, dict) else {}
    drift_state = drift_state if isinstance(drift_state, dict) else {}
    reasons = reasons if isinstance(reasons, list) else []
    return {
        "mode": "UNKNOWN",
        "grade": str(mesa_score.get("grade", "?") or "?"),
        "drift_status": str(drift_state.get("status", "normal") or "normal"),
        "drift_level": float(drift_state.get("level", 0.0) or 0.0),
        "switch_recommended": False,
        "recommended_action": str(raw_action or "OBSERVE").upper(),
        "message": " | ".join(reasons) if reasons else "OK",
        "reasons": reasons,
    }


def _ensure_table_alert(raw_action: str, mesa_score: dict, drift_state: dict, params: dict, table_alert: dict = None) -> dict:
    """Return a stable table_alert dict.
    - If a valid dict is provided, it is normalized and returned.
    - Otherwise, computes via _compute_table_gate().
    - Never raises; always returns a dict with standard keys.
    """
    mesa_score = mesa_score if isinstance(mesa_score, dict) else {}
    drift_state = drift_state if isinstance(drift_state, dict) else {}
    params = params if isinstance(params, dict) else {}

    # Prefer provided alert (normalize shape)
    try:
        if isinstance(table_alert, dict) and table_alert:
            ta = dict(table_alert)
            ta.setdefault("mode", "UNKNOWN")
            ta.setdefault("grade", str(mesa_score.get("grade", "?") or "?"))
            ta.setdefault("drift_status", str(drift_state.get("status", "normal") or "normal"))
            try:
                ta.setdefault("drift_level", float(drift_state.get("level", 0.0) or 0.0))
            except Exception:
                ta.setdefault("drift_level", 0.0)
            ta.setdefault("switch_recommended", bool(ta.get("switch_recommended", False)))
            ta.setdefault("recommended_action", str(raw_action or "OBSERVE").upper())
            ta.setdefault("message", ta.get("message") or "OK")
            if not isinstance(ta.get("reasons", None), list):
                ta["reasons"] = []
            return ta
    except Exception:
        pass

    # Compute (best-effort)
    try:
        _fa, ta = _compute_table_gate(raw_action, mesa_score, drift_state, params)
        if isinstance(ta, dict):
            return ta
    except Exception:
        pass

    return _table_alert_unknown(raw_action, mesa_score, drift_state, reasons=[])


def _mesa_switch_signal(mesa_score: dict) -> Tuple[bool, str]:
    """Derive a consistent 'switch table' signal from mesa_score.
    This centralizes string/flag heuristics to avoid duplicated gating logic.
    Returns (switch_recommended, mesa_recommendation_upper).
    """
    ms = mesa_score if isinstance(mesa_score, dict) else {}
    try:
        switch_rec = bool(ms.get("switch_recommended", False))
    except Exception:
        switch_rec = False
    try:
        mesa_rec = str(ms.get("recommendation", "") or ms.get("recommended_action", "") or "").upper()
    except Exception:
        mesa_rec = ""
    # Heuristic: if recommendation text explicitly suggests changing tables, treat as switch.
    if ("CAMBIAR" in mesa_rec) or ("CHANGE" in mesa_rec):
        switch_rec = True
    return switch_rec, mesa_rec

def _attach_mesa_alias(payload: dict, mesa_score: dict) -> None:
    """Ensure mesa_score and mesa are the same object reference in payload.
    Keeps app compatibility while preventing divergent aliasing across return paths.
    """
    if not isinstance(payload, dict):
        return
    ms = mesa_score if isinstance(mesa_score, dict) else {}
    payload["mesa_score"] = ms
    payload["mesa"] = ms

def _ensure_debug_gates(decision: dict) -> dict:
    """Return the decision['debug']['gates'] dict, creating containers if needed.
    This is intentionally defensive: it must never raise in production flow.
    """
    try:
        if not isinstance(decision, dict):
            return {}
        dbg = decision.get("debug")
        if not isinstance(dbg, dict):
            dbg = {}
            decision["debug"] = dbg
        gates = dbg.get("gates")
        if not isinstance(gates, dict):
            gates = {}
            dbg["gates"] = gates
        return gates
    except Exception:
        return {}

def _debug_gate_set(decision: dict, name: str, payload: dict) -> None:
    """Set a named gate payload under decision.debug.gates."""
    try:
        gates = _ensure_debug_gates(decision)
        if isinstance(gates, dict):
            gates[str(name)] = payload if isinstance(payload, dict) else {"value": payload}
    except Exception:
        pass

def _debug_gate_setdefault(decision: dict, name: str, default_payload: dict) -> None:
    """Set default gate payload if missing."""
    try:
        gates = _ensure_debug_gates(decision)
        if isinstance(gates, dict) and str(name) not in gates:
            gates[str(name)] = default_payload if isinstance(default_payload, dict) else {"value": default_payload}
    except Exception:
        pass

def _debug_gate_update(decision: dict, name: str, updates: dict) -> None:
    """Update an existing gate dict (or create it) with key/value pairs."""
    try:
        gates = _ensure_debug_gates(decision)
        if not isinstance(gates, dict):
            return
        k = str(name)
        cur = gates.get(k)
        if not isinstance(cur, dict):
            cur = {}
            gates[k] = cur
        if isinstance(updates, dict):
            cur.update(updates)
    except Exception:
        pass


def compute_mesa_score_simple(spins: list, p_fused=None, chaos: dict = None, params: dict = None, prev: dict = None) -> dict:
    """Simple, explainable MesaScore (0..100) for live table selection.
    Default: window=60, min=30, update_every=5, EMA(0.7 prev / 0.3 new).
    """
    params = params or {}
    chaos = chaos or {}
    prev = prev if isinstance(prev, dict) else None

    min_spins = int(params.get("mesa_score_min_spins", 15))
    window = int(params.get("mesa_score_window", 60))
    update_every = int(params.get("mesa_score_update_every", 1))
    ema_alpha = float(params.get("mesa_score_ema_alpha", 0.35))  # weight of new raw
    ema_alpha = max(0.05, min(0.80, ema_alpha))

    min_spins = max(10, min(500, min_spins))
    window = max(30, min(500, window))
    update_every = max(1, min(50, update_every))

    s = _clean_spins(spins or [])
    n_total = len(s)

    # Update gating: compute every spin for responsiveness; 'updated' tells UI if this was a full refresh tick.
    updated = True
    if (n_total % update_every) != 0:
        updated = False

    if n_total < min_spins:
        return _mesa_score_insufficient(n_total, window, min_spins, update_every, updated=bool(updated))

    w = s[-window:] if len(s) >= window else s
    n = len(w)
    if n < min_spins:
        return _mesa_score_insufficient(n_total, window, min_spins, update_every, updated=bool(updated))


    def is_high(x: int) -> int:
        if x <= 0 or x >= 37:
            return 0
        return 1 if 19 <= x <= 36 else 0

    docs = []
    cols = []
    highs = []
    doc_counts = [0, 0, 0]
    col_counts = [0, 0, 0]

    for x in w:
        d = docena_of(int(x)); c = columna_of(int(x)); h = is_high(int(x))
        docs.append(d); cols.append(c); highs.append(h)
        if 1 <= d <= 3: doc_counts[d-1] += 1
        if 1 <= c <= 3: col_counts[c-1] += 1

    def dist_to_uniform(counts: list, k: int) -> float:
        tot = float(sum(counts)) if sum(counts) > 0 else 1.0
        uni = 1.0 / float(k)
        p = [c/tot for c in counts]
        dist = sum(abs(pi - uni) for pi in p)          # 0..2*(1-1/k)
        max_dist = 2.0 * (1.0 - uni)
        return float(np.clip(dist / (max_dist + 1e-12), 0.0, 1.0))

    A = 0.5 * (dist_to_uniform(doc_counts, 3) + dist_to_uniform(col_counts, 3))

    def top1_block(ids: list, k: int) -> int:
        cc = [0]*k
        for v in ids:
            if 1 <= v <= k:
                cc[v-1] += 1
        return int(np.argmax(cc) + 1)

    def persistence(ids: list, k: int) -> float:
        if len(ids) < 30:
            return 0.0
        b = len(ids)//3
        blocks = [ids[:b], ids[b:2*b], ids[2*b:]]
        tops = [top1_block(bl, k) for bl in blocks if bl]
        if not tops: return 0.0
        return float(sum(1 for t in tops if t == tops[0]) / float(len(tops)))

    B = 0.5 * (persistence(docs, 3) + persistence(cols, 3))

    def change_rate(ids: list) -> float:
        if len(ids) <= 1:
            return 1.0
        ch = 0
        prevv = ids[0]
        for v in ids[1:]:
            if v != prevv:
                ch += 1
            prevv = v
        return float(ch) / float(len(ids)-1)

    cr = 0.5 * (change_rate(docs) + change_rate(cols))
    C = 1.0 - float(np.clip((cr - 0.55) / (0.83 - 0.55 + 1e-12), 0.0, 1.0))

    # Coherencia simple: high condicionado a docena dominante vs base
    tot_high = float(sum(highs)) / float(len(highs) + 1e-12)
    top_doc = int(np.argmax(doc_counts) + 1)
    idx = [i for i, d in enumerate(docs) if d == top_doc]
    if len(idx) >= 6:
        high_top = float(sum(highs[i] for i in idx)) / float(len(idx))
        coh = abs(high_top - tot_high)
    else:
        coh = 0.0
    D = float(np.clip(coh / 0.20, 0.0, 1.0))

    E = 0.0 if bool((chaos or {}).get("active", False)) else 1.0

    score_raw = 100.0 * (0.30*A + 0.20*B + 0.20*C + 0.20*D + 0.10*E)
    prev_score = None
    try:
        prev_score = float((prev or {}).get("score", score_raw))
    except Exception:
        prev_score = score_raw
    score = (1.0 - ema_alpha) * prev_score + ema_alpha * score_raw

    if score >= 70.0:
        verdict = "FAVORABLE"
        grade = "A"
    elif score >= 55.0:
        verdict = "NEUTRAL"
        grade = "B"
    elif score >= 45.0:
        verdict = "NEUTRAL"
        grade = "C"
    elif score >= 30.0:
        verdict = "NO_FAVORABLE"
        grade = "D"
    else:
        verdict = "NO_FAVORABLE"
        grade = "F"

    notes = []
    if bool((chaos or {}).get("active", False)):
        notes.append("Modo CAOS activo (penaliza).")
    if B < 0.34:
        notes.append("Persistencia baja (mesa inestable).")
    if A < 0.15:
        notes.append("Distribución cerca de uniforme (poca señal).")
    if C < 0.35:
        notes.append("Volatilidad alta (cambios fuertes).")


    # --- GodMode Mesa Radar (1..10) — independiente, eficiente, NO afecta BET/PROBE/WAIT ---
    # Implementa: Streams binarios + IPD (hurst-lite) + Energy Pulse (RSI-lite) + Tercios (entropía) + Cluster rueda EU.
    def _stream_color(arr):
        out = []
        for n0 in arr:
            n = int(n0)
            if n == 0:
                out.append(0)
            else:
                out.append(1 if n in RED_SET else -1)
        return out

    def _stream_parity(arr):
        out = []
        for n0 in arr:
            n = int(n0)
            if n == 0:
                out.append(0)
            else:
                out.append(1 if (n % 2 == 0) else -1)
        return out

    def _stream_range(arr):
        out = []
        for n0 in arr:
            n = int(n0)
            if n == 0:
                out.append(0)
            else:
                out.append(1 if (19 <= n <= 36) else -1)
        return out

    def _ipd(stream):
        # Índice de Persistencia Direccional: mide estructura (persistencia O alternancia), 0..1
        same = diff = 0
        prevv = None
        for v in stream:
            if v == 0:
                continue
            if prevv is None:
                prevv = v
                continue
            if v == prevv:
                same += 1
            else:
                diff += 1
            prevv = v
        tot = same + diff
        if tot <= 0:
            return 0.0
        # estructura = max(persistencia, alternancia)
        m = max(same / tot, diff / tot)
        # map: 0.50 (azar) -> 0, 0.80 -> 1
        return float(np.clip((m - 0.50) / (0.80 - 0.50 + 1e-12), 0.0, 1.0))

    def _energy(stream, wlen=10):
        # Saturación: |suma| / wlen, 0..1
        tail = stream[-wlen:] if len(stream) >= wlen else stream
        if not tail:
            return 0.0
        ssum = float(sum(tail))
        return float(np.clip(abs(ssum) / float(max(1, wlen)), 0.0, 1.0))

    def _entropy_stability(counts):
        # counts list -> estabilidad 0..1 (1 = concentrado/patronando)
        tot = float(sum(counts))
        if tot <= 0:
            return 0.0
        ps = [c / tot for c in counts]
        H = 0.0
        for p in ps:
            if p > 1e-12:
                H -= p * math.log(p)
        Hmax = math.log(len(counts))
        if Hmax <= 0:
            return 0.0
        Hrel = float(np.clip(H / Hmax, 0.0, 1.0))
        return 1.0 - Hrel

    def _wheel_cluster(arr):
        # Concentración circular en la rueda europea: 0..1
        idxs = []
        for n0 in arr:
            try:
                n = int(n0)
            except Exception:
                continue
            if n < 0 or n > 36:
                continue
            i = _EU_WHEEL_INDEX.get(n, None)
            if i is None:
                continue
            idxs.append(i)
        N = len(idxs)
        if N < 6:
            return 0.0
        ang = 2.0 * math.pi / 37.0
        c = 0.0
        s = 0.0
        for i in idxs:
            a = ang * float(i)
            c += math.cos(a)
            s += math.sin(a)
        R = math.sqrt(c*c + s*s) / float(N)
        return float(np.clip(R, 0.0, 1.0))

    def _pair_dominance(counts, k=3):
        # Detecta si las DOS categorías más frecuentes (de k=3) acumulan
        # juntas una proporción superior a lo esperado por azar.
        # 2 de 3 docenas/columnas al azar = 2/3 ≈ 0.667.
        # Umbral 0.70: si las 2 top cubren ≥70% → sesgo de PAR caliente.
        # Retorna 0..1 escalando 0.667→0  hasta  1.0→1.
        tot = float(sum(counts))
        if tot <= 0:
            return 0.0
        srt = sorted(counts, reverse=True)
        top2 = float(srt[0] + srt[1])
        frac = top2 / tot                       # 0.667 azar .. 1.0 total
        thr = 0.70                              # umbral de detección
        if frac < thr:
            return 0.0
        # map: 0.70 → 0,  1.00 → 1
        return float(np.clip((frac - thr) / (1.0 - thr + 1e-12), 0.0, 1.0))

    def _compute_radar_01(arr_nums):
        # Devuelve dict con componentes 0..1
        sc = _stream_color(arr_nums)
        sp = _stream_parity(arr_nums)
        sr = _stream_range(arr_nums)
        ipd = ( _ipd(sc) + _ipd(sp) + _ipd(sr) ) / 3.0
        en = ( _energy(sc) + _energy(sp) + _energy(sr) ) / 3.0

        # Tercios desde docenas/columnas de esta ventana
        dcnt = [0,0,0]
        ccnt = [0,0,0]
        for n0 in arr_nums:
            n = int(n0)
            d = docena_of(n)
            c = columna_of(n)
            if 1 <= d <= 3:
                dcnt[d-1] += 1
            if 1 <= c <= 3:
                ccnt[c-1] += 1
        thirds = 0.5 * (_entropy_stability(dcnt) + _entropy_stability(ccnt))

        # ★ PAIR DOMINANCE: detecta si DOS docenas o DOS columnas están
        # calientes juntas (la apuesta de cobertura D1+D3, C2+C3, etc).
        # Antes el radar solo reaccionaba a la docena/columna #1 dominante.
        pair_dom = 0.5 * (_pair_dominance(dcnt) + _pair_dominance(ccnt))

        wheel = _wheel_cluster(arr_nums)
        return {"ipd": float(ipd), "energy": float(en), "thirds": float(thirds),
                "wheel": float(wheel), "pair_dom": float(pair_dom)}

    # Triple ventana (corto/medio/largo) dentro del mismo window operativo
    w_short = int(params.get('mesa_score_w_short', 12))
    w_mid   = int(params.get('mesa_score_w_mid', 24))
    w_long  = int(params.get('mesa_score_w_long', max(30, window)))
    w_short = max(6, min(60, w_short))
    w_mid   = max(12, min(120, w_mid))
    w_long  = max(24, min(500, w_long))

    arr_short = w[-w_short:] if len(w) >= w_short else w
    arr_mid   = w[-w_mid:]   if len(w) >= w_mid else w
    arr_long  = w[-w_long:]  if len(w) >= w_long else w

    rS = _compute_radar_01(arr_short)
    rM = _compute_radar_01(arr_mid)
    rL = _compute_radar_01(arr_long)

    # Mezcla (clima + momentum)
    mix = {
        'ipd':   0.40*rS['ipd']   + 0.35*rM['ipd']   + 0.25*rL['ipd'],
        'thirds':0.45*rS['thirds']+0.35*rM['thirds']+ 0.20*rL['thirds'],
        'wheel': 0.35*rS['wheel'] +0.35*rM['wheel'] + 0.30*rL['wheel'],
        'energy':0.50*rS['energy']+0.30*rM['energy']+ 0.20*rL['energy'],
        # pair_dom: priorizar ventana corta/media — un par caliente es
        # señal de momento, no de clima de largo plazo.
        'pair_dom': 0.50*rS['pair_dom'] + 0.35*rM['pair_dom'] + 0.15*rL['pair_dom'],
    }

    # Score final 0..1. Pesos re-balanceados para dar 15% al pair_dom
    # (detección de dos docenas/columnas calientes), tomado de ipd y thirds.
    raw01 = (0.32*mix['ipd'] + 0.25*mix['thirds'] + 0.18*mix['wheel']
             + 0.10*mix['energy'] + 0.15*mix['pair_dom'])

    # Penalización suave por cero reciente (turbulencia)
    z_recent = 0
    for nn in w[-12:]:
        if int(nn) == 0:
            z_recent += 1
    if z_recent >= 2:
        raw01 *= 0.70
    elif z_recent == 1:
        raw01 *= 0.85

    score10_raw = int(round(1.0 + 9.0 * float(np.clip(raw01, 0.0, 1.0))))
    score10_raw = max(1, min(10, score10_raw))

    prev10 = None
    try:
        prev10 = int((prev or {}).get('score10', None)) if prev is not None else None
    except Exception:
        prev10 = None

    if prev10 is None:
        score10 = score10_raw
    else:
        # smoothing en escala 1..10
        sm = (1.0 - ema_alpha) * float(prev10) + ema_alpha * float(score10_raw)
        score10 = int(round(sm))
        score10 = max(1, min(10, score10))

    # Tendencia
    trend = 'FLAT'
    if prev10 is not None:
        if score10 > prev10:
            trend = 'UP'
        elif score10 < prev10:
            trend = 'DOWN'

    # Color UI
    ui_color = 'RED'
    if score10 >= 4:
        ui_color = 'YELLOW'
    if score10 >= 7:
        ui_color = 'GREEN'
    if score10 >= 9:
        ui_color = 'GOLD'

    # Alertas claras (pueden ser múltiples): qué está patronando ahora mismo (SIN afectar apuestas)
    def _clamp(x, a, b):
        return a if x < a else (b if x > b else x)

    _TXT = {"RED":"ROJO","BLACK":"NEGRO","EVEN":"PARES","ODD":"IMPARES","LOW":"BAJO","HIGH":"ALTO","ZERO":"0"}
    def _t(x: str) -> str:
        try:
            return _TXT.get(str(x), str(x))
        except Exception:
            return str(x)

    def _dom_strength(dom: float, base: float, top: float = 0.90) -> int:
        # Devuelve 0 si no hay dominancia útil; si hay, escala a 6..10 (porque desde 6 ya es "SEÑAL FUERTE")
        if dom is None:
            return 0
        if dom < base:
            return 0
        t = (dom - base) / max(1e-9, (top - base))
        return int(_clamp(6 + round(4 * t), 6, 10))

    def _alt_strength(rate: float, base: float = 0.80, top: float = 0.95) -> int:
        # Alternancia fuerte (ping-pong). Escala a 6..10
        if rate is None:
            return 0
        if rate < base:
            return 0
        t = (rate - base) / max(1e-9, (top - base))
        return int(_clamp(6 + round(4 * t), 6, 10))

    def _dom_label_binary(name: str, a: str, b: str, cnt_a: int, cnt_b: int, total: int, dom: float) -> str:
        if total <= 0:
            return f"{name}: —"
        pick = a if cnt_a >= cnt_b else b
        pct = int(round(100.0 * dom))
        return f"{name} patronando: {_t(pick)} ({cnt_a if pick==a else cnt_b}/{total} · {pct}%)"

    def _alt_label_binary(name: str, a: str, b: str, total_trans: int, alt_rate: float) -> str:
        pct = int(round(100.0 * alt_rate))
        return f"{name} alternando: {_t(a)}/{_t(b)} ({pct}%)"

    def _analyze_binary_stream(arr_nums, map_fn, a_label: str, b_label: str, name: str, dom_base: float = 0.65):
        seq = []
        for n0 in arr_nums:
            n = int(n0)
            v = map_fn(n)
            if v is None:
                continue
            if v == "ZERO":
                continue
            seq.append(v)
        if len(seq) < 6:
            return None

        cnt_a = sum(1 for x in seq if x == a_label)
        cnt_b = sum(1 for x in seq if x == b_label)
        total = cnt_a + cnt_b
        if total <= 0:
            return None

        dom = max(cnt_a, cnt_b) / float(total)

        # Alternancia: % de transiciones que cambian
        trans = max(0, len(seq) - 1)
        changes = 0
        for i in range(1, len(seq)):
            if seq[i] != seq[i-1]:
                changes += 1
        alt_rate = (changes / float(trans)) if trans > 0 else 0.0

        # Crea hasta 2 alertas: dominancia y alternancia (escoge la más fuerte si ambas pasan umbral)
        alerts_local = []

        s_dom = _dom_strength(dom, dom_base, 0.90)
        if s_dom >= 6:
            title = _dom_label_binary(name, a_label, b_label, cnt_a, cnt_b, total, dom)
            alerts_local.append({"key": name.lower(), "kind": "dominancia", "strength": int(s_dom), "title": title})

        s_alt = _alt_strength(alt_rate, 0.80, 0.95)
        if s_alt >= 6:
            title = _alt_label_binary(name, a_label, b_label, trans, alt_rate)
            alerts_local.append({"key": name.lower(), "kind": "alternancia", "strength": int(s_alt), "title": title})

        if not alerts_local:
            return None
        # si hay 2, queda la más fuerte primero
        alerts_local.sort(key=lambda d: d.get("strength", 0), reverse=True)
        return alerts_local

    def _analyze_thirds(arr_nums, map_fn, name: str, base: float = 0.50):
        # Docenas / Columnas: 3 categorías; dominancia > base ya es señal
        vals = []
        for n0 in arr_nums:
            n = int(n0)
            v = map_fn(n)
            if not isinstance(v, int) or v <= 0:
                continue
            vals.append(v)
        if len(vals) < 9:
            return None

        counts = [0, 0, 0]
        for v in vals:
            if 1 <= v <= 3:
                counts[v-1] += 1
        total = sum(counts)
        if total <= 0:
            return None
        best_i = int(max(range(3), key=lambda i: counts[i]))
        dom = counts[best_i] / float(total)

        s = _dom_strength(dom, base, 0.72)
        if s < 6:
            return None
        pick = best_i + 1
        pct = int(round(100.0 * dom))
        title = f"{name} patronando: {pick} ({counts[best_i]}/{total} · {pct}%)"
        return [{"key": name.lower(), "kind": "dominancia", "strength": int(s), "title": title,
                 "counts": counts}]

    # Generar alertas desde ventanas corta/medio (rápido y legible)
    alerts = []
    # Binarios (corto)
    a = _analyze_binary_stream(arr_short, color_of, "RED", "BLACK", "Color", dom_base=0.65)
    if a: alerts.extend(a[:1])  # máx 1 (dom o alt) para no duplicar
    a = _analyze_binary_stream(arr_short, parity_of, "EVEN", "ODD", "Paridad", dom_base=0.65)
    if a: alerts.extend(a[:1])
    a = _analyze_binary_stream(arr_short, range_of, "LOW", "HIGH", "Rango", dom_base=0.65)
    if a: alerts.extend(a[:1])

    # Tercios (medio)
    a = _analyze_thirds(arr_mid, docena_of, "Docena", base=0.50)
    if a: alerts.extend(a[:1])
    a = _analyze_thirds(arr_mid, columna_of, "Columna", base=0.50)
    if a: alerts.extend(a[:1])

    # Rueda (cluster) (corto+medio mezclado)
    wheel_now = float(_wheel_cluster(arr_short))
    if wheel_now >= 0.60:
        # escala 6..10
        s = int(_clamp(6 + round(4 * (wheel_now - 0.60) / max(1e-9, (0.90 - 0.60))), 6, 10))
        alerts.append({"key": "wheel", "kind": "cluster", "strength": int(s),
                       "title": "Rueda patronando: MISMA ZONA (vecinos/sector)"})

    # Ordena y recorta (pueden patronar varias a la vez)
    _prio = {
        'docena': 0,
        'columna': 0,
        'wheel': 1,
        'color': 2,
        'paridad': 3,
        'rango': 4,
    }
    def _alert_sort_key(d):
        try:
            k = str(d.get('key','') or '').lower()
            s = int(d.get('strength', 0) or 0)
        except Exception:
            k, s = '', 0
        p = _prio.get(k, 9)
        t = str(d.get('title','') or '')
        return (-s, p, t)

    alerts.sort(key=_alert_sort_key)
    alerts = alerts[:5]

    top_alert = alerts[0] if alerts else None

    # Radar score10 debe reflejar la señal más fuerte detectada (TOP).
    try:
        if isinstance(top_alert, dict):
            ts = int(top_alert.get('strength', 0) or 0)
            if ts > 0:
                score10 = max(int(score10), ts)
    except Exception:
        pass


    # UI color (más directo): desde 6 ya es verde
    ui_color = 'RED'
    if score10 >= 4:
        ui_color = 'YELLOW'
    if score10 >= 6:
        ui_color = 'GREEN'
    if score10 >= 9:
        ui_color = 'GOLD'

    # Estado IronMan (solo UI/radar; no afecta apuestas)
    if score10 <= 3:
        iron_state = "DEAD"
        iron_text = "BUSCANDO PATRÓN"
    elif score10 <= 5:
        iron_state = "WAKING"
        iron_text = "SEÑAL"
    elif score10 <= 8:
        iron_state = "STRONG"
        iron_text = "SEÑAL FUERTE"
    else:
        iron_state = "PEAK"
        iron_text = "PICO"

    # Label principal: top 2 alertas (si no hay, mensaje neutro)
    if alerts:
        label = " · ".join([a.get("title","") for a in alerts[:2] if a.get("title")])
    else:
        label = "Buscando patrón… (sin señales claras)"

    if z_recent:
        label += " · 0 reciente"

    iron_detail = label

    return {
        "enabled": True,
        "score": float(np.clip(score, 0.0, 100.0)),
        "raw": float(np.clip(score_raw, 0.0, 100.0)),
        "score10": int(score10),
        "trend": str(trend),
        "ui_color": str(ui_color),
        "label": str(label),
        "alerts": alerts,
        "top": top_alert,
        "top_title": (top_alert.get("title") if isinstance(top_alert, dict) else None),
        "top_strength": (top_alert.get("strength") if isinstance(top_alert, dict) else None),
        "iron_state": str(iron_state),
        "iron_text": str(iron_text),
        "iron_detail": str(iron_detail),
        "grade": grade,
        "verdict": verdict,
        "n_total": int(n_total),
        "window": int(window),
        "min_spins": int(min_spins),
        "update_every": int(update_every),
        "updated": bool(updated),
        "components": {"A": float(A), "B": float(B), "C": float(C), "D": float(D), "E": float(E)},
        "doc_counts": {"D1": int(doc_counts[0]), "D2": int(doc_counts[1]), "D3": int(doc_counts[2])},
        "col_counts": {"C1": int(col_counts[0]), "C2": int(col_counts[1]), "C3": int(col_counts[2])},
        "notes": notes,
    }

def _safe_id(x: str) -> str:
    s = str(x or "").strip()
    if not s:
        return "default"
    s = re.sub(r"[^a-zA-Z0-9._-]+", "_", s)
    return s[:64]

def _mesa_profiles_dir() -> str:
    model_dir = _cfg("MODEL_DIR", ".")
    d = os.path.join(model_dir, "mesa_profiles")
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass
    return d

def _mesa_profile_path(user_id: str, table_id: str) -> str:
    return os.path.join(_mesa_profiles_dir(), f"mesa_profile__{_safe_id(user_id)}__{_safe_id(table_id)}.json")

def update_mesa_profile(user_id: str, table_id: str, mesa_score: dict, params: dict = None) -> dict:
    params = params or {}
    uid = _safe_id(user_id)
    tid = _safe_id(table_id)
    path = _mesa_profile_path(uid, tid)

    min_score = float(params.get("mesa_switch_min_score", 45.0))
    need_low = int(params.get("mesa_switch_consec_updates", 3))
    drop_trigger = float(params.get("mesa_switch_drop", 15.0))
    max_hist = int(params.get("mesa_profile_max_hist", 200))
    max_hist = max(50, min(2000, max_hist))

    profile = {"user_id": uid, "table_id": tid, "history": [], "low_streak": 0, "last_score": None, "last_update": None}
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                profile.update(loaded)
    except Exception:
        pass

    score = None
    try:
        score = mesa_score.get("score", None) if isinstance(mesa_score, dict) else None
        score = None if score is None else float(score)
    except Exception:
        score = None

    prev_score = None
    try:
        prev_score = profile.get("last_score", None)
        prev_score = None if prev_score is None else float(prev_score)
    except Exception:
        prev_score = None


    # Avoid redundant disk writes when MesaScore decided not to update this tick.
    # compute_mesa_score_simple marks out['updated']=False when (n_total % update_every) != 0.
    # In that case, return the last persisted profile as-is (no history/low_streak increment).
    try:
        ms_updated = bool(mesa_score.get('updated', True)) if isinstance(mesa_score, dict) else True
    except Exception:
        ms_updated = True
    if not ms_updated:
        # Ensure expected keys exist for UI/debug merge.
        if 'switch_recommended' not in profile:
            profile['switch_recommended'] = False
        if 'switch_reasons' not in profile:
            profile['switch_reasons'] = []
        return profile

    now = time.time()
    if score is not None:
        if score < min_score:
            profile["low_streak"] = int(profile.get("low_streak", 0) or 0) + 1
        else:
            profile["low_streak"] = 0

        entry = {
            "t": now,
            "score": score,
            "grade": mesa_score.get("grade", "N/A"),
            "verdict": mesa_score.get("verdict", "N/A"),
            "components": mesa_score.get("components", {}),
        }
        hist = profile.get("history", [])
        if not isinstance(hist, list):
            hist = []
        hist.append(entry)
        if len(hist) > max_hist:
            hist = hist[-max_hist:]
        profile["history"] = hist
        profile["last_score"] = score
        profile["last_update"] = now

    drop = None
    if prev_score is not None and score is not None:
        drop = float(prev_score - score)

    switch_recommended = False
    switch_reasons = []
    if score is not None and score < min_score and int(profile.get("low_streak", 0) or 0) >= need_low:
        switch_recommended = True
        switch_reasons.append(f"Score bajo por {int(profile.get('low_streak',0))} updates (<{min_score:.0f}).")
    if drop is not None and drop >= drop_trigger:
        switch_recommended = True
        switch_reasons.append(f"Caída brusca de score ({drop:.1f} ≥ {drop_trigger:.0f}).")
    if bool((mesa_score or {}).get("components", {}).get("E", 1.0) == 0.0):
        switch_reasons.append("Penalización por CAOS (E=0).")

    try:
        _atomic_json_write(path, profile)
    except Exception:
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(profile, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    hist = profile.get("history", []) if isinstance(profile.get("history", None), list) else []
    avg10 = None
    try:
        last10 = [float(h.get("score")) for h in hist[-10:] if h.get("score") is not None]
        if last10:
            avg10 = float(sum(last10)/len(last10))
    except Exception:
        avg10 = None

    return {
        "user_id": uid,
        "table_id": tid,
        "avg10": avg10,
        "low_streak": int(profile.get("low_streak", 0) or 0),
        "switch_recommended": bool(switch_recommended),
        "switch_reasons": switch_reasons,
        "profile_path": path,
    }


# ---------------------------------------------------
# --- Risk Control Core: circuit breaker anti-rachas (BET-only)
# ---------------------------------------------------

class RiskControlCore:
    """
    BET-only circuit breaker to minimize consecutive losses.

    - Tracks per-key consecutive BET losses and cooldown windows.
    - Session-aware: if session_id changes OR spins length rolls back, the circuit is reset.
      This avoids "cooldowns carrying over forever" across independent sessions/tests.
    - Engine-owned persistence: stored as JSON (atomic write).
    """

    def __init__(
        self,
        state_path: str,
        keys: Optional[list[str]] = None,
        persist: bool = True,
        save_every: int = 1,
    ):
        self.state_path = str(state_path)
        self.persist = bool(persist)
        self.save_every = max(1, int(save_every or 1))

        self.keys = list(keys or [
            "primary",
            "docenas",
            "columnas",
            "color",
            "paridad",
            "rango",
            "max_conf",
            "guardian_docena",
        ])

        # Session scoping
        self.session_id: Optional[str] = None
        self.last_spins_len: int = 0

        # Internal time (spins observed)
        self.t: int = 0

        # Circuit state
        self.consec_losses: dict[str, int] = {k: 0 for k in self.keys}
        self.cooldowns: dict[str, int] = {k: 0 for k in self.keys}

        self._lock = threading.Lock()
        self._dirty_steps = 0

        if self.persist:
            self._load_state()

    # -------------------------
    # Persistence
    # -------------------------
    def _state_payload(self) -> dict:
        return {
            "t": int(self.t),
            "session_id": self.session_id,
            "last_spins_len": int(self.last_spins_len),
            "consec_losses": {k: int(v) for k, v in (self.consec_losses or {}).items()},
            "cooldowns": {k: int(v) for k, v in (self.cooldowns or {}).items()},
            "engine_risk_version": 2,
        }

    def _save_state(self, force: bool = False) -> None:
        if not self.persist or not self.state_path:
            return
        self._dirty_steps += 1
        if (not force) and (self._dirty_steps % self.save_every != 0):
            return
        try:
            os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
            _atomic_json_write(self.state_path, self._state_payload())
        except Exception:
            logger.debug("RiskControlCore._save_state failed", exc_info=True)

    def _load_state(self) -> None:
        if not self.persist or not self.state_path:
            return
        try:
            if not os.path.exists(self.state_path):
                return
            with open(self.state_path, "r", encoding="utf-8") as fh:
                data = json.load(fh) or {}
            self.t = int(data.get("t", 0) or 0)
            self.session_id = data.get("session_id", None)
            if self.session_id is not None:
                self.session_id = str(self.session_id)
            self.last_spins_len = int(data.get("last_spins_len", 0) or 0)

            cl = data.get("consec_losses", {}) or {}
            cd = data.get("cooldowns", {}) or {}
            for k in self.keys:
                if k in cl:
                    self.consec_losses[k] = int(cl.get(k, 0) or 0)
                if k in cd:
                    self.cooldowns[k] = int(cd.get(k, 0) or 0)
        except Exception:
            logger.debug("RiskControlCore._load_state failed", exc_info=True)

    # -------------------------
    # Session handling
    # -------------------------
    def _maybe_reset_session(self, session_id: Any = None, spins_len: Any = None) -> None:
        """
        Reset the circuit when:
          - session_id changes, or
          - spins_len rolls back (new session/reset in UI), or
          - spins_len is 0 after having been >0.
        """
        sid = None
        if session_id is not None:
            try:
                sid = str(session_id)
            except Exception:
                sid = None

        sl = None
        if spins_len is not None:
            try:
                sl = int(spins_len)
            except Exception:
                sl = None

        need_reset = False
        reason = None

        if sid is not None and self.session_id is not None and sid != self.session_id:
            need_reset = True
            reason = "session_changed"

        if sl is not None:
            if sl < int(self.last_spins_len or 0):
                need_reset = True
                reason = reason or "spins_rollback"
            if sl == 0 and int(self.last_spins_len or 0) > 0:
                need_reset = True
                reason = reason or "spins_reset"

        # Update trackers even when not resetting
        if sid is not None:
            self.session_id = sid
        if sl is not None:
            self.last_spins_len = sl

        if need_reset:
            self.t = 0
            self.consec_losses = {k: 0 for k in self.keys}
            self.cooldowns = {k: 0 for k in self.keys}
            self._save_state(force=True)
            try:
                logger.info(f"🧯 Risk circuit reset ({reason}) | session_id={self.session_id} spins_len={self.last_spins_len}")
            except Exception:
                pass

    # -------------------------
    # Public API used by engine
    # -------------------------
    def cooldown_keys(self, params: Optional[dict] = None, spins_len: Optional[int] = None) -> list[str]:
        # Sync session BEFORE exposing cooldowns (important for new sessions).
        try:
            if isinstance(params, dict):
                self._maybe_reset_session(
                    session_id=params.get("session_id", None),
                    spins_len=(spins_len if spins_len is not None else params.get("spins_len", params.get("snapshot_spins_count", None))),
                )
            elif spins_len is not None:
                self._maybe_reset_session(session_id=None, spins_len=spins_len)
        except Exception:
            pass

        with self._lock:
            return [k for k in self.keys if int(self.cooldowns.get(k, 0) or 0) > 0]

    def cooldown_remaining(self, key: str) -> int:
        with self._lock:
            return int(self.cooldowns.get(str(key), 0) or 0)

    def summary(self, params: Optional[dict] = None, spins_len: Optional[int] = None) -> dict:
        # Keep session in sync as well.
        try:
            if isinstance(params, dict):
                self._maybe_reset_session(
                    session_id=params.get("session_id", None),
                    spins_len=(spins_len if spins_len is not None else params.get("spins_len", params.get("snapshot_spins_count", None))),
                )
            elif spins_len is not None:
                self._maybe_reset_session(session_id=None, spins_len=spins_len)
        except Exception:
            pass

        with self._lock:
            return {
                "t": int(self.t),
                "session_id": self.session_id,
                "last_spins_len": int(self.last_spins_len),
                "consec_losses": {k: int(self.consec_losses.get(k, 0) or 0) for k in self.keys},
                "cooldowns": {k: int(self.cooldowns.get(k, 0) or 0) for k in self.keys},
                "cooldown_keys": [k for k in self.keys if int(self.cooldowns.get(k, 0) or 0) > 0],
            }

    def _status_for_key(self, decision: dict, key: str) -> str:
        """Return execution status for a bet-key.
        Important: PRIMARY must use a primary-specific status (primary_status),
        NOT decision['final_action'] (which is a global/table-level action).
        """
        if not isinstance(decision, dict):
            return ""
        if key == "primary":
            # Prefer explicit primary status if present.
            st = decision.get("primary_status")
            if not st and isinstance(decision.get("primary"), dict):
                st = decision["primary"].get("status") or decision["primary"].get("action")
            if not st and isinstance(decision.get("primary_bet"), dict):
                st = decision["primary_bet"].get("status") or decision["primary_bet"].get("action")
            # Fallback only if nothing else exists.
            if not st:
                st = decision.get("final_action") or decision.get("action")
            return str(st or "").upper().strip()
        ad = decision.get("bet_advice", {})
        entry = ad.get(key, {}) if isinstance(ad, dict) else {}
        return str(entry.get("status", entry.get("action", "")) or "").upper().strip()
    def observe(self, decision: dict, results: dict, params: Optional[dict] = None) -> None:
        """
        Update circuit breaker AFTER a spin is evaluated.

        We only learn from real BET actions (aligned with execution reality):
          - If risk_bet_only=True: only update when status == BET.
          - If risk_bet_only=False: would include PROBE, but default is True.

        When consecutive BET losses hit threshold, key enters cooldown for N spins.
        """
        params = params or {}
        bet_only = bool(params.get("risk_bet_only", True))

        max_losses = params.get("risk_max_consec_bet_losses", params.get("risk_max_losses", 3))
        cooldown_spins = params.get("risk_cooldown_spins", params.get("risk_cooldown", 3))

        try:
            max_losses = int(max_losses)
        except Exception:
            max_losses = 3
        try:
            cooldown_spins = int(cooldown_spins)
        except Exception:
            cooldown_spins = 3

        max_losses = max(1, min(20, max_losses))
        cooldown_spins = max(0, min(50, cooldown_spins))

        # Session sync (use spins_len if provided)
        spins_len = params.get("spins_len", params.get("snapshot_spins_count", None))
        with self._lock:
            self._maybe_reset_session(session_id=params.get("session_id", None), spins_len=spins_len)

            # Tick time and decay cooldowns
            self.t += 1
            for k in self.keys:
                cd = int(self.cooldowns.get(k, 0) or 0)
                if cd > 0:
                    self.cooldowns[k] = max(0, cd - 1)

            # Update streaks
            if not isinstance(decision, dict) or not isinstance(results, dict):
                self._save_state(force=False)
                return

            for k in self.keys:
                status = self._status_for_key(decision, k)
                if bet_only and status not in ("BET", "EXPLOIT", "STRONG"):
                    continue

                hit = results.get(k, None)
                if hit is None or not isinstance(hit, bool):
                    continue

                if hit:
                    self.consec_losses[k] = 0
                else:
                    self.consec_losses[k] = int(self.consec_losses.get(k, 0) or 0) + 1
                    if self.consec_losses[k] >= max_losses:
                        self.cooldowns[k] = max(int(self.cooldowns.get(k, 0) or 0), cooldown_spins)
                        self.consec_losses[k] = 0

            self._save_state(force=False)


# Module-level singleton (persistent)
_model_dir_for_risk = _cfg("MODEL_DIR", ".")
_risk_state_path = os.path.join(_model_dir_for_risk, "risk_state.json")
_RISK_CORE = RiskControlCore(state_path=_risk_state_path, persist=True)

# ----------------------------------------------------------------------------
# Mesa gate (extracted from get_decision for maintainability / single source)
# ----------------------------------------------------------------------------
def _compute_table_gate(raw_action: str, mesa_score: dict, drift_state: dict, params: dict) -> Tuple[str, dict]:
    """Compute final action gating based on MesaScore + Drift.
    Returns (final_action, table_alert).
    """
    raw = str(raw_action or "OBSERVE").upper()
    mesa_score = mesa_score if isinstance(mesa_score, dict) else {}
    drift_state = drift_state if isinstance(drift_state, dict) else {}

    grade = str(mesa_score.get("grade", "") or "").upper().strip() or "?"
    switch_rec, mesa_rec = _mesa_switch_signal(mesa_score)

    d_status = str(drift_state.get("status", "normal") or "normal").lower()
    d_level = float(drift_state.get("level", 0.0) or 0.0)

    warn_th = float(params.get("drift_warn_th", drift_state.get("thresholds", {}).get("warn", 0.25) if isinstance(drift_state.get("thresholds", {}), dict) else 0.25))
    crit_th = float(params.get("drift_critical_th", drift_state.get("thresholds", {}).get("critical", 0.45) if isinstance(drift_state.get("thresholds", {}), dict) else 0.45))

    reasons: List[str] = []
    mode = "NORMAL"

    # Drift contribution
    if d_status == "critical" or d_level >= crit_th:
        mode = "CHAOS"
        reasons.append(f"drift=critical ({d_level:.3f}>=crit {crit_th:.2f})")
    elif d_status == "warning" or d_level >= warn_th:
        mode = "WARNING"
        reasons.append(f"drift=warning ({d_level:.3f}>=warn {warn_th:.2f})")


    # ZMAX bias (|z|max) contribution: operational signal (WARNING/CHAOS)
    try:
        zmax = float(drift_state.get("zmax", 0.0) or 0.0)
    except Exception:
        zmax = 0.0
    try:
        z_warn = float(params.get("z_warn", params.get("zmax_warn", 3.0)))
    except Exception:
        z_warn = 3.0
    try:
        z_critical = float(params.get("z_critical", params.get("zmax_critical", 4.0)))
    except Exception:
        z_critical = 4.0
    try:
        z_k = int(params.get("z_critical_k", params.get("zmax_critical_k", 3)))
    except Exception:
        z_k = 3
    try:
        z_streak = int(drift_state.get("zmax_crit_streak", 0) or 0)
    except Exception:
        z_streak = 0

    if zmax >= z_critical:
        if z_streak >= max(1, z_k):
            mode = "CHAOS"
            reasons.append(f"zmax_critical_streak (|z|max={zmax:.2f}>={z_critical:.2f} x{z_streak}/{z_k})")
        else:
            if mode != "CHAOS":
                mode = "WARNING"
            reasons.append(f"zmax_critical (|z|max={zmax:.2f}>={z_critical:.2f})")
    elif zmax >= z_warn:
        if mode != "CHAOS":
            mode = "WARNING"
        reasons.append(f"zmax_bias (|z|max={zmax:.2f}>={z_warn:.2f})")

    # MesaScore contribution
    if grade in ("F",):
        mode = "CHAOS"
        reasons.append("mesa_grade=F")
    elif grade in ("D", "E"):
        if mode != "CHAOS":
            mode = "WARNING"
        reasons.append(f"mesa_grade={grade}")

    if switch_rec:
        if mode != "CHAOS":
            mode = "WARNING"
        reasons.append("switch_recommended")

    # Decide final action
    final = raw
    if mode == "CHAOS":
        final = "OBSERVE"   # UI maps to WAIT
    elif mode == "WARNING":
        if raw in ("EXPLOIT", "BET", "STRONG"):
            final = "PROBE"

    # Additional: if mesa explicitly recommends change & mesa is bad, force WAIT
    if switch_rec and grade in ("D", "E", "F") and raw in ("EXPLOIT", "PROBE"):
        final = "OBSERVE"

    # For table-level UI, surface a conservative recommendation
    rec_action = final
    if mode == "WARNING":
        rec_action = "PROBE"
    elif mode == "CHAOS":
        rec_action = "WAIT"
    if switch_rec:
        rec_action = "CHANGE_TABLE"

    alert = {
        "mode": mode,
        "grade": grade,
        "drift_status": d_status,
        "drift_level": float(d_level),
        "switch_recommended": bool(switch_rec),
        "recommended_action": rec_action,
        "message": " | ".join(reasons) if reasons else "OK",
        "reasons": reasons,
    }
    return final, alert

def get_decision(analysis: dict, cfl_metrics: dict, spins: List[int], params: dict, consec_losses: int, pause_until: int, last_suggestion: Optional[Dict[str, Any]] = None, **kwargs) -> Tuple[dict, dict]:
    """
    Returns (decision, pause_update).

    FIXES CLAVE (versión 2):
    - SIEMPRE empaca suggestion_analysis + guardian_docena (también en root) + alias analysis.
    - NO sobreescribe conf_score "inteligente" (entropía + edge). Antes se volvía sobreconfiado.
    """
    # numpy-safe: avoid bool(ndarray) via 'spins or []'
    try:
        spins_list = list(spins) if spins is not None else []
    except Exception:
        spins_list = []
    spins = spins_list
    now_idx = len(spins_list)
    pause_update = {"pause_until_spin": int(pause_until), "resync_needed": False}

    # table_alert dict used by UI; ensure it is always defined (Pylance)
    ta = None

    if params is None:
        params = {}

    def _deep_jsonable(obj):
        """Convert numpy arrays/scalars nested in dict/list to pure python types."""
        try:
            import numpy as _np
            if isinstance(obj, _np.ndarray):
                return obj.tolist()
            if isinstance(obj, _np.generic):
                return obj.item()
        except Exception:
            pass
        if isinstance(obj, dict):
            return {str(k): _deep_jsonable(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_deep_jsonable(v) for v in obj]
        return obj


    # Safe copy of params for UI/export; we enrich it later (cuts, thresholds, etc.)
    params_out = dict(params) if isinstance(params, dict) else {}

    if analysis is None:
        analysis = {}
    if cfl_metrics is None:
        cfl_metrics = {}

    EPS_LOCAL = 1e-12

    def _baseline_for(bet_key: str, selection_size: int = 1) -> float:
        if bet_key == "max_conf":
            return float(selection_size) / 37.0
        if bet_key in ("docenas", "columnas"):
            return 12.0 / 37.0
        if bet_key in ("color", "paridad", "rango"):
            return 18.0 / 37.0
        return 1.0 / 37.0

    def _edge_thresholds_for(bet_key: str) -> Tuple[float, float]:
        return _edge_thresholds_for_shared(bet_key, params)

    def _conf_edge(edge: float, exploit_edge: float) -> float:
        try:
            if exploit_edge <= EPS_LOCAL:
                return 0.0
            return float(np.clip(edge / exploit_edge, 0.0, 1.0))
        except Exception:
            return 0.0

    # Asegurar baseline/edge mínimos si faltan, SIN tocar conf_score existente
    def _ensure_fields(analysis: dict):
        for k in ("color", "paridad", "rango", "docenas", "columnas"):
            if k not in analysis or not isinstance(analysis.get(k), dict):
                analysis[k] = {}
            cat = analysis[k]
            try:
                p = float(cat.get("top_probability", 0.0) or 0.0)
            except Exception:
                p = 0.0
            base = float(cat.get("baseline_p", _baseline_for(k)) or _baseline_for(k))
            edge = float(cat.get("edge", p - base) or (p - base))
            cat["baseline_p"] = base
            cat["top_probability"] = float(cat.get("top_probability", p) or p)
            cat["edge"] = edge
            cat["confidence_pct"] = round(float(cat.get("conf_score", 0.0)) * 100.0, 1)

        if "max_conf" not in analysis or not isinstance(analysis.get("max_conf"), dict):
            analysis["max_conf"] = {}
        mc = analysis["max_conf"]
        sel = mc.get("selection", []) or []
        k_sel = len(sel) if isinstance(sel, (list, tuple, np.ndarray)) else 0
        try:
            p = float(mc.get("p_win", mc.get("top_probability", 0.0)) or 0.0)
        except Exception:
            p = 0.0
        base = float(mc.get("baseline_p", _baseline_for("max_conf", k_sel if k_sel else 1)) or _baseline_for("max_conf", k_sel if k_sel else 1))
        edge = float(mc.get("edge", p - base) or (p - base))
        mc["p_win"] = p
        mc["baseline_p"] = base
        mc["edge"] = edge
        mc["confidence_pct"] = round(float(mc.get("conf_score", 0.0)) * 100.0, 1)

    if isinstance(analysis, dict):
        _ensure_fields(analysis)

    # --- Risk (BET-only): cooldown categories after consecutive BET losses ---
    try:
        if "_RISK_CORE" in globals() and isinstance(analysis, dict):
            analysis["_risk_disabled_keys"] = list(_RISK_CORE.cooldown_keys(params=params, spins_len=len(spins)))
    except Exception:
        pass

    primary = _select_primary_bet(analysis, params)

    primary_bet = {
        "bet_key": primary.get("bet_key"),
        "label": primary.get("label"),
        "type": primary.get("type"),
        "pick": primary.get("pick", primary.get("group", primary.get("selection"))),
        "numbers": primary.get("numbers", []),
        "options": primary.get("options", []),
        "p": float(primary.get("p", 0.0)),
        "baseline_p": float(primary.get("baseline_p", 0.0)),
        "edge": float(primary.get("edge", 0.0)),
        "ev": float(primary.get("ev", 0.0)),
        "entropy": float(primary.get("entropy", 0.0)),
        "conf_score": float(primary.get("conf_score", 0.0)),
        "confidence_pct": float(primary.get("confidence_pct", round(float(primary.get("conf_score", 0.0)) * 100.0, 1))),
    }

    pk = primary_bet.get("bet_key") or "max_conf"
    if primary_bet.get("baseline_p", 0.0) <= 0:
        if pk == "max_conf":
            sel = primary_bet.get("numbers", []) or []
            primary_bet["baseline_p"] = _baseline_for("max_conf", len(sel) if isinstance(sel, list) else 1)
        else:
            primary_bet["baseline_p"] = _baseline_for(pk)

    if abs(float(primary_bet.get("edge", 0.0))) < 1e-12:
        primary_bet["edge"] = float(primary_bet.get("p", 0.0)) - float(primary_bet["baseline_p"])

    exploit_edge, probe_edge = _edge_thresholds_for(pk)
    primary_bet["exploit_edge"] = float(exploit_edge)
    primary_bet["probe_edge"] = float(probe_edge)
    primary_bet["conf_edge"] = _conf_edge(float(primary_bet.get("edge", 0.0)), exploit_edge)
    primary_bet["confidence_pct_edge"] = round(float(primary_bet["conf_edge"]) * 100.0, 1)

    try:
        p_fused = np.array((analysis or {}).get("_p_fused", []), dtype=float)
        if p_fused.size != 37:
            p_fused = uniform_probs()
        else:
            p_fused = p_fused / (p_fused.sum() + EPS)
    except Exception:
        p_fused = uniform_probs()

    # --- Guardian docena: blend short+long to react earlier ---
    try:
        spins_clean = _clean_spins(spins or [])
        doc_long = ((analysis or {}).get("docenas", {}) or {}).get("probabilities", {}) or {}
        if not isinstance(doc_long, dict) or not doc_long:
            doc_long = _doc_probs_from_p(p_fused)

        short_w = int(params.get("guardian_short_window", 24))
        short_w = max(6, min(200, short_w))
        lam = float(params.get("decay_lambda", 0.03))
        p_short = compute_p_freq_decay(spins_clean[-short_w:], alpha=1.0, lam=lam, window=short_w) if spins_clean else uniform_probs()
        doc_short = _doc_probs_from_p(p_short)

        mix_long = float(params.get("guardian_long_mix", 0.60))
        doc_blend = _blend_doc_probs(doc_long, doc_short, mix_long=mix_long)


        # Drift/caos (para gobernar WAIT/PROBE/BET del Guardián)
        try:
            _counters_for_drift = kwargs.get("counters", {}) if isinstance(kwargs.get("counters", {}), dict) else {}
            _drift_state_for_guardian = drift_monitor_check(_counters_for_drift, spins or [])
        except Exception:
            _drift_state_for_guardian = {}

        try:
            _drift_status = str(_drift_state_for_guardian.get("status", "")).lower().strip()
        except Exception:
            _drift_status = ""
        try:
            _chaos_level = float(_drift_state_for_guardian.get("level", 0.0) or 0.0)
        except Exception:
            _chaos_level = 0.0

        if _drift_status == "critical":
            _table_mode = "CHAOS"
        elif _drift_status == "warning":
            _table_mode = "WARNING"
        else:
            _table_mode = "NORMAL"

        meta_extra = {
            "table_mode": _table_mode,
            "drift_status": _drift_status,
            "chaos_level": float(_chaos_level),
            "guardian_short_window": int(short_w),
            "guardian_long_mix": float(mix_long),
            "doc_probs_long": {k: float(doc_long.get(k, 0.0)) for k in ("1-12", "13-24", "25-36")},
            "doc_probs_short": {k: float(doc_short.get(k, 0.0)) for k in ("1-12", "13-24", "25-36")},
            "doc_probs_blended": {k: float(doc_blend.get(k, 0.0)) for k in ("1-12", "13-24", "25-36")},
        }

        # WheelExpert: pasar wheel_info en params para que guardian ajuste umbral
        _gparams = dict(params or {})
        try:
            _gparams['_wheel_info'] = getattr(getattr(_get_engine_singleton(), 'em', None), '_last_wheel_info', {}) or {}
        except Exception:
            pass
        analysis["guardian_docena"] = _GUARDIAN_CORE.suggest(doc_blend, meta_extra=meta_extra, params=_gparams)
        # --- Guardian columna: blend short+long (igual filosofía que docena) ---
        try:
            col_long = _col_probs_from_p(p_fused)
            col_short = _col_probs_from_p(p_short)
            col_blend = _blend_col_probs(col_long, col_short, mix_long=mix_long)
            if isinstance(analysis, dict):
                analysis["col_probs_long"] = {k: float(col_long.get(k, 0.0)) for k in ("Columna 1", "Columna 2", "Columna 3")}
                analysis["col_probs_short"] = {k: float(col_short.get(k, 0.0)) for k in ("Columna 1", "Columna 2", "Columna 3")}
                analysis["col_probs_blended"] = {k: float(col_blend.get(k, 0.0)) for k in ("Columna 1", "Columna 2", "Columna 3")}
            analysis["guardian_columna"] = _GUARDIAN_COL_CORE.suggest(col_blend, meta_extra=meta_extra, params=_gparams)
        except Exception:
            pass

                # Detectar modo de docenas / color para ajustar agresividad
        try:
            regimes = detect_persistence_modes(spins or [], analysis or {}, params or {})
            if isinstance(analysis, dict):
                analysis["_regimes"] = regimes
        except Exception:
            pass

    except Exception:
        analysis["guardian_docena"] = {
            "label": "Apuesta Guardián (Docena)",
            "type": "guardian",
            "top_suggestion": None,
            "top_probability": 0.0,
            "baseline_p": 12.0/37.0,
            "edge": 0.0,
            "conf_score": 0.0,
            "confidence_pct": 0.0,
            "status": "WAIT",
            "reason": "guardian_error",
            "guardian_meta": {"engine_guardian_version": 2, "error": True},
        }

        # pasar params al bloque de coherencia (solo lectura) + gobernador por modo de mesa
    # Nota: aquí usamos un "mode_hint" temprano (último table_alert + pausa activa) para ajustar umbrales
    # sin reordenar el flujo del motor (seguridad/compatibilidad).
    try:
        if isinstance(analysis, dict):
            base_params = params or {}
            params_eff = dict(base_params)

            # Mode hint (prioridad): pausa activa -> COOLDOWN; si no, usar último table_alert si existe.
            mode_hint = None
            try:
                if int(pause_until or 0) > int(now_idx):
                    mode_hint = "COOLDOWN"
            except Exception:
                mode_hint = None
            if not mode_hint and isinstance(last_suggestion, dict):
                try:
                    ta_prev = last_suggestion.get("table_alert", None)
                    if isinstance(ta_prev, dict):
                        mode_hint = str(ta_prev.get("mode", "") or "").upper().strip() or None
                except Exception:
                    mode_hint = None

            # Governor knobs (defaults conservadores)
            warn_edge_mult_simple = float(params_eff.get("governor_warn_edge_mult_simple", 1.15))
            warn_edge_mult_group3 = float(params_eff.get("governor_warn_edge_mult_group3", 1.20))
            warn_edge_mult_numbers = float(params_eff.get("governor_warn_edge_mult_numbers", 1.25))
            warn_cond_bet_add = float(params_eff.get("governor_warn_cond_bet_add", 0.03))
            warn_cond_probe_add = float(params_eff.get("governor_warn_cond_probe_add", 0.02))

            chaos_edge_mult_simple = float(params_eff.get("governor_chaos_edge_mult_simple", 1.40))
            chaos_edge_mult_group3 = float(params_eff.get("governor_chaos_edge_mult_group3", 1.45))
            chaos_edge_mult_numbers = float(params_eff.get("governor_chaos_edge_mult_numbers", 1.55))
            chaos_cond_bet_add = float(params_eff.get("governor_chaos_cond_bet_add", 0.08))
            chaos_cond_probe_add = float(params_eff.get("governor_chaos_cond_probe_add", 0.06))

            def _scale_edge_thresholds(kind: str, mult: float):
                # kind in {"simple","group3","numbers"}
                ek = f"exploit_edge_{kind}" if kind != "numbers" else "exploit_edge_numbers"
                pk = f"probe_edge_{kind}" if kind != "numbers" else "probe_edge_numbers"
                try:
                    if ek in params_eff:
                        params_eff[ek] = float(params_eff.get(ek, 0.0)) * float(mult)
                    if pk in params_eff:
                        params_eff[pk] = float(params_eff.get(pk, 0.0)) * float(max(1.0, mult * 0.90))
                except Exception:
                    pass

            def _bump_cond_thresholds(add_bet: float, add_probe: float):
                try:
                    cb = float(params_eff.get("cond_bet_threshold", 0.62))
                    cp = float(params_eff.get("cond_probe_threshold", 0.55))
                    cb = float(np.clip(cb + add_bet, 0.50, 0.90))
                    cp = float(np.clip(cp + add_probe, 0.45, cb))
                    params_eff["cond_bet_threshold"] = cb
                    params_eff["cond_probe_threshold"] = cp
                except Exception:
                    pass

            if mode_hint in ("WARNING",):
                _scale_edge_thresholds("simple", warn_edge_mult_simple)
                _scale_edge_thresholds("group3", warn_edge_mult_group3)
                _scale_edge_thresholds("numbers", warn_edge_mult_numbers)
                _bump_cond_thresholds(warn_cond_bet_add, warn_cond_probe_add)
            elif mode_hint in ("CHAOS", "COOLDOWN"):
                _scale_edge_thresholds("simple", chaos_edge_mult_simple)
                _scale_edge_thresholds("group3", chaos_edge_mult_group3)
                _scale_edge_thresholds("numbers", chaos_edge_mult_numbers)
                _bump_cond_thresholds(chaos_cond_bet_add, chaos_cond_probe_add)

            # --- Coverage/quality governor (evita BET 'muerto' sin tocar la predicción) ---
            try:
                if "_COVERAGE_GOV" in globals():
                    _gov_meta = _COVERAGE_GOV.apply_to_params_eff(params_eff, mode_hint=mode_hint)
                    if isinstance(_gov_meta, dict) and isinstance(analysis, dict):
                        analysis["_governor"] = _gov_meta
                        params_eff.setdefault("governor_meta", _gov_meta)
            except Exception:
                pass

            # Exponer para auditoría
            params_eff["table_mode_hint"] = mode_hint or "NORMAL"
            analysis["_params"] = params_eff
            try:
                if isinstance(params_out, dict) and isinstance(params_eff, dict):
                    params_out.update(params_eff)
            except Exception:
                pass
    except Exception:
        pass

    coherence = _coherence_from_primary(p_fused, primary_nums=primary_bet.get("numbers", []), analysis=analysis or {})
    params_for_advice = (analysis.get('_params', None) if isinstance(analysis, dict) else None) or (params or {})
    advice = _bet_advice_from_analysis(analysis or {}, params_for_advice, coherence)


    # --- Debug: Coherence gate summary (what got blocked as contradiction) ---
    try:
        dets = (coherence.get("details", {}) or {}) if isinstance(coherence, dict) else {}
        blocked = []
        if isinstance(dets, dict):
            for _k, _det in dets.items():
                if not isinstance(_det, dict):
                    continue
                if bool(_det.get("contradiction", False)):
                    if str(_k) not in ("max_conf", "guardian_docena", "guardian_columna"):
                        blocked.append(str(_k))
        _debug_gate_set(decision, "coherence", {"blocked_count": int(len(blocked)), "blocked_keys": blocked[:20]})
    except Exception:
        pass

    # Risk (BET-only): enforce cooldowns by downgrading advice to WAIT
    try:
        if "_RISK_CORE" in globals() and isinstance(advice, dict):
            _disabled = set()
            if isinstance(analysis, dict):
                _disabled = {str(x) for x in (analysis.get("_risk_disabled_keys", []) or [])}
            for _rk in list(_disabled):
                if _rk in advice and isinstance(advice.get(_rk), dict):
                    _rem = _RISK_CORE.cooldown_remaining(str(_rk))
                    _rr = str(advice[_rk].get("reason", "") or "")
                    advice[_rk]["status"] = "WAIT"
                    _suffix = f"Circuit breaker: cooldown({_rem})"
                    advice[_rk]["reason"] = (_rr + " | " if _rr else "") + _suffix

            # Debug: Risk gate summary (keys disabled by circuit breaker)
            try:
                _cd = {}
                for _k in list(_disabled):
                    try:
                        _cd[str(_k)] = int(_RISK_CORE.cooldown_remaining(str(_k)))
                    except Exception:
                        _cd[str(_k)] = None
                _debug_gate_set(decision, "risk", {"disabled_keys": sorted([str(x) for x in _disabled]), "cooldown_remaining": _cd})
            except Exception:
                pass

    except Exception:
        pass
        # Ajuste de apuesta Guardián según modo de docenas (ANTI_PERSISTENTE / STICKY)
    try:
        reg = analysis.get("_regimes", {}) if isinstance(analysis, dict) else {}
        doc_mode = str(reg.get("docena_mode", "NEUTRO")).upper() if isinstance(reg, dict) else "NEUTRO"

        if isinstance(advice, dict) and doc_mode in ("ANTI_PERSISTENTE", "STICKY"):
            gd_adv = advice.get("guardian_docena")
            if isinstance(gd_adv, dict):
                status = str(gd_adv.get("status", "WAIT")).upper()
                reason = str(gd_adv.get("reason", "")) if gd_adv.get("reason") is not None else ""

                if status == "MONITOR":
                    # MONITOR: no se ajusta por régimen (no afecta otras apuestas)
                    pass
                elif doc_mode == "ANTI_PERSISTENTE":
                    # Si el modo dice que la ruleta está anti-persistente, bajamos agresividad
                    if status == "BET":
                        gd_adv["status"] = "PROBE"
                        gd_adv["reason"] = ((reason + " | ") if reason else "") + "Modo docenas ANTI-PERSISTENTE: degradado a PROBE"
                    elif status == "PROBE":
                        gd_adv["status"] = "WAIT"
                        gd_adv["reason"] = ((reason + " | ") if reason else "") + "Modo docenas ANTI-PERSISTENTE: degradado a WAIT"
                elif doc_mode == "STICKY":
                    # Solo anotamos, para diagnóstico
                    gd_adv["reason"] = ((reason + " | ") if reason else "") + "Modo docenas STICKY"

                gd_adv["mode"] = doc_mode
    except Exception:
        pass


    # --- FASE 3: listas para UI (Apuesta Principal + Consistentes / No Consistentes) ---
    consistentes: List[dict] = []
    no_consistentes: List[dict] = []
    try:
        dets = coherence.get("details", {}) if isinstance(coherence, dict) else {}
        for k, v in (advice or {}).items():
            if not isinstance(v, dict):
                continue
            if k in ("guardian_docena", "max_conf"):
                continue
            det = dets.get(k, {}) if isinstance(dets, dict) else {}
            pgh = float(v.get("p_given_H", det.get("p_given_primary", 0.0) or 0.0) or 0.0)
            contr = bool(v.get("contradiction", det.get("contradiction", False)))
            entry = {
                "bet_key": k,
                "label": v.get("label"),
                "pick": v.get("pick"),
                "status": v.get("status"),
                "p": float(v.get("p", 0.0) or 0.0),
                "edge": float(v.get("edge", 0.0) or 0.0),
                "p_given_H": float(pgh),
                "contradiction": bool(contr),
            }
            if contr or str(entry.get("status", "WAIT")).upper() == "WAIT":
                no_consistentes.append(entry)
            else:
                if k != (primary_bet.get("bet_key") or ""):
                    consistentes.append(entry)

        consistentes.sort(key=lambda x: (1 if x.get("status") == "BET" else 0, float(x.get("p_given_H", 0.0))), reverse=True)
        no_consistentes.sort(key=lambda x: (1 if x.get("contradiction") else 0, float(x.get("p_given_H", 0.0))), reverse=True)
    except Exception:
        pass

    # --- FASE 4: Ruleta alocada (chaos) + cooldown/pause protection ---
    chaos_info = {"active": False, "reason": "", "entropy_rel": 0.0, "drift_level": 0.0,
                  "consec_losses": int(consec_losses), "guardian_miss_streak": 0}
    try:
        if bool(params.get("chaos_enabled", True)):
            s_clean = _clean_spins(spins or [])
            # Entropía relativa: 1.0 ~ casi uniforme
            try:
                H_rel = float(_shannon_entropy(p_fused) / (math.log(37.0) + EPS))
            except Exception:
                H_rel = 0.0
            H_rel = float(np.clip(H_rel, 0.0, 1.0))
            chaos_info["entropy_rel"] = H_rel

            # Drift nivel (usa calculate_drift_level existente)
            try:
                w = int(params.get("chaos_drift_window", 200))
                drift_level = float(calculate_drift_level(s_clean, window=w))
            except Exception:
                drift_level = 0.0
            chaos_info["drift_level"] = drift_level

            # Guardián docena: racha de fallos (si está disponible)
            try:
                gd = (analysis or {}).get("guardian_docena", {}) or {}
                try:
                    _ms = None
                    if isinstance(gd, dict):
                        _ms = gd.get("miss_streak", None)
                    if _ms is None:
                        try:
                            _ms = getattr(_GUARDIAN_CORE, "miss_streak", None)
                        except Exception:
                            _ms = None
                    chaos_info["guardian_miss_streak"] = int(_ms or 0)
                except Exception:
                    chaos_info["guardian_miss_streak"] = int(0)
            except Exception:
                chaos_info["guardian_miss_streak"] = 0

            ent_hi = float(params.get("chaos_entropy_rel_hi", 0.97))
            drift_warn = float(params.get("chaos_drift_warn", 0.25))
            L_chaos = int(params.get("chaos_consec_losses", 5))
            G_chaos = int(params.get("chaos_guardian_miss", 9))

            # Guardrails anti "pause infinita":
            # - min_spins: no activar caos demasiado temprano
            # - min_gap: no re-disparar caos demasiado seguido
            chaos_min_spins = int(params.get("chaos_min_spins", 80))
            chaos_min_gap = int(params.get("chaos_min_gap", 12))
            require_drift_for_streaks = bool(params.get("chaos_require_drift_for_streaks", True))

            prev_chaos_idx = -10**9
            try:
                if isinstance(last_suggestion, dict):
                    _prev_ci = last_suggestion.get("chaos", None)
                    if isinstance(_prev_ci, dict):
                        prev_chaos_idx = int(_prev_ci.get("last_trigger_idx", prev_chaos_idx) or prev_chaos_idx)
            except Exception:
                prev_chaos_idx = -10**9
            chaos_info["last_trigger_idx"] = prev_chaos_idx

            trigger_entropy_drift = (H_rel >= ent_hi) and (drift_level >= drift_warn)
            trigger_losses_raw = int(consec_losses) >= L_chaos
            trigger_guardian_raw = chaos_info["guardian_miss_streak"] >= G_chaos
            trigger_losses = bool(trigger_losses_raw and (not require_drift_for_streaks or (drift_level >= drift_warn)))
            trigger_guardian = bool(trigger_guardian_raw and (not require_drift_for_streaks or (drift_level >= drift_warn)))

            would_trigger = bool(trigger_entropy_drift or trigger_losses or trigger_guardian)
            enough_data = (len(s_clean) >= max(10, chaos_min_spins))
            gap_ok = ((now_idx - prev_chaos_idx) >= max(0, chaos_min_gap))

            if would_trigger and (not enough_data):
                chaos_info["active"] = False
                chaos_info["reason"] = f"CHAOS suprimido: min_spins={len(s_clean)}/{chaos_min_spins}"
            elif would_trigger and (not gap_ok):
                chaos_info["active"] = False
                chaos_info["reason"] = f"CHAOS suprimido: min_gap={now_idx - prev_chaos_idx}/{chaos_min_gap}"
            elif would_trigger:
                reasons = []
                if trigger_entropy_drift:
                    reasons.append(f"Entropía alta (H_rel={H_rel:.2f}) + drift={drift_level:.2f}")
                if trigger_losses:
                    reasons.append(f"Racha pérdidas={int(consec_losses)} >= {L_chaos}")
                if trigger_guardian:
                    reasons.append(f"Guardián miss_streak={chaos_info['guardian_miss_streak']} >= {G_chaos}")
                chaos_info["active"] = True
                chaos_info["last_trigger_idx"] = int(now_idx)
                chaos_info["reason"] = " | ".join(reasons) if reasons else "Modo caos"
    except Exception:
        pass




    # --- Mesa Score + Perfil por mesa (user_id/table_id) ---
    try:
        prev_ms = _get_prev_mesa_score(last_suggestion)
        mesa_score = compute_mesa_score_simple(spins or [], p_fused=p_fused, chaos=chaos_info, params=params or {}, prev=prev_ms)
        # Persistencia por usuario/mesa (solo ranking + alertas; no toca el motor)
        uid = (params or {}).get("user_id", "default")
        tid = (params or {}).get("table_id", "mesa_1")
        prof = update_mesa_profile(uid, tid, mesa_score, params=params or {})
        if isinstance(mesa_score, dict) and isinstance(prof, dict):
            mesa_score.update(prof)
        if isinstance(analysis, dict):
            analysis["_mesa_score"] = mesa_score
    except Exception as _e:
        mesa_score = _mesa_score_error(n_total=len(spins), window=int((params or {}).get("mesa_score_window", 60)), min_spins=int((params or {}).get("mesa_score_min_spins", 30)), update_every=int((params or {}).get("mesa_score_update_every", 5)), exc=_e)

    # --- Drift state (shared with UI + gating) ---
    try:
        _counters_for_drift = kwargs.get("counters", {}) if isinstance(kwargs.get("counters", {}), dict) else {}
        drift_state = drift_monitor_check(_counters_for_drift, spins or [])
    except Exception:
        drift_state = {"status": "no_data", "level": 0.0, "zmax": 0.0, "hot_numbers": [], "cold_numbers": [], "reason": "N/A", "thresholds": {"warn": 0.25, "critical": 0.45}}
    # --- ZMAX bias operationalization (WARNING/CHAOS signal; used by table gate) ---
    try:
        _zmax = float((drift_state or {}).get("zmax", 0.0) or 0.0)
    except Exception:
        _zmax = 0.0
    try:
        _z_warn = float((params or {}).get("z_warn", (params or {}).get("zmax_warn", 3.0)))
    except Exception:
        _z_warn = 3.0
    try:
        _z_critical = float((params or {}).get("z_critical", (params or {}).get("zmax_critical", 4.0)))
    except Exception:
        _z_critical = 4.0
    try:
        _z_critical_k = int((params or {}).get("z_critical_k", (params or {}).get("zmax_critical_k", 3)))
    except Exception:
        _z_critical_k = 3

    _prev_streak = 0
    try:
        if isinstance(last_suggestion, dict):
            _prev_ds = last_suggestion.get("drift_state", {}) or {}
            _prev_streak = int(_prev_ds.get("zmax_crit_streak", 0) or 0)
    except Exception:
        _prev_streak = 0

    _z_streak = int(_prev_streak + 1) if (_zmax >= _z_critical) else 0
    _z_streak = max(0, min(999, _z_streak))

    try:
        if isinstance(drift_state, dict):
            drift_state["z_warn"] = float(_z_warn)
            drift_state["z_critical"] = float(_z_critical)
            drift_state["z_critical_k"] = int(_z_critical_k)
            drift_state["zmax_crit_streak"] = int(_z_streak)
            drift_state["zmax_warn_flag"] = bool(_zmax >= _z_warn)
            drift_state["zmax_critical_flag"] = bool(_zmax >= _z_critical)
    except Exception:
        pass


    def _pack(action: str, stake_frac: float, reason: str) -> dict:
        gd = None
        if isinstance(analysis, dict):
            gd = analysis.get("guardian_docena", None)
        guardian = gd

        guardian_pick = None
        guardian_edge = 0.0
        guardian_status = None
        guardian_reason = None
        try:
            if isinstance(guardian, dict):
                # Pick robusto (evita "UI muestra sugerencia pero no hay pick para evaluar/contar")
                guardian_pick = (
                    guardian.get("top_suggestion", None)
                    or guardian.get("pick", None)
                    or guardian.get("suggested", None)
                    or guardian.get("selection", None)
                    or guardian.get("docena", None)
                )

                # Edge robusto (compatibilidad)
                _edge = guardian.get("edge", None)
                if _edge is None:
                    _edge = guardian.get("top_edge", guardian.get("confidence_edge", 0.0))
                guardian_edge = float(_edge or 0.0)

                # Status robusto
                guardian_status = guardian.get("status", None) or guardian.get("mode", None) or guardian.get("state", None)
                if isinstance(guardian_status, str):
                    guardian_status = guardian_status.strip().upper()
                    if guardian_status not in ("BET", "PROBE", "WAIT"):
                        guardian_status = None
                else:
                    guardian_status = None

                guardian_reason = guardian.get("reason", None) or guardian.get("message", None) or guardian.get("note", None)
        except Exception:
            guardian_pick = None
            guardian_edge = 0.0
            guardian_status = None
            guardian_reason = None
        
        # Preferir el advice (BET/PROBE/WAIT) para el estado del Guardián.
        # El análisis (suggestion_analysis['guardian_docena']) trae pick/edge/p, pero no siempre trae status.
        try:
            gadv = advice.get("guardian_docena") if isinstance(advice, dict) else None
            if isinstance(gadv, dict):
                guardian_pick = gadv.get("pick", guardian_pick) or guardian_pick
                guardian_edge = float(gadv.get("edge", guardian_edge) or guardian_edge)
                _gs = gadv.get("status", None)
                if isinstance(_gs, str):
                    _gsu = _gs.strip().upper()
                    if _gsu in ("BET", "PROBE", "WAIT"):
                        guardian_status = _gsu
                if guardian_status is None:
                    guardian_status = "WAIT"
                guardian_reason = gadv.get("reason", guardian_reason)
        except Exception:
            pass

        # --- Guardian Columna: parse robusto (paralelo a guardian_docena) ---
        gc = analysis.get("guardian_columna", None)
        guardian_col_pick = None
        guardian_col_edge = 0.0
        guardian_col_status = None
        guardian_col_reason = None
        try:
            if isinstance(gc, dict):
                guardian_col_pick = (
                    gc.get("top_suggestion", None)
                    or gc.get("pick", None)
                    or gc.get("suggested", None)
                    or gc.get("selection", None)
                    or gc.get("columna", None)
                )
                try:
                    guardian_col_edge = float(gc.get("edge", guardian_col_edge) or guardian_col_edge)
                except Exception:
                    guardian_col_edge = float(guardian_col_edge or 0.0)

                _cs = gc.get("status", None) or gc.get("mode", None) or gc.get("action", None)
                if isinstance(_cs, str):
                    _csu = _cs.strip().upper()
                    if _csu in ("BET", "PROBE", "WAIT"):
                        guardian_col_status = _csu
                guardian_col_reason = gc.get("reason", None) or gc.get("message", None) or gc.get("note", None)
        except Exception:
            guardian_col_pick = None
            guardian_col_edge = 0.0
            guardian_col_status = None
            guardian_col_reason = None

        # Preferir bet_advice para estado final
        try:
            gcadv = advice.get("guardian_columna") if isinstance(advice, dict) else None
            if isinstance(gcadv, dict):
                guardian_col_pick = gcadv.get("pick", guardian_col_pick) or guardian_col_pick
                guardian_col_edge = float(gcadv.get("edge", guardian_col_edge) or guardian_col_edge)
                _cs = gcadv.get("status", None)
                if isinstance(_cs, str):
                    _csu = _cs.strip().upper()
                    if _csu in ("BET", "PROBE", "WAIT"):
                        guardian_col_status = _csu
                if guardian_col_status is None:
                    guardian_col_status = "WAIT"
                guardian_col_reason = gcadv.get("reason", guardian_col_reason)
        except Exception:
            pass


# Ensure table_alert is always present (even for early returns)
        ta = _ensure_table_alert(action, mesa_score, drift_state, params or {}, table_alert=table_alert)

        # Build params payload for UI/export# Build params payload for UI/export (robust; avoids NameError)
        _params_for_ui = dict(params_out) if isinstance(params_out, dict) else {}
        _params_for_ui.setdefault('session_id', params.get('session_id', None))
        _params_for_ui.setdefault('table_id', params.get('table_id', None))
        _params_for_ui['spins_len'] = int(now_idx)
        _params_for_ui['risk_bet_only'] = bool(params.get('risk_bet_only', True))
        _params_for_ui['risk_max_consec_bet_losses'] = int(params.get('risk_max_consec_bet_losses', params.get('risk_max_losses', 3)) or 3)
        _params_for_ui['risk_cooldown_spins'] = int(params.get('risk_cooldown_spins', params.get('risk_cooldown', 3)) or 3)
        # Optional computed cuts (present when available)
        try:
            _params_for_ui.setdefault('H_cut', float(H_cut))
        except Exception:
            pass
        try:
            _params_for_ui.setdefault('cfl_H_cut_doccol', float(cfl_H_cut_doccol))
        except Exception:
            pass
        try:
            _params_for_ui.setdefault('cfl_H_cut_simples', float(cfl_H_cut_simples))
        except Exception:
            pass

        payload = {
            "schema_version": SCHEMA_VERSION,
            "engine_version": ENGINE_VERSION,
            "params": _params_for_ui,
            "snapshot_spins_count": int(now_idx),
            "action": action,
            "raw_action": action,
            "final_action": action,
            "stake_frac": float(stake_frac),
            "reason": reason,
            "primary_bet": primary_bet,
            "coherence": coherence,
            "bet_advice": advice,
            "consistentes": consistentes,
            "no_consistentes": no_consistentes,
            "hipotesis_H": primary_bet,


            # SNAPSHOT COMPLETO
            "suggestion_analysis": analysis,

            # COMPATIBILIDAD
            "analysis": analysis,
            "guardian_docena": gd,
            "guardian_columna": gc,
            "guardian_col_pick": guardian_col_pick,
            "guardian_col_edge": guardian_col_edge,
            "guardian_col_status": guardian_col_status,
            "guardian_col_reason": guardian_col_reason,
            "guardian_columna_state": {"status": guardian_col_status, "pick": guardian_col_pick, "edge": guardian_col_edge, "reason": guardian_col_reason},
            "guardian_pick": guardian_pick,   # ✅ clave para UI/evaluate
            "guardian_edge": guardian_edge,   # ✅ clave para UI/evaluate
            "guardian_status": guardian_status,
            "guardian_reason": guardian_reason,
            "guardian_suggested": guardian_pick,
            "guardian": {"status": guardian_status, "pick": guardian_pick, "edge": guardian_edge, "reason": guardian_reason},

            # Telemetría Meta (Entrega 5) — no rompe UI
            "meta_shadow": {},  # podado: telemetría meta desactivada por defecto

            "risk": (_RISK_CORE.summary(params) if "_RISK_CORE" in globals() else {}),

            "cfl_metrics": cfl_metrics,

            "table_alert": ta,

            "mesa_score": mesa_score,
            "drift_state": drift_state,
            "mesa": mesa_score,

            "chaos": chaos_info,
        }
        _attach_mesa_alias(payload, mesa_score)
        payload = _deep_jsonable(payload)
        return payload


    if now_idx <= int(pause_until):
        # Explicit COOLDOWN mode while pause is active (so UI doesn't look "stuck")
        try:
            if isinstance(ta, dict):
                ta["mode"] = "COOLDOWN"
                ta["recommended_action"] = "WAIT"
                if not ta.get("reason"):
                    ta["reason"] = f"Pause activa (giro {now_idx}/{pause_until})"
        except Exception:
            pass
        return (_pack("OBSERVE", 0.0, f"Pause activa (giro {now_idx}/{pause_until})"), pause_update)



    # --- FASE 4: si hay "ruleta alocada", activar cooldown (pause) para proteger capital ---
    if bool(chaos_info.get("active", False)):
        M_chaos = int(params.get("chaos_pause_spins", 6))
        M_chaos = max(2, min(30, M_chaos))
        pause_update["pause_until_spin"] = now_idx + M_chaos
        pause_update["resync_needed"] = True
        return (_pack("OBSERVE", 0.0, f"Modo CAOS: {chaos_info.get('reason','')} -> pause {M_chaos} spins"), pause_update)
    L_max = int(params.get("L_max", 3))
    # NOTE: do not hard-pause the whole engine on loss streaks.
    # Per-category RiskControlCore already enforces BET-only circuit breakers.
    # Keeping this as a *soft* signal avoids getting stuck in endless pause loops.
    if int(consec_losses) >= L_max:
        pass

    max_H_doccol = float(cfl_metrics.get("max_H_doccol", 1.58))
    avg_H_simples = float(cfl_metrics.get("avg_H_simples", 1.0))
    cfl_H_cut_doccol = float(params.get("cfl_H_cut_doccol", 1.5))
    cfl_H_cut_simples = float(params.get("cfl_H_cut_simples", 0.98))

    cfl_high = False
    cfl_reason = ""

    if (max_H_doccol > cfl_H_cut_doccol * 1.10) or (avg_H_simples > cfl_H_cut_simples * 1.10):
        cfl_high = True
        cfl_reason = f"CFL alto (Doc/Col H={max_H_doccol:.2f}, Simples H={avg_H_simples:.2f})"

    try:
        H_nums = float((analysis or {}).get("H_numeros", _shannon_entropy(p_fused)))
    except Exception:
        H_nums = float(_shannon_entropy(p_fused))

    try:
        H_uniform = float(_shannon_entropy(uniform_probs()))
    except Exception:
        H_uniform = 5.21

    H_cut = params.get("H_cut", None)
    if H_cut is None:
        H_cut = H_uniform * 0.98
    H_cut = float(H_cut)
    if (H_uniform > 4.0) and (H_cut < 3.8):
        H_cut = H_uniform * 0.98
    H_cut = float(np.clip(H_cut, 0.0, max(0.1, H_uniform)))
    # expose computed cutoffs to UI/backtest
    params_out['H_cut'] = float(H_cut)
    params_out.setdefault('H_uniform', float(H_uniform))
    params_out.setdefault('wheel_n', int(len(p_fused)))

    edge_primary = float(primary_bet.get("edge", 0.0))


    probe_frac = float(params.get("probe_frac", 0.25))

    # Primary type (group_2 / group_3 / etc.) used for gating tweaks (safe default)
    primary_type = str((primary_bet or {}).get("type", "") or "")

    # --- Base decision (raw) driven by the chosen primary bet ---
    # IMPORTANT: la app cuenta aciertos/errores SOLO cuando la principal está en BET.
    # En vivo, la heurística anterior (edge + entropía de números) dejaba la principal
    # casi siempre en OBSERVE/PROBE. Aquí alineamos la acción con el bet_advice del
    # mismo bet_key elegido como principal.
    try:
        primary_status = str(((advice or {}).get(pk, {}) or {}).get("status", "WAIT") or "WAIT").upper()
    except Exception:
        primary_status = "WAIT"

    # Ensure primary carries an explicit execution status for UI + RiskControlCore
    try:
        if isinstance(primary_bet, dict):
            primary_bet["status"] = primary_status
            primary_bet["action"] = primary_status
    except Exception:
        pass

    # Map BET/PROBE/WAIT -> EXPLOIT/PROBE/OBSERVE (acción global)
    if primary_status == "BET":
        raw_action = "BET"
        raw_frac = 1.0
        raw_reason = f"BET(edge): {pk} edge={edge_primary:+.3f}>={exploit_edge:.3f}"
    elif primary_status == "PROBE":
        raw_action = "PROBE"
        raw_frac = float(probe_frac)
        raw_reason = f"PROBE(edge): {pk} edge={edge_primary:+.3f}>={probe_edge:.3f}"
    else:
        raw_action = "OBSERVE"
        raw_frac = 0.0
        raw_reason = f"OBSERVE: {pk} edge={edge_primary:+.3f}<{probe_edge:.3f}"

    # Añadir contexto (sin romper UI): entropía de la categoría principal (no de números)
    try:
        H_cat = float((primary_bet or {}).get("entropy", 0.0) or 0.0)
        raw_reason += f", Hcat={H_cat:.2f}"
    except Exception:
        pass
    # --- Final action gate by MesaScore + Drift ---
    final_action, table_alert = _compute_table_gate(raw_action, mesa_score, drift_state, params)
    try:
        if isinstance(table_alert, dict):
            _debug_gate_set(decision, "table", {
                "raw_action": str(raw_action),
                "final_action": str(final_action),
                "mode": str(table_alert.get("mode", "") or ""),
                "reasons": list(table_alert.get("reasons", []) or []),
            })
        else:
            _debug_gate_set(decision, "table", {"raw_action": str(raw_action), "final_action": str(final_action)})
    except Exception:
        pass


    # CFL gate (soft): degrade action instead of hard-freezing the session
    try:
        if ("cfl_high" in locals()) and bool(cfl_high):
            _fa0 = str(final_action or "OBSERVE").upper()
            if _fa0 in ("BET", "EXPLOIT", "STRONG"):
                final_action = "PROBE"
            elif _fa0 == "PROBE":
                final_action = "OBSERVE"
            # annotate alert for UI
            if not isinstance(table_alert, dict):
                table_alert = {}
            rs = table_alert.get("reasons", [])
            if not isinstance(rs, list):
                rs = []
            if cfl_reason:
                rs.append(cfl_reason)
            table_alert["reasons"] = rs
            # ensure at least WARNING
            _m = str(table_alert.get("mode", "NORMAL") or "NORMAL").upper()
            if _m == "NORMAL":
                table_alert["mode"] = "WARNING"
            if cfl_reason:
                msg = str(table_alert.get("message") or "")
                table_alert["message"] = (msg + (" | " if msg else "") + cfl_reason)
    except Exception:
        pass

    # Debug: CFL gate (action degraded due to calibration/instability)
    try:
        if ("cfl_high" in locals()) and bool(cfl_high):
            _debug_gate_set(decision, "cfl", {"applied": True, "reason": str(cfl_reason or ""), "final_action": str(final_action or "")})
        else:
            _debug_gate_setdefault(decision, "cfl", {"applied": False})
    except Exception:
        pass

    # If ZMAX critical streak escalated to CHAOS, enforce a protective cooldown (pause).
    try:
        if isinstance(table_alert, dict) and str(table_alert.get("mode", "")).upper() == "CHAOS":
            reasons = table_alert.get("reasons", []) if isinstance(table_alert.get("reasons", []), list) else []
            msg = str(table_alert.get("message", "") or "")
            zmax_chaos = any(("zmax_critical_streak" in str(r)) for r in reasons) or ("zmax_critical_streak" in msg)
            if zmax_chaos:
                M_z = int(params.get("zmax_chaos_pause_spins", params.get("chaos_pause_spins", 6)) or 6)
                M_z = max(2, min(30, M_z))
                # only extend pause if it's shorter than the new recommendation
                proposed = int(now_idx) + int(M_z)
                cur = int(pause_update.get("pause_until_spin", 0) or 0)
                if proposed > cur:
                    pause_update["pause_until_spin"] = proposed
                    pause_update["resync_needed"] = True
    except Exception:
        pass


    # Optional: zmax critical sustained -> cooldown
    try:
        if isinstance(table_alert, dict) and str(table_alert.get("mode", "")).upper() == "CHAOS":
            _reasons = table_alert.get("reasons", [])
            _reasons = _reasons if isinstance(_reasons, list) else []
            if any((isinstance(r, str) and "zmax_critical_streak" in r) for r in _reasons):
                _cool = int((params or {}).get("zmax_cooldown_spins", (params or {}).get("table_chaos_pause_spins", 10)))
                _cool = max(1, min(200, _cool))
                pause_update["pause_until_spin"] = int(max(pause_update.get("pause_until_spin", now_idx), now_idx + _cool))
                pause_update["resync_needed"] = True
    except Exception:
        pass

    # Safety: final_action must never be None (UI contract)
    if final_action is None or str(final_action).strip() == "":
        final_action = raw_action
    final_action = str(final_action or "OBSERVE").upper()

    # --- CHAOS GATE: BET -> PROBE en caos activo (bloqueo suave) ---
    try:
        _chaos_active = bool((chaos_info or {}).get("active", False)) if isinstance(chaos_info, dict) else False
        _consec_hi    = int(consec_losses or 0) >= int(params.get("chaos_gate_consec_threshold", 6))
        if (_chaos_active or _consec_hi) and str(final_action).upper() in ("BET", "EXPLOIT", "STRONG"):
            final_action = "PROBE"
            _cg_reason = "CHAOS GATE: caos activo" if _chaos_active else "CHAOS GATE: consec_losses alto"
            if not isinstance(table_alert, dict): table_alert = {}
            _rs = table_alert.get("reasons", [])
            if not isinstance(_rs, list): _rs = []
            _rs.append(_cg_reason)
            table_alert["reasons"] = _rs
            table_alert["mode"]    = "CHAOS_GATE"
    except Exception:
        pass

    # --- PODA: coherencia operativa ---
    # 1) Si hay cooldown/pause activo, forzar OBSERVE (evita "BET pegado" mientras pause_until está vigente)
    try:
        _pu = int(pause_update.get("pause_until_spin", 0) or 0)
    except Exception:
        _pu = 0
    if _pu and (_pu > now_idx):
        if str(final_action).upper() != "OBSERVE":
            try:
                if not isinstance(table_alert, dict):
                    table_alert = {}
                rs = table_alert.get("reasons", [])
                rs = rs if isinstance(rs, list) else []
                rs.append(f"pause_until_active (now={now_idx}, until={_pu})")
                table_alert["reasons"] = rs
                table_alert["mode"] = str(table_alert.get("mode", "WARNING") or "WARNING").upper()
            except Exception:
                pass
        final_action = "OBSERVE"

    # 2) Alinear bet_advice + primary_status con final_action (una sola verdad visible en UI)
    #    - OBSERVE => todos BET/PROBE pasan a WAIT
    #    - PROBE   => BET pasa a PROBE
    try:
        if isinstance(advice, dict):
            for _k, _v in advice.items():
                if not isinstance(_v, dict):
                    continue
                st = str(_v.get("status", "") or "").upper()
                if st in ("INFO", "MONITOR"):
                    continue
                if final_action == "OBSERVE":
                    if st in ("BET", "PROBE"):
                        _v["status"] = "WAIT"
                        rr = str(_v.get("reason", "") or "")
                        _v["reason"] = (rr + " | " if rr else "") + "Gate=OBSERVE (mesa/riesgo/cooldown)"
                elif final_action == "PROBE":
                    if st == "BET":
                        _v["status"] = "PROBE"
                        rr = str(_v.get("reason", "") or "")
                        _v["reason"] = (rr + " | " if rr else "") + "Gate=PROBE (mesa/riesgo)"
        # primary_status debe reflejar el status final visible
        try:
            _ps = str(((advice or {}).get(pk, {}) or {}).get("status", primary_status) or primary_status).upper()
        except Exception:
            _ps = str(primary_status or "WAIT").upper()
        if final_action != "BET" and _ps == "BET":
            _ps = "PROBE" if final_action == "PROBE" else "WAIT"
        primary_status = _ps
        try:
            if isinstance(primary_bet, dict):
                primary_bet["status"] = primary_status
                primary_bet["action"] = primary_status
        except Exception:
            pass
    except Exception:
        pass
    # --- END ALIGN_STATUSES_WITH_FINAL_ACTION_PODADO ---

        # Adjust bet fraction per gate
    final_frac = float(raw_frac)
    if final_action == "OBSERVE":
        final_frac = 0.0
    elif final_action == "PROBE":
        final_frac = float(min(raw_frac, probe_frac))

    # MEJORA 1: Kelly-based sizing for BET actions
    # Uses half-Kelly by default (kelly_multiplier=0.5) with floor at kelly_min_frac=0.25
    try:
        if final_action in ("BET", "EXPLOIT") and isinstance(primary_bet, dict):
            _adv_entry = (advice or {}).get(pk, {}) if isinstance(advice, dict) else {}
            _kelly_f = float(_adv_entry.get("kelly_frac", 0.0)) if isinstance(_adv_entry, dict) else 0.0
            if _kelly_f > 0:
                _kelly_mult = float(params.get("kelly_multiplier", 0.5))
                _kelly_min = float(params.get("kelly_min_frac", 0.25))
                _kelly_adj = float(np.clip(_kelly_f * _kelly_mult, _kelly_min, 1.0))
                final_frac = _kelly_adj
                primary_bet["kelly_frac_applied"] = round(_kelly_adj, 4)
    except Exception:
        pass

    decision = _pack(final_action, final_frac, f"{raw_reason} | gate={table_alert.get('mode','NORMAL')}")

    # Ensure UI reads a single authoritative action
    decision["action"] = final_action

    # Primary status must be explicit (UI counts hits only when PRIMARY is BET)
    try:
        decision["primary_status"] = primary_status
    except Exception:
        pass
    try:
        if isinstance(primary_bet, dict):
            primary_bet.setdefault("status", primary_status)
            primary_bet.setdefault("action", primary_status)
    except Exception:
        pass
    try:
        decision["primary"] = {
            "status": primary_status,
            "bet_key": pk,
            "pick": (primary_bet.get("pick") if isinstance(primary_bet, dict) else None),
            "options": (primary_bet.get("options") if isinstance(primary_bet, dict) else None),
        }
    except Exception:
        pass

    # Preserve raw/final for UI + debugging (no rompe compat)

    # --- Contract finalization: Decision Schema v1 (frozen) ---
    try:
        ra = str(raw_action or decision.get("raw_action") or decision.get("action") or "OBSERVE").upper()
    except Exception:
        ra = "OBSERVE"
    try:
        fa = str(final_action or ra).upper()
    except Exception:
        fa = ra

    decision["schema_version"] = SCHEMA_VERSION
    decision["engine_version"] = ENGINE_VERSION
    decision["snapshot_spins_count"] = int(now_idx)

    # Single source of truth for UI
    decision["raw_action"] = ra
    decision["final_action"] = fa
    decision["action"] = fa

    # Table alert always present
    table_alert = _ensure_table_alert(fa, mesa_score, drift_state, params or {}, table_alert=table_alert)

    decision["table_alert"] = table_alert
    decision["drift_state"] = drift_state

    # --- Gobernador final por modo (conecta estado de mesa a agresividad) ---
    try:
        mode_final = None
        try:
            if isinstance(table_alert, dict):
                mode_final = str(table_alert.get("mode", "") or "").upper().strip() or None
        except Exception:
            mode_final = None
        # pausa activa domina como COOLDOWN
        try:
            if int(pause_until or 0) > int(now_idx):
                mode_final = "COOLDOWN"
        except Exception:
            pass

        ba = decision.get("bet_advice", None)
        if isinstance(ba, dict) and mode_final:
            for k, v in ba.items():
                if not isinstance(v, dict):
                    continue
                st0 = str(v.get("status", "WAIT") or "WAIT").upper()
                if mode_final == "WARNING":
                    # Baja agresividad: BET -> PROBE (pero no inventa BET)
                    if st0 == "BET":
                        v["status"] = "PROBE"
                        v["reason"] = (str(v.get("reason", "") or "") + " | governor:WARNING(BET->PROBE)").strip(" |")
                elif mode_final in ("CHAOS", "COOLDOWN"):
                    # En caos/cooldown: WAIT (permite estabilidad)
                    if st0 in ("BET", "PROBE"):
                        v["status"] = "WAIT"
                        v["reason"] = (str(v.get("reason", "") or "") + f" | governor:{mode_final}(->WAIT)").strip(" |")
                ba[k] = v
            decision["bet_advice"] = ba
    except Exception:
        pass

    # --- Debug no intrusivo (auditoría P_final + coherencia) ---
    try:
        dbg = {}
        try:
            p = np.array(p_fused, dtype=float)
            if p.size == 37 and float(p.sum()) > 0:
                p = p / (p.sum() + EPS)
                topk = int((params or {}).get("debug_pfinal_topk", 7))
                topk = max(3, min(12, topk))
                idxs = np.argsort(-p)[:topk]
                dbg["p_final_top"] = [{"n": int(i), "p": float(p[i])} for i in idxs]
        except Exception:
            pass

        try:
            coh = decision.get("coherence", None)
            if isinstance(coh, dict):
                dbg["H_mass"] = float(coh.get("primary_mass", 0.0) or 0.0)
                dets = coh.get("details", {}) if isinstance(coh.get("details", {}), dict) else {}
                vals = []
                for _, dv in dets.items():
                    if isinstance(dv, dict) and not bool(dv.get("contradiction", False)):
                        vals.append(float(dv.get("p_given_primary", 0.0) or 0.0))
                dbg["avg_p_given_H"] = float(np.mean(vals)) if vals else 0.0
        except Exception:
            pass

        if dbg:
            decision["debug"] = dict(decision.get("debug", {}) or {})
            decision["debug"].update(dbg)
    except Exception:
        pass


    # Ensure table gate debug reflects the final action after all gates (including CFL/ZMAX tweaks)
    try:
        _debug_gate_update(decision, "table", {"final_action_post": str(final_action or decision.get("final_action") or "")})
    except Exception:
        pass

    _attach_mesa_alias(decision, mesa_score)
    return (decision, pause_update)

# -----------------------------------------------------------------------------
# Evaluation: checks if last suggestion hit (updates guardian ALWAYS)
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# Performance tracking by bet category
# -----------------------------------------------------------------------------

_PERF_LOCK = threading.Lock()
_PERF_KEYS = ("docenas", "columnas", "color", "paridad", "rango", "max_conf", "guardian_docena", "primary")
_PERF_STATS: Dict[str, Dict[str, int]] = {
    k: {"wins": 0, "losses": 0, "none": 0, "total": 0} for k in _PERF_KEYS
}




class CoverageQualityGovernor:
    """Adaptive governor to avoid 'dead' BET by steering action thresholds.

    This governor DOES NOT change the prediction P(n). It only scales decision thresholds
    to keep a steady stream of *signals* while limiting consecutive losses on the PRIMARY.

    It learns from evaluate_spin() feedback (primary hit/miss + primary_status).
    """

    def __init__(self):
        import threading
        self._lock = threading.Lock()
        self._w = 60
        from collections import deque
        self._target = 0.16  # ~10/60
        self._band = (0.12, 0.22)
        self._max_err = 0.35
        self._max_consec = 2
        self._log_scale = 0.0  # multiplicative scale = exp(log_scale)
        self._scale_min = 0.65
        self._scale_max = 1.55
        self._step_cov = 0.035
        self._step_err = 0.050
        self._step_streak = 0.080

        self._actions = deque(maxlen=self._w)   # 'BET'/'PROBE'/'WAIT'
        self._bet_hits = deque(maxlen=self._w)  # True/False for BET-only
        self._last_meta = {}

    def _norm_action(self, a) -> str:
        try:
            a = str(a or '').upper().strip()
        except Exception:
            return 'WAIT'
        if a in ('BET', 'EXPLOIT'):
            return 'BET'
        if a == 'PROBE':
            return 'PROBE'
        if a in ('WAIT', 'OBSERVE'):
            return 'WAIT'
        return a or 'WAIT'

    def configure_from_params(self, params: dict) -> None:
        params = params or {}
        try:
            self._w = int(params.get('governor_window', self._w) or self._w)
            self._actions = __import__('collections').deque(self._actions, maxlen=self._w)
            self._bet_hits = __import__('collections').deque(self._bet_hits, maxlen=self._w)
        except Exception:
            pass
        try:
            self._target = float(params.get('target_primary_bet_coverage', self._target) or self._target)
        except Exception:
            pass
        try:
            lo = float(params.get('target_primary_bet_cov_lo', self._band[0]) or self._band[0])
            hi = float(params.get('target_primary_bet_cov_hi', self._band[1]) or self._band[1])
            if 0 < lo < hi < 1:
                self._band = (lo, hi)
        except Exception:
            pass
        try:
            self._max_err = float(params.get('max_primary_bet_error_rate', self._max_err) or self._max_err)
        except Exception:
            pass
        try:
            self._max_consec = int(params.get('max_primary_bet_consec_losses', self._max_consec) or self._max_consec)
        except Exception:
            pass

    def observe(self, decision: dict, results: dict, params: dict = None) -> None:
        """Update feedback from the just-evaluated spin."""
        with self._lock:
            try:
                self.configure_from_params(params or (decision.get('params') if isinstance(decision, dict) else {}) or {})
            except Exception:
                pass

            if not isinstance(decision, dict) or not isinstance(results, dict):
                return

            # Prefer explicit primary_status (engine enforces it as authoritative)
            ps = decision.get('primary_status', None)
            if ps is None and isinstance(decision.get('primary'), dict):
                ps = decision.get('primary', {}).get('status', None)
            if ps is None and isinstance(decision.get('primary_bet'), dict):
                ps = decision.get('primary_bet', {}).get('status', None)

            act = self._norm_action(ps)
            self._actions.append(act)

            if act == 'BET':
                hit = results.get('primary', None)
                if hit is True:
                    self._bet_hits.append(True)
                elif hit is False:
                    self._bet_hits.append(False)
                else:
                    # non-evaluable; don't poison quality
                    pass

            # Compute live metrics
            bet_n = sum(1 for a in self._actions if a == 'BET')
            w = max(1, len(self._actions))
            coverage = bet_n / float(w)

            eval_hits = list(self._bet_hits)
            eval_n = len(eval_hits)
            losses = sum(1 for x in eval_hits if x is False)
            err_rate = (losses / float(eval_n)) if eval_n > 0 else 0.0

            # Consecutive losses (BET-only)
            consec = 0
            for x in reversed(eval_hits):
                if x is False:
                    consec += 1
                else:
                    break

            self._last_meta = {
                'window': int(self._w),
                'bet_count': int(bet_n),
                'coverage_bet': float(coverage),
                'eval_bet_n': int(eval_n),
                'error_rate_bet': float(err_rate),
                'consec_losses_bet': int(consec),
                'scale': float(self.current_scale()),
            }

            # Update internal scale (slow controller)
            # Interpretation: scale > 1 => stricter (higher thresholds, fewer BET).
            #                scale < 1 => looser  (lower thresholds, more BET).
            mode = None
            try:
                ta = decision.get('table_alert')
                if isinstance(ta, dict):
                    mode = str(ta.get('mode', '') or '').upper().strip() or None
            except Exception:
                mode = None

            allow_loosen = (mode not in ('CHAOS', 'COOLDOWN'))

            # Coverage control
            lo, hi = self._band
            if coverage < lo and allow_loosen:
                self._log_scale -= self._step_cov
            elif coverage > hi:
                self._log_scale += (self._step_cov * 0.6)

            # Quality / streak control (always allowed to tighten)
            if err_rate > self._max_err and eval_n >= max(3, self._max_consec + 1):
                self._log_scale += self._step_err
            if consec >= self._max_consec and eval_n >= self._max_consec:
                self._log_scale += self._step_streak

            # Clamp
            sc = float(self.current_scale())
            if sc < self._scale_min:
                self._log_scale = math.log(self._scale_min)
            elif sc > self._scale_max:
                self._log_scale = math.log(self._scale_max)

            # Refresh meta scale
            self._last_meta['scale'] = float(self.current_scale())

    def current_scale(self) -> float:
        try:
            return float(math.exp(float(self._log_scale)))
        except Exception:
            return 1.0

    def get_adjustments(self, mode_hint: str = None) -> dict:
        """Return adjustments to apply to params_eff."""
        scale = float(self.current_scale())
        mode_hint = (str(mode_hint or '').upper().strip() or 'NORMAL')

        # In CHAOS/COOLDOWN: never loosen (scale cannot go below 1.0)
        if mode_hint in ('CHAOS', 'COOLDOWN') and scale < 1.0:
            scale = 1.0

        # Convert scale to edge multiplier (directly multiplies thresholds)
        edge_mult = float(scale)

        # Light bump to conditional thresholds (keeps coherence-based BET conservative)
        # When loosening (scale<1), we slightly lower cond thresholds; when tightening, we raise them.
        add = (scale - 1.0)
        cond_bet_add = float(np.clip(0.020 * add, -0.020, 0.035))
        cond_probe_add = float(np.clip(0.015 * add, -0.020, 0.030))

        meta = dict(self._last_meta) if isinstance(self._last_meta, dict) else {}
        meta.update({
            'mode_hint': mode_hint,
            'edge_mult': float(edge_mult),
            'cond_bet_add': float(cond_bet_add),
            'cond_probe_add': float(cond_probe_add),
        })
        return meta

    def apply_to_params_eff(self, params_eff: dict, mode_hint: str = None) -> dict:
        """Apply adjustments in-place and return meta."""
        with self._lock:
            if not isinstance(params_eff, dict):
                return {}
            meta = self.get_adjustments(mode_hint=mode_hint)

            edge_mult = float(meta.get('edge_mult', 1.0) or 1.0)
            try:
                for group, mult in (('simple', edge_mult), ('group3', edge_mult), ('numbers', edge_mult)):
                    ek = f"exploit_edge_{group}" if group != 'numbers' else "exploit_edge_numbers"
                    pk = f"probe_edge_{group}" if group != 'numbers' else "probe_edge_numbers"
                    if ek in params_eff:
                        params_eff[ek] = float(params_eff.get(ek, 0.0)) * float(mult)
                    if pk in params_eff:
                        params_eff[pk] = float(params_eff.get(pk, 0.0)) * float(max(1.0, mult * 0.90))
            except Exception:
                pass

            try:
                cb = float(params_eff.get("cond_bet_threshold", 0.62))
                cp = float(params_eff.get("cond_probe_threshold", 0.55))
                cb = float(np.clip(cb + float(meta.get('cond_bet_add', 0.0)), 0.50, 0.90))
                cp = float(np.clip(cp + float(meta.get('cond_probe_add', 0.0)), 0.45, cb))
                params_eff["cond_bet_threshold"] = cb
                params_eff["cond_probe_threshold"] = cp
            except Exception:
                pass

            return meta


# Global governor (lightweight, safe)
_COVERAGE_GOV = CoverageQualityGovernor()
def _perf_register_results(results: Dict[str, Any]) -> None:
    """
    Update in-memory performance counters for each bet category.
    This is intentionally lightweight and only used for diagnostics / dashboards.
    """
    try:
        with _PERF_LOCK:
            for k in _PERF_KEYS:
                v = results.get(k, None)
                st = _PERF_STATS.setdefault(k, {"wins": 0, "losses": 0, "none": 0, "total": 0})
                st["total"] += 1
                if v is True:
                    st["wins"] += 1
                elif v is False:
                    st["losses"] += 1
                else:
                    st["none"] += 1
    except Exception:
        # Never let telemetry break the engine
        logger.debug("perf_register_results failed", exc_info=True)


def get_perf_snapshot() -> Dict[str, Dict[str, int]]:
    """
    Return a deep-copied snapshot of current performance stats by bet category.
    Safe to call from the app for diagnostics.
    """
    with _PERF_LOCK:
        # Use JSON round-trip for a simple deep copy (only ints)
        return json.loads(json.dumps(_PERF_STATS))


def evaluate_spin(last_suggestion: Optional[Dict[str, Any]] = None, actual_spin: Optional[int] = None, spin: Optional[int] = None, **kwargs) -> Dict[str, Any]:
    """Evaluate the previous suggestion against the realized spin.

    Contract:
      - Always returns a dict.
      - Keys include: docenas, columnas, color, paridad, rango, max_conf, guardian_docena, primary
        and corresponding __raw keys.
      - Values are True/False/None (None when not evaluable / missing suggestion).
    """
    results: Dict[str, Any] = {}

    # accept alias `spin` used by some callers/tests
    if actual_spin is None and spin is not None:
        actual_spin = spin
    if actual_spin is None:
        return results

    # --- helpers ---
    def _safe_int(x):
        try:
            return int(x)
        except Exception:
            return None

    def _norm_str(x) -> str:
        try:
            return str(x).strip()
        except Exception:
            return ""

    def _docena_of(n: int):
        if n is None:
            return None
        if n == 0:
            return 0
        if 1 <= n <= 12:
            return 1
        if 13 <= n <= 24:
            return 2
        if 25 <= n <= 36:
            return 3
        return None

    def _col_of(n: int):
        if n is None:
            return None
        if n == 0:
            return 0
        if 1 <= n <= 36:
            return ((n - 1) % 3) + 1
        return None

    REDS = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}

    def _color_of(n: int):
        if n is None:
            return None
        if n == 0:
            return "verde"
        return "rojo" if n in REDS else "negro"

    def _parity_of(n: int):
        if n is None:
            return None
        if n == 0:
            return "cero"
        return "par" if (n % 2 == 0) else "impar"

    def _range_of(n: int):
        if n is None:
            return None
        if n == 0:
            return "cero"
        return "bajo" if 1 <= n <= 18 else "alto"

    def _extract_advice(decision: dict, bet_key: str):
        # Prefer bet_advice container if present
        ba = decision.get("bet_advice", {}) if isinstance(decision, dict) else {}
        v = ba.get(bet_key, None)
        if v is None:
            v = decision.get(bet_key, None)
        return v

    def _normalize_docena_label(s: str):
        import re as _re
        s = _norm_str(s).lower()
        # Rangos explícitos (robusto incluso si viene con '(p=...)')
        if '1-12' in s or '1 a 12' in s:
            return 1
        if '13-24' in s or '13 a 24' in s:
            return 2
        if '25-36' in s or '25 a 36' in s:
            return 3
        # Normaliza texto a dígitos
        s = s.replace('primera', '1').replace('segunda', '2').replace('tercera', '3')
        # Busca 'docena <n>'
        m = _re.search(r'docena\D*([123])', s)
        if m:
            return int(m.group(1))
        # Busca 1/2/3 como token independiente
        m = _re.search(r'\b([123])\b', s)
        if m:
            return int(m.group(1))
        return None

    def _normalize_col_label(s: str):
        import re as _re
        s = _norm_str(s).lower()
        s = s.replace('primera', '1').replace('segunda', '2').replace('tercera', '3')
        # Busca 'columna <n>'
        m = _re.search(r'columna\D*([123])', s)
        if m:
            return int(m.group(1))
        # Busca 'col <n>'
        m = _re.search(r'\bcol\s*([123])\b', s)
        if m:
            return int(m.group(1))
        # Busca 1/2/3 como token independiente
        m = _re.search(r'\b([123])\b', s)
        if m:
            return int(m.group(1))
        return None

    def _as_list(x):
        """Normaliza selecciones para evaluación.

        Soporta:
          - strings ("Docena 1-12", "Columna 2", etc.)
          - listas/tuplas de strings
          - listas/tuplas tipo (pick, prob)
          - listas de dicts con claves pick/group/label/name/selection
        """
        if x is None:
            return []

        # Si es lista/tupla/set: normalizamos cada item
        if isinstance(x, (list, tuple, set)):
            out = []
            for it in list(x):
                if it is None:
                    continue
                # (pick, prob) o [pick, prob]
                if isinstance(it, (list, tuple)) and len(it) >= 1:
                    out.extend(_as_list(it[0]))
                    continue
                # dict {pick/selection/...}
                if isinstance(it, dict):
                    cand = (
                        it.get("pick")
                        or it.get("group")
                        or it.get("label")
                        or it.get("name")
                        or it.get("selection")
                        or it.get("top_suggestion")
                        or it.get("value")
                    )
                    out.extend(_as_list(cand))
                    continue
                out.extend(_as_list(it))
            return out

        # split common separators for strings-ish
        s = _norm_str(x)
        if not s:
            return []
        if " / " in s:
            return [p.strip() for p in s.split(" / ") if p.strip()]
        if "," in s:
            return [p.strip() for p in s.split(",") if p.strip()]
        return [s]

    # --- begin ---
    a = _safe_int(actual_spin)
    if a is None or not (0 <= a <= 36):
        # still return evaluable structure
        for k in ["docenas","columnas","color","paridad","rango","max_conf","guardian_docena","guardian_columna","primary"]:
            results[k] = None
            results[k+"__raw"] = {"reason": "invalid_actual", "actual": actual_spin}
        return results

    last = last_suggestion if isinstance(last_suggestion, dict) else {}
    decision = last.get("decision", last) if isinstance(last.get("decision", last), dict) else {}
    analysis = last.get("suggestion_analysis", last.get("analysis", {}))
    if not isinstance(analysis, dict):
        analysis = {}

    # token anti-doble-conteo para guardianes (snapshot_count:spin)
    _snap = None
    try:
        for _k in ("snapshot_spins_count", "snapshot_count", "spins_count"):
            if isinstance(last, dict) and _k in last:
                _snap = last.get(_k)
                break
            if isinstance(decision, dict) and _k in decision:
                _snap = decision.get(_k)
                break
    except Exception:
        _snap = None
    try:
        _token_guard = f"{int(_snap)}:{int(actual_spin)}" if _snap is not None else str(int(actual_spin))
    except Exception:
        _token_guard = ""

    # ---- DOCENAS ----
    doc_raw = _extract_advice(decision, "docenas")
    doc_sel = None
    if isinstance(doc_raw, dict):
        doc_sel = doc_raw.get("selection", None)
    # suggested picks list
    doc_picks = []
    if doc_sel is not None:
        doc_picks = _as_list(doc_sel)
    elif isinstance(doc_raw, dict):
        doc_picks = _as_list(doc_raw.get("picks", None)) or _as_list(doc_raw.get("pick", None)) or _as_list(doc_raw.get("top2", None))
    else:
        doc_picks = _as_list(doc_raw)


    # Prefer IDs numéricos si están disponibles (poda: evita parseo frágil de strings)
    doc_selection_ids = []
    try:
        _ba = decision.get("bet_advice", {}) if isinstance(decision, dict) else {}
        _da = _ba.get("docenas", {}) if isinstance(_ba, dict) else {}
        _si = _da.get("selection_ids", None) or _da.get("pick_ids", None)
        if isinstance(_si, (list, tuple)):
            doc_selection_ids = [int(x) for x in _si if int(x) in (1,2,3)]
    except Exception:
        doc_selection_ids = []
    doc_norm = [ _normalize_docena_label(x) for x in doc_picks ]
    doc_norm = [x for x in doc_norm if x is not None]
    doc_actual = _docena_of(a)
    # Fallback: si no hay picks en bet_advice, usamos snapshot (analysis) para docenas
    if doc_actual is not None and not doc_norm and isinstance(analysis.get("docenas", None), dict):
        snap_doc = analysis.get("docenas", {}) or {}
        cand_names: List[str] = []
        top2 = snap_doc.get("top_2_suggestions", None)
        if isinstance(top2, list):
            for it in top2:
                if isinstance(it, (list, tuple)) and len(it) >= 1 and isinstance(it[0], str):
                    cand_names.append(it[0])
        if not cand_names:
            ts = snap_doc.get("top_suggestion", None)
            if isinstance(ts, str) and ts:
                cand_names.append(ts)
        if not cand_names:
            probs = snap_doc.get("probabilities", None)
            if isinstance(probs, dict) and probs:
                ranked = sorted(
                    [(k, float(v)) for k, v in probs.items() if isinstance(k, str)],
                    key=lambda x: x[1],
                    reverse=True,
                )
                for k, _ in ranked[:2]:
                    if k not in cand_names:
                        cand_names.append(k)
        doc_norm = [_normalize_docena_label(x) for x in cand_names]
        doc_norm = [x for x in doc_norm if x is not None]
    doc_hit = None
    if doc_actual is not None:
        if doc_selection_ids:
            doc_hit = (doc_actual in doc_selection_ids)
        elif doc_norm:
            doc_hit = (doc_actual in doc_norm)
    results["docenas"] = doc_hit
    results["docenas__raw"] = {"actual_spin": a, "actual_docena": doc_actual, "picks": doc_picks, "norm": doc_norm, "selection": doc_sel}

    # ---- COLUMNAS ----
    col_raw = _extract_advice(decision, "columnas")
    col_sel = None
    if isinstance(col_raw, dict):
        col_sel = col_raw.get("selection", None)
    col_picks = []
    if col_sel is not None:
        col_picks = _as_list(col_sel)
    elif isinstance(col_raw, dict):
        col_picks = _as_list(col_raw.get("picks", None)) or _as_list(col_raw.get("pick", None)) or _as_list(col_raw.get("top2", None))
    else:
        col_picks = _as_list(col_raw)


    # Prefer IDs numéricos si están disponibles (poda: evita parseo frágil de strings)
    col_selection_ids = []
    try:
        _ba = decision.get("bet_advice", {}) if isinstance(decision, dict) else {}
        _ca = _ba.get("columnas", {}) if isinstance(_ba, dict) else {}
        _si = _ca.get("selection_ids", None) or _ca.get("pick_ids", None)
        if isinstance(_si, (list, tuple)):
            col_selection_ids = [int(x) for x in _si if int(x) in (1,2,3)]
    except Exception:
        col_selection_ids = []
    col_norm = [ _normalize_col_label(x) for x in col_picks ]
    col_norm = [x for x in col_norm if x is not None]
    col_actual = _col_of(a)
    # Fallback: si no hay picks en bet_advice, usamos snapshot (analysis) para columnas
    if col_actual is not None and not col_norm and isinstance(analysis.get("columnas", None), dict):
        snap_col = analysis.get("columnas", {}) or {}
        cand_names: List[str] = []
        top2c = snap_col.get("top_2_suggestions", None)
        if isinstance(top2c, list):
            for it in top2c:
                if isinstance(it, (list, tuple)) and len(it) >= 1 and isinstance(it[0], str):
                    cand_names.append(it[0])
        if not cand_names:
            ts = snap_col.get("top_suggestion", None)
            if isinstance(ts, str) and ts:
                cand_names.append(ts)
        if not cand_names:
            probs = snap_col.get("probabilities", None)
            if isinstance(probs, dict) and probs:
                ranked = sorted(
                    [(k, float(v)) for k, v in probs.items() if isinstance(k, str)],
                    key=lambda x: x[1],
                    reverse=True,
                )
                for k, _ in ranked[:2]:
                    if k not in cand_names:
                        cand_names.append(k)
        col_norm = [_normalize_col_label(x) for x in cand_names]
        col_norm = [x for x in col_norm if x is not None]
    col_hit = None
    if col_actual is not None:
        if col_selection_ids:
            col_hit = (col_actual in col_selection_ids)
        elif col_norm:
            col_hit = (col_actual in col_norm)
    results["columnas"] = col_hit
    results["columnas__raw"] = {"actual_spin": a, "actual_columna": col_actual, "picks": col_picks, "norm": col_norm, "selection": col_sel}

    # ---- COLOR ----
    color_raw = _extract_advice(decision, "color")
    color_pick = None
    if isinstance(color_raw, dict):
        color_pick = color_raw.get("selection", None) or color_raw.get("pick", None)
    else:
        color_pick = color_raw
    color_pick_s = _norm_str(color_pick).lower()
    if "roj" in color_pick_s:
        color_pick_s = "rojo"
    elif "neg" in color_pick_s:
        color_pick_s = "negro"
    elif "verd" in color_pick_s or color_pick_s == "0":
        color_pick_s = "verde"
    else:
        color_pick_s = color_pick_s or None
    color_actual = _color_of(a)
    color_hit = None
    if color_pick_s and color_actual:
        color_hit = (color_pick_s == color_actual)
    results["color"] = color_hit
    results["color__raw"] = {"actual_spin": a, "actual_color": color_actual, "pick": color_pick}

    # ---- PARIDAD ----
    par_raw = _extract_advice(decision, "paridad")
    par_pick = None
    if isinstance(par_raw, dict):
        par_pick = par_raw.get("selection", None) or par_raw.get("pick", None)
    else:
        par_pick = par_raw
    par_pick_s = _norm_str(par_pick).lower()
    if "par" in par_pick_s and "im" not in par_pick_s:
        par_pick_s = "par"
    elif "im" in par_pick_s:
        par_pick_s = "impar"
    else:
        par_pick_s = par_pick_s or None
    par_actual = _parity_of(a)
    par_hit = None
    if par_pick_s and par_actual:
        par_hit = (par_pick_s == par_actual)
    results["paridad"] = par_hit
    results["paridad__raw"] = {"actual_spin": a, "actual_paridad": par_actual, "pick": par_pick}

    # ---- RANGO ----
    rng_raw = _extract_advice(decision, "rango")
    rng_pick = None
    if isinstance(rng_raw, dict):
        rng_pick = rng_raw.get("selection", None) or rng_raw.get("pick", None)
    else:
        rng_pick = rng_raw
    rng_pick_s = _norm_str(rng_pick).lower()
    if "alt" in rng_pick_s:
        rng_pick_s = "alto"
    elif "baj" in rng_pick_s:
        rng_pick_s = "bajo"
    else:
        rng_pick_s = rng_pick_s or None
    rng_actual = _range_of(a)
    rng_hit = None
    if rng_pick_s and rng_actual:
        rng_hit = (rng_pick_s == rng_actual)
    results["rango"] = rng_hit
    results["rango__raw"] = {"actual_spin": a, "actual_rango": rng_actual, "pick": rng_pick}

    # ---- MAX_CONF ----
    max_raw = _extract_advice(decision, "max_conf")
    # Apuesta de máxima confianza: puede referirse a otra categoría o a un conjunto de números.
    max_hit = None
    if isinstance(max_raw, dict):
        sel = max_raw.get("selection", None) or max_raw.get("pick", None) or max_raw.get("numbers", None)
        bet_key = max_raw.get("bet_key", None) or max_raw.get("category", None)
        results["max_conf_selection"] = sel
        # Si apunta directamente a otra categoría conocida, reutilizamos ese hit
        if bet_key in ("docenas", "columnas", "color", "paridad", "rango"):
            max_hit = results.get(bet_key, None)
        else:
            # Puede ser un solo número o una colección de números
            if isinstance(sel, (list, tuple, set)):
                nums: set[int] = set()
                for x in sel:
                    sx = _safe_int(x)
                    if sx is not None and 0 <= sx <= 36:
                        nums.add(sx)
                if nums:
                    max_hit = (a in nums)
            else:
                sn = _safe_int(sel)
                if sn is not None and 0 <= sn <= 36:
                    max_hit = (sn == a)
    else:
        sel = max_raw
        sn = _safe_int(sel)
        if sn is not None and 0 <= sn <= 36:
            max_hit = (sn == a)
    results["max_conf"] = max_hit
    results["max_conf__raw"] = {"actual_spin": a, "raw": max_raw}

    # ---- GUARDIAN DOCENA ----
    gd_hit = None
    # preferimos el bloque estructurado 'guardian' en la decisión
    guardian = decision.get("guardian", None)
    if guardian is None:
        # compatibilidad con llaves planas antiguas
        guardian = {
            "pick": decision.get("apuesta_guardian") or decision.get("guardian_suggested") or decision.get("guardian_docena"),
            "edge": decision.get("guardian_edge"),
            "status": decision.get("guardian_status"),
        }
    pick = None
    if isinstance(guardian, dict):
        pick = guardian.get("pick", None) or guardian.get("docena", None) or guardian.get("selection", None) or guardian.get("label", None)
    else:
        pick = guardian
    gd_norm = _normalize_docena_label(pick)
    gd_actual = _docena_of(a)
    # Política A (producto): el Guardián solo cuenta cuando está realmente 'jugando'.
    # Definición operativa: status en (BET, PROBE) y acción global en (EXPLOIT, PROBE).
    _g_status = None
    try:
        if isinstance(guardian, dict):
            _g_status = guardian.get("status", None)
    except Exception:
        _g_status = None
    if _g_status is None:
        _g_status = decision.get("guardian_status", None) if isinstance(decision, dict) else None
    _g_status_u = str(_g_status).upper().strip() if _g_status is not None else ""
    _g_action_u = str(decision.get("final_action", decision.get("action", "OBSERVE"))).upper().strip() if isinstance(decision, dict) else "OBSERVE"
    _guardian_active = (_g_status_u in ("BET", "PROBE")) and (_g_action_u in ("EXPLOIT", "PROBE"))

    # IMPORTANTE: el Guardián debe contabilizarse SIEMPRE que exista un pick evaluable.
    # El estado BET/PROBE/WAIT afecta la recomendación de apostar, pero NO debe bloquear el registro
    # de aciertos/errores cuando el pick está presente (requisito de app.py: result True/False para contar).
    if (gd_norm is not None) and (gd_actual is not None):
        gd_hit = (gd_norm == gd_actual)
    else:
        gd_hit = None
    results["guardian_docena"] = gd_hit
    results["guardian_docena__raw"] = {"actual_spin": a, "actual_docena": gd_actual, "pick": pick, "norm": gd_norm}

    # alimentar GuardianDocenaCore (estado vivo) solo si evaluable
    if gd_hit is True or gd_hit is False:
        try:
            _gd_edge = None
            if isinstance(guardian, dict):
                _gd_edge = guardian.get("edge", None)
                if _gd_edge is None:
                    _gd_edge = guardian.get("edge_raw", None)
            if _gd_edge is None:
                _gd_edge = 0.0
            _GUARDIAN_CORE.observe(pick_norm=gd_norm, hit=bool(gd_hit), edge=float(_gd_edge or 0.0), token=_token_guard)
            # guarda fuerte para que el sidebar refleje estado en vivo
            try:
                _GUARDIAN_CORE._save_state(force=True)
            except Exception:
                pass
        except Exception:
            pass
    # ---- GUARDIAN COLUMNA ----
    gcol = None
    try:
        gcol = decision.get("guardian_columna", None)
        if gcol is None:
            gcol = decision.get("guardian_columna_state", None)
    except Exception:
        gcol = None

    col_pick = None
    if isinstance(gcol, dict):
        col_pick = gcol.get("pick", None) or gcol.get("columna", None) or gcol.get("selection", None) or gcol.get("label", None)
    else:
        col_pick = gcol

    gc_norm = _normalize_col_label(col_pick) if col_pick is not None else None
    gc_actual = None if a == 0 else columna_of(a)

    if (gc_norm is not None) and (gc_actual is not None):
        gc_hit = (gc_norm == gc_actual)
    else:
        gc_hit = None

    results["guardian_columna"] = gc_hit
    results["guardian_columna__raw"] = {"actual_spin": a, "actual_columna": gc_actual, "pick": col_pick, "norm": gc_norm}

    # alimentar GuardianColumnaCore (estado vivo) solo si evaluable
    if gc_hit is True or gc_hit is False:
        try:
            _gc_edge = None
            if isinstance(gcol, dict):
                _gc_edge = gcol.get("edge", None)
                if _gc_edge is None:
                    _gc_edge = gcol.get("edge_raw", None)
            if _gc_edge is None:
                _gc_edge = 0.0
            _GUARDIAN_COL_CORE.observe(pick=gc_norm, hit=gc_hit, edge=float(_gc_edge or 0.0), token=_token_guard, spin=int(spin) if spin is not None else None)
            try:
                _GUARDIAN_COL_CORE._save_state(force=True)
            except Exception:
                pass
        except Exception:
            pass

    # convenience keys esperadas por el app
    results["guardian"] = guardian
    results["apuesta_guardian"] = pick
    results["guardian_suggested"] = pick
    results["guardian_edge"] = guardian.get("edge") if isinstance(guardian, dict) else None

    # ---- PRIMARY ----
    primary = decision.get("primary_bet", None)
    p_hit = None
    if isinstance(primary, dict):
        nums = primary.get("numbers", None)
        if isinstance(nums, list) and nums:
            try:
                p_hit = (a in set(int(x) for x in nums))
            except Exception:
                p_hit = None
        else:
            # if primary references a category, reuse its hit
            bk = primary.get("bet_key", None)
            if bk in results:
                p_hit = results.get(bk, None)
            else:
                pk = primary.get("pick", None)
                sn = _safe_int(pk)
                if sn is not None and 0 <= sn <= 36:
                    p_hit = (sn == a)
    results["primary"] = p_hit
    results["primary__raw"] = {"actual_spin": a, "primary_bet": primary}

        # Optional: store meta primary explanation hook
    if isinstance(decision.get("meta_shadow"), dict):
        results["primary_meta"] = decision.get("meta_shadow")

    try:
        _perf_register_results(results)
    except Exception:
        # Never let perf tracking break evaluation
        logger.debug("evaluate_spin perf registration failed", exc_info=True)

        # Coverage/quality governor update (primary action equilibrium)
    try:
        if "_COVERAGE_GOV" in globals() and isinstance(decision, dict) and isinstance(results, dict):
            _p_g = decision.get("params") if isinstance(decision.get("params"), dict) else {}
            _COVERAGE_GOV.observe(decision, results, params=_p_g)
    except Exception:
        logger.debug("evaluate_spin governor update failed", exc_info=True)

    # Risk control update (BET-only circuit breaker)
    try:
        if "_RISK_CORE" in globals() and isinstance(decision, dict) and isinstance(results, dict):
            _p = decision.get("params") if isinstance(decision.get("params"), dict) else {}
            _spins_any = kwargs.get("spins", None)
            if _spins_any is None:
                _spins_any = kwargs.get("full_spins_for_drift") or kwargs.get("full_spins") or kwargs.get("spins_history")
            if isinstance(_spins_any, list):
                _p.setdefault("spins_len", len(_spins_any))
            if isinstance(decision.get("snapshot_spins_count"), int):
                _p.setdefault("snapshot_spins_count", decision.get("snapshot_spins_count"))
            _RISK_CORE.observe(decision, results, params=_p)
    except Exception:
        logger.debug("evaluate_spin risk observation failed", exc_info=True)

    return results















# -----------------------------------------------------------------------------
# Docena analysis (debug panel)
# -----------------------------------------------------------------------------
def _docena_of_str(n: int) -> Optional[str]:
    n = int(n)
    if n == 0:
        return None
    if 1 <= n <= 12:
        return "1-12"
    if 13 <= n <= 24:
        return "13-24"
    if 25 <= n <= 36:
        return "25-36"
    return None


def analyze_recent_docena(spins: List[int], window: int = 30) -> Dict[str, Any]:
    """
    Analiza el comportamiento reciente por docenas.

    Devuelve:
      - window: cantidad de giros considerados
      - counts: conteo por docena
      - freqs: frecuencia relativa por docena
      - runs: lista de (docena, longitud_racha)
      - longest_run: racha más larga de una misma docena
      - zscore: z-score de cada docena respecto a la media de frecuencias
      - repeat_rate: proporción de veces que se repite la MISMA docena contra el giro anterior
      - avg_run_length: longitud media de las rachas
    """
    s = _clean_spins(spins)
    if len(s) == 0:
        return {}

    recent = s[-window:] if len(s) > window else list(s)
    docenas = [_docena_of_str(x) for x in recent]

    # Conteos y frecuencias (solo docenas válidas)
    counts = Counter(docenas)
    total_valid = sum(1 for d in docenas if d in ("1-12", "13-24", "25-36"))
    freqs = {
        k: counts.get(k, 0) / max(1, total_valid)
        for k in ("1-12", "13-24", "25-36")
    }

    # Rachas de docenas
    runs: List[Tuple[Optional[str], int]] = []
    if docenas:
        current = docenas[0]
        length = 1
        for d in docenas[1:]:
            if d == current:
                length += 1
            else:
                runs.append((current, length))
                current = d
                length = 1
        runs.append((current, length))
    longest_run = max((r[1] for r in runs if r[0] is not None), default=0)

    # Tasa de repetición docena actual vs anterior
    same = 0
    denom = 0
    if len(docenas) > 1:
        for i in range(1, len(docenas)):
            d_prev = docenas[i - 1]
            d_cur = docenas[i]
            if d_prev is None or d_cur is None:
                continue
            denom += 1
            if d_prev == d_cur:
                same += 1
    repeat_rate = float(same) / float(denom or 1)

    # Longitud media de rachas
    avg_run_length = float(np.mean([r[1] for r in runs])) if runs else 0.0

    vals = np.array(
        [freqs.get("1-12", 0.0), freqs.get("13-24", 0.0), freqs.get("25-36", 0.0)],
        dtype=float,
    )
    mu = float(vals.mean())
    sigma = float(vals.std()) if float(vals.std()) > 0 else 1e-6
    z = {
        "1-12": float((vals[0] - mu) / sigma),
        "13-24": float((vals[1] - mu) / sigma),
        "25-36": float((vals[2] - mu) / sigma),
    }

    return {
        "window": len(recent),
        "counts": dict(counts),
        "freqs": freqs,
        "runs": runs,
        "longest_run": int(longest_run),
        "zscore": z,
        "repeat_rate": float(repeat_rate),
        "avg_run_length": float(avg_run_length),
    }

def _color_of(n: int) -> Optional[str]:
    """Devuelve 'R', 'B' o None según el color del número."""
    try:
        n = int(n)
    except Exception:
        return None
    if n == 0:
        return None
    if n in RED_SET:
        return "R"
    if n in BLACK_SET:
        return "B"
    return None


def analyze_recent_color(spins: List[int], window: int = 30) -> Dict[str, Any]:
    """
    Analiza el comportamiento reciente por colores (Rojo/Negro).

    Devuelve estructura similar a analyze_recent_docena con:
      - repeat_rate: proporción de repeticiones de color
      - avg_run_length: longitud media de rachas de color
    """
    s = _clean_spins(spins)
    if len(s) == 0:
        return {}

    recent = s[-window:] if len(s) > window else list(s)
    cols = [_color_of(x) for x in recent]

    counts = Counter(cols)
    total_valid = sum(1 for c in cols if c in ("R", "B"))
    freqs = {
        "R": counts.get("R", 0) / max(1, total_valid),
        "B": counts.get("B", 0) / max(1, total_valid),
    }

    runs: List[Tuple[Optional[str], int]] = []
    if cols:
        current = cols[0]
        length = 1
        for c in cols[1:]:
            if c == current:
                length += 1
            else:
                runs.append((current, length))
                current = c
                length = 1
        runs.append((current, length))
    longest_run = max((r[1] for r in runs if r[0] is not None), default=0)

    same = 0
    denom = 0
    if len(cols) > 1:
        for i in range(1, len(cols)):
            c_prev = cols[i - 1]
            c_cur = cols[i]
            if c_prev is None or c_cur is None:
                continue
            denom += 1
            if c_prev == c_cur:
                same += 1
    repeat_rate = float(same) / float(denom or 1)
    avg_run_length = float(np.mean([r[1] for r in runs])) if runs else 0.0

    vals = np.array([freqs.get("R", 0.0), freqs.get("B", 0.0)], dtype=float)
    mu = float(vals.mean())
    sigma = float(vals.std()) if float(vals.std()) > 0 else 1e-6
    z = {
        "R": float((vals[0] - mu) / sigma),
        "B": float((vals[1] - mu) / sigma),
    }

    return {
        "window": len(recent),
        "counts": dict(counts),
        "freqs": freqs,
        "runs": runs,
        "longest_run": int(longest_run),
        "zscore": z,
        "repeat_rate": float(repeat_rate),
        "avg_run_length": float(avg_run_length),
    }


def detect_persistence_modes(
    spins: List[int],
    analysis: Optional[Dict[str, Any]],
    params: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Detecta regímenes de persistencia / anti-persistencia en docenas y color.
    Retorna:
      - docena_mode: "NEUTRO" | "ANTI_PERSISTENTE" | "STICKY"
      - color_mode:  "NEUTRO" | "ANTI_PERSISTENTE" | "STICKY"
      - guardian_miss_streak
      - docena_stats / color_stats (salidas de analyze_recent_*)
    """
    if params is None:
        params = {}
    analysis = analysis or {}

    s_clean = _clean_spins(spins)
    if len(s_clean) == 0:
        return {
            "docena_mode": "NEUTRO",
            "color_mode": "NEUTRO",
            "guardian_miss_streak": 0,
            "docena_stats": {},
            "color_stats": {},
        }

    # Ventanas configurables (con límites razonables)
    doc_w = int(params.get("mode_docena_window", params.get("chaos_drift_window", 200)))
    col_w = int(params.get("mode_color_window", 50))
    doc_w = max(10, min(400, doc_w))
    col_w = max(10, min(200, col_w))

    doc_stats = analyze_recent_docena(s_clean, window=doc_w)
    color_stats = analyze_recent_color(s_clean, window=col_w)

    # Guardian miss_streak
    guardian_miss = 0
    try:
        gd = analysis.get("guardian_docena", {}) or {}
        if isinstance(gd, dict):
            guardian_miss = int(
                gd.get("miss_streak")
                or gd.get("guardian_miss_streak")
                or (gd.get("guardian_meta", {}) or {}).get("miss_streak", 0)
                or 0
            )
    except Exception:
        guardian_miss = 0

    doc_repeat = float(doc_stats.get("repeat_rate", 0.0) or 0.0)
    doc_longest = int(doc_stats.get("longest_run", 0) or 0)
    color_repeat = float(color_stats.get("repeat_rate", 0.0) or 0.0)
    color_longest = int(color_stats.get("longest_run", 0) or 0)

    anti_th_doc = float(params.get("mode_docena_anti_repeat", 0.22))
    sticky_th_doc = float(params.get("mode_docena_sticky_repeat", 0.55))
    miss_min_doc = int(params.get("mode_docena_miss_min", 6))
    long_run_doc = int(params.get("mode_docena_long_run", 4))

    anti_th_col = float(params.get("mode_color_anti_repeat", 0.22))
    sticky_th_col = float(params.get("mode_color_sticky_repeat", 0.60))
    long_run_col = int(params.get("mode_color_long_run", 4))

    docena_mode = "NEUTRO"
    eff_doc_w = int(doc_stats.get("window", 0) or 0)
    if eff_doc_w >= max(12, miss_min_doc * 2):
        if (doc_repeat < anti_th_doc) and (guardian_miss >= miss_min_doc):
            docena_mode = "ANTI_PERSISTENTE"
        elif (doc_repeat > sticky_th_doc) or (doc_longest >= long_run_doc):
            docena_mode = "STICKY"

    color_mode = "NEUTRO"
    eff_col_w = int(color_stats.get("window", 0) or 0)
    if eff_col_w >= 12:
        if color_repeat < anti_th_col:
            color_mode = "ANTI_PERSISTENTE"
        elif (color_repeat > sticky_th_col) or (color_longest >= long_run_col):
            color_mode = "STICKY"

    return {
        "docena_mode": docena_mode,
        "color_mode": color_mode,
        "guardian_miss_streak": int(guardian_miss),
        "docena_stats": doc_stats,
        "color_stats": color_stats,
    }


# =============================================================================
# ADVANCED OPTIMIZATIONS — Added functions (aditivas, no tocan flujo existente)
# =============================================================================

# --- MEJORA 1: Kelly Generalizado por Tipo de Apuesta ---

def kelly_fraction_generalized(p: float, bet_type: str) -> float:
    """Compute optimal Kelly fraction for any bet type.

    Args:
        p: estimated probability of winning
        bet_type: 'simple' (1:1), 'group3_top1' (2:1), 'group3_top2' (0.5:1 net), 'numbers_12' (2:1 net)

    Returns:
        f*: optimal fraction of bankroll (0.0 if negative edge)
    """
    try:
        p = float(p)
        if p <= 0 or p >= 1:
            return 0.0

        if bet_type == "simple":
            # color/paridad/rango: payout 1:1, f* = 2p - 1
            f = 2.0 * p - 1.0
        elif bet_type == "group3_top1":
            # docena/columna single: payout 2:1, f* = (3p - 1) / 2
            f = (3.0 * p - 1.0) / 2.0
        elif bet_type == "group3_top2":
            # docena/columna TOP-2: bet 2u, win 3u, net 1u on hit, lose 2u on miss
            # f* = (3p - 2) / (2(1-p))  [for p > 2/3]
            if p <= 2.0 / 3.0:
                return 0.0
            f = (3.0 * p - 2.0) / (2.0 * (1.0 - p))
        elif bet_type == "numbers_12":
            # 12 numbers: bet 12u, any hit pays 36u (net +24u), miss loses 12u
            # Effective payout b = 24/12 = 2:1, f* = (3p - 1) / 2
            f = (3.0 * p - 1.0) / 2.0
        else:
            # fallback to simple
            f = 2.0 * p - 1.0

        return max(0.0, min(1.0, float(f)))
    except Exception:
        return 0.0


def kelly_with_bayesian_uncertainty(p_hat: float, sigma_p: float, bet_type: str,
                                     kelly_mult: float = 0.5) -> float:
    """Fractional Kelly adjusted by Bayesian uncertainty.

    f_adjusted = f*(p_hat) * kelly_mult * max(0, 1 - sigma_p / p_hat)

    When uncertainty is high (sigma_p large relative to p_hat), the fraction
    shrinks automatically.  kelly_mult=0.5 is half-Kelly (conservative default).
    """
    try:
        f_star = kelly_fraction_generalized(p_hat, bet_type)
        if f_star <= 0 or sigma_p <= 0 or p_hat <= 0:
            return max(0.0, f_star * kelly_mult)
        uncertainty_discount = max(0.0, 1.0 - float(sigma_p) / float(p_hat))
        return max(0.0, min(1.0, f_star * kelly_mult * uncertainty_discount))
    except Exception:
        return 0.0


# --- MEJORA 2: Bayesian Edge Credible Interval ---

def bayesian_edge_ci(counts: list, group_idx: int, baseline: float,
                     alpha: float = 1.0, ci_level: float = 0.95) -> dict:
    """Compute Bayesian credible interval for the edge of a group.

    Uses Dirichlet-Multinomial posterior:
        P(theta | counts) = Dir(theta; alpha + counts)

    Args:
        counts: list of observed counts per group (e.g., [45, 52, 53] for 3 docenas)
        group_idx: which group to analyze (0-indexed)
        baseline: theoretical baseline probability (e.g., 12/37 for single docena)
        alpha: Dirichlet prior concentration (1.0 = uniform)
        ci_level: credible interval level (0.95 = 95%)

    Returns:
        dict with keys: mean, std, ci_lower, ci_upper, edge_mean, edge_ci_lower, significant
    """
    try:
        counts = [float(c) for c in counts]
        K = len(counts)
        N = sum(counts)
        if N <= 0 or K <= 0 or group_idx >= K:
            return {"mean": float(baseline), "std": 0.0, "ci_lower": float(baseline),
                    "ci_upper": float(baseline), "edge_mean": 0.0, "edge_ci_lower": 0.0,
                    "significant": False}

        alpha_post = alpha + counts[group_idx]
        alpha_sum = K * alpha + N

        mean = float(alpha_post / alpha_sum)
        var = mean * (1.0 - mean) / (alpha_sum + 1.0)
        std = float(math.sqrt(var)) if var > 0 else 0.0

        z = 1.96 if ci_level >= 0.95 else (2.576 if ci_level >= 0.99 else 1.645)
        ci_lower = float(mean - z * std)
        ci_upper = float(mean + z * std)

        edge_mean = float(mean - baseline)
        edge_ci_lower = float(ci_lower - baseline)

        return {
            "mean": mean,
            "std": std,
            "ci_lower": ci_lower,
            "ci_upper": ci_upper,
            "edge_mean": edge_mean,
            "edge_ci_lower": edge_ci_lower,
            "significant": bool(edge_ci_lower > 0),
        }
    except Exception:
        return {"mean": 0.0, "std": 0.0, "ci_lower": 0.0, "ci_upper": 0.0,
                "edge_mean": 0.0, "edge_ci_lower": 0.0, "significant": False}


def bayesian_edge_for_top2(counts: list, top2_indices: list, baseline_top2: float,
                           alpha: float = 1.0, ci_level: float = 0.95) -> dict:
    """Bayesian CI for TOP-2 group (e.g., docenas TOP-2 = 24 numbers combined)."""
    try:
        K = len(counts)
        N = sum(counts)
        if N <= 0:
            return bayesian_edge_ci(counts, 0, baseline_top2, alpha, ci_level)

        top2_count = sum(counts[i] for i in top2_indices if i < K)
        rest_count = N - top2_count
        # Treat as binomial: TOP-2 vs rest
        alpha_top2 = alpha + top2_count
        alpha_rest = alpha + rest_count
        alpha_sum = alpha_top2 + alpha_rest

        mean = float(alpha_top2 / alpha_sum)
        var = mean * (1.0 - mean) / (alpha_sum + 1.0)
        std = float(math.sqrt(var)) if var > 0 else 0.0

        z = 1.96 if ci_level >= 0.95 else 2.576
        ci_lower = float(mean - z * std)
        edge_ci_lower = float(ci_lower - baseline_top2)

        return {
            "mean": mean, "std": std, "ci_lower": ci_lower,
            "ci_upper": float(mean + z * std),
            "edge_mean": float(mean - baseline_top2),
            "edge_ci_lower": edge_ci_lower,
            "significant": bool(edge_ci_lower > 0),
        }
    except Exception:
        return {"mean": 0.0, "std": 0.0, "ci_lower": 0.0, "ci_upper": 0.0,
                "edge_mean": 0.0, "edge_ci_lower": 0.0, "significant": False}


# --- MEJORA 3: CUSUM Monitor por Categoría ---

class CUSUMMonitor:
    """Cumulative Sum monitor for detecting mean shifts in hit rates.

    One CUSUM instance per bet category.  Call observe(hit: bool) after each
    evaluated BET.  When the cumulative sum exceeds threshold h, the alarm fires
    indicating the underlying hit rate has shifted.

    Page's CUSUM:  S_n = max(0, S_{n-1} + (x_n - mu_0 - k))
    where mu_0 is the baseline hit rate, k = sensitivity (default 0.5*sigma).
    """

    def __init__(self, baseline: float = 0.5, k: float = None, h: float = 5.0):
        self.baseline = float(baseline)
        sigma = math.sqrt(baseline * (1 - baseline)) if 0 < baseline < 1 else 0.25
        self.k = float(k) if k is not None else 0.5 * sigma
        self.h = float(h)
        self.S_pos = 0.0  # Detects increase in hit rate
        self.S_neg = 0.0  # Detects decrease in hit rate
        self.n = 0
        self.alarm_pos = False
        self.alarm_neg = False
        self._last_alarm_n = 0

    def observe(self, hit: bool) -> dict:
        x = 1.0 if hit else 0.0
        self.n += 1
        self.S_pos = max(0.0, self.S_pos + (x - self.baseline - self.k))
        self.S_neg = max(0.0, self.S_neg + (self.baseline - self.k - x))

        self.alarm_pos = self.S_pos > self.h
        self.alarm_neg = self.S_neg > self.h

        alarm = self.alarm_pos or self.alarm_neg
        if alarm:
            self._last_alarm_n = self.n

        return {
            "alarm": alarm,
            "alarm_pos": self.alarm_pos,  # Hit rate INCREASED
            "alarm_neg": self.alarm_neg,  # Hit rate DECREASED
            "S_pos": round(self.S_pos, 3),
            "S_neg": round(self.S_neg, 3),
            "n": self.n,
        }

    def reset(self):
        self.S_pos = 0.0
        self.S_neg = 0.0
        self.alarm_pos = False
        self.alarm_neg = False

    def state_dict(self) -> dict:
        return {"baseline": self.baseline, "k": self.k, "h": self.h,
                "S_pos": self.S_pos, "S_neg": self.S_neg, "n": self.n,
                "alarm_pos": self.alarm_pos, "alarm_neg": self.alarm_neg}


# Module-level CUSUM monitors (one per category)
_CUSUM_BASELINES = {
    "color": 18.0 / 37.0,
    "paridad": 18.0 / 37.0,
    "rango": 18.0 / 37.0,
    "docenas": 24.0 / 37.0,  # TOP-2
    "columnas": 24.0 / 37.0,
    "guardian_docena": 12.0 / 37.0,
    "guardian_columna": 12.0 / 37.0,
}
_CUSUM_MONITORS = {k: CUSUMMonitor(baseline=v, h=5.0) for k, v in _CUSUM_BASELINES.items()}


def cusum_observe(category: str, hit: bool) -> dict:
    """Observe a BET result for CUSUM monitoring. Returns alarm state."""
    mon = _CUSUM_MONITORS.get(category)
    if mon is None:
        return {"alarm": False}
    return mon.observe(hit)


def cusum_state_all() -> dict:
    """Get CUSUM state for all categories (for UI display)."""
    return {k: v.state_dict() for k, v in _CUSUM_MONITORS.items()}


def cusum_reset(category: str = None):
    """Reset CUSUM for a category or all."""
    if category and category in _CUSUM_MONITORS:
        _CUSUM_MONITORS[category].reset()
    elif category is None:
        for m in _CUSUM_MONITORS.values():
            m.reset()


# --- MEJORA 4: Backtest Walk-Forward ---

def backtest_walk_forward(replay_spins: list, block_size: int = 500,
                          params: dict = None) -> list:
    """Run walk-forward backtest over historical spins.

    For each fold i:
      - Train/warm on spins[0 : i*block_size + block_size]
      - Test on spins[i*block_size + block_size : (i+1)*block_size + block_size]
      - Measure: hit rates per category (BET only), PnL, drawdown

    This does NOT run in the critical path — call from sidebar/offline.

    Returns:
        List of fold results, each with hit_rate, pnl, drawdown, n_bets.
    """
    try:
        params = params or {}
        results = []
        total = len(replay_spins)
        if total < block_size * 2:
            return [{"error": f"Need {block_size * 2}+ spins, have {total}"}]

        n_folds = (total // block_size) - 1
        if n_folds < 1:
            return [{"error": "Not enough data for walk-forward"}]

        for fold in range(n_folds):
            train_end = (fold + 1) * block_size
            test_start = train_end
            test_end = min(test_start + block_size, total)
            if test_end - test_start < 50:
                break

            train_spins = replay_spins[:train_end]
            test_spins = replay_spins[test_start:test_end]

            # Compute P_fused from train data for each test spin
            fold_bets = 0
            fold_hits = 0
            fold_pnl = 0.0
            fold_max_dd = 0.0
            fold_peak = 0.0

            for i in range(30, len(test_spins)):
                window = test_spins[max(0, i - 150):i]
                if len(window) < 15:
                    continue
                actual = test_spins[i]

                # Simple frequency-based prediction (fast, no LSTM/NB overhead)
                counts = [0] * 37
                for s in window:
                    if 0 <= s <= 36:
                        counts[s] += 1
                total_w = len(window)
                if total_w == 0:
                    continue

                # Docenas TOP-2
                d_counts = [sum(counts[1:13]), sum(counts[13:25]), sum(counts[25:37])]
                d_sorted = sorted(enumerate(d_counts), key=lambda x: -x[1])
                top2_idx = [d_sorted[0][0], d_sorted[1][0]]
                top2_count = sum(d_counts[j] for j in top2_idx)
                top2_p = top2_count / total_w if total_w > 0 else 0.0
                edge = top2_p - 24.0 / 37.0

                if edge >= float(params.get("exploit_edge_group3", 0.016)) and top2_p >= float(params.get("doccol_top2_p_bet_min", 0.655)):
                    fold_bets += 1
                    # Check if actual falls in top2
                    actual_doc = 0 if 1 <= actual <= 12 else (1 if 13 <= actual <= 24 else 2)
                    if actual_doc in top2_idx and actual != 0:
                        fold_hits += 1
                        fold_pnl += 1.0  # net win per unit
                    else:
                        fold_pnl -= 2.0  # lose 2 units
                    fold_peak = max(fold_peak, fold_pnl)
                    fold_max_dd = max(fold_max_dd, fold_peak - fold_pnl)

            hr = fold_hits / fold_bets if fold_bets > 0 else 0.0
            results.append({
                "fold": fold,
                "train_size": train_end,
                "test_size": test_end - test_start,
                "n_bets": fold_bets,
                "hits": fold_hits,
                "hit_rate": round(hr, 4),
                "pnl": round(fold_pnl, 2),
                "max_drawdown": round(fold_max_dd, 2),
                "profit_factor": round(fold_hits * 1.0 / max(1, fold_bets - fold_hits) * 2.0, 3) if fold_bets > 0 else 0.0,
            })

        return results
    except Exception as e:
        return [{"error": str(e)}]


# -----------------------------------------------------------------------------
# GunnerMLEngine (wrapper) — safe + optional global learning
# -----------------------------------------------------------------------------
class GunnerMLEngine:
    """
    Engine instance.
    To get full adaptive learning:
      - Use engine_instance.em.combine(...) for predictions (it caches model probs)
      - After real spin: call engine_instance.register_spin(actual, full_spins_for_drift=spins)
    """

    def __init__(self, params: Optional[Dict[str, Any]] = None, model_dir: Optional[str] = None):
        self.params = params or {}

        self.strict_prediction_flow = bool(self.params.get('strict_prediction_flow', True))
        try:
            from sklearn.naive_bayes import MultinomialNB  # type: ignore
            self.nb_model = MultinomialNB(alpha=float(self.params.get("nb_alpha", 0.01)))
        except Exception:
            self.nb_model = None

        self.lstm_core = AdaptiveLSTMCore(
            sequence_len=int(self.params.get("lstm_sequence_len", 15)),
            hidden_units=int(self.params.get("lstm_hidden_units", 64)),
        )

        self.models = {"nb": self.nb_model, "lstm": self.lstm_core.model, "scaler": self.lstm_core.scaler}

        # Multi-tenant: use provided model_dir or fall back to global config
        model_dir = model_dir or self.params.get("_user_model_dir") or _cfg("MODEL_DIR", ".")
        os.makedirs(model_dir, exist_ok=True)
        self._model_dir = model_dir

        state_path = os.path.join(model_dir, _cfg("ADAPTIVE_STATE_FILE", "weights_state.json"))
        self.weight_core = AdaptiveWeightCore(
            model_names=["freq", "markov", "nb", "lstm"],
            eta=float(self.params.get("adaptive_eta", 0.5)),
            state_path=state_path,
            persist=bool(self.params.get("adaptive_persist", True)),
            drift_threshold=float(self.params.get("adaptive_drift_threshold", 0.45)),
            drift_reset_frac=float(self.params.get("adaptive_drift_reset_frac", 0.5)),
            save_interval=int(self.params.get("adaptive_save_interval", 200)),
        )

        self.em = EnsembleManager(self.models, self.params, weight_core=self.weight_core)
        self.inc_markov = IncrementalMarkov()
        self.inc_freq = IncrementalFreqDecay(lam=self.params.get("decay_lambda", 0.03), alpha_dir=self.params.get("alpha_dir", 1.0))
        self.em.inc_markov = self.inc_markov
        self.em.inc_freq = self.inc_freq

        replay_path = self.params.get("global_replay_path")
        if replay_path is None:
            replay_path = os.path.join(model_dir, "global_spins.jsonl")
        self.replay = GlobalReplayBuffer(path=str(replay_path), maxlen=int(self.params.get("global_replay_maxlen", 3_000)))

        # Seed incremental models from replay buffer so they don't start empty.
        # Without this, Markov and FreqDecay produce uniform distributions on a fresh
        # session even though weights_state.json says "trust freq/markov".
        # This feeds the last N spins from global_spins.jsonl through both models.
        try:
            seed_len = int(self.params.get("replay_seed_len", 50))
            replay_spins = self.replay.spins()
            if replay_spins and len(replay_spins) >= 10:
                seed = replay_spins[-seed_len:]
                for sp in seed:
                    try:
                        v = int(sp)
                        if 0 <= v <= 36:
                            self.inc_markov.update(v)
                            self.inc_freq.update(v)
                    except Exception:
                        continue
                logger.info(f"Seeded inc_markov/inc_freq with {len(seed)} spins from replay buffer.")
        except Exception:
            logger.debug("Replay seed failed (non-fatal)", exc_info=True)

        self.logger = logger
        self.logger.info("✅ GunnerMLEngine initialized (central weights + global replay).")

    def set_models(self, nb_model=None, lstm_model=None, scaler=None):
        if nb_model is not None:
            self.models["nb"] = nb_model
        if lstm_model is not None:
            if isinstance(lstm_model, AdaptiveLSTMCore):
                self.models["lstm"] = lstm_model.model
                self.models["scaler"] = lstm_model.scaler
            else:
                self.models["lstm"] = lstm_model
        if scaler is not None:
            self.models["scaler"] = scaler
        self.em.models = self.models

    @property
    def weights(self) -> np.ndarray:
        return self.em.weights_array()

    def predict_next(self, sequence: Optional[List[int]] = None) -> np.ndarray:
        spins = _clean_spins(sequence) if sequence is not None else list(self.em.memory)
        if len(spins) == 0:
            spins = self.replay.spins()
        if len(spins) == 0:
            return uniform_probs()
        return self.em.combine(spins, weights=None)

    def register_spin(
        self,
        actual: int,
        full_spins_for_drift: Optional[List[int]] = None,
        meta: Optional[dict] = None,
        pre_spin_sequence: Optional[List[int]] = None,
    ) -> dict:
        try:
            a = int(actual)
        except Exception:
            return {"success": False, "message": "invalid spin"}
        if not (0 <= a <= 36):
            return {"success": False, "message": "out of range"}

        # Safety mejorado:
        # Si no hay predicción cacheada (_last_model_probs), intentamos regenerarla SIEMPRE
        # usando la secuencia PRE-SPIN explícita cuando esté disponible.
        try:
            if getattr(self.em, "_last_model_probs", None) is None:
                if pre_spin_sequence is not None:
                    _ = self.predict_next(sequence=list(pre_spin_sequence))
                else:
                    msg = (
                        "register_spin llamado sin predicción previa ni pre_spin_sequence; "
                        "el flujo Predicción→Decisión→Evaluación no está garantizado.",
                    )
                    logger_obj = getattr(self, "logger", None)
                    if logger_obj is not None:
                        try:
                            logger_obj.warning(msg)
                        except Exception:
                            pass
                    if getattr(self, "strict_prediction_flow", False):
                        return {"success": False, "message": msg}
                    # Modo legacy: caemos al comportamiento anterior (usar memoria interna).
                    _ = self.predict_next(sequence=list(self.em.memory))
        except Exception:
            # Nunca dejar que un fallo en la regeneración de predicción rompa el registro del spin.
            pass

        self.replay.append(a, meta=meta)
        self.inc_markov.update(a)
        self.inc_freq.update(a)
        # WheelExpert: actualizar peso adaptativo segun si el sector predicho fue correcto
        try:
            _last_w = getattr(self.em, '_last_wheel_info', {}) or {}
            _pred_sector = str(_last_w.get('active_sector', '') or '')
            if _pred_sector:
                _WHEEL_EXPERT.register_outcome(_pred_sector, a)
        except Exception:
            pass
        return self.em.register_last_prediction(a, full_spins_for_drift=full_spins_for_drift)
    def analyze_table_health(self, history_log: list, window: int = 15) -> dict:
        try:
            if not history_log or len(history_log) < 3: raise ValueError
            recent = history_log[-window:]
            score_trend = []
            current_val = 50
            hits = 0
            for entry in recent:
                won = entry.get('net', 0) > 0 or entry.get('won', False) or str(entry.get('result','')).upper() == 'WIN'
                if won:
                    hits += 1; current_val += 5
                else:
                    current_val -= 4
                current_val = max(0, min(100, current_val))
                score_trend.append(current_val)

            hit_rate = (hits / len(recent)) * 100
            final_score = score_trend[-1]

            if final_score >= 65: s, c, i, m = "CONGRUENTE", "green", "🎯", "Patrones Claros"
            elif final_score >= 40: s, c, i, m = "INESTABLE", "orange", "⚠️", "Ruido Moderado"
            else: s, c, i, m = "CAÓTICO", "red", "⛔", "Alta Dispersión"

            return {"status": s, "score": final_score, "hit_rate": int(hit_rate), "trend": score_trend, "color": c, "msg": m, "icon": i}
        except:
            return {"status": "CALIBRANDO", "score": 50, "hit_rate": 0, "trend": [50]*window, "color": "gray", "msg": "Recopilando...", "icon": "⏳"}


    def drift_monitor_check(self, counters: dict, spins: List[int]):
        return drift_monitor_check(counters, spins)


    def perf_snapshot(self) -> Dict[str, Dict[str, int]]:
        """Expose module-level performance snapshot through the engine instance."""
        return get_perf_snapshot()
