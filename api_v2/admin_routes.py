"""
Admin routes — Gestión de usuarios (aprobación, suspensión, etc.)
===================================================================
Endpoints (todos requieren plan == "admin"):

    GET    /api/admin/users              — Lista usuarios (opcional ?status=pending)
    POST   /api/admin/users/approve       — Aprueba un usuario pendiente (plan + dias)
    POST   /api/admin/users/suspend       — Suspende un usuario
    POST   /api/admin/users/reactivate    — Reactiva un usuario suspendido
    POST   /api/admin/users/reset_spins   — Resetea spins usados
    DELETE /api/admin/users/{username}    — Elimina un usuario

Reutiliza las funciones admin_* ya existentes en auth.py (las mismas
que usa históricamente el panel Streamlit) — auth.py NO se modifica.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from auth import (
    admin_list_users,
    admin_approve_user,
    admin_suspend_user,
    admin_reactivate_user,
    admin_delete_user,
    admin_reset_spins,
    PLANS,
)
from core.auth_helpers import require_active_user

log = logging.getLogger("admin_routes")
router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(user: dict = Depends(require_active_user)) -> dict:
    """Dependency: exige plan == 'admin' encima de la validación normal
    (mismo patrón usado en state_routes.py para /admin/sessions)."""
    if user.get("plan") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")
    return user


class ApproveRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    plan: str = Field(default="trial")
    days: Optional[int] = Field(default=None, ge=1)


class UsernameRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)


def _public_user(u: dict) -> dict:
    """Quita el hash de password antes de exponer el usuario por API."""
    safe = dict(u)
    safe.pop("password_hash", None)
    return safe


@router.get("/users")
def list_users(
    status: Optional[str] = Query(None, description="Filtrar por status: pending|active|suspended"),
    admin: dict = Depends(_require_admin),
):
    all_users = admin_list_users()
    if status:
        all_users = [u for u in all_users if u.get("status") == status]
    return {
        "total": len(all_users),
        "users": [_public_user(u) for u in all_users],
        "plans": list(PLANS.keys()),
    }


@router.post("/users/approve")
def approve_user(req: ApproveRequest, admin: dict = Depends(_require_admin)):
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Plan invalido. Opciones: {list(PLANS.keys())}")
    ok = admin_approve_user(req.username, req.plan, admin["username"], req.days)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo aprobar el usuario")
    log.warning(f"[ADMIN] '{admin['username']}' aprobó a '{req.username}' con plan={req.plan}")
    return {"success": True, "username": req.username.strip().lower(), "plan": req.plan}


@router.post("/users/suspend")
def suspend_user(req: UsernameRequest, admin: dict = Depends(_require_admin)):
    ok = admin_suspend_user(req.username)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo suspender el usuario")
    log.warning(f"[ADMIN] '{admin['username']}' suspendió a '{req.username}'")
    return {"success": True, "username": req.username.strip().lower()}


@router.post("/users/reactivate")
def reactivate_user(req: UsernameRequest, admin: dict = Depends(_require_admin)):
    ok = admin_reactivate_user(req.username)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo reactivar el usuario")
    log.warning(f"[ADMIN] '{admin['username']}' reactivó a '{req.username}'")
    return {"success": True, "username": req.username.strip().lower()}


@router.post("/users/reset_spins")
def reset_spins(req: UsernameRequest, admin: dict = Depends(_require_admin)):
    ok = admin_reset_spins(req.username)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo resetear los spins")
    log.warning(f"[ADMIN] '{admin['username']}' reseteó spins de '{req.username}'")
    return {"success": True, "username": req.username.strip().lower()}


@router.delete("/users/{username}")
def delete_user(username: str, admin: dict = Depends(_require_admin)):
    if username.strip().lower() == admin["username"].strip().lower():
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta admin")
    ok = admin_delete_user(username)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo eliminar el usuario")
    log.warning(f"[ADMIN] '{admin['username']}' eliminó a '{username}'")
    return {"success": True, "username": username.strip().lower()}
