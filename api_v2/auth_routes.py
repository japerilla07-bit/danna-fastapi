"""
Auth routes for D.A.N.N.A. API v2
==================================
Endpoints:
    POST /api/login    — Login con username/password, devuelve cookie JWT
    POST /api/logout   — Borra la cookie
    GET  /api/me       — Devuelve info del usuario actual (requiere cookie)

Las rutas usan la cookie httpOnly `danna_session` (no localStorage).
El frontend React envía las requests con `credentials: 'include'`.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Response, Cookie
from pydantic import BaseModel

from auth import verify_user, get_user_info, is_subscription_active, get_spins_remaining, PLANS
from core.jwt_utils import create_token, decode_token, COOKIE_NAME, JWT_TTL_SECONDS

log = logging.getLogger("auth_routes")
router = APIRouter(prefix="/api", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    username: str
    plan: str
    status: str
    message: Optional[str] = None


class MeResponse(BaseModel):
    username: str
    email: str
    plan: str
    plan_name: str
    plan_expires: str
    status: str
    subscription_active: bool
    spins_used_total: int
    spins_remaining: int


# ── Helpers ───────────────────────────────────────────────────────
def _set_session_cookie(response: Response, token: str):
    """Setea la cookie httpOnly con el JWT."""
    import os as _os
    is_production = _os.environ.get("DANNA_ENV", "production").lower() == "production"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,          # no accesible desde JavaScript (anti-XSS)
        secure=is_production,   # HTTPS-only en produccion
        samesite="lax",         # protección CSRF razonable
        max_age=JWT_TTL_SECONDS,
        path="/",
    )


def _clear_session_cookie(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")


def _get_user_from_cookie(token: Optional[str]):
    """Decodifica el JWT y devuelve el usuario fresco de la BD."""
    if not token:
        return None
    payload = decode_token(token)
    if payload is None:
        return None
    username = payload.get("sub")
    if not username:
        return None
    return get_user_info(username)


# ── Endpoints ─────────────────────────────────────────────────────
@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, response: Response):
    """Login con username/password. Devuelve cookie httpOnly con JWT."""
    username = (req.username or "").strip().lower()
    password = (req.password or "").strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Usuario y contraseña requeridos")

    user = verify_user(username, password)
    if user is None:
        # Esperar un poco para mitigar timing attacks
        import time as _t; _t.sleep(0.3)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # Crear token y setear cookie
    token = create_token(username, extra_claims={"plan": user.get("plan", "trial")})
    _set_session_cookie(response, token)

    return LoginResponse(
        success=True,
        username=user["username"],
        plan=user.get("plan", "trial"),
        status=user.get("status", "pending"),
        message="Login exitoso",
    )


@router.post("/logout")
def logout(response: Response):
    """Cierra sesión borrando la cookie."""
    _clear_session_cookie(response)
    return {"success": True, "message": "Sesión cerrada"}


@router.get("/me", response_model=MeResponse)
def me(danna_session: Optional[str] = Cookie(None)):
    """
    Devuelve info del usuario autenticado.
    Lee la cookie `danna_session` automáticamente.
    """
    user = _get_user_from_cookie(danna_session)
    if user is None:
        raise HTTPException(status_code=401, detail="No autenticado")

    plan_info = PLANS.get(user.get("plan", "trial"), PLANS["trial"])
    spins_info = get_spins_remaining(user)

    return MeResponse(
        username=user["username"],
        email=user.get("email", ""),
        plan=user.get("plan", "trial"),
        plan_name=plan_info["name"],
        plan_expires=user.get("plan_expires", ""),
        status=user.get("status", "pending"),
        subscription_active=is_subscription_active(user),
        spins_used_total=int(user.get("spins_used_total", 0)),
        spins_remaining=int(spins_info.get("remaining", 0)),
    )
