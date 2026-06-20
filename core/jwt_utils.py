"""
JWT utilities for D.A.N.N.A.
=============================
Emite y valida JSON Web Tokens firmados con HS256.
Los tokens se guardan en cookies httpOnly (no accesibles desde JavaScript,
protección contra XSS).

Configuración via variables de entorno:
    DANNA_JWT_SECRET  — secreto para firmar (obligatorio en producción)
                         si no se define, se genera uno random al arrancar
                         (los tokens duran solo lo que dure el server)
    DANNA_JWT_TTL_DAYS — días de validez del token (default: 7)

El token contiene:
    sub:   username
    iat:   issued at (unix timestamp)
    exp:   expiration (unix timestamp)
"""

import os
import time
import secrets
import logging
from typing import Optional

from jose import jwt, JWTError, ExpiredSignatureError

log = logging.getLogger("jwt_utils")

# ── Config ────────────────────────────────────────────────────────
_SECRET_FROM_ENV = os.environ.get("DANNA_JWT_SECRET", "").strip()
if _SECRET_FROM_ENV:
    JWT_SECRET = _SECRET_FROM_ENV
    log.info("JWT_SECRET cargado desde environment")
else:
    JWT_SECRET = secrets.token_urlsafe(48)
    log.warning(
        "DANNA_JWT_SECRET no configurado — generando uno random. "
        "Los tokens existentes se invalidarán al reiniciar el server. "
        "Configura DANNA_JWT_SECRET en producción."
    )

JWT_ALGORITHM = "HS256"
JWT_TTL_DAYS = int(os.environ.get("DANNA_JWT_TTL_DAYS", "7"))
JWT_TTL_SECONDS = JWT_TTL_DAYS * 24 * 3600

# Nombre de la cookie
COOKIE_NAME = "danna_session"


# ── Emisión ───────────────────────────────────────────────────────
def create_token(username: str, extra_claims: Optional[dict] = None) -> str:
    """
    Crea un JWT firmado para el usuario dado.

    Args:
        username: identificador del usuario (irá en claim `sub`)
        extra_claims: claims adicionales opcionales (plan, etc.)

    Returns:
        Token JWT como string.
    """
    now = int(time.time())
    payload = {
        "sub": str(username).strip().lower(),
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    if extra_claims:
        # Los reservados (sub, iat, exp) no se sobreescriben
        for k, v in extra_claims.items():
            if k not in ("sub", "iat", "exp"):
                payload[k] = v
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ── Validación ────────────────────────────────────────────────────
def decode_token(token: str) -> Optional[dict]:
    """
    Valida y decodifica un JWT.

    Returns:
        dict con el payload si es válido, None si está expirado o inválido.
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except ExpiredSignatureError:
        log.info("Token expirado")
        return None
    except JWTError as e:
        log.info(f"Token inválido: {e}")
        return None
    except Exception as e:
        log.warning(f"Error decodificando token: {e}")
        return None


def get_username_from_token(token: str) -> Optional[str]:
    """Atajo: extrae el username del token, o None si inválido."""
    payload = decode_token(token)
    if payload is None:
        return None
    return payload.get("sub")
