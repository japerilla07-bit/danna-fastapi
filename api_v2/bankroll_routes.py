"""
Bankroll routes — Manejo manual de saldo
==========================================
Endpoints para editar el saldo del usuario manualmente.

    POST /api/bankroll/set       — Establecer nuevo saldo (y reset de bankroll_initial)
    POST /api/bankroll/adjust    — Sumar/restar cantidad al saldo actual
    GET  /api/bankroll           — Leer estado actual del bankroll

Estos endpoints son equivalentes al panel de bankroll manual de Streamlit.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Cookie, Depends
from pydantic import BaseModel, Field

from auth import get_user_info
from core.jwt_utils import decode_token
from core.auth_helpers import require_active_user
from core.session_manager import session_manager

log = logging.getLogger("bankroll_routes")
router = APIRouter(prefix="/api/bankroll", tags=["bankroll"])




class SetBankrollRequest(BaseModel):
    amount: float = Field(..., ge=0, description="Nuevo saldo en COP")
    reset_initial: bool = Field(
        True,
        description="Si True, tambien actualiza bankroll_initial (resetea el P&L)"
    )


class AdjustBankrollRequest(BaseModel):
    delta: float = Field(..., description="Cantidad a sumar (positivo) o restar (negativo)")
    reason: str = Field("", max_length=200)


def _bankroll_snapshot(sess) -> dict:
    current = float(sess.get("bankroll", 0.0) or 0.0)
    initial = float(sess.get("bankroll_initial", 0.0) or 0.0)
    pnl = current - initial
    pnl_pct = (pnl / initial * 100.0) if initial > 0 else 0.0
    return {
        "current": current,
        "initial": initial,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
    }


@router.get("")
def get_bankroll(user: dict = Depends(require_active_user)):
    sess = session_manager.get(user["username"])
    return _bankroll_snapshot(sess)


@router.post("/set")
def set_bankroll(req: SetBankrollRequest, user: dict = Depends(require_active_user)):
    """Establecer nuevo saldo (opcionalmente reseteando bankroll_initial)."""
    sess = session_manager.get(user["username"])
    sess["bankroll"] = float(req.amount)
    if req.reset_initial:
        sess["bankroll_initial"] = float(req.amount)
    session_manager.save(user["username"])
    log.info(f"Bankroll set for '{user['username']}': {req.amount} (reset_initial={req.reset_initial})")
    return _bankroll_snapshot(sess)


@router.post("/adjust")
def adjust_bankroll(req: AdjustBankrollRequest, user: dict = Depends(require_active_user)):
    """Ajustar el saldo sumando/restando una cantidad."""
    sess = session_manager.get(user["username"])
    current = float(sess.get("bankroll", 0.0) or 0.0)
    new_value = max(0.0, current + float(req.delta))
    sess["bankroll"] = new_value
    session_manager.save(user["username"])
    log.info(f"Bankroll adjust for '{user['username']}': {current} + {req.delta} = {new_value} ({req.reason})")
    return _bankroll_snapshot(sess)
