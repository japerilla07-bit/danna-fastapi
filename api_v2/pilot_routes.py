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

from fastapi import APIRouter, HTTPException, Cookie, Depends
from pydantic import BaseModel

from auth import get_user_info
from core.jwt_utils import decode_token
from core.auth_helpers import require_active_user
from core.session_manager import session_manager
from core.engine_pool import engine_pool

# pilot.py vive en backend/pilot.py (al lado de main.py)
from pilot import (
    set_state_context,
    clear_state_context,
    set_operator_override,
    clear_operator_override,
    get_operator_override,
    PilotState,
)

# regenerate_verdict_after_override vive en danna_core/processor.py.
# Se llama tras cada activación/cambio/limpieza de override para evitar
# el desync entre pilot.raw.override_bet_key y state.pilot.last_verdict.
from danna_core.processor import regenerate_verdict_after_override

log = logging.getLogger("pilot_routes")
router = APIRouter(prefix="/api/pilot", tags=["pilot"])

# Categorías válidas para override (mismas keys que usa el motor en bet_advice)
VALID_BET_KEYS = {"color", "paridad", "rango", "docenas", "columnas", "max_conf"}


# ── Auth helper ──────────────────────────────────────────────────


# ── Modelos ──────────────────────────────────────────────────────
class OverrideRequest(BaseModel):
    bet_key: str
    pick: Optional[Any] = None  # str | int | list — depende de la categoría


# ── Endpoints ────────────────────────────────────────────────────
@router.post("/override")
def post_override(
    body: OverrideRequest,
    user: dict = Depends(require_active_user),
):
    """
    Activa override del operador: el Pilot tomará la apuesta indicada
    como la elegida por el usuario para los próximos giros, hasta que
    acierte (HIT) o agote la progresión (L4 MISS).

    ★ FIX: tras escribir override_bet_key/pick en pilot.raw, regenera
    INMEDIATAMENTE state.pilot.last_verdict con el override aplicado.
    Sin esto el verdict quedaba obsoleto (típicamente STAND_DOWN porque
    GOD-STRICT lo había degradado en POST-SPIN REGEN del spin anterior,
    cuando override no estaba activo). El próximo spin leía ese verdict
    obsoleto y record_outcome salía sin procesar la apuesta → bankroll,
    contadores y progresión no se movían.
    """
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

    # ★ Regenerar last_verdict para reflejar el override RECIÉN activado.
    # Defensivo: si falla, no rompemos el endpoint — el override queda
    # activo y el siguiente spin lo "absorberá" via 1-spin lag (peor caso,
    # comportamiento previo al fix).
    try:
        engine = engine_pool.get_engine(username)
        regenerated = regenerate_verdict_after_override(sess, engine_instance=engine)
        if regenerated is not None:
            session_manager.save(username)
        else:
            log.warning(f"[OVERRIDE] regen retornó None para user={username}")
    except Exception as e:
        log.warning(f"[OVERRIDE] regen del verdict falló (no fatal): {e}")

    log.info(f"[OVERRIDE] user={username} bet_key={bk} pick={body.pick}")
    return {
        "success": True,
        "override": result,
    }


@router.post("/override/clear")
def post_override_clear(user: dict = Depends(require_active_user)):
    """Libera el override manualmente.

    ★ Tras limpiar, también regenera el verdict para que el siguiente spin
    use la sugerencia del motor (sin override) en lugar del verdict
    obsoleto que tenía override aplicado.
    """
    username = user["username"]
    sess = session_manager.get(username)

    token = set_state_context(sess)
    try:
        result = clear_operator_override()
    finally:
        clear_state_context(token)

    # Regenerar last_verdict sin override (mismo motivo que /override)
    try:
        engine = engine_pool.get_engine(username)
        regenerated = regenerate_verdict_after_override(sess, engine_instance=engine)
        if regenerated is not None:
            session_manager.save(username)
    except Exception as e:
        log.warning(f"[OVERRIDE-CLEAR] regen del verdict falló (no fatal): {e}")

    log.info(f"[OVERRIDE] user={username} CLEARED")
    return {
        "success": True,
        "override": result,
    }


@router.get("/override")
def get_override(user: dict = Depends(require_active_user)):
    """Lee el estado actual del override."""
    username = user["username"]
    sess = session_manager.get(username)

    token = set_state_context(sess)
    try:
        result = get_operator_override()
    finally:
        clear_state_context(token)

    return {"override": result}


@router.post("/reset")
def post_pilot_reset(user: dict = Depends(require_active_user)):
    """
    Resetea state['pilot'] a estado fresco (PilotState._fresh()).
    Limpia engine_track (las deques de últimos 20 resultados por categoría),
    contadores internos del Pilot, buckets, regime_history, override, etc.

    No toca state['spins'], state['counters'], ni state['bankroll']. Solo
    el sub-dict 'pilot' interno del Pilot.

    Útil cuando engine_track se corrompe con tipos mixtos (int/str) que
    causan TypeError en pilot.evaluate.
    """
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
