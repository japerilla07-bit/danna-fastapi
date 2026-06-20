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
