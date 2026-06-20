"""
Engine Pool — Una instancia de motor por usuario
=================================================
Cada usuario tiene su propio singleton de GunnerMLEngine, persistido en RAM
mientras la sesión está activa. El motor mantiene su replay buffer, pesos
adaptativos, y modelos (LSTM, NB) por usuario.

Cuando una sesión idle se descarga (evict), su engine también se libera.

Uso:
    from core.engine_pool import engine_pool
    eng = engine_pool.get("gunner")    # crea o devuelve el cacheado
    # ... usar eng ...
    engine_pool.evict("gunner")        # liberar cuando se sale
"""

import os
import logging
import threading
from typing import Dict, Optional

log = logging.getLogger("engine_pool")

# ── Params del motor (idénticos a ENGINE_PARAMS de app.py) ────────
ENGINE_PARAMS = {
    "lstm_sequence_len": 15,
    "retrain_every": 600,
    "window_short": 12,
    "nb_alpha": 0.01,
    "model_names": ["NB", "LSTM", "Markov", "HotCold"],
    "adaptive_persist": True,
    "adaptive_eta": 0.5,
    "global_replay_maxlen": 200_000,
    "wheel_enabled": True,
    "wheel_window": 20,
    "wheel_decay": 0.78,
    "wheel_radius": 3,
    "wheel_sig_window": 8,
    "wheel_scatter_window": 30,
    "exploit_edge_numbers": 0.008,
    "probe_edge_numbers": 0.004,
    "numbers_need_margin": 0.008,
    "numbers_need_margin_probe": 0.004,
}


class EnginePool:
    """Pool thread-safe de instancias de GunnerMLEngine, una por user_id."""

    def __init__(self):
        self._engines: Dict[str, object] = {}
        self._lock = threading.RLock()

    def get(self, user_id: str, models: Optional[dict] = None):
        """
        Devuelve la instancia de engine del usuario.
        Si no existe, la crea.

        Args:
            user_id: identificador del usuario
            models: dict opcional con {"nb_model", "lstm_model", "scaler"}
                    para inicializar el engine con modelos pre-cargados.
        """
        uid = str(user_id).strip().lower()
        with self._lock:
            eng = self._engines.get(uid)
            if eng is not None:
                return eng

            # Crear nueva instancia
            try:
                import engine as engine_module

                # ── FIX CRÍTICO MULTI-TENANT ─────────────────────────────
                # engine._get_engine_singleton() YA aísla por usuario, pero
                # SOLO si recibe params["user_id"]. Antes le pasábamos
                # ENGINE_PARAMS sin user_id → todos caían en "default" →
                # TODOS compartían el MISMO motor (replay buffer, pesos,
                # LSTM/NB y rueda). Eso contaminaba las señales/GOD BET entre
                # usuarios. Inyectamos el uid para que cada uno tenga su propio
                # GunnerMLEngine + su carpeta models_v3_17R/{uid}/.
                _params = dict(ENGINE_PARAMS)
                _params["user_id"] = uid

                # models=None a propósito: pasar un dict {nb:None, lstm:None,
                # scaler:None} dispararía eng.set_models(...) en CADA spin y
                # podría sobrescribir los modelos entrenados del usuario con
                # None. Con None, engine respeta lo ya cargado/persistido.
                eng = engine_module._get_engine_singleton(
                    models=models,  # None salvo que el caller pase modelos reales
                    params=_params,
                )
                self._engines[uid] = eng
                log.info(f"Engine inicializado para usuario '{uid}'")
                return eng
            except Exception as e:
                log.error(f"Error inicializando engine para '{uid}': {e}")
                # Devolver el módulo engine como fallback (igual que app.py)
                import engine as engine_module
                return engine_module

    def get_engine(self, user_id: str, models: Optional[dict] = None):
        """Alias de get() — spin_routes.py llama engine_pool.get_engine(username).
        Mantiene ambos nombres funcionando sin tocar spin_routes.py."""
        return self.get(user_id, models)

    def evict(self, user_id: str) -> bool:
        """Libera el engine del usuario de RAM."""
        uid = str(user_id).strip().lower()
        with self._lock:
            if uid in self._engines:
                del self._engines[uid]
                log.info(f"Engine evictado: '{uid}'")
                return True
            return False

    def list_active(self) -> list:
        """Lista usuarios con engine activo en RAM."""
        with self._lock:
            return list(self._engines.keys())


# Singleton
engine_pool = EnginePool()
