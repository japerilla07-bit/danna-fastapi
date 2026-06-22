"""
Spin routes — Procesamiento de giros vía API
=============================================
Endpoint principal del motor para D.A.N.N.A.

    POST /api/spin   — Registra un número de ruleta, procesa con motor+pilot,
                       y devuelve la decisión completa + estado actualizado.

Arquitectura Limpia y Segura (Anti Race-Conditions):
    Recibe request → valida auth + cuota Trial → adquiere Mutex Lock de Usuario
    → carga UserSession → ejecuta danna_core.processor.run_spin_processing
    → persiste state → libera Lock → responde.
"""

import logging
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Cookie, Depends
from pydantic import BaseModel, Field

from auth import get_user_info, get_spins_remaining, increment_spin
from core.jwt_utils import decode_token
from core.auth_helpers import require_active_user
from core.session_manager import session_manager
from core.engine_pool import engine_pool

from danna_core.processor import run_spin_processing as _process_spin
from danna_core.helpers import _deep_jsonable

log = logging.getLogger("spin_routes")
router = APIRouter(prefix="/api", tags=["spin"])

# Diccionario Global de Locks por usuario. Evita Race Conditions en asincronía.
_user_locks = {}

def get_user_lock(username: str) -> asyncio.Lock:
    if username not in _user_locks:
        _user_locks[username] = asyncio.Lock()
    return _user_locks[username]

# ── Schemas ───────────────────────────────────────────────────────
class SpinRequest(BaseModel):
    spin: int = Field(..., ge=0, le=36, description="Numero del giro (0-36)")
    notes: str = Field("", max_length=500)
    # Clave de idempotencia generada por el cliente (única por disparo).
    # Si llega repetida = reenvío/duplicado → se ignora. Opcional para
    # mantener retrocompatibilidad con clientes viejos / API directa.
    client_seq: Optional[str] = Field(None, max_length=80, description="Idempotency key del cliente")

class SpinResponse(BaseModel):
    success: bool
    spin: int
    spin_index: int
    spins_total: int
    spins_remaining: int
    state: dict
    error: Optional[str] = None


@router.post("/spin", response_model=SpinResponse)
async def process_spin_route(req: SpinRequest, user: dict = Depends(require_active_user)):
    username = user["username"]
    # ADQUIRIR CANDADO ASÍNCRONO: Ejecución estricta 1 a 1 por usuario
    lock = get_user_lock(username)
    async with lock:
        # Cargar estado fresco garantizado
        sess = session_manager.get(username)
        spins_list = sess.get("spins", []) or []

        # ── IDEMPOTENCIA: ignorar reenvíos del mismo disparo ─────────────
        # El cliente adjunta un client_seq único por disparo. Si llega uno
        # IGUAL al último ya procesado, es un duplicado (retry de red o
        # doble-disparo que se coló) → devolvemos el estado actual SIN
        # re-procesar, evitando el doble conteo de bankroll/progresión.
        # Si client_seq es None (cliente viejo/API directa), procesa normal.
        if req.client_seq is not None and req.client_seq == sess.get("last_client_seq"):
            log.info(f"[IDEMPOTENT] client_seq repetido para '{username}' → no-op (sin re-procesar)")
            import collections
            def _dq_idem(obj):
                if isinstance(obj, collections.deque):
                    return list(obj)
                if isinstance(obj, dict):
                    return {k: _dq_idem(v) for k, v in obj.items()}
                if isinstance(obj, (list, tuple)):
                    return [_dq_idem(i) for i in obj]
                return obj
            safe_state = _deep_jsonable(_dq_idem(sess.to_dict()))
            fresh = get_user_info(username) or user
            remaining_info = get_spins_remaining(fresh)
            return SpinResponse(
                success=True,
                spin=int(req.spin),
                spin_index=max(0, len(spins_list) - 1),
                spins_total=len(spins_list),
                spins_remaining=remaining_info.get("remaining", 0),
                state=safe_state,
                error=None,
            )

        # VALIDACIÓN DEL PLAN TRIAL D.A.N.N.A: Límite estricto de 250 spins
        # ★ Solo aplica al plan "trial" — admin y planes pagos no tienen este límite.
        _plan = str(user.get("plan", "")).lower().strip()
        _is_trial = (_plan == "trial")
        if _is_trial and len(spins_list) >= 250:
            import collections
            def _fallback_deque_to_list(obj):
                if isinstance(obj, collections.deque):
                    return list(obj)
                if isinstance(obj, dict):
                    return {k: _fallback_deque_to_list(v) for k, v in obj.items()}
                if isinstance(obj, (list, tuple)):
                    return [_fallback_deque_to_list(i) for i in obj]
                return obj
                
            safe_state = _deep_jsonable(_fallback_deque_to_list(sess.to_dict()))
            return SpinResponse(
                success=False,
                spin=req.spin,
                spin_index=len(spins_list),
                spins_total=len(spins_list),
                spins_remaining=0,
                state=safe_state,
                error="Límite del Plan Trial alcanzado (250 spins)."
            )

        engine_instance = engine_pool.get_engine(username)

        # ── Procesar Spin con el core ────────────────────────────────────
        try:
            _process_spin(
                state=sess,
                spin=req.spin,
                notes=req.notes,
                engine_instance=engine_instance,
                on_rerun=None,
                auth_enabled=True,
                evals_log_path=None
            )
        except Exception as e:
            log.error(f"Fallo crítico en core engine run_spin_processing: {e}")
            raise HTTPException(status_code=500, detail="Fallo interno al procesar el spin.")

        # ── Actualizar contadores y Auth ─────────────────────────────
        try:
            increment_spin(username)
        except Exception as e:
            log.warning(f"No pude incrementar contador de spins en Auth: {e}")

        # ── Marcar client_seq como procesado (idempotencia) ──────────
        if req.client_seq is not None:
            try:
                sess["last_client_seq"] = req.client_seq
            except Exception as e:
                log.warning(f"No pude registrar last_client_seq: {e}")

        # ── Persistir sesion a BD ────────────────────────────────────
        try:
            session_manager.save(username)
        except Exception as e:
            log.warning(f"No pude persistir sesion en base de datos: {e}")

        # ── Construcción segura del Response ─────────────────────────
        fresh = get_user_info(username) or user
        remaining_info = get_spins_remaining(fresh)
        spins_list = sess.get("spins", []) or []

        import collections
        def _deque_to_list(obj):
            if isinstance(obj, collections.deque):
                return list(obj)
            if isinstance(obj, dict):
                return {k: _deque_to_list(v) for k, v in obj.items()}
            if isinstance(obj, (list, tuple)):
                return [_deque_to_list(i) for i in obj]
            return obj

        safe_state = _deep_jsonable(_deque_to_list(sess.to_dict()))

        return SpinResponse(
            success=True,
            spin=int(req.spin),
            spin_index=max(0, len(spins_list) - 1),
            spins_total=len(spins_list),
            spins_remaining=remaining_info.get("remaining", 0),
            state=safe_state,
            error=None
        )