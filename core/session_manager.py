"""
Session Manager for D.A.N.N.A.
================================
Reemplaza `st.session_state` (Streamlit) por un store por usuario que vive
en RAM y persiste snapshots a SQLite.

Filosofía:
  - Cada usuario tiene su propia UserSession (dict-like).
  - Las sesiones viven en RAM mientras están activas.
  - Cada N segundos (o al cerrar sesión) se hace snapshot a SQLite.
  - Al hacer login, si hay snapshot previo, se restaura.
  - Sesiones idle por más de IDLE_EVICT_SECONDS se liberan de RAM
    (su último snapshot queda en SQLite, se vuelve a cargar al volver).

Uso:
    from core.session_manager import session_manager

    # Obtener (o crear) sesión del usuario
    s = session_manager.get("gunner")
    s["spins"].append(17)
    s["counters"]["color"]["wins"] += 1

    # Forzar guardado (opcional — hay autosave)
    session_manager.save("gunner")

    # Reset completo (botón "RESET MESA")
    session_manager.reset("gunner")
"""

import os
import json
import time
import logging
import threading
import sqlite3
from typing import Any, Optional, Dict
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("session_manager")

# ── Config ────────────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("DANNA_DATA_DIR", str(Path(__file__).parent.parent))).resolve()
SESSIONS_DB = DATA_DIR / "danna_sessions.db"

# Tiempo de inactividad antes de evictar de RAM (snapshot queda en BD)
IDLE_EVICT_SECONDS = int(os.environ.get("DANNA_SESSION_IDLE_EVICT", str(30 * 60)))  # 30 min
# Autosave: cada cuánto guardar snapshot si la sesión cambia
AUTOSAVE_INTERVAL_SECONDS = int(os.environ.get("DANNA_AUTOSAVE_INTERVAL", "30"))    # 30 s
# Job de mantenimiento (evict + autosave) cada cuánto se corre
MAINTENANCE_INTERVAL_SECONDS = 60


# ── Defaults para una sesión nueva ────────────────────────────────
# Esto debe coincidir con lo que state.py de Streamlit inicializa.
# Las claves se mantienen idénticas para que la lógica de engine/pilot
# no necesite cambios.
BET_CATEGORIES = ["color", "paridad", "rango", "docenas", "columnas"]


def _default_counter() -> dict:
    return {
        "wins": 0,
        "losses": 0,
        "streak": 0,
        "max_streak": 0,
        "consec_errors": 0,
        "max_consec_errors": 0,
    }


def _default_session_state() -> dict:
    """
    Estructura inicial de una sesión. Esto refleja lo que tu state.py
    inicializa en st.session_state.

    NOTA: los modelos (lstm_model, nb_model) NO se guardan aquí — viven
    en RAM y se reconstruyen al iniciar la sesión. Esto es a propósito:
    serializar modelos sklearn/tensorflow a SQLite sería costoso y los
    modelos se reentrenan rápido con los spins de la sesión.
    """
    return {
        # ── Datos serializables (se guardan a BD) ───────────────
        "spins": [],
        "created_at": datetime.utcnow().isoformat(),
        "last_suggestion": None,
        "decision_log": [],

        # Parámetros del motor
        "min_start": 30,
        "window_long": 100,
        "window_short": 12,
        "alpha_dir": 1.0,
        "decay_lambda": 0.03,

        # Parámetros de decisión
        "L_max": 2,
        "M_pause": 4,
        "probe_frac": 0.25,
        "conf_threshold": 0.44,
        "p_min_ci": 0.30,
        "resync_threshold_k": 2,
        "H_cut": 3.0,
        "cfl_H_cut_doccol": 1.5,
        "cfl_H_cut_simples": 0.98,

        # NB
        "use_nb": True,
        "nb_classes": list(range(37)),
        "lstm_sequence_len": 15,
        "lstm_train_trigger": 500,
        "lstm_retrain_interval": 150,
        "lstm_last_train_spin": 0,

        # Bankroll
        "mode_shadow": True,
        "bankroll": 100000.0,
        "bankroll_initial": 100000.0,
        "max_bet_pct": 2.0,
        "stake_base": 250.0,
        "pause_until_spin": 0,
        "consec_losses": 0,
        "cum_loss": 0.0,

        # Contadores por categoría
        "counters": {k: _default_counter() for k in BET_CATEGORIES},

        # Live / Ensemble
        "parity_toggle": 0,
        "ensemble_weights": [1/3.0, 1/3.0, 1/3.0, 0.0],  # lista (numpy se reconstruye al usar)
        "ema_alpha": 0.25,
        "perf_history": [],
        "checkpoint_spins": 50,
        "bias_zscore_threshold": 2.0,
        "update_weights_every": 1,
        "live_mode": False,
        "live_count": 0,

        # Drift
        "drift_active": False,
        "drift_level": 0.0,
        "drift_log": [],
        "drift_threshold_warn": 0.25,
        "drift_threshold_block": 0.40,

        # Sanciones por categoría (sistema GOD)
        "category_sanctions": {},

        # Contadores GOD agregados
        "counters_god": {f"god_{k}": _default_counter() for k in BET_CATEGORIES},

        # ── In-memory only (NO se guardan a BD) ──────────────────
        # Se reconstruyen al cargar la sesión.
        # Estos atributos viven en _runtime_state, no en _state.
    }


# Claves que NUNCA se serializan a BD (objetos en RAM)
_NON_SERIALIZABLE_KEYS = {
    "lstm_model",
    "lstm_scaler",
    "nb_model",
    "_engine_instance",
    "_pilot_instance",
}


# ── UserSession ───────────────────────────────────────────────────
class UserSession:
    """
    Sesión por usuario. Funciona como dict.

    Compatibilidad con st.session_state:
        s = session_manager.get("user")
        s["spins"]          # lectura
        s["spins"] = [...]  # escritura
        s.get("foo", 0)
        "foo" in s
    """

    def __init__(self, user_id: str, initial_state: Optional[dict] = None):
        self.user_id = user_id
        self._state: dict = initial_state if initial_state is not None else _default_session_state()
        self._runtime: dict = {}    # objetos en RAM (modelos, instancias)
        self._dirty: bool = False
        self._last_save: float = time.time()
        self._last_access: float = time.time()
        self._lock = threading.RLock()

    # ── Dict-like ───────────────────────────────────────────────
    def __getitem__(self, key: str) -> Any:
        with self._lock:
            self._last_access = time.time()
            if key in self._runtime:
                return self._runtime[key]
            return self._state[key]

    def __setitem__(self, key: str, value: Any):
        with self._lock:
            self._last_access = time.time()
            if key in _NON_SERIALIZABLE_KEYS:
                self._runtime[key] = value
            else:
                self._state[key] = value
                self._dirty = True

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return key in self._state or key in self._runtime

    def __delitem__(self, key: str):
        with self._lock:
            if key in self._state:
                del self._state[key]
                self._dirty = True
            if key in self._runtime:
                del self._runtime[key]

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            self._last_access = time.time()
            if key in self._runtime:
                return self._runtime[key]
            return self._state.get(key, default)

    def setdefault(self, key: str, default: Any) -> Any:
        with self._lock:
            self._last_access = time.time()
            if key in _NON_SERIALIZABLE_KEYS:
                if key not in self._runtime:
                    self._runtime[key] = default
                return self._runtime[key]
            if key not in self._state:
                self._state[key] = default
                self._dirty = True
            return self._state[key]

    def update(self, *args, **kwargs):
        """Soporte para s.update({...}) y s.update(k=v)."""
        with self._lock:
            self._last_access = time.time()
            data: dict = {}
            if args:
                if len(args) > 1:
                    raise TypeError("update expected at most 1 positional argument")
                data.update(args[0])
            data.update(kwargs)
            for k, v in data.items():
                if k in _NON_SERIALIZABLE_KEYS:
                    self._runtime[k] = v
                else:
                    self._state[k] = v
                    self._dirty = True

    def keys(self):
        with self._lock:
            return list(self._state.keys()) + list(self._runtime.keys())

    def to_dict(self) -> dict:
        """Devuelve copia del state serializable (sin runtime)."""
        with self._lock:
            return dict(self._state)

    @property
    def is_dirty(self) -> bool:
        return self._dirty

    @property
    def idle_seconds(self) -> float:
        return time.time() - self._last_access


# ── SessionManager ────────────────────────────────────────────────
class SessionManager:
    """Singleton que mantiene todas las UserSession activas."""

    def __init__(self):
        self._sessions: Dict[str, UserSession] = {}
        self._lock = threading.RLock()
        self._ensure_db()
        self._maintenance_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    # ── BD setup ────────────────────────────────────────────────
    def _ensure_db(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = self._connect()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    user_id TEXT PRIMARY KEY,
                    state_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    spin_count INTEGER DEFAULT 0
                )
            """)
            conn.commit()
        finally:
            conn.close()
        log.info(f"Sessions DB lista en: {SESSIONS_DB}")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(SESSIONS_DB), timeout=10, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    # ── API pública ─────────────────────────────────────────────
    def get(self, user_id: str) -> UserSession:
        """Devuelve la sesión del usuario. Crea o restaura si no está en RAM."""
        user_id = str(user_id).strip().lower()
        with self._lock:
            sess = self._sessions.get(user_id)
            if sess is not None:
                return sess
            # No está en RAM — intentar restaurar de BD
            state = self._load_from_db(user_id)
            if state is None:
                state = _default_session_state()
                log.info(f"Sesión nueva para usuario '{user_id}'")
            else:
                log.info(f"Sesión restaurada de BD para usuario '{user_id}'")
            sess = UserSession(user_id, initial_state=state)
            self._sessions[user_id] = sess
            return sess

    def save(self, user_id: str, force: bool = False) -> bool:
        """Guarda snapshot a BD. Si force=False, solo guarda si está dirty."""
        user_id = str(user_id).strip().lower()
        with self._lock:
            sess = self._sessions.get(user_id)
            if sess is None:
                return False
            if not force and not sess.is_dirty:
                return False
            try:
                state_json = json.dumps(sess.to_dict(), default=_json_safe)
            except Exception as e:
                log.error(f"No pude serializar sesión de '{user_id}': {e}")
                return False
            conn = self._connect()
            try:
                conn.execute(
                    """INSERT INTO user_sessions (user_id, state_json, updated_at, spin_count)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(user_id) DO UPDATE SET
                           state_json = excluded.state_json,
                           updated_at = excluded.updated_at,
                           spin_count = excluded.spin_count""",
                    (
                        user_id,
                        state_json,
                        datetime.now(timezone.utc).isoformat(),
                        len(sess.get("spins", []) or []),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
            sess._dirty = False
            sess._last_save = time.time()
            return True

    def reset(self, user_id: str) -> UserSession:
        """Reset completo de la sesión (botón 'RESET MESA')."""
        user_id = str(user_id).strip().lower()
        with self._lock:
            new_state = _default_session_state()
            sess = UserSession(user_id, initial_state=new_state)
            self._sessions[user_id] = sess
            sess._dirty = True
            self.save(user_id, force=True)
            log.info(f"Sesión reseteada para '{user_id}'")
            return sess

    def evict(self, user_id: str) -> bool:
        """Saca la sesión de RAM (guarda snapshot antes)."""
        user_id = str(user_id).strip().lower()
        with self._lock:
            sess = self._sessions.get(user_id)
            if sess is None:
                return False
            if sess.is_dirty:
                self.save(user_id, force=True)
            del self._sessions[user_id]
            log.info(f"Sesión evictada de RAM: '{user_id}'")
            return True

    def list_active(self) -> list:
        """Lista usuarios con sesión en RAM (útil para monitoreo)."""
        with self._lock:
            return [
                {
                    "user_id": uid,
                    "spins": len(s.get("spins", []) or []),
                    "idle_seconds": int(s.idle_seconds),
                    "dirty": s.is_dirty,
                }
                for uid, s in self._sessions.items()
            ]

    # ── BD helpers ──────────────────────────────────────────────
    def _load_from_db(self, user_id: str) -> Optional[dict]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT state_json FROM user_sessions WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        try:
            state = json.loads(row["state_json"])
            # Asegurar que las claves nuevas existan (migración soft)
            base = _default_session_state()
            for k, v in base.items():
                if k not in state:
                    state[k] = v

            # ⚠️ SANEAMIENTO: detectar y limpiar engine_track corrupto
            # por el bug histórico de _json_safe (`return str(obj)`).
            # Si engine_track tiene strings donde debería haber listas
            # (era deque), reseteamos TODO state["pilot"] a {} para que
            # PilotState.get() llame _fresh() en el próximo acceso y
            # reconstruya la estructura limpia.
            #
            # Sin este check, sesiones guardadas ANTES del fix de
            # _json_safe seguirían reventando con TypeError aunque el
            # fix de serialización esté aplicado.
            try:
                _pilot = state.get("pilot")
                if isinstance(_pilot, dict):
                    _et = _pilot.get("engine_track")
                    _corrupt = False
                    if isinstance(_et, dict):
                        for _bk_v in _et.values():
                            if isinstance(_bk_v, str):
                                _corrupt = True
                                break
                    elif isinstance(_et, str):
                        _corrupt = True
                    if _corrupt:
                        log.warning(
                            f"Detectado state['pilot']['engine_track'] CORRUPTO "
                            f"en sesión '{user_id}' (bug histórico de "
                            f"serialización deque→str). Reseteando "
                            f"state['pilot'] a vacío para que PilotState._fresh() "
                            f"reconstruya la estructura."
                        )
                        state["pilot"] = {}
            except Exception as _san_err:
                log.warning(f"Saneamiento de engine_track falló: {_san_err}")

            return state
        except Exception as e:
            log.error(f"State JSON corrupto para '{user_id}': {e}")
            return None

    # ── Maintenance loop ────────────────────────────────────────
    def start_maintenance(self):
        """Arranca el hilo de mantenimiento (autosave + evict idle)."""
        if self._maintenance_thread is not None and self._maintenance_thread.is_alive():
            return
        self._stop_event.clear()
        self._maintenance_thread = threading.Thread(
            target=self._maintenance_loop,
            daemon=True,
            name="SessionMaintenance",
        )
        self._maintenance_thread.start()
        log.info("Maintenance thread iniciado")

    def stop_maintenance(self):
        self._stop_event.set()
        if self._maintenance_thread is not None:
            self._maintenance_thread.join(timeout=5)

    def _maintenance_loop(self):
        while not self._stop_event.wait(MAINTENANCE_INTERVAL_SECONDS):
            try:
                self._do_maintenance()
            except Exception as e:
                log.warning(f"Maintenance error: {e}")

    def _do_maintenance(self):
        now = time.time()
        with self._lock:
            user_ids = list(self._sessions.keys())

        for uid in user_ids:
            sess = self._sessions.get(uid)
            if sess is None:
                continue
            # Autosave si está dirty y han pasado AUTOSAVE_INTERVAL segundos
            if sess.is_dirty and (now - sess._last_save) >= AUTOSAVE_INTERVAL_SECONDS:
                self.save(uid, force=False)
            # Evict si está idle más de IDLE_EVICT_SECONDS
            if sess.idle_seconds >= IDLE_EVICT_SECONDS:
                self.evict(uid)

    def save_all(self):
        """Guarda todas las sesiones dirty (útil en shutdown)."""
        with self._lock:
            user_ids = list(self._sessions.keys())
        for uid in user_ids:
            try:
                self.save(uid)
            except Exception as e:
                log.warning(f"save_all: error guardando '{uid}': {e}")


# ── JSON helpers ──────────────────────────────────────────────────
def _json_safe(obj: Any) -> Any:
    """Convierte objetos no-JSON a algo serializable.

    ⚠️ BUG HISTÓRICO ARREGLADO (causaba todos los TypeError de pilot.py):
    El fallback ANTERIOR era `return str(obj)`. Eso convertía silenciosamente
    cualquier objeto no reconocido (incluidos los `deque` que `pilot.py`
    usa para `engine_track`) a su representación string. Cuando ese state
    se recargaba de SQLite, `engine_track["color"]` venía como STRING en
    lugar de deque/list, causando:
      - pilot.py:174 → `sum(d) / len(d)` con d=str → suma char por char →
        `TypeError: unsupported operand type(s) for +: 'int' and 'str'`
      - pilot.py:record_engine_outcome → `d.append(...)` con d=str →
        `'str' object has no attribute 'append'`

    AHORA:
      - `deque` se convierte explícitamente a `list` (JSON-safe).
        Al recargar viene como list. El código del pilot funciona en
        list (.append, sum, len, reversed) — solo se pierde maxlen, lo
        cual NO causa errores (a lo sumo crecimiento sin tope, deuda
        técnica menor).
      - `set` / `frozenset` también se convierten a `list`.
      - El fallback final ya NO usa `str(obj)`. Loggea warning y
        retorna None para que el problema sea VISIBLE en lugar de
        corromper silenciosamente. JSON serializa None como `null`.
    """
    import numpy as np
    from collections import deque

    if isinstance(obj, deque):
        return list(obj)
    if isinstance(obj, (set, frozenset)):
        return list(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "isoformat"):  # fechas
        return obj.isoformat()

    # Fallback SEGURO: NO usar str(obj) — fue la causa del bug histórico.
    log.warning(
        f"_json_safe: tipo no serializable {type(obj).__name__!r} "
        f"(repr={repr(obj)[:80]}); guardando como null"
    )
    return None


# ── Singleton ─────────────────────────────────────────────────────
session_manager = SessionManager()
