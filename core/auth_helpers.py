"""
Centralized authentication helpers for D.A.N.N.A. v2 API.

Single source of truth for validating that a request comes from
an authenticated user with an active subscription.

Usage in routers:
    from core.auth_helpers import require_active_user
    
    @router.get("/some-endpoint")
    def my_endpoint(user: dict = Depends(require_active_user)):
        # user is already validated. Use user["username"], user["plan"], etc.
        ...
"""

import logging
from typing import Optional
from fastapi import HTTPException, Cookie, Depends

from auth import get_user_info, is_subscription_active, STATUS_ACTIVE
from core.jwt_utils import decode_token

log = logging.getLogger("auth_helpers")


def require_authenticated_user(danna_session: Optional[str] = Cookie(None)) -> dict:
    """
    FastAPI dependency: validates that the request has a valid session.
    
    Checks:
      1. Session cookie is present
      2. JWT is valid (not expired, not tampered)
      3. User exists in DB
    
    Does NOT check subscription status (admin operations may need to access
    pending/suspended user data).
    
    Returns the user dict if checks pass. Raises HTTPException(401) otherwise.
    """
    if not danna_session:
        raise HTTPException(status_code=401, detail="No autenticado")
    
    payload = decode_token(danna_session)
    if payload is None:
        raise HTTPException(status_code=401, detail="Sesion invalida o expirada")
    
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Token sin username")
    
    user = get_user_info(username)
    if user is None:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    
    return user


def require_active_user(user: dict = Depends(require_authenticated_user)) -> dict:
    """
    FastAPI dependency: validates authentication AND active subscription.
    
    Checks (on top of require_authenticated_user):
      4. User status is 'active'
      5. Subscription has not expired
      6. User has spins remaining (per their plan)
    
    Use this for any endpoint that consumes user resources
    (spin processing, state retrieval, etc.).
    
    Returns the user dict if checks pass.
    Raises HTTPException(403) for inactive/expired accounts.
    """
    # Verificar status:
    if user.get("status") != STATUS_ACTIVE:
        status = user.get("status", "unknown")
        log.warning(f"Acceso bloqueado: usuario '{user.get('username')}' tiene status={status}")
        raise HTTPException(
            status_code=403,
            detail=f"Cuenta no activa (status: {status}). Contacta soporte si crees que es un error."
        )
    
    # Verificar subscription activa (plan no expirado, spins disponibles):
    if not is_subscription_active(user):
        log.warning(
            f"Acceso bloqueado: usuario '{user.get('username')}' subscription expirada o "
            f"sin spins (plan={user.get('plan')}, expires={user.get('plan_expires')}, "
            f"used={user.get('spins_used_total')})"
        )
        raise HTTPException(
            status_code=403,
            detail="Tu plan ha expirado o se agotaron los spins. Renueva para continuar usando D.A.N.N.A."
        )
    
    return user