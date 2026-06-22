"""
D.A.N.N.A. Registration & Payment API
======================================
FastAPI server — puerto 8000.

Endpoints:
    POST /api/register          — Registro nuevo usuario (pending)
    GET  /api/health            — Health check
    POST /api/lemonsqueezy/webhook — Webhook de pago (activa plan automatico)
    GET  /api/user/{username}   — Info de usuario (para landing page)
"""

import os
import json
import hmac
import hashlib
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from auth import (
    create_user, get_user_info, admin_approve_user,
    STATUS_PENDING, STATUS_ACTIVE, PLANS
)

app = FastAPI(title="D.A.N.N.A. API", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dannaengine.com",
        "https://www.dannaengine.com",
        "https://japerilla07-bit.github.io",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── LemonSqueezy config ───────────────────────────────────────────
LS_WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")

# Mapeo variant_id → plan interno
# Reemplaza estos IDs con los de tu dashboard de LemonSqueezy
# Settings → Products → tu producto → Variants → copy variant ID
LS_VARIANT_MAP = {
    os.environ.get("LS_VARIANT_DAILY",   "1486458"): "daily_pass",
    os.environ.get("LS_VARIANT_WEEKLY",  "1486467"): "weekly_pro",
    os.environ.get("LS_VARIANT_MONTHLY", "1486469"): "monthly",
}

# ── Helpers ───────────────────────────────────────────────────────
def _verify_ls_signature(raw_body: bytes, signature: str) -> bool:
    """Verifica que el webhook viene de LemonSqueezy y no de un tercero."""
    if not LS_WEBHOOK_SECRET:
        return True  # sin secret configurado, aceptar (solo para dev)
    expected = hmac.new(
        key=LS_WEBHOOK_SECRET.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _activate_plan_by_email(email: str, variant_id: str, order_id: str) -> dict:
    """Busca usuario por email y activa su plan según el variant comprado."""
    import sqlite3
    from auth import AUTH_DB_PATH, _get_db

    plan = LS_VARIANT_MAP.get(str(variant_id))
    if not plan:
        return {"error": f"variant_id {variant_id} no mapeado"}

    try:
        conn = _get_db()
        row = conn.execute(
            "SELECT * FROM users WHERE LOWER(email) = LOWER(?)",
            (email.strip(),)
        ).fetchone()

        if row is None:
            # Usuario no registrado — crear cuenta pendiente con email como username base
            conn.close()
            return {"error": f"email {email} no encontrado en DB"}

        username = row["username"]
        conn.close()

        # Aprobar y activar plan
        result = admin_approve_user(username, plan, "lemonsqueezy_webhook")
        if result:
            return {"success": True, "username": username, "plan": plan, "order_id": order_id}
        else:
            return {"error": "admin_approve_user falló"}

    except Exception as e:
        return {"error": str(e)}


# ── Modelos ───────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str = ""


class RegisterResponse(BaseModel):
    success: bool
    message: str


# ── Endpoints ─────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "danna-api", "ts": datetime.now(timezone.utc).isoformat()}


@app.post("/api/register", response_model=RegisterResponse)
def register(req: RegisterRequest):
    username = req.username.strip().lower()
    password = req.password.strip()
    email    = req.email.strip()

    if len(username) < 3:
        return RegisterResponse(success=False, message="Usuario debe tener minimo 3 caracteres.")
    if len(password) < 6:
        return RegisterResponse(success=False, message="Contrasena debe tener minimo 6 caracteres.")

    existing = get_user_info(username)
    if existing:
        return RegisterResponse(success=False, message="Este usuario ya existe.")

    result = create_user(username, password, email, plan="trial", status=STATUS_PENDING)
    if result.get("success"):
        return RegisterResponse(
            success=True,
            message="Cuenta creada. En revision — te contactaremos para activar acceso."
        )
    return RegisterResponse(success=False, message=result.get("error", "Error al crear cuenta."))


@app.post("/api/lemonsqueezy/webhook")
async def lemonsqueezy_webhook(
    request: Request,
    x_signature: Optional[str] = Header(None, alias="X-Signature"),
):
    """
    Webhook de LemonSqueezy.
    Activa el plan del usuario automaticamente cuando el pago es completado.

    Configura en LemonSqueezy:
      URL: https://tu-app.railway.app/api/lemonsqueezy/webhook
      Events: order_created, subscription_created, subscription_payment_success
    """
    raw_body = await request.body()

    # 1) Verificar firma
    if not _verify_ls_signature(raw_body, x_signature or ""):
        raise HTTPException(status_code=401, detail="Firma invalida")

    # 2) Parsear payload
    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload invalido")

    event_name = payload.get("meta", {}).get("event_name", "")

    # 3) Solo procesar eventos de pago completado
    VALID_EVENTS = {
        "order_created",
        "subscription_created",
        "subscription_payment_success",
    }
    if event_name not in VALID_EVENTS:
        # Ignorar otros eventos (no es error)
        return {"received": True, "processed": False, "event": event_name}

    # 4) Extraer datos del pedido
    try:
        data       = payload.get("data", {})
        attributes = data.get("attributes", {})

        # Email del comprador
        email = (
            attributes.get("user_email")
            or attributes.get("customer_email")
            or payload.get("meta", {}).get("custom_data", {}).get("email", "")
        )

        # Variant ID (determina qué plan)
        first_item   = (attributes.get("first_order_item") or
                        (attributes.get("order_items") or [{}])[0])
        variant_id   = str(
            first_item.get("variant_id")
            or attributes.get("variant_id")
            or ""
        )

        order_id = str(data.get("id", ""))

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error extrayendo datos: {e}")

    if not email:
        return {"received": True, "processed": False, "reason": "email no encontrado en payload"}

    # 5) Activar plan
    result = _activate_plan_by_email(email, variant_id, order_id)

    # Log para debugging (Railway logs)
    print(f"[LS_WEBHOOK] event={event_name} email={email} variant={variant_id} order={order_id} result={result}")

    return {
        "received": True,
        "processed": True,
        "event": event_name,
        "result": result,
    }


@app.get("/api/user/{username}")
def get_user(username: str):
    """Info básica de usuario — para verificar estado desde landing page."""
    user = get_user_info(username)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # No exponer password_hash
    return {
        "username": user["username"],
        "status":   user["status"],
        "plan":     user["plan"],
        "plan_expires": user.get("plan_expires", ""),
        "spins_used_total": user.get("spins_used_total", 0),
    }

# ????????????????????????????????????????????????????????????????????
# ADMIN ENDPOINT ? Aprobar usuario manualmente
# ????????????????????????????????????????????????????????????????????
# Uso (curl):
#   curl -X POST https://tu-app.railway.app/api/admin/approve \
#        -H "X-Admin-Secret: <tu-secret>" \
#        -H "Content-Type: application/json" \
#        -d '{"username": "gunner", "plan": "admin"}'
#
# Requiere env var DANNA_ADMIN_SECRET configurada en Railway.
# Si falta el header o no coincide, devuelve 401.
# ????????????????????????????????????????????????????????????????????

class AdminApproveRequest(BaseModel):
    username: str
    plan: str = "trial"
    days: Optional[int] = None
    approved_by: str = "admin_endpoint"


class AdminApproveResponse(BaseModel):
    success: bool
    message: str
    username: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None


@app.post("/api/admin/approve", response_model=AdminApproveResponse)
def admin_approve(
    req: AdminApproveRequest,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    # 1. Validar secret
    expected_secret = os.environ.get("DANNA_ADMIN_SECRET", "")
    if not expected_secret:
        raise HTTPException(
            status_code=500,
            detail="DANNA_ADMIN_SECRET no configurado en el servidor"
        )
    if not x_admin_secret or x_admin_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Admin secret invalido o faltante")

    # 2. Validar plan
    valid_plans = list(PLANS.keys())
    if req.plan not in valid_plans:
        return AdminApproveResponse(
            success=False,
            message=f"Plan invalido. Validos: {valid_plans}"
        )

    # 3. Verificar que el usuario exista
    user = get_user_info(req.username)
    if not user:
        return AdminApproveResponse(
            success=False,
            message=f"Usuario '{req.username}' no existe. Registralo primero via /api/register"
        )

    # 4. Aprobar
    try:
        admin_approve_user(
            username=req.username,
            plan=req.plan,
            approved_by=req.approved_by,
            days=req.days,
        )
    except Exception as e:
        return AdminApproveResponse(
            success=False,
            message=f"Error al aprobar usuario: {str(e)}"
        )

    # 5. Confirmar
    updated = get_user_info(req.username)
    return AdminApproveResponse(
        success=True,
        message=f"Usuario '{req.username}' aprobado con plan '{req.plan}'",
        username=updated.get("username"),
        plan=updated.get("plan"),
        status=updated.get("status"),
    )

