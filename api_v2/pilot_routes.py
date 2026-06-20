"""
Pilot routes — Acciones del operador sobre el Pilot
=====================================================
Endpoints para que el usuario seleccione manualmente qué apuesta seguir
del set de sugerencias activas del Pilot.

    POST /api/pilot/override        — Activar override en una categoría
    POST /api/pilot/override/clear  — Liberar override manualmente
    GET  /api/pilot/override        — Leer estado actual del override
"""

import logging
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Cookie
from pydantic import BaseModel

from auth import get_user_info
from core.jwt_utils import decode_token
from core.session_manager import session_manager

# pilot.py vive en backend/pilot.py (al lado de main.py)
from pilot import (
    set_state_context,
    clear_state_context,
    set_operator_override,
    clear_operator_override,
    get_operator_override,
    PilotState,
)

log = logging.getLogger("pilot_routes")
router = APIRouter(prefix="/api/pilot", tags=["pilot"])

# Categorías válidas para override (mismas keys que usa el motor en bet_advice)
VALID_BET_KEYS = {"color", "paridad", "rango", "docenas", "columnas", "max_conf"}


# ── Auth helper ──────────────────────────────────────────────────
def _require_user(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Sesion invalida")
    username = payload.get("sub")
    user = get_user_info(username) if username else None
    if user is None:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


# ── Modelos ──────────────────────────────────────────────────────
class OverrideRequest(BaseModel):
    bet_key: str
    pick: Optional[Any] = None  # str | int | list — depende de la categoría


# ── Endpoints ────────────────────────────────────────────────────
@router.post("/override")
def post_override(
    body: OverrideRequest,
    danna_session: Optional[str] = Cookie(None),
):
    """
    Activa override del operador: el Pilot tomará la apuesta indicada
    como la elegida por el usuario para los próximos giros, hasta que
    acierte (HIT) o agote la progresión (L4 MISS).
    """
    user = _require_user(danna_session)
    username = user["username"]
    sess = session_manager.get(username)

    bk = (body.bet_key or "").lower().strip()
    if bk not in VALID_BET_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"bet_key inválido: '{bk}'. Permitidos: {sorted(VALID_BET_KEYS)}",
        )

    # IMPORTANTE: pasamos `sess` directamente (no sess.to_dict()) porque el
    # override se escribe sobre el dict de contexto vía PilotState.get().raw,
    # y necesitamos que persista en la sesión real, no en una copia.
    token = set_state_context(sess)
    try:
        result = set_operator_override(bk, body.pick)
    finally:
        clear_state_context(token)

    log.info(f"[OVERRIDE] user={username} bet_key={bk} pick={body.pick}")
    return {
        "success": True,
        "override": result,
    }


@router.post("/override/clear")
def post_override_clear(danna_session: Optional[str] = Cookie(None)):
    """Libera el override manualmente."""
    user = _require_user(danna_session)
    username = user["username"]
    sess = session_manager.get(username)

    token = set_state_context(sess)
    try:
        result = clear_operator_override()
    finally:
        clear_state_context(token)

    log.info(f"[OVERRIDE] user={username} CLEARED")
    return {
        "success": True,
        "override": result,
    }


@router.get("/override")
def get_override(danna_session: Optional[str] = Cookie(None)):
    """Lee el estado actual del override."""
    user = _require_user(danna_session)
    username = user["username"]
    sess = session_manager.get(username)

    token = set_state_context(sess)
    try:
        result = get_operator_override()
    finally:
        clear_state_context(token)

    return {"override": result}


@router.post("/reset")
def post_pilot_reset(danna_session: Optional[str] = Cookie(None)):
    """
    Resetea state['pilot'] a estado fresco (PilotState._fresh()).
    Limpia engine_track (las deques de últimos 20 resultados por categoría),
    contadores internos del Pilot, buckets, regime_history, override, etc.

    No toca state['spins'], state['counters'], ni state['bankroll']. Solo
    el sub-dict 'pilot' interno del Pilot.

    Útil cuando engine_track se corrompe con tipos mixtos (int/str) que
    causan TypeError en pilot.evaluate.
    """
    user = _require_user(danna_session)
    username = user["username"]
    sess = session_manager.get(username)

    if sess is None:
        raise HTTPException(status_code=404, detail="No hay sesión activa")

    # session_manager.get(username) devuelve el dict de estado directamente
    # (no un objeto wrapper). Reemplazamos solo la clave 'pilot' con fresco.
    sess["pilot"] = PilotState._fresh()

    log.info(f"[PILOT-RESET] user={username} → state['pilot'] reseteado a _fresh()")
    return {
        "success": True,
        "message": "Pilot state reseteado. engine_track y contadores internos limpios.",
    }
